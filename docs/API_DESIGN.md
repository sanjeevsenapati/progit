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
  - Body: `{"name": "my-project", "description": "Demo project", "private": false, "auto_init": true, "readme": "Default"}`
- `GET /api/v1/repos/:owner/:repo` - Retrieve repository metadata, permissions (`can_write`, `is_admin`), and stats.
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
- `GET /api/v1/repos/:owner/:repo/raw?ref=main&path=image.png` - Stream raw file bytes with appropriate MIME type.
- `POST /api/v1/repos/:owner/:repo/contents/:path` - Create or edit a file online and commit to a branch.
  - Body: `{"content": "...", "message": "commit message", "branch": "main"}`
- `DELETE /api/v1/repos/:owner/:repo/contents/:path` - Delete a file online.
  - Body: `{"message": "delete file", "branch": "main"}`
- `POST /api/v1/repos/:owner/:repo/upload` - Multipart form file and directory upload.

### 2.5 Collaborators & Permissions
- `GET /api/v1/repos/:owner/:repo/collaborators` - List repository collaborators and permission levels.
- `PUT /api/v1/repos/:owner/:repo/collaborators/:username` - Add or update collaborator.
  - Body: `{"mode": "write"}` (`read`, `write`, `admin`)
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

### 2.11 Developer Direct Messaging
- `GET /api/v1/developers` - List all active platform developers for message targeting.
- `POST /api/v1/messages` - Send a direct message to a developer.
  - Body: `{"recipient_username": "dev_bob", "subject": "Sprint Targets", "content": "Let's review the API spec."}`
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
- `GET /api/v1/repos/:owner/:repo/wiki/pages` - List all wiki pages.
- `GET /api/v1/repos/:owner/:repo/wiki/pages/:slug` - Get wiki page content and metadata.
- `POST /api/v1/repos/:owner/:repo/wiki/pages` - Create or update wiki page with commit message.
  - Body: `{"title": "Architecture", "content": "# Architecture Overview...", "message": "Initial docs"}`
- `GET /api/v1/repos/:owner/:repo/wiki/pages/:slug/history` - Get revision history for a wiki page.

### 2.14 ProGit Pages Hosting
- `GET /api/v1/repos/:owner/:repo/pages` - Inspect ProGit Pages configuration.
- `POST /api/v1/repos/:owner/:repo/pages` - Enable or configure ProGit Pages.
  - Body: `{"branch": "main", "folder": "/docs"}`
- `DELETE /api/v1/repos/:owner/:repo/pages` - Disable Pages hosting.
- `GET /pages/:owner/:repo/` - Static site delivery with automatic Markdown rendering.

### 2.15 System Telemetry & Administration
- `GET /api/health` - Health check (verifies HTTP, SQLite WAL, and Repository storage).
- `GET /api/ready` - Readiness check (returns 200 OK when server is accepting traffic).
- `GET /api/v1/admin/stats` - Super admin telemetry (user count, repo count, disk usage, Go runtime).
- `POST /api/v1/admin/maintenance/checkpoint` - Execute SQLite WAL checkpoint (`PRAGMA wal_checkpoint(TRUNCATE)`).
