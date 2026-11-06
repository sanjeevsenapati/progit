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

## 1. Option 1: Podman / Docker via GHCR (Recommended)

ProGit publishes official multi-architecture container images to GitHub Container Registry:

```bash
# 1. Map local domain in /etc/hosts
echo "127.0.0.1 progit.local" | sudo tee -a /etc/hosts

# 2. Check server architecture (x86_64 vs aarch64)
uname -m

# 3. Pull official image matching your host architecture
# For standard Intel/AMD (x86_64) servers:
podman pull ghcr.io/sanjeevsenapati/progit:1.2.0-linux-amd64

# (Or pull the multi-architecture manifest tag):
podman pull ghcr.io/sanjeevsenapati/progit:latest

# 4. Launch with persistent storage and standard ports
podman run -d \
  --name progit \
  --restart=unless-stopped \
  -p 443:3443 \
  -p 80:3000 \
  -p 3443:3443 \
  -p 3000:3000 \
  -p 2222:2222 \
  -v progit-data:/data/db:Z \
  -v progit-repositories:/data/repositories:Z \
  -v progit-config:/data/config:Z \
  -v progit-logs:/data/logs:Z \
  ghcr.io/sanjeevsenapati/progit:1.2.0-linux-amd64
```

> [!NOTE]
> **RHEL 9 / Rocky Linux 9 Quick Setup**:
> - Open firewall ports: `sudo firewall-cmd --permanent --add-port={3443,3000,2222}/tcp && sudo firewall-cmd --reload`
> - SELinux in Enforcing mode requires the `:Z` volume flag (included in the command above) to avoid `permission denied` errors.
> - Detailed guide available in [PODMAN_DEPLOYMENT.md](PODMAN_DEPLOYMENT.md#4-manual-installation-guide-for-red-hat-enterprise-linux-9-rhel-9).

Open **`https://progit.local`** (or `https://progit.local:3443`) in your web browser.

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
