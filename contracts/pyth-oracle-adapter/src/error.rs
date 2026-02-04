//! Error types for the Pyth oracle adapter contract.

use cosmwasm_std::{Decimal, StdError};
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("{0}")]
    Types(#[from] stone_types::ContractError),

    /// Price feed not configured for the given denom.
    #[error("Price feed not configured for denom: {denom}")]
    PriceFeedNotConfigured { denom: String },

    /// Negative or zero price returned by Pyth.
    #[error("Negative or zero price for denom: {denom}")]
    NegativeOrZeroPrice { denom: String },

    /// Confidence interval too high relative to price.
    #[error("Confidence too high for {denom}: ratio {confidence_ratio} exceeds max {max_allowed}")]
    ConfidenceTooHigh {
        denom: String,
        confidence_ratio: Decimal,
        max_allowed: Decimal,
    },

    /// Invalid timestamp from Pyth.
    #[error("Invalid timestamp from Pyth")]
    InvalidTimestamp,

    /// Price is stale (for future use at market layer).
    #[error("Price is stale for denom: {denom}")]
    PriceStale { denom: String },

    /// Invalid feed ID format.
    #[error("Invalid feed ID: {feed_id}")]
    InvalidFeedId { feed_id: String },

    /// Exponent out of supported range.
    #[error("Exponent out of range: {expo}")]
    ExponentOutOfRange { expo: i32 },

    /// Arithmetic overflow during price conversion.
    #[error("Arithmetic overflow")]
    Overflow,

    /// Unauthorized access.
    #[error("Unauthorized")]
    Unauthorized,

    /// No pending ownership transfer exists.
    #[error("Pending ownership transfer not set")]
    PendingOwnerNotSet,

    /// Caller is not the pending owner.
    #[error("Not the pending owner")]
    NotPendingOwner,
}

pub type ContractResult<T> = Result<T, ContractError>;
