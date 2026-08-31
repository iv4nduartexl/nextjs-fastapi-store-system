# Makefile

# Variables
BACKEND_DIR=fastapi_backend
FRONTEND_DIR=nextjs-frontend
DOCKER_COMPOSE=docker compose

# Local deployment variables
DEPLOY_DIR=/opt/store
BACKUP_DIR=backups
DB_NAME=mydatabase
DB_USER=postgres
DB_PORT=5432
SERVICE_USER=deploy

# Help
.PHONY: help
help:
	@echo "Available commands:"
	@awk '/^[a-zA-Z_-]+:/{split($$1, target, ":"); print "  " target[1] "\t" substr($$0, index($$0,$$2))}' $(MAKEFILE_LIST)

# Backend commands
.PHONY: start-backend test-backend

start-backend: ## Start the backend server with FastAPI and hot reload
	cd $(BACKEND_DIR) && ./start.sh

test-backend: ## Run backend tests using pytest
	cd $(BACKEND_DIR) && uv run pytest


# Frontend commands
.PHONY: start-frontend test-frontend

start-frontend: ## Start the frontend server with pnpm and hot reload
	cd $(FRONTEND_DIR) && ./start.sh

test-frontend: ## Run frontend tests using npm
	cd $(FRONTEND_DIR) && pnpm run test


# Docker commands
.PHONY: docker-backend-shell docker-frontend-shell docker-build docker-build-backend \
        docker-build-frontend docker-start-backend docker-start-frontend docker-up-test-db \
        docker-migrate-db docker-db-schema docker-test-backend docker-test-frontend


docker-backend-shell: ## Access the backend container shell
	$(DOCKER_COMPOSE) run --rm backend sh

docker-frontend-shell: ## Access the frontend container shell
	$(DOCKER_COMPOSE) run --rm frontend sh

docker-build: ## Build all the services
	$(DOCKER_COMPOSE) build --no-cache

docker-build-backend: ## Build the backend container with no cache
	$(DOCKER_COMPOSE) build backend --no-cache

docker-build-frontend: ## Build the frontend container with no cache
	$(DOCKER_COMPOSE) build frontend --no-cache

docker-start-backend: ## Start the backend container
	$(DOCKER_COMPOSE) up backend

docker-start-frontend: ## Start the frontend container
	$(DOCKER_COMPOSE) up frontend

docker-up-test-db: ## Start the test database container
	$(DOCKER_COMPOSE) up db_test

docker-migrate-db: ## Backup then run database migrations using Alembic
	@$(MAKE) docker-db-backup
	$(DOCKER_COMPOSE) run --rm backend alembic upgrade head

docker-db-schema: ## Generate a new migration schema. Usage: make docker-db-schema migration_name="add users"
	$(DOCKER_COMPOSE) run --rm backend alembic revision --autogenerate -m "$(migration_name)"

docker-test-backend: ## Run tests for the backend
	$(DOCKER_COMPOSE) run --rm backend pytest

docker-test-frontend: ## Run tests for the frontend
	$(DOCKER_COMPOSE) run --rm frontend pnpm run test


# Database backup/restore (Docker)
.PHONY: docker-db-backup docker-db-restore docker-migrate-db

docker-db-backup: ## Backup the database. Output: backups/YYYY-MM-DD_HHMMSS.dump
	@mkdir -p $(BACKUP_DIR)
	@FILE=$(BACKUP_DIR)/$$(date +%Y-%m-%d_%H%M%S).dump; \
	$(DOCKER_COMPOSE) exec -T db pg_dump -U $(DB_USER) -Fc $(DB_NAME) > $$FILE && \
	echo "Backup saved: $$FILE" || (echo "Backup FAILED" && exit 1)

