package api

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	gossh "golang.org/x/crypto/ssh"
	"progit.io/progit/internal/auth"
	"progit.io/progit/internal/config"
	"progit.io/progit/internal/database"
	"progit.io/progit/internal/git"
)

var (
	startTime = time.Now()
	Version   = "1.3.0"
)

type ipRateLimiter struct {
	mu       sync.Mutex
	attempts map[string][]time.Time
	limit    int
	window   time.Duration
}

func newIPRateLimiter(limit int, window time.Duration) *ipRateLimiter {
	return &ipRateLimiter{
		attempts: make(map[string][]time.Time),
		limit:    limit,
		window:   window,
	}
}

func (rl *ipRateLimiter) allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-rl.window)

	var valid []time.Time
	for _, t := range rl.attempts[ip] {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}

	if len(valid) >= rl.limit {
		rl.attempts[ip] = valid
		return false
	}

	valid = append(valid, now)
	rl.attempts[ip] = valid
	return true
}

func getClientIP(req *http.Request) string {
	if xff := req.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	if xri := req.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}
	host, _, err := net.SplitHostPort(req.RemoteAddr)
	if err == nil {
		return host
	}
	return req.RemoteAddr
}

type Router struct {
	cfg         *config.Config
	mux         *http.ServeMux
	authLimiter *ipRateLimiter
}

func NewRouter(cfg *config.Config) *Router {
	r := &Router{
		cfg:         cfg,
		mux:         http.NewServeMux(),
		authLimiter: newIPRateLimiter(120, 1*time.Minute),
	}
	r.registerRoutes()
	return r
}

func (r *Router) isAllowedOrigin(origin string) bool {
	if origin == "" {
		return false
	}
	parsed, err := url.Parse(origin)
	if err != nil {
		return false
	}
	originHost := strings.ToLower(parsed.Hostname())
	// Allow localhost / loopback for local frontend dev (Vite, React, tests)
	if originHost == "localhost" || originHost == "127.0.0.1" || originHost == "::1" {
		return true
	}
	if strings.EqualFold(originHost, r.cfg.Server.Domain) {
		return true
	}
	if r.cfg.Server.RootURL != "" {
		if rootParsed, err := url.Parse(r.cfg.Server.RootURL); err == nil {
			if strings.EqualFold(originHost, rootParsed.Hostname()) {
				return true
			}
		}
	}
	return false
}

func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	// Global security headers
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Frame-Options", "SAMEORIGIN")
	w.Header().Set("X-XSS-Protection", "1; mode=block")
	w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")

	// HSTS when HTTPS is active or configured
	if r.cfg.Server.HSTSMaxAge > 0 && (req.TLS != nil || req.Header.Get("X-Forwarded-Proto") == "https" || r.cfg.Server.Protocol == "https") {
		w.Header().Set("Strict-Transport-Security", fmt.Sprintf("max-age=%d; includeSubDomains; preload", r.cfg.Server.HSTSMaxAge))
	}

	// CORS handling for API with origin validation to prevent credential theft
	if strings.HasPrefix(req.URL.Path, "/api/") {
		origin := req.Header.Get("Origin")
		if origin != "" {
			if r.isAllowedOrigin(origin) {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
			}
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
		if req.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
	}

	// Bounded body reader for API requests to mitigate memory exhaustion DoS
	if strings.HasPrefix(req.URL.Path, "/api/") && req.Method != http.MethodGet && req.Method != http.MethodHead && req.Method != http.MethodOptions {
		maxBody := int64(10 * 1024 * 1024) // 10MB default for JSON API bodies
		if strings.Contains(req.URL.Path, "/contents/upload") || strings.Contains(req.URL.Path, "/releases/") {
			maxBody = 64 * 1024 * 1024 // 64MB for file uploads
		}
		req.Body = http.MaxBytesReader(w, req.Body, maxBody)
	}

	r.mux.ServeHTTP(w, req)
}

func (r *Router) registerRoutes() {
	// Health and Readiness
	r.mux.HandleFunc("GET /api/health", r.handleHealth)
	r.mux.HandleFunc("GET /api/ready", r.handleReady)
	r.mux.HandleFunc("GET /api/v1/server/cert", r.handleDownloadCert)

	// OIDC / OAuth2 SSO Endpoints
	r.mux.HandleFunc("GET /api/v1/auth/providers", r.handleAuthProviders)
	r.mux.HandleFunc("GET /api/v1/auth/oidc/login", r.handleOIDCLogin)
	r.mux.HandleFunc("GET /api/v1/auth/oidc/callback", r.handleOIDCCallback)

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

	// User Follow / Unfollow
	r.mux.HandleFunc("GET /api/v1/user/following/{username}", r.handleCheckFollowing)
	r.mux.HandleFunc("POST /api/v1/user/following/{username}", r.handleFollowUser)
	r.mux.HandleFunc("PUT /api/v1/user/following/{username}", r.handleFollowUser)
	r.mux.HandleFunc("DELETE /api/v1/user/following/{username}", r.handleUnfollowUser)
	r.mux.HandleFunc("GET /api/v1/users/{username}/followers", r.handleListFollowers)
	r.mux.HandleFunc("GET /api/v1/users/{username}/following", r.handleListFollowing)

	// Repositories
	r.mux.HandleFunc("GET /api/v1/repos", r.handleListRepos)
	r.mux.HandleFunc("GET /api/v1/repos/search", r.handleSearchRepos)
	r.mux.HandleFunc("POST /api/v1/repos", r.handleCreateRepo)
	r.mux.HandleFunc("POST /api/v1/repos/import", r.handleImportRepo)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}", r.handleGetRepo)
	r.mux.HandleFunc("DELETE /api/v1/repos/{owner}/{repo}", r.handleDeleteRepo)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/star", r.handleToggleStar)

	// Git Code & Tree
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/branches", r.handleListBranches)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/branches", r.handleCreateBranch)
	r.mux.HandleFunc("DELETE /api/v1/repos/{owner}/{repo}/branches/{branch...}", r.handleDeleteBranch)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/tags", r.handleListTags)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/commits", r.handleListCommits)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/commits/{sha}", r.handleGetCommitDiff)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/tree", r.handleGetTree)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/blob", r.handleGetBlob)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/raw", r.handleGetRaw)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/blame", r.handleGetBlame)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/recent-pushes", r.handleGetRecentPushes)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/code-search", r.handleSearchRepoCode)

	// Branch Protections (P3)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/branch-protections", r.handleListBranchProtections)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/branch-protections", r.handleSetBranchProtection)
	r.mux.HandleFunc("DELETE /api/v1/repos/{owner}/{repo}/branch-protections/{branch...}", r.handleDeleteBranchProtection)

	// Releases & Assets (P3)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/releases", r.handleListReleases)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/releases", r.handleCreateRelease)
	r.mux.HandleFunc("DELETE /api/v1/repos/{owner}/{repo}/releases/{id}", r.handleDeleteRelease)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/releases/{id}/assets", r.handleUploadReleaseAsset)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/releases/{id}/assets/{asset_id}/download", r.handleDownloadReleaseAsset)

	// Online File Operations (Create, Edit, Delete, Upload)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/contents/{path...}", r.handleSaveFile)
	r.mux.HandleFunc("DELETE /api/v1/repos/{owner}/{repo}/contents/{path...}", r.handleDeleteFile)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/upload", r.handleUploadFiles)

	// Issues
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/issues", r.handleListIssues)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/assignees", r.handleListAssignees)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/issues", r.handleCreateIssue)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/issues/{index}", r.handleGetIssue)
	r.mux.HandleFunc("PATCH /api/v1/repos/{owner}/{repo}/issues/{index}", r.handleUpdateIssue)
	r.mux.HandleFunc("PUT /api/v1/repos/{owner}/{repo}/issues/{index}/assignee", r.handleAssignIssue)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/issues/{index}/comments", r.handleListComments)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/issues/{index}/comments", r.handleAddComment)

	// Pull Requests
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/pulls", r.handleListPulls)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/pulls", r.handleCreatePull)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/pulls/{index}", r.handleGetPull)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/pulls/{index}/diff", r.handleGetPullDiff)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/pulls/{index}/merge", r.handleMergePull)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/pulls/{index}/reviews", r.handleListPullReviews)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/pulls/{index}/reviews", r.handleCreatePullReview)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/pulls/{index}/reviews/comments", r.handleListPullReviewComments)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/pulls/{index}/reviews/comments", r.handleCreatePullReviewComment)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/compare", r.handleCompareBranches)

	// Repository Forks
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/forks", r.handleListForks)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/forks", r.handleForkRepo)

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

	// Webhooks Endpoints
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/hooks", r.handleListWebhooks)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/hooks", r.handleCreateWebhook)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/hooks/{id}", r.handleGetWebhook)
	r.mux.HandleFunc("PATCH /api/v1/repos/{owner}/{repo}/hooks/{id}", r.handleUpdateWebhook)
	r.mux.HandleFunc("DELETE /api/v1/repos/{owner}/{repo}/hooks/{id}", r.handleDeleteWebhook)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/hooks/{id}/test", r.handleTestWebhook)
	r.mux.HandleFunc("GET /api/v1/repos/{owner}/{repo}/hooks/{id}/deliveries", r.handleListWebhookDeliveries)

	// Danger Zone Actions
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/visibility", r.handleChangeRepoVisibility)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/archive", r.handleToggleRepoArchive)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/transfer", r.handleTransferRepo)

	// Organizations Endpoints
	r.mux.HandleFunc("POST /api/v1/orgs", r.handleCreateOrg)
	r.mux.HandleFunc("GET /api/v1/orgs", r.handleListOrgs)
	r.mux.HandleFunc("GET /api/v1/user/orgs", r.handleListUserOrgs)
	r.mux.HandleFunc("GET /api/v1/orgs/{org}", r.handleGetOrg)
	r.mux.HandleFunc("PATCH /api/v1/orgs/{org}", r.handleUpdateOrg)
	r.mux.HandleFunc("PUT /api/v1/orgs/{org}", r.handleUpdateOrg)
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
	r.mux.HandleFunc("PUT /api/v1/repos/{owner}/{repo}/projects/{id}/columns/{column_id}", r.handleUpdateProjectColumn)
	r.mux.HandleFunc("DELETE /api/v1/repos/{owner}/{repo}/projects/{id}/columns/{column_id}", r.handleDeleteProjectColumn)
	r.mux.HandleFunc("POST /api/v1/repos/{owner}/{repo}/projects/{id}/cards", r.handleCreateProjectCard)
	r.mux.HandleFunc("PUT /api/v1/repos/{owner}/{repo}/projects/{id}/cards/{card_id}", r.handleMoveProjectCard)
	r.mux.HandleFunc("DELETE /api/v1/repos/{owner}/{repo}/projects/{id}/cards/{card_id}", r.handleDeleteProjectCard)

	// Direct Messaging Endpoints (Developer Communication)
	r.mux.HandleFunc("POST /api/v1/messages", r.handleSendMessage)
	r.mux.HandleFunc("GET /api/v1/messages/inbox", r.handleListInboxMessages)
	r.mux.HandleFunc("GET /api/v1/messages/sent", r.handleListSentMessages)
	r.mux.HandleFunc("GET /api/v1/messages/unread-count", r.handleGetUnreadMessageCount)
	r.mux.HandleFunc("GET /api/v1/messages/{id}", r.handleGetMessage)
	r.mux.HandleFunc("PATCH /api/v1/messages/{id}/read", r.handleMarkMessageRead)
	r.mux.HandleFunc("POST /api/v1/messages/{id}/accept", r.handleAcceptMessage)
	r.mux.HandleFunc("POST /api/v1/messages/{id}/reject", r.handleRejectMessage)
	r.mux.HandleFunc("DELETE /api/v1/messages/{id}", r.handleDeleteMessage)
	r.mux.HandleFunc("GET /api/v1/developers", r.handleListDevelopers)
	r.mux.HandleFunc("GET /api/v1/features", r.handleGetFeatures)

	// Static Pages Web Hosting
	r.mux.HandleFunc("GET /pages/{owner}/{repo}", r.handleServePagesRedirect)
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
	r.mux.HandleFunc("PUT /api/v1/admin/config", r.handleAdminUpdateConfig)
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
		"version":      Version,
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
	clientIP := getClientIP(req)
	if !r.authLimiter.allow(clientIP) {
		jsonError(w, http.StatusTooManyRequests, "Too many authentication attempts. Please try again later.")
		return
	}

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
	clientIP := getClientIP(req)
	if !r.authLimiter.allow(clientIP) {
		jsonError(w, http.StatusTooManyRequests, "Too many authentication attempts. Please try again later.")
		return
	}

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

func (r *Router) handleAuthProviders(w http.ResponseWriter, req *http.Request) {
	enabled, provider, displayName := auth.GetOIDCInfo()
	jsonResponse(w, http.StatusOK, map[string]any{
		"local": true,
		"oidc": map[string]any{
			"enabled":      enabled,
			"provider":     provider,
			"display_name": displayName,
		},
	})
}

func (r *Router) handleOIDCLogin(w http.ResponseWriter, req *http.Request) {
	if !auth.IsOIDCEnabled() {
		http.Redirect(w, req, "/login?error=oidc_disabled", http.StatusTemporaryRedirect)
		return
	}

	state := auth.GenerateState()
	http.SetCookie(w, &http.Cookie{
		Name:     "progit_oidc_state",
		Value:    state,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.cfg.Security.CookieSecure,
		MaxAge:   600, // 10 minutes
	})

	rootURL := strings.TrimRight(r.cfg.Server.RootURL, "/")
	redirectURI := fmt.Sprintf("%s/api/v1/auth/oidc/callback", rootURL)

	authURL, err := auth.BuildAuthURL(redirectURI, state)
	if err != nil {
		http.Redirect(w, req, "/login?error=oidc_config_error", http.StatusTemporaryRedirect)
		return
	}

	http.Redirect(w, req, authURL, http.StatusTemporaryRedirect)
}

