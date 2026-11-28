import type { ContractParser, TokenInfo } from '../legacy-host-types/core';
import type { CallOverrides, PopulatedTransaction, Signer, providers } from 'ethers';

export interface TxOptions extends CallOverrides {
    signer?: Signer;
    gasLimitMultiple?: number;
    gasPriceMultiple?: number;
    enableGasPrice?: boolean;
    disableGasLimit?: boolean;
}

export type TxOptionsWithSigner = TxOptions & { signer: Signer };

export interface GovernanceHost {
    readonly ctx: {
        readonly chainId: number;
        readonly provider: providers.Provider;
        readonly tokenInfo: { set(key: string, token: TokenInfo): unknown };
        readonly multicall3: {
            callStatic: {
                aggregate(
                    calls: { target: string; callData: string }[],
                    overrides: CallOverrides
                ): Promise<{ returnData: string[] }>;
            };
        };
        registerAddress(address: string, name: string): void;
        registerContractParser(address: string, parser: Pick<ContractParser, keyof ContractParser>): void;
    };
    // Hosts may attach the transaction plugin after installing this plugin.
    readonly tx?: {
        sendTx(
            tx: PopulatedTransaction,
            options?: TxOptions
        ): Promise<PopulatedTransaction | providers.TransactionReceipt>;
    };
    addSetProviderHook(callback: () => void): void;
}
