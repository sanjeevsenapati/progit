package api

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
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

	database.AllowPrivateWebhookHosts = true
	git.AllowLocalRepoImport = true

	router := NewRouter(cfg)

	cleanup := func() {
		database.AllowPrivateWebhookHosts = false
		git.AllowLocalRepoImport = false
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

	// 2.1 Verify install endpoints are strictly LOCKED once installed
	reqStatusLocked := httptest.NewRequest("GET", "/api/v1/install/status", nil)
	recStatusLocked := httptest.NewRecorder()
	router.ServeHTTP(recStatusLocked, reqStatusLocked)
	if recStatusLocked.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for install status after installation, got %d", recStatusLocked.Code)
	}

	reqInstallLocked := httptest.NewRequest("POST", "/api/v1/install", bytes.NewReader(installBytes))
	reqInstallLocked.Header.Set("Content-Type", "application/json")
	recInstallLocked := httptest.NewRecorder()
	router.ServeHTTP(recInstallLocked, reqInstallLocked)
	if recInstallLocked.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for POST install after installation, got %d", recInstallLocked.Code)
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

	// 2b. Verify First-Time Wiki Experience:
	// Prior to saving any page, listing pages returns an empty slice (not auto-creating default files)
	reqWikiInitList := httptest.NewRequest("GET", "/api/v1/repos/alice/wiki-demo/wiki/pages", nil)
	recWikiInitList := httptest.NewRecorder()
	router.ServeHTTP(recWikiInitList, reqWikiInitList)
	if recWikiInitList.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for initial wiki list, got %d: %s", recWikiInitList.Code, recWikiInitList.Body.String())
	}
	var initPages []map[string]any
	_ = json.Unmarshal(recWikiInitList.Body.Bytes(), &initPages)
	if len(initPages) != 0 {
		t.Fatalf("expected 0 wiki pages before creation, got %d", len(initPages))
	}

	// Also verify requesting non-existent page returns 404 Not Found without creating repos
	reqWikiInitGet := httptest.NewRequest("GET", "/api/v1/repos/alice/wiki-demo/wiki/pages/Home", nil)
	recWikiInitGet := httptest.NewRecorder()
	router.ServeHTTP(recWikiInitGet, reqWikiInitGet)
	if recWikiInitGet.Code != http.StatusNotFound {
		t.Fatalf("expected 404 Not Found for non-existent initial wiki page, got %d: %s", recWikiInitGet.Code, recWikiInitGet.Body.String())
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

	// 6b. Test Repository Wiki Enable/Disable Settings Toggle
	// Disable wiki via repo settings PATCH
	disableWikiBody := map[string]any{"enable_wiki": false}
	disableWikiBytes, _ := json.Marshal(disableWikiBody)
	reqDisableWiki := httptest.NewRequest("PATCH", "/api/v1/repos/alice/wiki-demo/settings", bytes.NewReader(disableWikiBytes))
	reqDisableWiki.Header.Set("Authorization", "Bearer "+token)
	reqDisableWiki.Header.Set("Content-Type", "application/json")
	recDisableWiki := httptest.NewRecorder()
	router.ServeHTTP(recDisableWiki, reqDisableWiki)
	if recDisableWiki.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for repo settings update, got %d: %s", recDisableWiki.Code, recDisableWiki.Body.String())
	}

	// Endpoints must now return 403 Forbidden
	reqWikiDisabledList := httptest.NewRequest("GET", "/api/v1/repos/alice/wiki-demo/wiki/pages", nil)
	recWikiDisabledList := httptest.NewRecorder()
	router.ServeHTTP(recWikiDisabledList, reqWikiDisabledList)
	if recWikiDisabledList.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for wiki list when disabled, got %d", recWikiDisabledList.Code)
	}

	reqWikiDisabledGet := httptest.NewRequest("GET", "/api/v1/repos/alice/wiki-demo/wiki/pages/Architecture", nil)
	recWikiDisabledGet := httptest.NewRecorder()
	router.ServeHTTP(recWikiDisabledGet, reqWikiDisabledGet)
	if recWikiDisabledGet.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for wiki get when disabled, got %d", recWikiDisabledGet.Code)
	}

	reqWikiDisabledSave := httptest.NewRequest("POST", "/api/v1/repos/alice/wiki-demo/wiki/pages", bytes.NewReader(wikiPageBytes))
	reqWikiDisabledSave.Header.Set("Authorization", "Bearer "+token)
	reqWikiDisabledSave.Header.Set("Content-Type", "application/json")
	recWikiDisabledSave := httptest.NewRecorder()
	router.ServeHTTP(recWikiDisabledSave, reqWikiDisabledSave)
	if recWikiDisabledSave.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for wiki save when disabled, got %d", recWikiDisabledSave.Code)
	}

	// Re-enable wiki via repo settings PATCH
	enableWikiBody := map[string]any{"enable_wiki": true}
	enableWikiBytes, _ := json.Marshal(enableWikiBody)
	reqEnableWiki := httptest.NewRequest("PATCH", "/api/v1/repos/alice/wiki-demo/settings", bytes.NewReader(enableWikiBytes))
	reqEnableWiki.Header.Set("Authorization", "Bearer "+token)
	reqEnableWiki.Header.Set("Content-Type", "application/json")
	recEnableWiki := httptest.NewRecorder()
	router.ServeHTTP(recEnableWiki, reqEnableWiki)
	if recEnableWiki.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for repo settings update re-enabling wiki, got %d: %s", recEnableWiki.Code, recEnableWiki.Body.String())
	}

	// Verify endpoints are accessible again
	reqWikiReenabledList := httptest.NewRequest("GET", "/api/v1/repos/alice/wiki-demo/wiki/pages", nil)
	recWikiReenabledList := httptest.NewRecorder()
	router.ServeHTTP(recWikiReenabledList, reqWikiReenabledList)
	if recWikiReenabledList.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for wiki list after re-enabling, got %d", recWikiReenabledList.Code)
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

	// 9. Redirect without trailing slash: GET /pages/alice/wiki-demo -> 301
	reqRedirect := httptest.NewRequest("GET", "/pages/alice/wiki-demo", nil)
	recRedirect := httptest.NewRecorder()
	router.ServeHTTP(recRedirect, reqRedirect)
	if recRedirect.Code != http.StatusMovedPermanently {
		t.Errorf("expected 301 Moved Permanently, got %d", recRedirect.Code)
	}
	if recRedirect.Header().Get("Location") != "/pages/alice/wiki-demo/" {
		t.Errorf("expected Location /pages/alice/wiki-demo/, got %s", recRedirect.Header().Get("Location"))
	}

	// 10. Test Smart Branch Fallback: set pages_branch to nonexistent 'gh-pages'
	badBranchBody := map[string]any{
		"enable_pages": true,
		"pages_branch": "gh-pages",
		"pages_folder": "/",
	}
	badBranchBytes, _ := json.Marshal(badBranchBody)
	reqBadBranch := httptest.NewRequest("POST", "/api/v1/repos/alice/wiki-demo/pages", bytes.NewReader(badBranchBytes))
	reqBadBranch.Header.Set("Authorization", "Bearer "+token)
	reqBadBranch.Header.Set("Content-Type", "application/json")
	recBadBranch := httptest.NewRecorder()
	router.ServeHTTP(recBadBranch, reqBadBranch)
	if recBadBranch.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for pages config, got %d", recBadBranch.Code)
	}

	// Now fetch /pages/alice/wiki-demo/ - must fall back to 'main' and return 200 OK, NOT 404!
	reqFallback := httptest.NewRequest("GET", "/pages/alice/wiki-demo/", nil)
	recFallback := httptest.NewRecorder()
	router.ServeHTTP(recFallback, reqFallback)
	if recFallback.Code != http.StatusOK {
		t.Fatalf("expected 200 OK with branch fallback, got %d: %s", recFallback.Code, recFallback.Body.String())
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

	// 1b. Update Organization via PATCH /api/v1/orgs/{org}
	patchPayload := map[string]any{
		"full_name":   "Google Open Source Initiative",
		"description": "Updated description for Google Open Source",
		"location":    "San Francisco, CA",
		"website":     "https://opensource.google/about",
	}
	patchBytes, _ := json.Marshal(patchPayload)
	reqPatch := httptest.NewRequest("PATCH", "/api/v1/orgs/google-open-source", bytes.NewReader(patchBytes))
	reqPatch.Header.Set("Authorization", "Bearer pgt_org_creator_token_12345")
	reqPatch.Header.Set("Content-Type", "application/json")
	recPatch := httptest.NewRecorder()
	router.ServeHTTP(recPatch, reqPatch)

	if recPatch.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for patch org, got %d: %s", recPatch.Code, recPatch.Body.String())
	}
	var patchResp struct {
		Organization database.Organization `json:"organization"`
	}
	_ = json.Unmarshal(recPatch.Body.Bytes(), &patchResp)
	if patchResp.Organization.FullName != "Google Open Source Initiative" || patchResp.Organization.Location != "San Francisco, CA" {
		t.Errorf("unexpected patched org fields: %+v", patchResp.Organization)
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

func TestHTTPSConfigurationAndHeaders(t *testing.T) {
	router, cleanup := setupTestRouter(t)
	defer cleanup()

	// 1. Enable HTTPS on router config
	router.cfg.Server.Protocol = "https"
	router.cfg.Server.HTTPSPort = 3443
	router.cfg.Server.HSTSMaxAge = 31536000

	// 2. Request /api/health should have Strict-Transport-Security header
	req := httptest.NewRequest("GET", "/api/health", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rec.Code)
	}

	hsts := rec.Header().Get("Strict-Transport-Security")
	if hsts != "max-age=31536000; includeSubDomains; preload" {
		t.Errorf("expected HSTS header, got %q", hsts)
	}

	// 3. Install wizard with HTTPS protocol and port
	installBody := map[string]any{
		"app_name":       "ProGit Secure",
		"domain":         "secure.git.local",
		"http_port":      3000,
		"https_port":     3443,
		"protocol":       "https",
		"root_url":       "https://secure.git.local:3443/",
		"admin_username": "secadmin",
		"admin_email":    "secadmin@example.com",
		"admin_password": "Password123456!",
	}
	bodyBytes, _ := json.Marshal(installBody)
	reqInstall := httptest.NewRequest("POST", "/api/v1/install", bytes.NewReader(bodyBytes))
	reqInstall.Header.Set("Content-Type", "application/json")
	recInstall := httptest.NewRecorder()
	router.ServeHTTP(recInstall, reqInstall)

	if recInstall.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for install, got %d: %s", recInstall.Code, recInstall.Body.String())
	}

	// Verify CookieSecure is true
	if !router.cfg.Security.CookieSecure {
		t.Errorf("expected CookieSecure to be true when Protocol is https")
	}

	// Verify session cookie has Secure attribute
	cookies := recInstall.Result().Cookies()
	var sessionCookie *http.Cookie
	for _, c := range cookies {
		if c.Name == auth.SessionCookieName {
			sessionCookie = c
			break
		}
	}
	if sessionCookie == nil {
		t.Fatalf("session cookie not found")
	}
	if !sessionCookie.Secure {
		t.Errorf("expected session cookie to have Secure=true")
	}

	var installRes map[string]any
	_ = json.Unmarshal(recInstall.Body.Bytes(), &installRes)
	token := installRes["token"].(string)

	// 4. Admin stats should reflect HTTPS parameters
	reqStats := httptest.NewRequest("GET", "/api/v1/admin/stats", nil)
	reqStats.Header.Set("Authorization", "Bearer "+token)
	recStats := httptest.NewRecorder()
	router.ServeHTTP(recStats, reqStats)

	if recStats.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for stats, got %d: %s", recStats.Code, recStats.Body.String())
	}

	var stats map[string]any
	_ = json.Unmarshal(recStats.Body.Bytes(), &stats)
	if stats["is_https"] != true {
		t.Errorf("expected is_https true, got %v", stats["is_https"])
	}
	if stats["protocol"] != "https" {
		t.Errorf("expected protocol https, got %v", stats["protocol"])
	}
	if stats["https_port"] != float64(3443) {
		t.Errorf("expected https_port 3443, got %v", stats["https_port"])
	}
}

func TestForksAPI(t *testing.T) {
	router, cleanup := setupTestRouter(t)
	defer cleanup()

	// Register User 1 (Alice)
	user1, err := database.CreateUser("alice", "alice@example.com", "password123", "Alice", false)
	if err != nil {
		t.Fatalf("failed to create user1: %v", err)
	}
	sess1, err := auth.CreateSession(user1.ID, user1.Username)
	if err != nil {
		t.Fatalf("failed to create session1: %v", err)
	}
	token1 := sess1.Token

	// Register User 2 (Bob)
	user2, err := database.CreateUser("bob", "bob@example.com", "password123", "Bob", false)
	if err != nil {
		t.Fatalf("failed to create user2: %v", err)
	}
	sess2, err := auth.CreateSession(user2.ID, user2.Username)
	if err != nil {
		t.Fatalf("failed to create session2: %v", err)
	}
	token2 := sess2.Token

	// Alice creates a repo
	repoDir := filepath.Join(router.cfg.Repository.Root, user1.Username, "source-repo.git")
	_ = os.MkdirAll(filepath.Dir(repoDir), 0755)
	if err := git.InitBareRepository(repoDir, "main"); err != nil {
		t.Fatalf("failed to init bare repo: %v", err)
	}
	parentRepo, err := database.CreateRepository(user1.ID, "source-repo", "Original repository", false)
	if err != nil {
		t.Fatalf("failed to create parent repo in DB: %v", err)
	}

	// 1. Bob forks Alice's repo
	forkPayload := map[string]string{
		"name": "source-repo",
	}
	b, _ := json.Marshal(forkPayload)
	reqFork := httptest.NewRequest("POST", "/api/v1/repos/alice/source-repo/forks", bytes.NewReader(b))
	reqFork.Header.Set("Authorization", "Bearer "+token2)
	reqFork.Header.Set("Content-Type", "application/json")
	recFork := httptest.NewRecorder()
	router.ServeHTTP(recFork, reqFork)

	if recFork.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for fork, got %d: %s", recFork.Code, recFork.Body.String())
	}

	var forked database.Repository
	if err := json.Unmarshal(recFork.Body.Bytes(), &forked); err != nil {
		t.Fatalf("failed to decode fork response: %v", err)
	}
	if !forked.IsFork || forked.ForkParentID == nil || *forked.ForkParentID != parentRepo.ID {
		t.Errorf("fork metadata mismatch: is_fork=%v, parent_id=%v", forked.IsFork, forked.ForkParentID)
	}

	// 2. Bob lists forks on Alice's repo
	reqList := httptest.NewRequest("GET", "/api/v1/repos/alice/source-repo/forks", nil)
	recList := httptest.NewRecorder()
	router.ServeHTTP(recList, reqList)

	if recList.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for list forks, got %d: %s", recList.Code, recList.Body.String())
	}
	var forks []database.Repository
	if err := json.Unmarshal(recList.Body.Bytes(), &forks); err != nil {
		t.Fatalf("failed to decode forks list: %v", err)
	}
	if len(forks) != 1 || forks[0].ID != forked.ID {
		t.Errorf("expected 1 fork with ID %d, got %v", forked.ID, forks)
	}

	// 3. Alice cannot fork her own repo into her personal account
	reqSelfFork := httptest.NewRequest("POST", "/api/v1/repos/alice/source-repo/forks", bytes.NewReader(b))
	reqSelfFork.Header.Set("Authorization", "Bearer "+token1)
	reqSelfFork.Header.Set("Content-Type", "application/json")
	recSelfFork := httptest.NewRecorder()
	router.ServeHTTP(recSelfFork, reqSelfFork)

	if recSelfFork.Code != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request for self fork, got %d", recSelfFork.Code)
	}
}

