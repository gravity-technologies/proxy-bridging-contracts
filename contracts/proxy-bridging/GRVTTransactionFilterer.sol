pragma solidity ^0.8.20;

import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ITransactionFilterer} from "../../lib/era-contracts/l1-contracts/contracts/state-transition/chain-interfaces/ITransactionFilterer.sol";

contract GRVTTransactionFilterer is ITransactionFilterer, AccessControlUpgradeable {
  bytes32 public constant L2_TX_SENDER_ROLE = keccak256("L2_TX_SENDER_ROLE");

  /**
   * @dev Initializes the contract by setting up AccessControl and granting the admin role
   * @param defaultAdmin The address to be granted the DEFAULT_ADMIN_ROLE
   */
  function initialize(address defaultAdmin) external initializer {
    __AccessControl_init();

    _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
  }

  /**
   * @dev Checks if a transaction is allowed by verifying if the sender has the DEFAULT_ADMIN_ROLE
   * @param sender The address initiating the transaction
   * @return bool True if sender has DEFAULT_ADMIN_ROLE, false otherwise
   */
  function isTransactionAllowed(
    address sender,
    address,
    uint256,
    uint256,
    bytes memory,
    address
  ) external view override returns (bool) {
    return hasRole(L2_TX_SENDER_ROLE, sender);
  }
}
