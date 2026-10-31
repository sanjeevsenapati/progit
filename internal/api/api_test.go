package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"progit.io/progit/internal/auth"
	"progit.io/progit/internal/config"
	"progit.io/progit/internal/database"
	"progit.io/progit/internal/git"
)

func setupTestRouter(t *testing.T) (*Router, func()) {
	t.Helper()
	tempDir, err := os.MkdirTemp("", "progit-api-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}

	cfg := config.DefaultConfig()
	cfg.Database.Path = filepath.Join(tempDir, "test.db")
	cfg.Repository.Root = filepath.Join(tempDir, "repos")

	if err := database.Init(cfg); err != nil {
		t.Fatalf("database init failed: %v", err)
	}

	router := NewRouter(cfg)

	cleanup := func() {
		if database.DB != nil {
			_ = database.DB.Close()
		}
		_ = os.RemoveAll(tempDir)
	}
	return router, cleanup
}

func TestHealthAndReadiness(t *testing.T) {
	router, cleanup := setupTestRouter(t)
	defer cleanup()

	// Test GET /api/health
	req := httptest.NewRequest("GET", "/api/health", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200 OK, got %d", rec.Code)
	}

	var res map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to unmarshal health response: %v", err)
	}
	if res["status"] != "ok" {
		t.Errorf("expected status 'ok', got %v", res["status"])
	}

	// Test GET /api/ready
	reqReady := httptest.NewRequest("GET", "/api/ready", nil)
	recReady := httptest.NewRecorder()
	router.ServeHTTP(recReady, reqReady)

	if recReady.Code != http.StatusOK {
		t.Errorf("expected 200 OK for readiness, got %d", recReady.Code)
	}
}

func TestAuthRegistrationAndLogin(t *testing.T) {
	router, cleanup := setupTestRouter(t)
	defer cleanup()

	// 1. Register User
	body := map[string]string{
		"username":  "john_doe",
		"email":     "john@example.com",
		"password":  "password123",
		"full_name": "John Doe",
	}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/api/v1/auth/register", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d: %s", rec.Code, rec.Body.String())
	}

	// 2. Login User
	loginBody := map[string]string{
		"username": "john_doe",
		"password": "password123",
	}
	loginBytes, _ := json.Marshal(loginBody)

	reqLogin := httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewReader(loginBytes))
	reqLogin.Header.Set("Content-Type", "application/json")
	recLogin := httptest.NewRecorder()
	router.ServeHTTP(recLogin, reqLogin)

	if recLogin.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", recLogin.Code, recLogin.Body.String())
	}

	var loginRes map[string]any
	_ = json.Unmarshal(recLogin.Body.Bytes(), &loginRes)
	token, ok := loginRes["token"].(string)
	if !ok || token == "" {
		t.Errorf("expected token in login response, got %v", loginRes)
	}

	// 3. Authenticate with Bearer token: GET /api/v1/auth/me
	reqMe := httptest.NewRequest("GET", "/api/v1/auth/me", nil)
	// Login set session cookie
	for _, c := range recLogin.Result().Cookies() {
		reqMe.AddCookie(c)
	}
	recMe := httptest.NewRecorder()
	router.ServeHTTP(recMe, reqMe)

	if recMe.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for /api/v1/auth/me, got %d", recMe.Code)
	}
}

