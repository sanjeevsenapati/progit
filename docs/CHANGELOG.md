# Changelog

All notable changes to **ProGit** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.0-LTS] - 2026-11-20

### Major Release Milestone: Long-Term Support (LTS), Security Hardening & Performance Optimizations
ProGit 2.0.0-LTS marks the inaugural enterprise Long-Term Support release of the platform. This release includes full vulnerability assessment remediations across 13 security vectors, high-performance Go runtime tuning, SQLite WAL optimization, comprehensive Keycloak/Okta OIDC SSO integration, a complete 36-tool developer productivity suite, and portal-backed select menus.

### Security & Vulnerability Assessment (VA) Remediations
- **OIDC SSO Credential Predictability (VA-OIDC-1 / CWE-330 / CWE-287)**:
  - Replaced deterministic local password hashes on auto-provisioned SSO user records with 256 bits of cryptographically secure random entropy (`crypto/rand`) encoded as 64 hex characters. Local password authentication cannot be guessed or bypassed without SSO provider authentication.
- **Cloud Instance Metadata (IMDS) SSRF Defense (VA-OIDC-2 / CWE-918)**:
  - Added strict network and hostname validation to OIDC Dynamic Discovery (`auth.DiscoverOIDC`).
  - Blocked IPv4 link-local CIDR `169.254.0.0/16` (including `169.254.169.254`), IPv6 link-local `fe80::/10`, AWS IMDSv6 `fd00:ec2::254`, multicast, unspecified, and cloud metadata hostnames (`metadata.google.internal`, `instance-data`, `*.internal.cloudapp.net`).
- **Repository Name Path Traversal & Flag Injection Prevention (VA-REPO-1 / CWE-22 / CWE-88)**:
  - Added centralized `git.IsValidRepoName(name)` enforcing `^[a-zA-Z0-9][a-zA-Z0-9_.-]*$` (1-100 characters, no `..`, slashes, leading hyphens, or `.git`/`.wiki` suffixes) across creation, forking, and import endpoints.
  - Hardened `git.ForkRepository` with `--` argument terminator and `-c core.hooksPath=/dev/null` to eliminate hook execution and argument injection during bare clones.
- **Markdown Editor DOM XSS Neutralization (VA-XSS-1 / CWE-79)**:
  - Enforced strict URL protocol allowlisting (`http:`, `https:`, `mailto:`, `tel:`, `#`, relative paths) and full HTML attribute escaping (`"`, `'`, `&`, `<`, `>`) in `MarkdownEditorTool.tsx`.
- **SVG Optimizer DOM/Stored XSS Neutralization (VA-XSS-2 / CWE-79)**:
  - Replaced `dangerouslySetInnerHTML` vector preview with a W3C-sandboxed `<img>` data URL (`data:image/svg+xml;utf8,...`), where browser engines strictly disable script execution.
  - Sanitized `<script>`, `<foreignObject>`, and `on*` event handlers during SVG optimization.

### Performance Fixes & Optimizations
- **Frontend Code Splitting & Bundle Size Optimization**:
  - Vite 6 build configuration splits all 36 Toolbox developer utilities into 48 dynamic chunks with `React.lazy()` loading.
  - Initial application bundle size kept under 212 kB gzip, reducing initial page load latency to under 300ms.
- **Database Concurrency & WAL Performance**:
  - Pure-Go zero-CGO SQLite engine operates with Write-Ahead Logging (`WAL`) mode, `busy_timeout=10000`, and `synchronous=NORMAL`, providing sub-millisecond database queries under concurrent read/write load.
- **Git Engine Process Isolation**:
  - Enforced Unix process group termination (`syscall.SysProcAttr{Setpgid: true}`) and `maintenance.autoDetach=false` across all Git plumbing operations, preventing orphaned background worker processes.

### UI/UX & Developer Experience
- **Portal-Backed Select Dropdowns (`ThemedSelect.tsx`)**:
  - Converted custom select components to React `createPortal` attached to `document.body` with `fixed` coordinates and `z-index: 9999`, preventing dropdown menus from being clipped by cards or modals.
- **Repository Fork Conflict Detection**:
  - Added real-time conflict checking when selecting destination accounts, automatically proposing distinct repository names (e.g. `<repo>-fork`).

