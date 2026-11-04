# ProGit Podman Deployment Guide

Podman is the first-class, primary container runtime for ProGit.

---

## 1. Prerequisites

- Podman 4.x or 5.x installed (`podman --version`).
- Podman machine running on macOS/Windows (`podman machine start`), or native Linux system.
- Ports `3000` (HTTP) and `2222` (SSH) available.

---

## 2. Directory Layout & Volumes

ProGit persists all dynamic state within isolated volumes:
- `progit-data`: Stores the SQLite database file (`progit.db`).
- `progit-repositories`: Stores all bare Git repositories (`<owner>/<repo>.git`).
- `progit-config`: Stores configuration file overrides (`app.ini`).

---

## 3. Container Images & Deployment

### 3.1 Pull Official Image from GitHub Container Registry (GHCR)
```bash
# Pull Linux x86_64 (amd64) production image:
podman pull ghcr.io/sanjeevsenapati/progit:1.1.0-linux-amd64

# Pull multi-architecture release (auto-selects amd64 or arm64):
podman pull ghcr.io/sanjeevsenapati/progit:1.1.0
podman pull ghcr.io/sanjeevsenapati/progit:latest
```

### 3.2 Multi-Architecture Build (Optional)
Builds images for both `linux/amd64` (standard Linux servers) and `linux/arm64` (Apple Silicon / AWS Graviton):
```bash
./podman/build.sh all
```

### 3.3 Linux x86_64 (`linux/amd64`) for Production Servers
If building on an Apple Silicon Mac to deploy on a Linux server:
```bash
# Build amd64 and automatically package progit-linux-amd64.tar
./podman/build.sh amd64 --save
```
Transfer `progit-linux-amd64.tar` to your Linux server and deploy:
```bash
podman load -i progit-linux-amd64.tar
./podman/deploy.sh
```

### 3.4 Direct Podman CLI
```bash
# For Linux x86_64 servers
podman build --platform linux/amd64 -t localhost/progit:linux-amd64 -f Containerfile .

# For Apple Silicon / ARM64
podman build --platform linux/arm64 -t localhost/progit:linux-arm64 -f Containerfile .
```

The multi-stage `Containerfile`:
1. Stage 1: Builds the React/TypeScript/Tailwind frontend via Vite (`npm run build`).
2. Stage 2: Compiles the Go application embedding the built frontend assets into the binary.
3. Stage 3: Minimal Alpine/Debian runtime image containing only `git`, `ca-certificates`, and the single executable.

---

## 4. Running ProGit with Podman

### 4.1 Automated Script Deployment
Run the automated deployment script:
```bash
./podman/deploy.sh
```

### 4.2 Standalone Podman CLI
```bash
# Create volumes
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

> [!NOTE]
> On SELinux systems, `:Z` configures private unshared volume labels for container isolation.

### 4.3 Podman Compose Deployment
```bash
podman compose up -d
```

---

## 5. Verification & Health Monitoring

Check that ProGit is running and healthy:
```bash
# Check container status
podman ps

# Check application health endpoint
curl -s http://localhost:3000/api/health | jq

# View container logs
./podman/logs.sh
```

