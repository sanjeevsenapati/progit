package https

import (
	"crypto/tls"
	"crypto/x509"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestSelfSignedCertGenerationAndLoad(t *testing.T) {
	tmpDir := t.TempDir()
	certPath := filepath.Join(tmpDir, "cert.pem")
	keyPath := filepath.Join(tmpDir, "key.pem")

	// 1. Generate certificate
	err := GenerateSelfSignedCert(certPath, keyPath, "progit.local", "git.example.com", "192.168.1.50")
	if err != nil {
		t.Fatalf("failed to generate self-signed cert: %v", err)
	}

	if !fileExists(certPath) {
		t.Fatalf("cert file not created at %s", certPath)
	}
	if !fileExists(keyPath) {
		t.Fatalf("key file not created at %s", keyPath)
	}

	// 2. Load certificate
	tlsCert, err := LoadOrGenerateCert(certPath, keyPath, "progit.local", false)
	if err != nil {
		t.Fatalf("failed to load generated cert: %v", err)
	}

	x509Cert, err := x509.ParseCertificate(tlsCert.Certificate[0])
	if err != nil {
		t.Fatalf("failed to parse x509 certificate: %v", err)
	}

	if x509Cert.Subject.CommonName != "progit.local" {
		t.Errorf("expected CommonName progit.local, got %s", x509Cert.Subject.CommonName)
	}

	// Verify SAN DNS names
	hasProGit := false
	hasGitExample := false
	for _, dns := range x509Cert.DNSNames {
		if dns == "progit.local" {
			hasProGit = true
		}
		if dns == "git.example.com" {
			hasGitExample = true
		}
	}
	if !hasProGit {
		t.Errorf("expected DNSNames to contain progit.local, got %v", x509Cert.DNSNames)
	}
	if !hasGitExample {
		t.Errorf("expected DNSNames to contain git.example.com, got %v", x509Cert.DNSNames)
	}
}

func TestHTTPSHandshakeAndRequest(t *testing.T) {
	tmpDir := t.TempDir()
	certPath := filepath.Join(tmpDir, "cert.pem")
	keyPath := filepath.Join(tmpDir, "key.pem")

	tlsCert, err := LoadOrGenerateCert(certPath, keyPath, "localhost", true)
	if err != nil {
		t.Fatalf("failed to load/generate cert: %v", err)
	}

	tlsConfig := MakeTLSConfig(tlsCert, tls.VersionTLS12)

	// Start test HTTPS server
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"https_ok"}`))
	}))
	server.TLS = tlsConfig
	server.StartTLS()
	defer server.Close()

	// Create client trusting the test server's self-signed cert
	certPool := x509.NewCertPool()
	certPEM, err := os.ReadFile(certPath)
	if err != nil {
		t.Fatalf("failed to read cert file: %v", err)
	}
	certPool.AppendCertsFromPEM(certPEM)

	client := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				RootCAs: certPool,
			},
		},
	}

	resp, err := client.Get(server.URL + "/api/health")
	if err != nil {
		t.Fatalf("HTTPS GET request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	body, _ := io.ReadAll(resp.Body)
	if string(body) != `{"status":"https_ok"}` {
		t.Errorf("unexpected body: %s", string(body))
	}
}

func TestHTTPToHTTPSRedirect(t *testing.T) {
	handler := HTTPToHTTPSRedirectHandler(3443, "localhost")

	req := httptest.NewRequest("GET", "/repo/demo/issues?page=1", nil)
	req.Host = "localhost:3000"
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusMovedPermanently {
		t.Errorf("expected 301 Moved Permanently, got %d", rec.Code)
	}

	expectedLoc := "https://localhost:3443/repo/demo/issues?page=1"
	if loc := rec.Header().Get("Location"); loc != expectedLoc {
		t.Errorf("expected Location %s, got %s", expectedLoc, loc)
	}
}