docker-db-restore: ## Restore a backup. Usage: make docker-db-restore FILE=backups/YYYY-MM-DD_HHMMSS.dump
	@if [ -z "$(FILE)" ]; then echo "Usage: make docker-db-restore FILE=backups/<file>.dump" && exit 1; fi
	@echo "Restoring $(FILE) into $(DB_NAME)..."
	$(DOCKER_COMPOSE) exec -T db pg_restore -U $(DB_USER) -d $(DB_NAME) --clean --if-exists < $(FILE)
	@echo "Restore complete."

setup-gdrive: ## Authenticate rclone with Google Drive (run once). Creates remote named "gdrive"
	@command -v rclone >/dev/null 2>&1 || (echo "rclone not found. Install: brew install rclone" && exit 1)
	@echo "Follow the prompts. When asked for remote name, enter: gdrive"
	rclone config create gdrive drive scope drive
	@echo "Done! Start sync with: make docker-start-gdrive"

docker-start-gdrive: ## Start the Google Drive sync service
	$(DOCKER_COMPOSE) --profile gdrive up -d gdrive-sync
	@echo "gdrive-sync running. Uploads every 24 hours to Google Drive folder: db-backups/"

docker-stop-gdrive: ## Stop the Google Drive sync service
	$(DOCKER_COMPOSE) --profile gdrive stop gdrive-sync


# =============================================================================
# LOCAL DEPLOYMENT TARGETS (New - for non-Docker deployment)
# =============================================================================

.PHONY: setup-system-deps setup-postgres setup-backend setup-frontend \
        deploy-local db-backup db-restore migrate-db \
        start-backend-service start-frontend-service \
        start-gdrive-sync setup-gdrive-local \
        install-systemd-services enable-timers

# Install system dependencies via apt (run with sudo)
setup-system-deps: ## Install system packages: PostgreSQL, Python, Node.js, pnpm, uv, rclone
	@echo "Installing system dependencies..."
	sudo apt-get update
	sudo apt-get install -y postgresql-16 postgresql-client-16 \
		python3.12 python3.12-venv python3.12-dev \
		curl gnupg ca-certificates
	# Install Node.js 20 from NodeSource
	curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
	sudo apt-get install -y nodejs
	# Install pnpm via npm
	sudo npm install -g pnpm
	# Install uv
	curl -LsSf https://astral.sh/uv/install.sh | sh
	# Install rclone
	curl https://rclone.org/install.sh | sudo bash
	@echo "System dependencies installed."

# Setup PostgreSQL database and user
setup-postgres: ## Create database and user, run migrations
	@echo "Setting up PostgreSQL..."
	sudo -u postgres psql -c "CREATE USER $(DB_USER) WITH PASSWORD 'password';" || true
	sudo -u postgres psql -c "CREATE DATABASE $(DB_NAME) OWNER $(DB_USER);" || true
	sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $(DB_NAME) TO $(DB_USER);" || true
	@echo "Running database migrations..."
	cd $(BACKEND_DIR) && uv run alembic upgrade head
	@echo "PostgreSQL setup complete."

# Setup backend dependencies
setup-backend: ## Install backend Python dependencies via uv
	@echo "Setting up backend..."
	cd $(BACKEND_DIR) && uv sync --frozen
	@echo "Backend setup complete."

# Setup frontend dependencies and build
setup-frontend: ## Install frontend Node dependencies and build for production
	@echo "Setting up frontend..."
	cd $(FRONTEND_DIR) && pnpm install --frozen-lockfile
	cd $(FRONTEND_DIR) && pnpm run build
	@echo "Frontend setup complete."

# Full local deployment sequence
deploy-local: setup-system-deps setup-postgres setup-backend setup-frontend \
              db-backup push-backup-to-gdrive restart-services start-gdrive-sync
	@echo "Local deployment complete!"

