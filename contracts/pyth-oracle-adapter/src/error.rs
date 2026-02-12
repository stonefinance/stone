//! Error types for the Pyth oracle adapter contract.
//!
//! This module defines all error conditions that can occur when interacting
//! with the Pyth oracle adapter. Errors are grouped by category:
//! - Price data errors (feed configuration, price quality, etc.)
//! - Validation errors (feed ID format, confidence ratio, etc.)
//! - Authorization errors (ownership, permissions)
//! - Arithmetic errors (overflow, exponent range)

use cosmwasm_std::{Decimal, StdError};
use thiserror::Error;

/// Main error type for the Pyth oracle adapter contract.
///
/// This enum encompasses all possible error conditions. Each variant includes
/// context to help diagnose the issue.
#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    /// Wrapper for standard CosmWasm errors.
    #[error("{0}")]
    Std(#[from] StdError),

    /// Wrapper for Stone types errors.
    #[error("{0}")]
    Types(#[from] stone_types::ContractError),

    // =========================================================================
    // Price Data Errors
    // =========================================================================
    /// Price feed not configured for the given denom.
    ///
    /// Occurs when querying a price for a denom that doesn't have a
    /// configured Pyth feed ID.
    ///
    /// # Resolution
    ///
    /// Call `SetPriceFeed` with the appropriate feed ID for this denom.
    #[error("Price feed not configured for denom: {denom}")]
    PriceFeedNotConfigured { denom: String },

    /// Negative or zero price returned by Pyth.
    ///
    /// Occurs when Pyth returns a price <= 0, which is invalid for
    /// financial calculations.
    ///
    /// # Context
    ///
    /// This typically indicates a problem with the Pyth feed or the
    /// asset itself. The price should never be negative or zero for
    /// valid trading pairs.
    #[error("Negative or zero price for denom: {denom}")]
    NegativeOrZeroPrice { denom: String },

    /// Invalid price value (negative, zero, or otherwise unusable).
    ///
    /// Occurs during price conversion when the raw price cannot be
    /// converted to a Decimal.
    #[error("Invalid price: {reason}")]
    InvalidPrice { reason: String },

    /// Confidence interval too high relative to price.
    ///
    /// Occurs when the confidence/price ratio exceeds the configured
    /// `max_confidence_ratio`. This indicates high uncertainty in the
    /// price data.
    ///
    /// # Example
    ///
    /// If max_confidence_ratio is 0.01 (1%) and Pyth returns:
    /// - Price: $100
    /// - Confidence: $2 (2%)
    ///
    /// This error will be returned because 2% > 1%.
    ///
    /// # Resolution
    ///
    /// Either wait for Pyth confidence to improve, or increase
    /// max_confidence_ratio if the higher threshold is acceptable.
    #[error("Confidence too high for {denom}: ratio {confidence_ratio} exceeds max {max_allowed}")]
    ConfidenceTooHigh {
        denom: String,
        confidence_ratio: Decimal,
        max_allowed: Decimal,
    },

    /// Invalid timestamp from Pyth.
    ///
    /// Occurs when Pyth returns a negative publish_time, which cannot
    /// be converted to a u64 timestamp.
    #[error("Invalid timestamp from Pyth")]
    InvalidTimestamp,

    /// Pyth contract query failed.
    ///
    /// Occurs when the query to the Pyth contract fails, indicating
    /// either a network issue, an invalid feed ID, or a problem with
    /// the Pyth contract.
    #[error("Pyth query failed for {denom}: {reason}")]
    PythQueryFailed { denom: String, reason: String },

    // =========================================================================
    // Validation Errors
    // =========================================================================
    /// Invalid feed ID format.
    ///
    /// Occurs when a feed ID is not a valid 64-character hex string.
    /// Feed IDs must be exactly 32 bytes encoded as hex (64 characters).
    ///
    /// # Valid Formats
    ///
    /// - `b00b60f88b03a6a625a8d1c048c3f66653edf217439983d037e7222c4e612819`
    /// - `0xb00b60f88b03a6a625a8d1c048c3f66653edf217439983d037e7222c4e612819`
    #[error("Invalid feed ID: {feed_id}")]
    InvalidFeedId { feed_id: String },

    /// Duplicate denom in price feeds list.
    ///
    /// Occurs during instantiation if the same denom appears multiple
    /// times in the price_feeds list.
    #[error("Duplicate denom in price feeds: {denom}")]
    DuplicateDenom { denom: String },

    /// Invalid confidence ratio value.
    ///
    /// Occurs when max_confidence_ratio is set to 0 or greater than 1.
    /// The ratio must be in the range (0, 1].
    ///
    /// # Valid Values
    ///
    /// - 0.001 (0.1%) - Very strict, for stablecoins
    /// - 0.01 (1%) - Standard for major assets
    /// - 0.05 (5%) - Lenient for volatile altcoins
    #[error("Invalid confidence ratio: {value} - {reason}")]
    InvalidConfidenceRatio { value: Decimal, reason: String },

    /// Exponent out of supported range.
    ///
    /// Occurs when Pyth returns a price with |exponent| > 18.
    /// Decimal only supports up to 18 decimal places.
    #[error("Exponent out of range: {expo}")]
    ExponentOutOfRange { expo: i32 },

    // =========================================================================
    // Arithmetic Errors
    // =========================================================================
    /// Arithmetic overflow during price conversion.
    ///
    /// Occurs when converting a Pyth price to Decimal would overflow
    /// the underlying u128 representation.
    #[error("Arithmetic overflow")]
    Overflow,

    // =========================================================================
    // Authorization Errors
    // =========================================================================
    /// Unauthorized access.
    ///
    /// Occurs when a non-owner attempts to perform an owner-only operation
    /// such as setting price feeds, updating config, or initiating ownership
    /// transfer.
    #[error("Unauthorized")]
    Unauthorized,

    /// No pending ownership transfer exists.
    ///
    /// Occurs when `AcceptOwnership` is called but no ownership transfer
    /// has been initiated via `TransferOwnership`.
    #[error("Pending ownership transfer not set")]
    PendingOwnerNotSet,

    /// Caller is not the pending owner.
    ///
    /// Occurs when `AcceptOwnership` is called by an address other than
    /// the one set as pending owner.
    #[error("Not the pending owner")]
    NotPendingOwner,
}

/// Type alias for contract results.
///
/// Use this type for all functions that can return a `ContractError`.
pub type ContractResult<T> = Result<T, ContractError>;