func TestPullReviewsAPI(t *testing.T) {
	router, cleanup := setupTestRouter(t)
	defer cleanup()

	// Register Alice and Bob
	alice, err := database.CreateUser("alice_pr", "alice_pr@example.com", "password123", "Alice PR", false)
	if err != nil {
		t.Fatalf("failed to create alice: %v", err)
	}
	bob, err := database.CreateUser("bob_pr", "bob_pr@example.com", "password123", "Bob PR", false)
	if err != nil {
		t.Fatalf("failed to create bob: %v", err)
	}
	sessBob, err := auth.CreateSession(bob.ID, bob.Username)
	if err != nil {
		t.Fatalf("failed to create session: %v", err)
	}
	tokenBob := sessBob.Token

	repo, err := database.CreateRepository(alice.ID, "pr-repo", "PR repo", false)
	if err != nil {
		t.Fatalf("failed to create repo: %v", err)
	}

	pr, err := database.CreatePullRequest(repo.ID, repo.ID, alice.ID, "Feature X", "PR description", "feature-x", "main")
	if err != nil {
		t.Fatalf("failed to create PR: %v", err)
	}

	// 1. Bob creates a review with APPROVE state
	reviewReq := map[string]string{
		"state": "APPROVED",
		"body":  "LGTM! Clean implementation.",
	}
	b, _ := json.Marshal(reviewReq)
	reqReview := httptest.NewRequest("POST", "/api/v1/repos/alice_pr/pr-repo/pulls/1/reviews", bytes.NewReader(b))
	reqReview.Header.Set("Authorization", "Bearer "+tokenBob)
	reqReview.Header.Set("Content-Type", "application/json")
	recReview := httptest.NewRecorder()
	router.ServeHTTP(recReview, reqReview)

	if recReview.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for review, got %d: %s", recReview.Code, recReview.Body.String())
	}
	var createdReview database.PullReview
	if err := json.Unmarshal(recReview.Body.Bytes(), &createdReview); err != nil {
		t.Fatalf("failed to decode created review: %v", err)
	}
	if createdReview.State != "APPROVED" || createdReview.ReviewerID != bob.ID {
		t.Errorf("review state mismatch: got state %s, reviewerID %d", createdReview.State, createdReview.ReviewerID)
	}

	// 2. Bob creates an inline line comment on the review
	commentReq := map[string]any{
		"review_id":   createdReview.ID,
		"file_path":   "src/main.go",
		"line_number": 10,
		"content":     "Consider adding a check for nil here.",
	}
	cb, _ := json.Marshal(commentReq)
	reqComment := httptest.NewRequest("POST", "/api/v1/repos/alice_pr/pr-repo/pulls/1/reviews/comments", bytes.NewReader(cb))
	reqComment.Header.Set("Authorization", "Bearer "+tokenBob)
	reqComment.Header.Set("Content-Type", "application/json")
	recComment := httptest.NewRecorder()
	router.ServeHTTP(recComment, reqComment)

	if recComment.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for review comment, got %d: %s", recComment.Code, recComment.Body.String())
	}

	// 3. List reviews for PR
	reqListReviews := httptest.NewRequest("GET", "/api/v1/repos/alice_pr/pr-repo/pulls/1/reviews", nil)
	recListReviews := httptest.NewRecorder()
	router.ServeHTTP(recListReviews, reqListReviews)

	if recListReviews.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for list reviews, got %d: %s", recListReviews.Code, recListReviews.Body.String())
	}
	var reviews []database.PullReview
	_ = json.Unmarshal(recListReviews.Body.Bytes(), &reviews)
	if len(reviews) != 1 || reviews[0].ID != createdReview.ID {
		t.Errorf("expected 1 review, got %d", len(reviews))
	}

	// 4. List review comments for PR
	reqListComments := httptest.NewRequest("GET", "/api/v1/repos/alice_pr/pr-repo/pulls/1/reviews/comments", nil)
	recListComments := httptest.NewRecorder()
	router.ServeHTTP(recListComments, reqListComments)

	if recListComments.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for list review comments, got %d: %s", recListComments.Code, recListComments.Body.String())
	}
	var comments []database.PullReviewComment
	_ = json.Unmarshal(recListComments.Body.Bytes(), &comments)
	if len(comments) != 1 || comments[0].LineNumber != 10 || comments[0].FilePath != "src/main.go" {
		t.Errorf("expected 1 comment on line 10 src/main.go, got %v", comments)
	}

	// 5. Test Public Pull Request Visibility (without login)
	reqPublicPulls := httptest.NewRequest("GET", "/api/v1/repos/alice_pr/pr-repo/pulls", nil)
	recPublicPulls := httptest.NewRecorder()
	router.ServeHTTP(recPublicPulls, reqPublicPulls)
	if recPublicPulls.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for public unauthenticated pulls list, got %d", recPublicPulls.Code)
	}

	reqPublicPullDetail := httptest.NewRequest("GET", "/api/v1/repos/alice_pr/pr-repo/pulls/1", nil)
	recPublicPullDetail := httptest.NewRecorder()
	router.ServeHTTP(recPublicPullDetail, reqPublicPullDetail)
	if recPublicPullDetail.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for public unauthenticated pull detail, got %d", recPublicPullDetail.Code)
	}

	// 6. Test Merge Permissions
	// 6.1 Unauthenticated user cannot merge -> 401
	reqMergeAnon := httptest.NewRequest("POST", "/api/v1/repos/alice_pr/pr-repo/pulls/1/merge", bytes.NewReader([]byte(`{"merge_style":"merge"}`)))
	recMergeAnon := httptest.NewRecorder()
	router.ServeHTTP(recMergeAnon, reqMergeAnon)
	if recMergeAnon.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized for anonymous merge attempt, got %d", recMergeAnon.Code)
	}

	// 6.2 Non-collaborator, non-requester user cannot merge -> 403
	reqMergeBob := httptest.NewRequest("POST", "/api/v1/repos/alice_pr/pr-repo/pulls/1/merge", bytes.NewReader([]byte(`{"merge_style":"merge"}`)))
	reqMergeBob.Header.Set("Authorization", "Bearer "+tokenBob)
	reqMergeBob.Header.Set("Content-Type", "application/json")
	recMergeBob := httptest.NewRecorder()
	router.ServeHTTP(recMergeBob, reqMergeBob)
	if recMergeBob.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for non-collaborator/non-requester merge attempt, got %d: %s", recMergeBob.Code, recMergeBob.Body.String())
	}

	_ = pr
}

func TestIssueAssigneeAndFilter(t *testing.T) {
	router, cleanup := setupTestRouter(t)
	defer cleanup()

	// Register dev_alice, dev_bob, and dev_stranger
	uAlice, _ := database.CreateUser("dev_alice", "dev_alice@example.com", "hash", "Alice Developer", true)
	_, _ = database.CreateAccessToken(uAlice.ID, "tok", "pgt_alice_12345", "repo,user")
	tokenAlice := "pgt_alice_12345"

	uBob, _ := database.CreateUser("dev_bob", "dev_bob@example.com", "hash", "Bob Developer", false)
	_, _ = database.CreateAccessToken(uBob.ID, "tok", "pgt_bob_12345", "repo,user")

	uStranger, _ := database.CreateUser("dev_stranger", "stranger@example.com", "hash", "Stranger", false)
	_ = uStranger

	// Alice creates a repo
	repo, err := database.CreateRepository(uAlice.ID, "assignee-repo", "Testing issue assignments", false)
	if err != nil {
		t.Fatalf("failed to create repo: %v", err)
	}

	// 1. Security Check: Alice tries to assign dev_stranger (NOT a collaborator) -> must be rejected (400)
	strangerBody := map[string]any{
		"title":    "Fix security loophole",
		"content":  "Testing unauthorized assignment",
		"assignee": "dev_stranger",
	}
	scb, _ := json.Marshal(strangerBody)
	reqStranger := httptest.NewRequest("POST", "/api/v1/repos/dev_alice/assignee-repo/issues", bytes.NewReader(scb))
	reqStranger.Header.Set("Authorization", "Bearer "+tokenAlice)
	reqStranger.Header.Set("Content-Type", "application/json")
	recStranger := httptest.NewRecorder()
	router.ServeHTTP(recStranger, reqStranger)

	if recStranger.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request when assigning non-collaborator, got %d: %s", recStranger.Code, recStranger.Body.String())
	}

	// Add dev_bob as a repository collaborator
	if err := database.AddCollaborator(repo.ID, uBob.ID, "write"); err != nil {
		t.Fatalf("failed to add collaborator: %v", err)
	}

	// 2. Verify GET /api/v1/repos/:owner/:repo/assignees only returns owner (alice) and collaborator (bob), NOT stranger
	reqAssignees := httptest.NewRequest("GET", "/api/v1/repos/dev_alice/assignee-repo/assignees", nil)
	reqAssignees.Header.Set("Authorization", "Bearer "+tokenAlice)
	recAssignees := httptest.NewRecorder()
	router.ServeHTTP(recAssignees, reqAssignees)

	if recAssignees.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for list assignees, got %d: %s", recAssignees.Code, recAssignees.Body.String())
	}
	var eligibleAssignees []*database.User
	_ = json.Unmarshal(recAssignees.Body.Bytes(), &eligibleAssignees)
	if len(eligibleAssignees) != 2 {
		t.Fatalf("expected 2 eligible assignees (owner + collaborator), got %d", len(eligibleAssignees))
	}
	for _, u := range eligibleAssignees {
		if u.Username != "dev_alice" && u.Username != "dev_bob" {
			t.Errorf("unexpected user in assignees list: %s", u.Username)
		}
	}

	// 3. Alice creates issue with assignee = dev_bob (collaborator) -> succeeds (201)
	createBody := map[string]any{
		"title":    "Fix database latency",
		"content":  "Issue description",
		"assignee": "dev_bob",
	}
	cb, _ := json.Marshal(createBody)
	req := httptest.NewRequest("POST", "/api/v1/repos/dev_alice/assignee-repo/issues", bytes.NewReader(cb))
	req.Header.Set("Authorization", "Bearer "+tokenAlice)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for issue, got %d: %s", rec.Code, rec.Body.String())
	}
	var createdIssue database.Issue
	_ = json.Unmarshal(rec.Body.Bytes(), &createdIssue)
	if createdIssue.AssigneeName != "dev_bob" {
		t.Errorf("expected assignee_name dev_bob, got %s", createdIssue.AssigneeName)
	}

	// 4. Filter issues by assignee dev_bob
	reqFilter := httptest.NewRequest("GET", "/api/v1/repos/dev_alice/assignee-repo/issues?assignee=dev_bob", nil)
	recFilter := httptest.NewRecorder()
	router.ServeHTTP(recFilter, reqFilter)
	if recFilter.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for list issues, got %d", recFilter.Code)
	}
	var bobIssues []database.Issue
	_ = json.Unmarshal(recFilter.Body.Bytes(), &bobIssues)
	if len(bobIssues) != 1 || bobIssues[0].AssigneeName != "dev_bob" {
		t.Fatalf("expected 1 issue for dev_bob, got %d", len(bobIssues))
	}

	// 5. Filter issues by assignee dev_alice (should be 0)
	reqFilterAlice := httptest.NewRequest("GET", "/api/v1/repos/dev_alice/assignee-repo/issues?assignee=dev_alice", nil)
	recFilterAlice := httptest.NewRecorder()
	router.ServeHTTP(recFilterAlice, reqFilterAlice)
	var aliceIssues []database.Issue
	_ = json.Unmarshal(recFilterAlice.Body.Bytes(), &aliceIssues)
	if len(aliceIssues) != 0 {
		t.Fatalf("expected 0 issues for dev_alice, got %d", len(aliceIssues))
	}

	// 6. Update assignee to dev_alice via PUT /issues/{index}/assignee
	assignBody := map[string]any{"assignee": "dev_alice"}
	ab, _ := json.Marshal(assignBody)
	reqAssign := httptest.NewRequest("PUT", "/api/v1/repos/dev_alice/assignee-repo/issues/1/assignee", bytes.NewReader(ab))
	reqAssign.Header.Set("Authorization", "Bearer "+tokenAlice)
	reqAssign.Header.Set("Content-Type", "application/json")
	recAssign := httptest.NewRecorder()
	router.ServeHTTP(recAssign, reqAssign)

	if recAssign.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for assign, got %d: %s", recAssign.Code, recAssign.Body.String())
	}
	var updatedIssue database.Issue
	_ = json.Unmarshal(recAssign.Body.Bytes(), &updatedIssue)
	if updatedIssue.AssigneeName != "dev_alice" {
		t.Errorf("expected assignee dev_alice after update, got %s", updatedIssue.AssigneeName)
	}

	// 7. Security Check: Try assigning stranger via PUT /issues/{index}/assignee -> rejected (400)
	badAssignBody := map[string]any{"assignee": "dev_stranger"}
	bab, _ := json.Marshal(badAssignBody)
	reqBadAssign := httptest.NewRequest("PUT", "/api/v1/repos/dev_alice/assignee-repo/issues/1/assignee", bytes.NewReader(bab))
	reqBadAssign.Header.Set("Authorization", "Bearer "+tokenAlice)
	reqBadAssign.Header.Set("Content-Type", "application/json")
	recBadAssign := httptest.NewRecorder()
	router.ServeHTTP(recBadAssign, reqBadAssign)

	if recBadAssign.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request when assigning non-collaborator via PUT, got %d: %s", recBadAssign.Code, recBadAssign.Body.String())
	}

	// Check timeline has assign comments
	comments, _ := database.ListComments(createdIssue.ID)
	hasAssignComment := false
	for _, c := range comments {
		if c.Type == "assign" {
			hasAssignComment = true
			break
		}
	}
	if !hasAssignComment {
		t.Errorf("expected assign timeline comment on issue")
	}

	_ = repo
}

func TestProjectKanbanFeatures(t *testing.T) {
	router, cleanup := setupTestRouter(t)
	defer cleanup()

	user, _ := database.CreateUser("dev_lead", "lead@example.com", "hash", "Lead Dev", true)
	_, _ = database.CreateAccessToken(user.ID, "tok", "pgt_lead_12345", "repo,user")
	token := "pgt_lead_12345"

	repo, _ := database.CreateRepository(user.ID, "kanban-repo", "Kanban testing", false)

	// 1. Create project
	projBody := map[string]any{"title": "Release 1.0", "description": "Tracking v1.0"}
	pb, _ := json.Marshal(projBody)
	reqProj := httptest.NewRequest("POST", "/api/v1/repos/dev_lead/kanban-repo/projects", bytes.NewReader(pb))
	reqProj.Header.Set("Authorization", "Bearer "+token)
	reqProj.Header.Set("Content-Type", "application/json")
	recProj := httptest.NewRecorder()
	router.ServeHTTP(recProj, reqProj)

	if recProj.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for project, got %d: %s", recProj.Code, recProj.Body.String())
	}
	var proj database.Project
	_ = json.Unmarshal(recProj.Body.Bytes(), &proj)

	// Default columns created: Todo, In Progress, Done
	cols, _ := database.ListProjectColumns(proj.ID)
	if len(cols) != 3 {
		t.Fatalf("expected 3 default columns, got %d", len(cols))
	}
	todoCol := cols[0]
	doneCol := cols[2]

	// 2. Rename column (Todo -> Backlog)
	renameBody := map[string]any{"title": "Backlog", "order_num": todoCol.OrderNum}
	rb, _ := json.Marshal(renameBody)
	reqCol := httptest.NewRequest("PUT", fmt.Sprintf("/api/v1/repos/dev_lead/kanban-repo/projects/%d/columns/%d", proj.ID, todoCol.ID), bytes.NewReader(rb))
	reqCol.Header.Set("Authorization", "Bearer "+token)
	reqCol.Header.Set("Content-Type", "application/json")
	recCol := httptest.NewRecorder()
	router.ServeHTTP(recCol, reqCol)

	if recCol.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for rename column, got %d: %s", recCol.Code, recCol.Body.String())
	}

	// 3. Create a card
	cardBody := map[string]any{
		"column_id": todoCol.ID,
		"content":   "Initial task note",
		"order_num": 1,
	}
	cdb, _ := json.Marshal(cardBody)
	reqCard := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/repos/dev_lead/kanban-repo/projects/%d/cards", proj.ID), bytes.NewReader(cdb))
	reqCard.Header.Set("Authorization", "Bearer "+token)
	reqCard.Header.Set("Content-Type", "application/json")
	recCard := httptest.NewRecorder()
	router.ServeHTTP(recCard, reqCard)

	if recCard.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for card, got %d: %s", recCard.Code, recCard.Body.String())
	}
	var card database.ProjectCard
	_ = json.Unmarshal(recCard.Body.Bytes(), &card)

	// 4. Update card content and move to Done column
	moveBody := map[string]any{
		"column_id": doneCol.ID,
		"order_num": 1,
		"content":   "Updated task note (completed)",
	}
	mb, _ := json.Marshal(moveBody)
	reqMove := httptest.NewRequest("PUT", fmt.Sprintf("/api/v1/repos/dev_lead/kanban-repo/projects/%d/cards/%d", proj.ID, card.ID), bytes.NewReader(mb))
	reqMove.Header.Set("Authorization", "Bearer "+token)
	reqMove.Header.Set("Content-Type", "application/json")
	recMove := httptest.NewRecorder()
	router.ServeHTTP(recMove, reqMove)

	if recMove.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for move card, got %d: %s", recMove.Code, recMove.Body.String())
	}

	// 5. Verify card updated and moved to Done column
	reqGetProj := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/repos/dev_lead/kanban-repo/projects/%d", proj.ID), nil)
	recGetProj := httptest.NewRecorder()
	router.ServeHTTP(recGetProj, reqGetProj)
	var projDetail database.Project
	_ = json.Unmarshal(recGetProj.Body.Bytes(), &projDetail)

	if projDetail.DoneCards != 1 || projDetail.TotalCards != 1 {
		t.Errorf("expected 1/1 done cards, got %d/%d", projDetail.DoneCards, projDetail.TotalCards)
	}

	// 6. Delete card
	reqDelCard := httptest.NewRequest("DELETE", fmt.Sprintf("/api/v1/repos/dev_lead/kanban-repo/projects/%d/cards/%d", proj.ID, card.ID), nil)
	reqDelCard.Header.Set("Authorization", "Bearer "+token)
	recDelCard := httptest.NewRecorder()
	router.ServeHTTP(recDelCard, reqDelCard)
	if recDelCard.Code != http.StatusOK {
		t.Errorf("expected 200 OK for delete card, got %d", recDelCard.Code)
	}

	// 7. Delete project
	reqDelProj := httptest.NewRequest("DELETE", fmt.Sprintf("/api/v1/repos/dev_lead/kanban-repo/projects/%d", proj.ID), nil)
	reqDelProj.Header.Set("Authorization", "Bearer "+token)
	recDelProj := httptest.NewRecorder()
	router.ServeHTTP(recDelProj, reqDelProj)
	if recDelProj.Code != http.StatusOK {
		t.Errorf("expected 200 OK for delete project, got %d", recDelProj.Code)
	}

	_ = repo
}

