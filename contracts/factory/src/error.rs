use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("{0}")]
    Types(#[from] stone_types::ContractError),

    #[error("Unauthorized")]
    Unauthorized,

    #[error("Market already exists: {market_id}")]
    MarketAlreadyExists { market_id: String },

    #[error("Market not found: {market_id}")]
    MarketNotFound { market_id: String },

    #[error("Insufficient creation fee: required {required}, sent {sent}")]
    InsufficientCreationFee { required: String, sent: String },

    #[error("Invalid denom: collateral and debt must be different")]
    SameDenom,

    #[error("Invalid oracle: failed to query price for {denom}")]
    InvalidOracle { denom: String },

    #[error("Pending ownership transfer not found")]
    NoPendingOwnership,

    #[error("Not the pending owner")]
    NotPendingOwner,
}
