#!/bin/bash

# Check if the correct number of parameters is passed
if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <env_file_suffix>"
    exit 1
fi

# Load the environment variables from the specified env file
source "$ZKSYNC_HOME/etc/env/target/$1.env"

# Render the JSON template with the environment variables
json_content=$(cat <<EOF
{
    "GRVTBridgeProxy": {
        "l2ChainID": $CHAIN_ETH_ZKSYNC_NETWORK_ID,
        "bridgeHubAddress": "$CONTRACTS_BRIDGEHUB_PROXY_ADDR",
        "ownerAddress": "0x2d82f718Bba4431CD334861b170e114119f2e8D0",
        "upgradableProxyAdminOwnerAddress": "0xA3d88BfE81E9028E20303224D2cB7035F783F4A2",
        "depositApproverAddress": "0x2d82f718Bba4431CD334861b170e114119f2e8D0"
    },
    "GRVTTransactionFilterer": {
        "l1SharedBridge": "$CONTRACTS_L1_SHARED_BRIDGE_PROXY_ADDR",
        "l2Bridge": "$CONTRACTS_L2_SHARED_BRIDGE_ADDR",
        "ownerAddress": "0x2d82f718Bba4431CD334861b170e114119f2e8D0",
        "upgradableProxyAdminOwnerAddress": "0xA3d88BfE81E9028E20303224D2cB7035F783F4A2"
    },
    "GRVTBaseToken": {
        "defaultAdmin": "0x2d82f718Bba4431CD334861b170e114119f2e8D0",
        "upgradableProxyAdminOwnerAddress": "0xA3d88BfE81E9028E20303224D2cB7035F783F4A2",
        "operator": "0x2d82f718Bba4431CD334861b170e114119f2e8D0",
        "l1SharedBridge": "$CONTRACTS_L1_SHARED_BRIDGE_PROXY_ADDR"
    },
    "ProxySetup": {
        "governanceAddress": "$CONTRACTS_GOVERNANCE_ADDR"
    }
}
EOF
)

# Write the rendered JSON content to the specified output path
output_path="ignition/dev_grvt.parameters.json"
echo "$json_content" > "$output_path"

echo "JSON file has been written to $output_path"
