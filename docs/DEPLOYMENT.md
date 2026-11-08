# ProGit Production Deployment Guide

ProGit offers multiple production deployment options engineered for high performance, zero external CGO runtime dependencies, and minimal memory footprints (< 100 MB RAM).

Official Documentation: [https://progit.co.in](https://progit.co.in)

---

## Deployment Architecture Options

| Strategy | Ideal Use Case | Pros | Operational Overhead |
| :--- | :--- | :--- | :--- |
| **Podman / Docker (GHCR)** | Modern Linux servers, container clusters | Rootless isolation, 1-command upgrades | Low |
| **Standalone Binary** | Bare metal, macOS, Windows, FreeBSD | Zero containers, single static executable | Minimal |
| **Reverse Proxy (Nginx/Caddy)** | Custom domain SSL, edge caching | Standard 443/80, Let's Encrypt automated TLS | Low |
| **Multi-Node Enterprise HA** | Enterprise teams, 99.99% SLA requirements | Sub-second failover, zero single point of failure | Moderate |

---

## 1. Option 1: Container Deployment via GHCR (Podman & Docker)

ProGit publishes official multi-architecture container images to GitHub Container Registry:

### 1.1 Quick Start with Docker & Docker Compose
```bash
# 1. Map local domain in /etc/hosts
echo "127.0.0.1 progit.local" | sudo tee -a /etc/hosts

# 2. Launch with Docker CLI
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

# Or launch with Docker Compose:
docker compose up -d
```
> [!TIP]
> Complete Docker setup instructions, Ubuntu/Debian/RHEL installation steps, Caddy/Nginx reverse proxy guides, and backups are documented in [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md).

### 1.2 Quick Start with Podman
```bash
# 1. Map local domain in /etc/hosts
echo "127.0.0.1 progit.local" | sudo tee -a /etc/hosts

# 2. Launch with Podman CLI (uses :Z flag for SELinux on RHEL/Fedora)
podman run -d \
  --name progit \
  --restart=unless-stopped \
  -p 3443:3443 \
  -p 3000:3000 \
  -p 2222:2222 \
  -v progit-data:/data/db:Z \
  -v progit-repositories:/data/repositories:Z \
  -v progit-config:/data/config:Z \
  -v progit-logs:/data/logs:Z \
  ghcr.io/sanjeevsenapati/progit:latest
```
> [!NOTE]
> Detailed Podman installation, RHEL 9 manual guide, and systemd integration are documented in [PODMAN_DEPLOYMENT.md](PODMAN_DEPLOYMENT.md).

Open **`https://progit.local:3443`** (or `https://localhost:3443`) in your web browser.

---

## 2. Option 2: Standalone Pure-Go Binary

ProGit embeds both the high-concurrency Go server and the Vite React single-page frontend directly into a single native binary:

```bash
# 1. Download release or compile
go build -trimpath -ldflags="-s -w -X main.Version=1.1.0" -o progit ./cmd/progit

# 2. Run ProGit Web Server
./progit web
```

By default, ProGit will:
- Start an **HTTPS server** on `0.0.0.0:3443` (Root URL: `https://progit.local/`).
- Start an **HTTP->HTTPS redirect server** on `0.0.0.0:3000`.
- Start a **Pure-Go SSH server** on `0.0.0.0:2222`.
- Auto-generate an ECDSA P-256 TLS certificate with SANs for `progit.local`, `*.progit.local`, and `localhost`.
- Store data in `./data/progit.db` (SQLite in WAL mode) and `./data/repositories`.

---

## 3. Option 3: Systemd Service (Linux Production)

Create `/etc/systemd/system/progit.service`:
```ini
[Unit]
Description=ProGit Git Collaboration Platform
After=network.target

[Service]
Type=simple
User=git
Group=git
WorkingDirectory=/home/git/progit
ExecStart=/home/git/progit/progit web
Restart=always
RestartSec=5
LimitNOFILE=65536
Environment=PROGIT_PROTOCOL=https
Environment=PROGIT_DOMAIN=git.example.com
Environment=PROGIT_ROOT_URL=https://git.example.com/
Environment=PROGIT_HTTPS_PORT=443
Environment=PROGIT_HTTP_PORT=80
Environment=PROGIT_REDIRECT_OTHER_PORT=true
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
```

Reload and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now progit
sudo systemctl status progit
```

---

## 4. Option 4: Reverse Proxy Configuration

### 4.1 Nginx Reverse Proxy
```nginx
server {
    listen 80;
    server_name git.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name git.example.com;

    ssl_certificate /etc/letsencrypt/live/git.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/git.example.com/privkey.pem;

    client_max_body_size 500M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 4.2 Caddy Reverse Proxy
```caddy
git.example.com {
    reverse_proxy 127.0.0.1:3000
}
```
