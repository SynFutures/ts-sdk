import type { ChainContext, TokenInfo } from '@derivation-tech/web3-core';
import type { CallOverrides, Contract, PopulatedTransaction, Signer, providers } from 'ethers';

interface LegacyInstaller<Host, Extension> {
    install(host: Host): Host & Extension;
}

/** The public host historically returned by an unparameterized compatibility plugin interface. */
export interface LegacyPluginHost {
    ctx: ChainContext;
    contracts: {
        config: Contract;
        gate: Contract;
        observer: Contract;
        guardian?: Contract;
        marketContracts: Partial<Record<string, { market: Contract; beacon: Contract }>>;
        feederFactoryContracts: Partial<Record<string, { factory: Contract; beacon: Contract }>>;
    };
    setProvider(provider: providers.Provider, isOpSdkCompatible?: boolean): void;
    registerQuoteInfo(tokenInfo: TokenInfo): void;
    init(): Promise<void>;
    addInitHook(callback: () => Promise<void>): void;
    addSetProviderHook(callback: () => void): void;
    use<Extension>(plugin: LegacyInstaller<this, Extension>): this & Extension;
    useDefault(gasOptions?: LegacyGasOptions): LegacyPluginHost & LegacyTransactionPlugin;
}

export interface LegacyGasOptions {
    gasLimitMultiple?: number;
    gasPriceMultiple?: number;
    enableGasPrice?: boolean;
    disableGasLimit?: boolean;
}

export interface LegacyTransactionPlugin {
    tx: {
        readonly synfV3: LegacyPluginHost;
        sendTx(
            tx: PopulatedTransaction,
            options?: CallOverrides & LegacyGasOptions & { signer?: Signer }
        ): Promise<PopulatedTransaction | providers.TransactionReceipt>;
    };
}
