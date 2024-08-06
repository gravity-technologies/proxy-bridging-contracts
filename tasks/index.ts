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
  .addParam("token", "The token address", "0xf7CF188E93fed132475A24c8a22EAAd7785232e8")
  .addParam("amount", "The amount to bridge", "100000000000")
  .addParam("bridgeProxyAddress", "The address of the bridge proxy")
  .addParam("operatorPrivateKey", "The private key of the operator")
  .addParam("approverPrivateKey", "The private key of the approver")
  .addOptionalParam("deadline", "The deposit deadline")
  .addOptionalParam("to", "The address of the L2 receiver")
  .addOptionalParam("skipApprove", "Skip approve")
  .setAction(async (taskArgs, hre) => {
    const { token, amount, bridgeProxyAddress, deadline, approverPrivateKey, operatorPrivateKey, to, skipApprove } = taskArgs
    const operator = new hre.ethers.Wallet(operatorPrivateKey, hre.ethers.provider);

    const tokenAbi = ["function approve(address _spender, uint _value) public"]

    const l2Receiver = to || operator.address
    const ddl = deadline || Math.floor(Date.now() / 1000) + 3600 * 24

    if (!skipApprove) {
      const tokenContract = new hre.ethers.Contract(token, tokenAbi, operator)
      await txConfirmation(tokenContract.approve(bridgeProxyAddress, 0))
      await txConfirmation(tokenContract.approve(bridgeProxyAddress, amount))
      console.log(`GRVTBridgeProxy approved to spend ${amount} tokens at ${token}: `)
    }

    const bridgeProxy = await hre.ethers.getContractAt("GRVTBridgeProxy", bridgeProxyAddress, operator)
    await (await bridgeProxy.addAllowedToken(token)).wait()
    console.log(`Allowed token ${token} added to GRVTBridgeProxy.`)

    const sig = await generateSignature({
      l1Sender: operator.address,
      l2Receiver: l2Receiver,
      l1Token: token,
      amount: amount,
      deadline: ddl,
      wallet: new hre.ethers.Wallet(approverPrivateKey),
      chainId: (await hre.ethers.provider.getNetwork()).chainId,
    })

    console.log(
      "Bridge transaction: ",
      await (
        await bridgeProxy.deposit(l2Receiver, token, amount, ddl, sig.v, sig.r, sig.s, {
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