## [1.19.0] - 2026-11-20

### Highlights: Fork Modal Lifecycle & Keycloak OIDC SSO Integration
Resolved an issue where the repository fork modal would stay open in a spinning "Forking..." state with duplicate name warnings after creation, and verified local Keycloak OpenID Connect Single Sign-On end-to-end.

### Fixed
- **Repository Fork Modal Lifecycle (`web/src/components/RepoNav.tsx`)**:
  - Fixed perpetual spinning "Forking..." state on fork submission by resetting modal state (`setShowForkModal(false)`, `setForking(false)`) and triggering a hard browser reload (`window.location.href`) to newly forked repositories.
  - Added robust case-insensitive comparison (`toLowerCase()`) for repository owner matching across user and organization accounts.
  - Synchronized form validation so that name collision alerts immediately disable submission and clear cleanly upon changing the repository name or owner.
  - Bound modal backdrop clicks, modal close buttons, and cancel buttons to safely reset state.

### Verified
- **Keycloak OIDC SSO End-to-End (`internal/auth/oidc.go`, `internal/api/api.go`)**:
  - Deployed local Keycloak instance on container bridge network `progit-net`.
  - Configured OIDC realm `progit`, client `progit-oidc`, client secret, and redirect URI `http://localhost:3000/api/v1/auth/oidc/callback`.
  - Verified live dynamic discovery (`POST /api/v1/admin/oidc/discover`), auth redirect (`GET /api/v1/auth/oidc/login`), authorization code token exchange, and automatic user provisioning (`sanjeev_sso`).

---

## [1.18.0] - 2026-11-20

### Highlights: Flexible Repository Forking & Same-Account Fork Support
Fixed public repository forking restrictions that previously prevented users from forking repositories in their account or organizations. Users can now fork any accessible repository into the same account or organization by specifying a distinct repository name, with intelligent auto-suggested `-fork` naming.

### Fixed
- **Same-Account Repository Forking (`web/src/components/RepoNav.tsx`, `internal/api/api.go`)**:
  - Removed unconditional prohibition against forking repositories within the same account or organization (`selectedOwner === repo.owner_name`).
  - Added smart collision detection: when forking into the same account, the fork modal automatically pre-fills `${repo.name}-fork` and dynamically validates against name collisions.
  - Allowed creating standalone forks under distinct repository names within the same user or organization namespace across both frontend modal and backend API (`POST /api/v1/repos/{owner}/{repo}/forks`).
  - Updated inline guidance to clearly display when a fork will be created in the current account under a new name and only block submission when an exact name collision exists.

---

## [1.17.0] - 2026-11-18

### Highlights: Portal-Backed Select Dropdowns & Registration Placeholder Updates
Fixed clipped dropdown menus inside Toolbox cards (such as DNS Lookup record type selection) by upgrading `ThemedSelect` to a viewport-aware portal overlay, and updated registration/reset placeholder examples.

### Fixed
- **DNS Lookup & Toolbox Dropdown Clipping (`web/src/components/ThemedSelect.tsx`, `web/src/pages/Toolbox.tsx`)**:
  - Upgraded `ThemedSelect` to render its dropdown menu via a React Portal (`document.body`) with fixed viewport coordinates, automatic upward flipping when near the bottom of the screen, horizontal viewport clamping, and scroll/resize tracking so options like `NS` and `PTR` in DNS Lookup are never cut off by parent cards.
  - Changed the Toolbox workspace card container from `overflow-hidden` to `overflow-visible` with `rounded-t-2xl` header styling as an extra safeguard against popout clipping.

### Changed
- **Updated Example User Placeholders (`web/src/pages/Register.tsx`, `web/src/pages/ForgotPassword.tsx`)**:
  - Replaced `alex` / `alex@example.com` / `Alex Mercer` placeholders with `sanjeev` / `sanjeev@example.com` / `Sanjeev`.

---

## [1.16.0] - 2026-11-18

### Highlights: Developer Toolbox Database Utilities (SQL Suite, Connection String Builder & JDBC URL Generator)
Expanded the Developer Toolbox (`/toolbox`) with a dedicated **Database** category containing 6 pure client-side, zero-dependency developer utilities.

