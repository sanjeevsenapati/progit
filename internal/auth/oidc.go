package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"progit.io/progit/internal/config"
)

// OIDCUserInfo represents normalized user claims returned by the OIDC identity provider.
type OIDCUserInfo struct {
	Sub               string `json:"sub"`
	Email             string `json:"email"`
	EmailVerified     bool   `json:"email_verified"`
	Name              string `json:"name"`
	PreferredUsername string `json:"preferred_username"`
	Picture           string `json:"picture"`
	HostedDomain      string `json:"hd,omitempty"` // Google Workspace hosted domain
}

type oidcEngine struct {
	mu             sync.RWMutex
	cfg            config.OIDCConfig
	discovered     bool
	authURL        string
	tokenURL       string
	userInfoURL    string
	allowedDomains []string
}

var globalOIDC = &oidcEngine{}

// InitOIDC initializes and configures the OpenID Connect SSO provider.
func InitOIDC(cfg config.OIDCConfig) error {
	globalOIDC.mu.Lock()
	defer globalOIDC.mu.Unlock()

	globalOIDC.cfg = cfg
	globalOIDC.discovered = false

	if !cfg.Enabled || cfg.ClientID == "" {
		return nil
	}

	// Parse allowed domains
	var domains []string
	if cfg.AllowedDomains != "" {
		for _, d := range strings.Split(cfg.AllowedDomains, ",") {
			if trimmed := strings.TrimSpace(d); trimmed != "" {
				domains = append(domains, strings.ToLower(trimmed))
			}
		}
	}
	globalOIDC.allowedDomains = domains

	// Default Provider Template URLs
	switch strings.ToLower(cfg.Provider) {
	case "google":
		globalOIDC.authURL = "https://accounts.google.com/o/oauth2/v2/auth"
		globalOIDC.tokenURL = "https://oauth2.googleapis.com/token"
		globalOIDC.userInfoURL = "https://www.googleapis.com/oauth2/v3/userinfo"
		if globalOIDC.cfg.DisplayName == "" {
			globalOIDC.cfg.DisplayName = "Google Workspace"
		}
		if globalOIDC.cfg.Scopes == "" {
			globalOIDC.cfg.Scopes = "openid email profile"
		}

	case "github":
		globalOIDC.authURL = "https://github.com/login/oauth/authorize"
		globalOIDC.tokenURL = "https://github.com/login/oauth/access_token"
		globalOIDC.userInfoURL = "https://api.github.com/user"
		if globalOIDC.cfg.DisplayName == "" {
			globalOIDC.cfg.DisplayName = "GitHub"
		}
		if globalOIDC.cfg.Scopes == "" {
			globalOIDC.cfg.Scopes = "read:user user:email"
		}

	case "microsoft":
		globalOIDC.authURL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
		globalOIDC.tokenURL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
		globalOIDC.userInfoURL = "https://graph.microsoft.com/oidc/userinfo"
		if globalOIDC.cfg.DisplayName == "" {
			globalOIDC.cfg.DisplayName = "Microsoft 365"
		}
		if globalOIDC.cfg.Scopes == "" {
			globalOIDC.cfg.Scopes = "openid email profile"
		}

	case "keycloak":
		if globalOIDC.cfg.DisplayName == "" {
			globalOIDC.cfg.DisplayName = "Keycloak SSO"
		}
		if globalOIDC.cfg.Scopes == "" {
			globalOIDC.cfg.Scopes = "openid email profile"
		}
		globalOIDC.authURL = cfg.AuthURL
		globalOIDC.tokenURL = cfg.TokenURL
		globalOIDC.userInfoURL = cfg.UserInfoURL

	case "ztrust":
		if globalOIDC.cfg.DisplayName == "" {
			globalOIDC.cfg.DisplayName = "ZTrust SSO"
		}
		if globalOIDC.cfg.Scopes == "" {
			globalOIDC.cfg.Scopes = "openid email profile"
		}
		globalOIDC.authURL = cfg.AuthURL
		globalOIDC.tokenURL = cfg.TokenURL
		globalOIDC.userInfoURL = cfg.UserInfoURL

	default:
		// Generic OIDC / Okta / Authentik
		if globalOIDC.cfg.DisplayName == "" {
			globalOIDC.cfg.DisplayName = "Corporate SSO (OIDC)"
		}
		if globalOIDC.cfg.Scopes == "" {
			globalOIDC.cfg.Scopes = "openid email profile"
		}
		globalOIDC.authURL = cfg.AuthURL
		globalOIDC.tokenURL = cfg.TokenURL
		globalOIDC.userInfoURL = cfg.UserInfoURL
	}

	// Dynamic Discovery via /.well-known/openid-configuration if IssuerURL is supplied
	if cfg.IssuerURL != "" && (globalOIDC.authURL == "" || globalOIDC.tokenURL == "" || globalOIDC.userInfoURL == "") {
		_ = discoverEndpoints(cfg.IssuerURL)
	}

	return nil
}

