#!/bin/sh
set -ex

CHAIN_ID="stone-local-1"
MONIKER="stone-validator"
KEYRING_BACKEND="test"
HOME_DIR="/root/.wasmd"

# Check if we need to initialize (look for completed marker)
if [ ! -f "$HOME_DIR/.initialized" ]; then
    echo "=== Initializing chain ==="

    # Clean any partial state
    rm -rf "$HOME_DIR/config" "$HOME_DIR/data" "$HOME_DIR/keyring-test"

    # Initialize the chain
    wasmd init "$MONIKER" --chain-id "$CHAIN_ID" --home "$HOME_DIR"

    # Configure for fast blocks
    sed -i 's/timeout_commit = "5s"/timeout_commit = "1s"/g' "$HOME_DIR/config/config.toml"
    sed -i 's/timeout_propose = "3s"/timeout_propose = "1s"/g' "$HOME_DIR/config/config.toml"

    # Enable API and CORS
    sed -i 's/enable = false/enable = true/g' "$HOME_DIR/config/app.toml"
    sed -i 's/swagger = false/swagger = true/g' "$HOME_DIR/config/app.toml"
    sed -i 's/enabled-unsafe-cors = false/enabled-unsafe-cors = true/g' "$HOME_DIR/config/app.toml"
    sed -i 's/cors_allowed_origins = \[\]/cors_allowed_origins = ["*"]/g' "$HOME_DIR/config/config.toml"

    # Bind API to all interfaces
    sed -i 's/address = "tcp:\/\/localhost:1317"/address = "tcp:\/\/0.0.0.0:1317"/g' "$HOME_DIR/config/app.toml"

    # Create mnemonic files (standard BIP39 test mnemonics)
    printf '%s' "satisfy adjust timber high purchase tuition stool faith fine install that you unaware feed domain license impose boss human eager hat rent enjoy dawn" > /tmp/validator.mnemonic
    printf '%s' "notice oak worry limit wrap speak medal online prefer cluster roof addict wrist behave treat actual wasp year salad speed social layer crew genius" > /tmp/user1.mnemonic

    echo "=== Adding validator account ==="
    wasmd keys add validator --recover --keyring-backend "$KEYRING_BACKEND" --home "$HOME_DIR" --source /tmp/validator.mnemonic

    echo "=== Adding test user 1 ==="
    wasmd keys add test_user_1 --recover --keyring-backend "$KEYRING_BACKEND" --home "$HOME_DIR" --source /tmp/user1.mnemonic

    # Get addresses
    VALIDATOR_ADDR=$(wasmd keys show validator -a --keyring-backend "$KEYRING_BACKEND" --home "$HOME_DIR")
    USER1_ADDR=$(wasmd keys show test_user_1 -a --keyring-backend "$KEYRING_BACKEND" --home "$HOME_DIR")

    echo "Validator: $VALIDATOR_ADDR"
    echo "User 1: $USER1_ADDR"

    # Clean up mnemonic files
    rm -f /tmp/*.mnemonic

    echo "=== Adding genesis accounts ==="
    # Note: Default staking denom is 'stake' not 'ustake'
    wasmd genesis add-genesis-account "$VALIDATOR_ADDR" 1000000000000stake,1000000000000ustone,1000000000000uusdc --home "$HOME_DIR"
    wasmd genesis add-genesis-account "$USER1_ADDR" 1000000000000stake,1000000000000ustone,1000000000000uatom,1000000000000uusdc --home "$HOME_DIR"

    echo "=== Creating genesis transaction ==="
    wasmd genesis gentx validator 100000000stake --chain-id "$CHAIN_ID" --keyring-backend "$KEYRING_BACKEND" --home "$HOME_DIR"

    echo "=== Collecting genesis transactions ==="
    wasmd genesis collect-gentxs --home "$HOME_DIR"

    echo "=== Validating genesis ==="
    wasmd genesis validate-genesis --home "$HOME_DIR"

    # Mark as initialized
    touch "$HOME_DIR/.initialized"

    echo "=== Chain initialized successfully! ==="
fi

# Start the chain
echo "=== Starting chain ==="
exec wasmd start \
    --home "$HOME_DIR" \
    --rpc.laddr tcp://0.0.0.0:26657 \
    --api.address tcp://0.0.0.0:1317 \
    --grpc.address 0.0.0.0:9090
