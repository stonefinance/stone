# Oracle Architecture in Stone

This document describes how oracles integrate with the Stone Protocol lending markets, focusing on the adapter pattern, query flow, and responsibilities of each layer.

## Overview

Stone Protocol uses an **adapter pattern** for oracle integration. This allows the protocol to support multiple oracle providers (Pyth, Chainlink, etc.) through a common interface.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Stone Protocol                                    │
│                                                                              │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐               │
│  │   Market 1   │      │   Market 2   │      │   Market N   │               │
│  │  (uatom/usdc)│      │  (ubtc/usdc) │      │  (ueth/usdc) │               │
│  └──────┬───────┘      └──────┬───────┘      └──────┬───────┘               │
│         │                     │                     │                        │
│         └─────────────────────┼─────────────────────┘                        │
│                               │                                              │
│                    ┌──────────▼──────────┐                                   │
│                    │  OracleType Enum    │                                   │
│                    │  (Generic/Pyth/...) │                                   │
│                    └──────────┬──────────┘                                   │
│                               │                                              │
│         ┌─────────────────────┼─────────────────────┐                        │
│         │                     │                     │                        │
│  ┌──────▼───────┐     ┌──────▼───────┐     ┌──────▼───────┐                │
│  │   Generic    │     │     Pyth     │     │  Chainlink   │                │
│  │   Adapter    │     │   Adapter    │     │   Adapter    │                │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘                │
│         │                    │                    │                         │
└─────────│────────────────────│────────────────────│─────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
   │ Custom Oracle│     │Pyth Contract │     │Chainlink Contract│
   └──────────────┘     └──────────────┘     └──────────────┘
```

## OracleType Enum

The `OracleType` enum in `packages/types/src/oracle.rs` defines supported oracle types and their validation rules:

```rust
pub enum OracleType {
    /// Generic oracle following Stone's OracleQueryMsg interface.
    Generic {
        expected_code_id: Option<u64>,
        max_staleness_secs: u64,
    },
    /// Pyth oracle adapter.
    Pyth {
        expected_code_id: u64,
        max_staleness_secs: u64,
        max_confidence_ratio: Decimal,
    },
    /// Chainlink oracle (future support)
    Chainlink {
        expected_code_id: u64,
        max_staleness_secs: u64,
    },
}
```

### Fields

| Field | Description |
|-------|-------------|
| `expected_code_id` | Validates the oracle contract was deployed from expected code ID |
| `max_staleness_secs` | Maximum acceptable age of price data (enforced by market) |
| `max_confidence_ratio` | Maximum confidence/price ratio (Pyth-specific, enforced by adapter) |

### Default Values

| Oracle Type | Default Staleness | Default Confidence |
|-------------|-------------------|-------------------|
| `Generic` | 300 seconds (5 min) | N/A |
| `Pyth` | 60 seconds (1 min) | Configurable |
| `Chainlink` | 3600 seconds (1 hour) | N/A |

## Query Flow

When a market needs to fetch a price (e.g., during borrowing or liquidation):

```
┌─────────────┐
│    Market   │
│   Contract  │
└──────┬──────┘
       │ 1. Query OracleAdapter
       │    OracleQueryMsg::Price { denom }
       │
       ▼
┌─────────────┐
│   Oracle    │
│   Adapter   │
└──────┬──────┘
       │ 2. Look up feed_id from denom
       │    (internal mapping)
       │
       │ 3. Query External Oracle
       │    (e.g., PythQueryMsg::PriceFeed)
       ▼
┌─────────────┐
│   Pyth      │
│  Contract   │
└──────┬──────┘
       │ 4. Return raw price data
       │    Price { price, conf, expo, publish_time }
       ▼
┌─────────────┐
│   Oracle    │
│   Adapter   │
└──────┬──────┘
       │ 5. Validate & Convert
       │    • Check price > 0
       │    • Check confidence ratio
       │    • Convert to Decimal
       │
       │ 6. Return PriceResponse
       │    { denom, price, updated_at }
       ▼
┌─────────────┐
│    Market   │
│   Contract  │
└──────┬──────┘
       │ 7. Validate staleness
       │    current_time - updated_at < max_staleness_secs
       │
       │ 8. Use price for calculations
       │    (LTV, liquidation, etc.)
       ▼
