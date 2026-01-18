# Stone Finance Events Reference

## Overview

This document provides a complete reference for all blockchain events emitted by the Stone Finance smart contracts. These events are critical for indexers and frontends to track protocol activity.

**Last Updated:** 2026-01-18
**Contract Version:** v0.1.0

---

## Event Emission Format

All events are emitted as transaction attributes in CosmWasm. Events follow the pattern:

```rust
Response::new()
    .add_attribute("action", "event_name")
    .add_attribute("field_name", value.to_string())
    // ... more attributes
```

Events can be queried from the blockchain using RPC endpoints or indexed via blockchain indexers.

---

## Factory Contract Events

### CreateMarket

Emitted when a new isolated market is created.

**Action:** `create_market`

**Attributes:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `action` | String | Always `"create_market"` |
| `market_id` | String | Unique market identifier (hash of collateral, debt, curator, salt) |
| `curator` | Address | Market curator address |
| `collateral_denom` | String | Collateral asset denomination |
| `debt_denom` | String | Debt asset denomination |

**Example:**
```json
{
  "action": "create_market",
  "market_id": "0x1234...",
  "curator": "cosmos1abc...",
  "collateral_denom": "uatom",
  "debt_denom": "uusdc"
}
```

**Reply Event (Market Instantiation):**

After market contract instantiation, an additional event is emitted:

| Attribute | Type | Description |
|-----------|------|-------------|
| `action` | String | `"market_instantiated"` |
| `market_id` | String | Market identifier |
| `market_address` | Address | Instantiated market contract address |

---

### UpdateConfig

Emitted when factory configuration is updated (owner only).

**Action:** `update_config`

**Attributes:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `action` | String | Always `"update_config"` |

**Note:** Specific config changes are not detailed in events. Query contract for updated config.

---

### UpdateMarketCodeId

Emitted when the market contract code ID is updated for future deployments.

**Action:** `update_market_code_id`

**Attributes:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `action` | String | Always `"update_market_code_id"` |
| `code_id` | u64 | New market contract code ID |

---

### TransferOwnership / AcceptOwnership

Emitted during two-step ownership transfer process.

**Transfer:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `action` | String | `"transfer_ownership"` |
| `pending_owner` | Address | Address of pending new owner |

**Accept:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `action` | String | `"accept_ownership"` |
| `new_owner` | Address | Address of new owner |

---

## Market Contract Events

### Supply

Emitted when a user supplies debt asset to earn interest.

**Action:** `supply`

**Attributes:**

| Attribute | Type | Description | Added in v0.1.0 |
|-----------|------|-------------|-----------------|
| `action` | String | Always `"supply"` | ✅ |
| `supplier` | Address | Address sending the supply | ✅ |
| `recipient` | Address | Address receiving the scaled supply | ✅ |
| `amount` | Uint128 | Amount of debt asset supplied | ✅ |
| `scaled_amount` | Uint128 | Scaled amount credited (amount / liquidity_index) | ✅ |
| `total_supply` | Uint128 | Total market supply after operation (unscaled) | ✅ New |
| `total_debt` | Uint128 | Total market debt after operation (unscaled) | ✅ New |
| `utilization` | Decimal | Market utilization rate after operation | ✅ New |

**Example:**
```json
{
  "action": "supply",
  "supplier": "cosmos1abc...",
  "recipient": "cosmos1abc...",
  "amount": "1000000",
  "scaled_amount": "990099",
  "total_supply": "10000000",
  "total_debt": "5000000",
  "utilization": "0.5"
}
```

**Notes:**
- `scaled_amount` is calculated as `amount / liquidity_index`
- Recipients can differ from suppliers (supply on behalf)
- Market state snapshot included for indexing convenience

---

### Withdraw

Emitted when a user withdraws supplied debt asset.

**Action:** `withdraw`

**Attributes:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `action` | String | Always `"withdraw"` |
| `user` | Address | Address withdrawing supply |
| `recipient` | Address | Address receiving the withdrawn assets |
| `amount` | Uint128 | Amount of debt asset withdrawn (unscaled) |
| `scaled_amount` | Uint128 | Scaled amount debited |

**Notes:**
- Partial or full withdrawal allowed
- Withdrawal capped at user's supply balance
- Withdrawal limited by available liquidity

---

### SupplyCollateral

Emitted when a user supplies collateral to enable borrowing.

**Action:** `supply_collateral`

**Attributes:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `action` | String | Always `"supply_collateral"` |
| `supplier` | Address | Address supplying collateral |
| `recipient` | Address | Address receiving the collateral credit |
| `amount` | Uint128 | Amount of collateral supplied |

