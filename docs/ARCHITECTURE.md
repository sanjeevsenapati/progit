# ProGit System Architecture

Official Documentation Portal: [https://progit.co.in](https://progit.co.in)

## 1. Overview & Vision

**ProGit** is a modern, lightweight, self-hosted Git collaboration platform designed to deliver the polished, developer-friendly experience of modern platforms (such as GitHub) with the minimalist footprint and simplicity of Gogs.

ProGit is built as a **modular monolith** in Go, backed by an embedded pure-Go SQLite storage engine and native Git CLI integration. The frontend is a high-performance Single Page Application (SPA) built with React 19, TypeScript, Vite, Tailwind CSS, and Lucide icons, embedded into the Go binary via Go's `embed.FS` for zero-dependency single-binary deployment.

```
+-----------------------------------------------------------------------------------+
|                                     CLIENTS                                       |
|   +----------------------------+   +--------------------+   +-------------------+ |
|   | Fast SPA Web Client (React)|   | Git CLI (Smart HTTP|   | Git CLI (SSH)     | |
|   +----------------------------+   +--------------------+   +-------------------+ |
+-----------------+----------------------------+------------------------+-----------+
                  |                            |                        |
                  | HTTPS :3443 / :443         | HTTPS :3443 / :443     | SSH :2222
                  | (Auto HTTP->HTTPS :3000)   | (Auto HTTP->HTTPS :3000|
+-----------------v----------------------------v------------------------v-----------+
|                                     PROGIT                                        |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  |                         Routing & Middleware Layer                          |  |
|  |   - Auth / Session Handler              - TLS / ACME Manager & SAN Certs    |  |
|  |   - Request Logger & Recovery           - CORS & Security Headers (HSTS)    |  |
|  |   - Rate Limiter & Protections          - Health Probe Filter (/api/health) |  |
|  +-----------------------+---------------------------------+-------------------+  |
|                          |                                 |                      |
|  +-----------------------v-------------------+ +-----------v-------------------+  |
|  |                REST API v1                | |     Native Git Smart HTTP     |  |
|  |  - Users & Auth        - Repositories     | |   - info/refs                 |  |
|  |  - Issues & Labels     - Pull Requests    | |   - git-upload-pack (fetch)   |  |
|  |  - Orgs & Teams        - Admin & Health   | |   - git-receive-pack (push)   |  |
|  +-----------------------+-------------------+ +-----------+-------------------+  |
|                          |                                 |                      |
|  +-----------------------v---------------------------------v-------------------+  |
|  |                        Core Business Services                               |  |
|  |  - Auth & Token Service           - Repository Management                   |  |
|  |  - Issue & Milestone Engine       - PR Diff & Real Git Merge Engine         |  |
|  |  - Organization Service           - Webhook Dispatcher Worker               |  |
|  |  - Native SSH Server (Port 2222)  - Dynamic Base URL & SAN Manager          |  |
|  +-----------------------+---------------------------------+-------------------+  |
|                          |                                 |                      |
|  +-----------------------v-------------------+ +-----------v-------------------+  |
|  |       Data Access Layer (Database)        | |     Native Git CLI Engine     |  |
|  |   - SQLite (modernc.org/sqlite, pure Go)  | |   - Git bare repositories     |  |
|  |   - WAL mode, busy timeouts               | |   - Objects, branches,        |  |
|  |   - Schema Migrations & Integrity Checks  | |     tags, commits, diffs      |  |
|  +-----------------------+-------------------+ +-----------+-------------------+  |
+--------------------------|---------------------------------|----------------------+
                           |                                 |
           +---------------v---------------+         +-------v----------------+
           | Persistent SQLite DB (data/db)|         | Bare Repositories      |
           +-------------------------------+         | (data/repositories)    |
                                                     +------------------------+
```

---

## 2. Architectural Pillars

### 2.1 Pure-Go Portability & Single-Binary Delivery
- Uses standard Go toolchain without CGO dependencies (`modernc.org/sqlite` or `github.com/glebarez/go-sqlite`).
- The entire frontend is precompiled via Vite and embedded into the Go executable via `embed.FS`.
- A single binary provides HTTP API, web UI, Git smart HTTP, and built-in SSH services.

### 2.2 Strict Separation of Git Object Storage & Metadata
- **Never store Git objects, trees, commits, or blobs in SQLite.**
- Git bare repositories live in the designated filesystem path (`/data/repositories/<owner>/<repo>.git`).
- SQLite stores strictly relational application metadata: users, permissions, organizations, issues, comments, milestones, PR state, webhooks, and audit logs.

### 2.3 Native Git Protocol Execution
- Native Git command-line invocations (`git-upload-pack --stateless-rpc`, `git-receive-pack --stateless-rpc`) ensure 100% standard Git compliance for clone, fetch, pull, and push.
- Basic Auth and Personal Access Token (PAT) authentication protect both HTTP and SSH protocols.
- Native Git merges execute real Git working tree operations (fast-forward, merge commit, squash, rebase).

### 2.4 Modular Backend Structure
ProGit backend packages are structured with clear responsibilities:

- `cmd/progit`: CLI entrypoint (subcommands: `web`, `serv`, `admin`, `backup`, `restore`, `version`).
- `internal/config`: Centralized configuration parser with file (`conf/app.ini`) and environment variable overrides.
- `internal/database`: Database initialization, connection pooling, schema migrations, and relational models.
- `internal/git`: Git CLI command runner, commit/tree parser, blame, diff calculation, smart HTTP handling, and real merge mechanics.
- `internal/ssh`: Built-in Go SSH server using `golang.org/x/crypto/ssh` on port 2222 with database key verification.
- `internal/auth`: Session management, bcrypt password hashing, token validation, and permission authorization.
- `internal/api`: REST API v1 endpoints with JSON request/response validation, pagination, and error contracts.
- `internal/worker`: Asynchronous background workers for webhooks, repository maintenance, and mirror synchronization.
- `web`: Frontend application (React 19 + TypeScript + Vite + Tailwind CSS + Lucide).

---

## 3. Database Layer Architecture

- **Driver**: Pure-Go SQLite (`modernc.org/sqlite` / `github.com/glebarez/go-sqlite`).
- **Concurrency**: SQLite Write-Ahead Logging (`PRAGMA journal_mode=WAL;`), synchronous NORMAL (`PRAGMA synchronous=NORMAL;`), and busy timeout (`PRAGMA busy_timeout=5000;`).
- **Connection Management**:
  - Max open connections configured appropriately (e.g. 25 connections in WAL mode with connection reuse).
  - Explicit transaction handling (`BeginTx`) for all multi-statement operations.
- **Migrations**: Incremental schema migrations run automatically on startup to ensure zero manual SQL setup.

---

## 4. Frontend Architecture

- **Framework**: React 19 with TypeScript.
- **Styling**: Tailwind CSS v4 with custom design tokens for GitHub-inspired dark and light mode themes.
- **Icons**: Lucide React.
- **Client Routing**: Single Page Application with history-mode routing.
- **State & Data Fetching**: Fast async API client layer with optimistic updates and caching.
- **Single-Binary Serving**: Handled by Go's HTTP server with fallback to `index.html` for client-side navigation.

---

## 5. Container & Infrastructure Topology

- **Primary Container Runtime**: Podman.
- **Container Image**: Multi-stage build (`Containerfile`) generating a lightweight runtime image with `git` and `ca-certificates`.
- **Security**: Runs under a non-root UID/GID (`progit:1000:1000`).
- **Volumes**:
  - `/data/db`: Persistent SQLite database (`progit.db`).
  - `/data/repositories`: Bare Git repositories.
  - `/data/config`: Custom configuration (`app.ini`).
  - `/data/logs`: Structured application logs.
- **Network Ports**:
  - `3000`: Web UI and Git Smart HTTP.
  - `2222`: Built-in Git SSH Server.

