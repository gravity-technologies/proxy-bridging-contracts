import { task } from "hardhat/config"

import { txConfirmation, txConfirmation2, generateSignature } from "../utils"

task("grant-base-token-minter-role", "Grant the minter role to an address")
  .addParam("baseToken", "The address of the baseToken")
  .addParam("to", "The address to grant the minter role to")
  .setAction(async (taskArgs, hre) => {
    const { baseToken, to } = taskArgs
    const [operator] = await hre.ethers.getSigners()

    const baseTokenContract = await hre.ethers.getContractAt("GRVTBaseToken", baseToken, operator)

    await txConfirmation2(baseTokenContract.grantRole(hre.ethers.keccak256(hre.ethers.toUtf8Bytes("MINTER_ROLE")), to))
  })

task("base-token", "Get base token of chain")
  .addParam("chainId", "Chain ID")
  .addParam("bridgeHub", "bridgeHub address")
  .setAction(async (taskArgs, hre) => {
    const { chainId, bridgeHub } = taskArgs
    const [operator] = await hre.ethers.getSigners()

    const bhAbi = ["function baseToken(uint256 _chainId) external returns (address)"]

    const bh = new hre.ethers.Contract(bridgeHub, bhAbi, operator)
    console.log(await (await bh.baseToken(chainId)).wait())
  })

task("bridge-erc20", "Bridge ERC20 tokens")
  .addParam("token", "The token address", "0xD9Af0306B61cc6736c1599160f2F645ad600451B")
  .addParam("amount", "The amount to bridge", "50000000")
  .addParam("deadline", "The deposit deadline", "20000000124")
  .addParam("bridgeProxyAddress", "The address of the bridge proxy")
  .addParam("approverPrivateKey", "The private key of the approver")
  .setAction(async (taskArgs, hre) => {
    const { token, amount, bridgeProxyAddress, deadline, approverPrivateKey } = taskArgs
    const [operator] = await hre.ethers.getSigners()

    const tokenAbi = ["function approve(address _spender, uint _value) public"]

    const tokenContract = new hre.ethers.Contract(token, tokenAbi, operator)

    await txConfirmation(tokenContract.approve(bridgeProxyAddress, 0))
    await txConfirmation(tokenContract.approve(bridgeProxyAddress, amount))
    console.log(`GRVTBridgeProxy approved to spend ${amount} tokens at ${token}: `)

    const bridgeProxy = await hre.ethers.getContractAt("GRVTBridgeProxy", bridgeProxyAddress)
    await (await bridgeProxy.addAllowedToken(token)).wait()
    console.log(`Allowed token ${token} added to GRVTBridgeProxy.`)

    const sig = await generateSignature({
      l1Sender: operator.address,
      l2Receiver: operator.address,
      l1Token: token,
      amount: amount,
      deadline: deadline,
      wallet: new hre.ethers.Wallet(approverPrivateKey),
      chainId: (await hre.ethers.provider.getNetwork()).chainId
    })

    console.log(
      "Bridge transaction: ",
      await (
        await bridgeProxy.deposit(operator.address, token, amount, deadline, sig.v, sig.r, sig.s, {
          gasLimit: 2900000,
        })
      ).wait()
    )
  })

task("mint-base-l2", "Bridge base tokens")
  .addParam("amount", "The amount to bridge", "10000000000000000000000")
  .addParam("bridgeProxyAddress", "The address of the bridge proxy")
  .setAction(async (taskArgs, hre) => {
    const { amount, bridgeProxyAddress } = taskArgs
    const [operator] = await hre.ethers.getSigners()

    const bridgeProxy = await hre.ethers.getContractAt("GRVTBridgeProxy", bridgeProxyAddress)

    const tx = await (await bridgeProxy.mintBaseTokenL2(operator.address, amount)).wait()

    console.log("Bridge transaction: ", tx)
  })
