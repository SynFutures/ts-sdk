import { decodeFunctionResult, encodeFunctionData, parseAbi, type Address, type Hex, type PublicClient } from 'viem';
import type { governanceVaultAbi } from './governanceVaultAbi';
import type { oysterVaultAbi } from './oysterVaultAbi';

// The deployed aggregate is payable; use eth_call to read both values from a single block.
const aggregateAbi = parseAbi([
    'function aggregate((address target, bytes callData)[] calls) view returns (uint256 blockNumber, bytes[] returnData)',
]);
export const defaultMulticall = '0xcA11bde05977b3631167028862bE2a173976CA11';
export interface StakingInfo {
    stakes: bigint;
    pendingUnstakes: { index: bigint; amount: bigint; createTime: bigint; releaseTime: bigint }[];
}
export interface StakingClient {
    vault: Address;
    buildStake(amount: bigint): { to: Address; data: Hex };
    buildUnstake(amount: bigint): { to: Address; data: Hex };
    buildRelease(index: bigint): { to: Address; data: Hex };
    getStakingInfo(account: Address, options?: { blockNumber?: bigint }): Promise<StakingInfo>;
}
export function stakingClient(
    publicClient: PublicClient,
    vault: Address,
    multicall: Address,
    abi: typeof oysterVaultAbi | typeof governanceVaultAbi
): StakingClient {
    const build = (functionName: 'stake' | 'unstake' | 'release', value: bigint) => ({
        to: vault,
        data: encodeFunctionData({ abi, functionName, args: [value] }),
    });
    return {
        vault,
        buildStake: (amount) => build('stake', amount),
        buildUnstake: (amount) => build('unstake', amount),
        buildRelease: (index) => build('release', index),
        async getStakingInfo(account, { blockNumber } = {}) {
            const calls = [
                { target: vault, callData: encodeFunctionData({ abi, functionName: 'pendingDuration' }) },
                {
                    target: vault,
                    callData: encodeFunctionData({ abi, functionName: 'accountStakeInfo', args: [account] }),
                },
            ];
            const [, results] = await publicClient.readContract({
                address: multicall,
                abi: aggregateAbi,
                functionName: 'aggregate',
                args: [calls],
                blockNumber,
            });
            if (results.length !== 2) throw new Error('Expected two staking multicall results');
            const duration = decodeFunctionResult({ abi, functionName: 'pendingDuration', data: results[0] });
            const [stakes, pending] = decodeFunctionResult({ abi, functionName: 'accountStakeInfo', data: results[1] });
            const pendingUnstakes = pending.map((row, i) => ({
                index: BigInt(i),
                amount: row.amount,
                createTime: BigInt(row.createTime),
                releaseTime: BigInt(row.createTime) + duration,
            }));
            pendingUnstakes.sort((a, b) => (a.createTime < b.createTime ? -1 : a.createTime > b.createTime ? 1 : 0));
            return { stakes, pendingUnstakes };
        },
    };
}
