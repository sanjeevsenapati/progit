package database

import (
	"os"
	"path/filepath"
	"testing"

	"golang.org/x/crypto/bcrypt"
	"progit.io/progit/internal/config"
)

func setupTestDB(t *testing.T) (*config.Config, func()) {
	t.Helper()
	tempDir, err := os.MkdirTemp("", "progit-db-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}

	cfg := config.DefaultConfig()
	cfg.Database.Path = filepath.Join(tempDir, "test.db")
	cfg.Repository.Root = filepath.Join(tempDir, "repos")

	if err := Init(cfg); err != nil {
		t.Fatalf("database init failed: %v", err)
	}

	cleanup := func() {
		if DB != nil {
			_ = DB.Close()
		}
		_ = os.RemoveAll(tempDir)
	}
	return cfg, cleanup
}

func TestDatabaseAndUserLifecycle(t *testing.T) {
	_, cleanup := setupTestDB(t)
	defer cleanup()

	if err := Ping(); err != nil {
		t.Fatalf("expected ping to succeed, got %v", err)
	}

	hashBytes, err := bcrypt.GenerateFromPassword([]byte("secret123"), 10)
	if err != nil {
		t.Fatalf("hash password failed: %v", err)
	}
	hash := string(hashBytes)

	user, err := CreateUser("developer", "dev@example.com", hash, "Lead Developer", true)
	if err != nil {
		t.Fatalf("create user failed: %v", err)
	}

	if user.Username != "developer" || !user.IsAdmin {
		t.Errorf("unexpected user values: %+v", user)
	}

	fetched, err := GetUserByUsername("DEVELOPER") // Test case insensitivity
	if err != nil {
		t.Fatalf("get user by case-insensitive username failed: %v", err)
	}
	if fetched.ID != user.ID {
		t.Errorf("expected user ID %d, got %d", user.ID, fetched.ID)
	}

	// Access Token Test
	token, err := CreateAccessToken(user.ID, "test-token", "pgt_secret_token_1234567890", "repo,user")
	if err != nil {
		t.Fatalf("create access token failed: %v", err)
	}

	tokenUser, err := GetUserByAccessToken("pgt_secret_token_1234567890")
	if err != nil || tokenUser.ID != user.ID {
		t.Fatalf("expected user from token %d, got %v (err: %v)", user.ID, tokenUser, err)
	}

	tokens, err := ListAccessTokensByUserID(user.ID)
	if err != nil || len(tokens) != 1 {
		t.Fatalf("expected 1 token, got %d (err: %v)", len(tokens), err)
	}
	_ = token
}

func TestRepositoryAndIssues(t *testing.T) {
	_, cleanup := setupTestDB(t)
	defer cleanup()

	hash := "$2a$10$dummyhashfortesting0000000000000000000000000000000000000"
	user, err := CreateUser("alice", "alice@example.com", hash, "Alice", false)
	if err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	repo, err := CreateRepository(user.ID, "demo-repo", "A sample repository", false)
	if err != nil {
		t.Fatalf("failed to create repository: %v", err)
	}

	if repo.Name != "demo-repo" || repo.IsPrivate {
		t.Errorf("unexpected repo state: %+v", repo)
	}

	// Issues
	issue, err := CreateIssue(repo.ID, user.ID, "Fix memory leak", "Description here", false)
	if err != nil {
		t.Fatalf("failed to create issue: %v", err)
	}
	if issue.IndexNumber != 1 {
		t.Errorf("expected issue index 1, got %d", issue.IndexNumber)
	}

	comment, err := AddComment(issue.ID, user.ID, "comment", "Looking into this now.")
	if err != nil {
		t.Fatalf("failed to add comment: %v", err)
	}
	if comment.Content != "Looking into this now." {
		t.Errorf("unexpected comment content: %s", comment.Content)
	}

	comments, err := ListComments(issue.ID)
	if err != nil || len(comments) != 1 {
		t.Fatalf("expected 1 comment, got %d", len(comments))
	}
}
