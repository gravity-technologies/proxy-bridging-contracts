pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetFixedSupply.sol";

contract MockUSDT is ERC20PresetFixedSupply {
  constructor(
    uint256 initialSupply,
    address owner
  ) ERC20PresetFixedSupply("Tether USD", "USDT", initialSupply, owner) {}
}
