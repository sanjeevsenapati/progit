# ProGit Deployment Guide

ProGit offers multiple production deployment options, with Podman as the primary container platform.

---

## 1. Option 1: Standalone Single Binary

ProGit embeds both the Go server and the React frontend into a single binary.

```bash
# 1. Build ProGit
go build -o progit ./cmd/progit

# 2. Run ProGit
./progit web
```

By default, ProGit will:
- Listen on `0.0.0.0:3000` (HTTP web interface and Git Smart HTTP).
- Listen on `0.0.0.0:2222` (Built-in Git SSH server).
- Store data in `./data/progit.db` and `./data/repositories`.

---

## 2. Option 2: Podman Deployment (Recommended)

### 2.1 Quick Start with Podman Compose
```bash
# Clone repository and change directory
cd sangit

# Start container with Compose
podman compose up -d
```

### 2.2 Standalone Podman Run
```bash
# Create persistent volumes
podman volume create progit-data
podman volume create progit-repositories
podman volume create progit-config

# Run container
podman run -d \
  --name progit \
  --restart=unless-stopped \
  -p 3000:3000 \
  -p 2222:2222 \
  -v progit-data:/data/db:Z \
  -v progit-repositories:/data/repositories:Z \
  -v progit-config:/data/config:Z \
  localhost/progit:latest
```

---

## 3. Option 3: Systemd Service (Linux)

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
Environment=PROGIT_HTTP_PORT=3000

[Install]
WantedBy=multi-user.target
```

Reload and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now progit
```

---

## 4. Reverse Proxy Setup (Nginx)

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

    client_max_body_size 500M; # Support large git push payloads

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

