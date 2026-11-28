import { encodeFunctionData, type Address, type Hex, type PublicClient } from 'viem';
import { airdropAbi } from './abi';
export { airdropAbi };

export const airdropDistributors: Readonly<Partial<Record<number, Address>>> = {
    1: '0xAeACfdb15284bDf93155C3616CC4a65C2C93EdFC',
    8453: '0x2e28798f592392B1A1A735D405D43DDF327634F2',
};
export interface Claim {
    index: bigint;
    account: Address;
    amount: bigint;
    proof: readonly Hex[];
    distributor?: Address;
}
export function createAirdropClient(publicClient: PublicClient, defaultDistributor?: Address) {
    function distributor(explicit?: Address): Address {
        const address = explicit ?? defaultDistributor ?? airdropDistributors[publicClient.chain?.id ?? -1];
        if (!address) throw new Error('Specify a distributor for this chain');
        return address;
    }
    return {
        buildClaim(claim: Claim): { to: Address; data: Hex } {
            return {
                to: distributor(claim.distributor),
                data: encodeFunctionData({
                    abi: airdropAbi,
                    functionName: 'claim',
                    args: [claim.index, claim.account, claim.amount, claim.proof],
                }),
            };
        },
        isClaimed(index: bigint, options: { distributor?: Address; blockNumber?: bigint } = {}): Promise<boolean> {
            return publicClient.readContract({
                address: distributor(options.distributor),
                abi: airdropAbi,
                functionName: 'isClaimed',
                args: [index],
                blockNumber: options.blockNumber,
            });
        },
    };
}