### Added
- **SQL Formatter (`/toolbox/sql-formatter`)**: Dialect-aware SQL formatter supporting ANSI, PostgreSQL, MySQL/MariaDB, SQLite, SQL Server (T-SQL), and Oracle (PL/SQL) with configurable indentation (2/4 spaces, tabs), keyword casing, leading/trailing commas, and optional comment stripping.
- **SQL Beautifier (`/toolbox/sql-beautifier`)**: Advanced query readability tool with 4 presets (**Aligned Clauses**, **Readable 4sp**, **Analytics Leading Commas**, **Compact**), CTE & `CASE`/`WHEN` formatting, and a Fullscreen/Expand comparison toggle (`Escape` to exit).
- **SQL Minifier (`/toolbox/sql-minifier`)**: Safely minifies SQL into compact single-line queries while preserving single-quoted strings, dollar-quoted PostgreSQL strings, and quoted identifiers, plus byte-savings metrics and JSON-string escaping.
- **SQL Validator (`/toolbox/sql-validator`)**: Client-side SQL lexer and validator detecting unclosed quotes/comments, mismatched parentheses and `CASE`/`END` blocks, trailing/unexpected commas, invalid clause order, dialect-specific warnings, destructive `UPDATE`/`DELETE` without `WHERE` alerts, and a parsed statement breakdown table.
- **Connection String Builder (`/toolbox/conn-string`)**: Interactive builder and reverse URI parser supporting PostgreSQL, MySQL, MariaDB, JDBC, SQL Server, Oracle, SQLite, MongoDB, and Redis with automatic password URL-encoding, SSL/TLS options, custom query parameters, and ready-to-copy `.env` / driver DSN outputs.
- **JDBC URL Generator (`/toolbox/jdbc-url`)**: Dedicated Java JDBC URL generator for PostgreSQL, MySQL, MariaDB, Oracle Thin (Service Name & SID), SQL Server, H2, SQLite, and IBM DB2 with auto-filled Driver class names, Spring Boot HikariCP (`application.properties` & `application.yml`), Maven XML, Gradle, and Java `DriverManager` snippets.

---

## [1.15.0] - 2026-11-18

### Highlights: Comprehensive Keycloak & ZTrust OIDC Documentation + First-Class ZTrust Preset
Added step-by-step documentation for configuring and using OpenID Connect Single Sign-On with **Keycloak** and **ZTrust IAM**, along with first-class `ztrust` preset support across the backend and Admin Dashboard UI.

### Added
- **First-Class ZTrust IAM OIDC Preset (`ztrust`)**:
  - Added `ztrust` (default display name `ZTrust SSO`) and `keycloak` (default display name `Keycloak SSO`) presets in `internal/auth/oidc.go`, `internal/api/api.go`, and the Admin Dashboard **SSO / OIDC** dropdown (`web/src/pages/AdminDashboard.tsx`).
- **Complete Keycloak & ZTrust OIDC Documentation**:
  - Created standalone runbook [`docs/OIDC_SSO_GUIDE.md`](docs/OIDC_SSO_GUIDE.md) and upgraded `#page-config-oidc` in `docs/index.html` & `index.html`.
  - Covers Keycloak (v24/v25/v26+) and ZTrust IAM client setup, live Admin Web UI hot-reload & discovery testing, `app.ini` / Podman / Kubernetes configuration, end-user SSO login & Git CLI authentication (SSH Keys & Personal Access Tokens), local Podman pod testing, and troubleshooting.

---

## [1.14.0] - 2026-11-18

### Highlights: Full Built-in OSS OIDC / SSO Admin Panel, Live Discovery & Hot-Reload
OpenID Connect (OIDC) and OAuth2 Single Sign-On are now first-class, live-configurable directly from the Admin Dashboard in ProGit OSS with zero server restarts and no license wall.

