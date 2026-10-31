package database

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
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
		location TEXT NOT NULL DEFAULT '',
		website TEXT NOT NULL DEFAULT '',
		bio TEXT NOT NULL DEFAULT '',
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
		pages_branch TEXT NOT NULL DEFAULT 'gh-pages',
		pages_folder TEXT NOT NULL DEFAULT '/',
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
	`

	if _, err := db.Exec(schema); err != nil {
		return err
	}

	// Migration columns for existing databases
	_, _ = db.Exec(`ALTER TABLE repositories ADD COLUMN enable_wiki BOOLEAN NOT NULL DEFAULT 1`)
	_, _ = db.Exec(`ALTER TABLE repositories ADD COLUMN enable_pages BOOLEAN NOT NULL DEFAULT 0`)
	_, _ = db.Exec(`ALTER TABLE repositories ADD COLUMN pages_branch TEXT NOT NULL DEFAULT 'gh-pages'`)
	_, _ = db.Exec(`ALTER TABLE repositories ADD COLUMN pages_folder TEXT NOT NULL DEFAULT '/'`)

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
		SELECT id, username, email, password_hash, full_name, avatar_url, is_admin, is_active, location, website, bio, created_at, updated_at
		FROM users WHERE id = ?
	`, id).Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.FullName, &u.AvatarURL, &u.IsAdmin, &u.IsActive, &u.Location, &u.Website, &u.Bio, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return u, nil
}

func GetUserByUsername(username string) (*User, error) {
	u := &User{}
	err := DB.QueryRow(`
		SELECT id, username, email, password_hash, full_name, avatar_url, is_admin, is_active, location, website, bio, created_at, updated_at
		FROM users WHERE username = ? COLLATE NOCASE
	`, strings.TrimSpace(username)).Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.FullName, &u.AvatarURL, &u.IsAdmin, &u.IsActive, &u.Location, &u.Website, &u.Bio, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return u, nil
}

func GetUserByEmail(email string) (*User, error) {
	u := &User{}
	err := DB.QueryRow(`
		SELECT id, username, email, password_hash, full_name, avatar_url, is_admin, is_active, location, website, bio, created_at, updated_at
		FROM users WHERE email = ? COLLATE NOCASE
	`, strings.TrimSpace(email)).Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.FullName, &u.AvatarURL, &u.IsAdmin, &u.IsActive, &u.Location, &u.Website, &u.Bio, &u.CreatedAt, &u.UpdatedAt)
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
		SELECT id, username, email, full_name, avatar_url, is_admin, is_active, location, website, bio, created_at, updated_at
		FROM users ORDER BY id ASC LIMIT ? OFFSET ?
	`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*User
	for rows.Next() {
		u := &User{}
		if err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.FullName, &u.AvatarURL, &u.IsAdmin, &u.IsActive, &u.Location, &u.Website, &u.Bio, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

func UpdateUserAdmin(userID int64, isAdmin bool) error {
	_, err := DB.Exec(`UPDATE users SET is_admin = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, isAdmin, userID)
	return err
}

