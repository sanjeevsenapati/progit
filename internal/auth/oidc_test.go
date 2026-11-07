package auth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"progit.io/progit/internal/config"
)

func TestOIDCDomainAllowed(t *testing.T) {
	domains := []string{"company.com", "omc.co.in"}

	if !IsDomainAllowed("sanjeev@company.com", domains) {
		t.Errorf("Expected sanjeev@company.com to be allowed")
	}
	if !IsDomainAllowed("engineer@omc.co.in", domains) {
		t.Errorf("Expected engineer@omc.co.in to be allowed")
	}
	if IsDomainAllowed("attacker@other.com", domains) {
		t.Errorf("Expected attacker@other.com to be rejected")
	}

	// Empty whitelist allows anyone
	if !IsDomainAllowed("anyone@gmail.com", []string{}) {
		t.Errorf("Expected anyone@gmail.com to be allowed when whitelist is empty")
	}
}

func TestOIDCInitAndBuildAuthURL(t *testing.T) {
	cfg := config.OIDCConfig{
		Enabled:        true,
		Provider:       "google",
		DisplayName:    "Google Workspace",
		ClientID:       "google-client-id-123",
		ClientSecret:   "google-client-secret-xyz",
		AllowedDomains: "corp.local",
	}

	if err := InitOIDC(cfg); err != nil {
		t.Fatalf("InitOIDC failed: %v", err)
	}

	if !IsOIDCEnabled() {
		t.Fatalf("Expected OIDC to be enabled")
	}

	enabled, prov, display := GetOIDCInfo()
	if !enabled || prov != "google" || display != "Google Workspace" {
		t.Errorf("Unexpected OIDC info: enabled=%v prov=%s display=%s", enabled, prov, display)
	}

	state := GenerateState()
	if len(state) != 32 {
		t.Errorf("Expected 32-char hex state, got %s", state)
	}

	authURL, err := BuildAuthURL("https://git.local/callback", state)
	if err != nil {
		t.Fatalf("BuildAuthURL failed: %v", err)
	}

	if !strings.Contains(authURL, "client_id=google-client-id-123") {
		t.Errorf("AuthURL missing client_id: %s", authURL)
	}
	if !strings.Contains(authURL, "state="+state) {
		t.Errorf("AuthURL missing state: %s", authURL)
	}
	if !strings.Contains(authURL, "accounts.google.com") {
		t.Errorf("AuthURL missing Google host: %s", authURL)
	}
}

func TestOIDCDiscovery(t *testing.T) {
	// Mock discovery server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/.well-known/openid-configuration" {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]string{
				"authorization_endpoint": "https://auth.mock.local/oauth/authorize",
				"token_endpoint":         "https://auth.mock.local/oauth/token",
				"userinfo_endpoint":      "https://auth.mock.local/oauth/userinfo",
			})
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()

	cfg := config.OIDCConfig{
		Enabled:      true,
		Provider:     "generic",
		ClientID:     "mock-client-id",
		ClientSecret: "mock-secret",
		IssuerURL:    server.URL,
	}

	if err := InitOIDC(cfg); err != nil {
		t.Fatalf("InitOIDC with discovery failed: %v", err)
	}

	authURL, err := BuildAuthURL("https://git.local/callback", "state123")
	if err != nil {
		t.Fatalf("BuildAuthURL failed: %v", err)
	}

	if !strings.HasPrefix(authURL, "https://auth.mock.local/oauth/authorize") {
		t.Errorf("Expected discovered auth URL, got %s", authURL)
	}
}
