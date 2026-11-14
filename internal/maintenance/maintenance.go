package maintenance

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"progit.io/progit/internal/config"
	"progit.io/progit/internal/database"
	"progit.io/progit/internal/git"
	"progit.io/progit/internal/metrics"
)

// Report captures the telemetry of a single maintenance execution cycle.
type Report struct {
	StartTime       time.Time     `json:"start_time"`
	DurationMs      int64         `json:"duration_ms"`
	WALCheckpointed bool          `json:"wal_checkpointed"`
	DBOptimized     bool          `json:"db_optimized"`
	ReposChecked    int           `json:"repos_checked"`
	ReposOptimized  int           `json:"repos_optimized"`
	Errors          []string      `json:"errors,omitempty"`
}

var (
	runnerCtx    context.Context
	runnerCancel context.CancelFunc
	runnerWg     sync.WaitGroup
	runningMu    sync.Mutex
	isExecuting  bool
)

// RunOnce performs an immediate, non-blocking maintenance cycle across database and Git repos.
func RunOnce(cfg *config.Config) (*Report, error) {
	runningMu.Lock()
	if isExecuting {
		runningMu.Unlock()
		return nil, fmt.Errorf("a maintenance cycle is already actively executing")
	}
	isExecuting = true
	runningMu.Unlock()

	defer func() {
		runningMu.Lock()
		isExecuting = false
		runningMu.Unlock()
	}()

	start := time.Now()
	report := &Report{
		StartTime: start,
		Errors:    make([]string, 0),
	}

	// 1. Truncate SQLite WAL file to keep disk space tightly bounded
	if err := database.CheckpointWAL(); err != nil {
		report.Errors = append(report.Errors, fmt.Sprintf("wal checkpoint error: %v", err))
	} else {
		report.WALCheckpointed = true
	}

	// 2. Refresh SQLite query planner index histograms
	if err := database.OptimizeDatabase(); err != nil {
		report.Errors = append(report.Errors, fmt.Sprintf("database optimize error: %v", err))
	} else {
		report.DBOptimized = true
	}

	// 3. Scan repositories and run adaptive GC & commit-graph generation
	repoRoot := cfg.Repository.Root
	if _, err := os.Stat(repoRoot); err == nil {
		entries, err := os.ReadDir(repoRoot)
		if err == nil {
			for _, userDir := range entries {
				if !userDir.IsDir() {
					continue
				}
				userPath := filepath.Join(repoRoot, userDir.Name())
				repos, err := os.ReadDir(userPath)
				if err != nil {
					continue
				}
				for _, r := range repos {
					if !r.IsDir() || !strings.HasSuffix(r.Name(), ".git") {
						continue
					}
					repoPath := filepath.Join(userPath, r.Name())
					report.ReposChecked++

					telemetry, err := git.InspectRepositoryGit(repoPath)
					if err != nil {
						continue
					}

					// Optimize if loose objects > 200 or pack files > 10
					shouldOptimize := telemetry.LooseObjects > 200 || telemetry.PackFiles > 10
					if shouldOptimize {
						if err := git.AutoGC(repoPath); err == nil {
							report.ReposOptimized++
							metrics.RecordGitOperation("gc")
						}
					} else {
						// Lightweight commit-graph refresh
						_ = git.WriteCommitGraph(repoPath)
					}
				}
			}
		}
	}

	report.DurationMs = time.Since(start).Milliseconds()
	return report, nil
}

// Start launches the autonomous background maintenance worker ticker.
func Start(cfg *config.Config, interval time.Duration) {
	if interval <= 0 {
		interval = 1 * time.Hour
	}

	runnerCtx, runnerCancel = context.WithCancel(context.Background())
	runnerWg.Add(1)

	go func() {
		defer runnerWg.Done()
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		log.Printf("[Maintenance] Autonomous Zero-Ops maintenance worker started (interval: %v)", interval)

		for {
			select {
			case <-runnerCtx.Done():
				log.Printf("[Maintenance] Worker gracefully stopping...")
				return
			case <-ticker.C:
				report, err := RunOnce(cfg)
				if err != nil {
					log.Printf("[Maintenance] Cycle skipped: %v", err)
				} else {
					log.Printf("[Maintenance] Completed cycle in %dms (WAL: %t, DBOpt: %t, Checked: %d, Optimized: %d, Errors: %d)",
						report.DurationMs, report.WALCheckpointed, report.DBOptimized,
						report.ReposChecked, report.ReposOptimized, len(report.Errors))
				}
			}
		}
	}()
}

// Stop gracefully shuts down the background maintenance worker.
func Stop() {
	if runnerCancel != nil {
		runnerCancel()
		runnerWg.Wait()
	}
}
