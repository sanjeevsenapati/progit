package main

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"golang.org/x/crypto/acme/autocert"

	"progit.io/progit/internal/api"
	"progit.io/progit/internal/auth"
	"progit.io/progit/internal/config"
	"progit.io/progit/internal/database"
	"progit.io/progit/internal/git"
	"progit.io/progit/internal/https"
	"progit.io/progit/internal/maintenance"
	"progit.io/progit/internal/ssh"
	"progit.io/progit/internal/ui"
)

var Version = "1.7.0"

func main() {
	maybeReapPID1()

	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "version", "--version", "-v":
			fmt.Printf("ProGit version %s\n", Version)
			return
		case "doctor":
			runDoctor(os.Args[2:])
			return
		case "backup":
			runBackup(os.Args[2:])
			return
		case "restore":
			runRestore(os.Args[2:])
			return
		case "admin":
			runAdmin(os.Args[2:])
			return
		case "web":
			runWeb(os.Args[2:])
			return
		}
	}

	// Default to running web server
	runWeb(os.Args[1:])
}

func runWeb(args []string) {
	fs := flag.NewFlagSet("web", flag.ExitOnError)
	configPath := fs.String("config", "", "Path to custom configuration INI file")
	_ = fs.Parse(args)

	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("[ProGit] Failed to load configuration: %v", err)
	}

	log.Printf("[ProGit] Initializing database at %s...", cfg.Database.Path)
	if err := database.Init(cfg); err != nil {
		log.Fatalf("[ProGit] Database initialization failed: %v", err)
	}
	log.Printf("[ProGit] SQLite database initialized successfully (WAL mode enabled)")

	// Initialize OpenID Connect (OIDC) SSO Provider
	if err := auth.InitOIDC(cfg.OIDC); err != nil {
		log.Printf("[ProGit] Warning: Failed to initialize OIDC provider: %v", err)
	} else if auth.IsOIDCEnabled() {
		log.Printf("[ProGit] OpenID Connect (OIDC) SSO enabled (Provider: %s, Display: %s)",
			cfg.OIDC.Provider, cfg.OIDC.DisplayName)
	}

	// Auto-initialize Super Admin from environment if configured
	if adminUser := os.Getenv("PROGIT_ADMIN_USER"); adminUser != "" {
		adminEmail := os.Getenv("PROGIT_ADMIN_EMAIL")
		if adminEmail == "" {
			adminEmail = adminUser + "@example.com"
		}
		adminPass := os.Getenv("PROGIT_ADMIN_PASSWORD")
		if adminPass == "" {
			adminPass = "Admin12345!"
		}
		if u, _ := database.GetUserByUsername(adminUser); u == nil {
			hash, err := auth.HashPassword(adminPass)
			if err == nil {
				_, _ = database.CreateUser(adminUser, adminEmail, hash, "Super Admin", true)
				log.Printf("[ProGit] Auto-initialized Super Admin user '%s' (%s)", adminUser, adminEmail)
			}
		}
	}

	// Security: If any users exist in the database, automatically enforce INSTALL_LOCK
	if userCount, _ := database.CountUsers(); userCount > 0 && !cfg.Security.InstallLock {
		cfg.Security.InstallLock = true
		_ = config.Save(*configPath, cfg)
		log.Printf("[Security] Users detected (%d). Automatically enforced INSTALL_LOCK = true", userCount)
	}

	// Start built-in SSH Server
	var sshServer *ssh.Server
	if cfg.SSH.Enabled {
		sshServer, err = ssh.StartServer(cfg)
		if err != nil {
			log.Printf("[ProGit] Warning: Failed to start SSH server on port %d: %v", cfg.SSH.Port, err)
		} else {
			log.Printf("[ProGit] Built-in SSH server running on %s:%d", cfg.SSH.ListenHost, cfg.SSH.Port)
		}
	}

	// Initialize API Router
	apiRouter := api.NewRouter(cfg)

	// Start Autonomous Zero-Ops Maintenance Worker (runs hourly WAL checkpoint, auto-GC, and query planner optimization)
	maintenance.Start(cfg, 1*time.Hour)

	// Combine Git Smart HTTP, API, and Web SPA
	distDir := filepath.Join(".", "web", "dist")
	spaHandler := ui.Handler(distDir)

	rootHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 1. Try Git Smart HTTP
		if strings.Contains(r.URL.Path, ".git") {
			if handled := git.HandleSmartHTTP(w, r, cfg); handled {
				return
			}
		}

		// 2. Try REST API, Health checks, Metrics, and ProGit Pages
		if strings.HasPrefix(r.URL.Path, "/api/") || strings.HasPrefix(r.URL.Path, "/pages/") || r.URL.Path == "/pages" || r.URL.Path == "/metrics" {
			apiRouter.ServeHTTP(w, r)
			return
		}

		// Security: Immediately redirect browser requests for /install to /login once ProGit is installed
		if r.URL.Path == "/install" || r.URL.Path == "/install/" {
			userCount, _ := database.CountUsers()
			if cfg.Security.InstallLock || userCount > 0 {
				http.Redirect(w, r, "/login", http.StatusTemporaryRedirect)
				return
			}
		}

		// 3. Fallback to Web UI SPA
		spaHandler(w, r)
	})

	var (
		server      *http.Server
		redirectSrv *http.Server
	)

	isHTTPS := strings.ToLower(cfg.Server.Protocol) == "https"

	if isHTTPS {
		var (
			tlsConfig   *tls.Config
			autocertMgr *autocert.Manager
		)

		if cfg.Server.EnableACME {
			domain := cfg.Server.ACMEDomain
			if domain == "" {
				domain = cfg.Server.Domain
			}
			log.Printf("[ProGit] Initializing ACME (Let's Encrypt) TLS for domain '%s'...", domain)
			tlsConfig, autocertMgr = https.MakeACMETLSConfig(cfg.Server.ACMEDirectory, cfg.Server.ACMEEmail, domain)
		} else {
			certFile := cfg.Server.CertFile
			keyFile := cfg.Server.KeyFile
			log.Printf("[ProGit] Loading HTTPS TLS certificate (cert: %s, key: %s)...", certFile, keyFile)
			tlsCert, err := https.LoadOrGenerateCert(certFile, keyFile, cfg.Server.Domain, cfg.Server.GenerateLocalCert)
			if err != nil {
				log.Fatalf("[ProGit] Failed to initialize HTTPS certificate: %v", err)
			}
			tlsConfig = https.MakeTLSConfig(tlsCert, tls.VersionTLS12)
		}

		httpsPort := cfg.Server.HTTPSPort
		if httpsPort <= 0 {
			httpsPort = 3443
		}
		httpsListenAddr := fmt.Sprintf("0.0.0.0:%d", httpsPort)

		server = &http.Server{
			Addr:         httpsListenAddr,
			Handler:      rootHandler,
			TLSConfig:    tlsConfig,
			ReadTimeout:  10 * time.Minute,
			WriteTimeout: 10 * time.Minute,
		}

		go func() {
			log.Printf("[ProGit] Starting %s HTTPS server on %s (Root URL: %s)", cfg.Server.AppName, httpsListenAddr, cfg.Server.RootURL)
			ln, err := net.Listen("tcp", httpsListenAddr)
			if err != nil {
				log.Fatalf("[ProGit] HTTPS listener failed on %s: %v", httpsListenAddr, err)
			}
			if err := server.ServeTLS(ln, "", ""); err != nil && err != http.ErrServerClosed {
				log.Fatalf("[ProGit] HTTPS server listen failed: %v", err)
			}
		}()

		// Optional HTTP to HTTPS redirect server
		if cfg.Server.RedirectOtherPort && cfg.Server.HTTPPort != httpsPort && cfg.Server.HTTPPort > 0 {
			httpPort := cfg.Server.HTTPPort
			httpListenAddr := fmt.Sprintf("0.0.0.0:%d", httpPort)

			var redirectHandler http.Handler = https.HTTPToHTTPSRedirectHandler(httpsPort, cfg.Server.Domain, cfg.Server.RootURL)
			if autocertMgr != nil {
				redirectHandler = autocertMgr.HTTPHandler(redirectHandler)
			}

			redirectSrv = &http.Server{
				Addr:         httpListenAddr,
				Handler:      redirectHandler,
				ReadTimeout:  10 * time.Second,
				WriteTimeout: 10 * time.Second,
			}

			go func() {
				log.Printf("[ProGit] Starting HTTP->HTTPS redirect listener on %s (redirecting to port %d)", httpListenAddr, httpsPort)
				if err := redirectSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
					log.Printf("[ProGit] Warning: HTTP redirect server stopped: %v", err)
				}
			}()
		}
	} else {
		listenAddr := fmt.Sprintf("0.0.0.0:%d", cfg.Server.HTTPPort)
		server = &http.Server{
			Addr:         listenAddr,
			Handler:      rootHandler,
			ReadTimeout:  10 * time.Minute, // Support large git push payloads
			WriteTimeout: 10 * time.Minute,
		}

		go func() {
			log.Printf("[ProGit] Starting %s server on %s (Root URL: %s)", cfg.Server.AppName, listenAddr, cfg.Server.RootURL)
			if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				log.Fatalf("[ProGit] HTTP server listen failed: %v", err)
			}
		}()
	}

	// Graceful shutdown handling
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Printf("[ProGit] Shutting down gracefully...")

	// Stop background maintenance worker
	maintenance.Stop()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("[ProGit] Server shutdown error: %v", err)
	}
	if redirectSrv != nil {
		_ = redirectSrv.Shutdown(ctx)
	}
	if sshServer != nil {
		_ = sshServer.Close()
	}
	log.Printf("[ProGit] Server stopped")
}

