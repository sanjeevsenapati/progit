package database

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// AllowPrivateWebhookHosts controls whether DeliverWebhook and webhook creation allow loopback/private IP targets.
// By default false in production for SSRF mitigation; can be enabled in test suites or via config.
var AllowPrivateWebhookHosts = false

func isPrivateWebhookIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	if ip4 := ip.To4(); ip4 != nil {
		return ip4.IsLoopback() ||
			ip4.IsLinkLocalUnicast() ||
			ip4.IsLinkLocalMulticast() ||
			ip4.IsPrivate() ||
			ip4.IsMulticast() ||
			ip4.IsUnspecified() ||
			ip4.Equal(net.IPv4bcast)
	}
	return ip.IsLoopback() ||
		ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() ||
		ip.IsPrivate() ||
		ip.IsMulticast() ||
		ip.IsUnspecified()
}

func isBlockedWebhookHost(host string) bool {
	h := strings.ToLower(strings.TrimSpace(host))
	if h == "" || h == "localhost" || strings.HasSuffix(h, ".localhost") || strings.HasSuffix(h, ".local") {
		return true
	}
	if ip := net.ParseIP(h); ip != nil {
		return isPrivateWebhookIP(ip)
	}
	return false
}

// ValidateWebhookURL ensures a webhook URL uses http/https and does not target private/reserved networks.
func ValidateWebhookURL(hookURL string) error {
	hookURL = strings.TrimSpace(hookURL)
	if hookURL == "" {
		return fmt.Errorf("webhook payload URL cannot be empty")
	}
	parsedURL, err := url.ParseRequestURI(hookURL)
	if err != nil || (parsedURL.Scheme != "http" && parsedURL.Scheme != "https") {
		return fmt.Errorf("invalid webhook URL; must start with http:// or https://")
	}
	if !AllowPrivateWebhookHosts && isBlockedWebhookHost(parsedURL.Hostname()) {
		return fmt.Errorf("webhook payload URL cannot target localhost or private network addresses")
	}
	return nil
}

// CreateWebhook registers a new webhook for a repository.
func CreateWebhook(repoID int64, hookURL, secret, contentType, events string, isActive bool) (*Webhook, error) {
	if err := ValidateWebhookURL(hookURL); err != nil {
		return nil, err
	}

	contentType = strings.ToLower(strings.TrimSpace(contentType))
	if contentType != "json" && contentType != "form" {
		contentType = "json"
	}

	events = strings.TrimSpace(events)
	if events == "" {
		events = "push,issue,pull_request"
	}

	res, err := DB.Exec(`
		INSERT INTO webhooks (repo_id, url, secret, content_type, events, is_active, created_at)
		VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
	`, repoID, hookURL, strings.TrimSpace(secret), contentType, events, isActive)
	if err != nil {
		return nil, err
	}

	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}

	return GetWebhookByID(id)
}

// GetWebhookByID retrieves a webhook by primary key.
func GetWebhookByID(id int64) (*Webhook, error) {
	w := &Webhook{}
	err := DB.QueryRow(`
		SELECT id, repo_id, url, secret, content_type, events, is_active, created_at
		FROM webhooks
		WHERE id = ?
	`, id).Scan(&w.ID, &w.RepoID, &w.URL, &w.Secret, &w.ContentType, &w.Events, &w.IsActive, &w.CreatedAt)
	if err != nil {
		return nil, err
	}
	w.HasSecret = strings.TrimSpace(w.Secret) != ""
	return w, nil
}

