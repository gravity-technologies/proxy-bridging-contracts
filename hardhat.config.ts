import { HardhatUserConfig, task } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import '@openzeppelin/hardhat-upgrades';

import "./tasks";

const config: HardhatUserConfig = {
  paths: {
    sources: "./contracts",
  },
  solidity: "0.8.24",
  networks: {
    localhost: {
      url: "http://localhost:8545",
      accounts: [
        "0xe131bc3f481277a8f73d680d9ba404cc6f959e64296e0914dded403030d4f705", // L1 operator, ETH & DAI rich
        "0x3eb15da85647edd9a1159a4a13b9e7c56877c4eb33f614546d4db06a51868b1c" // deployer
      ]
    },
    sepolia: {
      url: `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: [],
    },
  }
};

task("check-balance", "Checks the ERC20 balance of an account")
  .addParam("token", "The ERC20 token contract address")
  .addParam("account", "The account address")
  .setAction(async (taskArgs, hre) => {
    const tokenAddress = taskArgs.token;
    const accountAddress = taskArgs.account;

    const ERC20_ABI = [
      // The ERC20 Contract ABI, which is a list of functions and events of the contract
      "function balanceOf(address owner) view returns (uint256)",
    ];

    const provider = hre.ethers.provider;
    const tokenContract = new hre.ethers.Contract(tokenAddress, ERC20_ABI, provider);

    const balance = await tokenContract.balanceOf(accountAddress);

    console.log(`Balance of account ${accountAddress}: ${hre.ethers.formatUnits(balance, 18)} tokens`);
  });

export default config;
