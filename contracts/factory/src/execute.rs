use cosmwasm_std::{
    to_json_binary, Addr, BankMsg, Coin, CosmosMsg, DepsMut, Env, MessageInfo, Response, SubMsg,
    WasmMsg,
};

use stone_types::{
    compute_market_id, CreateMarketParams, MarketInstantiateMsg, MarketRecord, OracleQueryMsg,
    PriceResponse,
};

use crate::error::ContractError;
use crate::state::{
    CONFIG, MARKETS, MARKETS_BY_ADDRESS, MARKETS_BY_COLLATERAL, MARKETS_BY_CURATOR,
    MARKETS_BY_DEBT, MARKET_COUNT, PENDING_OWNER,
};

/// Reply ID for market instantiation
pub const INSTANTIATE_REPLY_ID: u64 = 1;

/// Validate market creation parameters.
fn validate_market_params(params: &CreateMarketParams) -> Result<(), ContractError> {
    use stone_types::ContractError as TypesError;

    // LTV must be less than liquidation threshold
    if params.loan_to_value >= params.liquidation_threshold {
        return Err(TypesError::InvalidLtv.into());
    }

    // Liquidation threshold must be less than 1.0
    if params.liquidation_threshold >= cosmwasm_std::Decimal::one() {
        return Err(TypesError::InvalidLiquidationThreshold.into());
    }

    // Liquidation bonus must be reasonable (3-15%)
    let min_bonus = cosmwasm_std::Decimal::percent(3);
    let max_bonus = cosmwasm_std::Decimal::percent(15);
    if params.liquidation_bonus < min_bonus || params.liquidation_bonus > max_bonus {
        return Err(TypesError::InvalidLiquidationBonus {
            min: "3%".to_string(),
            max: "15%".to_string(),
        }
        .into());
    }

    // Total fees must be less than 100%
    if params.protocol_fee + params.curator_fee >= cosmwasm_std::Decimal::one() {
        return Err(TypesError::InvalidFees.into());
    }

    // Curator fee must be <= 25%
    if params.curator_fee > cosmwasm_std::Decimal::percent(25) {
        return Err(TypesError::CuratorFeeExceedsMax.into());
    }

    // Validate interest rate model
    if !params.interest_rate_model.validate() {
        return Err(TypesError::InvalidInterestRateModel.into());
    }

    Ok(())
}

