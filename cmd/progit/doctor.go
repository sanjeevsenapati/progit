package main

import (
	"crypto/tls"
	"flag"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"progit.io/progit/internal/config"
	"progit.io/progit/internal/database"
	"progit.io/progit/internal/git"
)

type CheckStatus string

const (
	StatusPass CheckStatus = "PASS"
	StatusWarn CheckStatus = "WARN"
	StatusFail CheckStatus = "FAIL"
)

type DiagnosticItem struct {
	Category string
	Name     string
	Status   CheckStatus
	Message  string
	Details  string
}

func runDoctor(args []string) {
	fs := flag.NewFlagSet("doctor", flag.ExitOnError)
	configPath := fs.String("config", "", "Path to custom configuration INI file")
	_ = fs.Parse(args)

	fmt.Println("==================================================================")
	fmt.Printf(" ProGit Self-Diagnostic System Doctor (v%s)\n", Version)
	fmt.Println("==================================================================")

	var items []DiagnosticItem
	addCheck := func(cat, name string, status CheckStatus, msg, details string) {
		items = append(items, DiagnosticItem{
			Category: cat,
			Name:     name,
			Status:   status,
			Message:  msg,
			Details:  details,
		})
	}

	// 1. System Environment
	addCheck("System", "Operating System", StatusPass,
		fmt.Sprintf("%s / %s (CPUs: %d)", runtime.GOOS, runtime.GOARCH, runtime.NumCPU()), "")
	addCheck("System", "Go Runtime", StatusPass, runtime.Version(), "")

	// 2. Git Engine & CLI
	gitVer := git.GetGitVersion()
	if gitVer == "unknown" {
		addCheck("Git Engine", "Git Executable", StatusFail,
			"git binary not found in PATH", "Please install Git (2.20+) and ensure it is in system PATH")
	} else {
		status := StatusPass
		if strings.Compare(gitVer, "2.20") < 0 {
			status = StatusWarn
		}
		addCheck("Git Engine", "Git Version", status,
			fmt.Sprintf("git version %s", gitVer), "")

		// Check commit-graph support
		out, err := git.RunGitWithTimeout(5*time.Second, "", "commit-graph", "--help")
		if err == nil || strings.Contains(string(out), "write") || strings.Contains(string(out), "usage") {
			addCheck("Git Engine", "Commit-Graph Support", StatusPass, "Enabled (generation numbers & bloom filters supported)", "")
		} else {
			addCheck("Git Engine", "Commit-Graph Support", StatusWarn, "commit-graph command not fully supported", "")
		}
	}

	// 3. Configuration
	cfg, err := config.Load(*configPath)
	if err != nil {
		addCheck("Config", "Configuration File", StatusFail,
			fmt.Sprintf("Failed to load config: %v", err), "")
		printDoctorReport(items)
		return
	}
	addCheck("Config", "Configuration File", StatusPass,
		fmt.Sprintf("Loaded (%s protocol, AppName: %s)", cfg.Server.Protocol, cfg.Server.AppName), "")

	if cfg.Security.InstallLock {
		addCheck("Security", "Install Lock", StatusPass, "Locked (install wizard disabled for safety)", "")
	} else {
		addCheck("Security", "Install Lock", StatusWarn, "UNLOCKED - Run 'progit admin lock-install' to lock", "")
	}

	if len(cfg.Security.SecretKey) >= 16 {
		addCheck("Security", "Secret Key Entropy", StatusPass, "Secure (>= 16 characters)", "")
	} else {
		addCheck("Security", "Secret Key Entropy", StatusWarn, "Weak or default secret key", "")
	}

	// 4. Filesystem Permissions
	checkDirWrite := func(name, path string) {
		if path == "" {
			return
		}
		if err := os.MkdirAll(path, 0755); err != nil {
			addCheck("Storage", name, StatusFail, fmt.Sprintf("Cannot create directory %s: %v", path, err), "")
			return
		}
		testFile := filepath.Join(path, ".doctor_write_probe")
		if err := os.WriteFile(testFile, []byte("progit_probe"), 0600); err != nil {
			addCheck("Storage", name, StatusFail, fmt.Sprintf("Write check failed on %s: %v", path, err), "")
			return
		}
		_ = os.Remove(testFile)
		addCheck("Storage", name, StatusPass, fmt.Sprintf("Writable (%s)", path), "")
	}

	checkDirWrite("Repository Root", cfg.Repository.Root)
	checkDirWrite("Database Dir", filepath.Dir(cfg.Database.Path))

	// 5. Database Diagnostics
	if err := database.Init(cfg); err != nil {
		addCheck("Database", "SQLite Initialization", StatusFail, fmt.Sprintf("Connection failed: %v", err), "")
	} else {
		addCheck("Database", "SQLite Connection", StatusPass, fmt.Sprintf("Connected (%s)", cfg.Database.Path), "")

		// Check integrity
		integrity, err := database.CheckIntegrity()
		if err != nil {
			addCheck("Database", "Integrity Check", StatusFail, fmt.Sprintf("Integrity check query failed: %v", err), "")
		} else if integrity == "ok" {
			addCheck("Database", "Integrity Check", StatusPass, "PRAGMA integrity_check: OK", "")
		} else {
			addCheck("Database", "Integrity Check", StatusFail, fmt.Sprintf("Corruptions detected: %s", integrity), "")
		}

		// User & Repo counts
		uCount, _ := database.CountUsers()
		rCount, _ := database.CountRepositories()
		addCheck("Database", "Entity Counts", StatusPass,
			fmt.Sprintf("%d users, %d repositories", uCount, rCount), "")
	}

	// 6. Network Ports
	checkPort := func(name string, port int) {
		if port <= 0 {
			return
		}
		addr := fmt.Sprintf("127.0.0.1:%d", port)
		conn, err := net.DialTimeout("tcp", addr, 300*time.Millisecond)
		if err == nil {
			_ = conn.Close()
			addCheck("Network", name, StatusPass, fmt.Sprintf("Port %d is active and accepting connections", port), "")
		} else {
			// Try to check if bindable
			ln, bErr := net.Listen("tcp", fmt.Sprintf("0.0.0.0:%d", port))
			if bErr == nil {
				_ = ln.Close()
				addCheck("Network", name, StatusPass, fmt.Sprintf("Port %d is available to bind", port), "")
			} else {
				addCheck("Network", name, StatusWarn, fmt.Sprintf("Port %d cannot be bound: %v", port, bErr), "")
			}
		}
	}

	checkPort("HTTP Port", cfg.Server.HTTPPort)
	if strings.ToLower(cfg.Server.Protocol) == "https" {
		checkPort("HTTPS Port", cfg.Server.HTTPSPort)
	}
	if cfg.SSH.Enabled {
		checkPort("SSH Port", cfg.SSH.Port)
	}

	// 7. HTTPS Certificate Check if applicable
	if strings.ToLower(cfg.Server.Protocol) == "https" && !cfg.Server.EnableACME {
		if cfg.Server.CertFile != "" && cfg.Server.KeyFile != "" {
			cert, err := tls.LoadX509KeyPair(cfg.Server.CertFile, cfg.Server.KeyFile)
			if err != nil {
				if cfg.Server.GenerateLocalCert {
					addCheck("TLS / SSL", "HTTPS Certificates", StatusPass,
						"Auto-generation enabled (ECDSA TLS certificate will be provisioned on launch)", "")
				} else {
					addCheck("TLS / SSL", "HTTPS Certificates", StatusFail, fmt.Sprintf("Failed to load cert pair: %v", err), "")
				}
			} else if len(cert.Certificate) > 0 {
				addCheck("TLS / SSL", "HTTPS Certificates", StatusPass, "Valid X509 key pair loaded", "")
			}
		}
	}

	printDoctorReport(items)
}

