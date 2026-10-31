# ProGit Podman Test & Verification Report

**Date**: 2026-10-31  
**Image**: `localhost/progit:latest`  
**Image Size**: 35.7 MB  
**Base OS**: Alpine Linux 3.21 (OCI runtime)  
**Security Profile**: Non-root (`progit:1000:1000`), SELinux volume relabeling (`:Z`)  

---

## 1. Executive Summary

All functional requirements, container verification checks, persistence lifecycles, and git operations defined in `project.md` have been verified and tested.

### Root Cause Analysis of Resolved Issue:
- **Symptom**: `Failed to initialize git repository: git push -u origin main failed: exit status 128 (stderr: fatal: 'data/repositories/sanjeev.progit/test.git' does not appear to be a git repository...)`
- **Root Cause**: When a repository was initialized with `auto_init: true`, ProGit created a temporary directory (`/tmp/progit-init-*`) and added the bare repository as remote `origin`. Because `cfg.Repository.Root` was configured with a relative path (e.g. `./data/repositories`), the remote URL was set to the relative path string. When `git push -u origin main` ran inside the temporary directory, Git attempted to locate `data/repositories/...` relative to `/tmp/progit-init-*` instead of the server's working directory.
- **Resolution**:
  1. `InitRepositoryWithReadme`, `InitBareRepository`, and `MergeBranches` in `internal/git/git.go` now convert `repoPath` to canonical absolute paths via `filepath.Abs`.
  2. `internal/config/config.go` automatically resolves storage paths (`Repository.Root`, `Database.Path`, `SSH.KeyPath`) to absolute paths upon initialization.
  3. `RunGit` now resolves `dir` to absolute paths before executing child git processes.
  4. `MergeBranches` now tracks `origin/<headBranch>` locally before executing merges, ensuring clean non-fast-forward merge commits.

---

## 2. Go Unit Test Suite

```
=== RUN   TestHealthAndReadiness
--- PASS: TestHealthAndReadiness (0.01s)
=== RUN   TestAuthRegistrationAndLogin
--- PASS: TestAuthRegistrationAndLogin (0.43s)
PASS: progit.io/progit/internal/api

=== RUN   TestDatabaseAndUserLifecycle
--- PASS: TestDatabaseAndUserLifecycle (0.08s)
=== RUN   TestRepositoryAndIssues
--- PASS: TestRepositoryAndIssues (0.00s)
PASS: progit.io/progit/internal/database

=== RUN   TestGitOperations
--- PASS: TestGitOperations (0.19s)
=== RUN   TestRelativePathInitRepositoryWithReadme
--- PASS: TestRelativePathInitRepositoryWithReadme (0.14s)
=== RUN   TestMergeBranches
--- PASS: TestMergeBranches (0.36s)
PASS: progit.io/progit/internal/git
```

---

## 3. Podman Live Container Functional Test Suite (`./podman/test.sh`)

| # | Test Case | Target | Result |
|---|---|---|---|
| 1 | Health and Readiness Probes | `/api/health`, `/api/ready` | **PASSED** |
| 2 | Admin Account Creation | `progit admin create-user` / `/api/v1/auth/register` | **PASSED** |
| 3 | Authentication & Session Cookie | `/api/v1/auth/login`, `/api/v1/auth/me` | **PASSED** |
| 4 | Repository Creation with Auto-Init | `POST /api/v1/repos` | **PASSED** |
| 5 | Git CLI Clone over HTTP | `git clone http://...` | **PASSED** |
| 6 | Git Commit and Push over HTTP | `git push origin main` | **PASSED** |
| 7 | Remote State Verification (Clone 2) | `git clone ... verify_clone` | **PASSED** |
| 8 | Issue & Comment Workflow | `POST /issues`, `POST /comments` | **PASSED** |
| 9 | Branching, PR & Real Merge | `POST /branches`, `POST /pulls`, `POST /merge` | **PASSED** |
| 10 | Admin Telemetry API | `GET /api/v1/admin/stats` | **PASSED** |

**Summary**: 10 / 10 Tests Passed (100%).

---

## 4. Lifecycle & Persistence Verification

1. **Transactional Backup (`./podman/backup.sh`)**:
   - Checkpoints SQLite WAL mode before archiving.
   - Packages database and bare repositories into compressed `.tar.gz`.
   - Verified backup artifact generated: `backups/progit-backup-*.tar.gz`.

2. **Full Restore (`./podman/restore.sh`)**:
   - Restores database and repositories cleanly into container persistent volumes.
   - Container restarted and health checks validated: `ready` and `status: ok`.

3. **Container Recreation Persistence**:
   - Container stopped and removed with `podman stop progit && podman rm progit`.
   - Re-launched using `./podman/deploy.sh` mounting existing volumes `progit-data` and `progit-repositories`.
   - Verified all users, repositories, and git commit objects remained fully intact.

