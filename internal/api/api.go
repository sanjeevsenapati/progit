package api

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	gossh "golang.org/x/crypto/ssh"
	"progit.io/progit/internal/auth"
	"progit.io/progit/internal/config"
	"progit.io/progit/internal/database"
	"progit.io/progit/internal/git"
)

var startTime = time.Now()

type Router struct {
	cfg *config.Config
	mux *http.ServeMux
}

func NewRouter(cfg *config.Config) *Router {
	r := &Router{
		cfg: cfg,
		mux: http.NewServeMux(),
	}
	r.registerRoutes()
	return r
}

func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	// Global security headers
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Frame-Options", "SAMEORIGIN")
	w.Header().Set("X-XSS-Protection", "1; mode=block")

	// Allow CORS for API during development
	if strings.HasPrefix(req.URL.Path, "/api/") {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
		if req.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
	}

	r.mux.ServeHTTP(w, req)
}

func (r *Router) registerRoutes() {
	// Health and Readiness
	r.mux.HandleFunc("GET /api/health", r.handleHealth)
	r.mux.HandleFunc("GET /api/ready", r.handleReady)

	// Auth Endpoints
	r.mux.HandleFunc("POST /api/v1/auth/register", r.handleRegister)
	r.mux.HandleFunc("POST /api/v1/auth/login", r.handleLogin)
	r.mux.HandleFunc("POST /api/v1/auth/logout", r.handleLogout)
	r.mux.HandleFunc("GET /api/v1/auth/me", r.handleMe)

	// Dashboard & Activity
	r.mux.HandleFunc("GET /api/v1/user/dashboard", r.handleUserDashboard)
	r.mux.HandleFunc("GET /api/v1/explore", r.handleExplore)

	// User Settings
	r.mux.HandleFunc("GET /api/v1/user/tokens", r.handleListTokens)
	r.mux.HandleFunc("POST /api/v1/user/tokens", r.handleCreateToken)
	r.mux.HandleFunc("DELETE /api/v1/user/tokens/{id}", r.handleDeleteToken)
	r.mux.HandleFunc("GET /api/v1/user/keys", r.handleListSSHKeys)
	r.mux.HandleFunc("POST /api/v1/user/keys", r.handleCreateSSHKey)
	r.mux.HandleFunc("DELETE /api/v1/user/keys/{id}", r.handleDeleteSSHKey)
	r.mux.HandleFunc("PATCH /api/v1/user/settings", r.handleUpdateUserSettings)
	r.mux.HandleFunc("PUT /api/v1/user/settings", r.handleUpdateUserSettings)
	r.mux.HandleFunc("PUT /api/v1/user/password", r.handleUpdateUserPassword)
	r.mux.HandleFunc("GET /api/v1/users/{username}", r.handleGetUserProfile)

	// Repositories
	r.mux.HandleFunc("GET /api/v1/repos", r.handleListRepos)
	r.mux.HandleFunc("POST /api/v1/repos", r.handleCreateRepo)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}", r.handleGetRepo)
	r.mux.HandleFunc("DELETE /api/v1/repos/{owner}/{repo}", r.handleDeleteRepo)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/star", r.handleToggleStar)

	// Git Code & Tree
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/branches", r.handleListBranches)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/branches", r.handleCreateBranch)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/tags", r.handleListTags)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/commits", r.handleListCommits)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/commits/{sha}", r.handleGetCommitDiff)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/tree", r.handleGetTree)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/blob", r.handleGetBlob)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/raw", r.handleGetRaw)

	// Online File Operations (Create, Edit, Delete, Upload)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/contents/{path...}", r.handleSaveFile)
	r.mux.HandleFunc("DELETE /api/v1/repos/{owner}/{repo}/contents/{path...}", r.handleDeleteFile)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/upload", r.handleUploadFiles)

	// Issues
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/issues", r.handleListIssues)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/issues", r.handleCreateIssue)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/issues/{index}", r.handleGetIssue)
	r.mux.HandleFunc("PATCH /api/v1/repos/{owner}/{repo}/issues/{index}", r.handleUpdateIssue)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/issues/{index}/comments", r.handleListComments)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/issues/{index}/comments", r.handleAddComment)

	// Pull Requests
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/pulls", r.handleListPulls)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/pulls", r.handleCreatePull)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/pulls/{index}", r.handleGetPull)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/pulls/{index}/diff", r.handleGetPullDiff)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/pulls/{index}/merge", r.handleMergePull)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/compare", r.handleCompareBranches)

	// Wiki Endpoints
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/wiki/pages", r.handleListWikiPages)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/wiki/pages/{slug}", r.handleGetWikiPage)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/wiki/pages", r.handleSaveWikiPage)
	r.mux.HandleFunc("DELETE /api/v1/repos/{owner}/{repo}/wiki/pages/{slug}", r.handleDeleteWikiPage)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/wiki/pages/{slug}/history", r.handleGetWikiPageHistory)

	// Pages & Repository Settings
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/pages", r.handleGetPagesConfig)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/pages", r.handleUpdatePagesConfig)
	r.mux.HandleFunc("PATCH /api/v1/repos/{owner}/{repo}/settings", r.handleUpdateRepoSettings)

	// Collaborators Endpoints
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/collaborators", r.handleListCollaborators)
	r.mux.HandleFunc("PUT /api/v1/repos/{owner}/{repo}/collaborators/{collaborator}", r.handleAddCollaborator)
	r.mux.HandleFunc("DELETE /api/v1/repos/{owner}/{repo}/collaborators/{collaborator}", r.handleRemoveCollaborator)

	// Organizations Endpoints
	r.mux.HandleFunc("POST /api/v1/orgs", r.handleCreateOrg)
	r.mux.HandleFunc("GET /api/v1/orgs", r.handleListOrgs)
	r.mux.HandleFunc("GET /api/v1/user/orgs", r.handleListUserOrgs)
	r.mux.HandleFunc("GET /api/v1/orgs/{org}", r.handleGetOrg)
	r.mux.HandleFunc("GET /api/v1/orgs/{org}/members", r.handleListOrgMembers)
	r.mux.HandleFunc("POST /api/v1/orgs/{org}/members", r.handleAddOrgMember)
	r.mux.HandleFunc("DELETE /api/v1/orgs/{org}/members/{username}", r.handleRemoveOrgMember)
	r.mux.HandleFunc("GET /api/v1/orgs/{org}/teams", r.handleListOrgTeams)
	r.mux.HandleFunc("POST /api/v1/orgs/{org}/teams", r.handleCreateOrgTeam)
	r.mux.HandleFunc("POST /api/v1/orgs/{org}/teams/{team_id}/members", r.handleAddTeamMember)
	r.mux.HandleFunc("DELETE /api/v1/orgs/{org}/teams/{team_id}/members/{user_id}", r.handleRemoveTeamMember)
	r.mux.HandleFunc("GET /api/v1/orgs/{org}/repos", r.handleListOrgRepos)

	// Projects Endpoints
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/projects", r.handleListProjects)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/projects", r.handleCreateProject)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/projects/{id}", r.handleGetProject)
	r.mux.HandleFunc("PUT /api/v1/repos/{owner}/{repo}/projects/{id}", r.handleUpdateProject)
	r.mux.HandleFunc("DELETE /api/v1/repos/{owner}/{repo}/projects/{id}", r.handleDeleteProject)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/projects/{id}/columns", r.handleCreateProjectColumn)
	r.mux.HandleFunc("DELETE /api/v1/repos/{owner}/{repo}/projects/{id}/columns/{column_id}", r.handleDeleteProjectColumn)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/projects/{id}/cards", r.handleCreateProjectCard)
	r.mux.HandleFunc("PUT /api/v1/repos/{owner}/{repo}/projects/{id}/cards/{card_id}", r.handleMoveProjectCard)
	r.mux.HandleFunc("DELETE /api/v1/repos/{owner}/{repo}/projects/{id}/cards/{card_id}", r.handleDeleteProjectCard)

	// Static Pages Web Hosting
	r.mux.HandleFunc("GET /pages/{owner}/{repo}/{path...}", r.handleServePages)

	// Installation Wizard
	r.mux.HandleFunc("GET /api/v1/install/status", r.handleInstallStatus)
	r.mux.HandleFunc("POST /api/v1/install", r.handleInstall)

	// Admin Endpoints
	r.mux.HandleFunc("GET /api/v1/admin/stats", r.handleAdminStats)
	r.mux.HandleFunc("GET /api/v1/admin/users", r.handleAdminUsers)
	r.mux.HandleFunc("POST /api/v1/admin/users", r.handleAdminCreateUser)
	r.mux.HandleFunc("PATCH /api/v1/admin/users/{id}", r.handleAdminUpdateUser)
	r.mux.HandleFunc("DELETE /api/v1/admin/users/{id}", r.handleAdminDeleteUser)
	r.mux.HandleFunc("GET /api/v1/admin/repos", r.handleAdminRepos)
	r.mux.HandleFunc("DELETE /api/v1/admin/repos/{id}", r.handleAdminDeleteRepo)
	r.mux.HandleFunc("POST /api/v1/admin/maintenance", r.handleAdminMaintenance)
}

// Helpers

