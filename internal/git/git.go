package git

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type Commit struct {
	SHA       string    `json:"sha"`
	ShortSHA  string    `json:"short_sha"`
	Author    string    `json:"author"`
	Email     string    `json:"email"`
	Message   string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
}

type TreeEntry struct {
	Mode string `json:"mode"`
	Type string `json:"type"` // "blob" or "tree"
	SHA  string `json:"sha"`
	Name string `json:"name"`
	Path string `json:"path"`
	Size int64  `json:"size,omitempty"`
}

type Blob struct {
	SHA      string `json:"sha"`
	Size     int64  `json:"size"`
	Content  string `json:"content"`
	IsBinary bool   `json:"is_binary"`
}

type CommitDiff struct {
	Commit *Commit    `json:"commit"`
	Files  []FileDiff `json:"files"`
}

type FileDiff struct {
	OldPath   string `json:"old_path"`
	NewPath   string `json:"new_path"`
	Status    string `json:"status"` // "A", "M", "D", "R"
	Patch     string `json:"patch"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
}

type CompareResult struct {
	BaseBranch string     `json:"base_branch"`
	HeadBranch string     `json:"head_branch"`
	Commits    []Commit   `json:"commits"`
	Files      []FileDiff `json:"files"`
	Mergeable  bool       `json:"mergeable"`
}

// RunGit runs a git command with standard 30s timeout in the specified directory.
func RunGit(dir string, args ...string) ([]byte, error) {
	return RunGitWithTimeout(30*time.Second, dir, args...)
}

// RunGitWithTimeout runs a git command with a specified timeout in the specified directory.
func RunGitWithTimeout(timeout time.Duration, dir string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "git", args...)
	if dir != "" {
		if abs, err := filepath.Abs(dir); err == nil {
			dir = abs
		}
		cmd.Dir = dir
	}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git %s failed: %w (stderr: %s)", strings.Join(args, " "), err, stderr.String())
	}
	return out, nil
}

// SanitizeURL removes sensitive credentials (e.g. passwords, personal access tokens) from a URL.
func SanitizeURL(rawURL string) string {
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.User == nil {
		return rawURL
	}
	parsed.User = url.User("redacted")
	return parsed.String()
}

// AllowLocalRepoImport controls whether local filesystem paths can be imported into repositories.
// By default false for security; can be enabled in test environments or by site administrators.
var AllowLocalRepoImport = false

func isPrivateIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	if ip4 := ip.To4(); ip4 != nil {
		return ip4.IsLoopback() ||
			ip4.IsLinkLocalUnicast() ||
			ip4.IsLinkLocalMulticast() ||
			ip4.IsPrivate() ||
			ip4.IsMulticast() ||
			ip4.IsUnspecified() ||
			ip4.Equal(net.IPv4bcast)
	}
	return ip.IsLoopback() ||
		ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() ||
		ip.IsPrivate() ||
		ip.IsMulticast() ||
		ip.IsUnspecified()
}

func isBlockedHost(host string) bool {
	h := strings.ToLower(strings.TrimSpace(host))
	if h == "" || h == "localhost" || strings.HasSuffix(h, ".localhost") || strings.HasSuffix(h, ".local") {
		return true
	}
	if ip := net.ParseIP(h); ip != nil {
		return isPrivateIP(ip)
	}
	return false
}

// ValidateRepoPath ensures a relative file path is safe to use in repository operations:
// - Rejects null bytes and control characters
// - Normalizes Windows backslashes to forward slashes
// - Cleans path and strips leading/trailing slashes
// - Rejects empty paths, '.', or '..'
// - Rejects any path component matching '.git' (case-insensitive) or internal metadata
// - Rejects any path component starting with '-'
func ValidateRepoPath(filePath string) (string, error) {
	if strings.ContainsRune(filePath, 0) {
		return "", fmt.Errorf("file path contains null byte")
	}
	normalized := strings.ReplaceAll(filePath, "\\", "/")
	// Reject explicit path traversal attempts
	for _, segment := range strings.Split(normalized, "/") {
		if segment == ".." || segment == "." {
			return "", fmt.Errorf("path traversal component not allowed")
		}
	}

	cleaned := path.Clean("/" + normalized)
	cleaned = strings.TrimPrefix(cleaned, "/")

	if cleaned == "" || cleaned == "." || cleaned == ".." {
		return "", fmt.Errorf("invalid file path")
	}

	parts := strings.Split(cleaned, "/")
	for _, p := range parts {
		p = strings.TrimSpace(p)
		pLower := strings.ToLower(p)
		if pLower == ".git" || strings.HasPrefix(pLower, ".git/") || strings.HasPrefix(pLower, ".git\\") {
			return "", fmt.Errorf("file path cannot access .git directory")
		}
		if pLower == ".git" || (strings.HasPrefix(pLower, ".git") && (len(pLower) == 4 || pLower[4] == '.' || pLower[4] == '~')) {
			if pLower != ".gitignore" && pLower != ".gitattributes" && pLower != ".gitmodules" {
				return "", fmt.Errorf("file path cannot access git internal metadata")
			}
		}
		if p == ".." || p == "." {
			return "", fmt.Errorf("path traversal component not allowed")
		}
		if strings.HasPrefix(p, "-") {
			return "", fmt.Errorf("file path cannot start with a hyphen")
		}
	}

	return cleaned, nil
}

var validWikiSlug = regexp.MustCompile(`^[a-zA-Z0-9_\-\.\ ]+$`)

// ValidateWikiSlug ensures wiki page slugs contain no path traversal, control characters, or flag injection.
func ValidateWikiSlug(slug string) (string, error) {
	if strings.ContainsRune(slug, 0) {
		return "", fmt.Errorf("wiki slug contains null byte")
	}
	slug = strings.TrimSpace(slug)
	clean := strings.TrimSuffix(slug, ".md")
	clean = strings.TrimSpace(clean)
	if clean == "" || clean == "." || clean == ".." || strings.HasPrefix(clean, "-") {
		return "", fmt.Errorf("invalid wiki page name")
	}
	if strings.Contains(clean, "/") || strings.Contains(clean, "\\") {
		return "", fmt.Errorf("wiki page name cannot contain path separators")
	}
	if strings.EqualFold(clean, ".git") || strings.HasPrefix(strings.ToLower(clean), ".git") {
		return "", fmt.Errorf("invalid wiki page name")
	}
	if !validWikiSlug.MatchString(clean) {
		return "", fmt.Errorf("wiki page name contains invalid characters")
	}
	return clean, nil
}

// ImportRepository clones a remote Git repository into a bare destination repository.
func ImportRepository(cloneURL, destRepoPath, username, password string) error {
	cloneURL = strings.TrimSpace(cloneURL)
	if cloneURL == "" {
		return errors.New("clone URL cannot be empty")
	}
	if strings.HasPrefix(cloneURL, "-") {
		return errors.New("invalid clone URL")
	}

	if abs, err := filepath.Abs(destRepoPath); err == nil {
		destRepoPath = abs
	}
	if err := os.MkdirAll(filepath.Dir(destRepoPath), 0755); err != nil {
		return err
	}

	targetURL := cloneURL
	username = strings.TrimSpace(username)
	password = strings.TrimSpace(password)

	// Disallow ext:: and file:// protocols, enforce http/https unless local import explicitly permitted
	parsed, parseErr := url.Parse(cloneURL)
	if parseErr == nil && (parsed.Scheme == "http" || parsed.Scheme == "https") {
		if !AllowLocalRepoImport && isBlockedHost(parsed.Hostname()) {
			return errors.New("import from private or localhost addresses is prohibited")
		}
		if username != "" || password != "" {
			if username != "" && password != "" {
				parsed.User = url.UserPassword(username, password)
			} else if username != "" {
				parsed.User = url.User(username)
			} else {
				parsed.User = url.UserPassword(password, "")
			}
			targetURL = parsed.String()
		}
	} else {
		// Not http or https
		if !AllowLocalRepoImport {
			return errors.New("only http and https clone URLs are supported")
		}
		if strings.HasPrefix(cloneURL, "ext::") || strings.Contains(cloneURL, "::") {
			return errors.New("unsupported protocol helper in clone URL")
		}
	}

	// Try cloning with --mirror first to preserve all branches, tags, and commits
	// Always disable protocol.ext to prevent external program execution
	_, err := RunGitWithTimeout(3*time.Minute, "", "-c", "protocol.ext.allow=never", "clone", "--mirror", targetURL, destRepoPath)
	if err != nil {
		// Clean up partial destination and retry with --bare
		_ = os.RemoveAll(destRepoPath)
		_, err = RunGitWithTimeout(3*time.Minute, "", "-c", "protocol.ext.allow=never", "clone", "--bare", targetURL, destRepoPath)
	}

	if err != nil {
		_ = os.RemoveAll(destRepoPath)
		// Mask credentials in error output so tokens/passwords never leak
		errStr := err.Error()
		if password != "" {
			errStr = strings.ReplaceAll(errStr, password, "******")
		}
		if username != "" {
			errStr = strings.ReplaceAll(errStr, username, "******")
		}
		return errors.New(errStr)
	}

	// Update server info for HTTP dumb transport compatibility
	_, _ = RunGit(destRepoPath, "update-server-info")
	return nil
}

// GetDefaultBranch returns the default branch for a bare repository.
func GetDefaultBranch(repoPath string) string {
	out, err := RunGit(repoPath, "symbolic-ref", "--short", "HEAD")
	if err == nil {
		branch := strings.TrimSpace(string(out))
		if branch != "" {
			return branch
		}
	}
	branches, err := GetBranches(repoPath)
	if err == nil && len(branches) > 0 {
		for _, b := range branches {
			if b == "main" || b == "master" {
				return b
			}
		}
		return branches[0]
	}
	return "main"
}

// InitBareRepository initializes a bare Git repository with the given default branch.
func InitBareRepository(repoPath string, defaultBranch string) error {
	if defaultBranch == "" {
		defaultBranch = "main"
	}
	if abs, err := filepath.Abs(repoPath); err == nil {
		repoPath = abs
	}
	if err := os.MkdirAll(repoPath, 0755); err != nil {
		return err
	}
	_, err := RunGit("", "init", "--bare", "--initial-branch="+defaultBranch, repoPath)
	return err
}

// ForkRepository clones a bare source repository to a new bare destination repository.
func ForkRepository(srcRepoPath, destRepoPath string) error {
	if abs, err := filepath.Abs(srcRepoPath); err == nil {
		srcRepoPath = abs
	}
	if abs, err := filepath.Abs(destRepoPath); err == nil {
		destRepoPath = abs
	}
	if err := os.MkdirAll(filepath.Dir(destRepoPath), 0755); err != nil {
		return err
	}
	// If source repository doesn't exist on disk yet, initialize a bare destination repo
	if _, err := os.Stat(srcRepoPath); err != nil {
		return InitBareRepository(destRepoPath, "main")
	}
	_, err := RunGit("", "clone", "--bare", srcRepoPath, destRepoPath)
	return err
}

// InitRepositoryWithReadme initializes a bare repository with an initial commit containing a README.md.
func InitRepositoryWithReadme(repoPath, repoName, description, defaultBranch, authorName, authorEmail string) error {
	if defaultBranch == "" {
		defaultBranch = "main"
	}
	if abs, err := filepath.Abs(repoPath); err == nil {
		repoPath = abs
	}

	tempDir, err := os.MkdirTemp("", "progit-init-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tempDir)

	if _, err := RunGit("", "init", "--initial-branch="+defaultBranch, tempDir); err != nil {
		return err
	}

	readmeContent := fmt.Sprintf("# %s\n\n%s\n", repoName, description)
	if err := os.WriteFile(filepath.Join(tempDir, "README.md"), []byte(readmeContent), 0644); err != nil {
		return err
	}

	if _, err := RunGit(tempDir, "add", "README.md"); err != nil {
		return err
	}

	if authorName == "" {
		authorName = "ProGit"
	}
	if authorEmail == "" {
		authorEmail = "progit@localhost"
	}

	authorStr := fmt.Sprintf("%s <%s>", authorName, authorEmail)
	if _, err := RunGit(tempDir, "-c", "user.name="+authorName, "-c", "user.email="+authorEmail, "commit", "-m", "Initial commit", "--author="+authorStr); err != nil {
		return err
	}

	if err := InitBareRepository(repoPath, defaultBranch); err != nil {
		return err
	}

	if _, err := RunGit(tempDir, "remote", "add", "origin", repoPath); err != nil {
		return err
	}

	if _, err := RunGit(tempDir, "push", "-u", "origin", defaultBranch); err != nil {
		return err
	}

	return nil
}

// BranchDetail holds metadata for a git branch.
type BranchDetail struct {
	Name          string `json:"name"`
	IsDefault     bool   `json:"is_default"`
	CommitSHA     string `json:"commit_sha"`
	CommitMessage string `json:"commit_message"`
	AuthorName    string `json:"author_name"`
	CommitTime    int64  `json:"commit_time"`
}

// GetBranches returns all branch names in the bare repository.
func GetBranches(repoPath string) ([]string, error) {
	out, err := RunGit(repoPath, "for-each-ref", "--format=%(refname:short)", "refs/heads/")
	if err != nil {
		return nil, err
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	branches := []string{}
	for _, l := range lines {
		l = strings.TrimSpace(l)
		if l != "" {
			branches = append(branches, l)
		}
	}
	return branches, nil
}

// GetBranchDetails returns rich metadata for all branches.
func GetBranchDetails(repoPath, defaultBranch string) ([]BranchDetail, error) {
	format := "%(refname:short)|%(objectname)|%(subject)|%(authorname)|%(authordate:unix)"
	out, err := RunGit(repoPath, "for-each-ref", fmt.Sprintf("--format=%s", format), "refs/heads/")
	if err != nil {
		return nil, err
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	details := []BranchDetail{}
	for _, l := range lines {
		l = strings.TrimSpace(l)
		if l == "" {
			continue
		}
		parts := strings.Split(l, "|")
		if len(parts) < 5 {
			continue
		}
		var ts int64
		_, _ = fmt.Sscanf(parts[4], "%d", &ts)
		name := parts[0]
		isDefault := (name == defaultBranch) || (defaultBranch == "" && (name == "main" || name == "master"))
		details = append(details, BranchDetail{
			Name:          name,
			IsDefault:     isDefault,
			CommitSHA:     parts[1],
			CommitMessage: parts[2],
			AuthorName:    parts[3],
			CommitTime:    ts,
		})
	}
	return details, nil
}

// CreateBranch creates a new branch pointing to baseRef.
func CreateBranch(repoPath, branchName, baseRef string) error {
	if strings.HasPrefix(branchName, "-") || strings.HasPrefix(baseRef, "-") {
		return fmt.Errorf("invalid branch name or base ref")
	}
	_, err := RunGit(repoPath, "branch", "--", branchName, baseRef)
	return err
}

// DeleteBranch deletes a branch.
func DeleteBranch(repoPath, branchName string) error {
	if strings.HasPrefix(branchName, "-") {
		return fmt.Errorf("invalid branch name")
	}
	_, err := RunGit(repoPath, "branch", "-D", "--", branchName)
	return err
}

// GetTags returns all tags in the repository.
func GetTags(repoPath string) ([]string, error) {
	out, err := RunGit(repoPath, "tag", "-l")
	if err != nil {
		return nil, err
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	var tags []string
	for _, l := range lines {
		l = strings.TrimSpace(l)
		if l != "" {
			tags = append(tags, l)
		}
	}
	return tags, nil
}

// GetCommits returns a slice of commits for the given ref.
func GetCommits(repoPath, ref string, limit, offset int) ([]Commit, error) {
	if ref == "" {
		ref = "HEAD"
	}
	if strings.HasPrefix(ref, "-") {
		return []Commit{}, fmt.Errorf("invalid ref")
	}
	if limit <= 0 {
		limit = 30
	}

	format := "%H%x1f%an%x1f%ae%x1f%at%x1f%s"
	out, err := RunGit(repoPath, "log", fmt.Sprintf("--skip=%d", offset), fmt.Sprintf("-n%d", limit), fmt.Sprintf("--pretty=format:%s", format), "--end-of-options", ref)
	if err != nil {
		return []Commit{}, nil // empty if no commits yet
	}

	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	var commits []Commit
	for _, l := range lines {
		if strings.TrimSpace(l) == "" {
			continue
		}
		parts := strings.Split(l, "\x1f")
		if len(parts) < 5 {
			continue
		}
		sha := parts[0]
		shortSHA := sha
		if len(shortSHA) > 7 {
			shortSHA = shortSHA[:7]
		}
		sec, _ := strconv.ParseInt(parts[3], 10, 64)
		commits = append(commits, Commit{
			SHA:       sha,
			ShortSHA:  shortSHA,
			Author:    parts[1],
			Email:     parts[2],
			Timestamp: time.Unix(sec, 0),
			Message:   parts[4],
		})
	}
	return commits, nil
}

// CountCommits returns the total number of commits reachable from ref.
func CountCommits(repoPath, ref string) int {
	if ref == "" {
		ref = "HEAD"
	}
	if strings.HasPrefix(ref, "-") {
		return 0
	}
	out, err := RunGit(repoPath, "rev-list", "--count", "--end-of-options", ref)
	if err != nil {
		return 0
	}
	cnt, _ := strconv.Atoi(strings.TrimSpace(string(out)))
	return cnt
}

// GetTree lists files and subdirectories at the given path and ref.
func GetTree(repoPath, ref, subpath string) ([]TreeEntry, error) {
	if ref == "" {
		ref = "HEAD"
	}
	if strings.HasPrefix(ref, "-") {
		return []TreeEntry{}, fmt.Errorf("invalid ref")
	}

	target := ref
	if subpath != "" {
		target = fmt.Sprintf("%s:%s", ref, subpath)
	}

	out, err := RunGit(repoPath, "ls-tree", "-l", "--", target)
	if err != nil {
		return []TreeEntry{}, nil
	}

	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	var entries []TreeEntry
	for _, l := range lines {
		if strings.TrimSpace(l) == "" {
			continue
		}
		// Format: <mode> <type> <object> <size>\t<file>
		tabParts := strings.SplitN(l, "\t", 2)
		if len(tabParts) != 2 {
			continue
		}
		metaParts := strings.Fields(tabParts[0])
		if len(metaParts) < 3 {
			continue
		}
		mode := metaParts[0]
		entryType := metaParts[1]
		sha := metaParts[2]
		var size int64
		if len(metaParts) >= 4 && metaParts[3] != "-" {
			size, _ = strconv.ParseInt(metaParts[3], 10, 64)
		}
		name := tabParts[1]
		fullPath := name
		if subpath != "" {
			fullPath = filepath.Join(subpath, name)
		}

		entries = append(entries, TreeEntry{
			Mode: mode,
			Type: entryType,
			SHA:  sha,
			Name: name,
			Path: fullPath,
			Size: size,
		})
	}
	return entries, nil
}

// GetBlob returns the content of a file at the given ref and path.
func GetBlob(repoPath, ref, filePath string) (*Blob, error) {
	if ref == "" {
		ref = "HEAD"
	}
	if strings.HasPrefix(ref, "-") {
		return nil, fmt.Errorf("invalid ref")
	}
	target := fmt.Sprintf("%s:%s", ref, filePath)

	out, err := RunGit(repoPath, "cat-file", "-p", "--", target)
	if err != nil {
		return nil, err
	}

	isBinary := false
	if len(out) > 8000 {
		for _, b := range out[:8000] {
			if b == 0 {
				isBinary = true
				break
			}
		}
	} else {
		for _, b := range out {
			if b == 0 {
				isBinary = true
				break
			}
		}
	}

	content := ""
	if !isBinary {
		content = string(out)
	}

	return &Blob{
		Size:     int64(len(out)),
		Content:  content,
		IsBinary: isBinary,
	}, nil
}

// GetRaw returns raw bytes of a file.
func GetRaw(repoPath, ref, filePath string) ([]byte, error) {
	if ref == "" {
		ref = "HEAD"
	}
	if strings.HasPrefix(ref, "-") {
		return nil, fmt.Errorf("invalid ref")
	}
	target := fmt.Sprintf("%s:%s", ref, filePath)
	return RunGit(repoPath, "cat-file", "-p", "--", target)
}

// GetCommitDiff returns the commit diff for a specific commit SHA.
func GetCommitDiff(repoPath, sha string) (*CommitDiff, error) {
	if strings.HasPrefix(sha, "-") {
		return nil, fmt.Errorf("invalid commit sha")
	}
	commits, err := GetCommits(repoPath, sha, 1, 0)
	var c *Commit
	if err == nil && len(commits) > 0 {
		c = &commits[0]
	}

	out, err := RunGit(repoPath, "diff-tree", "-r", "-p", "--root", "--end-of-options", sha)
	if err != nil {
		return nil, err
	}

	files := parseDiffOutput(string(out))
	return &CommitDiff{
		Commit: c,
		Files:  files,
	}, nil
}

// GetBranchDiff compares baseBranch and headBranch.
func GetBranchDiff(repoPath, baseBranch, headBranch string) (*CompareResult, error) {
	if strings.HasPrefix(baseBranch, "-") || strings.HasPrefix(headBranch, "-") {
		return nil, fmt.Errorf("invalid branch name")
	}
	// Find merge base
	mbOut, err := RunGit(repoPath, "merge-base", "--", baseBranch, headBranch)
	mergeBase := strings.TrimSpace(string(mbOut))
	mergeable := err == nil && mergeBase != ""

	// Get commits between base and head
	commitRange := fmt.Sprintf("%s..%s", baseBranch, headBranch)
	commits, _ := GetCommits(repoPath, commitRange, 100, 0)

	// Get unified diff
	diffOut, _ := RunGit(repoPath, "diff", "-u", "--", baseBranch, headBranch)
	files := parseDiffOutput(string(diffOut))

	return &CompareResult{
		BaseBranch: baseBranch,
		HeadBranch: headBranch,
		Commits:    commits,
		Files:      files,
		Mergeable:  mergeable,
	}, nil
}

// MergeBranches performs a real Git merge (merge commit, squash, or rebase) inside a temporary working tree.
func MergeBranches(repoPath, baseBranch, headBranch, mergeStyle, message, authorName, authorEmail string) (string, error) {
	if abs, err := filepath.Abs(repoPath); err == nil {
		repoPath = abs
	}
	if strings.HasPrefix(baseBranch, "-") || strings.HasPrefix(headBranch, "-") {
		return "", fmt.Errorf("invalid branch name")
	}

	tempDir, err := os.MkdirTemp("", "progit-merge-*")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(tempDir)

	// Clone bare repo to temp working directory
	if _, err := RunGit("", "clone", "--branch", baseBranch, repoPath, tempDir); err != nil {
		return "", fmt.Errorf("clone base branch: %w", err)
	}

	// Ensure headBranch exists locally tracking origin/headBranch
	if _, err := RunGit(tempDir, "checkout", "-B", headBranch, "origin/"+headBranch); err != nil {
		if _, err := RunGit(tempDir, "fetch", "origin", headBranch+":"+headBranch); err != nil {
			return "", fmt.Errorf("fetch head branch: %w", err)
		}
	}
	// Switch back to baseBranch
	if _, err := RunGit(tempDir, "checkout", baseBranch); err != nil {
		return "", fmt.Errorf("checkout base branch: %w", err)
	}

	authorStr := fmt.Sprintf("%s <%s>", authorName, authorEmail)
	gitConfigArgs := []string{
		"-c", "core.hooksPath=",
		"-c", "user.name=" + authorName,
		"-c", "user.email=" + authorEmail,
	}

	switch mergeStyle {
	case "squash":
		if _, err := RunGit(tempDir, "merge", "--squash", headBranch); err != nil {
			return "", fmt.Errorf("squash merge failed: %w", err)
		}
		if message == "" {
			message = fmt.Sprintf("Squash and merge branch '%s' into '%s'", headBranch, baseBranch)
		}
		args := append(gitConfigArgs, "commit", "-m", message, "--author="+authorStr)
		if _, err := RunGit(tempDir, args...); err != nil {
			return "", fmt.Errorf("commit squash: %w", err)
		}
	case "rebase":
		if _, err := RunGit(tempDir, "checkout", headBranch); err != nil {
			return "", fmt.Errorf("checkout head branch: %w", err)
		}
		if _, err := RunGit(tempDir, "rebase", baseBranch); err != nil {
			return "", fmt.Errorf("rebase failed: %w", err)
		}
		if _, err := RunGit(tempDir, "checkout", baseBranch); err != nil {
			return "", fmt.Errorf("checkout base branch: %w", err)
		}
		if _, err := RunGit(tempDir, "merge", "--ff-only", headBranch); err != nil {
			return "", fmt.Errorf("fast-forward after rebase: %w", err)
		}
	default: // "merge" (standard merge commit)
		if message == "" {
			message = fmt.Sprintf("Merge branch '%s' into '%s'", headBranch, baseBranch)
		}
		args := append(gitConfigArgs, "merge", "--no-ff", "-m", message, headBranch)
		if _, err := RunGit(tempDir, args...); err != nil {
			return "", fmt.Errorf("merge commit failed: %w", err)
		}
	}

	// Push back to bare repository
	if _, err := RunGit(tempDir, "push", "origin", baseBranch); err != nil {
		return "", fmt.Errorf("push merged base branch: %w", err)
	}

	// Get latest commit SHA on base branch
	shaOut, err := RunGit(repoPath, "rev-parse", baseBranch)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(shaOut)), nil
}

func parseDiffOutput(diffText string) []FileDiff {
	var files []FileDiff
	chunks := strings.Split(diffText, "diff --git ")
	for _, chunk := range chunks {
		if strings.TrimSpace(chunk) == "" {
			continue
		}
		lines := strings.Split(chunk, "\n")
		header := lines[0] // e.g. "a/foo.go b/foo.go"
		parts := strings.Split(header, " ")
		oldPath := ""
		newPath := ""
		if len(parts) >= 2 {
			oldPath = strings.TrimPrefix(parts[0], "a/")
			newPath = strings.TrimPrefix(parts[1], "b/")
		}

		status := "M"
		patch := "diff --git " + chunk
		adds := 0
		dels := 0
		for _, line := range lines {
			if strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "+++") {
				adds++
			} else if strings.HasPrefix(line, "-") && !strings.HasPrefix(line, "---") {
				dels++
			} else if strings.HasPrefix(line, "new file mode") {
				status = "A"
			} else if strings.HasPrefix(line, "deleted file mode") {
				status = "D"
			}
		}

		files = append(files, FileDiff{
			OldPath:   oldPath,
			NewPath:   newPath,
			Status:    status,
			Patch:     patch,
			Additions: adds,
			Deletions: dels,
		})
	}
	return files
}

// Wiki Page Types

type WikiPageMeta struct {
	Slug       string    `json:"slug"`
	Title      string    `json:"title"`
	LastCommit string    `json:"last_commit,omitempty"`
	Author     string    `json:"author,omitempty"`
	UpdatedAt  time.Time `json:"updated_at,omitempty"`
}

type WikiPage struct {
	Slug      string    `json:"slug"`
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	Author    string    `json:"author"`
	Email     string    `json:"email"`
	CommitSHA string    `json:"commit_sha"`
	UpdatedAt time.Time `json:"updated_at"`
}

// GetWikiRepoPath returns the path to the wiki bare repository corresponding to repoPath.
func GetWikiRepoPath(repoPath string) string {
	if abs, err := filepath.Abs(repoPath); err == nil {
		repoPath = abs
	}
	return strings.TrimSuffix(repoPath, ".git") + ".wiki.git"
}

// InitWikiRepository initializes a bare repository for wiki documentation with an initial Home.md.
func InitWikiRepository(wikiRepoPath, repoName, authorName, authorEmail string) error {
	if abs, err := filepath.Abs(wikiRepoPath); err == nil {
		wikiRepoPath = abs
	}
	if _, err := os.Stat(wikiRepoPath); err == nil {
		return nil // already exists
	}

	tempDir, err := os.MkdirTemp("", "progit-wiki-init-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tempDir)

	if _, err := RunGit("", "init", "--initial-branch=main", tempDir); err != nil {
		return err
	}

	welcomeContent := fmt.Sprintf("# Welcome to the %s Wiki!\n\nThis is the official project documentation. Feel free to create and edit pages.\n", repoName)
	if err := os.WriteFile(filepath.Join(tempDir, "Home.md"), []byte(welcomeContent), 0644); err != nil {
		return err
	}

	if _, err := RunGit(tempDir, "add", "Home.md"); err != nil {
		return err
	}

	if authorName == "" {
		authorName = "ProGit"
	}
	if authorEmail == "" {
		authorEmail = "wiki@progit.io"
	}
	commitArgs := []string{
		"-c", "user.name=" + authorName,
		"-c", "user.email=" + authorEmail,
		"commit", "-m", "Initial wiki page Home.md",
	}
	if _, err := RunGit(tempDir, commitArgs...); err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(wikiRepoPath), 0755); err != nil {
		return err
	}

	if _, err := RunGit("", "clone", "--bare", tempDir, wikiRepoPath); err != nil {
		return err
	}

	return nil
}

// ListWikiPages returns all wiki pages found in the wiki repository.
func ListWikiPages(wikiRepoPath string) ([]WikiPageMeta, error) {
	if abs, err := filepath.Abs(wikiRepoPath); err == nil {
		wikiRepoPath = abs
	}
	if _, err := os.Stat(wikiRepoPath); os.IsNotExist(err) {
		return []WikiPageMeta{}, nil
	}

	entries, err := GetTree(wikiRepoPath, "main", "")
	if err != nil {
		return []WikiPageMeta{}, nil
	}

	var pages []WikiPageMeta
	for _, e := range entries {
		if strings.HasSuffix(e.Name, ".md") {
			slug := strings.TrimSuffix(e.Name, ".md")
			title := strings.ReplaceAll(slug, "-", " ")
			commits, _ := GetCommits(wikiRepoPath, "main", 1, 0)
			meta := WikiPageMeta{
				Slug:  slug,
				Title: title,
			}
			if len(commits) > 0 {
				meta.LastCommit = commits[0].ShortSHA
				meta.Author = commits[0].Author
				meta.UpdatedAt = commits[0].Timestamp
			}
			pages = append(pages, meta)
		}
	}
	return pages, nil
}

// GetWikiPage loads a specific wiki page by slug.
func GetWikiPage(wikiRepoPath, slug string) (*WikiPage, error) {
	if abs, err := filepath.Abs(wikiRepoPath); err == nil {
		wikiRepoPath = abs
	}
	if slug == "" {
		slug = "Home"
	}
	cleanSlug := strings.TrimSuffix(slug, ".md")
	fileName := cleanSlug + ".md"

	blob, err := GetBlob(wikiRepoPath, "main", fileName)
	if (err != nil || blob == nil) && (strings.EqualFold(cleanSlug, "home") || strings.EqualFold(cleanSlug, "readme")) {
		if strings.EqualFold(cleanSlug, "home") {
			blob, err = GetBlob(wikiRepoPath, "main", "README.md")
		} else {
			blob, err = GetBlob(wikiRepoPath, "main", "Home.md")
		}
	}
	if err != nil || blob == nil {
		return nil, fmt.Errorf("wiki page '%s' not found", cleanSlug)
	}

	commits, _ := GetCommits(wikiRepoPath, "main", 1, 0)
	author := "ProGit"
	email := "wiki@progit.io"
	sha := ""
	updatedAt := time.Now()
	if len(commits) > 0 {
		author = commits[0].Author
		email = commits[0].Email
		sha = commits[0].SHA
		updatedAt = commits[0].Timestamp
	}

	title := strings.ReplaceAll(cleanSlug, "-", " ")
	return &WikiPage{
		Slug:      cleanSlug,
		Title:     title,
		Content:   blob.Content,
		Author:    author,
		Email:     email,
		CommitSHA: sha,
		UpdatedAt: updatedAt,
	}, nil
}

// SaveWikiPage creates or updates a wiki page with a real Git commit.
func SaveWikiPage(wikiRepoPath, repoName, slug, title, content, authorName, authorEmail, message string) error {
	if abs, err := filepath.Abs(wikiRepoPath); err == nil {
		wikiRepoPath = abs
	}

	cleanSlug, err := ValidateWikiSlug(slug)
	if err != nil {
		return err
	}
	cleanSlug = strings.ReplaceAll(cleanSlug, " ", "-")
	fileName := cleanSlug + ".md"

	if authorName == "" {
		authorName = "ProGit"
	}
	if authorEmail == "" {
		authorEmail = "wiki@progit.io"
	}
	if message == "" {
		message = fmt.Sprintf("Initial wiki page %s", cleanSlug)
	}

	// If wiki repository does not exist yet, initialize it directly with the first page
	if _, err := os.Stat(wikiRepoPath); os.IsNotExist(err) {
		tempDir, err := os.MkdirTemp("", "progit-wiki-init-*")
		if err != nil {
			return err
		}
		defer os.RemoveAll(tempDir)

		if _, err := RunGit("", "init", "--initial-branch=main", tempDir); err != nil {
			return err
		}

		filePath := filepath.Join(tempDir, fileName)
		if err := os.WriteFile(filePath, []byte(content), 0644); err != nil {
			return err
		}

		if _, err := RunGit(tempDir, "add", "--", fileName); err != nil {
			return err
		}

		commitArgs := []string{
			"-c", "core.hooksPath=",
			"-c", "user.name=" + authorName,
			"-c", "user.email=" + authorEmail,
			"commit", "-m", message,
		}
		if _, err := RunGit(tempDir, commitArgs...); err != nil {
			return err
		}

		if err := os.MkdirAll(filepath.Dir(wikiRepoPath), 0755); err != nil {
			return err
		}

		if _, err := RunGit("", "clone", "--bare", tempDir, wikiRepoPath); err != nil {
			return err
		}

		return nil
	}

	tempDir, err := os.MkdirTemp("", "progit-wiki-work-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tempDir)

	if _, err := RunGit("", "clone", wikiRepoPath, tempDir); err != nil {
		return fmt.Errorf("clone wiki repository failed: %w", err)
	}

	filePath := filepath.Join(tempDir, fileName)
	if err := os.WriteFile(filePath, []byte(content), 0644); err != nil {
		return err
	}

	if _, err := RunGit(tempDir, "add", "--", fileName); err != nil {
		return err
	}

	authorStr := fmt.Sprintf("%s <%s>", authorName, authorEmail)
	gitConfigArgs := []string{
		"-c", "core.hooksPath=",
		"-c", "user.name=" + authorName,
		"-c", "user.email=" + authorEmail,
	}

	commitArgs := append(gitConfigArgs, "commit", "-m", message, "--author="+authorStr)
	if _, err := RunGit(tempDir, commitArgs...); err != nil {
		return fmt.Errorf("commit wiki page failed: %w", err)
	}

	if _, err := RunGit(tempDir, "push", "origin", "main"); err != nil {
		return fmt.Errorf("push wiki commit failed: %w", err)
	}

	return nil
}

// DeleteWikiPage deletes a wiki page and commits the removal.
func DeleteWikiPage(wikiRepoPath, slug, authorName, authorEmail string) error {
	if abs, err := filepath.Abs(wikiRepoPath); err == nil {
		wikiRepoPath = abs
	}
	if _, err := os.Stat(wikiRepoPath); os.IsNotExist(err) {
		return fmt.Errorf("wiki repository does not exist")
	}

	cleanSlug, err := ValidateWikiSlug(slug)
	if err != nil {
		return err
	}
	cleanSlug = strings.ReplaceAll(cleanSlug, " ", "-")
	fileName := cleanSlug + ".md"

	tempDir, err := os.MkdirTemp("", "progit-wiki-rm-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tempDir)

	if _, err := RunGit("", "clone", wikiRepoPath, tempDir); err != nil {
		return fmt.Errorf("clone wiki repository failed: %w", err)
	}

	targetFile := filepath.Join(tempDir, fileName)
	if _, err := os.Stat(targetFile); os.IsNotExist(err) {
		return fmt.Errorf("page '%s' does not exist", cleanSlug)
	}

	if _, err := RunGit(tempDir, "rm", "--", fileName); err != nil {
		return err
	}

	message := fmt.Sprintf("Delete page %s", cleanSlug)
	authorStr := fmt.Sprintf("%s <%s>", authorName, authorEmail)
	gitConfigArgs := []string{
		"-c", "core.hooksPath=",
		"-c", "user.name=" + authorName,
		"-c", "user.email=" + authorEmail,
	}

	commitArgs := append(gitConfigArgs, "commit", "-m", message, "--author="+authorStr)
	if _, err := RunGit(tempDir, commitArgs...); err != nil {
		return fmt.Errorf("commit page deletion failed: %w", err)
	}

	if _, err := RunGit(tempDir, "push", "origin", "main"); err != nil {
		return fmt.Errorf("push deletion failed: %w", err)
	}

	return nil
}

// UploadedFile represents a file payload with its target relative path and binary contents.
type UploadedFile struct {
	Path string
	Data []byte
}

// SaveFile creates or updates a file directly in the repository and commits it.
func SaveFile(repoPath, branch, filePath, content, authorName, authorEmail, message, newBranch string) (string, string, error) {
	if abs, err := filepath.Abs(repoPath); err == nil {
		repoPath = abs
	}
	if branch == "" {
		branch = "main"
	}
	if strings.HasPrefix(branch, "-") || strings.HasPrefix(newBranch, "-") {
		return "", "", fmt.Errorf("invalid branch name")
	}
	targetBranch := branch
	if newBranch != "" && newBranch != branch {
		targetBranch = newBranch
	}

	cleanFilePath, err := ValidateRepoPath(filePath)
	if err != nil {
		return "", "", err
	}

	tempDir, err := os.MkdirTemp("", "progit-file-edit-*")
	if err != nil {
		return "", "", err
	}
	defer os.RemoveAll(tempDir)

	branches, _ := GetBranches(repoPath)
	hasBranches := len(branches) > 0

	if hasBranches {
		cloneArgs := []string{"clone", "--branch", branch, repoPath, tempDir}
		if _, err := RunGit("", cloneArgs...); err != nil {
			if _, err := RunGit("", "clone", repoPath, tempDir); err != nil {
				return "", "", fmt.Errorf("clone failed: %w", err)
			}
		}
	} else {
		if _, err := RunGit("", "init", "--initial-branch="+branch, tempDir); err != nil {
			return "", "", fmt.Errorf("init temp repo failed: %w", err)
		}
		if _, err := RunGit(tempDir, "remote", "add", "origin", repoPath); err != nil {
			return "", "", fmt.Errorf("remote add failed: %w", err)
		}
	}

	if newBranch != "" && newBranch != branch {
		if _, err := RunGit(tempDir, "checkout", "-b", newBranch); err != nil {
			return "", "", fmt.Errorf("create branch %s failed: %w", newBranch, err)
		}
	}

	destPath := filepath.Join(tempDir, filepath.FromSlash(cleanFilePath))
	cleanTemp := filepath.Clean(tempDir)
	cleanDest := filepath.Clean(destPath)
	if !strings.HasPrefix(cleanDest, cleanTemp+string(filepath.Separator)) {
		return "", "", fmt.Errorf("file path escapes repository boundary")
	}

	if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
		return "", "", fmt.Errorf("create directory failed: %w", err)
	}

	if err := os.WriteFile(destPath, []byte(content), 0644); err != nil {
		return "", "", fmt.Errorf("write file failed: %w", err)
	}

	if _, err := RunGit(tempDir, "add", "--", filepath.FromSlash(cleanFilePath)); err != nil {
		return "", "", fmt.Errorf("git add failed: %w", err)
	}

	if message == "" {
		message = fmt.Sprintf("Update %s", cleanFilePath)
	}
	if authorName == "" {
		authorName = "ProGit"
	}
	if authorEmail == "" {
		authorEmail = "git@progit.io"
	}
	authorStr := fmt.Sprintf("%s <%s>", authorName, authorEmail)
	gitConfigArgs := []string{
		"-c", "core.hooksPath=",
		"-c", "user.name=" + authorName,
		"-c", "user.email=" + authorEmail,
	}

	commitArgs := append(gitConfigArgs, "commit", "-m", message, "--author="+authorStr)
	if _, err := RunGit(tempDir, commitArgs...); err != nil {
		return "", "", fmt.Errorf("git commit failed: %w", err)
	}

	if _, err := RunGit(tempDir, "push", "origin", targetBranch); err != nil {
		return "", "", fmt.Errorf("git push failed: %w", err)
	}

	shaOut, _ := RunGit(tempDir, "rev-parse", "HEAD")
	sha := strings.TrimSpace(string(shaOut))

	return sha, targetBranch, nil
}

// DeleteFile deletes a file directly from the repository and commits the removal.
func DeleteFile(repoPath, branch, filePath, authorName, authorEmail, message, newBranch string) (string, string, error) {
	if abs, err := filepath.Abs(repoPath); err == nil {
		repoPath = abs
	}
	if branch == "" {
		branch = "main"
	}
	if strings.HasPrefix(branch, "-") || strings.HasPrefix(newBranch, "-") {
		return "", "", fmt.Errorf("invalid branch name")
	}
	targetBranch := branch
	if newBranch != "" && newBranch != branch {
		targetBranch = newBranch
	}

	cleanFilePath, err := ValidateRepoPath(filePath)
	if err != nil {
		return "", "", err
	}

	tempDir, err := os.MkdirTemp("", "progit-file-delete-*")
	if err != nil {
		return "", "", err
	}
	defer os.RemoveAll(tempDir)

	cloneArgs := []string{"clone", "--branch", branch, repoPath, tempDir}
	if _, err := RunGit("", cloneArgs...); err != nil {
		return "", "", fmt.Errorf("clone failed: %w", err)
	}

	if newBranch != "" && newBranch != branch {
		if _, err := RunGit(tempDir, "checkout", "-b", newBranch); err != nil {
			return "", "", fmt.Errorf("create branch %s failed: %w", newBranch, err)
		}
	}

	destPath := filepath.Join(tempDir, filepath.FromSlash(cleanFilePath))
	cleanTemp := filepath.Clean(tempDir)
	cleanDest := filepath.Clean(destPath)
	if !strings.HasPrefix(cleanDest, cleanTemp+string(filepath.Separator)) {
		return "", "", fmt.Errorf("file path escapes repository boundary")
	}
	if _, err := os.Stat(destPath); os.IsNotExist(err) {
		return "", "", fmt.Errorf("file '%s' does not exist", cleanFilePath)
	}

	if _, err := RunGit(tempDir, "rm", "--", filepath.FromSlash(cleanFilePath)); err != nil {
		return "", "", fmt.Errorf("git rm failed: %w", err)
	}

	if message == "" {
		message = fmt.Sprintf("Delete %s", cleanFilePath)
	}
	if authorName == "" {
		authorName = "ProGit"
	}
	if authorEmail == "" {
		authorEmail = "git@progit.io"
	}
	authorStr := fmt.Sprintf("%s <%s>", authorName, authorEmail)
	gitConfigArgs := []string{
		"-c", "core.hooksPath=",
		"-c", "user.name=" + authorName,
		"-c", "user.email=" + authorEmail,
	}

	commitArgs := append(gitConfigArgs, "commit", "-m", message, "--author="+authorStr)
	if _, err := RunGit(tempDir, commitArgs...); err != nil {
		return "", "", fmt.Errorf("git commit failed: %w", err)
	}

	if _, err := RunGit(tempDir, "push", "origin", targetBranch); err != nil {
		return "", "", fmt.Errorf("git push failed: %w", err)
	}

	shaOut, _ := RunGit(tempDir, "rev-parse", "HEAD")
	sha := strings.TrimSpace(string(shaOut))

	return sha, targetBranch, nil
}

// UploadFiles commits multiple files / directories into the repository in a single atomic commit.
func UploadFiles(repoPath, branch, baseSubPath string, files []UploadedFile, authorName, authorEmail, message, newBranch string) (string, string, error) {
	if len(files) == 0 {
		return "", "", fmt.Errorf("no files to upload")
	}
	if abs, err := filepath.Abs(repoPath); err == nil {
		repoPath = abs
	}
	if branch == "" {
		branch = "main"
	}
	if strings.HasPrefix(branch, "-") || strings.HasPrefix(newBranch, "-") {
		return "", "", fmt.Errorf("invalid branch name")
	}
	targetBranch := branch
	if newBranch != "" && newBranch != branch {
		targetBranch = newBranch
	}

	cleanBasePath := ""
	if baseSubPath != "" {
		cbp, err := ValidateRepoPath(baseSubPath)
		if err != nil {
			return "", "", fmt.Errorf("invalid base path: %w", err)
		}
		cleanBasePath = cbp
	}

	tempDir, err := os.MkdirTemp("", "progit-upload-*")
	if err != nil {
		return "", "", err
	}
	defer os.RemoveAll(tempDir)

	branches, _ := GetBranches(repoPath)
	hasBranches := len(branches) > 0

	if hasBranches {
		cloneArgs := []string{"clone", "--branch", branch, repoPath, tempDir}
		if _, err := RunGit("", cloneArgs...); err != nil {
			if _, err := RunGit("", "clone", repoPath, tempDir); err != nil {
				return "", "", fmt.Errorf("clone failed: %w", err)
			}
		}
	} else {
		if _, err := RunGit("", "init", "--initial-branch="+branch, tempDir); err != nil {
			return "", "", fmt.Errorf("init temp repo failed: %w", err)
		}
		if _, err := RunGit(tempDir, "remote", "add", "origin", repoPath); err != nil {
			return "", "", fmt.Errorf("remote add failed: %w", err)
		}
	}

	if newBranch != "" && newBranch != branch {
		if _, err := RunGit(tempDir, "checkout", "-b", newBranch); err != nil {
			return "", "", fmt.Errorf("create branch %s failed: %w", newBranch, err)
		}
	}

	cleanTemp := filepath.Clean(tempDir)
	for _, f := range files {
		cleanRelPath, err := ValidateRepoPath(f.Path)
		if err != nil {
			return "", "", fmt.Errorf("invalid file path '%s': %w", f.Path, err)
		}
		fullRel := cleanRelPath
		if cleanBasePath != "" {
			fullRel = path.Join(cleanBasePath, cleanRelPath)
		}
		destPath := filepath.Join(tempDir, filepath.FromSlash(fullRel))
		cleanDest := filepath.Clean(destPath)
		if !strings.HasPrefix(cleanDest, cleanTemp+string(filepath.Separator)) {
			return "", "", fmt.Errorf("file path '%s' escapes repository boundary", fullRel)
		}

		if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
			return "", "", fmt.Errorf("create directory for %s failed: %w", fullRel, err)
		}
		if err := os.WriteFile(destPath, f.Data, 0644); err != nil {
			return "", "", fmt.Errorf("write file %s failed: %w", fullRel, err)
		}
		if _, err := RunGit(tempDir, "add", "--", filepath.FromSlash(fullRel)); err != nil {
			return "", "", fmt.Errorf("git add %s failed: %w", fullRel, err)
		}
	}

	if message == "" {
		message = fmt.Sprintf("Upload %d files", len(files))
	}
	if authorName == "" {
		authorName = "ProGit"
	}
	if authorEmail == "" {
		authorEmail = "git@progit.io"
	}
	authorStr := fmt.Sprintf("%s <%s>", authorName, authorEmail)
	gitConfigArgs := []string{
		"-c", "core.hooksPath=",
		"-c", "user.name=" + authorName,
		"-c", "user.email=" + authorEmail,
	}

	commitArgs := append(gitConfigArgs, "commit", "-m", message, "--author="+authorStr)
	if _, err := RunGit(tempDir, commitArgs...); err != nil {
		return "", "", fmt.Errorf("git commit failed: %w", err)
	}

	if _, err := RunGit(tempDir, "push", "origin", targetBranch); err != nil {
		return "", "", fmt.Errorf("git push failed: %w", err)
	}

	shaOut, _ := RunGit(tempDir, "rev-parse", "HEAD")
	sha := strings.TrimSpace(string(shaOut))

	return sha, targetBranch, nil
}

// ============================================================================
// Git Blame & In-Repo Code Search (P2 & P3)
// ============================================================================

type BlameLine struct {
	LineNumber int    `json:"line_number"`
	CommitSHA  string `json:"commit_sha"`
	ShortSHA   string `json:"short_sha"`
	Author     string `json:"author"`
	AuthorMail string `json:"author_mail"`
	Timestamp  string `json:"timestamp"`
	Summary    string `json:"summary"`
	Content    string `json:"content"`
}

func GetBlame(repoDir, ref, filePath string) ([]BlameLine, error) {
	if ref == "" {
		ref = "HEAD"
	}
	if strings.HasPrefix(ref, "-") {
		return nil, fmt.Errorf("invalid branch or ref name")
	}
	cleanPath, err := ValidateRepoPath(filePath)
	if err != nil {
		return nil, err
	}

	out, err := RunGit(repoDir, "blame", "--line-porcelain", ref, "--", cleanPath)
	if err != nil {
		return nil, fmt.Errorf("git blame failed: %v", err)
	}

	lines := strings.Split(string(out), "\n")
	var result []BlameLine
	var currentSha, currentAuthor, currentMail, currentSummary, currentTimestamp string

	lineNum := 1
	for _, l := range lines {
		if l == "" {
			continue
		}
		if strings.HasPrefix(l, "\t") {
			// Tab prefix denotes line content
			content := strings.TrimPrefix(l, "\t")
			shortSha := currentSha
			if len(shortSha) > 7 {
				shortSha = shortSha[:7]
			}
			result = append(result, BlameLine{
				LineNumber: lineNum,
				CommitSHA:  currentSha,
				ShortSHA:   shortSha,
				Author:     currentAuthor,
				AuthorMail: currentMail,
				Timestamp:  currentTimestamp,
				Summary:    currentSummary,
				Content:    content,
			})
			lineNum++
			continue
		}

		parts := strings.SplitN(l, " ", 2)
		header := parts[0]
		val := ""
		if len(parts) > 1 {
			val = parts[1]
		}

		if len(header) == 40 && isHex(header) {
			currentSha = header
		} else if header == "author" {
			currentAuthor = val
		} else if header == "author-mail" {
			currentMail = strings.Trim(val, "<>")
		} else if header == "author-time" {
			if sec, err := strconv.ParseInt(val, 10, 64); err == nil {
				currentTimestamp = time.Unix(sec, 0).Format(time.RFC3339)
			} else {
				currentTimestamp = val
			}
		} else if header == "summary" {
			currentSummary = val
		}
	}

	return result, nil
}

func isHex(s string) bool {
	for _, c := range s {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return false
		}
	}
	return true
}

type CodeMatch struct {
	Path       string `json:"path"`
	LineNumber int    `json:"line_number"`
	Content    string `json:"content"`
}

func SearchCode(repoDir, ref, query string) ([]CodeMatch, error) {
	if ref == "" {
		ref = "HEAD"
	}
	if strings.HasPrefix(ref, "-") {
		return nil, fmt.Errorf("invalid branch or ref name")
	}
	if query == "" {
		return nil, nil
	}

	out, err := RunGit(repoDir, "grep", "-n", "-I", "-i", "--max-count=150", "-e", query, "--", ref)
	if err != nil {
		// Exit code 1 from git grep means no matches found
		return []CodeMatch{}, nil
	}

	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	var matches []CodeMatch
	prefix := ref + ":"

	for _, line := range lines {
		if line == "" {
			continue
		}
		line = strings.TrimPrefix(line, prefix)
		parts := strings.SplitN(line, ":", 3)
		if len(parts) < 3 {
			continue
		}
		path := parts[0]
		lineNo, err := strconv.Atoi(parts[1])
		if err != nil {
			continue
		}
		content := parts[2]
		matches = append(matches, CodeMatch{
			Path:       path,
			LineNumber: lineNo,
			Content:    content,
		})
	}

	return matches, nil
}

