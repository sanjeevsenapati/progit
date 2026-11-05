# ProGit

<p align="center">
  <strong>A modern, lightweight, self-hosted Git collaboration platform and GitHub alternative written in Go and React.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Go-1.22+-00ADD8?style=flat&logo=go" alt="Go Version" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/Tailwind-CSS-38B2AC?style=flat&logo=tailwind-css" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Database-SQLite%20(Pure--Go)-003B57?style=flat&logo=sqlite" alt="SQLite" />
  <img src="https://img.shields.io/badge/Container-Podman%20%2F%20Docker-892CA0?style=flat&logo=podman" alt="Podman / Docker" />
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT" />
</p>

---

## Highlights

- **Single Static Binary**: Built with pure Go (`modernc.org/sqlite`, zero CGO) and embedded modern React single-page application using `embed.FS`.
- **Full Git Engine**: Native Git Smart HTTP (`git-upload-pack`, `git-receive-pack`) and integrated pure-Go SSH server on port 2222.
- **Modern GitHub-Like Experience**: React 19 + TypeScript + Vite + Tailwind CSS with dark mode, responsive layout, and reactive updates.
- **Git-Backed Wiki Engine**: Every repository features an independent, real Git-backed wiki (`<owner>/<repo>.wiki.git`) accessible via Web UI (Markdown preview, revisions, history) and Git CLI (HTTP/SSH).
- **ProGit Pages (GitHub Pages)**: Host static websites, portfolios, or documentation directly from `gh-pages` or `main` branches with automatic Markdown rendering and access control.
- **Complete Developer Collaboration**:
  - Issues & Labels, Milestones, and threaded Markdown comments.
  - Pull Requests with live syntax diffing, comparison, and native Git merges (Merge Commit, Squash, Rebase).
  - Branch protection, forks, stars, and activity feeds.
- **Self-Hosted Administration**: First-run setup installation wizard, Super Admin management panel, runtime telemetry, and database WAL maintenance.

---

## Architecture Overview

```
                      +---------------------------------------+
                      |       Clients (Browser / Git CLI)     |
                      +-------------------+-------------------+
                                          |
                        HTTP / HTTPS (3000)   SSH (2222)
                                          |        |
                      +-------------------|--------|----------+
                      |                   v        v          |
                      |        ProGit Single Binary           |
                      |  +---------------------------------+  |
                      |  |     Embedded React 19 SPA       |  |
                      |  +---------------------------------+  |
                      |  |   REST API & Git Smart HTTP     |  |
                      |  +---------------------------------+  |
                      |  |     Native Pure-Go SSH Server   |  |
                      |  +---------------------------------+  |
                      |  | Git Operations (Repos & Wikis)  |  |
                      |  +---------------------------------+  |
                      |  |  SQLite Engine (WAL, Zero CGO)  |  |
                      |  +---------------------------------+  |
                      +-------------------|-------------------+
                                          |
                      +-------------------|-------------------+
                      |                   v                   |
                      |          Persistent Storage           |
                      |  - /data/db/progit.db (WAL mode)      |
                      |  - /data/repositories/<user>/<repo>   |
                      |  - /data/config/                      |
                      +---------------------------------------+
```

---

## Quickstart with Podman / Docker

ProGit is packaged for non-root, containerized execution:

```bash
# 1. Clone repository
git clone https://github.com/sanjeevsenapati/progit.git
cd progit

# 2. Build the container image
podman build -t localhost/progit:latest -f Containerfile .

# 3. Deploy container with persistent volumes
./podman/deploy.sh

# 4. Run the functional integration test suite
./podman/test.sh
```

Navigate to `http://localhost:3000` to complete the installation wizard and initialize your Super Administrator account.

---

## Building from Source

### Prerequisites
- Go 1.22+
- Node.js 20+ & npm

### Build Steps

```bash
# 1. Build frontend assets
cd web
npm install
npm run build
cd ..

# 2. Synchronize frontend bundle for Go embedding
rm -rf internal/ui/dist && cp -r web/dist internal/ui/dist

# 3. Compile the standalone binary
CGO_ENABLED=0 go build -o progit ./cmd/progit

# 4. Start ProGit
./progit web
```

---

## CLI Management Commands

ProGit includes CLI subcommands for maintenance and user management:

```bash
# Create an Administrator
./progit admin create-user --username=admin --email=admin@example.com --password=SecretPassword123! --admin

# List Users
./progit admin list-users

# Check database and health
curl http://localhost:3000/api/health
```

---

## Documentation

Detailed architectural and deployment documentation is available in the [`docs/`](./docs) directory:
- [Architecture & Design Decisions](./docs/ARCHITECTURE.md)
- [Feature Inventory & Roadmap](./docs/FEATURE_INVENTORY.md)
- [Database Design & Schema](./docs/DATABASE_DESIGN.md)
- [REST API Specification](./docs/API_DESIGN.md)
- [Security Model & Hardening](./docs/SECURITY.md)
- [User Guide & Workflows](./docs/USER_GUIDE.md)
- [Podman Deployment & Operations](./docs/PODMAN_DEPLOYMENT.md)

---

## 📜 Attribution & Credits

Supported by **PDIH** and created by **ProGit Team and Sanjeev**.  
Built on top of the Gogs source code. Released under the open-source MIT License.

---

## License

ProGit is licensed under the [MIT License](./project.md).

