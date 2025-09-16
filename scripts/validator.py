import asyncio
import sys
import bittensor as bt

from utils import TenexUtils

class TenexiumValidator:   
    def __init__(self):
        """Initializes the Tenexium Validator"""
        self.w3, self.network, self.wallet, self.netuid, self.endpoint, self.logging_level, self.weight_update_interval_blocks = TenexUtils.get_signer_for_normal_validator()
        self.subtensor = bt.subtensor(self.endpoint)
        self.metagraph = self.subtensor.metagraph(self.netuid)
        self.hyperparams = self.subtensor.query_runtime_api(
            runtime_api="SubnetInfoRuntimeApi",
            method="get_subnet_hyperparams",
            params=self.netuid,
            block=self.subtensor.get_current_block(),
        )
        self.last_weight_update_block = self.subtensor.get_current_block()
        self.tenexium_contract = TenexUtils.get_contract("NormalValidationFunctions", self.w3, self.network, "tenexiumProtocol")
        # Check if the hotkey is registered
        self.check_registered()
        bt.logging.info(f"Initialized Tenexium Validator")
    
    def check_registered(self):
        """
        Method to check if the hotkey configured to be used by the neuron is registered in the subnet.
        """
        bt.logging.debug("Checking registration...")
        if not self.subtensor.is_hotkey_registered(
            netuid=self.config.netuid,
            hotkey_ss58=self.wallet.hotkey.ss58_address,
        ):
            bt.logging.error(
                f"Wallet: {self.wallet} is not registered on netuid {self.config.netuid}."
                f" Please register the hotkey using `btcli subnets register` before trying again"
            )
            exit()        
        bt.logging.debug(f"Key {self.config.wallet.name}.{self.config.wallet.hotkey} ({self.wallet.hotkey.ss58_address}) is registered.")
    
    async def run_validator(self):
        """Main validator loop (block-driven)"""
        bt.logging.info("Starting Tenexium Validator (block-driven)...")
        bt.logging.info(f"Netuid: {self.netuid}")
        bt.logging.info(f"Endpoint: {self.subtensor.chain_endpoint}")
        bt.logging.info(f"Signer: {self.wallet.hotkey}")
        bt.logging.info(f"Last Weight Update Block: {self.last_weight_update_block}")
        balance = self.wallet.balance()
        balance_tao = balance / 10**18
        bt.logging.info(f"Balance: {balance_tao} TAO")

        while True:
            try:
                current_block = self.subtensor.get_current_block()

                # Update weights
                if self.should_update_weights(current_block):
                    await self.update_weights(current_block)
                asyncio.sleep(12)
                
            except KeyboardInterrupt:
                bt.logging.info("Validator stopped by user")
                break
            except Exception as e:
                bt.logging.error(f"Validator error: {e}")
                asyncio.sleep(12)
    
    def should_update_weights(self, current_block: int) -> bool:
        return (current_block - self.last_weight_update_block) >= self.weight_update_interval_blocks
    
    async def update_weights(self, current_block: int):
        """Calculate and set weights based on miner contributions"""
        try:
            bt.logging.info(f"Updating weights at block {current_block}")
            result, msg = await self.set_weights()
            if result:
                self.last_weight_update_block = current_block
                bt.logging.info(f"Successfully updated weights at block {current_block}")
            else:
                bt.logging.error(f"Failed to update weights: {msg}")
        except Exception as e:
            bt.logging.error(f"Failed to update weights: {e}")
            raise e
    
    async def set_weights(self):
        """
        Weight setting function
        """
        # Get relevant hyperparameters
        version_key = self.hyperparams["weights_version"]
        commit_reveal_weights_enabled = bool(self.hyperparams["commit_reveal_weights_enabled"])
        # Prepare weights for submission
        uint_uids, uint_weights = await self.prepare_weights()
        bt.logging.info(f"`commit_reveal_weights_enabled` : {commit_reveal_weights_enabled}")
        bt.logging.info(f"Weights: {uint_weights}")
        bt.logging.info(f"Uids: {uint_uids}")
        result, msg = self.subtensor.set_weights(
            wallet=self.wallet,
            netuid=self.netuid,
            uids=uint_uids,
            weights=uint_weights,
            wait_for_inclusion=False,
            wait_for_finalization=False,
            version_key=version_key,
        )
        return result
    
    async def prepare_weights(self):
        """
        Prepare weights for submission
        """
        U16_MAX = 65535
        uint_uids, uint_weights = await self.get_unnormalized_weights()
        bt.logging.info(f"Unnormalized weights: {uint_weights}")
        bt.logging.info(f"Unnormalized uids: {uint_uids}")

        total_weight = sum(uint_weights)
        bt.logging.info(f"Total weight: {total_weight}")
        
        if total_weight == 0:
            uint_weights[0] = U16_MAX
        else:
            for i in range(1, len(uint_weights)):
                uint_weights[i] = (uint_weights[i] * U16_MAX) / total_weight
        return uint_uids, uint_weights
    
    async def get_unnormalized_weights(self):
        """
        Get unnormalized weights
        """
        uint_uids = self.metagraph.uids
        max_liquidity_providers_per_hotkey = self.tenexium_contract.maxLiquidityProvidersPerHotkey()
        uint_weights = [0] * len(uint_uids)
        for uid in enumerate(uint_uids):
            if uid == 0:
                continue
            hotkey = self.metagraph.hotkeys[uid]
            hotkey_bytes32 = TenexUtils.ss58_to_bytes32(hotkey)
            liquidity_provider_count = await self.tenexium_contract.liquidityProviderSetLength(hotkey_bytes32)
            if liquidity_provider_count > max_liquidity_providers_per_hotkey:
                max_liquidity_providers = max_liquidity_providers_per_hotkey
            else:
                max_liquidity_providers = liquidity_provider_count
            for i in range(max_liquidity_providers):
                liquidity_provider = await self.tenexium_contract.groupLiquidityProviders(hotkey, i)
                liquidity_provider_balance = await self.tenexium_contract.liquidityProviders(liquidity_provider).stake
                uint_weights[uid] += liquidity_provider_balance
        return uint_uids, uint_weights


def main():
    validator = TenexiumValidator()
    try:
        asyncio.run(validator.run_validator())
    except KeyboardInterrupt:
        bt.logging.info("Validator is shutdown requested")
    finally:
        sys.exit(0)

if __name__ == "__main__":
    main() 