func jsonResponse(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func jsonError(w http.ResponseWriter, status int, message string) {
	jsonResponse(w, status, map[string]string{"error": message})
}

// Health & Readiness Handlers

func (r *Router) handleHealth(w http.ResponseWriter, req *http.Request) {
	dbStatus := "healthy"
	if err := database.Ping(); err != nil {
		dbStatus = fmt.Sprintf("unhealthy: %v", err)
	}

	repoStorageStatus := "accessible"
	if _, err := os.Stat(r.cfg.Repository.Root); err != nil {
		repoStorageStatus = fmt.Sprintf("inaccessible: %v", err)
	}

	uptime := time.Since(startTime).String()

	jsonResponse(w, http.StatusOK, map[string]any{
		"status":       "ok",
		"app":          r.cfg.Server.AppName,
		"version":      "1.0.0",
		"database":     dbStatus,
		"repositories": repoStorageStatus,
		"uptime":       uptime,
		"ssh_enabled":  r.cfg.SSH.Enabled,
	})
}

func (r *Router) handleReady(w http.ResponseWriter, req *http.Request) {
	if err := database.Ping(); err != nil {
		jsonError(w, http.StatusServiceUnavailable, "Database not ready")
		return
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ready"))
}

// Auth Handlers

func (r *Router) handleRegister(w http.ResponseWriter, req *http.Request) {
	var body struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		Password string `json:"password"`
		FullName string `json:"full_name"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	body.Username = strings.TrimSpace(body.Username)
	body.Email = strings.TrimSpace(body.Email)
	if len(body.Username) < 2 {
		jsonError(w, http.StatusBadRequest, "Username must be at least 2 characters")
		return
	}
	if !strings.Contains(body.Email, "@") {
		jsonError(w, http.StatusBadRequest, "Invalid email address")
		return
	}
	if len(body.Password) < 6 {
		jsonError(w, http.StatusBadRequest, "Password must be at least 6 characters")
		return
	}

	count, _ := database.CountUsers()
	isAdmin := (count == 0) // First user is automatically admin

	hash, err := auth.HashPassword(body.Password)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "Failed to hash password")
		return
	}

	user, err := database.CreateUser(body.Username, body.Email, hash, body.FullName, isAdmin)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			jsonError(w, http.StatusConflict, "Username or email is already registered")
			return
		}
		jsonError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to create user: %v", err))
		return
	}

	sess, err := auth.CreateSession(user.ID, user.Username)
	if err == nil {
		http.SetCookie(w, &http.Cookie{
			Name:     auth.SessionCookieName,
			Value:    sess.Token,
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
			Secure:   r.cfg.Security.CookieSecure,
			Expires:  sess.ExpiresAt,
		})
	}

	jsonResponse(w, http.StatusCreated, map[string]any{
		"message": "User registered successfully",
		"user":    user,
		"token":   sess.Token,
	})
}

func (r *Router) handleLogin(w http.ResponseWriter, req *http.Request) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	body.Username = strings.TrimSpace(body.Username)
	var user *database.User
	var err error

	if strings.Contains(body.Username, "@") {
		user, err = database.GetUserByEmail(body.Username)
	} else {
		user, err = database.GetUserByUsername(body.Username)
	}

	if err != nil || user == nil {
		jsonError(w, http.StatusUnauthorized, "Invalid username or password")
		return
	}

	if !auth.CheckPassword(body.Password, user.PasswordHash) {
		jsonError(w, http.StatusUnauthorized, "Invalid username or password")
		return
	}

	if !user.IsActive {
		jsonError(w, http.StatusForbidden, "User account is suspended")
		return
	}

	sess, err := auth.CreateSession(user.ID, user.Username)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "Failed to create session")
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     auth.SessionCookieName,
		Value:    sess.Token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.cfg.Security.CookieSecure,
		Expires:  sess.ExpiresAt,
	})

	jsonResponse(w, http.StatusOK, map[string]any{
		"message": "Login successful",
		"user":    user,
		"token":   sess.Token,
	})
}

func (r *Router) handleLogout(w http.ResponseWriter, req *http.Request) {
	cookie, err := req.Cookie(auth.SessionCookieName)
	if err == nil && cookie.Value != "" {
		auth.DeleteSession(cookie.Value)
	}
	http.SetCookie(w, &http.Cookie{
		Name:     auth.SessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})
	jsonResponse(w, http.StatusOK, map[string]string{"message": "Logged out successfully"})
}

func (r *Router) handleMe(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	jsonResponse(w, http.StatusOK, user)
}

// User Dashboard & Exploration

func (r *Router) handleUserDashboard(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	repos, _ := database.ListUserRepositories(user.ID, true)
	if repos == nil {
		repos = []*database.Repository{}
	}
	activities, _ := database.ListActivities(30)
	if activities == nil {
		activities = []*database.Activity{}
	}
	orgs, _ := database.ListUserOrganizations(user.ID)
	if orgs == nil {
		orgs = []database.Organization{}
	}
	starred, _ := database.ListStarredRepositories(user.ID)
	if starred == nil {
		starred = []*database.Repository{}
	}

	jsonResponse(w, http.StatusOK, map[string]any{
		"user":          user,
		"repositories":  repos,
		"activities":    activities,
		"organizations": orgs,
		"starred":       starred,
	})
}

func (r *Router) handleExplore(w http.ResponseWriter, req *http.Request) {
	repos, err := database.ListRepositories(50, 0, true)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{
		"repositories": repos,
	})
}

// User Settings

func (r *Router) handleListTokens(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	tokens, err := database.ListAccessTokensByUserID(user.ID)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, tokens)
}

func (r *Router) handleCreateToken(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var body struct {
		Name   string `json:"name"`
		Scopes string `json:"scopes"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	rawBytes := make([]byte, 20)
	_, _ = rand.Read(rawBytes)
	rawToken := "pgt_" + hex.EncodeToString(rawBytes)

	token, err := database.CreateAccessToken(user.ID, body.Name, rawToken, body.Scopes)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusCreated, map[string]any{
		"token":     token,
		"raw_token": rawToken,
	})
}

func (r *Router) handleDeleteToken(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	tokenID, _ := strconv.ParseInt(req.PathValue("id"), 10, 64)
	_ = database.DeleteAccessToken(user.ID, tokenID)
	jsonResponse(w, http.StatusOK, map[string]string{"message": "Token revoked"})
}

func (r *Router) handleListSSHKeys(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	keys, err := database.ListSSHKeysByUserID(user.ID)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, keys)
}

