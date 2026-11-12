package database

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
	"progit.io/progit/internal/config"
)

var (
	DB   *sql.DB
	dbMu sync.RWMutex
)

// Init opens SQLite in WAL mode and runs migrations.
func Init(cfg *config.Config) error {
	dbMu.Lock()
	defer dbMu.Unlock()

	if err := os.MkdirAll(filepath.Dir(cfg.Database.Path), 0755); err != nil {
		return fmt.Errorf("create database dir: %w", err)
	}

	dsn := fmt.Sprintf("%s?_pragma=busy_timeout(%d)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=foreign_keys(ON)",
		cfg.Database.Path, cfg.Database.BusyTimeout)

	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return fmt.Errorf("open sqlite database: %w", err)
	}

	db.SetMaxOpenConns(cfg.Database.MaxOpenConns)
	db.SetMaxIdleConns(cfg.Database.MaxIdleConns)
	db.SetConnMaxLifetime(10 * time.Minute)

	if err := db.Ping(); err != nil {
		return fmt.Errorf("ping sqlite database: %w", err)
	}

	DB = db

	if err := runMigrations(db); err != nil {
		return fmt.Errorf("run sqlite migrations: %w", err)
	}

	return nil
}

// Ping checks if SQLite database is responsive.
func Ping() error {
	if DB == nil {
		return fmt.Errorf("database not initialized")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	return DB.PingContext(ctx)
}

func runMigrations(db *sql.DB) error {
	schema := `
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT NOT NULL UNIQUE COLLATE NOCASE,
		email TEXT NOT NULL UNIQUE COLLATE NOCASE,
		password_hash TEXT NOT NULL,
		full_name TEXT NOT NULL DEFAULT '',
		avatar_url TEXT NOT NULL DEFAULT '',
		is_admin BOOLEAN NOT NULL DEFAULT 0,
		is_active BOOLEAN NOT NULL DEFAULT 1,
		can_download BOOLEAN NOT NULL DEFAULT 1,
		location TEXT NOT NULL DEFAULT '',
		website TEXT NOT NULL DEFAULT '',
		bio TEXT NOT NULL DEFAULT '',
		max_repo_creation INTEGER NOT NULL DEFAULT -1,
		max_org_creation INTEGER NOT NULL DEFAULT -1,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
	CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

	CREATE TABLE IF NOT EXISTS access_tokens (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		token_hash TEXT NOT NULL UNIQUE,
		token_prefix TEXT NOT NULL,
		scopes TEXT NOT NULL DEFAULT 'repo,user',
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		last_used_at DATETIME
	);

	CREATE INDEX IF NOT EXISTS idx_access_tokens_hash ON access_tokens(token_hash);

	CREATE TABLE IF NOT EXISTS ssh_keys (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		title TEXT NOT NULL,
		fingerprint TEXT NOT NULL UNIQUE,
		public_key TEXT NOT NULL,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_ssh_keys_fingerprint ON ssh_keys(fingerprint);

	CREATE TABLE IF NOT EXISTS repositories (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		name TEXT NOT NULL COLLATE NOCASE,
		description TEXT NOT NULL DEFAULT '',
		is_private BOOLEAN NOT NULL DEFAULT 0,
		is_fork BOOLEAN NOT NULL DEFAULT 0,
		fork_parent_id INTEGER REFERENCES repositories(id) ON DELETE SET NULL,
		default_branch TEXT NOT NULL DEFAULT 'main',
		num_stars INTEGER NOT NULL DEFAULT 0,
		num_forks INTEGER NOT NULL DEFAULT 0,
		num_watches INTEGER NOT NULL DEFAULT 0,
		num_issues INTEGER NOT NULL DEFAULT 0,
		num_pulls INTEGER NOT NULL DEFAULT 0,
		size_bytes INTEGER NOT NULL DEFAULT 0,
		is_archived BOOLEAN NOT NULL DEFAULT 0,
		enable_wiki BOOLEAN NOT NULL DEFAULT 1,
		enable_pages BOOLEAN NOT NULL DEFAULT 0,
		pages_branch TEXT NOT NULL DEFAULT 'main',
		pages_folder TEXT NOT NULL DEFAULT '/',
		allow_download_and_pulls BOOLEAN NOT NULL DEFAULT 1,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(owner_id, name)
	);

	CREATE INDEX IF NOT EXISTS idx_repos_owner_name ON repositories(owner_id, name);

	CREATE TABLE IF NOT EXISTS stars (
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY(user_id, repo_id)
	);

	CREATE TABLE IF NOT EXISTS watches (
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY(user_id, repo_id)
	);

	CREATE TABLE IF NOT EXISTS follows (
		follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY(follower_id, following_id)
	);
	CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
	CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);

	CREATE TABLE IF NOT EXISTS collaborators (
		repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		mode TEXT NOT NULL DEFAULT 'write',
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY(repo_id, user_id)
	);

	CREATE TABLE IF NOT EXISTS issues (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
		index_number INTEGER NOT NULL,
		poster_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
		title TEXT NOT NULL,
		content TEXT NOT NULL DEFAULT '',
		is_pull BOOLEAN NOT NULL DEFAULT 0,
		is_closed BOOLEAN NOT NULL DEFAULT 0,
		closed_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(repo_id, index_number)
	);

	CREATE INDEX IF NOT EXISTS idx_issues_repo_index ON issues(repo_id, index_number);

	CREATE TABLE IF NOT EXISTS pull_requests (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		issue_id INTEGER NOT NULL UNIQUE REFERENCES issues(id) ON DELETE CASCADE,
		head_repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
		base_repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
		head_branch TEXT NOT NULL,
		base_branch TEXT NOT NULL,
		merge_base TEXT NOT NULL DEFAULT '',
		is_merged BOOLEAN NOT NULL DEFAULT 0,
		merged_at DATETIME,
		merged_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
		merge_commit_sha TEXT NOT NULL DEFAULT ''
	);

	CREATE TABLE IF NOT EXISTS comments (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
		poster_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		type TEXT NOT NULL DEFAULT 'comment',
		content TEXT NOT NULL DEFAULT '',
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_comments_issue ON comments(issue_id);

	CREATE TABLE IF NOT EXISTS pull_reviews (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
		pull_id INTEGER NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
		reviewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		state TEXT NOT NULL,
		content TEXT NOT NULL DEFAULT '',
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_pull_reviews_issue ON pull_reviews(issue_id);
	CREATE INDEX IF NOT EXISTS idx_pull_reviews_pull ON pull_reviews(pull_id);

	CREATE TABLE IF NOT EXISTS pull_review_comments (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		review_id INTEGER REFERENCES pull_reviews(id) ON DELETE CASCADE,
		issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		file_path TEXT NOT NULL,
		line_number INTEGER NOT NULL DEFAULT 1,
		diff_hunk TEXT NOT NULL DEFAULT '',
		content TEXT NOT NULL,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_pull_review_comments_issue ON pull_review_comments(issue_id);

	CREATE TABLE IF NOT EXISTS activities (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		repo_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
		op_type TEXT NOT NULL,
		content TEXT NOT NULL DEFAULT '',
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_activities_user ON activities(user_id, created_at DESC);

	CREATE TABLE IF NOT EXISTS webhooks (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
		url TEXT NOT NULL,
		secret TEXT NOT NULL DEFAULT '',
		content_type TEXT NOT NULL DEFAULT 'json',
		events TEXT NOT NULL DEFAULT 'push,issue,pull_request',
		is_active BOOLEAN NOT NULL DEFAULT 1,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS webhook_deliveries (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		webhook_id INTEGER NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
		event TEXT NOT NULL,
		payload TEXT NOT NULL,
		status_code INTEGER NOT NULL,
		response_body TEXT NOT NULL,
		duration_ms INTEGER NOT NULL,
		delivered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS organizations (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL UNIQUE COLLATE NOCASE,
		full_name TEXT NOT NULL DEFAULT '',
		description TEXT NOT NULL DEFAULT '',
		avatar_url TEXT NOT NULL DEFAULT '',
		location TEXT NOT NULL DEFAULT '',
		website TEXT NOT NULL DEFAULT '',
		max_repo_creation INTEGER NOT NULL DEFAULT -1,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS org_members (
		org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		role TEXT NOT NULL DEFAULT 'member',
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY(org_id, user_id)
	);

	CREATE TABLE IF NOT EXISTS teams (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		permission TEXT NOT NULL DEFAULT 'write',
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(org_id, name)
	);

	CREATE TABLE IF NOT EXISTS team_members (
		team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY(team_id, user_id)
	);

	CREATE TABLE IF NOT EXISTS team_repos (
		team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
		repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY(team_id, repo_id)
	);

	CREATE TABLE IF NOT EXISTS projects (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
		title TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		is_closed BOOLEAN NOT NULL DEFAULT 0,
		creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_projects_repo ON projects(repo_id);

	CREATE TABLE IF NOT EXISTS project_columns (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
		title TEXT NOT NULL,
		order_num INTEGER NOT NULL DEFAULT 0,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_project_columns ON project_columns(project_id, order_num);

	CREATE TABLE IF NOT EXISTS project_cards (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		column_id INTEGER NOT NULL REFERENCES project_columns(id) ON DELETE CASCADE,
		project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
		issue_id INTEGER REFERENCES issues(id) ON DELETE SET NULL,
		content TEXT NOT NULL DEFAULT '',
		order_num INTEGER NOT NULL DEFAULT 0,
		creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_project_cards ON project_cards(column_id, order_num);

	CREATE TABLE IF NOT EXISTS messages (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		subject TEXT NOT NULL DEFAULT '',
		content TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'pending',
		is_read BOOLEAN NOT NULL DEFAULT 0,
		read_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id, is_read, created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id, created_at DESC);

	CREATE TABLE IF NOT EXISTS sessions (
		token TEXT PRIMARY KEY,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		username TEXT NOT NULL,
		created_at DATETIME NOT NULL,
		expires_at DATETIME NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

	CREATE TABLE IF NOT EXISTS branch_protections (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
		branch_name TEXT NOT NULL,
		require_pr BOOLEAN NOT NULL DEFAULT 1,
		required_approvals INTEGER NOT NULL DEFAULT 1,
		prevent_force_push BOOLEAN NOT NULL DEFAULT 1,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(repo_id, branch_name)
	);
	CREATE INDEX IF NOT EXISTS idx_branch_protections_repo ON branch_protections(repo_id);

	CREATE TABLE IF NOT EXISTS releases (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
		publisher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		tag_name TEXT NOT NULL,
		title TEXT NOT NULL,
		note TEXT NOT NULL DEFAULT '',
		is_draft BOOLEAN NOT NULL DEFAULT 0,
		is_prerelease BOOLEAN NOT NULL DEFAULT 0,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		published_at DATETIME,
		UNIQUE(repo_id, tag_name)
	);
	CREATE INDEX IF NOT EXISTS idx_releases_repo ON releases(repo_id, created_at DESC);

	CREATE TABLE IF NOT EXISTS release_assets (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		release_id INTEGER NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		size_bytes INTEGER NOT NULL DEFAULT 0,
		download_count INTEGER NOT NULL DEFAULT 0,
		file_path TEXT NOT NULL,
		content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_release_assets_release ON release_assets(release_id);
	`

	if _, err := db.Exec(schema); err != nil {
		return err
	}

	// Migration columns for existing databases
	_, _ = db.Exec(`ALTER TABLE messages ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'`)
	_, _ = db.Exec(`ALTER TABLE issues ADD COLUMN assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL`)
	_, _ = db.Exec(`CREATE INDEX IF NOT EXISTS idx_issues_assignee ON issues(assignee_id)`)
	_, _ = db.Exec(`ALTER TABLE repositories ADD COLUMN enable_wiki BOOLEAN NOT NULL DEFAULT 1`)
	_, _ = db.Exec(`ALTER TABLE repositories ADD COLUMN enable_pages BOOLEAN NOT NULL DEFAULT 0`)
	_, _ = db.Exec(`ALTER TABLE repositories ADD COLUMN pages_branch TEXT NOT NULL DEFAULT 'main'`)
	_, _ = db.Exec(`ALTER TABLE repositories ADD COLUMN pages_folder TEXT NOT NULL DEFAULT '/'`)
	_, _ = db.Exec(`UPDATE repositories SET pages_branch = default_branch WHERE pages_branch = 'gh-pages' OR pages_branch = ''`)
	_, _ = db.Exec(`ALTER TABLE users ADD COLUMN max_repo_creation INTEGER NOT NULL DEFAULT -1`)
	_, _ = db.Exec(`ALTER TABLE users ADD COLUMN max_org_creation INTEGER NOT NULL DEFAULT -1`)
	_, _ = db.Exec(`ALTER TABLE users ADD COLUMN can_download BOOLEAN NOT NULL DEFAULT 1`)
	_, _ = db.Exec(`ALTER TABLE organizations ADD COLUMN max_repo_creation INTEGER NOT NULL DEFAULT -1`)
	_, _ = db.Exec(`ALTER TABLE repositories ADD COLUMN allow_download_and_pulls BOOLEAN NOT NULL DEFAULT 1`)

	_, _ = db.Exec(`
		CREATE TABLE IF NOT EXISTS pull_reviews (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
			pull_id INTEGER NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
			reviewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			state TEXT NOT NULL,
			content TEXT NOT NULL DEFAULT '',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_pull_reviews_issue ON pull_reviews(issue_id);
		CREATE INDEX IF NOT EXISTS idx_pull_reviews_pull ON pull_reviews(pull_id);

		CREATE TABLE IF NOT EXISTS pull_review_comments (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			review_id INTEGER REFERENCES pull_reviews(id) ON DELETE CASCADE,
			issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
			user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			file_path TEXT NOT NULL,
			line_number INTEGER NOT NULL DEFAULT 1,
			diff_hunk TEXT NOT NULL DEFAULT '',
			content TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_pull_review_comments_issue ON pull_review_comments(issue_id);
	`)

	return nil
}

// User Methods

func CreateUser(username, email, passwordHash, fullName string, isAdmin bool) (*User, error) {
	username = strings.TrimSpace(username)
	email = strings.TrimSpace(strings.ToLower(email))

	res, err := DB.Exec(`
		INSERT INTO users (username, email, password_hash, full_name, is_admin)
		VALUES (?, ?, ?, ?, ?)
	`, username, email, passwordHash, fullName, isAdmin)
	if err != nil {
		return nil, err
	}

	id, _ := res.LastInsertId()
	return GetUserByID(id)
}

func GetUserByID(id int64) (*User, error) {
	u := &User{}
	err := DB.QueryRow(`
		SELECT id, username, email, password_hash, full_name, avatar_url, is_admin, is_active, can_download, location, website, bio, max_repo_creation, max_org_creation, created_at, updated_at
		FROM users WHERE id = ?
	`, id).Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.FullName, &u.AvatarURL, &u.IsAdmin, &u.IsActive, &u.CanDownload, &u.Location, &u.Website, &u.Bio, &u.MaxRepoCreation, &u.MaxOrgCreation, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return u, nil
}

func GetUserByUsername(username string) (*User, error) {
	u := &User{}
	err := DB.QueryRow(`
		SELECT id, username, email, password_hash, full_name, avatar_url, is_admin, is_active, can_download, location, website, bio, max_repo_creation, max_org_creation, created_at, updated_at
		FROM users WHERE username = ? COLLATE NOCASE
	`, strings.TrimSpace(username)).Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.FullName, &u.AvatarURL, &u.IsAdmin, &u.IsActive, &u.CanDownload, &u.Location, &u.Website, &u.Bio, &u.MaxRepoCreation, &u.MaxOrgCreation, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return u, nil
}

func GetUserByEmail(email string) (*User, error) {
	u := &User{}
	err := DB.QueryRow(`
		SELECT id, username, email, password_hash, full_name, avatar_url, is_admin, is_active, can_download, location, website, bio, max_repo_creation, max_org_creation, created_at, updated_at
		FROM users WHERE email = ? COLLATE NOCASE
	`, strings.TrimSpace(email)).Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.FullName, &u.AvatarURL, &u.IsAdmin, &u.IsActive, &u.CanDownload, &u.Location, &u.Website, &u.Bio, &u.MaxRepoCreation, &u.MaxOrgCreation, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return u, nil
}

func CountUsers() (int, error) {
	var count int
	err := DB.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&count)
	return count, err
}

