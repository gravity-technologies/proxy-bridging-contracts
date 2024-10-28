pragma solidity ^0.8.20;

import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import {IBridgehub, L2TransactionRequestTwoBridgesOuter, L2TransactionRequestDirect} from "../../lib/era-contracts/l1-contracts/contracts/bridgehub/IBridgehub.sol";
import {IL1SharedBridge} from "../../lib/era-contracts/l1-contracts/contracts/bridge/interfaces/IL1SharedBridge.sol";
import {TxStatus} from "../../lib/era-contracts/l1-contracts/contracts/common/Messaging.sol";
import {REQUIRED_L2_GAS_PRICE_PER_PUBDATA} from "../../lib/era-contracts/l1-contracts/contracts/common/Config.sol";
import {GRVTBaseToken} from "./GRVTBaseToken.sol";

struct L2DepositProxyAddressDerivationParams {
  address exchangeAddress;
  bytes32 beaconProxyBytecodeHash;
  address depositProxyBeacon;
}

/**
 * @title GRVTBridgeProxy
 * @dev This contract wraps around the `requestL2TransactionTwoBridges` function of the `BridgeHub`
 * and the `claimFailedDeposit` function of the `L1SharedBridge`. It ensures that only deposit requests
 * with valid approval signatures from GRVT can be initiated.
 */
