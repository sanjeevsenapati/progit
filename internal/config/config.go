package config

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Config struct {
	Server     ServerConfig
	Database   DatabaseConfig
	Repository RepositoryConfig
	Security   SecurityConfig
	SSH        SSHConfig
	Log        LogConfig
}

type ServerConfig struct {
	AppName           string
	Domain            string
	HTTPPort          int
	HTTPSPort         int
	RootURL           string
	Protocol          string // "http" or "https"
	OfflineMode       bool
	CertFile          string
	KeyFile           string
	GenerateLocalCert bool
	EnableACME        bool
	ACMEDomain        string
	ACMEEmail         string
	ACMEDirectory     string
	RedirectOtherPort bool
	HSTSMaxAge        int
}

type DatabaseConfig struct {
	Type         string
	Path         string
	WALMode      bool
	BusyTimeout  int
	MaxOpenConns int
	MaxIdleConns int
}

type RepositoryConfig struct {
	Root string
}

type SecurityConfig struct {
	InstallLock  bool
	SecretKey    string
	CookieSecure bool
}

type SSHConfig struct {
	Enabled    bool
	Port       int
	ListenHost string
	KeyPath    string
}

type LogConfig struct {
	Mode  string
	Level string
}

var App *Config

// DefaultConfig returns safe production-ready defaults
func DefaultConfig() *Config {
	return &Config{
		Server: ServerConfig{
			AppName:           "ProGit",
			Domain:            "localhost",
			HTTPPort:          3000,
			HTTPSPort:         3443,
			RootURL:           "http://localhost:3000/",
			Protocol:          "http",
			OfflineMode:       false,
			CertFile:          "custom/https/cert.pem",
			KeyFile:           "custom/https/key.pem",
			GenerateLocalCert: true,
			EnableACME:        false,
			ACMEDomain:        "",
			ACMEEmail:         "",
			ACMEDirectory:     "custom/https/acme",
			RedirectOtherPort: true,
			HSTSMaxAge:        31536000,
		},
		Database: DatabaseConfig{
			Type:         "sqlite",
			Path:         "./data/progit.db",
			WALMode:      true,
			BusyTimeout:  5000,
			MaxOpenConns: 25,
			MaxIdleConns: 5,
		},
		Repository: RepositoryConfig{
			Root: "./data/repositories",
		},
		Security: SecurityConfig{
			InstallLock:  false,
			SecretKey:    "progit_default_insecure_key_change_me",
			CookieSecure: false,
		},
		SSH: SSHConfig{
			Enabled:    true,
			Port:       2222,
			ListenHost: "0.0.0.0",
			KeyPath:    "./data/ssh/progit_ed25519",
		},
		Log: LogConfig{
			Mode:  "console",
			Level: "info",
		},
	}
}