func printDoctorReport(items []DiagnosticItem) {
	fmt.Printf("\n%-12s %-24s %-8s %s\n", "CATEGORY", "CHECK", "STATUS", "DETAILS")
	fmt.Println(strings.Repeat("-", 75))

	var passes, warns, fails int
	for _, item := range items {
		switch item.Status {
		case StatusPass:
			passes++
			fmt.Printf("%-12s %-24s [✓ PASS] %s\n", item.Category, item.Name, item.Message)
		case StatusWarn:
			warns++
			fmt.Printf("%-12s %-24s [! WARN] %s\n", item.Category, item.Name, item.Message)
		case StatusFail:
			fails++
			fmt.Printf("%-12s %-24s [✗ FAIL] %s\n", item.Category, item.Name, item.Message)
		}
		if item.Details != "" {
			fmt.Printf("%-38s -> %s\n", "", item.Details)
		}
	}

	fmt.Println(strings.Repeat("=", 75))
	fmt.Printf(" Summary: %d Passed, %d Warnings, %d Failures\n", passes, warns, fails)

	if fails > 0 {
		fmt.Printf(" Verdict: [CRITICAL ISSUES DETECTED] Please resolve the %d failure(s) above.\n\n", fails)
	} else if warns > 0 {
		fmt.Printf(" Verdict: [HEALTHY WITH ADVISORIES] ProGit is operational with %d advisory warning(s).\n\n", warns)
	} else {
		fmt.Println(" Verdict: [OPTIMAL HEALTH] All diagnostics passed cleanly. Ready for production.")
		fmt.Println()
	}
}
