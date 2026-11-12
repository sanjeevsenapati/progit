package api

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"progit.io/progit/internal/auth"
)

type toolboxResolver interface {
	LookupHost(ctx context.Context, host string) ([]string, error)
	LookupIPAddr(ctx context.Context, host string) ([]net.IPAddr, error)
	LookupCNAME(ctx context.Context, host string) (string, error)
	LookupMX(ctx context.Context, name string) ([]*net.MX, error)
	LookupTXT(ctx context.Context, name string) ([]string, error)
	LookupNS(ctx context.Context, name string) ([]*net.NS, error)
	LookupAddr(ctx context.Context, addr string) ([]string, error)
}

type DNSRecord struct {
	Type     string `json:"type"`
	Name     string `json:"name"`
	Value    string `json:"value"`
	Priority int    `json:"priority,omitempty"`
}

type DNSLookupResponse struct {
	Name       string      `json:"name"`
	RecordType string      `json:"record_type"`
	DurationMs int64       `json:"duration_ms"`
	Records    []DNSRecord `json:"records"`
	Errors     []string    `json:"errors,omitempty"`
}

var reservedAccountNames = map[string]bool{
	"admin":           true,
	"api":             true,
	"assets":          true,
	"dashboard":       true,
	"explore":         true,
	"forgot-password": true,
	"import":          true,
	"install":         true,
	"login":           true,
	"messages":        true,
	"new":             true,
	"org":             true,
	"orgs":            true,
	"pages":           true,
	"register":        true,
	"settings":        true,
	"toolbox":         true,
	"user":            true,
	"users":           true,
}

func isReservedAccountName(name string) bool {
	return reservedAccountNames[strings.ToLower(strings.TrimSpace(name))]
}

