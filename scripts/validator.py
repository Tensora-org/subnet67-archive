import asyncio
import logging
import json
import os
from typing import Dict, List, Optional
from dataclasses import dataclass
from pathlib import Path

import bittensor as bt
from web3 import Web3

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@dataclass
class MinerContribution:
    """Represents a miner's contribution to the protocol"""
    hotkey: str
    liquidity_provided: float
    liquidation_activity: float
    total_score: float
    last_updated_block: int

@dataclass
class ProtocolMetrics:
    """Protocol health and performance metrics"""
    total_liquidity: float
    total_borrowed: float
    total_liquidations: int
    health_ratio: float
    last_updated_block: int

class TenexiumValidator:   
    def __init__(self, config: bt.config):
        """Initializes the Tenexium Validator"""
        self.config = config
        self.wallet = bt.wallet(config=config)
        self.subtensor = bt.subtensor(config=config)
        self.metagraph = self.subtensor.metagraph(netuid=67)
        
        # Protocol configuration
        self.netuid = int(os.getenv("NETUID", "67"))
        self.contract_address = os.getenv("TENEXIUM_CONTRACT_ADDRESS", "0x...")
        self.weight_update_interval_blocks = int(os.getenv("WEIGHT_UPDATE_INTERVAL_BLOCKS", "100"))
        
        # Web3 setup for EVM interactions
        self.setup_web3()
        
        # Validation state
        self.miner_contributions: Dict[str, MinerContribution] = {}
        self.protocol_metrics = ProtocolMetrics(0, 0, 0, 0, 0)
        self.last_processed_block = self.subtensor.get_current_block()
        self.last_weight_update_block = self.last_processed_block
        
        logger.info(f"Initialized Tenexium Validator for hotkey: {self.wallet.hotkey.ss58_address}")
    
    def setup_web3(self):
        """Setup Web3 connection for EVM interactions"""
        try:
            rpc_url = os.getenv("TENEXIUM_EVM_RPC_URL", "https://lite.chain.opentensor.ai")
            self.w3 = Web3(Web3.HTTPProvider(rpc_url))
            
            if not self.w3.is_connected():
                logger.error("Failed to connect to Bittensor EVM")
                self.w3 = None
                return
            
            # Contract ABI for required read functions
            self.contract_abi = [
                {
                    "inputs": [],
                    "name": "getProtocolStats",
                    "outputs": [
                        {"type": "uint256"},  # totalCollateralAmount
                        {"type": "uint256"},  # totalBorrowedAmount
                        {"type": "uint256"},  # totalVolumeAmount
                        {"type": "uint256"},  # totalTradesCount
                        {"type": "uint256"},  # protocolFeesAmount
                        {"type": "uint256"},  # totalLpStakesAmount
                        {"type": "uint256"}   # activePairsCount
                    ],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [
                        {"internalType": "address", "name": "lpAddress", "type": "address"}
                    ],
                    "name": "getLpInfo",
                    "outputs": [
                        {"internalType": "uint256", "name": "stake", "type": "uint256"},
                        {"internalType": "uint256", "name": "shares", "type": "uint256"},
                        {"internalType": "uint256", "name": "sharePercentage", "type": "uint256"}
                    ],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [
                        {"internalType": "address", "name": "", "type": "address"}
                    ],
                    "name": "liquidatorScores",
                    "outputs": [
                        {"internalType": "uint256", "name": "", "type": "uint256"}
                    ],
                    "stateMutability": "view",
                    "type": "function"
                }
            ]
            
            # Initialize contract instance
            if Web3.is_address(self.contract_address) and self.contract_address != "0x...":
                self.contract = self.w3.eth.contract(
                    address=Web3.to_checksum_address(self.contract_address),
                    abi=self.contract_abi
                )
                logger.info(f"Connected to Tenexium contract at {self.contract_address}")
            else:
                self.contract = None
                logger.warning("TENEXIUM_CONTRACT_ADDRESS not set; running in metric-mock mode")
                
        except Exception as e:
            logger.error(f"Failed to setup Web3: {e}")
            self.w3 = None

    async def run_validator(self):
        """Main validator loop (block-driven)"""
        logger.info("Starting Tenexium Validator (block-driven)...")
        
        while True:
            try:
                current_block = self.subtensor.get_current_block()

                try:
                    self.metagraph.sync(subtensor=self.subtensor)
                except Exception as e:
                    logger.debug(f"Metagraph sync warning: {e}")
                
                # Gather protocol metrics
                await self.gather_protocol_metrics(current_block)
                
                # Validate miner contributions
                await self.validate_miners(current_block)
                
                # Update weights
                if self.should_update_weights(current_block):
                    await self.update_weights(current_block)
                
                self.log_validation_status()
                self.last_processed_block = current_block
                
            except KeyboardInterrupt:
                logger.info("Validator stopped by user")
                break
            except Exception as e:
                logger.error(f"Validator error: {e}")
                await asyncio.sleep(3)
    
    async def gather_protocol_metrics(self, current_block: int):
        """Gather metrics from the protocol smart contract"""
        if not self.w3 or not self.contract:
            logger.warning("Web3/contract not available, using mock metrics")
            return
        
        try:
            stats = self.contract.functions.getProtocolStats().call()
            totalBorrowedAmount = stats[1]
            totalLpStakesAmount = stats[5]
            
            total_liquidity_tao = totalLpStakesAmount / 1e18
            total_borrowed_tao = totalBorrowedAmount / 1e18
            
            # Health ratio
            denom = total_borrowed_tao if total_borrowed_tao > 0 else 1.0
            health_ratio = total_liquidity_tao / denom

            self.protocol_metrics = ProtocolMetrics(
                total_liquidity=total_liquidity_tao,
                total_borrowed=total_borrowed_tao,
                total_liquidations=self.protocol_metrics.total_liquidations if hasattr(self.protocol_metrics, 'total_liquations') else self.protocol_metrics.total_liquidations,
                health_ratio=health_ratio,
                last_updated_block=current_block
            )

        except Exception as e:
            logger.error(f"Failed to gather protocol metrics: {e}")
    
    def _ss58_to_evm(self, ss58: str) -> Optional[str]:
        """Best-effort conversion from SS58 to 0x address."""
        try:
            hex_part = ''.join(c for c in ss58 if c.isalnum())[-40:]
            if len(hex_part) == 40:
                return Web3.to_checksum_address("0x" + hex_part)
        except Exception:
            pass
        return None

    async def validate_miners(self, current_block: int):
        """Validate and score miner contributions"""
        try:
            hotkeys: List[str] = list(self.metagraph.hotkeys)
        except Exception:
            try:
                hotkeys = [axon.hotkey for axon in self.metagraph.axons]
            except Exception:
                hotkeys = []
        
        for hotkey in hotkeys:
            try:
                miner_address = self._ss58_to_evm(hotkey)
                liquidity_score = 0.0
                liquidator_score = 0.0
                if self.w3 and self.contract and miner_address:
                    try:
                        stake, _, _ = self.contract.functions.getLpInfo(miner_address).call()
                        liquidity_score = float(stake) / 1e18
                    except Exception as e:
                        logger.debug(f"getLpInfo failed for {hotkey}: {e}")
                    try:
                        lscore = self.contract.functions.liquidatorScores(miner_address).call()
                        liquidator_score = float(lscore)
                    except Exception as e:
                        logger.debug(f"liquidatorScores failed for {hotkey}: {e}")
                total_score = (liquidity_score * 0.7) + (liquidator_score * 0.3)
                self.miner_contributions[hotkey] = MinerContribution(
                    hotkey=hotkey,
                    liquidity_provided=liquidity_score,
                    liquidation_activity=liquidator_score,
                    total_score=total_score,
                    last_updated_block=current_block
                )
            except Exception as e:
                logger.error(f"Failed to validate miner {hotkey}: {e}")
                self.miner_contributions[hotkey] = MinerContribution(
                    hotkey=hotkey,
                    liquidity_provided=0,
                    liquidation_activity=0,
                    total_score=0,
                    last_updated_block=current_block
                )
    
    def should_update_weights(self, current_block: int) -> bool:
        return (current_block - self.last_weight_update_block) >= self.weight_update_interval_blocks
    
    async def update_weights(self, current_block: int):
        """Calculate and set weights based on miner contributions"""
        try:
            weights = self.calculate_weights()
            n_miners = len(self.metagraph.hotkeys)
            uids = list(range(n_miners))
            result = self.subtensor.set_weights(
                wallet=self.wallet,
                netuid=self.netuid,
                uids=uids,
                weights=weights,
                wait_for_inclusion=True
            )
            if result:
                logger.info(f"Successfully updated weights (n={len(weights)}) at block {current_block}")
                self.last_weight_update_block = current_block
            else:
                logger.error("Failed to set weights")
        except Exception as e:
            logger.error(f"Failed to update weights: {e}")
    
    def calculate_weights(self) -> List[float]:
        try:
            hotkeys = list(self.metagraph.hotkeys)
        except Exception:
            hotkeys = []
        n_miners = len(hotkeys)
        if n_miners == 0:
            return []
        weights = [0.0] * n_miners
        total_score = sum(c.total_score for c in self.miner_contributions.values())
        if total_score == 0:
            return [1.0 / n_miners] * n_miners
        index_of: Dict[str, int] = {hk: i for i, hk in enumerate(hotkeys)}
        for hk, contrib in self.miner_contributions.items():
            if hk in index_of:
                weights[index_of[hk]] = contrib.total_score / total_score
        s = sum(weights)
        if s > 0:
            weights = [w / s for w in weights]
        return weights
    
    def log_validation_status(self):
        active_miners = len([c for c in self.miner_contributions.values() if c.total_score > 0])
        logger.info(
            f"Validation Status - Active Miners: {active_miners}, "
            f"Total Liquidity: {self.protocol_metrics.total_liquidity:.2f} TAO, "
            f"Health Ratio: {self.protocol_metrics.health_ratio:.2f}, "
            f"Last Block: {self.protocol_metrics.last_updated_block}"
        )
    
    def save_state(self):
        try:
            state = {
                'miner_contributions': {
                    k: {
                        'hotkey': v.hotkey,
                        'liquidity_provided': v.liquidity_provided,
                        'liquidation_activity': v.liquidation_activity,
                        'total_score': v.total_score,
                        'last_updated_block': v.last_updated_block
                    }
                    for k, v in self.miner_contributions.items()
                },
                'protocol_metrics': {
                    'total_liquidity': self.protocol_metrics.total_liquidity,
                    'total_borrowed': self.protocol_metrics.total_borrowed,
                    'total_liquidations': self.protocol_metrics.total_liquations if hasattr(self.protocol_metrics, 'total_liquations') else self.protocol_metrics.total_liquidations,
                    'health_ratio': self.protocol_metrics.health_ratio,
                    'last_updated_block': self.protocol_metrics.last_updated_block
                },
                'last_weight_update_block': self.last_weight_update_block,
                'last_processed_block': self.last_processed_block
            }
            with open('tenexium_validator_state.json', 'w') as f:
                json.dump(state, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save state: {e}")
    
    def load_state(self):
        try:
            if Path('tenexium_validator_state.json').exists():
                with open('tenexium_validator_state.json', 'r') as f:
                    state = json.load(f)
                for k, v in state.get('miner_contributions', {}).items():
                    self.miner_contributions[k] = MinerContribution(**v)
                metrics_data = state.get('protocol_metrics', {})
                if metrics_data:
                    self.protocol_metrics = ProtocolMetrics(**metrics_data)
                self.last_weight_update_block = state.get('last_weight_update_block', self.subtensor.get_current_block())
                self.last_processed_block = state.get('last_processed_block', self.subtensor.get_current_block())
                logger.info("Validator state loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load state: {e}")

def main():
    config = bt.config()
    config.wallet.name = getattr(config.wallet, 'name', None) or "tenexium_validator"
    config.wallet.hotkey = getattr(config.wallet, 'hotkey', None) or "default"
    validator = TenexiumValidator(config)
    validator.load_state()
    try:
        asyncio.run(validator.run_validator())
    except KeyboardInterrupt:
        logger.info("Validator shutdown requested")
    finally:
        validator.save_state()
        logger.info("Validator state saved")

if __name__ == "__main__":
    main() 