// ListRepoWebhooks returns all webhooks registered for a repository.
func ListRepoWebhooks(repoID int64) ([]*Webhook, error) {
	rows, err := DB.Query(`
		SELECT id, repo_id, url, secret, content_type, events, is_active, created_at
		FROM webhooks
		WHERE repo_id = ?
		ORDER BY id DESC
	`, repoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []*Webhook
	for rows.Next() {
		w := &Webhook{}
		if err := rows.Scan(&w.ID, &w.RepoID, &w.URL, &w.Secret, &w.ContentType, &w.Events, &w.IsActive, &w.CreatedAt); err != nil {
			return nil, err
		}
		w.HasSecret = strings.TrimSpace(w.Secret) != ""
		list = append(list, w)
	}
	if list == nil {
		list = []*Webhook{}
	}
	return list, rows.Err()
}

// UpdateWebhook updates an existing webhook's parameters.
func UpdateWebhook(id int64, hookURL, secret, contentType, events string, isActive bool) error {
	if err := ValidateWebhookURL(hookURL); err != nil {
		return err
	}

	contentType = strings.ToLower(strings.TrimSpace(contentType))
	if contentType != "json" && contentType != "form" {
		contentType = "json"
	}

	events = strings.TrimSpace(events)
	if events == "" {
		events = "push,issue,pull_request"
	}

	var err error

	// If secret is non-empty, update it; otherwise preserve current secret
	if strings.TrimSpace(secret) != "" {
		_, err = DB.Exec(`
			UPDATE webhooks
			SET url = ?, secret = ?, content_type = ?, events = ?, is_active = ?
			WHERE id = ?
		`, hookURL, strings.TrimSpace(secret), contentType, events, isActive, id)
	} else {
		_, err = DB.Exec(`
			UPDATE webhooks
			SET url = ?, content_type = ?, events = ?, is_active = ?
			WHERE id = ?
		`, hookURL, contentType, events, isActive, id)
	}
	return err
}

// DeleteWebhook removes a webhook and cascading delivery logs.
func DeleteWebhook(id int64) error {
	_, err := DB.Exec(`DELETE FROM webhooks WHERE id = ?`, id)
	return err
}

// CreateWebhookDelivery persists a webhook execution attempt and its response.
func CreateWebhookDelivery(webhookID int64, event, payload string, statusCode int, respBody string, durationMs int) (*WebhookDelivery, error) {
	// Truncate response body if larger than 4KB to save SQLite memory/space
	if len(respBody) > 4096 {
		respBody = respBody[:4096] + "... [truncated]"
	}

	res, err := DB.Exec(`
		INSERT INTO webhook_deliveries (webhook_id, event, payload, status_code, response_body, duration_ms, delivered_at)
		VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
	`, webhookID, event, payload, statusCode, respBody, durationMs)
	if err != nil {
		return nil, err
	}

	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}

	return GetWebhookDeliveryByID(id)
}

// GetWebhookDeliveryByID loads a delivery log by ID.
func GetWebhookDeliveryByID(deliveryID int64) (*WebhookDelivery, error) {
	d := &WebhookDelivery{}
	err := DB.QueryRow(`
		SELECT id, webhook_id, event, payload, status_code, response_body, duration_ms, delivered_at
		FROM webhook_deliveries
		WHERE id = ?
	`, deliveryID).Scan(&d.ID, &d.WebhookID, &d.Event, &d.Payload, &d.StatusCode, &d.ResponseBody, &d.DurationMs, &d.DeliveredAt)
	if err != nil {
		return nil, err
	}
	return d, nil
}

// ListWebhookDeliveries returns the recent deliveries for a webhook.
func ListWebhookDeliveries(webhookID int64, limit int) ([]*WebhookDelivery, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}

	rows, err := DB.Query(`
		SELECT id, webhook_id, event, payload, status_code, response_body, duration_ms, delivered_at
		FROM webhook_deliveries
		WHERE webhook_id = ?
		ORDER BY id DESC
		LIMIT ?
	`, webhookID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []*WebhookDelivery
	for rows.Next() {
		d := &WebhookDelivery{}
		if err := rows.Scan(&d.ID, &d.WebhookID, &d.Event, &d.Payload, &d.StatusCode, &d.ResponseBody, &d.DurationMs, &d.DeliveredAt); err != nil {
			return nil, err
		}
		list = append(list, d)
	}
	if list == nil {
		list = []*WebhookDelivery{}
	}
	return list, rows.Err()
}

