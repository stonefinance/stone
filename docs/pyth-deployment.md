# Pyth Oracle Adapter Deployment Guide

This guide walks through deploying and configuring the Pyth Oracle Adapter for the Stone Protocol on Neutron.

## Prerequisites

### Required Tools

```bash
# Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown

# Neutron CLI (neutrond)
# Install from https://github.com/neutron-org/neutron

# jq (JSON processing)
# macOS: brew install jq
# Ubuntu: apt-get install jq
```

### Environment Setup

```bash
# Set your wallet address
export WALLET="your-neutron-wallet-name"
export WALLET_ADDR=$(neutrond keys show $WALLET -a)

# Set chain configuration
export CHAIN_ID="neutron-1"  # For mainnet
# export CHAIN_ID="pion-1"   # For testnet

export NODE_URL="https://rpc.neutron.org:443"  # Mainnet
# export NODE_URL="https://rpc.pion.ops.neutron.org:443"  # Testnet
```

### Pyth Contract Addresses

| Network | Pyth Contract Address |
|---------|----------------------|
| Neutron Mainnet | `neutron1m2emc93m9gpwgsrsf2vylv9xvgqh654630v7dfrhrkmr5slly53spg85wv` |
| Neutron Testnet (Pion) | `neutron15ldst8t80982akgr8w8ekcytejzkmfpgdkeq4xgtge48qs7435jqp87u3t` |

## Build the Contract

### Clone and Build

```bash
# Clone the repository
git clone https://github.com/stonefinance/stone.git
cd stone

# Build the contract
cargo build --release --target wasm32-unknown-unknown --package pyth-oracle-adapter

# Or use the optimizer for smaller WASM
docker run --rm -v "$(pwd)":/code \
  --mount type=volume,source="stone_cache",target=/code/target \
  --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
  cosmwasm/optimizer:0.15.0 ./contracts/pyth-oracle-adapter

# The optimized wasm will be at artifacts/pyth_oracle_adapter.wasm
```

## Testnet Deployment

### 1. Store the Code

```bash
# Store the contract code
neutrond tx wasm store artifacts/pyth_oracle_adapter.wasm \
  --from $WALLET \
  --chain-id $CHAIN_ID \
  --node $NODE_URL \
  --gas-prices 0.025untrn \
  --gas auto \
  --gas-adjustment 1.3 \
  -y \
  --output json | tee store_result.json

# Extract the code ID
export CODE_ID=$(jq -r '.logs[0].events[] | select(.type=="store_code") | .attributes[] | select(.key=="code_id") | .value' store_result.json)
echo "Code ID: $CODE_ID"
```

### 2. Prepare Instantiate Message

