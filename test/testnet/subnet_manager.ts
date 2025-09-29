import { ethers } from "hardhat";
import utils from "./utils";
import { ErrorDecoder } from "ethers-decode-error";

async function main() {
    const networkName = process.env.NETWORK_NAME || "mainnet";
    const { provider, signer, contract } = await utils.getSubnetManagerContract(networkName);
    const SubnetManagerContractAddress = contract.target;

    console.log("🔍 Testing TenexiumProtocol Subnet Manager on " + networkName);
    console.log("=" .repeat(60));
    console.log("SubnetManagerContractAddress:", SubnetManagerContractAddress);
    console.log("RPC URL:", utils.getRpcUrl(networkName));
    console.log("Signer:", signer.address);
    console.log("Contract Balance:", ethers.formatEther(await provider.getBalance(SubnetManagerContractAddress)), "TAO");
    
    const errorDecoder = ErrorDecoder.create();

    try {
        console.log("TenexiumContract", await contract.TenexiumContract());
        const TENEX_NETUID = await contract.TENEX_NETUID();
        console.log("TENEX_NETUID", TENEX_NETUID);
        const versionKey = await contract.versionKey();
        console.log("versionKey", versionKey);

        // Via SubnetManager contract
        console.log("\n➕ Setting Weights...");
        const setWeightsTx = await contract.connect(signer).setWeights();
        console.log(`   Transaction Hash: ${setWeightsTx.hash}`);
        await setWeightsTx.wait();
        console.log("   ✅ Weights set successfully!");
        
    } catch (error) {
        console.error("❌ Error during subnet manager test:", error);
        const decodedError = await errorDecoder.decode(error as Error);
        console.log("Decoded Error:", decodedError);
    }
}

main().catch((error) => {
    console.error("❌ Error:", error);
    process.exitCode = 1;
});