func (r *Router) handleOIDCCallback(w http.ResponseWriter, req *http.Request) {
	if !auth.IsOIDCEnabled() {
		http.Redirect(w, req, "/login?error=oidc_disabled", http.StatusTemporaryRedirect)
		return
	}

	cookie, err := req.Cookie("progit_oidc_state")
	stateParam := req.URL.Query().Get("state")
	if err != nil || cookie.Value == "" || cookie.Value != stateParam {
		http.Redirect(w, req, "/login?error=invalid_state", http.StatusTemporaryRedirect)
		return
	}

	// Invalidate state cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "progit_oidc_state",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})

	code := req.URL.Query().Get("code")
	if code == "" {
		http.Redirect(w, req, "/login?error=missing_code", http.StatusTemporaryRedirect)
		return
	}

	rootURL := strings.TrimRight(r.cfg.Server.RootURL, "/")
	redirectURI := fmt.Sprintf("%s/api/v1/auth/oidc/callback", rootURL)

	userInfo, err := auth.ExchangeCode(req.Context(), code, redirectURI)
	if err != nil {
		log.Printf("[OIDC] Token exchange error: %v", err)
		if strings.Contains(err.Error(), "not authorized") {
			http.Redirect(w, req, "/login?error=domain_not_allowed", http.StatusTemporaryRedirect)
		} else {
			http.Redirect(w, req, "/login?error=exchange_failed", http.StatusTemporaryRedirect)
		}
		return
	}

	user, err := database.GetUserByEmail(userInfo.Email)
	if err != nil || user == nil {
		if !r.cfg.OIDC.AutoProvision {
			http.Redirect(w, req, "/login?error=user_not_provisioned", http.StatusTemporaryRedirect)
			return
		}

		// Derive username
		baseUsername := userInfo.PreferredUsername
		if baseUsername == "" {
			parts := strings.Split(userInfo.Email, "@")
			baseUsername = parts[0]
		}
		baseUsername = strings.ToLower(baseUsername)

		var cleanBuilder strings.Builder
		for _, c := range baseUsername {
			if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '_' {
				cleanBuilder.WriteRune(c)
			}
		}
		username := cleanBuilder.String()
		if username == "" {
			username = "user"
		}

		origUsername := username
		counter := 1
		for {
			existing, _ := database.GetUserByUsername(username)
			if existing == nil {
				break
			}
			counter++
			username = fmt.Sprintf("%s%d", origUsername, counter)
		}

		name := userInfo.Name
		if name == "" {
			name = username
		}

		placeholderHash, _ := auth.HashPassword(username + "-oidc-sso-pwd")
		user, err = database.CreateUser(username, userInfo.Email, placeholderHash, name, false)
		if err != nil {
			log.Printf("[OIDC] Failed to provision user %s: %v", userInfo.Email, err)
			http.Redirect(w, req, "/login?error=provision_failed", http.StatusTemporaryRedirect)
			return
		}
		log.Printf("[OIDC] Provisioned new user '%s' (%s) via OpenID Connect", user.Username, user.Email)
	}

	if !user.IsActive {
		http.Redirect(w, req, "/login?error=account_suspended", http.StatusTemporaryRedirect)
		return
	}

	sess, err := auth.CreateSession(user.ID, user.Username)
	if err != nil {
		http.Redirect(w, req, "/login?error=session_failed", http.StatusTemporaryRedirect)
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

	log.Printf("[OIDC] User '%s' logged in via OpenID Connect", user.Username)
	http.Redirect(w, req, "/dashboard", http.StatusTemporaryRedirect)
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
	activities, _ := database.ListActivities(100)
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

	rootURL := strings.TrimRight(r.cfg.Server.RootURL, "/") + "/"
	sshDomain := r.cfg.Server.Domain
	if sshDomain == "" {
		sshDomain = "localhost"
	}
	sshPort := r.cfg.SSH.Port
	if sshPort <= 0 {
		sshPort = 2222
	}

	jsonResponse(w, http.StatusOK, map[string]any{
		"user":          user,
		"repositories":  repos,
		"activities":    activities,
		"organizations": orgs,
		"starred":       starred,
		"root_url":      rootURL,
		"domain":        sshDomain,
		"ssh_port":      sshPort,
		"ssh_enabled":   r.cfg.SSH.Enabled,
	})
}

func (r *Router) handleExplore(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	q := strings.TrimSpace(req.URL.Query().Get("q"))
	if q == "" {
		q = strings.TrimSpace(req.URL.Query().Get("query"))
	}

	page, _ := strconv.Atoi(req.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}

	limit, _ := strconv.Atoi(req.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 12
	}
	if limit > 100 {
		limit = 100
	}
	offset := (page - 1) * limit

	var userID int64
	isAdmin := false
	if user != nil {
		userID = user.ID
		isAdmin = user.IsAdmin
	}

	repos, err := database.SearchRepositories(q, userID, isAdmin, limit, offset)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if repos == nil {
		repos = []*database.Repository{}
	}

	total, err := database.CountSearchRepositories(q, userID, isAdmin)
	if err != nil {
		total = len(repos)
	}

	totalPages := 0
	if total > 0 {
		totalPages = (total + limit - 1) / limit
	}

	jsonResponse(w, http.StatusOK, map[string]any{
		"repositories": repos,
		"data":         repos,
		"total":        total,
		"page":         page,
		"limit":        limit,
		"total_pages":  totalPages,
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

	isOrg := false
	var orgData *database.Organization
	if org, err := database.GetOrgByName(username); err == nil && org != nil {
		isOrg = true
		orgData = org
	}

	followersCount, _ := database.CountFollowers(targetUser.ID)
	followingCount, _ := database.CountFollowing(targetUser.ID)
	isFollowing := false
	if currentUser != nil {
		isFollowing = database.IsFollowing(currentUser.ID, targetUser.ID)
	}
	targetUser.NumFollowers = followersCount
	targetUser.NumFollowing = followingCount
	targetUser.IsFollowing = isFollowing

	jsonResponse(w, http.StatusOK, map[string]any{
		"user":            targetUser,
		"repositories":    repos,
		"activities":      activities,
		"organizations":   orgs,
		"starred":         starred,
		"is_org":          isOrg,
		"organization":    orgData,
		"followers_count": followersCount,
		"following_count": followingCount,
		"is_following":    isFollowing,
	})
}

// User Follow / Social Graph Handlers

func (r *Router) handleCheckFollowing(w http.ResponseWriter, req *http.Request) {
	currentUser := auth.AuthenticateRequest(req)
	if currentUser == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	targetUsername := req.PathValue("username")
	targetUser, err := database.GetUserByUsername(targetUsername)
	if err != nil || targetUser == nil {
		jsonError(w, http.StatusNotFound, "User not found")
		return
	}
	following := database.IsFollowing(currentUser.ID, targetUser.ID)
	jsonResponse(w, http.StatusOK, map[string]any{
		"following": following,
	})
}

func (r *Router) handleFollowUser(w http.ResponseWriter, req *http.Request) {
	currentUser := auth.AuthenticateRequest(req)
	if currentUser == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	targetUsername := req.PathValue("username")
	targetUser, err := database.GetUserByUsername(targetUsername)
	if err != nil || targetUser == nil {
		jsonError(w, http.StatusNotFound, "User not found")
		return
	}
	if targetUser.ID == currentUser.ID {
		jsonError(w, http.StatusBadRequest, "You cannot follow yourself")
		return
	}
	if err := database.FollowUser(currentUser.ID, targetUser.ID); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	database.CreateActivity(currentUser.ID, currentUser.Username, nil, "", "follow_user", fmt.Sprintf("Started following @%s", targetUser.Username))
	followersCount, _ := database.CountFollowers(targetUser.ID)
	jsonResponse(w, http.StatusOK, map[string]any{
		"message":         fmt.Sprintf("Now following @%s", targetUser.Username),
		"following":       true,
		"followers_count": followersCount,
	})
}

func (r *Router) handleUnfollowUser(w http.ResponseWriter, req *http.Request) {
	currentUser := auth.AuthenticateRequest(req)
	if currentUser == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	targetUsername := req.PathValue("username")
	targetUser, err := database.GetUserByUsername(targetUsername)
	if err != nil || targetUser == nil {
		jsonError(w, http.StatusNotFound, "User not found")
		return
	}
	if err := database.UnfollowUser(currentUser.ID, targetUser.ID); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	followersCount, _ := database.CountFollowers(targetUser.ID)
	jsonResponse(w, http.StatusOK, map[string]any{
		"message":         fmt.Sprintf("Unfollowed @%s", targetUser.Username),
		"following":       false,
		"followers_count": followersCount,
	})
}

func (r *Router) handleListFollowers(w http.ResponseWriter, req *http.Request) {
	targetUsername := req.PathValue("username")
	targetUser, err := database.GetUserByUsername(targetUsername)
	if err != nil || targetUser == nil {
		jsonError(w, http.StatusNotFound, "User not found")
		return
	}
	followers, err := database.ListFollowers(targetUser.ID, 100, 0)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if followers == nil {
		followers = []*database.User{}
	}
	jsonResponse(w, http.StatusOK, followers)
}

func (r *Router) handleListFollowing(w http.ResponseWriter, req *http.Request) {
	targetUsername := req.PathValue("username")
	targetUser, err := database.GetUserByUsername(targetUsername)
	if err != nil || targetUser == nil {
		jsonError(w, http.StatusNotFound, "User not found")
		return
	}
	following, err := database.ListFollowing(targetUser.ID, 100, 0)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if following == nil {
		following = []*database.User{}
	}
	jsonResponse(w, http.StatusOK, following)
}

// Repository Handlers

func (r *Router) handleSearchRepos(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	q := strings.TrimSpace(req.URL.Query().Get("q"))
	if q == "" {
		q = strings.TrimSpace(req.URL.Query().Get("query"))
	}
	limitStr := req.URL.Query().Get("limit")
	limit := 50
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	var userID int64
	isAdmin := false
	if user != nil {
		userID = user.ID
		isAdmin = user.IsAdmin
	}

	repos, err := database.SearchRepositories(q, userID, isAdmin, limit, 0)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if repos == nil {
		repos = []*database.Repository{}
	}

	jsonResponse(w, http.StatusOK, map[string]any{
		"ok":           true,
		"repositories": repos,
		"data":         repos,
		"total":        len(repos),
	})
}

func (r *Router) handleListRepos(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	ownerFilter := strings.TrimSpace(req.URL.Query().Get("owner"))
	q := strings.TrimSpace(req.URL.Query().Get("q"))
	if q == "" {
		q = strings.TrimSpace(req.URL.Query().Get("query"))
	}

	if q != "" {
		var userID int64
		isAdmin := false
		if user != nil {
			userID = user.ID
			isAdmin = user.IsAdmin
		}
		repos, err := database.SearchRepositories(q, userID, isAdmin, 50, 0)
		if err != nil {
			jsonError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if repos == nil {
			repos = []*database.Repository{}
		}
		jsonResponse(w, http.StatusOK, repos)
		return
	}

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

	// Enforce repository creation limits for non-admin users
	if !user.IsAdmin {
		if targetOwnerID == user.ID {
			effectiveLimit := r.cfg.Repository.MaxCreationLimit
			if user.MaxRepoCreation >= 0 {
				effectiveLimit = user.MaxRepoCreation
			}
			if effectiveLimit >= 0 {
				count, err := database.CountUserRepositories(user.ID)
				if err == nil && count >= effectiveLimit {
					jsonError(w, http.StatusForbidden, fmt.Sprintf("You have reached your repository creation limit of %d. Contact your administrator to increase your limit.", effectiveLimit))
					return
				}
			}
		} else {
			effectiveLimit := r.cfg.Repository.MaxCreationLimit
			if orgUser, err := database.GetUserByID(targetOwnerID); err == nil && orgUser != nil && orgUser.MaxRepoCreation >= 0 {
				effectiveLimit = orgUser.MaxRepoCreation
			}
			if effectiveLimit >= 0 {
				count, err := database.CountUserRepositories(targetOwnerID)
				if err == nil && count >= effectiveLimit {
					jsonError(w, http.StatusForbidden, fmt.Sprintf("Organization '%s' has reached its repository creation limit of %d", targetOwnerName, effectiveLimit))
					return
				}
			}
		}
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

func (r *Router) handleImportRepo(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var body struct {
		CloneURL     string `json:"clone_url"`
		Owner        string `json:"owner"`
		Name         string `json:"name"`
		Description  string `json:"description"`
		Private      bool   `json:"private"`
		AuthUsername string `json:"auth_username"`
		AuthPassword string `json:"auth_password"`
	}

	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	body.CloneURL = strings.TrimSpace(body.CloneURL)
	if body.CloneURL == "" {
		jsonError(w, http.StatusBadRequest, "Clone URL is required")
		return
	}
	if strings.HasPrefix(body.CloneURL, "-") {
		jsonError(w, http.StatusBadRequest, "Invalid clone URL")
		return
	}
	// Disallow local file paths for non-admin users to prevent local repo theft
	if !strings.HasPrefix(body.CloneURL, "http://") && !strings.HasPrefix(body.CloneURL, "https://") {
		if !user.IsAdmin && !git.AllowLocalRepoImport {
			jsonError(w, http.StatusBadRequest, "Only HTTP and HTTPS clone URLs are supported")
			return
		}
	}

	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" {
		trimmed := strings.TrimRight(body.CloneURL, "/")
		parts := strings.Split(trimmed, "/")
		if len(parts) > 0 {
			rawName := parts[len(parts)-1]
			rawName = strings.TrimSuffix(rawName, ".git")
			body.Name = rawName
		}
	}

	if len(body.Name) < 1 {
		jsonError(w, http.StatusBadRequest, "Repository name is required")
		return
	}

	validName := regexp.MustCompile(`^[a-zA-Z0-9_\.\-]+$`)
	if !validName.MatchString(body.Name) || body.Name == "." || body.Name == ".." {
		jsonError(w, http.StatusBadRequest, "Invalid repository name")
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

	// Enforce repository creation limits for non-admin users
	if !user.IsAdmin {
		if targetOwnerID == user.ID {
			effectiveLimit := r.cfg.Repository.MaxCreationLimit
			if user.MaxRepoCreation >= 0 {
				effectiveLimit = user.MaxRepoCreation
			}
			if effectiveLimit >= 0 {
				count, err := database.CountUserRepositories(user.ID)
				if err == nil && count >= effectiveLimit {
					jsonError(w, http.StatusForbidden, fmt.Sprintf("You have reached your repository creation limit of %d. Contact your administrator to increase your limit.", effectiveLimit))
					return
				}
			}
		} else {
			effectiveLimit := r.cfg.Repository.MaxCreationLimit
			if orgUser, err := database.GetUserByID(targetOwnerID); err == nil && orgUser != nil && orgUser.MaxRepoCreation >= 0 {
				effectiveLimit = orgUser.MaxRepoCreation
			}
			if effectiveLimit >= 0 {
				count, err := database.CountUserRepositories(targetOwnerID)
				if err == nil && count >= effectiveLimit {
					jsonError(w, http.StatusForbidden, fmt.Sprintf("Organization '%s' has reached its repository creation limit of %d", targetOwnerName, effectiveLimit))
					return
				}
			}
		}
	}

	if existing, _ := database.GetRepositoryByName(targetOwnerName, body.Name); existing != nil {
		jsonError(w, http.StatusConflict, "Repository already exists")
		return
	}

	repoDir := filepath.Join(r.cfg.Repository.Root, targetOwnerName, body.Name+".git")
	if _, err := os.Stat(repoDir); err == nil {
		jsonError(w, http.StatusConflict, "Repository directory already exists on disk")
		return
	}

	if err := git.ImportRepository(body.CloneURL, repoDir, body.AuthUsername, body.AuthPassword); err != nil {
		_ = os.RemoveAll(repoDir)
		jsonError(w, http.StatusBadRequest, fmt.Sprintf("Failed to clone remote repository: %v", err))
		return
	}

	defaultBranch := git.GetDefaultBranch(repoDir)
	if defaultBranch == "" {
		defaultBranch = "main"
	}

	repo, err := database.CreateRepository(targetOwnerID, body.Name, body.Description, body.Private)
	if err != nil {
		_ = os.RemoveAll(repoDir)
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if defaultBranch != "main" {
		_ = database.SetRepositoryDefaultBranch(repo.ID, defaultBranch)
		repo.DefaultBranch = defaultBranch
	}

	database.CreateActivity(user.ID, user.Username, &repo.ID, repo.Name, "create_repo", fmt.Sprintf("Imported repository %s/%s from %s", targetOwnerName, repo.Name, git.SanitizeURL(body.CloneURL)))

	jsonResponse(w, http.StatusCreated, repo)
}

func (r *Router) canAdminRepo(user *database.User, repo *database.Repository) bool {
	if user == nil || repo == nil {
		return false
	}
	if user.IsAdmin || user.ID == repo.OwnerID {
		return true
	}
	if org, _ := database.GetOrgByName(repo.OwnerName); org != nil {
		if database.IsOrgAdmin(org.ID, user.ID) {
			return true
		}
	}
	var mode string
	if err := database.DB.QueryRow(`SELECT mode FROM collaborators WHERE repo_id = ? AND user_id = ?`, repo.ID, user.ID).Scan(&mode); err == nil {
		if mode == "admin" {
			return true
		}
	}
	return false
}

// canDeleteRepo ensures only the repository owner, organization admin, or site administrator can permanently delete a repo.
func (r *Router) canDeleteRepo(user *database.User, repo *database.Repository) bool {
	if user == nil || repo == nil {
		return false
	}
	if user.IsAdmin || user.ID == repo.OwnerID {
		return true
	}
	if org, _ := database.GetOrgByName(repo.OwnerName); org != nil {
		if database.IsOrgAdmin(org.ID, user.ID) {
			return true
		}
	}
	return false
}

// getRepoWithAccess safely retrieves a repository and validates user access permissions.
// Returns 404 if the repo does not exist or if private and unauthorized (preventing enumeration).
func (r *Router) getRepoWithAccess(w http.ResponseWriter, req *http.Request, owner, repoName string, write bool) (*database.Repository, *database.User, bool) {
	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return nil, nil, false
	}
	user := auth.AuthenticateRequest(req)
	if !database.CanUserAccessRepo(user, repo, write) {
		if repo.IsPrivate || write {
			if user == nil && write {
				jsonError(w, http.StatusUnauthorized, "Unauthorized")
			} else {
				jsonError(w, http.StatusNotFound, "Repository not found")
			}
			return nil, nil, false
		}
	}
	return repo, user, true
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
	canAdmin := r.canAdminRepo(user, repo)

	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")
	branches, _ := git.GetBranches(repoDir)
	tags, _ := git.GetTags(repoDir)

	rootURL := strings.TrimRight(r.cfg.Server.RootURL, "/") + "/"
	httpCloneURL := fmt.Sprintf("%s%s/%s.git", rootURL, owner, repoName)
	var sshCloneURL string
	if r.cfg.SSH.Port == 22 {
		sshCloneURL = fmt.Sprintf("git@%s:%s/%s.git", r.cfg.Server.Domain, owner, repoName)
	} else {
		sshCloneURL = fmt.Sprintf("ssh://git@%s:%d/%s/%s.git", r.cfg.Server.Domain, r.cfg.SSH.Port, owner, repoName)
	}
	var wikiCloneURLHTTP string
	var wikiCloneURLSSH string
	if repo.EnableWiki {
		wikiCloneURLHTTP = fmt.Sprintf("%s%s/%s.wiki.git", rootURL, owner, repoName)
		if r.cfg.SSH.Port == 22 {
			wikiCloneURLSSH = fmt.Sprintf("git@%s:%s/%s.wiki.git", r.cfg.Server.Domain, owner, repoName)
		} else {
			wikiCloneURLSSH = fmt.Sprintf("ssh://git@%s:%d/%s/%s.wiki.git", r.cfg.Server.Domain, r.cfg.SSH.Port, owner, repoName)
		}
	}
	pagesURL := fmt.Sprintf("%spages/%s/%s/", rootURL, owner, repoName)

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

	if !r.canDeleteRepo(user, repo) {
		jsonError(w, http.StatusForbidden, "Owner or site administrator privileges required to delete repository")
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
	repo, _, ok := r.getRepoWithAccess(w, req, owner, repoName, false)
	if !ok {
		return
	}
	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")

	if req.URL.Query().Get("detail") == "true" {
		defaultBranch := "main"
		if repo != nil && repo.DefaultBranch != "" {
			defaultBranch = repo.DefaultBranch
		}
		details, err := git.GetBranchDetails(repoDir, defaultBranch)
		if err != nil {
			jsonError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if details == nil {
			details = []git.BranchDetail{}
		}
		jsonResponse(w, http.StatusOK, details)
		return
	}

	branches, err := git.GetBranches(repoDir)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if branches == nil {
		branches = []string{}
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

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	if repo.IsArchived {
		jsonError(w, http.StatusBadRequest, "Repository is archived and read-only")
		return
	}

	if !database.CanUserAccessRepo(user, repo, true) {
		jsonError(w, http.StatusForbidden, "Write permission required")
		return
	}

	var body struct {
		BranchName string `json:"branch_name"`
		BaseRef    string `json:"base_ref"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	branchName := strings.TrimSpace(body.BranchName)
	if branchName == "" {
		jsonError(w, http.StatusBadRequest, "Branch name cannot be empty")
		return
	}

	// Validate branch name against git ref naming rules
	if strings.ContainsAny(branchName, " ~^:?*[\\]") || strings.Contains(branchName, "..") || strings.Contains(branchName, "@{") || strings.HasPrefix(branchName, "-") {
		jsonError(w, http.StatusBadRequest, "Invalid branch name format")
		return
	}

	baseRef := strings.TrimSpace(body.BaseRef)
	if baseRef == "" {
		baseRef = repo.DefaultBranch
		if baseRef == "" {
			baseRef = "main"
		}
	}
	if strings.ContainsAny(baseRef, " ~^:?*[\\]") || strings.Contains(baseRef, "..") || strings.Contains(baseRef, "@{") || strings.HasPrefix(baseRef, "-") {
		jsonError(w, http.StatusBadRequest, "Invalid base ref format")
		return
	}

	if err := git.CreateBranch(repoDir, branchName, baseRef); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	database.CreateActivity(user.ID, user.Username, &repo.ID, repo.Name, "branch", fmt.Sprintf("Created branch '%s'", branchName))

	jsonResponse(w, http.StatusCreated, map[string]string{
		"message": "Branch created successfully",
		"branch":  branchName,
	})
}

func (r *Router) handleDeleteBranch(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	branchName := strings.TrimSpace(req.PathValue("branch"))
	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	if repo.IsArchived {
		jsonError(w, http.StatusBadRequest, "Repository is archived and read-only")
		return
	}

	if !database.CanUserAccessRepo(user, repo, true) {
		jsonError(w, http.StatusForbidden, "Write permission required")
		return
	}

	if branchName == "" {
		jsonError(w, http.StatusBadRequest, "Branch name is required")
		return
	}

	if strings.ContainsAny(branchName, " ~^:?*[\\]") || strings.Contains(branchName, "..") || strings.Contains(branchName, "@{") || strings.HasPrefix(branchName, "-") {
		jsonError(w, http.StatusBadRequest, "Invalid branch name format")
		return
	}

	if branchName == repo.DefaultBranch || branchName == "main" || branchName == "master" {
		jsonError(w, http.StatusBadRequest, "Cannot delete the default branch")
		return
	}

	bp, _ := database.GetBranchProtection(repo.ID, branchName)
	if bp != nil {
		jsonError(w, http.StatusForbidden, fmt.Sprintf("Cannot delete protected branch '%s'", branchName))
		return
	}

	if err := git.DeleteBranch(repoDir, branchName); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	database.CreateActivity(user.ID, user.Username, &repo.ID, repo.Name, "branch", fmt.Sprintf("Deleted branch '%s'", branchName))

	jsonResponse(w, http.StatusOK, map[string]string{
		"message": "Branch deleted successfully",
		"branch":  branchName,
	})
}

func (r *Router) handleListTags(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	_, _, ok := r.getRepoWithAccess(w, req, owner, repoName, false)
	if !ok {
		return
	}
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
	_, _, ok := r.getRepoWithAccess(w, req, owner, repoName, false)
	if !ok {
		return
	}
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
	_, _, ok := r.getRepoWithAccess(w, req, owner, repoName, false)
	if !ok {
		return
	}
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
	_, _, ok := r.getRepoWithAccess(w, req, owner, repoName, false)
	if !ok {
		return
	}
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

	// Fetch latest commit and commit count for ref
	var latestCommit *git.Commit
	commits, err := git.GetCommits(repoDir, ref, 1, 0)
	if err == nil && len(commits) > 0 {
		latestCommit = &commits[0]
	}
	totalCommits := git.CountCommits(repoDir, ref)

	jsonResponse(w, http.StatusOK, map[string]any{
		"entries":       entries,
		"readme":        readmeContent,
		"latest_commit": latestCommit,
		"total_commits": totalCommits,
	})
}

func (r *Router) handleGetBlob(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	_, _, ok := r.getRepoWithAccess(w, req, owner, repoName, false)
	if !ok {
		return
	}
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
	_, _, ok := r.getRepoWithAccess(w, req, owner, repoName, false)
	if !ok {
		return
	}
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

	if repo.IsArchived {
		jsonError(w, http.StatusBadRequest, "Repository is archived and read-only")
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

	if body.NewBranch == "" {
		bp, _ := database.GetBranchProtection(repo.ID, body.Branch)
		if bp != nil && bp.RequirePR {
			jsonError(w, http.StatusForbidden, fmt.Sprintf("Branch '%s' is protected. Direct commits are restricted; please create a pull request.", body.Branch))
			return
		}
	}

	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")
	commitSHA, targetBranch, err := git.SaveFile(repoDir, body.Branch, filePath, body.Content, user.Username, user.Email, body.Message, body.NewBranch)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to save file: %v", err))
		return
	}

	database.CreateActivity(user.ID, user.Username, &repo.ID, repo.Name, "push", fmt.Sprintf("Committed file '%s' to branch '%s'", filePath, targetBranch))
	database.DispatchRepoWebhooks(repo.ID, "push", map[string]any{
		"repository": repo,
		"ref":        "refs/heads/" + targetBranch,
		"after":      commitSHA,
		"pusher": map[string]string{
			"name":  user.Username,
			"email": user.Email,
		},
		"sender": user,
	})

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

	if repo.IsArchived {
		jsonError(w, http.StatusBadRequest, "Repository is archived and read-only")
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

	if body.NewBranch == "" {
		bp, _ := database.GetBranchProtection(repo.ID, body.Branch)
		if bp != nil && bp.RequirePR {
			jsonError(w, http.StatusForbidden, fmt.Sprintf("Branch '%s' is protected. Direct commits are restricted; please create a pull request.", body.Branch))
			return
		}
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

	if repo.IsArchived {
		jsonError(w, http.StatusBadRequest, "Repository is archived and read-only")
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
	assignee := req.URL.Query().Get("assignee")

	repo, _, ok := r.getRepoWithAccess(w, req, owner, repoName, false)
	if !ok {
		return
	}

	issues, err := database.ListIssuesFiltered(repo.ID, false, state, assignee)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if issues == nil {
		issues = []*database.Issue{}
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

	if repo.IsArchived {
		jsonError(w, http.StatusBadRequest, "Repository is archived and read-only")
		return
	}

	var body struct {
		Title    string  `json:"title"`
		Content  string  `json:"content"`
		Assignee *string `json:"assignee"`
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

	var assigneeID *int64
	if body.Assignee != nil && strings.TrimSpace(*body.Assignee) != "" {
		targetUser, err := database.GetUserByUsername(strings.TrimSpace(*body.Assignee))
		if err != nil || targetUser == nil {
			jsonError(w, http.StatusBadRequest, "Assignee user not found")
			return
		}
		if !database.IsEligibleAssignee(repo, targetUser) {
			jsonError(w, http.StatusBadRequest, "Assignee must be a collaborator or owner of this repository")
			return
		}
		assigneeID = &targetUser.ID
	}

	issue, err := database.CreateIssue(repo.ID, user.ID, body.Title, body.Content, false, assigneeID)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if assigneeID != nil && issue.AssigneeName != "" {
		_, _ = database.AddComment(issue.ID, user.ID, "assign", fmt.Sprintf("assigned @%s", issue.AssigneeName))
	}

	database.CreateActivity(user.ID, user.Username, &repo.ID, repo.Name, "issue", fmt.Sprintf("Opened issue #%d in %s/%s", issue.IndexNumber, owner, repoName))
	database.DispatchRepoWebhooks(repo.ID, "issues", map[string]any{
		"action":     "opened",
		"issue":      issue,
		"repository": repo,
		"sender":     user,
	})

	jsonResponse(w, http.StatusCreated, issue)
}

func (r *Router) handleGetIssue(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	index, _ := strconv.ParseInt(req.PathValue("index"), 10, 64)

	repo, _, ok := r.getRepoWithAccess(w, req, owner, repoName, false)
	if !ok {
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
		Closed   *bool   `json:"closed"`
		Assignee *string `json:"assignee"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if body.Closed != nil {
		_ = database.UpdateIssueStatus(issue.ID, *body.Closed)
		actionType := "close"
		if !*body.Closed {
			actionType = "reopen"
		}
		_, _ = database.AddComment(issue.ID, user.ID, actionType, "")
	}

	if body.Assignee != nil {
		trimmed := strings.TrimSpace(*body.Assignee)
		if trimmed == "" {
			_ = database.UpdateIssueAssignee(issue.ID, nil)
			_, _ = database.AddComment(issue.ID, user.ID, "assign", "unassigned this issue")
		} else {
			targetUser, err := database.GetUserByUsername(trimmed)
			if err != nil || targetUser == nil {
				jsonError(w, http.StatusBadRequest, "Assignee user not found")
				return
			}
			if !database.IsEligibleAssignee(repo, targetUser) {
				jsonError(w, http.StatusBadRequest, "Assignee must be a collaborator or owner of this repository")
				return
			}
			_ = database.UpdateIssueAssignee(issue.ID, &targetUser.ID)
			_, _ = database.AddComment(issue.ID, user.ID, "assign", fmt.Sprintf("assigned @%s", targetUser.Username))
		}
	}

	updated, _ := database.GetIssueByID(issue.ID)
	jsonResponse(w, http.StatusOK, updated)
}

func (r *Router) handleAssignIssue(w http.ResponseWriter, req *http.Request) {
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
		Assignee string `json:"assignee"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	trimmed := strings.TrimSpace(body.Assignee)
	if trimmed == "" {
		_ = database.UpdateIssueAssignee(issue.ID, nil)
		_, _ = database.AddComment(issue.ID, user.ID, "assign", "unassigned this issue")
	} else {
		targetUser, err := database.GetUserByUsername(trimmed)
		if err != nil || targetUser == nil {
			jsonError(w, http.StatusBadRequest, "Assignee user not found")
			return
		}
		if !database.IsEligibleAssignee(repo, targetUser) {
			jsonError(w, http.StatusBadRequest, "Assignee must be a collaborator or owner of this repository")
			return
		}
		_ = database.UpdateIssueAssignee(issue.ID, &targetUser.ID)
		_, _ = database.AddComment(issue.ID, user.ID, "assign", fmt.Sprintf("assigned @%s", targetUser.Username))
	}

	updated, _ := database.GetIssueByID(issue.ID)
	jsonResponse(w, http.StatusOK, updated)
}

func (r *Router) handleListAssignees(w http.ResponseWriter, req *http.Request) {
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

	assignees, err := database.ListRepoAssignees(repo)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if assignees == nil {
		assignees = []*database.User{}
	}
	jsonResponse(w, http.StatusOK, assignees)
}

func (r *Router) handleListComments(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	index, _ := strconv.ParseInt(req.PathValue("index"), 10, 64)

	repo, _, ok := r.getRepoWithAccess(w, req, owner, repoName, false)
	if !ok {
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

	repo, _, ok := r.getRepoWithAccess(w, req, owner, repoName, false)
	if !ok {
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

	if repo.IsArchived {
		jsonError(w, http.StatusBadRequest, "Repository is archived and read-only")
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
	database.DispatchRepoWebhooks(repo.ID, "pull_request", map[string]any{
		"action":       "opened",
		"pull_request": pr,
		"repository":   repo,
		"sender":       user,
	})

	jsonResponse(w, http.StatusCreated, pr)
}

func (r *Router) handleGetPull(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	index, _ := strconv.ParseInt(req.PathValue("index"), 10, 64)

	repo, _, ok := r.getRepoWithAccess(w, req, owner, repoName, false)
	if !ok {
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

	repo, _, ok := r.getRepoWithAccess(w, req, owner, repoName, false)
	if !ok {
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
	_, _, ok := r.getRepoWithAccess(w, req, owner, repoName, false)
	if !ok {
		return
	}
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

	if repo.IsArchived {
		jsonError(w, http.StatusBadRequest, "Repository is archived and read-only")
		return
	}

	issue, err := database.GetIssueByIndex(repo.ID, index)
	if err != nil || issue == nil || !issue.IsPull {
		jsonError(w, http.StatusNotFound, "Pull request not found")
		return
	}

	// Permission: Only repository collaborators (write access) OR the pull request author (requester) can merge
	isRepoMember := database.CanUserAccessRepo(user, repo, true)
	isRequester := (issue.PosterID == user.ID)
	if !isRepoMember && !isRequester {
		jsonError(w, http.StatusForbidden, "Only repository collaborators or the pull request author can merge this pull request")
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

	// Auto-close issues referenced in PR title, body, and merge message (Fixes #X, Closes #X)
	closeRefRegex := regexp.MustCompile(`(?i)(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\s+#(\d+)`)
	fullText := fmt.Sprintf("%s\n%s\n%s", issue.Title, issue.Content, body.Message)
	for _, match := range closeRefRegex.FindAllStringSubmatch(fullText, -1) {
		if len(match) > 1 {
			targetIdx, _ := strconv.ParseInt(match[1], 10, 64)
			if targetIdx > 0 && targetIdx != issue.IndexNumber {
				if refIssue, err := database.GetIssueByIndex(repo.ID, targetIdx); err == nil && refIssue != nil && !refIssue.IsClosed && !refIssue.IsPull {
					_ = database.UpdateIssueStatus(refIssue.ID, true)
					commitPrefix := mergeCommitSHA
					if len(commitPrefix) > 7 {
						commitPrefix = commitPrefix[:7]
					}
					_, _ = database.AddComment(refIssue.ID, user.ID, "comment", fmt.Sprintf("Closed by pull request #%d (%s)", issue.IndexNumber, commitPrefix))
					database.CreateActivity(user.ID, user.Username, &repo.ID, repo.Name, "issue", fmt.Sprintf("Closed issue #%d via pull request #%d", refIssue.IndexNumber, issue.IndexNumber))
				}
			}
		}
	}
	database.CreateActivity(user.ID, user.Username, &repo.ID, repo.Name, "pull", fmt.Sprintf("Merged pull request #%d into %s", issue.IndexNumber, pr.BaseBranch))
	database.DispatchRepoWebhooks(repo.ID, "pull_request", map[string]any{
		"action":           "merged",
		"pull_request":     pr,
		"merge_commit_sha": mergeCommitSHA,
		"repository":       repo,
		"sender":           user,
	})

	jsonResponse(w, http.StatusOK, map[string]any{
		"message":          "Merged successfully",
		"merge_commit_sha": mergeCommitSHA,
	})
}

// Pull Request Reviews Handlers

func (r *Router) handleListPullReviews(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	indexStr := req.PathValue("index")
	index, _ := strconv.ParseInt(indexStr, 10, 64)

	repo, _, ok := r.getRepoWithAccess(w, req, owner, repoName, false)
	if !ok {
		return
	}

	issue, err := database.GetIssueByIndex(repo.ID, index)
	if err != nil || issue == nil {
		jsonError(w, http.StatusNotFound, "Pull request issue not found")
		return
	}

	pr, err := database.GetPullRequestByIssueID(issue.ID)
	if err != nil || pr == nil {
		jsonError(w, http.StatusNotFound, "Pull request not found")
		return
	}

	reviews, err := database.GetPullReviews(pr.ID)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if reviews == nil {
		reviews = []*database.PullReview{}
	}
	jsonResponse(w, http.StatusOK, reviews)
}

func (r *Router) handleCreatePullReview(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	indexStr := req.PathValue("index")
	index, _ := strconv.ParseInt(indexStr, 10, 64)

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

	issue, err := database.GetIssueByIndex(repo.ID, index)
	if err != nil || issue == nil {
		jsonError(w, http.StatusNotFound, "Pull request issue not found")
		return
	}

	pr, err := database.GetPullRequestByIssueID(issue.ID)
	if err != nil || pr == nil {
		jsonError(w, http.StatusNotFound, "Pull request not found")
		return
	}

	var body struct {
		State    string                        `json:"state"`
		Content  string                        `json:"content"`
		Comments []database.PullReviewComment `json:"comments"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	review, err := database.CreatePullReview(issue.ID, pr.ID, user.ID, body.State, body.Content, body.Comments)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusCreated, review)
}

func (r *Router) handleListPullReviewComments(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	indexStr := req.PathValue("index")
	index, _ := strconv.ParseInt(indexStr, 10, 64)

	repo, _, ok := r.getRepoWithAccess(w, req, owner, repoName, false)
	if !ok {
		return
	}

	issue, err := database.GetIssueByIndex(repo.ID, index)
	if err != nil || issue == nil {
		jsonError(w, http.StatusNotFound, "Pull request issue not found")
		return
	}

	comments, err := database.GetPullReviewComments(issue.ID)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if comments == nil {
		comments = []*database.PullReviewComment{}
	}
	jsonResponse(w, http.StatusOK, comments)
}

func (r *Router) handleCreatePullReviewComment(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	indexStr := req.PathValue("index")
	index, _ := strconv.ParseInt(indexStr, 10, 64)

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

	issue, err := database.GetIssueByIndex(repo.ID, index)
	if err != nil || issue == nil {
		jsonError(w, http.StatusNotFound, "Pull request issue not found")
		return
	}

	pr, err := database.GetPullRequestByIssueID(issue.ID)
	if err != nil || pr == nil {
		jsonError(w, http.StatusNotFound, "Pull request not found")
		return
	}

	var body struct {
		ReviewID   int64  `json:"review_id"`
		FilePath   string `json:"file_path"`
		LineNumber int    `json:"line_number"`
		DiffHunk   string `json:"diff_hunk"`
		Content    string `json:"content"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	comment, err := database.CreatePullReviewComment(issue.ID, pr.ID, body.ReviewID, user.ID, body.FilePath, body.LineNumber, body.DiffHunk, body.Content)
	if err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusCreated, comment)
}

// Repository Forks Handlers

func (r *Router) handleForkRepo(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	parentRepo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || parentRepo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	// Permission to access parent repository
	if !database.CanUserAccessRepo(user, parentRepo, false) {
		jsonError(w, http.StatusForbidden, "Cannot fork private repository without access")
		return
	}

	var body struct {
		Organization string `json:"organization"`
		Name         string `json:"name"`
	}
	_ = json.NewDecoder(req.Body).Decode(&body)

	destOwnerID := user.ID
	destOwnerName := user.Username

	// If forking into an organization
	if body.Organization != "" {
		org, err := database.GetOrgByName(body.Organization)
		if err != nil || org == nil {
			jsonError(w, http.StatusBadRequest, "Target organization not found")
			return
		}
		if !user.IsAdmin && !database.IsOrgAdmin(org.ID, user.ID) {
			jsonError(w, http.StatusForbidden, "You do not have permission to create repositories in this organization")
			return
		}
		orgUser, err := database.GetUserByUsername(org.Name)
		if err != nil || orgUser == nil {
			jsonError(w, http.StatusInternalServerError, "Organization account stub missing")
			return
		}
		destOwnerID = orgUser.ID
		destOwnerName = org.Name
	} else if parentRepo.OwnerID == user.ID {
		jsonError(w, http.StatusBadRequest, "You cannot fork your own repository to your personal account")
		return
	}

	forkRepoName := strings.TrimSpace(body.Name)
	if forkRepoName == "" {
		forkRepoName = parentRepo.Name
	}

	// Enforce repository creation limits for non-admin users
	if !user.IsAdmin {
		if destOwnerID == user.ID {
			effectiveLimit := r.cfg.Repository.MaxCreationLimit
			if user.MaxRepoCreation >= 0 {
				effectiveLimit = user.MaxRepoCreation
			}
			if effectiveLimit >= 0 {
				count, err := database.CountUserRepositories(user.ID)
				if err == nil && count >= effectiveLimit {
					jsonError(w, http.StatusForbidden, fmt.Sprintf("You have reached your repository creation limit of %d. Contact your administrator to increase your limit.", effectiveLimit))
					return
				}
			}
		} else {
			effectiveLimit := r.cfg.Repository.MaxCreationLimit
			if orgUser, err := database.GetUserByID(destOwnerID); err == nil && orgUser != nil && orgUser.MaxRepoCreation >= 0 {
				effectiveLimit = orgUser.MaxRepoCreation
			}
			if effectiveLimit >= 0 {
				count, err := database.CountUserRepositories(destOwnerID)
				if err == nil && count >= effectiveLimit {
					jsonError(w, http.StatusForbidden, fmt.Sprintf("Organization '%s' has reached its repository creation limit of %d", destOwnerName, effectiveLimit))
					return
				}
			}
		}
	}

	// 1. Create database record
	forkedRepo, err := database.ForkRepository(parentRepo, destOwnerID, forkRepoName)
	if err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	// 2. Clone bare repository on disk
	srcRepoDir := filepath.Join(r.cfg.Repository.Root, owner, parentRepo.Name+".git")
	destRepoDir := filepath.Join(r.cfg.Repository.Root, destOwnerName, forkedRepo.Name+".git")
	if err := git.ForkRepository(srcRepoDir, destRepoDir); err != nil {
		log.Printf("[ProGit] Warning: git clone --bare failed during fork: %v", err)
	}

	database.CreateActivity(user.ID, user.Username, &forkedRepo.ID, forkedRepo.Name, "fork", fmt.Sprintf("Forked %s/%s to %s/%s", owner, parentRepo.Name, destOwnerName, forkedRepo.Name))

	jsonResponse(w, http.StatusCreated, forkedRepo)
}

func (r *Router) handleListForks(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	forks, err := database.GetForks(repo.ID)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if forks == nil {
		forks = []*database.Repository{}
	}
	jsonResponse(w, http.StatusOK, forks)
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

	if !repo.EnableWiki {
		jsonError(w, http.StatusForbidden, "Wikis are disabled for this repository")
		return
	}

	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")
	wikiDir := git.GetWikiRepoPath(repoDir)

	if _, err := os.Stat(wikiDir); os.IsNotExist(err) {
		jsonResponse(w, http.StatusOK, []git.WikiPageMeta{})
		return
	}

	pages, err := git.ListWikiPages(wikiDir)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if pages == nil {
		pages = []git.WikiPageMeta{}
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

	if !repo.EnableWiki {
		jsonError(w, http.StatusForbidden, "Wikis are disabled for this repository")
		return
	}

	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")
	wikiDir := git.GetWikiRepoPath(repoDir)

	if _, err := os.Stat(wikiDir); os.IsNotExist(err) {
		jsonError(w, http.StatusNotFound, "Wiki page not found")
		return
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

	if !repo.EnableWiki {
		jsonError(w, http.StatusForbidden, "Wikis are disabled for this repository")
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

	if !repo.EnableWiki {
		jsonError(w, http.StatusForbidden, "Wikis are disabled for this repository")
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

	if !repo.EnableWiki {
		jsonError(w, http.StatusForbidden, "Wikis are disabled for this repository")
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
	if branches == nil {
		branches = []string{}
	}

	pagesBranch := repo.PagesBranch
	branchExists := false
	for _, b := range branches {
		if b == pagesBranch {
			branchExists = true
			break
		}
	}
	if !branchExists {
		if repo.DefaultBranch != "" {
			for _, b := range branches {
				if b == repo.DefaultBranch {
					pagesBranch = repo.DefaultBranch
					branchExists = true
					break
				}
			}
		}
		if !branchExists {
			for _, b := range branches {
				if b == "gh-pages" || b == "main" || b == "master" {
					pagesBranch = b
					branchExists = true
					break
				}
			}
		}
		if !branchExists && len(branches) > 0 {
			pagesBranch = branches[0]
			branchExists = true
		}
		if pagesBranch == "" {
			pagesBranch = "main"
		}
	}

	rootURL := strings.TrimRight(r.cfg.Server.RootURL, "/") + "/"
	pagesURL := fmt.Sprintf("%spages/%s/%s/", rootURL, owner, repoName)

	jsonResponse(w, http.StatusOK, map[string]any{
		"enable_pages": repo.EnablePages,
		"pages_branch": pagesBranch,
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

	if !r.canAdminRepo(user, repo) {
		jsonError(w, http.StatusForbidden, "Admin privileges required to update pages configuration")
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

	body.PagesBranch = strings.TrimSpace(body.PagesBranch)
	if body.PagesBranch == "" {
		body.PagesBranch = repo.DefaultBranch
		if body.PagesBranch == "" {
			body.PagesBranch = "main"
		}
	}
	body.PagesFolder = strings.TrimSpace(body.PagesFolder)
	if body.PagesFolder == "" {
		body.PagesFolder = "/"
	}

	if err := database.UpdateRepositorySettings(repo.ID, repo.Description, repo.IsPrivate, repo.EnableWiki, body.EnablePages, body.PagesBranch, body.PagesFolder); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	updatedRepo, _ := database.GetRepositoryByID(repo.ID)
	rootURL := strings.TrimRight(r.cfg.Server.RootURL, "/") + "/"
	pagesURL := fmt.Sprintf("%spages/%s/%s/", rootURL, owner, repoName)

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

	if !r.canAdminRepo(user, repo) {
		jsonError(w, http.StatusForbidden, "Admin privileges required to update repository settings")
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
		pBranch = strings.TrimSpace(*body.PagesBranch)
	}
	if pBranch == "" {
		pBranch = repo.DefaultBranch
		if pBranch == "" {
			pBranch = "main"
		}
	}
	pFolder := repo.PagesFolder
	if body.PagesFolder != nil {
		pFolder = strings.TrimSpace(*body.PagesFolder)
	}
	if pFolder == "" {
		pFolder = "/"
	}

	if err := database.UpdateRepositorySettings(repo.ID, desc, priv, wiki, pages, pBranch, pFolder); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	updatedRepo, _ := database.GetRepositoryByID(repo.ID)
	jsonResponse(w, http.StatusOK, updatedRepo)
}

func (r *Router) handleServePagesRedirect(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	target := fmt.Sprintf("/pages/%s/%s/", owner, repoName)
	if req.URL.RawQuery != "" {
		target += "?" + req.URL.RawQuery
	}
	http.Redirect(w, req, target, http.StatusMovedPermanently)
}

func (r *Router) handleServePages(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Security-Policy", "sandbox allow-scripts allow-forms allow-popups; default-src 'self' 'unsafe-inline' data: https:; object-src 'none';")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Frame-Options", "SAMEORIGIN")

	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	subPath := req.PathValue("path")

	repo, err := database.GetRepositoryByName(owner, repoName)
	if err != nil || repo == nil {
		http.NotFound(w, req)
		return
	}

	if !repo.EnablePages {
		renderPagesMessage(w, http.StatusNotFound, "ProGit Pages Disabled", fmt.Sprintf("ProGit Pages is currently disabled for repository <strong>%s/%s</strong>.<br><br>The repository administrator can enable it under <strong>Settings &rarr; ProGit Pages</strong>.", htmlEscape(owner), htmlEscape(repoName)), repo)
		return
	}

	if repo.IsPrivate {
		user := auth.AuthenticateRequest(req)
		if !database.CanUserAccessRepo(user, repo, false) {
			renderPagesMessage(w, http.StatusForbidden, "Authentication Required", fmt.Sprintf("Repository <strong>%s/%s</strong> is private. Please sign in to an account with access to view this site.", htmlEscape(owner), htmlEscape(repoName)), repo)
			return
		}
	}

	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")
	branches, _ := git.GetBranches(repoDir)

	// Determine branch to serve with smart fallback
	branch := repo.PagesBranch
	branchFound := false
	for _, b := range branches {
		if b == branch {
			branchFound = true
			break
		}
	}

	if !branchFound {
		candidates := []string{repo.DefaultBranch, "main", "gh-pages", "master"}
		for _, cand := range candidates {
			if cand == "" {
				continue
			}
			for _, b := range branches {
				if b == cand {
					branch = b
					branchFound = true
					break
				}
			}
			if branchFound {
				break
			}
		}
		if !branchFound && len(branches) > 0 {
			branch = branches[0]
			branchFound = true
		}
	}

	if !branchFound {
		renderPagesMessage(w, http.StatusOK, "Repository Is Empty", fmt.Sprintf("Repository <strong>%s/%s</strong> does not have any branches or commits yet.<br><br>Push commits to publish your site.", htmlEscape(owner), htmlEscape(repoName)), repo)
		return
	}

	folder := strings.Trim(repo.PagesFolder, "/")
	subPath = strings.TrimPrefix(subPath, "/")
	if strings.Contains(subPath, "..") || strings.Contains(folder, "..") {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	isIndexRequest := subPath == "" || strings.HasSuffix(subPath, "/")

	var content []byte
	var resolvedPath string

	if isIndexRequest {
		indexNames := []string{"index.html", "index.htm", "index.md", "README.md", "readme.md", "Readme.md"}
		var searchPaths []string

		for _, name := range indexNames {
			if folder != "" {
				searchPaths = append(searchPaths, filepath.Join(folder, subPath, name))
			}
			searchPaths = append(searchPaths, filepath.Join(subPath, name))
		}

		for _, p := range searchPaths {
			cleanP := filepath.Clean(p)
			if c, err := git.GetRaw(repoDir, branch, cleanP); err == nil && len(c) > 0 {
				content = c
				resolvedPath = cleanP
				break
			}
		}
	} else {
		var searchPaths []string
		if folder != "" {
			searchPaths = append(searchPaths, filepath.Join(folder, subPath))
		}
		searchPaths = append(searchPaths, subPath)

		for _, p := range searchPaths {
			cleanP := filepath.Clean(p)
			if c, err := git.GetRaw(repoDir, branch, cleanP); err == nil {
				content = c
				resolvedPath = cleanP
				break
			}
		}
	}

	if resolvedPath == "" {
		var custom404Paths []string
		if folder != "" {
			custom404Paths = append(custom404Paths, filepath.Join(folder, "404.html"))
		}
		custom404Paths = append(custom404Paths, "404.html")

		for _, p := range custom404Paths {
			cleanP := filepath.Clean(p)
			if c404, err := git.GetRaw(repoDir, branch, cleanP); err == nil && len(c404) > 0 {
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				w.WriteHeader(http.StatusNotFound)
				_, _ = w.Write(c404)
				return
			}
		}

		if isIndexRequest {
			renderPagesWelcome(w, repo, branch, folder)
			return
		}

		http.NotFound(w, req)
		return
	}

	servePagesContent(w, resolvedPath, content, repo)
}

func servePagesContent(w http.ResponseWriter, filePath string, content []byte, repo *database.Repository) {
	// Security isolation: sandbox pages into an opaque origin to prevent access to parent session/cookies
	w.Header().Set("Content-Security-Policy", "sandbox allow-scripts allow-forms allow-popups; default-src 'self' 'unsafe-inline' data: https:; object-src 'none';")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Frame-Options", "SAMEORIGIN")

	ext := strings.ToLower(filepath.Ext(filePath))
	switch ext {
	case ".html", ".htm":
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(content)
	case ".md":
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		htmlBody := renderMarkdownToHTML(string(content))
		title := filepath.Base(filePath)
		page := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>%s - %s/%s - ProGit Pages</title>
  <style>
    :root {
      --bg: #ffffff;
      --text: #24292f;
      --border: #d0d7de;
      --code-bg: #f6f8fa;
      --accent: #0969da;
      --blockquote: #57606a;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0d1117;
        --text: #c9d1d9;
        --border: #30363d;
        --code-bg: #161b22;
        --accent: #58a6ff;
        --blockquote: #8b949e;
      }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
      line-height: 1.6;
      max-width: 860px;
      margin: 40px auto;
      padding: 0 24px;
      color: var(--text);
      background-color: var(--bg);
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    h1, h2, h3, h4, h5, h6 { margin-top: 24px; margin-bottom: 16px; font-weight: 600; line-height: 1.25; }
    h1 { font-size: 2em; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
    h3 { font-size: 1.25em; }
    p, ul, ol, table, pre { margin-top: 0; margin-bottom: 16px; }
    ul, ol { padding-left: 2em; }
    li + li { margin-top: 0.25em; }
    code { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace; font-size: 85%%; background: var(--code-bg); padding: 0.2em 0.4em; border-radius: 6px; }
    pre { background: var(--code-bg); padding: 16px; border-radius: 8px; overflow: auto; border: 1px solid var(--border); }
    pre code { background: transparent; padding: 0; font-size: 90%%; }
    blockquote { padding: 0 1em; color: var(--blockquote); border-left: 0.25em solid var(--border); margin: 0 0 16px 0; }
    hr { height: 0.25em; padding: 0; margin: 24px 0; background-color: var(--border); border: 0; }
    header.site-header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 16px; margin-bottom: 24px; border-bottom: 1px solid var(--border); font-size: 14px; }
    header.site-header a { font-weight: 600; }
    footer.site-footer { margin-top: 60px; font-size: 12px; color: var(--blockquote); border-top: 1px solid var(--border); padding-top: 16px; display: flex; justify-content: space-between; align-items: center; }
  </style>
</head>
<body>
  <header class="site-header">
    <div><strong><a href="/%s/%s">%s / %s</a></strong> &bull; ProGit Pages</div>
    <div><a href="/%s/%s">View Code &rarr;</a></div>
  </header>
  <main class="markdown-body">
    %s
  </main>
  <footer class="site-footer">
    <span>Published with <strong>ProGit Pages</strong></span>
    <span>Source: <a href="/%s/%s">%s/%s</a></span>
  </footer>
</body>
</html>`, htmlEscape(title), htmlEscape(repo.OwnerName), htmlEscape(repo.Name), htmlEscape(repo.OwnerName), htmlEscape(repo.Name), htmlEscape(repo.OwnerName), htmlEscape(repo.Name), htmlEscape(repo.OwnerName), htmlEscape(repo.Name), htmlBody, htmlEscape(repo.OwnerName), htmlEscape(repo.Name), htmlEscape(repo.OwnerName), htmlEscape(repo.Name))
		_, _ = w.Write([]byte(page))
	case ".css":
		w.Header().Set("Content-Type", "text/css; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(content)
	case ".js", ".mjs":
		w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(content)
	case ".json":
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(content)
	case ".svg":
		w.Header().Set("Content-Type", "image/svg+xml")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline';")
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
	case ".webp":
		w.Header().Set("Content-Type", "image/webp")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(content)
	case ".ico":
		w.Header().Set("Content-Type", "image/x-icon")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(content)
	case ".woff":
		w.Header().Set("Content-Type", "font/woff")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(content)
	case ".woff2":
		w.Header().Set("Content-Type", "font/woff2")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(content)
	case ".ttf":
		w.Header().Set("Content-Type", "font/ttf")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(content)
	default:
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(content)
	}
}

func renderPagesWelcome(w http.ResponseWriter, repo *database.Repository, branch, folder string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)

	sourceDisplay := branch
	if folder != "" && folder != "/" {
		sourceDisplay += " (" + folder + ")"
	}

	html := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>%s/%s - ProGit Pages</title>
  <style>
    :root {
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #0f172a;
      --muted: #64748b;
      --border: #e2e8f0;
      --emerald: #10b981;
      --emerald-dark: #059669;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #090d16;
        --card-bg: #111827;
        --text: #f8fafc;
        --muted: #94a3b8;
        --border: #1f2937;
        --emerald: #10b981;
        --emerald-dark: #34d399;
      }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 24px;
      box-sizing: border-box;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      max-width: 580px;
      width: 100%%;
      padding: 36px 32px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
      text-align: center;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(16, 185, 129, 0.12);
      color: var(--emerald-dark);
      font-size: 13px;
      font-weight: 700;
      padding: 4px 12px;
      border-radius: 9999px;
      margin-bottom: 16px;
    }
    .badge svg { width: 14px; height: 14px; }
    h1 { font-size: 24px; font-weight: 800; margin: 0 0 10px; }
    p { font-size: 14px; color: var(--muted); line-height: 1.6; margin: 0 0 24px; }
    .source-box {
      background: rgba(100, 116, 139, 0.07);
      border: 1px dashed var(--border);
      border-radius: 10px;
      padding: 14px 18px;
      font-size: 13px;
      color: var(--muted);
      margin-bottom: 24px;
      text-align: left;
    }
    .source-box strong { color: var(--text); }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 600;
      padding: 10px 18px;
      border-radius: 8px;
      text-decoration: none;
      transition: all 0.15s ease;
    }
    .btn-primary { background: #10b981; color: #ffffff; }
    .btn-primary:hover { background: #059669; }
    .btn-secondary { background: transparent; border: 1px solid var(--border); color: var(--text); }
    .btn-secondary:hover { background: rgba(100, 116, 139, 0.1); }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">
      <svg fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>
      ProGit Pages Active
    </div>
    <h1>%s / %s</h1>
    <p>Your ProGit Pages site is active and ready, but no <code>index.html</code> or <code>README.md</code> was found in your publishing source.</p>
    <div class="source-box">
      <div>Source Branch: <strong>%s</strong></div>
      <div style="margin-top: 4px;">Target Folder: <strong>%s</strong></div>
    </div>
    <div class="actions">
      <a class="btn btn-primary" href="/%s/%s/new/%s">Create index.html</a>
      <a class="btn btn-secondary" href="/%s/%s">Browse Repository</a>
      <a class="btn btn-secondary" href="/%s/%s/pages">Pages Settings</a>
    </div>
  </div>
</body>
</html>`, htmlEscape(repo.OwnerName), htmlEscape(repo.Name), htmlEscape(repo.OwnerName), htmlEscape(repo.Name), htmlEscape(sourceDisplay), htmlEscape(folder), htmlEscape(repo.OwnerName), htmlEscape(repo.Name), htmlEscape(branch), htmlEscape(repo.OwnerName), htmlEscape(repo.Name), htmlEscape(repo.OwnerName), htmlEscape(repo.Name))
	_, _ = w.Write([]byte(html))
}

func renderPagesMessage(w http.ResponseWriter, status int, title, message string, repo *database.Repository) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)

	owner := "Repository"
	name := ""
	if repo != nil {
		owner = repo.OwnerName
		name = repo.Name
	}

	html := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>%s - ProGit Pages</title>
  <style>
    :root {
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #0f172a;
      --muted: #64748b;
      --border: #e2e8f0;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #090d16;
        --card-bg: #111827;
        --text: #f8fafc;
        --muted: #94a3b8;
        --border: #1f2937;
      }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 24px;
      box-sizing: border-box;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      max-width: 540px;
      width: 100%%;
      padding: 36px 32px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
      text-align: center;
    }
    h1 { font-size: 22px; font-weight: 800; margin: 0 0 12px; }
    p { font-size: 14px; color: var(--muted); line-height: 1.6; margin: 0 0 24px; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 600;
      padding: 10px 20px;
      border-radius: 8px;
      text-decoration: none;
      background: #10b981;
      color: #ffffff;
    }
    .btn:hover { background: #059669; }
  </style>
</head>
<body>
  <div class="card">
    <h1>%s</h1>
    <p>%s</p>
    <a class="btn" href="/%s/%s">Go to Repository</a>
  </div>
</body>
</html>`, htmlEscape(title), htmlEscape(title), message, htmlEscape(owner), htmlEscape(name))
	_, _ = w.Write([]byte(html))
}

var (
	mdCodeBlockRegex  = regexp.MustCompile("(?s)```([a-zA-Z0-9_-]*)\n(.*?)```")
	mdInlineCodeRegex = regexp.MustCompile("`([^`]+)`")
	mdLinkRegex       = regexp.MustCompile(`\[([^\]]+)\]\(([^)]+)\)`)
	mdBoldRegex       = regexp.MustCompile(`\*\*([^*]+)\*\*`)
	mdItalicRegex     = regexp.MustCompile(`\*([^*]+)\*`)
)

func renderMarkdownToHTML(md string) string {
	var codeBlocks []string
	md = mdCodeBlockRegex.ReplaceAllStringFunc(md, func(match string) string {
		sub := mdCodeBlockRegex.FindStringSubmatch(match)
		code := htmlEscape(sub[2])
		token := fmt.Sprintf("@@CODEBLOCK_%d@@", len(codeBlocks))
		codeBlocks = append(codeBlocks, fmt.Sprintf("<pre><code>%s</code></pre>", code))
		return token
	})

	lines := strings.Split(md, "\n")
	var out []string
	inList := false

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		if strings.HasPrefix(trimmed, "- ") || strings.HasPrefix(trimmed, "* ") {
			if !inList {
				out = append(out, "<ul>")
				inList = true
			}
			item := strings.TrimSpace(trimmed[2:])
			out = append(out, fmt.Sprintf("<li>%s</li>", formatInlineMarkdown(item)))
			continue
		} else if inList {
			out = append(out, "</ul>")
			inList = false
		}

		if trimmed == "" {
			continue
		}

		if strings.HasPrefix(trimmed, "# ") {
			out = append(out, fmt.Sprintf("<h1>%s</h1>", formatInlineMarkdown(strings.TrimSpace(trimmed[2:]))))
		} else if strings.HasPrefix(trimmed, "## ") {
			out = append(out, fmt.Sprintf("<h2>%s</h2>", formatInlineMarkdown(strings.TrimSpace(trimmed[3:]))))
		} else if strings.HasPrefix(trimmed, "### ") {
			out = append(out, fmt.Sprintf("<h3>%s</h3>", formatInlineMarkdown(strings.TrimSpace(trimmed[4:]))))
		} else if strings.HasPrefix(trimmed, "#### ") {
			out = append(out, fmt.Sprintf("<h4>%s</h4>", formatInlineMarkdown(strings.TrimSpace(trimmed[5:]))))
		} else if strings.HasPrefix(trimmed, "> ") {
			out = append(out, fmt.Sprintf("<blockquote><p>%s</p></blockquote>", formatInlineMarkdown(strings.TrimSpace(trimmed[2:]))))
		} else if strings.HasPrefix(trimmed, "---") || strings.HasPrefix(trimmed, "***") {
			out = append(out, "<hr>")
		} else if strings.HasPrefix(trimmed, "@@CODEBLOCK_") && strings.HasSuffix(trimmed, "@@") {
			out = append(out, trimmed)
		} else {
			out = append(out, fmt.Sprintf("<p>%s</p>", formatInlineMarkdown(trimmed)))
		}
	}

	if inList {
		out = append(out, "</ul>")
	}

	result := strings.Join(out, "\n")
	for idx, cb := range codeBlocks {
		token := fmt.Sprintf("@@CODEBLOCK_%d@@", idx)
		result = strings.Replace(result, token, cb, 1)
	}

	return result
}

func formatInlineMarkdown(s string) string {
	s = htmlEscape(s)
	s = mdInlineCodeRegex.ReplaceAllString(s, "<code>$1</code>")
	s = mdBoldRegex.ReplaceAllString(s, "<strong>$1</strong>")
	s = mdItalicRegex.ReplaceAllString(s, "<em>$1</em>")
	s = mdLinkRegex.ReplaceAllStringFunc(s, func(match string) string {
		parts := mdLinkRegex.FindStringSubmatch(match)
		if len(parts) < 3 {
			return match
		}
		text := parts[1]
		href := strings.TrimSpace(parts[2])
		lower := strings.ToLower(href)
		if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") || strings.HasPrefix(lower, "mailto:") || strings.HasPrefix(lower, "/") || strings.HasPrefix(lower, "#") {
			return fmt.Sprintf(`<a href="%s" target="_blank" rel="noopener noreferrer">%s</a>`, href, text)
		}
		if !strings.Contains(lower, ":") && !strings.HasPrefix(lower, "//") {
			return fmt.Sprintf(`<a href="%s">%s</a>`, href, text)
		}
		return text
	})
	return s
}

func htmlEscape(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, `"`, "&quot;")
	s = strings.ReplaceAll(s, "'", "&#39;")
	return s
}

// Installation Handlers

func (r *Router) handleInstallStatus(w http.ResponseWriter, req *http.Request) {
	userCount, _ := database.CountUsers()
	if r.cfg.Security.InstallLock || userCount > 0 {
		jsonError(w, http.StatusForbidden, "Installation wizard is permanently locked and disabled")
		return
	}

	jsonResponse(w, http.StatusOK, map[string]any{
		"install_locked":    false,
		"users_count":       0,
		"app_name":          r.cfg.Server.AppName,
		"domain":            r.cfg.Server.Domain,
		"http_port":         r.cfg.Server.HTTPPort,
		"https_port":        r.cfg.Server.HTTPSPort,
		"protocol":          r.cfg.Server.Protocol,
		"root_url":          r.cfg.Server.RootURL,
		"database_path":     r.cfg.Database.Path,
		"repositories_path": r.cfg.Repository.Root,
		"ssh_port":          r.cfg.SSH.Port,
	})
}

func (r *Router) handleInstall(w http.ResponseWriter, req *http.Request) {
	userCount, _ := database.CountUsers()
	if r.cfg.Security.InstallLock || userCount > 0 {
		jsonError(w, http.StatusForbidden, "Installation wizard is permanently locked and disabled")
		return
	}

	var body struct {
		AppName       string `json:"app_name"`
		Domain        string `json:"domain"`
		HTTPPort      int    `json:"http_port"`
		HTTPSPort     int    `json:"https_port"`
		Protocol      string `json:"protocol"`
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
	if body.HTTPSPort > 0 {
		r.cfg.Server.HTTPSPort = body.HTTPSPort
	}
	if body.Protocol != "" {
		r.cfg.Server.Protocol = strings.ToLower(body.Protocol)
		if r.cfg.Server.Protocol == "https" {
			r.cfg.Security.CookieSecure = true
		}
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
		"https_port":            r.cfg.Server.HTTPSPort,
		"protocol":              r.cfg.Server.Protocol,
		"is_https":              r.cfg.Server.Protocol == "https",
		"enable_acme":           r.cfg.Server.EnableACME,
		"generate_local_cert":   r.cfg.Server.GenerateLocalCert,
		"root_url":              r.cfg.Server.RootURL,
		"app_name":              r.cfg.Server.AppName,
		"go_version":            runtime.Version(),
		"num_goroutines":        runtime.NumGoroutine(),
		"memory_alloc_mb":       float64(mem.Alloc) / 1024 / 1024,
		"memory_sys_mb":         float64(mem.Sys) / 1024 / 1024,
		"active_sessions_count":           auth.CountActiveSessions(),
		"install_locked":                  r.cfg.Security.InstallLock,
		"default_repo_max_creation_limit": r.cfg.Repository.MaxCreationLimit,
		"default_org_max_creation_limit":  r.cfg.Organization.MaxCreationLimit,
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
		Username        string `json:"username"`
		Email           string `json:"email"`
		Password        string `json:"password"`
		FullName        string `json:"full_name"`
		IsAdmin         bool   `json:"is_admin"`
		MaxRepoCreation *int   `json:"max_repo_creation"`
		MaxOrgCreation  *int   `json:"max_org_creation"`
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

	if body.MaxRepoCreation != nil || body.MaxOrgCreation != nil {
		_ = database.UpdateUserLimits(newUser.ID, body.MaxRepoCreation, body.MaxOrgCreation)
		if refreshed, err := database.GetUserByID(newUser.ID); err == nil && refreshed != nil {
			newUser = refreshed
		}
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
		IsAdmin         *bool `json:"is_admin"`
		IsActive        *bool `json:"is_active"`
		MaxRepoCreation *int  `json:"max_repo_creation"`
		MaxOrgCreation  *int  `json:"max_org_creation"`
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
	if body.MaxRepoCreation != nil || body.MaxOrgCreation != nil {
		if err := database.UpdateUserLimits(targetID, body.MaxRepoCreation, body.MaxOrgCreation); err != nil {
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

func (r *Router) handleAdminUpdateConfig(w http.ResponseWriter, req *http.Request) {
	currentAdmin := auth.AuthenticateRequest(req)
	if currentAdmin == nil || !currentAdmin.IsAdmin {
		jsonError(w, http.StatusForbidden, "Administrator privileges required")
		return
	}

	var body struct {
		AppName                     string `json:"app_name"`
		Domain                      string `json:"domain"`
		RootURL                     string `json:"root_url"`
		SSHPort                     int    `json:"ssh_port"`
		HTTPPort                    int    `json:"http_port"`
		DefaultRepoMaxCreationLimit *int   `json:"default_repo_max_creation_limit"`
		DefaultOrgMaxCreationLimit  *int   `json:"default_org_max_creation_limit"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if body.AppName != "" {
		r.cfg.Server.AppName = strings.TrimSpace(body.AppName)
	}
	if body.Domain != "" {
		r.cfg.Server.Domain = strings.TrimSpace(body.Domain)
	}
	if body.RootURL != "" {
		rootURL := strings.TrimSpace(body.RootURL)
		if !strings.HasSuffix(rootURL, "/") {
			rootURL += "/"
		}
		r.cfg.Server.RootURL = rootURL
	}
	if body.SSHPort > 0 {
		r.cfg.SSH.Port = body.SSHPort
	}
	if body.HTTPPort > 0 {
		r.cfg.Server.HTTPPort = body.HTTPPort
	}
	if body.DefaultRepoMaxCreationLimit != nil {
		r.cfg.Repository.MaxCreationLimit = *body.DefaultRepoMaxCreationLimit
	}
	if body.DefaultOrgMaxCreationLimit != nil {
		r.cfg.Organization.MaxCreationLimit = *body.DefaultOrgMaxCreationLimit
	}

	// Persist to configuration file if standard directory exists
	configPaths := []string{
		"conf/app.ini",
		"data/config/app.ini",
		"/data/config/app.ini",
	}
	savePath := "conf/app.ini"
	for _, p := range configPaths {
		if _, err := os.Stat(p); err == nil {
			savePath = p
			break
		}
	}
	_ = config.Save(savePath, r.cfg)

	database.CreateActivity(currentAdmin.ID, currentAdmin.Username, nil, "", "admin_config", fmt.Sprintf("Updated server configuration: RootURL=%s, Domain=%s", r.cfg.Server.RootURL, r.cfg.Server.Domain))

	jsonResponse(w, http.StatusOK, map[string]any{
		"message":                         "Server configuration updated successfully",
		"app_name":                        r.cfg.Server.AppName,
		"domain":                          r.cfg.Server.Domain,
		"root_url":                        r.cfg.Server.RootURL,
		"ssh_port":                        r.cfg.SSH.Port,
		"http_port":                       r.cfg.Server.HTTPPort,
		"default_repo_max_creation_limit": r.cfg.Repository.MaxCreationLimit,
		"default_org_max_creation_limit":  r.cfg.Organization.MaxCreationLimit,
	})
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

	if !r.canAdminRepo(user, repo) {
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

	if !r.canAdminRepo(user, repo) {
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
// Webhook & Danger Zone Handlers
// ============================================================================

func (r *Router) handleListWebhooks(w http.ResponseWriter, req *http.Request) {
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

	if !r.canAdminRepo(user, repo) {
		jsonError(w, http.StatusForbidden, "Admin privileges required to manage webhooks")
		return
	}

	hooks, err := database.ListRepoWebhooks(repo.ID)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, hooks)
}

func (r *Router) handleCreateWebhook(w http.ResponseWriter, req *http.Request) {
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

	if !r.canAdminRepo(user, repo) {
		jsonError(w, http.StatusForbidden, "Admin privileges required to manage webhooks")
		return
	}

	var body struct {
		URL         string `json:"url"`
		Secret      string `json:"secret"`
		ContentType string `json:"content_type"`
		Events      string `json:"events"`
		IsActive    *bool  `json:"is_active"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	isActive := true
	if body.IsActive != nil {
		isActive = *body.IsActive
	}

	hook, err := database.CreateWebhook(repo.ID, body.URL, body.Secret, body.ContentType, body.Events, isActive)
	if err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusCreated, hook)
}

func (r *Router) handleGetWebhook(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	hookIDStr := req.PathValue("id")

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

	if !r.canAdminRepo(user, repo) {
		jsonError(w, http.StatusForbidden, "Admin privileges required to view webhooks")
		return
	}

	hookID, _ := strconv.ParseInt(hookIDStr, 10, 64)
	hook, err := database.GetWebhookByID(hookID)
	if err != nil || hook == nil || hook.RepoID != repo.ID {
		jsonError(w, http.StatusNotFound, "Webhook not found")
		return
	}

	jsonResponse(w, http.StatusOK, hook)
}

func (r *Router) handleUpdateWebhook(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	hookIDStr := req.PathValue("id")

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

	if !r.canAdminRepo(user, repo) {
		jsonError(w, http.StatusForbidden, "Admin privileges required to update webhooks")
		return
	}

	hookID, _ := strconv.ParseInt(hookIDStr, 10, 64)
	hook, err := database.GetWebhookByID(hookID)
	if err != nil || hook == nil || hook.RepoID != repo.ID {
		jsonError(w, http.StatusNotFound, "Webhook not found")
		return
	}

	var body struct {
		URL         string `json:"url"`
		Secret      string `json:"secret"`
		ContentType string `json:"content_type"`
		Events      string `json:"events"`
		IsActive    *bool  `json:"is_active"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if strings.TrimSpace(body.URL) == "" {
		body.URL = hook.URL
	}
	if strings.TrimSpace(body.ContentType) == "" {
		body.ContentType = hook.ContentType
	}
	if strings.TrimSpace(body.Events) == "" {
		body.Events = hook.Events
	}
	isActive := hook.IsActive
	if body.IsActive != nil {
		isActive = *body.IsActive
	}

	if err := database.UpdateWebhook(hook.ID, body.URL, body.Secret, body.ContentType, body.Events, isActive); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	updated, _ := database.GetWebhookByID(hook.ID)
	jsonResponse(w, http.StatusOK, updated)
}

func (r *Router) handleDeleteWebhook(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	hookIDStr := req.PathValue("id")

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

	if !r.canAdminRepo(user, repo) {
		jsonError(w, http.StatusForbidden, "Admin privileges required to delete webhooks")
		return
	}

	hookID, _ := strconv.ParseInt(hookIDStr, 10, 64)
	hook, err := database.GetWebhookByID(hookID)
	if err != nil || hook == nil || hook.RepoID != repo.ID {
		jsonError(w, http.StatusNotFound, "Webhook not found")
		return
	}

	if err := database.DeleteWebhook(hook.ID); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{"message": "Webhook deleted successfully"})
}

func (r *Router) handleTestWebhook(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	hookIDStr := req.PathValue("id")

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

	if !r.canAdminRepo(user, repo) {
		jsonError(w, http.StatusForbidden, "Admin privileges required to test webhooks")
		return
	}

	hookID, _ := strconv.ParseInt(hookIDStr, 10, 64)
	hook, err := database.GetWebhookByID(hookID)
	if err != nil || hook == nil || hook.RepoID != repo.ID {
		jsonError(w, http.StatusNotFound, "Webhook not found")
		return
	}

	pingPayload := map[string]any{
		"zen":        "ProGit Webhooks are operational.",
		"hook_id":    hook.ID,
		"hook":       hook,
		"repository": repo,
		"sender":     user,
	}

	delivery, err := database.DeliverWebhook(hook, "ping", pingPayload)
	if delivery == nil {
		jsonError(w, http.StatusInternalServerError, fmt.Sprintf("Delivery failed: %v", err))
		return
	}

	jsonResponse(w, http.StatusOK, map[string]any{
		"message":  "Test ping delivered",
		"delivery": delivery,
	})
}

func (r *Router) handleListWebhookDeliveries(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	hookIDStr := req.PathValue("id")

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

	if !r.canAdminRepo(user, repo) {
		jsonError(w, http.StatusForbidden, "Admin privileges required to view webhook deliveries")
		return
	}

	hookID, _ := strconv.ParseInt(hookIDStr, 10, 64)
	hook, err := database.GetWebhookByID(hookID)
	if err != nil || hook == nil || hook.RepoID != repo.ID {
		jsonError(w, http.StatusNotFound, "Webhook not found")
		return
	}

	deliveries, err := database.ListWebhookDeliveries(hook.ID, 30)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, deliveries)
}

func (r *Router) handleChangeRepoVisibility(w http.ResponseWriter, req *http.Request) {
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

	if !r.canAdminRepo(user, repo) {
		jsonError(w, http.StatusForbidden, "Admin privileges required to change repository visibility")
		return
	}

	var body struct {
		IsPrivate bool `json:"is_private"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := database.UpdateRepoVisibility(repo.ID, body.IsPrivate); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	repo.IsPrivate = body.IsPrivate
	jsonResponse(w, http.StatusOK, map[string]any{
		"message":    "Repository visibility updated successfully",
		"is_private": repo.IsPrivate,
		"repository": repo,
	})
}

func (r *Router) handleToggleRepoArchive(w http.ResponseWriter, req *http.Request) {
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

	if !r.canAdminRepo(user, repo) {
		jsonError(w, http.StatusForbidden, "Admin privileges required to archive or unarchive repository")
		return
	}

	var body struct {
		Archive bool `json:"archive"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := database.ToggleRepoArchive(repo.ID, body.Archive); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	repo.IsArchived = body.Archive
	jsonResponse(w, http.StatusOK, map[string]any{
		"message":     "Repository archive status updated successfully",
		"is_archived": repo.IsArchived,
		"repository":  repo,
	})
}

func (r *Router) handleTransferRepo(w http.ResponseWriter, req *http.Request) {
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

	// Only repo owner or site administrator can transfer ownership
	if !user.IsAdmin && user.ID != repo.OwnerID {
		jsonError(w, http.StatusForbidden, "Only the repository owner or site administrator can transfer ownership")
		return
	}

	var body struct {
		NewOwner string `json:"new_owner"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || strings.TrimSpace(body.NewOwner) == "" {
		jsonError(w, http.StatusBadRequest, "New owner username or organization name is required")
		return
	}
	newOwnerName := strings.TrimSpace(body.NewOwner)

	// Check if target user exists
	targetUser, err := database.GetUserByUsername(newOwnerName)
	if err != nil || targetUser == nil {
		jsonError(w, http.StatusNotFound, fmt.Sprintf("Target user or organization '%s' not found", newOwnerName))
		return
	}

	// If destination is an organization, check user is an admin of that org
	if org, _ := database.GetOrgByName(newOwnerName); org != nil {
		if !user.IsAdmin && !database.IsOrgAdmin(org.ID, user.ID) {
			jsonError(w, http.StatusForbidden, "You must be an owner or administrator of the destination organization to transfer a repository to it")
			return
		}
	}

	updatedRepo, err := database.TransferRepository(repo.ID, targetUser.ID, targetUser.Username, r.cfg.Repository.Root)
	if err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]any{
		"message":      "Repository transferred successfully",
		"new_owner":    targetUser.Username,
		"redirect_url": fmt.Sprintf("/%s/%s", targetUser.Username, repo.Name),
		"repository":   updatedRepo,
	})
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

	// Enforce organization creation limit for non-admin users
	if !user.IsAdmin {
		effectiveLimit := r.cfg.Organization.MaxCreationLimit
		if user.MaxOrgCreation >= 0 {
			effectiveLimit = user.MaxOrgCreation
		}
		if effectiveLimit >= 0 {
			count, err := database.CountUserOwnedOrgs(user.ID)
			if err == nil && count >= effectiveLimit {
				jsonError(w, http.StatusForbidden, fmt.Sprintf("You have reached your organization creation limit of %d. Contact your administrator to increase your limit.", effectiveLimit))
				return
			}
		}
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

func (r *Router) handleUpdateOrg(w http.ResponseWriter, req *http.Request) {
	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	orgName := req.PathValue("org")
	org, err := database.GetOrgByName(orgName)
	if err != nil || org == nil {
		jsonError(w, http.StatusNotFound, "Organization not found")
		return
	}

	// Only platform admin or organization admin can edit organization profile
	if !user.IsAdmin && !database.IsOrgAdmin(org.ID, user.ID) {
		jsonError(w, http.StatusForbidden, "Only organization administrators can update organization details")
		return
	}

	var body struct {
		FullName    string `json:"full_name"`
		Description string `json:"description"`
		Location    string `json:"location"`
		Website     string `json:"website"`
		AvatarURL   string `json:"avatar_url"`
	}

	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	updatedOrg, err := database.UpdateOrganization(org.ID, body.FullName, body.Description, body.Location, body.Website, body.AvatarURL)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to update organization: %v", err))
		return
	}

	database.CreateActivity(user.ID, user.Username, nil, org.Name, "update_org", fmt.Sprintf("Updated organization profile for %s", org.Name))

	jsonResponse(w, http.StatusOK, map[string]any{
		"organization": updatedOrg,
		"message":      "Organization profile updated successfully",
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

	if repo.IsArchived {
		jsonError(w, http.StatusBadRequest, "Repository is archived and read-only")
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

	if repo.IsArchived {
		jsonError(w, http.StatusBadRequest, "Repository is archived and read-only")
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

	if repo.IsArchived {
		jsonError(w, http.StatusBadRequest, "Repository is archived and read-only")
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

	if repo.IsArchived {
		jsonError(w, http.StatusBadRequest, "Repository is archived and read-only")
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

	if repo.IsArchived {
		jsonError(w, http.StatusBadRequest, "Repository is archived and read-only")
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

func (r *Router) handleUpdateProjectColumn(w http.ResponseWriter, req *http.Request) {
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

	if repo.IsArchived {
		jsonError(w, http.StatusBadRequest, "Repository is archived and read-only")
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

	if err := database.UpdateProjectColumn(colID, body.Title, body.OrderNum); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{"message": "Column updated successfully"})
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

	if repo.IsArchived {
		jsonError(w, http.StatusBadRequest, "Repository is archived and read-only")
		return
	}

	if !database.CanUserAccessRepo(user, repo, true) {
		jsonError(w, http.StatusForbidden, "Write permission required")
		return
	}

	var body struct {
		ColumnID *int64  `json:"column_id"`
		OrderNum *int    `json:"order_num"`
		Content  *string `json:"content"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := database.UpdateProjectCard(cardID, body.ColumnID, body.OrderNum, body.Content); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	msg := "Card moved successfully"
	if body.Content != nil && body.ColumnID == nil {
		msg = "Card updated successfully"
	}
	jsonResponse(w, http.StatusOK, map[string]string{"message": msg})
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

	if repo.IsArchived {
		jsonError(w, http.StatusBadRequest, "Repository is archived and read-only")
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

// Direct Messaging Handlers (Developer Communication)

func (r *Router) handleSendMessage(w http.ResponseWriter, req *http.Request) {
	if !r.cfg.Features.EnableMessaging {
		jsonError(w, http.StatusForbidden, "Direct messaging feature is disabled on this server")
		return
	}

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var body struct {
		RecipientUsername string `json:"recipient_username"`
		Subject           string `json:"subject"`
		Content           string `json:"content"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	body.RecipientUsername = strings.TrimSpace(body.RecipientUsername)
	if body.RecipientUsername == "" {
		jsonError(w, http.StatusBadRequest, "Recipient username or ID is required")
		return
	}

	recipientUser, err := database.GetUserByUsername(body.RecipientUsername)
	if err != nil || recipientUser == nil {
		if id, errConv := strconv.ParseInt(body.RecipientUsername, 10, 64); errConv == nil {
			recipientUser, _ = database.GetUserByID(id)
		}
	}
	if recipientUser == nil {
		jsonError(w, http.StatusNotFound, "User does not exist")
		return
	}

	if recipientUser.ID == user.ID {
		jsonError(w, http.StatusBadRequest, "You cannot send a message to yourself")
		return
	}

	// Anti-harassment: If the recipient previously rejected message requests from this sender, block them
	var rejectedCount int
	_ = database.DB.QueryRow(`
		SELECT COUNT(*) FROM messages 
		WHERE sender_id = ? AND recipient_id = ? AND status = 'rejected'
	`, recipientUser.ID, user.ID).Scan(&rejectedCount)
	if rejectedCount > 0 {
		jsonError(w, http.StatusForbidden, "The recipient previously declined message requests from your account. Further messages cannot be sent.")
		return
	}

	msg, err := database.SendMessage(user.ID, recipientUser.ID, body.Subject, body.Content)
	if err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusCreated, msg)
}

func (r *Router) handleListInboxMessages(w http.ResponseWriter, req *http.Request) {
	if !r.cfg.Features.EnableMessaging {
		jsonError(w, http.StatusForbidden, "Direct messaging feature is disabled on this server")
		return
	}

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	messages, err := database.ListInboxMessages(user.ID)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if messages == nil {
		messages = []database.Message{}
	}
	jsonResponse(w, http.StatusOK, messages)
}

func (r *Router) handleListSentMessages(w http.ResponseWriter, req *http.Request) {
	if !r.cfg.Features.EnableMessaging {
		jsonError(w, http.StatusForbidden, "Direct messaging feature is disabled on this server")
		return
	}

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	messages, err := database.ListSentMessages(user.ID)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if messages == nil {
		messages = []database.Message{}
	}
	jsonResponse(w, http.StatusOK, messages)
}

func (r *Router) handleGetUnreadMessageCount(w http.ResponseWriter, req *http.Request) {
	if !r.cfg.Features.EnableMessaging {
		jsonResponse(w, http.StatusOK, map[string]any{"unread_count": 0, "messaging_enabled": false})
		return
	}

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonResponse(w, http.StatusOK, map[string]int{"unread_count": 0})
		return
	}

	count, _ := database.CountUnreadMessages(user.ID)
	jsonResponse(w, http.StatusOK, map[string]int{"unread_count": count})
}

func (r *Router) handleGetMessage(w http.ResponseWriter, req *http.Request) {
	if !r.cfg.Features.EnableMessaging {
		jsonError(w, http.StatusForbidden, "Direct messaging feature is disabled on this server")
		return
	}

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	idStr := req.PathValue("id")
	msgID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid message ID")
		return
	}

	msg, err := database.GetMessageByID(msgID, user.ID)
	if err != nil || msg == nil {
		jsonError(w, http.StatusNotFound, "Message not found")
		return
	}

	jsonResponse(w, http.StatusOK, msg)
}

func (r *Router) handleMarkMessageRead(w http.ResponseWriter, req *http.Request) {
	if !r.cfg.Features.EnableMessaging {
		jsonError(w, http.StatusForbidden, "Direct messaging feature is disabled on this server")
		return
	}

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	idStr := req.PathValue("id")
	msgID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid message ID")
		return
	}

	if err := database.MarkMessageRead(msgID, user.ID); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{"message": "Message marked as read"})
}

func (r *Router) handleDeleteMessage(w http.ResponseWriter, req *http.Request) {
	if !r.cfg.Features.EnableMessaging {
		jsonError(w, http.StatusForbidden, "Direct messaging feature is disabled on this server")
		return
	}

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	idStr := req.PathValue("id")
	msgID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid message ID")
		return
	}

	if err := database.DeleteMessage(msgID, user.ID); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{"message": "Message deleted successfully"})
}

func (r *Router) handleAcceptMessage(w http.ResponseWriter, req *http.Request) {
	if !r.cfg.Features.EnableMessaging {
		jsonError(w, http.StatusForbidden, "Direct messaging feature is disabled on this server")
		return
	}

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	idStr := req.PathValue("id")
	msgID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid message ID")
		return
	}

	msg, err := database.AcceptMessage(msgID, user.ID)
	if err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, msg)
}

func (r *Router) handleRejectMessage(w http.ResponseWriter, req *http.Request) {
	if !r.cfg.Features.EnableMessaging {
		jsonError(w, http.StatusForbidden, "Direct messaging feature is disabled on this server")
		return
	}

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	idStr := req.PathValue("id")
	msgID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid message ID")
		return
	}

	msg, err := database.RejectMessage(msgID, user.ID)
	if err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, msg)
}

func (r *Router) handleListDevelopers(w http.ResponseWriter, req *http.Request) {
	if !r.cfg.Features.EnableMessaging {
		jsonError(w, http.StatusForbidden, "Direct messaging feature is disabled on this server")
		return
	}

	user := auth.AuthenticateRequest(req)
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	q := strings.TrimSpace(req.URL.Query().Get("q"))
	if q == "" {
		// Security & Privacy: Do not list or enumerate all accounts without a search query
		jsonResponse(w, http.StatusOK, []database.User{})
		return
	}

	limitStr := req.URL.Query().Get("limit")
	limit := 10
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 50 {
		limit = l
	}

	developers, err := database.SearchActiveDevelopers(user.ID, q, limit)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if developers == nil {
		developers = []database.User{}
	}

	jsonResponse(w, http.StatusOK, developers)
}

func (r *Router) handleGetFeatures(w http.ResponseWriter, req *http.Request) {
	jsonResponse(w, http.StatusOK, map[string]any{
		"messaging_enabled": r.cfg.Features.EnableMessaging,
	})
}

// ============================================================================
// Server Certificate Download (P0)
// ============================================================================

func (r *Router) handleDownloadCert(w http.ResponseWriter, req *http.Request) {
	certPath := r.cfg.Server.CertFile
	if certPath == "" {
		certPath = "custom/https/cert.pem"
	}
	data, err := os.ReadFile(certPath)
	if err != nil {
		jsonError(w, http.StatusNotFound, "TLS certificate file not found")
		return
	}
	w.Header().Set("Content-Type", "application/x-pem-file")
	w.Header().Set("Content-Disposition", "attachment; filename=\"progit-cert.pem\"")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

// ============================================================================
// Recently Pushed Branches (P0)
// ============================================================================

func formatTimeAgo(t time.Time) string {
	d := time.Since(t)
	if d < time.Minute {
		return "just now"
	} else if d < time.Hour {
		m := int(d.Minutes())
		if m <= 1 {
			return "1 minute ago"
		}
		return fmt.Sprintf("%d minutes ago", m)
	} else if d < 24*time.Hour {
		h := int(d.Hours())
		if h <= 1 {
			return "1 hour ago"
		}
		return fmt.Sprintf("%d hours ago", h)
	}
	days := int(d.Hours() / 24)
	if days <= 1 {
		return "yesterday"
	}
	return fmt.Sprintf("%d days ago", days)
}

func (r *Router) handleGetRecentPushes(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	repo, _, ok := r.getRepoWithAccess(w, req, owner, repoName, false)
	if !ok {
		return
	}

	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")
	branches, _ := git.GetBranches(repoDir)

	type RecentPush struct {
		Branch    string `json:"branch"`
		TimeAgo   string `json:"time_ago"`
		CommitSHA string `json:"commit_sha"`
		CommitMsg string `json:"commit_msg"`
	}

	var recents []RecentPush
	now := time.Now()
	for _, b := range branches {
		if b == repo.DefaultBranch {
			continue
		}
		commits, err := git.GetCommits(repoDir, b, 1, 0)
		if err == nil && len(commits) > 0 {
			c := commits[0]
			diff := now.Sub(c.Timestamp)
			if diff >= 0 && diff < 3*time.Hour {
				hasOpenPR, _ := database.HasOpenPullForBranch(repo.ID, b)
				if !hasOpenPR {
					recents = append(recents, RecentPush{
						Branch:    b,
						TimeAgo:   formatTimeAgo(c.Timestamp),
						CommitSHA: c.ShortSHA,
						CommitMsg: c.Message,
					})
				}
			}
		}
	}
	if recents == nil {
		recents = []RecentPush{}
	}
	jsonResponse(w, http.StatusOK, map[string]any{"recent_pushes": recents})
}

// ============================================================================
// Git Blame Endpoint (P2)
// ============================================================================

func (r *Router) handleGetBlame(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	repo, _, ok := r.getRepoWithAccess(w, req, owner, repoName, false)
	if !ok {
		return
	}

	ref := req.URL.Query().Get("branch")
	if ref == "" {
		ref = req.URL.Query().Get("ref")
	}
	if ref == "" {
		ref = repo.DefaultBranch
	}
	if ref == "" {
		ref = "main"
	}
	filePath := req.URL.Query().Get("path")
	if filePath == "" {
		jsonError(w, http.StatusBadRequest, "path parameter required")
		return
	}

	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")
	blameLines, err := git.GetBlame(repoDir, ref, filePath)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if blameLines == nil {
		blameLines = []git.BlameLine{}
	}
	jsonResponse(w, http.StatusOK, map[string]any{
		"branch": ref,
		"path":   filePath,
		"lines":  blameLines,
	})
}

// ============================================================================
// In-Repo Code Search (P3)
// ============================================================================

func (r *Router) handleSearchRepoCode(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	repo, _, ok := r.getRepoWithAccess(w, req, owner, repoName, false)
	if !ok {
		return
	}

	q := strings.TrimSpace(req.URL.Query().Get("q"))
	if q == "" {
		jsonResponse(w, http.StatusOK, map[string]any{"matches": []git.CodeMatch{}})
		return
	}

	ref := req.URL.Query().Get("branch")
	if ref == "" {
		ref = repo.DefaultBranch
	}
	if ref == "" {
		ref = "main"
	}

	repoDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git")
	matches, err := git.SearchCode(repoDir, ref, q)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if matches == nil {
		matches = []git.CodeMatch{}
	}
	jsonResponse(w, http.StatusOK, map[string]any{
		"query":   q,
		"branch":  ref,
		"matches": matches,
	})
}

// ============================================================================
// Branch Protection Endpoints (P3)
// ============================================================================

func (r *Router) handleListBranchProtections(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	repo, _, ok := r.getRepoWithAccess(w, req, owner, repoName, false)
	if !ok {
		return
	}

	list, err := database.ListBranchProtections(repo.ID)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if list == nil {
		list = []database.BranchProtection{}
	}
	jsonResponse(w, http.StatusOK, list)
}

func (r *Router) handleSetBranchProtection(w http.ResponseWriter, req *http.Request) {
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

	if !database.CanUserAccessRepo(user, repo, true) {
		jsonError(w, http.StatusForbidden, "Admin permission required")
		return
	}

	var body struct {
		BranchName        string `json:"branch_name"`
		RequirePR         bool   `json:"require_pr"`
		RequiredApprovals int    `json:"required_approvals"`
		PreventForcePush  bool   `json:"prevent_force_push"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	body.BranchName = strings.TrimSpace(body.BranchName)
	if body.BranchName == "" {
		jsonError(w, http.StatusBadRequest, "branch_name is required")
		return
	}

	bp, err := database.SetBranchProtection(repo.ID, body.BranchName, body.RequirePR, body.RequiredApprovals, body.PreventForcePush)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, bp)
}

func (r *Router) handleDeleteBranchProtection(w http.ResponseWriter, req *http.Request) {
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

	if !database.CanUserAccessRepo(user, repo, true) {
		jsonError(w, http.StatusForbidden, "Admin permission required")
		return
	}

	branch := req.PathValue("branch")
	if err := database.DeleteBranchProtection(repo.ID, branch); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{"message": "Branch protection removed"})
}

// ============================================================================
// Releases & Assets Endpoints (P3)
// ============================================================================

func (r *Router) handleListReleases(w http.ResponseWriter, req *http.Request) {
	owner := req.PathValue("owner")
	repoName := req.PathValue("repo")
	repo, _, ok := r.getRepoWithAccess(w, req, owner, repoName, false)
	if !ok {
		return
	}

	releases, err := database.ListReleases(repo.ID)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if releases == nil {
		releases = []database.Release{}
	}
	jsonResponse(w, http.StatusOK, releases)
}

func (r *Router) handleCreateRelease(w http.ResponseWriter, req *http.Request) {
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

	if !database.CanUserAccessRepo(user, repo, true) {
		jsonError(w, http.StatusForbidden, "Write permission required")
		return
	}

	var body struct {
		TagName      string `json:"tag_name"`
		Title        string `json:"title"`
		Note         string `json:"note"`
		IsDraft      bool   `json:"is_draft"`
		IsPrerelease bool   `json:"is_prerelease"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	body.TagName = strings.TrimSpace(body.TagName)
	if body.TagName == "" {
		jsonError(w, http.StatusBadRequest, "tag_name is required")
		return
	}
	if body.Title == "" {
		body.Title = body.TagName
	}

	rel, err := database.CreateRelease(repo.ID, user.ID, body.TagName, body.Title, body.Note, body.IsDraft, body.IsPrerelease)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	database.CreateActivity(user.ID, user.Username, &repo.ID, repo.Name, "release", fmt.Sprintf("Published release %s in %s/%s", rel.TagName, owner, repoName))
	jsonResponse(w, http.StatusCreated, rel)
}

func (r *Router) handleDeleteRelease(w http.ResponseWriter, req *http.Request) {
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

	if !database.CanUserAccessRepo(user, repo, true) {
		jsonError(w, http.StatusForbidden, "Write permission required")
		return
	}

	id, _ := strconv.ParseInt(req.PathValue("id"), 10, 64)
	if err := database.DeleteRelease(id); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{"message": "Release deleted"})
}

func (r *Router) handleUploadReleaseAsset(w http.ResponseWriter, req *http.Request) {
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

	if !database.CanUserAccessRepo(user, repo, true) {
		jsonError(w, http.StatusForbidden, "Write permission required")
		return
	}

	releaseID, _ := strconv.ParseInt(req.PathValue("id"), 10, 64)
	rel, err := database.GetReleaseByID(releaseID)
	if err != nil || rel == nil {
		jsonError(w, http.StatusNotFound, "Release not found")
		return
	}

	// 100MB max upload
	_ = req.ParseMultipartForm(100 << 20)
	file, handler, err := req.FormFile("file")
	if err != nil {
		jsonError(w, http.StatusBadRequest, "Missing file in multipart form")
		return
	}
	defer file.Close()

	assetDir := filepath.Join(r.cfg.Repository.Root, owner, repoName+".git", "releases", fmt.Sprintf("%d", releaseID))
	_ = os.MkdirAll(assetDir, 0755)
	destPath := filepath.Join(assetDir, handler.Filename)

	dst, err := os.Create(destPath)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer dst.Close()

	size, err := io.Copy(dst, file)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	cType := handler.Header.Get("Content-Type")
	if cType == "" {
		cType = "application/octet-stream"
	}

	asset, err := database.CreateReleaseAsset(releaseID, handler.Filename, size, destPath, cType)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusCreated, asset)
}

func (r *Router) handleDownloadReleaseAsset(w http.ResponseWriter, req *http.Request) {
	assetID, _ := strconv.ParseInt(req.PathValue("asset_id"), 10, 64)
	asset, err := database.GetReleaseAsset(assetID)
	if err != nil || asset == nil {
		jsonError(w, http.StatusNotFound, "Release asset not found")
		return
	}

	if _, err := os.Stat(asset.FilePath); os.IsNotExist(err) {
		jsonError(w, http.StatusNotFound, "Asset file missing from disk")
		return
	}

	_ = database.IncrementReleaseAssetDownloads(assetID)
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", asset.Name))
	w.Header().Set("Content-Type", asset.ContentType)
	w.Header().Set("Content-Length", fmt.Sprintf("%d", asset.SizeBytes))
	http.ServeFile(w, req, asset.FilePath)
}

