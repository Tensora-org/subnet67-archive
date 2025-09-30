import { ethers } from "hardhat";

const addressToSS58PubAbi = [
    "function addressToSS58Pub(address addr) public view returns (bytes32)",
];

async function main() {
    const provider = new ethers.JsonRpcProvider("https://test.chain.opentensor.ai");
    const signer = new ethers.Wallet(process.env.ETH_PRIVATE_KEY!, provider);
    const ADDRESS_CONVERSION_CONTRACT_ADDRESS = "0xC703186c3811375eB66262a4E82AF40ADD85FD61";
    const addressConversion = new ethers.Contract(ADDRESS_CONVERSION_CONTRACT_ADDRESS, addressToSS58PubAbi, signer);
    const address = await addressConversion.addressToSS58Pub(ADDRESS_CONVERSION_CONTRACT_ADDRESS);
    console.log(address);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
