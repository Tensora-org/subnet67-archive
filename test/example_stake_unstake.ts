import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

// IStaking contract interface
const ISTAKING_ABI = [
    "function addStake(bytes32 hotkey, uint256 amount, uint256 netuid) external payable",
    "function removeStake(bytes32 hotkey, uint256 amount, uint256 netuid) external",
    "function getStake(bytes32 hotkey, bytes32 coldkey, uint256 netuid) external view returns (uint256)"
];

async function main() {
    const provider = new ethers.JsonRpcProvider("https://test.chain.opentensor.ai");
    const signer = new ethers.Wallet(process.env.ETH_PRIVATE_KEY!, provider);
    const ISTAKING_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000805";
    
    // Create contract instance
    const stakingContract = new ethers.Contract(ISTAKING_CONTRACT_ADDRESS, ISTAKING_ABI, signer);
    
    // Example parameters
    const hotkey = "0x4069cd29a83311187c0f2930bc85695dfdf9e6f4646af9f6e2eafd2b7cef2b41"; // 32 bytes hotkey
    const coldkey = "0x84ec6fbd9bed5f94dc0acc6f287d4b531ea9161cec28c95af4453f8b286662dc"; // 32 bytes coldkey
    const amount = ethers.parseUnits("0.1", 9); // 0.1 TAO in rao
    const netuid = 67; // subnet ID
    
    try {
        // ===== ADD STAKE EXAMPLES =====
        console.log("=== ADD STAKE EXAMPLES ===");
        
        // Method 1: Direct contract call (recommended)
        console.log("Calling addStake directly...");
        const addTx = await stakingContract.addStake(hotkey, amount, netuid, {
            value: amount // Send TAO as msg.value
        });
        console.log("Add stake transaction hash:", addTx.hash);
        await addTx.wait();
        console.log("Add stake transaction confirmed!");
        
        // Method 2: Using encodeWithSelector equivalent (for manual encoding)
        console.log("\nUsing encodeWithSelector equivalent for addStake...");
        const iface = new ethers.Interface(ISTAKING_ABI);
        const addEncodedData = iface.encodeFunctionData("addStake", [hotkey, amount, netuid]);
        console.log("Encoded addStake function data:", addEncodedData);
        
        // Send raw transaction with encoded data
        const addRawTx = await signer.sendTransaction({
            to: ISTAKING_CONTRACT_ADDRESS,
            data: addEncodedData,
            value: amount
        });
        console.log("Add stake raw transaction hash:", addRawTx.hash);
        await addRawTx.wait();
        console.log("Add stake raw transaction confirmed!");
        
        // ===== GET STAKE EXAMPLES =====
        console.log("\n=== GET STAKE EXAMPLES ===");
        const stakeAmount = await stakingContract.getStake(hotkey, coldkey, netuid);
        console.log("Stake amount:", stakeAmount);

        // ===== REMOVE STAKE EXAMPLES =====
        console.log("\n=== REMOVE STAKE EXAMPLES ===");
        
        // Method 1: Direct contract call (recommended)
        console.log("Calling removeStake directly...");
        const removeTx = await stakingContract.removeStake(hotkey, stakeAmount, netuid);
        console.log("Remove stake transaction hash:", removeTx.hash);
        await removeTx.wait();
        console.log("Remove stake transaction confirmed!");
        
    } catch (error) {
        console.error("Error calling staking functions:", error);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
