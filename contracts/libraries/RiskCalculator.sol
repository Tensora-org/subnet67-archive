// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./AlphaMath.sol";

/**
 * @title RiskCalculator
 * @notice Library for calculating position risk metrics and liquidation thresholds
 */
library RiskCalculator {
    using AlphaMath for uint256;

    uint256 private constant LIQUIDATION_DEADLINE_BLOCKS = 360;
    uint256 private constant PRECISION = 1e9;

    struct RiskAssessment {
        uint256 healthRatio;
        uint256 liquidationPrice;
        uint256 timeToLiquidation;
        bool isAtRisk;
        bool requiresImmediateLiquidation;
    }

    struct PositionData {
        uint256 alphaAmount;
        uint256 borrowed;
        uint256 collateral;
        uint256 accruedFees;
        uint256 lastUpdateBlock;
        bool isActive;
    }

    /**
     * @notice Unified dynamic borrow rate model per 360 blocks (utilization-kinked)
     * @param utilization Utilization in PRECISION (PRECISION = 100%)
     * @return ratePer360 Borrow rate accrued over 360 blocks
     */
    function dynamicBorrowRatePer360(uint256 utilization) internal pure returns (uint256 ratePer360) {
        // Baseline aligned to spec: 0.005% per 360 blocks at zero utilization.
        // Kink at 80%; steeper slope beyond kink.
        uint256 baseRate = 50_000; // 0.005% per 360 blocks (0.00005 * 1e9)
        uint256 kink = 800_000_000; // 80% of PRECISION (0.8 * 1e9)
        uint256 slope1 = 150_000; // 0.015% per 360 blocks below kink (0.00015 * 1e9)
        uint256 slope2 = 800_000; // 0.08% per 360 blocks above kink (0.0008 * 1e9)
        if (utilization <= kink) {
            return baseRate + (utilization * slope1) / kink;
        } else {
            return baseRate + slope1 + ((utilization - kink) * slope2) / (1_000_000_000 - kink);
        }
    }

    /**
     * @notice Calculate comprehensive risk assessment for a position
     * @param position Position data
     * @param currentPrice Current alpha token price
     * @param liquidationThreshold Liquidation threshold (e.g., 120%)
     * @return assessment Complete risk assessment
     */
    function assessPositionRisk(PositionData memory position, uint256 currentPrice, uint256 liquidationThreshold)
        internal
        pure
        returns (RiskAssessment memory assessment)
    {
        if (!position.isActive) {
            return assessment; // Returns default struct with all zeros
        }

        // Calculate current position value (wei)
        uint256 currentValue = position.alphaAmount.safeMul(currentPrice);
        uint256 totalDebt = position.borrowed + position.accruedFees;

        // Calculate health ratio
        assessment.healthRatio = calculateHealthRatio(currentValue, totalDebt);

        // Calculate liquidation price
        assessment.liquidationPrice = calculateLiquidationPrice(
            position.borrowed, position.accruedFees, position.alphaAmount, liquidationThreshold
        );

        // Determine risk status
        assessment.isAtRisk = assessment.healthRatio <= liquidationThreshold;
        // Under the simplified single-threshold model, treat immediate liquidation the same as threshold breach
        assessment.requiresImmediateLiquidation = assessment.healthRatio <= liquidationThreshold;

        // Calculate time to liquidation
        if (assessment.isAtRisk && currentPrice > 0) {
            assessment.timeToLiquidation =
                _estimateBlocksToLiquidation(currentPrice, assessment.liquidationPrice, position.lastUpdateBlock);
        }

        return assessment;
    }

    /**
     * @notice Calculate health ratio for a position
     * @param positionValue Current value of the position
     * @param totalDebt Total debt including fees
     * @return healthRatio Health ratio (collateral value / debt)
     */
    function calculateHealthRatio(uint256 positionValue, uint256 totalDebt)
        internal
        pure
        returns (uint256 healthRatio)
    {
        if (totalDebt == 0) return type(uint256).max;
        return positionValue.safeMul(PRECISION) / totalDebt;
    }

    /**
     * @notice Calculate the price at which position becomes liquidatable
     * @param borrowed Borrowed amount
     * @param accruedFees Accrued fees
     * @param alphaAmount Amount of alpha tokens
     * @param liquidationThreshold Liquidation threshold
     * @return liquidationPrice Price at which liquidation occurs
     */
    function calculateLiquidationPrice(
        uint256 borrowed,
        uint256 accruedFees,
        uint256 alphaAmount,
        uint256 liquidationThreshold
    ) internal pure returns (uint256 liquidationPrice) {
        if (alphaAmount == 0) return 0;

        uint256 totalDebt = borrowed + accruedFees;
        return totalDebt.safeMul(liquidationThreshold) / alphaAmount;
    }

    /**
     * @notice Check if a position is liquidatable
     * @param position Position data
     * @param currentPrice Current alpha price
     * @param liquidationThreshold Liquidation threshold
     * @return isLiquidatable Whether position can be liquidated
     */
    function isPositionLiquidatable(PositionData memory position, uint256 currentPrice, uint256 liquidationThreshold)
        internal
        pure
        returns (bool isLiquidatable)
    {
        if (!position.isActive) return false;

        uint256 healthRatio =
            calculateHealthRatio(position.alphaAmount.safeMul(currentPrice), position.borrowed + position.accruedFees);

        return healthRatio <= liquidationThreshold;
    }

    /**
     * @notice Calculate maximum leverage for a given collateral and alpha price
     * @param collateral Collateral amount
     * @param alphaPrice Alpha token price
     * @param maxLeverage Maximum allowed leverage
     * @return maxPosition Maximum position size
     */
    function calculateMaxPosition(uint256 collateral, uint256 alphaPrice, uint256 maxLeverage)
        internal
        pure
        returns (uint256 maxPosition)
    {
        uint256 maxPositionValueWei = collateral.safeMul(maxLeverage) / PRECISION;
        return maxPositionValueWei / alphaPrice;
    }

    /**
     * @notice Calculate required collateral for a position
     * @param positionSize Position size in alpha tokens
     * @param alphaPrice Alpha token price
     * @param leverage Desired leverage
     * @return requiredCollateral Required collateral amount
     */
    function calculateRequiredCollateral(uint256 positionSize, uint256 alphaPrice, uint256 leverage)
        internal
        pure
        returns (uint256 requiredCollateral)
    {
        uint256 positionValueWei = positionSize.safeMul(alphaPrice);
        return positionValueWei.safeMul(PRECISION) / leverage;
    }

    /**
     * @notice Calculate borrowing fees accrued over time
     * @param borrowed Borrowed amount
     * @param borrowingRate Borrowing rate per block
     * @param blocksPassed Number of blocks passed
     * @return accruedFees Fees accrued
     */
    function calculateBorrowingFees(uint256 borrowed, uint256 borrowingRate, uint256 blocksPassed)
        internal
        pure
        returns (uint256 accruedFees)
    {
        return borrowed.safeMul(borrowingRate).safeMul(blocksPassed) / PRECISION;
    }

    /**
     * @notice Estimate time until liquidation based on price trends
     * @param currentPrice Current price
     * @param liquidationPrice Liquidation price
     * @return blocksToLiquidation Estimated blocks until liquidation
     */
    function _estimateBlocksToLiquidation(
        uint256 currentPrice,
        uint256 liquidationPrice,
        uint256 /* lastUpdateBlock */
    ) private pure returns (uint256 blocksToLiquidation) {
        if (currentPrice <= liquidationPrice) {
            return 0; // Already liquidatable
        }
        return LIQUIDATION_DEADLINE_BLOCKS;
    }
}