// Load loads configuration from an INI file (if found) and applies environment overrides.
func Load(configPath string) (*Config, error) {
	cfg := DefaultConfig()

	if configPath != "" {
		if _, err := os.Stat(configPath); err == nil {
			if err := parseINIFile(configPath, cfg); err != nil {
				return nil, err
			}
		}
	} else {
		// Look in standard locations
		stdPaths := []string{
			"conf/app.ini",
			"data/config/app.ini",
			"/data/config/app.ini",
		}
		for _, p := range stdPaths {
			if _, err := os.Stat(p); err == nil {
				_ = parseINIFile(p, cfg)
				break
			}
		}
	}

	// Environment variable overrides
	if val := os.Getenv("PROGIT_APP_NAME"); val != "" {
		cfg.Server.AppName = val
	}
	if val := os.Getenv("PROGIT_DOMAIN"); val != "" {
		cfg.Server.Domain = val
	}
	if val := os.Getenv("PROGIT_HTTP_PORT"); val != "" {
		if port, err := strconv.Atoi(val); err == nil {
			cfg.Server.HTTPPort = port
		}
	}
	if val := os.Getenv("PORT"); val != "" {
		if port, err := strconv.Atoi(val); err == nil {
			cfg.Server.HTTPPort = port
		}
	}
	if val := os.Getenv("PROGIT_PROTOCOL"); val != "" {
		cfg.Server.Protocol = strings.ToLower(val)
	}
	if val := os.Getenv("PROGIT_HTTPS_PORT"); val != "" {
		if port, err := strconv.Atoi(val); err == nil {
			cfg.Server.HTTPSPort = port
		}
	}
	if val := os.Getenv("PROGIT_CERT_FILE"); val != "" {
		cfg.Server.CertFile = val
	}
	if val := os.Getenv("PROGIT_KEY_FILE"); val != "" {
		cfg.Server.KeyFile = val
	}
	if val := os.Getenv("PROGIT_GENERATE_LOCAL_CERT"); val != "" {
		cfg.Server.GenerateLocalCert = strings.ToLower(val) == "true" || val == "1"
	}
	if val := os.Getenv("PROGIT_ENABLE_ACME"); val != "" {
		cfg.Server.EnableACME = strings.ToLower(val) == "true" || val == "1"
	}
	if val := os.Getenv("PROGIT_ACME_DOMAIN"); val != "" {
		cfg.Server.ACMEDomain = val
	}
	if val := os.Getenv("PROGIT_ACME_EMAIL"); val != "" {
		cfg.Server.ACMEEmail = val
	}
	if val := os.Getenv("PROGIT_ACME_DIR"); val != "" {
		cfg.Server.ACMEDirectory = val
	}
	if val := os.Getenv("PROGIT_REDIRECT_OTHER_PORT"); val != "" {
		cfg.Server.RedirectOtherPort = strings.ToLower(val) == "true" || val == "1"
	} else if val := os.Getenv("PROGIT_HTTPS_REDIRECT"); val != "" {
		cfg.Server.RedirectOtherPort = strings.ToLower(val) == "true" || val == "1"
	}
	if val := os.Getenv("PROGIT_HSTS_MAX_AGE"); val != "" {
		if age, err := strconv.Atoi(val); err == nil {
			cfg.Server.HSTSMaxAge = age
		}
	}
	if val := os.Getenv("PROGIT_ROOT_URL"); val != "" {
		cfg.Server.RootURL = val
	} else if cfg.Server.Protocol == "https" && cfg.Server.RootURL == "http://localhost:3000/" {
		if cfg.Server.HTTPSPort == 443 {
			cfg.Server.RootURL = fmt.Sprintf("https://%s/", cfg.Server.Domain)
		} else {
			cfg.Server.RootURL = fmt.Sprintf("https://%s:%d/", cfg.Server.Domain, cfg.Server.HTTPSPort)
		}
	}
	if val := os.Getenv("PROGIT_DB_PATH"); val != "" {
		cfg.Database.Path = val
	}
	if val := os.Getenv("PROGIT_REPO_ROOT"); val != "" {
		cfg.Repository.Root = val
	}
	if val := os.Getenv("PROGIT_SECRET_KEY"); val != "" {
		cfg.Security.SecretKey = val
	}
	if val := os.Getenv("PROGIT_SSH_PORT"); val != "" {
		if port, err := strconv.Atoi(val); err == nil {
			cfg.SSH.Port = port
		}
	}
	if val := os.Getenv("PROGIT_SSH_ENABLED"); val != "" {
		cfg.SSH.Enabled = strings.ToLower(val) == "true" || val == "1"
	}
	if val := os.Getenv("PROGIT_COOKIE_SECURE"); val != "" {
		cfg.Security.CookieSecure = strings.ToLower(val) == "true" || val == "1"
	} else if cfg.Server.Protocol == "https" {
		cfg.Security.CookieSecure = true
	}

	// Ensure storage paths are absolute
	if absRoot, err := filepath.Abs(cfg.Repository.Root); err == nil {
		cfg.Repository.Root = absRoot
	}
	if absDB, err := filepath.Abs(cfg.Database.Path); err == nil {
		cfg.Database.Path = absDB
	}
	if absSSH, err := filepath.Abs(cfg.SSH.KeyPath); err == nil {
		cfg.SSH.KeyPath = absSSH
	}

	// Ensure required directories exist
	_ = os.MkdirAll(filepath.Dir(cfg.Database.Path), 0755)
	_ = os.MkdirAll(cfg.Repository.Root, 0755)
	_ = os.MkdirAll(filepath.Dir(cfg.SSH.KeyPath), 0700)

	App = cfg
	return cfg, nil
}

