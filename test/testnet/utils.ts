import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

import type { TenexiumProtocol } from "../../typechain/contracts/core/TenexiumProtocol";

// Interface for contract setup return type
interface ContractSetup {
    provider: any;
    signer: any;
    contract: TenexiumProtocol;
    user: any;
}

// Utility functions
const utils = {
    getTenexiumProtocolAddress(networkName: string): string {
        const deploymentsDir = path.join(__dirname, "../..", "deployments");
        const filePath = path.join(deploymentsDir, `${networkName}.json`);
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
    async getTenexiumProtocolContract(networkName: string): Promise<ContractSetup> {
        const provider = new ethers.JsonRpcProvider(this.getRpcUrl(networkName));
        const signer = new ethers.Wallet(process.env.ETH_PRIVATE_KEY!, provider);
        const user = new ethers.Wallet(process.env.USER_PRIVATE_KEY!, provider);
        const contractAddress = this.getTenexiumProtocolAddress(networkName);
        const contract = await ethers.getContractAt("TenexiumProtocol", contractAddress, signer) as any as TenexiumProtocol;
        
        return {
            provider,
            signer,
            contract,
            user
        };
    }
};

export default utils;
export type { TenexiumProtocol, ContractSetup };
