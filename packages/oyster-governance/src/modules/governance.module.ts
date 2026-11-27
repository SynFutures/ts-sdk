import { BigNumber, CallOverrides, ethers } from 'ethers';
import { Erc20Parser, WAD, ZERO, ZERO_ADDRESS } from '@derivation-tech/web3-core';
import {
    TxOptions,
    TxOptionsWithSigner,
    TxPlugin,
    SynFuturesV3WithPlugins,
    utils,
    wdiv,
    wmul,
    max,
    min,
} from '@synfutures/oyster-sdk2';
import {
    SynFuturesStakingVault,
    SynFuturesToken,
    SynFuturesStakingVault__factory,
    SynFuturesToken__factory,
} from '@synfutures/oyster-governance-abi';
import { SynFuturesStakingVaultParser } from '../parser';
import { STAKE_ADDRESSES, S_TOKENINFO } from '../constants';
import { PendingUnstake, BoostSettings, VotingPowerSettings } from '../types';
import { ActionType } from '../enum';
import { GovernanceInterface } from './governance.interface';

type SynfuturesV3 = SynFuturesV3WithPlugins<[TxPlugin]>;

function isUTCSameDay(ts1: number, ts2: number): boolean {
    const d1 = new Date(ts1 * 1000);
    const d2 = new Date(ts2 * 1000);
    return (
        d1.getUTCFullYear() === d2.getUTCFullYear() &&
        d1.getUTCMonth() === d2.getUTCMonth() &&
        d1.getUTCDate() === d2.getUTCDate()
    );
}

export class GovernanceModule implements GovernanceInterface {
    synfV3: SynfuturesV3;

    stakingVault!: SynFuturesStakingVault;

    token!: SynFuturesToken;

    constructor(synfV3: SynfuturesV3) {
        this.synfV3 = synfV3;

        this.initContracts();
    }

    private get ctx() {
        return this.synfV3.ctx;
    }

    private initContracts() {
        const stakingVaultAddress = STAKE_ADDRESSES[this.ctx.chainId] ?? ZERO_ADDRESS;
        const tokenInfo = S_TOKENINFO[this.ctx.chainId] ?? '0x';
        this.stakingVault = SynFuturesStakingVault__factory.connect(stakingVaultAddress, this.ctx.provider);
        this.token = SynFuturesToken__factory.connect(tokenInfo.address, this.ctx.provider);
        this.ctx.registerAddress(this.stakingVault.address, 'SynFuturesStakingVault');
        this.ctx.registerAddress(this.token.address, tokenInfo.symbol);
        this.ctx.tokenInfo.set(tokenInfo.symbol.toLowerCase(), tokenInfo);
        this.ctx.tokenInfo.set(tokenInfo.address.toLowerCase(), tokenInfo);

        this.ctx.registerContractParser(this.stakingVault.address, new SynFuturesStakingVaultParser());
        this.ctx.registerContractParser(
            this.token.address,
            new Erc20Parser(SynFuturesToken__factory.createInterface(), tokenInfo)
        );
    }

    onSetProvider() {
        this.initContracts();
    }

