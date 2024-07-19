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
        "ownerAddress": "0x883aF3F53f2e27bbC139D54eAFf1b328c3A3059F",
        "upgradableProxyAdminOwnerAddress": "0x2e0C121c49F86f870354b2c7b13584f1D6EcbF43",
        "depositApproverAddress": "0xADD07D42BAd66D477a13f7687a402A6A5721CE2D"
    },
    "GRVTBaseToken": {
        "defaultAdmin": "0x883aF3F53f2e27bbC139D54eAFf1b328c3A3059F",
        "upgradableProxyAdminOwnerAddress": "0x2e0C121c49F86f870354b2c7b13584f1D6EcbF43",
        "operator": "0x883aF3F53f2e27bbC139D54eAFf1b328c3A3059F",
        "l1SharedBridge": "$CONTRACTS_L1_SHARED_BRIDGE_PROXY_ADDR"
    },
    "ProxySetup": {
        "l1SharedBridge": "$CONTRACTS_L1_SHARED_BRIDGE_PROXY_ADDR",
        "governanceAddress": "$CONTRACTS_GOVERNANCE_ADDR"
    }
}
EOF
)

# Write the rendered JSON content to the specified output path
output_path="ignition/dev_grvt.parameters.json"
echo "$json_content" > "$output_path"

echo "JSON file has been written to $output_path"
