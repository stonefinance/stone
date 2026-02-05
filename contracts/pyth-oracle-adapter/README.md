# Pyth Oracle Adapter

A CosmWasm contract that bridges Pyth Network price feeds to the Stone Protocol lending markets.

## Overview

The Pyth Oracle Adapter serves as a bridge between Pyth Network's on-chain price feeds and Stone Protocol's lending markets. It implements Stone's `OracleQueryMsg` interface, translating queries from Stone markets into Pyth-specific queries and validating the returned price data.

### Key Features

- **Price Feed Bridging**: Queries Pyth Network contracts and returns prices in Stone's standard format
- **Confidence Validation**: Validates price confidence intervals against configurable thresholds
- **Multi-Asset Support**: Configure multiple price feeds (denom → Pyth feed ID mappings)
- **Two-Step Ownership**: Secure ownership transfer mechanism
- **Staleness Delegation**: Staleness checking is handled by the market layer, not the adapter

## Architecture

```
┌─────────────────┐     ┌────────────────────────┐     ┌─────────────────┐
│  Stone Market   │────▶│  Pyth Oracle Adapter   │────▶│  Pyth Contract  │
│                 │     │                        │     │                 │
│ OracleQueryMsg  │     │  • Validates request   │     │  PriceFeed {    │
│   Price {denom} │     │  • Queries Pyth        │     │    price,       │
│                 │     │  • Validates response  │     │    conf,        │
│                 │◄────│  • Returns PriceResponse│◄────│    expo,        │
│                 │     │                        │     │    publish_time │
└─────────────────┘     └────────────────────────┘     └─────────────────┘
```

### Flow

1. **Market queries adapter**: A Stone market contract sends `OracleQueryMsg::Price { denom }` to the adapter
2. **Adapter looks up feed ID**: The adapter maps the denom to a Pyth price feed ID
3. **Adapter queries Pyth**: Queries the Pyth contract with the feed ID
4. **Validation**: The adapter validates the price (positive, confidence within bounds)
5. **Conversion**: Converts Pyth's price format to `Decimal`
6. **Response**: Returns `PriceResponse { denom, price, updated_at }`

## Contract Messages

### InstantiateMsg

Called once when the contract is deployed.