    stake(amount: BigNumber, txOptions: TxOptionsWithSigner): Promise<ethers.providers.TransactionReceipt>;
    stake(amount: BigNumber, txOptions?: TxOptions): Promise<ethers.PopulatedTransaction>;
    async stake(
        amount: BigNumber,
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction> {
        const unsignedTx = await this.stakingVault.populateTransaction.stake(
            amount,
            utils.toPopulatedTxOverrides(txOptions)
        );
        return this.synfV3.tx.sendTx(unsignedTx, txOptions);
    }

    unstake(amount: BigNumber, txOptions: TxOptionsWithSigner): Promise<ethers.providers.TransactionReceipt>;
    unstake(amount: BigNumber, txOptions?: TxOptions): Promise<ethers.PopulatedTransaction>;
    async unstake(
        amount: BigNumber,
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction> {
        const unsignedTx = await this.stakingVault.populateTransaction.unstake(
            amount,
            utils.toPopulatedTxOverrides(txOptions)
        );
        return this.synfV3.tx.sendTx(unsignedTx, txOptions);
    }

    release(index: number, txOptions: TxOptionsWithSigner): Promise<ethers.providers.TransactionReceipt>;
    release(index: number, txOptions?: TxOptions): Promise<ethers.PopulatedTransaction>;
    async release(
        index: number,
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction> {
        const unsignedTx = await this.stakingVault.populateTransaction.release(
            index,
            utils.toPopulatedTxOverrides(txOptions)
        );
        return this.synfV3.tx.sendTx(unsignedTx, txOptions);
    }

    async getStakingInfo(
        accAddress: string,
        overrides?: CallOverrides
    ): Promise<{ stakes: BigNumber; pendingUnstakes: PendingUnstake[] }> {
        const stakingVaultInterface = this.stakingVault.interface;
        const calls = [];
        calls.push({
            target: this.stakingVault.address,
            callData: stakingVaultInterface.encodeFunctionData('pendingDuration'),
        });
        calls.push({
            target: this.stakingVault.address,
            callData: stakingVaultInterface.encodeFunctionData('accountStakeInfo', [accAddress]),
        });
        const ret = (await this.ctx.multicall3.callStatic.aggregate(calls, overrides ?? {})).returnData;

        const pendingDuration: BigNumber = stakingVaultInterface.decodeFunctionResult('pendingDuration', ret[0])[0];
        const [stakes, pendingUnstakes] = stakingVaultInterface.decodeFunctionResult('accountStakeInfo', ret[1]);
        const pendingUnstakesInfo: PendingUnstake[] = [];
        for (let i = 0; i < pendingUnstakes.length; i++) {
            pendingUnstakesInfo.push({
                index: i,
                amount: pendingUnstakes[i].amount,
                createTime: pendingUnstakes[i].createTime,
                releaseTime: pendingUnstakes[i].createTime + pendingDuration.toNumber(),
            });
        }
        // sort by createTime
        pendingUnstakesInfo.sort((a, b) => a.createTime - b.createTime);
        return { stakes, pendingUnstakes: pendingUnstakesInfo };
    }

    simulateNextDayBoost(
        currentBoost: BigNumber,
        lastUnstakeTime: number,
        currentStakeAmount: BigNumber,
        tvlInTokenWad: BigNumber,
        action: ActionType,
        actionAmount: BigNumber,
        settings: BoostSettings
    ): BigNumber {
        let clearSum = false;
        const nowTs = Math.floor(Date.now() / 1000);
        let stakedAmountAfterAction = currentStakeAmount;
        if (action === ActionType.STAKE) {
            stakedAmountAfterAction = stakedAmountAfterAction.add(actionAmount);
        } else if (action === ActionType.UNSTAKE) {
            stakedAmountAfterAction = stakedAmountAfterAction.sub(actionAmount);
            clearSum = true;
        }
        if (lastUnstakeTime != 0) {
            if (isUTCSameDay(nowTs, lastUnstakeTime)) {
                clearSum = true;
            }
        }
        let constantPart = ZERO;
        if (stakedAmountAfterAction.gte(settings.minThreshold)) {
            constantPart = settings.baselineBoost;
        }
        const left = settings.dailyBoostCap;
        const right = wdiv(stakedAmountAfterAction, max(settings.baselineAmount, tvlInTokenWad)).div(
            settings.targetDays
        );
        const sumOneDay = min(left, right);
        if (clearSum || currentStakeAmount.eq(ZERO) || currentBoost.eq(ZERO) || stakedAmountAfterAction.eq(ZERO)) {
            return constantPart.add(sumOneDay);
        }
        return currentBoost.add(sumOneDay);
    }

    simulateNextDayVotingPower(
        currentVotingPower: BigNumber,
        lastUnstakeTime: number,
        currentStakeAmount: BigNumber,
        action: ActionType,
        actionAmount: BigNumber,
        settings: VotingPowerSettings
    ): BigNumber {
        let clearSum = false;
        const nowTs = Math.floor(Date.now() / 1000);
        let stakedAmountAfterAction = currentStakeAmount;
        if (action === ActionType.STAKE) {
            stakedAmountAfterAction = stakedAmountAfterAction.add(actionAmount);
        } else if (action === ActionType.UNSTAKE) {
            stakedAmountAfterAction = stakedAmountAfterAction.sub(actionAmount);
            clearSum = true;
        }
        if (lastUnstakeTime != 0) {
            if (isUTCSameDay(nowTs, lastUnstakeTime)) {
                clearSum = true;
            }
        }

        const sumOneDay = stakedAmountAfterAction.eq(ZERO)
            ? ZERO
            : wmul(
                  wmul(
                      stakedAmountAfterAction.lt(settings.minThreshold) ? ZERO : settings.baselineAmount,
                      wdiv(WAD, settings.minThreshold).sub(wdiv(WAD, stakedAmountAfterAction))
                  ),
                  stakedAmountAfterAction
              );

        if (clearSum === true) {
            return sumOneDay;
        } else {
            const maxVotingPower = stakedAmountAfterAction.mul(settings.maxPowerBoost);
            const newVotingPower = (
                currentStakeAmount.eq(0)
                    ? ZERO
                    : wmul(currentVotingPower, wdiv(stakedAmountAfterAction, currentStakeAmount))
            ).add(sumOneDay);
            return min(maxVotingPower, newVotingPower);
        }
    }
}
