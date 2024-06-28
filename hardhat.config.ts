import { HardhatUserConfig, task } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import '@openzeppelin/hardhat-upgrades';

import "./tasks";

const config: HardhatUserConfig = {
  paths: {
    sources: "./contracts",
  },
  solidity: "0.8.20",
  networks: {
    localhost: {
      url: "http://localhost:8545",
      accounts: [
        "0xe131bc3f481277a8f73d680d9ba404cc6f959e64296e0914dded403030d4f705", // L1 operator, ETH & DAI rich
        "0x3eb15da85647edd9a1159a4a13b9e7c56877c4eb33f614546d4db06a51868b1c" // deployer
      ]
    }
  }
};


export default config;