contract GRVTBridgeProxy is Ownable2StepUpgradeable, ReentrancyGuardUpgradeable {
  using SafeERC20 for IERC20;

  event Initialized(uint256 chainID, address bridgeHub, address owner, address depositApprover, address baseToken);
  event TokenAllowed(address token);
  event TokenDisallowed(address token);
  event BridgeHubSet(address indexed bridgeHub);
  event DepositApproverSet(address indexed depositApprover);

  event BridgeProxyDepositInitiated(
    bytes32 indexed txDataHash,
    bytes32 indexed l2DepositTxHash,
    address indexed to,
    address from,
    address l1Token,
    uint256 amount
  );

  event ClaimedFailedDepositBridgeProxy(
    address indexed to,
    address indexed l1Token,
    uint256 amount,
    bool sharedBridgeClaimSucceeded
  );

  uint256 public constant L2_GAS_LIMIT_DEPOSIT = 1200000;
  uint256 public constant L2_GAS_LIMIT_MINT_BASE_TOKEN = 500000;
  bytes32 private constant CREATE2_PREFIX = keccak256("zksyncCreate2");

  uint256 public chainID;
  IBridgehub public bridgeHub;
  address public depositApprover;
  GRVTBaseToken public baseToken;

  mapping(address => bool) private allowedTokens;
  mapping(bytes32 => bool) private usedDepositHashes;
  mapping(bytes32 l2DepositTxHash => bytes32 depositDataHash) public depositHappened;

  // This needs to be set to match REQUIRED_L2_GAS_PRICE_PER_PUBDATA at all times, otherwise the deposits will fail
  uint256 l2GasPerPubdataByteLimit;

  L2DepositProxyAddressDerivationParams public l2DepositProxyAddressDerivationParams;

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /**
   * @dev Checks if a token is allowed to be deposited through this proxy.
   * @param _token The address of the token to be checked.
   * @return A boolean indicating whether the token is allowed.
   */
  function isTokenAllowed(address _token) external view returns (bool) {
    return allowedTokens[_token];
  }

  /**
   * @dev Initializes the contract setting the initial chain ID, BridgeHub address, owner, and deposit approver.
   * @param _chainID The ID of the chain this proxy is deployed on.
   * @param _bridgeHub The address of the BridgeHub contract.
   * @param _owner The address of the owner of this contract.
   * @param _depositApprover The address responsible for approving deposit requests.
   * @param _baseToken Base token of L2 chain, mintable by this contract
   */
  function initialize(
    uint256 _chainID,
    address _bridgeHub,
    address _owner,
    address _depositApprover,
    address _baseToken
  ) external initializer {
    chainID = _chainID;
    bridgeHub = IBridgehub(_bridgeHub);
    depositApprover = _depositApprover;
    baseToken = GRVTBaseToken(_baseToken);

    l2GasPerPubdataByteLimit = REQUIRED_L2_GAS_PRICE_PER_PUBDATA;

    require(_owner != address(0), "ShB owner 0");
    _transferOwnership(_owner);

    __ReentrancyGuard_init();

    emit Initialized(_chainID, _bridgeHub, _owner, _depositApprover, _baseToken);
  }

  function approveBaseToken(address to, uint256 amount) external onlyOwner returns (bool) {
    return baseToken.approve(address(to), amount);
  }

  /**
   * @dev Adds a token to the list of allowed tokens.
   * @param _token The address of the token to be allowed.
   */
  function addAllowedToken(address _token) external onlyOwner {
    allowedTokens[_token] = true;
    emit TokenAllowed(_token);
  }

  /**
   * @dev Removes a token from the list of allowed tokens.
   * @param _token The address of the token to be disallowed.
   */
  function removeAllowedToken(address _token) external onlyOwner {
    allowedTokens[_token] = false;
    emit TokenDisallowed(_token);
  }

  /**
   * @dev Sets the BridgeHub contract address.
   * @param _bridgeHub The address of the BridgeHub contract.
   */
  function setBridgeHub(address _bridgeHub) external onlyOwner {
    bridgeHub = IBridgehub(_bridgeHub);
    emit BridgeHubSet(_bridgeHub);
  }

  /**
   * @dev Returns the address of the deposit approver.
   * @return The address of the deposit approver.
   */
  function getDepositApprover() external view returns (address) {
    return depositApprover;
  }

  /**
   * @dev Sets the deposit approver address.
   * @param _depositApprover The address of the deposit approver.
   */
  function setDepositApprover(address _depositApprover) external onlyOwner {
    depositApprover = _depositApprover;
    emit DepositApproverSet(_depositApprover);
  }

  /**
   * @notice Sets the L2 deposit proxy address derivation parameters
   * @dev This function is intended to be called after this contract is deployed.
   *      The parameters are not known before the exchange contract is deployed on L2,
   *      which requires the base token to be present on L2.
   * @param _params The L2DepositProxyAddressDerivationParams struct containing the derivation parameters
   */
  function setL2DepositProxyAddressDerivationParams(
    L2DepositProxyAddressDerivationParams memory _params
  ) external onlyOwner {
    l2DepositProxyAddressDerivationParams = _params;
  }

  /**
   * @notice Mints base tokens on Layer 2 and initiates a direct Layer 2 transaction request.
   * @dev This function can only be called by the contract owner. It calculates the base transaction
   *      cost and adds the specified mint amount, mints the tokens, and initiates a transaction
   *      on Layer 2 through the bridge hub.
   * @param _l2Receiver The address that will receive the minted tokens on Layer 2.
   * @param _amount The amount of tokens to mint on Layer 2.
   */
  function mintBaseTokenL2(address _l2Receiver, uint256 _amount) external onlyOwner {
    uint256 baseCost = l2TransactionBaseCost(L2_GAS_LIMIT_MINT_BASE_TOKEN);
    uint256 mintValue = baseCost + _amount;

    baseToken.mint(address(this), mintValue);
    bridgeHub.requestL2TransactionDirect(
      L2TransactionRequestDirect({
        chainId: chainID,
        mintValue: mintValue,
        l2Contract: _l2Receiver,
        l2Value: _amount,
        l2Calldata: new bytes(0),
        l2GasLimit: L2_GAS_LIMIT_MINT_BASE_TOKEN,
        l2GasPerPubdataByteLimit: l2GasPerPubdataByteLimit,
        factoryDeps: new bytes[](0),
        refundRecipient: address(_l2Receiver)
      })
    );
  }

  /**
   * @dev Initiates a deposit request. Ensures the request is signed by the deposit approver.
   * @dev The tokens are bridged to a deposit proxy contract associated with _l2Receiver,
   * @dev rather than directly to _l2Receiver. Each account has its own deposit proxy contract
   * @dev that is deployed when the funding account is created on L2. The deposit proxy contract
   * @dev is deployed using CREATE2, allowing deterministic address derivation from the account ID.
   * @dev This is so that the L2 exchange contract can retrieve the bridged tokens from the deposit proxy
   * @dev contract and credit the receiver's funding account.
   * @dev Assumptions:
   * @dev 1. enough base token allowance from this contract to shared bridge
   * @dev 2. enough l1Token allowance from msg.sender to this contract
   * @dev 3. this contract can mint base token
   * @param _l2Receiver The address of the recipient on L2.
   * @param _l1Token The address of the token being deposited.
   * @param _amount The raw amount of the token being deposited.
   * @param _deadline The deadline by which the deposit must be approved.
   * @param _v The recovery byte of the signature.
   * @param _r R of the ECDSA signature.
   * @param _s S of the ECDSA signature.
   * @return txHash The transaction hash of the L2 deposit transaction.
   */
  function deposit(
    address _l2Receiver,
    address _l1Token,
    uint256 _amount,
    uint256 _deadline,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) external nonReentrant returns (bytes32 txHash) {
    return _deposit(msg.sender, _l2Receiver, _l1Token, _amount, _deadline, _v, _r, _s);
  }

  function _deposit(
    address _l1Sender,
    address _l2Receiver,
    address _l1Token,
    uint256 _amount,
    uint256 _deadline,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) private returns (bytes32 txHash) {
    require(allowedTokens[_l1Token], "L1 token not allowed");
    require(l2DepositProxyAddressDerivationParams.exchangeAddress != address(0), "dp deriv params ns");

    _verifyDepositApprovalSignature(_l1Sender, _l2Receiver, _l1Token, _amount, _deadline, _v, _r, _s);

    IERC20(_l1Token).safeTransferFrom(_l1Sender, address(this), _amount);

    txHash = _bridgeToL2DepositProxy(_l1Token, _amount, _l2Receiver);

    // note that the data hash is not the same as what L1SharedBridge saves
    // (first field is the proxy caller)
    // txHash is the canonicalTxHash for L2 transction
    bytes32 txDataHash = keccak256(abi.encode(_l1Sender, _l1Token, _amount));
    depositHappened[txHash] = txDataHash;

    emit BridgeProxyDepositInitiated(txDataHash, txHash, _l2Receiver, _l1Sender, _l1Token, _amount);
  }

  function _bridgeToL2DepositProxy(
    address _l1Token,
    uint256 _amount,
    address _l2Receiver
  ) private returns (bytes32 txHash) {
    address sharedBridge = address(bridgeHub.sharedBridge());
    IERC20(_l1Token).safeIncreaseAllowance(address(sharedBridge), _amount);

    uint256 baseCost = l2TransactionBaseCost(L2_GAS_LIMIT_DEPOSIT);
    baseToken.mint(address(this), baseCost);

    // we are depositing to the deposit proxy address of the l2 receiver
    // so that the exchange contract can retrieve the bridged funds and increase
    // funding account balance of the l2 receiver
    address l2DepositProxyAddress = getDepositProxyAddress(_l2Receiver);

    return
      bridgeHub.requestL2TransactionTwoBridges(
        L2TransactionRequestTwoBridgesOuter({
          chainId: chainID,
          mintValue: baseCost,
          l2Value: 0,
          l2GasLimit: L2_GAS_LIMIT_DEPOSIT,
          l2GasPerPubdataByteLimit: l2GasPerPubdataByteLimit,
          refundRecipient: owner(), // refund base token to owner of this contract
          secondBridgeAddress: sharedBridge,
          secondBridgeValue: 0,
          secondBridgeCalldata: abi.encode(_l1Token, _amount, l2DepositProxyAddress)
        })
      );
  }

  function l2TransactionBaseCost(uint256 _l2GasLimit) private view returns (uint256) {
    return bridgeHub.l2TransactionBaseCost(chainID, tx.gasprice, _l2GasLimit, l2GasPerPubdataByteLimit);
  }

  function getDepositProxyAddress(address accountID) public view returns (address) {
    bytes32 constructorInputHash = keccak256(abi.encode(l2DepositProxyAddressDerivationParams.depositProxyBeacon, ""));
    bytes32 salt = _getCreate2Salt(accountID);
    return
      _computeL2Create2Address(
        l2DepositProxyAddressDerivationParams.exchangeAddress,
        salt,
        l2DepositProxyAddressDerivationParams.beaconProxyBytecodeHash,
        constructorInputHash
      );
  }

  /// @notice Computes the create2 address for a Layer 2 contract.
  /// @param _sender The address of the contract creator.
  /// @param _salt The salt value to use in the create2 address computation.
  /// @param _bytecodeHash The contract bytecode hash.
  /// @param _constructorInputHash The keccak256 hash of the constructor input data.
  /// @return The create2 address of the contract.
  /// NOTE: L2 create2 derivation is different from L1 derivation!
  function _computeL2Create2Address(
    address _sender,
    bytes32 _salt,
    bytes32 _bytecodeHash,
    bytes32 _constructorInputHash
  ) private pure returns (address) {
    bytes32 senderBytes = bytes32(uint256(uint160(_sender)));
    bytes32 data = keccak256(
      // solhint-disable-next-line func-named-parameters
      bytes.concat(CREATE2_PREFIX, senderBytes, _salt, _bytecodeHash, _constructorInputHash)
    );

    return address(uint160(uint256(data)));
  }

  function _getCreate2Salt(address accountID) internal pure returns (bytes32 salt) {
    salt = bytes32(uint256(uint160(accountID)));
  }

  /**
   * @dev Claims a failed deposit with proof of the failed transaction.
   * @param _depositSender The address of the sender who initiated the deposit.
   * @param _l1Token The address of the token being claimed.
   * @param _amount The raw amount of the token being claimed.
   * @param _l2TxHash The transaction hash of the failed L2 transaction.
   * @param _l2BatchNumber The batch number of the L2 transaction.
   * @param _l2MessageIndex The message index of the L2 transaction.
   * @param _l2TxNumberInBatch The transaction number in the batch.
   * @param _merkleProof The Merkle proof for the failed transaction.
   */
  function claimFailedDeposit(
    address _depositSender,
    address _l1Token,
    uint256 _amount,
    bytes32 _l2TxHash,
    uint256 _l2BatchNumber,
    uint256 _l2MessageIndex,
    uint16 _l2TxNumberInBatch,
    bytes32[] calldata _merkleProof
  ) external nonReentrant {
    {
      bool proofValid = bridgeHub.proveL1ToL2TransactionStatus({
        _chainId: chainID,
        _l2TxHash: _l2TxHash,
        _l2BatchNumber: _l2BatchNumber,
        _l2MessageIndex: _l2MessageIndex,
        _l2TxNumberInBatch: _l2TxNumberInBatch,
        _merkleProof: _merkleProof,
        _status: TxStatus.Failure
      });
      require(proofValid, "invalid proof");
    }
    require(_amount > 0, "amount must be larger than 0");

    // no legacy bridge check as that is not applicable for our chain
    bytes32 dataHash = depositHappened[_l2TxHash];
    bytes32 txDataHash = keccak256(abi.encode(_depositSender, _l1Token, _amount));

    require(dataHash == txDataHash, "deposit did not happen");
    delete depositHappened[_l2TxHash];

    IL1SharedBridge sharedBridge = bridgeHub.sharedBridge();

    bool sharedBridgeClaimSucceeded;
    try
      sharedBridge.claimFailedDeposit(
        chainID,
        address(this),
        _l1Token,
        _amount,
        _l2TxHash,
        _l2BatchNumber,
        _l2MessageIndex,
        _l2TxNumberInBatch,
        _merkleProof
      )
    {
      sharedBridgeClaimSucceeded = true;
    } catch {
      sharedBridgeClaimSucceeded = false;
    }

    // We transfer the amount to the deposit sender no matter
    // whether the claim with the shared bridge succeeded or not
    // as the failed deposit proof is valid and has not been used
    // before.
    // The shared bridge claim can fail if it has already been claimed
    // in which case the amount to refund is already paid to this contract
    IERC20(_l1Token).safeTransfer(_depositSender, _amount);

    emit ClaimedFailedDepositBridgeProxy(_depositSender, _l1Token, _amount, sharedBridgeClaimSucceeded);
  }

  function _verifyDepositApprovalSignature(
    address _l1Sender,
    address _l2Receiver,
    address _l1Token,
    uint256 _amount,
    uint256 _deadline,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) internal {
    require(block.timestamp <= _deadline, "expired deadline");

    bytes32 msgHash = keccak256(
      abi.encodePacked(
        abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR),
        keccak256(abi.encode(DEPOSIT_APPROVAL_TYPEHASH, _l1Sender, _l2Receiver, _l1Token, _amount, _deadline))
      )
    );

    // TODO: we can consider using nouce here, this imposes a limit of 1 tx per second, but requires
    // the signer service to read the nonce from the contract
    require(!usedDepositHashes[msgHash], "deposit approval already used");

    (address addr, ECDSA.RecoverError err) = ECDSA.tryRecover(msgHash, _v, _r, _s);
    require(err == ECDSA.RecoverError.NoError && addr == depositApprover, "invalid signature");

    usedDepositHashes[msgHash] = true;
  }

  function setL2GasPerPubdataByteLimit(uint256 limit) external onlyOwner {
    l2GasPerPubdataByteLimit = limit;
  }

  bytes32 private constant eip712DomainTypeHash = keccak256("EIP712Domain(string name,string version,uint256 chainId)");

  /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
  bytes32 private immutable DOMAIN_SEPARATOR =
    keccak256(
      abi.encode(eip712DomainTypeHash, keccak256(bytes("GRVT Exchange")), keccak256(bytes("0")), block.chainid)
    );

  bytes32 private constant DEPOSIT_APPROVAL_TYPEHASH =
    keccak256("DepositApproval(address l1Sender,address l2Receiver,address l1Token,uint256 amount,uint256 deadline)");
}
