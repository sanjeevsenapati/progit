# Stage 1: Build Frontend Assets
FROM docker.io/library/node:22-alpine AS frontend-builder
WORKDIR /build/web

COPY web/package*.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

# Stage 2: Build Pure-Go Single Binary
FROM docker.io/library/golang:alpine AS backend-builder
WORKDIR /build

RUN apk add --no-cache git

COPY go.mod go.sum ./
RUN go mod download

COPY . .
# Copy frontend dist to internal/ui/dist for embedding
COPY --from=frontend-builder /build/web/dist ./internal/ui/dist

# Ensure go.mod is in sync with actual dependencies
RUN go mod tidy

# Build static pure-Go binary with embedded UI
ENV CGO_ENABLED=0
RUN go build -trimpath -ldflags="-s -w" -o /progit ./cmd/progit

# Stage 3: Minimal Production Runtime
FROM docker.io/library/alpine:3.21

# Install runtime essentials: Git, CA certificates, curl for health checks
RUN apk add --no-cache git ca-certificates tzdata curl && \
    addgroup -g 1000 progit && \
    adduser -u 1000 -G progit -s /bin/sh -D progit

# Copy compiled single binary
COPY --from=backend-builder /progit /usr/local/bin/progit

# Setup persistent directory structure with correct ownership
RUN mkdir -p /data/db /data/repositories /data/config /data/logs /data/ssh && \
    chown -R progit:progit /data

# Default production configuration via environment
ENV PROGIT_APP_NAME="ProGit" \
    PROGIT_DOMAIN="localhost" \
    PROGIT_HTTP_PORT=3000 \
    PROGIT_ROOT_URL="http://localhost:3000/" \
    PROGIT_DB_PATH="/data/db/progit.db" \
    PROGIT_REPO_ROOT="/data/repositories" \
    PROGIT_SSH_ENABLED="true" \
    PROGIT_SSH_PORT=2222

# Security: Non-root execution
USER progit:progit
WORKDIR /data

EXPOSE 3000 2222

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/usr/local/bin/progit"]
CMD ["web"]

