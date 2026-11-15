package maintenance

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"progit.io/progit/internal/config"
	"progit.io/progit/internal/database"
	"progit.io/progit/internal/git"
)

func TestMaintenanceRunOnce(t *testing.T) {
	tempDir := t.TempDir()
	cfg := config.DefaultConfig()
	cfg.Database.Path = filepath.Join(tempDir, "test.db")
	cfg.Repository.Root = filepath.Join(tempDir, "repos")

	if err := database.Init(cfg); err != nil {
		t.Fatalf("database init failed: %v", err)
	}
	defer func() {
		if database.DB != nil {
			_ = database.DB.Close()
		}
	}()

	// Create a test repo
	userDir := filepath.Join(cfg.Repository.Root, "octocat")
	repoPath := filepath.Join(userDir, "repo.git")
	_ = os.MkdirAll(userDir, 0755)

	if err := git.InitRepositoryWithReadme(repoPath, "repo", "Maintenance Test", "main", "Octocat", "octo@example.com"); err != nil {
		t.Fatalf("init repo failed: %v", err)
	}

	report, err := RunOnce(cfg)
	if err != nil {
		t.Fatalf("RunOnce failed: %v", err)
	}

	if !report.WALCheckpointed {
		t.Errorf("expected WALCheckpointed=true")
	}
	if !report.DBOptimized {
		t.Errorf("expected DBOptimized=true")
	}
	if report.ReposChecked != 1 {
		t.Errorf("expected ReposChecked=1, got %d", report.ReposChecked)
	}

	// Test Start and Stop lifecycle quickly
	Start(cfg, 50*time.Millisecond)
	time.Sleep(120 * time.Millisecond)
	Stop()
}
