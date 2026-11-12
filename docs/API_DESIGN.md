# ProGit REST API Specification (v1)

Base URL: `/api/v1`

---

## 1. Authentication & Security

API clients authenticate via:
1. **Bearer Token Header**:
   ```http
   Authorization: Bearer <personal_access_token>
   ```
2. **Session Cookie**:
   Browser requests automatically send the HttpOnly session cookie (`progit_session`).

Rate Limiting:
Authentication endpoints (`/api/v1/auth/login`, `/api/v1/auth/register`) are rate-limited on a per-IP basis (120 requests/minute) with standard HTTP 429 responses.

---

## 2. API Endpoints

### 2.1 Authentication & Profile
- `GET /api/v1/auth/providers` - Get status of configured authentication providers (e.g. `{"local": true, "oidc": {"enabled": true, "provider": "google", "display_name": "Google Workspace"}}`).
- `GET /api/v1/auth/oidc/login` - Initiate OpenID Connect SSO authentication flow. Generates secure CSRF `state` and redirects (HTTP 307) client to the identity provider authorization URL.
- `GET /api/v1/auth/oidc/callback?code={code}&state={state}` - Handles OIDC / OAuth2 callback, validates cryptographic `state` against cookie, exchanges authorization code for user info, performs JIT provisioning, and sets session cookie.
- `POST /api/v1/auth/register` - Create a new user account.
  - Body: `{"username": "alice", "email": "alice@example.com", "password": "securepassword", "full_name": "Alice Dev"}`
- `POST /api/v1/auth/login` - Authenticate and create a session.
  - Body: `{"username": "alice", "password": "securepassword"}`
- `POST /api/v1/auth/logout` - Clear user session cookie.
- `GET /api/v1/auth/me` - Get currently authenticated user profile.
- `GET /api/v1/users/:username` - Get public profile, stats, and repositories for a user.

### 2.2 User Settings & Credentials
- `PUT /api/v1/user/settings` - Update user profile metadata (bio, location, website, full_name).
- `PUT /api/v1/user/password` - Change password (requires `old_password` and `new_password`).
- `GET /api/v1/user/tokens` - List user's personal access tokens.
- `POST /api/v1/user/tokens` - Create a new personal access token.
  - Body: `{"name": "ci-token", "scopes": "repo,user"}`
- `DELETE /api/v1/user/tokens/:id` - Revoke personal access token.
- `GET /api/v1/user/keys` - List SSH public keys.
- `POST /api/v1/user/keys` - Add SSH public key.
  - Body: `{"title": "Work Laptop", "key": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI..."}`
- `DELETE /api/v1/user/keys/:id` - Remove SSH public key.

### 2.3 Repositories
- `GET /api/v1/repos` - List repositories (filter by `?owner=username` or keyword search `?q=query`).
- `GET /api/v1/repos/search?q={query}&limit=20&page=1` - Search repositories across name, description, and owner username with access control scoping (public repositories visible to all; private repositories visible strictly to owner, collaborators, and organization members).
- `GET /api/v1/explore?q={query}` - Public and authorized repository exploration with keyword search.
- `POST /api/v1/repos` - Create a new repository.
  - Body: `{"name": "my-project", "description": "Demo project", "private": false, "auto_init": true, "default_branch": "main"}`
- `GET /api/v1/repos/:owner/:repo` - Retrieve repository metadata, permissions (`admin`, `write`, `read`, `download`, `view_only`), clone URLs (omitted when `download` is false), and stats.
- `GET /api/v1/repos/:owner/:repo/archive?ref={branch_or_tag}&format=zip` - Download a ZIP archive of the specified branch, tag, or commit. Returns `403 Forbidden` when downloads are restricted for the caller or repository.
- `POST /api/v1/repos/:owner/:repo/star` - Star or unstar a repository.

### 2.4 Code Browsing, Branches & Commits
- `GET /api/v1/repos/:owner/:repo/branches` - List all Git branches. Optional query `?detail=true` returns commit message, author, and timestamp.
- `POST /api/v1/repos/:owner/:repo/branches` - Create a new branch.
  - Body: `{"branch_name": "feature-x", "base_ref": "main"}`
