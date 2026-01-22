#!/bin/sh
set -e

CHAIN_ID="stone-local-1"
MONIKER="stone-validator"
KEYRING_BACKEND="test"

# Genesis accounts (mnemonics stored in test fixtures)
VALIDATOR_MNEMONIC="satisfy adjust timber high purchase tuition stool faith fine install that you unaware feed domain license impose boss human eager hat rent enjoy dawn"
TEST_USER_1_MNEMONIC="notice oak worry limit wrap speak medal online prefer cluster roof addict wrist behave treat actual wasp year salad speed social layer crew genius"
TEST_USER_2_MNEMONIC="quality vacuum hard canal turtle phrase inflict attract muscle sketch jelly eager over ten income page nation favorite captain economy dignity spend nephew exhale"

# Initialize chain if not already done
if [ ! -f /root/.wasmd/config/genesis.json ]; then
    echo "Initializing chain..."
    wasmd init $MONIKER --chain-id $CHAIN_ID

    # Configure for fast blocks
    sed -i 's/timeout_commit = "5s"/timeout_commit = "1s"/g' /root/.wasmd/config/config.toml
    sed -i 's/timeout_propose = "3s"/timeout_propose = "1s"/g' /root/.wasmd/config/config.toml

    # Enable API
    sed -i 's/enable = false/enable = true/g' /root/.wasmd/config/app.toml
    sed -i 's/swagger = false/swagger = true/g' /root/.wasmd/config/app.toml
    sed -i 's/enabled-unsafe-cors = false/enabled-unsafe-cors = true/g' /root/.wasmd/config/app.toml
    sed -i 's/cors_allowed_origins = \[\]/cors_allowed_origins = ["*"]/g' /root/.wasmd/config/config.toml

    # Add validator account
    echo "$VALIDATOR_MNEMONIC" | wasmd keys add validator --recover --keyring-backend $KEYRING_BACKEND

    # Add test user accounts
    echo "$TEST_USER_1_MNEMONIC" | wasmd keys add test_user_1 --recover --keyring-backend $KEYRING_BACKEND
    echo "$TEST_USER_2_MNEMONIC" | wasmd keys add test_user_2 --recover --keyring-backend $KEYRING_BACKEND

    # Add genesis accounts with tokens
    wasmd genesis add-genesis-account validator 1000000000000ustake,1000000000000ustone --keyring-backend $KEYRING_BACKEND
    wasmd genesis add-genesis-account test_user_1 1000000000000ustake,1000000000000ustone,1000000000000uatom,1000000000000uosmo --keyring-backend $KEYRING_BACKEND
    wasmd genesis add-genesis-account test_user_2 1000000000000ustake,1000000000000ustone,1000000000000uatom,1000000000000uosmo --keyring-backend $KEYRING_BACKEND

    # Create genesis transaction
    wasmd genesis gentx validator 100000000ustake --chain-id $CHAIN_ID --keyring-backend $KEYRING_BACKEND

    # Collect genesis transactions
    wasmd genesis collect-gentxs

    echo "Chain initialized successfully!"
fi

# Start the chain
echo "Starting chain..."
exec wasmd start --rpc.laddr tcp://0.0.0.0:26657 --api.address tcp://0.0.0.0:1317