func TestInstallAndSuperAdminWorkflow(t *testing.T) {
	router, cleanup := setupTestRouter(t)
	defer cleanup()

	// 1. Check install status (initially unlocked since 0 users)
	reqStatus := httptest.NewRequest("GET", "/api/v1/install/status", nil)
	recStatus := httptest.NewRecorder()
	router.ServeHTTP(recStatus, reqStatus)
	if recStatus.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for install status, got %d", recStatus.Code)
	}

	// 2. Perform installation and create Super Admin
	installBody := map[string]any{
		"app_name":       "ProGit Enterprise",
		"domain":         "git.example.com",
		"http_port":      3000,
		"root_url":       "http://git.example.com:3000/",
		"admin_username": "superadmin",
		"admin_email":    "superadmin@example.com",
		"admin_password": "SuperSecurePassword123!",
	}
	installBytes, _ := json.Marshal(installBody)
	reqInstall := httptest.NewRequest("POST", "/api/v1/install", bytes.NewReader(installBytes))
	reqInstall.Header.Set("Content-Type", "application/json")
	recInstall := httptest.NewRecorder()
	router.ServeHTTP(recInstall, reqInstall)

	if recInstall.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for install, got %d: %s", recInstall.Code, recInstall.Body.String())
	}

	var installRes map[string]any
	_ = json.Unmarshal(recInstall.Body.Bytes(), &installRes)
	token, ok := installRes["token"].(string)
	if !ok || token == "" {
		t.Fatalf("expected token in install response, got %v", installRes)
	}

	// Verify user is super admin
	uMap, ok := installRes["user"].(map[string]any)
	if !ok || uMap["is_admin"] != true {
		t.Fatalf("expected user to be admin, got %v", uMap)
	}

	// 3. Admin creates another user
	createUserBody := map[string]any{
		"username":  "dev_user",
		"email":     "dev@example.com",
		"password":  "Password123!",
		"full_name": "Dev User",
		"is_admin":  false,
	}
	createBytes, _ := json.Marshal(createUserBody)
	reqCreate := httptest.NewRequest("POST", "/api/v1/admin/users", bytes.NewReader(createBytes))
	reqCreate.Header.Set("Authorization", "Bearer "+token)
	reqCreate.Header.Set("Content-Type", "application/json")
	recCreate := httptest.NewRecorder()
	router.ServeHTTP(recCreate, reqCreate)

	if recCreate.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created from admin user create, got %d: %s", recCreate.Code, recCreate.Body.String())
	}

	// 4. Admin maintenance (checkpoint WAL)
	maintBody := map[string]string{"operation": "checkpoint_wal"}
	maintBytes, _ := json.Marshal(maintBody)
	reqMaint := httptest.NewRequest("POST", "/api/v1/admin/maintenance", bytes.NewReader(maintBytes))
	reqMaint.Header.Set("Authorization", "Bearer "+token)
	reqMaint.Header.Set("Content-Type", "application/json")
	recMaint := httptest.NewRecorder()
	router.ServeHTTP(recMaint, reqMaint)

	if recMaint.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for maintenance, got %d: %s", recMaint.Code, recMaint.Body.String())
	}
}