// OIDCDiscoveryResult represents endpoints parsed from /.well-known/openid-configuration.
type OIDCDiscoveryResult struct {
	Issuer                string   `json:"issuer"`
	AuthorizationEndpoint string   `json:"authorization_endpoint"`
	TokenEndpoint         string   `json:"token_endpoint"`
	UserinfoEndpoint      string   `json:"userinfo_endpoint"`
	JwksURI               string   `json:"jwks_uri,omitempty"`
	ScopesSupported       []string `json:"scopes_supported,omitempty"`
}

// DiscoverOIDC fetches and parses the OIDC well-known discovery document for a given Issuer URL.
func DiscoverOIDC(issuerURL string) (*OIDCDiscoveryResult, error) {
	trimmed := strings.TrimSpace(issuerURL)
	if trimmed == "" {
		return nil, errors.New("issuer URL is required")
	}
	parsed, err := url.Parse(trimmed)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return nil, errors.New("issuer URL must be a valid http:// or https:// URL")
	}

	if err := isProhibitedSSRFAddress(parsed.Host); err != nil {
		return nil, fmt.Errorf("OIDC discovery blocked by security policy: %w", err)
	}

	wellKnownURL := strings.TrimRight(trimmed, "/")
	if !strings.HasSuffix(wellKnownURL, "/.well-known/openid-configuration") {
		wellKnownURL += "/.well-known/openid-configuration"
	}

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Get(wellKnownURL)
	if err != nil {
		return nil, fmt.Errorf("failed to reach discovery URL (%s): %w", wellKnownURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("discovery endpoint returned HTTP %d", resp.StatusCode)
	}

	var doc OIDCDiscoveryResult
	if err := json.NewDecoder(resp.Body).Decode(&doc); err != nil {
		return nil, fmt.Errorf("invalid OIDC discovery JSON: %w", err)
	}

	if doc.AuthorizationEndpoint == "" || doc.TokenEndpoint == "" {
		return nil, errors.New("discovery document missing required authorization_endpoint or token_endpoint")
	}

	return &doc, nil
}

func isProhibitedSSRFAddress(rawHost string) error {
	host := rawHost
	if h, _, err := net.SplitHostPort(rawHost); err == nil {
		host = h
	}
	host = strings.Trim(host, "[]")

	lower := strings.ToLower(host)
	if lower == "metadata.google.internal" || lower == "instance-data" || strings.HasSuffix(lower, ".internal.cloudapp.net") {
		return errors.New("access to cloud instance metadata service is prohibited")
	}

	// Check if host is direct IP literal
	if ip := net.ParseIP(host); ip != nil {
		if err := checkIPProhibited(ip); err != nil {
			return err
		}
		return nil
	}

	// Resolve hostname to check for metadata redirection (DNS rebinding / alias)
	ips, err := net.LookupIP(host)
	if err == nil {
		for _, ip := range ips {
			if err := checkIPProhibited(ip); err != nil {
				return err
			}
		}
	}

	return nil
}

func checkIPProhibited(ip net.IP) error {
	if ip == nil {
		return nil
	}
	// Check IPv4 link-local (169.254.0.0/16, including 169.254.169.254 IMDS)
	if ip4 := ip.To4(); ip4 != nil {
		if ip4[0] == 169 && ip4[1] == 254 {
			return errors.New("access to cloud metadata or link-local address (169.254.x.x) is prohibited")
		}
		if ip4.IsMulticast() || ip4.IsUnspecified() {
			return errors.New("access to multicast or unspecified address is prohibited")
		}
		return nil
	}
	// IPv6 link-local, AWS IMDSv6, multicast, unspecified
	if ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() || ip.String() == "fd00:ec2::254" {
		return errors.New("access to cloud metadata, link-local, or multicast IPv6 address is prohibited")
	}
	return nil
}

