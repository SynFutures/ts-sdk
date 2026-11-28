import type { LegacyPluginHost } from '../../legacy-plugin-host';
import type { GovernanceHost, TxOptions, TxOptionsWithSigner } from '../host';
import { BigNumber } from '@ethersproject/bignumber';
import type { ethers, CallOverrides } from '../../legacy-host-types/v5/ethers';
import { SynFuturesStakingVault, SynFuturesToken } from '../typechain';
import { PendingUnstake, BoostSettings, VotingPowerSettings } from '../types';
import { ActionType } from '../enum';

export interface GovernanceInterface<Host extends GovernanceHost = LegacyPluginHost> {
    readonly synfV3: Host;
    stakingVault: SynFuturesStakingVault;

    token: SynFuturesToken;

    stake(amount: BigNumber, txOptions: TxOptionsWithSigner): Promise<ethers.providers.TransactionReceipt>;
    stake(amount: BigNumber, txOptions?: TxOptions): Promise<ethers.PopulatedTransaction>;
    stake(
        amount: BigNumber,
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction>;

    unstake(amount: BigNumber, txOptions: TxOptionsWithSigner): Promise<ethers.providers.TransactionReceipt>;
    unstake(amount: BigNumber, txOptions?: TxOptions): Promise<ethers.PopulatedTransaction>;
    unstake(
        amount: BigNumber,
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction>;

    release(index: number, txOptions: TxOptionsWithSigner): Promise<ethers.providers.TransactionReceipt>;
    release(index: number, txOptions?: TxOptions): Promise<ethers.PopulatedTransaction>;
    release(
        index: number,
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction>;

    getStakingInfo(
        accAddress: string,
        overrides?: CallOverrides
    ): Promise<{ stakes: BigNumber; pendingUnstakes: PendingUnstake[] }>;

    simulateNextDayBoost(
        currentBoost: BigNumber,
        lastUnstakeTime: number,
        currentStakeAmount: BigNumber,
        tvlInTokenWad: BigNumber,
        action: ActionType,
        actionAmount: BigNumber,
        settings: BoostSettings
    ): BigNumber;

    simulateNextDayVotingPower(
        currentVotingPower: BigNumber,
        lastUnstakeTime: number,
        currentStakeAmount: BigNumber,
        action: ActionType,
        actionAmount: BigNumber,
        settings: VotingPowerSettings
    ): BigNumber;
}
