package https

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"golang.org/x/crypto/acme/autocert"
)

// GenerateSelfSignedCert generates a modern ECDSA P-256 self-signed certificate
// with Subject Alternative Names (SANs) for domain, localhost, and local IPs.
func GenerateSelfSignedCert(certPath, keyPath, domain string, extraHosts ...string) error {
	if domain == "" {
		domain = "localhost"
	}

	privKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return fmt.Errorf("failed to generate ECDSA private key: %w", err)
	}

	serialNumberLimit := new(big.Int).Lsh(big.NewInt(1), 128)
	serialNumber, err := rand.Int(rand.Reader, serialNumberLimit)
	if err != nil {
		return fmt.Errorf("failed to generate serial number: %w", err)
	}

	notBefore := time.Now().Add(-1 * time.Hour)
	notAfter := notBefore.Add(365 * 24 * time.Hour * 2) // Valid for 2 years

	template := x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			Organization:       []string{"ProGit"},
			OrganizationalUnit: []string{"ProGit Self-Signed HTTPS"},
			CommonName:         domain,
		},
		NotBefore:             notBefore,
		NotAfter:              notAfter,
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth, x509.ExtKeyUsageClientAuth},
		BasicConstraintsValid: true,
	}

	// Build SAN lists
	dnsMap := map[string]bool{
		domain:      true,
		"localhost": true,
	}
	ipMap := map[string]net.IP{
		"127.0.0.1": net.ParseIP("127.0.0.1"),
		"::1":       net.ParseIP("::1"),
	}

	for _, host := range extraHosts {
		host = strings.TrimSpace(host)
		if host == "" {
			continue
		}
		if ip := net.ParseIP(host); ip != nil {
			ipMap[host] = ip
		} else {
			dnsMap[host] = true
		}
	}

	// Try to discover local non-loopback network interfaces
	if addrs, err := net.InterfaceAddrs(); err == nil {
		for _, addr := range addrs {
			if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
				if ipnet.IP.To4() != nil {
					ipMap[ipnet.IP.String()] = ipnet.IP
				}
			}
		}
	}

	for dns := range dnsMap {
		template.DNSNames = append(template.DNSNames, dns)
	}
	for _, ip := range ipMap {
		template.IPAddresses = append(template.IPAddresses, ip)
	}

	derBytes, err := x509.CreateCertificate(rand.Reader, &template, &template, &privKey.PublicKey, privKey)
	if err != nil {
		return fmt.Errorf("failed to create certificate: %w", err)
	}

	// Create directories if necessary
	if err := os.MkdirAll(filepath.Dir(certPath), 0700); err != nil {
		return fmt.Errorf("failed to create cert directory: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(keyPath), 0700); err != nil {
		return fmt.Errorf("failed to create key directory: %w", err)
	}

	certOut, err := os.OpenFile(certPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
	if err != nil {
		return fmt.Errorf("failed to open cert file for writing: %w", err)
	}
	defer certOut.Close()

	if err := pem.Encode(certOut, &pem.Block{Type: "CERTIFICATE", Bytes: derBytes}); err != nil {
		return fmt.Errorf("failed to write cert PEM: %w", err)
	}

	keyOut, err := os.OpenFile(keyPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return fmt.Errorf("failed to open key file for writing: %w", err)
	}
	defer keyOut.Close()

	privBytes, err := x509.MarshalECPrivateKey(privKey)
	if err != nil {
		return fmt.Errorf("failed to marshal EC private key: %w", err)
	}

	if err := pem.Encode(keyOut, &pem.Block{Type: "EC PRIVATE KEY", Bytes: privBytes}); err != nil {
		return fmt.Errorf("failed to write key PEM: %w", err)
	}

	return nil
}

// LoadOrGenerateCert loads an existing TLS certificate or generates a self-signed one.
func LoadOrGenerateCert(certPath, keyPath, domain string, autoGenerate bool, extraHosts ...string) (tls.Certificate, error) {
	certExists := fileExists(certPath)
	keyExists := fileExists(keyPath)

	if certExists && keyExists {
		return tls.LoadX509KeyPair(certPath, keyPath)
	}

	if !autoGenerate {
		return tls.Certificate{}, fmt.Errorf("TLS certificate files missing (cert: %s, key: %s)", certPath, keyPath)
	}

	if err := GenerateSelfSignedCert(certPath, keyPath, domain, extraHosts...); err != nil {
		return tls.Certificate{}, fmt.Errorf("failed to auto-generate self-signed TLS certificate: %w", err)
	}

	return tls.LoadX509KeyPair(certPath, keyPath)
}

// MakeTLSConfig returns a hardened, modern TLS configuration.
func MakeTLSConfig(cert tls.Certificate, minVersion uint16) *tls.Config {
	if minVersion == 0 {
		minVersion = tls.VersionTLS12
	}

	return &tls.Config{
		Certificates: []tls.Certificate{cert},
		MinVersion:   minVersion,
		NextProtos:   []string{"h2", "http/1.1"},
		CurvePreferences: []tls.CurveID{
			tls.X25519,
			tls.CurveP256,
		},
		CipherSuites: []uint16{
			tls.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
			tls.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
			tls.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,
			tls.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
			tls.TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305,
			tls.TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305,
		},
		PreferServerCipherSuites: true,
	}
}

// MakeACMETLSConfig configures automatic ACME (Let's Encrypt) TLS certificate management.
func MakeACMETLSConfig(acmeDir, acmeEmail string, domains ...string) (*tls.Config, *autocert.Manager) {
	if acmeDir == "" {
		acmeDir = "custom/https/acme"
	}
	_ = os.MkdirAll(acmeDir, 0700)

	manager := &autocert.Manager{
		Prompt:     autocert.AcceptTOS,
		Cache:      autocert.DirCache(acmeDir),
		HostPolicy: autocert.HostWhitelist(domains...),
		Email:      acmeEmail,
	}

	tlsConfig := manager.TLSConfig()
	tlsConfig.MinVersion = tls.VersionTLS12
	tlsConfig.NextProtos = append(tlsConfig.NextProtos, "h2", "http/1.1")

	return tlsConfig, manager
}

// HTTPToHTTPSRedirectHandler returns an HTTP handler that redirects all incoming
// HTTP requests to their HTTPS equivalent.
func HTTPToHTTPSRedirectHandler(httpsPort int, fallbackDomain string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := r.Host
		if h, _, err := net.SplitHostPort(host); err == nil {
			host = h
		}
		if host == "" {
			host = fallbackDomain
		}
		if host == "" {
			host = "localhost"
		}

		target := fmt.Sprintf("https://%s", host)
		if httpsPort != 443 && httpsPort > 0 {
			target = fmt.Sprintf("https://%s:%d", host, httpsPort)
		}
		target += r.URL.RequestURI()

		http.Redirect(w, r, target, http.StatusMovedPermanently)
	})
}

func fileExists(p string) bool {
	if p == "" {
		return false
	}
	info, err := os.Stat(p)
	return err == nil && !info.IsDir()
}

