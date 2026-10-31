package git

import (
	"os"
	"path/filepath"
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