func TestWikiAndPagesWorkflow(t *testing.T) {
	router, cleanup := setupTestRouter(t)
	defer cleanup()

	// 1. Register user
	body := map[string]string{
		"username":  "alice",
		"email":     "alice@example.com",
		"password":  "password123",
		"full_name": "Alice Developer",
	}
	bodyBytes, _ := json.Marshal(body)
	req := httptest.NewRequest("POST", "/api/v1/auth/register", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d: %s", rec.Code, rec.Body.String())
	}

	var regRes map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &regRes)
	token := regRes["token"].(string)

	// 2. Create repository with AutoInit
	createRepoBody := map[string]any{
		"name":        "wiki-demo",
		"description": "Demo repo for wiki and pages",
		"private":     false,
		"auto_init":   true,
	}
	createRepoBytes, _ := json.Marshal(createRepoBody)
	reqRepo := httptest.NewRequest("POST", "/api/v1/repos", bytes.NewReader(createRepoBytes))
	reqRepo.Header.Set("Authorization", "Bearer "+token)
	reqRepo.Header.Set("Content-Type", "application/json")
	recRepo := httptest.NewRecorder()
	router.ServeHTTP(recRepo, reqRepo)
	if recRepo.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for repo, got %d: %s", recRepo.Code, recRepo.Body.String())
	}

	// 3. Save a Wiki Page
	wikiPageBody := map[string]string{
		"slug":    "Architecture",
		"title":   "System Architecture",
		"content": "# System Architecture\n\nDetailed system overview.",
		"message": "Create architecture doc",
	}
	wikiPageBytes, _ := json.Marshal(wikiPageBody)
	reqWikiSave := httptest.NewRequest("POST", "/api/v1/repos/alice/wiki-demo/wiki/pages", bytes.NewReader(wikiPageBytes))
	reqWikiSave.Header.Set("Authorization", "Bearer "+token)
	reqWikiSave.Header.Set("Content-Type", "application/json")
	recWikiSave := httptest.NewRecorder()
	router.ServeHTTP(recWikiSave, reqWikiSave)
	if recWikiSave.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for wiki save, got %d: %s", recWikiSave.Code, recWikiSave.Body.String())
	}

	// 4. List Wiki Pages
	reqWikiList := httptest.NewRequest("GET", "/api/v1/repos/alice/wiki-demo/wiki/pages", nil)
	recWikiList := httptest.NewRecorder()
	router.ServeHTTP(recWikiList, reqWikiList)
	if recWikiList.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for wiki list, got %d: %s", recWikiList.Code, recWikiList.Body.String())
	}

	var pages []map[string]any
	_ = json.Unmarshal(recWikiList.Body.Bytes(), &pages)
	if len(pages) == 0 {
		t.Fatalf("expected at least 1 wiki page, got 0")
	}

	// 5. Get Wiki Page
	reqWikiGet := httptest.NewRequest("GET", "/api/v1/repos/alice/wiki-demo/wiki/pages/Architecture", nil)
	recWikiGet := httptest.NewRecorder()
	router.ServeHTTP(recWikiGet, reqWikiGet)
	if recWikiGet.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for wiki get, got %d: %s", recWikiGet.Code, recWikiGet.Body.String())
	}

	// 6. Wiki History
	reqWikiHist := httptest.NewRequest("GET", "/api/v1/repos/alice/wiki-demo/wiki/pages/Architecture/history", nil)
	recWikiHist := httptest.NewRecorder()
	router.ServeHTTP(recWikiHist, reqWikiHist)
	if recWikiHist.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for wiki history, got %d: %s", recWikiHist.Code, recWikiHist.Body.String())
	}

	// 7. Enable Pages & Configure
	pagesConfigBody := map[string]any{
		"enable_pages": true,
		"pages_branch": "main",
		"pages_folder": "/",
	}
	pagesConfigBytes, _ := json.Marshal(pagesConfigBody)
	reqPagesConfig := httptest.NewRequest("POST", "/api/v1/repos/alice/wiki-demo/pages", bytes.NewReader(pagesConfigBytes))
	reqPagesConfig.Header.Set("Authorization", "Bearer "+token)
	reqPagesConfig.Header.Set("Content-Type", "application/json")
	recPagesConfig := httptest.NewRecorder()
	router.ServeHTTP(recPagesConfig, reqPagesConfig)
	if recPagesConfig.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for pages config update, got %d: %s", recPagesConfig.Code, recPagesConfig.Body.String())
	}

	// 8. Serve Pages: GET /pages/alice/wiki-demo/ (falls back to README.md in main branch)
	reqServePages := httptest.NewRequest("GET", "/pages/alice/wiki-demo/", nil)
	recServePages := httptest.NewRecorder()
	router.ServeHTTP(recServePages, reqServePages)
	if recServePages.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for serve pages, got %d: %s", recServePages.Code, recServePages.Body.String())
	}
	if !bytes.Contains(recServePages.Body.Bytes(), []byte("wiki-demo")) {
		t.Errorf("expected page output to contain 'wiki-demo', got %s", recServePages.Body.String())
	}
}

