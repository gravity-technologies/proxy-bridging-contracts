import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import GRVTBaseToken from "./GRVTBaseToken";

const GRVTBridgeProxy = buildModule("GRVTBridgeProxy", (m) => {
    const l2ChainID = m.getParameter("l2ChainID");
    const bridgeHubAddress = m.getParameter("bridgeHubAddress");
    const ownerAddress = m.getParameter("ownerAddress");
    const upgradableProxyAdminOwnerAddress = m.getParameter("upgradableProxyAdminOwnerAddress");
    const depositApproverAddress = m.getParameter("depositApproverAddress");

    const { baseToken } = m.useModule(GRVTBaseToken);

    const bridgeProxyImpl = m.contract("GRVTBridgeProxy");
    const bridgeProxy = m.contract("TransparentUpgradeableProxy", [
        bridgeProxyImpl,
        upgradableProxyAdminOwnerAddress,
        m.encodeFunctionCall(bridgeProxyImpl, "initialize", [
            l2ChainID,
            bridgeHubAddress,
            ownerAddress,
            depositApproverAddress,
            baseToken
        ]),
    ], {});

    const proxyAdminAddress = m.readEventArgument(
        bridgeProxy,
        "AdminChanged",
        "newAdmin"
    );

    const proxyAdmin = m.contractAt("ProxyAdmin", proxyAdminAddress);

    return { proxyAdmin, bridgeProxy };
});

export default GRVTBridgeProxy;