func isValidDNSHostname(name string) bool {
	trimmed := strings.TrimSuffix(strings.TrimSpace(name), ".")
	if trimmed == "" || len(trimmed) > 253 {
		return false
	}
	if strings.ContainsAny(trimmed, " \t\r\n/\\:@?&#") {
		return false
	}
	labels := strings.Split(trimmed, ".")
	for _, label := range labels {
		if len(label) == 0 || len(label) > 63 {
			return false
		}
		if label[0] == '-' || label[len(label)-1] == '-' {
			return false
		}
		for i := 0; i < len(label); i++ {
			c := label[i]
			isAlphaNum := (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
			if !isAlphaNum && c != '-' && c != '_' {
				return false
			}
		}
	}
	return true
}

func (r *Router) handleToolboxDNS(w http.ResponseWriter, req *http.Request) {
	if !r.cfg.Features.EnableToolbox || !r.cfg.Features.EnableToolboxDNS {
		jsonError(w, http.StatusForbidden, "Toolbox DNS lookup is disabled by administrator")
		return
	}

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Sign in to use server-assisted DNS lookup")
		return
	}

	limiterKey := fmt.Sprintf("%d:%s", user.ID, getClientIP(req))
	if r.dnsLimiter != nil && !r.dnsLimiter.allow(limiterKey) {
		jsonError(w, http.StatusTooManyRequests, "DNS lookup rate limit exceeded. Please wait a minute before trying again.")
		return
	}

	rawName := strings.TrimSpace(req.URL.Query().Get("name"))
	if rawName == "" {
		jsonError(w, http.StatusBadRequest, "Query parameter 'name' is required")
		return
	}

	recType := strings.ToUpper(strings.TrimSpace(req.URL.Query().Get("type")))
	if recType == "" {
		recType = "A"
	}

	allowedTypes := map[string]bool{
		"A": true, "AAAA": true, "CNAME": true, "MX": true,
		"TXT": true, "NS": true, "PTR": true, "ALL": true,
	}
	if !allowedTypes[recType] {
		jsonError(w, http.StatusBadRequest, "Unsupported DNS record type. Allowed: A, AAAA, CNAME, MX, TXT, NS, PTR, ALL")
		return
	}

	// Allow IP addresses for PTR reverse lookup, or valid DNS hostnames for all types.
	parsedIP := net.ParseIP(rawName)
	if recType == "PTR" {
		if parsedIP == nil && !isValidDNSHostname(rawName) {
			jsonError(w, http.StatusBadRequest, "Invalid IP address or hostname for PTR lookup")
			return
		}
	} else {
		if parsedIP == nil && !isValidDNSHostname(rawName) {
			jsonError(w, http.StatusBadRequest, "Invalid hostname for DNS lookup")
			return
		}
	}

	// Guard server concurrency so DNS queries cannot starve Git HTTP/API traffic.
	if r.dnsSem != nil {
		acquireCtx, acquireCancel := context.WithTimeout(req.Context(), 1*time.Second)
		defer acquireCancel()
		select {
		case r.dnsSem <- struct{}{}:
			defer func() { <-r.dnsSem }()
		case <-acquireCtx.Done():
			jsonError(w, http.StatusServiceUnavailable, "DNS resolver is busy, please try again shortly")
			return
		}
	}

	resolver := r.dnsResolver
	if resolver == nil {
		resolver = net.DefaultResolver
	}

	ctx, cancel := context.WithTimeout(req.Context(), 3*time.Second)
	defer cancel()

	start := time.Now()
	cleanName := strings.TrimSuffix(rawName, ".")

	var queryTypes []string
	if recType == "ALL" {
		if parsedIP != nil {
			queryTypes = []string{"PTR"}
		} else {
			queryTypes = []string{"A", "AAAA", "CNAME", "MX", "TXT", "NS"}
		}
	} else {
		queryTypes = []string{recType}
	}

	var (
		mu      sync.Mutex
		wg      sync.WaitGroup
		records []DNSRecord
		errs    []string
	)

	addRecord := func(rec DNSRecord) {
		mu.Lock()
		records = append(records, rec)
		mu.Unlock()
	}
	addErr := func(t string, err error) {
		if err == nil {
			return
		}
		// Ignore normal "no such host / no answer" on multi-type ALL scans unless single-type fails explicitly
		mu.Lock()
		errs = append(errs, fmt.Sprintf("%s: %v", t, err))
		mu.Unlock()
	}

	for _, qt := range queryTypes {
		qt := qt
		wg.Add(1)
		go func() {
			defer wg.Done()
			switch qt {
			case "A", "AAAA":
				ips, err := resolver.LookupIPAddr(ctx, cleanName)
				if err != nil {
					addErr(qt, err)
					return
				}
				for _, ip := range ips {
					isV4 := ip.IP.To4() != nil
					if (qt == "A" && isV4) || (qt == "AAAA" && !isV4) {
						addRecord(DNSRecord{Type: qt, Name: cleanName, Value: ip.IP.String()})
					}
				}
			case "CNAME":
				cname, err := resolver.LookupCNAME(ctx, cleanName)
				if err != nil {
					addErr(qt, err)
					return
				}
				cnameClean := strings.TrimSuffix(cname, ".")
				if cnameClean != "" && !strings.EqualFold(cnameClean, cleanName) {
					addRecord(DNSRecord{Type: "CNAME", Name: cleanName, Value: cnameClean})
				} else if recType == "CNAME" && cnameClean != "" {
					addRecord(DNSRecord{Type: "CNAME", Name: cleanName, Value: cnameClean})
				}
			case "MX":
				mxs, err := resolver.LookupMX(ctx, cleanName)
				if err != nil {
					addErr(qt, err)
					return
				}
				for _, mx := range mxs {
					addRecord(DNSRecord{
						Type:     "MX",
						Name:     cleanName,
						Value:    strings.TrimSuffix(mx.Host, "."),
						Priority: int(mx.Pref),
					})
				}
			case "TXT":
				txts, err := resolver.LookupTXT(ctx, cleanName)
				if err != nil {
					addErr(qt, err)
					return
				}
				for _, txt := range txts {
					addRecord(DNSRecord{Type: "TXT", Name: cleanName, Value: txt})
				}
			case "NS":
				nss, err := resolver.LookupNS(ctx, cleanName)
				if err != nil {
					addErr(qt, err)
					return
				}
				for _, ns := range nss {
					addRecord(DNSRecord{Type: "NS", Name: cleanName, Value: strings.TrimSuffix(ns.Host, ".")})
				}
			case "PTR":
				targetIP := rawName
				if parsedIP == nil {
					ips, err := resolver.LookupHost(ctx, cleanName)
					if err != nil || len(ips) == 0 {
						addErr("PTR", fmt.Errorf("could not resolve %s to an IP for reverse lookup", cleanName))
						return
					}
					targetIP = ips[0]
				}
				names, err := resolver.LookupAddr(ctx, targetIP)
				if err != nil {
					addErr(qt, err)
					return
				}
				for _, n := range names {
					addRecord(DNSRecord{Type: "PTR", Name: targetIP, Value: strings.TrimSuffix(n, ".")})
				}
			}
		}()
	}

	wg.Wait()

	sort.SliceStable(records, func(i, j int) bool {
		if records[i].Type != records[j].Type {
			return records[i].Type < records[j].Type
		}
		if records[i].Priority != records[j].Priority {
			return records[i].Priority < records[j].Priority
		}
		return records[i].Value < records[j].Value
	})

	if records == nil {
		records = []DNSRecord{}
	}
	if len(records) > 0 && recType == "ALL" {
		errs = nil
	}

	jsonResponse(w, http.StatusOK, DNSLookupResponse{
		Name:       cleanName,
		RecordType: recType,
		DurationMs: time.Since(start).Milliseconds(),
		Records:    records,
		Errors:     errs,
	})
}