func TestPermissionsAndSecurity(t *testing.T) {
	router, cleanup := setupTestRouter(t)
	defer cleanup()

	// 1. Create two users: owner and stranger
	owner, _ := database.CreateUser("owner-user", "owner@example.com", "hash", "Owner", false)
	stranger, _ := database.CreateUser("stranger-user", "stranger@example.com", "hash", "Stranger", false)

	tokOwner, _ := database.CreateAccessToken(owner.ID, "tok-owner", "pgt_owner_token_12345", "repo,user")
	tokStranger, _ := database.CreateAccessToken(stranger.ID, "tok-stranger", "pgt_stranger_token_12345", "repo,user")
	_ = tokOwner
	_ = tokStranger

	// Create repository for owner
	repo, err := database.CreateRepository(owner.ID, "secure-vault", "Confidential repo", true)
	if err != nil {
		t.Fatalf("failed to create repo: %v", err)
	}

	// 2. Unauthenticated write attempt to /contents/test.txt -> 401
	fileBody := map[string]any{
		"branch":  "main",
		"content": "Secret content",
		"message": "Unauthenticated file creation",
	}
	fBytes, _ := json.Marshal(fileBody)

	reqUnauth := httptest.NewRequest("POST", "/api/v1/repos/owner-user/secure-vault/contents/test.txt", bytes.NewReader(fBytes))
	reqUnauth.Header.Set("Content-Type", "application/json")
	recUnauth := httptest.NewRecorder()
	router.ServeHTTP(recUnauth, reqUnauth)

	if recUnauth.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 Unauthorized for unauthenticated write, got %d", recUnauth.Code)
	}

	// 3. Stranger write attempt without permission -> 403 Forbidden
	reqStranger := httptest.NewRequest("POST", "/api/v1/repos/owner-user/secure-vault/contents/test.txt", bytes.NewReader(fBytes))
	reqStranger.Header.Set("Authorization", "Bearer pgt_stranger_token_12345")
	reqStranger.Header.Set("Content-Type", "application/json")
	recStranger := httptest.NewRecorder()
	router.ServeHTTP(recStranger, reqStranger)

	if recStranger.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden for stranger write, got %d", recStranger.Code)
	}

	// 4. Add stranger as collaborator with write mode
	reqAddCollab := httptest.NewRequest("PUT", "/api/v1/repos/owner-user/secure-vault/collaborators/stranger-user", bytes.NewReader([]byte(`{"mode":"write"}`)))
	reqAddCollab.Header.Set("Authorization", "Bearer pgt_owner_token_12345")
	reqAddCollab.Header.Set("Content-Type", "application/json")
	recAddCollab := httptest.NewRecorder()
	router.ServeHTTP(recAddCollab, reqAddCollab)

	if recAddCollab.Code != http.StatusOK {
		t.Fatalf("expected 200 OK adding collaborator, got %d: %s", recAddCollab.Code, recAddCollab.Body.String())
	}

	// Verify stranger now has write access in repo data
	reqGetRepo := httptest.NewRequest("GET", "/api/v1/repos/owner-user/secure-vault", nil)
	reqGetRepo.Header.Set("Authorization", "Bearer pgt_stranger_token_12345")
	recGetRepo := httptest.NewRecorder()
	router.ServeHTTP(recGetRepo, reqGetRepo)

	if recGetRepo.Code != http.StatusOK {
		t.Fatalf("expected 200 OK getting repo, got %d", recGetRepo.Code)
	}
	var repoRes map[string]any
	_ = json.Unmarshal(recGetRepo.Body.Bytes(), &repoRes)
	if repoRes["can_write"] != true {
		t.Errorf("expected can_write: true for collaborator with write mode, got %v", repoRes["can_write"])
	}

	_ = repo
}