func Test10DevelopersMessagingWorkflow(t *testing.T) {
	router, cleanup := setupTestRouter(t)
	defer cleanup()

	// Provision 10 developers
	devNames := []string{
		"dev_alice", "dev_bob", "dev_charlie", "dev_diana", "dev_evan",
		"dev_fiona", "dev_george", "dev_hannah", "dev_ian", "dev_julia",
	}

	tokens := make(map[string]string)
	for i, name := range devNames {
		u, err := database.CreateUser(name, name+"@example.com", "hash", strings.ToUpper(name), i == 0)
		if err != nil {
			t.Fatalf("failed to create user %s: %v", name, err)
		}
		tokStr := fmt.Sprintf("pgt_%s_12345", name)
		_, _ = database.CreateAccessToken(u.ID, "tok", tokStr, "repo,user")
		tokens[name] = tokStr
	}

	// 0. Test Feature Flag Endpoint & Toggle
	reqFeatures := httptest.NewRequest("GET", "/api/v1/features", nil)
	recFeatures := httptest.NewRecorder()
	router.ServeHTTP(recFeatures, reqFeatures)
	if recFeatures.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for GET /api/v1/features, got %d", recFeatures.Code)
	}
	var featMap map[string]any
	_ = json.Unmarshal(recFeatures.Body.Bytes(), &featMap)
	if featMap["messaging_enabled"] != true {
		t.Errorf("expected messaging_enabled to be true by default, got %v", featMap["messaging_enabled"])
	}

	// Test disabling messaging feature flag
	router.cfg.Features.EnableMessaging = false
	reqDisabledMsg := httptest.NewRequest("POST", "/api/v1/messages", bytes.NewReader([]byte(`{"recipient_username":"dev_bob","subject":"hi","content":"test"}`)))
	reqDisabledMsg.Header.Set("Authorization", "Bearer "+tokens["dev_alice"])
	reqDisabledMsg.Header.Set("Content-Type", "application/json")
	recDisabledMsg := httptest.NewRecorder()
	router.ServeHTTP(recDisabledMsg, reqDisabledMsg)
	if recDisabledMsg.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden when messaging is disabled, got %d", recDisabledMsg.Code)
	}

	// Re-enable messaging for remainder of workflow test
	router.cfg.Features.EnableMessaging = true

	// 1. Test Security: unauthenticated GET /api/v1/developers must return 401
	reqDevsUnauth := httptest.NewRequest("GET", "/api/v1/developers", nil)
	recDevsUnauth := httptest.NewRecorder()
	router.ServeHTTP(recDevsUnauth, reqDevsUnauth)
	if recDevsUnauth.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized without auth, got %d", recDevsUnauth.Code)
	}

	// Test Security: authenticated query without ?q returns empty array to prevent enumeration
	reqDevsNoQ := httptest.NewRequest("GET", "/api/v1/developers", nil)
	reqDevsNoQ.Header.Set("Authorization", "Bearer "+tokens["dev_alice"])
	recDevsNoQ := httptest.NewRecorder()
	router.ServeHTTP(recDevsNoQ, reqDevsNoQ)
	if recDevsNoQ.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for empty query, got %d: %s", recDevsNoQ.Code, recDevsNoQ.Body.String())
	}
	var emptyDevList []*database.User
	_ = json.Unmarshal(recDevsNoQ.Body.Bytes(), &emptyDevList)
	if len(emptyDevList) != 0 {
		t.Fatalf("expected empty array when no query param provided, got %d", len(emptyDevList))
	}

	// Test Search: query for "bob"
	reqDevsBob := httptest.NewRequest("GET", "/api/v1/developers?q=bob", nil)
	reqDevsBob.Header.Set("Authorization", "Bearer "+tokens["dev_alice"])
	recDevsBob := httptest.NewRecorder()
	router.ServeHTTP(recDevsBob, reqDevsBob)
	if recDevsBob.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for developer search, got %d", recDevsBob.Code)
	}
	var devBobList []*database.User
	_ = json.Unmarshal(recDevsBob.Body.Bytes(), &devBobList)
	if len(devBobList) == 0 || devBobList[0].Username != "dev_bob" {
		t.Fatalf("expected to find dev_bob in search results, got %+v", devBobList)
	}

	// Test Search: nonexistent user
	reqDevsNone := httptest.NewRequest("GET", "/api/v1/developers?q=nonexistent_xyz", nil)
	reqDevsNone.Header.Set("Authorization", "Bearer "+tokens["dev_alice"])
	recDevsNone := httptest.NewRecorder()
	router.ServeHTTP(recDevsNone, reqDevsNone)
	var devNoneList []*database.User
	_ = json.Unmarshal(recDevsNone.Body.Bytes(), &devNoneList)
	if len(devNoneList) != 0 {
		t.Fatalf("expected 0 results for nonexistent query, got %d", len(devNoneList))
	}

	// Send message to nonexistent user -> 404 User does not exist
	msgBad := map[string]string{
		"recipient_username": "nonexistent_xyz",
		"subject":            "Hi",
		"content":            "Hello",
	}
	mbBad, _ := json.Marshal(msgBad)
	reqMsgBad := httptest.NewRequest("POST", "/api/v1/messages", bytes.NewReader(mbBad))
	reqMsgBad.Header.Set("Authorization", "Bearer "+tokens["dev_alice"])
	reqMsgBad.Header.Set("Content-Type", "application/json")
	recMsgBad := httptest.NewRecorder()
	router.ServeHTTP(recMsgBad, reqMsgBad)
	if recMsgBad.Code != http.StatusNotFound {
		t.Fatalf("expected 404 User does not exist, got %d: %s", recMsgBad.Code, recMsgBad.Body.String())
	}

	// 2. dev_alice sends message to dev_bob
	msgAliceToBob := map[string]string{
		"recipient_username": "dev_bob",
		"subject":            "Review PR #42",
		"content":            "Hey Bob, could you take a look at PR #42 for database indexing?",
	}
	mb1, _ := json.Marshal(msgAliceToBob)
	reqMsg1 := httptest.NewRequest("POST", "/api/v1/messages", bytes.NewReader(mb1))
	reqMsg1.Header.Set("Authorization", "Bearer "+tokens["dev_alice"])
	reqMsg1.Header.Set("Content-Type", "application/json")
	recMsg1 := httptest.NewRecorder()
	router.ServeHTTP(recMsg1, reqMsg1)

	if recMsg1.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for send message, got %d: %s", recMsg1.Code, recMsg1.Body.String())
	}
	var createdMsg1 database.Message
	_ = json.Unmarshal(recMsg1.Body.Bytes(), &createdMsg1)
	if createdMsg1.SenderUsername != "dev_alice" || createdMsg1.RecipientUsername != "dev_bob" {
		t.Errorf("message sender/recipient mismatch: %+v", createdMsg1)
	}
	if createdMsg1.Status != "pending" {
		t.Errorf("expected initial status to be pending, got %s", createdMsg1.Status)
	}

	// 3. dev_bob checks unread count -> 1
	reqUnreadBob := httptest.NewRequest("GET", "/api/v1/messages/unread-count", nil)
	reqUnreadBob.Header.Set("Authorization", "Bearer "+tokens["dev_bob"])
	recUnreadBob := httptest.NewRecorder()
	router.ServeHTTP(recUnreadBob, reqUnreadBob)

	var unreadData map[string]int
	_ = json.Unmarshal(recUnreadBob.Body.Bytes(), &unreadData)
	if unreadData["unread_count"] != 1 {
		t.Errorf("expected 1 unread message for dev_bob, got %d", unreadData["unread_count"])
	}

	// dev_bob accepts message request
	reqAccept := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/messages/%d/accept", createdMsg1.ID), nil)
	reqAccept.Header.Set("Authorization", "Bearer "+tokens["dev_bob"])
	recAccept := httptest.NewRecorder()
	router.ServeHTTP(recAccept, reqAccept)
	if recAccept.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for accept message, got %d: %s", recAccept.Code, recAccept.Body.String())
	}
	var acceptedMsg database.Message
	_ = json.Unmarshal(recAccept.Body.Bytes(), &acceptedMsg)
	if acceptedMsg.Status != "accepted" {
		t.Errorf("expected status 'accepted', got %s", acceptedMsg.Status)
	}

	// 4. dev_bob checks inbox
	reqInboxBob := httptest.NewRequest("GET", "/api/v1/messages/inbox", nil)
	reqInboxBob.Header.Set("Authorization", "Bearer "+tokens["dev_bob"])
	recInboxBob := httptest.NewRecorder()
	router.ServeHTTP(recInboxBob, reqInboxBob)

	var bobInbox []*database.Message
	_ = json.Unmarshal(recInboxBob.Body.Bytes(), &bobInbox)
	if len(bobInbox) != 1 || bobInbox[0].Subject != "Review PR #42" {
		t.Fatalf("expected 1 message in dev_bob inbox, got %d", len(bobInbox))
	}

	// 5. dev_bob marks message as read
	reqRead := httptest.NewRequest("PATCH", fmt.Sprintf("/api/v1/messages/%d/read", createdMsg1.ID), nil)
	reqRead.Header.Set("Authorization", "Bearer "+tokens["dev_bob"])
	recRead := httptest.NewRecorder()
	router.ServeHTTP(recRead, reqRead)

	if recRead.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for mark read, got %d", recRead.Code)
	}

	// Unread count is now 0
	reqUnreadBob2 := httptest.NewRequest("GET", "/api/v1/messages/unread-count", nil)
	reqUnreadBob2.Header.Set("Authorization", "Bearer "+tokens["dev_bob"])
	recUnreadBob2 := httptest.NewRecorder()
	router.ServeHTTP(recUnreadBob2, reqUnreadBob2)
	_ = json.Unmarshal(recUnreadBob2.Body.Bytes(), &unreadData)
	if unreadData["unread_count"] != 0 {
		t.Errorf("expected 0 unread messages for dev_bob, got %d", unreadData["unread_count"])
	}

	// 6. dev_bob replies to dev_alice
	msgBobToAlice := map[string]string{
		"recipient_username": "dev_alice",
		"subject":            "Re: Review PR #42",
		"content":            "Reviewed and approved! Great job.",
	}
	mb2, _ := json.Marshal(msgBobToAlice)
	reqMsg2 := httptest.NewRequest("POST", "/api/v1/messages", bytes.NewReader(mb2))
	reqMsg2.Header.Set("Authorization", "Bearer "+tokens["dev_bob"])
	reqMsg2.Header.Set("Content-Type", "application/json")
	recMsg2 := httptest.NewRecorder()
	router.ServeHTTP(recMsg2, reqMsg2)

	if recMsg2.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for reply, got %d: %s", recMsg2.Code, recMsg2.Body.String())
	}

	// 7. dev_alice sent messages has 1 message
	reqSentAlice := httptest.NewRequest("GET", "/api/v1/messages/sent", nil)
	reqSentAlice.Header.Set("Authorization", "Bearer "+tokens["dev_alice"])
	recSentAlice := httptest.NewRecorder()
	router.ServeHTTP(recSentAlice, reqSentAlice)

	var aliceSent []*database.Message
	_ = json.Unmarshal(recSentAlice.Body.Bytes(), &aliceSent)
	if len(aliceSent) != 1 || aliceSent[0].RecipientUsername != "dev_bob" {
		t.Errorf("expected 1 sent message from dev_alice to dev_bob, got %d", len(aliceSent))
	}

	// 8. Delete message
	reqDelMsg := httptest.NewRequest("DELETE", fmt.Sprintf("/api/v1/messages/%d", createdMsg1.ID), nil)
	reqDelMsg.Header.Set("Authorization", "Bearer "+tokens["dev_bob"])
	recDelMsg := httptest.NewRecorder()
	router.ServeHTTP(recDelMsg, reqDelMsg)

	if recDelMsg.Code != http.StatusOK {
		t.Errorf("expected 200 OK for delete message, got %d", recDelMsg.Code)
	}

	// 9. Rejection and Notification Workflow:
	// dev_charlie sends message to dev_bob
	msgCharlieToBob := map[string]string{
		"recipient_username": "dev_bob",
		"subject":            "Spam or unsolicited request",
		"content":            "Buy my products!",
	}
	mbC, _ := json.Marshal(msgCharlieToBob)
	reqMsgC := httptest.NewRequest("POST", "/api/v1/messages", bytes.NewReader(mbC))
	reqMsgC.Header.Set("Authorization", "Bearer "+tokens["dev_charlie"])
	reqMsgC.Header.Set("Content-Type", "application/json")
	recMsgC := httptest.NewRecorder()
	router.ServeHTTP(recMsgC, reqMsgC)
	if recMsgC.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d: %s", recMsgC.Code, recMsgC.Body.String())
	}
	var createdMsgCharlie database.Message
	_ = json.Unmarshal(recMsgC.Body.Bytes(), &createdMsgCharlie)

	// dev_bob rejects the request
	reqReject := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/messages/%d/reject", createdMsgCharlie.ID), nil)
	reqReject.Header.Set("Authorization", "Bearer "+tokens["dev_bob"])
	recReject := httptest.NewRecorder()
	router.ServeHTTP(recReject, reqReject)
	if recReject.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for reject message, got %d: %s", recReject.Code, recReject.Body.String())
	}
	var rejectedMsg database.Message
	_ = json.Unmarshal(recReject.Body.Bytes(), &rejectedMsg)
	if rejectedMsg.Status != "rejected" {
		t.Errorf("expected status 'rejected', got %s", rejectedMsg.Status)
	}

	// dev_charlie should have received rejection notification in inbox
	reqInboxCharlie := httptest.NewRequest("GET", "/api/v1/messages/inbox", nil)
	reqInboxCharlie.Header.Set("Authorization", "Bearer "+tokens["dev_charlie"])
	recInboxCharlie := httptest.NewRecorder()
	router.ServeHTTP(recInboxCharlie, reqInboxCharlie)
	var charlieInbox []*database.Message
	_ = json.Unmarshal(recInboxCharlie.Body.Bytes(), &charlieInbox)
	foundDeclined := false
	for _, m := range charlieInbox {
		if strings.HasPrefix(m.Subject, "Declined:") {
			foundDeclined = true
			break
		}
	}
	if !foundDeclined {
		t.Errorf("expected dev_charlie to receive declined notification in inbox, got: %+v", charlieInbox)
	}

	// dev_charlie attempts to message dev_bob again -> must be blocked (403 Forbidden)
	reqMsgC2 := httptest.NewRequest("POST", "/api/v1/messages", bytes.NewReader(mbC))
	reqMsgC2.Header.Set("Authorization", "Bearer "+tokens["dev_charlie"])
	reqMsgC2.Header.Set("Content-Type", "application/json")
	recMsgC2 := httptest.NewRecorder()
	router.ServeHTTP(recMsgC2, reqMsgC2)
	if recMsgC2.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden when sending message after rejection, got %d: %s", recMsgC2.Code, recMsgC2.Body.String())
	}
}

