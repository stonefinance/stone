//! Pyth oracle adapter contract for Stone Finance.
//!
//! This contract wraps the Pyth oracle and implements Stone's OracleQueryMsg interface,
//! allowing markets to query prices from Pyth price feeds.

#[cfg(not(feature = "library"))]
pub mod contract;
pub mod error;
pub mod msg;
pub mod pyth_types;
pub mod state;

pub use error::ContractError;