First, verify your feed IDs using the [Hermes API](#feed-id-verification).

```bash
export PYTH_CONTRACT="neutron15ldst8t80982akgr8w8ekcytejzkmfpgdkeq4xgtge48qs7435jqp87u3t"
export OWNER_ADDR="$WALLET_ADDR"
export MAX_CONFIDENCE="0.01"  # 1% max confidence ratio

# Create instantiate message
cat > instantiate_msg.json << EOF
{
  "owner": "$OWNER_ADDR",
  "pyth_contract_addr": "$PYTH_CONTRACT",
  "max_confidence_ratio": "$MAX_CONFIDENCE",
  "price_feeds": [
    {
      "denom": "uatom",
      "feed_id": "b00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f8"
    },
    {
      "denom": "uusdc",
      "feed_id": "eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a"
    },
    {
      "denom": "uusdt",
      "feed_id": "2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b"
    }
  ]
}
EOF
```

### 3. Instantiate the Contract

```bash
neutrond tx wasm instantiate $CODE_ID \
  "$(cat instantiate_msg.json)" \
  --from $WALLET \
  --chain-id $CHAIN_ID \
  --node $NODE_URL \
  --label "Pyth Oracle Adapter (Testnet)" \
  --gas-prices 0.025untrn \
  --gas auto \
  --gas-adjustment 1.3 \
  --admin $WALLET_ADDR \
  -y \
  --output json | tee instantiate_result.json

# Get the contract address
export CONTRACT_ADDR=$(neutrond query wasm list-contract-by-code $CODE_ID \
  --node $NODE_URL \
  --output json | jq -r '.contracts[-1]')
echo "Contract Address: $CONTRACT_ADDR"
```

### 4. Verify Deployment

```bash
# Query contract configuration
neutrond query wasm contract-state smart $CONTRACT_ADDR \
  '{"config":{}}' \
  --node $NODE_URL

# Query a price
neutrond query wasm contract-state smart $CONTRACT_ADDR \
  '{"price":{"denom":"uatom"}}' \
  --node $NODE_URL

# Query all price feeds
neutrond query wasm contract-state smart $CONTRACT_ADDR \
  '{"all_price_feeds":{}}' \
  --node $NODE_URL
```

## Mainnet Deployment

The mainnet deployment process is identical to testnet, with different addresses and parameters.

### 1. Set Mainnet Configuration

```bash
export CHAIN_ID="neutron-1"
export NODE_URL="https://rpc.neutron.org:443"
export PYTH_CONTRACT="neutron1m2emc93m9gpwgsrsf2vylv9xvgqh654630v7dfrhrkmr5slly53spg85wv"
```

### 2. Store Code (Same as Testnet)

```bash
neutrond tx wasm store artifacts/pyth_oracle_adapter.wasm \
  --from $WALLET \
  --chain-id $CHAIN_ID \
  --node $NODE_URL \
  --gas-prices 0.025untrn \
  --gas auto \
  --gas-adjustment 1.3 \
  -y
```

### 3. Instantiate with Production Parameters

```bash
# Use a multisig or hardware wallet for mainnet owner
export OWNER_ADDR="neutron1..."  # Your multisig or governance address
export MAX_CONFIDENCE="0.01"

cat > instantiate_msg_mainnet.json << EOF
{
  "owner": "$OWNER_ADDR",
  "pyth_contract_addr": "$PYTH_CONTRACT",
  "max_confidence_ratio": "$MAX_CONFIDENCE",
  "price_feeds": [
    {
      "denom": "uatom",
      "feed_id": "b00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f8"
    },
    {
      "denom": "uusdc",
      "feed_id": "eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a"
    },
    {
      "denom": "uusdt",
      "feed_id": "2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b"
    }
  ]
}
EOF
```

### 4. Instantiate

```bash
neutrond tx wasm instantiate $CODE_ID \
  "$(cat instantiate_msg_mainnet.json)" \
  --from $WALLET \
  --chain-id $CHAIN_ID \
  --node $NODE_URL \
  --label "Pyth Oracle Adapter (Mainnet)" \
  --gas-prices 0.025untrn \
  --gas auto \
  --gas-adjustment 1.3 \
  --admin $WALLET_ADDR \
  -y
```

## Feed ID Verification

Always verify feed IDs before deployment using the Hermes API.

### Using curl

```bash
# List all available price feeds
curl "https://hermes.pyth.network/v2/price_feeds" | jq .

# Get metadata for a specific feed
curl "https://hermes.pyth.network/v2/price_feeds/b00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f8" | jq .

# Get latest price (with binary data)
curl "https://hermes.pyth.network/v2/updates/price/latest?ids[]=b00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f8" | jq .

# Get latest price (parsed)
curl "https://hermes.pyth.network/v2/updates/price/latest?ids[]=b00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f8&parsed=true" | jq .
```

### Verification Script

```bash
#!/bin/bash

FEED_ID=$1
ASSET_NAME=$2

echo "Verifying feed ID for $ASSET_NAME: $FEED_ID"

response=$(curl -s "https://hermes.pyth.network/v2/price_feeds/$FEED_ID")

if echo "$response" | jq -e '.attributes' > /dev/null 2>&1; then
    echo "✓ Feed ID verified"
    echo "  Asset: $(echo "$response" | jq -r '.attributes.display_symbol')"
    echo "  Base: $(echo "$response" | jq -r '.attributes.base')"
    echo "  Quote: $(echo "$response" | jq -r '.attributes.quote')"
    echo "  Description: $(echo "$response" | jq -r '.attributes.description')"
else
    echo "✗ Invalid feed ID or feed not found"
    exit 1
fi
```

Usage:
```bash
chmod +x verify_feed.sh
./verify_feed.sh b00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f8 ATOM
```

### Known Feed IDs

| Asset | Feed ID | Verification Status |
|-------|---------|-------------------|
| **USDC/USD** | `eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a` | ✅ Verified |
| **USDT/USD** | `2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b` | ✅ Verified |
| **ATOM/USD** | `b00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f8` | ✅ Verified |
| **NTRN/USD** | *Verify via Hermes* | ⚠️ Check current |
| **BTC/USD** | `e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43` | ✅ Verified |
| **ETH/USD** | `ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace` | ✅ Verified |

### Finding NTRN Feed ID

```bash
# Search for NTRN feeds
curl -s "https://hermes.pyth.network/v2/price_feeds" | \
  jq '.[] | select(.attributes.base == "NTRN")'

# Or search by symbol
curl -s "https://hermes.pyth.network/v2/price_feeds" | \
  jq '.[] | select(.attributes.display_symbol | contains("NTRN"))'
```

## Post-Deployment Verification

### 1. Verify Contract State

```bash
# Check config
neutrond query wasm contract-state smart $CONTRACT_ADDR '{"config":{}}' \
  --node $NODE_URL | jq .

# Expected output:
# {
#   "data": {
#     "owner": "neutron1...",
#     "pyth_contract_addr": "neutron1...",
#     "max_confidence_ratio": "0.01"
#   }
# }
```

### 2. Verify Price Feeds

```bash
# Check each configured feed
for denom in uatom uusdc uusdt; do
  echo "Checking $denom:"
  neutrond query wasm contract-state smart $CONTRACT_ADDR \
    "{\"price_feed\":{\"denom\":\"$denom\"}}" \
    --node $NODE_URL | jq -r '.data.feed_id'
done
```

### 3. Test Price Queries

```bash
# Test price query for each asset
for denom in uatom uusdc uusdt; do
  echo "Querying price for $denom:"
  neutrond query wasm contract-state smart $CONTRACT_ADDR \
    "{\"price\":{\"denom\":\"$denom\"}}" \
    --node $NODE_URL | jq '.data'
  echo ""
done
```

### 4. Verify Pyth Integration

```bash
# Query the actual Pyth contract directly for comparison
neutrond query wasm contract-state smart $PYTH_CONTRACT \
  '{"price_feed":{"id":"b00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f8"}}' \
  --node $NODE_URL | jq '.data.price_feed.price'
```

### 5. Integration Test with Market

Create a test market to verify the full integration:

```bash
# Query market using the adapter
cat > test_market_query.json << EOF
{
  "oracle_config": {
    "address": "$CONTRACT_ADDR",
    "oracle_type": {
      "pyth": {
        "expected_code_id": $CODE_ID,
        "max_staleness_secs": 60,
        "max_confidence_ratio": "0.01"
      }
    }
  }
}
EOF
```

## Adding Price Feeds (Post-Deployment)

### Add a Single Feed

```bash
neutrond tx wasm execute $CONTRACT_ADDR \
  '{
    "set_price_feed": {
      "denom": "ubtc",
      "feed_id": "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43"
    }
  }' \
  --from $WALLET \
  --chain-id $CHAIN_ID \
  --node $NODE_URL \
  --gas-prices 0.025untrn \
  --gas auto \
  -y
```

### Remove a Feed

```bash
neutrond tx wasm execute $CONTRACT_ADDR \
  '{
    "remove_price_feed": {
      "denom": "uoldtoken"
    }
  }' \
  --from $WALLET \
  --chain-id $CHAIN_ID \
  --node $NODE_URL \
  --gas-prices 0.025untrn \
  --gas auto \
  -y
```

## Updating Configuration

### Update Max Confidence Ratio

```bash
neutrond tx wasm execute $CONTRACT_ADDR \
  '{
    "update_config": {
      "max_confidence_ratio": "0.005"
    }
  }' \
  --from $WALLET \
  --chain-id $CHAIN_ID \
  --node $NODE_URL \
  --gas-prices 0.025untrn \
  --gas auto \
  -y
```

### Update Pyth Contract Address

```bash
neutrond tx wasm execute $CONTRACT_ADDR \
  '{
    "update_config": {
      "pyth_contract_addr": "neutron1newaddress..."
    }
  }' \
  --from $WALLET \
  --chain-id $CHAIN_ID \
  --node $NODE_URL \
  --gas-prices 0.025untrn \
  --gas auto \
  -y
```

## Ownership Transfer

### Initiate Transfer

```bash
export NEW_OWNER="neutron1..."

neutrond tx wasm execute $CONTRACT_ADDR \
  "{
    \"transfer_ownership\": {
      \"new_owner\": \"$NEW_OWNER\"
    }
  }" \
  --from $WALLET \
  --chain-id $CHAIN_ID \
  --node $NODE_URL \
  --gas-prices 0.025untrn \
  --gas auto \
  -y
```

### Accept Transfer

The new owner must run:

```bash
neutrond tx wasm execute $CONTRACT_ADDR \
  '{"accept_ownership":{}}' \
  --from $NEW_OWNER_WALLET \
  --chain-id $CHAIN_ID \
  --node $NODE_URL \
  --gas-prices 0.025untrn \
  --gas auto \
  -y
```

## Troubleshooting

### Common Issues

#### "PriceFeedNotConfigured"

```bash
# Check if feed is configured
neutrond query wasm contract-state smart $CONTRACT_ADDR \
  '{"price_feed":{"denom":"uatom"}}' \
  --node $NODE_URL

# If empty, add the feed
```

#### "ConfidenceTooHigh"

```bash
# Check current confidence settings
neutrond query wasm contract-state smart $CONTRACT_ADDR \
  '{"config":{}}' \
  --node $NODE_URL

# Check Pyth price directly to see confidence
neutrond query wasm contract-state smart $PYTH_CONTRACT \
  '{"price_feed":{"id":"FEED_ID"}}' \
  --node $NODE_URL | jq '.data.price_feed.price.conf'
```

#### "PythQueryFailed"

- Verify Pyth contract address is correct
- Check if feed ID exists on Pyth
- Verify network connectivity

### Debug Commands

```bash
# Get contract history
neutrond query wasm contract-history $CONTRACT_ADDR --node $NODE_URL

# Get contract state (raw)
neutrond query wasm contract-state all $CONTRACT_ADDR --node $NODE_URL

# Get transaction details
neutrond query tx <TX_HASH> --node $NODE_URL
```

## Security Checklist

Before mainnet deployment:

- [ ] Use multisig or hardware wallet for owner
- [ ] Verify all feed IDs via Hermes API
- [ ] Test price queries on all configured assets
- [ ] Verify confidence ratios are appropriate for each asset type
- [ ] Test ownership transfer flow
- [ ] Verify Pyth contract address against official sources
- [ ] Review contract code ID matches expected
- [ ] Test with small amounts before full production use

## References

- [Pyth Network Docs](https://docs.pyth.network/)
- [Hermes API Docs](https://hermes.pyth.network/docs/)
- [Neutron Docs](https://docs.neutron.org/)
- [Stone Oracle Adapter README](../contracts/pyth-oracle-adapter/README.md)
- [Stone Oracle Architecture](./oracle-architecture.md)
