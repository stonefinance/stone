#!/usr/bin/env bash
# Pre-commit hook for Stone Finance
# Install: ln -sf ../../scripts/pre-commit.sh .git/hooks/pre-commit
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0

echo "🔍 Running pre-commit checks..."

# ─── Rust checks ───────────────────────────────────────────────
# Only run if Rust files changed
RUST_CHANGED=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '\.(rs|toml)$' || true)

if [ -n "$RUST_CHANGED" ]; then
    echo ""
    echo "🦀 Rust checks..."

    echo -n "  fmt:    "
    if cargo fmt --all -- --check > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗ Run 'cargo fmt --all' to fix${NC}"
        ERRORS=$((ERRORS + 1))
    fi

    echo -n "  clippy: "
    if cargo clippy --workspace --all-targets -- -D warnings > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗ Fix clippy warnings${NC}"
        ERRORS=$((ERRORS + 1))
    fi

    echo -n "  test:   "
    if cargo test --workspace > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗ Tests failing${NC}"
        ERRORS=$((ERRORS + 1))
    fi
fi

# ─── Frontend checks ──────────────────────────────────────────
# Only run if frontend files changed
FRONTEND_CHANGED=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '^frontend/' || true)

if [ -n "$FRONTEND_CHANGED" ]; then
    echo ""
    echo "⚛️  Frontend checks..."

    echo -n "  eslint: "
    if (cd frontend && npx eslint . --max-warnings 0) > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗ Fix ESLint errors${NC}"
        ERRORS=$((ERRORS + 1))
    fi

    echo -n "  types:  "
    if (cd frontend && npx tsc --noEmit) > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗ Fix TypeScript errors${NC}"
        ERRORS=$((ERRORS + 1))
    fi

    echo -n "  test:   "
    if (cd frontend && npx vitest run) > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗ Tests failing${NC}"
        ERRORS=$((ERRORS + 1))
    fi

    echo -n "  build:  "
    if (cd frontend && npm run build) > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗ Next.js build failed${NC}"
        ERRORS=$((ERRORS + 1))
    fi
fi

# ─── General checks ───────────────────────────────────────────
echo ""
echo "📋 General checks..."

# Check for debug artifacts in staged files
STAGED=$(git diff --cached --name-only --diff-filter=ACMR)

echo -n "  debug:  "
DEBUG_FOUND=0
if echo "$STAGED" | xargs grep -l 'console\.log\|dbg!(' 2>/dev/null | head -5 | grep -q .; then
    # Check only staged content, not full file
    if git diff --cached -U0 | grep -E '^\+.*console\.log|^\+.*dbg!\(' | grep -v '// keep' > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠ Found console.log/dbg!() in staged changes (add '// keep' to skip)${NC}"
    else
        echo -e "${GREEN}✓${NC}"
    fi
else
    echo -e "${GREEN}✓${NC}"
fi

# ─── Result ────────────────────────────────────────────────────
echo ""
if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}✗ Pre-commit failed with $ERRORS error(s)${NC}"
    exit 1
else
    echo -e "${GREEN}✓ All checks passed${NC}"
fi
