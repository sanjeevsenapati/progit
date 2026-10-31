package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"progit.io/progit/internal/config"
	"progit.io/progit/internal/database"
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


