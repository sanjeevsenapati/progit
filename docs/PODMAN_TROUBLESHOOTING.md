# ProGit Podman Troubleshooting Guide

## Common Issues and Solutions

### 1. Port Conflicts (3000 or 2222 already in use)
**Symptom**: `Error: rootlessport: ... bind: address already in use`
**Solution**:
1. Identify conflicting process:
   ```bash
   lsof -i :3000
   lsof -i :2222
   ```
2. Or change the host port mapping:
   ```bash
   podman run -d -p 3001:3000 -p 2223:2222 ...
   ```

### 2. Permission Denied on Mounted Volumes (SELinux)
**Symptom**: `permission denied` accessing `/data/db` or `/data/repositories`.
**Solution**:
Ensure the `:Z` flag is attached to mounted volumes in Podman:
```bash
-v progit-data:/data/db:Z \
-v progit-repositories:/data/repositories:Z
```
`:Z` labels the volume with a private SELinux context accessible exclusively by this container.

### 3. Container Exits Immediately
**Symptom**: `podman ps` shows empty, `podman ps -a` shows exited status.
**Solution**:
Check the container logs:
```bash
podman logs progit
```
Common causes include invalid configuration or database path permissions.

### 4. Git SSH Authentication Failure
**Symptom**: `Permission denied (publickey)` when attempting `git clone ssh://git@localhost:2222/...`
**Solution**:
1. Verify the SSH key is added in **User Settings > SSH Keys**.
2. Ensure you are specifying the correct private key:
   ```bash
   GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519 -p 2222" git clone ssh://git@localhost:2222/owner/repo.git
   ```

### 5. Git HTTP 401 Unauthorized
**Symptom**: Prompted for username/password or 401 error during push/pull.
**Solution**:
- If 2FA is enabled or using external auth, use a **Personal Access Token** as the password.
- Verify user has write permissions to the repository.

