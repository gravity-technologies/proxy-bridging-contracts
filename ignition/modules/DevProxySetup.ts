import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

import {ethers} from "ethers"  ;

import GRVTBaseToken from "./GRVTBaseToken";
import GRVTBridgeProxy from "./GRVTBridgeProxy";
import GRVTTransactionFilterer from "./GRVTTransactionFilterer";

// This module can only be used by the base token admin
const DevProxySetup = buildModule("DevProxySetup", (m) => {
    const { baseToken: baseTokenProxy } = m.useModule(GRVTBaseToken);
    const { bridgeProxy: bridgeProxyProxy } = m.useModule(GRVTBridgeProxy);
    const { txFilterer: txFiltererProxy } = m.useModule(GRVTTransactionFilterer);
    
    const baseToken = m.contractAt("GRVTBaseToken", baseTokenProxy);
    const bridgeProxy = m.contractAt("GRVTBridgeProxy", bridgeProxyProxy);
    const txFilterer = m.contractAt("GRVTTransactionFilterer", txFiltererProxy);

    // Grant the minter role to the bridge proxy
    m.call(baseToken, "grantRole", [
        ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE")),
        bridgeProxy
    ]);
    
    m.call(bridgeProxy, "approveBaseToken", [
        m.staticCall(txFilterer, "l1SharedBridge", []),
        ethers.MaxUint256
    ]);


    return { bridgeProxy, baseToken, txFilterer };
});

export default DevProxySetup;