func ListUsers(limit, offset int) ([]*User, error) {
	rows, err := DB.Query(`
		SELECT u.id, u.username, u.email, u.full_name, u.avatar_url, u.is_admin, u.is_active, u.can_download, u.location, u.website, u.bio, u.max_repo_creation, u.max_org_creation, u.created_at, u.updated_at,
		       (SELECT COUNT(*) FROM repositories r WHERE r.owner_id = u.id) AS num_repos,
		       (SELECT COUNT(*) FROM org_members om WHERE om.user_id = u.id AND om.role = 'owner') AS num_orgs
		FROM users u ORDER BY u.id ASC LIMIT ? OFFSET ?
	`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*User
	for rows.Next() {
		u := &User{}
		if err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.FullName, &u.AvatarURL, &u.IsAdmin, &u.IsActive, &u.CanDownload, &u.Location, &u.Website, &u.Bio, &u.MaxRepoCreation, &u.MaxOrgCreation, &u.CreatedAt, &u.UpdatedAt, &u.NumRepos, &u.NumOrgs); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

func SearchUsersAdmin(query string, limit, offset int) ([]*User, error) {
	if limit <= 0 {
		limit = 100
	}
	if limit > 500 {
		limit = 500
	}
	if offset < 0 {
		offset = 0
	}

	query = strings.TrimSpace(query)
	if query == "" {
		return ListUsers(limit, offset)
	}

	escaped := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(query)
	containsPattern := "%" + escaped + "%"
	prefixPattern := escaped + "%"

	rows, err := DB.Query(`
		SELECT u.id, u.username, u.email, u.full_name, u.avatar_url, u.is_admin, u.is_active, u.can_download, u.location, u.website, u.bio, u.max_repo_creation, u.max_org_creation, u.created_at, u.updated_at,
		       (SELECT COUNT(*) FROM repositories r WHERE r.owner_id = u.id) AS num_repos,
		       (SELECT COUNT(*) FROM org_members om WHERE om.user_id = u.id AND om.role = 'owner') AS num_orgs
		FROM users u
		WHERE u.username LIKE ? ESCAPE '\' COLLATE NOCASE
		   OR u.email LIKE ? ESCAPE '\' COLLATE NOCASE
		   OR u.full_name LIKE ? ESCAPE '\' COLLATE NOCASE
		ORDER BY CASE
			WHEN LOWER(u.username) = LOWER(?) THEN 0
			WHEN u.username LIKE ? ESCAPE '\' COLLATE NOCASE THEN 1
			ELSE 2
		END, u.id ASC
		LIMIT ? OFFSET ?
	`, containsPattern, containsPattern, containsPattern, query, prefixPattern, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := make([]*User, 0)
	for rows.Next() {
		u := &User{}
		if err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.FullName, &u.AvatarURL, &u.IsAdmin, &u.IsActive, &u.CanDownload, &u.Location, &u.Website, &u.Bio, &u.MaxRepoCreation, &u.MaxOrgCreation, &u.CreatedAt, &u.UpdatedAt, &u.NumRepos, &u.NumOrgs); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

func UpdateUserLimits(userID int64, maxRepoCreation, maxOrgCreation *int) error {
	if maxRepoCreation != nil && maxOrgCreation != nil {
		_, err := DB.Exec(`UPDATE users SET max_repo_creation = ?, max_org_creation = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, *maxRepoCreation, *maxOrgCreation, userID)
		return err
	} else if maxRepoCreation != nil {
		_, err := DB.Exec(`UPDATE users SET max_repo_creation = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, *maxRepoCreation, userID)
		return err
	} else if maxOrgCreation != nil {
		_, err := DB.Exec(`UPDATE users SET max_org_creation = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, *maxOrgCreation, userID)
		return err
	}
	return nil
}

func UpdateOrgLimits(orgID int64, maxRepoCreation int) error {
	_, err := DB.Exec(`UPDATE organizations SET max_repo_creation = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, maxRepoCreation, orgID)
	return err
}

func CountUserRepositories(ownerID int64) (int, error) {
	var count int
	err := DB.QueryRow(`SELECT COUNT(*) FROM repositories WHERE owner_id = ?`, ownerID).Scan(&count)
	return count, err
}

func CountUserOwnedOrgs(userID int64) (int, error) {
	var count int
	err := DB.QueryRow(`SELECT COUNT(*) FROM org_members WHERE user_id = ? AND role = 'owner'`, userID).Scan(&count)
	return count, err
}

func UpdateUserAdmin(userID int64, isAdmin bool) error {
	_, err := DB.Exec(`UPDATE users SET is_admin = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, isAdmin, userID)
	return err
}

func UpdateUserStatus(userID int64, isActive bool) error {
	_, err := DB.Exec(`UPDATE users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, isActive, userID)
	return err
}

func UpdateUserDownload(userID int64, canDownload bool) error {
	_, err := DB.Exec(`UPDATE users SET can_download = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, canDownload, userID)
	return err
}

func UpdateUserProfile(userID int64, fullName, email, bio, location, website, avatarURL string) (*User, error) {
	email = strings.TrimSpace(email)
	if email != "" {
		var existingID int64
		err := DB.QueryRow(`SELECT id FROM users WHERE email = ? AND id != ?`, email, userID).Scan(&existingID)
		if err == nil {
			return nil, fmt.Errorf("email '%s' is already in use", email)
		}
	}
	_, err := DB.Exec(`
		UPDATE users
		SET full_name = ?,
		    email = CASE WHEN ? != '' THEN ? ELSE email END,
		    bio = ?,
		    location = ?,
		    website = ?,
		    avatar_url = ?,
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, fullName, email, email, bio, location, website, avatarURL, userID)
	if err != nil {
		return nil, err
	}
	return GetUserByID(userID)
}

func UpdateUserPasswordHash(userID int64, newHash string) error {
	_, err := DB.Exec(`UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, newHash, userID)
	return err
}

func DeleteUser(userID int64) error {
	repos, _ := ListUserRepositories(userID, true)
	for _, r := range repos {
		_ = DeleteRepository(r.ID)
	}
	_, _ = DB.Exec(`DELETE FROM access_tokens WHERE user_id = ?`, userID)
	_, _ = DB.Exec(`DELETE FROM ssh_keys WHERE user_id = ?`, userID)
	_, _ = DB.Exec(`DELETE FROM stars WHERE user_id = ?`, userID)
	_, _ = DB.Exec(`DELETE FROM follows WHERE follower_id = ? OR following_id = ?`, userID, userID)
	_, _ = DB.Exec(`DELETE FROM activities WHERE user_id = ?`, userID)
	_, err := DB.Exec(`DELETE FROM users WHERE id = ?`, userID)
	return err
}

func CheckpointWAL() error {
	_, err := DB.Exec(`PRAGMA wal_checkpoint(TRUNCATE)`)
	return err
}

func VacuumDB() error {
	_, err := DB.Exec(`VACUUM`)
	return err
}

// Access Token Methods

func HashToken(rawToken string) string {
	h := sha256.Sum256([]byte(rawToken))
	return hex.EncodeToString(h[:])
}

func CreateAccessToken(userID int64, name, rawToken, scopes string) (*AccessToken, error) {
	tokenHash := HashToken(rawToken)
	prefix := ""
	if len(rawToken) >= 8 {
		prefix = rawToken[:8]
	}

	res, err := DB.Exec(`
		INSERT INTO access_tokens (user_id, name, token_hash, token_prefix, scopes)
		VALUES (?, ?, ?, ?, ?)
	`, userID, name, tokenHash, prefix, scopes)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return &AccessToken{
		ID:          id,
		UserID:      userID,
		Name:        name,
		TokenHash:   tokenHash,
		TokenPrefix: prefix,
		Scopes:      scopes,
		CreatedAt:   time.Now(),
	}, nil
}

func GetUserByAccessToken(rawToken string) (*User, error) {
	tokenHash := HashToken(rawToken)
	var userID int64
	err := DB.QueryRow(`
		SELECT user_id FROM access_tokens WHERE token_hash = ?
	`, tokenHash).Scan(&userID)
	if err != nil {
		return nil, err
	}

	_, _ = DB.Exec(`UPDATE access_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE token_hash = ?`, tokenHash)
	return GetUserByID(userID)
}

func ListAccessTokensByUserID(userID int64) ([]*AccessToken, error) {
	rows, err := DB.Query(`
		SELECT id, user_id, name, token_prefix, scopes, created_at, last_used_at
		FROM access_tokens WHERE user_id = ? ORDER BY id DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []*AccessToken{}
	for rows.Next() {
		t := &AccessToken{}
		if err := rows.Scan(&t.ID, &t.UserID, &t.Name, &t.TokenPrefix, &t.Scopes, &t.CreatedAt, &t.LastUsedAt); err != nil {
			return nil, err
		}
		list = append(list, t)
	}
	return list, rows.Err()
}

func DeleteAccessToken(userID, tokenID int64) error {
	_, err := DB.Exec(`DELETE FROM access_tokens WHERE id = ? AND user_id = ?`, tokenID, userID)
	return err
}

// SSH Key Methods

func CreateSSHKey(userID int64, title, fingerprint, publicKey string) (*SSHKey, error) {
	res, err := DB.Exec(`
		INSERT INTO ssh_keys (user_id, title, fingerprint, public_key)
		VALUES (?, ?, ?, ?)
	`, userID, title, fingerprint, publicKey)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return &SSHKey{
		ID:          id,
		UserID:      userID,
		Title:       title,
		Fingerprint: fingerprint,
		PublicKey:   publicKey,
		CreatedAt:   time.Now(),
	}, nil
}

func GetSSHKeyByFingerprint(fingerprint string) (*SSHKey, *User, error) {
	k := &SSHKey{}
	var userID int64
	err := DB.QueryRow(`
		SELECT id, user_id, title, fingerprint, public_key, created_at
		FROM ssh_keys WHERE fingerprint = ?
	`, fingerprint).Scan(&k.ID, &userID, &k.Title, &k.Fingerprint, &k.PublicKey, &k.CreatedAt)
	if err != nil {
		return nil, nil, err
	}
	u, err := GetUserByID(userID)
	return k, u, err
}

func ListSSHKeysByUserID(userID int64) ([]*SSHKey, error) {
	rows, err := DB.Query(`
		SELECT id, user_id, title, fingerprint, public_key, created_at
		FROM ssh_keys WHERE user_id = ? ORDER BY id DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []*SSHKey{}
	for rows.Next() {
		k := &SSHKey{}
		if err := rows.Scan(&k.ID, &k.UserID, &k.Title, &k.Fingerprint, &k.PublicKey, &k.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, k)
	}
	return list, rows.Err()
}

func DeleteSSHKey(userID, keyID int64) error {
	_, err := DB.Exec(`DELETE FROM ssh_keys WHERE id = ? AND user_id = ?`, keyID, userID)
	return err
}

// Repository Methods

func CreateRepository(ownerID int64, name, description string, isPrivate bool) (*Repository, error) {
	return CreateRepositoryWithDefaultBranch(ownerID, name, description, isPrivate, "main")
}

func CreateRepositoryWithDefaultBranch(ownerID int64, name, description string, isPrivate bool, defaultBranch string) (*Repository, error) {
	name = strings.TrimSpace(name)
	defaultBranch = strings.TrimSpace(defaultBranch)
	if defaultBranch == "" {
		defaultBranch = "main"
	}
	res, err := DB.Exec(`
		INSERT INTO repositories (owner_id, name, description, is_private, default_branch, enable_wiki, enable_pages, pages_branch, pages_folder, allow_download_and_pulls)
		VALUES (?, ?, ?, ?, ?, 1, 0, ?, '/', 1)
	`, ownerID, name, description, isPrivate, defaultBranch, defaultBranch)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return GetRepositoryByID(id)
}

func GetRepositoryByID(id int64) (*Repository, error) {
	r := &Repository{}
	err := DB.QueryRow(`
		SELECT r.id, r.owner_id, u.username, r.name, r.description, r.is_private, r.is_fork, r.fork_parent_id,
		       r.default_branch, r.num_stars, r.num_forks, r.num_watches, r.num_issues, r.num_pulls, r.size_bytes, r.is_archived,
		       r.enable_wiki, r.enable_pages, r.pages_branch, r.pages_folder, r.allow_download_and_pulls, r.created_at, r.updated_at
		FROM repositories r
		JOIN users u ON u.id = r.owner_id
		WHERE r.id = ?
	`, id).Scan(&r.ID, &r.OwnerID, &r.OwnerName, &r.Name, &r.Description, &r.IsPrivate, &r.IsFork, &r.ForkParentID,
		&r.DefaultBranch, &r.NumStars, &r.NumForks, &r.NumWatches, &r.NumIssues, &r.NumPulls, &r.SizeBytes, &r.IsArchived,
		&r.EnableWiki, &r.EnablePages, &r.PagesBranch, &r.PagesFolder, &r.AllowDownloadAndPulls, &r.CreatedAt, &r.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if r.IsFork && r.ForkParentID != nil {
		parent := &Repository{}
		if err := DB.QueryRow(`
			SELECT r.id, r.owner_id, u.username, r.name, r.description, r.is_private, r.default_branch
			FROM repositories r
			JOIN users u ON u.id = r.owner_id
			WHERE r.id = ?
		`, *r.ForkParentID).Scan(&parent.ID, &parent.OwnerID, &parent.OwnerName, &parent.Name, &parent.Description, &parent.IsPrivate, &parent.DefaultBranch); err == nil {
			r.ForkParent = parent
		}
	}
	return r, nil
}

func GetRepositoryByName(ownerUsername, repoName string) (*Repository, error) {
	r := &Repository{}
	err := DB.QueryRow(`
		SELECT r.id, r.owner_id, u.username, r.name, r.description, r.is_private, r.is_fork, r.fork_parent_id,
		       r.default_branch, r.num_stars, r.num_forks, r.num_watches, r.num_issues, r.num_pulls, r.size_bytes, r.is_archived,
		       r.enable_wiki, r.enable_pages, r.pages_branch, r.pages_folder, r.allow_download_and_pulls, r.created_at, r.updated_at
		FROM repositories r
		JOIN users u ON u.id = r.owner_id
		WHERE u.username = ? COLLATE NOCASE AND r.name = ? COLLATE NOCASE
	`, strings.TrimSpace(ownerUsername), strings.TrimSpace(repoName)).Scan(&r.ID, &r.OwnerID, &r.OwnerName, &r.Name, &r.Description, &r.IsPrivate, &r.IsFork, &r.ForkParentID,
		&r.DefaultBranch, &r.NumStars, &r.NumForks, &r.NumWatches, &r.NumIssues, &r.NumPulls, &r.SizeBytes, &r.IsArchived,
		&r.EnableWiki, &r.EnablePages, &r.PagesBranch, &r.PagesFolder, &r.AllowDownloadAndPulls, &r.CreatedAt, &r.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if r.IsFork && r.ForkParentID != nil {
		parent := &Repository{}
		if err := DB.QueryRow(`
			SELECT r.id, r.owner_id, u.username, r.name, r.description, r.is_private, r.default_branch
			FROM repositories r
			JOIN users u ON u.id = r.owner_id
			WHERE r.id = ?
		`, *r.ForkParentID).Scan(&parent.ID, &parent.OwnerID, &parent.OwnerName, &parent.Name, &parent.Description, &parent.IsPrivate, &parent.DefaultBranch); err == nil {
			r.ForkParent = parent
		}
	}
	return r, nil
}

func ForkRepository(parentRepo *Repository, newOwnerID int64, newRepoName string) (*Repository, error) {
	newRepoName = strings.TrimSpace(newRepoName)
	if newRepoName == "" {
		newRepoName = parentRepo.Name
	}

	var count int
	_ = DB.QueryRow(`SELECT COUNT(*) FROM repositories WHERE owner_id = ? AND name = ? COLLATE NOCASE`, newOwnerID, newRepoName).Scan(&count)
	if count > 0 {
		return nil, fmt.Errorf("a repository named '%s' already exists for this owner", newRepoName)
	}

	res, err := DB.Exec(`
		INSERT INTO repositories (owner_id, name, description, is_private, is_fork, fork_parent_id, default_branch, enable_wiki, enable_pages, pages_branch, pages_folder, allow_download_and_pulls)
		VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
	`, newOwnerID, newRepoName, parentRepo.Description, parentRepo.IsPrivate, parentRepo.ID, parentRepo.DefaultBranch, parentRepo.EnableWiki, parentRepo.EnablePages, parentRepo.PagesBranch, parentRepo.PagesFolder, parentRepo.AllowDownloadAndPulls)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()

	// Increment parent forks counter
	_, _ = DB.Exec(`UPDATE repositories SET num_forks = num_forks + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, parentRepo.ID)

	return GetRepositoryByID(id)
}

func GetForks(parentRepoID int64) ([]*Repository, error) {
	rows, err := DB.Query(`
		SELECT r.id, r.owner_id, u.username, r.name, r.description, r.is_private, r.is_fork, r.fork_parent_id,
		       r.default_branch, r.num_stars, r.num_forks, r.num_watches, r.num_issues, r.num_pulls, r.size_bytes, r.is_archived,
		       r.enable_wiki, r.enable_pages, r.pages_branch, r.pages_folder, r.allow_download_and_pulls, r.created_at, r.updated_at
		FROM repositories r
		JOIN users u ON u.id = r.owner_id
		WHERE r.fork_parent_id = ?
		ORDER BY r.created_at DESC
	`, parentRepoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var forks []*Repository
	for rows.Next() {
		r := &Repository{}
		if err := rows.Scan(&r.ID, &r.OwnerID, &r.OwnerName, &r.Name, &r.Description, &r.IsPrivate, &r.IsFork, &r.ForkParentID,
			&r.DefaultBranch, &r.NumStars, &r.NumForks, &r.NumWatches, &r.NumIssues, &r.NumPulls, &r.SizeBytes, &r.IsArchived,
			&r.EnableWiki, &r.EnablePages, &r.PagesBranch, &r.PagesFolder, &r.AllowDownloadAndPulls, &r.CreatedAt, &r.UpdatedAt); err == nil {
			forks = append(forks, r)
		}
	}
	return forks, nil
}

func ListRepositories(limit, offset int, publicOnly bool) ([]*Repository, error) {
	query := `
		SELECT r.id, r.owner_id, u.username, r.name, r.description, r.is_private, r.is_fork, r.fork_parent_id,
		       r.default_branch, r.num_stars, r.num_forks, r.num_watches, r.num_issues, r.num_pulls, r.size_bytes, r.is_archived,
		       r.enable_wiki, r.enable_pages, r.pages_branch, r.pages_folder, r.allow_download_and_pulls, r.created_at, r.updated_at
		FROM repositories r
		JOIN users u ON u.id = r.owner_id
	`
	if publicOnly {
		query += ` WHERE r.is_private = 0 `
	}
	query += ` ORDER BY r.updated_at DESC LIMIT ? OFFSET ? `

	rows, err := DB.Query(query, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []*Repository
	for rows.Next() {
		r := &Repository{}
		if err := rows.Scan(&r.ID, &r.OwnerID, &r.OwnerName, &r.Name, &r.Description, &r.IsPrivate, &r.IsFork, &r.ForkParentID,
			&r.DefaultBranch, &r.NumStars, &r.NumForks, &r.NumWatches, &r.NumIssues, &r.NumPulls, &r.SizeBytes, &r.IsArchived,
			&r.EnableWiki, &r.EnablePages, &r.PagesBranch, &r.PagesFolder, &r.AllowDownloadAndPulls, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, r)
	}
	return list, rows.Err()
}

// SearchRepositories queries repositories matching a keyword across name, description, and owner username,
// enforcing visibility rules based on the authenticated user.
func SearchRepositories(keyword string, userID int64, isAdmin bool, limit, offset int) ([]*Repository, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	keyword = strings.TrimSpace(keyword)
	param := "%" + keyword + "%"

	baseQuery := `
		SELECT r.id, r.owner_id, u.username, r.name, r.description, r.is_private, r.is_fork, r.fork_parent_id,
		       r.default_branch, r.num_stars, r.num_forks, r.num_watches, r.num_issues, r.num_pulls, r.size_bytes, r.is_archived,
		       r.enable_wiki, r.enable_pages, r.pages_branch, r.pages_folder, r.allow_download_and_pulls, r.created_at, r.updated_at
		FROM repositories r
		JOIN users u ON u.id = r.owner_id
	`
	var whereClauses []string
	var args []any

	if !isAdmin {
		if userID > 0 {
			whereClauses = append(whereClauses, `(
				r.is_private = 0 
				OR r.owner_id = ?
				OR EXISTS (SELECT 1 FROM collaborators c WHERE c.repo_id = r.id AND c.user_id = ?)
				OR EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = r.owner_id AND om.user_id = ?)
			)`)
			args = append(args, userID, userID, userID)
		} else {
			whereClauses = append(whereClauses, "r.is_private = 0")
		}
	}

	if keyword != "" && keyword != "/" {
		whereClauses = append(whereClauses, "(r.name LIKE ? OR r.description LIKE ? OR u.username LIKE ? OR (u.username || '/' || r.name) LIKE ?)")
		args = append(args, param, param, param, param)
	}

	query := baseQuery
	if len(whereClauses) > 0 {
		query += " WHERE " + strings.Join(whereClauses, " AND ")
	}
	query += " ORDER BY r.num_stars DESC, r.updated_at DESC LIMIT ? OFFSET ?"
	args = append(args, limit, offset)

	rows, err := DB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []*Repository
	for rows.Next() {
		r := &Repository{}
		if err := rows.Scan(&r.ID, &r.OwnerID, &r.OwnerName, &r.Name, &r.Description, &r.IsPrivate, &r.IsFork, &r.ForkParentID,
			&r.DefaultBranch, &r.NumStars, &r.NumForks, &r.NumWatches, &r.NumIssues, &r.NumPulls, &r.SizeBytes, &r.IsArchived,
			&r.EnableWiki, &r.EnablePages, &r.PagesBranch, &r.PagesFolder, &r.AllowDownloadAndPulls, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, r)
	}
	if list == nil {
		list = []*Repository{}
	}
	return list, rows.Err()
}

// CountSearchRepositories counts total repositories matching search criteria and visibility rules.
func CountSearchRepositories(keyword string, userID int64, isAdmin bool) (int, error) {
	keyword = strings.TrimSpace(keyword)
	param := "%" + keyword + "%"

	baseQuery := `
		SELECT COUNT(*)
		FROM repositories r
		JOIN users u ON u.id = r.owner_id
	`
	var whereClauses []string
	var args []any

	if !isAdmin {
		if userID > 0 {
			whereClauses = append(whereClauses, `(
				r.is_private = 0 
				OR r.owner_id = ?
				OR EXISTS (SELECT 1 FROM collaborators c WHERE c.repo_id = r.id AND c.user_id = ?)
				OR EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = r.owner_id AND om.user_id = ?)
			)`)
			args = append(args, userID, userID, userID)
		} else {
			whereClauses = append(whereClauses, "r.is_private = 0")
		}
	}

	if keyword != "" && keyword != "/" {
		whereClauses = append(whereClauses, "(r.name LIKE ? OR r.description LIKE ? OR u.username LIKE ? OR (u.username || '/' || r.name) LIKE ?)")
		args = append(args, param, param, param, param)
	}

	query := baseQuery
	if len(whereClauses) > 0 {
		query += " WHERE " + strings.Join(whereClauses, " AND ")
	}

	var count int
	err := DB.QueryRow(query, args...).Scan(&count)
	return count, err
}

func ListUserRepositories(userID int64, includePrivate bool) ([]*Repository, error) {
	query := `
		SELECT r.id, r.owner_id, u.username, r.name, r.description, r.is_private, r.is_fork, r.fork_parent_id,
		       r.default_branch, r.num_stars, r.num_forks, r.num_watches, r.num_issues, r.num_pulls, r.size_bytes, r.is_archived,
		       r.enable_wiki, r.enable_pages, r.pages_branch, r.pages_folder, r.allow_download_and_pulls, r.created_at, r.updated_at
		FROM repositories r
		JOIN users u ON u.id = r.owner_id
		WHERE r.owner_id = ?
	`
	if !includePrivate {
		query += ` AND r.is_private = 0 `
	}
	query += ` ORDER BY r.updated_at DESC `

	rows, err := DB.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []*Repository
	for rows.Next() {
		r := &Repository{}
		if err := rows.Scan(&r.ID, &r.OwnerID, &r.OwnerName, &r.Name, &r.Description, &r.IsPrivate, &r.IsFork, &r.ForkParentID,
			&r.DefaultBranch, &r.NumStars, &r.NumForks, &r.NumWatches, &r.NumIssues, &r.NumPulls, &r.SizeBytes, &r.IsArchived,
			&r.EnableWiki, &r.EnablePages, &r.PagesBranch, &r.PagesFolder, &r.AllowDownloadAndPulls, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, r)
	}
	return list, rows.Err()
}

func UpdateRepositorySettings(repoID int64, description string, isPrivate, enableWiki, enablePages bool, pagesBranch, pagesFolder string, allowDownloadAndPulls bool) error {
	if pagesBranch == "" {
		pagesBranch = "gh-pages"
	}
	if pagesFolder == "" {
		pagesFolder = "/"
	}
	_, err := DB.Exec(`
		UPDATE repositories 
		SET description = ?, is_private = ?, enable_wiki = ?, enable_pages = ?, pages_branch = ?, pages_folder = ?, allow_download_and_pulls = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, description, isPrivate, enableWiki, enablePages, pagesBranch, pagesFolder, allowDownloadAndPulls, repoID)
	return err
}

func SetRepositoryDefaultBranch(repoID int64, defaultBranch string) error {
	defaultBranch = strings.TrimSpace(defaultBranch)
	if defaultBranch == "" {
		defaultBranch = "main"
	}
	_, err := DB.Exec(`
		UPDATE repositories 
		SET default_branch = ?, pages_branch = CASE WHEN enable_pages = 0 AND (pages_branch = 'main' OR pages_branch = 'master') THEN ? ELSE pages_branch END, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, defaultBranch, defaultBranch, repoID)
	return err
}

func CountRepositories() (int, error) {
	var count int
	err := DB.QueryRow(`SELECT COUNT(*) FROM repositories`).Scan(&count)
	return count, err
}

// SearchReposAdmin searches repositories globally for administrators with optional visibility/archive filtering.
func SearchReposAdmin(query, visibility string, limit, offset int) ([]*Repository, error) {
	if limit <= 0 {
		limit = 100
	}
	if limit > 500 {
		limit = 500
	}
	if offset < 0 {
		offset = 0
	}

	query = strings.TrimSpace(query)
	visibility = strings.ToLower(strings.TrimSpace(visibility))

	baseQuery := `
		SELECT r.id, r.owner_id, u.username, r.name, r.description, r.is_private, r.is_fork, r.fork_parent_id,
		       r.default_branch, r.num_stars, r.num_forks, r.num_watches, r.num_issues, r.num_pulls, r.size_bytes, r.is_archived,
		       r.enable_wiki, r.enable_pages, r.pages_branch, r.pages_folder, r.allow_download_and_pulls, r.created_at, r.updated_at
		FROM repositories r
		JOIN users u ON u.id = r.owner_id
	`

	var whereClauses []string
	var args []any

	switch visibility {
	case "public":
		whereClauses = append(whereClauses, "r.is_private = ?")
		args = append(args, false)
	case "private":
		whereClauses = append(whereClauses, "r.is_private = ?")
		args = append(args, true)
	case "archived":
		whereClauses = append(whereClauses, "r.is_archived = ?")
		args = append(args, true)
	case "active":
		whereClauses = append(whereClauses, "r.is_archived = ?")
		args = append(args, false)
	}

	var orderBy string
	if query != "" && query != "/" {
		escaped := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(query)
		containsPattern := "%" + escaped + "%"
		prefixPattern := escaped + "%"
		whereClauses = append(whereClauses, `(
			LOWER(r.name) LIKE LOWER(?) ESCAPE '\'
			OR LOWER(r.description) LIKE LOWER(?) ESCAPE '\'
			OR LOWER(u.username) LIKE LOWER(?) ESCAPE '\'
			OR LOWER(u.username || '/' || r.name) LIKE LOWER(?) ESCAPE '\'
			OR LOWER(r.default_branch) LIKE LOWER(?) ESCAPE '\'
		)`)
		args = append(args, containsPattern, containsPattern, containsPattern, containsPattern, containsPattern)
		orderBy = ` ORDER BY CASE
			WHEN LOWER(u.username || '/' || r.name) = LOWER(?) THEN 0
			WHEN LOWER(r.name) = LOWER(?) THEN 1
			WHEN LOWER(r.name) LIKE LOWER(?) ESCAPE '\' THEN 2
			ELSE 3
		END, r.updated_at DESC, r.id DESC`
		args = append(args, query, query, prefixPattern)
	} else {
		orderBy = " ORDER BY r.updated_at DESC, r.id DESC"
	}

	fullQuery := baseQuery
	if len(whereClauses) > 0 {
		fullQuery += " WHERE " + strings.Join(whereClauses, " AND ")
	}
	fullQuery += orderBy + " LIMIT ? OFFSET ?"
	args = append(args, limit, offset)

	rows, err := DB.Query(fullQuery, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]*Repository, 0)
	for rows.Next() {
		r := &Repository{}
		if err := rows.Scan(&r.ID, &r.OwnerID, &r.OwnerName, &r.Name, &r.Description, &r.IsPrivate, &r.IsFork, &r.ForkParentID,
			&r.DefaultBranch, &r.NumStars, &r.NumForks, &r.NumWatches, &r.NumIssues, &r.NumPulls, &r.SizeBytes, &r.IsArchived,
			&r.EnableWiki, &r.EnablePages, &r.PagesBranch, &r.PagesFolder, &r.AllowDownloadAndPulls, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, r)
	}
	return list, rows.Err()
}

// AdminRepoSummary holds aggregated database breakdowns for the Git Management Dashboard.
type AdminRepoSummary struct {
	TotalRepos    int `json:"total_repos"`
	PublicRepos   int `json:"public_repos"`
	PrivateRepos  int `json:"private_repos"`
	ArchivedRepos int `json:"archived_repos"`
	ForkRepos     int `json:"fork_repos"`
	WikiRepos     int `json:"wiki_repos"`
}

// GetAdminRepoSummary returns repository breakdowns across visibility, archive, fork, and wiki flags.
func GetAdminRepoSummary() (*AdminRepoSummary, error) {
	s := &AdminRepoSummary{}
	if err := DB.QueryRow(`SELECT COUNT(*) FROM repositories`).Scan(&s.TotalRepos); err != nil {
		return nil, err
	}
	_ = DB.QueryRow(`SELECT COUNT(*) FROM repositories WHERE is_private = ?`, false).Scan(&s.PublicRepos)
	_ = DB.QueryRow(`SELECT COUNT(*) FROM repositories WHERE is_private = ?`, true).Scan(&s.PrivateRepos)
	_ = DB.QueryRow(`SELECT COUNT(*) FROM repositories WHERE is_archived = ?`, true).Scan(&s.ArchivedRepos)
	_ = DB.QueryRow(`SELECT COUNT(*) FROM repositories WHERE is_fork = ?`, true).Scan(&s.ForkRepos)
	_ = DB.QueryRow(`SELECT COUNT(*) FROM repositories WHERE enable_wiki = ?`, true).Scan(&s.WikiRepos)
	return s, nil
}

// ListReposForGitScan returns lightweight repository metadata ordered by most recently updated for admin disk telemetry.
func ListReposForGitScan(limit int) ([]*Repository, error) {
	if limit <= 0 {
		limit = 2000
	}
	rows, err := DB.Query(`
		SELECT r.id, r.owner_id, u.username, r.name, r.description, r.is_private, r.is_fork, r.fork_parent_id,
		       r.default_branch, r.num_stars, r.num_forks, r.num_watches, r.num_issues, r.num_pulls, r.size_bytes, r.is_archived,
		       r.enable_wiki, r.enable_pages, r.pages_branch, r.pages_folder, r.allow_download_and_pulls, r.created_at, r.updated_at
		FROM repositories r
		JOIN users u ON u.id = r.owner_id
		ORDER BY r.updated_at DESC, r.id DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]*Repository, 0)
	for rows.Next() {
		r := &Repository{}
		if err := rows.Scan(&r.ID, &r.OwnerID, &r.OwnerName, &r.Name, &r.Description, &r.IsPrivate, &r.IsFork, &r.ForkParentID,
			&r.DefaultBranch, &r.NumStars, &r.NumForks, &r.NumWatches, &r.NumIssues, &r.NumPulls, &r.SizeBytes, &r.IsArchived,
			&r.EnableWiki, &r.EnablePages, &r.PagesBranch, &r.PagesFolder, &r.AllowDownloadAndPulls, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, r)
	}
	return list, rows.Err()
}

// UpdateRepoSizeBytes persists the calculated bare repository disk size (without bumping updated_at).
func UpdateRepoSizeBytes(repoID int64, sizeBytes int64) error {
	_, err := DB.Exec(`UPDATE repositories SET size_bytes = ? WHERE id = ?`, sizeBytes, repoID)
	return err
}

func DeleteRepository(repoID int64) error {
	_, err := DB.Exec(`DELETE FROM repositories WHERE id = ?`, repoID)
	return err
}

// UpdateRepoVisibility toggles repository public/private visibility.
func UpdateRepoVisibility(repoID int64, isPrivate bool) error {
	_, err := DB.Exec(`
		UPDATE repositories 
		SET is_private = ?, updated_at = CURRENT_TIMESTAMP 
		WHERE id = ?
	`, isPrivate, repoID)
	return err
}

// ToggleRepoArchive toggles repository archived (read-only) status.
func ToggleRepoArchive(repoID int64, archive bool) error {
	_, err := DB.Exec(`
		UPDATE repositories 
		SET is_archived = ?, updated_at = CURRENT_TIMESTAMP 
		WHERE id = ?
	`, archive, repoID)
	return err
}

// TransferRepository safely moves repository files on disk and transfers ownership in the database.
func TransferRepository(repoID int64, newOwnerID int64, newOwnerName string, repoRoot string) (*Repository, error) {
	repo, err := GetRepositoryByID(repoID)
	if err != nil {
		return nil, fmt.Errorf("repository not found: %w", err)
	}
	oldOwnerName := repo.OwnerName
	repoName := repo.Name

	if strings.EqualFold(oldOwnerName, newOwnerName) {
		return nil, fmt.Errorf("repository is already owned by %s", newOwnerName)
	}

	// Verify new owner does not already have a repository with this name
	var existingID int64
	err = DB.QueryRow(`SELECT id FROM repositories WHERE owner_id = ? AND name = ? COLLATE NOCASE`, newOwnerID, repoName).Scan(&existingID)
	if err == nil {
		return nil, fmt.Errorf("a repository named '%s' already exists for %s", repoName, newOwnerName)
	}

	// Paths on disk
	oldRepoDir := filepath.Join(repoRoot, oldOwnerName, repoName+".git")
	newRepoDir := filepath.Join(repoRoot, newOwnerName, repoName+".git")
	oldWikiDir := filepath.Join(repoRoot, oldOwnerName, repoName+".wiki.git")
	newWikiDir := filepath.Join(repoRoot, newOwnerName, repoName+".wiki.git")

	if err := os.MkdirAll(filepath.Dir(newRepoDir), 0755); err != nil {
		return nil, fmt.Errorf("failed to create destination directory: %w", err)
	}

	if _, err := os.Stat(newRepoDir); err == nil {
		return nil, fmt.Errorf("destination repository path '%s' already exists on disk", newRepoDir)
	}

	// Move git repository directory
	movedRepo := false
	if _, err := os.Stat(oldRepoDir); err == nil {
		if err := os.Rename(oldRepoDir, newRepoDir); err != nil {
			return nil, fmt.Errorf("failed to move repository directory: %w", err)
		}
		movedRepo = true
	}

	// Move wiki repo directory if exists
	movedWiki := false
	if _, err := os.Stat(oldWikiDir); err == nil {
		if err := os.Rename(oldWikiDir, newWikiDir); err == nil {
			movedWiki = true
		}
	}

	// Update owner in database
	_, err = DB.Exec(`
		UPDATE repositories 
		SET owner_id = ?, updated_at = CURRENT_TIMESTAMP 
		WHERE id = ?
	`, newOwnerID, repoID)
	if err != nil {
		// Roll back disk moves if DB update fails
		if movedRepo {
			_ = os.Rename(newRepoDir, oldRepoDir)
		}
		if movedWiki {
			_ = os.Rename(newWikiDir, oldWikiDir)
		}
		return nil, fmt.Errorf("failed to update repository owner in database: %w", err)
	}

	// Clean up any collaborator records for the new owner so they become the legitimate owner
	_, _ = DB.Exec(`DELETE FROM collaborators WHERE repo_id = ? AND user_id = ?`, repoID, newOwnerID)

	return GetRepositoryByID(repoID)
}

func ToggleStar(userID, repoID int64) (bool, error) {
	var exists int
	err := DB.QueryRow(`SELECT COUNT(*) FROM stars WHERE user_id = ? AND repo_id = ?`, userID, repoID).Scan(&exists)
	if err != nil {
		return false, err
	}

	if exists > 0 {
		_, _ = DB.Exec(`DELETE FROM stars WHERE user_id = ? AND repo_id = ?`, userID, repoID)
		_, _ = DB.Exec(`UPDATE repositories SET num_stars = MAX(0, num_stars - 1) WHERE id = ?`, repoID)
		return false, nil
	} else {
		_, _ = DB.Exec(`INSERT INTO stars (user_id, repo_id) VALUES (?, ?)`, userID, repoID)
		_, _ = DB.Exec(`UPDATE repositories SET num_stars = num_stars + 1 WHERE id = ?`, repoID)
		return true, nil
	}
}

func HasStarred(userID, repoID int64) bool {
	var exists int
	_ = DB.QueryRow(`SELECT COUNT(*) FROM stars WHERE user_id = ? AND repo_id = ?`, userID, repoID).Scan(&exists)
	return exists > 0
}

func ListStarredRepositories(userID int64) ([]*Repository, error) {
	query := `
		SELECT r.id, r.owner_id, u.username, r.name, r.description, r.is_private, r.is_fork, r.fork_parent_id,
		       r.default_branch, r.num_stars, r.num_forks, r.num_watches, r.num_issues, r.num_pulls, r.size_bytes, r.is_archived,
		       r.enable_wiki, r.enable_pages, r.pages_branch, r.pages_folder, r.allow_download_and_pulls, r.created_at, r.updated_at
		FROM repositories r
		JOIN users u ON u.id = r.owner_id
		JOIN stars s ON s.repo_id = r.id
		WHERE s.user_id = ?
		ORDER BY s.created_at DESC
	`
	rows, err := DB.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []*Repository{}
	for rows.Next() {
		r := &Repository{}
		if err := rows.Scan(
			&r.ID, &r.OwnerID, &r.OwnerName, &r.Name, &r.Description, &r.IsPrivate, &r.IsFork, &r.ForkParentID,
			&r.DefaultBranch, &r.NumStars, &r.NumForks, &r.NumWatches, &r.NumIssues, &r.NumPulls, &r.SizeBytes, &r.IsArchived,
			&r.EnableWiki, &r.EnablePages, &r.PagesBranch, &r.PagesFolder, &r.AllowDownloadAndPulls, &r.CreatedAt, &r.UpdatedAt,
		); err != nil {
			return nil, err
		}
		list = append(list, r)
	}
	return list, rows.Err()
}

// ============================================================================
// User Follow / Social Graph Functions
// ============================================================================

func FollowUser(followerID, followingID int64) error {
	if followerID == followingID {
		return fmt.Errorf("cannot follow yourself")
	}
	_, err := DB.Exec(`INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)`, followerID, followingID)
	return err
}

func UnfollowUser(followerID, followingID int64) error {
	_, err := DB.Exec(`DELETE FROM follows WHERE follower_id = ? AND following_id = ?`, followerID, followingID)
	return err
}

func IsFollowing(followerID, followingID int64) bool {
	if followerID == 0 || followingID == 0 || followerID == followingID {
		return false
	}
	var count int
	_ = DB.QueryRow(`SELECT COUNT(*) FROM follows WHERE follower_id = ? AND following_id = ?`, followerID, followingID).Scan(&count)
	return count > 0
}

func CountFollowers(userID int64) (int, error) {
	var count int
	err := DB.QueryRow(`SELECT COUNT(*) FROM follows WHERE following_id = ?`, userID).Scan(&count)
	return count, err
}

func CountFollowing(userID int64) (int, error) {
	var count int
	err := DB.QueryRow(`SELECT COUNT(*) FROM follows WHERE follower_id = ?`, userID).Scan(&count)
	return count, err
}

func ListFollowers(userID int64, limit, offset int) ([]*User, error) {
	if limit <= 0 {
		limit = 50
	}
	query := `
		SELECT u.id, u.username, u.email, u.full_name, u.avatar_url, u.is_admin, u.is_active, u.can_download,
		       u.location, u.website, u.bio, u.max_repo_creation, u.max_org_creation, u.created_at, u.updated_at
		FROM users u
		JOIN follows f ON f.follower_id = u.id
		WHERE f.following_id = ?
		ORDER BY f.created_at DESC
		LIMIT ? OFFSET ?
	`
	rows, err := DB.Query(query, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*User
	for rows.Next() {
		var u User
		if err := rows.Scan(
			&u.ID, &u.Username, &u.Email, &u.FullName, &u.AvatarURL,
			&u.IsAdmin, &u.IsActive, &u.CanDownload, &u.Location, &u.Website, &u.Bio,
			&u.MaxRepoCreation, &u.MaxOrgCreation, &u.CreatedAt, &u.UpdatedAt,
		); err != nil {
			return nil, err
		}
		u.NumFollowers, _ = CountFollowers(u.ID)
		u.NumFollowing, _ = CountFollowing(u.ID)
		users = append(users, &u)
	}
	return users, nil
}

func ListFollowing(userID int64, limit, offset int) ([]*User, error) {
	if limit <= 0 {
		limit = 50
	}
	query := `
		SELECT u.id, u.username, u.email, u.full_name, u.avatar_url, u.is_admin, u.is_active, u.can_download,
		       u.location, u.website, u.bio, u.max_repo_creation, u.max_org_creation, u.created_at, u.updated_at
		FROM users u
		JOIN follows f ON f.following_id = u.id
		WHERE f.follower_id = ?
		ORDER BY f.created_at DESC
		LIMIT ? OFFSET ?
	`
	rows, err := DB.Query(query, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*User
	for rows.Next() {
		var u User
		if err := rows.Scan(
			&u.ID, &u.Username, &u.Email, &u.FullName, &u.AvatarURL,
			&u.IsAdmin, &u.IsActive, &u.CanDownload, &u.Location, &u.Website, &u.Bio,
			&u.MaxRepoCreation, &u.MaxOrgCreation, &u.CreatedAt, &u.UpdatedAt,
		); err != nil {
			return nil, err
		}
		u.NumFollowers, _ = CountFollowers(u.ID)
		u.NumFollowing, _ = CountFollowing(u.ID)
		users = append(users, &u)
	}
	return users, nil
}

func roleRank(role string) int {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "view_only":
		return 1
	case "read":
		return 2
	case "write":
		return 3
	case "admin":
		return 4
	default:
		return 0
	}
}

func IsValidRepoRole(role string) bool {
	return roleRank(role) > 0
}

func GetRepoPermissions(user *User, repo *Repository) RepoPermissions {
	var perms RepoPermissions
	if repo == nil {
		return perms
	}

	isSiteAdmin := user != nil && user.IsAdmin
	isOwner := user != nil && user.ID == repo.OwnerID

	maxRank := 0
	hasCollab := false
	if isSiteAdmin || isOwner {
		maxRank = 4
	} else if user != nil {
		// 1. Direct collaborator check
		var mode string
		if err := DB.QueryRow(`SELECT mode FROM collaborators WHERE repo_id = ? AND user_id = ?`, repo.ID, user.ID).Scan(&mode); err == nil {
			if r := roleRank(mode); r > 0 {
				hasCollab = true
				if r > maxRank {
					maxRank = r
				}
			}
		}

		// 2. Organization check (if repo is owned by an organization)
		var orgID int64
		if err := DB.QueryRow(`SELECT id FROM organizations WHERE name = ? COLLATE NOCASE`, repo.OwnerName).Scan(&orgID); err == nil {
			var role string
			if err := DB.QueryRow(`SELECT role FROM org_members WHERE org_id = ? AND user_id = ?`, orgID, user.ID).Scan(&role); err == nil {
				if role == "owner" || role == "admin" {
					maxRank = 4
				} else {
					rows, err := DB.Query(`
						SELECT t.permission
						FROM team_members tm
						JOIN teams t ON tm.team_id = t.id
						LEFT JOIN team_repos tr ON t.id = tr.team_id
						WHERE t.org_id = ? AND tm.user_id = ? AND (tr.repo_id = ? OR tr.repo_id IS NULL)
					`, orgID, user.ID, repo.ID)
					if err == nil {
						hasTeam := false
						bestTeamRank := 0
						for rows.Next() {
							var perm string
							if scanErr := rows.Scan(&perm); scanErr == nil {
								hasTeam = true
								if r := roleRank(perm); r > bestTeamRank {
									bestTeamRank = r
								}
							}
						}
						_ = rows.Close()
						if hasTeam {
							if bestTeamRank > maxRank {
								maxRank = bestTeamRank
							}
						} else if !hasCollab && maxRank < 2 {
							// Backwards-compatible default for org members with no teams assigned
							maxRank = 2
						}
					}
				}
			}
		}
	}

	// Public repository fallback (only when no explicit collaborator/org/owner grant applied)
	if maxRank == 0 && !repo.IsPrivate {
		maxRank = 2
	}

	perms.Read = maxRank >= 1
	perms.Write = maxRank >= 3
	perms.Admin = maxRank >= 4
	perms.Download = perms.Read && maxRank >= 2

	// Repo setting: when AllowDownloadAndPulls is disabled, block Read, View-Only, and anonymous/public downloads
	if !repo.AllowDownloadAndPulls && !perms.Write && !perms.Admin {
		perms.Download = false
	}

	// Global Admin User Restriction: block all downloads/clones/forks for restricted non-admin accounts
	if user != nil && !user.CanDownload && !user.IsAdmin {
		perms.Download = false
	}

	perms.ViewOnly = perms.Read && !perms.Download
	return perms
}

func CanUserAccessRepo(user *User, repo *Repository, writeRequired bool) bool {
	perms := GetRepoPermissions(user, repo)
	if writeRequired {
		return perms.Write
	}
	return perms.Read
}

// Issue Methods

func CreateIssue(repoID, posterID int64, title, content string, isPull bool, assigneeID *int64) (*Issue, error) {
	tx, err := DB.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var nextIndex int64 = 1
	err = tx.QueryRow(`SELECT COALESCE(MAX(index_number), 0) + 1 FROM issues WHERE repo_id = ?`, repoID).Scan(&nextIndex)
	if err != nil {
		return nil, err
	}

	res, err := tx.Exec(`
		INSERT INTO issues (repo_id, index_number, poster_id, assignee_id, title, content, is_pull)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, repoID, nextIndex, posterID, assigneeID, title, content, isPull)
	if err != nil {
		return nil, err
	}

	if isPull {
		_, _ = tx.Exec(`UPDATE repositories SET num_pulls = num_pulls + 1 WHERE id = ?`, repoID)
	} else {
		_, _ = tx.Exec(`UPDATE repositories SET num_issues = num_issues + 1 WHERE id = ?`, repoID)
	}

	issueID, _ := res.LastInsertId()
	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return GetIssueByID(issueID)
}

func GetIssueByID(id int64) (*Issue, error) {
	iss := &Issue{}
	var assigneeID *int64
	var assigneeName, assigneeAvatar string
	err := DB.QueryRow(`
		SELECT i.id, i.repo_id, u.username, r.name, i.index_number, i.poster_id, pu.username, pu.avatar_url,
		       i.title, i.content, i.is_pull, i.is_closed, i.closed_at,
		       (SELECT COUNT(*) FROM comments c WHERE c.issue_id = i.id),
		       i.created_at, i.updated_at,
		       i.assignee_id, COALESCE(au.username, ''), COALESCE(au.avatar_url, '')
		FROM issues i
		JOIN repositories r ON r.id = i.repo_id
		JOIN users u ON u.id = r.owner_id
		JOIN users pu ON pu.id = i.poster_id
		LEFT JOIN users au ON au.id = i.assignee_id
		WHERE i.id = ?
	`, id).Scan(&iss.ID, &iss.RepoID, &iss.RepoOwner, &iss.RepoName, &iss.IndexNumber, &iss.PosterID, &iss.PosterName, &iss.PosterAvatar,
		&iss.Title, &iss.Content, &iss.IsPull, &iss.IsClosed, &iss.ClosedAt, &iss.NumComments, &iss.CreatedAt, &iss.UpdatedAt,
		&assigneeID, &assigneeName, &assigneeAvatar)
	if err != nil {
		return nil, err
	}
	iss.AssigneeID = assigneeID
	iss.AssigneeName = assigneeName
	iss.AssigneeAvatar = assigneeAvatar
	return iss, nil
}

func GetIssueByIndex(repoID, indexNumber int64) (*Issue, error) {
	var id int64
	err := DB.QueryRow(`SELECT id FROM issues WHERE repo_id = ? AND index_number = ?`, repoID, indexNumber).Scan(&id)
	if err != nil {
		return nil, err
	}
	return GetIssueByID(id)
}

func ListIssues(repoID int64, isPull bool, state string) ([]*Issue, error) {
	return ListIssuesFiltered(repoID, isPull, state, "")
}

func ListIssuesFiltered(repoID int64, isPull bool, state string, assigneeUsername string) ([]*Issue, error) {
	query := `
		SELECT i.id, i.repo_id, u.username, r.name, i.index_number, i.poster_id, pu.username, pu.avatar_url,
		       i.title, i.content, i.is_pull, i.is_closed, i.closed_at,
		       (SELECT COUNT(*) FROM comments c WHERE c.issue_id = i.id),
		       i.created_at, i.updated_at,
		       i.assignee_id, COALESCE(au.username, ''), COALESCE(au.avatar_url, '')
		FROM issues i
		JOIN repositories r ON r.id = i.repo_id
		JOIN users u ON u.id = r.owner_id
		JOIN users pu ON pu.id = i.poster_id
		LEFT JOIN users au ON au.id = i.assignee_id
		WHERE i.repo_id = ? AND i.is_pull = ?
	`
	args := []any{repoID, isPull}
	if state == "closed" {
		query += ` AND i.is_closed = 1 `
	} else if state == "open" {
		query += ` AND i.is_closed = 0 `
	}
	if strings.TrimSpace(assigneeUsername) != "" {
		query += ` AND au.username = ? `
		args = append(args, strings.TrimSpace(assigneeUsername))
	}
	query += ` ORDER BY i.index_number DESC `

	rows, err := DB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []*Issue
	for rows.Next() {
		iss := &Issue{}
		var assigneeID *int64
		var assigneeName, assigneeAvatar string
		if err := rows.Scan(&iss.ID, &iss.RepoID, &iss.RepoOwner, &iss.RepoName, &iss.IndexNumber, &iss.PosterID, &iss.PosterName, &iss.PosterAvatar,
			&iss.Title, &iss.Content, &iss.IsPull, &iss.IsClosed, &iss.ClosedAt, &iss.NumComments, &iss.CreatedAt, &iss.UpdatedAt,
			&assigneeID, &assigneeName, &assigneeAvatar); err != nil {
			return nil, err
		}
		iss.AssigneeID = assigneeID
		iss.AssigneeName = assigneeName
		iss.AssigneeAvatar = assigneeAvatar
		list = append(list, iss)
	}
	return list, rows.Err()
}

func UpdateIssueAssignee(issueID int64, assigneeID *int64) error {
	_, err := DB.Exec(`UPDATE issues SET assignee_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, assigneeID, issueID)
	return err
}

// IsEligibleAssignee checks whether a user can be assigned to issues in a repository.
// Only repository owners, direct collaborators, and organization members (if org-owned)
// are eligible assignees.
func IsEligibleAssignee(repo *Repository, user *User) bool {
	if repo == nil || user == nil {
		return false
	}
	// Repository owner is always eligible
	if user.ID == repo.OwnerID {
		return true
	}
	// Direct collaborator check
	var collabsCount int
	_ = DB.QueryRow(`SELECT COUNT(*) FROM collaborators WHERE repo_id = ? AND user_id = ?`, repo.ID, user.ID).Scan(&collabsCount)
	if collabsCount > 0 {
		return true
	}
	// Organization member check if repository belongs to an organization
	var orgID int64
	if err := DB.QueryRow(`SELECT id FROM organizations WHERE name = ? COLLATE NOCASE`, repo.OwnerName).Scan(&orgID); err == nil {
		var memberCount int
		_ = DB.QueryRow(`SELECT COUNT(*) FROM org_members WHERE org_id = ? AND user_id = ?`, orgID, user.ID).Scan(&memberCount)
		if memberCount > 0 {
			return true
		}
	}
	return false
}

// ListRepoAssignees returns all users eligible to be assigned to issues in a repository:
// the repository owner, organization members (if org-owned), and all direct collaborators.
func ListRepoAssignees(repo *Repository) ([]*User, error) {
	if repo == nil {
		return nil, fmt.Errorf("repository is nil")
	}

	query := `
		SELECT DISTINCT u.id, u.username, u.email, u.full_name, u.avatar_url, u.is_admin
		FROM users u
		WHERE u.password_hash != 'disabled'
		  AND (
		    u.id = ?
		    OR u.id IN (SELECT user_id FROM collaborators WHERE repo_id = ?)
	`
	args := []any{repo.OwnerID, repo.ID}

	var orgID int64
	if err := DB.QueryRow(`SELECT id FROM organizations WHERE name = ? COLLATE NOCASE`, repo.OwnerName).Scan(&orgID); err == nil {
		query += ` OR u.id IN (SELECT user_id FROM org_members WHERE org_id = ?)`
		args = append(args, orgID)
	}

	query += `) ORDER BY u.username ASC`

	rows, err := DB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*User
	for rows.Next() {
		u := &User{}
		if err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.FullName, &u.AvatarURL, &u.IsAdmin); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

func UpdateIssueStatus(issueID int64, closed bool) error {
	var closedAt *time.Time
	if closed {
		now := time.Now()
		closedAt = &now
	}
	_, err := DB.Exec(`
		UPDATE issues SET is_closed = ?, closed_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
	`, closed, closedAt, issueID)
	return err
}

// Comments

func AddComment(issueID, posterID int64, commentType, content string) (*Comment, error) {
	res, err := DB.Exec(`
		INSERT INTO comments (issue_id, poster_id, type, content)
		VALUES (?, ?, ?, ?)
	`, issueID, posterID, commentType, content)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()

	u, _ := GetUserByID(posterID)
	posterName := ""
	posterAvatar := ""
	if u != nil {
		posterName = u.Username
		posterAvatar = u.AvatarURL
	}

	return &Comment{
		ID:           id,
		IssueID:      issueID,
		PosterID:     posterID,
		PosterName:   posterName,
		PosterAvatar: posterAvatar,
		Type:         commentType,
		Content:      content,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}, nil
}

func ListComments(issueID int64) ([]*Comment, error) {
	rows, err := DB.Query(`
		SELECT c.id, c.issue_id, c.poster_id, u.username, u.avatar_url, c.type, c.content, c.created_at, c.updated_at
		FROM comments c
		JOIN users u ON u.id = c.poster_id
		WHERE c.issue_id = ?
		ORDER BY c.created_at ASC
	`, issueID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []*Comment
	for rows.Next() {
		c := &Comment{}
		if err := rows.Scan(&c.ID, &c.IssueID, &c.PosterID, &c.PosterName, &c.PosterAvatar, &c.Type, &c.Content, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, c)
	}
	return list, rows.Err()
}

// Pull Requests

func CreatePullRequest(headRepoID, baseRepoID, posterID int64, title, content, headBranch, baseBranch string) (*PullRequest, error) {
	issue, err := CreateIssue(baseRepoID, posterID, title, content, true, nil)
	if err != nil {
		return nil, err
	}

	res, err := DB.Exec(`
		INSERT INTO pull_requests (issue_id, head_repo_id, base_repo_id, head_branch, base_branch)
		VALUES (?, ?, ?, ?, ?)
	`, issue.ID, headRepoID, baseRepoID, headBranch, baseBranch)
	if err != nil {
		return nil, err
	}

	prID, _ := res.LastInsertId()
	return &PullRequest{
		ID:         prID,
		IssueID:    issue.ID,
		Issue:      issue,
		HeadRepoID: headRepoID,
		BaseRepoID: baseRepoID,
		HeadBranch: headBranch,
		BaseBranch: baseBranch,
	}, nil
}

func GetPullRequestByIssueID(issueID int64) (*PullRequest, error) {
	pr := &PullRequest{}
	err := DB.QueryRow(`
		SELECT id, issue_id, head_repo_id, base_repo_id, head_branch, base_branch, merge_base, is_merged, merged_at, merged_by_id, merge_commit_sha
		FROM pull_requests WHERE issue_id = ?
	`, issueID).Scan(&pr.ID, &pr.IssueID, &pr.HeadRepoID, &pr.BaseRepoID, &pr.HeadBranch, &pr.BaseBranch, &pr.MergeBase,
		&pr.IsMerged, &pr.MergedAt, &pr.MergedByID, &pr.MergeCommitSHA)
	if err != nil {
		return nil, err
	}
	iss, err := GetIssueByID(issueID)
	if err == nil {
		pr.Issue = iss
	}
	return pr, nil
}

func MarkPullRequestMerged(prID, mergedByID int64, mergeCommitSHA string) error {
	now := time.Now()
	_, err := DB.Exec(`
		UPDATE pull_requests
		SET is_merged = 1, merged_at = ?, merged_by_id = ?, merge_commit_sha = ?
		WHERE id = ?
	`, now, mergedByID, mergeCommitSHA, prID)
	if err != nil {
		return err
	}

	var issueID int64
	_ = DB.QueryRow(`SELECT issue_id FROM pull_requests WHERE id = ?`, prID).Scan(&issueID)
	if issueID > 0 {
		_ = UpdateIssueStatus(issueID, true)
		_, _ = AddComment(issueID, mergedByID, "merge", fmt.Sprintf("Merged via commit %s", mergeCommitSHA))
	}
	return nil
}

func HasOpenPullForBranch(repoID int64, headBranch string) (bool, error) {
	if DB == nil {
		return false, nil
	}
	var count int
	err := DB.QueryRow(`
		SELECT COUNT(*)
		FROM pull_requests pr
		JOIN issues i ON i.id = pr.issue_id
		WHERE pr.head_repo_id = ? AND pr.head_branch = ? AND i.is_closed = 0 AND pr.is_merged = 0
	`, repoID, headBranch).Scan(&count)
	return count > 0, err
}

// Pull Request Reviews

func CreatePullReview(issueID, pullID, reviewerID int64, state, content string, comments []PullReviewComment) (*PullReview, error) {
	state = strings.ToUpper(strings.TrimSpace(state))
	if state != "APPROVED" && state != "CHANGES_REQUESTED" && state != "COMMENTED" {
		state = "COMMENTED"
	}
	content = strings.TrimSpace(content)

	res, err := DB.Exec(`
		INSERT INTO pull_reviews (issue_id, pull_id, reviewer_id, state, content)
		VALUES (?, ?, ?, ?, ?)
	`, issueID, pullID, reviewerID, state, content)
	if err != nil {
		return nil, err
	}
	reviewID, _ := res.LastInsertId()

	for _, c := range comments {
		if strings.TrimSpace(c.Content) == "" {
			continue
		}
		line := c.LineNumber
		if line <= 0 {
			line = 1
		}
		_, _ = DB.Exec(`
			INSERT INTO pull_review_comments (review_id, issue_id, user_id, file_path, line_number, diff_hunk, content)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`, reviewID, issueID, reviewerID, c.FilePath, line, c.DiffHunk, c.Content)
	}

	// Add timeline comment
	actionDesc := "approved these changes"
	if state == "CHANGES_REQUESTED" {
		actionDesc = "requested changes"
	} else if state == "COMMENTED" {
		actionDesc = "left a review"
	}
	timelineContent := actionDesc
	if content != "" {
		timelineContent = fmt.Sprintf("%s\n\n%s", actionDesc, content)
	}
	_, _ = AddComment(issueID, reviewerID, "review", timelineContent)

	return GetPullReviewByID(reviewID)
}

func GetPullReviewByID(id int64) (*PullReview, error) {
	rv := &PullReview{}
	err := DB.QueryRow(`
		SELECT pr.id, pr.issue_id, pr.pull_id, pr.reviewer_id, u.username, pr.state, pr.content, pr.created_at, pr.updated_at
		FROM pull_reviews pr
		JOIN users u ON u.id = pr.reviewer_id
		WHERE pr.id = ?
	`, id).Scan(&rv.ID, &rv.IssueID, &rv.PullID, &rv.ReviewerID, &rv.ReviewerName, &rv.State, &rv.Content, &rv.CreatedAt, &rv.UpdatedAt)
	if err != nil {
		return nil, err
	}
	rv.Comments, _ = GetReviewCommentsByReviewID(rv.ID)
	return rv, nil
}

func GetPullReviews(pullID int64) ([]*PullReview, error) {
	rows, err := DB.Query(`
		SELECT pr.id, pr.issue_id, pr.pull_id, pr.reviewer_id, u.username, pr.state, pr.content, pr.created_at, pr.updated_at
		FROM pull_reviews pr
		JOIN users u ON u.id = pr.reviewer_id
		WHERE pr.pull_id = ?
		ORDER BY pr.created_at ASC
	`, pullID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reviews []*PullReview
	for rows.Next() {
		rv := &PullReview{}
		if err := rows.Scan(&rv.ID, &rv.IssueID, &rv.PullID, &rv.ReviewerID, &rv.ReviewerName, &rv.State, &rv.Content, &rv.CreatedAt, &rv.UpdatedAt); err == nil {
			rv.Comments, _ = GetReviewCommentsByReviewID(rv.ID)
			reviews = append(reviews, rv)
		}
	}
	return reviews, nil
}

func CreatePullReviewComment(issueID, pullID, reviewID, userID int64, filePath string, lineNumber int, diffHunk, content string) (*PullReviewComment, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return nil, fmt.Errorf("comment content cannot be empty")
	}
	if lineNumber <= 0 {
		lineNumber = 1
	}

	var revIDArg any
	if reviewID > 0 {
		revIDArg = reviewID
	}

	res, err := DB.Exec(`
		INSERT INTO pull_review_comments (review_id, issue_id, user_id, file_path, line_number, diff_hunk, content)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, revIDArg, issueID, userID, filePath, lineNumber, diffHunk, content)
	if err != nil {
		return nil, err
	}
	cID, _ := res.LastInsertId()

	u, _ := GetUserByID(userID)
	userName := "User"
	if u != nil {
		userName = u.Username
	}

	return &PullReviewComment{
		ID:         cID,
		ReviewID:   reviewID,
		IssueID:    issueID,
		UserID:     userID,
		UserName:   userName,
		FilePath:   filePath,
		LineNumber: lineNumber,
		DiffHunk:   diffHunk,
		Content:    content,
		CreatedAt:  time.Now(),
	}, nil
}

func GetPullReviewComments(issueID int64) ([]*PullReviewComment, error) {
	rows, err := DB.Query(`
		SELECT prc.id, COALESCE(prc.review_id, 0), prc.issue_id, prc.user_id, u.username, prc.file_path, prc.line_number, prc.diff_hunk, prc.content, prc.created_at
		FROM pull_review_comments prc
		JOIN users u ON u.id = prc.user_id
		WHERE prc.issue_id = ?
		ORDER BY prc.created_at ASC
	`, issueID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []*PullReviewComment
	for rows.Next() {
		c := &PullReviewComment{}
		if err := rows.Scan(&c.ID, &c.ReviewID, &c.IssueID, &c.UserID, &c.UserName, &c.FilePath, &c.LineNumber, &c.DiffHunk, &c.Content, &c.CreatedAt); err == nil {
			comments = append(comments, c)
		}
	}
	return comments, nil
}

func GetReviewCommentsByReviewID(reviewID int64) ([]PullReviewComment, error) {
	rows, err := DB.Query(`
		SELECT prc.id, COALESCE(prc.review_id, 0), prc.issue_id, prc.user_id, u.username, prc.file_path, prc.line_number, prc.diff_hunk, prc.content, prc.created_at
		FROM pull_review_comments prc
		JOIN users u ON u.id = prc.user_id
		WHERE prc.review_id = ?
		ORDER BY prc.created_at ASC
	`, reviewID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []PullReviewComment
	for rows.Next() {
		var c PullReviewComment
		if err := rows.Scan(&c.ID, &c.ReviewID, &c.IssueID, &c.UserID, &c.UserName, &c.FilePath, &c.LineNumber, &c.DiffHunk, &c.Content, &c.CreatedAt); err == nil {
			comments = append(comments, c)
		}
	}
	return comments, nil
}

// Activity Methods

func CreateActivity(userID int64, username string, repoID *int64, repoName, opType, content string) {
	_, _ = DB.Exec(`
		INSERT INTO activities (user_id, repo_id, op_type, content)
		VALUES (?, ?, ?, ?)
	`, userID, repoID, opType, content)
}

func ListActivities(limit int) ([]*Activity, error) {
	rows, err := DB.Query(`
		SELECT a.id, a.user_id, u.username, a.repo_id, COALESCE(r.name, ''), a.op_type, a.content, a.created_at
		FROM activities a
		JOIN users u ON u.id = a.user_id
		LEFT JOIN repositories r ON r.id = a.repo_id
		ORDER BY a.created_at DESC LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []*Activity{}
	for rows.Next() {
		act := &Activity{}
		if err := rows.Scan(&act.ID, &act.UserID, &act.Username, &act.RepoID, &act.RepoName, &act.OpType, &act.Content, &act.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, act)
	}
	return list, rows.Err()
}

func ListUserActivities(userID int64, limit int) ([]*Activity, error) {
	if limit <= 0 {
		limit = 30
	}
	rows, err := DB.Query(`
		SELECT a.id, a.user_id, u.username, a.repo_id, COALESCE(r.name, ''), a.op_type, a.content, a.created_at
		FROM activities a
		JOIN users u ON u.id = a.user_id
		LEFT JOIN repositories r ON r.id = a.repo_id
		WHERE a.user_id = ?
		ORDER BY a.created_at DESC LIMIT ?
	`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []*Activity{}
	for rows.Next() {
		act := &Activity{}
		if err := rows.Scan(&act.ID, &act.UserID, &act.Username, &act.RepoID, &act.RepoName, &act.OpType, &act.Content, &act.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, act)
	}
	return list, rows.Err()
}

// Collaborator Methods

func AddCollaborator(repoID, userID int64, mode string) error {
	mode = strings.ToLower(strings.TrimSpace(mode))
	if mode == "" {
		mode = "write"
	}
	if !IsValidRepoRole(mode) {
		return fmt.Errorf("invalid collaborator mode '%s': must be view_only, read, write, or admin", mode)
	}
	_, err := DB.Exec(`
		INSERT INTO collaborators (repo_id, user_id, mode)
		VALUES (?, ?, ?)
		ON CONFLICT(repo_id, user_id) DO UPDATE SET mode = excluded.mode
	`, repoID, userID, mode)
	return err
}

func RemoveCollaborator(repoID, userID int64) error {
	_, err := DB.Exec(`DELETE FROM collaborators WHERE repo_id = ? AND user_id = ?`, repoID, userID)
	return err
}

func ListCollaborators(repoID int64) ([]CollaboratorUser, error) {
	rows, err := DB.Query(`
		SELECT u.id, u.username, u.email, u.full_name, u.avatar_url, c.mode, c.created_at
		FROM collaborators c
		JOIN users u ON c.user_id = u.id
		WHERE c.repo_id = ?
		ORDER BY c.created_at ASC
	`, repoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []CollaboratorUser
	for rows.Next() {
		var c CollaboratorUser
		if err := rows.Scan(&c.UserID, &c.Username, &c.Email, &c.FullName, &c.AvatarURL, &c.Mode, &c.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, c)
	}
	return result, nil
}

// Organization Methods

func CreateOrganization(name, fullName, description, location, website string, creatorID int64) (*Organization, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("organization name is required")
	}

	var userExists int
	_ = DB.QueryRow(`SELECT COUNT(*) FROM users WHERE username = ? COLLATE NOCASE`, name).Scan(&userExists)
	if userExists > 0 {
		return nil, fmt.Errorf("name '%s' is already taken", name)
	}

	tx, err := DB.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	orgEmail := fmt.Sprintf("%s@org.progit.local", strings.ToLower(name))
	_, err = tx.Exec(`
		INSERT INTO users (username, email, password_hash, full_name, is_admin)
		VALUES (?, ?, 'disabled', ?, 0)
	`, name, orgEmail, fullName)
	if err != nil {
		return nil, fmt.Errorf("create organization account stub: %w", err)
	}

	res, err := tx.Exec(`
		INSERT INTO organizations (name, full_name, description, location, website)
		VALUES (?, ?, ?, ?, ?)
	`, name, fullName, description, location, website)
	if err != nil {
		return nil, fmt.Errorf("create organization: %w", err)
	}
	orgID, _ := res.LastInsertId()

	_, err = tx.Exec(`
		INSERT INTO org_members (org_id, user_id, role)
		VALUES (?, ?, 'owner')
	`, orgID, creatorID)
	if err != nil {
		return nil, fmt.Errorf("add org owner: %w", err)
	}

	_, err = tx.Exec(`
		INSERT INTO teams (org_id, name, description, permission)
		VALUES (?, 'Owners', 'Organization Administrators with full access', 'admin')
	`, orgID)
	if err != nil {
		return nil, fmt.Errorf("create owners team: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return GetOrgByID(orgID)
}

func GetOrgByID(id int64) (*Organization, error) {
	org := &Organization{}
	err := DB.QueryRow(`
		SELECT id, name, full_name, description, avatar_url, location, website, max_repo_creation, created_at, updated_at
		FROM organizations WHERE id = ?
	`, id).Scan(&org.ID, &org.Name, &org.FullName, &org.Description, &org.AvatarURL, &org.Location, &org.Website, &org.MaxRepoCreation, &org.CreatedAt, &org.UpdatedAt)
	if err != nil {
		return nil, err
	}
	_ = DB.QueryRow(`SELECT COUNT(*) FROM org_members WHERE org_id = ?`, org.ID).Scan(&org.NumMembers)
	_ = DB.QueryRow(`SELECT COUNT(*) FROM repositories WHERE owner_name = ? COLLATE NOCASE`, org.Name).Scan(&org.NumRepos)
	_ = DB.QueryRow(`SELECT COUNT(*) FROM teams WHERE org_id = ?`, org.ID).Scan(&org.NumTeams)
	return org, nil
}

func GetOrgByName(name string) (*Organization, error) {
	org := &Organization{}
	err := DB.QueryRow(`
		SELECT id, name, full_name, description, avatar_url, location, website, max_repo_creation, created_at, updated_at
		FROM organizations WHERE name = ? COLLATE NOCASE
	`, strings.TrimSpace(name)).Scan(&org.ID, &org.Name, &org.FullName, &org.Description, &org.AvatarURL, &org.Location, &org.Website, &org.MaxRepoCreation, &org.CreatedAt, &org.UpdatedAt)
	if err != nil {
		return nil, err
	}
	_ = DB.QueryRow(`SELECT COUNT(*) FROM org_members WHERE org_id = ?`, org.ID).Scan(&org.NumMembers)
	_ = DB.QueryRow(`SELECT COUNT(*) FROM repositories WHERE owner_name = ? COLLATE NOCASE`, org.Name).Scan(&org.NumRepos)
	_ = DB.QueryRow(`SELECT COUNT(*) FROM teams WHERE org_id = ?`, org.ID).Scan(&org.NumTeams)
	return org, nil
}

func UpdateOrganization(orgID int64, fullName, description, location, website, avatarURL string) (*Organization, error) {
	tx, err := DB.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var orgName string
	if err := tx.QueryRow(`SELECT name FROM organizations WHERE id = ?`, orgID).Scan(&orgName); err != nil {
		return nil, err
	}

	_, err = tx.Exec(`
		UPDATE organizations
		SET full_name = ?, description = ?, location = ?, website = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, strings.TrimSpace(fullName), strings.TrimSpace(description), strings.TrimSpace(location), strings.TrimSpace(website), strings.TrimSpace(avatarURL), orgID)
	if err != nil {
		return nil, fmt.Errorf("update organization: %w", err)
	}

	// Synchronize full_name in corresponding user account stub if present
	_, _ = tx.Exec(`UPDATE users SET full_name = ? WHERE username = ? COLLATE NOCASE`, strings.TrimSpace(fullName), orgName)

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return GetOrgByID(orgID)
}

func ListUserOrganizations(userID int64) ([]Organization, error) {
	rows, err := DB.Query(`
		SELECT o.id, o.name, o.full_name, o.description, o.avatar_url, o.location, o.website, o.created_at, o.updated_at
		FROM organizations o
		JOIN org_members om ON o.id = om.org_id
		WHERE om.user_id = ?
		ORDER BY o.name ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Organization
	for rows.Next() {
		var o Organization
		if err := rows.Scan(&o.ID, &o.Name, &o.FullName, &o.Description, &o.AvatarURL, &o.Location, &o.Website, &o.CreatedAt, &o.UpdatedAt); err != nil {
			return nil, err
		}
		_ = DB.QueryRow(`SELECT COUNT(*) FROM org_members WHERE org_id = ?`, o.ID).Scan(&o.NumMembers)
		_ = DB.QueryRow(`SELECT COUNT(*) FROM repositories WHERE owner_name = ? COLLATE NOCASE`, o.Name).Scan(&o.NumRepos)
		list = append(list, o)
	}
	return list, nil
}

func ListAllOrganizations() ([]Organization, error) {
	rows, err := DB.Query(`
		SELECT id, name, full_name, description, avatar_url, location, website, created_at, updated_at
		FROM organizations
		ORDER BY name ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Organization
	for rows.Next() {
		var o Organization
		if err := rows.Scan(&o.ID, &o.Name, &o.FullName, &o.Description, &o.AvatarURL, &o.Location, &o.Website, &o.CreatedAt, &o.UpdatedAt); err != nil {
			return nil, err
		}
		_ = DB.QueryRow(`SELECT COUNT(*) FROM org_members WHERE org_id = ?`, o.ID).Scan(&o.NumMembers)
		_ = DB.QueryRow(`SELECT COUNT(*) FROM repositories WHERE owner_name = ? COLLATE NOCASE`, o.Name).Scan(&o.NumRepos)
		list = append(list, o)
	}
	return list, nil
}

func AddOrgMember(orgID, userID int64, role string) error {
	if role == "" {
		role = "member"
	}
	_, err := DB.Exec(`
		INSERT INTO org_members (org_id, user_id, role)
		VALUES (?, ?, ?)
		ON CONFLICT(org_id, user_id) DO UPDATE SET role = excluded.role
	`, orgID, userID, role)
	return err
}

func RemoveOrgMember(orgID, userID int64) error {
	_, err := DB.Exec(`DELETE FROM org_members WHERE org_id = ? AND user_id = ?`, orgID, userID)
	return err
}

func ListOrgMembers(orgID int64) ([]OrgMember, error) {
	rows, err := DB.Query(`
		SELECT om.org_id, om.user_id, u.username, u.full_name, u.email, u.avatar_url, om.role, om.created_at
		FROM org_members om
		JOIN users u ON om.user_id = u.id
		WHERE om.org_id = ?
		ORDER BY om.role DESC, u.username ASC
	`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []OrgMember
	for rows.Next() {
		var m OrgMember
		if err := rows.Scan(&m.OrgID, &m.UserID, &m.Username, &m.FullName, &m.Email, &m.AvatarURL, &m.Role, &m.CreatedAt); err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	return members, nil
}

func IsOrgAdmin(orgID, userID int64) bool {
	var role string
	err := DB.QueryRow(`SELECT role FROM org_members WHERE org_id = ? AND user_id = ?`, orgID, userID).Scan(&role)
	if err == nil && (role == "owner" || role == "admin") {
		return true
	}
	// Fallback: If only 1 member exists in the organization, treat that member as admin
	var memberCount int
	_ = DB.QueryRow(`SELECT COUNT(*) FROM org_members WHERE org_id = ?`, orgID).Scan(&memberCount)
	if memberCount <= 1 {
		var singleUserID int64
		if err := DB.QueryRow(`SELECT user_id FROM org_members WHERE org_id = ? LIMIT 1`, orgID).Scan(&singleUserID); err == nil && singleUserID == userID {
			return true
		}
	}
	return false
}

func CreateTeam(orgID int64, name, description, permission string) (*Team, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("team name required")
	}
	permission = strings.ToLower(strings.TrimSpace(permission))
	if permission == "" {
		permission = "write"
	}
	if !IsValidRepoRole(permission) {
		return nil, fmt.Errorf("invalid team permission '%s': must be view_only, read, write, or admin", permission)
	}
	res, err := DB.Exec(`
		INSERT INTO teams (org_id, name, description, permission)
		VALUES (?, ?, ?, ?)
	`, orgID, name, description, permission)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return &Team{
		ID:          id,
		OrgID:       orgID,
		Name:        name,
		Description: description,
		Permission:  permission,
		CreatedAt:   time.Now(),
	}, nil
}

func ListTeams(orgID int64) ([]Team, error) {
	rows, err := DB.Query(`
		SELECT id, org_id, name, description, permission, created_at
		FROM teams
		WHERE org_id = ?
		ORDER BY name ASC
	`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var teams []Team
	for rows.Next() {
		var t Team
		if err := rows.Scan(&t.ID, &t.OrgID, &t.Name, &t.Description, &t.Permission, &t.CreatedAt); err != nil {
			return nil, err
		}
		_ = DB.QueryRow(`SELECT COUNT(*) FROM team_members WHERE team_id = ?`, t.ID).Scan(&t.NumMembers)
		teams = append(teams, t)
	}
	return teams, nil
}

func AddTeamMember(teamID, userID int64) error {
	_, err := DB.Exec(`
		INSERT OR IGNORE INTO team_members (team_id, user_id)
		VALUES (?, ?)
	`, teamID, userID)
	return err
}

func RemoveTeamMember(teamID, userID int64) error {
	_, err := DB.Exec(`DELETE FROM team_members WHERE team_id = ? AND user_id = ?`, teamID, userID)
	return err
}

// Project Methods

func CreateProject(repoID, creatorID int64, title, description string) (*Project, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return nil, fmt.Errorf("project title is required")
	}

	tx, err := DB.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	res, err := tx.Exec(`
		INSERT INTO projects (repo_id, title, description, creator_id)
		VALUES (?, ?, ?, ?)
	`, repoID, title, description, creatorID)
	if err != nil {
		return nil, err
	}
	projectID, _ := res.LastInsertId()

	defaultCols := []string{"To do", "In progress", "Done"}
	for i, col := range defaultCols {
		_, err := tx.Exec(`
			INSERT INTO project_columns (project_id, title, order_num)
			VALUES (?, ?, ?)
		`, projectID, col, i+1)
		if err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return GetProjectByID(projectID)
}

func GetProjectByID(id int64) (*Project, error) {
	p := &Project{}
	err := DB.QueryRow(`
		SELECT p.id, p.repo_id, p.title, p.description, p.is_closed, p.creator_id, u.username, p.created_at, p.updated_at
		FROM projects p
		JOIN users u ON p.creator_id = u.id
		WHERE p.id = ?
	`, id).Scan(&p.ID, &p.RepoID, &p.Title, &p.Description, &p.IsClosed, &p.CreatorID, &p.CreatorName, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}

	cols, err := ListProjectColumns(p.ID)
	if err == nil {
		p.Columns = cols
	}

	_ = DB.QueryRow(`SELECT COUNT(*) FROM project_cards WHERE project_id = ?`, p.ID).Scan(&p.TotalCards)
	_ = DB.QueryRow(`
		SELECT COUNT(*) FROM project_cards pc
		JOIN project_columns col ON pc.column_id = col.id
		WHERE pc.project_id = ? AND (
			LOWER(TRIM(col.title)) IN ('done', 'completed', 'finished', 'closed')
			OR col.order_num = (SELECT MAX(order_num) FROM project_columns WHERE project_id = pc.project_id)
		)
	`, p.ID).Scan(&p.DoneCards)

	return p, nil
}

func ListRepoProjects(repoID int64) ([]Project, error) {
	rows, err := DB.Query(`
		SELECT p.id, p.repo_id, p.title, p.description, p.is_closed, p.creator_id, u.username, p.created_at, p.updated_at
		FROM projects p
		JOIN users u ON p.creator_id = u.id
		WHERE p.repo_id = ?
		ORDER BY p.is_closed ASC, p.created_at DESC
	`, repoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var projects []Project
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.RepoID, &p.Title, &p.Description, &p.IsClosed, &p.CreatorID, &p.CreatorName, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		_ = DB.QueryRow(`SELECT COUNT(*) FROM project_cards WHERE project_id = ?`, p.ID).Scan(&p.TotalCards)
		_ = DB.QueryRow(`
			SELECT COUNT(*) FROM project_cards pc
			JOIN project_columns col ON pc.column_id = col.id
			WHERE pc.project_id = ? AND (
				LOWER(TRIM(col.title)) IN ('done', 'completed', 'finished', 'closed')
				OR col.order_num = (SELECT MAX(order_num) FROM project_columns WHERE project_id = pc.project_id)
			)
		`, p.ID).Scan(&p.DoneCards)
		projects = append(projects, p)
	}
	return projects, nil
}

func UpdateProject(id int64, title, description string, isClosed bool) error {
	_, err := DB.Exec(`
		UPDATE projects SET title = ?, description = ?, is_closed = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, title, description, isClosed, id)
	return err
}

func DeleteProject(id int64) error {
	_, err := DB.Exec(`DELETE FROM projects WHERE id = ?`, id)
	return err
}

func ListProjectColumns(projectID int64) ([]ProjectColumn, error) {
	rows, err := DB.Query(`
		SELECT id, project_id, title, order_num, created_at
		FROM project_columns
		WHERE project_id = ?
		ORDER BY order_num ASC, id ASC
	`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cols []ProjectColumn
	for rows.Next() {
		var c ProjectColumn
		if err := rows.Scan(&c.ID, &c.ProjectID, &c.Title, &c.OrderNum, &c.CreatedAt); err != nil {
			return nil, err
		}
		cards, _ := ListColumnCards(c.ID)
		c.Cards = cards
		cols = append(cols, c)
	}
	return cols, nil
}

func CreateProjectColumn(projectID int64, title string, orderNum int) (*ProjectColumn, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return nil, fmt.Errorf("column title is required")
	}
	res, err := DB.Exec(`
		INSERT INTO project_columns (project_id, title, order_num)
		VALUES (?, ?, ?)
	`, projectID, title, orderNum)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return &ProjectColumn{
		ID:        id,
		ProjectID: projectID,
		Title:     title,
		OrderNum:  orderNum,
		CreatedAt: time.Now(),
	}, nil
}

func UpdateProjectColumn(columnID int64, title string, orderNum int) error {
	title = strings.TrimSpace(title)
	if title == "" {
		return fmt.Errorf("column title is required")
	}
	_, err := DB.Exec(`UPDATE project_columns SET title = ?, order_num = ? WHERE id = ?`, title, orderNum, columnID)
	return err
}

func DeleteProjectColumn(columnID int64) error {
	_, err := DB.Exec(`DELETE FROM project_columns WHERE id = ?`, columnID)
	return err
}

func ListColumnCards(columnID int64) ([]ProjectCard, error) {
	rows, err := DB.Query(`
		SELECT pc.id, pc.column_id, pc.project_id, pc.issue_id, pc.content, pc.order_num, pc.creator_id, u.username, pc.created_at, pc.updated_at
		FROM project_cards pc
		JOIN users u ON pc.creator_id = u.id
		WHERE pc.column_id = ?
		ORDER BY pc.order_num ASC, pc.id ASC
	`, columnID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cards []ProjectCard
	for rows.Next() {
		var c ProjectCard
		if err := rows.Scan(&c.ID, &c.ColumnID, &c.ProjectID, &c.IssueID, &c.Content, &c.OrderNum, &c.CreatorID, &c.CreatorName, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		if c.IssueID != nil {
			issue, _ := GetIssueByID(*c.IssueID)
			c.Issue = issue
		}
		cards = append(cards, c)
	}
	return cards, nil
}

func CreateProjectCard(projectID, columnID, creatorID int64, issueID *int64, content string, orderNum int) (*ProjectCard, error) {
	res, err := DB.Exec(`
		INSERT INTO project_cards (project_id, column_id, creator_id, issue_id, content, order_num)
		VALUES (?, ?, ?, ?, ?, ?)
	`, projectID, columnID, creatorID, issueID, content, orderNum)
	if err != nil {
		return nil, err
	}
	cardID, _ := res.LastInsertId()
	c := &ProjectCard{
		ID:        cardID,
		ProjectID: projectID,
		ColumnID:  columnID,
		CreatorID: creatorID,
		IssueID:   issueID,
		Content:   content,
		OrderNum:  orderNum,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	if issueID != nil {
		c.Issue, _ = GetIssueByID(*issueID)
	}
	return c, nil
}

func MoveProjectCard(cardID, targetColumnID int64, orderNum int) error {
	_, err := DB.Exec(`
		UPDATE project_cards
		SET column_id = ?, order_num = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, targetColumnID, orderNum, cardID)
	return err
}

func UpdateProjectCard(cardID int64, columnID *int64, orderNum *int, content *string) error {
	query := `UPDATE project_cards SET updated_at = CURRENT_TIMESTAMP`
	var args []any
	if columnID != nil {
		query += `, column_id = ?`
		args = append(args, *columnID)
	}
	if orderNum != nil {
		query += `, order_num = ?`
		args = append(args, *orderNum)
	}
	if content != nil {
		query += `, content = ?`
		args = append(args, *content)
	}
	query += ` WHERE id = ?`
	args = append(args, cardID)
	_, err := DB.Exec(query, args...)
	return err
}

func DeleteProjectCard(cardID int64) error {
	_, err := DB.Exec(`DELETE FROM project_cards WHERE id = ?`, cardID)
	return err
}

// Message Methods (Send Messages to Developers)

func SendMessage(senderID, recipientID int64, subject, content string) (*Message, error) {
	subject = strings.TrimSpace(subject)
	content = strings.TrimSpace(content)
	if content == "" {
		return nil, fmt.Errorf("message content cannot be empty")
	}

	res, err := DB.Exec(`
		INSERT INTO messages (sender_id, recipient_id, subject, content, status)
		VALUES (?, ?, ?, ?, 'pending')
	`, senderID, recipientID, subject, content)
	if err != nil {
		return nil, err
	}
	msgID, _ := res.LastInsertId()
	return GetMessageByID(msgID, senderID)
}

func ListInboxMessages(userID int64) ([]Message, error) {
	rows, err := DB.Query(`
		SELECT m.id, m.sender_id, su.username, su.full_name, su.avatar_url,
		       m.recipient_id, ru.username, ru.full_name, ru.avatar_url,
		       m.subject, m.content, m.status, m.is_read, m.read_at, m.created_at
		FROM messages m
		JOIN users su ON su.id = m.sender_id
		JOIN users ru ON ru.id = m.recipient_id
		WHERE m.recipient_id = ?
		ORDER BY m.created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Message
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.SenderID, &m.SenderUsername, &m.SenderFullName, &m.SenderAvatarURL,
			&m.RecipientID, &m.RecipientUsername, &m.RecipientFullName, &m.RecipientAvatarURL,
			&m.Subject, &m.Content, &m.Status, &m.IsRead, &m.ReadAt, &m.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, m)
	}
	return list, nil
}

func ListSentMessages(userID int64) ([]Message, error) {
	rows, err := DB.Query(`
		SELECT m.id, m.sender_id, su.username, su.full_name, su.avatar_url,
		       m.recipient_id, ru.username, ru.full_name, ru.avatar_url,
		       m.subject, m.content, m.status, m.is_read, m.read_at, m.created_at
		FROM messages m
		JOIN users su ON su.id = m.sender_id
		JOIN users ru ON ru.id = m.recipient_id
		WHERE m.sender_id = ?
		ORDER BY m.created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Message
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.SenderID, &m.SenderUsername, &m.SenderFullName, &m.SenderAvatarURL,
			&m.RecipientID, &m.RecipientUsername, &m.RecipientFullName, &m.RecipientAvatarURL,
			&m.Subject, &m.Content, &m.Status, &m.IsRead, &m.ReadAt, &m.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, m)
	}
	return list, nil
}

func GetMessageByID(messageID, userID int64) (*Message, error) {
	var m Message
	err := DB.QueryRow(`
		SELECT m.id, m.sender_id, su.username, su.full_name, su.avatar_url,
		       m.recipient_id, ru.username, ru.full_name, ru.avatar_url,
		       m.subject, m.content, m.status, m.is_read, m.read_at, m.created_at
		FROM messages m
		JOIN users su ON su.id = m.sender_id
		JOIN users ru ON ru.id = m.recipient_id
		WHERE m.id = ? AND (m.sender_id = ? OR m.recipient_id = ?)
	`, messageID, userID, userID).Scan(&m.ID, &m.SenderID, &m.SenderUsername, &m.SenderFullName, &m.SenderAvatarURL,
		&m.RecipientID, &m.RecipientUsername, &m.RecipientFullName, &m.RecipientAvatarURL,
		&m.Subject, &m.Content, &m.Status, &m.IsRead, &m.ReadAt, &m.CreatedAt)
	if err != nil {
		return nil, err
	}

	// Auto mark as read if recipient is accessing
	if m.RecipientID == userID && !m.IsRead {
		_ = MarkMessageRead(messageID, userID)
		m.IsRead = true
		now := time.Now()
		m.ReadAt = &now
	}

	return &m, nil
}

func AcceptMessage(messageID, recipientID int64) (*Message, error) {
	res, err := DB.Exec(`
		UPDATE messages SET status = 'accepted'
		WHERE id = ? AND recipient_id = ?
	`, messageID, recipientID)
	if err != nil {
		return nil, err
	}
	rowsAff, _ := res.RowsAffected()
	if rowsAff == 0 {
		return nil, fmt.Errorf("message not found or unauthorized")
	}
	return GetMessageByID(messageID, recipientID)
}

func RejectMessage(messageID, recipientID int64) (*Message, error) {
	msg, err := GetMessageByID(messageID, recipientID)
	if err != nil || msg == nil {
		return nil, fmt.Errorf("message not found or unauthorized")
	}

	_, err = DB.Exec(`
		UPDATE messages SET status = 'rejected'
		WHERE id = ? AND recipient_id = ?
	`, messageID, recipientID)
	if err != nil {
		return nil, err
	}

	msg.Status = "rejected"

	// Create rejection notification & system notice for sender
	declineContent := fmt.Sprintf("Your direct message request regarding \"%s\" was declined by @%s. Further replies are blocked.", msg.Subject, msg.RecipientUsername)
	_, _ = DB.Exec(`
		INSERT INTO messages (sender_id, recipient_id, subject, content, status, is_read)
		VALUES (?, ?, ?, ?, 'rejected', 0)
	`, recipientID, msg.SenderID, "Declined: "+msg.Subject, declineContent)

	CreateActivity(recipientID, msg.RecipientUsername, nil, "", "message_declined", fmt.Sprintf("Declined message request from @%s", msg.SenderUsername))

	return msg, nil
}

func MarkMessageRead(messageID, recipientID int64) error {
	_, err := DB.Exec(`
		UPDATE messages SET is_read = 1, read_at = CURRENT_TIMESTAMP
		WHERE id = ? AND recipient_id = ?
	`, messageID, recipientID)
	return err
}

func DeleteMessage(messageID, userID int64) error {
	_, err := DB.Exec(`
		DELETE FROM messages
		WHERE id = ? AND (sender_id = ? OR recipient_id = ?)
	`, messageID, userID, userID)
	return err
}

func CountUnreadMessages(userID int64) (int, error) {
	var count int
	err := DB.QueryRow(`SELECT COUNT(*) FROM messages WHERE recipient_id = ? AND is_read = 0`, userID).Scan(&count)
	return count, err
}

func SearchActiveDevelopers(excludeUserID int64, query string, limit int) ([]User, error) {
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	query = strings.TrimSpace(query)
	if query == "" {
		return []User{}, nil
	}

	var parsedID int64 = -1
	if id, err := strconv.ParseInt(query, 10, 64); err == nil {
		parsedID = id
	}

	pattern := "%" + query + "%"
	rows, err := DB.Query(`
		SELECT id, username, full_name, avatar_url, is_active, is_admin, created_at
		FROM users
		WHERE is_active = 1 AND id != ? AND (username LIKE ? OR id = ? OR full_name LIKE ?)
		ORDER BY 
			CASE 
				WHEN LOWER(username) = LOWER(?) THEN 0
				WHEN id = ? THEN 1
				WHEN LOWER(username) LIKE LOWER(?) THEN 2
				ELSE 3
			END,
			username ASC
		LIMIT ?
	`, excludeUserID, pattern, parsedID, pattern, query, parsedID, query+"%", limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Username, &u.FullName, &u.AvatarURL, &u.IsActive, &u.IsAdmin, &u.CreatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	if users == nil {
		users = []User{}
	}
	return users, nil
}

func ListActiveDevelopers(limit int) ([]User, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := DB.Query(`
		SELECT id, username, email, full_name, avatar_url, is_active, is_admin, created_at
		FROM users
		WHERE is_active = 1
		ORDER BY username ASC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.FullName, &u.AvatarURL, &u.IsActive, &u.IsAdmin, &u.CreatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, nil
}

// ============================================================================
// Session Persistence (P0)
// ============================================================================

type DBSession struct {
	Token     string    `json:"token"`
	UserID    int64     `json:"user_id"`
	Username  string    `json:"username"`
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
}

func SaveDBSession(token string, userID int64, username string, createdAt, expiresAt time.Time) error {
	if DB == nil {
		return nil
	}
	_, err := DB.Exec(`
		INSERT INTO sessions (token, user_id, username, created_at, expires_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(token) DO UPDATE SET
			user_id = excluded.user_id,
			username = excluded.username,
			expires_at = excluded.expires_at
	`, token, userID, username, createdAt, expiresAt)
	return err
}

func GetDBSession(token string) (*DBSession, error) {
	if DB == nil {
		return nil, nil
	}
	var s DBSession
	err := DB.QueryRow(`
		SELECT token, user_id, username, created_at, expires_at
		FROM sessions
		WHERE token = ?
	`, token).Scan(&s.Token, &s.UserID, &s.Username, &s.CreatedAt, &s.ExpiresAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if time.Now().After(s.ExpiresAt) {
		_ = DeleteDBSession(token)
		return nil, nil
	}
	return &s, nil
}

func DeleteDBSession(token string) error {
	if DB == nil {
		return nil
	}
	_, err := DB.Exec(`DELETE FROM sessions WHERE token = ?`, token)
	return err
}

func CleanExpiredDBSessions() error {
	if DB == nil {
		return nil
	}
	_, err := DB.Exec(`DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP`)
	return err
}

// ============================================================================
// Branch Protection (P3)
// ============================================================================

type BranchProtection struct {
	ID                int64     `json:"id"`
	RepoID            int64     `json:"repo_id"`
	BranchName        string    `json:"branch_name"`
	RequirePR         bool      `json:"require_pr"`
	RequiredApprovals int       `json:"required_approvals"`
	PreventForcePush  bool      `json:"prevent_force_push"`
	CreatedAt         time.Time `json:"created_at"`
}

func GetBranchProtection(repoID int64, branchName string) (*BranchProtection, error) {
	if DB == nil {
		return nil, nil
	}
	var bp BranchProtection
	err := DB.QueryRow(`
		SELECT id, repo_id, branch_name, require_pr, required_approvals, prevent_force_push, created_at
		FROM branch_protections
		WHERE repo_id = ? AND branch_name = ?
	`, repoID, branchName).Scan(&bp.ID, &bp.RepoID, &bp.BranchName, &bp.RequirePR, &bp.RequiredApprovals, &bp.PreventForcePush, &bp.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &bp, nil
}

func ListBranchProtections(repoID int64) ([]BranchProtection, error) {
	if DB == nil {
		return nil, nil
	}
	rows, err := DB.Query(`
		SELECT id, repo_id, branch_name, require_pr, required_approvals, prevent_force_push, created_at
		FROM branch_protections
		WHERE repo_id = ?
		ORDER BY branch_name ASC
	`, repoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []BranchProtection
	for rows.Next() {
		var bp BranchProtection
		if err := rows.Scan(&bp.ID, &bp.RepoID, &bp.BranchName, &bp.RequirePR, &bp.RequiredApprovals, &bp.PreventForcePush, &bp.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, bp)
	}
	return list, nil
}

func SetBranchProtection(repoID int64, branchName string, requirePR bool, requiredApprovals int, preventForcePush bool) (*BranchProtection, error) {
	if DB == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	if requiredApprovals < 0 {
		requiredApprovals = 0
	}
	_, err := DB.Exec(`
		INSERT INTO branch_protections (repo_id, branch_name, require_pr, required_approvals, prevent_force_push)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(repo_id, branch_name) DO UPDATE SET
			require_pr = excluded.require_pr,
			required_approvals = excluded.required_approvals,
			prevent_force_push = excluded.prevent_force_push
	`, repoID, branchName, requirePR, requiredApprovals, preventForcePush)
	if err != nil {
		return nil, err
	}
	return GetBranchProtection(repoID, branchName)
}

func DeleteBranchProtection(repoID int64, branchName string) error {
	if DB == nil {
		return nil
	}
	_, err := DB.Exec(`DELETE FROM branch_protections WHERE repo_id = ? AND branch_name = ?`, repoID, branchName)
	return err
}

// ============================================================================
// Releases & Assets (P3)
// ============================================================================

type Release struct {
	ID            int64          `json:"id"`
	RepoID        int64          `json:"repo_id"`
	PublisherID   int64          `json:"publisher_id"`
	PublisherName string         `json:"publisher_name"`
	TagName       string         `json:"tag_name"`
	Title         string         `json:"title"`
	Note          string         `json:"note"`
	IsDraft       bool           `json:"is_draft"`
	IsPrerelease  bool           `json:"is_prerelease"`
	CreatedAt     time.Time      `json:"created_at"`
	PublishedAt   *time.Time     `json:"published_at"`
	Assets        []ReleaseAsset `json:"assets"`
}

type ReleaseAsset struct {
	ID            int64     `json:"id"`
	ReleaseID     int64     `json:"release_id"`
	Name          string    `json:"name"`
	SizeBytes     int64     `json:"size_bytes"`
	DownloadCount int64     `json:"download_count"`
	FilePath      string    `json:"file_path,omitempty"`
	ContentType   string    `json:"content_type"`
	CreatedAt     time.Time `json:"created_at"`
}

func CreateRelease(repoID, publisherID int64, tagName, title, note string, isDraft, isPrerelease bool) (*Release, error) {
	if DB == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	res, err := DB.Exec(`
		INSERT INTO releases (repo_id, publisher_id, tag_name, title, note, is_draft, is_prerelease, published_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
	`, repoID, publisherID, tagName, title, note, isDraft, isPrerelease)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return GetReleaseByID(id)
}

func GetReleaseByID(id int64) (*Release, error) {
	if DB == nil {
		return nil, nil
	}
	var r Release
	var pubName sql.NullString
	err := DB.QueryRow(`
		SELECT r.id, r.repo_id, r.publisher_id, u.username, r.tag_name, r.title, r.note,
		       r.is_draft, r.is_prerelease, r.created_at, r.published_at
		FROM releases r
		LEFT JOIN users u ON u.id = r.publisher_id
		WHERE r.id = ?
	`, id).Scan(&r.ID, &r.RepoID, &r.PublisherID, &pubName, &r.TagName, &r.Title, &r.Note,
		&r.IsDraft, &r.IsPrerelease, &r.CreatedAt, &r.PublishedAt)
	if err != nil {
		return nil, err
	}
	r.PublisherName = pubName.String
	assets, _ := ListReleaseAssets(r.ID)
	r.Assets = assets
	return &r, nil
}

func ListReleases(repoID int64) ([]Release, error) {
	if DB == nil {
		return nil, nil
	}
	rows, err := DB.Query(`
		SELECT r.id, r.repo_id, r.publisher_id, u.username, r.tag_name, r.title, r.note,
		       r.is_draft, r.is_prerelease, r.created_at, r.published_at
		FROM releases r
		LEFT JOIN users u ON u.id = r.publisher_id
		WHERE r.repo_id = ?
		ORDER BY r.created_at DESC
	`, repoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Release
	for rows.Next() {
		var r Release
		var pubName sql.NullString
		if err := rows.Scan(&r.ID, &r.RepoID, &r.PublisherID, &pubName, &r.TagName, &r.Title, &r.Note,
			&r.IsDraft, &r.IsPrerelease, &r.CreatedAt, &r.PublishedAt); err != nil {
			return nil, err
		}
		r.PublisherName = pubName.String
		assets, _ := ListReleaseAssets(r.ID)
		r.Assets = assets
		list = append(list, r)
	}
	return list, nil
}

func DeleteRelease(releaseID int64) error {
	if DB == nil {
		return nil
	}
	_, err := DB.Exec(`DELETE FROM releases WHERE id = ?`, releaseID)
	return err
}

func CreateReleaseAsset(releaseID int64, name string, sizeBytes int64, filePath, contentType string) (*ReleaseAsset, error) {
	if DB == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	res, err := DB.Exec(`
		INSERT INTO release_assets (release_id, name, size_bytes, file_path, content_type)
		VALUES (?, ?, ?, ?, ?)
	`, releaseID, name, sizeBytes, filePath, contentType)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return GetReleaseAsset(id)
}

func GetReleaseAsset(assetID int64) (*ReleaseAsset, error) {
	if DB == nil {
		return nil, nil
	}
	var a ReleaseAsset
	err := DB.QueryRow(`
		SELECT id, release_id, name, size_bytes, download_count, file_path, content_type, created_at
		FROM release_assets
		WHERE id = ?
	`, assetID).Scan(&a.ID, &a.ReleaseID, &a.Name, &a.SizeBytes, &a.DownloadCount, &a.FilePath, &a.ContentType, &a.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func ListReleaseAssets(releaseID int64) ([]ReleaseAsset, error) {
	if DB == nil {
		return nil, nil
	}
	rows, err := DB.Query(`
		SELECT id, release_id, name, size_bytes, download_count, file_path, content_type, created_at
		FROM release_assets
		WHERE release_id = ?
		ORDER BY id ASC
	`, releaseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []ReleaseAsset
	for rows.Next() {
		var a ReleaseAsset
		if err := rows.Scan(&a.ID, &a.ReleaseID, &a.Name, &a.SizeBytes, &a.DownloadCount, &a.FilePath, &a.ContentType, &a.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, a)
	}
	return list, nil
}

func IncrementReleaseAssetDownloads(assetID int64) error {
	if DB == nil {
		return nil
	}
	_, err := DB.Exec(`UPDATE release_assets SET download_count = download_count + 1 WHERE id = ?`, assetID)
	return err
}