func (r *Router) handleCreateSSHKey(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var body struct {
		Title string `json:"title"`
		Key   string `json:"key"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	pubKey, _, _, _, err := gossh.ParseAuthorizedKey([]byte(strings.TrimSpace(body.Key)))
	if err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid SSH public key format")
		return
	}

	fingerprint := gossh.FingerprintSHA256(pubKey)
	keyObj, err := database.CreateSSHKey(user.ID, body.Title, fingerprint, strings.TrimSpace(body.Key))
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			jsonError(w, http.StatusConflict, "SSH key already registered")
			return
		}
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusCreated, keyObj)
}

func (r *Router) handleDeleteSSHKey(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	keyID, _ := strconv.ParseInt(req.PathValue("id"), 10, 64)
	_ = database.DeleteSSHKey(user.ID, keyID)
	jsonResponse(w, http.StatusOK, map[string]string{"message": "Key deleted successfully"})
}

func (r *Router) handleUpdateUserSettings(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var body struct {
		FullName  string `json:"full_name"`
		Email     string `json:"email"`
		Bio       string `json:"bio"`
		Location  string `json:"location"`
		Website   string `json:"website"`
		AvatarURL string `json:"avatar_url"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	updated, err := database.UpdateUserProfile(user.ID, body.FullName, body.Email, body.Bio, body.Location, body.Website, body.AvatarURL)
	if err != nil {
		if strings.Contains(err.Error(), "already in use") {
			jsonError(w, http.StatusConflict, err.Error())
			return
		}
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, updated)
}

func (r *Router) handleUpdateUserPassword(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var body struct {
		OldPassword string `json:"old_password"`
		NewPassword string `json:"new_password"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	var hash string
	if err := database.DB.QueryRow(`SELECT password_hash FROM users WHERE id = ?`, user.ID).Scan(&hash); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if !auth.CheckPassword(body.OldPassword, hash) {
		jsonError(w, http.StatusBadRequest, "Current password does not match")
		return
	}

	if len(body.NewPassword) < 6 {
		jsonError(w, http.StatusBadRequest, "New password must be at least 6 characters")
		return
	}

	newHash, err := auth.HashPassword(body.NewPassword)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "Failed to hash password")
		return
	}

	if err := database.UpdateUserPasswordHash(user.ID, newHash); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{"message": "Password updated successfully"})
}

func (r *Router) handleGetUserProfile(w http.ResponseWriter, req *http.Request) {
	username := req.PathValue("username")
	targetUser, err := database.GetUserByUsername(username)
	if err != nil || targetUser == nil {
		jsonError(w, http.StatusNotFound, "User not found")
		return
	}

	currentUser := auth.AuthenticateRequest(req)
	includePrivate := (currentUser != nil && (currentUser.IsAdmin || currentUser.ID == targetUser.ID))
	repos, _ := database.ListUserRepositories(targetUser.ID, includePrivate)
	if repos == nil {
		repos = []*database.Repository{}
	}
	activities, _ := database.ListUserActivities(targetUser.ID, 30)
	if activities == nil {
		activities = []*database.Activity{}
	}
	orgs, _ := database.ListUserOrganizations(targetUser.ID)
	if orgs == nil {
		orgs = []database.Organization{}
	}
	starred, _ := database.ListStarredRepositories(targetUser.ID)
	if starred == nil {
		starred = []*database.Repository{}
	}

	jsonResponse(w, http.StatusOK, map[string]any{
		"user":          targetUser,
		"repositories":  repos,
		"activities":    activities,
		"organizations": orgs,
		"starred":       starred,
	})
}

// Repository Handlers

func (r *Router) handleListRepos(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	ownerFilter := req.URL.Query().Get("owner")

	if ownerFilter != "" {
		ownerUser, err := database.GetUserByUsername(ownerFilter)
		if err != nil || ownerUser == nil {
			jsonError(w, http.StatusNotFound, "Owner not found")
			return
		}
		includePrivate := (user != nil && (user.IsAdmin || user.ID == ownerUser.ID))
		repos, err := database.ListUserRepositories(ownerUser.ID, includePrivate)
		if err != nil {
			jsonError(w, http.StatusInternalServerError, err.Error())
			return
		}
		jsonResponse(w, http.StatusOK, repos)
		return
	}

	repos, err := database.ListRepositories(50, 0, user == nil)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, repos)
}

func (r *Router) handleCreateRepo(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var body struct {
		Name        string `json:"name"`
		Owner       string `json:"owner"`
		Description string `json:"description"`
		Private     bool   `json:"private"`
		AutoInit    bool   `json:"auto_init"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	body.Name = strings.TrimSpace(body.Name)
	if len(body.Name) < 1 {
		jsonError(w, http.StatusBadRequest, "Repository name is required")
		return
	}

	targetOwnerID := user.ID
	targetOwnerName := user.Username

	if body.Owner != "" && !strings.EqualFold(body.Owner, user.Username) {
		org, err := database.GetOrgByName(body.Owner)
		if err != nil || org == nil {
			jsonError(w, http.StatusBadRequest, "Selected organization does not exist")
			return
		}
		if !user.IsAdmin && !database.IsOrgAdmin(org.ID, user.ID) {
			jsonError(w, http.StatusForbidden, "You do not have permission to create repositories under this organization")
			return
		}
		orgUser, err := database.GetUserByUsername(org.Name)
		if err != nil || orgUser == nil {
			jsonError(w, http.StatusInternalServerError, "Organization account stub missing")
			return
		}
		targetOwnerID = orgUser.ID
		targetOwnerName = org.Name
	}

	repo, err := database.CreateRepository(targetOwnerID, body.Name, body.Description, body.Private)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			jsonError(w, http.StatusConflict, "Repository already exists")
			return
		}
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	repoDir := filepath.Join(r.cfg.Repository.Root, targetOwnerName, repo.Name+".git")
	if body.AutoInit {
		err = git.InitRepositoryWithReadme(repoDir, repo.Name, repo.Description, "main", user.Username, user.Email)
	} else {
		err = git.InitBareRepository(repoDir, "main")
	}

	if err != nil {
		_ = database.DeleteRepository(repo.ID)
		_ = os.RemoveAll(repoDir)
		jsonError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to initialize git repository: %v", err))
		return
	}

	database.CreateActivity(user.ID, user.Username, &repo.ID, repo.Name, "create_repo", fmt.Sprintf("Created repository %s/%s", targetOwnerName, repo.Name))

	jsonResponse(w, http.StatusCreated, repo)
}

func (r *Router) handleGetRepo(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	user := auth.AuthenticateRequest(req)
	if !database.CanUserAccessRepo(user, repo, false) {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	isStarred := false
	if user != nil {
		isStarred = database.HasStarred(user.ID, repo.ID)
	}

	canWrite := database.CanUserAccessRepo(user, repo, true)
	canAdmin := user != nil && (user.IsAdmin || user.ID == repo.OwnerID)
	if !canAdmin && user != nil {
		if org, _ := database.GetOrgByName(repo.OwnerName); org != nil {
			canAdmin = database.IsOrgAdmin(org.ID, user.ID)
		}
	}

	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")
	branches, _ := git.GetBranches(repoDir)
	tags, _ := git.GetTags(repoDir)

	httpCloneURL := fmt.Sprintf("%s%s/%s.git", r.cfg.Server.RootURL, owner, repoName)
	sshCloneURL := fmt.Sprintf("ssh://git@%s:%d/%s/%s.git", r.cfg.Server.Domain, r.cfg.SSH.Port, owner, repoName)
	wikiCloneURLHTTP := fmt.Sprintf("%s%s/%s.wiki.git", r.cfg.Server.RootURL, owner, repoName)
	wikiCloneURLSSH := fmt.Sprintf("ssh://git@%s:%d/%s/%s.wiki.git", r.cfg.Server.Domain, r.cfg.SSH.Port, owner, repoName)
	pagesURL := fmt.Sprintf("%spages/%s/%s/", r.cfg.Server.RootURL, owner, repoName)

	jsonResponse(w, http.StatusOK, map[string]any{
		"repository": repo,
		"is_starred": isStarred,
		"can_write":  canWrite,
		"permissions": map[string]bool{
			"admin": canAdmin,
			"write": canWrite,
			"read":  true,
		},
		"branches":            branches,
		"tags":                tags,
		"clone_url_http":      httpCloneURL,
		"clone_url_ssh":       sshCloneURL,
		"wiki_clone_url_http": wikiCloneURLHTTP,
		"wiki_clone_url_ssh":  wikiCloneURLSSH,
		"pages_url":           pagesURL,
	})
}

func (r *Router) handleDeleteRepo(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	if !user.IsAdmin && user.ID != repo.OwnerID {
		jsonError(w, http.StatusForbidden, "Forbidden")
		return
	}

	_ = database.DeleteRepository(repo.ID)
	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")
	_ = os.RemoveAll(repoDir)

	jsonResponse(w, http.StatusOK, map[string]string{"message": "Repository deleted successfully"})
}

func (r *Router) handleToggleStar(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	starred, err := database.ToggleStar(user.ID, repo.ID)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]any{
		"starred":   starred,
		"num_stars": repo.NumStars,
	})
}

// Git Code Browsing Handlers

func (r *Router) handleListBranches(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")

	branches, err := git.GetBranches(repoDir)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, branches)
}

func (r *Router) handleCreateBranch(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")

	var body struct {
		BranchName string `json:"branch_name"`
		BaseRef    string `json:"base_ref"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if body.BaseRef == "" {
		body.BaseRef = "main"
	}

	if err := git.CreateBranch(repoDir, body.BranchName, body.BaseRef); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusCreated, map[string]string{"message": "Branch created"})
}

func (r *Router) handleListTags(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")

	tags, err := git.GetTags(repoDir)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, tags)
}

func (r *Router) handleListCommits(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	ref := req.URL.Query().Get("ref")
	limit, _ := strconv.Atoi(req.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(req.URL.Query().Get("offset"))

	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")
	commits, err := git.GetCommits(repoDir, ref, limit, offset)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, commits)
}

func (r *Router) handleGetCommitDiff(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	sha := req.PathValue("sha")
	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")

	diff, err := git.GetCommitDiff(repoDir, sha)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, diff)
}

func (r *Router) handleGetTree(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	ref := req.URL.Query().Get("ref")
	subpath := req.URL.Query().Get("path")

	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")
	entries, err := git.GetTree(repoDir, ref, subpath)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// If root tree, also fetch README.md if present
	var readmeContent string
	if subpath == "" {
		for _, e := range entries {
			if strings.EqualFold(e.Name, "README.md") {
				blob, err := git.GetBlob(repoDir, ref, e.Path)
				if err == nil && blob != nil {
					readmeContent = blob.Content
				}
				break
			}
		}
	}

	jsonResponse(w, http.StatusOK, map[string]any{
		"entries": entries,
		"readme":  readmeContent,
	})
}

func (r *Router) handleGetBlob(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	ref := req.URL.Query().Get("ref")
	filePath := req.URL.Query().Get("path")

	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")
	blob, err := git.GetBlob(repoDir, ref, filePath)
	if err != nil {
		jsonError(w, http.StatusNotFound, "File not found")
		return
	}
	jsonResponse(w, http.StatusOK, blob)
}

func (r *Router) handleGetRaw(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	ref := req.URL.Query().Get("ref")
	filePath := req.URL.Query().Get("path")

	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")
	bytes, err := git.GetRaw(repoDir, ref, filePath)
	if err != nil {
		jsonError(w, http.StatusNotFound, "File not found")
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(bytes)
}

// Online File Operations Handlers

func (r *Router) handleSaveFile(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	filePath := req.PathValue("path")

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	if !database.CanUserAccessRepo(user, repo, true) {
		jsonError(w, http.StatusForbidden, "Write permission required")
		return
	}

	var body struct {
		Branch    string `json:"branch"`
		NewBranch string `json:"new_branch"`
		Content   string `json:"content"`
		Message   string `json:"message"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if body.Branch == "" {
		body.Branch = repo.DefaultBranch
	}
	if body.Branch == "" {
		body.Branch = "main"
	}

	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")
	commitSHA, targetBranch, err := git.SaveFile(repoDir, body.Branch, filePath, body.Content, user.Username, user.Email, body.Message, body.NewBranch)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to save file: %v", err))
		return
	}

	database.CreateActivity(user.ID, user.Username, &repo.ID, repo.Name, "push", fmt.Sprintf("Committed file '%s' to branch '%s'", filePath, targetBranch))

	jsonResponse(w, http.StatusOK, map[string]any{
		"message":    "File saved successfully",
		"commit_sha": commitSHA,
		"branch":     targetBranch,
		"file_path":  filePath,
	})
}

