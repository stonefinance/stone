#[cfg(not(feature = "library"))]
pub mod contract;
mod error;
pub mod execute;
mod health;
mod interest;
mod query;
mod state;

pub use error::ContractError;
pub use state::*;
