// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ITransactionFilterer} from "../../lib/era-contracts/l1-contracts/contracts/state-transition/chain-interfaces/ITransactionFilterer.sol";
import {IL2Bridge} from "../../lib/era-contracts/l1-contracts/contracts/bridge/interfaces/IL2Bridge.sol";

/**
 * @title GRVTTransactionFilterer
 * @dev This contract ensures that only L1 -> L2 transactions initiated by the GRVTBridgeProxy are processed.
 */
contract GRVTTransactionFilterer is OwnableUpgradeable, ITransactionFilterer {
  event Initialized(address l1SharedBridge, address l2Bridge, address grvtBridgeProxy, address owner);
  event L1SharedBridgeUpdated(address oldAddress, address newAddress);
  event L2BridgeUpdated(address oldAddress, address newAddress);
  event GRVTBridgeProxyUpdated(address oldAddress, address newAddress);

  address public l1SharedBridge;
  address public l2Bridge;
  address public grvtBridgeProxy;

  /**
   * @dev Initializes the contract setting the initial bridge addresses and owner.
   * @param _l1SharedBridge The address of the L1 shared bridge.
   * @param _l2Bridge The address of the L2 bridge.
   * @param _grvtBridgeProxy The address of the GRVTBridgeProxy.
   * @param _owner The address of the owner of this contract.
   */
  function initialize(
    address _l1SharedBridge,
    address _l2Bridge,
    address _grvtBridgeProxy,
    address _owner
  ) external initializer {
    require(_l1SharedBridge != address(0), "Invalid L1 shared bridge address");
    require(_l2Bridge != address(0), "Invalid L2 bridge address");
    require(_grvtBridgeProxy != address(0), "Invalid GRVTBridgeProxy address");
    require(_owner != address(0), "Invalid owner address");

    l1SharedBridge = _l1SharedBridge;
    l2Bridge = _l2Bridge;
    grvtBridgeProxy = _grvtBridgeProxy;

    _transferOwnership(_owner);

    emit Initialized(_l1SharedBridge, _l2Bridge, _grvtBridgeProxy, _owner);
  }

  /**
   * @dev Updates the L1 shared bridge address.
   * @param _l1SharedBridge The new address of the L1 shared bridge.
   */
  function setL1SharedBridge(address _l1SharedBridge) external onlyOwner {
    require(_l1SharedBridge != address(0), "Invalid L1 shared bridge address");
    address oldAddress = l1SharedBridge;
    l1SharedBridge = _l1SharedBridge;
    emit L1SharedBridgeUpdated(oldAddress, _l1SharedBridge);
  }

  /**
   * @dev Updates the L2 bridge address.
   * @param _l2Bridge The new address of the L2 bridge.
   */
  function setL2Bridge(address _l2Bridge) external onlyOwner {
    require(_l2Bridge != address(0), "Invalid L2 bridge address");
    address oldAddress = l2Bridge;
    l2Bridge = _l2Bridge;
    emit L2BridgeUpdated(oldAddress, _l2Bridge);
  }

  /**
   * @dev Updates the GRVTBridgeProxy address.
   * @param _grvtBridgeProxy The new address of the GRVTBridgeProxy.
   */
  function setGrvtBridgeProxy(address _grvtBridgeProxy) external onlyOwner {
    require(_grvtBridgeProxy != address(0), "Invalid GRVTBridgeProxy address");
    address oldAddress = grvtBridgeProxy;
    grvtBridgeProxy = _grvtBridgeProxy;
    emit GRVTBridgeProxyUpdated(oldAddress, _grvtBridgeProxy);
  }

  /**
   * @dev Checks if a transaction is allowed based on the provided parameters.
   * @param sender The address of the sender.
   * @param contractL2 The address of the L2 contract.
   * @param l2Calldata The calldata of the L2 transaction.
   * @return A boolean indicating whether the transaction is allowed.
   */
  function isTransactionAllowed(
    address sender,
    address contractL2,
    uint256,
    uint256,
    bytes memory l2Calldata,
    address
  ) external view override returns (bool) {
    if (l2Calldata.length < 4) {
      return false;
    }

    bytes4 selector;
    assembly {
      selector := mload(add(l2Calldata, 32))
    }

    if (selector != IL2Bridge.finalizeDeposit.selector) {
      return false;
    }

    bytes memory paramsData = new bytes(l2Calldata.length - 4);
    for (uint256 i = 4; i < l2Calldata.length; i++) {
      paramsData[i - 4] = l2Calldata[i];
    }

    (address l1Sender, , , , ) = abi.decode(paramsData, (address, address, address, uint256, bytes));

    return sender == l1SharedBridge && contractL2 == l2Bridge && l1Sender == grvtBridgeProxy;
  }
}
