# ==============================================================================
# ProGit Production Containerfile
# Multi-Architecture Support: linux/amd64 (x86_64), linux/arm64 (aarch64)
# ==============================================================================

# Stage 1: Build Frontend Assets (Runs natively on builder platform for speed)
FROM --platform=$BUILDPLATFORM docker.io/library/node:22-alpine AS frontend-builder
WORKDIR /build/web

COPY web/package*.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

# Stage 2: Build Pure-Go Single Binary
# Note: Uses builder platform Go compiler with GOOS/GOARCH cross-compilation for maximum build speed
FROM --platform=$BUILDPLATFORM docker.io/library/golang:alpine AS backend-builder
WORKDIR /build

ARG TARGETOS=linux
ARG TARGETARCH=amd64

RUN apk add --no-cache git

COPY go.mod go.sum ./
RUN go mod download

COPY . .
# Copy frontend dist to internal/ui/dist for embedding
COPY --from=frontend-builder /build/web/dist ./internal/ui/dist

# Build static pure-Go binary with embedded UI for target architecture
ENV CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH}
RUN go build -trimpath -ldflags="-s -w -X main.Version=1.2.0" -o /progit ./cmd/progit

# Stage 3: Minimal Production Runtime (Target Platform)
FROM docker.io/library/alpine:3.21

# Install runtime essentials: Git, CA certificates, curl for health checks
RUN apk add --no-cache git ca-certificates tzdata curl && \
    addgroup -g 1000 progit && \
    adduser -u 1000 -G progit -s /bin/sh -D progit

# Copy compiled single binary for target architecture
COPY --from=backend-builder /progit /usr/local/bin/progit

# Setup persistent directory structure with correct ownership
RUN mkdir -p /data/db /data/repositories /data/config /data/config/https /data/logs /data/ssh && \
    chown -R progit:progit /data

# Default production configuration via environment
ENV PROGIT_APP_NAME="ProGit" \
    PROGIT_DOMAIN="progit.local" \
    PROGIT_HTTP_PORT=3000 \
    PROGIT_HTTPS_PORT=3443 \
    PROGIT_PROTOCOL="https" \
    PROGIT_ROOT_URL="https://progit.local:3443/" \
    PROGIT_CERT_FILE="/data/config/https/cert.pem" \
    PROGIT_KEY_FILE="/data/config/https/key.pem" \
    PROGIT_REDIRECT_OTHER_PORT="true" \
    PROGIT_DB_PATH="/data/db/progit.db" \
    PROGIT_REPO_ROOT="/data/repositories" \
    PROGIT_SSH_ENABLED="true" \
    PROGIT_SSH_PORT=2222

# Security: Non-root execution
USER progit:progit
WORKDIR /data

EXPOSE 3000 3443 2222 80 443

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -k -f https://localhost:3443/api/health || curl -k -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/usr/local/bin/progit"]
CMD ["web"]