# Database backup (local PostgreSQL)
db-backup: ## Backup local database to backups/YYYY-MM-DD_HHMMSS.dump
	@mkdir -p $(BACKUP_DIR)
	@FILE=$(BACKUP_DIR)/$$(date +%Y-%m-%d_%H%M%S).dump; \
	PGPASSWORD=password pg_dump -h localhost -p $(DB_PORT) -U $(DB_USER) -Fc $(DB_NAME) > $$FILE && \
	echo "Backup saved: $$FILE" || (echo "Backup FAILED" && exit 1)

# Database restore (local PostgreSQL)
db-restore: ## Restore a backup. Usage: make db-restore FILE=backups/YYYY-MM-DD_HHMMSS.dump
	@if [ -z "$(FILE)" ]; then echo "Usage: make db-restore FILE=backups/<file>.dump" && exit 1; fi
	@echo "Restoring $(FILE) into $(DB_NAME)..."
	PGPASSWORD=password pg_restore -h localhost -p $(DB_PORT) -U $(DB_USER) -d $(DB_NAME) --clean --if-exists < $(FILE)
	@echo "Restore complete."

# Run migrations (local)
migrate-db: ## Run database migrations using Alembic (local)
	cd $(BACKEND_DIR) && uv run alembic upgrade head

# Push backup to Google Drive
push-backup-to-gdrive: ## Sync backups folder to Google Drive
	@echo "Pushing backups to Google Drive..."
	@if rclone lsd gdrive: --config ~/.config/rclone/rclone.conf > /dev/null 2>&1; then \
		rclone sync $(BACKUP_DIR) gdrive:db-backups --config ~/.config/rclone/rclone.conf && \
		echo "Synced to Google Drive" || echo "Sync FAILED"; \
	else \
		echo 'rclone remote "gdrive" not configured. Run: make setup-gdrive-local'; \
	fi

# Setup gdrive for local deployment
setup-gdrive-local: ## Authenticate rclone with Google Drive (run once on server)
	@command -v rclone >/dev/null 2>&1 || (echo "rclone not found" && exit 1)
	@echo "Follow the prompts. When asked for remote name, enter: gdrive"
	rclone config create gdrive drive scope drive
	@echo "Done! Sync will run via systemd timer."

# Restart systemd services
restart-services: ## Restart backend and frontend systemd services
	@echo "Restarting services..."
	sudo systemctl restart store-backend store-frontend
	@echo "Services restarted."

# Start gdrive sync systemd timer
start-gdrive-sync: ## Enable and start gdrive sync systemd timer
	@echo "Starting gdrive sync timer..."
	sudo systemctl enable --now store-gdrive-sync.timer
	@echo "GDrive sync timer started."

# Install systemd service files (run once on server)
install-systemd-services: ## Install systemd service files to /etc/systemd/system/
	@echo "Installing systemd service files..."
	sudo cp deploy/systemd/store-backend.service /etc/systemd/system/
	sudo cp deploy/systemd/store-frontend.service /etc/systemd/system/
	sudo cp deploy/systemd/store-db-backup.service /etc/systemd/system/
	sudo cp deploy/systemd/store-db-backup.timer /etc/systemd/system/
	sudo cp deploy/systemd/store-gdrive-sync.service /etc/systemd/system/
	sudo cp deploy/systemd/store-gdrive-sync.timer /etc/systemd/system/
	sudo systemctl daemon-reload
	@echo "Systemd services installed. Run 'make enable-timers' to start timers."

# Enable and start systemd timers
enable-timers: ## Enable and start backup and gdrive sync timers
	@echo "Enabling timers..."
	sudo systemctl enable --now store-db-backup.timer
	sudo systemctl enable --now store-gdrive-sync.timer
	@echo "Timers enabled and started."

# Start backend service directly (for workflow)
start-backend-service: ## Start backend directly (used by workflow)
	cd $(BACKEND_DIR) && NODE_ENV=production uv run fastapi run app/main.py --host 0.0.0.0 --port 8000

# Start frontend service directly (for workflow)
start-frontend-service: ## Start frontend directly (used by workflow)
	cd $(FRONTEND_DIR) && NODE_ENV=production pnpm run start