func runAdmin(args []string) {
	if len(args) == 0 {
		fmt.Println("ProGit Admin CLI:")
		fmt.Println("  progit admin create-user --username=<user> --email=<email> --password=<pass> [--admin]")
		fmt.Println("  progit admin reset-password --username=<user> --password=<new-pass>")
		fmt.Println("  progit admin make-admin --username=<user>")
		fmt.Println("  progit admin list-users")
		fmt.Println("  progit admin lock-install")
		return
	}

	subcmd := args[0]
	switch subcmd {
	case "create-user":
		fs := flag.NewFlagSet("create-user", flag.ExitOnError)
		configPath := fs.String("config", "", "Custom configuration file path")
		username := fs.String("username", "", "Username")
		email := fs.String("email", "", "Email address")
		password := fs.String("password", "", "Password")
		isAdmin := fs.Bool("admin", false, "Grant administrator permissions")
		_ = fs.Parse(args[1:])

		cfg, _ := config.Load(*configPath)
		if err := database.Init(cfg); err != nil {
			log.Fatalf("Database initialization failed: %v", err)
		}

		if *username == "" || *email == "" || *password == "" {
			log.Fatal("Username, email, and password are required")
		}

		hash, err := auth.HashPassword(*password)
		if err != nil {
			log.Fatalf("Failed to hash password: %v", err)
		}

		u, err := database.CreateUser(*username, *email, hash, *username, *isAdmin)
		if err != nil {
			log.Fatalf("Failed to create user: %v", err)
		}

		// Automatically lock installation once an admin or user is created via CLI
		if !cfg.Security.InstallLock {
			cfg.Security.InstallLock = true
			_ = config.Save(*configPath, cfg)
		}

		fmt.Printf("User '%s' (ID: %d, Admin: %v) created successfully\n", u.Username, u.ID, u.IsAdmin)

	case "reset-password":
		fs := flag.NewFlagSet("reset-password", flag.ExitOnError)
		configPath := fs.String("config", "", "Custom configuration file path")
		username := fs.String("username", "", "Username to reset password for")
		password := fs.String("password", "", "New password")
		_ = fs.Parse(args[1:])

		if *username == "" || *password == "" {
			log.Fatal("Both --username and --password are required")
		}
		if len(*password) < 6 {
			log.Fatal("Password must be at least 6 characters")
		}

		cfg, _ := config.Load(*configPath)
		if err := database.Init(cfg); err != nil {
			log.Fatalf("Database initialization failed: %v", err)
		}

		u, err := database.GetUserByUsername(*username)
		if err != nil || u == nil {
			log.Fatalf("User '%s' not found", *username)
		}

		hash, err := auth.HashPassword(*password)
		if err != nil {
			log.Fatalf("Failed to hash password: %v", err)
		}

		if err := database.UpdateUserPasswordHash(u.ID, hash); err != nil {
			log.Fatalf("Failed to update password: %v", err)
		}

		fmt.Printf("Password for user '%s' (ID: %d) updated successfully\n", u.Username, u.ID)

	case "make-admin":
		fs := flag.NewFlagSet("make-admin", flag.ExitOnError)
		configPath := fs.String("config", "", "Custom configuration file path")
		username := fs.String("username", "", "Username to promote to administrator")
		_ = fs.Parse(args[1:])

		if *username == "" {
			log.Fatal("--username is required")
		}

		cfg, _ := config.Load(*configPath)
		if err := database.Init(cfg); err != nil {
			log.Fatalf("Database initialization failed: %v", err)
		}

		u, err := database.GetUserByUsername(*username)
		if err != nil || u == nil {
			log.Fatalf("User '%s' not found", *username)
		}

		if err := database.UpdateUserAdmin(u.ID, true); err != nil {
			log.Fatalf("Failed to promote user: %v", err)
		}

		fmt.Printf("User '%s' (ID: %d) successfully promoted to Administrator\n", u.Username, u.ID)

	case "list-users":
		fs := flag.NewFlagSet("list-users", flag.ExitOnError)
		configPath := fs.String("config", "", "Custom configuration file path")
		_ = fs.Parse(args[1:])

		cfg, _ := config.Load(*configPath)
		if err := database.Init(cfg); err != nil {
			log.Fatalf("Database initialization failed: %v", err)
		}

		users, err := database.ListUsers(100, 0)
		if err != nil {
			log.Fatalf("Failed to list users: %v", err)
		}

		fmt.Printf("%-6s %-20s %-30s %-10s %-8s\n", "ID", "USERNAME", "EMAIL", "ADMIN", "ACTIVE")
		fmt.Println(strings.Repeat("-", 80))
		for _, u := range users {
			fmt.Printf("%-6d %-20s %-30s %-10t %-8t\n", u.ID, u.Username, u.Email, u.IsAdmin, u.IsActive)
		}

	case "lock-install":
		fs := flag.NewFlagSet("lock-install", flag.ExitOnError)
		configPath := fs.String("config", "", "Custom configuration file path")
		_ = fs.Parse(args[1:])

		cfg, _ := config.Load(*configPath)
		cfg.Security.InstallLock = true
		if err := config.Save(*configPath, cfg); err != nil {
			log.Fatalf("Failed to lock installation: %v", err)
		}
		fmt.Println("ProGit installation wizard is permanently LOCKED in config.")

	default:
		// Backwards compatibility if user ran `progit admin --username=...`
		fs := flag.NewFlagSet("create-user", flag.ExitOnError)
		configPath := fs.String("config", "", "Custom configuration file path")
		username := fs.String("username", "", "Username")
		email := fs.String("email", "", "Email address")
		password := fs.String("password", "", "Password")
		isAdmin := fs.Bool("admin", false, "Grant administrator permissions")
		_ = fs.Parse(args)

		cfg, _ := config.Load(*configPath)
		if err := database.Init(cfg); err != nil {
			log.Fatalf("Database initialization failed: %v", err)
		}

		if *username == "" || *email == "" || *password == "" {
			fmt.Printf("Unknown admin subcommand '%s'\n", subcmd)
			fmt.Println("Available commands: create-user, reset-password, make-admin, list-users, lock-install")
			return
		}

		hash, err := auth.HashPassword(*password)
		if err != nil {
			log.Fatalf("Failed to hash password: %v", err)
		}

		u, err := database.CreateUser(*username, *email, hash, *username, *isAdmin)
		if err != nil {
			log.Fatalf("Failed to create user: %v", err)
		}

		if !cfg.Security.InstallLock {
			cfg.Security.InstallLock = true
			_ = config.Save(*configPath, cfg)
		}

		fmt.Printf("User '%s' (ID: %d, Admin: %v) created successfully\n", u.Username, u.ID, u.IsAdmin)
	}
}