func TestWebhooksCRUDAndTest(t *testing.T) {
	router, cleanup := setupTestRouter(t)
	defer cleanup()

	alice, err := database.CreateUser("alice_wh", "alice_wh@example.com", "hash", "Alice WH", false)
	if err != nil {
		t.Fatalf("failed to create user alice: %v", err)
	}
	bob, err := database.CreateUser("bob_wh", "bob_wh@example.com", "hash", "Bob WH", false)
	if err != nil {
		t.Fatalf("failed to create user bob: %v", err)
	}

	_, err = database.CreateRepository(alice.ID, "wh-test-repo", "Webhook test repo", false)
	if err != nil {
		t.Fatalf("failed to create repo: %v", err)
	}

	aliceToken := "pgt_alice_wh_tok"
	_, _ = database.CreateAccessToken(alice.ID, "tok", aliceToken, "repo,user")
	bobToken := "pgt_bob_wh_tok"
	_, _ = database.CreateAccessToken(bob.ID, "tok", bobToken, "repo,user")

	// Spin up a mock HTTP receiver for webhook deliveries
	var receivedHeaders http.Header
	testServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedHeaders = r.Header.Clone()
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"received": true}`))
	}))
	defer testServer.Close()

	// 1. Stranger (bob) attempts to create webhook -> 403 Forbidden
	hookPayload := map[string]any{
		"url":          testServer.URL,
		"secret":       "my-secret-key",
		"content_type": "json",
		"events":       "push,issues",
		"is_active":    true,
	}
	hb, _ := json.Marshal(hookPayload)
	reqBob := httptest.NewRequest("POST", "/api/v1/repos/alice_wh/wh-test-repo/hooks", bytes.NewReader(hb))
	reqBob.Header.Set("Authorization", "Bearer "+bobToken)
	reqBob.Header.Set("Content-Type", "application/json")
	recBob := httptest.NewRecorder()
	router.ServeHTTP(recBob, reqBob)

	if recBob.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden for stranger webhook create, got %d", recBob.Code)
	}

	// 2. Owner (alice) creates webhook -> 201 Created
	reqAlice := httptest.NewRequest("POST", "/api/v1/repos/alice_wh/wh-test-repo/hooks", bytes.NewReader(hb))
	reqAlice.Header.Set("Authorization", "Bearer "+aliceToken)
	reqAlice.Header.Set("Content-Type", "application/json")
	recAlice := httptest.NewRecorder()
	router.ServeHTTP(recAlice, reqAlice)

	if recAlice.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for webhook create, got %d: %s", recAlice.Code, recAlice.Body.String())
	}

	var createdHook database.Webhook
	_ = json.Unmarshal(recAlice.Body.Bytes(), &createdHook)
	if createdHook.ID == 0 || createdHook.URL != testServer.URL {
		t.Fatalf("expected created webhook with URL %s, got %+v", testServer.URL, createdHook)
	}

	// 3. List webhooks -> 200 OK
	reqList := httptest.NewRequest("GET", "/api/v1/repos/alice_wh/wh-test-repo/hooks", nil)
	reqList.Header.Set("Authorization", "Bearer "+aliceToken)
	recList := httptest.NewRecorder()
	router.ServeHTTP(recList, reqList)

	if recList.Code != http.StatusOK {
		t.Errorf("expected 200 OK for list hooks, got %d", recList.Code)
	}
	var hooks []*database.Webhook
	_ = json.Unmarshal(recList.Body.Bytes(), &hooks)
	if len(hooks) != 1 {
		t.Errorf("expected 1 webhook, got %d", len(hooks))
	}

	// 4. Test Webhook (trigger ping) -> 200 OK
	reqTest := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/repos/alice_wh/wh-test-repo/hooks/%d/test", createdHook.ID), nil)
	reqTest.Header.Set("Authorization", "Bearer "+aliceToken)
	recTest := httptest.NewRecorder()
	router.ServeHTTP(recTest, reqTest)

	if recTest.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for test webhook, got %d: %s", recTest.Code, recTest.Body.String())
	}

	// Verify headers received by testServer
	if receivedHeaders.Get("X-ProGit-Event") != "ping" {
		t.Errorf("expected X-ProGit-Event: ping, got %s", receivedHeaders.Get("X-ProGit-Event"))
	}
	if !strings.HasPrefix(receivedHeaders.Get("X-Hub-Signature-256"), "sha256=") {
		t.Errorf("expected X-Hub-Signature-256 header, got %s", receivedHeaders.Get("X-Hub-Signature-256"))
	}

	// 5. List deliveries -> 200 OK
	reqDeliv := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/repos/alice_wh/wh-test-repo/hooks/%d/deliveries", createdHook.ID), nil)
	reqDeliv.Header.Set("Authorization", "Bearer "+aliceToken)
	recDeliv := httptest.NewRecorder()
	router.ServeHTTP(recDeliv, reqDeliv)

	if recDeliv.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for deliveries, got %d", recDeliv.Code)
	}
	var deliveries []*database.WebhookDelivery
	_ = json.Unmarshal(recDeliv.Body.Bytes(), &deliveries)
	if len(deliveries) < 1 || deliveries[0].StatusCode != http.StatusOK {
		t.Errorf("expected at least 1 successful delivery with status 200, got %d deliveries", len(deliveries))
	}

	// 6. Delete webhook -> 200 OK
	reqDel := httptest.NewRequest("DELETE", fmt.Sprintf("/api/v1/repos/alice_wh/wh-test-repo/hooks/%d", createdHook.ID), nil)
	reqDel.Header.Set("Authorization", "Bearer "+aliceToken)
	recDel := httptest.NewRecorder()
	router.ServeHTTP(recDel, reqDel)

	if recDel.Code != http.StatusOK {
		t.Errorf("expected 200 OK for delete webhook, got %d", recDel.Code)
	}
}

func TestDangerZoneActions(t *testing.T) {
	router, cleanup := setupTestRouter(t)
	defer cleanup()

	alice, _ := database.CreateUser("alice_dz", "alice_dz@example.com", "hash", "Alice DZ", false)
	bob, _ := database.CreateUser("bob_dz", "bob_dz@example.com", "hash", "Bob DZ", false)

	repo, err := database.CreateRepository(alice.ID, "dz-repo", "Danger zone test repo", false)
	if err != nil {
		t.Fatalf("failed to create repo: %v", err)
	}

	aliceToken := "pgt_alice_dz_tok"
	_, _ = database.CreateAccessToken(alice.ID, "tok", aliceToken, "repo,user")
	bobToken := "pgt_bob_dz_tok"
	_, _ = database.CreateAccessToken(bob.ID, "tok", bobToken, "repo,user")

	// 1. Change visibility to private
	visPayload := map[string]any{"is_private": true}
	vb, _ := json.Marshal(visPayload)
	reqVis := httptest.NewRequest("POST", "/api/v1/repos/alice_dz/dz-repo/visibility", bytes.NewReader(vb))
	reqVis.Header.Set("Authorization", "Bearer "+aliceToken)
	reqVis.Header.Set("Content-Type", "application/json")
	recVis := httptest.NewRecorder()
	router.ServeHTTP(recVis, reqVis)

	if recVis.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for visibility change, got %d: %s", recVis.Code, recVis.Body.String())
	}

	repoCheck, _ := database.GetRepositoryByID(repo.ID)
	if !repoCheck.IsPrivate {
		t.Errorf("expected repository to be private after visibility update")
	}

	// 2. Archive repository
	archPayload := map[string]any{"archive": true}
	ab, _ := json.Marshal(archPayload)
	reqArch := httptest.NewRequest("POST", "/api/v1/repos/alice_dz/dz-repo/archive", bytes.NewReader(ab))
	reqArch.Header.Set("Authorization", "Bearer "+aliceToken)
	reqArch.Header.Set("Content-Type", "application/json")
	recArch := httptest.NewRecorder()
	router.ServeHTTP(recArch, reqArch)

	if recArch.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for archive repo, got %d: %s", recArch.Code, recArch.Body.String())
	}

	repoCheck, _ = database.GetRepositoryByID(repo.ID)
	if !repoCheck.IsArchived {
		t.Errorf("expected repository to be archived")
	}

	// 3. Attempting to create an issue on archived repo should fail with 400 Bad Request
	issuePayload := map[string]any{"title": "Test Issue", "content": "Body"}
	ib, _ := json.Marshal(issuePayload)
	reqIssue := httptest.NewRequest("POST", "/api/v1/repos/alice_dz/dz-repo/issues", bytes.NewReader(ib))
	reqIssue.Header.Set("Authorization", "Bearer "+aliceToken)
	reqIssue.Header.Set("Content-Type", "application/json")
	recIssue := httptest.NewRecorder()
	router.ServeHTTP(recIssue, reqIssue)

	if recIssue.Code != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request when creating issue on archived repo, got %d", recIssue.Code)
	}

	// 4. Unarchive repository
	unarchPayload := map[string]any{"archive": false}
	uab, _ := json.Marshal(unarchPayload)
	reqUnarch := httptest.NewRequest("POST", "/api/v1/repos/alice_dz/dz-repo/archive", bytes.NewReader(uab))
	reqUnarch.Header.Set("Authorization", "Bearer "+aliceToken)
	reqUnarch.Header.Set("Content-Type", "application/json")
	recUnarch := httptest.NewRecorder()
	router.ServeHTTP(recUnarch, reqUnarch)

	if recUnarch.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for unarchive repo, got %d", recUnarch.Code)
	}

	// 5. Transfer repository from alice to bob
	// Unauthorized stranger attempt
	transferPayload := map[string]any{"new_owner": "bob_dz"}
	tb, _ := json.Marshal(transferPayload)
	reqTransBob := httptest.NewRequest("POST", "/api/v1/repos/alice_dz/dz-repo/transfer", bytes.NewReader(tb))
	reqTransBob.Header.Set("Authorization", "Bearer "+bobToken)
	reqTransBob.Header.Set("Content-Type", "application/json")
	recTransBob := httptest.NewRecorder()
	router.ServeHTTP(recTransBob, reqTransBob)

	if recTransBob.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden for non-owner transfer attempt, got %d", recTransBob.Code)
	}

	// Legitimate owner transfer
	reqTransAlice := httptest.NewRequest("POST", "/api/v1/repos/alice_dz/dz-repo/transfer", bytes.NewReader(tb))
	reqTransAlice.Header.Set("Authorization", "Bearer "+aliceToken)
	reqTransAlice.Header.Set("Content-Type", "application/json")
	recTransAlice := httptest.NewRecorder()
	router.ServeHTTP(recTransAlice, reqTransAlice)

	if recTransAlice.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for transfer repo, got %d: %s", recTransAlice.Code, recTransAlice.Body.String())
	}

	// Verify owner in database
	repoTransferred, err := database.GetRepositoryByName("bob_dz", "dz-repo")
	if err != nil || repoTransferred == nil {
		t.Fatalf("transferred repository bob_dz/dz-repo not found in database: %v", err)
	}
	if repoTransferred.OwnerName != "bob_dz" || repoTransferred.OwnerID != bob.ID {
		t.Errorf("expected owner to be bob_dz, got %s (id: %d)", repoTransferred.OwnerName, repoTransferred.OwnerID)
	}
}

func TestRepositorySearch(t *testing.T) {
	router, cleanup := setupTestRouter(t)
	defer cleanup()

	// Create test users: search_alice and search_stranger
	alice, err := database.CreateUser("search_alice", "alice_search@progit.local", "hashedpass", "Alice Search", false)
	if err != nil {
		t.Fatalf("failed to create alice: %v", err)
	}
	aliceToken := "pgt_search_alice_tok"
	_, _ = database.CreateAccessToken(alice.ID, "tok", aliceToken, "repo,user")

	stranger, err := database.CreateUser("search_stranger", "stranger_search@progit.local", "hashedpass", "Stranger Search", false)
	if err != nil {
		t.Fatalf("failed to create stranger: %v", err)
	}
	strangerToken := "pgt_search_stranger_tok"
	_, _ = database.CreateAccessToken(stranger.ID, "tok", strangerToken, "repo,user")

	// Create public repository
	pubRepo, err := database.CreateRepository(alice.ID, "quantum-mesh-network", "Distributed quantum ledger mesh", false)
	if err != nil {
		t.Fatalf("failed to create public repo: %v", err)
	}

	// Create private repository
	privRepo, err := database.CreateRepository(alice.ID, "top-secret-crypto", "Classified cryptographic key manager", true)
	if err != nil {
		t.Fatalf("failed to create private repo: %v", err)
	}

	// 1. Unauthenticated search for "quantum"
	reqPub := httptest.NewRequest("GET", "/api/v1/repos/search?q=quantum", nil)
	recPub := httptest.NewRecorder()
	router.ServeHTTP(recPub, reqPub)
	if recPub.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", recPub.Code)
	}
	var resPub struct {
		OK           bool                   `json:"ok"`
		Repositories []*database.Repository `json:"repositories"`
		Total        int                    `json:"total"`
	}
	if err := json.Unmarshal(recPub.Body.Bytes(), &resPub); err != nil {
		t.Fatalf("failed to unmarshal search response: %v", err)
	}
	if len(resPub.Repositories) != 1 || resPub.Repositories[0].Name != pubRepo.Name {
		t.Errorf("expected to find %s, got %+v", pubRepo.Name, resPub.Repositories)
	}

	// 2. Unauthenticated search for "secret" (should NOT find private repo)
	reqPrivUnauth := httptest.NewRequest("GET", "/api/v1/repos/search?q=secret", nil)
	recPrivUnauth := httptest.NewRecorder()
	router.ServeHTTP(recPrivUnauth, reqPrivUnauth)
	if recPrivUnauth.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", recPrivUnauth.Code)
	}
	var resPrivUnauth struct {
		Repositories []*database.Repository `json:"repositories"`
	}
	json.Unmarshal(recPrivUnauth.Body.Bytes(), &resPrivUnauth)
	if len(resPrivUnauth.Repositories) != 0 {
		t.Errorf("security leak: unauthenticated search found private repo: %+v", resPrivUnauth.Repositories)
	}

	// 3. Stranger search for "secret" (should NOT find private repo)
	reqStranger := httptest.NewRequest("GET", "/api/v1/repos/search?q=secret", nil)
	reqStranger.Header.Set("Authorization", "Bearer "+strangerToken)
	recStranger := httptest.NewRecorder()
	router.ServeHTTP(recStranger, reqStranger)
	var resStranger struct {
		Repositories []*database.Repository `json:"repositories"`
	}
	json.Unmarshal(recStranger.Body.Bytes(), &resStranger)
	if len(resStranger.Repositories) != 0 {
		t.Errorf("security leak: stranger search found private repo: %+v", resStranger.Repositories)
	}

	// 4. Owner search for "secret" (MUST find private repo)
	reqOwner := httptest.NewRequest("GET", "/api/v1/repos/search?q=secret", nil)
	reqOwner.Header.Set("Authorization", "Bearer "+aliceToken)
	recOwner := httptest.NewRecorder()
	router.ServeHTTP(recOwner, reqOwner)
	var resOwner struct {
		Repositories []*database.Repository `json:"repositories"`
	}
	json.Unmarshal(recOwner.Body.Bytes(), &resOwner)
	if len(resOwner.Repositories) != 1 || resOwner.Repositories[0].Name != privRepo.Name {
		t.Errorf("expected owner to find private repo %s, got %+v", privRepo.Name, resOwner.Repositories)
	}

	// 5. Test search via /api/v1/repos?q=quantum
	reqListQ := httptest.NewRequest("GET", "/api/v1/repos?q=quantum", nil)
	recListQ := httptest.NewRecorder()
	router.ServeHTTP(recListQ, reqListQ)
	if recListQ.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from /api/v1/repos?q=quantum, got %d", recListQ.Code)
	}
	var listQRepos []*database.Repository
	if err := json.Unmarshal(recListQ.Body.Bytes(), &listQRepos); err != nil {
		t.Fatalf("failed to unmarshal /api/v1/repos?q response: %v", err)
	}
	if len(listQRepos) != 1 || listQRepos[0].Name != pubRepo.Name {
		t.Errorf("expected 1 repo matching quantum, got %+v", listQRepos)
	}

	// 6. Test search via /api/v1/explore?q=quantum
	reqExploreQ := httptest.NewRequest("GET", "/api/v1/explore?q=quantum", nil)
	recExploreQ := httptest.NewRecorder()
	router.ServeHTTP(recExploreQ, reqExploreQ)
	if recExploreQ.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from /api/v1/explore?q=quantum, got %d", recExploreQ.Code)
	}
	var resExplore struct {
		Repositories []*database.Repository `json:"repositories"`
	}
	if err := json.Unmarshal(recExploreQ.Body.Bytes(), &resExplore); err != nil {
		t.Fatalf("failed to unmarshal explore response: %v", err)
	}
	if len(resExplore.Repositories) != 1 || resExplore.Repositories[0].Name != pubRepo.Name {
		t.Errorf("expected explore to find %s, got %+v", pubRepo.Name, resExplore.Repositories)
	}

	// 7. Search by owner/repo string (e.g. search_alice/quantum)
	reqOwnerSlash := httptest.NewRequest("GET", "/api/v1/repos/search?q=search_alice/quantum", nil)
	recOwnerSlash := httptest.NewRecorder()
	router.ServeHTTP(recOwnerSlash, reqOwnerSlash)
	var resOwnerSlash struct {
		Repositories []*database.Repository `json:"repositories"`
	}
	_ = json.Unmarshal(recOwnerSlash.Body.Bytes(), &resOwnerSlash)
	if len(resOwnerSlash.Repositories) != 1 || resOwnerSlash.Repositories[0].Name != pubRepo.Name {
		t.Errorf("expected search_alice/quantum to find %s, got %+v", pubRepo.Name, resOwnerSlash.Repositories)
	}

	// 8. Search by owner/ string (e.g. search_alice/)
	reqOwnerOnlySlash := httptest.NewRequest("GET", "/api/v1/repos/search?q=search_alice/", nil)
	recOwnerOnlySlash := httptest.NewRecorder()
	router.ServeHTTP(recOwnerOnlySlash, reqOwnerOnlySlash)
	var resOwnerOnlySlash struct {
		Repositories []*database.Repository `json:"repositories"`
	}
	_ = json.Unmarshal(recOwnerOnlySlash.Body.Bytes(), &resOwnerOnlySlash)
	if len(resOwnerOnlySlash.Repositories) != 1 || resOwnerOnlySlash.Repositories[0].Name != pubRepo.Name {
		t.Errorf("expected search_alice/ to find %s, got %+v", pubRepo.Name, resOwnerOnlySlash.Repositories)
	}

	// 9. Search by '/' (should return all visible repositories rather than empty)
	reqJustSlash := httptest.NewRequest("GET", "/api/v1/repos/search?q=/", nil)
	recJustSlash := httptest.NewRecorder()
	router.ServeHTTP(recJustSlash, reqJustSlash)
	var resJustSlash struct {
		Repositories []*database.Repository `json:"repositories"`
	}
	_ = json.Unmarshal(recJustSlash.Body.Bytes(), &resJustSlash)
	if len(resJustSlash.Repositories) == 0 {
		t.Errorf("expected '/' to return visible repositories, got 0")
	}
}

func TestImportRepositoryEndpoint(t *testing.T) {
	router, cleanup := setupTestRouter(t)
	defer cleanup()

	// 1. Create test user
	alice, err := database.CreateUser("import_alice", "alice@example.com", "hash", "Alice Import", false)
	if err != nil {
		t.Fatalf("failed to create user: %v", err)
	}
	token := "pgt_import_alice_token"
	_, _ = database.CreateAccessToken(alice.ID, "import-tok", token, "repo,user")

	// 2. Prepare an existing source repository
	tempSrcDir, err := os.MkdirTemp("", "progit-test-src-*")
	if err != nil {
		t.Fatalf("failed to create temp src dir: %v", err)
	}
	defer os.RemoveAll(tempSrcDir)

	srcRepoPath := filepath.Join(tempSrcDir, "external-project.git")
	if err := git.InitRepositoryWithReadme(srcRepoPath, "external-project", "External upstream project", "main", "Upstream", "upstream@example.com"); err != nil {
		t.Fatalf("failed to init upstream git: %v", err)
	}

	// 3. Test Unauthorized
	bodyUnauth := `{"clone_url":"` + srcRepoPath + `","name":"no-auth"}`
	reqUnauth := httptest.NewRequest("POST", "/api/v1/repos/import", bytes.NewBufferString(bodyUnauth))
	recUnauth := httptest.NewRecorder()
	router.ServeHTTP(recUnauth, reqUnauth)
	if recUnauth.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 Unauthorized, got %d", recUnauth.Code)
	}

	// 4. Test Authorized Import
	importPayload := map[string]interface{}{
		"clone_url":   srcRepoPath,
		"name":        "my-imported-repo",
		"description": "Successfully imported repository",
		"private":     false,
	}
	bodyJSON, _ := json.Marshal(importPayload)
	reqAuth := httptest.NewRequest("POST", "/api/v1/repos/import", bytes.NewBuffer(bodyJSON))
	reqAuth.Header.Set("Authorization", "Bearer "+token)
	reqAuth.Header.Set("Content-Type", "application/json")
	recAuth := httptest.NewRecorder()
	router.ServeHTTP(recAuth, reqAuth)

	if recAuth.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d: %s", recAuth.Code, recAuth.Body.String())
	}

	var importedRepo database.Repository
	if err := json.Unmarshal(recAuth.Body.Bytes(), &importedRepo); err != nil {
		t.Fatalf("failed to unmarshal imported repo: %v", err)
	}
	if importedRepo.Name != "my-imported-repo" {
		t.Errorf("expected repo name 'my-imported-repo', got '%s'", importedRepo.Name)
	}
	if importedRepo.OwnerName != "import_alice" {
		t.Errorf("expected owner 'import_alice', got '%s'", importedRepo.OwnerName)
	}

	// 5. Verify database record
	dbRepo, err := database.GetRepositoryByName("import_alice", "my-imported-repo")
	if err != nil || dbRepo == nil {
		t.Fatalf("expected to find repo in database: %v", err)
	}
	if dbRepo.DefaultBranch != "main" {
		t.Errorf("expected default branch 'main', got '%s'", dbRepo.DefaultBranch)
	}

	// 6. Test duplicate import returns 409 Conflict
	recDup := httptest.NewRecorder()
	reqDup := httptest.NewRequest("POST", "/api/v1/repos/import", bytes.NewBuffer(bodyJSON))
	reqDup.Header.Set("Authorization", "Bearer "+token)
	reqDup.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recDup, reqDup)
	if recDup.Code != http.StatusConflict {
		t.Errorf("expected 409 Conflict on duplicate repo, got %d", recDup.Code)
	}
}

func TestVulnerabilityAssessmentRemediations(t *testing.T) {
	router, cleanup := setupTestRouter(t)
	defer cleanup()

	// 1. Create owner and unauthorized user
	ownerUser, err := database.CreateUser("va_owner", "va_owner@example.com", "hash", "VA Owner", false)
	if err != nil {
		t.Fatalf("failed to create owner: %v", err)
	}
	ownerToken := "pgt_va_owner_tok"
	_, _ = database.CreateAccessToken(ownerUser.ID, "tok", ownerToken, "repo,user")

	intruderUser, err := database.CreateUser("va_intruder", "va_intruder@example.com", "hash", "VA Intruder", false)
	if err != nil {
		t.Fatalf("failed to create intruder: %v", err)
	}
	intruderToken := "pgt_va_intruder_tok"
	_, _ = database.CreateAccessToken(intruderUser.ID, "tok", intruderToken, "repo,user")

	collabUser, err := database.CreateUser("va_collab", "va_collab@example.com", "hash", "VA Collab", false)
	if err != nil {
		t.Fatalf("failed to create collab: %v", err)
	}
	collabToken := "pgt_va_collab_tok"
	_, _ = database.CreateAccessToken(collabUser.ID, "tok", collabToken, "repo,user")

	// Create private repo with disk files
	privRepo, err := database.CreateRepository(ownerUser.ID, "confidential-vault", "Secret repository", true)
	if err != nil {
		t.Fatalf("failed to create private repo: %v", err)
	}

	repoDir := filepath.Join(router.cfg.Repository.Root, ownerUser.Username, privRepo.Name+".git")
	if err := git.InitRepositoryWithReadme(repoDir, privRepo.Name, "Confidential Project Data", "main", "VA Owner", "va_owner@example.com"); err != nil {
		t.Fatalf("failed to init bare git repo: %v", err)
	}

	// Add an issue to the private repo
	issue, _ := database.CreateIssue(privRepo.ID, ownerUser.ID, "Security audit item", "Top secret findings", false, nil)

	// Add collaborator with admin mode
	_ = database.AddCollaborator(privRepo.ID, collabUser.ID, "admin")

	// =========================================================================
	// VA Point 1: Private Repository Sub-Resource BOLA / IDOR Verification
	// Anonymous and unauthorized users MUST receive 404 Not Found on all endpoints
	// =========================================================================
	endpoints := []string{
		fmt.Sprintf("/api/v1/repos/%s/%s/branches", ownerUser.Username, privRepo.Name),
		fmt.Sprintf("/api/v1/repos/%s/%s/tags", ownerUser.Username, privRepo.Name),
		fmt.Sprintf("/api/v1/repos/%s/%s/commits", ownerUser.Username, privRepo.Name),
		fmt.Sprintf("/api/v1/repos/%s/%s/tree", ownerUser.Username, privRepo.Name),
		fmt.Sprintf("/api/v1/repos/%s/%s/blob?path=README.md", ownerUser.Username, privRepo.Name),
		fmt.Sprintf("/api/v1/repos/%s/%s/raw?path=README.md", ownerUser.Username, privRepo.Name),
		fmt.Sprintf("/api/v1/repos/%s/%s/issues", ownerUser.Username, privRepo.Name),
		fmt.Sprintf("/api/v1/repos/%s/%s/issues/%d", ownerUser.Username, privRepo.Name, issue.IndexNumber),
		fmt.Sprintf("/api/v1/repos/%s/%s/issues/%d/comments", ownerUser.Username, privRepo.Name, issue.IndexNumber),
		fmt.Sprintf("/api/v1/repos/%s/%s/pulls", ownerUser.Username, privRepo.Name),
		fmt.Sprintf("/api/v1/repos/%s/%s/recent-pushes", ownerUser.Username, privRepo.Name),
		fmt.Sprintf("/api/v1/repos/%s/%s/blame?path=README.md", ownerUser.Username, privRepo.Name),
		fmt.Sprintf("/api/v1/repos/%s/%s/code-search?q=Confidential", ownerUser.Username, privRepo.Name),
		fmt.Sprintf("/api/v1/repos/%s/%s/branch-protections", ownerUser.Username, privRepo.Name),
		fmt.Sprintf("/api/v1/repos/%s/%s/releases", ownerUser.Username, privRepo.Name),
	}

	for _, ep := range endpoints {
		// A. Anonymous request
		reqAnon := httptest.NewRequest("GET", ep, nil)
		recAnon := httptest.NewRecorder()
		router.ServeHTTP(recAnon, reqAnon)
		if recAnon.Code != http.StatusNotFound {
			t.Errorf("BOLA leak: Anonymous access to '%s' gave status %d; expected 404", ep, recAnon.Code)
		}

		// B. Unauthorized user (intruder) request
		reqIntruder := httptest.NewRequest("GET", ep, nil)
		reqIntruder.Header.Set("Authorization", "Bearer "+intruderToken)
		recIntruder := httptest.NewRecorder()
		router.ServeHTTP(recIntruder, reqIntruder)
		if recIntruder.Code != http.StatusNotFound {
			t.Errorf("BOLA leak: Intruder access to '%s' gave status %d; expected 404", ep, recIntruder.Code)
		}

		// C. Authorized owner request MUST succeed (200 OK)
		reqOwner := httptest.NewRequest("GET", ep, nil)
		reqOwner.Header.Set("Authorization", "Bearer "+ownerToken)
		recOwner := httptest.NewRecorder()
		router.ServeHTTP(recOwner, reqOwner)
		if recOwner.Code != http.StatusOK {
			t.Errorf("Expected owner access to '%s' to succeed (200 OK), got %d: %s", ep, recOwner.Code, recOwner.Body.String())
		}
	}

	// =========================================================================
	// VA Point 2: Collaborator Privilege Boundary on Repository Deletion
	// Admin collaborator cannot delete someone else's personal repository
	// =========================================================================
	reqCollabDel := httptest.NewRequest("DELETE", fmt.Sprintf("/api/v1/repos/%s/%s", ownerUser.Username, privRepo.Name), nil)
	reqCollabDel.Header.Set("Authorization", "Bearer "+collabToken)
	recCollabDel := httptest.NewRecorder()
	router.ServeHTTP(recCollabDel, reqCollabDel)
	if recCollabDel.Code != http.StatusForbidden {
		t.Errorf("Privilege Escalation: Admin collaborator was allowed to delete repo (status %d); expected 403 Forbidden", recCollabDel.Code)
	}

	// =========================================================================
	// VA Point 3: Webhook SSRF Intranet Blocking
	// When AllowPrivateWebhookHosts = false, private/loopback/cloud metadata targets are rejected
	// =========================================================================
	database.AllowPrivateWebhookHosts = false

	blockedHooks := []string{
		"http://127.0.0.1:8080/pwn",
		"http://localhost:3000/api",
		"http://169.254.169.254/latest/meta-data",
		"http://10.0.0.1/admin",
		"http://192.168.1.1/router",
	}
	for _, hookTarget := range blockedHooks {
		payload := fmt.Sprintf(`{"url":"%s","events":"push"}`, hookTarget)
		reqHook := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/repos/%s/%s/hooks", ownerUser.Username, privRepo.Name), strings.NewReader(payload))
		reqHook.Header.Set("Authorization", "Bearer "+ownerToken)
		reqHook.Header.Set("Content-Type", "application/json")
		recHook := httptest.NewRecorder()
		router.ServeHTTP(recHook, reqHook)
		if recHook.Code != http.StatusBadRequest {
			t.Errorf("SSRF leak: Target '%s' was accepted (status %d); expected 400 Bad Request", hookTarget, recHook.Code)
		}
	}

	// =========================================================================
	// VA Point 4: Import Repository Protocol & Local Filesystem Guard
	// Non-admin cannot clone local paths when AllowLocalRepoImport = false
	// =========================================================================
	git.AllowLocalRepoImport = false

	localImportPayload := `{"clone_url":"/etc/passwd","name":"stolen-local-data"}`
	reqImport := httptest.NewRequest("POST", "/api/v1/repos/import", strings.NewReader(localImportPayload))
	reqImport.Header.Set("Authorization", "Bearer "+ownerToken)
	reqImport.Header.Set("Content-Type", "application/json")
	recImport := httptest.NewRecorder()
	router.ServeHTTP(recImport, reqImport)
	if recImport.Code != http.StatusBadRequest {
		t.Errorf("Local repo theft: Non-admin import of local path was allowed (status %d); expected 400 Bad Request", recImport.Code)
	}

	// =========================================================================
	// VA Point 5: CORS Permissive Reflection Hardening
	// Untrusted origins must NOT receive Access-Control-Allow-Origin with credentials
	// =========================================================================
	reqCorsEvil := httptest.NewRequest("GET", "/api/v1/user", nil)
	reqCorsEvil.Header.Set("Origin", "https://malicious-attacker.com")
	recCorsEvil := httptest.NewRecorder()
	router.ServeHTTP(recCorsEvil, reqCorsEvil)
	if recCorsEvil.Header().Get("Access-Control-Allow-Origin") == "https://malicious-attacker.com" {
		t.Errorf("CORS vulnerability: reflected malicious origin with Access-Control-Allow-Origin")
	}

	// Trusted origin (localhost) IS allowed
	reqCorsGood := httptest.NewRequest("GET", "/api/v1/user", nil)
	reqCorsGood.Header.Set("Origin", "http://localhost:3000")
	recCorsGood := httptest.NewRecorder()
	router.ServeHTTP(recCorsGood, reqCorsGood)
	if recCorsGood.Header().Get("Access-Control-Allow-Origin") != "http://localhost:3000" {
		t.Errorf("Expected localhost origin to be allowed, got '%s'", recCorsGood.Header().Get("Access-Control-Allow-Origin"))
	}

	// =========================================================================
	// VA Point 6: ProGit Pages Content Security Policy & Sandbox
	// User-generated pages must have restrictive sandbox & nosniff
	// =========================================================================
	reqPages := httptest.NewRequest("GET", fmt.Sprintf("/pages/%s/%s/", ownerUser.Username, privRepo.Name), nil)
	recPages := httptest.NewRecorder()
	router.ServeHTTP(recPages, reqPages)
	csp := recPages.Header().Get("Content-Security-Policy")
	if !strings.Contains(csp, "sandbox") || strings.Contains(csp, "allow-same-origin") {
		t.Errorf("ProGit Pages missing secure sandbox CSP: got '%s'", csp)
	}
	if recPages.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Errorf("ProGit Pages missing X-Content-Type-Options: nosniff")
	}
}

func TestRepoAndOrgCreationLimits(t *testing.T) {
	router, cleanup := setupTestRouter(t)
	defer cleanup()

	// 1. Create Super Admin user
	admin, err := database.CreateUser("limit_admin", "admin@limits.local", "hash", "Super Admin", true)
	if err != nil {
		t.Fatalf("failed to create admin: %v", err)
	}
	adminToken := "pgt_limit_admin_tok"
	_, _ = database.CreateAccessToken(admin.ID, "tok", adminToken, "repo,user,admin")

	// 2. Create Standard User
	bob, err := database.CreateUser("limit_bob", "bob@limits.local", "hash", "Bob Normal", false)
	if err != nil {
		t.Fatalf("failed to create bob: %v", err)
	}
	bobToken := "pgt_limit_bob_tok"
	_, _ = database.CreateAccessToken(bob.ID, "tok", bobToken, "repo,user")

	// Set global repository creation limit to 2
	router.cfg.Repository.MaxCreationLimit = 2
	// Set global organization creation limit to 1
	router.cfg.Organization.MaxCreationLimit = 1

	// Helper to create repo for Bob
	createRepo := func(name string) int {
		body, _ := json.Marshal(map[string]any{
			"name":      name,
			"auto_init": true,
		})
		req := httptest.NewRequest("POST", "/api/v1/repos", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+bobToken)
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec.Code
	}

	// Helper to create org for Bob
	createOrg := func(name string) int {
		body, _ := json.Marshal(map[string]any{
			"name": name,
		})
		req := httptest.NewRequest("POST", "/api/v1/orgs", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+bobToken)
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec.Code
	}

	// Bob creates Repo 1 (allowed, count becomes 1)
	if code := createRepo("repo-one"); code != http.StatusCreated {
		t.Fatalf("expected 201 Created for repo 1, got %d", code)
	}

	// Bob creates Repo 2 (allowed, count becomes 2)
	if code := createRepo("repo-two"); code != http.StatusCreated {
		t.Fatalf("expected 201 Created for repo 2, got %d", code)
	}

	// Bob creates Repo 3 (should be blocked by global limit = 2)
	if code := createRepo("repo-three"); code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for repo 3 exceeding limit, got %d", code)
	}

	// Bob creates Org 1 (allowed, count becomes 1)
	if code := createOrg("bob-org-one"); code != http.StatusCreated {
		t.Fatalf("expected 201 Created for org 1, got %d", code)
	}

	// Bob creates Org 2 (should be blocked by global org limit = 1)
	if code := createOrg("bob-org-two"); code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for org 2 exceeding limit, got %d", code)
	}

	// Admin overrides Bob's per-user limits: max_repo_creation = 4, max_org_creation = 2
	repoLimit4 := 4
	orgLimit2 := 2
	updateLimitsBody, _ := json.Marshal(map[string]any{
		"max_repo_creation": repoLimit4,
		"max_org_creation":  orgLimit2,
	})
	reqPatch := httptest.NewRequest("PATCH", fmt.Sprintf("/api/v1/admin/users/%d", bob.ID), bytes.NewReader(updateLimitsBody))
	reqPatch.Header.Set("Authorization", "Bearer "+adminToken)
	reqPatch.Header.Set("Content-Type", "application/json")
	recPatch := httptest.NewRecorder()
	router.ServeHTTP(recPatch, reqPatch)
	if recPatch.Code != http.StatusOK {
		t.Fatalf("expected 200 OK updating user limits, got %d: %s", recPatch.Code, recPatch.Body.String())
	}

	// Bob creates Repo 3 now (allowed because custom limit = 4)
	if code := createRepo("repo-three"); code != http.StatusCreated {
		t.Fatalf("expected 201 Created for repo 3 after limit increase, got %d", code)
	}

	// Bob creates Org 2 now (allowed because custom limit = 2)
	if code := createOrg("bob-org-two"); code != http.StatusCreated {
		t.Fatalf("expected 201 Created for org 2 after limit increase, got %d", code)
	}

	// Admin tests bypass: Admin can create repos and orgs regardless of limits
	adminRepoBody, _ := json.Marshal(map[string]any{
		"name":      "admin-unlimited-repo",
		"auto_init": true,
	})
	reqAdminRepo := httptest.NewRequest("POST", "/api/v1/repos", bytes.NewReader(adminRepoBody))
	reqAdminRepo.Header.Set("Authorization", "Bearer "+adminToken)
	reqAdminRepo.Header.Set("Content-Type", "application/json")
	recAdminRepo := httptest.NewRecorder()
	router.ServeHTTP(recAdminRepo, reqAdminRepo)
	if recAdminRepo.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for admin repo, got %d", recAdminRepo.Code)
	}

	// Admin updates global configuration via PUT /api/v1/admin/config
	newGlobalRepoLimit := 10
	newGlobalOrgLimit := 5
	cfgUpdateBody, _ := json.Marshal(map[string]any{
		"default_repo_max_creation_limit": newGlobalRepoLimit,
		"default_org_max_creation_limit":  newGlobalOrgLimit,
	})
	reqCfg := httptest.NewRequest("PUT", "/api/v1/admin/config", bytes.NewReader(cfgUpdateBody))
	reqCfg.Header.Set("Authorization", "Bearer "+adminToken)
	reqCfg.Header.Set("Content-Type", "application/json")
	recCfg := httptest.NewRecorder()
	router.ServeHTTP(recCfg, reqCfg)
	if recCfg.Code != http.StatusOK {
		t.Fatalf("expected 200 OK updating admin config, got %d: %s", recCfg.Code, recCfg.Body.String())
	}
	if router.cfg.Repository.MaxCreationLimit != 10 {
		t.Errorf("expected global repo limit 10, got %d", router.cfg.Repository.MaxCreationLimit)
	}
	if router.cfg.Organization.MaxCreationLimit != 5 {
		t.Errorf("expected global org limit 5, got %d", router.cfg.Organization.MaxCreationLimit)
	}
}

func TestUserFollowUnfollow(t *testing.T) {
	router, cleanup := setupTestRouter(t)
	defer cleanup()

	// 1. Create two test users
	alice, err := database.CreateUser("follow_alice", "alice@follow.local", "hash", "Alice Follower", false)
	if err != nil {
		t.Fatalf("failed to create alice: %v", err)
	}
	aliceToken := "pgt_follow_alice_tok"
	_, _ = database.CreateAccessToken(alice.ID, "tok", aliceToken, "repo,user")

	bob, err := database.CreateUser("follow_bob", "bob@follow.local", "hash", "Bob Target", false)
	if err != nil {
		t.Fatalf("failed to create bob: %v", err)
	}
	bobToken := "pgt_follow_bob_tok"
	_, _ = database.CreateAccessToken(bob.ID, "tok", bobToken, "repo,user")

	// 2. Alice tries to follow herself (must fail with 400 Bad Request)
	reqSelf := httptest.NewRequest("POST", "/api/v1/user/following/follow_alice", nil)
	reqSelf.Header.Set("Authorization", "Bearer "+aliceToken)
	recSelf := httptest.NewRecorder()
	router.ServeHTTP(recSelf, reqSelf)
	if recSelf.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request when following self, got %d: %s", recSelf.Code, recSelf.Body.String())
	}

	// 3. Alice follows Bob (POST /api/v1/user/following/follow_bob)
	reqFollow := httptest.NewRequest("POST", "/api/v1/user/following/follow_bob", nil)
	reqFollow.Header.Set("Authorization", "Bearer "+aliceToken)
	recFollow := httptest.NewRecorder()
	router.ServeHTTP(recFollow, reqFollow)
	if recFollow.Code != http.StatusOK {
		t.Fatalf("expected 200 OK following bob, got %d: %s", recFollow.Code, recFollow.Body.String())
	}

	var followResp map[string]any
	_ = json.Unmarshal(recFollow.Body.Bytes(), &followResp)
	if followResp["following"] != true {
		t.Errorf("expected following: true, got %v", followResp["following"])
	}
	if fmt.Sprintf("%v", followResp["followers_count"]) != "1" {
		t.Errorf("expected followers_count: 1, got %v", followResp["followers_count"])
	}

	// 4. Alice checks follow status
	reqCheck := httptest.NewRequest("GET", "/api/v1/user/following/follow_bob", nil)
	reqCheck.Header.Set("Authorization", "Bearer "+aliceToken)
	recCheck := httptest.NewRecorder()
	router.ServeHTTP(recCheck, reqCheck)
	if recCheck.Code != http.StatusOK {
		t.Fatalf("expected 200 OK checking follow status, got %d", recCheck.Code)
	}
	var checkResp map[string]any
	_ = json.Unmarshal(recCheck.Body.Bytes(), &checkResp)
	if checkResp["following"] != true {
		t.Errorf("expected following to be true in check, got %v", checkResp["following"])
	}

	// 5. Check Bob's profile as Alice
	reqProfile := httptest.NewRequest("GET", "/api/v1/users/follow_bob", nil)
	reqProfile.Header.Set("Authorization", "Bearer "+aliceToken)
	recProfile := httptest.NewRecorder()
	router.ServeHTTP(recProfile, reqProfile)
	if recProfile.Code != http.StatusOK {
		t.Fatalf("expected 200 OK getting profile, got %d", recProfile.Code)
	}
	var profResp map[string]any
	_ = json.Unmarshal(recProfile.Body.Bytes(), &profResp)
	if profResp["is_following"] != true {
		t.Errorf("expected is_following to be true in profile, got %v", profResp["is_following"])
	}
	if fmt.Sprintf("%v", profResp["followers_count"]) != "1" {
		t.Errorf("expected followers_count: 1, got %v", profResp["followers_count"])
	}

	// 6. List Bob's followers
	reqFollowers := httptest.NewRequest("GET", "/api/v1/users/follow_bob/followers", nil)
	recFollowers := httptest.NewRecorder()
	router.ServeHTTP(recFollowers, reqFollowers)
	if recFollowers.Code != http.StatusOK {
		t.Fatalf("expected 200 OK listing followers, got %d", recFollowers.Code)
	}
	var followersList []map[string]any
	_ = json.Unmarshal(recFollowers.Body.Bytes(), &followersList)
	if len(followersList) != 1 || followersList[0]["username"] != "follow_alice" {
		t.Errorf("expected follow_alice in followers list, got %v", followersList)
	}

	// 7. List Alice's following
	reqFollowing := httptest.NewRequest("GET", "/api/v1/users/follow_alice/following", nil)
	recFollowing := httptest.NewRecorder()
	router.ServeHTTP(recFollowing, reqFollowing)
	if recFollowing.Code != http.StatusOK {
		t.Fatalf("expected 200 OK listing following, got %d", recFollowing.Code)
	}
	var followingList []map[string]any
	_ = json.Unmarshal(recFollowing.Body.Bytes(), &followingList)
	if len(followingList) != 1 || followingList[0]["username"] != "follow_bob" {
		t.Errorf("expected follow_bob in following list, got %v", followingList)
	}

	// 8. Alice unfollows Bob (DELETE /api/v1/user/following/follow_bob)
	reqUnfollow := httptest.NewRequest("DELETE", "/api/v1/user/following/follow_bob", nil)
	reqUnfollow.Header.Set("Authorization", "Bearer "+aliceToken)
	recUnfollow := httptest.NewRecorder()
	router.ServeHTTP(recUnfollow, reqUnfollow)
	if recUnfollow.Code != http.StatusOK {
		t.Fatalf("expected 200 OK unfollowing bob, got %d: %s", recUnfollow.Code, recUnfollow.Body.String())
	}
	var unfollowResp map[string]any
	_ = json.Unmarshal(recUnfollow.Body.Bytes(), &unfollowResp)
	if unfollowResp["following"] != false {
		t.Errorf("expected following: false, got %v", unfollowResp["following"])
	}
	if fmt.Sprintf("%v", unfollowResp["followers_count"]) != "0" {
		t.Errorf("expected followers_count: 0, got %v", unfollowResp["followers_count"])
	}

	// 9. Verify follow status is now false
	reqCheck2 := httptest.NewRequest("GET", "/api/v1/user/following/follow_bob", nil)
	reqCheck2.Header.Set("Authorization", "Bearer "+aliceToken)
	recCheck2 := httptest.NewRecorder()
	router.ServeHTTP(recCheck2, reqCheck2)
	var check2Resp map[string]any
	_ = json.Unmarshal(recCheck2.Body.Bytes(), &check2Resp)
	if check2Resp["following"] != false {
		t.Errorf("expected following: false after unfollow, got %v", check2Resp["following"])
	}
}

func TestAdminUsersSearch(t *testing.T) {
	router, cleanup := setupTestRouter(t)
	defer cleanup()

	passHash, _ := auth.HashPassword("StrongPass123!")
	adminUser, err := database.CreateUser("superadmin", "admin@example.com", passHash, "Super Admin", true)
	if err != nil {
		t.Fatalf("create admin: %v", err)
	}
	u1, err := database.CreateUser("alice_dev", "alice@company.org", passHash, "Alice Engineer", false)
	if err != nil {
		t.Fatalf("create alice: %v", err)
	}
	if _, err := database.CreateUser("bob_ops", "bob@company.org", passHash, "Bob Operations", false); err != nil {
		t.Fatalf("create bob: %v", err)
	}
	if _, err := database.CreateUser("charlie_100%", "charlie@vendor.io", passHash, "Charlie QA", false); err != nil {
		t.Fatalf("create charlie: %v", err)
	}

	adminSess, err := auth.CreateSession(adminUser.ID, adminUser.Username)
	if err != nil {
		t.Fatalf("create admin session: %v", err)
	}
	adminToken := adminSess.Token
	userSess, err := auth.CreateSession(u1.ID, u1.Username)
	if err != nil {
		t.Fatalf("create user session: %v", err)
	}
	userToken := userSess.Token

	// Non-admin must be rejected
	reqForbidden := httptest.NewRequest("GET", "/api/v1/admin/users?q=alice", nil)
	reqForbidden.Header.Set("Authorization", "Bearer "+userToken)
	recForbidden := httptest.NewRecorder()
	router.ServeHTTP(recForbidden, reqForbidden)
	if recForbidden.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for non-admin, got %d", recForbidden.Code)
	}

	// 1. Search by partial username (case-insensitive)
	reqByUsername := httptest.NewRequest("GET", "/api/v1/admin/users?q=ALICE", nil)
	reqByUsername.Header.Set("Authorization", "Bearer "+adminToken)
	recByUsername := httptest.NewRecorder()
	router.ServeHTTP(recByUsername, reqByUsername)
	if recByUsername.Code != http.StatusOK {
		t.Fatalf("expected 200 OK searching by username, got %d: %s", recByUsername.Code, recByUsername.Body.String())
	}
	var res1 []database.User
	_ = json.Unmarshal(recByUsername.Body.Bytes(), &res1)
	if len(res1) != 1 || res1[0].Username != "alice_dev" {
		t.Fatalf("expected only alice_dev, got %+v", res1)
	}

	// 2. Search by email domain
	reqByEmail := httptest.NewRequest("GET", "/api/v1/admin/users?q=company.org", nil)
	reqByEmail.Header.Set("Authorization", "Bearer "+adminToken)
	recByEmail := httptest.NewRecorder()
	router.ServeHTTP(recByEmail, reqByEmail)
	var res2 []database.User
	_ = json.Unmarshal(recByEmail.Body.Bytes(), &res2)
	if len(res2) != 2 {
		t.Fatalf("expected 2 users matching email domain, got %d", len(res2))
	}

	// 3. Search by full name
	reqByName := httptest.NewRequest("GET", "/api/v1/admin/users?q=Operations", nil)
	reqByName.Header.Set("Authorization", "Bearer "+adminToken)
	recByName := httptest.NewRecorder()
	router.ServeHTTP(recByName, reqByName)
	var res3 []database.User
	_ = json.Unmarshal(recByName.Body.Bytes(), &res3)
	if len(res3) != 1 || res3[0].Username != "bob_ops" {
		t.Fatalf("expected bob_ops by full name, got %+v", res3)
	}

	// 4. LIKE wildcard escaping ('%' should match literal '%' in charlie_100%, not everything)
	reqWildcard := httptest.NewRequest("GET", "/api/v1/admin/users?q=100%25", nil)
	reqWildcard.Header.Set("Authorization", "Bearer "+adminToken)
	recWildcard := httptest.NewRecorder()
	router.ServeHTTP(recWildcard, reqWildcard)
	var res4 []database.User
	_ = json.Unmarshal(recWildcard.Body.Bytes(), &res4)
	if len(res4) != 1 || res4[0].Username != "charlie_100%" {
		t.Fatalf("expected exact wildcard-escaped match charlie_100%%, got %+v", res4)
	}

	// 5. No matches returns [] (not null)
	reqEmpty := httptest.NewRequest("GET", "/api/v1/admin/users?q=doesnotexist999", nil)
	reqEmpty.Header.Set("Authorization", "Bearer "+adminToken)
	recEmpty := httptest.NewRecorder()
	router.ServeHTTP(recEmpty, reqEmpty)
	if strings.TrimSpace(recEmpty.Body.String()) != "[]" {
		t.Fatalf("expected empty JSON array [] for no matches, got %s", recEmpty.Body.String())
	}
}

func TestDownloadZipAndViewOnlyPermissions(t *testing.T) {
	router, cleanup := setupTestRouter(t)
	defer cleanup()

	passHash, _ := auth.HashPassword("StrongPass123!")
	adminUser, err := database.CreateUser("zip_admin", "zip_admin@example.com", passHash, "Zip Admin", true)
	if err != nil {
		t.Fatalf("create admin: %v", err)
	}
	ownerUser, _ := database.CreateUser("zip_owner", "zip_owner@example.com", passHash, "Zip Owner", false)
	viewUser, _ := database.CreateUser("zip_view", "zip_view@example.com", passHash, "Zip View", false)
	restrictedUser, _ := database.CreateUser("zip_restricted", "zip_restricted@example.com", passHash, "Zip Restricted", false)
	teamUser, _ := database.CreateUser("zip_teamview", "zip_teamview@example.com", passHash, "Zip Team View", false)

	adminTok := "pgt_zip_admin_tok"
	ownerTok := "pgt_zip_owner_tok"
	viewTok := "pgt_zip_view_tok"
	restrictedTok := "pgt_zip_restricted_tok"
	teamTok := "pgt_zip_team_tok"
	_, _ = database.CreateAccessToken(adminUser.ID, "tok", adminTok, "repo,user,admin")
	_, _ = database.CreateAccessToken(ownerUser.ID, "tok", ownerTok, "repo,user")
	_, _ = database.CreateAccessToken(viewUser.ID, "tok", viewTok, "repo,user")
	_, _ = database.CreateAccessToken(restrictedUser.ID, "tok", restrictedTok, "repo,user")
	_, _ = database.CreateAccessToken(teamUser.ID, "tok", teamTok, "repo,user")

	doJSON := func(method, target, token string, body any) *httptest.ResponseRecorder {
		var reader io.Reader
		if body != nil {
			b, _ := json.Marshal(body)
			reader = bytes.NewReader(b)
		}
		req := httptest.NewRequest(method, target, reader)
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec
	}

	doSmartHTTP := func(method, target, username, secret string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, target, nil)
		if username != "" {
			creds := base64.StdEncoding.EncodeToString([]byte(username + ":" + secret))
			req.Header.Set("Authorization", "Basic "+creds)
		}
		rec := httptest.NewRecorder()
		if handled := git.HandleSmartHTTP(rec, req, router.cfg); !handled {
			t.Fatalf("HandleSmartHTTP did not handle %s %s", method, target)
		}
		return rec
	}

	// 1. Owner creates public and private repositories with initial README
	if rec := doJSON("POST", "/api/v1/repos", ownerTok, map[string]any{
		"name":        "zip-public",
		"description": "Public ZIP repo",
		"private":     false,
		"auto_init":   true,
	}); rec.Code != http.StatusCreated {
		t.Fatalf("create zip-public: got %d: %s", rec.Code, rec.Body.String())
	}
	if rec := doJSON("POST", "/api/v1/repos", ownerTok, map[string]any{
		"name":        "zip-private",
		"description": "Private ZIP repo",
		"private":     true,
		"auto_init":   true,
	}); rec.Code != http.StatusCreated {
		t.Fatalf("create zip-private: got %d: %s", rec.Code, rec.Body.String())
	}

	pubDir := filepath.Join(router.cfg.Repository.Root, ownerUser.Username, "zip-public.git")
	if _, _, err := git.SaveFile(pubDir, "main", "src/app.go", "package main\n", "Zip Owner", "zip_owner@example.com", "Add app.go", ""); err != nil {
		t.Fatalf("SaveFile pub: %v", err)
	}
	if _, err := git.RunGit(pubDir, "tag", "v1.0.0"); err != nil {
		t.Fatalf("tag pub: %v", err)
	}

	// 2. Test Download ZIP endpoint (/archive)
	recZip := doJSON("GET", "/api/v1/repos/zip_owner/zip-public/archive?ref=v1.0.0&format=zip", "", nil)
	if recZip.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for public tag zip, got %d: %s", recZip.Code, recZip.Body.String())
	}
	if ct := recZip.Header().Get("Content-Type"); ct != "application/zip" {
		t.Errorf("expected Content-Type application/zip, got %q", ct)
	}
	zr, err := zip.NewReader(bytes.NewReader(recZip.Body.Bytes()), int64(recZip.Body.Len()))
	if err != nil {
		t.Fatalf("invalid zip payload: %v", err)
	}
	hasAppGo := false
	for _, f := range zr.File {
		if strings.HasSuffix(f.Name, "/src/app.go") {
			hasAppGo = true
		}
	}
	if !hasAppGo {
		t.Errorf("expected src/app.go in tag archive")
	}

	// Default ref & format fallback
	if recDef := doJSON("GET", "/api/v1/repos/zip_owner/zip-public/archive", "", nil); recDef.Code != http.StatusOK {
		t.Errorf("expected 200 OK for default archive fallback, got %d", recDef.Code)
	}
	// Unsupported format -> 400
	if recBadFmt := doJSON("GET", "/api/v1/repos/zip_owner/zip-public/archive?ref=main&format=tar", "", nil); recBadFmt.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for tar format, got %d", recBadFmt.Code)
	}
	// Path traversal / invalid ref -> 400
	if recBadRef := doJSON("GET", "/api/v1/repos/zip_owner/zip-public/archive?ref=..%2Fetc&format=zip", "", nil); recBadRef.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid ref, got %d", recBadRef.Code)
	}
	// Non-existent ref -> 404
	if recMissRef := doJSON("GET", "/api/v1/repos/zip_owner/zip-public/archive?ref=no-such-branch&format=zip", "", nil); recMissRef.Code != http.StatusNotFound {
		t.Errorf("expected 404 for unknown ref, got %d", recMissRef.Code)
	}
	// Private repo anonymous archive -> 404
	if recPrivAnon := doJSON("GET", "/api/v1/repos/zip_owner/zip-private/archive?ref=main&format=zip", "", nil); recPrivAnon.Code != http.StatusNotFound {
		t.Errorf("expected 404 for unauthenticated private archive, got %d", recPrivAnon.Code)
	}

	// 3. Create release + asset on zip-private
	recRel := doJSON("POST", "/api/v1/repos/zip_owner/zip-private/releases", ownerTok, map[string]any{
		"tag_name": "v1.0",
		"title":    "Private Release",
	})
	if recRel.Code != http.StatusCreated {
		t.Fatalf("create release: got %d: %s", recRel.Code, recRel.Body.String())
	}
	var relObj struct {
		ID int64 `json:"id"`
	}
	_ = json.Unmarshal(recRel.Body.Bytes(), &relObj)

	var mpBuf bytes.Buffer
	mw := multipart.NewWriter(&mpBuf)
	fw, _ := mw.CreateFormFile("file", "artifact.bin")
	_, _ = fw.Write([]byte("secret-binary-payload"))
	_ = mw.Close()
	reqAsset := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/repos/zip_owner/zip-private/releases/%d/assets", relObj.ID), &mpBuf)
	reqAsset.Header.Set("Authorization", "Bearer "+ownerTok)
	reqAsset.Header.Set("Content-Type", mw.FormDataContentType())
	recAsset := httptest.NewRecorder()
	router.ServeHTTP(recAsset, reqAsset)
	if recAsset.Code != http.StatusCreated {
		t.Fatalf("upload release asset: got %d: %s", recAsset.Code, recAsset.Body.String())
	}
	var assetObj struct {
		ID int64 `json:"id"`
	}
	_ = json.Unmarshal(recAsset.Body.Bytes(), &assetObj)
	assetDownloadURL := fmt.Sprintf("/api/v1/repos/zip_owner/zip-private/releases/%d/assets/%d/download", relObj.ID, assetObj.ID)

	// 4. Test 'view_only' Collaborator Role
	if recBadMode := doJSON("PUT", "/api/v1/repos/zip_owner/zip-private/collaborators/zip_view", ownerTok, map[string]string{"mode": "bogus"}); recBadMode.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid collaborator mode, got %d", recBadMode.Code)
	}
	if recAddView := doJSON("PUT", "/api/v1/repos/zip_owner/zip-private/collaborators/zip_view", ownerTok, map[string]string{"mode": "view_only"}); recAddView.Code != http.StatusOK {
		t.Fatalf("add view_only collaborator: got %d: %s", recAddView.Code, recAddView.Body.String())
	}

	// View-only user can browse tree/blob/commits, sees view_only=true & empty clone URLs
	if rec := doJSON("GET", "/api/v1/repos/zip_owner/zip-private/tree", viewTok, nil); rec.Code != http.StatusOK {
		t.Errorf("view_only user should access /tree (got %d)", rec.Code)
	}
	if rec := doJSON("GET", "/api/v1/repos/zip_owner/zip-private/blob?path=README.md", viewTok, nil); rec.Code != http.StatusOK {
		t.Errorf("view_only user should access /blob (got %d)", rec.Code)
	}
	recViewRepo := doJSON("GET", "/api/v1/repos/zip_owner/zip-private", viewTok, nil)
	if recViewRepo.Code != http.StatusOK {
		t.Fatalf("view_only get repo: got %d", recViewRepo.Code)
	}
	var viewRepoPayload struct {
		Permissions  database.RepoPermissions `json:"permissions"`
		CloneURLHTTP string                   `json:"clone_url_http"`
		CloneURLSSH  string                   `json:"clone_url_ssh"`
	}
	_ = json.Unmarshal(recViewRepo.Body.Bytes(), &viewRepoPayload)
	if !viewRepoPayload.Permissions.ViewOnly || viewRepoPayload.Permissions.Download || !viewRepoPayload.Permissions.Read || viewRepoPayload.Permissions.Write {
		t.Errorf("unexpected view_only permissions: %+v", viewRepoPayload.Permissions)
	}
	if viewRepoPayload.CloneURLHTTP != "" || viewRepoPayload.CloneURLSSH != "" {
		t.Errorf("expected clone URLs to be hidden for view_only user, got http=%q ssh=%q", viewRepoPayload.CloneURLHTTP, viewRepoPayload.CloneURLSSH)
	}

	// View-only user blocked (403) on archive, raw, release asset download, fork, Smart HTTP clone/pull
	if rec := doJSON("GET", "/api/v1/repos/zip_owner/zip-private/archive?ref=main&format=zip", viewTok, nil); rec.Code != http.StatusForbidden {
		t.Errorf("expected 403 on /archive for view_only, got %d", rec.Code)
	}
	if rec := doJSON("GET", "/api/v1/repos/zip_owner/zip-private/raw?path=README.md", viewTok, nil); rec.Code != http.StatusForbidden {
		t.Errorf("expected 403 on /raw for view_only, got %d", rec.Code)
	}
	if rec := doJSON("GET", assetDownloadURL, viewTok, nil); rec.Code != http.StatusForbidden {
		t.Errorf("expected 403 on release asset download for view_only, got %d", rec.Code)
	}
	if rec := doJSON("POST", "/api/v1/repos/zip_owner/zip-private/forks", viewTok, map[string]any{}); rec.Code != http.StatusForbidden {
		t.Errorf("expected 403 on /forks for view_only, got %d", rec.Code)
	}
	if rec := doSmartHTTP("GET", "/zip_owner/zip-private.git/info/refs?service=git-upload-pack", "zip_view", viewTok); rec.Code != http.StatusForbidden {
		t.Errorf("expected 403 on Smart HTTP info/refs for view_only, got %d", rec.Code)
	}
	if rec := doSmartHTTP("POST", "/zip_owner/zip-private.git/git-upload-pack", "zip_view", viewTok); rec.Code != http.StatusForbidden {
		t.Errorf("expected 403 on Smart HTTP git-upload-pack for view_only, got %d", rec.Code)
	}

	// 5. Test Global Admin User Restriction (users.can_download = false)
	// Self-restricting admin returns 400
	if rec := doJSON("PATCH", fmt.Sprintf("/api/v1/admin/users/%d", adminUser.ID), adminTok, map[string]any{"can_download": false}); rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 when admin tries to restrict self, got %d", rec.Code)
	}
	// Make restrictedUser a WRITE collaborator on zip-private to verify global restriction overrides write role
	_ = database.AddCollaborator(func() int64 {
		r, _ := database.GetRepositoryByName("zip_owner", "zip-private")
		return r.ID
	}(), restrictedUser.ID, "write")

	canDLFalse := false
	recAdminRestrict := doJSON("PATCH", fmt.Sprintf("/api/v1/admin/users/%d", restrictedUser.ID), adminTok, map[string]any{"can_download": canDLFalse})
	if recAdminRestrict.Code != http.StatusOK {
		t.Fatalf("admin restrict download: got %d: %s", recAdminRestrict.Code, recAdminRestrict.Body.String())
	}
	var updatedRestricted database.User
	_ = json.Unmarshal(recAdminRestrict.Body.Bytes(), &updatedRestricted)
	if updatedRestricted.CanDownload {
		t.Errorf("expected can_download=false in PATCH response")
	}

	// Restricted user can browse UI tree & blob, but blocked on all download paths
	if rec := doJSON("GET", "/api/v1/repos/zip_owner/zip-private/tree", restrictedTok, nil); rec.Code != http.StatusOK {
		t.Errorf("restricted user should browse /tree, got %d", rec.Code)
	}
	if rec := doJSON("GET", "/api/v1/repos/zip_owner/zip-public/archive?ref=main&format=zip", restrictedTok, nil); rec.Code != http.StatusForbidden {
		t.Errorf("restricted user should get 403 on public repo /archive, got %d", rec.Code)
	}
	if rec := doJSON("GET", "/api/v1/repos/zip_owner/zip-private/raw?path=README.md", restrictedTok, nil); rec.Code != http.StatusForbidden {
		t.Errorf("restricted user should get 403 on /raw, got %d", rec.Code)
	}
	if rec := doJSON("GET", assetDownloadURL, restrictedTok, nil); rec.Code != http.StatusForbidden {
		t.Errorf("restricted user should get 403 on asset download, got %d", rec.Code)
	}
	if rec := doJSON("POST", "/api/v1/repos/zip_owner/zip-public/forks", restrictedTok, map[string]any{}); rec.Code != http.StatusForbidden {
		t.Errorf("restricted user should get 403 on /forks, got %d", rec.Code)
	}
	if rec := doSmartHTTP("GET", "/zip_owner/zip-private.git/info/refs?service=git-upload-pack", "zip_restricted", restrictedTok); rec.Code != http.StatusForbidden {
		t.Errorf("restricted user should get 403 on Smart HTTP upload-pack, got %d", rec.Code)
	}

	// Admin creates a new user directly with can_download=false
	recCreateRestr := doJSON("POST", "/api/v1/admin/users", adminTok, map[string]any{
		"username":     "zip_created_ro",
		"email":        "zip_created_ro@example.com",
		"password":     "Password123!",
		"can_download": false,
	})
	if recCreateRestr.Code != http.StatusCreated {
		t.Fatalf("admin create download-restricted user: got %d: %s", recCreateRestr.Code, recCreateRestr.Body.String())
	}
	var createdRO database.User
	_ = json.Unmarshal(recCreateRestr.Body.Bytes(), &createdRO)
	if createdRO.CanDownload {
		t.Errorf("expected created user to have can_download=false")
	}

	// Admin re-enables downloads for restrictedUser
	if rec := doJSON("PATCH", fmt.Sprintf("/api/v1/admin/users/%d", restrictedUser.ID), adminTok, map[string]any{"can_download": true}); rec.Code != http.StatusOK {
		t.Fatalf("admin allow download: got %d", rec.Code)
	}
	if rec := doJSON("GET", "/api/v1/repos/zip_owner/zip-private/archive?ref=main&format=zip", restrictedTok, nil); rec.Code != http.StatusOK {
		t.Errorf("restored user should get 200 on /archive, got %d", rec.Code)
	}
	if rec := doJSON("GET", assetDownloadURL, restrictedTok, nil); rec.Code != http.StatusOK {
		t.Errorf("restored user should get 200 on asset download, got %d", rec.Code)
	}
	if rec := doSmartHTTP("GET", "/zip_owner/zip-private.git/info/refs?service=git-upload-pack", "zip_restricted", restrictedTok); rec.Code != http.StatusOK {
		t.Errorf("restored user should get 200 on Smart HTTP info/refs, got %d", rec.Code)
	}

	// 6. Test Org Team 'view_only'
	if rec := doJSON("POST", "/api/v1/orgs", ownerTok, map[string]any{"name": "zip-sec-org", "full_name": "Zip Sec Org"}); rec.Code != http.StatusCreated {
		t.Fatalf("create org: got %d: %s", rec.Code, rec.Body.String())
	}
	org, _ := database.GetOrgByName("zip-sec-org")
	_ = database.AddOrgMember(org.ID, teamUser.ID, "member")

	recTeam := doJSON("POST", "/api/v1/orgs/zip-sec-org/teams", ownerTok, map[string]any{
		"name":       "Auditors",
		"permission": "view_only",
	})
	if recTeam.Code != http.StatusCreated {
		t.Fatalf("create view_only team: got %d: %s", recTeam.Code, recTeam.Body.String())
	}
	var teamObj database.Team
	_ = json.Unmarshal(recTeam.Body.Bytes(), &teamObj)
	if recMem := doJSON("POST", fmt.Sprintf("/api/v1/orgs/zip-sec-org/teams/%d/members", teamObj.ID), ownerTok, map[string]string{"username": "zip_teamview"}); recMem.Code != http.StatusOK {
		t.Fatalf("add team member: got %d: %s", recMem.Code, recMem.Body.String())
	}
	if recOrgRepo := doJSON("POST", "/api/v1/repos", ownerTok, map[string]any{
		"owner":     "zip-sec-org",
		"name":      "org-private",
		"private":   true,
		"auto_init": true,
	}); recOrgRepo.Code != http.StatusCreated {
		t.Fatalf("create org repo: got %d: %s", recOrgRepo.Code, recOrgRepo.Body.String())
	}

	if rec := doJSON("GET", "/api/v1/repos/zip-sec-org/org-private/tree", teamTok, nil); rec.Code != http.StatusOK {
		t.Errorf("org view_only team member should browse /tree, got %d", rec.Code)
	}
	if rec := doJSON("GET", "/api/v1/repos/zip-sec-org/org-private/archive?ref=main&format=zip", teamTok, nil); rec.Code != http.StatusForbidden {
		t.Errorf("org view_only team member should get 403 on /archive, got %d", rec.Code)
	}
	if rec := doSmartHTTP("GET", "/zip-sec-org/org-private.git/info/refs?service=git-upload-pack", "zip_teamview", teamTok); rec.Code != http.StatusForbidden {
		t.Errorf("org view_only team member should get 403 on Smart HTTP upload-pack, got %d", rec.Code)
	}
}

func TestRepoAllowDownloadAndPullsCombinedSetting(t *testing.T) {
	router, cleanup := setupTestRouter(t)
	defer cleanup()

	passHash, _ := auth.HashPassword("StrongPass123!")
	owner, _ := database.CreateUser("comb_owner", "comb_owner@example.com", passHash, "Owner", false)
	writer, _ := database.CreateUser("comb_writer", "comb_writer@example.com", passHash, "Writer", false)
	reader, _ := database.CreateUser("comb_reader", "comb_reader@example.com", passHash, "Reader", false)
	viewer, _ := database.CreateUser("comb_viewer", "comb_viewer@example.com", passHash, "Viewer", false)
	publicUser, _ := database.CreateUser("comb_public", "comb_public@example.com", passHash, "Public", false)
	siteAdmin, _ := database.CreateUser("comb_admin", "comb_admin@example.com", passHash, "Admin", true)

	ownerTok := "pgt_comb_owner"
	writerTok := "pgt_comb_writer"
	readerTok := "pgt_comb_reader"
	viewerTok := "pgt_comb_viewer"
	publicTok := "pgt_comb_public"
	adminTok := "pgt_comb_admin"
	_, _ = database.CreateAccessToken(owner.ID, "tok", ownerTok, "repo,user")
	_, _ = database.CreateAccessToken(writer.ID, "tok", writerTok, "repo,user")
	_, _ = database.CreateAccessToken(reader.ID, "tok", readerTok, "repo,user")
	_, _ = database.CreateAccessToken(viewer.ID, "tok", viewerTok, "repo,user")
	_, _ = database.CreateAccessToken(publicUser.ID, "tok", publicTok, "repo,user")
	_, _ = database.CreateAccessToken(siteAdmin.ID, "tok", adminTok, "repo,user,admin")

	doJSON := func(method, target, token string, body any) *httptest.ResponseRecorder {
		var reader io.Reader
		if body != nil {
			b, _ := json.Marshal(body)
			reader = bytes.NewReader(b)
		}
		req := httptest.NewRequest(method, target, reader)
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec
	}

	doSmartHTTP := func(method, target, username, secret string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, target, nil)
		if username != "" {
			creds := base64.StdEncoding.EncodeToString([]byte(username + ":" + secret))
			req.Header.Set("Authorization", "Basic "+creds)
		}
		rec := httptest.NewRecorder()
		_ = git.HandleSmartHTTP(rec, req, router.cfg)
		return rec
	}

	// 1. Create public repo with a feature branch and an open PR before disabling the setting
	if rec := doJSON("POST", "/api/v1/repos", ownerTok, map[string]any{
		"name":      "locked-repo",
		"private":   false,
		"auto_init": true,
	}); rec.Code != http.StatusCreated {
		t.Fatalf("create repo: got %d: %s", rec.Code, rec.Body.String())
	}
	repoDir := filepath.Join(router.cfg.Repository.Root, owner.Username, "locked-repo.git")
	if err := git.CreateBranch(repoDir, "feature", "main"); err != nil {
		t.Fatalf("create feature branch: %v", err)
	}
	if _, _, err := git.SaveFile(repoDir, "feature", "feature.txt", "feature change\n", "Owner", "comb_owner@example.com", "Feature commit", ""); err != nil {
		t.Fatalf("SaveFile feature: %v", err)
	}

	recPR := doJSON("POST", "/api/v1/repos/comb_owner/locked-repo/pulls", ownerTok, map[string]any{
		"title":       "Initial Feature PR",
		"content":     "PR body",
		"head_branch": "feature",
		"base_branch": "main",
	})
	if recPR.Code != http.StatusCreated {
		t.Fatalf("create initial PR: got %d: %s", recPR.Code, recPR.Body.String())
	}

	// Add collaborators
	_ = doJSON("PUT", "/api/v1/repos/comb_owner/locked-repo/collaborators/comb_writer", ownerTok, map[string]string{"mode": "write"})
	_ = doJSON("PUT", "/api/v1/repos/comb_owner/locked-repo/collaborators/comb_reader", ownerTok, map[string]string{"mode": "read"})
	_ = doJSON("PUT", "/api/v1/repos/comb_owner/locked-repo/collaborators/comb_viewer", ownerTok, map[string]string{"mode": "view_only"})

	// Non-admin cannot change repo settings
	if rec := doJSON("PATCH", "/api/v1/repos/comb_owner/locked-repo/settings", readerTok, map[string]any{"allow_download_and_pulls": false}); rec.Code != http.StatusForbidden {
		t.Errorf("expected 403 for read collab changing settings, got %d", rec.Code)
	}

	// 2. Owner disables AllowDownloads & Pull Requests with ONE combined setting
	recSettings := doJSON("PATCH", "/api/v1/repos/comb_owner/locked-repo/settings", ownerTok, map[string]any{
		"allow_download_and_pulls": false,
	})
	if recSettings.Code != http.StatusOK {
		t.Fatalf("update settings: got %d: %s", recSettings.Code, recSettings.Body.String())
	}

	// 3. Anonymous, public user, Read collaborator, and View-Only collaborator can browse UI but CANNOT download/clone/fork
	for _, tc := range []struct {
		label string
		tok   string
		user  string
	}{
		{"anonymous", "", ""},
		{"public", publicTok, "comb_public"},
		{"read", readerTok, "comb_reader"},
		{"view_only", viewerTok, "comb_viewer"},
	} {
		if rec := doJSON("GET", "/api/v1/repos/comb_owner/locked-repo/tree", tc.tok, nil); rec.Code != http.StatusOK {
			t.Errorf("%s should still view /tree (got %d)", tc.label, rec.Code)
		}
		if rec := doJSON("GET", "/api/v1/repos/comb_owner/locked-repo/blob?path=README.md", tc.tok, nil); rec.Code != http.StatusOK {
			t.Errorf("%s should still view /blob (got %d)", tc.label, rec.Code)
		}
		recRepo := doJSON("GET", "/api/v1/repos/comb_owner/locked-repo", tc.tok, nil)
		var rp struct {
			Repository struct {
				AllowDownloadAndPulls bool `json:"allow_download_and_pulls"`
			} `json:"repository"`
			Permissions  database.RepoPermissions `json:"permissions"`
			CloneURLHTTP string                   `json:"clone_url_http"`
		}
		_ = json.Unmarshal(recRepo.Body.Bytes(), &rp)
		if rp.Repository.AllowDownloadAndPulls || rp.Permissions.Download || !rp.Permissions.ViewOnly || rp.CloneURLHTTP != "" {
			t.Errorf("%s unexpected repo payload: %+v", tc.label, rp)
		}
		if rec := doJSON("GET", "/api/v1/repos/comb_owner/locked-repo/archive?ref=main&format=zip", tc.tok, nil); rec.Code != http.StatusForbidden {
			t.Errorf("%s expected 403 on /archive, got %d", tc.label, rec.Code)
		}
		if rec := doJSON("GET", "/api/v1/repos/comb_owner/locked-repo/raw?path=README.md", tc.tok, nil); rec.Code != http.StatusForbidden {
			t.Errorf("%s expected 403 on /raw, got %d", tc.label, rec.Code)
		}
		if tc.tok != "" {
			if rec := doJSON("POST", "/api/v1/repos/comb_owner/locked-repo/forks", tc.tok, map[string]any{}); rec.Code != http.StatusForbidden {
				t.Errorf("%s expected 403 on /forks, got %d", tc.label, rec.Code)
			}
			if rec := doSmartHTTP("GET", "/comb_owner/locked-repo.git/info/refs?service=git-upload-pack", tc.user, tc.tok); rec.Code != http.StatusForbidden {
				t.Errorf("%s expected 403 on Smart HTTP upload-pack, got %d", tc.label, rec.Code)
			}
		} else {
			// Anonymous Smart HTTP prompts 401 so Write collaborators can authenticate
			if rec := doSmartHTTP("GET", "/comb_owner/locked-repo.git/info/refs?service=git-upload-pack", "", ""); rec.Code != http.StatusUnauthorized {
				t.Errorf("anonymous expected 401 auth prompt on Smart HTTP when allow_download_and_pulls=false, got %d", rec.Code)
			}
		}
	}

	// 4. Write collaborator, Owner, and Super Admin STILL succeed on ZIP, Raw, Clone, Fork
	for _, tc := range []struct {
		label string
		tok   string
		user  string
	}{
		{"write", writerTok, "comb_writer"},
		{"owner", ownerTok, "comb_owner"},
		{"superadmin", adminTok, "comb_admin"},
	} {
		if rec := doJSON("GET", "/api/v1/repos/comb_owner/locked-repo/archive?ref=main&format=zip", tc.tok, nil); rec.Code != http.StatusOK {
			t.Errorf("%s expected 200 on /archive when allow_download_and_pulls=false, got %d", tc.label, rec.Code)
		}
		if rec := doJSON("GET", "/api/v1/repos/comb_owner/locked-repo/raw?path=README.md", tc.tok, nil); rec.Code != http.StatusOK {
			t.Errorf("%s expected 200 on /raw when allow_download_and_pulls=false, got %d", tc.label, rec.Code)
		}
		if rec := doSmartHTTP("GET", "/comb_owner/locked-repo.git/info/refs?service=git-upload-pack", tc.user, tc.tok); rec.Code != http.StatusOK {
			t.Errorf("%s expected 200 on Smart HTTP upload-pack when allow_download_and_pulls=false, got %d", tc.label, rec.Code)
		}
	}
	if recFork := doJSON("POST", "/api/v1/repos/comb_owner/locked-repo/forks", writerTok, map[string]any{}); recFork.Code != http.StatusCreated {
		t.Errorf("write collaborator should be able to fork when allow_download_and_pulls=false, got %d: %s", recFork.Code, recFork.Body.String())
	}

	// 5. ALL Pull Request & Compare endpoints return 403 repo-wide (even for Owner & Write)
	prChecks := []struct {
		method string
		path   string
		body   any
	}{
		{"GET", "/api/v1/repos/comb_owner/locked-repo/pulls", nil},
		{"POST", "/api/v1/repos/comb_owner/locked-repo/pulls", map[string]any{"title": "Blocked", "head_branch": "feature", "base_branch": "main"}},
		{"GET", "/api/v1/repos/comb_owner/locked-repo/pulls/1", nil},
		{"GET", "/api/v1/repos/comb_owner/locked-repo/pulls/1/diff", nil},
		{"GET", "/api/v1/repos/comb_owner/locked-repo/compare?base=main&head=feature", nil},
		{"POST", "/api/v1/repos/comb_owner/locked-repo/pulls/1/merge", map[string]any{"merge_style": "merge"}},
		{"GET", "/api/v1/repos/comb_owner/locked-repo/pulls/1/reviews", nil},
		{"POST", "/api/v1/repos/comb_owner/locked-repo/pulls/1/reviews", map[string]any{"state": "APPROVED", "content": "LGTM"}},
		{"GET", "/api/v1/repos/comb_owner/locked-repo/pulls/1/reviews/comments", nil},
		{"POST", "/api/v1/repos/comb_owner/locked-repo/pulls/1/reviews/comments", map[string]any{"file_path": "README.md", "line_number": 1, "content": "note"}},
	}
	for _, chk := range prChecks {
		if rec := doJSON(chk.method, chk.path, ownerTok, chk.body); rec.Code != http.StatusForbidden {
			t.Errorf("expected 403 Forbidden for owner %s %s when PRs disabled, got %d: %s", chk.method, chk.path, rec.Code, rec.Body.String())
		}
		if rec := doJSON(chk.method, chk.path, writerTok, chk.body); rec.Code != http.StatusForbidden {
			t.Errorf("expected 403 Forbidden for writer %s %s when PRs disabled, got %d", chk.method, chk.path, rec.Code)
		}
	}

	// Private repo existence is still protected (404, not 403) for unauthorized users
	if rec := doJSON("PATCH", "/api/v1/repos/comb_owner/locked-repo/settings", ownerTok, map[string]any{"is_private": true, "allow_download_and_pulls": false}); rec.Code != http.StatusOK {
		t.Fatalf("set private: got %d", rec.Code)
	}
	if rec := doJSON("GET", "/api/v1/repos/comb_owner/locked-repo/pulls", publicTok, nil); rec.Code != http.StatusNotFound {
		t.Errorf("unauthorized user on private repo with disabled PRs must receive 404, got %d", rec.Code)
	}

	// 6. Re-enable AllowDownloads & Pull Requests -> PRs, compare, and Read downloads work again
	if rec := doJSON("PATCH", "/api/v1/repos/comb_owner/locked-repo/settings", ownerTok, map[string]any{"is_private": false, "allow_download_and_pulls": true}); rec.Code != http.StatusOK {
		t.Fatalf("re-enable setting: got %d", rec.Code)
	}
	if rec := doJSON("GET", "/api/v1/repos/comb_owner/locked-repo/pulls", readerTok, nil); rec.Code != http.StatusOK {
		t.Errorf("expected 200 OK on /pulls after re-enabling, got %d", rec.Code)
	}
	if rec := doJSON("GET", "/api/v1/repos/comb_owner/locked-repo/compare?base=main&head=feature", readerTok, nil); rec.Code != http.StatusOK {
		t.Errorf("expected 200 OK on /compare after re-enabling, got %d", rec.Code)
	}
	if rec := doJSON("GET", "/api/v1/repos/comb_owner/locked-repo/archive?ref=main&format=zip", readerTok, nil); rec.Code != http.StatusOK {
		t.Errorf("expected 200 OK on /archive for read collab after re-enabling, got %d", rec.Code)
	}
}







