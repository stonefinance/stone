use cosmwasm_std::{
    CheckedFromRatioError, CheckedMultiplyFractionError, CheckedMultiplyRatioError,
    DivideByZeroError, OverflowError, StdError,
};
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("{0}")]
    Types(#[from] stone_types::ContractError),

    #[error("{0}")]
    Overflow(#[from] OverflowError),

    #[error("{0}")]
    DivideByZero(#[from] DivideByZeroError),

    #[error("{0}")]
    CheckedMultiplyRatio(#[from] CheckedMultiplyRatioError),

    #[error("{0}")]
    CheckedMultiplyFraction(#[from] CheckedMultiplyFractionError),

    #[error("{0}")]
    CheckedFromRatio(#[from] CheckedFromRatioError),

    #[error("Unauthorized")]
    Unauthorized,

    #[error("Market is disabled")]
    MarketDisabled,

    #[error("Zero amount not allowed")]
    ZeroAmount,

    #[error("Wrong denom sent: expected {expected}, got {got}")]
    WrongDenom { expected: String, got: String },

    #[error("No funds sent")]
    NoFundsSent,

    #[error("Borrow would exceed LTV limit: max {max_borrow}, requested {requested}")]
    ExceedsLtv {
        max_borrow: String,
        requested: String,
    },

    #[error("Insufficient collateral for withdrawal: health factor would be {health_factor}")]
    InsufficientCollateral { health_factor: String },

    #[error("Insufficient liquidity: available {available}, requested {requested}")]
    InsufficientLiquidity {
        available: String,
        requested: String,
    },

    #[error("Supply cap exceeded: cap {cap}, would be {would_be}")]
    SupplyCapExceeded { cap: String, would_be: String },

    #[error("Borrow cap exceeded: cap {cap}, would be {would_be}")]
    BorrowCapExceeded { cap: String, would_be: String },

    #[error("Position is not liquidatable: health factor is {health_factor}")]
    NotLiquidatable { health_factor: String },

    #[error("No debt to repay")]
    NoDebt,

    #[error("No supply to withdraw")]
    NoSupply,

    #[error("No collateral to withdraw")]
    NoCollateral,

    #[error("LTV update cooldown not elapsed: {remaining_seconds} seconds remaining")]
    LtvCooldownNotElapsed { remaining_seconds: u64 },

    #[error("LTV change exceeds maximum of 5%: current {current}, requested {requested}")]
    LtvChangeExceedsMax { current: String, requested: String },

    #[error("Market is immutable: LTV cannot be changed")]
    MarketImmutable,

    #[error("Curator fee exceeds maximum of 25%")]
    CuratorFeeExceedsMax,

    #[error("Invalid LTV: must be less than liquidation threshold and between 1% and 95%")]
    InvalidLtv,

    #[error("Oracle query failed for {denom}: {reason}")]
    OracleError { denom: String, reason: String },

    #[error("Oracle price is stale for {denom}: age={age_seconds}s, max={max_staleness}s")]
    OraclePriceStale {
        denom: String,
        age_seconds: u64,
        max_staleness: u64,
    },

    #[error("Oracle price is zero for {denom}")]
    OracleZeroPrice { denom: String },
}

pub type ContractResult<T> = Result<T, ContractError>;
