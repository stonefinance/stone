use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("Unauthorized")]
    Unauthorized,

    #[error("Market not found: {market_id}")]
    MarketNotFound { market_id: String },

    #[error("Market already exists: {market_id}")]
    MarketAlreadyExists { market_id: String },

    #[error("Invalid denom: collateral and debt must be different")]
    SameDenom,

    #[error("Invalid LTV: must be less than liquidation threshold")]
    InvalidLtv,

    #[error("Invalid liquidation threshold: must be less than 1.0")]
    InvalidLiquidationThreshold,

    #[error("Invalid liquidation bonus: must be between {min} and {max}")]
    InvalidLiquidationBonus { min: String, max: String },

    #[error("Invalid fee: protocol_fee + curator_fee must be less than 1.0")]
    InvalidFees,

    #[error("Curator fee exceeds maximum of 25%")]
    CuratorFeeExceedsMax,

    #[error("Insufficient collateral: health factor would be {health_factor}")]
    InsufficientCollateral { health_factor: String },

    #[error("Borrow would exceed LTV limit")]
    ExceedsLtv,

    #[error("Position is not liquidatable: health factor is {health_factor}")]
    NotLiquidatable { health_factor: String },

    #[error("Insufficient liquidity: available {available}, requested {requested}")]
    InsufficientLiquidity {
        available: String,
        requested: String,
    },

    #[error("Supply cap exceeded: cap {cap}, current {current}, adding {adding}")]
    SupplyCapExceeded {
        cap: String,
        current: String,
        adding: String,
    },

    #[error("Borrow cap exceeded: cap {cap}, current {current}, adding {adding}")]
    BorrowCapExceeded {
        cap: String,
        current: String,
        adding: String,
    },

    #[error("Market is disabled")]
    MarketDisabled,

    #[error("LTV update cooldown not elapsed: {remaining_seconds} seconds remaining")]
    LtvCooldownNotElapsed { remaining_seconds: u64 },

    #[error("LTV change exceeds maximum of 5%: attempted {attempted}%")]
    LtvChangeExceedsMax { attempted: String },

    #[error("Market is immutable: LTV cannot be changed")]
    MarketImmutable,

    #[error("Invalid oracle: failed to query price for {denom}")]
    InvalidOracle { denom: String },

    #[error("Zero amount not allowed")]
    ZeroAmount,

    #[error("No debt to repay")]
    NoDebt,

    #[error("No supply to withdraw")]
    NoSupply,

    #[error("No collateral to withdraw")]
    NoCollateral,

    #[error("Insufficient creation fee: required {required}, sent {sent}")]
    InsufficientCreationFee { required: String, sent: String },

    #[error("Wrong denom sent: expected {expected}, got {got}")]
    WrongDenom { expected: String, got: String },

    #[error("Invalid interest rate model parameters")]
    InvalidInterestRateModel,
}