```

### Detailed Flow

1. **Market initiates query**: Calls adapter's `Price { denom }` query
2. **Adapter validates request**: Checks if denom has configured feed ID
3. **Adapter queries external oracle**: Fetches raw price data
4. **Adapter validates response**:
   - Price must be positive
   - Confidence ratio must be within bounds
   - Timestamp must be valid
5. **Adapter converts price**: Converts from oracle format to `Decimal`
6. **Adapter returns**: `PriceResponse { denom, price, updated_at }`
7. **Market validates staleness**: Compares `updated_at` against current block time
8. **Market uses price**: For LTV calculations, liquidation checks, etc.

## Staleness Enforcement

Staleness checking is a **market-layer responsibility**, not an adapter responsibility.

### Why?

- **Separation of concerns**: Adapter focuses on data quality, market focuses on timeliness
- **Flexibility**: Different markets can have different staleness requirements for the same oracle
- **Composability**: Multiple markets can share one adapter with different staleness configs

### Implementation

**Market Layer** (`packages/types/src/error.rs`):

```rust
OraclePriceStale {
    updated_at: u64,
    current_time: u64,
    max_staleness: u64,
}
```

**Validation Logic**:

```rust
let current_time = env.block.time.seconds();
let price_age = current_time - price_response.updated_at;

if price_age > oracle_config.oracle_type.max_staleness_secs() {
    return Err(ContractError::OraclePriceStale {
        updated_at: price_response.updated_at,
        current_time,
        max_staleness: oracle_config.oracle_type.max_staleness_secs(),
    });
}
```

### Staleness Guidelines

| Asset Type | Recommended Staleness | Rationale |
|------------|----------------------|-----------|
| Major crypto (BTC, ETH) | 60 seconds | High volatility, frequent updates |
| Altcoins | 60-300 seconds | Variable volatility |
| Stablecoins | 300 seconds | Low volatility, less frequent updates |
| Illiquid assets | 600+ seconds | Infrequent trading activity |

## Adapter Responsibilities

### Must Do

1. **Implement `OracleQueryMsg` interface**:
   ```rust
   #[cw_serde]
   #[derive(QueryResponses)]
   pub enum OracleQueryMsg {
       #[returns(PriceResponse)]
       Price { denom: String },
   }
   ```

2. **Return `PriceResponse` format**:
   ```rust
   #[cw_serde]
   pub struct PriceResponse {
       pub denom: String,
       pub price: Decimal,
       pub updated_at: u64,
   }
   ```

3. **Validate price data**:
   - Price must be positive
   - Apply oracle-specific validation (e.g., confidence for Pyth)

4. **Convert to `Decimal`**:
   - Handle different decimal precisions
   - Prevent overflow/underflow

### Must NOT Do

1. **Check staleness**: This is the market's responsibility
2. **Store historical prices**: Adapters should be stateless for prices
3. **Apply market-specific logic**: No LTV or liquidation calculations

## Market Responsibilities

### Must Do

1. **Validate staleness**: Check `updated_at` against `max_staleness_secs`
2. **Validate code ID**: Optionally verify oracle contract code ID
3. **Handle oracle errors**: Convert adapter errors to market-appropriate errors

### Oracle Configuration

Markets store oracle configuration in `OracleConfig`:

```rust
#[cw_serde]
pub struct OracleConfig {
    /// Oracle contract address
    pub address: Addr,
    /// Oracle type with validation rules
    pub oracle_type: OracleType,
}
```

## How to Add a New Oracle Type

To add support for a new oracle provider (e.g., Band Protocol):

### 1. Extend `OracleType` Enum

Add the new variant to `packages/types/src/oracle.rs`:

```rust
pub enum OracleType {
    // ... existing variants
    
    /// Band Protocol oracle
    Band {
        expected_code_id: u64,
        max_staleness_secs: u64,
        /// Band-specific validation params
        min_sources: u8,
    },
}
```

### 2. Create Adapter Contract

Create a new adapter contract following the pattern:

```
contracts/
  band-oracle-adapter/
    Cargo.toml
    src/
      lib.rs
      contract.rs
      msg.rs
      error.rs
      state.rs
      band_types.rs  # Band-specific types
```

### 3. Implement Required Interface

The adapter must implement:

```rust
// msg.rs
#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(PriceResponse)]
    Price { denom: String },
    // ... additional queries
}