// discoverEndpoints queries the provider's discovery endpoint and populates globalOIDC.
func discoverEndpoints(issuerURL string) error {
	doc, err := DiscoverOIDC(issuerURL)
	if err != nil {
		return err
	}

	if globalOIDC.authURL == "" && doc.AuthorizationEndpoint != "" {
		globalOIDC.authURL = doc.AuthorizationEndpoint
	}
	if globalOIDC.tokenURL == "" && doc.TokenEndpoint != "" {
		globalOIDC.tokenURL = doc.TokenEndpoint
	}
	if globalOIDC.userInfoURL == "" && doc.UserinfoEndpoint != "" {
		globalOIDC.userInfoURL = doc.UserinfoEndpoint
	}
	globalOIDC.discovered = true
	return nil
}

// GetOIDCEndpoints returns the resolved authorization, token, and userinfo URLs currently active.
func GetOIDCEndpoints() (discovered bool, authURL, tokenURL, userInfoURL string) {
	globalOIDC.mu.RLock()
	defer globalOIDC.mu.RUnlock()
	return globalOIDC.discovered, globalOIDC.authURL, globalOIDC.tokenURL, globalOIDC.userInfoURL
}

// IsOIDCEnabled returns true if an OIDC provider is configured and ready.
func IsOIDCEnabled() bool {
	globalOIDC.mu.RLock()
	defer globalOIDC.mu.RUnlock()
	return globalOIDC.cfg.Enabled && globalOIDC.cfg.ClientID != ""
}

// GetOIDCInfo returns public provider metadata for UI display.
func GetOIDCInfo() (enabled bool, provider, displayName string) {
	globalOIDC.mu.RLock()
	defer globalOIDC.mu.RUnlock()
	return globalOIDC.cfg.Enabled && globalOIDC.cfg.ClientID != "", globalOIDC.cfg.Provider, globalOIDC.cfg.DisplayName
}

// GenerateState creates a cryptographically secure random state parameter to prevent CSRF attacks.
func GenerateState() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// BuildAuthURL constructs the authorization redirect URL with client parameters.
func BuildAuthURL(redirectURI, state string) (string, error) {
	globalOIDC.mu.RLock()
	defer globalOIDC.mu.RUnlock()

	if !globalOIDC.cfg.Enabled || globalOIDC.authURL == "" {
		return "", errors.New("OIDC authorization endpoint is not configured")
	}

	q := url.Values{}
	q.Set("client_id", globalOIDC.cfg.ClientID)
	q.Set("redirect_uri", redirectURI)
	q.Set("response_type", "code")
	q.Set("scope", globalOIDC.cfg.Scopes)
	q.Set("state", state)
	q.Set("prompt", "select_account")

	separator := "?"
	if strings.Contains(globalOIDC.authURL, "?") {
		separator = "&"
	}

	return fmt.Sprintf("%s%s%s", globalOIDC.authURL, separator, q.Encode()), nil
}

