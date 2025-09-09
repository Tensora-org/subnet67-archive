import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { TenexiumProtocol } from "../../typechain/contracts/core/TenexiumProtocol";
import { SubnetManager } from "../../typechain/contracts/modules/SubnetManager.sol/SubnetManager";

// Interface for contract setup return type
interface ContractSetupForTenexium {
    provider: any;
    signer: any;
    contract: TenexiumProtocol;
    user: any;
}

interface ContractSetupForSubnetManager {
    provider: any;
    signer: any;
    contract: SubnetManager;
}

// Utility functions
const utils = {
    getProxyAddress(networkName: string, contractName: string): string {
        const deploymentsDir = path.join(__dirname, "../..", "deployments");
        const filePath = path.join(deploymentsDir, `${networkName}-${contractName}.json`);
        const existingData = fs.existsSync(filePath) 
            ? JSON.parse(fs.readFileSync(filePath, "utf8"))
            : {};
        return existingData.tenexiumProtocol.proxy || "";
    },
    getRpcUrl(networkName: string): string {
        if (networkName === "testnet") {
            return "https://test.chain.opentensor.ai";
        } else if (networkName === "mainnet") {
            return "https://lite.chain.opentensor.ai";
        } else {
            throw new Error(`Unsupported network: ${networkName}`);
        }
    },
    async getTenexiumProtocolContract(networkName: string): Promise<ContractSetupForTenexium> {
        const provider = new ethers.JsonRpcProvider(this.getRpcUrl(networkName));
        const signer = new ethers.Wallet(process.env.ETH_PRIVATE_KEY!, provider);
        const user = new ethers.Wallet(process.env.USER_PRIVATE_KEY!, provider);
        const contractAddress = this.getProxyAddress(networkName, "tenexiumProtocol");
        const contract = await ethers.getContractAt("TenexiumProtocol", contractAddress, signer) as any as TenexiumProtocol;
        
        return {
            provider,
            signer,
            contract,
            user
        };
    },
    async getSubnetManagerContract(networkName: string): Promise<ContractSetupForSubnetManager> {
        const provider = new ethers.JsonRpcProvider(this.getRpcUrl(networkName));
        const signer = new ethers.Wallet(process.env.ETH_PRIVATE_KEY!, provider);
        const user = new ethers.Wallet(process.env.USER_PRIVATE_KEY!, provider);
        const contractAddress = this.getProxyAddress(networkName, "subnetManager");
        const contract = await ethers.getContractAt("SubnetManager", contractAddress, signer) as any as SubnetManager;
        return {
            provider,
            signer,
            contract,
        };
    }
};

export default utils;
export type { ContractSetupForTenexium, ContractSetupForSubnetManager };