### Added
- **Admin Dashboard SSO / OIDC Management Tab (`web/src/pages/AdminDashboard.tsx`)**:
  - Dedicated **SSO / OIDC** tab for enabling, disabling, and configuring Google Workspace, GitHub, Microsoft 365 / Entra ID, Keycloak, Okta, Authentik, and Generic OIDC directly from the browser.
  - One-click copyable **Authorized Redirect / Callback URI** (`<RootURL>/api/v1/auth/oidc/callback`).
  - Live **Test Discovery** button querying `/.well-known/openid-configuration` and displaying resolved Authorization, Token, and UserInfo endpoints.
  - Supports allowed email domain whitelisting, custom scopes, manual endpoint overrides, masked client secret preservation, and JIT auto-provisioning toggle.
- **Admin OIDC REST API (`internal/api/api.go`)**:
  - `GET /api/v1/admin/oidc`: Returns active OIDC configuration metadata (without leaking raw Client Secret), resolved endpoints, and computed callback URL.
  - `PUT /api/v1/admin/oidc`: Validates, persists to `app.ini`, and live hot-reloads `auth.InitOIDC()` immediately with zero downtime.
  - `POST /api/v1/admin/oidc/discover`: Tests live OIDC discovery against any Issuer URL.

### Fixed & Improved
- **OIDC Engine Hardening (`internal/auth/oidc.go`)**:
  - Added JWT `id_token` payload claim fallback parsing when identity providers omit `userinfo_endpoint` or email claims from userinfo.
  - Improved GitHub OAuth2 login mapping so `PreferredUsername` is always populated from GitHub `login` even when public email is set.
  - Handled IdP consent error redirects (`?error=access_denied`) cleanly on `/api/v1/auth/oidc/callback` and expanded error messaging in `web/src/pages/Login.tsx`.
- **Config Persistence (`internal/config/config.go` & `conf/app.ini`)**:
  - Preserved `[oidc]` settings in `app.ini` even when temporarily toggled off (`ENABLED = false`) and added a clean `[oidc]` template section to default `conf/app.ini`.

---

## [1.13.0] - 2026-11-17

### Highlights: Resilient Git Working Tree Clean Handling & Toast Spam Prevention
This release hardens wiki page and repository file saving against clean working tree errors, and optimizes toast notifications to prevent alert stacking from obscuring the user interface.

### Fixed
- **Resilient Clean Working Tree Handling on Wiki & File Operations**:
  - Added direct error interception for `nothing to commit` and `working tree clean` across `SaveWikiPage`, `SaveFile`, `DeleteFile`, and `UploadFiles` in `internal/git/git.go`.
  - Saving an unchanged wiki page or changing only the page title without modifying content now safely succeeds as an idempotent no-op instead of triggering `commit wiki page failed: exit status 1 (stderr: )`.
- **Toast Notification Spam Prevention & Viewport Guard (`ModalDialog.tsx`)**:
  - Added automatic deduplication in `handleCustomToast` so identical toasts are not repeated when users click save buttons multiple times.
  - Capped maximum simultaneous visible toasts to 3, preventing notification banners from stacking vertically and hiding form fields or controls.

---

## [1.12.0] - 2026-11-17

### Highlights: Left-and-Right Toolbox Layout & Fullscreen / Expand Comparison
This release transforms the Developer Toolbox (`/toolbox`) into an intuitive two-column side-by-side architecture with persistent left navigation and right workspace. Additionally, all comparison views across the platform (Text Diff, Git Branch Compare, PR Review, and Docs Comparison Matrix) now feature full-screen expand modes.

### Added
- **Left-and-Right Toolbox Navigation**:
  - Replaced stacked top-and-bottom categories with a sticky left sidebar menu housing quick search (⌘K), category quick-filters, active utility indicator, favorites, and recently used shortcuts.
  - Right-side workspace dynamically hosts the selected tool component with full-width controls or the hub overview dashboard.
- **Universal Fullscreen & Expand Option for All Comparisons**:
  - **Toolbox Diff Tool (`/toolbox/diff`)**: Added full-screen comparison toggle (`Maximize2` / `Minimize2`) with multi-line side-by-side and unified expansion and Escape key dismissal.
  - **Branch Comparison (`/:owner/:repo/compare`)**: Added whole-comparison and per-file diff fullscreen maximize buttons with dedicated Escape key listeners and syntax-highlighted expansion.
  - **Pull Request Review (`/:owner/:repo/pulls/:index`)**: Added full-screen diff review toggle in the PR review bar for immersive code audits.
  - **Technical Comparison Matrix**: Added an interactive "Expand Fullscreen" button with dedicated modal overlay on the Git Services Comparison matrix table in documentation.

