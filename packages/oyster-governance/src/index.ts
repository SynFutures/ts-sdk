import type { Address, PublicClient } from 'viem';
import { defaultMulticall, stakingClient, type StakingClient } from './staking';
import { oysterVaultAbi } from './oysterVaultAbi';
export { oysterVaultAbi };
export { governanceTokenAbi } from './governanceTokenAbi';
export type { StakingClient, StakingInfo } from './staking';
export * from './math';

export const oysterVaults: Readonly<Partial<Record<number, Address>>> = {
    1: '0x93432aFf5A44865Bd2cfC028C147AE1D0094cf05',
};
export const oysterTokens = {
    1: { name: 'SynFutures', symbol: 'S', decimals: 18, address: '0x6e15A54B5EcAc17e58daDedDbe8506a7560252F9' },
    8453: { name: 'SynFutures', symbol: 'S', decimals: 18, address: '0x2C24497D4086490e7EaD87CC12597fb50c2E6eD6' },
} as const;
export function createOysterGovernanceClient(
    publicClient: PublicClient,
    options: { vault?: Address; multicall?: Address } = {}
): StakingClient {
    const vault = options.vault ?? oysterVaults[publicClient.chain?.id ?? -1];
    if (!vault) throw new Error('Specify a staking vault for this chain');
    return stakingClient(publicClient, vault, options.multicall ?? defaultMulticall, oysterVaultAbi);
}