**Notes:**
- Collateral is NOT scaled (no interest earned)
- Used to enable borrowing capacity

---

### WithdrawCollateral

Emitted when a user withdraws collateral.

**Action:** `withdraw_collateral`

**Attributes:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `action` | String | Always `"withdraw_collateral"` |
| `user` | Address | Address withdrawing collateral |
| `recipient` | Address | Address receiving withdrawn collateral |
| `amount` | Uint128 | Amount of collateral withdrawn |

**Notes:**
- Health check performed if user has debt
- Withdrawal must maintain LTV constraint

---

### Borrow

Emitted when a user borrows debt asset against collateral.

**Action:** `borrow`

**Attributes:**

| Attribute | Type | Description | Added in v0.1.0 |
|-----------|------|-------------|-----------------|
| `action` | String | Always `"borrow"` | ✅ |
| `borrower` | Address | Address borrowing assets | ✅ |
| `recipient` | Address | Address receiving borrowed assets | ✅ |
| `amount` | Uint128 | Amount of debt asset borrowed | ✅ |
| `scaled_amount` | Uint128 | Scaled debt amount (amount / borrow_index) | ✅ |
| `total_supply` | Uint128 | Total market supply after operation (unscaled) | ✅ New |
| `total_debt` | Uint128 | Total market debt after operation (unscaled) | ✅ New |
| `utilization` | Decimal | Market utilization rate after operation | ✅ New |

**Example:**
```json
{
  "action": "borrow",
  "borrower": "cosmos1xyz...",
  "recipient": "cosmos1xyz...",
  "amount": "5000000",
  "scaled_amount": "4950495",
  "total_supply": "10000000",
  "total_debt": "5000000",
  "utilization": "0.5"
}
```

**Notes:**
- Requires sufficient collateral
- LTV constraint enforced
- Borrow cap check performed
- Available liquidity check performed

---

### Repay

Emitted when a user repays borrowed debt.

**Action:** `repay`

**Attributes:**

| Attribute | Type | Description | Added in v0.1.0 |
|-----------|------|-------------|-----------------|
| `action` | String | Always `"repay"` | ✅ |
| `payer` | Address | Address sending repayment | ✅ |
| `borrower` | Address | Address whose debt is being repaid | ✅ |
| `amount` | Uint128 | Amount of debt repaid | ✅ |
| `scaled_decrease` | Uint128 | Scaled debt decrease | ✅ |
| `refund` | Uint128 | Refund amount (if overpayment) | ✅ (conditional) |
| `total_supply` | Uint128 | Total market supply after operation (unscaled) | ✅ New |
| `total_debt` | Uint128 | Total market debt after operation (unscaled) | ✅ New |
| `utilization` | Decimal | Market utilization rate after operation | ✅ New |

**Example:**
```json
{
  "action": "repay",
  "payer": "cosmos1xyz...",
  "borrower": "cosmos1xyz...",
  "amount": "2000000",
  "scaled_decrease": "1980198",
  "total_supply": "10000000",
  "total_debt": "3000000",
  "utilization": "0.3"
}
```

**Notes:**
- Payer can differ from borrower (repay on behalf)
- Overpayment automatically refunded
- Partial or full repayment allowed

---

### Liquidate

Emitted when an unhealthy position is liquidated.

**Action:** `liquidate`

**Attributes:**

| Attribute | Type | Description | Added in v0.1.0 |
|-----------|------|-------------|-----------------|
| `action` | String | Always `"liquidate"` | ✅ |
| `liquidator` | Address | Address performing liquidation | ✅ |
| `borrower` | Address | Address being liquidated | ✅ |
| `debt_repaid` | Uint128 | Amount of debt repaid | ✅ |
| `collateral_seized` | Uint128 | Total collateral seized | ✅ |
| `liquidator_collateral` | Uint128 | Collateral to liquidator (includes bonus) | ✅ |
| `protocol_fee` | Uint128 | Protocol fee from liquidation | ✅ |
| `total_supply` | Uint128 | Total market supply after liquidation | ✅ New |
| `total_debt` | Uint128 | Total market debt after liquidation | ✅ New |
| `total_collateral` | Uint128 | Total market collateral after liquidation | ✅ New |
| `utilization` | Decimal | Market utilization rate after liquidation | ✅ New |

