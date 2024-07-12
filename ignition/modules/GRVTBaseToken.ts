import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

import {ethers} from "ethers"  ;

const GRVTBaseToken = buildModule("GRVTBaseToken", (m) => {
    const defaultAdmin = m.getParameter("defaultAdmin");
    const upgradableProxyAdminOwnerAddress = m.getParameter("upgradableProxyAdminOwnerAddress");
    const operator = m.getParameter("operator");
    const l1SharedBridge = m.getParameter("l1SharedBridge");

    const baseTokenImpl = m.contract("GRVTBaseToken");
    const baseTokenProxy = m.contract("TransparentUpgradeableProxy", [
        baseTokenImpl,
        upgradableProxyAdminOwnerAddress,
        m.encodeFunctionCall(baseTokenImpl, "initialize", [
            defaultAdmin
        ]),
    ], {});

    const proxyAdminAddress = m.readEventArgument(
        baseTokenProxy,
        "AdminChanged",
        "newAdmin"
    );

    const proxyAdmin = m.contractAt("ProxyAdmin", proxyAdminAddress);

    const baseToken = m.contractAt("GRVTBaseToken", baseTokenProxy, {id: "baseToken"});
    const mintAmount = BigInt("0x0000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

    // Grant the minter role to the bridge proxy
    const grantRole = m.call(baseToken, "grantRole", [
        ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE")),
        operator
    ]);

    // mint a lot of base token to operator
    const mint = m.call(baseToken, "mint", [
        operator,
        mintAmount
    ], {after: [grantRole]});

    // approve l1 shared bridge spending
    m.call(baseToken, "approve", [
        l1SharedBridge,
        mintAmount
    ], {after: [mint]});

    return { proxyAdmin, baseToken: baseTokenProxy };
});

export default GRVTBaseToken;
