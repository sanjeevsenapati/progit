# ProGit Podman Deployment Guide

Podman is the first-class, primary container runtime for ProGit. ProGit provides official multi-architecture container images on GitHub Container Registry (`ghcr.io`) with out-of-the-box HTTPS, automatic self-signed ECDSA certificates for `progit.local`, and rootless container isolation.

Official Documentation Portal: [https://progit.co.in](https://progit.co.in)

---

## 1. Official Container Registry Images (GHCR)

Pre-built multi-architecture images and platform-specific artifacts are publicly hosted on GitHub Container Registry:

| Registry Image / Tag | Architecture | Platform Description |
| :--- | :--- | :--- |
| `ghcr.io/sanjeevsenapati/progit:latest` | `linux/amd64` + `linux/arm64` | Multi-arch manifest (auto-selects native architecture) |
| `ghcr.io/sanjeevsenapati/progit:1.1.0` | `linux/amd64` + `linux/arm64` | Release 1.1.0 multi-arch manifest |
| `ghcr.io/sanjeevsenapati/progit:1.1.0-linux-amd64` | `linux/amd64` | Standard x86_64 production Linux servers |
| `ghcr.io/sanjeevsenapati/progit:1.1.0-linux-arm64` | `linux/arm64` | ARM64 (Apple Silicon, AWS Graviton, Raspberry Pi) |
| `ghcr.io/sanjeevsenapati/progit:linux-amd64` | `linux/amd64` | Latest rolling AMD64 build |
| `ghcr.io/sanjeevsenapati/progit:linux-arm64` | `linux/arm64` | Latest rolling ARM64 build |

Pull the image directly:
```bash
# Auto-detects architecture (AMD64 / ARM64)
podman pull ghcr.io/sanjeevsenapati/progit:latest

# Or pull explicitly by architecture
podman pull ghcr.io/sanjeevsenapati/progit:1.1.0-linux-amd64
```

---

## 2. Directory Layout & Volume Persistence

ProGit stores all dynamic state in `/data` inside the container:
- `progit-data`: SQLite database file (`/data/db/progit.db`) in high-concurrency WAL mode.
- `progit-repositories`: Bare Git repositories (`/data/repositories/<owner>/<repo>.git`).
- `progit-config`: Configuration overrides and SSL certificates (`/data/config/https/cert.pem` and `key.pem`).
- `progit-logs`: Application operational logs (`/data/logs`).

Create persistent named volumes:
```bash
podman volume create progit-data
podman volume create progit-repositories
podman volume create progit-config
podman volume create progit-logs
```

---

## 3. Quickstart Deployment

### 3.1 Local DNS Configuration
Add `progit.local` to your machine's `/etc/hosts` file for seamless local name resolution:
```bash
echo "127.0.0.1 progit.local" | sudo tee -a /etc/hosts
```

### 3.2 Automated Script Deployment
Run the included deployment script:
```bash
bash podman/deploy.sh ghcr.io/sanjeevsenapati/progit:1.1.0-linux-amd64
```

### 3.3 Standalone Podman Run CLI
Run ProGit with both standard ports (`443`, `80`) and unprivileged user ports (`3443`, `3000`):
```bash
podman run -d \
  --name progit \
  --restart=unless-stopped \
  -p 443:3443 \
  -p 80:3000 \
  -p 3000:3000 \
  -p 3443:3443 \
  -p 2222:2222 \
  -v progit-data:/data/db:Z \
  -v progit-repositories:/data/repositories:Z \
  -v progit-config:/data/config:Z \
  -v progit-logs:/data/logs:Z \
  ghcr.io/sanjeevsenapati/progit:latest
```

> [!NOTE]
> On rootless Linux environments where ports below 1024 are restricted, allow unprivileged binding with:
> `sudo sysctl net.ipv4.ip_unprivileged_port_start=80`
> Or connect directly using port `3443` (`https://progit.local:3443`).

### 3.4 Podman Compose Deployment
```yaml
services:
  progit:
    image: ghcr.io/sanjeevsenapati/progit:latest
    container_name: progit
    restart: unless-stopped
    ports:
      - "443:3443"
      - "80:3000"
      - "3000:3000"
      - "3443:3443"
      - "2222:2222"
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
    volumes:
      - progit-data:/data/db:Z
      - progit-repositories:/data/repositories:Z
      - progit-config:/data/config:Z
      - progit-logs:/data/logs:Z
    healthcheck:
      test: ["CMD", "curl", "-k", "-f", "https://localhost:3443/api/health"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 5s

volumes:
  progit-data:
  progit-repositories:
  progit-config:
  progit-logs:
```

Launch with:
```bash
podman compose up -d
```

---

## 4. Verification & Health Monitoring

Verify container health and TLS encryption:
```bash
# 1. Check container runtime status
podman ps

# 2. Check application health endpoint over HTTPS
curl -k https://progit.local:3443/api/health

# 3. Test HTTP to HTTPS redirect
curl -i http://localhost:3000/

# 4. View container logs
podman logs -f progit
```

---

## 5. Backups & Disaster Recovery

### 5.1 Hot Snapshot Backup
Back up the database and repository volumes safely while ProGit is running:
```bash
podman exec -t progit /usr/local/bin/progit backup
```

### 5.2 Volume Snapshot
```bash
podman volume export progit-data > progit-data-$(date +%F).tar
podman volume export progit-repositories > progit-repos-$(date +%F).tar
```
