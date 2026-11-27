import { AirdropInterface } from './airdrop.interface';
import { SynFuturesV3WithPlugins, TxOptions, TxOptionsWithSigner, TxPlugin } from '@synfutures/oyster-sdk2';
import { CallOverrides, PopulatedTransaction } from 'ethers';
import { TransactionReceipt } from '@ethersproject/abstract-provider';
import { type Airdrop, Airdrop__factory } from './typechain';
import { AirdropContracts } from './const';
import { AirdropParser } from './parser';

type SynFuturesV3 = SynFuturesV3WithPlugins<[TxPlugin]>;
type ClaimArgs = [index: number, amount: string, account: string, proof: string[], txOptions?: TxOptions];
type ReadArgs = [index: number, overrides?: CallOverrides];
type WithDistributor<T extends unknown[]> = [contractAddress: string, ...T];

function hasDistributor<T extends [number, ...unknown[]]>(args: T | WithDistributor<T>): args is WithDistributor<T> {
    return typeof args[0] === 'string';
}

export class AirdropModule implements AirdropInterface {
    synfV3: SynFuturesV3;
    constructor(synfV3: SynFuturesV3) {
        this.synfV3 = synfV3;
    }

    private getAirdrop(distributor?: string): Airdrop {
        if (distributor !== undefined) {
            return Airdrop__factory.connect(distributor, this.synfV3.ctx.provider);
        }
        const contractAddress = AirdropContracts[this.synfV3.ctx.chainId];
        const airdrop = Airdrop__factory.connect(contractAddress, this.synfV3.ctx.provider);
        this.synfV3.ctx.registerAddress(contractAddress, `Airdrop`);
        this.synfV3.ctx.registerContractParser(contractAddress, new AirdropParser());
        return airdrop;
    }

    async claim(
        index: number,
        amount: string,
        account: string,
        proof: string[],
        txOptions: TxOptionsWithSigner
    ): Promise<TransactionReceipt>;
    async claim(
        index: number,
        amount: string,
        account: string,
        proof: string[],
        txOptions?: TxOptions
    ): Promise<PopulatedTransaction>;
    async claim(
        contractAddress: string,
        index: number,
        amount: string,
        account: string,
        proof: string[],
        txOptions: TxOptionsWithSigner
    ): Promise<TransactionReceipt>;
    async claim(
        contractAddress: string,
        index: number,
        amount: string,
        account: string,
        proof: string[],
        txOptions?: TxOptions
    ): Promise<PopulatedTransaction>;
    async claim(...args: ClaimArgs | WithDistributor<ClaimArgs>): Promise<TransactionReceipt | PopulatedTransaction> {
        if (hasDistributor(args)) {
            const [distributor, ...claim] = args;
            return this.submitClaim(this.getAirdrop(distributor), ...claim);
        }
        return this.submitClaim(this.getAirdrop(), ...args);
    }

    private async submitClaim(
        airdrop: Airdrop,
        index: number,
        amount: string,
        account: string,
        proof: string[],
        txOptions?: TxOptions
    ): Promise<TransactionReceipt | PopulatedTransaction> {
        const tx = await airdrop.populateTransaction.claim(index, account, amount, proof);
        return this.synfV3.tx.sendTx(tx, txOptions);
    }

    isClaimed(index: number, overrides?: CallOverrides): Promise<boolean>;
    isClaimed(contractAddress: string, index: number, overrides?: CallOverrides): Promise<boolean>;
    async isClaimed(...args: ReadArgs | WithDistributor<ReadArgs>): Promise<boolean> {
        if (hasDistributor(args)) {
            const [distributor, index, overrides] = args;
            return this.getAirdrop(distributor).isClaimed(index, overrides ?? {});
        }
        const [index, overrides] = args;
        return this.getAirdrop().isClaimed(index, overrides ?? {});
    }
}
