import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

// IStaking contract interface
const NEURON_ABI = [
    "function burnedRegister(uint16 netuid, bytes32 hotkey) external payable",
];

async function main() {
    const provider = new ethers.JsonRpcProvider("https://test.chain.opentensor.ai");
    const signer = new ethers.Wallet(process.env.ETH_PRIVATE_KEY!, provider);
    const NEURON_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000804";
    
    // Create contract instance
    const neuronContract = new ethers.Contract(NEURON_CONTRACT_ADDRESS, NEURON_ABI, signer);
    
    // Example parameters
    const hotkey = "Your 32 bytes hotkey here"; // 32 bytes hotkey
    const netuid = 67; // subnet ID
    
    try {
        console.log("=== REGISTER EXAMPLES ===");
        
        console.log("Calling burnedRegister directly...");
        const registerTx = await neuronContract.burnedRegister(netuid, hotkey);
        console.log("Burned register transaction hash:", registerTx.hash);
        await registerTx.wait();
        console.log("Burned register transaction confirmed!");
        
    } catch (error) {
        console.error("Error calling neuron functions:", error);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
