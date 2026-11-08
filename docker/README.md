# ProGit Docker Automation & Deployment Scripts

This directory contains standalone automation scripts for managing ProGit using the standard Docker engine and Docker Compose.

---

## Script Overview

| Script | Command | Purpose |
| :--- | :--- | :--- |
| **`deploy.sh`** | `./docker/deploy.sh [IMAGE]` | Launches ProGit container with persistent named volumes and health check. |
| **`build.sh`** | `./docker/build.sh [amd64\|arm64\|all]` | Builds local Docker image (single-arch or multi-arch buildx). |
| **`health-check.sh`** | `./docker/health-check.sh` | Queries local container status and HTTPS `/api/health` probe. |
| **`logs.sh`** | `./docker/logs.sh [LINES]` | Streams live stdout/stderr logs from the running container. |
| **`restart.sh`** | `./docker/restart.sh` | Restarts the running container and verifies health. |
| **`stop.sh`** | `./docker/stop.sh` | Gracefully stops the container without deleting persistent data. |
| **`clean.sh`** | `./docker/clean.sh` | Stops and removes container instance (volumes remain intact). |
| **`update.sh`** | `./docker/update.sh [IMAGE]` | Pulls latest GHCR image and re-creates container with zero downtime. |
| **`backup.sh`** | `./docker/backup.sh [DIR]` | Creates consistent tar.gz archive of SQLite database, Git repos, and SSL config. |
| **`restore.sh`** | `./docker/restore.sh <TAR>` | Restores data volumes from a backup archive with proper ownership. |

---

## Quickstart

```bash
# 1. Quick deploy using official GHCR image
./docker/deploy.sh

# 2. Or launch with Docker Compose
docker compose up -d

# 3. Check health status
./docker/health-check.sh
```
