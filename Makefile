.PHONY: build test e2e-build e2e-up e2e-test e2e-down e2e-logs e2e-refresh-frontend e2e clean e2e-sync-env

# Contract build targets (only contracts, not testing package which has non-wasm deps)
build:
	cargo build --release --target wasm32-unknown-unknown -p stone-factory -p stone-market -p mock-oracle

test:
	cargo test --workspace

# E2E testing targets
e2e-build: build
	mkdir -p artifacts
	cp target/wasm32-unknown-unknown/release/stone_factory.wasm artifacts/stone_factory.wasm
	cp target/wasm32-unknown-unknown/release/stone_market.wasm artifacts/stone_market.wasm
	cp target/wasm32-unknown-unknown/release/mock_oracle.wasm artifacts/mock_oracle.wasm

e2e-up: e2e-build
	cd e2e && docker compose -f docker-compose.e2e.yml up -d
	@echo "Waiting for services..."
	@timeout 180 bash -c 'until curl -sf http://localhost:3000 > /dev/null 2>&1; do sleep 5; done' || echo "Frontend not ready"
	@timeout 60 bash -c 'until curl -sf http://localhost:4000/health > /dev/null 2>&1; do sleep 5; done' || echo "Indexer not ready"
	@timeout 60 bash -c 'until curl -sf http://localhost:26657/status > /dev/null 2>&1; do sleep 5; done' || echo "Chain not ready"
	@echo "E2E stack is ready!"

e2e-test:
	cd e2e && npm test

e2e-test-smoke:
	cd e2e && npm run test:smoke

e2e-test-integration:
	cd e2e && npm run test:integration

e2e-down:
	cd e2e && docker compose -f docker-compose.e2e.yml down -v

e2e-logs:
	cd e2e && docker compose -f docker-compose.e2e.yml logs -f

e2e-refresh-frontend:
	cd e2e && docker compose -f docker-compose.e2e.yml up -d --build --force-recreate frontend

e2e-clean: e2e-down
	rm -rf e2e/chain
	rm -rf e2e/.env.deployment
	rm -rf e2e/test-results
	rm -rf e2e/playwright-report
	rm -rf artifacts
	rm -rf deployment

# Copy deployment results to frontend .env.local
e2e-sync-env:
	@if [ -f deployment/result.json ]; then \
		cd e2e && npx tsx scripts/copy-deployment-env.ts; \
	else \
		echo "No deployment found. Run 'make e2e-up' first."; \
	fi

# Full E2E run
e2e: e2e-up e2e-test

# Install E2E dependencies
e2e-install:
	cd e2e && npm install
	cd e2e && npx playwright install --with-deps chromium

# Clean all build artifacts
clean:
	cargo clean
	rm -rf artifacts
	rm -rf e2e/node_modules
	rm -rf e2e/dist

# Help target
help:
	@echo "Available targets:"
	@echo "  build              - Build WASM contracts (factory, market, mock-oracle)"
	@echo "  test               - Run Rust unit tests"
	@echo "  e2e-build          - Build contracts and prepare artifacts"
	@echo "  e2e-up             - Start E2E test stack (wasmd, postgres, deployer, indexer)"
	@echo "  e2e-test           - Run E2E tests"
	@echo "  e2e-test-smoke     - Run smoke tests only"
	@echo "  e2e-down           - Stop E2E test stack"
	@echo "  e2e-logs           - Follow E2E stack logs"
	@echo "  e2e-refresh-frontend - Rebuild and restart frontend container"
	@echo "  e2e-clean          - Clean E2E artifacts"
	@echo "  e2e-sync-env       - Copy deployment addresses to frontend/.env.local"
	@echo "  e2e                - Full E2E run (build, up, test)"
	@echo "  e2e-install        - Install E2E dependencies"
	@echo "  clean              - Clean all build artifacts"
	@echo ""
	@echo "E2E Stack Services:"
	@echo "  - wasmd:    Local blockchain at http://localhost:26657"
	@echo "  - postgres: Database at localhost:5432"
	@echo "  - indexer:  GraphQL API at http://localhost:4000/graphql"
	@echo "  - frontend: Web app at http://localhost:3000 (optional)"