func (r *Router) handleDeleteFile(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	filePath := req.PathValue("path")

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	if !database.CanUserAccessRepo(user, repo, true) {
		jsonError(w, http.StatusForbidden, "Write permission required")
		return
	}

	var body struct {
		Branch    string `json:"branch"`
		NewBranch string `json:"new_branch"`
		Message   string `json:"message"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		// Non-fatal, default to empty
	}

	if body.Branch == "" {
		body.Branch = repo.DefaultBranch
	}
	if body.Branch == "" {
		body.Branch = "main"
	}

	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")
	commitSHA, targetBranch, err := git.DeleteFile(repoDir, body.Branch, filePath, user.Username, user.Email, body.Message, body.NewBranch)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to delete file: %v", err))
		return
	}

	database.CreateActivity(user.ID, user.Username, &repo.ID, repo.Name, "push", fmt.Sprintf("Deleted file '%s' from branch '%s'", filePath, targetBranch))

	jsonResponse(w, http.StatusOK, map[string]any{
		"message":    "File deleted successfully",
		"commit_sha": commitSHA,
		"branch":     targetBranch,
		"file_path":  filePath,
	})
}

func (r *Router) handleUploadFiles(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	if !database.CanUserAccessRepo(user, repo, true) {
		jsonError(w, http.StatusForbidden, "Write permission required")
		return
	}

	// 32MB max in-memory for multipart
	if err := req.ParseMultipartForm(32 << 20); err != nil {
		jsonError(w, http.StatusBadRequest, fmt.Sprintf("Failed to parse form: %v", err))
		return
	}

	branch := req.FormValue("branch")
	if branch == "" {
		branch = repo.DefaultBranch
	}
	if branch == "" {
		branch = "main"
	}
	newBranch := req.FormValue("new_branch")
	basePath := req.FormValue("path")
	message := req.FormValue("message")

	formFiles := req.MultipartForm.File["files"]
	if len(formFiles) == 0 {
		jsonError(w, http.StatusBadRequest, "No files uploaded")
		return
	}

	var relativePaths []string
	if relJSON := req.FormValue("relative_paths"); relJSON != "" {
		_ = json.Unmarshal([]byte(relJSON), &relativePaths)
	}

	var files []git.UploadedFile
	for i, fHeader := range formFiles {
		file, err := fHeader.Open()
		if err != nil {
			continue
		}
		data, err := io.ReadAll(file)
		_ = file.Close()
		if err != nil {
			continue
		}

		filePath := fHeader.Filename
		if i < len(relativePaths) && relativePaths[i] != "" {
			filePath = relativePaths[i]
		}

		files = append(files, git.UploadedFile{
			Path: filePath,
			Data: data,
		})
	}

	if len(files) == 0 {
		jsonError(w, http.StatusBadRequest, "No readable files found in upload")
		return
	}

	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")
	commitSHA, targetBranch, err := git.UploadFiles(repoDir, branch, basePath, files, user.Username, user.Email, message, newBranch)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to commit uploaded files: %v", err))
		return
	}

	database.CreateActivity(user.ID, user.Username, &repo.ID, repo.Name, "push", fmt.Sprintf("Uploaded %d files to branch '%s'", len(files), targetBranch))

	jsonResponse(w, http.StatusOK, map[string]any{
		"message":    fmt.Sprintf("Successfully uploaded %d files", len(files)),
		"commit_sha": commitSHA,
		"branch":     targetBranch,
		"num_files":  len(files),
	})
}

// Issues Handlers

func (r *Router) handleListIssues(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	state := req.URL.Query().Get("state")

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	issues, err := database.ListIssues(repo.ID, false, state)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, issues)
}

func (r *Router) handleCreateIssue(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	var body struct {
		Title   string `json:"title"`
		Content string `json:"content"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	body.Title = strings.TrimSpace(body.Title)
	if len(body.Title) < 1 {
		jsonError(w, http.StatusBadRequest, "Issue title is required")
		return
	}

	issue, err := database.CreateIssue(repo.ID, user.ID, body.Title, body.Content, false)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	database.CreateActivity(user.ID, user.Username, &repo.ID, repo.Name, "issue", fmt.Sprintf("Opened issue #%d in %s/%s", issue.IndexNumber, owner, repoName))

	jsonResponse(w, http.StatusCreated, issue)
}

func (r *Router) handleGetIssue(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	index, _ := strconv.ParseInt(req.PathValue("index"), 10, 64)

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	issue, err := database.GetIssueByIndex(repo.ID, index)
	if err != nil || issue == nil {
		jsonError(w, http.StatusNotFound, "Issue not found")
		return
	}

	jsonResponse(w, http.StatusOK, issue)
}

func (r *Router) handleUpdateIssue(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	index, _ := strconv.ParseInt(req.PathValue("index"), 10, 64)

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	issue, err := database.GetIssueByIndex(repo.ID, index)
	if err != nil || issue == nil {
		jsonError(w, http.StatusNotFound, "Issue not found")
		return
	}

	var body struct {
		Closed bool `json:"closed"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	_ = database.UpdateIssueStatus(issue.ID, body.Closed)
	actionType := "close"
	if !body.Closed {
		actionType = "reopen"
	}
	_, _ = database.AddComment(issue.ID, user.ID, actionType, "")

	updated, _ := database.GetIssueByID(issue.ID)
	jsonResponse(w, http.StatusOK, updated)
}

func (r *Router) handleListComments(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	index, _ := strconv.ParseInt(req.PathValue("index"), 10, 64)

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	issue, err := database.GetIssueByIndex(repo.ID, index)
	if err != nil || issue == nil {
		jsonError(w, http.StatusNotFound, "Issue not found")
		return
	}

	comments, err := database.ListComments(issue.ID)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, comments)
}

func (r *Router) handleAddComment(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	index, _ := strconv.ParseInt(req.PathValue("index"), 10, 64)

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	issue, err := database.GetIssueByIndex(repo.ID, index)
	if err != nil || issue == nil {
		jsonError(w, http.StatusNotFound, "Issue not found")
		return
	}

	var body struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	body.Content = strings.TrimSpace(body.Content)
	if len(body.Content) < 1 {
		jsonError(w, http.StatusBadRequest, "Comment content cannot be empty")
		return
	}

	cmt, err := database.AddComment(issue.ID, user.ID, "comment", body.Content)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusCreated, cmt)
}

// Pull Requests Handlers

func (r *Router) handleListPulls(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	state := req.URL.Query().Get("state")

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	issues, err := database.ListIssues(repo.ID, true, state)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var pulls []*database.PullRequest
	for _, iss := range issues {
		pr, err := database.GetPullRequestByIssueID(iss.ID)
		if err == nil && pr != nil {
			pr.Issue = iss
			pulls = append(pulls, pr)
		}
	}

	jsonResponse(w, http.StatusOK, pulls)
}

func (r *Router) handleCreatePull(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	var body struct {
		Title      string `json:"title"`
		Content    string `json:"content"`
		HeadBranch string `json:"head_branch"`
		BaseBranch string `json:"base_branch"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if body.BaseBranch == "" {
		body.BaseBranch = "main"
	}

	pr, err := database.CreatePullRequest(repo.ID, repo.ID, user.ID, body.Title, body.Content, body.HeadBranch, body.BaseBranch)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	database.CreateActivity(user.ID, user.Username, &repo.ID, repo.Name, "pull", fmt.Sprintf("Opened pull request #%d in %s/%s", pr.Issue.IndexNumber, owner, repoName))

	jsonResponse(w, http.StatusCreated, pr)
}

func (r *Router) handleGetPull(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	index, _ := strconv.ParseInt(req.PathValue("index"), 10, 64)

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	issue, err := database.GetIssueByIndex(repo.ID, index)
	if err != nil || issue == nil || !issue.IsPull {
		jsonError(w, http.StatusNotFound, "Pull request not found")
		return
	}

	pr, err := database.GetPullRequestByIssueID(issue.ID)
	if err != nil || pr == nil {
		jsonError(w, http.StatusNotFound, "Pull request details not found")
		return
	}

	pr.Issue = issue
	jsonResponse(w, http.StatusOK, pr)
}

func (r *Router) handleGetPullDiff(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	index, _ := strconv.ParseInt(req.PathValue("index"), 10, 64)

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	issue, err := database.GetIssueByIndex(repo.ID, index)
	if err != nil || issue == nil || !issue.IsPull {
		jsonError(w, http.StatusNotFound, "Pull request not found")
		return
	}

	pr, err := database.GetPullRequestByIssueID(issue.ID)
	if err != nil || pr == nil {
		jsonError(w, http.StatusNotFound, "Pull request details not found")
		return
	}

	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")
	compareResult, err := git.GetBranchDiff(repoDir, pr.BaseBranch, pr.HeadBranch)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, compareResult)
}

func (r *Router) handleCompareBranches(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	base := req.URL.Query().Get("base")
	head := req.URL.Query().Get("head")

	if base == "" {
		base = "main"
	}

	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")
	compareResult, err := git.GetBranchDiff(repoDir, base, head)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, compareResult)
}

