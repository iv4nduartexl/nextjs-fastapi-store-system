# Plan: Migrate Deployment from Docker to Local Installation

## Goal
Replace Docker-based deployment with native local installation on Linux Mint 22.3 (Ubuntu 24.04 base). Keep identical deployment trigger (push to main) and same backup/sync behavior.

## Current Architecture (Docker)
- `docker-compose.yml` defines: backend, frontend, db (PostgreSQL 17), db_test, mailhog, db-backup, gdrive-sync, nginx-proxy-manager
- Workflow: checkout → copy .env.example → backup DB → push to GDrive → docker compose up --build -d → run migrations → start gdrive-sync

## Target Architecture (Local)
- **PostgreSQL**: System package (apt), runs as systemd service on port 5432
- **Backend**: Python 3.12 + uv, runs as systemd service on port 8000
- **Frontend**: Node 20 + pnpm, runs as systemd service on port 3000
- **Mailhog**: Optional - can be system package or skipped in production
- **DB Backup**: systemd timer + service (replaces db-backup container)
- **GDrive Sync**: systemd service (replaces gdrive-sync container)
- **Nginx Proxy Manager**: Keep as-is or replace with nginx + certbot (out of scope for this plan)

## Implementation Steps

### 1. Create Makefile Targets for Local Setup (`Makefile`)
Add new targets (keep existing docker targets for backwards compatibility):
- `setup-system-deps` - Install PostgreSQL, Python 3.12, Node 20, pnpm, uv, rclone via apt
- `setup-postgres` - Create database/user, run migrations
- `setup-backend` - Install Python deps via uv sync
- `setup-frontend` - Install Node deps via pnpm install, build
- `setup-gdrive` - Configure rclone remote (interactive, run once)
- `start-backend` - Run backend via systemd (or direct for workflow)
- `start-frontend` - Run frontend via systemd (or direct for workflow)
- `db-backup` - Local pg_dump to backups/
- `db-restore` - Local pg_restore
- `start-gdrive-sync` - Run rclone sync as systemd service
- `deploy-local` - Full deploy sequence for workflow

### 2. Create Systemd Service Files (deploy to `/etc/systemd/system/`)
- `store-backend.service` - Backend service (user=deploy, working dir=/opt/store/fastapi_backend)
- `store-frontend.service` - Frontend service (user=deploy, working dir=/opt/store/nextjs-frontend)
- `store-db-backup.service` + `store-db-backup.timer` - Daily DB backup
- `store-gdrive-sync.service` + `store-gdrive-sync.timer` - Daily GDrive sync

### 3. Update Deployment Workflow (`.github/workflows/linux-mint-deploy.yml`)
Replace docker steps with:
1. Checkout code
2. Run `make setup-system-deps` (installs packages via apt)
3. Run `make setup-postgres` (init DB, run migrations)
4. Run `make setup-backend` (uv sync)
5. Run `make setup-frontend` (pnpm install + build)
5. Run `make db-backup` (backup before deploy)
6. Push backup to GDrive (rclone sync)
7. Restart systemd services: `systemctl restart store-backend store-frontend`
8. Run `make start-gdrive-sync` (enable/start timer)

### 4. Environment Files
- Copy `.env.example` → `.env` for both backend and frontend (already in workflow)
- Production values need to be set on server (secrets not in repo)

### 5. Directory Structure on Server
```
/opt/store/
├── fastapi_backend/     # Backend code
├── nextjs-frontend/     # Frontend code (built)
├── backups/             # DB backups
├── local-shared-data/   # Shared openapi.json
```

## Key Decisions Resolved
| Decision | Choice |
|----------|--------|
| Linux Mint Version | 22.3 (Ubuntu 24.04) - Python 3.12, Node 20, PostgreSQL 16 |
| PostgreSQL | System package (apt), systemd service |
| System Dependencies | Auto-install in workflow via apt |
| GDrive Sync | systemd service + timer |
| Nginx Proxy Manager | Keep as-is (out of scope) |

## Validation Plan
1. Test `make setup-system-deps` on clean Mint 22.3 VM
2. Test `make deploy-local` end-to-end
3. Verify systemd services start on boot
4. Verify DB backup timer creates dumps in backups/
5. Verify GDrive sync timer pushes to Google Drive
6. Verify frontend builds and serves on port 3000
7. Verify backend runs migrations and serves on port 8000

## Risks & Mitigations
- **PostgreSQL version**: Mint 22 has PG 16, Docker used 17. Use `postgresql-16` package, verify compatibility.
- **Node version**: Mint 22 has Node 20 (matches project). Use NodeSource repo if newer needed.
- **uv/pnpm**: Not in default apt. Install uv via official installer, pnpm via npm.
- **Permissions**: Deploy user needs sudo for systemctl, but services run as unprivileged user.
- **Secrets**: Production .env values must be pre-configured on server (not in repo).

## Out of Scope
- Nginx Proxy Manager replacement
- SSL/TLS certificate management
- Zero-downtime deployments (current workflow stops services)
- Rollback strategy (manual via git checkout + redeploy)