// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.24;

import "../interfaces/INeuron.sol";
import "../interfaces/IMetagraph.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

interface ITenexium {
    struct LiquidityProvider {
        uint256 stake; // LP stake amount
        uint256 rewards; // Accumulated rewards
        uint256 lastRewardBlock; // Last reward calculation block
        uint256 shares; // LP shares
        uint256 rewardDebt; // Accumulator-based reward debt for LP fee claims
        bool isActive; // LP status
    }

    function liquidityProviders(address) external view returns (LiquidityProvider memory);
}

contract SubnetManager is OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable {
    // The subnet ID for Tenex
    uint16 public constant TENEX_NETUID = 67;
    // The version key for the weights
    uint64 public versionKey;
    // The maximum number of liquidity providers per hotkey
    uint256 public MAX_LIQUIDITY_PROVIDERS_PER_HOTKEY;

    // Bittensor EVM precompiles
    IMetagraph public constant METAGRAPH_PRECOMPILE = IMetagraph(0x0000000000000000000000000000000000000802);
    INeuron public constant NEURON_PRECOMPILE = INeuron(0x0000000000000000000000000000000000000804);

    ITenexium public TenexiumContract;

    // Liquidity provider tracking
    mapping(address => bool) public uniqueLiquidityProviders;
    // Liquidity provider set tracking
    mapping(bytes32 => mapping(address => bool)) public liquidityProviderSet;
    // Liquidity provider list tracking
    mapping(bytes32 => address[]) public liquidityProviders;

    // Errors
    error AddressAlreadyAssociated();
    error SetWeightsFailed();

    // Events
    event AddressAssociated(address indexed liquidityProvider, bytes32 indexed hotkey, uint256 timestamp);

    function initialize(
        address _TenexiumContractAddress,
        uint64 _versionKey,
        uint256 _MAX_LIQUIDITY_PROVIDERS_PER_HOTKEY
    ) public initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        TenexiumContract = ITenexium(_TenexiumContractAddress);
        versionKey = _versionKey;
        MAX_LIQUIDITY_PROVIDERS_PER_HOTKEY = _MAX_LIQUIDITY_PROVIDERS_PER_HOTKEY;
    }

    function setWeights() external nonReentrant {
        (uint16[] memory dests, uint16[] memory weightsArray) = getWeights();
        _setWeights(dests, weightsArray);
    }

    function getWeights() public view returns (uint16[] memory dests, uint16[] memory weights) {
        uint256[] memory unnormalizedWeights;
        (dests, unnormalizedWeights) = _getUnnormalizedWeights();
        weights = new uint16[](unnormalizedWeights.length);

        uint256 totalWeight;
        for (uint16 i = 1; i < weights.length; i++) {
            totalWeight += unnormalizedWeights[i];
        }

        if (totalWeight == 0) {
            weights[0] = uint16(type(uint16).max);
        } else {
            for (uint16 i = 1; i < weights.length; i++) {
                uint256 normalizedWeight = (unnormalizedWeights[i] * type(uint16).max) / totalWeight;
                weights[i] = uint16(normalizedWeight);
            }
        }

        return (dests, weights);
    }

    function _getUnnormalizedWeights()
        internal
        view
        returns (uint16[] memory dests, uint256[] memory unnormalizedWeights)
    {
        uint16 uidCount = METAGRAPH_PRECOMPILE.getUidCount(TENEX_NETUID);
        dests = new uint16[](uidCount);
        unnormalizedWeights = new uint256[](uidCount);

        for (uint16 uid = 1; uid < uidCount; uid++) {
            dests[uid] = uid;
            bytes32 hotkey = METAGRAPH_PRECOMPILE.getHotkey(TENEX_NETUID, uid);
            uint256 liquidityProviderCount = liquidityProviderSetLength(hotkey);
            uint256 maxLiquidityProviders = liquidityProviderCount > MAX_LIQUIDITY_PROVIDERS_PER_HOTKEY
                ? MAX_LIQUIDITY_PROVIDERS_PER_HOTKEY
                : liquidityProviderCount;

            for (uint256 i = 0; i < maxLiquidityProviders; i++) {
                address liquidityProvider = liquidityProviders[hotkey][i];
                uint256 liquidityProviderBalance = TenexiumContract.liquidityProviders(liquidityProvider).stake;
                unnormalizedWeights[uid] += liquidityProviderBalance;
            }
        }
    }

    function _setWeights(uint16[] memory dests, uint16[] memory weightsArray) internal {
        bytes memory data =
            abi.encodeWithSelector(INeuron.setWeights.selector, TENEX_NETUID, dests, weightsArray, versionKey);
        (bool success,) = address(NEURON_PRECOMPILE).call{gas: gasleft()}(data);
        if (!success) {
            revert SetWeightsFailed();
        }
    }

    function liquidityProviderSetLength(bytes32 hotkey) public view returns (uint256) {
        return liquidityProviders[hotkey].length;
    }

    function setAssociate(bytes32 hotkey) public nonReentrant returns (bool) {
        if (liquidityProviderSet[hotkey][msg.sender] || uniqueLiquidityProviders[msg.sender]) {
            revert AddressAlreadyAssociated();
        }
        uniqueLiquidityProviders[msg.sender] = true;
        liquidityProviders[hotkey].push(msg.sender);
        liquidityProviderSet[hotkey][msg.sender] = true;
        emit AddressAssociated(msg.sender, hotkey, block.timestamp);
        return true;
    }

    function setVersionKey(uint64 _versionKey) public onlyOwner {
        versionKey = _versionKey;
    }

    function setTenexiumContract(address _TenexiumContractAddress) public onlyOwner {
        TenexiumContract = ITenexium(_TenexiumContractAddress);
    }

    function setMaxLiquidityProvidersPerHotkey(uint256 _MAX_LIQUIDITY_PROVIDERS_PER_HOTKEY) public onlyOwner {
        MAX_LIQUIDITY_PROVIDERS_PER_HOTKEY = _MAX_LIQUIDITY_PROVIDERS_PER_HOTKEY;
    }

    receive() external payable {}

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
