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

func TestSecurityCollaboratorsAndOrganizations(t *testing.T) {
	_, cleanup := setupTestDB(t)
	defer cleanup()

	hash := "$2a$10$dummyhashfortesting0000000000000000000000000000000000000"
	owner, _ := CreateUser("repo-owner", "owner@example.com", hash, "Owner", false)
	collab, _ := CreateUser("collab-user", "collab@example.com", hash, "Collab", false)
	stranger, _ := CreateUser("stranger-user", "stranger@example.com", hash, "Stranger", false)

	repo, err := CreateRepository(owner.ID, "secure-repo", "Secure project", true) // Private repo
	if err != nil {
		t.Fatalf("failed to create repo: %v", err)
	}

	// Unauthenticated should fail write and read on private repo
	if CanUserAccessRepo(nil, repo, true) {
		t.Errorf("unauthenticated user should not have write access")
	}
	if CanUserAccessRepo(nil, repo, false) {
		t.Errorf("unauthenticated user should not have read access to private repo")
	}

	// Owner should have full access
	if !CanUserAccessRepo(owner, repo, true) {
		t.Errorf("owner should have write access")
	}

	// Stranger should not have access
	if CanUserAccessRepo(stranger, repo, true) || CanUserAccessRepo(stranger, repo, false) {
		t.Errorf("stranger should not have access to private repo")
	}

	// Add collaborator with read access
	if err := AddCollaborator(repo.ID, collab.ID, "read"); err != nil {
		t.Fatalf("failed to add collaborator: %v", err)
	}
	if !CanUserAccessRepo(collab, repo, false) {
		t.Errorf("collab with read should have read access")
	}
	if CanUserAccessRepo(collab, repo, true) {
		t.Errorf("collab with read should NOT have write access")
	}

	// Upgrade collaborator to write access
	if err := AddCollaborator(repo.ID, collab.ID, "write"); err != nil {
		t.Fatalf("failed to update collaborator: %v", err)
	}
	if !CanUserAccessRepo(collab, repo, true) {
		t.Errorf("collab with write should have write access")
	}

	collabs, err := ListCollaborators(repo.ID)
	if err != nil || len(collabs) != 1 || collabs[0].Mode != "write" {
		t.Fatalf("unexpected collaborators list: %+v", collabs)
	}

	// Organization lifecycle
	org, err := CreateOrganization("acme-corp", "Acme Corporation", "Building the future", "SF", "https://acme.org", owner.ID)
	if err != nil {
		t.Fatalf("failed to create org: %v", err)
	}
	if org.Name != "acme-corp" {
		t.Errorf("unexpected org name: %s", org.Name)
	}

	orgUser, _ := GetUserByUsername("acme-corp")
	orgRepo, err := CreateRepository(orgUser.ID, "platform", "Acme Platform", true)
	if err != nil {
		t.Fatalf("failed to create org repo: %v", err)
	}

	// Org owner should have access to org repo
	if !CanUserAccessRepo(owner, orgRepo, true) {
		t.Errorf("org owner should have write access to org repo")
	}

	// Add stranger as member of org
	if err := AddOrgMember(org.ID, stranger.ID, "member"); err != nil {
		t.Fatalf("failed to add org member: %v", err)
	}
	// Regular member can read org repo
	if !CanUserAccessRepo(stranger, orgRepo, false) {
		t.Errorf("org member should have read access to org repo")
	}
}

func TestProjectsAndKanban(t *testing.T) {
	_, cleanup := setupTestDB(t)
	defer cleanup()

	hash := "$2a$10$dummyhashfortesting0000000000000000000000000000000000000"
	user, _ := CreateUser("pm-user", "pm@example.com", hash, "Product Manager", false)
	repo, _ := CreateRepository(user.ID, "project-test-repo", "", false)

	// Create project
	proj, err := CreateProject(repo.ID, user.ID, "Q4 Roadmap", "Sprint goals")
	if err != nil {
		t.Fatalf("failed to create project: %v", err)
	}
	if len(proj.Columns) != 3 {
		t.Fatalf("expected 3 default columns, got %d", len(proj.Columns))
	}

	todoCol := proj.Columns[0]
	doneCol := proj.Columns[2]

	// Create card
	card, err := CreateProjectCard(proj.ID, todoCol.ID, user.ID, nil, "Implement OAuth2 login", 1)
	if err != nil {
		t.Fatalf("failed to create card: %v", err)
	}
	if card.Content != "Implement OAuth2 login" {
		t.Errorf("unexpected card content: %s", card.Content)
	}

	// Move card to Done
	if err := MoveProjectCard(card.ID, doneCol.ID, 1); err != nil {
		t.Fatalf("failed to move card: %v", err)
	}

	updatedProj, err := GetProjectByID(proj.ID)
	if err != nil {
		t.Fatalf("failed to get project: %v", err)
	}
	if updatedProj.DoneCards != 1 || updatedProj.TotalCards != 1 {
		t.Errorf("expected 1 total and 1 done card, got total=%d done=%d", updatedProj.TotalCards, updatedProj.DoneCards)
	}
}