```json
{
  "owner": "neutron1...",
  "pyth_contract_addr": "neutron1...",
  "max_confidence_ratio": "0.01",
  "price_feeds": [
    {
      "denom": "uatom",
      "feed_id": "b00b60f88b03a6a625a8d1c048c3f66653edf217439983d037e7222c4e612819"
    },
    {
      "denom": "uusdc",
      "feed_id": "eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `owner` | `String` | Contract owner address with admin privileges |
| `pyth_contract_addr` | `String` | Address of the Pyth price feed contract |
| `max_confidence_ratio` | `Decimal` | Maximum allowed confidence/price ratio (e.g., 0.01 = 1%) |
| `price_feeds` | `Vec<PriceFeedConfig>` | Initial price feed configurations |

### ExecuteMsg

#### SetPriceFeed

Add or update a price feed mapping for a denom.

```json
{
  "set_price_feed": {
    "denom": "uatom",
    "feed_id": "b00b60f88b03a6a625a8d1c048c3f66653edf217439983d037e7222c4e612819"
  }
}
```

**Authorization**: Owner only

#### RemovePriceFeed

Remove a price feed mapping.

```json
{
  "remove_price_feed": {
    "denom": "uatom"
  }
}
```

**Authorization**: Owner only  
**Errors**: `PriceFeedNotConfigured` if denom doesn't exist

#### UpdateConfig

Update contract configuration (partial updates supported).

```json
{
  "update_config": {
    "pyth_contract_addr": "neutron1...",
    "max_confidence_ratio": "0.005"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pyth_contract_addr` | `Option<String>` | No | New Pyth contract address |
| `max_confidence_ratio` | `Option<Decimal>` | No | New confidence ratio (0 < ratio ≤ 1) |

**Authorization**: Owner only

#### TransferOwnership

Initiate a two-step ownership transfer.

```json
{
  "transfer_ownership": {
    "new_owner": "neutron1..."
  }
}
```

**Authorization**: Owner only

#### AcceptOwnership

Accept ownership transfer (must be called by the pending owner).

```json
{
  "accept_ownership": {}
}
```

**Authorization**: Pending owner only  
**Errors**: `PendingOwnerNotSet`, `NotPendingOwner`

### QueryMsg

#### Price

Query the current price for a denom (implements Stone's OracleQueryMsg interface).

```json
{
  "price": {
    "denom": "uatom"
  }
}
```

**Returns**: `PriceResponse`

```json
{
  "denom": "uatom",
  "price": "10.52",
  "updated_at": 1700000000
}
```

**Errors**:
- `PriceFeedNotConfigured` - No feed ID configured for denom
- `NegativeOrZeroPrice` - Pyth returned invalid price
- `ConfidenceTooHigh` - Confidence ratio exceeds max_confidence_ratio
- `InvalidTimestamp` - Pyth returned negative timestamp

#### Config

Query contract configuration.

```json
{
  "config": {}
}
```

**Returns**: `ConfigResponse`

```json
{
  "owner": "neutron1...",
  "pyth_contract_addr": "neutron1...",
  "max_confidence_ratio": "0.01"
}
```

#### PriceFeed

Query price feed info for a specific denom.

```json
{
  "price_feed": {
    "denom": "uatom"
  }
}
```

**Returns**: `PriceFeedInfo`

```json
{
  "denom": "uatom",
  "feed_id": "b00b60f88b03a6a625a8d1c048c3f66653edf217439983d037e7222c4e612819"
}
```

#### AllPriceFeeds

Query all configured price feeds with pagination.

```json
{
  "all_price_feeds": {
    "start_after": "uatom",
    "limit": 10
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `start_after` | `Option<String>` | No | Start pagination after this denom |
| `limit` | `Option<u32>` | No | Maximum results (default: 10, max: 30) |

**Returns**: `Vec<PriceFeedInfo>`

## Configuration

### Max Confidence Ratio

The `max_confidence_ratio` parameter controls price quality by validating the confidence interval relative to the price:

```
confidence_ratio = conf / price

if confidence_ratio > max_confidence_ratio:
    reject the price
```

**Recommended values**:
- Stablecoins: 0.001 (0.1%) - require very tight spreads
- Major assets: 0.01 (1%) - standard for BTC, ETH
- Alt assets: 0.02-0.05 (2-5%) - acceptable for volatile assets

**Example**: If max_confidence_ratio is 0.01 (1%) and Pyth returns:
- Price: $100
- Confidence: $2 (2% of price)

The query will fail with `ConfidenceTooHigh` because 2% > 1%.

### Price Feeds

Price feeds are stored as mappings from denom to Pyth feed ID (32-byte identifier, encoded as 64-character hex string).

**Common Feed IDs**:

| Asset | Feed ID |
|-------|---------|
| ATOM/USD | `b00b60f88b03a6a625a8d1c048c3f66653edf217439983d037e7222c4e612819` |
| USDC/USD | `eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a` |
| USDT/USD | `2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b` |
| BTC/USD | `e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43` |
| ETH/USD | `ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace` |

Verify feed IDs at [Pyth Hermes API](https://hermes.pyth.network/docs/#/rest/price_feeds_metadata).

## Two-Step Ownership Transfer

The contract uses a secure two-step ownership transfer pattern:

1. **Current owner** calls `TransferOwnership { new_owner }`
   - Sets `pending_owner` to the new address
   - Emits event with pending owner

2. **New owner** calls `AcceptOwnership {}`
   - Verifies caller is `pending_owner`
   - Transfers ownership
   - Clears `pending_owner`

This prevents accidental ownership transfers to incorrect or non-existent addresses.

## Error Types

| Error | When It Occurs |
|-------|----------------|
| `PriceFeedNotConfigured { denom }` | Querying a denom with no configured feed ID |
| `NegativeOrZeroPrice { denom }` | Pyth returns price ≤ 0 |
| `InvalidPrice { reason }` | Price conversion fails (negative/zero) |
| `ConfidenceTooHigh { denom, confidence_ratio, max_allowed }` | Confidence/price ratio exceeds max_confidence_ratio |
| `InvalidTimestamp` | Pyth returns negative publish_time |
| `PythQueryFailed { denom, reason }` | Pyth contract query fails |
| `InvalidFeedId { feed_id }` | Feed ID is not valid 64-character hex |
| `DuplicateDenom { denom }` | Instantiate contains duplicate denoms |
| `InvalidConfidenceRatio { value, reason }` | max_confidence_ratio is 0 or > 1 |
| `ExponentOutOfRange { expo }` | Pyth exponent |expo| > 18 |
| `Overflow` | Price conversion arithmetic overflow |
| `Unauthorized` | Non-owner calls owner-only function |
| `PendingOwnerNotSet` | AcceptOwnership called with no pending transfer |
| `NotPendingOwner` | AcceptOwnership called by wrong address |

## Build & Test

### Prerequisites

- Rust 1.70+
- `wasm32-unknown-unknown` target
- `cargo-run-script` (optional)

### Build

```bash
# Build the contract
cargo build --release --target wasm32-unknown-unknown --package pyth-oracle-adapter

# Optimize with wasm-opt (requires cosmwasm/optimizer or manually)
docker run --rm -v "$(pwd)":/code \
  --mount type=volume,source="$(basename "$(pwd)")_cache",target=/target \
  --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
  cosmwasm/optimizer:0.15.0
```

### Test

```bash
# Run unit tests
cargo test -p pyth-oracle-adapter

# Run with output
cargo test -p pyth-oracle-adapter -- --nocapture
```

### Check

```bash
# Check compilation
cargo check -p pyth-oracle-adapter

# Check all targets
cargo check -p pyth-oracle-adapter --all-targets
```

## Integration with Stone Markets

To use this adapter in a Stone market:

1. **Deploy the adapter** (see [Pyth Deployment Guide](../../docs/pyth-deployment.md))

2. **Create a market** with oracle configuration:

```json
{
  "oracle_config": {
    "address": "neutron1...",
    "oracle_type": {
      "pyth": {
        "expected_code_id": 123,
        "max_staleness_secs": 60,
        "max_confidence_ratio": "0.01"
      }
    }
  }
}
```

3. **The market will**:
   - Query prices via the adapter's `Price` query
   - Validate staleness (adapter only returns `updated_at`, market checks against `max_staleness_secs`)
   - Validate confidence (adapter checks, market may double-check)

## Pyth Network Resources

- [Pyth Documentation](https://docs.pyth.network/)
- [Hermes API](https://hermes.pyth.network/docs/)
- [Price Feed IDs](https://pyth.network/developers/price-feed-ids)
- [Neutron Pyth Contract](https://docs.pyth.network/price-feeds/use-real-time-data/cosmwasm)

## License

This project is licensed under the same terms as the Stone Protocol.
