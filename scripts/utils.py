import os
import json
from typing import Any
import hashlib
import scalecodec
from pathlib import Path
from dotenv import load_dotenv
from eth_account import Account
from web3 import Web3

class TenexUtils:
    @staticmethod
    def get_proxy_address(network_name: str, contract_name: str) -> str:
        """Get TenexiumProtocol contract address from deployment config"""
        deployments_dir = Path(__file__).parent.parent / "deployments"
        file_path = deployments_dir / f"{network_name}-{contract_name}.json"
        
        if not file_path.exists():
            raise FileNotFoundError(f"Deployment config not found for {network_name}")
            
        with open(file_path, 'r') as f:
            existing_data = json.load(f)
            
        return existing_data.get("tenexiumProtocol", {}).get("proxy", "")
    
    @staticmethod
    def get_rpc_url(network_name: str) -> str:
        """Get RPC URL for the specified network"""
        if network_name == "testnet":
            return "https://test.chain.opentensor.ai"
        elif network_name == "mainnet":
            return "https://lite.chain.opentensor.ai"
        else:
            raise ValueError(f"Unsupported network: {network_name}")
    
    @staticmethod
    def get_signer_for_miner() -> tuple[Web3, str, Account, str]:
        """Get Web3 instance and account from MINER_ETH_PRIVATE_KEY"""
        load_dotenv()
        network = os.getenv("NETWORK", "mainnet")
        private_key = os.getenv("MINER_ETH_PRIVATE_KEY")
        if not private_key:
            raise ValueError("MINER_ETH_PRIVATE_KEY environment variable is required")
            
        # Remove 0x prefix if present
        if private_key.startswith("0x"):
            private_key = private_key[2:]

        hotkey = os.getenv("MINER_HOTKEY")
        if not hotkey:
            raise ValueError("MINER_HOTKEY environment variable is required")
            
        w3 = TenexUtils.get_web3_instance(network)
        account = Account.from_key(private_key)
        
        return w3, network, account, hotkey

    @staticmethod
    def get_signer_for_validator() -> tuple[Web3, str, Account, int]:
        """Get Web3 instance and account from VALIDATOR_ETH_PRIVATE_KEY"""
        load_dotenv()
        network = os.getenv("NETWORK", "mainnet")
        private_key = os.getenv("VALIDATOR_ETH_PRIVATE_KEY")
        if not private_key:
            raise ValueError("VALIDATOR_ETH_PRIVATE_KEY environment variable is required")
        
        # Remove 0x prefix if present
        if private_key.startswith("0x"):
            private_key = private_key[2:]

        w3 = TenexUtils.get_web3_instance(network)
        account = Account.from_key(private_key)
        weight_update_interval_blocks = int(os.getenv("WEIGHT_UPDATE_INTERVAL_BLOCKS", "100"))
        
        return w3, network, account, weight_update_interval_blocks

    @staticmethod
    def get_web3_instance(network: str) -> Web3:
        """Get Web3 instance for the specified network"""
        rpc_url = TenexUtils.get_rpc_url(network)
        if not rpc_url:
            raise ValueError(f"Unsupported network: {network}")
            
        return Web3(Web3.HTTPProvider(rpc_url))

    @staticmethod
    def get_contract_abi(function_name: str) -> list:
        """Get contract ABI for the specified network"""
        if function_name == "addLiquidity":
            return [
                {
                    "inputs": [],
                    "name": "addLiquidity",
                    "outputs": [],
                    "stateMutability": "payable",
                    "type": "function"
                }
            ]
        elif function_name == "removeLiquidity":
            return [
                {
                    "inputs": [
                        {"type": "uint256", "name": "amount"},
                    ],
                    "name": "removeLiquidity",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                }
            ]
        elif function_name == "getProtocolStats":
            return [
                {
                    "inputs": [],
                    "name": "getProtocolStats",
                    "outputs": [
                        {"type": "uint256", "name": "totalCollateralAmount"},
                        {"type": "uint256", "name": "totalBorrowedAmount"},
                        {"type": "uint256", "name": "totalVolumeAmount"},
                        {"type": "uint256", "name": "totalTradesCount"},
                        {"type": "uint256", "name": "protocolFeesAmount"},
                        {"type": "uint256", "name": "totalLpStakesAmount"},
                    ],
                    "stateMutability": "view",
                    "type": "function",
                }
            ]
        elif function_name == "liquidityProviders":
            return [
                {
                    "inputs": [
                        {"type": "address", "name": ""},
                    ],
                    "name": "liquidityProviders",
                    "outputs": [
                        {"type": "uint256", "name": "stake"},
                        {"type": "uint256", "name": "rewards"},
                        {"type": "uint256", "name": "lastRewardBlock"},
                        {"type": "uint256", "name": "shares"},
                        {"type": "uint256", "name": "rewardDebt"},
                        {"type": "bool", "name": "isActive"},
                    ],
                    "stateMutability": "view",
                    "type": "function",
                }
            ]
        elif function_name == "totalLpFees":
            return [
                {
                    "inputs": [],
                    "name": "totalLpFees",
                    "outputs": [
                        {"type": "uint256", "name": ""},
                    ],
                    "stateMutability": "view",
                    "type": "function",
                }
            ]
        elif function_name == "totalLpStakes":
            return [
                {
                    "inputs": [],
                    "name": "totalLpStakes",
                    "outputs": [{"type": "uint256", "name": ""}],
                    "stateMutability": "view",
                    "type": "function",
                }
            ]
        elif function_name == "liquidityCircuitBreaker":
            return [
                {
                    "inputs": [],
                    "name": "liquidityCircuitBreaker",
                    "outputs": [{"type": "bool", "name": ""}],
                    "stateMutability": "view",
                    "type": "function",
                }
            ]
        elif function_name == "setAssociate":
            return [
                {
                    "inputs": [{"type": "bytes32", "name": "hotkey"}],
                    "name": "setAssociate",
                    "outputs": [{"type": "bool", "name": ""}],
                    "stateMutability": "nonpayable",
                    "type": "function",
                }
            ]
        elif function_name == "setWeights":
            return [
                {
                    "inputs": [],
                    "name": "setWeights",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function",
                }
            ]
        else:
            raise ValueError(f"Unsupported function: {function_name}")

    @staticmethod
    def get_contract(function_name:str, w3: Web3, network: str, contract_name: str) -> Any:
        """Get contract for the specified function"""
        return w3.eth.contract(
            address=TenexUtils.get_proxy_address(network, contract_name),
            abi=TenexUtils.get_contract_abi(function_name)
        )

    @staticmethod
    def h160_to_ss58(h160_address: str, ss58_format: int = 42) -> str:
        if h160_address.startswith("0x"):
            h160_address = h160_address[2:]
        address_bytes = bytes.fromhex(h160_address)
        prefixed_address = bytes("evm:", "utf-8") + address_bytes
        checksum = hashlib.blake2b(prefixed_address, digest_size=32).digest()
        return scalecodec.ss58_encode(checksum, ss58_format=ss58_format)