// DeliverWebhook dispatches an HTTP POST event to a single webhook, recording the delivery log.
func DeliverWebhook(hook *Webhook, event string, payload any) (*WebhookDelivery, error) {
	if hook == nil || hook.URL == "" {
		return nil, fmt.Errorf("invalid webhook target")
	}

	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal payload failed: %w", err)
	}

	var reqBody io.Reader
	contentTypeHeader := "application/json"

	if hook.ContentType == "form" {
		contentTypeHeader = "application/x-www-form-urlencoded"
		formData := url.Values{}
		formData.Set("payload", string(jsonBytes))
		reqBody = strings.NewReader(formData.Encode())
	} else {
		reqBody = bytes.NewReader(jsonBytes)
	}

	req, err := http.NewRequest("POST", hook.URL, reqBody)
	if err != nil {
		d, _ := CreateWebhookDelivery(hook.ID, event, string(jsonBytes), 0, fmt.Sprintf("Request build error: %v", err), 0)
		return d, err
	}

	// Generate delivery UUID
	uuidBytes := make([]byte, 16)
	_, _ = rand.Read(uuidBytes)
	deliveryUUID := fmt.Sprintf("%x-%x-%x-%x-%x", uuidBytes[0:4], uuidBytes[4:6], uuidBytes[6:8], uuidBytes[8:10], uuidBytes[10:16])

	req.Header.Set("Content-Type", contentTypeHeader)
	req.Header.Set("User-Agent", "ProGit-Hookshot/1.0")
	req.Header.Set("X-ProGit-Event", event)
	req.Header.Set("X-GitHub-Event", event)
	req.Header.Set("X-ProGit-Delivery", deliveryUUID)
	req.Header.Set("X-GitHub-Delivery", deliveryUUID)

	if hook.Secret != "" {
		mac := hmac.New(sha256.New, []byte(hook.Secret))
		mac.Write(jsonBytes)
		sigHex := hex.EncodeToString(mac.Sum(nil))
		req.Header.Set("X-Hub-Signature-256", "sha256="+sigHex)
		req.Header.Set("X-ProGit-Signature", "sha256="+sigHex)
	}

	dialer := &net.Dialer{
		Timeout:   5 * time.Second,
		KeepAlive: 30 * time.Second,
	}

	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}

			if !AllowPrivateWebhookHosts {
				if isBlockedWebhookHost(host) {
					return nil, fmt.Errorf("webhook delivery to blocked host '%s' is prohibited", host)
				}

				ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
				if err != nil {
					return nil, err
				}
				if len(ips) == 0 {
					return nil, fmt.Errorf("no IP address found for %s", host)
				}

				var safeIP net.IP
				for _, ipAddr := range ips {
					if isPrivateWebhookIP(ipAddr.IP) {
						return nil, fmt.Errorf("webhook destination resolves to private/reserved IP: %s", ipAddr.IP)
					}
					if safeIP == nil {
						safeIP = ipAddr.IP
					}
				}
				// Connect directly to the validated safe IP to prevent DNS rebinding attacks
				return dialer.DialContext(ctx, network, net.JoinHostPort(safeIP.String(), port))
			}

			return dialer.DialContext(ctx, network, addr)
		},
		ResponseHeaderTimeout: 5 * time.Second,
	}

	client := &http.Client{
		Transport: transport,
		Timeout:   6 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return fmt.Errorf("stopped after 3 redirects")
			}
			if !AllowPrivateWebhookHosts {
				if err := ValidateWebhookURL(req.URL.String()); err != nil {
					return fmt.Errorf("redirect blocked: %w", err)
				}
			}
			return nil
		},
	}

	start := time.Now()
	resp, reqErr := client.Do(req)
	durationMs := int(time.Since(start).Milliseconds())

	statusCode := 0
	respBody := ""

	if reqErr != nil {
		respBody = fmt.Sprintf("HTTP request error: %v", reqErr)
	} else {
		defer resp.Body.Close()
		statusCode = resp.StatusCode
		bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		respBody = string(bodyBytes)
	}

	delivery, logErr := CreateWebhookDelivery(hook.ID, event, string(jsonBytes), statusCode, respBody, durationMs)
	if logErr != nil {
		return nil, logErr
	}

	if reqErr != nil {
		return delivery, reqErr
	}
	return delivery, nil
}

// DispatchRepoWebhooks asynchronously delivers repository events to all active matching webhooks.
func DispatchRepoWebhooks(repoID int64, event string, payload any) {
	hooks, err := ListRepoWebhooks(repoID)
	if err != nil || len(hooks) == 0 {
		return
	}

	for _, hook := range hooks {
		if !hook.IsActive {
			continue
		}

		// Check if webhook is subscribed to event
		subscribed := false
		if hook.Events == "*" || strings.Contains(hook.Events, "*") {
			subscribed = true
		} else {
			parts := strings.Split(hook.Events, ",")
			for _, p := range parts {
				p = strings.TrimSpace(p)
				if strings.EqualFold(p, event) {
					subscribed = true
					break
				}
				// Also handle plural/singular compatibility: "issues" matches "issue", "pull_requests" matches "pull_request"
				if (p == "issue" || p == "issues") && (event == "issue" || event == "issues") {
					subscribed = true
					break
				}
				if (p == "pull_request" || p == "pull_requests") && (event == "pull_request" || event == "pull_requests") {
					subscribed = true
					break
				}
			}
		}

		if subscribed {
			h := hook
			go func() {
				_, _ = DeliverWebhook(h, event, payload)
			}()
		}
	}
}