func parseINIFile(path string, cfg *Config) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	var currentSection string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, ";") {
			continue
		}
		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			currentSection = strings.ToLower(line[1 : len(line)-1])
			continue
		}

		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.ToUpper(strings.TrimSpace(parts[0]))
		val := strings.TrimSpace(parts[1])

		switch currentSection {
		case "server":
			switch key {
			case "APP_NAME":
				cfg.Server.AppName = val
			case "DOMAIN":
				cfg.Server.Domain = val
			case "HTTP_PORT":
				if p, err := strconv.Atoi(val); err == nil {
					cfg.Server.HTTPPort = p
				}
			case "HTTPS_PORT":
				if p, err := strconv.Atoi(val); err == nil {
					cfg.Server.HTTPSPort = p
				}
			case "ROOT_URL":
				cfg.Server.RootURL = val
			case "PROTOCOL":
				cfg.Server.Protocol = strings.ToLower(val)
			case "OFFLINE_MODE":
				cfg.Server.OfflineMode = val == "true" || val == "1"
			case "CERT_FILE":
				cfg.Server.CertFile = val
			case "KEY_FILE":
				cfg.Server.KeyFile = val
			case "GENERATE_LOCAL_CERT":
				cfg.Server.GenerateLocalCert = val == "true" || val == "1"
			case "ENABLE_ACME":
				cfg.Server.EnableACME = val == "true" || val == "1"
			case "ACME_DOMAIN":
				cfg.Server.ACMEDomain = val
			case "ACME_EMAIL":
				cfg.Server.ACMEEmail = val
			case "ACME_DIR", "ACME_DIRECTORY":
				cfg.Server.ACMEDirectory = val
			case "REDIRECT_OTHER_PORT", "ENABLE_HTTPS_REDIRECT":
				cfg.Server.RedirectOtherPort = val == "true" || val == "1"
			case "HSTS_MAX_AGE":
				if age, err := strconv.Atoi(val); err == nil {
					cfg.Server.HSTSMaxAge = age
				}
			}
		case "database":
			switch key {
			case "TYPE":
				cfg.Database.Type = val
			case "PATH":
				cfg.Database.Path = val
			case "WAL_MODE":
				cfg.Database.WALMode = val == "true" || val == "1"
			case "BUSY_TIMEOUT":
				if t, err := strconv.Atoi(val); err == nil {
					cfg.Database.BusyTimeout = t
				}
			}
		case "repository":
			switch key {
			case "ROOT":
				cfg.Repository.Root = val
			}
		case "security":
			switch key {
			case "INSTALL_LOCK":
				cfg.Security.InstallLock = val == "true" || val == "1"
			case "SECRET_KEY":
				cfg.Security.SecretKey = val
			case "COOKIE_SECURE":
				cfg.Security.CookieSecure = val == "true" || val == "1"
			}
		case "ssh":
			switch key {
			case "ENABLED":
				cfg.SSH.Enabled = val == "true" || val == "1"
			case "PORT":
				if p, err := strconv.Atoi(val); err == nil {
					cfg.SSH.Port = p
				}
			case "LISTEN_HOST":
				cfg.SSH.ListenHost = val
			case "KEY_PATH":
				cfg.SSH.KeyPath = val
			}
		case "log":
			switch key {
			case "MODE":
				cfg.Log.Mode = val
			case "LEVEL":
				cfg.Log.Level = val
			}
		}
	}
	return scanner.Err()
}