func TestOrganizationsAndProjectsAPI(t *testing.T) {
	router, cleanup := setupTestRouter(t)
	defer cleanup()

	user, _ := database.CreateUser("org-creator", "creator@example.com", "hash", "Creator", false)
	_, _ = database.CreateAccessToken(user.ID, "tok", "pgt_org_creator_token_12345", "repo,user")

	// 1. Create Organization via API
	orgPayload := map[string]any{
		"name":        "google-open-source",
		"full_name":   "Google Open Source",
		"description": "Open source projects from Google",
		"location":    "Mountain View, CA",
		"website":     "https://opensource.google",
	}
	orgBytes, _ := json.Marshal(orgPayload)
	reqOrg := httptest.NewRequest("POST", "/api/v1/orgs", bytes.NewReader(orgBytes))
	reqOrg.Header.Set("Authorization", "Bearer pgt_org_creator_token_12345")
	reqOrg.Header.Set("Content-Type", "application/json")
	recOrg := httptest.NewRecorder()
	router.ServeHTTP(recOrg, reqOrg)

	if recOrg.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for org, got %d: %s", recOrg.Code, recOrg.Body.String())
	}

	// 2. Create Project on a repo
	repo, _ := database.CreateRepository(user.ID, "test-board-repo", "", false)
	_ = repo

	projPayload := map[string]any{
		"title":       "2026 Engineering Goals",
		"description": "Visual Kanban Roadmap",
	}
	projBytes, _ := json.Marshal(projPayload)
	reqProj := httptest.NewRequest("POST", "/api/v1/repos/org-creator/test-board-repo/projects", bytes.NewReader(projBytes))
	reqProj.Header.Set("Authorization", "Bearer pgt_org_creator_token_12345")
	reqProj.Header.Set("Content-Type", "application/json")
	recProj := httptest.NewRecorder()
	router.ServeHTTP(recProj, reqProj)

	if recProj.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for project, got %d: %s", recProj.Code, recProj.Body.String())
	}

	var proj database.Project
	_ = json.Unmarshal(recProj.Body.Bytes(), &proj)
	if proj.Title != "2026 Engineering Goals" || len(proj.Columns) != 3 {
		t.Errorf("unexpected project: %+v", proj)
	}

	// 3. Create Card in column 1
	cardPayload := map[string]any{
		"column_id": proj.Columns[0].ID,
		"content":   "Write unit test suites",
		"order_num": 1,
	}
	cardBytes, _ := json.Marshal(cardPayload)
	reqCard := httptest.NewRequest("POST", "/api/v1/repos/org-creator/test-board-repo/projects/1/cards", bytes.NewReader(cardBytes))
	reqCard.Header.Set("Authorization", "Bearer pgt_org_creator_token_12345")
	reqCard.Header.Set("Content-Type", "application/json")
	recCard := httptest.NewRecorder()
	router.ServeHTTP(recCard, reqCard)

	if recCard.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for card, got %d: %s", recCard.Code, recCard.Body.String())
	}

	// 4. List Projects
	reqList := httptest.NewRequest("GET", "/api/v1/repos/org-creator/test-board-repo/projects", nil)
	recList := httptest.NewRecorder()
	router.ServeHTTP(recList, reqList)

	if recList.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for list projects, got %d", recList.Code)
	}
}

