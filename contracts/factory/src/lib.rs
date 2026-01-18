#[cfg(not(feature = "library"))]
pub mod contract;
mod error;
mod execute;
mod query;
mod state;

pub use error::ContractError;
pub use state::*;
