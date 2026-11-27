import { BigNumber, BigNumberish, CallOverrides, Contract, PopulatedTransaction, constants, providers } from 'ethers';
import { Multicall3__factory } from '@derivation-tech/web3-core';
import { ActionType, GovClient, frac, isUTCSameDay, min, wdiv } from '../build/GovClient';
import type { PendingUnstake } from '../build/GovClient';
import { GovGraph } from '../build/graph/GovGraph';
import { SynFuturesStakingVault__factory } from '../build/typechain';

export { ActionType };
export type { BoostSettings, PendingUnstake } from '../build/GovClient';
export type { PendingUnstakeWithTx, QueryHistoryParam, TransactionEvent } from '../build/graph/GovGraph';

// IMerkleDistributor from synfutures-governance. Addresses and proofs are supplied by the caller.
const distributorAbi = [
    'function isClaimed(uint256 index) view returns (bool)',
    'function claim(uint256 index, address account, uint256 amount, bytes32[] merkleProof)',
];

export interface UnsignedOptions {
    from?: string;
    gasLimit?: BigNumberish;
    gasLimitMultiple?: number;
    disableGasLimit?: boolean;
}

function withoutSender(tx: PopulatedTransaction): PopulatedTransaction {
    const unsigned = { ...tx };
    delete unsigned.from;
    return unsigned;
}

function multiplierHundredths(factor: number): BigNumber {
    const [whole, fraction = ''] = factor.toFixed(2).split('.');
    return BigNumber.from(whole).mul(100).add(fraction);
}

async function estimate(
    provider: providers.Provider,
    tx: PopulatedTransaction,
    options: UnsignedOptions,
    multiplier: number
): Promise<PopulatedTransaction> {
    const unsigned = withoutSender(tx);
    if (options.disableGasLimit) return unsigned;
    if (options.gasLimit !== undefined) return { ...unsigned, gasLimit: BigNumber.from(options.gasLimit) };
    const request: PopulatedTransaction = { ...unsigned };
    if (options.from !== undefined) request.from = options.from;
    const gas = await provider.estimateGas(request);
    const factor = options.gasLimitMultiple ?? multiplier;
    if (!factor) return { ...unsigned, gasLimit: gas };
    return { ...unsigned, gasLimit: gas.mul(multiplierHundredths(factor)).div(100) };
}

export class AirdropClient {
    constructor(
        private readonly provider: providers.Provider,
        private readonly multiplier = 1
    ) {}

    isClaimed(address: string, index: BigNumberish, overrides: CallOverrides = {}): Promise<boolean> {
        return new Contract(address, distributorAbi, this.provider).isClaimed(index, overrides);
    }

    async claim(
        address: string,
        index: BigNumberish,
        amount: BigNumberish,
        account: string,
        proof: string[],
        options: UnsignedOptions = {}
    ): Promise<PopulatedTransaction> {
        const contract = new Contract(address, distributorAbi, this.provider);
        const tx = await contract.populateTransaction.claim(index, account, amount, proof);
        return estimate(this.provider, tx, options, this.multiplier);
    }
}

export interface VotingPowerSettings {
    minThreshold: BigNumber;
    baselineAmount: BigNumber;
    maxPowerBoost: number;
}

export function simulateNextDayVotingPower(
    currentPower: BigNumber,
    lastUnstakeTime: number,
    currentStake: BigNumber,
    action: ActionType,
    amount: BigNumber,
    settings: VotingPowerSettings
): BigNumber {
    const { Zero, WeiPerEther } = constants;
    let stake = currentStake;
    if (action === ActionType.STAKE) stake = stake.add(amount);
    if (action === ActionType.UNSTAKE) stake = stake.sub(amount);
    let daily = Zero;
    if (!stake.isZero() && stake.gte(settings.minThreshold)) {
        const difference = wdiv(WeiPerEther, settings.minThreshold).sub(wdiv(WeiPerEther, stake));
        daily = frac(frac(settings.baselineAmount, difference, WeiPerEther), stake, WeiPerEther);
    }
    if (
        action === ActionType.UNSTAKE ||
        (lastUnstakeTime !== 0 && isUTCSameDay(Math.floor(Date.now() / 1000), lastUnstakeTime))
    ) {
        return daily;
    }
    const accrued = currentStake.isZero() ? Zero : frac(currentPower, wdiv(stake, currentStake), WeiPerEther);
    return min(stake.mul(settings.maxPowerBoost), accrued.add(daily));
}

export class StakingClient {
    readonly stakingVault;
    private readonly multicall;
    readonly simulateNextDayBoost = GovClient.prototype.simulateNextDayBoost;
    readonly simulateNextDayVotingPower = simulateNextDayVotingPower;

    constructor(
        private readonly provider: providers.Provider,
        vault: string,
        multicall: string,
        private readonly multiplier = 1
    ) {
        this.stakingVault = SynFuturesStakingVault__factory.connect(vault, provider);
        this.multicall = Multicall3__factory.connect(multicall, provider);
    }

    private async populate(method: 'stake' | 'unstake' | 'release', value: BigNumberish, options: UnsignedOptions) {
        const tx = await this.stakingVault.populateTransaction[method](value);
        return estimate(this.provider, tx, options, this.multiplier);
    }

    stake(amount: BigNumberish, options: UnsignedOptions = {}) {
        return this.populate('stake', amount, options);
    }
    unstake(amount: BigNumberish, options: UnsignedOptions = {}) {
        return this.populate('unstake', amount, options);
    }
    release(index: BigNumberish, options: UnsignedOptions = {}) {
        return this.populate('release', index, options);
    }

    async getStakingInfo(
        account: string,
        overrides: CallOverrides = {}
    ): Promise<{ stakes: BigNumber; pendingUnstakes: PendingUnstake[] }> {
        const { address, interface: abi } = this.stakingVault;
        const { returnData } = await this.multicall.callStatic.aggregate(
            [
                { target: address, callData: abi.encodeFunctionData('pendingDuration') },
                { target: address, callData: abi.encodeFunctionData('accountStakeInfo', [account]) },
            ],
            overrides
        );
        const [duration] = abi.decodeFunctionResult('pendingDuration', returnData[0]);
        const [stakes, pending] = abi.decodeFunctionResult('accountStakeInfo', returnData[1]);
        const pendingUnstakes: PendingUnstake[] = pending.map(
            (item: { amount: BigNumber; createTime: number }, index: number) => ({
                index,
                amount: item.amount,
                createTime: item.createTime,
                releaseTime: item.createTime + duration.toNumber(),
            })
        );
        pendingUnstakes.sort((a, b) => a.createTime - b.createTime);
        return { stakes, pendingUnstakes };
    }
}

export interface StakingConfig {
    vault: string;
    multicall: string;
    graphUrl: string;
}
export interface ClaimClient {
    airdrop: AirdropClient;
}
export interface GovernanceClient extends ClaimClient {
    governance: StakingClient;
    governanceDataSource: GovGraph;
}

export function createTgeClient(provider: providers.Provider, multiplier?: number): ClaimClient;
export function createTgeClient(
    provider: providers.Provider,
    multiplier: number,
    config: StakingConfig
): GovernanceClient;
export function createTgeClient(
    provider: providers.Provider,
    multiplier = 1,
    config?: StakingConfig
): ClaimClient | GovernanceClient {
    const airdrop = new AirdropClient(provider, multiplier);
    if (!config) return { airdrop };
    return {
        airdrop,
        governance: new StakingClient(provider, config.vault, config.multicall, multiplier),
        governanceDataSource: new GovGraph(config.graphUrl),
    };
}
