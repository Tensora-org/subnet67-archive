// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../core/TenexiumStorage.sol";
import "../core/TenexiumEvents.sol";
import "../libraries/AlphaMath.sol";
import "../libraries/RiskCalculator.sol";
import "../libraries/TenexiumErrors.sol";

/**
 * @title LiquidityManager
 * @notice Functions for liquidity provider operations and pool management
 */
abstract contract LiquidityManager is TenexiumStorage, TenexiumEvents {
    using AlphaMath for uint256;

    // ==================== LIQUIDITY PROVIDER FUNCTIONS ====================

    /**
     * @notice Add liquidity to the protocol (TAO only)
     * @dev Users deposit TAO to become liquidity providers
     */
    function _addLiquidity() internal {
        if (msg.value < 1e17) revert TenexiumErrors.LpMinDeposit();

        LiquidityProvider storage lp = liquidityProviders[msg.sender];
        // Settle pending rewards before changing shares
        if (lp.isActive) {
            // update reward accounting using accumulators in FeeManager
            _updateLpFeeRewards(msg.sender);
        }

        // Calculate shares based on current exchange rate
        uint256 shares = calculateLpShares(msg.value);

        if (!lp.isActive) {
            // New LP
            lp.isActive = true;
            lp.lastRewardBlock = block.number;
        }

        lp.stake += msg.value;
        lp.shares += shares;
        // Update reward debt to include new shares
        lp.rewardDebt = (lp.shares * accLpFeesPerShare) / 1e12;

        // Update global state (LP liquidity only)
        totalLpStakes += msg.value;

        emit LiquidityAdded(msg.sender, msg.value, shares, totalLpStakes);
    }

    /**
     * @notice Remove liquidity from the protocol (TAO only)
     * @param amount Amount of TAO to withdraw (0 for full withdrawal)
     */
    function _removeLiquidity(uint256 amount) internal {
        LiquidityProvider storage lp = liquidityProviders[msg.sender];
        if (!lp.isActive) revert TenexiumErrors.NotLiquidityProvider();

        uint256 withdrawAmount = amount;
        if (amount == 0) {
            // Full withdrawal
            withdrawAmount = lp.stake;
        }

        if (withdrawAmount == 0 || withdrawAmount > lp.stake) revert TenexiumErrors.InvalidWithdrawalAmount();

        // Calculate utilization rate after withdrawal using LP liquidity only
        uint256 newTotalLp = totalLpStakes - withdrawAmount;
        uint256 newUtilizationRate = newTotalLp > 0 ? totalBorrowed.safeMul(PRECISION) / newTotalLp : 0;

        if (newUtilizationRate > maxUtilizationRate) revert TenexiumErrors.UtilizationExceeded(newUtilizationRate);

        // Update rewards before changing stake
        _updateLpFeeRewards(msg.sender);

        // Calculate shares to burn
        uint256 sharesToBurn = lp.shares.safeMul(withdrawAmount) / lp.stake;

        // Update LP state
        lp.stake -= withdrawAmount;
        lp.shares -= sharesToBurn;
        // Reset reward debt to new share amount
        lp.rewardDebt = (lp.shares * accLpFeesPerShare) / 1e12;

        if (lp.stake == 0) {
            lp.isActive = false;
        }

        // Update global state (LP liquidity only)
        totalLpStakes -= withdrawAmount;

        // Transfer TAO to LP
        (bool success,) = msg.sender.call{value: withdrawAmount}("");
        if (!success) revert TenexiumErrors.TransferFailed();

        emit LiquidityRemoved(msg.sender, withdrawAmount, sharesToBurn, totalLpStakes);
    }

    // ==================== UTILIZATION MANAGEMENT ====================

    /**
     * @notice Update utilization rates for alpha pairs
     * @param alphaNetuid Alpha subnet ID
     */
    function updateUtilizationRate(uint16 alphaNetuid) external validAlphaPair(alphaNetuid) {
        AlphaPair storage pair = alphaPairs[alphaNetuid];

        if (pair.totalCollateral == 0) {
            pair.utilizationRate = 0;
            pair.borrowingRate = 0;
            return;
        }

        // Update utilization and borrowing rates
        pair.utilizationRate = pair.totalBorrowed.safeMul(PRECISION) / pair.totalCollateral;
        pair.borrowingRate = RiskCalculator.dynamicBorrowRatePer360(pair.utilizationRate);

        emit UtilizationRateUpdated(alphaNetuid, pair.utilizationRate, pair.borrowingRate);
    }

    // ==================== LP SHARE CALCULATIONS ====================

    /**
     * @notice Calculate LP shares for a given deposit amount
     * @param depositAmount Amount of TAO being deposited
     * @return shares Number of LP shares to mint
     */
    function calculateLpShares(uint256 depositAmount) public view returns (uint256 shares) {
        if (totalLpStakes == 0) {
            return depositAmount;
        }

        // Calculate shares based on current exchange rate
        uint256 totalShares = getTotalLpShares();
        return depositAmount.safeMul(totalShares) / totalLpStakes;
    }

    /**
     * @notice Get total LP shares across all providers
     * @return totalShares Total LP shares
     */
    function getTotalLpShares() public view returns (uint256 totalShares) {
        return totalLpStakes;
    }

    /**
     * @notice Calculate TAO value of LP shares
     * @param lpAddress LP address
     * @return taoValue Current TAO value of LP's shares
     */
    function calculateLpValue(address lpAddress) external view returns (uint256 taoValue) {
        LiquidityProvider storage lp = liquidityProviders[lpAddress];
        if (!lp.isActive || lp.shares == 0) return 0;

        uint256 totalShares = getTotalLpShares();
        if (totalShares == 0) return 0;

        // Calculate proportional value including earned rewards
        uint256 baseValue = totalLpStakes.safeMul(lp.shares) / totalShares;

        return baseValue;
    }

    // ==================== INTERNAL FUNCTIONS ====================

    /**
     * @notice Update LP fee rewards
     * @param lp LP address
     * @dev This function is implemented in FeeManager
     */
    function _updateLpFeeRewards(address lp) internal virtual;
}