// Save writes the current configuration to an INI file.
func Save(configPath string, cfg *Config) error {
	if configPath == "" {
		configPath = "conf/app.ini"
	}
	if err := os.MkdirAll(filepath.Dir(configPath), 0755); err != nil {
		return err
	}
	var sb strings.Builder
	sb.WriteString("[server]\n")
	sb.WriteString(fmt.Sprintf("APP_NAME = %s\n", cfg.Server.AppName))
	sb.WriteString(fmt.Sprintf("DOMAIN = %s\n", cfg.Server.Domain))
	sb.WriteString(fmt.Sprintf("HTTP_PORT = %d\n", cfg.Server.HTTPPort))
	sb.WriteString(fmt.Sprintf("HTTPS_PORT = %d\n", cfg.Server.HTTPSPort))
	sb.WriteString(fmt.Sprintf("ROOT_URL = %s\n", cfg.Server.RootURL))
	sb.WriteString(fmt.Sprintf("PROTOCOL = %s\n", cfg.Server.Protocol))
	sb.WriteString(fmt.Sprintf("OFFLINE_MODE = %v\n", cfg.Server.OfflineMode))
	sb.WriteString(fmt.Sprintf("CERT_FILE = %s\n", cfg.Server.CertFile))
	sb.WriteString(fmt.Sprintf("KEY_FILE = %s\n", cfg.Server.KeyFile))
	sb.WriteString(fmt.Sprintf("GENERATE_LOCAL_CERT = %v\n", cfg.Server.GenerateLocalCert))
	sb.WriteString(fmt.Sprintf("ENABLE_ACME = %v\n", cfg.Server.EnableACME))
	sb.WriteString(fmt.Sprintf("ACME_DOMAIN = %s\n", cfg.Server.ACMEDomain))
	sb.WriteString(fmt.Sprintf("ACME_EMAIL = %s\n", cfg.Server.ACMEEmail))
	sb.WriteString(fmt.Sprintf("ACME_DIR = %s\n", cfg.Server.ACMEDirectory))
	sb.WriteString(fmt.Sprintf("REDIRECT_OTHER_PORT = %v\n", cfg.Server.RedirectOtherPort))
	sb.WriteString(fmt.Sprintf("HSTS_MAX_AGE = %d\n\n", cfg.Server.HSTSMaxAge))

	sb.WriteString("[database]\n")
	sb.WriteString(fmt.Sprintf("TYPE = %s\n", cfg.Database.Type))
	sb.WriteString(fmt.Sprintf("PATH = %s\n", cfg.Database.Path))
	sb.WriteString(fmt.Sprintf("WAL_MODE = %v\n", cfg.Database.WALMode))
	sb.WriteString(fmt.Sprintf("BUSY_TIMEOUT = %d\n\n", cfg.Database.BusyTimeout))

	sb.WriteString("[repository]\n")
	sb.WriteString(fmt.Sprintf("ROOT = %s\n\n", cfg.Repository.Root))

	sb.WriteString("[security]\n")
	sb.WriteString(fmt.Sprintf("INSTALL_LOCK = %v\n", cfg.Security.InstallLock))
	sb.WriteString(fmt.Sprintf("SECRET_KEY = %s\n", cfg.Security.SecretKey))
	sb.WriteString(fmt.Sprintf("COOKIE_SECURE = %v\n\n", cfg.Security.CookieSecure))

	sb.WriteString("[ssh]\n")
	sb.WriteString(fmt.Sprintf("ENABLED = %v\n", cfg.SSH.Enabled))
	sb.WriteString(fmt.Sprintf("PORT = %d\n", cfg.SSH.Port))
	sb.WriteString(fmt.Sprintf("LISTEN_HOST = %s\n", cfg.SSH.ListenHost))
	sb.WriteString(fmt.Sprintf("KEY_PATH = %s\n\n", cfg.SSH.KeyPath))

	sb.WriteString("[log]\n")
	sb.WriteString(fmt.Sprintf("MODE = %s\n", cfg.Log.Mode))
	sb.WriteString(fmt.Sprintf("LEVEL = %s\n", cfg.Log.Level))

	return os.WriteFile(configPath, []byte(sb.String()), 0644)
}