func runBackup(args []string) {
	fs := flag.NewFlagSet("backup", flag.ExitOnError)
	configPath := fs.String("config", "", "Custom configuration file path")
	outputPath := fs.String("output", "", "Output backup tarball path")
	_ = fs.Parse(args)

	cfg, _ := config.Load(*configPath)
	if err := database.Init(cfg); err != nil {
		log.Fatalf("Database initialization failed: %v", err)
	}

	tempDir, err := os.MkdirTemp("", "progit-backup-*")
	if err != nil {
		log.Fatalf("Create temp backup dir failed: %v", err)
	}
	defer os.RemoveAll(tempDir)

	tempDB := filepath.Join(tempDir, "database.db")
	log.Printf("[Backup] Creating atomic hot SQLite database snapshot (VACUUM INTO)...")
	if err := database.CreateHotBackup(tempDB); err != nil {
		log.Printf("[Backup] Warning: Hot backup failed (%v), falling back to checkpointed file", err)
		_ = database.CheckpointWAL()
		tempDB = cfg.Database.Path
	}

	// Calculate SHA256 of the backup DB
	dbBytes, _ := os.ReadFile(tempDB)
	dbHash := sha256.Sum256(dbBytes)
	dbSha := hex.EncodeToString(dbHash[:])

	repoCount, _ := database.CountRepositories()
	userCount, _ := database.CountUsers()

	manifest := map[string]any{
		"version":            Version,
		"created_at":         time.Now().UTC().Format(time.RFC3339),
		"db_sha256":          dbSha,
		"repositories_count": repoCount,
		"users_count":        userCount,
	}
	manifestBytes, _ := json.MarshalIndent(manifest, "", "  ")

	if *outputPath == "" {
		_ = os.MkdirAll("backups", 0755)
		*outputPath = fmt.Sprintf("backups/progit-backup-%s.tar.gz", time.Now().Format("20060102-150405"))
	} else {
		_ = os.MkdirAll(filepath.Dir(*outputPath), 0755)
	}

	outFile, err := os.Create(*outputPath)
	if err != nil {
		log.Fatalf("Create backup file failed: %v", err)
	}
	defer outFile.Close()

	gw := gzip.NewWriter(outFile)
	defer gw.Close()
	tw := tar.NewWriter(gw)
	defer tw.Close()

	// 1. Add manifest
	_ = addBytesToTar(tw, manifestBytes, "manifest.json")

	// 2. Add SQLite DB file
	if err := addFileToTar(tw, tempDB, "database.db"); err != nil {
		log.Printf("Warning adding db: %v", err)
	}

	// 3. Add Repositories tree
	if err := addDirToTar(tw, cfg.Repository.Root, "repositories"); err != nil {
		log.Printf("Warning adding repositories: %v", err)
	}

	log.Printf("[Backup] Hot backup archive created successfully at %s (DB SHA256: %s...)", *outputPath, dbSha[:12])
}

