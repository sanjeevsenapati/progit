# ProGit Upgrade, Backup & Disaster Recovery Guide

## 1. Backup Strategy

To maintain transactional consistency across the SQLite database and Git bare repositories:
1. SQLite WAL checkpointing ensures pending writes are committed to the main database file.
2. The SQLite database is safely copied (using SQLite `.backup` API or online copy).
3. The repository directory is archived.

### Automated Backup Script
Run:
```bash
./podman/backup.sh
```
This generates a timestamped tarball in `./backups/progit-backup-YYYYMMDD-HHMMSS.tar.gz`.

---

## 2. Disaster Recovery & Restore

To restore from a backup:
```bash
./podman/restore.sh ./backups/progit-backup-YYYYMMDD-HHMMSS.tar.gz
```
The script will:
1. Stop the active ProGit container.
2. Restore the database file and repositories into the persistent volumes.
3. Restart the container and execute health checks.

---

## 3. Upgrades

Upgrades are non-destructive and preserve persistent volume state:
```bash
# 1. Take a preventative backup
./podman/backup.sh

# 2. Build the updated image
./podman/build.sh

# 3. Update the container
./podman/update.sh
```

ProGit automatically executes database migrations upon startup. If migrations are pending, they will apply transactionally without losing any user accounts, repository objects, or settings.

