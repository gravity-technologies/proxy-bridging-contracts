// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract MockUSDT is ERC20Burnable {
  constructor(uint256 initialSupply, address owner) ERC20("Tether USD", "USDT") {
    _mint(owner, initialSupply);
  }
}
