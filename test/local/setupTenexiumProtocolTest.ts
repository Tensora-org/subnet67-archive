import { ethers, network, upgrades } from "hardhat";

export async function setupTenexiumFixture() {
    const args = [
        ethers.parseUnits("10", 9), // maxLeverage: 10x
        ethers.parseUnits("1.1", 9), // liquidationThreshold: 110%
        ethers.parseEther("100"), // minLiquidityThreshold: 100 TAO
        ethers.parseUnits("0.9", 9), // maxUtilizationRate: 90%
        ethers.parseUnits("0.2", 9), // liquidityBufferRatio: 20%
        "0", // userCooldownBlocks
        "0", // lpCooldownBlocks
        ethers.parseUnits("0.5", 9), // buybackRate: 50%
        "7200", // buybackIntervalBlocks
        ethers.parseEther("1"), // buybackExecutionThreshold: 1 TAO
        "2628000", // vestingDurationBlocks
        "648000", // cliffDurationBlocks
        ethers.parseUnits("0.003", 9), // baseTradingFee: 0.3%
        ethers.parseUnits("0.00005", 9), // borrowingFeeRate: 0.005%
        ethers.parseUnits("0.02", 9), // baseLiquidationFee: 2%
        [
            ethers.parseUnits("0.3", 9), // LP share: 30%
            ethers.parseUnits("0", 9), // Liquidator share: 0%
            ethers.parseUnits("0.7", 9) // Protocol share: 70%
        ],
        [
            ethers.parseUnits("0.35", 9), // LP share: 35%
            ethers.parseUnits("0", 9), // Liquidator share: 0%
            ethers.parseUnits("0.65", 9) // Protocol share: 65%
        ],
        [
            ethers.parseUnits("0", 9), // LP share: 0%
            ethers.parseUnits("0.4", 9), // Liquidator share: 40%
            ethers.parseUnits("0.6", 9) // Protocol share: 60%
        ],
        [
            ethers.parseEther("100"), // Tier 1: 100 TAO
            ethers.parseEther("1000"), // Tier 2: 1000 TAO
            ethers.parseEther("5000"), // Tier 3: 5000 TAO
            ethers.parseEther("20000"), // Tier 4: 20000 TAO
            ethers.parseEther("100000") // Tier 5: 100000 TAO
        ],
        [
            ethers.parseUnits("0", 9), // Tier 0: 0%
            ethers.parseUnits("0.1", 9), // Tier 1: 10%
            ethers.parseUnits("0.2", 9), // Tier 2: 20%
            ethers.parseUnits("0.3", 9), // Tier 3: 30%
            ethers.parseUnits("0.4", 9), // Tier 4: 40%
            ethers.parseUnits("0.5", 9) // Tier 5: 50%
        ],
        [
            ethers.parseUnits("2", 9), // Tier 0: 2x
            ethers.parseUnits("3", 9), // Tier 1: 3x
            ethers.parseUnits("4", 9), // Tier 2: 4x
            ethers.parseUnits("5", 9), // Tier 3: 5x
            ethers.parseUnits("7", 9), // Tier 4: 7x
            ethers.parseUnits("10", 9) // Tier 5: 10x
        ],
        ethers.zeroPadValue("0x0123", 32) // protocolValidatorHotkey
    ];

    const [owner, user1] = await ethers.getSigners();

    const TenexiumProtocolFactory = await ethers.getContractFactory("TenexiumProtocol", owner);
    const tenexiumProtocol = await upgrades.deployProxy(
        TenexiumProtocolFactory,
        [
            ...args
        ],
        {
            initializer: "initialize",
            kind: "uups",
            unsafeAllow: ["constructor"]
        }
    );
    
    await tenexiumProtocol.waitForDeployment();
    console.log("✅ TenexiumProtocol deployed at:",  await tenexiumProtocol.getAddress());
    console.log("Owner:", owner.address);

    return {
        tenexiumProtocol,
        owner,
        user1,
        args
    };
}
