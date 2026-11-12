# ProGit Docker Deployment Guide

Docker is a fully supported, production-ready container platform for ProGit. ProGit provides official multi-architecture container images on GitHub Container Registry (`ghcr.io`) featuring turnkey HTTPS, automatic self-signed ECDSA TLS certificates for `progit.local`, embedded SQLite WAL database storage, native Git Smart HTTPS, and an integrated pure-Go SSH server.

Official Documentation Portal: [https://progit.co.in](https://progit.co.in)

---

## 1. Official Container Registry Images (GHCR)

Pre-built multi-architecture container images are publicly hosted on GitHub Container Registry (`ghcr.io`):

| Registry Image / Tag | Architecture | Platform Description |
| :--- | :--- | :--- |
| `ghcr.io/sanjeevsenapati/progit:latest` | `linux/amd64` + `linux/arm64` | Multi-arch manifest (auto-selects native host architecture) |
| `ghcr.io/sanjeevsenapati/progit:1.6.2` | `linux/amd64` + `linux/arm64` | Release 1.6.2 multi-arch manifest |
| `ghcr.io/sanjeevsenapati/progit:1.6.2-linux-amd64` | `linux/amd64` | Standard x86_64 production Linux servers (Intel / AMD) |
| `ghcr.io/sanjeevsenapati/progit:1.6.2-linux-arm64` | `linux/arm64` | ARM64 (Apple Silicon, AWS Graviton, Ampere, Raspberry Pi) |
| `ghcr.io/sanjeevsenapati/progit:linux-amd64` | `linux/amd64` | Rolling AMD64 continuous build |
| `ghcr.io/sanjeevsenapati/progit:linux-arm64` | `linux/arm64` | Rolling ARM64 continuous build |

Pull the image directly with Docker:
```bash
# Auto-detects native CPU architecture (AMD64 or ARM64)
docker pull ghcr.io/sanjeevsenapati/progit:latest
docker pull ghcr.io/sanjeevsenapati/progit:1.6.2

# Or pull explicitly by architecture
docker pull ghcr.io/sanjeevsenapati/progit:1.6.2-linux-amd64
```

---

## 2. Directory Layout & Persistent Named Volumes

ProGit persists all dynamic state within isolated Docker named volumes under `/data` inside the container:
- `progit-data`: SQLite database file (`/data/db/progit.db`) configured in high-concurrency WAL mode with persistent session storage.
- `progit-repositories`: Bare Git repositories (`/data/repositories/<owner>/<repo>.git`).
- `progit-config`: Configuration overrides and SSL certificates (`/data/config/https/cert.pem` and `key.pem`).
- `progit-logs`: Application operational logs (`/data/logs`).

Create the persistent named volumes before starting:
```bash
docker volume create progit-data
docker volume create progit-repositories
docker volume create progit-config
docker volume create progit-logs
```

---

## 3. Quickstart Deployment

### 3.1 Local DNS Configuration
Add `progit.local` to your machine's `/etc/hosts` file for seamless local name resolution:
```bash
echo "127.0.0.1 progit.local" | sudo tee -a /etc/hosts
```

### 3.2 Standalone Docker CLI Run
Run ProGit with unprivileged user ports (`3443`, `3000`, and `2222`):
```bash
docker run -d \
  --name progit \
  --restart=unless-stopped \
  -p 3443:3443 \
  -p 3000:3000 \
  -p 2222:2222 \
  -v progit-data:/data/db \
  -v progit-repositories:/data/repositories \
  -v progit-config:/data/config \
  -v progit-logs:/data/logs \
  ghcr.io/sanjeevsenapati/progit:latest
```

Or expose standard privileged ports (`443` HTTPS and `80` HTTP redirect):
```bash
docker run -d \
  --name progit \
  --restart=unless-stopped \
  -p 443:3443 \
  -p 80:3000 \
  -p 3443:3443 \
  -p 3000:3000 \
  -p 2222:2222 \
  -v progit-data:/data/db \
  -v progit-repositories:/data/repositories \
  -v progit-config:/data/config \
  -v progit-logs:/data/logs \
  ghcr.io/sanjeevsenapati/progit:latest
```

### 3.3 Automated Script Deployment
Run the included Docker deployment script from the repository:
```bash
bash docker/deploy.sh ghcr.io/sanjeevsenapati/progit:latest
```

---

## 4. Production Deployment with Docker Compose

Docker Compose is the recommended way to run ProGit in production environments.

### 4.1 `docker-compose.yml` Configuration

Save the following file as `docker-compose.yml`:

```yaml
services:
  progit:
    image: ghcr.io/sanjeevsenapati/progit:latest
    container_name: progit
    restart: unless-stopped
    ports:
      # Primary HTTPS web interface & Git Smart HTTPS
      - "3443:3443"
      # HTTP redirect listener (redirects to port 3443)
      - "3000:3000"
      # Built-in Git SSH Server
      - "2222:2222"
      # Standard privileged ports (optional, if running on dedicated server)
      # - "443:3443"
      # - "80:3000"
    environment:
      - PROGIT_APP_NAME=ProGit
      - PROGIT_DOMAIN=progit.local
      - PROGIT_PROTOCOL=https
      - PROGIT_ROOT_URL=https://progit.local:3443/
      - PROGIT_HTTPS_PORT=3443
      - PROGIT_HTTP_PORT=3000
      - PROGIT_REDIRECT_OTHER_PORT=true
      - PROGIT_CERT_FILE=/data/config/https/cert.pem
      - PROGIT_KEY_FILE=/data/config/https/key.pem
      - PROGIT_DB_PATH=/data/db/progit.db
      - PROGIT_REPO_ROOT=/data/repositories
      - PROGIT_SSH_ENABLED=true
      - PROGIT_SSH_PORT=2222
      # Optional: Enable OpenID Connect / Google Workspace SSO
      # - PROGIT_OIDC_ENABLED=true
      # - PROGIT_OIDC_PROVIDER=google
      # - PROGIT_OIDC_CLIENT_ID=your-client-id.apps.googleusercontent.com
      # - PROGIT_OIDC_CLIENT_SECRET=your-client-secret
      # - PROGIT_OIDC_ALLOWED_DOMAINS=yourcompany.com
      # - PROGIT_OIDC_AUTO_PROVISION=true
    volumes:
      - progit-data:/data/db
      - progit-repositories:/data/repositories
      - progit-config:/data/config
      - progit-logs:/data/logs
    healthcheck:
      test: ["CMD", "curl", "-k", "-f", "https://localhost:3443/api/health"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 5s

volumes:
  progit-data:
    name: progit-data
  progit-repositories:
    name: progit-repositories
  progit-config:
    name: progit-config
  progit-logs:
    name: progit-logs
```

### 4.2 Docker Compose Commands
```bash
# Start container in detached background mode
docker compose up -d

# View live container logs
docker compose logs -f

# Check service status and health probe
docker compose ps

# Update to latest version
docker compose pull && docker compose up -d

# Stop service
docker compose down
```

---

## 5. Linux Distribution Installation Guide

### 5.1 Ubuntu 22.04 / 24.04 LTS & Debian 12

1. Install official Docker Engine:
```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

2. Configure UFW Firewall:
```bash
# Allow HTTPS (3443), HTTP redirect (3000), and Git SSH (2222)
sudo ufw allow 3443/tcp
sudo ufw allow 3000/tcp
sudo ufw allow 2222/tcp
sudo ufw reload
```

3. Launch ProGit:
```bash
docker compose up -d
```

---

### 5.2 Red Hat Enterprise Linux (RHEL 8/9), Rocky Linux & AlmaLinux

1. Install Docker Engine via CentOS/RHEL repository:
```bash
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker
```

2. Configure firewalld:
```bash
sudo firewall-cmd --permanent --add-port={3443,3000,2222}/tcp
sudo firewall-cmd --reload
```

3. If running Docker on RHEL with SELinux in Enforcing mode:
```bash
# Add :z or :Z to volume mounts in docker-compose.yml if SELinux relabeling is required
# (e.g. - progit-data:/data/db:z)
```

---

### 5.3 Amazon Linux 2023 (AWS EC2)

```bash
# Install Docker Engine
sudo dnf install -y docker
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user

# Install Docker Compose Plugin
DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
mkdir -p $DOCKER_CONFIG/cli-plugins
curl -SL https://github.com/docker/compose/releases/download/v2.29.1/docker-compose-linux-x86_64 -o $DOCKER_CONFIG/cli-plugins/docker-compose
chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose

# Launch ProGit
docker compose up -d
```

---

## 6. Docker Desktop on macOS & Windows

ProGit is 100% compatible with Docker Desktop on macOS (Intel and Apple Silicon) and Windows 10/11 (WSL 2 backend):

1. **Architecture Detection**:
   - On Apple Silicon (`M1/M2/M3/M4`), Docker automatically pulls the `linux/arm64` image variant.
   - On Intel Macs and Windows x86_64, Docker pulls the `linux/amd64` variant.
2. **Accessing the Web UI**:
   - Open `https://localhost:3443` or `https://progit.local:3443` in your browser.
   - Accept the auto-generated TLS certificate or download the root certificate directly from `https://localhost:3443/api/v1/server/cert`.
3. **Cloning Repositories Locally**:
   ```bash
   # Git Smart HTTPS
   git clone -c http.sslVerify=false https://localhost:3443/<owner>/<repo>.git

   # Git SSH
   git clone ssh://git@localhost:2222/<owner>/<repo>.git
   ```

---

## 7. Reverse Proxy & Automated Let's Encrypt SSL (Caddy / Nginx)

If exposing ProGit on a public domain with Let's Encrypt certificates on standard port `443`, place Caddy or Nginx in front of ProGit:

### 7.1 Caddy + ProGit `docker-compose.yml`

```yaml
services:
  caddy:
    image: caddy:2-alpine
    container_name: caddy-proxy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - progit

  progit:
    image: ghcr.io/sanjeevsenapati/progit:latest
    container_name: progit
    restart: unless-stopped
    expose:
      - "3000"
      - "3443"
    ports:
      - "2222:2222" # SSH forwarded directly
    environment:
      - PROGIT_DOMAIN=git.yourcompany.com
      - PROGIT_PROTOCOL=https
      - PROGIT_ROOT_URL=https://git.yourcompany.com/
      - PROGIT_REDIRECT_OTHER_PORT=false
    volumes:
      - progit-data:/data/db
      - progit-repositories:/data/repositories
      - progit-config:/data/config
      - progit-logs:/data/logs

volumes:
  progit-data:
  progit-repositories:
  progit-config:
  progit-logs:
  caddy-data:
  caddy-config:
```

**`Caddyfile`**:
```caddyfile
git.yourcompany.com {
    reverse_proxy progit:3000
}
```

---

## 8. Verification & Health Monitoring

Verify container runtime status and application health:

```bash
# 1. Check running status
docker ps -f "name=progit"

# 2. View streaming logs
docker logs -f progit

# 3. Test HTTPS health endpoint
curl -k https://localhost:3443/api/health

# 4. Inspect Docker health status
docker inspect --format='{{json .State.Health.Status}}' progit
```

Expected health JSON response:
```json
{
  "app": "ProGit",
  "database": "healthy",
  "repositories": "accessible",
  "ssh_enabled": true,
  "status": "ok",
  "version": "1.6.2"
}
```

---

## 9. Backups & Disaster Recovery

### 9.1 Live Hot Snapshot Backup
Create a compressed archive of the SQLite database, Git repositories, and configuration without stopping the container:

```bash
# Using the helper script
./docker/backup.sh ./backups

# Or using standard Docker CLI:
docker run --rm \
  -v progit-data:/data/db:ro \
  -v progit-repositories:/data/repositories:ro \
  -v progit-config:/data/config:ro \
  -v $(pwd)/backups:/backup \
  alpine:3.21 tar -czf "/backup/progit_backup_$(date +%F).tar.gz" -C /data db repositories config
```

### 9.2 Restore from Backup Archive

```bash
# 1. Stop container
docker stop progit

# 2. Restore volumes
docker run --rm \
  -v progit-data:/data/db \
  -v progit-repositories:/data/repositories \
  -v progit-config:/data/config \
  -v $(pwd)/backups/progit_backup_2026-11-08.tar.gz:/backup/restore.tar.gz:ro \
  alpine:3.21 sh -c "tar -xzf /backup/restore.tar.gz -C /data && chown -R 1000:1000 /data"

# 3. Restart container
docker start progit
```

---

## 10. OpenID Connect (OIDC) & Single Sign-On (SSO)

Pass standard environment variables in `docker-compose.yml` or `docker run` to integrate enterprise identity providers:

### 10.1 Google Workspace SSO
```bash
docker run -d \
  --name progit \
  --restart=unless-stopped \
  -p 3443:3443 \
  -p 3000:3000 \
  -p 2222:2222 \
  -v progit-data:/data/db \
  -v progit-repositories:/data/repositories \
  -v progit-config:/data/config \
  -e PROGIT_OIDC_ENABLED="true" \
  -e PROGIT_OIDC_PROVIDER="google" \
  -e PROGIT_OIDC_CLIENT_ID="123456789-abc.apps.googleusercontent.com" \
  -e PROGIT_OIDC_CLIENT_SECRET="GOCSPX-your-secret" \
  -e PROGIT_OIDC_ALLOWED_DOMAINS="yourcompany.com" \
  -e PROGIT_OIDC_AUTO_PROVISION="true" \
  ghcr.io/sanjeevsenapati/progit:latest
```

### 10.2 Keycloak / Okta / Azure AD / Generic OIDC
```bash
docker run -d \
  --name progit \
  --restart=unless-stopped \
  -p 3443:3443 \
  -p 3000:3000 \
  -p 2222:2222 \
  -v progit-data:/data/db \
  -v progit-repositories:/data/repositories \
  -v progit-config:/data/config \
  -e PROGIT_OIDC_ENABLED="true" \
  -e PROGIT_OIDC_PROVIDER="generic" \
  -e PROGIT_OIDC_CLIENT_ID="progit-client" \
  -e PROGIT_OIDC_CLIENT_SECRET="your-keycloak-client-secret" \
  -e PROGIT_OIDC_ISSUER_URL="https://idp.yourcompany.com/realms/master" \
  -e PROGIT_OIDC_DISPLAY_NAME="Company SSO" \
  -e PROGIT_OIDC_ALLOWED_DOMAINS="yourcompany.com" \
  -e PROGIT_OIDC_AUTO_PROVISION="true" \
  ghcr.io/sanjeevsenapati/progit:latest
```

### 10.3 Disabling SSO
To disable SSO and revert strictly to local database accounts, pass `-e PROGIT_OIDC_ENABLED="false"`. The explicit disable flag takes precedence over any configured client credentials.

---

## 11. Comparison: Docker vs Podman Interoperability

ProGit container images are built in the Open Container Initiative (OCI) format and run identically across Docker and Podman:

| Feature | Docker | Podman |
| :--- | :--- | :--- |
| **Runtime Architecture** | Client-Server daemon (`dockerd`) | Daemonless fork/exec (`conmon`) |
| **Rootless by Default** | Requires Rootless Docker installation | Native out-of-the-box (`podman run`) |
| **SELinux Volume Relabeling** | Optional (standard Linux permissions) | Required `:Z` or `:z` volume flag on RHEL/Fedora |
| **Service Integration** | Docker restart policy or Docker Swarm | Native `systemd` generation (`podman generate systemd`) |
| **CLI Command Syntax** | `docker run ...` / `docker compose ...` | `podman run ...` / `podman compose ...` |
| **Multi-Arch Builds** | `docker buildx build --platform ...` | `podman build --platform ...` |

### Migrating Volumes between Docker and Podman
To migrate data from Docker to Podman (or vice versa):
```bash
# 1. Export volume from Docker
docker run --rm -v progit-data:/from:ro -v $(pwd):/backup alpine tar -czf /backup/progit-data.tar.gz -C /from .

# 2. Import volume into Podman
podman volume create progit-data
podman run --rm -v progit-data:/to:Z -v $(pwd):/backup:ro alpine tar -xzf /backup/progit-data.tar.gz -C /to
```

---

## 12. Troubleshooting Checklist

| Symptom / Error | Root Cause | Solution |
| :--- | :--- | :--- |
| `exec /progit: exec format error` | Pulled ARM64 image on an x86_64 host or vice versa. | Run `docker pull ghcr.io/sanjeevsenapati/progit:1.6.2-linux-amd64` (for Intel/AMD) or `:1.6.2-linux-arm64` (for ARM). |
| `bind: address already in use` | Another service is using port `3443`, `3000`, or `2222`. | Check `sudo lsof -i :3443` or remap host ports in `docker-compose.yml` (e.g. `"8443:3443"`). |
| `permission denied` on `/data/db/progit.db` | Host directory permissions mismatch or SELinux blocking. | Ensure named volumes are used (`progit-data`), or append `:z` on RHEL/CentOS systems. |
| Browser shows `NET::ERR_CERT_AUTHORITY_INVALID` | ProGit uses an auto-generated ECDSA self-signed certificate for local HTTPS. | Download the certificate from `https://localhost:3443/api/v1/server/cert` and import it into your OS trust store, or use Caddy/Nginx for Let's Encrypt. |
| SSH connection rejected on port 2222 | Host firewall or security group blocking port 2222. | Allow port 2222 in UFW (`sudo ufw allow 2222/tcp`) or AWS EC2 Security Group. |