func TestUserSettingsAndProfileOverview(t *testing.T) {
	router, _ := setupTestRouter(t)

	// 1. Create a user
	pwdHash, _ := auth.HashPassword("Password123!")
	u, err := database.CreateUser("settings_user", "settings@example.com", pwdHash, "Settings User", false)
	if err != nil {
		t.Fatalf("create user failed: %v", err)
	}
	_, _ = database.CreateAccessToken(u.ID, "settings-token", "pgt_settings_token_12345", "repo,user")

	// 2. Verify empty keys return `[]` not `null`
	reqKeys := httptest.NewRequest("GET", "/api/v1/user/keys", nil)
	reqKeys.Header.Set("Authorization", "Bearer pgt_settings_token_12345")
	recKeys := httptest.NewRecorder()
	router.ServeHTTP(recKeys, reqKeys)
	if recKeys.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recKeys.Code)
	}
	if strings.TrimSpace(recKeys.Body.String()) != "[]" {
		t.Errorf("expected empty array `[]` for keys, got %s", recKeys.Body.String())
	}

	// 3. Update Profile Settings
	settingsPayload := map[string]any{
		"full_name":  "Updated Settings User",
		"bio":        "Building open source software with ProGit",
		"location":   "Seattle, WA",
		"website":    "https://example.com/settings",
		"avatar_url": "https://example.com/avatar.png",
	}
	sBytes, _ := json.Marshal(settingsPayload)
	reqUpdate := httptest.NewRequest("PUT", "/api/v1/user/settings", bytes.NewReader(sBytes))
	reqUpdate.Header.Set("Authorization", "Bearer pgt_settings_token_12345")
	reqUpdate.Header.Set("Content-Type", "application/json")
	recUpdate := httptest.NewRecorder()
	router.ServeHTTP(recUpdate, reqUpdate)

	if recUpdate.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for update settings, got %d: %s", recUpdate.Code, recUpdate.Body.String())
	}

	// 4. Update Password
	pwdPayload := map[string]any{
		"old_password": "Password123!",
		"new_password": "NewSecretPassword2026!",
	}
	pBytes, _ := json.Marshal(pwdPayload)
	reqPwd := httptest.NewRequest("PUT", "/api/v1/user/password", bytes.NewReader(pBytes))
	reqPwd.Header.Set("Authorization", "Bearer pgt_settings_token_12345")
	reqPwd.Header.Set("Content-Type", "application/json")
	recPwd := httptest.NewRecorder()
	router.ServeHTTP(recPwd, reqPwd)

	if recPwd.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for update password, got %d: %s", recPwd.Code, recPwd.Body.String())
	}

	// 5. Verify User Profile Overview
	reqProfile := httptest.NewRequest("GET", "/api/v1/users/settings_user", nil)
	recProfile := httptest.NewRecorder()
	router.ServeHTTP(recProfile, reqProfile)

	if recProfile.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for profile, got %d", recProfile.Code)
	}

	var profMap map[string]any
	_ = json.Unmarshal(recProfile.Body.Bytes(), &profMap)
	userObj := profMap["user"].(map[string]any)
	if userObj["full_name"] != "Updated Settings User" || userObj["location"] != "Seattle, WA" {
		t.Errorf("unexpected profile data: %+v", userObj)
	}
}

