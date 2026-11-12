# ProGit Podman Deployment Guide

Podman is the first-class, primary container runtime for ProGit. ProGit provides official multi-architecture container images on GitHub Container Registry (`ghcr.io`) with out-of-the-box HTTPS, automatic self-signed ECDSA certificates for `progit.local`, and rootless container isolation.

Official Documentation Portal: [https://progit.co.in](https://progit.co.in)

---

## 1. Official Container Registry Images (GHCR)

Pre-built multi-architecture images and platform-specific artifacts are publicly hosted on GitHub Container Registry:

| Registry Image / Tag | Architecture | Platform Description |
| :--- | :--- | :--- |
| `ghcr.io/sanjeevsenapati/progit:latest` | `linux/amd64` + `linux/arm64` | Multi-arch manifest (auto-selects native architecture) |
| `ghcr.io/sanjeevsenapati/progit:1.6.0` | `linux/amd64` + `linux/arm64` | Release 1.6.0 multi-arch manifest |
| `ghcr.io/sanjeevsenapati/progit:1.6.0-linux-amd64` | `linux/amd64` | Standard x86_64 production Linux servers |
| `ghcr.io/sanjeevsenapati/progit:1.6.0-linux-arm64` | `linux/arm64` | ARM64 (Apple Silicon, AWS Graviton, Raspberry Pi) |
| `ghcr.io/sanjeevsenapati/progit:linux-amd64` | `linux/amd64` | Latest rolling AMD64 build |
| `ghcr.io/sanjeevsenapati/progit:linux-arm64` | `linux/arm64` | Latest rolling ARM64 build |

Pull the image directly:
```bash
# Auto-detects architecture (AMD64 / ARM64)
podman pull ghcr.io/sanjeevsenapati/progit:latest
podman pull ghcr.io/sanjeevsenapati/progit:1.6.0

# Or pull explicitly by architecture
podman pull ghcr.io/sanjeevsenapati/progit:1.6.0-linux-amd64
```

---

## 2. Directory Layout & Volume Persistence

ProGit stores all dynamic state in `/data` inside the container:
- `progit-data`: SQLite database file (`/data/db/progit.db`) in high-concurrency WAL mode with persistent web session storage across container restarts.
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
bash podman/deploy.sh ghcr.io/sanjeevsenapati/progit:1.6.0
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

## 4. Manual Installation Guide for Red Hat Enterprise Linux 9 (RHEL 9)

This section provides a complete, production-grade manual installation procedure specifically tailored for **RHEL 9**, **Rocky Linux 9**, and **AlmaLinux 9** enterprise servers using native Podman, SELinux enforcement, and firewalld.

### 4.1 Step 1: Verify Host Architecture
Before pulling any container image, verify whether your RHEL 9 server is running on **x86_64** (Intel/AMD 64-bit) or **aarch64** (ARM 64-bit):

```bash
uname -m
```

| Output of `uname -m` | Server Architecture | Correct Container Image Tag |
| :--- | :--- | :--- |
| `x86_64` | Intel / AMD 64-bit (Standard Enterprise Servers) | `ghcr.io/sanjeevsenapati/progit:1.6.0-linux-amd64` (or `:1.6.0`) |
| `aarch64` | ARM 64-bit (AWS Graviton, Ampere Altra) | `ghcr.io/sanjeevsenapati/progit:1.6.0-linux-arm64` (or `:1.6.0`) |

> [!WARNING]
> **Architecture Mismatch Warning**:
> Pulling an `arm64` image on an `x86_64` RHEL 9 server will result in an immediate `exec /progit: exec format error` crash (container exit code `126` or `139`). Always use the matching architecture tag or the multi-arch tag `:1.6.0`.

---

### 4.2 Step 2: Install Podman & Configure Firewall on RHEL 9

1. Install Podman using DNF:
```bash
sudo dnf install -y podman
```

2. Open the required ports in `firewalld`:
```bash
# Allow HTTPS (3443), HTTP redirect (3000), and Git SSH (2222)
sudo firewall-cmd --permanent --add-port=3443/tcp
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --permanent --add-port=2222/tcp

# Reload firewalld to apply changes
sudo firewall-cmd --reload

# Verify opened ports
sudo firewall-cmd --list-ports
```

*(Optional: If you intend to bind directly to privileged ports `443` and `80` without root, execute: `sudo sysctl -w net.ipv4.ip_unprivileged_port_start=80` and persist by adding `net.ipv4.ip_unprivileged_port_start = 80` into `/etc/sysctl.d/99-podman-ports.conf`).*

---

### 4.3 Step 3: Configure SELinux & Create Persistent Volumes

RHEL 9 enforces SELinux in `Enforcing` mode by default. Podman requires the `:Z` volume flag to automatically assign the `container_file_t` SELinux context to the volume mount points. Without `:Z`, the container will encounter `Permission Denied` errors when writing to the SQLite database and Git repository storage.

Create the dedicated Podman named volumes:
```bash
podman volume create progit-data
podman volume create progit-repositories
podman volume create progit-config
podman volume create progit-logs
```

Verify volume creation:
```bash
podman volume ls
```

---

### 4.4 Step 4: Pull the Image & Launch the Container

1. Pull the appropriate image for your RHEL 9 server (example for standard `x86_64`):
```bash
# For x86_64 servers:
podman pull ghcr.io/sanjeevsenapati/progit:1.6.0-linux-amd64

# (Or pull the multi-arch manifest tag which auto-selects x86_64 or aarch64):
podman pull ghcr.io/sanjeevsenapati/progit:1.6.0
```

2. Run the container manually with background daemon mode (`-d`), persistent volumes with `:Z`, and automatic restart:
```bash
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
  ghcr.io/sanjeevsenapati/progit:1.6.0-linux-amd64
```

---

### 4.5 Step 5: Configure Systemd Auto-Start on RHEL 9 (Production)

To ensure ProGit restarts automatically upon server reboot without requiring manual intervention, integrate it with `systemd`:

#### For Rootless Deployment (Recommended on RHEL 9):
1. Enable lingering so user containers start on server boot even before login:
```bash
loginctl enable-linger $USER
```

2. Generate the systemd unit file:
```bash
mkdir -p ~/.config/systemd/user/
podman generate systemd --name progit --files --new
mv container-progit.service ~/.config/systemd/user/
```

3. Reload and enable the service:
```bash
systemctl --user daemon-reload
systemctl --user enable --now container-progit.service
systemctl --user status container-progit.service
```

#### For Root / System-Wide Deployment:
```bash
sudo podman generate systemd --name progit --files --new
sudo mv container-progit.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now container-progit.service
```

---

### 4.6 Step 6: Verification & Health Checks

Verify that ProGit is operating cleanly:

```bash
# 1. Check container runtime status
podman ps -a

# 2. Inspect runtime logs
podman logs progit

# 3. Test the built-in HTTPS health endpoint
curl -k https://localhost:3443/api/health
```

Expected output:
```json
{"status":"healthy","version":"1.3.0"}
```

Access the web interface via browser:
- **HTTPS Web UI**: `https://<your-server-ip-or-hostname>:3443`
- **HTTP Redirect**: `http://<your-server-ip-or-hostname>:3000`
- **Git SSH Remote**: `ssh://git@<your-server-ip-or-hostname>:2222/<owner>/<repo>.git`

---

### 4.7 RHEL 9 Troubleshooting Checklist

| Symptom / Error | Root Cause | Solution |
| :--- | :--- | :--- |
| `exec /progit: exec format error` | Pulled an `arm64` image on an `x86_64` CPU. | Remove image (`podman rmi ...`) and pull `ghcr.io/sanjeevsenapati/progit:1.6.0-linux-amd64`. |
| `permission denied` writing to SQLite or `/data` | Missing `:Z` flag on SELinux in Enforcing mode. | Re-run `podman run` ensuring each volume has `:Z` suffix (e.g. `-v progit-data:/data/db:Z`). |
| Connection refused or timed out from remote client | `firewalld` blocking ports `3443`, `3000`, or `2222`. | Run `sudo firewall-cmd --permanent --add-port=3443/tcp --add-port=3000/tcp --add-port=2222/tcp && sudo firewall-cmd --reload`. |
| Container stops after user logs out | Rootless Podman user session terminated. | Enable lingering: `loginctl enable-linger $USER`. |

---

## 5. Verification & Health Monitoring

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

## 6. Backups & Disaster Recovery

### 6.1 Hot Snapshot Backup
Back up the database and repository volumes safely while ProGit is running:
```bash
podman exec -t progit /usr/local/bin/progit backup
```

### 6.2 Volume Snapshot
```bash
podman volume export progit-data > progit-data-$(date +%F).tar
podman volume export progit-repositories > progit-repos-$(date +%F).tar
```

---

## 7. OpenID Connect (OIDC) & Single Sign-On Deployment

ProGit supports turnkey deployment with Google Workspace, GitHub, Microsoft 365, or Keycloak SSO by passing standard environment variables to the Podman container:

### 7.1 Running with Google Workspace SSO

```bash
podman run -d \
  --name progit \
  --restart=unless-stopped \
  -p 3443:3443 \
  -p 3000:3000 \
  -p 2222:2222 \
  -v progit-data:/data/db:Z \
  -v progit-repositories:/data/repositories:Z \
  -v progit-config:/data/config:Z \
  -e PROGIT_OIDC_ENABLED="true" \
  -e PROGIT_OIDC_PROVIDER="google" \
  -e PROGIT_OIDC_CLIENT_ID="123456789-abc.apps.googleusercontent.com" \
  -e PROGIT_OIDC_CLIENT_SECRET="GOCSPX-your-secret" \
  -e PROGIT_OIDC_ALLOWED_DOMAINS="yourcompany.com" \
  -e PROGIT_OIDC_AUTO_PROVISION="true" \
  ghcr.io/sanjeevsenapati/progit:latest
```

### 7.2 Running with Keycloak / Okta / Generic OIDC

```bash
podman run -d \
  --name progit \
  --restart=unless-stopped \
  -p 3443:3443 \
  -p 3000:3000 \
  -p 2222:2222 \
  -v progit-data:/data/db:Z \
  -v progit-repositories:/data/repositories:Z \
  -v progit-config:/data/config:Z \
  -e PROGIT_OIDC_ENABLED="true" \
  -e PROGIT_OIDC_PROVIDER="generic" \
  -e PROGIT_OIDC_CLIENT_ID="progit-client" \
  -e PROGIT_OIDC_CLIENT_SECRET="your-keycloak-client-secret" \
  -e PROGIT_OIDC_ISSUER_URL="https://idp.yourcompany.com/realms/master" \
  -e PROGIT_OIDC_DISPLAY_NAME="Company IDP" \
  -e PROGIT_OIDC_ALLOWED_DOMAINS="yourcompany.com" \
  -e PROGIT_OIDC_AUTO_PROVISION="true" \
  ghcr.io/sanjeevsenapati/progit:latest
```

### 7.3 Disabling SSO

To disable SSO and revert strictly to local database accounts, pass `-e PROGIT_OIDC_ENABLED="false"`. The explicit disable flag takes precedence over any configured client credentials.