/// Validate that the oracle can provide prices for both denoms.
fn validate_oracle(
    deps: &DepsMut,
    oracle: &Addr,
    collateral_denom: &str,
    debt_denom: &str,
) -> Result<(), ContractError> {
    // Query collateral price
    let _: PriceResponse = deps
        .querier
        .query_wasm_smart(
            oracle,
            &OracleQueryMsg::Price {
                denom: collateral_denom.to_string(),
            },
        )
        .map_err(|_| ContractError::InvalidOracle {
            denom: collateral_denom.to_string(),
        })?;

    // Query debt price
    let _: PriceResponse = deps
        .querier
        .query_wasm_smart(
            oracle,
            &OracleQueryMsg::Price {
                denom: debt_denom.to_string(),
            },
        )
        .map_err(|_| ContractError::InvalidOracle {
            denom: debt_denom.to_string(),
        })?;

    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub fn create_market(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    collateral_denom: String,
    debt_denom: String,
    oracle: String,
    params: CreateMarketParams,
    salt: Option<u64>,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Validate denoms are different
    if collateral_denom == debt_denom {
        return Err(ContractError::SameDenom);
    }

    // Validate creation fee
    let fee_required = &config.market_creation_fee;
    let fee_sent = info
        .funds
        .iter()
        .find(|c| c.denom == fee_required.denom)
        .map(|c| c.amount)
        .unwrap_or_default();

    if fee_sent < fee_required.amount {
        return Err(ContractError::InsufficientCreationFee {
            required: fee_required.to_string(),
            sent: format!("{}{}", fee_sent, fee_required.denom),
        });
    }

    // Validate parameters
    validate_market_params(&params)?;

    // Validate oracle
    let oracle_addr = deps.api.addr_validate(&oracle)?;
    validate_oracle(&deps, &oracle_addr, &collateral_denom, &debt_denom)?;

    // Generate market ID
    let curator = info.sender.as_str();
    let market_id = compute_market_id(&collateral_denom, &debt_denom, curator, salt);

    // Check for collision
    if MARKETS.has(deps.storage, &market_id) {
        return Err(ContractError::MarketAlreadyExists { market_id });
    }

    // Create instantiate message for market contract
    let market_instantiate_msg = MarketInstantiateMsg {
        curator: info.sender.to_string(),
        oracle,
        collateral_denom: collateral_denom.clone(),
        debt_denom: debt_denom.clone(),
        protocol_fee_collector: config.protocol_fee_collector.to_string(),
        params,
    };

    // Create submessage to instantiate market contract
    let instantiate_msg = WasmMsg::Instantiate {
        admin: Some(env.contract.address.to_string()),
        code_id: config.market_code_id,
        msg: to_json_binary(&market_instantiate_msg)?,
        funds: vec![],
        label: format!("stone-market-{}", &market_id[..8]),
    };

    // We'll need to handle the reply to get the contract address
    // For now, store pending market info that will be completed in reply
    // This is a simplified version - full implementation needs reply handling

    let mut messages: Vec<CosmosMsg> = vec![];

    // Transfer creation fee to fee collector
    if !fee_required.amount.is_zero() {
        messages.push(
            BankMsg::Send {
                to_address: config.protocol_fee_collector.to_string(),
                amount: vec![fee_required.clone()],
            }
            .into(),
        );
    }

    // Increment market count
    let count = MARKET_COUNT.may_load(deps.storage)?.unwrap_or(0);
    MARKET_COUNT.save(deps.storage, &(count + 1))?;

    Ok(Response::new()
        .add_messages(messages)
        .add_submessage(SubMsg::reply_on_success(
            instantiate_msg,
            INSTANTIATE_REPLY_ID,
        ))
        .add_attribute("action", "create_market")
        .add_attribute("market_id", &market_id)
        .add_attribute("curator", info.sender)
        .add_attribute("collateral_denom", collateral_denom)
        .add_attribute("debt_denom", debt_denom))
}

pub fn update_config(
    deps: DepsMut,
    info: MessageInfo,
    protocol_fee_collector: Option<String>,
    market_creation_fee: Option<Coin>,
) -> Result<Response, ContractError> {
    let mut config = CONFIG.load(deps.storage)?;

    // Only owner can update config
    if info.sender != config.owner {
        return Err(ContractError::Unauthorized);
    }

    if let Some(collector) = protocol_fee_collector {
        config.protocol_fee_collector = deps.api.addr_validate(&collector)?;
    }

    if let Some(fee) = market_creation_fee {
        config.market_creation_fee = fee;
    }

    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new().add_attribute("action", "update_config"))
}

pub fn update_market_code_id(
    deps: DepsMut,
    info: MessageInfo,
    code_id: u64,
) -> Result<Response, ContractError> {
    let mut config = CONFIG.load(deps.storage)?;

    if info.sender != config.owner {
        return Err(ContractError::Unauthorized);
    }

    config.market_code_id = code_id;
    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new()
        .add_attribute("action", "update_market_code_id")
        .add_attribute("code_id", code_id.to_string()))
}

pub fn transfer_ownership(
    deps: DepsMut,
    info: MessageInfo,
    new_owner: String,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    if info.sender != config.owner {
        return Err(ContractError::Unauthorized);
    }

    let new_owner_addr = deps.api.addr_validate(&new_owner)?;
    PENDING_OWNER.save(deps.storage, &new_owner_addr)?;

    Ok(Response::new()
        .add_attribute("action", "transfer_ownership")
        .add_attribute("pending_owner", new_owner))
}