func runRestore(args []string) {
	if len(args) == 0 {
		log.Fatal("Usage: progit restore <path-to-backup.tar.gz>")
	}
	archivePath := args[0]
	cfg, _ := config.Load("")

	file, err := os.Open(archivePath)
	if err != nil {
		log.Fatalf("Open backup archive failed: %v", err)
	}
	defer file.Close()

	gr, err := gzip.NewReader(file)
	if err != nil {
		log.Fatalf("Gzip reader failed: %v", err)
	}
	defer gr.Close()

	tr := tar.NewReader(gr)
	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			log.Fatalf("Tar error: %v", err)
		}

		if header.Name == "manifest.json" {
			data, _ := io.ReadAll(tr)
			var manifest map[string]any
			if err := json.Unmarshal(data, &manifest); err == nil {
				log.Printf("[Restore] Found valid backup manifest (ProGit v%v, created: %v, repositories: %v)",
					manifest["version"], manifest["created_at"], manifest["repositories_count"])
			}
			continue
		}

		if header.Name == "database.db" {
			_ = os.MkdirAll(filepath.Dir(cfg.Database.Path), 0755)
			out, err := os.Create(cfg.Database.Path)
			if err != nil {
				log.Fatalf("Restore db failed: %v", err)
			}
			_, _ = io.Copy(out, tr)
			out.Close()
			log.Printf("[Restore] Restored database to %s", cfg.Database.Path)
		} else if strings.HasPrefix(header.Name, "repositories/") {
			relPath := strings.TrimPrefix(header.Name, "repositories/")
			if relPath == "" {
				continue
			}
			destPath := filepath.Join(cfg.Repository.Root, relPath)
			if header.Typeflag == tar.TypeDir {
				_ = os.MkdirAll(destPath, 0755)
			} else {
				_ = os.MkdirAll(filepath.Dir(destPath), 0755)
				out, err := os.Create(destPath)
				if err == nil {
					_, _ = io.Copy(out, tr)
					out.Close()
				}
			}
		}
	}
	log.Printf("[Restore] Restore operation completed successfully")
}