// contract.rs
pub fn query(deps: Deps, env: Env, msg: QueryMsg) -> Result<Binary, ContractError> {
    match msg {
        QueryMsg::Price { denom } => to_json_binary(&query_price(deps, env, denom)?),
        // ...
    }
}
```

### 4. Implement Adapter Logic

Key functions to implement:

```rust
/// Query external oracle and convert to PriceResponse
fn query_price(deps: Deps, env: Env, denom: String) -> Result<PriceResponse, ContractError> {
    // 1. Look up external feed ID
    let feed_id = PRICE_FEEDS.load(deps.storage, &denom)?;
    
    // 2. Query external oracle
    let raw_price: BandPriceResponse = deps.querier.query_wasm_smart(
        config.band_contract_addr,
        &BandQueryMsg::GetReferenceData {
            base_symbol: feed_id.base,
            quote_symbol: feed_id.quote,
        },
    )?;
    
    // 3. Validate price
    if raw_price.rate.is_zero() {
        return Err(ContractError::InvalidPrice { reason: "zero price".into() });
    }
    
    // 4. Validate sources (Band-specific)
    if raw_price.num_sources < config.min_sources {
        return Err(ContractError::InsufficientSources { ... });
    }
    
    // 5. Convert to Decimal
    let price = band_price_to_decimal(raw_price)?;
    
    // 6. Return standard format
    Ok(PriceResponse {
        denom,
        price,
        updated_at: raw_price.last_updated,
    })
}
```

### 5. Add Error Types

Add oracle-specific errors to `error.rs`:

```rust
pub enum ContractError {
    // ... standard errors
    
    /// Band-specific: not enough sources
    #[error("Insufficient sources: got {got}, need {min}")]
    InsufficientSources { got: u8, min: u8 },
}
```

### 6. Update Market Contract

If the market needs oracle-specific validation:

```rust
// In market contract
match oracle_config.oracle_type {
    OracleType::Band { min_sources, .. } => {
        // Additional Band-specific validation if needed
    }
    // ... other variants
}
```

### 7. Write Tests

Test the adapter thoroughly:

```rust
#[test]
fn test_query_price_success() {
    // Setup mock Band response
    // Query adapter
    // Verify PriceResponse format
}

#[test]
fn test_insufficient_sources() {
    // Mock response with fewer sources than min_sources
    // Verify InsufficientSources error
}
```

### 8. Write Documentation

Create documentation following the Pyth adapter pattern:

- `contracts/band-oracle-adapter/README.md`
- `docs/band-deployment.md`
- Inline rustdoc comments

## Security Considerations

### Adapter Security

1. **Input validation**: Validate all external inputs (denoms, feed IDs)
2. **Overflow protection**: Use checked arithmetic for price conversions
3. **Access control**: Restrict configuration changes to owner
4. **Price validation**: Reject negative, zero, or extreme prices

### Market Security

1. **Staleness enforcement**: Always check price age before using
2. **Circuit breakers**: Consider pausing markets if oracle fails
3. **Multi-oracle redundancy**: Consider using multiple oracles for critical assets
4. **Confidence thresholds**: Set appropriate confidence ratios per asset type

## Example: Complete Query Flow

```rust
// Market wants to check if a position is healthy

// 1. Query collateral price
let collateral_price = deps.querier.query_wasm_smart::<PriceResponse>(
    oracle_addr,
    &OracleQueryMsg::Price { denom: collateral_denom },
)?;

// 2. Validate staleness (market responsibility)
let current_time = env.block.time.seconds();
let price_age = current_time - collateral_price.updated_at;
if price_age > max_staleness {
    return Err(ContractError::OraclePriceStale { ... });
}

// 3. Query debt price
let debt_price = deps.querier.query_wasm_smart::<PriceResponse>(
    oracle_addr,
    &OracleQueryMsg::Price { denom: debt_denom },
)?;

// 4. Calculate position value
collateral_value = collateral_amount * collateral_price.price;
debt_value = debt_amount * debt_price.price;

// 5. Check health factor
health_factor = collateral_value / debt_value;
if health_factor < liquidation_threshold {
    return Err(ContractError::NotLiquidatable { ... });
}
```

## References

- [Pyth Oracle Adapter](../contracts/pyth-oracle-adapter/README.md)
- [Pyth Deployment Guide](./pyth-deployment.md)
- [`packages/types/src/oracle.rs`](../packages/types/src/oracle.rs)
