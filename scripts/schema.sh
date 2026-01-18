#!/bin/bash
set -e

# Generate JSON schemas for all contracts
# Usage: ./scripts/schema.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Generating JSON schemas..."

cd "$PROJECT_DIR"

# Generate schemas for each contract
for contract in contracts/*; do
    if [ -d "$contract" ]; then
        contract_name=$(basename "$contract")
        echo "Generating schema for $contract_name..."

        mkdir -p "schemas/$contract_name"

        # Run cargo schema if available, otherwise use cosmwasm-schema
        cd "$contract"
        cargo run --example schema 2>/dev/null || cargo schema 2>/dev/null || echo "No schema generator found for $contract_name"
        cd "$PROJECT_DIR"
    fi
done

echo ""
echo "Schemas generated in: $PROJECT_DIR/schemas/"
