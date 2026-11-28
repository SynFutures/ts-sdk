import type { ChainContext, TokenInfo } from '@derivation-tech/web3-core';
import type { providers } from 'ethers';
import type { GasOptions, SynFuturesV3Contracts } from './legacy-host-types/types';
import type { TxInterface } from './legacy-host-types/modules/tx.interface';
import type { GateInterface } from './legacy-host-types/modules/gate.interface';
import type { ConfigInterface } from './legacy-host-types/modules/config.interface';
import type { ObserverInterface } from './legacy-host-types/modules/observer.interface';
import type { InstrumentInterface } from './legacy-host-types/modules/instrument.interface';
import type { SimulateInterface } from './legacy-host-types/modules/simulate.interface';
import type { CalcInterface } from './legacy-host-types/modules/calc.interface';
import type { ConfigurationInterface } from './legacy-host-types/modules/configuration/configuration.interface';

interface LegacyInstaller<Host, Extension> {
    install(host: Host): Host & Extension;
}

/** The public host historically returned by an unparameterized compatibility plugin interface. */
export interface LegacyPluginHost {
    ctx: ChainContext;
    contracts: SynFuturesV3Contracts;
    setProvider(provider: providers.Provider, isOpSdkCompatible?: boolean): void;
    registerQuoteInfo(tokenInfo: TokenInfo): void;
    init(): Promise<void>;
    addInitHook(callback: () => Promise<void>): void;
    addSetProviderHook(callback: () => void): void;
    use<Extension>(plugin: LegacyInstaller<this, Extension>): this & Extension;
    useDefault(gasOptions?: GasOptions): LegacyPluginHost & LegacyDefaultPlugins;
}

export type { GasOptions as LegacyGasOptions } from './legacy-host-types/types';

export interface LegacyTransactionPlugin {
    tx: TxInterface;
}

interface LegacyDefaultPlugins extends LegacyTransactionPlugin {
    gate: GateInterface;
    config: ConfigInterface;
    observer: ObserverInterface;
    _observer: ObserverInterface;
    instrument: InstrumentInterface;
    simulate: SimulateInterface;
    _simulate: SimulateInterface;
    configuration: ConfigurationInterface;
    calc: CalcInterface;
}
