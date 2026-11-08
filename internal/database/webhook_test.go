package database

import (
	"testing"
)

func TestWebhookSSRFProtection(t *testing.T) {
	AllowPrivateWebhookHosts = false

	blockedURLs := []string{
		"http://127.0.0.1/webhook",
		"http://127.0.0.1:8080/admin",
		"http://localhost/webhook",
		"http://localhost:3000/api",
		"http://service.localhost/hook",
		"http://printer.local/hook",
		"http://169.254.169.254/latest/meta-data",
		"http://10.0.0.1/internal",
		"http://10.255.255.254/hook",
		"http://172.16.0.1/hook",
		"http://172.31.255.255/hook",
		"http://192.168.0.1/hook",
		"http://192.168.1.1/hook",
		"ftp://example.com/hook",
		"file:///etc/passwd",
		"gopher://127.0.0.1:6379",
	}

	for _, u := range blockedURLs {
		if err := ValidateWebhookURL(u); err == nil {
			t.Errorf("expected URL '%s' to be blocked by SSRF validator, but was accepted", u)
		}
	}

	allowedURLs := []string{
		"https://hooks.slack.com/services/T00/B00/XXXX",
		"https://discord.com/api/webhooks/123/abc",
		"https://api.github.com/webhook",
		"https://ci.example.com/events",
		"http://public-webhook-receiver.org/payload",
	}

	for _, u := range allowedURLs {
		if err := ValidateWebhookURL(u); err != nil {
			t.Errorf("expected valid public URL '%s' to be accepted, but got: %v", u, err)
		}
	}

	// When AllowPrivateWebhookHosts is enabled (e.g. for testing / air-gapped intranet), private targets succeed
	AllowPrivateWebhookHosts = true
	defer func() { AllowPrivateWebhookHosts = false }()

	if err := ValidateWebhookURL("http://127.0.0.1:8080/test"); err != nil {
		t.Errorf("expected loopback to be allowed when AllowPrivateWebhookHosts is true, got: %v", err)
	}
}