- `DELETE /api/v1/repos/:owner/:repo/branches/:branch` - Delete non-default branch (default branch deletion is blocked).
- `GET /api/v1/repos/:owner/:repo/tags` - List tags.
- `GET /api/v1/repos/:owner/:repo/commits?ref=main` - Get commit history log.
- `GET /api/v1/repos/:owner/:repo/commits/:sha` - Get commit details and unified diffs.
- `GET /api/v1/repos/:owner/:repo/tree?ref=main&path=src` - List files/subdirectories at a path.
- `GET /api/v1/repos/:owner/:repo/blob?ref=main&path=README.md` - Get file content, size, and encoding.
- `GET /api/v1/repos/:owner/:repo/raw?ref=main&path=image.png` - Stream raw file bytes with appropriate MIME type (`403 Forbidden` when downloads are restricted).
- `POST /api/v1/repos/:owner/:repo/contents/:path` - Create or edit a file online and commit to a branch.
  - Body: `{"content": "...", "message": "commit message", "branch": "main"}`
- `DELETE /api/v1/repos/:owner/:repo/contents/:path` - Delete a file online.
  - Body: `{"message": "delete file", "branch": "main"}`
- `POST /api/v1/repos/:owner/:repo/upload` - Multipart form file and directory upload.

### 2.5 Collaborators & Permissions
- `GET /api/v1/repos/:owner/:repo/collaborators` - List repository collaborators and permission levels.
- `PUT /api/v1/repos/:owner/:repo/collaborators/:username` - Add or update collaborator.
  - Body: `{"mode": "write"}` (`view_only`, `read`, `write`, `admin`). `view_only` grants Web UI browsing while blocking Download ZIP, Git clone/pull, raw file downloads, release asset downloads, and forking.
- `DELETE /api/v1/repos/:owner/:repo/collaborators/:username` - Revoke collaborator access.

### 2.6 Issues & Assignees
- `GET /api/v1/repos/:owner/:repo/issues?state=open&assignee=alice` - List repository issues, filterable by state and assignee.
- `POST /api/v1/repos/:owner/:repo/issues` - Create an issue.
  - Body: `{"title": "Bug in parser", "content": "Steps to reproduce..."}`
- `GET /api/v1/repos/:owner/:repo/issues/:index` - Get single issue details, assignee, labels, and state.
- `PATCH /api/v1/repos/:owner/:repo/issues/:index` - Update issue status (open/closed) or title.
- `GET /api/v1/repos/:owner/:repo/issues/:index/comments` - List conversation comments.
- `POST /api/v1/repos/:owner/:repo/issues/:index/comments` - Post comment on issue.
- `GET /api/v1/repos/:owner/:repo/assignees` - Security-scoped endpoint returning only eligible assignees (repository owner and confirmed collaborators).
- `PUT /api/v1/repos/:owner/:repo/issues/:index/assignee` - Assign issue to a collaborator or owner.
  - Body: `{"assignee": "alice"}` (Security enforcement rejects non-collaborators with HTTP 400).

### 2.7 Pull Requests & Code Reviews
- `GET /api/v1/repos/:owner/:repo/pulls?state=open` - List pull requests.
- `POST /api/v1/repos/:owner/:repo/pulls` - Open a pull request.
  - Body: `{"title": "Feature X", "content": "PR summary", "head": "feature", "base": "main"}`
- `GET /api/v1/repos/:owner/:repo/pulls/:index` - Get PR details and mergeable status.
- `GET /api/v1/repos/:owner/:repo/pulls/:index/diff` - Get unified diff between head and base branch.
- `GET /api/v1/repos/:owner/:repo/pulls/:index/reviews` - List PR review comments.
- `POST /api/v1/repos/:owner/:repo/pulls/:index/reviews` - Submit review comment.
  - Body: `{"content": "LGTM!", "review_state": "approved"}`
- `POST /api/v1/repos/:owner/:repo/pulls/:index/merge` - Merge pull request directly into repository.
  - Body: `{"merge_style": "merge"}` (`merge`, `squash`, `rebase`)

### 2.8 Repository Forking
- `POST /api/v1/repos/:owner/:repo/forks` - Fork repository into authenticated user account or organization.
- `GET /api/v1/repos/:owner/:repo/forks` - List all downstream forks of the repository.

### 2.9 Webhooks & Delivery Tracking
- `GET /api/v1/repos/:owner/:repo/hooks` - List registered webhooks.
- `POST /api/v1/repos/:owner/:repo/hooks` - Register a webhook.
  - Body: `{"url": "https://example.com/webhook", "secret": "hmac_secret", "content_type": "json", "events": "push,issues,pull_request", "is_active": true}`
