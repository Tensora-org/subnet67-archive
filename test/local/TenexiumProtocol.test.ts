import { expect } from "chai";
import { ethers} from "hardhat";
import { Signer } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { setupTenexiumFixture } from "./setupTenexiumProtocolTest";

describe("TenexiumProtocol", function () {
    // Test configuration
    const NETUID = 67;
    const POSITION_SIZE = ethers.parseEther("10"); // 10 TAO
    const SMALL_AMOUNT = ethers.parseEther("100"); // 100 TAO
    const LARGE_AMOUNT = ethers.parseEther("1000"); // 1000 TAO
    const MAX_SLIPPAGE = 500; // 5%

    describe("Initialization", function () {
        it("Should initialize with correct parameters", async function () {
            const { tenexiumProtocol, owner, user1, args } = await loadFixture(setupTenexiumFixture);
            expect(await tenexiumProtocol.owner()).to.equal(owner.address);
            expect(await tenexiumProtocol.maxLeverage()).to.equal(args[0]);
            expect(await tenexiumProtocol.liquidationThreshold()).to.equal(args[1]);
            expect(await tenexiumProtocol.minLiquidityThreshold()).to.equal(args[2]);
            expect(await tenexiumProtocol.maxUtilizationRate()).to.equal(args[3]);
            expect(await tenexiumProtocol.liquidityBufferRatio()).to.equal(args[4]);
            expect(await tenexiumProtocol.userActionCooldownBlocks()).to.equal(args[5]);
            expect(await tenexiumProtocol.lpActionCooldownBlocks()).to.equal(args[6]);
            expect(await tenexiumProtocol.buybackRate()).to.equal(args[7]);
            expect(await tenexiumProtocol.buybackIntervalBlocks()).to.equal(args[8]);
            expect(await tenexiumProtocol.buybackExecutionThreshold()).to.equal(args[9]);
            expect(await tenexiumProtocol.vestingDurationBlocks()).to.equal(args[10]);
            expect(await tenexiumProtocol.cliffDurationBlocks()).to.equal(args[11]);
            expect(await tenexiumProtocol.tradingFeeRate()).to.equal(args[12]);
            expect(await tenexiumProtocol.borrowingFeeRate()).to.equal(args[13]);
            expect(await tenexiumProtocol.liquidationFeeRate()).to.equal(args[14]);
        });

        it("Should not allow re-initialization", async function () {
            const { tenexiumProtocol, owner, user1, args } = await loadFixture(setupTenexiumFixture);
            await expect(
                tenexiumProtocol.initialize(...args as any)
            ).to.be.revertedWithCustomError(tenexiumProtocol, "InvalidInitialization()");
        });
    });

    describe("Liquidity Management", function () {
        it("Should allow users to add liquidity", async function () {
            const { tenexiumProtocol, owner, user1, args } = await loadFixture(setupTenexiumFixture);
            const initialBalance = await tenexiumProtocol.getLiquidityStats();
            await tenexiumProtocol.connect(user1).addLiquidity({ value: SMALL_AMOUNT });
            const finalBalance = await tenexiumProtocol.getLiquidityStats();
            expect(finalBalance[1] - initialBalance[1]).to.equal(SMALL_AMOUNT);
        });

        it("Should allow users to remove liquidity", async function () {
            const { tenexiumProtocol, owner, user1, args } = await loadFixture(setupTenexiumFixture);
            await tenexiumProtocol.connect(user1).addLiquidity({ value: SMALL_AMOUNT });
            await tenexiumProtocol.connect(user1).addLiquidity({ value: SMALL_AMOUNT });
            const initialBalance = await tenexiumProtocol.getLiquidityStats();
            await tenexiumProtocol.connect(user1).removeLiquidity(SMALL_AMOUNT);
            const finalBalance = await tenexiumProtocol.getLiquidityStats();
            expect(initialBalance[1] - finalBalance[1]).to.equal(SMALL_AMOUNT);
        });
    });

    describe("Position Management", function () {
        it("Should allow users to open positions", async function () {
            const { tenexiumProtocol, owner, user1, args } = await loadFixture(setupTenexiumFixture);
            await tenexiumProtocol.connect(user1).addLiquidity({ value: LARGE_AMOUNT });
            const leverage = ethers.parseUnits("2", 9); // 2x leverage
            await tenexiumProtocol.connect(user1).openPosition(
                NETUID,
                leverage,
                MAX_SLIPPAGE,
                { value: POSITION_SIZE }
            );
            const position = await tenexiumProtocol.getUserPosition(user1, NETUID);
            expect(position.isActive).to.be.true;
            expect(position.collateral).to.equal(POSITION_SIZE);
            expect(position.leverage).to.equal(leverage);
        });

        it("Should calculate position values correctly", async function () {
            const { tenexiumProtocol, owner, user1, args } = await loadFixture(setupTenexiumFixture);
            const positionSize = ethers.parseEther("100");
            const leverage = ethers.parseUnits("2", 9); // 2x leverage
            
            await tenexiumProtocol.connect(user1).openPosition(
                NETUID,
                leverage,
                MAX_SLIPPAGE
            );
            console.log("positionSize", positionSize);
            
            const position = await tenexiumProtocol.getUserPosition(user1, NETUID);
            const expectedBorrowed = positionSize * leverage / ethers.parseUnits("1", 9);
            expect(position.borrowed).to.equal(expectedBorrowed);
        });

        it("Should allow users to close positions", async function () {
            const { tenexiumProtocol, owner, user1, args } = await loadFixture(setupTenexiumFixture);
            const positionSize = ethers.parseEther("100");
            const leverage = ethers.parseUnits("2", 9);
            
            await tenexiumProtocol.connect(user1).openPosition(
                positionSize,
                leverage,
                ethers.zeroPadValue("0x0123", 32)
            );
            
            await tenexiumProtocol.connect(user1).closePosition(NETUID, positionSize, ethers.parseUnits("0.01", 9));
            
            const position = await tenexiumProtocol.getUserPosition(user1, NETUID);
            expect(position.isActive).to.be.false;
        });
    });

    describe("Fee Calculations", function () {
        it("Should calculate trading fees correctly", async function () {
            const { tenexiumProtocol } = await loadFixture(setupTenexiumFixture);
            const tradeAmount = ethers.parseEther("1000");
            const baseFee = await tenexiumProtocol.getProtocolStats();
            const expectedFee = tradeAmount * baseFee.totalVolumeAmount / ethers.parseUnits("1", 9);
            
            // Mock trade calculation (this would depend on actual implementation)
            expect(baseFee).to.equal(ethers.parseUnits("0.003", 9)); // 0.3%
        });

        it("Should calculate borrowing fees correctly", async function () {
            const { tenexiumProtocol } = await loadFixture(setupTenexiumFixture);
            const borrowedAmount = ethers.parseEther("100");
            const feeRate = await tenexiumProtocol.borrowingFeeRate();
            const expectedFee = borrowedAmount * feeRate / ethers.parseUnits("1", 9);
            
            expect(feeRate).to.equal(ethers.parseUnits("0.00005", 9)); // 0.005%
        });
    });

    describe("Tier System", function () {
        it("Should return correct tier information", async function () {
            const { tenexiumProtocol } = await loadFixture(setupTenexiumFixture);
            const tier1Threshold = await tenexiumProtocol.tier1Threshold();
            const tier1Discount = await tenexiumProtocol.tier1FeeDiscount();
            const tier1MaxLeverage = await tenexiumProtocol.tier1MaxLeverage();
            
            expect(tier1Threshold).to.equal(ethers.parseEther("100"));
            expect(tier1Discount).to.equal(ethers.parseUnits("0.1", 9)); // 10%
            expect(tier1MaxLeverage).to.equal(ethers.parseUnits("3", 9)); // 3x
        });

        it("Should calculate user tier correctly", async function () {
            const { tenexiumProtocol, owner, args, user1 } = await loadFixture(setupTenexiumFixture);
            // Add enough liquidity to reach tier 2
            await tenexiumProtocol.connect(user1).addLiquidity({ value: ethers.parseEther("1500") });
            
            const userTier = await tenexiumProtocol.getUserStats(user1);
            expect(userTier).to.equal(2); // Tier 2 (1000-5000 TAO)
        });
    });

    describe("Access Control", function () {
        it("Should allow only owner to pause", async function () {
            const { tenexiumProtocol, owner, args, user1 } = await loadFixture(setupTenexiumFixture);
            await expect(
                tenexiumProtocol.connect(user1).emergencyPause()
            ).to.be.revertedWith("Ownable: caller is not the owner");
            
            await tenexiumProtocol.emergencyPause();
            expect(await tenexiumProtocol.paused()).to.be.true;
        });

        it("Should allow only owner to unpause", async function () {
            const { tenexiumProtocol, owner, user1 } = await loadFixture(setupTenexiumFixture);
            await tenexiumProtocol.emergencyPause();
            
            await expect(
                tenexiumProtocol.connect(user1).emergencyPause()
            ).to.be.revertedWith("Ownable: caller is not the owner");
            
            await tenexiumProtocol.emergencyPause();
            expect(await tenexiumProtocol.paused()).to.be.false;
        });

        it("Should allow only owner to update parameters", async function () {
            const { tenexiumProtocol, owner, user1 } = await loadFixture(setupTenexiumFixture);
            const newMaxLeverage = ethers.parseUnits("8", 9);
            
            await expect(
                tenexiumProtocol.connect(user1).updateRiskParameters(newMaxLeverage, ethers.parseUnits("1.05", 9))
            ).to.be.revertedWith("Ownable: caller is not the owner");
            
            await tenexiumProtocol.updateRiskParameters(newMaxLeverage, ethers.parseUnits("1.05", 9));
            expect(await tenexiumProtocol.maxLeverage()).to.equal(newMaxLeverage);
        });
    });

    describe("Emergency Functions", function () {
        it("Should allow owner to emergency pause", async function () {
            const { tenexiumProtocol, owner } = await loadFixture(setupTenexiumFixture);
            await tenexiumProtocol.emergencyPause();
            expect(await tenexiumProtocol.paused()).to.be.true;
        });
    });

    describe("Events", function () {
        it("Should emit PositionOpened event", async function () {
            const { tenexiumProtocol, owner, user1 } = await loadFixture(setupTenexiumFixture);
            const positionSize = ethers.parseEther("100");
            const leverage = ethers.parseUnits("2", 9);
            const hotkey = ethers.zeroPadValue("0x0123", 32);
            
            await expect(
                tenexiumProtocol.connect(user1).openPosition(positionSize, leverage, hotkey)
            ).to.emit(tenexiumProtocol, "PositionOpened")
              .withArgs(user1, positionSize, leverage, hotkey);
        });

        it("Should emit LiquidityAdded event", async function () {
            const { tenexiumProtocol, owner, user1 } = await loadFixture(setupTenexiumFixture);
            await expect(
                tenexiumProtocol.connect(user1).addLiquidity({ value: SMALL_AMOUNT })
            ).to.emit(tenexiumProtocol, "LiquidityAdded")
              .withArgs(user1, SMALL_AMOUNT);
        });
    });

    describe("Edge Cases", function () {
        it("Should handle zero amounts gracefully", async function () {
            const { tenexiumProtocol, owner, user1 } = await loadFixture(setupTenexiumFixture);
            await expect(
                tenexiumProtocol.connect(user1).addLiquidity({ value: 0 })
            ).to.be.revertedWith("Amount must be greater than 0");
        });

        it("Should prevent excessive leverage", async function () {
            const { tenexiumProtocol, owner, user1 } = await loadFixture(setupTenexiumFixture);
            const maxLeverage = await tenexiumProtocol.maxLeverage();
            const excessiveLeverage = maxLeverage + ethers.parseUnits("1", 9);
            
            await expect(
                tenexiumProtocol.connect(user1).openPosition(
                    SMALL_AMOUNT,
                    excessiveLeverage,
                    ethers.zeroPadValue("0x0123", 32)
                )
            ).to.be.revertedWith("Leverage exceeds maximum");
        });

        it("Should handle insufficient liquidity", async function () {
            const { tenexiumProtocol, owner, user1 } = await loadFixture(setupTenexiumFixture);
            const largeAmount = ethers.parseEther("1000000"); // 1M TAO
            
            await expect(
                tenexiumProtocol.connect(user1).addLiquidity({ value: largeAmount })
            ).to.be.revertedWith("Insufficient liquidity");
        });
    });
}); 
