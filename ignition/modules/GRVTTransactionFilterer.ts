import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import GRVTBridgeProxy from "./GRVTBridgeProxy";
import { ethers } from "ethers";


const GRVTTransactionFilterer = buildModule("GRVTTransactionFilterer", (m) => {
    const ownerAddress = m.getParameter("ownerAddress");
    const upgradableProxyAdminOwnerAddress = m.getParameter("upgradableProxyAdminOwnerAddress");

    const { bridgeProxy } = m.useModule(GRVTBridgeProxy);

    const txFiltererImpl = m.contract("GRVTTransactionFilterer");
    const txFiltererProxy = m.contract("TransparentUpgradeableProxy", [
        txFiltererImpl,
        upgradableProxyAdminOwnerAddress,
        m.encodeFunctionCall(txFiltererImpl, "initialize", [ownerAddress]),
    ], {});

    const txFilterer = m.contractAt("GRVTTransactionFilterer", txFiltererProxy, { id: "GRVTTransactionFiltererContract" });
    m.call(txFilterer, "grantRole", [
        ethers.keccak256(ethers.toUtf8Bytes("L2_TX_SENDER_ROLE")),
        bridgeProxy
    ]);

    const proxyAdminAddress = m.readEventArgument(
        txFiltererProxy,
        "AdminChanged",
        "newAdmin"
    );

    const proxyAdmin = m.contractAt("ProxyAdmin", proxyAdminAddress);

    return { proxyAdmin, txFilterer: txFilterer };
});

export default GRVTTransactionFilterer;