func UpdateUserStatus(userID int64, isActive bool) error {
	_, err := DB.Exec(`UPDATE users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, isActive, userID)
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

	var list []*AccessToken
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

	var list []*SSHKey
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
	name = strings.TrimSpace(name)
	res, err := DB.Exec(`
		INSERT INTO repositories (owner_id, name, description, is_private, default_branch, enable_wiki, enable_pages, pages_branch, pages_folder)
		VALUES (?, ?, ?, ?, 'main', 1, 0, 'gh-pages', '/')
	`, ownerID, name, description, isPrivate)
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
		       r.enable_wiki, r.enable_pages, r.pages_branch, r.pages_folder, r.created_at, r.updated_at
		FROM repositories r
		JOIN users u ON u.id = r.owner_id
		WHERE r.id = ?
	`, id).Scan(&r.ID, &r.OwnerID, &r.OwnerName, &r.Name, &r.Description, &r.IsPrivate, &r.IsFork, &r.ForkParentID,
		&r.DefaultBranch, &r.NumStars, &r.NumForks, &r.NumWatches, &r.NumIssues, &r.NumPulls, &r.SizeBytes, &r.IsArchived,
		&r.EnableWiki, &r.EnablePages, &r.PagesBranch, &r.PagesFolder, &r.CreatedAt, &r.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return r, nil
}

func GetRepositoryByName(ownerUsername, repoName string) (*Repository, error) {
	r := &Repository{}
	err := DB.QueryRow(`
		SELECT r.id, r.owner_id, u.username, r.name, r.description, r.is_private, r.is_fork, r.fork_parent_id,
		       r.default_branch, r.num_stars, r.num_forks, r.num_watches, r.num_issues, r.num_pulls, r.size_bytes, r.is_archived,
		       r.enable_wiki, r.enable_pages, r.pages_branch, r.pages_folder, r.created_at, r.updated_at
		FROM repositories r
		JOIN users u ON u.id = r.owner_id
		WHERE u.username = ? COLLATE NOCASE AND r.name = ? COLLATE NOCASE
	`, strings.TrimSpace(ownerUsername), strings.TrimSpace(repoName)).Scan(&r.ID, &r.OwnerID, &r.OwnerName, &r.Name, &r.Description, &r.IsPrivate, &r.IsFork, &r.ForkParentID,
		&r.DefaultBranch, &r.NumStars, &r.NumForks, &r.NumWatches, &r.NumIssues, &r.NumPulls, &r.SizeBytes, &r.IsArchived,
		&r.EnableWiki, &r.EnablePages, &r.PagesBranch, &r.PagesFolder, &r.CreatedAt, &r.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return r, nil
}

func ListRepositories(limit, offset int, publicOnly bool) ([]*Repository, error) {
	query := `
		SELECT r.id, r.owner_id, u.username, r.name, r.description, r.is_private, r.is_fork, r.fork_parent_id,
		       r.default_branch, r.num_stars, r.num_forks, r.num_watches, r.num_issues, r.num_pulls, r.size_bytes, r.is_archived,
		       r.enable_wiki, r.enable_pages, r.pages_branch, r.pages_folder, r.created_at, r.updated_at
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
			&r.EnableWiki, &r.EnablePages, &r.PagesBranch, &r.PagesFolder, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, r)
	}
	return list, rows.Err()
}

func ListUserRepositories(userID int64, includePrivate bool) ([]*Repository, error) {
	query := `
		SELECT r.id, r.owner_id, u.username, r.name, r.description, r.is_private, r.is_fork, r.fork_parent_id,
		       r.default_branch, r.num_stars, r.num_forks, r.num_watches, r.num_issues, r.num_pulls, r.size_bytes, r.is_archived,
		       r.enable_wiki, r.enable_pages, r.pages_branch, r.pages_folder, r.created_at, r.updated_at
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
			&r.EnableWiki, &r.EnablePages, &r.PagesBranch, &r.PagesFolder, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, r)
	}
	return list, rows.Err()
}