---

## [1.11.0] - 2026-11-17

### Highlights: Resilient Viewport Clamping & Inward Alignment for Mega Dropdowns
This release fixes dropdown menu alignment and page boundary crossing in the documentation header navigation. Dropdowns are now anchored inward with viewport boundary detection, preventing menu cards from overflowing the browser window or hiding content.

### Fixed
- **Inward & Right-Aligned Dropdown Positioning**: Anchored dropdown panels inward (`right: 0; left: auto`) relative to the header trigger buttons, ensuring panels open cleanly within the visible viewport instead of crossing off-screen to the right.
- **Dynamic Viewport Boundary Auto-Clamping (`alignDropdownPanel`)**: Added real-time bounding client rect inspection that dynamically detects screen edges on hover, focus, and click. If a menu would exceed the right or left viewport boundary (with a 16px safety margin), it is automatically clamped to stay completely within view.
- **Responsive Viewport Clamping**: Enforced `max-width: calc(100vw - 32px)` and box-sizing constraints across all mega dropdown panels and grids to guarantee clean rendering on small laptops, tablets, and high-DPI displays.
- **Dynamic Window Resize Alignment**: Added active window resize listeners that recalculate and smoothly readjust dropdown placement when changing display orientation or window dimensions.

---

## [1.10.0] - 2026-11-17

### Highlights: Modern Bigin-Style Dropdown Mega Navigation & Enhanced UI/UX
This release introduces a top-header navigation redesign inspired by Zoho's Bigin (`www.bigin.com`), featuring rich multi-column dropdown mega menus, icon containers with semantic color tints, descriptive microcopy, bottom featured callout strips, responsive mobile drawer integration, and direct GitHub integration.

### Added
- **Bigin-Style Dropdown Mega Navigation**:
  - Replaced cluttered flat header links with 4 organized mega-dropdown categories: **Features ▾**, **Deployment ▾**, **Resources ▾**, and **Releases ▾**.
  - **Visual Icon Containers**: Integrated custom SVG icons with distinct semantic tints (Emerald for Core/Container, Blue for Git/K8s, Purple for Collaboration/Binary, Amber for Quickstart/Tools, Cyan for TLS/Docs, Rose for Zero-Ops/Solutions).
  - **Descriptive Microcopy**: Added subheadings for every menu destination clarifying capabilities before clicking.
  - **Bigin-Style Bottom Callout Strips**: Added full-width footer action strips to each dropdown directing users to comparisons, Kubernetes runbooks, masterclass decks, and full release history.
  - **Interactive Animations**: Smooth elevation transitions, hover bridges preventing accidental menu closure, click-outside handling, and 180-degree rotating chevrons.
- **Dedicated GitHub Header Button**: Added prominent GitHub octocat button with border transitions in the primary header controls.

---

## [1.9.0] - 2026-11-15

### Highlights: Resilient Wiki & File Operations with Clean Working Tree Handling
This release fixes wiki page saving and web-based file editing when changes are clean or unchanged, eliminates false-positive `exit status 1` commit errors, captures standard output diagnostics, and adds automatic dynamic default branch resolution for bare wiki repositories.

### Fixed
- **Idempotent Wiki Page Saving**: Resolved `commit wiki page failed: exit status 1 (stderr: )` by inspecting `git status --porcelain` before executing commits. Saving an unchanged wiki page or double-clicking "Save Changes" is now treated as a successful idempotent no-op instead of triggering a fatal Git working tree clean error.
- **Web File Editor Clean Tree Resilience**: Enhanced `SaveFile` to inspect staged changes via `git status --porcelain` and return the current HEAD commit SHA gracefully when saving an unchanged file.
- **Git Error Output Capture**: Enhanced `RunGit` to capture STDOUT when STDERR is empty upon non-zero exit, ensuring complete diagnostic visibility for Git operations.
- **Dynamic Bare Wiki Default Branch Detection**: Updated `ListWikiPages`, `GetWikiPage`, `SaveWikiPage`, and `DeleteWikiPage` to dynamically resolve the repository's default branch (`main`, `master`, etc.) via `GetDefaultBranch()` instead of assuming a hardcoded branch name.