// ExchangeCode exchanges an authorization code for user info from the identity provider.
func ExchangeCode(ctx context.Context, code, redirectURI string) (*OIDCUserInfo, error) {
	globalOIDC.mu.RLock()
	tokenURL := globalOIDC.tokenURL
	userInfoURL := globalOIDC.userInfoURL
	clientID := globalOIDC.cfg.ClientID
	clientSecret := globalOIDC.cfg.ClientSecret
	provider := globalOIDC.cfg.Provider
	allowedDomains := globalOIDC.allowedDomains
	globalOIDC.mu.RUnlock()

	if tokenURL == "" {
		return nil, errors.New("OIDC token endpoint not configured")
	}

	// 1. Post Authorization Code to Token Endpoint
	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("code", code)
	form.Set("redirect_uri", redirectURI)
	form.Set("client_id", clientID)
	form.Set("client_secret", clientSecret)

	req, err := http.NewRequestWithContext(ctx, "POST", tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, fmt.Errorf("create token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("execute token request: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read token response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("token exchange failed (%d): %s", resp.StatusCode, string(bodyBytes))
	}

	var tokenData struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
		IDToken     string `json:"id_token"`
	}
	if err := json.Unmarshal(bodyBytes, &tokenData); err != nil {
		return nil, fmt.Errorf("parse token response: %w", err)
	}

	if tokenData.AccessToken == "" {
		return nil, errors.New("empty access token received from provider")
	}

	// 2. Fetch User Profile
	var userInfo OIDCUserInfo

	if userInfoURL != "" {
		userReq, err := http.NewRequestWithContext(ctx, "GET", userInfoURL, nil)
		if err != nil {
			return nil, fmt.Errorf("create userinfo request: %w", err)
		}
		userReq.Header.Set("Authorization", fmt.Sprintf("Bearer %s", tokenData.AccessToken))
		userReq.Header.Set("Accept", "application/json")

		userResp, err := client.Do(userReq)
		if err != nil {
			return nil, fmt.Errorf("execute userinfo request: %w", err)
		}
		defer userResp.Body.Close()

		userBody, err := io.ReadAll(userResp.Body)
		if err != nil {
			return nil, fmt.Errorf("read userinfo response: %w", err)
		}

		if userResp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("userinfo request failed (%d): %s", userResp.StatusCode, string(userBody))
		}

		if err := json.Unmarshal(userBody, &userInfo); err != nil {
			return nil, fmt.Errorf("parse userinfo response: %w", err)
		}

		// GitHub special case: map login -> PreferredUsername and fetch private primary email if needed
		if strings.ToLower(provider) == "github" {
			var ghUser struct {
				Login string `json:"login"`
				Name  string `json:"name"`
				Email string `json:"email"`
				ID    int64  `json:"id"`
			}
			if err := json.Unmarshal(userBody, &ghUser); err == nil {
				if ghUser.Login != "" {
					userInfo.PreferredUsername = ghUser.Login
				}
				if ghUser.Name != "" && userInfo.Name == "" {
					userInfo.Name = ghUser.Name
				}
				if ghUser.Email != "" && userInfo.Email == "" {
					userInfo.Email = ghUser.Email
				}
				if ghUser.ID != 0 && userInfo.Sub == "" {
					userInfo.Sub = fmt.Sprintf("github_%d", ghUser.ID)
				}
			}
			if userInfo.Email == "" {
				userInfo.Email = fetchGitHubPrimaryEmail(ctx, tokenData.AccessToken)
			}
		}
	}

	// Fallback: parse claims from OIDC ID Token JWT payload if email or name is still missing
	if userInfo.Email == "" && tokenData.IDToken != "" {
		if claims := parseJWTClaims(tokenData.IDToken); claims != nil {
			if userInfo.Email == "" {
				userInfo.Email = claims.Email
			}
			if userInfo.Name == "" {
				userInfo.Name = claims.Name
			}
			if userInfo.PreferredUsername == "" {
				userInfo.PreferredUsername = claims.PreferredUsername
			}
			if userInfo.Sub == "" {
				userInfo.Sub = claims.Sub
			}
		}
	}

	if userInfo.Email == "" {
		return nil, errors.New("no email address provided by OIDC identity provider")
	}

	// 3. Verify Allowed Domains
	if !IsDomainAllowed(userInfo.Email, allowedDomains) {
		return nil, fmt.Errorf("email domain %s is not authorized", userInfo.Email)
	}

	return &userInfo, nil
}

// parseJWTClaims extracts the JSON payload from a JWT id_token received directly over HTTPS from the token endpoint.
func parseJWTClaims(idToken string) *OIDCUserInfo {
	parts := strings.Split(idToken, ".")
	if len(parts) < 2 {
		return nil
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil
	}
	var claims OIDCUserInfo
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil
	}
	return &claims
}

// fetchGitHubPrimaryEmail fetches user emails from GitHub API when primary email is hidden.
func fetchGitHubPrimaryEmail(ctx context.Context, token string) string {
	req, err := http.NewRequestWithContext(ctx, "GET", "https://api.github.com/user/emails", nil)
	if err != nil {
		return ""
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		return ""
	}
	defer resp.Body.Close()

	var emails []struct {
		Email    string `json:"email"`
		Primary  bool   `json:"primary"`
		Verified bool   `json:"verified"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&emails); err == nil {
		for _, e := range emails {
			if e.Primary && e.Verified {
				return e.Email
			}
		}
		if len(emails) > 0 {
			return emails[0].Email
		}
	}
	return ""
}

// IsDomainAllowed checks if an email matches the allowed domains whitelist.
func IsDomainAllowed(email string, allowedDomains []string) bool {
	if len(allowedDomains) == 0 {
		return true // Allow all if whitelist is empty
	}

	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return false
	}
	domain := strings.ToLower(parts[1])

	for _, d := range allowedDomains {
		clean := strings.ToLower(strings.TrimSpace(d))
		if clean != "" && (domain == clean || strings.HasSuffix(domain, "."+clean)) {
			return true
		}
	}
	return false
}
