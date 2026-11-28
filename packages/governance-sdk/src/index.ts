import type { Address, PublicClient } from 'viem';
import { governanceVaultAbi } from '../../oyster-governance/src/governanceVaultAbi';
import { defaultMulticall, stakingClient, type StakingClient } from '../../oyster-governance/src/staking';
export { governanceVaultAbi };
export { governanceTokenAbi } from '../../oyster-governance/src/governanceTokenAbi';
export * from '../../oyster-governance/src/math';
export type { StakingClient, StakingInfo } from '../../oyster-governance/src/staking';
export { GovernanceDataSource } from '../../oyster-governance-data-source/src';
export type { HistoryQuery, TransactionEvent, PendingUnstakeWithTx } from '../../oyster-governance-data-source/src';

// These are the independent governance SDK deployments, including its Sepolia deployment.
const deployment = {
    vault: '0xB02585D7d561Cf3469CCDC4447a63C3F4dB8d7D8',
    token: '0x91DcdBa5032657D5573036fEf15724deF8CD2316',
    multicall: defaultMulticall,
} as const;
export interface GovernanceDeployment {
    vault: Address;
    token: Address;
    multicall: Address;
}
export const governanceDeployments: Readonly<Partial<Record<number, GovernanceDeployment>>> = {
    1: deployment,
    11155111: deployment,
};

export function createGovernanceClient(
    publicClient: PublicClient,
    config?: GovernanceDeployment
): StakingClient & { token: Address } {
    const selected = config ?? governanceDeployments[publicClient.chain?.id ?? -1];
    if (!selected) throw new Error('Specify the governance deployment for this chain');
    return {
        ...stakingClient(publicClient, selected.vault, selected.multicall, governanceVaultAbi),
        token: selected.token,
    };
}