---

## [1.8.0] - 2026-11-14

### Highlights: Best-in-Class Performance & Autonomous Zero-Ops
This release introduces high-throughput kernel-level database optimizations, automated Git commit-graph acceleration, native Prometheus observability, and autonomous background self-healing.

### Added
- **`progit doctor` Self-Diagnostic CLI**: Embedded diagnostic command (`progit doctor`) testing 15 criteria across operating system, Go runtime, Git version, commit-graph capabilities, configuration parsing, install-lock security, storage writability, SQLite integrity (`PRAGMA integrity_check`), user/repo counts, port availability (3000, 3443, 2222), and TLS certificates.
- **Zero-Dependency Prometheus Metrics Subsystem**: Real-time telemetry exposed at `GET /metrics` and `GET /api/v1/metrics`:
  - Runtime & process telemetry: `progit_info`, `progit_uptime_seconds`, `progit_goroutines`, `progit_memory_alloc_bytes`, `progit_memory_sys_bytes`, `progit_heap_inuse_bytes`.
  - HTTP telemetry: `progit_http_requests_total`, status class counters (`status_class="2xx|3xx|4xx|5xx"`), cumulative duration `progit_http_request_duration_seconds_sum`, and per-route group counters.
  - Git engine telemetry: `progit_git_operations_total{operation="clone|push|gc"}`.
  - Database pool telemetry: `progit_db_open_connections`, `progit_db_in_use_connections`, `progit_db_idle_connections`, `progit_db_wait_count_total`.
  - System entity gauges: `progit_users_total`, `progit_repositories_total`, `progit_disk_used_bytes`.
- **Autonomous Background Maintenance Worker**: Scheduled zero-ops background worker (`internal/maintenance`) executing hourly non-blocking housekeeping:
  - Truncates SQLite WAL journals (`PRAGMA wal_checkpoint(TRUNCATE);`).
  - Refreshes query planner statistics (`PRAGMA optimize;`).
  - Scans bare repositories and runs `git gc --auto` and commit-graph generation when loose objects exceed threshold.
- **Administrative Maintenance API**: Added operations to `POST /api/v1/admin/maintenance`:
  - `"optimize"`: Runs query planner histogram optimization.
  - `"integrity_check"`: Executes SQLite PRAGMA integrity check.
  - `"checkpoint_wal"`: Truncates WAL journal.
  - `"run_full_cycle"`: Executes complete non-blocking maintenance across all hosted repositories and database.
- **Git Commit-Graph & Changed-Path Bloom Filters**: Added native `commit-graph` maintenance operation to `internal/git/admin.go` (`git commit-graph write --reachable --changed-paths`), automatically invoked after `git gc` and during repository maintenance.
- **Atomic Hot Backup (`VACUUM INTO`)**: Enhanced `progit backup` to produce consistent SQLite snapshots via `database.CreateHotBackup` without locking active write transactions, generating an automated SHA-256 `manifest.json`.
- **Deterministic SHA ETag & HTTP 304 Caching**: Added strong ETag and `Cache-Control: public, max-age=86400, stale-while-revalidate=3600` headers on `handleGetBlob` and `handleGetRaw`. Matching `If-None-Match` returns instant **`304 Not Modified`** without disk reads.
- **Production Kubernetes Manifests & Podman Kube Compatibility**:
  - Full Kubernetes deployment suite (`deploy/k8s/progit-deployment.yaml`, `deploy/k8s/kustomization.yaml`): PersistentVolumeClaim (10Gi+), ConfigMap, Secrets, Deployment (`strategy: Recreate`, UID/GID 1000 rootless), Service (ports 3000, 3443, 2222), and Ingress (`proxy-body-size: "1024m"`).
  - Automated Podman Kubernetes validation script (`deploy/k8s/test-podman-kube.sh`) executing `podman kube play`, health probes, Prometheus metrics, and in-container `progit doctor` diagnostics.
  - Comprehensive production deployment runbook in `docs/KUBERNETES_DEPLOYMENT.md` and updated interactive documentation portal.

