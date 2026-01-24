# PR Preview Environments

This document describes the automated preview environment system that deploys the full Stone Finance stack for each pull request.

## Overview

When you open a PR against `master` or `main`, a preview environment is automatically created on Hetzner Cloud. This gives reviewers a live environment to test changes before merging.

### What Gets Deployed

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 3000 | Next.js web application |
| GraphQL API | 4000 | Indexer GraphQL endpoint |
| Chain RPC | 26657 | CosmWasm blockchain RPC |
| Chain REST | 1317 | Cosmos REST API |

## Quick Reference

### Automatic Triggers

- **PR opened/updated**: Deploys or redeploys the preview
- **PR closed/merged**: Destroys the preview environment
- **48 hours elapsed**: Auto-destroys stale environments

### Manual Commands

Comment on your PR:
- `/deploy` - (Re)deploy the preview environment
- `/destroy` - Destroy the preview environment

## GitHub Secrets Required

Configure these secrets in your repository settings:

| Secret | Description | How to Get |
|--------|-------------|------------|
| `HETZNER_API_TOKEN` | Hetzner Cloud API token | [Hetzner Console](https://console.hetzner.cloud/) → Security → API Tokens |
| `SSH_PUBLIC_KEY` | Public key for VM access | Your `~/.ssh/id_rsa.pub` or generate with `ssh-keygen` |
| `SSH_PRIVATE_KEY` | Private key for deployment | Corresponding private key (keep secure!) |

### Creating a Hetzner API Token

1. Go to [Hetzner Console](https://console.hetzner.cloud/)
2. Select your project (or create one)
3. Go to **Security** → **API Tokens**
4. Click **Generate API Token**
5. Give it a name like `github-actions-preview`
6. Select **Read & Write** permissions
7. Copy the token immediately (it won't be shown again)

### Setting Up SSH Keys

Generate a dedicated key pair for preview deployments:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/stone-preview -N ""
```

Then add to GitHub secrets:
- `SSH_PUBLIC_KEY`: Contents of `~/.ssh/stone-preview.pub`
- `SSH_PRIVATE_KEY`: Contents of `~/.ssh/stone-preview`

## How It Works

### Deployment Flow

```
PR Opened/Updated
       ↓
┌──────────────────────┐
│ Check Limits         │  Max 3 concurrent previews
└──────────────────────┘
       ↓
┌──────────────────────┐
│ Build WASM Contracts │  factory.wasm, market.wasm
└──────────────────────┘
       ↓
┌──────────────────────┐
│ Provision Hetzner VM │  CPX31: 4 vCPU, 8GB RAM
└──────────────────────┘
       ↓
┌──────────────────────┐
│ Deploy Stack         │  Docker Compose E2E setup
└──────────────────────┘
       ↓
┌──────────────────────┐
│ Post PR Comment      │  URLs and status
└──────────────────────┘
```

### Cleanup Flow

```
PR Closed OR 48h Elapsed OR /destroy Command
       ↓
┌──────────────────────┐
│ Delete Hetzner VM    │
└──────────────────────┘
       ↓
┌──────────────────────┐
│ Update PR Comment    │
└──────────────────────┘
```

## Cost Controls

### Automatic Limits

- **Max 3 concurrent previews**: Prevents runaway costs
- **48-hour auto-destroy**: Cleans up forgotten environments
- **Scheduled cleanup**: Runs every 6 hours to catch orphaned VMs

### Estimated Costs

| Resource | Hourly | Daily | Monthly |
|----------|--------|-------|---------|
| CPX31 (per VM) | ~€0.02 | ~€0.48 | ~€14.40 |

With 3 concurrent previews running 24/7: ~€43/month maximum.

In practice, with auto-cleanup, expect ~€10-20/month for typical usage.

## Local Development

### Using the Helper Script

The `scripts/preview/hetzner.sh` script lets you manage previews locally:

```bash
# Set your API token
export HETZNER_API_TOKEN="your-token-here"

# List all preview servers
./scripts/preview/hetzner.sh list

# Create a server for testing
./scripts/preview/hetzner.sh create 42

# Check server status
./scripts/preview/hetzner.sh status 42

# SSH into a server
./scripts/preview/hetzner.sh ssh 42

# View container logs
./scripts/preview/hetzner.sh logs 42

# Delete a specific preview
./scripts/preview/hetzner.sh delete 42

# Delete ALL previews (with confirmation)
./scripts/preview/hetzner.sh cleanup
```

### Debugging a Failed Deployment

1. Get the server IP from the workflow logs or use:
   ```bash
   ./scripts/preview/hetzner.sh status <pr_number>
   ```

2. SSH into the server:
   ```bash
   ssh root@<ip>
   ```

3. Check container status:
   ```bash
   cd /opt/stone-preview/e2e
   docker compose -f docker-compose.e2e.yml -f docker-compose.override.yml ps
   docker compose -f docker-compose.e2e.yml -f docker-compose.override.yml logs
   ```

4. Common issues:
   - **Frontend won't start**: Check if contracts deployed correctly
   - **Indexer unhealthy**: Database connection or migration issue
   - **Chain not responding**: Init script may have failed

## Architecture

### Server Specification

- **Type**: CPX31 (AMD EPYC, shared vCPU)
- **Resources**: 4 vCPU, 8 GB RAM, 160 GB SSD
- **Location**: nbg1 (Nuremberg, Germany)
- **OS**: Ubuntu 22.04 LTS

### Network Access

All services are exposed directly on the VM's public IP:
- No load balancer (cost savings)
- No SSL/TLS (preview environment only)
- No domain names (use IP directly)

### Docker Compose Override

The deployment creates a `docker-compose.override.yml` that:
- Updates frontend environment variables with the VM's public IP
- Allows browser access to chain endpoints (RPC, REST, GraphQL)

## Troubleshooting

### "Maximum 3 concurrent previews reached"

Options:
1. Close another PR to free up a slot
2. Comment `/destroy` on another PR's preview
3. Manually delete via `./scripts/preview/hetzner.sh delete <pr_number>`

### Preview Not Updating After Push

The workflow has concurrency controls to prevent overlapping deploys. Wait for the current deployment to finish, or check the Actions tab for queued runs.

### Services Unhealthy After Deploy

1. SSH into the server
2. Check individual service logs:
   ```bash
   docker logs stone-wasmd
   docker logs stone-indexer
   docker logs stone-frontend
   ```
3. Restart services if needed:
   ```bash
   cd /opt/stone-preview/e2e
   docker compose -f docker-compose.e2e.yml -f docker-compose.override.yml restart
   ```

### Manual Cleanup

If the automated cleanup fails:

```bash
# Via helper script
export HETZNER_API_TOKEN="..."
./scripts/preview/hetzner.sh list
./scripts/preview/hetzner.sh delete <pr_number>

# Or via Hetzner Console
# https://console.hetzner.cloud/ → Servers → Delete
```

## Security Notes

- Preview VMs are publicly accessible (no firewall)
- SSH access requires the configured key pair
- VMs are ephemeral and auto-destroyed
- No persistent data between deployments
- Chain uses test accounts with known mnemonics (not for production!)

## Future Improvements

Potential enhancements not yet implemented:

- [ ] Cloudflare Tunnel for custom domains (`pr-123.preview.example.com`)
- [ ] SSL/TLS via Let's Encrypt
- [ ] Slack/Discord notifications
- [ ] Performance metrics collection
- [ ] Seed data for realistic testing