- `GET /api/v1/repos/:owner/:repo/hooks/:id` - Get webhook details.
- `PATCH /api/v1/repos/:owner/:repo/hooks/:id` - Update webhook configuration.
- `DELETE /api/v1/repos/:owner/:repo/hooks/:id` - Delete webhook.
- `POST /api/v1/repos/:owner/:repo/hooks/:id/test` - Trigger an immediate test `ping` delivery.
- `GET /api/v1/repos/:owner/:repo/hooks/:id/deliveries` - Inspect historical delivery log (event, request/response headers, status code, latency).

Headers dispatched on deliveries:
- `X-ProGit-Event`: `push` | `issues` | `pull_request` | `ping`
- `X-ProGit-Delivery`: Unique delivery UUID
- `X-Hub-Signature-256`: `sha256=<hmac_sha256_hex>`
- `X-ProGit-Signature`: `sha256=<hmac_sha256_hex>`

### 2.10 Danger Zone & Repository Governance
- `POST /api/v1/repos/:owner/:repo/visibility` - Toggle visibility between Public and Private.
  - Body: `{"is_private": true}`
- `POST /api/v1/repos/:owner/:repo/archive` - Archive or unarchive repository. When archived, repository is read-only (rejects all pushes, file edits, and issue creations with HTTP 400).
  - Body: `{"archive": true}`
- `POST /api/v1/repos/:owner/:repo/transfer` - Transfer repository ownership to another user or organization.
  - Body: `{"new_owner": "dev_alice"}`
- `DELETE /api/v1/repos/:owner/:repo` - Permanently delete repository and its bare Git storage.

### 2.11 Developer Direct Messaging & Consent
- `GET /api/v1/developers?q={query}` - Secure search for active platform developers by username or ID (requires authentication; returns `[]` if `q` is empty to prevent account enumeration).
- `POST /api/v1/messages` - Send a message request to a developer by username or numeric ID.
  - Body: `{"recipient_username": "dev_bob", "subject": "Sprint Targets", "content": "Let's review the API spec."}`
  - Returns `404 Not Found: "User does not exist"` if recipient not found.
  - Returns `403 Forbidden` if recipient previously declined message requests from this account.
- `POST /api/v1/messages/:id/accept` - Accept a pending message request (recipient only), unlocking reply capabilities.
- `POST /api/v1/messages/:id/reject` - Decline a message request (recipient only). Automatically notifies sender and blocks future unsolicited messages.
- `GET /api/v1/messages/inbox` - List received messages.
- `GET /api/v1/messages/sent` - List sent messages outbox.
- `GET /api/v1/messages/unread-count` - Get count of unread messages (`{"unread_count": N}`).
- `GET /api/v1/messages/:id` - View single message.
- `PATCH /api/v1/messages/:id/read` - Mark message as read.
- `DELETE /api/v1/messages/:id` - Delete message from inbox/outbox.

### 2.12 Projects & Kanban Boards
- `GET /api/v1/repos/:owner/:repo/projects` - List repository project boards.
- `POST /api/v1/repos/:owner/:repo/projects` - Create project board.
  - Body: `{"title": "Sprint 1", "description": "Q4 objectives"}`
- `GET /api/v1/repos/:owner/:repo/projects/:id` - Get board columns, cards, and progress metrics (`total_cards`, `done_cards`).
- `POST /api/v1/repos/:owner/:repo/projects/:id/columns` - Add custom column.
  - Body: `{"title": "In Review"}`
- `PUT /api/v1/repos/:owner/:repo/projects/:id/columns/:col_id` - Rename column.
  - Body: `{"title": "Backlog"}`
- `POST /api/v1/repos/:owner/:repo/projects/:id/cards` - Add task card to column.
  - Body: `{"column_id": 1, "content": "Refactor auth middleware"}`
- `PUT /api/v1/repos/:owner/:repo/projects/:id/cards/:card_id` - Move card to column or update note content.
  - Body: `{"column_id": 3, "content": "Updated note"}`
- `DELETE /api/v1/repos/:owner/:repo/projects/:id/cards/:card_id` - Delete card.

