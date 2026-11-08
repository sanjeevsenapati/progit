package git

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGitOperations(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "progit-git-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	repoPath := filepath.Join(tempDir, "test.git")

	// 1. Initialize repository with Readme
	err = InitRepositoryWithReadme(repoPath, "test-repo", "Testing ProGit Native Git Engine", "main", "Tester", "tester@example.com")
	if err != nil {
		t.Fatalf("InitRepositoryWithReadme failed: %v", err)
	}

	// 2. Get branches
	branches, err := GetBranches(repoPath)
	if err != nil || len(branches) == 0 {
		t.Fatalf("expected at least 1 branch, got %v (err: %v)", branches, err)
	}
	if branches[0] != "main" {
		t.Errorf("expected branch 'main', got '%s'", branches[0])
	}

	// 3. Get commits
	commits, err := GetCommits(repoPath, "main", 10, 0)
	if err != nil || len(commits) != 1 {
		t.Fatalf("expected 1 commit, got %d (err: %v)", len(commits), err)
	}
	if commits[0].Message != "Initial commit" {
		t.Errorf("unexpected commit message: %s", commits[0].Message)
	}

	totalCommits := CountCommits(repoPath, "main")
	if totalCommits != 1 {
		t.Errorf("expected 1 total commit, got %d", totalCommits)
	}

	// 4. Get tree entries
	tree, err := GetTree(repoPath, "main", "")
	if err != nil || len(tree) == 0 {
		t.Fatalf("expected tree entries, got %v (err: %v)", tree, err)
	}
	if tree[0].Name != "README.md" {
		t.Errorf("expected README.md in tree, got %s", tree[0].Name)
	}

	// 5. Get blob content
	blob, err := GetBlob(repoPath, "main", "README.md")
	if err != nil || blob == nil {
		t.Fatalf("GetBlob failed: %v", err)
	}
	if blob.IsBinary || blob.Size == 0 {
		t.Errorf("unexpected blob state: %+v", blob)
	}

	// 5b. Get commit diff
	diff, err := GetCommitDiff(repoPath, commits[0].SHA)
	if err != nil {
		t.Fatalf("GetCommitDiff failed: %v", err)
	}
	if diff == nil || len(diff.Files) == 0 {
		t.Fatalf("expected diff files for commit, got %v", diff)
	}

	// 6. Branch creation
	err = CreateBranch(repoPath, "feature", "main")
	if err != nil {
		t.Fatalf("CreateBranch failed: %v", err)
	}
	branches, _ = GetBranches(repoPath)
	if len(branches) < 2 {
		t.Errorf("expected at least 2 branches, got %d", len(branches))
	}
}

func TestRelativePathInitRepositoryWithReadme(t *testing.T) {
	relDir := filepath.Join(".", "data_test_temp", "relative.git")
	defer os.RemoveAll("./data_test_temp")

	err := InitRepositoryWithReadme(relDir, "relative-repo", "Testing relative path resolution", "main", "RelUser", "rel@example.com")
	if err != nil {
		t.Fatalf("InitRepositoryWithReadme with relative path failed: %v", err)
	}

	branches, err := GetBranches(relDir)
	if err != nil || len(branches) == 0 {
		t.Fatalf("expected at least 1 branch from relative repo, got %v (err: %v)", branches, err)
	}
	if branches[0] != "main" {
		t.Errorf("expected branch 'main', got '%s'", branches[0])
	}

	commits, err := GetCommits(relDir, "main", 10, 0)
	if err != nil || len(commits) != 1 {
		t.Fatalf("expected 1 commit in relative repo, got %d (err: %v)", len(commits), err)
	}
}

