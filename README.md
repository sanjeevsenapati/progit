# ProGit Documentation & Official Portal

<p align="center">
  <strong>The official documentation and resource hub for ProGit: a modern, lightweight, self-hosted Git collaboration platform written in pure Go and React.</strong>
</p>

<p align="center">
  <a href="https://progit.co.in"><img src="https://img.shields.io/badge/Docs-progit.co.in-10b981?style=for-the-badge&logo=gitbook" alt="Official Documentation" /></a>
  <a href="https://github.com/sanjeevsenapati/progit/pkgs/container/progit"><img src="https://img.shields.io/badge/GHCR-v1.2.0-blue?style=for-the-badge&logo=docker" alt="GHCR Container" /></a>
  <img src="https://img.shields.io/badge/Go-1.22+-00ADD8?style=for-the-badge&logo=go" alt="Go Version" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge" alt="License: MIT" />
</p>

---

## 🌐 Live Documentation Website
The `docs` branch powers the official documentation portal at:  
👉 **[https://progit.co.in](https://progit.co.in)**

This static documentation suite is served via GitHub Pages with custom domain binding (`CNAME: progit.co.in`), instant full-text search, responsive dark/light themes, and deep-linkable sections covering everything from 5-minute quickstart to multi-node high-availability clustering.

---

## 📚 Documentation Index

| Guide | Description | Target Audience |
| :--- | :--- | :--- |
| **[5-Minute Quickstart](docs/PODMAN_DEPLOYMENT.md)** | Instant deployment using official GHCR multi-arch container images | Everyone / DevOps |
| **[Production Deployment](docs/DEPLOYMENT.md)** | Standalone binary, systemd, rootless Podman, and reverse proxies | System Administrators |
| **[Admin & Configuration](docs/ADMIN_GUIDE.md)** | Super Admin setup, live base URL updates, and SSL/TLS configuration | Administrators |
| **[User & Collaboration](docs/USER_GUIDE.md)** | Fast SPA workflows, Git Smart HTTP, native SSH, wikis, and pages | Software Developers |
| **[System Architecture](docs/ARCHITECTURE.md)** | Pure-Go modular monolith, zero-CGO SQLite, and React 19 SPA | Architects & Engineers |
| **[Enterprise HA & Commercial Model](docs/ENTERPRISE_HA_AND_BUSINESS_MODEL.md)** | Multi-node clustering, Patroni HA, CephFS/S3, and commercial tiers | Enterprise & IT Leads |
| **[REST API Reference](docs/API_DESIGN.md)** | Full specification for users, repositories, pull requests, and webhooks | Integrators & Tooling |
| **[Platform Security](docs/SECURITY.md)** | Threat model, zero-CGO attack surface, and container hardening | SecOps & Compliance |

---

## 🚀 Quick Deployment with Official Images

ProGit publishes multi-architecture images (`linux/amd64` and `linux/arm64`) to GitHub Container Registry:

```bash
# 1. Add local domain to /etc/hosts
echo "127.0.0.1 progit.local" | sudo tee -a /etc/hosts

# 2. Run container with persistent volumes
podman run -d \
  --name progit \
  --restart=unless-stopped \
  -p 443:3443 -p 80:3000 \
  -p 3443:3443 -p 3000:3000 \
  -p 2222:2222 \
  -v progit-data:/data/db:Z \
  -v progit-repositories:/data/repositories:Z \
  -v progit-config:/data/config:Z \
  -v progit-logs:/data/logs:Z \
  ghcr.io/sanjeevsenapati/progit:latest
```

Access your instance at **[`https://progit.local`](https://progit.local)** (or `https://progit.local:3443`).

---

## 📜 Attribution & Credits

Supported by **PDIH** and created by **ProGit Team and Sanjeev**.  
Built on top of the Gogs source code. Released under the open-source MIT License.
