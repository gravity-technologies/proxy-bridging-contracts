// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IL1SharedBridge} from "../../lib/era-contracts/l1-contracts/contracts/bridge/interfaces/IL1SharedBridge.sol";
import {TxStatus} from "../../lib/era-contracts/l1-contracts/contracts/common/Messaging.sol";
import {L2TransactionRequestTwoBridgesOuter, L2TransactionRequestTwoBridgesInner, L2TransactionRequestDirect} from "../../lib/era-contracts/l1-contracts/contracts/bridgehub/IBridgehub.sol";

// Assuming IL1SharedBridge and TxStatus are defined elsewhere
// interface IL1SharedBridge {}
// enum TxStatus { Pending, Completed, Failed }

// Assuming L2TransactionRequestTwoBridgesOuter is defined elsewhere
// struct L2TransactionRequestTwoBridgesOuter {}

contract MockBridgeHub {
  // Mocked return values for sharedBridge function
  IL1SharedBridge private mockSharedBridge;
  address baseToken;
  bool private proveResult;
  uint256 private l2TxBaseCost;

  // Constructor to initialize the mockSharedBridge
  constructor(IL1SharedBridge _mockSharedBridge, address _baseToken, bool _proveResult, uint256 _l2TxBaseCost) {
    mockSharedBridge = _mockSharedBridge;
    baseToken = _baseToken;
    proveResult = _proveResult;
    l2TxBaseCost = _l2TxBaseCost;
  }

  // Mock implementation of the sharedBridge function
  function sharedBridge() external view returns (IL1SharedBridge) {
    return mockSharedBridge;
  }

  // Mock implementation of the proveL1ToL2TransactionStatus function
  function proveL1ToL2TransactionStatus(
    uint256,
    bytes32,
    uint256,
    uint256,
    uint16,
    bytes32[] calldata,
    TxStatus
  ) external view returns (bool) {
    return proveResult;
  }

  function requestL2TransactionTwoBridges(
    L2TransactionRequestTwoBridgesOuter calldata _request
  ) external payable returns (bytes32 canonicalTxHash) {
    mockSharedBridge.bridgehubDepositBaseToken(_request.chainId, msg.sender, baseToken, _request.mintValue);
    IL1SharedBridge(_request.secondBridgeAddress).bridgehubDeposit{value: _request.secondBridgeValue}(
      _request.chainId,
      msg.sender,
      _request.l2Value,
      _request.secondBridgeCalldata
    );
    return 0x0000000000000000000000000000000000000000000000000000000000000001;
  }

  function requestL2TransactionDirect(
    L2TransactionRequestDirect calldata _request
  ) external payable returns (bytes32 canonicalTxHash) {
    {
      require(msg.value == 0, "Bridgehub: non-eth bridge with msg.value");
      mockSharedBridge.bridgehubDepositBaseToken{value: msg.value}(
        _request.chainId,
        msg.sender,
        baseToken,
        _request.mintValue
      );
      return 0x0000000000000000000000000000000000000000000000000000000000000002;
    }
  }

  /// @notice forwards function call to Mailbox based on ChainId
  function l2TransactionBaseCost(uint256, uint256, uint256, uint256) external view returns (uint256) {
    return l2TxBaseCost;
  }
}