func TestMergeBranches(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "progit-test-merge-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	repoPath := filepath.Join(tempDir, "merge-test.git")
	err = InitRepositoryWithReadme(repoPath, "merge-test", "Testing real Git merge", "main", "Tester", "tester@example.com")
	if err != nil {
		t.Fatalf("InitRepositoryWithReadme failed: %v", err)
	}

	// Create feature branch
	err = CreateBranch(repoPath, "feature", "main")
	if err != nil {
		t.Fatalf("CreateBranch failed: %v", err)
	}

	// Push a commit to feature branch via working clone
	workDir, err := os.MkdirTemp("", "progit-work-*")
	if err != nil {
		t.Fatalf("work dir: %v", err)
	}
	defer os.RemoveAll(workDir)

	if _, err := RunGit("", "clone", "--branch", "feature", repoPath, workDir); err != nil {
		t.Fatalf("clone feature failed: %v", err)
	}
	if err := os.WriteFile(filepath.Join(workDir, "feature.txt"), []byte("new feature"), 0644); err != nil {
		t.Fatalf("write feature.txt: %v", err)
	}
	if _, err := RunGit(workDir, "add", "feature.txt"); err != nil {
		t.Fatalf("git add: %v", err)
	}
	if _, err := RunGit(workDir, "-c", "user.name=Tester", "-c", "user.email=tester@example.com", "commit", "-m", "Add feature file"); err != nil {
		t.Fatalf("git commit: %v", err)
	}
	if _, err := RunGit(workDir, "push", "origin", "feature"); err != nil {
		t.Fatalf("git push feature: %v", err)
	}

	// Now execute MergeBranches
	sha, err := MergeBranches(repoPath, "main", "feature", "merge", "Merge feature into main", "Tester", "tester@example.com")
	if err != nil {
		t.Fatalf("MergeBranches failed: %v", err)
	}
	if len(sha) == 0 {
		t.Fatalf("expected non-empty commit sha")
	}

	// Verify main has the feature.txt file
	blob, err := GetBlob(repoPath, "main", "feature.txt")
	if err != nil || blob == nil {
		t.Fatalf("feature.txt not found on main after merge: %v", err)
	}
	if blob.Content != "new feature" {
		t.Errorf("unexpected blob content on main: %s", blob.Content)
	}
}

func TestOnlineFileOperations(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "progit-online-file-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	repoPath := filepath.Join(tempDir, "online.git")
	if err := InitRepositoryWithReadme(repoPath, "online-repo", "Testing online operations", "main", "Tester", "tester@example.com"); err != nil {
		t.Fatalf("init repo: %v", err)
	}

	// 1. Save new file
	sha1, branch1, err := SaveFile(repoPath, "main", "src/main.go", "package main\n\nfunc main() {}\n", "Tester", "tester@example.com", "Add main.go", "")
	if err != nil {
		t.Fatalf("SaveFile create failed: %v", err)
	}
	if sha1 == "" || branch1 != "main" {
		t.Errorf("unexpected SaveFile result: sha=%s, branch=%s", sha1, branch1)
	}

	blob, err := GetBlob(repoPath, "main", "src/main.go")
	if err != nil || blob == nil {
		t.Fatalf("GetBlob src/main.go failed: %v", err)
	}
	if !strings.Contains(blob.Content, "package main") {
		t.Errorf("blob content mismatch: %s", blob.Content)
	}

	// 2. Edit existing file
	sha2, _, err := SaveFile(repoPath, "main", "src/main.go", "package main\n\nimport \"fmt\"\n\nfunc main() { fmt.Println() }\n", "Tester", "tester@example.com", "Update main.go", "")
	if err != nil {
		t.Fatalf("SaveFile edit failed: %v", err)
	}
	if sha2 == sha1 {
		t.Errorf("expected different commit sha after edit")
	}

	blob2, _ := GetBlob(repoPath, "main", "src/main.go")
	if !strings.Contains(blob2.Content, "import \"fmt\"") {
		t.Errorf("updated content mismatch: %s", blob2.Content)
	}

	// 3. Upload multiple files & directory
	files := []UploadedFile{
		{Path: "config/app.json", Data: []byte(`{"env":"production"}`)},
		{Path: "assets/logo.svg", Data: []byte(`<svg></svg>`)},
	}
	sha3, _, err := UploadFiles(repoPath, "main", "", files, "Tester", "tester@example.com", "Upload assets & config", "")
	if err != nil {
		t.Fatalf("UploadFiles failed: %v", err)
	}
	if sha3 == "" {
		t.Errorf("expected commit sha from upload")
	}

	blobJSON, err := GetBlob(repoPath, "main", "config/app.json")
	if err != nil || blobJSON == nil || !strings.Contains(blobJSON.Content, "production") {
		t.Fatalf("uploaded config/app.json not found: %v", err)
	}

	// 4. Delete file
	sha4, _, err := DeleteFile(repoPath, "main", "config/app.json", "Tester", "tester@example.com", "Remove config", "")
	if err != nil {
		t.Fatalf("DeleteFile failed: %v", err)
	}
	if sha4 == "" {
		t.Errorf("expected commit sha from delete")
	}

	blobDeleted, _ := GetBlob(repoPath, "main", "config/app.json")
	if blobDeleted != nil {
		t.Errorf("expected file to be deleted, but still found")
	}
}

