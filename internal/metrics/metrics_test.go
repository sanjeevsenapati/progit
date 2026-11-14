package metrics

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestMetricsTrackingAndExposition(t *testing.T) {
	SetVersion("1.8.0")
	SetStatProvider(func() (int64, int64) {
		return 42, 108
	})
	SetDiskProvider(func() (int64, int64) {
		return 1024 * 1024 * 100, 1024 * 1024 * 500
	})

	RecordHTTPRequest("GET", "/api/v1/repos", 200, 5*time.Millisecond)
	RecordHTTPRequest("POST", "/api/v1/auth/login", 401, 10*time.Millisecond)
	RecordGitOperation("clone")
	RecordGitOperation("push")
	RecordGitOperation("gc")

	req := httptest.NewRequest("GET", "/metrics", nil)
	rr := httptest.NewRecorder()
	handler := Handler()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rr.Code)
	}

	body := rr.Body.String()

	expectedSubstrings := []string{
		`progit_info{version="1.8.0"`,
		`progit_uptime_seconds`,
		`progit_goroutines`,
		`progit_http_requests_total`,
		`status_class="2xx"`,
		`status_class="4xx"`,
		`progit_git_operations_total{operation="clone"}`,
		`progit_git_operations_total{operation="push"}`,
		`progit_git_operations_total{operation="gc"}`,
		`progit_users_total 42`,
		`progit_repositories_total 108`,
		`progit_disk_used_bytes`,
	}

	for _, sub := range expectedSubstrings {
		if !strings.Contains(body, sub) {
			t.Errorf("metrics output missing expected substring %q\nFull body:\n%s", sub, body)
		}
	}
}