**Example:**
```json
{
  "action": "liquidate",
  "liquidator": "cosmos1liq...",
  "borrower": "cosmos1xyz...",
  "debt_repaid": "2500000",
  "collateral_seized": "550",
  "liquidator_collateral": "539",
  "protocol_fee": "11",
  "total_supply": "10000000",
  "total_debt": "2500000",
  "total_collateral": "9450",
  "utilization": "0.25"
}
```

**Notes:**
- Only liquidatable if health_factor < 1.0
- Close factor enforced (max % of debt liquidatable)
- Liquidator receives collateral + liquidation bonus
- Protocol receives liquidation protocol fee
- If insufficient collateral, amounts scaled proportionally

---

### AccrueInterest

Emitted when interest is manually accrued (or automatically before operations).

**Action:** `accrue_interest`

**Attributes:**

| Attribute | Type | Description | Added in v0.1.0 |
|-----------|------|-------------|-----------------|
| `action` | String | Always `"accrue_interest"` | ✅ |
| `borrow_index` | Decimal | Updated borrow index | ✅ New |
| `liquidity_index` | Decimal | Updated liquidity index | ✅ New |
| `borrow_rate` | Decimal | Current annual borrow rate (APR) | ✅ New |
| `liquidity_rate` | Decimal | Current annual supply rate (APY) | ✅ New |
| `last_update` | u64 | Timestamp of this update | ✅ New |

**Example:**
```json
{
  "action": "accrue_interest",
  "borrow_index": "1.025",
  "liquidity_index": "1.015",
  "borrow_rate": "0.05",
  "liquidity_rate": "0.04",
  "last_update": "1705593600"
}
```

**Notes:**
- **Critical for indexing:** This is the ONLY way to track interest accrual
- Emitted automatically before most operations
- Can be called manually by anyone
- Indices grow linearly over time based on rates
- Fee distribution handled via bank messages (protocol fee, curator fee)

**Calculations:**
```
borrow_index_new = borrow_index_old * (1 + borrow_rate * time_elapsed / year)
liquidity_index_new = liquidity_index_old * (1 + liquidity_rate * time_elapsed / year)
```

---

### UpdateParams

Emitted when curator updates market parameters.

**Action:** `update_params`

**Attributes (Conditionally Emitted - only if changed):**

| Attribute | Type | Description |
|-----------|------|-------------|
| `action` | String | Always `"update_params"` |
| `new_ltv` | Decimal | New loan-to-value (if updated) |
| `interest_rate_model` | String | `"updated"` (if model changed) |
| `curator_fee` | Decimal | New curator fee (if updated) |
| `supply_cap` | String | New supply cap or `"none"` (if updated) |
| `borrow_cap` | String | New borrow cap or `"none"` (if updated) |
| `enabled` | Boolean | New enabled status (if updated) |

**Attributes (Always Emitted - Full Snapshot):**

| Attribute | Type | Description | Added in v0.1.0 |
|-----------|------|-------------|-----------------|
| `final_ltv` | Decimal | Final loan-to-value ratio | ✅ New |
| `final_liquidation_threshold` | Decimal | Final liquidation threshold | ✅ New |
| `final_liquidation_bonus` | Decimal | Final liquidation bonus | ✅ New |
| `final_liquidation_protocol_fee` | Decimal | Final liquidation protocol fee | ✅ New |
| `final_close_factor` | Decimal | Final close factor | ✅ New |
| `final_protocol_fee` | Decimal | Final protocol fee | ✅ New |
| `final_curator_fee` | Decimal | Final curator fee | ✅ New |
| `final_supply_cap` | String | Final supply cap or `"none"` | ✅ New |
| `final_borrow_cap` | String | Final borrow cap or `"none"` | ✅ New |
| `final_enabled` | Boolean | Final enabled status | ✅ New |
| `final_is_mutable` | Boolean | Final mutability status | ✅ New |

**Example:**
```json
{
  "action": "update_params",
  "new_ltv": "0.75",
  "curator_fee": "0.10",
  "final_ltv": "0.75",
  "final_liquidation_threshold": "0.85",
  "final_liquidation_bonus": "0.05",
  "final_liquidation_protocol_fee": "0.02",
  "final_close_factor": "0.5",
  "final_protocol_fee": "0.10",
  "final_curator_fee": "0.10",
  "final_supply_cap": "1000000000",
  "final_borrow_cap": "500000000",
  "final_enabled": "true",
  "final_is_mutable": "true"
}
```

**Notes:**
- Only curator can call
- LTV updates require:
  - Market must be mutable
  - 7-day cooldown since last update
  - ±5% max change per update
  - Must be less than liquidation threshold
