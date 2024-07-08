// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {L2TransactionRequestTwoBridgesInner} from "../../lib/era-contracts/l1-contracts/contracts/bridgehub/IBridgehub.sol";

contract MockL1SharedBridge {
  using SafeERC20 for IERC20;

  bool claimSuccess;

  constructor(bool _claimSuccess) {
    claimSuccess = _claimSuccess;
  }

  function setClaimSuccess(bool _claimSuccess) external {
    claimSuccess = _claimSuccess;
  }

  function bridgehubDeposit(
    uint256,
    address _prevMsgSender,
    uint256,
    bytes calldata _data
  ) external payable returns (L2TransactionRequestTwoBridgesInner memory request) {
    (address _l1Token, uint256 _depositAmount, ) = abi.decode(_data, (address, uint256, address));
    IERC20(_l1Token).safeTransferFrom(_prevMsgSender, address(this), _depositAmount);

    request = L2TransactionRequestTwoBridgesInner({
      magicValue: "",
      l2Contract: address(0),
      l2Calldata: new bytes(0),
      factoryDeps: new bytes[](0),
      txDataHash: bytes32(0)
    });
  }

  function bridgehubDepositBaseToken(
    uint256,
    address _prevMsgSender,
    address _l1Token,
    uint256 _amount
  ) external payable {
    // The Bridgehub also checks this, but we want to be sure
    require(msg.value == 0, "ShB m.v > 0 b d.it");

    uint256 amount = _depositFunds(_prevMsgSender, IERC20(_l1Token), _amount); // note if _prevMsgSender is this contract, this will return 0. This does not happen.
    require(amount == _amount, "3T"); // The token has non-standard transfer logic
  }

  /// @dev Transfers tokens from the depositor address to the smart contract address.
  /// @return The difference between the contract balance before and after the transferring of funds.
  function _depositFunds(address _from, IERC20 _token, uint256 _amount) internal returns (uint256) {
    uint256 balanceBefore = _token.balanceOf(address(this));
    // slither-disable-next-line arbitrary-send-erc20
    _token.safeTransferFrom(_from, address(this), _amount);
    uint256 balanceAfter = _token.balanceOf(address(this));

    return balanceAfter - balanceBefore;
  }

  function claimFailedDeposit(
    uint256,
    address _depositSender,
    address _l1Token,
    uint256 _amount,
    bytes32,
    uint256,
    uint256,
    uint16,
    bytes32[] calldata
  ) external {
    require(claimSuccess, "claim failed");
    IERC20(_l1Token).safeTransfer(_depositSender, _amount);
  }
}
