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
        "ownerAddress": "0x52312AD6f01657413b2eaE9287f6B9ADaD93D5FE",
        "upgradableProxyAdminOwnerAddress": "0xF8A3188d179133204bFE984d5275D926D140953b",
        "depositApproverAddress": "0x52312AD6f01657413b2eaE9287f6B9ADaD93D5FE"
    },
    "GRVTTransactionFilterer": {
        "l1SharedBridge": "$CONTRACTS_L1_SHARED_BRIDGE_PROXY_ADDR",
        "l2Bridge": "$CONTRACTS_L2_SHARED_BRIDGE_ADDR",
        "ownerAddress": "0x52312AD6f01657413b2eaE9287f6B9ADaD93D5FE",
        "upgradableProxyAdminOwnerAddress": "0xF8A3188d179133204bFE984d5275D926D140953b"
    },
    "GRVTBaseToken": {
        "defaultAdmin": "0x52312AD6f01657413b2eaE9287f6B9ADaD93D5FE",
        "upgradableProxyAdminOwnerAddress": "0xF8A3188d179133204bFE984d5275D926D140953b",
        "operator": "0x52312AD6f01657413b2eaE9287f6B9ADaD93D5FE",
        "l1SharedBridge": "$CONTRACTS_L1_SHARED_BRIDGE_PROXY_ADDR"
    }   
}
EOF
)

# Write the rendered JSON content to the specified output path
output_path="ignition/local.dev.parameters.json"
echo "$json_content" > "$output_path"

echo "JSON file has been written to $output_path"
