import { ethers } from "hardhat";
import utils from "./utils";

async function main() {
    // Connect to the Subtensor EVM testnet
    const { provider, signer, contract } = await utils.getSubnetManagerContract("testnet");
    const SubnetManagerContractAddress = contract.target;

    console.log("🔍 Testing TenexiumProtocol Subnet Manager on Testnet");
    console.log("=" .repeat(60));
    console.log("SubnetManagerContractAddress:", SubnetManagerContractAddress);
    console.log("RPC URL:", utils.getRpcUrl("testnet"));
    console.log("Signer:", signer.address);
    console.log("Contract Balance:", ethers.formatEther(await provider.getBalance(SubnetManagerContractAddress)), "TAO");
    
    try {
        const setVersionKeyTx = await contract.setVersionKey(1);
        console.log(`   Transaction Hash: ${setVersionKeyTx.hash}`);
        await setVersionKeyTx.wait();
        console.log("   ✅ Version key set successfully!");
        console.log("getWeights", await contract.getWeights());
        console.log("\n➕ Setting Weights...");
        const setWeightsTx = await contract.setWeights();
        console.log(`   Transaction Hash: ${setWeightsTx.hash}`);
        await setWeightsTx.wait();
        console.log("   ✅ Weights set successfully!");
        
    } catch (error) {
        console.error("❌ Error during subnet manager test:", error);
        throw error;
    }
}

main().catch((error) => {
    console.error("❌ Error:", error);
    process.exitCode = 1;
});
