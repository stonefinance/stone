#!/bin/bash
# =============================================================================
# Stone Finance - Preview Environment VM Setup Script
# =============================================================================
# This script is executed on a fresh Hetzner VM to set up the preview
# environment. It installs Docker, clones the repo, and starts services.
#
# Required environment variables:
#   REPO     - GitHub repository (e.g., "org/stone-finance")
#   REF      - Git ref to checkout (commit SHA or branch)
#
# Optional environment variables:
#   GITHUB_TOKEN - For private repos (passed via workflow)
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $*"; }
warn() { echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARNING:${NC} $*"; }
error() { echo -e "${RED}[$(date +'%H:%M:%S')] ERROR:${NC} $*" >&2; }

# =============================================================================
# Configuration
# =============================================================================
REPO_DIR="/opt/stone-preview"
COMPOSE_FILE="docker-compose.e2e.yml"
OVERRIDE_FILE="docker-compose.override.yml"

# =============================================================================
# Validation
# =============================================================================
log "Starting Stone Finance Preview Environment Setup"

if [[ -z "${REPO:-}" ]]; then
    error "REPO environment variable is required"
    exit 1
fi

if [[ -z "${REF:-}" ]]; then
    error "REF environment variable is required"
    exit 1
fi

log "Repository: $REPO"
log "Git ref: $REF"

# =============================================================================
# Install Docker
# =============================================================================
install_docker() {
    if command -v docker &> /dev/null; then
        log "Docker already installed: $(docker --version)"
        return 0
    fi

    log "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    log "Docker installed: $(docker --version)"
}

# =============================================================================
# Install Docker Compose
# =============================================================================
install_docker_compose() {
    if docker compose version &> /dev/null; then
        log "Docker Compose already installed: $(docker compose version)"
        return 0
    fi

    log "Installing Docker Compose plugin..."
    apt-get update -qq
    apt-get install -y -qq docker-compose-plugin
    log "Docker Compose installed: $(docker compose version)"
}

# =============================================================================
# Clone/Update Repository
# =============================================================================
setup_repo() {
    if [[ -d "$REPO_DIR/.git" ]]; then
        log "Updating existing repository..."
        cd "$REPO_DIR"
        git fetch origin
        git checkout "$REF" --force
        git clean -fdx -e artifacts/
    else
        log "Cloning repository..."
        rm -rf "$REPO_DIR"

        # Use token if available (for private repos)
        if [[ -n "${GITHUB_TOKEN:-}" ]]; then
            git clone "https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO}.git" "$REPO_DIR"
        else
            git clone "https://github.com/${REPO}.git" "$REPO_DIR"
        fi

        cd "$REPO_DIR"
        git checkout "$REF"
    fi

    log "Repository ready at $REPO_DIR"
}

# =============================================================================
# Get Host IP
# =============================================================================
get_host_ip() {
    # Try Hetzner metadata first
    local ip
    ip=$(curl -sf --connect-timeout 2 http://169.254.169.254/hetzner/v1/metadata/public-ipv4 2>/dev/null) && {
        echo "$ip"
        return 0
    }

    # Fallback to hostname
    hostname -I | awk '{print $1}'
}

# =============================================================================
# Create Docker Compose Override
# =============================================================================
create_compose_override() {
    local host_ip
    host_ip=$(get_host_ip)
    log "Host IP: $host_ip"

    cat > "$REPO_DIR/e2e/$OVERRIDE_FILE" << EOF
# Auto-generated override for preview environment
# Host IP: $host_ip
services:
  frontend:
    environment:
      # Override localhost URLs with external IP for browser access
      NEXT_PUBLIC_RPC_ENDPOINT: http://${host_ip}:26657
      NEXT_PUBLIC_REST_ENDPOINT: http://${host_ip}:1317
      NEXT_PUBLIC_GRAPHQL_ENDPOINT: http://${host_ip}:4000/graphql
      NEXT_PUBLIC_WS_ENDPOINT: ws://${host_ip}:4000/graphql
EOF

    log "Created compose override file"
}

# =============================================================================
# Copy Artifacts
# =============================================================================
copy_artifacts() {
    if [[ -d /tmp/artifacts ]] && [[ "$(ls -A /tmp/artifacts 2>/dev/null)" ]]; then
        log "Copying WASM artifacts..."
        mkdir -p "$REPO_DIR/artifacts"
        cp -r /tmp/artifacts/* "$REPO_DIR/artifacts/"
        log "Artifacts copied: $(ls "$REPO_DIR/artifacts/")"
    else
        warn "No artifacts found in /tmp/artifacts"
    fi
}

# =============================================================================
# Start Services
# =============================================================================
start_services() {
    cd "$REPO_DIR/e2e"

    log "Stopping any existing services..."
    docker compose -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" down -v --remove-orphans 2>/dev/null || true

    log "Building and starting services..."
    docker compose -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" up -d --build

    log "Services started, waiting for health checks..."
}

# =============================================================================
# Wait for Services
# =============================================================================
wait_for_services() {
    local host_ip
    host_ip=$(get_host_ip)
    local max_attempts=60
    local attempt=1

    log "Waiting for frontend to be ready..."
    while [[ $attempt -le $max_attempts ]]; do
        if curl -sf "http://localhost:3000" > /dev/null 2>&1; then
            log "Frontend is ready!"
            break
        fi
        echo "  Attempt $attempt/$max_attempts: Waiting for frontend..."
        sleep 10
        ((attempt++))
    done

    if [[ $attempt -gt $max_attempts ]]; then
        error "Frontend failed to start within timeout"
        docker compose -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" logs frontend
        return 1
    fi

    # Verify all services
    log "Verifying all services..."

    if ! curl -sf "http://localhost:4000/health" > /dev/null 2>&1; then
        warn "GraphQL health check failed"
    fi

    if ! curl -sf "http://localhost:26657/status" > /dev/null 2>&1; then
        warn "Chain RPC health check failed"
    fi
}

# =============================================================================
# Print Status
# =============================================================================
print_status() {
    local host_ip
    host_ip=$(get_host_ip)

    echo ""
    echo "============================================================"
    echo " Stone Finance Preview Environment"
    echo "============================================================"
    echo ""
    docker compose -f "$REPO_DIR/e2e/$COMPOSE_FILE" -f "$REPO_DIR/e2e/$OVERRIDE_FILE" ps
    echo ""
    echo "------------------------------------------------------------"
    echo " Access URLs"
    echo "------------------------------------------------------------"
    echo " Frontend:           http://${host_ip}:3000"
    echo " GraphQL Playground: http://${host_ip}:4000/graphql"
    echo " Chain RPC:          http://${host_ip}:26657"
    echo " Chain REST:         http://${host_ip}:1317"
    echo "------------------------------------------------------------"
    echo ""
}

# =============================================================================
# Main
# =============================================================================
main() {
    install_docker
    install_docker_compose
    setup_repo
    copy_artifacts
    create_compose_override
    start_services
    wait_for_services
    print_status

    log "Setup complete!"
}

main "$@"
