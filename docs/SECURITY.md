# ProGit Security Specification & Hardening Guide

## 1. Security Architecture Principles

ProGit follows a **secure-by-default** model across application layers:

### 1.1 Authentication & Credential Storage
- **Password Hashing**: Passwords are saved as one-way salted hashes using `bcrypt` (default cost factor 12) or Argon2id. Plaintext passwords are never stored or logged.
- **Session Security**: Session cookies utilize `HttpOnly`, `SameSite=Lax` (or `Strict`), and configurable `Secure` flags. Session tokens are 32-byte cryptographically secure random values.
- **Personal Access Tokens**: Stored hashed (SHA-256). Only the token prefix and hash are saved in SQLite; the full raw token is returned to the user only once upon generation.

### 1.2 Access Control & Authorization
- **Repository Visibility Isolation**: Private repositories are completely inaccessible to unauthenticated or unauthorized users across Web UI, REST API, Git Smart HTTP, and Git SSH.
- **Git Smart HTTP Authorization**:
  - `git-upload-pack` checks read permissions.
  - `git-receive-pack` checks write permissions before invoking Git backend processes.
- **SSH Key Validation**: Keys are validated against OpenSSH public key formats (`ssh-rsa`, `ssh-ed25519`, `ecdsa-sha2-*`). Unauthorized keys are rejected before shell execution.

### 1.3 Injection & Traversal Defenses
- **Git Argument Injection Protection**: Never concatenate user input into shell strings. ProGit invokes `exec.Command` with explicit slice arguments and strict argument sanitization.
- **Path Traversal Protection**: All repository paths and file browser paths are resolved using clean absolute filepath checks (`filepath.Clean`) ensuring access stays within the configured storage root.
- **SQL Injection**: Prepared statements with parameterized queries are used throughout all database interactions.
- **Cross-Site Scripting (XSS)**: Markdown rendered in issues and README files is sanitized using an HTML sanitizer allowing only safe tags and attributes.

### 1.4 Container Hardening
- Runs as a dedicated non-root user (`progit:1000:1000`).
- Minimal base image with only runtime essentials (`git`, `ca-certificates`, `tzdata`).
- No elevated capabilities (`--cap-drop=ALL`).
- Read-only container root with mounted writable volumes for `/data`.

