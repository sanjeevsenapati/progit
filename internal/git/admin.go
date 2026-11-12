package git

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// RepoGitTelemetry holds live filesystem and Git object store metrics for a single bare repository.
type RepoGitTelemetry struct {
	DiskSizeBytes int64  `json:"disk_size_bytes"`
	BranchesCount int    `json:"branches_count"`
	TagsCount     int    `json:"tags_count"`
	HeadRef       string `json:"head_ref"`
	LooseObjects  int    `json:"loose_objects"`
	LooseSizeKB   int64  `json:"loose_size_kb"`
	InPackObjects int    `json:"in_pack_objects"`
	PackFiles     int    `json:"pack_files"`
	SizePackKB    int64  `json:"size_pack_kb"`
	PrunePackable int    `json:"prune_packable"`
	GarbageFiles  int    `json:"garbage_files"`
	HasWiki       bool   `json:"has_wiki"`
	WikiSizeBytes int64  `json:"wiki_size_bytes"`
}

// GetGitVersion returns the installed git CLI version string (e.g. "2.47.1").
func GetGitVersion() string {
	out, err := RunGitWithTimeout(5*time.Second, "", "--version")
	if err != nil {
		return "unknown"
	}
	v := strings.TrimSpace(string(out))
	v = strings.TrimPrefix(v, "git version ")
	if v == "" {
		return "unknown"
	}
	return v
}

// DirSizeBytes walks a directory tree and returns total apparent bytes of all regular files.
func DirSizeBytes(dir string) (int64, error) {
	info, err := os.Stat(dir)
	if err != nil {
		return 0, err
	}
	if !info.IsDir() {
		return info.Size(), nil
	}

	var total int64
	err = filepath.WalkDir(dir, func(_ string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if d.Type().IsRegular() {
			if fi, err := d.Info(); err == nil {
				total += fi.Size()
			}
		}
		return nil
	})
	return total, err
}

// InspectRepositoryGit collects object-store statistics, ref counts, and disk usage for a bare Git repository.
func InspectRepositoryGit(repoPath string) (*RepoGitTelemetry, error) {
	if _, err := os.Stat(repoPath); err != nil {
		return nil, fmt.Errorf("repository directory not accessible: %w", err)
	}

	diskSize, _ := DirSizeBytes(repoPath)
	wikiPath := GetWikiRepoPath(repoPath)
	var hasWiki bool
	var wikiSize int64
	if _, err := os.Stat(wikiPath); err == nil {
		hasWiki = true
		wikiSize, _ = DirSizeBytes(wikiPath)
	}

	t := &RepoGitTelemetry{
		DiskSizeBytes: diskSize,
		HeadRef:       GetDefaultBranch(repoPath),
		HasWiki:       hasWiki,
		WikiSizeBytes: wikiSize,
	}

	if branches, err := GetBranches(repoPath); err == nil {
		t.BranchesCount = len(branches)
	}
	if tags, err := GetTags(repoPath); err == nil {
		t.TagsCount = len(tags)
	}

	if out, err := RunGitWithTimeout(15*time.Second, repoPath, "count-objects", "-v"); err == nil {
		for _, line := range strings.Split(string(out), "\n") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) != 2 {
				continue
			}
			key := strings.TrimSpace(parts[0])
			val, err := strconv.ParseInt(strings.TrimSpace(parts[1]), 10, 64)
			if err != nil {
				continue
			}
			switch key {
			case "count":
				t.LooseObjects = int(val)
			case "size":
				t.LooseSizeKB = val
			case "in-pack":
				t.InPackObjects = int(val)
			case "packs":
				t.PackFiles = int(val)
			case "size-pack":
				t.SizePackKB = val
			case "prune-packable":
				t.PrunePackable = int(val)
			case "garbage":
				t.GarbageFiles = int(val)
			}
		}
	}

	return t, nil
}

// RunGitMaintenance executes an administrative Git maintenance command on a bare repository.
func RunGitMaintenance(repoPath, operation string) (string, error) {
	if _, err := os.Stat(repoPath); err != nil {
		return "", fmt.Errorf("repository directory missing on disk: %w", err)
	}

	var args []string
	timeout := 120 * time.Second

	switch operation {
	case "gc":
		args = []string{"gc", "--prune=now"}
	case "repack":
		args = []string{"repack", "-a", "-d"}
	case "prune":
		timeout = 60 * time.Second
		args = []string{"prune"}
	case "fsck":
		args = []string{"fsck", "--no-dangling"}
	case "update_server_info":
		timeout = 30 * time.Second
		args = []string{"update-server-info"}
	default:
		return "", fmt.Errorf("unsupported git maintenance operation: %s", operation)
	}

	out, err := RunGitWithTimeout(timeout, repoPath, args...)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}
