#!/bin/bash
set -e

# Build optimized WASM binaries using cosmwasm/optimizer
# Usage: ./scripts/optimize.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Building optimized WASM binaries..."
echo "Project directory: $PROJECT_DIR"

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is required but not installed."
    exit 1
fi

# Create artifacts directory
mkdir -p "$PROJECT_DIR/artifacts"

# Use cosmwasm/optimizer for production builds
# This creates reproducible and optimized WASM binaries
docker run --rm -v "$PROJECT_DIR":/code \
    --mount type=volume,source="$(basename "$PROJECT_DIR")_cache",target=/target \
    --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
    cosmwasm/optimizer:0.16.0

echo ""
echo "Optimized WASM binaries are in: $PROJECT_DIR/artifacts/"
ls -la "$PROJECT_DIR/artifacts/"