func (r *Router) handleMergePull(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	index, _ := strconv.ParseInt(req.PathValue("index"), 10, 64)

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	if !database.CanUserAccessRepo(user, repo, true) {
		jsonError(w, http.StatusForbidden, "Write permission required to merge pull requests")
		return
	}

	issue, err := database.GetIssueByIndex(repo.ID, index)
	if err != nil || issue == nil || !issue.IsPull {
		jsonError(w, http.StatusNotFound, "Pull request not found")
		return
	}

	pr, err := database.GetPullRequestByIssueID(issue.ID)
	if err != nil || pr == nil {
		jsonError(w, http.StatusNotFound, "Pull request not found")
		return
	}

	if pr.IsMerged {
		jsonError(w, http.StatusBadRequest, "Pull request is already merged")
		return
	}

	var body struct {
		MergeStyle string `json:"merge_style"` // "merge", "squash", "rebase"
		Message    string `json:"message"`
	}
	_ = json.NewDecoder(req.Body).Decode(&body)
	if body.MergeStyle == "" {
		body.MergeStyle = "merge"
	}

	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")
	mergeCommitSHA, err := git.MergeBranches(repoDir, pr.BaseBranch, pr.HeadBranch, body.MergeStyle, body.Message, user.Username, user.Email)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, fmt.Sprintf("Merge failed: %v", err))
		return
	}

	_ = database.MarkPullRequestMerged(pr.ID, user.ID, mergeCommitSHA)
	database.CreateActivity(user.ID, user.Username, &repo.ID, repo.Name, "pull", fmt.Sprintf("Merged pull request #%d into %s", issue.IndexNumber, pr.BaseBranch))

	jsonResponse(w, http.StatusOK, map[string]any{
		"message":          "Merged successfully",
		"merge_commit_sha": mergeCommitSHA,
	})
}

// Wiki Handlers

func (r *Router) handleListWikiPages(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	user := auth.AuthenticateRequest(req)
	if !database.CanUserAccessRepo(user, repo, false) {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")
	wikiDir := git.GetWikiRepoPath(repoDir)

	if _, err := os.Stat(wikiDir); os.IsNotExist(err) {
		_ = git.InitWikiRepository(wikiDir, repo.Name, "ProGit", "wiki@progit.io")
	}

	pages, err := git.ListWikiPages(wikiDir)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, pages)
}

func (r *Router) handleGetWikiPage(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	slug := req.PathValue("slug")

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	user := auth.AuthenticateRequest(req)
	if !database.CanUserAccessRepo(user, repo, false) {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")
	wikiDir := git.GetWikiRepoPath(repoDir)

	if _, err := os.Stat(wikiDir); os.IsNotExist(err) {
		_ = git.InitWikiRepository(wikiDir, repo.Name, "ProGit", "wiki@progit.io")
	}

	page, err := git.GetWikiPage(wikiDir, slug)
	if err != nil {
		jsonError(w, http.StatusNotFound, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, page)
}

func (r *Router) handleSaveWikiPage(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	if !database.CanUserAccessRepo(user, repo, true) {
		jsonError(w, http.StatusForbidden, "Write access required")
		return
	}

	var body struct {
		Slug    string `json:"slug"`
		Title   string `json:"title"`
		Content string `json:"content"`
		Message string `json:"message"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if body.Slug == "" {
		body.Slug = "Home"
	}

	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")
	wikiDir := git.GetWikiRepoPath(repoDir)

	if err := git.SaveWikiPage(wikiDir, repo.Name, body.Slug, body.Title, body.Content, user.Username, user.Email, body.Message); err != nil {
		jsonError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to save wiki page: %v", err))
		return
	}

	database.CreateActivity(user.ID, user.Username, &repo.ID, repo.Name, "wiki", fmt.Sprintf("Updated wiki page '%s' in %s/%s", body.Slug, owner, repoName))

	page, _ := git.GetWikiPage(wikiDir, body.Slug)
	jsonResponse(w, http.StatusOK, page)
}

func (r *Router) handleDeleteWikiPage(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	slug := req.PathValue("slug")

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	if !database.CanUserAccessRepo(user, repo, true) {
		jsonError(w, http.StatusForbidden, "Write access required")
		return
	}

	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")
	wikiDir := git.GetWikiRepoPath(repoDir)

	if err := git.DeleteWikiPage(wikiDir, slug, user.Username, user.Email); err != nil {
		jsonError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to delete wiki page: %v", err))
		return
	}

	database.CreateActivity(user.ID, user.Username, &repo.ID, repo.Name, "wiki", fmt.Sprintf("Deleted wiki page '%s' in %s/%s", slug, owner, repoName))

	jsonResponse(w, http.StatusOK, map[string]string{"message": "Wiki page deleted successfully"})
}

func (r *Router) handleGetWikiPageHistory(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	slug := req.PathValue("slug")

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	user := auth.AuthenticateRequest(req)
	if !database.CanUserAccessRepo(user, repo, false) {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")
	wikiDir := git.GetWikiRepoPath(repoDir)

	_ = slug
	commits, err := git.GetCommits(wikiDir, "main", 50, 0)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, commits)
}

// ProGit Pages & Repository Settings Handlers

func (r *Router) handleGetPagesConfig(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	user := auth.AuthenticateRequest(req)
	if !database.CanUserAccessRepo(user, repo, false) {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")
	branches, _ := git.GetBranches(repoDir)

	pagesURL := fmt.Sprintf("%spages/%s/%s/", r.cfg.Server.RootURL, owner, repoName)

	jsonResponse(w, http.StatusOK, map[string]any{
		"enable_pages": repo.EnablePages,
		"pages_branch": repo.PagesBranch,
		"pages_folder": repo.PagesFolder,
		"pages_url":    pagesURL,
		"branches":     branches,
	})
}

func (r *Router) handleUpdatePagesConfig(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	if !user.IsAdmin && user.ID != repo.OwnerID {
		jsonError(w, http.StatusForbidden, "Forbidden")
		return
	}

	var body struct {
		EnablePages bool   `json:"enable_pages"`
		PagesBranch string `json:"pages_branch"`
		PagesFolder string `json:"pages_folder"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if body.PagesBranch == "" {
		body.PagesBranch = "gh-pages"
	}
	if body.PagesFolder == "" {
		body.PagesFolder = "/"
	}

	if err := database.UpdateRepositorySettings(repo.ID, repo.Description, repo.IsPrivate, repo.EnableWiki, body.EnablePages, body.PagesBranch, body.PagesFolder); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	updatedRepo, _ := database.GetRepositoryByID(repo.ID)
	pagesURL := fmt.Sprintf("%spages/%s/%s/", r.cfg.Server.RootURL, owner, repoName)

	jsonResponse(w, http.StatusOK, map[string]any{
		"message":    "Pages configuration updated",
		"repository": updatedRepo,
		"pages_url":  pagesURL,
	})
}

func (r *Router) handleUpdateRepoSettings(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	if !user.IsAdmin && user.ID != repo.OwnerID {
		jsonError(w, http.StatusForbidden, "Forbidden")
		return
	}

	var body struct {
		Description *string `json:"description"`
		IsPrivate   *bool   `json:"is_private"`
		EnableWiki  *bool   `json:"enable_wiki"`
		EnablePages *bool   `json:"enable_pages"`
		PagesBranch *string `json:"pages_branch"`
		PagesFolder *string `json:"pages_folder"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	desc := repo.Description
	if body.Description != nil {
		desc = *body.Description
	}
	priv := repo.IsPrivate
	if body.IsPrivate != nil {
		priv = *body.IsPrivate
	}
	wiki := repo.EnableWiki
	if body.EnableWiki != nil {
		wiki = *body.EnableWiki
	}
	pages := repo.EnablePages
	if body.EnablePages != nil {
		pages = *body.EnablePages
	}
	pBranch := repo.PagesBranch
	if body.PagesBranch != nil {
		pBranch = *body.PagesBranch
	}
	pFolder := repo.PagesFolder
	if body.PagesFolder != nil {
		pFolder = *body.PagesFolder
	}

	if err := database.UpdateRepositorySettings(repo.ID, desc, priv, wiki, pages, pBranch, pFolder); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	updatedRepo, _ := database.GetRepositoryByID(repo.ID)
	jsonResponse(w, http.StatusOK, updatedRepo)
}

func (r *Router) handleServePages(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	subPath := req.PathValue("path")

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		http.NotFound(w, req)
		return
	}

	if !repo.EnablePages {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte("ProGit Pages is not enabled for this repository."))
		return
	}

	if repo.IsPrivate {
		user := auth.AuthenticateRequest(req)
		if !database.CanUserAccessRepo(user, repo, false) {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte("Access to private repository Pages requires authentication."))
			return
		}
	}

	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")
	branch := repo.PagesBranch
	if branch == "" {
		branch = "gh-pages"
	}
	folder := strings.Trim(repo.PagesFolder, "/")

	// Default file
	subPath = strings.TrimPrefix(subPath, "/")
	if subPath == "" || strings.HasSuffix(subPath, "/") {
		subPath = filepath.Join(subPath, "index.html")
	}

	filePath := subPath
	if folder != "" {
		filePath = filepath.Join(folder, subPath)
	}

	content, err := git.GetRaw(repoDir, branch, filePath)
	if err != nil {
		if strings.HasSuffix(filePath, "index.html") {
			baseDir := filepath.Dir(filePath)
			mdPath := filepath.Join(baseDir, "index.md")
			if baseDir == "." {
				mdPath = "index.md"
			}
			content, err = git.GetRaw(repoDir, branch, mdPath)
			if err != nil {
				readmePath := filepath.Join(baseDir, "README.md")
				if baseDir == "." {
					readmePath = "README.md"
				}
				content, err = git.GetRaw(repoDir, branch, readmePath)
				if err == nil {
					filePath = readmePath
				}
			} else {
				filePath = mdPath
			}
		}
	}

	if err != nil {
		custom404Path := "404.html"
		if folder != "" {
			custom404Path = filepath.Join(folder, "404.html")
		}
		if notFoundContent, err404 := git.GetRaw(repoDir, branch, custom404Path); err404 == nil {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write(notFoundContent)
			return
		}
		http.NotFound(w, req)
		return
	}

	ext := strings.ToLower(filepath.Ext(filePath))
	switch ext {
	case ".html", ".htm":
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(content)
	case ".md":
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		html := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>%s/%s - ProGit Pages</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #24292f; background: #fff; }
    @media (prefers-color-scheme: dark) { body { color: #c9d1d9; background: #0d1117; } a { color: #58a6ff; } }
    pre { background: #f6f8fa; padding: 16px; border-radius: 6px; overflow: auto; }
    code { font-family: monospace; font-size: 85%%; }
    h1, h2, h3 { border-bottom: 1px solid #d0d7de; padding-bottom: 8px; }
    footer { margin-top: 50px; font-size: 12px; color: #57606a; border-top: 1px solid #d0d7de; padding-top: 10px; }
  </style>
</head>
<body>
  <div class="content"><pre style="background:transparent;border:none;white-space:pre-wrap;font-family:inherit;">%s</pre></div>
  <footer>Published with ProGit Pages • Repository: <a href="/%s/%s">%s/%s</a></footer>
</body>
</html>`, repo.OwnerName, repo.Name, strings.ReplaceAll(string(content), "<", "&lt;"), repo.OwnerName, repo.Name, repo.OwnerName, repo.Name)
		_, _ = w.Write([]byte(html))
	case ".css":
		w.Header().Set("Content-Type", "text/css; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(content)
	case ".js":
		w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(content)
	case ".json":
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(content)
	case ".svg":
		w.Header().Set("Content-Type", "image/svg+xml")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(content)
	case ".png":
		w.Header().Set("Content-Type", "image/png")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(content)
	case ".jpg", ".jpeg":
		w.Header().Set("Content-Type", "image/jpeg")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(content)
	case ".gif":
		w.Header().Set("Content-Type", "image/gif")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(content)
	case ".ico":
		w.Header().Set("Content-Type", "image/x-icon")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(content)
	default:
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(content)
	}
}

// Installation Handlers

func (r *Router) handleInstallStatus(w http.ResponseWriter, req *http.Request) {
	userCount, _ := database.CountUsers()
	locked := r.cfg.Security.InstallLock && userCount > 0

	jsonResponse(w, http.StatusOK, map[string]any{
		"install_locked":    locked,
		"users_count":       userCount,
		"app_name":          r.cfg.Server.AppName,
		"domain":            r.cfg.Server.Domain,
		"http_port":         r.cfg.Server.HTTPPort,
		"root_url":          r.cfg.Server.RootURL,
		"database_path":     r.cfg.Database.Path,
		"repositories_path": r.cfg.Repository.Root,
		"ssh_port":          r.cfg.SSH.Port,
	})
}

func (r *Router) handleInstall(w http.ResponseWriter, req *http.Request) {
	userCount, _ := database.CountUsers()
	if r.cfg.Security.InstallLock && userCount > 0 {
		jsonError(w, http.StatusForbidden, "Installation is already completed and locked")
		return
	}

	var body struct {
		AppName       string `json:"app_name"`
		Domain        string `json:"domain"`
		HTTPPort      int    `json:"http_port"`
		RootURL       string `json:"root_url"`
		AdminUsername string `json:"admin_username"`
		AdminEmail    string `json:"admin_email"`
		AdminPassword string `json:"admin_password"`
	}

	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	body.AdminUsername = strings.TrimSpace(body.AdminUsername)
	body.AdminEmail = strings.TrimSpace(body.AdminEmail)

	if len(body.AdminUsername) < 2 {
		jsonError(w, http.StatusBadRequest, "Admin username must be at least 2 characters")
		return
	}
	if !strings.Contains(body.AdminEmail, "@") {
		jsonError(w, http.StatusBadRequest, "Invalid admin email address")
		return
	}
	if len(body.AdminPassword) < 6 {
		jsonError(w, http.StatusBadRequest, "Admin password must be at least 6 characters")
		return
	}

	if body.AppName != "" {
		r.cfg.Server.AppName = body.AppName
	}
	if body.Domain != "" {
		r.cfg.Server.Domain = body.Domain
	}
	if body.HTTPPort > 0 {
		r.cfg.Server.HTTPPort = body.HTTPPort
	}
	if body.RootURL != "" {
		r.cfg.Server.RootURL = body.RootURL
	}
	r.cfg.Security.InstallLock = true
	_ = config.Save("conf/app.ini", r.cfg)

	// Create or ensure Super Admin user
	hash, err := auth.HashPassword(body.AdminPassword)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "Failed to hash password")
		return
	}

	user, err := database.CreateUser(body.AdminUsername, body.AdminEmail, hash, "Super Admin", true)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to create super admin: %v", err))
		return
	}

	sess, err := auth.CreateSession(user.ID, user.Username)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "Failed to create session")
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     auth.SessionCookieName,
		Value:    sess.Token,
		Path:     "/",
		HttpOnly: true,
		Secure:   r.cfg.Security.CookieSecure,
		SameSite: http.SameSiteLaxMode,
		Expires:  sess.ExpiresAt,
	})

	database.CreateActivity(user.ID, user.Username, nil, "", "install", "Completed ProGit installation and initialized Super Admin account")

	jsonResponse(w, http.StatusOK, map[string]any{
		"message": "ProGit successfully installed",
		"token":   sess.Token,
		"user":    user,
	})
}