### 2.13 Git-Backed Wiki Engine
- `GET /api/v1/repos/:owner/:repo/wiki/pages` - List all wiki pages. Returns `[]` if uninitialized. Returns `403 Forbidden` if `enable_wiki` is disabled.
- `GET /api/v1/repos/:owner/:repo/wiki/pages/:slug` - Get wiki page content and metadata. Returns `404 Not Found` if page or wiki repository does not exist. Returns `403 Forbidden` if disabled.
- `POST /api/v1/repos/:owner/:repo/wiki/pages` - Create or update wiki page with commit message. Initial creation automatically initializes the bare Git repository with the user's initial commit. Requires write permissions. Returns `403 Forbidden` if disabled.
  - Body: `{"slug": "Home", "title": "Home", "content": "# Architecture Overview...", "message": "Initial docs"}`
- `DELETE /api/v1/repos/:owner/:repo/wiki/pages/:slug` - Delete wiki page. Requires write permissions. Returns `403 Forbidden` if disabled.
- `GET /api/v1/repos/:owner/:repo/wiki/pages/:slug/history` - Get revision history for a wiki page. Returns `403 Forbidden` if disabled.
- `PATCH /api/v1/repos/:owner/:repo/settings` - Update repository settings including `description`, `default_branch` (validates target branch on disk, updates bare repo `HEAD` symbolic ref & database), `is_private`, `enable_wiki: boolean`, `enable_pages: boolean`, `pages_branch`, `pages_folder`, and `allow_download_and_pulls: boolean` (disables ZIP/Clone/Raw/Fork for non-write users and disables Pull Requests/Compare repo-wide with `403 Forbidden`). Requires admin permissions.

### 2.14 ProGit Pages Hosting
- `GET /api/v1/repos/:owner/:repo/pages` - Inspect ProGit Pages configuration (`enable_pages`, `pages_branch`, `pages_folder`, `pages_url`, `branches`). Requires repository owner or administrator privileges (`401 Unauthorized` / `403 Forbidden` for non-owners; `404` if private and unauthorized).
- `POST /api/v1/repos/:owner/:repo/pages` - Enable, disable, or configure ProGit Pages (`{"enable_pages": true, "pages_branch": "main", "pages_folder": "/docs"}`). Requires repository owner or administrator privileges.
- `GET /pages/:owner/:repo/` - Static site delivery with automatic Markdown rendering. When enabled, public repositories are accessible to all visitors (`pages_url` is returned in `GET /api/v1/repos/:owner/:repo`); private repositories require repo read access.

### 2.15 System Telemetry & Administrative APIs

All administrative endpoints require **Super Administrator privileges** (`is_admin = true`). Requests must provide either an `Authorization: Bearer <admin_token>` header with `admin` scope or a valid Super Admin session cookie. Non-admin or unauthenticated requests are rejected with `401 Unauthorized` or `403 Forbidden`.

#### 1. System Telemetry & Statistics
- `GET /api/health` - Liveness & Health check (verifies HTTP, SQLite WAL, and Repository storage).
- `GET /api/ready` - Readiness check (returns 200 OK when server is accepting traffic).
- `GET /api/v1/admin/stats` - Super admin telemetry and server statistics.
  - **Response (200 OK)**:
    ```json
    {
      "users_count": 42,
      "repositories_count": 87,
      "uptime": "14h22m10s",
      "database_path": "./data/progit.db",
      "repositories_path": "./data/repositories",
      "ssh_enabled": true,
      "ssh_port": 2222,
      "domain": "git.company.com",
      "http_port": 3000,
      "https_port": 3443,
      "protocol": "https",
      "is_https": true,
      "enable_acme": false,
      "generate_local_cert": true,
      "root_url": "https://git.company.com/",
      "app_name": "ProGit Enterprise",
      "go_version": "go1.24.0",
      "num_goroutines": 38,
      "memory_alloc_mb": 18.42,
      "memory_sys_mb": 42.15,
      "active_sessions_count": 6,
      "install_locked": true,
      "default_branch": "main",
      "default_repo_max_creation_limit": -1,
      "default_org_max_creation_limit": -1
    }
    ```

#### 2. User Account Administration
- `GET /api/v1/admin/users` - List or search registered user accounts with administrative status and creation limits.
  - **Query Parameters**: `q` (optional search keyword matching `username`, `email`, or `full_name`), `limit` (default: 100, max: 500), `offset` (default: 0).
  - **Response (200 OK)**: Array of User objects:
    ```json
    [
      {
        "id": 1,
        "username": "admin",
        "email": "admin@company.com",
        "full_name": "Super Admin",
        "is_admin": true,
        "is_active": true,
        "can_download": true,
        "max_repo_creation": -1,
        "max_org_creation": -1,
        "num_repos": 12,
        "num_orgs": 3,
        "created_at": "2026-10-30T10:00:00Z"
      }
    ]
    ```
