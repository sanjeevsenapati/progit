package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

type mockToolboxResolver struct{}

func (m *mockToolboxResolver) LookupHost(ctx context.Context, host string) ([]string, error) {
	if host == "example.com" {
		return []string{"93.184.216.34"}, nil
	}
	return nil, errors.New("not found")
}

func (m *mockToolboxResolver) LookupIPAddr(ctx context.Context, host string) ([]net.IPAddr, error) {
	if host == "example.com" {
		return []net.IPAddr{
			{IP: net.ParseIP("93.184.216.34")},
			{IP: net.ParseIP("2606:2800:220:1:248:1893:25c8:1946")},
		}, nil
	}
	return nil, errors.New("no such host")
}

func (m *mockToolboxResolver) LookupCNAME(ctx context.Context, host string) (string, error) {
	if host == "www.example.com" {
		return "example.com.", nil
	}
	return host + ".", nil
}

func (m *mockToolboxResolver) LookupMX(ctx context.Context, name string) ([]*net.MX, error) {
	if name == "example.com" {
		return []*net.MX{{Host: "mail.example.com.", Pref: 10}}, nil
	}
	return nil, errors.New("no mx")
}

func (m *mockToolboxResolver) LookupTXT(ctx context.Context, name string) ([]string, error) {
	if name == "example.com" {
		return []string{"v=spf1 -all"}, nil
	}
	return nil, nil
}

func (m *mockToolboxResolver) LookupNS(ctx context.Context, name string) ([]*net.NS, error) {
	if name == "example.com" {
		return []*net.NS{{Host: "a.iana-servers.net."}}, nil
	}
	return nil, nil
}

func (m *mockToolboxResolver) LookupAddr(ctx context.Context, addr string) ([]string, error) {
	if addr == "93.184.216.34" {
		return []string{"example.com."}, nil
	}
	return nil, errors.New("no ptr")
}

func toolboxDoJSON(t *testing.T, router *Router, method, target string, payload any, token string) *httptest.ResponseRecorder {
	t.Helper()
	var body *bytes.Reader
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("marshal payload: %v", err)
		}
		body = bytes.NewReader(b)
	} else {
		body = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, target, body)
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func registerAndLoginToolboxUser(t *testing.T, router *Router, username, email, password string) string {
	t.Helper()
	regRec := toolboxDoJSON(t, router, "POST", "/api/v1/auth/register", map[string]any{
		"username": username,
		"email":    email,
		"password": password,
	}, "")
	if regRec.Code != http.StatusCreated {
		t.Fatalf("register failed (%d): %s", regRec.Code, regRec.Body.String())
	}

	loginRec := toolboxDoJSON(t, router, "POST", "/api/v1/auth/login", map[string]any{
		"username": username,
		"password": password,
	}, "")
	if loginRec.Code != http.StatusOK {
		t.Fatalf("login failed (%d): %s", loginRec.Code, loginRec.Body.String())
	}
	var loginRes struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(loginRec.Body.Bytes(), &loginRes); err != nil || loginRes.Token == "" {
		t.Fatalf("decode login token failed: %v body=%s", err, loginRec.Body.String())
	}
	return loginRes.Token
}

func TestToolboxFeaturesAndDNS(t *testing.T) {
	router, cleanup := setupTestRouter(t)
	defer cleanup()

	router.dnsResolver = &mockToolboxResolver{}

	// 1. Register user (succeeds) and verify reserved username 'toolbox' is blocked
	token := registerAndLoginToolboxUser(t, router, "toolboxuser", "toolbox@example.com", "StrongPass123!")

	resReserved := toolboxDoJSON(t, router, "POST", "/api/v1/auth/register", map[string]any{
		"username": "toolbox",
		"email":    "reserved@example.com",
		"password": "StrongPass123!",
	}, "")
	if resReserved.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when registering reserved username 'toolbox', got %d: %s", resReserved.Code, resReserved.Body.String())
	}

	// 2. GET /api/v1/features exposes toolbox flags
	featRes := toolboxDoJSON(t, router, "GET", "/api/v1/features", nil, "")
	if featRes.Code != http.StatusOK {
		t.Fatalf("expected 200 on features endpoint, got %d", featRes.Code)
	}
	var feat map[string]any
	if err := json.Unmarshal(featRes.Body.Bytes(), &feat); err != nil {
		t.Fatalf("decode features: %v", err)
	}
	if feat["toolbox_enabled"] != true || feat["toolbox_dns_enabled"] != true {
		t.Fatalf("expected toolbox_enabled=true and toolbox_dns_enabled=true, got %+v", feat)
	}

	// 3. Unauthenticated DNS lookup is rejected
	unauthRes := toolboxDoJSON(t, router, "GET", "/api/v1/toolbox/dns?name=example.com&type=A", nil, "")
	if unauthRes.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for unauthenticated DNS lookup, got %d", unauthRes.Code)
	}

	// 4. Invalid hostname / record type rejected
	badHostRes := toolboxDoJSON(t, router, "GET", "/api/v1/toolbox/dns?name=https://example.com&type=A", nil, token)
	if badHostRes.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for URL scheme hostname, got %d", badHostRes.Code)
	}
	badTypeRes := toolboxDoJSON(t, router, "GET", "/api/v1/toolbox/dns?name=example.com&type=ANY_INVALID", nil, token)
	if badTypeRes.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid type, got %d", badTypeRes.Code)
	}

	// 5. Authenticated ALL lookup returns A, AAAA, MX, TXT, NS
	allRes := toolboxDoJSON(t, router, "GET", "/api/v1/toolbox/dns?name=example.com&type=ALL", nil, token)
	if allRes.Code != http.StatusOK {
		t.Fatalf("expected 200 on ALL DNS lookup, got %d: %s", allRes.Code, allRes.Body.String())
	}
	var dnsBody DNSLookupResponse
	if err := json.Unmarshal(allRes.Body.Bytes(), &dnsBody); err != nil {
		t.Fatalf("decode DNSLookupResponse: %v", err)
	}
	if len(dnsBody.Records) != 5 {
		t.Fatalf("expected 5 records across A/AAAA/MX/TXT/NS, got %d: %+v", len(dnsBody.Records), dnsBody.Records)
	}

	// 6. PTR lookup on IP works
	ptrRes := toolboxDoJSON(t, router, "GET", "/api/v1/toolbox/dns?name=93.184.216.34&type=PTR", nil, token)
	if ptrRes.Code != http.StatusOK {
		t.Fatalf("expected 200 on PTR lookup, got %d: %s", ptrRes.Code, ptrRes.Body.String())
	}

	// 7. Rate limit enforces 429 when exhausted
	router.dnsLimiter = newIPRateLimiter(2, 1*time.Minute)
	for i := 0; i < 2; i++ {
		okRes := toolboxDoJSON(t, router, "GET", "/api/v1/toolbox/dns?name=example.com&type=A", nil, token)
		if okRes.Code != http.StatusOK {
			t.Fatalf("expected 200 before rate limit (%d), got %d", i, okRes.Code)
		}
	}
	rlRes := toolboxDoJSON(t, router, "GET", "/api/v1/toolbox/dns?name=example.com&type=A", nil, token)
	if rlRes.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 after exhausting dnsLimiter, got %d", rlRes.Code)
	}

	// 8. Feature toggle disables DNS lookup cleanly
	router.cfg.Features.EnableToolboxDNS = false
	req := httptest.NewRequest("GET", "/api/v1/toolbox/dns?name=example.com&type=A", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 when EnableToolboxDNS=false, got %d", rec.Code)
	}
}
