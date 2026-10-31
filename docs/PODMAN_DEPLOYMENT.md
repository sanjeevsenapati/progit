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

## 3. Building the Container Image

```bash
# Build production image
podman build -t localhost/progit:latest -f Containerfile .
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