- `POST /api/v1/admin/users` - Create a new user account with initial role, `can_download` flag, and creation limits.
  - **Request Body**:
    ```json
    {
      "username": "developer1",
      "email": "dev1@company.com",
      "password": "TemporaryPassword123!",
      "full_name": "Developer One",
      "is_admin": false,
      "can_download": true,
      "max_repo_creation": 10,
      "max_org_creation": 2
    }
    ```
  - **Response (201 Created)**: Created User object.
- `PATCH /api/v1/admin/users/:id` - Update user administrative permissions, active state, `can_download` restriction, or creation limits.
  - **Request Body**:
    ```json
    {
      "is_admin": true,
      "is_active": true,
      "can_download": true,
      "max_repo_creation": 20,
      "max_org_creation": 5
    }
    ```
  - **Response (200 OK)**: Updated User object.
  - *Safety Guard*: Super Admins cannot demote (`is_admin: false`), deactivate (`is_active: false`), or restrict downloads (`can_download: false`) on their own account.
- `DELETE /api/v1/admin/users/:id` - Permanently delete a user account, revoke all tokens, and purge their repository directory on disk (`data/repositories/:username/`).
  - **Response (200 OK)**: `{"message": "User deleted successfully"}`.
  - *Safety Guard*: Super Admins cannot delete their own account.

#### 3. Repository Administration
- `GET /api/v1/admin/repos` - List all repositories across all users and organizations on the instance (including private repos).
  - **Query Parameters**: `limit` (default: 100), `offset` (default: 0).
  - **Response (200 OK)**: Array of Repository objects.
- `DELETE /api/v1/admin/repos/:id` - Permanently delete any repository across the instance and remove its bare Git storage directory.
  - **Response (200 OK)**: `{"message": "Repository deleted successfully"}`.

#### 4. System Maintenance & Database Operations
- `POST /api/v1/admin/maintenance` - Execute database and storage maintenance tasks.
  - **Request Body**:
    ```json
    {
      "operation": "checkpoint_wal"
    }
    ```
  - **Supported Operations**:
    - `"checkpoint_wal"`: Flushes and truncates SQLite Write-Ahead Log journal (`PRAGMA wal_checkpoint(TRUNCATE)`), synchronizing memory to disk.
    - `"vacuum"`: Rebuilds database pages and reclaims fragmented disk storage (`VACUUM`).
  - **Response (200 OK)**: `{"message": "SQLite WAL journal checkpointed and truncated successfully"}`.

#### 5. Dynamic Server Runtime Configuration & Limits
- `PUT /api/v1/admin/config` - Update core server runtime parameters and global creation limits without restarting. Changes are automatically persisted to `conf/app.ini`.
  - **Request Body**:
    ```json
    {
      "app_name": "ProGit Enterprise",
      "domain": "git.company.com",
      "root_url": "https://git.company.com/",
      "ssh_port": 2222,
      "http_port": 3000,
      "default_branch": "main",
      "default_repo_max_creation_limit": 10,
      "default_org_max_creation_limit": 3
    }
    ```
  - **Response (200 OK)**:
    ```json
    {
      "message": "Server configuration updated successfully",
      "app_name": "ProGit Enterprise",
      "domain": "git.company.com",
      "root_url": "https://git.company.com/",
      "ssh_port": 2222,
      "http_port": 3000,
      "default_branch": "main",
      "default_repo_max_creation_limit": 10,
      "default_org_max_creation_limit": 3
    }
    ```

#### 6. Enterprise High Availability, Licensing & Audit APIs *(Enterprise Edition)*
- `GET /api/enterprise/cluster` - Inspect high-availability cluster topology, Raft consensus / Redis distributed locking state, and active nodes.
- `GET /api/enterprise/license` - Inspect active enterprise license status, seat quota (`max_seats`, `active_seats`), edition, and expiry.
- `POST /api/enterprise/license` - Upload and activate a cryptographically signed enterprise license payload.
- `GET /api/enterprise/audit-logs?limit=100` - Stream and query SIEM compliance audit events with actor attribution and IP tracking.