### Performance
- **SQLite Kernel MMAP Direct I/O**: Configured `_pragma=mmap_size(268435456)` (256 MB) to bypass user-space buffer copies via direct kernel memory mapping.
- **Dedicated B-Tree Page Cache**: Configured `_pragma=cache_size(-64000)` (64 MB) and `_pragma=temp_store(MEMORY)` for in-memory sorts.
- **Commit History Traversals**: `git log -- <path>` queries accelerated by **10x to 50x** via generation numbers and changed-path Bloom filters.

---

## [1.7.0] - 2026-11-13

### Added
- **Global Repository Search**: Full-text substring search in Administration Panel with filtering across repository names, owners, and visibility states (`public`, `private`, `archived`, `active`).
- **Git Management Dashboard**: Real-time object store telemetry under System Overview with `git count-objects -v` inspection, single-repo maintenance (`gc`, `repack`, `prune`, `fsck`), and 1-click global `gc_all`.
- **ProGit Masterclass Slides**: 20-slide interactive educational presentation deck (`slides.html`) covering Git architecture, installation, administration, operations, developer toolbox, verified performance benchmarks, and interactive 3-year TCO calculator.

---

## [1.6.2] - 2026-11-12

### Fixed
- **Toolbox Menu Clipping**: Fixed dropdown clipping and overflow in Developer Toolbox cards (DNS lookup, JWT, Hash, Regex).

---

## [1.6.1] - 2026-11-12

### Fixed
- **ThemedSelect Dropdown Styling**: Harmonized dropdown components to match dark and light mode themes across the platform.

---

## [1.6.0] - 2026-11-12

### Added
- **Developer Productivity Toolbox**: 11 offline-first developer utilities accessible at `/toolbox`:
  1. JSON/YAML Validator & Converter
  2. JWT Token Decoder & Claim Inspector
  3. Regex Live Tester
  4. Base64 Encoder / Decoder
  5. Cryptographic Hash Generator (MD5, SHA-1, SHA-256, SHA-512)
  6. UUID v4 / v7 Generator
  7. Unix Timestamp Converter
  8. Side-by-Side Text Diff Comparator
  9. Curl to Go / Fetch Code Generator
  10. Server-Assisted Rate-Limited DNS Lookup
  11. GitHub-Flavored Markdown Live Previewer

---

## [1.5.0] - 2026-11-08

### Added
- **Default Branch Governance**:
  - Global default branch configuration (`trunk`, `main`, `master`) via `app.ini` and environment variable `PROGIT_DEFAULT_BRANCH`.
  - Per-repository default branch switcher with automatic `HEAD` symref update.
  - Branch protection validation preventing default branch deletion.

---

## [1.4.0] - 2026-11-05

### Added
- **Data Loss Prevention (DLP) Download Restriction**: `can_download: false` flag restricting git clone and archive downloads for specific users while maintaining web read-only access.
- **Creation Quotas**: Per-user and per-organization repository creation limits.
- **ProGit Pages**: Static documentation site hosting served at `/pages/{owner}/{repo}/`.

---

## [1.3.0] - 2026-11-03

### Added
- **Built-in TLS & ACME**: Auto-generated ECDSA local TLS certificates and Let's Encrypt ACME automated certificate renewal.
- **Multi-Architecture OCI Images**: Official container builds supporting both `linux/amd64` and `linux/arm64`.

---

## [1.2.0] - 2026-11-02

### Added
- **Rootless Container Deployment**: Multi-volume rootless Podman and Docker configurations (`progit-data`, `progit-repositories`, `progit-config`, `progit-logs`).
- **Health & Readiness Probes**: Kubernetes/Docker Compose health endpoints at `/api/health` and `/api/ready`.

---

## [1.1.0] - 2026-10-31

### Added
- **Pure-Go Smart HTTP**: In-process Smart HTTP protocol handler with process group isolation (`proc_unix.go`).
- **Native SSH Daemon**: Built-in SSH server on port 2222 with Ed25519/RSA public key authentication.
- **SQLite WAL Concurrency**: High-concurrency SQLite storage with Write-Ahead Logging.

---

## [1.0.0] - 2026-10-28

### Added
- **Initial Release**: Sovereign single-binary Git platform with user authentication, repository hosting, tree/blob browsing, pull requests, issues, Kanban project boards, and markdown wikis.
