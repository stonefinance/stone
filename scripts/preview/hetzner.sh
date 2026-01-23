#!/bin/bash
# =============================================================================
# Stone Finance - Hetzner Cloud Helper Script
# =============================================================================
# Utility functions for managing Hetzner Cloud preview environments.
# Can be used locally for debugging or in CI workflows.
#
# Required environment variable:
#   HETZNER_API_TOKEN - Hetzner Cloud API token
#
# Usage:
#   ./hetzner.sh list                    # List all preview servers
#   ./hetzner.sh create <pr_number>      # Create server for PR
#   ./hetzner.sh delete <pr_number>      # Delete server for PR
#   ./hetzner.sh status <pr_number>      # Get server status
#   ./hetzner.sh ssh <pr_number>         # SSH into server
#   ./hetzner.sh logs <pr_number>        # View docker compose logs
#   ./hetzner.sh cleanup                 # Delete all preview servers
# =============================================================================

set -euo pipefail

# Configuration
API_BASE="https://api.hetzner.cloud/v1"
SERVER_TYPE="${HETZNER_SERVER_TYPE:-cpx31}"
LOCATION="${HETZNER_LOCATION:-nbg1}"
IMAGE="${HETZNER_IMAGE:-ubuntu-22.04}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# Check for API token
check_token() {
    if [[ -z "${HETZNER_API_TOKEN:-}" ]]; then
        error "HETZNER_API_TOKEN environment variable is required"
        exit 1
    fi
}

# API request helper
api() {
    local method="$1"
    local endpoint="$2"
    shift 2
    curl -sf -X "$method" \
        -H "Authorization: Bearer $HETZNER_API_TOKEN" \
        -H "Content-Type: application/json" \
        "$@" \
        "${API_BASE}${endpoint}"
}

# =============================================================================
# Commands
# =============================================================================

# List all preview servers
cmd_list() {
    check_token
    log "Listing preview servers..."
    echo ""

    local servers
    servers=$(api GET "/servers?label_selector=purpose=pr-preview")

    echo "$servers" | jq -r '
        .servers | if length == 0 then
            "No preview servers found."
        else
            ["ID", "NAME", "PR", "IP", "STATUS", "CREATED"],
            (.[] | [
                .id,
                .name,
                .labels.pr,
                .public_net.ipv4.ip,
                .status,
                (.created | split("T")[0])
            ]) | @tsv
        end
    ' | column -t
}

# Create server for PR
cmd_create() {
    local pr_number="$1"
    check_token

    if [[ -z "$pr_number" ]]; then
        error "PR number is required"
        echo "Usage: $0 create <pr_number>"
        exit 1
    fi

    # Check if server already exists
    local existing
    existing=$(api GET "/servers?label_selector=purpose=pr-preview,pr=$pr_number" | jq -r '.servers[0].id')

    if [[ "$existing" != "null" ]]; then
        warn "Server already exists for PR $pr_number (ID: $existing)"
        exit 0
    fi

    log "Creating server for PR $pr_number..."

    local response
    response=$(api POST "/servers" -d "{
        \"name\": \"stone-preview-pr-$pr_number\",
        \"server_type\": \"$SERVER_TYPE\",
        \"location\": \"$LOCATION\",
        \"image\": \"$IMAGE\",
        \"labels\": {
            \"purpose\": \"pr-preview\",
            \"pr\": \"$pr_number\"
        }
    }")

    local server_id ip
    server_id=$(echo "$response" | jq -r '.server.id')
    ip=$(echo "$response" | jq -r '.server.public_net.ipv4.ip')

    if [[ "$server_id" == "null" ]]; then
        error "Failed to create server: $(echo "$response" | jq -r '.error.message')"
        exit 1
    fi

    log "Server created: ID=$server_id, IP=$ip"
    log "Waiting for server to be ready..."

    # Wait for running status
    for i in {1..60}; do
        local status
        status=$(api GET "/servers/$server_id" | jq -r '.server.status')
        if [[ "$status" == "running" ]]; then
            log "Server is running!"
            break
        fi
        echo "  Status: $status (attempt $i/60)"
        sleep 5
    done

    echo ""
    echo "Server Details:"
    echo "  ID: $server_id"
    echo "  IP: $ip"
    echo "  SSH: ssh root@$ip"
}

