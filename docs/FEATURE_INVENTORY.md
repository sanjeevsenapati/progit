# ProGit Feature Inventory & Implementation Mapping

## 1. Feature Matrix & Status Overview

| Module | Feature | Gogs Legacy | ProGit Status | Modernization Note |
|---|---|---|---|---|
| **Auth** | User Registration | Yes | Implemented | Modern UI, instant validation |
| **Auth** | User Login / Logout | Yes | Implemented | Session cookie + Bearer Token |
| **Auth** | Password Hashing | PBKDF2/SHA256 | Implemented (bcrypt) | Production standard cost factor |
| **Auth** | Personal Access Tokens | Yes | Implemented | Granular scope ready, clean UI |
| **Auth** | SSH Public Key Mgmt | Yes | Implemented | Validates OpenSSH key format |
| **Auth** | Two-Factor Auth (TOTP) | Yes | Implemented | QR generation & recovery codes |
| **Dashboard** | User Feed & Recent Repos | Partial | Implemented | GitHub-style activity stream |
| **Dashboard** | Quick Actions / Starred | Yes | Implemented | Modern dashboard sidebar & cards |
| **Repository** | Create Repository | Yes | Implemented | Auto-initialize with README/License |
| **Repository** | Public / Private Visibility | Yes | Implemented | Enforced in Web UI, API, and Git CLI |
| **Repository** | Fork Repository | Yes | Implemented | Fork relationships & branch sync |
| **Repository** | Star / Watch Repositories | Yes | Implemented | Reactive star/unstar buttons |
| **Repository** | Transfer / Delete Repo | Yes | Implemented | Safety modal with confirmation |
| **Git Engine** | Smart HTTP (Clone/Push/Pull)| Yes | Implemented | Native `git-upload-pack` & `receive-pack` |
| **Git Engine** | SSH Protocol (Clone/Push) | OpenSSH wrapper | Implemented (Native SSH) | Built-in Go SSH server on port 2222 |
| **Online Editor**| Online File Creation | Yes | Implemented | Create files with subpaths, commit message & branch selection |
| **Online Editor**| Online File Editing | Yes | Implemented | In-browser editing, markdown preview & direct online commits |
| **Online Editor**| Online File Deletion | Yes | Implemented | In-browser delete confirmation modal & direct online commit |
| **Online Editor**| Multi-File & Folder Upload | Basic | Implemented | Drag-and-drop, multi-file & full directory uploads (`webkitdirectory`) |
| **Code Browser**| Directory & File Tree | Basic | Implemented | Modern breadcrumbs, icons & speed |
| **Code Browser**| File Viewer | Basic | Implemented | Syntax highlight, line nums, copy raw |
| **Code Browser**| Markdown Rendering | Yes | Implemented | Rich markdown with GitHub flavor |
| **Code Browser**| Commit Log & Details | Basic | Implemented | Author avatars, commit diffs |
| **Code Browser**| Branch / Tag Switcher | Yes | Implemented | Instant dropdown filtering |
| **Issues** | Issue Creation & Editing | Yes | Implemented | Rich markdown description |
| **Issues** | Discussion & Comments | Yes | Implemented | Real-time comment threads |
| **Issues** | Labels & Milestones | Yes | Implemented | Color-coded badges & progress bars |
| **Issues** | Assignees & State Filter | Yes | Implemented | Open / Closed tabs, search filters |
| **Pull Requests**| PR Creation & Branch Compare | Yes | Implemented | Native `git diff` calculation |
| **Pull Requests**| Unified Diff Viewer | Basic | Implemented | Syntax highlighted diff blocks |
| **Pull Requests**| Merge Execution | Basic Merge | Implemented | Native Merge Commit, Squash, Rebase |
| **Organizations**| Org & Team Management | Yes | Implemented | Multi-user roles, teams & permissions |
| **Settings** | User & Repo Settings | Yes | Implemented | Tabbed modern settings pages |
| **Webhooks** | Webhook Dispatcher | Basic HTTP | Implemented | Push/Issue/PR event triggers & logs |
| **Wiki** | Git-backed Wiki | Yes | Implemented | Dedicated `<repo>.wiki.git` bare repo, CLI clone/push over HTTP & SSH, Page revision history, Markdown editor with live preview |
| **Pages** | ProGit Pages (GitHub Pages) | No (ProGit exclusive) | Implemented | Static site & documentation hosting from `gh-pages` or `main` (`/` or `/docs`), automatic Markdown-to-HTML rendering, 404 fallback, permission enforcement |
| **Admin** | Admin Dashboard | Basic | Implemented | System telemetry, users, repo manager |
| **Observability**| Health & Readiness Check | Basic | Implemented | `/api/health` and `/api/ready` |

---

## 2. Gogs Technical Debt Addressed

1. **Dual ORM Complexity**: Gogs mixed legacy XORM with newer GORM across different packages. ProGit consolidates data access with clean, robust SQL and transactions via pure-Go SQLite with repository interfaces.
2. **External OpenSSH Daemon Requirement**: Gogs historically relied on host OpenSSH and authorized_keys file hooks, making containerization fragile. ProGit provides an integrated, non-root pure-Go SSH server on port 2222 that queries SQLite keys directly.
3. **Outdated Server-Rendered Templates**: Gogs relied on Go HTML templates (`macaron/templates`). ProGit replaces the entire frontend with a modern React 19 + TypeScript + Vite + Tailwind CSS SPA for seamless desktop and mobile UX.
4. **CGO Dependencies**: ProGit eliminates CGO dependencies by using `modernc.org/sqlite` / `github.com/glebarez/go-sqlite`, ensuring simple cross-compilation and Alpine/scratch container compatibility.

