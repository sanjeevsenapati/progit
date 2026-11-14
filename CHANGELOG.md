# Changelog

All notable changes to **ProGit** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

