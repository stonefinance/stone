# Stone Indexer Production Deployment Guide

This guide covers deploying the Stone indexer to a production environment with proper security practices.

## Prerequisites

- Docker and Docker Compose installed
- A domain name pointing to your server
- Ports 80 and 443 open for HTTP/HTTPS traffic

## Security Architecture

The production deployment follows the principle of least exposure:

```
Internet → Caddy (443/80) → Indexer (4000) → PostgreSQL (5432)
              ↑                    ↑                ↑
           Public            Internal only    Internal only
```

- **PostgreSQL**: No ports exposed to host. Only accessible via Docker network.
- **Indexer API**: Exposed only to Caddy, not directly to internet.
- **Caddy**: Only service with public ports. Handles HTTPS termination.

## Quick Start

1. **Clone the repository and navigate to deploy directory**:
   ```bash
   git clone https://github.com/stonefinance/stone.git
   cd stone/deploy
   ```

2. **Configure environment variables**:
   ```bash
   cp env.example .env
   
   # Edit .env with your settings
   # IMPORTANT: Generate a strong password for POSTGRES_PASSWORD
   # Example: openssl rand -base64 32
   nano .env
   ```

3. **Start the services**:
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

4. **Verify deployment**:
   ```bash
   # Check all services are running
   docker compose -f docker-compose.prod.yml ps
   
   # Check logs
   docker compose -f docker-compose.prod.yml logs -f
   
   # Test the API
   curl https://your-domain.com/health
   ```

## Configuration Reference

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DOMAIN` | Your domain for HTTPS | `indexer.stone.finance` |
| `POSTGRES_USER` | Database username | `stone` |
| `POSTGRES_PASSWORD` | Database password (use strong!) | `<random 32+ chars>` |
| `POSTGRES_DB` | Database name | `stone` |
| `RPC_ENDPOINT` | Blockchain RPC URL | `https://rpc.neutron.network` |
| `CHAIN_ID` | Target chain ID | `neutron-1` |

### Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `START_BLOCK_HEIGHT` | `1` | Block to start indexing from |
| `POLL_INTERVAL_MS` | `1000` | Polling interval in ms |
| `LOG_LEVEL` | `info` | Log verbosity |
| `INDEXER_IMAGE` | `ghcr.io/stonefinance/stone-indexer:latest` | Docker image |

## Security Best Practices

### 1. Database Security

The PostgreSQL database is intentionally NOT exposed to the host or internet:

```yaml
# CORRECT - No 'ports:', only 'expose:'
postgres:
  expose:
    - "5432"  # Only accessible within Docker network

# WRONG - Exposes to internet!
postgres:
  ports:
    - "5432:5432"  # 0.0.0.0:5432 - PUBLIC!
```

Services connect via Docker network using the service name:
```
DATABASE_URL: postgresql://user:pass@postgres:5432/dbname
```

### 2. Password Management

- Use strong, randomly generated passwords (32+ characters)
- Never commit `.env` files to version control
- Consider using Docker secrets for sensitive values
- Rotate passwords periodically

Generate a secure password:
```bash
openssl rand -base64 32
```

### 3. Network Security

- Only expose necessary ports (80, 443)
- Use firewall rules (ufw, iptables) as additional protection
- Consider VPN or private networks for admin access

### 4. Updates and Maintenance

```bash
# Pull latest images
docker compose -f docker-compose.prod.yml pull

# Restart with new images
docker compose -f docker-compose.prod.yml up -d

# View logs
docker compose -f docker-compose.prod.yml logs -f indexer
```

## Database Backup

Since PostgreSQL isn't exposed to the host, use `docker exec` for backups:

```bash
# Create backup
docker exec stone-postgres-prod pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup.sql

# Restore backup
cat backup.sql | docker exec -i stone-postgres-prod psql -U $POSTGRES_USER $POSTGRES_DB
```

Or use a mounted volume for automated backups:
```yaml
postgres:
  volumes:
    - postgres_data:/var/lib/postgresql/data
    - ./backups:/backups
```

## Monitoring

### Health Checks

All services have built-in health checks:

```bash
# Overall status
docker compose -f docker-compose.prod.yml ps

# Individual service health
docker inspect --format='{{.State.Health.Status}}' stone-postgres-prod
docker inspect --format='{{.State.Health.Status}}' stone-indexer-prod
```

### API Health Endpoint

```bash
curl https://your-domain.com/health
```

### Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f indexer

# With timestamps
docker compose -f docker-compose.prod.yml logs -f -t
```

## Troubleshooting

### Common Issues

**Caddy fails to get certificate**
- Ensure domain DNS points to your server
- Check ports 80/443 are open and not blocked by firewall
- Verify no other service is using those ports

**Indexer can't connect to database**
- Check PostgreSQL is healthy: `docker compose ps`
- Verify DATABASE_URL uses service name `postgres`, not `localhost`
- Check credentials match in both services

**Database exposed to internet (security alert)**
- Remove `ports:` from postgres service
- Use `expose:` instead for internal Docker network access
- Restart with `docker compose down && docker compose up -d`

### Checking Network Exposure

Verify PostgreSQL is NOT exposed to internet:
```bash
# Should fail/timeout from outside
nc -zv your-server-ip 5432

# Should work from within Docker network
docker exec stone-indexer-prod nc -zv postgres 5432
```

## Local Development

For local development, use the e2e compose file which binds to localhost only:

```bash
cd e2e
docker compose -f docker-compose.e2e.yml up -d
```

This exposes services on `127.0.0.1` only, not `0.0.0.0`.

---

🤖 Documentation written by Claude (Anthropic)