// Administration Handlers

func (r *Router) handleAdminStats(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	if user == nil || !user.IsAdmin {
		jsonError(w, http.StatusForbidden, "Administrator privileges required")
		return
	}

	userCount, _ := database.CountUsers()
	repoCount, _ := database.CountRepositories()

	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)

	jsonResponse(w, http.StatusOK, map[string]any{
		"users_count":           userCount,
		"repositories_count":    repoCount,
		"uptime":                time.Since(startTime).String(),
		"database_path":         r.cfg.Database.Path,
		"repositories_path":     r.cfg.Repository.Root,
		"ssh_enabled":           r.cfg.SSH.Enabled,
		"ssh_port":              r.cfg.SSH.Port,
		"domain":                r.cfg.Server.Domain,
		"http_port":             r.cfg.Server.HTTPPort,
		"root_url":              r.cfg.Server.RootURL,
		"app_name":              r.cfg.Server.AppName,
		"go_version":            runtime.Version(),
		"num_goroutines":        runtime.NumGoroutine(),
		"memory_alloc_mb":       float64(mem.Alloc) / 1024 / 1024,
		"memory_sys_mb":         float64(mem.Sys) / 1024 / 1024,
		"active_sessions_count": auth.CountActiveSessions(),
		"install_locked":        r.cfg.Security.InstallLock,
	})
}

func (r *Router) handleAdminUsers(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	if user == nil || !user.IsAdmin {
		jsonError(w, http.StatusForbidden, "Administrator privileges required")
		return
	}

	users, err := database.ListUsers(100, 0)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, users)
}

