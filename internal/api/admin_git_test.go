package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"progit.io/progit/internal/auth"
	"progit.io/progit/internal/database"
)

func TestAdminReposSearchAndFilters(t *testing.T) {
	router, cleanup := setupTestRouter(t)
	defer cleanup()

	passHash, _ := auth.HashPassword("StrongPass123!")
	adminUser, err := database.CreateUser("repo_admin", "repoadmin@example.com", passHash, "Repo Admin", true)
	if err != nil {
		t.Fatalf("create admin: %v", err)
	}
	alice, err := database.CreateUser("alice_git", "alice_git@example.com", passHash, "Alice Git", false)
	if err != nil {
		t.Fatalf("create alice: %v", err)
	}
	bob, err := database.CreateUser("bob_git", "bob_git@example.com", passHash, "Bob Git", false)
	if err != nil {
		t.Fatalf("create bob: %v", err)
	}

	adminSess, _ := auth.CreateSession(adminUser.ID, adminUser.Username)
	aliceSess, _ := auth.CreateSession(alice.ID, alice.Username)
	bobSess, _ := auth.CreateSession(bob.ID, bob.Username)

	createRepo := func(token, name, desc string, isPrivate bool) *database.Repository {
		body, _ := json.Marshal(map[string]any{
			"name":        name,
			"description": desc,
			"private":     isPrivate,
			"auto_init":   true,
		})
		req := httptest.NewRequest("POST", "/api/v1/repos", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusCreated {
			t.Fatalf("create repo %s failed (%d): %s", name, rec.Code, rec.Body.String())
		}
		var r database.Repository
		_ = json.Unmarshal(rec.Body.Bytes(), &r)
		return &r
	}

	_ = createRepo(aliceSess.Token, "alpha-core", "Public microservices core", false)
	privRepo := createRepo(aliceSess.Token, "secret-billing", "Internal invoice engine 100%", true)
	archRepo := createRepo(bobSess.Token, "legacy-cli", "Deprecated migration utility", false)
	if err := database.ToggleRepoArchive(archRepo.ID, true); err != nil {
		t.Fatalf("archive repo: %v", err)
	}

	// Non-admin must receive 403
	reqForbidden := httptest.NewRequest("GET", "/api/v1/admin/repos?q=alpha", nil)
	reqForbidden.Header.Set("Authorization", "Bearer "+aliceSess.Token)
	recForbidden := httptest.NewRecorder()
	router.ServeHTTP(recForbidden, reqForbidden)
	if recForbidden.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for non-admin, got %d", recForbidden.Code)
	}

	// Search by owner/name
	reqOwnerRepo := httptest.NewRequest("GET", "/api/v1/admin/repos?q=alice_git/secret", nil)
	reqOwnerRepo.Header.Set("Authorization", "Bearer "+adminSess.Token)
	recOwnerRepo := httptest.NewRecorder()
	router.ServeHTTP(recOwnerRepo, reqOwnerRepo)
	if recOwnerRepo.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", recOwnerRepo.Code)
	}
	var ownerRepoRes []database.Repository
	_ = json.Unmarshal(recOwnerRepo.Body.Bytes(), &ownerRepoRes)
	if len(ownerRepoRes) != 1 || ownerRepoRes[0].ID != privRepo.ID {
		t.Fatalf("expected only secret-billing repo, got %+v", ownerRepoRes)
	}

	// Literal % escaping in description search
	reqPercent := httptest.NewRequest("GET", "/api/v1/admin/repos?q=100%25", nil)
	reqPercent.Header.Set("Authorization", "Bearer "+adminSess.Token)
	recPercent := httptest.NewRecorder()
	router.ServeHTTP(recPercent, reqPercent)
	var percentRes []database.Repository
	_ = json.Unmarshal(recPercent.Body.Bytes(), &percentRes)
	if len(percentRes) != 1 || percentRes[0].Name != "secret-billing" {
		t.Fatalf("expected literal %% search match for secret-billing, got %+v", percentRes)
	}

	// Visibility filter: archived
	reqArchived := httptest.NewRequest("GET", "/api/v1/admin/repos?visibility=archived", nil)
	reqArchived.Header.Set("Authorization", "Bearer "+adminSess.Token)
	recArchived := httptest.NewRecorder()
	router.ServeHTTP(recArchived, reqArchived)
	var archRes []database.Repository
	_ = json.Unmarshal(recArchived.Body.Bytes(), &archRes)
	if len(archRes) != 1 || archRes[0].ID != archRepo.ID {
		t.Fatalf("expected 1 archived repo, got %+v", archRes)
	}

	// Visibility filter: private
	reqPriv := httptest.NewRequest("GET", "/api/v1/admin/repos?visibility=private", nil)
	reqPriv.Header.Set("Authorization", "Bearer "+adminSess.Token)
	recPriv := httptest.NewRecorder()
	router.ServeHTTP(recPriv, reqPriv)
	var privRes []database.Repository
	_ = json.Unmarshal(recPriv.Body.Bytes(), &privRes)
	if len(privRes) != 1 || privRes[0].ID != privRepo.ID {
		t.Fatalf("expected 1 private repo, got %+v", privRes)
	}
}

