import { ethers } from "hardhat";
import utils from "./utils";

// Interface for the neuron data structure
interface NeuronData {
    id: number;
    hotkey: string;
    coldkey: string;
    daily_reward: number;
    deposits: Array<{
        id: number;
        deposit_address: string;
        amount_deposited: number;
        lp_shares: number;
    }>;
}

interface DepositAddressWithAmount {
    depositAddress: string;
    amount: string;
}

async function fetchNeuronsData(apiUrl: string): Promise<NeuronData[]> {
    try {
        console.log(`🔍 Fetching neurons data from: ${apiUrl}`);
        
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const neurons: NeuronData[] = await response.json();
        console.log(`✅ Successfully fetched ${neurons.length} neurons`);
        
        return neurons;
    } catch (error) {
        console.error("❌ Error fetching neurons data:", error);
        throw error;
    }
}

function getDepositAddresses(neurons: NeuronData[]): DepositAddressWithAmount[] {
    const depositAddressesWithAmount: DepositAddressWithAmount[] = [];
    
    neurons.forEach(neuron => {
        neuron.deposits.forEach(deposit => {
            if (!depositAddressesWithAmount.some(address => address.depositAddress === deposit.deposit_address)) {
                depositAddressesWithAmount.push({ depositAddress: deposit.deposit_address, amount: deposit.amount_deposited.toString() });
            }
        });
    });
    
    return depositAddressesWithAmount;
}

// async test_lps_check(contract: TenexiumProtocol){

// }

async function main() {
    const networkName = process.env.NETWORK_NAME || "mainnet";
    const prKey = process.env.ETH_PRIVATE_KEY || "";
    const { provider, signer, contract } = await utils.getTenexiumProtocolContract(networkName, prKey);
    const TenexiumProtocolContractAddress = contract.target;

    const apiUrl = process.env.BACKEND_API_URL + "/api/v1/neurons/";
    
    try {
        // Fetch neurons data from API
        const neurons = await fetchNeuronsData(apiUrl);
        
        // Get deposit addresses
        const depositAddressesWithAmount = getDepositAddresses(neurons);
        
        console.log("\n📋 Deposit Addresses with Amount:");
        console.log("=" .repeat(50));
        let totalAmount = BigInt(0);
        let totalAmount1 = BigInt(0);
        depositAddressesWithAmount.forEach(async (address, index) => {
            totalAmount += ethers.parseEther(address.amount);
            const lpInfo = await contract.liquidityProviders(address.depositAddress);
            totalAmount1 += lpInfo[0];
            console.log(`${index + 1}. ${address.depositAddress}: ${address.amount} ${ethers.formatEther(lpInfo[0])}`, ethers.parseEther(address.amount)===lpInfo[0] ? "✅" : "❌");
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log(`\n💰 Total Amount: ${ethers.formatEther(totalAmount)}, ${ethers.formatEther(totalAmount1)}`, totalAmount.toString()===totalAmount1.toString() ? "✅" : "❌");
        console.log(`\n💰 Found ${depositAddressesWithAmount.length} unique deposit addresses`);
        
    } catch (error) {
        console.error("❌ Error:", error);
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error("❌ Error:", error);
    process.exitCode = 1;
});
