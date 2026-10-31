# ProGit Podman Operational Scripts

This directory contains standalone management scripts for building, deploying, testing, backing up, and maintaining ProGit on Podman without requiring Podman Compose or root privileges.

## Script Reference

| Script | Purpose |
|---|---|
| `./podman/build.sh` | Builds the `localhost/progit:latest` multi-stage container image |
| `./podman/deploy.sh` | Creates persistent volumes and launches the ProGit container |
| `./podman/stop.sh` | Gracefully stops the running container |
| `./podman/restart.sh` | Restarts the container |
| `./podman/update.sh` | Rebuilds image and updates container preserving persistent volumes |
| `./podman/backup.sh` | Truncates SQLite WAL and archives persistent data to `./backups` |
| `./podman/restore.sh` | Restores database and repositories from a backup archive |
| `./podman/health-check.sh`| Queries `/api/health` and verifies container status |
| `./podman/logs.sh` | Tails container logs in real time |
| `./podman/clean.sh` | Tears down container and persistent volumes (for clean test runs) |
| `./podman/test.sh` | Runs end-to-end container integration and Git protocol tests |