func TestAdminGitDashboardTelemetryAndMaintenance(t *testing.T) {
	router, cleanup := setupTestRouter(t)
	defer cleanup()

	passHash, _ := auth.HashPassword("StrongPass123!")
	adminUser, _ := database.CreateUser("git_admin", "gitadmin@example.com", passHash, "Git Admin", true)
	devUser, _ := database.CreateUser("git_dev", "gitdev@example.com", passHash, "Git Dev", false)
	adminSess, _ := auth.CreateSession(adminUser.ID, adminUser.Username)
	devSess, _ := auth.CreateSession(devUser.ID, devUser.Username)

	createBody, _ := json.Marshal(map[string]any{
		"name":        "engine-repo",
		"description": "Git telemetry test repository",
		"is_private":  false,
		"auto_init":   true,
	})
	reqCreate := httptest.NewRequest("POST", "/api/v1/repos", bytes.NewReader(createBody))
	reqCreate.Header.Set("Authorization", "Bearer "+devSess.Token)
	reqCreate.Header.Set("Content-Type", "application/json")
	recCreate := httptest.NewRecorder()
	router.ServeHTTP(recCreate, reqCreate)
	if recCreate.Code != http.StatusCreated {
		t.Fatalf("create repo failed (%d): %s", recCreate.Code, recCreate.Body.String())
	}
	var createdRepo database.Repository
	_ = json.Unmarshal(recCreate.Body.Bytes(), &createdRepo)

	// Non-admin rejected on /api/v1/admin/git
	reqForbidden := httptest.NewRequest("GET", "/api/v1/admin/git", nil)
	reqForbidden.Header.Set("Authorization", "Bearer "+devSess.Token)
	recForbidden := httptest.NewRecorder()
	router.ServeHTTP(recForbidden, reqForbidden)
	if recForbidden.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for non-admin on /api/v1/admin/git, got %d", recForbidden.Code)
	}

	// Admin fetches Git overview
	reqOverview := httptest.NewRequest("GET", "/api/v1/admin/git", nil)
	reqOverview.Header.Set("Authorization", "Bearer "+adminSess.Token)
	recOverview := httptest.NewRecorder()
	router.ServeHTTP(recOverview, reqOverview)
	if recOverview.Code != http.StatusOK {
		t.Fatalf("expected 200 on /api/v1/admin/git, got %d: %s", recOverview.Code, recOverview.Body.String())
	}

	var overview struct {
		GitVersion        string `json:"git_version"`
		StorageAccessible bool   `json:"storage_accessible"`
		Summary           struct {
			TotalRepos      int   `json:"total_repos"`
			BareReposOnDisk int   `json:"bare_repos_on_disk"`
			TotalSizeBytes  int64 `json:"total_size_bytes"`
		} `json:"summary"`
		LargestRepos []struct {
			ID       int64  `json:"id"`
			FullName string `json:"full_name"`
		} `json:"largest_repos"`
	}
	if err := json.Unmarshal(recOverview.Body.Bytes(), &overview); err != nil {
		t.Fatalf("decode git overview: %v", err)
	}
	if overview.GitVersion == "" || overview.GitVersion == "unknown" {
		t.Fatalf("expected valid git_version, got %q", overview.GitVersion)
	}
	if !overview.StorageAccessible {
		t.Fatalf("expected storage_accessible=true")
	}
	if overview.Summary.TotalRepos != 1 || overview.Summary.BareReposOnDisk != 1 || overview.Summary.TotalSizeBytes <= 0 {
		t.Fatalf("unexpected git summary: %+v", overview.Summary)
	}
	if len(overview.LargestRepos) != 1 || overview.LargestRepos[0].ID != createdRepo.ID {
		t.Fatalf("expected engine-repo in largest_repos, got %+v", overview.LargestRepos)
	}

	// Admin inspects specific repo internals
	reqInspect := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/admin/git/repos/%d", createdRepo.ID), nil)
	reqInspect.Header.Set("Authorization", "Bearer "+adminSess.Token)
	recInspect := httptest.NewRecorder()
	router.ServeHTTP(recInspect, reqInspect)
	if recInspect.Code != http.StatusOK {
		t.Fatalf("expected 200 on repo inspect, got %d: %s", recInspect.Code, recInspect.Body.String())
	}
	var inspectRes struct {
		ExistsOnDisk bool `json:"exists_on_disk"`
		Telemetry    struct {
			BranchesCount int   `json:"branches_count"`
			DiskSizeBytes int64 `json:"disk_size_bytes"`
		} `json:"telemetry"`
	}
	_ = json.Unmarshal(recInspect.Body.Bytes(), &inspectRes)
	if !inspectRes.ExistsOnDisk || inspectRes.Telemetry.BranchesCount < 1 || inspectRes.Telemetry.DiskSizeBytes <= 0 {
		t.Fatalf("unexpected inspect result: %+v", inspectRes)
	}

	// Admin runs single-repo gc & fsck
	for _, op := range []string{"gc", "fsck", "update_server_info"} {
		payload, _ := json.Marshal(map[string]any{"operation": op, "repo_id": createdRepo.ID})
		reqMaint := httptest.NewRequest("POST", "/api/v1/admin/git/maintenance", bytes.NewReader(payload))
		reqMaint.Header.Set("Authorization", "Bearer "+adminSess.Token)
		reqMaint.Header.Set("Content-Type", "application/json")
		recMaint := httptest.NewRecorder()
		router.ServeHTTP(recMaint, reqMaint)
		if recMaint.Code != http.StatusOK {
			t.Fatalf("git maintenance %s failed (%d): %s", op, recMaint.Code, recMaint.Body.String())
		}
	}

	// Invalid operation returns 400
	badPayload, _ := json.Marshal(map[string]any{"operation": "rm_rf", "repo_id": createdRepo.ID})
	reqBad := httptest.NewRequest("POST", "/api/v1/admin/git/maintenance", bytes.NewReader(badPayload))
	reqBad.Header.Set("Authorization", "Bearer "+adminSess.Token)
	reqBad.Header.Set("Content-Type", "application/json")
	recBad := httptest.NewRecorder()
	router.ServeHTTP(recBad, reqBad)
	if recBad.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid operation, got %d", recBad.Code)
	}

	// Global gc_all succeeds
	allPayload, _ := json.Marshal(map[string]any{"operation": "gc_all"})
	reqAll := httptest.NewRequest("POST", "/api/v1/admin/git/maintenance", bytes.NewReader(allPayload))
	reqAll.Header.Set("Authorization", "Bearer "+adminSess.Token)
	reqAll.Header.Set("Content-Type", "application/json")
	recAll := httptest.NewRecorder()
	router.ServeHTTP(recAll, reqAll)
	if recAll.Code != http.StatusOK {
		t.Fatalf("expected 200 for gc_all, got %d: %s", recAll.Code, recAll.Body.String())
	}
}
