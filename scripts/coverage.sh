#!/bin/bash
set -e

# Run test coverage using cargo-tarpaulin
# Usage: ./scripts/coverage.sh
#
# Prerequisites:
#   cargo install cargo-tarpaulin
#
# Note: tarpaulin requires Linux. On macOS, use cargo-llvm-cov instead:
#   cargo install cargo-llvm-cov
#   cargo llvm-cov --html

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "macOS detected. Using cargo-llvm-cov for coverage..."
    echo ""

    # Check if cargo-llvm-cov is installed
    if ! cargo llvm-cov --version &> /dev/null; then
        echo "Installing cargo-llvm-cov..."
        cargo install cargo-llvm-cov
    fi

    # Run coverage
    echo "Running tests with coverage..."
    cargo llvm-cov --html --output-dir coverage

    echo ""
    echo "Coverage report generated: $PROJECT_DIR/coverage/html/index.html"

    # Also output summary to console
    cargo llvm-cov --summary-only

else
    echo "Linux detected. Using cargo-tarpaulin for coverage..."
    echo ""

    # Check if tarpaulin is installed
    if ! cargo tarpaulin --version &> /dev/null; then
        echo "Installing cargo-tarpaulin..."
        cargo install cargo-tarpaulin
    fi

    # Run coverage
    echo "Running tests with coverage..."
    cargo tarpaulin --out Html --output-dir coverage --skip-clean

    echo ""
    echo "Coverage report generated: $PROJECT_DIR/coverage/tarpaulin-report.html"
fi

echo ""
echo "Target: >90% code coverage"
