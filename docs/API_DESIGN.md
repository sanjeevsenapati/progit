# ProGit REST API Specification (v1)

Base URL: `/api/v1`

## 1. Authentication

API clients authenticate via:
1. **Bearer Token Header**:
   ```http
   Authorization: Bearer <personal_access_token>
   ```
2. **Session Cookie**:
   Browser requests automatically send the session cookie (`progit_session`).

---

## 2. API Endpoints

### 2.1 Authentication & Profile
- `POST /api/v1/auth/register` - Create a new user account.
  - Body: `{"username": "alice", "email": "alice@example.com", "password": "securepassword"}`
- `POST /api/v1/auth/login` - Authenticate and create a session.
  - Body: `{"username": "alice", "password": "securepassword"}`
- `POST /api/v1/auth/logout` - Clear user session.
- `GET /api/v1/auth/me` - Get currently authenticated user profile.

### 2.2 User Settings & Credentials
- `GET /api/v1/user/tokens` - List user's personal access tokens.
- `POST /api/v1/user/tokens` - Create a new personal access token.
  - Body: `{"name": "cli-token", "scopes": "repo,user"}`
- `DELETE /api/v1/user/tokens/:id` - Revoke personal access token.
- `GET /api/v1/user/keys` - List SSH public keys.
- `POST /api/v1/user/keys` - Add SSH public key.
  - Body: `{"title": "Laptop", "key": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI..."}`
- `DELETE /api/v1/user/keys/:id` - Remove SSH public key.

### 2.3 Repositories
- `GET /api/v1/repos` - List repositories (filter by owner or public exploration).
- `POST /api/v1/repos` - Create a new repository.
  - Body: `{"name": "my-project", "description": "Demo project", "private": false, "auto_init": true, "readme": "Default"}`
- `GET /api/v1/repos/:owner/:repo` - Retrieve repository metadata and stats.
- `DELETE /api/v1/repos/:owner/:repo` - Delete a repository and its Git bare directory.
- `POST /api/v1/repos/:owner/:repo/star` - Star or unstar a repository.

### 2.4 Code Browsing & Commits
- `GET /api/v1/repos/:owner/:repo/branches` - List all Git branches.
- `POST /api/v1/repos/:owner/:repo/branches` - Create a new branch.
- `GET /api/v1/repos/:owner/:repo/tags` - List tags.
- `GET /api/v1/repos/:owner/:repo/commits?ref=main` - Get commit history log.
- `GET /api/v1/repos/:owner/:repo/commits/:sha` - Get commit details and changed file diffs.
- `GET /api/v1/repos/:owner/:repo/tree?ref=main&path=src` - List files/subdirectories at a path.
- `GET /api/v1/repos/:owner/:repo/blob?ref=main&path=README.md` - Get file content, size, and encoding.
- `GET /api/v1/repos/:owner/:repo/raw?ref=main&path=image.png` - Stream raw file bytes.

### 2.5 Issues
- `GET /api/v1/repos/:owner/:repo/issues?state=open` - List repository issues.
- `POST /api/v1/repos/:owner/:repo/issues` - Create an issue.
  - Body: `{"title": "Bug in parser", "content": "Steps to reproduce..."}`
- `GET /api/v1/repos/:owner/:repo/issues/:index` - Get single issue details and metadata.
- `PATCH /api/v1/repos/:owner/:repo/issues/:index` - Update issue status (open/closed) or title.
- `GET /api/v1/repos/:owner/:repo/issues/:index/comments` - List conversation comments.
- `POST /api/v1/repos/:owner/:repo/issues/:index/comments` - Post comment on issue.

### 2.6 Pull Requests & Merges
- `GET /api/v1/repos/:owner/:repo/pulls?state=open` - List pull requests.
- `POST /api/v1/repos/:owner/:repo/pulls` - Open a pull request.
  - Body: `{"title": "Feature X", "content": "PR summary", "head": "feature", "base": "main"}`
- `GET /api/v1/repos/:owner/:repo/pulls/:index` - Get PR details and mergeable status.
- `GET /api/v1/repos/:owner/:repo/pulls/:index/diff` - Get unified diff between head and base branch.
- `POST /api/v1/repos/:owner/:repo/pulls/:index/merge` - Merge pull request directly into repository.
  - Body: `{"merge_style": "merge"}` (options: `merge`, `squash`, `rebase`)

### 2.7 Organizations & Teams
- `GET /api/v1/orgs` - List user organizations.
- `POST /api/v1/orgs` - Create a new organization.
- `GET /api/v1/orgs/:org` - Organization profile and repositories.

### 2.8 System & Health
- `GET /api/health` - Health check (verifies HTTP, SQLite WAL, and Repository storage).
- `GET /api/ready` - Readiness check (returns 200 OK when server is accepting traffic).
- `GET /api/v1/admin/stats` - System telemetry (user count, repo count, disk usage).