func addBytesToTar(tw *tar.Writer, data []byte, tarName string) error {
	header := &tar.Header{
		Name:    tarName,
		Size:    int64(len(data)),
		Mode:    0644,
		ModTime: time.Now(),
	}
	if err := tw.WriteHeader(header); err != nil {
		return err
	}
	_, err := tw.Write(data)
	return err
}

func addFileToTar(tw *tar.Writer, filePath, tarName string) error {
	info, err := os.Stat(filePath)
	if err != nil {
		return err
	}
	header, err := tar.FileInfoHeader(info, "")
	if err != nil {
		return err
	}
	header.Name = tarName
	if err := tw.WriteHeader(header); err != nil {
		return err
	}
	f, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(tw, f)
	return err
}

func addDirToTar(tw *tar.Writer, dirPath, tarPrefix string) error {
	return filepath.Walk(dirPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		relPath, _ := filepath.Rel(dirPath, path)
		if relPath == "." {
			return nil
		}
		tarName := filepath.Join(tarPrefix, relPath)
		header, err := tar.FileInfoHeader(info, "")
		if err != nil {
			return err
		}
		header.Name = tarName
		if err := tw.WriteHeader(header); err != nil {
			return err
		}
		if !info.IsDir() {
			f, err := os.Open(path)
			if err != nil {
				return err
			}
			defer f.Close()
			_, _ = io.Copy(tw, f)
		}
		return nil
	})
}