# Delete server for PR
cmd_delete() {
    local pr_number="$1"
    check_token

    if [[ -z "$pr_number" ]]; then
        error "PR number is required"
        echo "Usage: $0 delete <pr_number>"
        exit 1
    fi

    log "Looking for server for PR $pr_number..."

    local server_id
    server_id=$(api GET "/servers?label_selector=purpose=pr-preview,pr=$pr_number" | jq -r '.servers[0].id')

    if [[ "$server_id" == "null" ]]; then
        warn "No server found for PR $pr_number"
        exit 0
    fi

    log "Deleting server $server_id..."
    api DELETE "/servers/$server_id" > /dev/null
    log "Server deleted"
}

# Get server status
cmd_status() {
    local pr_number="$1"
    check_token

    if [[ -z "$pr_number" ]]; then
        error "PR number is required"
        echo "Usage: $0 status <pr_number>"
        exit 1
    fi

    local server
    server=$(api GET "/servers?label_selector=purpose=pr-preview,pr=$pr_number" | jq '.servers[0]')

    if [[ "$server" == "null" ]]; then
        error "No server found for PR $pr_number"
        exit 1
    fi

    echo "$server" | jq '{
        id: .id,
        name: .name,
        status: .status,
        ip: .public_net.ipv4.ip,
        server_type: .server_type.name,
        location: .datacenter.location.name,
        created: .created
    }'
}

# SSH into server
cmd_ssh() {
    local pr_number="$1"
    check_token

    if [[ -z "$pr_number" ]]; then
        error "PR number is required"
        echo "Usage: $0 ssh <pr_number>"
        exit 1
    fi

    local ip
    ip=$(api GET "/servers?label_selector=purpose=pr-preview,pr=$pr_number" | jq -r '.servers[0].public_net.ipv4.ip')

    if [[ "$ip" == "null" ]]; then
        error "No server found for PR $pr_number"
        exit 1
    fi

    log "Connecting to $ip..."
    ssh -o StrictHostKeyChecking=no "root@$ip"
}

# View docker compose logs
cmd_logs() {
    local pr_number="$1"
    check_token

    if [[ -z "$pr_number" ]]; then
        error "PR number is required"
        echo "Usage: $0 logs <pr_number>"
        exit 1
    fi

    local ip
    ip=$(api GET "/servers?label_selector=purpose=pr-preview,pr=$pr_number" | jq -r '.servers[0].public_net.ipv4.ip')

    if [[ "$ip" == "null" ]]; then
        error "No server found for PR $pr_number"
        exit 1
    fi

    log "Fetching logs from $ip..."
    ssh -o StrictHostKeyChecking=no "root@$ip" \
        "cd /opt/stone-preview/e2e && docker compose -f docker-compose.e2e.yml -f docker-compose.override.yml logs --tail=100"
}

# Delete all preview servers
cmd_cleanup() {
    check_token

    log "This will delete ALL preview servers. Continue? (y/N)"
    read -r confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        log "Cancelled"
        exit 0
    fi

    local servers
    servers=$(api GET "/servers?label_selector=purpose=pr-preview" | jq -r '.servers[].id')

    if [[ -z "$servers" ]]; then
        log "No preview servers to delete"
        exit 0
    fi

    for server_id in $servers; do
        log "Deleting server $server_id..."
        api DELETE "/servers/$server_id" > /dev/null
    done

    log "All preview servers deleted"
}

# =============================================================================
# Main
# =============================================================================
usage() {
    cat << EOF
Stone Finance - Hetzner Cloud Preview Environment Manager

Usage: $0 <command> [args]

Commands:
  list                    List all preview servers
  create <pr_number>      Create server for PR
  delete <pr_number>      Delete server for PR
  status <pr_number>      Get server status
  ssh <pr_number>         SSH into server
  logs <pr_number>        View docker compose logs
  cleanup                 Delete ALL preview servers

Environment:
  HETZNER_API_TOKEN       Required. Hetzner Cloud API token
  HETZNER_SERVER_TYPE     Server type (default: cpx31)
  HETZNER_LOCATION        Datacenter location (default: nbg1)
  HETZNER_IMAGE           OS image (default: ubuntu-22.04)

Examples:
  $0 list
  $0 create 42
  $0 ssh 42
  $0 delete 42
EOF
}

main() {
    local cmd="${1:-}"
    shift || true

    case "$cmd" in
        list)    cmd_list "$@" ;;
        create)  cmd_create "$@" ;;
        delete)  cmd_delete "$@" ;;
        status)  cmd_status "$@" ;;
        ssh)     cmd_ssh "$@" ;;
        logs)    cmd_logs "$@" ;;
        cleanup) cmd_cleanup "$@" ;;
        -h|--help|help|"")
            usage
            exit 0
            ;;
        *)
            error "Unknown command: $cmd"
            usage
            exit 1
            ;;
    esac
}

main "$@"