func UpdateRepositorySettings(repoID int64, description string, isPrivate, enableWiki, enablePages bool, pagesBranch, pagesFolder string) error {
	if pagesBranch == "" {
		pagesBranch = "gh-pages"
	}
	if pagesFolder == "" {
		pagesFolder = "/"
	}
	_, err := DB.Exec(`
		UPDATE repositories 
		SET description = ?, is_private = ?, enable_wiki = ?, enable_pages = ?, pages_branch = ?, pages_folder = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, description, isPrivate, enableWiki, enablePages, pagesBranch, pagesFolder, repoID)
	return err
}

func CountRepositories() (int, error) {
	var count int
	err := DB.QueryRow(`SELECT COUNT(*) FROM repositories`).Scan(&count)
	return count, err
}

func DeleteRepository(repoID int64) error {
	_, err := DB.Exec(`DELETE FROM repositories WHERE id = ?`, repoID)
	return err
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

func CanUserAccessRepo(user *User, repo *Repository, writeRequired bool) bool {
	if !repo.IsPrivate && !writeRequired {
		return true
	}
	if user == nil {
		return false
	}
	if user.IsAdmin || user.ID == repo.OwnerID {
		return true
	}

	var mode string
	err := DB.QueryRow(`SELECT mode FROM collaborators WHERE repo_id = ? AND user_id = ?`, repo.ID, user.ID).Scan(&mode)
	if err == nil {
		if !writeRequired {
			return true
		}
		return mode == "write" || mode == "admin"
	}
	return false
}

// Issue Methods

func CreateIssue(repoID, posterID int64, title, content string, isPull bool) (*Issue, error) {
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
		INSERT INTO issues (repo_id, index_number, poster_id, title, content, is_pull)
		VALUES (?, ?, ?, ?, ?, ?)
	`, repoID, nextIndex, posterID, title, content, isPull)
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
	err := DB.QueryRow(`
		SELECT i.id, i.repo_id, u.username, r.name, i.index_number, i.poster_id, pu.username, pu.avatar_url,
		       i.title, i.content, i.is_pull, i.is_closed, i.closed_at,
		       (SELECT COUNT(*) FROM comments c WHERE c.issue_id = i.id),
		       i.created_at, i.updated_at
		FROM issues i
		JOIN repositories r ON r.id = i.repo_id
		JOIN users u ON u.id = r.owner_id
		JOIN users pu ON pu.id = i.poster_id
		WHERE i.id = ?
	`, id).Scan(&iss.ID, &iss.RepoID, &iss.RepoOwner, &iss.RepoName, &iss.IndexNumber, &iss.PosterID, &iss.PosterName, &iss.PosterAvatar,
		&iss.Title, &iss.Content, &iss.IsPull, &iss.IsClosed, &iss.ClosedAt, &iss.NumComments, &iss.CreatedAt, &iss.UpdatedAt)
	if err != nil {
		return nil, err
	}
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
	query := `
		SELECT i.id, i.repo_id, u.username, r.name, i.index_number, i.poster_id, pu.username, pu.avatar_url,
		       i.title, i.content, i.is_pull, i.is_closed, i.closed_at,
		       (SELECT COUNT(*) FROM comments c WHERE c.issue_id = i.id),
		       i.created_at, i.updated_at
		FROM issues i
		JOIN repositories r ON r.id = i.repo_id
		JOIN users u ON u.id = r.owner_id
		JOIN users pu ON pu.id = i.poster_id
		WHERE i.repo_id = ? AND i.is_pull = ?
	`
	if state == "closed" {
		query += ` AND i.is_closed = 1 `
	} else if state == "open" {
		query += ` AND i.is_closed = 0 `
	}
	query += ` ORDER BY i.index_number DESC `

	rows, err := DB.Query(query, repoID, isPull)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []*Issue
	for rows.Next() {
		iss := &Issue{}
		if err := rows.Scan(&iss.ID, &iss.RepoID, &iss.RepoOwner, &iss.RepoName, &iss.IndexNumber, &iss.PosterID, &iss.PosterName, &iss.PosterAvatar,
			&iss.Title, &iss.Content, &iss.IsPull, &iss.IsClosed, &iss.ClosedAt, &iss.NumComments, &iss.CreatedAt, &iss.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, iss)
	}
	return list, rows.Err()
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
	issue, err := CreateIssue(baseRepoID, posterID, title, content, true)
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

	var list []*Activity
	for rows.Next() {
		act := &Activity{}
		if err := rows.Scan(&act.ID, &act.UserID, &act.Username, &act.RepoID, &act.RepoName, &act.OpType, &act.Content, &act.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, act)
	}
	return list, rows.Err()
}