func TestImportRepositoryAndUtilities(t *testing.T) {
	// 1. SanitizeURL
	rawURL := "https://myuser:secret_token_12345@github.com/foo/bar.git"
	sanitized := SanitizeURL(rawURL)
	if strings.Contains(sanitized, "secret_token_12345") {
		t.Errorf("SanitizeURL leaked password: %s", sanitized)
	}
	if !strings.Contains(sanitized, "redacted") {
		t.Errorf("expected redacted user in %s", sanitized)
	}

	// 2. Import Repository from local bare repo (requires AllowLocalRepoImport)
	AllowLocalRepoImport = true
	defer func() { AllowLocalRepoImport = false }()

	tempDir, err := os.MkdirTemp("", "progit-import-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	srcRepo := filepath.Join(tempDir, "source.git")
	destRepo := filepath.Join(tempDir, "imported.git")

	if err := InitRepositoryWithReadme(srcRepo, "source", "Source repository for import", "main", "Author", "author@example.com"); err != nil {
		t.Fatalf("InitRepositoryWithReadme failed: %v", err)
	}

	if err := ImportRepository(srcRepo, destRepo, "", ""); err != nil {
		t.Fatalf("ImportRepository failed: %v", err)
	}

	branches, err := GetBranches(destRepo)
	if err != nil || len(branches) == 0 {
		t.Fatalf("expected branches in imported repo: %v", err)
	}
	if branches[0] != "main" {
		t.Errorf("expected branch main, got %s", branches[0])
	}

	defBranch := GetDefaultBranch(destRepo)
	if defBranch != "main" {
		t.Errorf("expected default branch main, got %s", defBranch)
	}
}

func TestSecurityVulnerabilitiesRemediated(t *testing.T) {
	// 1. Path Traversal & .git hooks prevention
	blockedPaths := []string{
		".git",
		".git/hooks/pre-commit",
		".git/config",
		"foo/.git/hooks/post-commit",
		"../etc/passwd",
		"../../shadow",
		"-oProxyCommand=calc",
		"--upload-pack=calc",
		"a/b/../../../etc/hosts",
		"foo\x00bar",
		`win\path\.git\hooks`,
	}
	for _, p := range blockedPaths {
		if _, err := ValidateRepoPath(p); err == nil {
			t.Errorf("expected path '%s' to be blocked, but was accepted", p)
		}
	}

	allowedPaths := []string{
		"README.md",
		"src/main.go",
		".gitignore",
		".gitattributes",
		".github/workflows/ci.yml",
		"docs/intro.md",
	}
	for _, p := range allowedPaths {
		if _, err := ValidateRepoPath(p); err != nil {
			t.Errorf("expected path '%s' to be allowed, but got error: %v", p, err)
		}
	}

	// 2. Wiki Slug Validation
	blockedSlugs := []string{
		"../../etc/passwd",
		"-help",
		".git",
		"pages/subpage",
		"win\\path",
		"evil\x00slug",
	}
	for _, s := range blockedSlugs {
		if _, err := ValidateWikiSlug(s); err == nil {
			t.Errorf("expected wiki slug '%s' to be blocked, but was accepted", s)
		}
	}

	// 3. Import SSRF and Protocol Injection prevention
	AllowLocalRepoImport = false
	blockedImportURLs := []string{
		"/etc/passwd",
		"file:///etc/passwd",
		"ext::sh -c whoami",
		"http://127.0.0.1:8080/evil.git",
		"http://localhost:3000/repo.git",
		"http://169.254.169.254/latest/meta-data",
		"http://10.0.0.1/private.git",
		"http://192.168.1.1/secret.git",
		"http://172.16.0.1/corp.git",
	}
	for _, u := range blockedImportURLs {
		if err := ImportRepository(u, "/tmp/should-fail.git", "", ""); err == nil {
			t.Errorf("expected import URL '%s' to be rejected, but succeeded", u)
		}
	}
}