func (r *Router) handleAdminCreateUser(w http.ResponseWriter, req *http.Request) {
	currentAdmin := auth.AuthenticateRequest(req)
	if currentAdmin == nil || !currentAdmin.IsAdmin {
		jsonError(w, http.StatusForbidden, "Administrator privileges required")
		return
	}

	var body struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		Password string `json:"password"`
		FullName string `json:"full_name"`
		IsAdmin  bool   `json:"is_admin"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	body.Username = strings.TrimSpace(body.Username)
	body.Email = strings.TrimSpace(body.Email)
	if len(body.Username) < 2 {
		jsonError(w, http.StatusBadRequest, "Username must be at least 2 characters")
		return
	}
	if !strings.Contains(body.Email, "@") {
		jsonError(w, http.StatusBadRequest, "Invalid email address")
		return
	}
	if len(body.Password) < 6 {
		jsonError(w, http.StatusBadRequest, "Password must be at least 6 characters")
		return
	}

	hash, err := auth.HashPassword(body.Password)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "Failed to hash password")
		return
	}

	newUser, err := database.CreateUser(body.Username, body.Email, hash, body.FullName, body.IsAdmin)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			jsonError(w, http.StatusConflict, "Username or email is already registered")
			return
		}
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	database.CreateActivity(currentAdmin.ID, currentAdmin.Username, nil, "", "admin_create_user", fmt.Sprintf("Admin created user @%s (admin=%v)", newUser.Username, newUser.IsAdmin))
	jsonResponse(w, http.StatusCreated, newUser)
}

func (r *Router) handleAdminUpdateUser(w http.ResponseWriter, req *http.Request) {
	currentAdmin := auth.AuthenticateRequest(req)
	if currentAdmin == nil || !currentAdmin.IsAdmin {
		jsonError(w, http.StatusForbidden, "Administrator privileges required")
		return
	}

	idStr := req.PathValue("id")
	targetID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid user ID")
		return
	}

	targetUser, err := database.GetUserByID(targetID)
	if err != nil || targetUser == nil {
		jsonError(w, http.StatusNotFound, "User not found")
		return
	}

	var body struct {
		IsAdmin  *bool `json:"is_admin"`
		IsActive *bool `json:"is_active"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Safety check: Cannot demote or deactivate yourself
	if targetUser.ID == currentAdmin.ID {
		if body.IsAdmin != nil && !*body.IsAdmin {
			jsonError(w, http.StatusBadRequest, "You cannot remove administrator privileges from yourself")
			return
		}
		if body.IsActive != nil && !*body.IsActive {
			jsonError(w, http.StatusBadRequest, "You cannot deactivate your own account")
			return
		}
	}

	if body.IsAdmin != nil {
		if err := database.UpdateUserAdmin(targetID, *body.IsAdmin); err != nil {
			jsonError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	if body.IsActive != nil {
		if err := database.UpdateUserStatus(targetID, *body.IsActive); err != nil {
			jsonError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	updatedUser, _ := database.GetUserByID(targetID)
	jsonResponse(w, http.StatusOK, updatedUser)
}

func (r *Router) handleAdminDeleteUser(w http.ResponseWriter, req *http.Request) {
	currentAdmin := auth.AuthenticateRequest(req)
	if currentAdmin == nil || !currentAdmin.IsAdmin {
		jsonError(w, http.StatusForbidden, "Administrator privileges required")
		return
	}

	idStr := req.PathValue("id")
	targetID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid user ID")
		return
	}

	if targetID == currentAdmin.ID {
		jsonError(w, http.StatusBadRequest, "You cannot delete your own account")
		return
	}

	targetUser, err := database.GetUserByID(targetID)
	if err != nil || targetUser == nil {
		jsonError(w, http.StatusNotFound, "User not found")
		return
	}

	// Clean up user repository directory on disk
	userReposDir := filepath.Join(r.cfg.Repository.Root, targetUser.Username)
	_ = os.RemoveAll(userReposDir)

	if err := database.DeleteUser(targetID); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	database.CreateActivity(currentAdmin.ID, currentAdmin.Username, nil, "", "admin_delete_user", fmt.Sprintf("Admin deleted user @%s", targetUser.Username))
	jsonResponse(w, http.StatusOK, map[string]string{"message": "User deleted successfully"})
}

func (r *Router) handleAdminRepos(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	if user == nil || !user.IsAdmin {
		jsonError(w, http.StatusForbidden, "Administrator privileges required")
		return
	}

	repos, err := database.ListRepositories(100, 0, false)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, repos)
}

func (r *Router) handleAdminDeleteRepo(w http.ResponseWriter, req *http.Request) {
	currentAdmin := auth.AuthenticateRequest(req)
	if currentAdmin == nil || !currentAdmin.IsAdmin {
		jsonError(w, http.StatusForbidden, "Administrator privileges required")
		return
	}

	idStr := req.PathValue("id")
	repoID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid repository ID")
		return
	}

	repo, err := database.GetRepositoryByID(repoID)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	repoDir := filepath.Join(r.cfg.Repository.Root, repo.OwnerName, repo.Name+".git")
	_ = os.RemoveAll(repoDir)
	_ = database.DeleteRepository(repoID)

	database.CreateActivity(currentAdmin.ID, currentAdmin.Username, nil, "", "admin_delete_repo", fmt.Sprintf("Admin deleted repository %s/%s", repo.OwnerName, repo.Name))
	jsonResponse(w, http.StatusOK, map[string]string{"message": "Repository deleted successfully"})
}

func (r *Router) handleAdminMaintenance(w http.ResponseWriter, req *http.Request) {
	currentAdmin := auth.AuthenticateRequest(req)
	if currentAdmin == nil || !currentAdmin.IsAdmin {
		jsonError(w, http.StatusForbidden, "Administrator privileges required")
		return
	}

	var body struct {
		Operation string `json:"operation"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	switch body.Operation {
	case "checkpoint_wal":
		if err := database.CheckpointWAL(); err != nil {
			jsonError(w, http.StatusInternalServerError, fmt.Sprintf("WAL checkpoint failed: %v", err))
			return
		}
		jsonResponse(w, http.StatusOK, map[string]string{"message": "SQLite WAL journal checkpointed and truncated successfully"})
	case "vacuum":
		if err := database.VacuumDB(); err != nil {
			jsonError(w, http.StatusInternalServerError, fmt.Sprintf("Database vacuum failed: %v", err))
			return
		}
		jsonResponse(w, http.StatusOK, map[string]string{"message": "Database VACUUM completed successfully"})
	default:
		jsonError(w, http.StatusBadRequest, "Unknown maintenance operation")
	}
}

// ============================================================================
// Collaborator Handlers
// ============================================================================

func (r *Router) handleListCollaborators(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	user := auth.AuthenticateRequest(req)
	if !database.CanUserAccessRepo(user, repo, false) {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	collabs, err := database.ListCollaborators(repo.ID)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if collabs == nil {
		collabs = []database.CollaboratorUser{}
	}
	jsonResponse(w, http.StatusOK, collabs)
}

func (r *Router) handleAddCollaborator(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	collaboratorName := req.PathValue("collaborator")

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	canAdmin := user.IsAdmin || user.ID == repo.OwnerID
	if !canAdmin {
		if org, _ := database.GetOrgByName(repo.OwnerName); org != nil {
			canAdmin = database.IsOrgAdmin(org.ID, user.ID)
		}
	}
	if !canAdmin {
		jsonError(w, http.StatusForbidden, "Admin privileges required to manage collaborators")
		return
	}

	targetUser, err := database.GetUserByUsername(collaboratorName)
	if err != nil || targetUser == nil {
		jsonError(w, http.StatusNotFound, "User not found")
		return
	}

	var body struct {
		Mode string `json:"mode"`
	}
	_ = json.NewDecoder(req.Body).Decode(&body)
	if body.Mode == "" {
		body.Mode = "write"
	}

	if err := database.AddCollaborator(repo.ID, targetUser.ID, body.Mode); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{
		"message":  "Collaborator updated successfully",
		"username": targetUser.Username,
		"mode":     body.Mode,
	})
}

func (r *Router) handleRemoveCollaborator(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	collaboratorName := req.PathValue("collaborator")

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	canAdmin := user.IsAdmin || user.ID == repo.OwnerID
	if !canAdmin {
		if org, _ := database.GetOrgByName(repo.OwnerName); org != nil {
			canAdmin = database.IsOrgAdmin(org.ID, user.ID)
		}
	}
	if !canAdmin {
		jsonError(w, http.StatusForbidden, "Admin privileges required to manage collaborators")
		return
	}

	targetUser, err := database.GetUserByUsername(collaboratorName)
	if err != nil || targetUser == nil {
		jsonError(w, http.StatusNotFound, "User not found")
		return
	}

	if err := database.RemoveCollaborator(repo.ID, targetUser.ID); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{"message": "Collaborator removed successfully"})
}

// ============================================================================
// Organization Handlers
// ============================================================================

func (r *Router) handleCreateOrg(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var body struct {
		Name        string `json:"name"`
		FullName    string `json:"full_name"`
		Description string `json:"description"`
		Location    string `json:"location"`
		Website     string `json:"website"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" {
		jsonError(w, http.StatusBadRequest, "Organization name is required")
		return
	}

	org, err := database.CreateOrganization(body.Name, body.FullName, body.Description, body.Location, body.Website, user.ID)
	if err != nil {
		if strings.Contains(err.Error(), "already taken") || strings.Contains(err.Error(), "UNIQUE") {
			jsonError(w, http.StatusConflict, fmt.Sprintf("Organization name '%s' is already in use", body.Name))
			return
		}
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	database.CreateActivity(user.ID, user.Username, nil, "", "create_org", fmt.Sprintf("Created organization @%s", org.Name))
	jsonResponse(w, http.StatusCreated, org)
}

func (r *Router) handleListOrgs(w http.ResponseWriter, req *http.Request) {
	orgs, err := database.ListAllOrganizations()
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if orgs == nil {
		orgs = []database.Organization{}
	}
	jsonResponse(w, http.StatusOK, orgs)
}

func (r *Router) handleListUserOrgs(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	orgs, err := database.ListUserOrganizations(user.ID)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if orgs == nil {
		orgs = []database.Organization{}
	}
	jsonResponse(w, http.StatusOK, orgs)
}

func (r *Router) handleGetOrg(w http.ResponseWriter, req *http.Request) {
	orgName := req.PathValue("org")
	org, err := database.GetOrgByName(orgName)
	if err != nil || org == nil {
		jsonError(w, http.StatusNotFound, "Organization not found")
		return
	}

	user := auth.AuthenticateRequest(req)
	isMember := false
	isAdmin := false
	if user != nil {
		if user.IsAdmin {
			isAdmin = true
			isMember = true
		} else {
			isAdmin = database.IsOrgAdmin(org.ID, user.ID)
			members, _ := database.ListOrgMembers(org.ID)
			for _, m := range members {
				if m.UserID == user.ID {
					isMember = true
					break
				}
			}
		}
	}

	jsonResponse(w, http.StatusOK, map[string]any{
		"organization": org,
		"is_member":    isMember,
		"is_admin":     isAdmin,
	})
}

func (r *Router) handleListOrgMembers(w http.ResponseWriter, req *http.Request) {
	orgName := req.PathValue("org")
	org, err := database.GetOrgByName(orgName)
	if err != nil || org == nil {
		jsonError(w, http.StatusNotFound, "Organization not found")
		return
	}

	members, err := database.ListOrgMembers(org.ID)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if members == nil {
		members = []database.OrgMember{}
	}
	jsonResponse(w, http.StatusOK, members)
}

func (r *Router) handleAddOrgMember(w http.ResponseWriter, req *http.Request) {
	orgName := req.PathValue("org")
	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	org, err := database.GetOrgByName(orgName)
	if err != nil || org == nil {
		jsonError(w, http.StatusNotFound, "Organization not found")
		return
	}

	if !user.IsAdmin && !database.IsOrgAdmin(org.ID, user.ID) {
		jsonError(w, http.StatusForbidden, "Organization admin privileges required")
		return
	}

	var body struct {
		Username string `json:"username"`
		Role     string `json:"role"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	targetUser, err := database.GetUserByUsername(body.Username)
	if err != nil || targetUser == nil {
		jsonError(w, http.StatusNotFound, "User not found")
		return
	}

	if body.Role == "" {
		body.Role = "member"
	}

	if err := database.AddOrgMember(org.ID, targetUser.ID, body.Role); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{
		"message":  "Member added to organization successfully",
		"username": targetUser.Username,
		"role":     body.Role,
	})
}

func (r *Router) handleRemoveOrgMember(w http.ResponseWriter, req *http.Request) {
	orgName := req.PathValue("org")
	username := req.PathValue("username")
	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	org, err := database.GetOrgByName(orgName)
	if err != nil || org == nil {
		jsonError(w, http.StatusNotFound, "Organization not found")
		return
	}

	if !user.IsAdmin && !database.IsOrgAdmin(org.ID, user.ID) {
		jsonError(w, http.StatusForbidden, "Organization admin privileges required")
		return
	}

	targetUser, err := database.GetUserByUsername(username)
	if err != nil || targetUser == nil {
		jsonError(w, http.StatusNotFound, "User not found")
		return
	}

	if err := database.RemoveOrgMember(org.ID, targetUser.ID); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{"message": "Member removed from organization"})
}

func (r *Router) handleListOrgTeams(w http.ResponseWriter, req *http.Request) {
	orgName := req.PathValue("org")
	org, err := database.GetOrgByName(orgName)
	if err != nil || org == nil {
		jsonError(w, http.StatusNotFound, "Organization not found")
		return
	}

	teams, err := database.ListTeams(org.ID)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if teams == nil {
		teams = []database.Team{}
	}
	jsonResponse(w, http.StatusOK, teams)
}

func (r *Router) handleCreateOrgTeam(w http.ResponseWriter, req *http.Request) {
	orgName := req.PathValue("org")
	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	org, err := database.GetOrgByName(orgName)
	if err != nil || org == nil {
		jsonError(w, http.StatusNotFound, "Organization not found")
		return
	}

	if !user.IsAdmin && !database.IsOrgAdmin(org.ID, user.ID) {
		jsonError(w, http.StatusForbidden, "Organization admin privileges required")
		return
	}

	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Permission  string `json:"permission"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	team, err := database.CreateTeam(org.ID, body.Name, body.Description, body.Permission)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusCreated, team)
}

func (r *Router) handleAddTeamMember(w http.ResponseWriter, req *http.Request) {
	teamIDStr := req.PathValue("team_id")
	teamID, err := strconv.ParseInt(teamIDStr, 10, 64)
	if err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid team ID")
		return
	}

	var body struct {
		Username string `json:"username"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	targetUser, err := database.GetUserByUsername(body.Username)
	if err != nil || targetUser == nil {
		jsonError(w, http.StatusNotFound, "User not found")
		return
	}

	if err := database.AddTeamMember(teamID, targetUser.ID); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{"message": "Team member added"})
}

func (r *Router) handleRemoveTeamMember(w http.ResponseWriter, req *http.Request) {
	teamIDStr := req.PathValue("team_id")
	userIDStr := req.PathValue("user_id")
	teamID, _ := strconv.ParseInt(teamIDStr, 10, 64)
	userID, _ := strconv.ParseInt(userIDStr, 10, 64)

	if err := database.RemoveTeamMember(teamID, userID); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{"message": "Team member removed"})
}

func (r *Router) handleListOrgRepos(w http.ResponseWriter, req *http.Request) {
	orgName := req.PathValue("org")
	org, err := database.GetOrgByName(orgName)
	if err != nil || org == nil {
		jsonError(w, http.StatusNotFound, "Organization not found")
		return
	}

	user := auth.AuthenticateRequest(req)
	isMember := false
	if user != nil {
		if user.IsAdmin || database.IsOrgAdmin(org.ID, user.ID) {
			isMember = true
		} else {
			members, _ := database.ListOrgMembers(org.ID)
			for _, m := range members {
				if m.UserID == user.ID {
					isMember = true
					break
				}
			}
		}
	}

	allRepos, err := database.ListRepositories(100, 0, !isMember)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var orgRepos []*database.Repository
	for _, repo := range allRepos {
		if strings.EqualFold(repo.OwnerName, orgName) {
			orgRepos = append(orgRepos, repo)
		}
	}
	if orgRepos == nil {
		orgRepos = []*database.Repository{}
	}

	jsonResponse(w, http.StatusOK, orgRepos)
}

// ============================================================================
// Project Handlers
// ============================================================================

func (r *Router) handleListProjects(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	user := auth.AuthenticateRequest(req)
	if !database.CanUserAccessRepo(user, repo, false) {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	projects, err := database.ListRepoProjects(repo.ID)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if projects == nil {
		projects = []database.Project{}
	}

	jsonResponse(w, http.StatusOK, projects)
}

func (r *Router) handleCreateProject(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	if !database.CanUserAccessRepo(user, repo, true) {
		jsonError(w, http.StatusForbidden, "Write permission required to create project")
		return
	}

	var body struct {
		Title       string `json:"title"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	body.Title = strings.TrimSpace(body.Title)
	if body.Title == "" {
		jsonError(w, http.StatusBadRequest, "Project title is required")
		return
	}

	project, err := database.CreateProject(repo.ID, user.ID, body.Title, body.Description)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	database.CreateActivity(user.ID, user.Username, &repo.ID, repo.Name, "project", fmt.Sprintf("Created project '%s'", project.Title))
	jsonResponse(w, http.StatusCreated, project)
}

func (r *Router) handleGetProject(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	idStr := req.PathValue("id")
	projectID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid project ID")
		return
	}

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	user := auth.AuthenticateRequest(req)
	if !database.CanUserAccessRepo(user, repo, false) {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	project, err := database.GetProjectByID(projectID)
	if err != nil || project == nil {
		jsonError(w, http.StatusNotFound, "Project not found")
		return
	}

	jsonResponse(w, http.StatusOK, project)
}

func (r *Router) handleUpdateProject(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	idStr := req.PathValue("id")
	projectID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid project ID")
		return
	}

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	if !database.CanUserAccessRepo(user, repo, true) {
		jsonError(w, http.StatusForbidden, "Write permission required")
		return
	}

	var body struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		IsClosed    bool   `json:"is_closed"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := database.UpdateProject(projectID, body.Title, body.Description, body.IsClosed); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	proj, _ := database.GetProjectByID(projectID)
	jsonResponse(w, http.StatusOK, proj)
}

func (r *Router) handleDeleteProject(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	idStr := req.PathValue("id")
	projectID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid project ID")
		return
	}

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	if !database.CanUserAccessRepo(user, repo, true) {
		jsonError(w, http.StatusForbidden, "Write permission required")
		return
	}

	if err := database.DeleteProject(projectID); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{"message": "Project deleted successfully"})
}

func (r *Router) handleCreateProjectColumn(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	idStr := req.PathValue("id")
	projectID, _ := strconv.ParseInt(idStr, 10, 64)

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	if !database.CanUserAccessRepo(user, repo, true) {
		jsonError(w, http.StatusForbidden, "Write permission required")
		return
	}

	var body struct {
		Title    string `json:"title"`
		OrderNum int    `json:"order_num"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	col, err := database.CreateProjectColumn(projectID, body.Title, body.OrderNum)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusCreated, col)
}

