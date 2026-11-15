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

	// Search and Count
	searchResults, err := SearchRepositories("demo", 0, false, 10, 0)
	if err != nil || len(searchResults) != 1 {
		t.Fatalf("expected 1 search result, got %d (err: %v)", len(searchResults), err)
	}

	totalFound, err := CountSearchRepositories("demo", 0, false)
	if err != nil || totalFound != 1 {
		t.Fatalf("expected count 1, got %d (err: %v)", totalFound, err)
	}

	// Issues
	issue, err := CreateIssue(repo.ID, user.ID, "Fix memory leak", "Description here", false, nil)
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

	// Test UpdateOrganization
	updatedOrg, err := UpdateOrganization(org.ID, "Acme International", "Building global software", "New York", "https://acme.com", "https://acme.com/avatar.png")
	if err != nil {
		t.Fatalf("failed to update org: %v", err)
	}
	if updatedOrg.FullName != "Acme International" || updatedOrg.Description != "Building global software" || updatedOrg.Location != "New York" || updatedOrg.Website != "https://acme.com" {
		t.Errorf("unexpected updated org fields: %+v", updatedOrg)
	}
	// Verify user stub sync
	stubUser, err := GetUserByUsername("acme-corp")
	if err != nil || stubUser.FullName != "Acme International" {
		t.Errorf("expected user stub full_name to be synced to 'Acme International', got %v", stubUser)
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

func TestForksAndPullReviews(t *testing.T) {
	_, cleanup := setupTestDB(t)
	defer cleanup()

	owner, err := CreateUser("alice", "alice@example.com", "hash", "Alice", false)
	if err != nil {
		t.Fatalf("failed to create owner: %v", err)
	}
	forker, err := CreateUser("bob", "bob@example.com", "hash", "Bob", false)
	if err != nil {
		t.Fatalf("failed to create forker: %v", err)
	}

	repo, err := CreateRepository(owner.ID, "super-project", "Original repo", false)
	if err != nil {
		t.Fatalf("failed to create repo: %v", err)
	}

	// 1. Fork repository
	forked, err := ForkRepository(repo, forker.ID, "super-project")
	if err != nil {
		t.Fatalf("failed to fork repo: %v", err)
	}
	if !forked.IsFork || forked.ForkParentID == nil || *forked.ForkParentID != repo.ID {
		t.Errorf("fork properties invalid: is_fork=%v, parent_id=%v", forked.IsFork, forked.ForkParentID)
	}
	if forked.ForkParent == nil || forked.ForkParent.OwnerName != "alice" {
		t.Errorf("expected ForkParent owner to be alice, got %v", forked.ForkParent)
	}

	// Check parent's num_forks
	parentUpdated, err := GetRepositoryByID(repo.ID)
	if err != nil {
		t.Fatalf("failed to get parent repo: %v", err)
	}
	if parentUpdated.NumForks != 1 {
		t.Errorf("expected parent NumForks=1, got %d", parentUpdated.NumForks)
	}

	// List forks
	forks, err := GetForks(repo.ID)
	if err != nil {
		t.Fatalf("failed to list forks: %v", err)
	}
	if len(forks) != 1 || forks[0].OwnerName != "bob" {
		t.Fatalf("unexpected forks list: %v", forks)
	}

	// 2. Test Pull Reviews
	pr, err := CreatePullRequest(repo.ID, repo.ID, owner.ID, "Feature PR", "Add payments", "feature", "main")
	if err != nil {
		t.Fatalf("failed to create pull request: %v", err)
	}
	issue := pr.Issue

	// Create review with inline comments
	reviewComments := []PullReviewComment{
		{
			FilePath:   "payment.go",
			LineNumber: 15,
			DiffHunk:   "@@ -10,6 +10,10 @@",
			Content:    "Validate card length",
		},
	}
	review, err := CreatePullReview(issue.ID, pr.ID, forker.ID, "APPROVED", "Looks solid!", reviewComments)
	if err != nil {
		t.Fatalf("failed to create review: %v", err)
	}
	if review.State != "APPROVED" || review.Content != "Looks solid!" {
		t.Errorf("unexpected review data: %+v", review)
	}
	if len(review.Comments) != 1 || review.Comments[0].Content != "Validate card length" {
		t.Errorf("unexpected review comments: %+v", review.Comments)
	}

	// List reviews
	allReviews, err := GetPullReviews(pr.ID)
	if err != nil {
		t.Fatalf("failed to get reviews: %v", err)
	}
	if len(allReviews) != 1 || allReviews[0].ReviewerName != "bob" {
		t.Fatalf("unexpected allReviews: %+v", allReviews)
	}

	// Add single inline review comment
	inlineCmt, err := CreatePullReviewComment(issue.ID, pr.ID, review.ID, forker.ID, "payment.go", 22, "", "Handle currency enum")
	if err != nil {
		t.Fatalf("failed to add review comment: %v", err)
	}
	if inlineCmt.Content != "Handle currency enum" {
		t.Errorf("unexpected inline comment content: %s", inlineCmt.Content)
	}

	allInline, err := GetPullReviewComments(issue.ID)
	if err != nil {
		t.Fatalf("failed to get inline review comments: %v", err)
	}
	if len(allInline) != 2 {
		t.Errorf("expected 2 inline review comments, got %d", len(allInline))
	}
}

func TestDownloadPermissionsAndViewOnly(t *testing.T) {
	_, cleanup := setupTestDB(t)
	defer cleanup()

	hash := "$2a$10$dummyhashfortesting0000000000000000000000000000000000000"
	admin, err := CreateUser("perm-admin", "perm-admin@example.com", hash, "Super Admin", true)
	if err != nil {
		t.Fatalf("create admin: %v", err)
	}
	owner, _ := CreateUser("perm-owner", "perm-owner@example.com", hash, "Owner", false)
	viewUser, _ := CreateUser("perm-view", "perm-view@example.com", hash, "View Only User", false)
	readUser, _ := CreateUser("perm-read", "perm-read@example.com", hash, "Read User", false)
	writeUser, _ := CreateUser("perm-write", "perm-write@example.com", hash, "Write User", false)
	collabAdmin, _ := CreateUser("perm-cadmin", "perm-cadmin@example.com", hash, "Repo Admin Collab", false)
	publicUser, _ := CreateUser("perm-public", "perm-public@example.com", hash, "Public Visitor", false)

	// 1. Validate repo roles
	for _, role := range []string{"view_only", "read", "write", "admin"} {
		if !IsValidRepoRole(role) {
			t.Errorf("expected IsValidRepoRole(%q) = true", role)
		}
	}
	for _, invalid := range []string{"", "owner", "superuser"} {
		if IsValidRepoRole(invalid) {
			t.Errorf("expected IsValidRepoRole(%q) = false", invalid)
		}
	}

	privRepo, err := CreateRepository(owner.ID, "priv-dl-repo", "Private repo", true)
	if err != nil {
		t.Fatalf("create private repo: %v", err)
	}
	if err := AddCollaborator(privRepo.ID, viewUser.ID, "invalid_role"); err == nil {
		t.Errorf("expected error for invalid collaborator role")
	}
	if err := AddCollaborator(privRepo.ID, viewUser.ID, "view_only"); err != nil {
		t.Fatalf("add view_only collaborator: %v", err)
	}
	if err := AddCollaborator(privRepo.ID, readUser.ID, "read"); err != nil {
		t.Fatalf("add read collaborator: %v", err)
	}
	if err := AddCollaborator(privRepo.ID, writeUser.ID, "write"); err != nil {
		t.Fatalf("add write collaborator: %v", err)
	}
	if err := AddCollaborator(privRepo.ID, collabAdmin.ID, "admin"); err != nil {
		t.Fatalf("add admin collaborator: %v", err)
	}

	// Private repo permissions matrix
	pView := GetRepoPermissions(viewUser, privRepo)
	if !pView.Read || pView.Write || pView.Admin || pView.Download || !pView.ViewOnly {
		t.Errorf("unexpected view_only perms: %+v", pView)
	}
	pRead := GetRepoPermissions(readUser, privRepo)
	if !pRead.Read || pRead.Write || !pRead.Download || pRead.ViewOnly {
		t.Errorf("unexpected read perms: %+v", pRead)
	}
	pWrite := GetRepoPermissions(writeUser, privRepo)
	if !pWrite.Read || !pWrite.Write || pWrite.Admin || !pWrite.Download || pWrite.ViewOnly {
		t.Errorf("unexpected write perms: %+v", pWrite)
	}
	pCollabAdmin := GetRepoPermissions(collabAdmin, privRepo)
	if !pCollabAdmin.Read || !pCollabAdmin.Write || !pCollabAdmin.Admin || !pCollabAdmin.Download {
		t.Errorf("unexpected admin collab perms: %+v", pCollabAdmin)
	}
	pPublicOnPriv := GetRepoPermissions(publicUser, privRepo)
	if pPublicOnPriv.Read || pPublicOnPriv.Download {
		t.Errorf("outsider should have no access to private repo: %+v", pPublicOnPriv)
	}

	// 2. Org team with view_only permission
	org, err := CreateOrganization("sec-org", "Security Org", "", "", "", owner.ID)
	if err != nil {
		t.Fatalf("create org: %v", err)
	}
	if _, err := CreateTeam(org.ID, "bad-team", "", "bogus"); err == nil {
		t.Errorf("expected error for invalid team permission")
	}
	viewTeam, err := CreateTeam(org.ID, "Contractors", "External reviewers", "view_only")
	if err != nil {
		t.Fatalf("create view_only team: %v", err)
	}
	_ = AddOrgMember(org.ID, publicUser.ID, "member")
	_ = AddTeamMember(viewTeam.ID, publicUser.ID)

	orgUser, _ := GetUserByUsername("sec-org")
	orgRepo, err := CreateRepository(orgUser.ID, "org-vault", "Org private repo", true)
	if err != nil {
		t.Fatalf("create org repo: %v", err)
	}
	pOrgView := GetRepoPermissions(publicUser, orgRepo)
	if !pOrgView.Read || pOrgView.Write || pOrgView.Download || !pOrgView.ViewOnly {
		t.Errorf("expected org view_only team member to have ViewOnly=true, Download=false; got %+v", pOrgView)
	}

	// 3. Global User Download Restriction (users.can_download = false)
	if err := UpdateUserDownload(writeUser.ID, false); err != nil {
		t.Fatalf("UpdateUserDownload failed: %v", err)
	}
	writeUserUpdated, _ := GetUserByID(writeUser.ID)
	if writeUserUpdated.CanDownload {
		t.Errorf("expected writeUserUpdated.CanDownload == false")
	}
	pRestrictedWrite := GetRepoPermissions(writeUserUpdated, privRepo)
	if !pRestrictedWrite.Read || !pRestrictedWrite.Write || pRestrictedWrite.Download || !pRestrictedWrite.ViewOnly {
		t.Errorf("restricted user should have Download=false, ViewOnly=true even as write collaborator: %+v", pRestrictedWrite)
	}
	// Restricted owner cannot download either
	_ = UpdateUserDownload(owner.ID, false)
	ownerRestricted, _ := GetUserByID(owner.ID)
	pOwnerRestricted := GetRepoPermissions(ownerRestricted, privRepo)
	if !pOwnerRestricted.Admin || pOwnerRestricted.Download || !pOwnerRestricted.ViewOnly {
		t.Errorf("restricted non-admin owner should have Download=false: %+v", pOwnerRestricted)
	}
	// Super Admin remains immune to can_download=false
	_ = UpdateUserDownload(admin.ID, false)
	adminUpdated, _ := GetUserByID(admin.ID)
	pSuperAdmin := GetRepoPermissions(adminUpdated, privRepo)
	if !pSuperAdmin.Admin || !pSuperAdmin.Download || pSuperAdmin.ViewOnly {
		t.Errorf("Super Admin should stay immune to download restriction: %+v", pSuperAdmin)
	}
	// Restore owner and writeUser
	_ = UpdateUserDownload(owner.ID, true)
	_ = UpdateUserDownload(writeUser.ID, true)
	ownerRestored, _ := GetUserByID(owner.ID)
	writeRestored, _ := GetUserByID(writeUser.ID)

	// 4. Combined Repository Setting: AllowDownloadAndPulls = false
	pubRepo, err := CreateRepository(ownerRestored.ID, "pub-restricted-repo", "Public repo", false)
	if err != nil {
		t.Fatalf("create pub repo: %v", err)
	}
	_ = AddCollaborator(pubRepo.ID, writeRestored.ID, "write")
	_ = AddCollaborator(pubRepo.ID, readUser.ID, "read")
	_ = AddCollaborator(pubRepo.ID, viewUser.ID, "view_only")
	_ = AddCollaborator(pubRepo.ID, collabAdmin.ID, "admin")

	if err := UpdateRepositorySettings(pubRepo.ID, pubRepo.Description, false, pubRepo.EnableWiki, pubRepo.EnablePages, pubRepo.PagesBranch, pubRepo.PagesFolder, false); err != nil {
		t.Fatalf("UpdateRepositorySettings failed: %v", err)
	}
	pubRepoLocked, _ := GetRepositoryByID(pubRepo.ID)
	if pubRepoLocked.AllowDownloadAndPulls {
		t.Fatalf("expected AllowDownloadAndPulls == false")
	}

	// Anonymous, Read, View-Only blocked; Write, Repo Admin, Owner, Super Admin allowed
	if p := GetRepoPermissions(nil, pubRepoLocked); !p.Read || p.Download || !p.ViewOnly {
		t.Errorf("anonymous visitor on locked public repo should have Read=true, Download=false: %+v", p)
	}
	if p := GetRepoPermissions(readUser, pubRepoLocked); !p.Read || p.Download || !p.ViewOnly {
		t.Errorf("read collaborator on locked repo should have Download=false: %+v", p)
	}
	if p := GetRepoPermissions(viewUser, pubRepoLocked); !p.Read || p.Download || !p.ViewOnly {
		t.Errorf("view_only collaborator on locked repo should have Download=false: %+v", p)
	}
	if p := GetRepoPermissions(writeRestored, pubRepoLocked); !p.Write || !p.Download || p.ViewOnly {
		t.Errorf("write collaborator on locked repo should still have Download=true: %+v", p)
	}
	if p := GetRepoPermissions(collabAdmin, pubRepoLocked); !p.Admin || !p.Download || p.ViewOnly {
		t.Errorf("repo admin on locked repo should still have Download=true: %+v", p)
	}
	if p := GetRepoPermissions(ownerRestored, pubRepoLocked); !p.Admin || !p.Download || p.ViewOnly {
		t.Errorf("repo owner on locked repo should still have Download=true: %+v", p)
	}
	if p := GetRepoPermissions(adminUpdated, pubRepoLocked); !p.Admin || !p.Download || p.ViewOnly {
		t.Errorf("super admin on locked repo should still have Download=true: %+v", p)
	}
}

func TestPerformancePragmasAndHotBackup(t *testing.T) {
	cfg, cleanup := setupTestDB(t)
	defer cleanup()

	// 1. Verify Integrity
	status, err := CheckIntegrity()
	if err != nil {
		t.Fatalf("CheckIntegrity failed: %v", err)
	}
	if status != "ok" {
		t.Fatalf("expected integrity status 'ok', got %q", status)
	}

	// 2. Verify Database Optimization
	if err := OptimizeDatabase(); err != nil {
		t.Fatalf("OptimizeDatabase failed: %v", err)
	}

	// 3. Verify WAL Checkpoint
	if err := CheckpointWAL(); err != nil {
		t.Fatalf("CheckpointWAL failed: %v", err)
	}

	// 4. Verify Hot Backup via VACUUM INTO
	backupFile := filepath.Join(t.TempDir(), "hot_backup.db")
	if err := CreateHotBackup(backupFile); err != nil {
		t.Fatalf("CreateHotBackup failed: %v", err)
	}

	info, err := os.Stat(backupFile)
	if err != nil {
		t.Fatalf("backup file stat failed: %v", err)
	}
	if info.Size() == 0 {
		t.Fatalf("expected non-empty backup file")
	}
	_ = cfg
}
