# ProGit Container Security Specification

## 1. Non-Root Execution
The ProGit container image is configured with a dedicated non-root system user and group:
```dockerfile
RUN addgroup -g 1000 progit && \
    adduser -u 1000 -G progit -s /bin/sh -D progit
USER progit:progit
```
All runtime processes, file writes, and Git invocations execute with UID 1000.

## 2. Minimal Base Image
The runtime stage uses `alpine:3.21`, which has a tiny attack surface (~7MB) containing only:
- `git`: Required for standard Git command-line operations.
- `ca-certificates`: Required for outgoing HTTPS/TLS connections.
- `tzdata`: For timezone synchronization.
No compilers, package managers, or build toolchains exist in the final image.

## 3. Secret Isolation
- No passwords, secret keys, or credentials are baked into any image layer.
- Secrets are supplied at runtime via environment variables (`PROGIT_SECRET_KEY`) or mounted configuration files (`/data/config/app.ini`).

## 4. Least Privilege Capabilities
ProGit does not require root or Linux capabilities. In production, drop all capabilities:
```bash
podman run --cap-drop=ALL ...
```

## 5. Read-Only Root Filesystem
ProGit can run with a read-only container root:
```bash
podman run --read-only \
  --tmpfs /tmp \
  -v progit-data:/data/db:Z \
  -v progit-repositories:/data/repositories:Z \
  -v progit-config:/data/config:Z \
  localhost/progit:latest
```