func (r *Router) handleDeleteProjectColumn(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	colIDStr := req.PathValue("column_id")
	colID, _ := strconv.ParseInt(colIDStr, 10, 64)

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	if !database.CanUserAccessRepo(user, repo, true) {
		jsonError(w, http.StatusForbidden, "Write permission required")
		return
	}

	if err := database.DeleteProjectColumn(colID); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{"message": "Column deleted successfully"})
}

func (r *Router) handleCreateProjectCard(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	idStr := req.PathValue("id")
	projectID, _ := strconv.ParseInt(idStr, 10, 64)

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	if !database.CanUserAccessRepo(user, repo, true) {
		jsonError(w, http.StatusForbidden, "Write permission required")
		return
	}

	var body struct {
		ColumnID int64  `json:"column_id"`
		IssueID  *int64 `json:"issue_id"`
		Content  string `json:"content"`
		OrderNum int    `json:"order_num"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	card, err := database.CreateProjectCard(projectID, body.ColumnID, user.ID, body.IssueID, body.Content, body.OrderNum)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusCreated, card)
}

func (r *Router) handleMoveProjectCard(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	cardIDStr := req.PathValue("card_id")
	cardID, _ := strconv.ParseInt(cardIDStr, 10, 64)

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	if !database.CanUserAccessRepo(user, repo, true) {
		jsonError(w, http.StatusForbidden, "Write permission required")
		return
	}

	var body struct {
		ColumnID int64 `json:"column_id"`
		OrderNum int   `json:"order_num"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := database.MoveProjectCard(cardID, body.ColumnID, body.OrderNum); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{"message": "Card moved successfully"})
}

func (r *Router) handleDeleteProjectCard(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	cardIDStr := req.PathValue("card_id")
	cardID, _ := strconv.ParseInt(cardIDStr, 10, 64)

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	if !database.CanUserAccessRepo(user, repo, true) {
		jsonError(w, http.StatusForbidden, "Write permission required")
		return
	}

	if err := database.DeleteProjectCard(cardID); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{"message": "Card deleted successfully"})
}