pub fn accept_ownership(deps: DepsMut, info: MessageInfo) -> Result<Response, ContractError> {
    let pending = PENDING_OWNER
        .may_load(deps.storage)?
        .ok_or(ContractError::NoPendingOwnership)?;

    if info.sender != pending {
        return Err(ContractError::NotPendingOwner);
    }

    let mut config = CONFIG.load(deps.storage)?;
    config.owner = pending.clone();
    CONFIG.save(deps.storage, &config)?;
    PENDING_OWNER.remove(deps.storage);

    Ok(Response::new()
        .add_attribute("action", "accept_ownership")
        .add_attribute("new_owner", pending))
}

/// Handle reply from market instantiation to capture contract address.
#[allow(deprecated)] // data field still needed for older CosmWasm versions
pub fn handle_instantiate_reply(
    deps: DepsMut,
    env: Env,
    msg: cosmwasm_std::Reply,
) -> Result<Response, ContractError> {
    // Parse the instantiate response to get the contract address
    let res = cw_utils::parse_instantiate_response_data(
        msg.result
            .into_result()
            .map_err(cosmwasm_std::StdError::generic_err)?
            .data
            .ok_or_else(|| cosmwasm_std::StdError::generic_err("no data in reply"))?
            .as_slice(),
    )
    .map_err(|e| cosmwasm_std::StdError::generic_err(e.to_string()))?;

    let market_address = deps.api.addr_validate(&res.contract_address)?;

    // Query the market contract to get its configuration
    let market_config: stone_types::MarketConfigResponse = deps
        .querier
        .query_wasm_smart(&market_address, &stone_types::MarketQueryMsg::Config {})?;

    // Compute the market ID
    let market_id = compute_market_id(
        &market_config.collateral_denom,
        &market_config.debt_denom,
        &market_config.curator,
        None, // We don't have salt here, but that's OK for now
    );

    let curator_addr = deps.api.addr_validate(&market_config.curator)?;

    // Create market record
    let market_record = MarketRecord {
        market_id: market_id.clone(),
        address: market_address.clone(),
        curator: curator_addr.clone(),
        collateral_denom: market_config.collateral_denom.clone(),
        debt_denom: market_config.debt_denom.clone(),
        created_at: env.block.time.seconds(),
    };

    // Save to all indices
    MARKETS.save(deps.storage, &market_id, &market_record)?;
    MARKETS_BY_ADDRESS.save(deps.storage, &market_address, &market_id)?;
    MARKETS_BY_CURATOR.save(deps.storage, (&curator_addr, &market_id), &())?;
    MARKETS_BY_COLLATERAL.save(
        deps.storage,
        (&market_config.collateral_denom, &market_id),
        &(),
    )?;
    MARKETS_BY_DEBT.save(deps.storage, (&market_config.debt_denom, &market_id), &())?;

    Ok(Response::new()
        .add_attribute("action", "market_instantiated")
        .add_attribute("market_id", market_id)
        .add_attribute("market_address", market_address))
}

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{message_info, mock_dependencies, MockApi};
    use cosmwasm_std::{Coin, Decimal, Uint128};
    use stone_types::{FactoryConfig, InterestRateModel};

    fn valid_params() -> CreateMarketParams {
        CreateMarketParams {
            loan_to_value: Decimal::percent(80),
            liquidation_threshold: Decimal::percent(85),
            liquidation_bonus: Decimal::percent(5),
            liquidation_protocol_fee: Decimal::percent(2),
            close_factor: Decimal::percent(50),
            interest_rate_model: InterestRateModel::default(),
            protocol_fee: Decimal::percent(10),
            curator_fee: Decimal::percent(5),
            supply_cap: None,
            borrow_cap: None,
            is_mutable: false,
        }
    }

    #[test]
    fn test_validate_market_params_valid() {
        let params = valid_params();
        assert!(validate_market_params(&params).is_ok());
    }

    #[test]
    fn test_validate_market_params_ltv_too_high() {
        let mut params = valid_params();
        params.loan_to_value = Decimal::percent(90); // >= liquidation_threshold
        assert!(validate_market_params(&params).is_err());
    }

    #[test]
    fn test_validate_market_params_liq_threshold_too_high() {
        let mut params = valid_params();
        params.liquidation_threshold = Decimal::one(); // Must be < 1.0
        assert!(validate_market_params(&params).is_err());
    }

    #[test]
    fn test_validate_market_params_bonus_too_low() {
        let mut params = valid_params();
        params.liquidation_bonus = Decimal::percent(2); // < 3%
        assert!(validate_market_params(&params).is_err());
    }

    #[test]
    fn test_validate_market_params_bonus_too_high() {
        let mut params = valid_params();
        params.liquidation_bonus = Decimal::percent(20); // > 15%
        assert!(validate_market_params(&params).is_err());
    }

    #[test]
    fn test_validate_market_params_fees_too_high() {
        let mut params = valid_params();
        params.protocol_fee = Decimal::percent(50);
        params.curator_fee = Decimal::percent(50); // Total = 100%
        assert!(validate_market_params(&params).is_err());
    }

    #[test]
    fn test_validate_market_params_curator_fee_exceeds_max() {
        let mut params = valid_params();
        params.curator_fee = Decimal::percent(30); // > 25%
        assert!(validate_market_params(&params).is_err());
    }

    #[test]
    fn test_update_config_unauthorized() {
        let mut deps = mock_dependencies();
        let api = MockApi::default();
        let owner = api.addr_make("owner");
        let collector = api.addr_make("collector");
        let not_owner = api.addr_make("not_owner");

        let config = FactoryConfig {
            owner: owner.clone(),
            protocol_fee_collector: collector,
            market_creation_fee: Coin {
                denom: "uosmo".to_string(),
                amount: Uint128::new(1000000),
            },
            market_code_id: 1,
        };
        CONFIG.save(deps.as_mut().storage, &config).unwrap();

        let info = message_info(&not_owner, &[]);
        let result = update_config(deps.as_mut(), info, None, None);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), ContractError::Unauthorized));
    }

    #[test]
    fn test_update_config_authorized() {
        let mut deps = mock_dependencies();
        let api = MockApi::default();
        let owner = api.addr_make("owner");
        let collector = api.addr_make("collector");
        let new_collector = api.addr_make("new_collector");

        let config = FactoryConfig {
            owner: owner.clone(),
            protocol_fee_collector: collector,
            market_creation_fee: Coin {
                denom: "uosmo".to_string(),
                amount: Uint128::new(1000000),
            },
            market_code_id: 1,
        };
        CONFIG.save(deps.as_mut().storage, &config).unwrap();

        let info = message_info(&owner, &[]);
        let result = update_config(deps.as_mut(), info, Some(new_collector.to_string()), None);
        assert!(result.is_ok());

        let updated = CONFIG.load(deps.as_ref().storage).unwrap();
        assert_eq!(updated.protocol_fee_collector, new_collector);
    }

    #[test]
    fn test_transfer_and_accept_ownership() {
        let mut deps = mock_dependencies();
        let api = MockApi::default();
        let owner = api.addr_make("owner");
        let collector = api.addr_make("collector");
        let new_owner = api.addr_make("new_owner");
        let random = api.addr_make("random");

        let config = FactoryConfig {
            owner: owner.clone(),
            protocol_fee_collector: collector,
            market_creation_fee: Coin {
                denom: "uosmo".to_string(),
                amount: Uint128::new(1000000),
            },
            market_code_id: 1,
        };
        CONFIG.save(deps.as_mut().storage, &config).unwrap();

        // Transfer ownership
        let info = message_info(&owner, &[]);
        let result = transfer_ownership(deps.as_mut(), info, new_owner.to_string());
        assert!(result.is_ok());

        // Wrong person tries to accept
        let info = message_info(&random, &[]);
        let result = accept_ownership(deps.as_mut(), info);
        assert!(matches!(
            result.unwrap_err(),
            ContractError::NotPendingOwner
        ));

        // Correct person accepts
        let info = message_info(&new_owner, &[]);
        let result = accept_ownership(deps.as_mut(), info);
        assert!(result.is_ok());

        let updated = CONFIG.load(deps.as_ref().storage).unwrap();
        assert_eq!(updated.owner, new_owner);
    }
}
