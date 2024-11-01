import hre from "hardhat"
import { expect } from "chai"
import { ethers } from "ethers"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { MockL1SharedBridge, MockUSDT } from "../typechain-types"

import { generateSignature } from "../utils"

let CHAIN_ID: bigint

const TEST_AMOUNT = 100

describe("GRVTBridgeProxy", function () {
  describe("mintBaseTokenL2", function () {
    it("Should mint the amount to l2 receiver", async function () {
      CHAIN_ID = (await hre.ethers.provider.getNetwork()).chainId

      const { grvtBridgeProxy, grvtBaseToken, owner, mockL1SharedBridge } = await deployGRVTBridgeProxyFixture({
        l2TransactionBaseCost: TEST_AMOUNT,
      })

      await expect(grvtBridgeProxy.mintBaseTokenL2(owner.address, TEST_AMOUNT)).to.be.fulfilled

      expect(await grvtBaseToken.totalSupply()).to.equal(2 * TEST_AMOUNT)
      expect(await grvtBaseToken.balanceOf(mockL1SharedBridge.target)).to.equal(2 * TEST_AMOUNT)
    })

    it("Should not mint the amount to l2 receiver if caller is not owner", async function () {
      const { grvtBridgeProxy, rando } = await deployGRVTBridgeProxyFixture({ l2TransactionBaseCost: TEST_AMOUNT })

      const proxyAsRando = grvtBridgeProxy.connect(rando) as ethers.Contract

      await expect(proxyAsRando.mintBaseTokenL2(rando.address, TEST_AMOUNT)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      )
    })
  })

  describe("Deployment", function () {
    it("Should set the right initial values", async function () {
      const { grvtBridgeProxy, grvtBaseToken, owner, mockL1SharedBridge, mockBridgeHub, depositApprover } =
        await deployGRVTBridgeProxyFixture({})
      expect(await grvtBridgeProxy.chainID()).to.equal(CHAIN_ID)
      expect(await grvtBridgeProxy.bridgeHub()).to.equal(mockBridgeHub.target)
      expect(await grvtBridgeProxy.owner()).to.equal(owner.address)
      expect(await grvtBridgeProxy.depositApprover()).to.equal(depositApprover.address)
      expect(await mockBridgeHub.sharedBridge()).to.equal(mockL1SharedBridge)
      expect(await grvtBaseToken.totalSupply()).to.equal(0)
      expect(await grvtBridgeProxy.l2DepositProxyAddressDerivationParams()).to.deep.equal([
        '0x4A38dB7321b4F3f041E14c4cd63df40FE108f162',
        '0x0100010965f47574acde5c31b36ada1f247fa8a94744d0fbf7e107c014d2b90a',
        '0x3B32454F03e7aD9dE1ab6E8Ec0Dee6aBfEBD7DCC'
      ])
    })
  })

  describe("Deposit proxy address derivation", function () {
    it("Should derive the right address", async function () {
      const { grvtBridgeProxy } = await deployGRVTBridgeProxyFixture({})
      expect(await grvtBridgeProxy.getDepositProxyAddress(ethers.ZeroAddress)).to.equal(
        // queried from L2 exchange contract
        "0xEb1f6AEa4479c7fFBE26F49B8aa05F174Fe461BA"
      )
    })
  })

  describe("Deposit", function () {
    it("Should accept a deposit with valid signature", async function () {
      const { grvtBridgeProxy, grvtBaseToken, owner, depositApprover, usdt, mockL1SharedBridge } =
        await deployGRVTBridgeProxyFixture({ l2TransactionBaseCost: TEST_AMOUNT })
      await expect(testDeposit(grvtBridgeProxy, owner, depositApprover, usdt, {})).to.be.fulfilled

      expect(await usdt.balanceOf(owner.address)).to.equal(0)
      expect(await usdt.balanceOf(grvtBridgeProxy.target)).to.equal(0)
      expect(await usdt.balanceOf(mockL1SharedBridge.target)).to.equal(TEST_AMOUNT)
      expect(await grvtBaseToken.totalSupply()).to.equal(TEST_AMOUNT)
      expect(await grvtBaseToken.balanceOf(mockL1SharedBridge.target)).to.equal(TEST_AMOUNT)
    })

    it("Should accept a deposit with valid signature to another L2 address", async function () {
      const { grvtBridgeProxy, grvtBaseToken, owner, depositApprover, usdt, mockL1SharedBridge, rando } =
        await deployGRVTBridgeProxyFixture({ l2TransactionBaseCost: TEST_AMOUNT })
      await expect(
        testDeposit(grvtBridgeProxy, owner, depositApprover, usdt, {
          l2ReceiverOverride: rando.address,
        })
      ).to.be.fulfilled

      expect(await usdt.balanceOf(owner.address)).to.equal(0)
      expect(await usdt.balanceOf(grvtBridgeProxy.target)).to.equal(0)
      expect(await usdt.balanceOf(mockL1SharedBridge.target)).to.equal(TEST_AMOUNT)
      expect(await grvtBaseToken.totalSupply()).to.equal(TEST_AMOUNT)
      expect(await grvtBaseToken.balanceOf(mockL1SharedBridge.target)).to.equal(TEST_AMOUNT)
    })

    it("Should reject a deposit with expired signature", async function () {
      const { grvtBridgeProxy, owner, depositApprover, usdt } = await deployGRVTBridgeProxyFixture({})
      await expect(
        testDeposit(grvtBridgeProxy, owner, depositApprover, usdt, {
          deadline: Math.floor(Date.now() / 1000) - 30,
        })
      ).to.be.revertedWith("expired deadline")
    })

    it("Should reject a deposit with an invalid signature", async function () {
      const { grvtBridgeProxy, owner, depositApprover, usdt } = await deployGRVTBridgeProxyFixture({})
      await expect(
        testDeposit(grvtBridgeProxy, owner, depositApprover, usdt, {
          tamperSiguatureFn: ({ v, r, s }) => ({ v: v + 1, r, s }),
        })
      ).to.be.revertedWith("invalid signature")
    })

    it("Should reject a deposit with different l1Sender in signature and tx", async function () {
      const { grvtBridgeProxy, owner, depositApprover, usdt, rando } = await deployGRVTBridgeProxyFixture({})
      await expect(
        testDeposit(grvtBridgeProxy, owner, depositApprover, usdt, {
          l1SenderSignedOverride: rando.address,
        })
      ).to.be.revertedWith("invalid signature")
    })

    it("Should reject a deposit with different l2Receiver in signature and tx", async function () {
      const { grvtBridgeProxy, owner, depositApprover, usdt, rando } = await deployGRVTBridgeProxyFixture({})
      await expect(
        testDeposit(grvtBridgeProxy, owner, depositApprover, usdt, {
          l2ReceiverSignedOverride: rando.address,
        })
      ).to.be.revertedWith("invalid signature")
    })

    it("Should reject a deposit with different amount in signature and tx", async function () {
      const { grvtBridgeProxy, owner, depositApprover, usdt } = await deployGRVTBridgeProxyFixture({
        initialUsdtSupply: TEST_AMOUNT,
      })
      await expect(
        testDeposit(grvtBridgeProxy, owner, depositApprover, usdt, {
          signedAmount: TEST_AMOUNT - 1,
          approvedAmount: TEST_AMOUNT,
          depositAmount: TEST_AMOUNT,
        })
      ).to.be.revertedWith("invalid signature")
    })

    it("Should reject a deposit where msg.sender doesn't have enough token", async function () {
      const { grvtBridgeProxy, owner, depositApprover, usdt } = await deployGRVTBridgeProxyFixture({
        initialUsdtSupply: TEST_AMOUNT - 1,
      })
      await expect(
        testDeposit(grvtBridgeProxy, owner, depositApprover, usdt, {
          signedAmount: TEST_AMOUNT,
          approvedAmount: TEST_AMOUNT,
          depositAmount: TEST_AMOUNT,
        })
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance")
    })

    it("Should reject a deposit not signed by the depositApprover", async function () {
      const { grvtBridgeProxy, owner, depositApprover, usdt, rando } = await deployGRVTBridgeProxyFixture({})
      await expect(
        testDeposit(grvtBridgeProxy, owner, depositApprover, usdt, {
          depositApproverOverride: rando,
        })
      ).to.be.revertedWith("invalid signature")
    })

    it("Should reject a deposit with token not allowed", async function () {
      const { grvtBridgeProxy, owner, depositApprover, usdt } = await deployGRVTBridgeProxyFixture({})
      await expect(
        testDeposit(grvtBridgeProxy, owner, depositApprover, usdt, {
          skipAddAllowedToken: true,
        })
      ).to.be.revertedWith("L1 token not allowed")
    })

    it("Should reject a deposit without approval", async function () {
      const { grvtBridgeProxy, owner, depositApprover, usdt } = await deployGRVTBridgeProxyFixture({})
      await expect(
        testDeposit(grvtBridgeProxy, owner, depositApprover, usdt, {
          skipUSDTApprove: true,
        })
      ).to.be.revertedWith("ERC20: insufficient allowance")
    })
  })

  describe("Claim failed deposit", function () {
    it("Should claim a failed deposit as deposit sender", async function () {
      const { grvtBridgeProxy, owner, depositApprover, usdt, mockL1SharedBridge } = await deployGRVTBridgeProxyFixture(
        {}
      )

      const amount = TEST_AMOUNT
      const claimPromise = testClaimFailedDeposit(grvtBridgeProxy, owner, depositApprover, usdt, mockL1SharedBridge, {
        depositAmount: amount,
        claimAmount: amount,
      })
      await expect(claimPromise).to.be.fulfilled
      await expect(claimPromise).to.emit(grvtBridgeProxy, "ClaimedFailedDepositBridgeProxy")

      const {
        to: logTo,
        l1Token: logL1Token,
        amount: logAmount,
        sharedBridgeClaimSucceeded: logSharedBridgeClaimSucceeded,
      } = (await (await claimPromise).wait()).logs.find(
        (log: any) => log.eventName == "ClaimedFailedDepositBridgeProxy"
      ).args

      expect(logTo).to.equal(owner.address)
      expect(logL1Token).to.equal(usdt.target)
      expect(logAmount).to.equal(amount)
      expect(logSharedBridgeClaimSucceeded).to.equal(true)

      expect(await usdt.balanceOf(owner.address)).to.equal(amount)
      expect(await usdt.balanceOf(grvtBridgeProxy.target)).to.equal(0)
    })

    it("Should claim a failed deposit as someone else", async function () {
      const { grvtBridgeProxy, owner, depositApprover, usdt, mockL1SharedBridge, rando } =
        await deployGRVTBridgeProxyFixture({})

      const amount = TEST_AMOUNT
      const claimPromise = testClaimFailedDeposit(grvtBridgeProxy, owner, depositApprover, usdt, mockL1SharedBridge, {
        depositAmount: amount,
        claimAmount: amount,
        claimFailedDepositSignerOverride: rando.address,
      })
      await expect(claimPromise).to.be.fulfilled
      await expect(claimPromise).to.emit(grvtBridgeProxy, "ClaimedFailedDepositBridgeProxy")

      const {
        to: logTo,
        l1Token: logL1Token,
        amount: logAmount,
        sharedBridgeClaimSucceeded: logSharedBridgeClaimSucceeded,
      } = (await (await claimPromise).wait()).logs.find(
        (log: any) => log.eventName == "ClaimedFailedDepositBridgeProxy"
      ).args

      expect(logTo).to.equal(owner.address)
      expect(logL1Token).to.equal(usdt.target)
      expect(logAmount).to.equal(amount)
      expect(logSharedBridgeClaimSucceeded).to.equal(true)

      expect(await usdt.balanceOf(owner.address)).to.equal(amount)
      expect(await usdt.balanceOf(grvtBridgeProxy.target)).to.equal(0)
    })

    it("Should claim a failed deposit even if already claimed at shared bridge", async function () {
      const { grvtBridgeProxy, owner, depositApprover, usdt, mockL1SharedBridge } = await deployGRVTBridgeProxyFixture(
        {}
      )

      const amount = TEST_AMOUNT
      const claimPromise = testClaimFailedDeposit(grvtBridgeProxy, owner, depositApprover, usdt, mockL1SharedBridge, {
        depositAmount: amount,
        claimAmount: amount,
        simulateSharedBridgeClaim: true,
      })
      await expect(claimPromise).to.be.fulfilled
      await expect(claimPromise).to.emit(grvtBridgeProxy, "ClaimedFailedDepositBridgeProxy")

      const {
        to: logTo,
        l1Token: logL1Token,
        amount: logAmount,
        sharedBridgeClaimSucceeded: logSharedBridgeClaimSucceeded,
      } = (await (await claimPromise).wait()).logs.find(
        (log: any) => log.eventName == "ClaimedFailedDepositBridgeProxy"
      ).args

      expect(logTo).to.equal(owner.address)
      expect(logL1Token).to.equal(usdt.target)
      expect(logAmount).to.equal(amount)
      expect(logSharedBridgeClaimSucceeded).to.equal(false)

      expect(await usdt.balanceOf(owner.address)).to.equal(amount)
      expect(await usdt.balanceOf(grvtBridgeProxy.target)).to.equal(0)
    })

    it("Should reject a failed deposit claim if tx status proof failed", async function () {
      const { grvtBridgeProxy, owner, depositApprover, usdt, mockL1SharedBridge } = await deployGRVTBridgeProxyFixture({
        txProofResult: false,
      })
      await expect(
        testClaimFailedDeposit(grvtBridgeProxy, owner, depositApprover, usdt, mockL1SharedBridge, {})
      ).to.be.revertedWith("invalid proof")
    })

    it("Should reject a failed deposit claim if amount is wrong", async function () {
      const { grvtBridgeProxy, owner, depositApprover, usdt, mockL1SharedBridge } = await deployGRVTBridgeProxyFixture(
        {}
      )
      await expect(
        testClaimFailedDeposit(grvtBridgeProxy, owner, depositApprover, usdt, mockL1SharedBridge, {
          depositAmount: TEST_AMOUNT,
          claimAmount: TEST_AMOUNT + 1,
        })
      ).to.be.revertedWith("deposit did not happen")
    })

    it("Should reject a failed deposit claim if deposit sender is wrong", async function () {
      const { grvtBridgeProxy, owner, depositApprover, usdt, mockL1SharedBridge } = await deployGRVTBridgeProxyFixture(
        {}
      )
      await expect(
        testClaimFailedDeposit(grvtBridgeProxy, owner, depositApprover, usdt, mockL1SharedBridge, {
          claimDepositSenderOverride: depositApprover.address,
        })
      ).to.be.revertedWith("deposit did not happen")
    })

    it("Should reject a failed deposit claim if token is wrong", async function () {
      const { grvtBridgeProxy, owner, depositApprover, usdt, mockL1SharedBridge } = await deployGRVTBridgeProxyFixture(
        {}
      )
      await expect(
        testClaimFailedDeposit(grvtBridgeProxy, owner, depositApprover, usdt, mockL1SharedBridge, {
          claimL1TokenOverride: depositApprover.address,
        })
      ).to.be.revertedWith("deposit did not happen")
    })

    it("Should reject a failed deposit claim if tx hash is wrong", async function () {
      const { grvtBridgeProxy, owner, depositApprover, usdt, mockL1SharedBridge } = await deployGRVTBridgeProxyFixture(
        {}
      )
      await expect(
        testClaimFailedDeposit(grvtBridgeProxy, owner, depositApprover, usdt, mockL1SharedBridge, {
          depositL2TxHashOverride: ethers.keccak256(owner.address),
        })
      ).to.be.revertedWith("deposit did not happen")
    })
  })

  describe("Setters", function () {
    const testAddress = "0x0000000000000000000000000000000000000001"
    it("Should allow owner to add allowed token", async function () {
      const { grvtBridgeProxy } = await deployGRVTBridgeProxyFixture({})
      await expect(grvtBridgeProxy.addAllowedToken(testAddress))
        .to.emit(grvtBridgeProxy, "TokenAllowed")
        .withArgs(testAddress)
      expect(await grvtBridgeProxy.isTokenAllowed(testAddress)).to.be.true
    })

    it("Should not allow non-owner to add allowed token", async function () {
      const { grvtBridgeProxy, rando } = await deployGRVTBridgeProxyFixture({})

      const proxyAsRando = grvtBridgeProxy.connect(rando) as ethers.Contract
      await expect(proxyAsRando.addAllowedToken(testAddress)).to.be.revertedWith("Ownable: caller is not the owner")
    })

    it("Should allow owner to remove allowed token", async function () {
      const { grvtBridgeProxy } = await deployGRVTBridgeProxyFixture({})

      await grvtBridgeProxy.addAllowedToken(testAddress)
      await expect(grvtBridgeProxy.removeAllowedToken(testAddress))
        .to.emit(grvtBridgeProxy, "TokenDisallowed")
        .withArgs(testAddress)
      expect(await grvtBridgeProxy.isTokenAllowed(testAddress)).to.be.false
    })

    it("Should not allow non-owner to remove allowed token", async function () {
      const { grvtBridgeProxy, rando } = await deployGRVTBridgeProxyFixture({})

      await grvtBridgeProxy.addAllowedToken(testAddress)
      const proxyAsRando = grvtBridgeProxy.connect(rando) as ethers.Contract
      await expect(proxyAsRando.removeAllowedToken(testAddress)).to.be.revertedWith("Ownable: caller is not the owner")
    })

    it("Should allow owner to set BridgeHub", async function () {
      const { grvtBridgeProxy } = await deployGRVTBridgeProxyFixture({})

      await expect(grvtBridgeProxy.setBridgeHub(testAddress))
        .to.emit(grvtBridgeProxy, "BridgeHubSet")
        .withArgs(testAddress)
      expect(await grvtBridgeProxy.bridgeHub()).to.equal(testAddress)
    })

    it("Should not allow non-owner to set BridgeHub", async function () {
      const { grvtBridgeProxy, rando } = await deployGRVTBridgeProxyFixture({})

      const proxyAsRando = grvtBridgeProxy.connect(rando) as ethers.Contract
      await expect(proxyAsRando.setBridgeHub(testAddress)).to.be.revertedWith("Ownable: caller is not the owner")
    })

    it("Should allow owner to set deposit approver", async function () {
      const { grvtBridgeProxy } = await deployGRVTBridgeProxyFixture({})

      await expect(grvtBridgeProxy.setDepositApprover(testAddress))
        .to.emit(grvtBridgeProxy, "DepositApproverSet")
        .withArgs(testAddress)
      expect(await grvtBridgeProxy.depositApprover()).to.equal(testAddress)
    })

    it("Should not allow non-owner to set deposit approver", async function () {
      const { grvtBridgeProxy, rando } = await deployGRVTBridgeProxyFixture({})

      const proxyAsRando = grvtBridgeProxy.connect(rando) as ethers.Contract
      await expect(proxyAsRando.setDepositApprover(testAddress)).to.be.revertedWith("Ownable: caller is not the owner")
    })
  })
})

async function testClaimFailedDeposit(
  grvtBridgeProxy: ethers.Contract,
  owner: HardhatEthersSigner,
  depositApprover: HardhatEthersSigner,
  usdt: MockUSDT,
  mockL1SharedBridge: MockL1SharedBridge,
  {
    depositAmount = TEST_AMOUNT,
    claimAmount = TEST_AMOUNT,
    depositL2TxHashOverride = null,
    claimFailedDepositSignerOverride = null,
    claimDepositSenderOverride = null,
    claimL1TokenOverride = null,
    simulateSharedBridgeClaim = false,
  }: {
    depositAmount?: number
    claimAmount?: number
    depositL2TxHashOverride?: string | null
    claimFailedDepositSignerOverride?: string | null
    claimDepositSenderOverride?: string | null
    claimL1TokenOverride?: string | null
    simulateSharedBridgeClaim?: boolean
  }
) {
  const deadline = Math.floor(Date.now() / 1000) + 500

  const sig = await generateSignature({
    l1Sender: owner.address,
    l2Receiver: owner.address,
    l1Token: usdt.target as string,
    amount: depositAmount,
    deadline: deadline,
    wallet: depositApprover,
    chainId: CHAIN_ID,
  })
  await grvtBridgeProxy.addAllowedToken(usdt.target as string)
  await usdt.approve(grvtBridgeProxy.target, depositAmount)

  const depositTxReceipt = await (
    await grvtBridgeProxy.deposit(owner.address, usdt.target, depositAmount, deadline, sig.v, sig.r, sig.s)
  ).wait()

  const depositL2TxHash = depositTxReceipt.logs.find((log: any) => log.eventName == "BridgeProxyDepositInitiated").args
    .l2DepositTxHash

  if (simulateSharedBridgeClaim) {
    await mockL1SharedBridge.claimFailedDeposit(
      CHAIN_ID,
      grvtBridgeProxy.target,
      claimL1TokenOverride ?? usdt.target,
      claimAmount,
      depositL2TxHashOverride ?? depositL2TxHash,
      0,
      0,
      0,
      []
    )
    // cannot claim again
    await mockL1SharedBridge.setClaimSuccess(false)
  }

  const claimFailedDepositSigner = claimFailedDepositSignerOverride ?? owner.address
  const grvtBridgeProxyAsSigner = grvtBridgeProxy.connect(
    await hre.ethers.getSigner(claimFailedDepositSigner)
  ) as ethers.Contract

  return grvtBridgeProxyAsSigner.claimFailedDeposit(
    claimDepositSenderOverride ?? owner.address,
    claimL1TokenOverride ?? usdt.target,
    claimAmount,
    depositL2TxHashOverride ?? depositL2TxHash,
    0,
    0,
    0,
    []
  )
}

async function testDeposit(
  grvtBridgeProxy: ethers.Contract,
  owner: HardhatEthersSigner,
  depositApprover: HardhatEthersSigner,
  usdt: MockUSDT,
  {
    signedAmount = TEST_AMOUNT,
    approvedAmount = TEST_AMOUNT,
    depositAmount = TEST_AMOUNT,
    deadline = Math.floor(Date.now() / 1000) + 600,
    skipAddAllowedToken = false,
    skipUSDTApprove = false,
    tamperSiguatureFn = (sig: any) => sig,
    l1SenderSignedOverride = null,
    l2ReceiverSignedOverride = null,
    l2ReceiverOverride = null,
    depositApproverOverride = null,
  }: {
    signedAmount?: number
    approvedAmount?: number
    depositAmount?: number
    deadline?: number
    skipAddAllowedToken?: boolean
    skipUSDTApprove?: boolean
    tamperSiguatureFn?: (sig: any) => any
    l1SenderSignedOverride?: string | null
    l2ReceiverSignedOverride?: string | null
    l2ReceiverOverride?: string | null
    depositApproverOverride?: ethers.Signer | null
  }
) {
  const sig = tamperSiguatureFn(
    await generateSignature({
      l1Sender: l1SenderSignedOverride ?? owner.address,
      l2Receiver: l2ReceiverSignedOverride ?? l2ReceiverOverride ?? owner.address,
      l1Token: usdt.target as string,
      amount: signedAmount,
      deadline: deadline,
      wallet: depositApproverOverride ?? depositApprover,
      chainId: CHAIN_ID,
    })
  )

  if (!skipAddAllowedToken) {
    await grvtBridgeProxy.addAllowedToken(usdt.target as string)
  }
  if (!skipUSDTApprove) {
    await usdt.approve(grvtBridgeProxy.target, approvedAmount)
  }

  return grvtBridgeProxy.deposit(
    l2ReceiverOverride ?? owner.address,
    usdt.target,
    depositAmount,
    deadline,
    sig.v,
    sig.r,
    sig.s
  )
}

async function deployGRVTBridgeProxyFixture({
  txProofResult = true,
  claimSuccess = true,
  initialUsdtSupply = TEST_AMOUNT,
  l2TransactionBaseCost = 1,
}) {
  const [owner, rando, depositApprover, l2Bridge] = await hre.ethers.getSigners()

  const grvtBaseTokenImplFactory = await hre.ethers.getContractFactory("GRVTBaseToken")
  const grvtBaseTokenFactory = await hre.upgrades.deployProxy(grvtBaseTokenImplFactory, [owner.address])

  const grvtBaseToken = await grvtBaseTokenFactory.waitForDeployment()

  const tokenFactory = await hre.ethers.getContractFactory("MockUSDT")
  const usdt = await tokenFactory.deploy(initialUsdtSupply, owner.address)

  const mockL1SharedBridgeFactory = await hre.ethers.getContractFactory("MockL1SharedBridge")
  const mockL1SharedBridge = await mockL1SharedBridgeFactory.deploy(claimSuccess)

  const mockBridgeHubFactory = await hre.ethers.getContractFactory("MockBridgeHub")
  const mockBridgeHub = await mockBridgeHubFactory.deploy(
    mockL1SharedBridge.target,
    grvtBaseToken.target,
    txProofResult,
    l2TransactionBaseCost
  )

  const grvtBridgeProxyImplFactory = await hre.ethers.getContractFactory("GRVTBridgeProxy")
  const grvtBridgeProxyFactory = await hre.upgrades.deployProxy(grvtBridgeProxyImplFactory, [
    CHAIN_ID,
    mockBridgeHub.target,
    owner.address,
    depositApprover.address,
    grvtBaseToken.target,
  ])
  const grvtBridgeProxy = await grvtBridgeProxyFactory.waitForDeployment()

  await grvtBaseToken.grantRole(await grvtBaseToken.MINTER_ROLE(), grvtBridgeProxy.target)
  await grvtBridgeProxy.approveBaseToken(mockL1SharedBridge.target, ethers.MaxUint256)
  await grvtBridgeProxy.setL2DepositProxyAddressDerivationParams({
    exchangeAddress: "0x4a38db7321b4f3f041e14c4cd63df40fe108f162",
    beaconProxyBytecodeHash: "0x0100010965f47574acde5c31b36ada1f247fa8a94744d0fbf7e107c014d2b90a",
    depositProxyBeacon: "0x3B32454F03e7aD9dE1ab6E8Ec0Dee6aBfEBD7DCC",
  })

  return {
    grvtBridgeProxy,
    owner,
    rando,
    depositApprover: depositApprover,
    mockL1SharedBridge: mockL1SharedBridge,
    mockBridgeHub: mockBridgeHub,
    l2BridgeAddress: l2Bridge.address,
    grvtBridgeProxyAddress: grvtBridgeProxy.target,
    grvtBaseToken,
    usdt,
  }
}
