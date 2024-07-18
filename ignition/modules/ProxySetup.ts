import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

import {ethers} from "ethers"  ;

import GRVTBaseToken from "./GRVTBaseToken";
import GRVTBridgeProxy from "./GRVTBridgeProxy";

// This module can only be used by the base token admin
const ProxySetup = buildModule("ProxySetup", (m) => {
    const { baseToken: baseTokenProxy } = m.useModule(GRVTBaseToken);
    const { bridgeProxy: bridgeProxyProxy } = m.useModule(GRVTBridgeProxy);
    
    const baseToken = m.contractAt("GRVTBaseToken", baseTokenProxy);
    const bridgeProxy = m.contractAt("GRVTBridgeProxy", bridgeProxyProxy);
    const governanceAddress = m.getParameter("governanceAddress");
    const l1SharedBridge = m.getParameter("l1SharedBridge");

    const mintAmount = BigInt("0x0000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

    const mint = m.call(baseToken, "mint", [
        governanceAddress,
        mintAmount
    ]);

    // Grant the minter role to the bridge proxy
    const grantRole = m.call(baseToken, "grantRole", [
        ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE")),
        bridgeProxy
    ], {after: [mint]});
    
    m.call(bridgeProxy, "approveBaseToken", [
        l1SharedBridge,
        ethers.MaxUint256
    ], {after: [grantRole]});


    return { bridgeProxy, baseToken };
});

export default ProxySetup;