func TestBranchManagementAndDetails(t *testing.T) {
	router, cfg := setupTestRouter(t)

	// 1. Create a user and repo with README
	pwdHash, _ := auth.HashPassword("BranchPass123!")
	u, err := database.CreateUser("branch_user", "branch@example.com", pwdHash, "Branch Master", false)
	if err != nil {
		t.Fatalf("create user failed: %v", err)
	}
	tokenStr := "pgt_branch_token_9999"
	_, _ = database.CreateAccessToken(u.ID, "branch-token", tokenStr, "repo")

	repoPayload := map[string]any{
		"name":        "branch-repo",
		"description": "Testing UI branch management",
		"private":     false,
		"auto_init":   true,
	}
	rBytes, _ := json.Marshal(repoPayload)
	reqRepo := httptest.NewRequest("POST", "/api/v1/repos", bytes.NewReader(rBytes))
	reqRepo.Header.Set("Authorization", "Bearer "+tokenStr)
	reqRepo.Header.Set("Content-Type", "application/json")
	recRepo := httptest.NewRecorder()
	router.ServeHTTP(recRepo, reqRepo)
	if recRepo.Code != http.StatusCreated {
		t.Fatalf("expected 201 for repo creation, got %d: %s", recRepo.Code, recRepo.Body.String())
	}

	// 2. List Branches (default format: string array)
	reqList := httptest.NewRequest("GET", "/api/v1/repos/branch_user/branch-repo/branches", nil)
	recList := httptest.NewRecorder()
	router.ServeHTTP(recList, reqList)
	if recList.Code != http.StatusOK {
		t.Fatalf("expected 200 for branch list, got %d", recList.Code)
	}
	var branches []string
	if err := json.Unmarshal(recList.Body.Bytes(), &branches); err != nil {
		t.Fatalf("failed to decode branches array: %v", err)
	}
	if len(branches) != 1 || branches[0] != "main" {
		t.Fatalf("expected ['main'], got %v", branches)
	}

	// 3. List Branches with ?detail=true
	reqDetails := httptest.NewRequest("GET", "/api/v1/repos/branch_user/branch-repo/branches?detail=true", nil)
	recDetails := httptest.NewRecorder()
	router.ServeHTTP(recDetails, reqDetails)
	if recDetails.Code != http.StatusOK {
		t.Fatalf("expected 200 for branch details, got %d", recDetails.Code)
	}
	var details []git.BranchDetail
	if err := json.Unmarshal(recDetails.Body.Bytes(), &details); err != nil {
		t.Fatalf("failed to decode branch details: %v", err)
	}
	if len(details) != 1 || details[0].Name != "main" || !details[0].IsDefault || details[0].CommitSHA == "" {
		t.Fatalf("unexpected branch details: %+v", details)
	}

	// 4. Create new branch `feature-payment` based on `main`
	createPayload := map[string]any{
		"branch_name": "feature-payment",
		"base_ref":    "main",
	}
	cBytes, _ := json.Marshal(createPayload)
	reqCreate := httptest.NewRequest("POST", "/api/v1/repos/branch_user/branch-repo/branches", bytes.NewReader(cBytes))
	reqCreate.Header.Set("Authorization", "Bearer "+tokenStr)
	reqCreate.Header.Set("Content-Type", "application/json")
	recCreate := httptest.NewRecorder()
	router.ServeHTTP(recCreate, reqCreate)
	if recCreate.Code != http.StatusCreated {
		t.Fatalf("expected 201 for branch create, got %d: %s", recCreate.Code, recCreate.Body.String())
	}

	// 5. Create another branch `staging`
	createStaging := map[string]any{
		"branch_name": "staging",
		"base_ref":    "main",
	}
	sBytes, _ := json.Marshal(createStaging)
	reqStaging := httptest.NewRequest("POST", "/api/v1/repos/branch_user/branch-repo/branches", bytes.NewReader(sBytes))
	reqStaging.Header.Set("Authorization", "Bearer "+tokenStr)
	reqStaging.Header.Set("Content-Type", "application/json")
	recStaging := httptest.NewRecorder()
	router.ServeHTTP(recStaging, reqStaging)
	if recStaging.Code != http.StatusCreated {
		t.Fatalf("expected 201 for staging branch, got %d: %s", recStaging.Code, recStaging.Body.String())
	}

	// 6. Verify branches list contains all 3
	recList2 := httptest.NewRecorder()
	router.ServeHTTP(recList2, reqList)
	var branches2 []string
	_ = json.Unmarshal(recList2.Body.Bytes(), &branches2)
	if len(branches2) != 3 {
		t.Fatalf("expected 3 branches, got %v", branches2)
	}

	// 7. Verify cannot delete default branch `main`
	reqDelMain := httptest.NewRequest("DELETE", "/api/v1/repos/branch_user/branch-repo/branches/main", nil)
	reqDelMain.Header.Set("Authorization", "Bearer "+tokenStr)
	recDelMain := httptest.NewRecorder()
	router.ServeHTTP(recDelMain, reqDelMain)
	if recDelMain.Code != http.StatusBadRequest {
		t.Errorf("expected 400 when deleting default branch, got %d", recDelMain.Code)
	}

	// 8. Delete non-default branch `feature-payment`
	reqDelFeat := httptest.NewRequest("DELETE", "/api/v1/repos/branch_user/branch-repo/branches/feature-payment", nil)
	reqDelFeat.Header.Set("Authorization", "Bearer "+tokenStr)
	recDelFeat := httptest.NewRecorder()
	router.ServeHTTP(recDelFeat, reqDelFeat)
	if recDelFeat.Code != http.StatusOK {
		t.Fatalf("expected 200 when deleting branch, got %d: %s", recDelFeat.Code, recDelFeat.Body.String())
	}

	// 9. Verify branch count is back to 2 (main, staging)
	recList3 := httptest.NewRecorder()
	router.ServeHTTP(recList3, reqList)
	var branches3 []string
	_ = json.Unmarshal(recList3.Body.Bytes(), &branches3)
	if len(branches3) != 2 {
		t.Fatalf("expected 2 branches after deletion, got %v", branches3)
	}

	_ = cfg
}



