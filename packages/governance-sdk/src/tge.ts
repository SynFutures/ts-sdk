import type { Address, Hex, PublicClient } from 'viem';
import { createAirdropClient, type Claim } from '../../airdrop/src';
import { GovernanceDataSource } from '../../oyster-governance-data-source/src';
import { governanceVaultAbi } from '../../oyster-governance/src/governanceVaultAbi';
import { stakingClient, type StakingClient } from '../../oyster-governance/src/staking';
export { airdropAbi } from '../../airdrop/src';
export { governanceVaultAbi };
export * from '../../oyster-governance/src/math';

interface Request {
    to: Address;
    data: Hex;
}
export interface GasOptions {
    account?: Address;
    gas?: bigint;
    gasMultiplier?: number;
}
export interface TgeStakingConfig {
    vault: Address;
    multicall: Address;
    graphUrl: string;
}
export interface TgeClient {
    airdrop: {
        buildClaim(claim: Claim & { distributor: Address }): Request;
        isClaimed(distributor: Address, index: bigint, options?: { blockNumber?: bigint }): Promise<boolean>;
    };
    estimateRequest(request: Request, options?: GasOptions): Promise<Request & { gas: bigint }>;
}
export function createTgeClient(publicClient: PublicClient): TgeClient;
export function createTgeClient(
    publicClient: PublicClient,
    config: TgeStakingConfig
): TgeClient & { governance: StakingClient; governanceDataSource: GovernanceDataSource };
export function createTgeClient(publicClient: PublicClient, config?: TgeStakingConfig) {
    const airdrop = createAirdropClient(publicClient);
    const client: TgeClient = {
        airdrop: {
            buildClaim(claim) {
                if (!claim.distributor) throw new Error('TGE claims require an explicit distributor');
                return airdrop.buildClaim(claim);
            },
            isClaimed(distributor, index, options) {
                if (!distributor) throw new Error('TGE claims require an explicit distributor');
                return airdrop.isClaimed(index, { ...options, distributor });
            },
        },
        async estimateRequest({ to, data }, { account, gas, gasMultiplier = 1 } = {}) {
            if (gas !== undefined) {
                if (gas < 0n) throw new RangeError('Gas must be nonnegative');
                return { to, data, gas };
            }
            if (!Number.isFinite(gasMultiplier) || gasMultiplier <= 0)
                throw new RangeError('Gas multiplier must be positive');
            const rounded = Math.round(gasMultiplier * 100);
            const hundredths = rounded / 100 < gasMultiplier ? rounded + 1 : rounded;
            if (!Number.isSafeInteger(hundredths)) throw new RangeError('Gas multiplier is too large');
            const estimate = await publicClient.estimateGas({ to, data, account });
            return { to, data, gas: (estimate * BigInt(hundredths)) / 100n };
        },
    };
    if (!config) return client;
    return {
        ...client,
        governance: stakingClient(publicClient, config.vault, config.multicall, governanceVaultAbi),
        governanceDataSource: new GovernanceDataSource(config.graphUrl),
    };
}