- Full parameter snapshot ensures indexers can reconstruct param history

---

## Event Indexing Patterns

### Market State Tracking

To maintain current market state, process events in order:

1. **CreateMarket** → Initialize market with default state
2. **Supply/Borrow/Repay/Liquidate** → Update `total_supply`, `total_debt`, `total_collateral` from event attributes
3. **AccrueInterest** → Update indices and rates
4. **UpdateParams** → Update parameters using `final_*` attributes

### User Position Tracking

Track user positions by processing:

1. **Supply** → Increment user's `supply_scaled` by `scaled_amount`
2. **Withdraw** → Decrement user's `supply_scaled` by `scaled_amount`
3. **SupplyCollateral** → Increment user's `collateral` by `amount`
4. **WithdrawCollateral** → Decrement user's `collateral` by `amount`
5. **Borrow** → Increment user's `debt_scaled` by `scaled_amount`
6. **Repay** → Decrement user's `debt_scaled` by `scaled_decrease`
7. **Liquidate** → Decrement borrower's `debt_scaled` and `collateral`

**Computing Unscaled Amounts:**
```
supply_amount = supply_scaled * liquidity_index
debt_amount = debt_scaled * borrow_index
```

### Historical Snapshots

Create periodic snapshots by:

1. Listen to **AccrueInterest** events
2. On each event or time interval (e.g., hourly):
   - Record all market state (indices, rates, totals)
   - Record all parameters
   - Store with timestamp and block height

### Transaction History

Store every operation event as a transaction:

- Extract common fields: `tx_hash`, `block_height`, `timestamp`, `action`
- Store operation-specific data
- Link to market and user

---

## Common Queries

### Get Market Current State

Listen for latest events on a market:
- **AccrueInterest** → Latest indices and rates
- **Supply/Borrow/Repay** → Latest totals and utilization

### Get User Position

Listen for events where user is `supplier`, `borrower`, `payer`, or `recipient`:
- Aggregate all `scaled_amount` changes
- Multiply by current indices for unscaled amounts

### Get APY History

Query all **AccrueInterest** events for a market:
- Extract `borrow_rate` and `liquidity_rate`
- Plot over time using `last_update` timestamps

### Get Liquidatable Positions

For each user position:
1. Get current scaled debt and collateral
2. Query oracle for current prices
3. Calculate health factor
4. Filter where health_factor < 1.0

---

## Event Processing Best Practices

### Error Handling

- **Validate Data:** Check all numeric values are positive
- **Handle Missing Fields:** Some attributes are conditional (e.g., `refund` in Repay)
- **Reorg Protection:** Mark recent blocks as tentative until confirmed

### Performance

- **Batch Processing:** Process events in batches
- **Parallel Processing:** Process independent markets in parallel
- **Index Optimization:** Add database indexes on frequently queried fields

### Data Integrity

- **Checksum Validation:** Verify totals match sum of individual positions
- **Monotonic Checks:** Ensure block heights and timestamps increase
- **Recompute Periodically:** Recalculate derived values to catch drift

---

## Migration Notes

### v0.1.0 Event Improvements

The following attributes were added to improve indexing:

**AccrueInterest:**
- `borrow_index`, `liquidity_index`, `borrow_rate`, `liquidity_rate`, `last_update`

**UpdateParams:**
- Full parameter snapshot with `final_*` attributes

**Supply, Borrow, Repay, Liquidate:**
- Market state snapshot: `total_supply`, `total_debt`, `total_collateral`, `utilization`

These additions enable:
- Historical APY/APR tracking
- Market state reconstruction from events alone
- Parameter change history
- Reduced need for separate contract queries

---

## Appendix: Data Types

### Common Types

| Type | Description | Example |
|------|-------------|---------|
| `String` | UTF-8 string | `"supply"` |
| `Address` | Bech32 address | `"cosmos1abc..."` |
| `Uint128` | Unsigned 128-bit integer (as string) | `"1000000"` |
| `Decimal` | Decimal number (as string) | `"0.05"` or `"1.025"` |
| `u64` | Unsigned 64-bit integer (as string) | `"1705593600"` |
| `Boolean` | Boolean (as string) | `"true"` or `"false"` |

### Decimal Precision

- **Decimal** fields use 18 decimal places
- **Uint128** represents token amounts in smallest unit (e.g., uatom, uusdc)
- **Interest rates** are annual rates (divide by seconds per year for per-second)

---

**Document Version:** 1.0
**Last Updated:** 2026-01-18
**Maintainer:** Development Team
