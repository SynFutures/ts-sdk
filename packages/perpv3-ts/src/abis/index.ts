import { CURRENT_GATE_ABI } from './latest/gate';
import { LEGACY_GATE_ABI } from './legacy/gate';
import { CURRENT_OBSERVER_ABI } from './latest/observer';
import { LEGACY_OBSERVER_ABI } from './legacy/observer';
import { CURRENT_CONFIG_ABI } from './latest/config';
import { LEGACY_CONFIG_ABI } from './legacy/config';
import { CURRENT_INSTRUMENT_ABI } from './latest/instrument';
import { LEGACY_INSTRUMENT_ABI } from './legacy/instrument';
import { CEX_MARKET_ABI } from './latest/cexMarket';
import { LEGACY_CEX_MARKET_ABI } from './legacy/cexMarket';
import { DEX_V2_MARKET_ABI } from './latest/dexV2Market';
import { LEGACY_DEX_V2_MARKET_ABI } from './legacy/dexV2Market';

export type AbiVersion = 'legacy' | 'current';

export interface ABISet {
    Gate: typeof CURRENT_GATE_ABI | typeof LEGACY_GATE_ABI;
    Observer: typeof CURRENT_OBSERVER_ABI | typeof LEGACY_OBSERVER_ABI;
    Config: typeof CURRENT_CONFIG_ABI | typeof LEGACY_CONFIG_ABI;
    Instrument: typeof CURRENT_INSTRUMENT_ABI | typeof LEGACY_INSTRUMENT_ABI;
    CexMarket: typeof CEX_MARKET_ABI | typeof LEGACY_CEX_MARKET_ABI;
    DexV2Market: typeof DEX_V2_MARKET_ABI | typeof LEGACY_DEX_V2_MARKET_ABI;
}

export const getABISet = (version: AbiVersion): ABISet => {
    const useLegacy = version === 'legacy';

    return {
        Gate: useLegacy ? LEGACY_GATE_ABI : CURRENT_GATE_ABI,
        Observer: useLegacy ? LEGACY_OBSERVER_ABI : CURRENT_OBSERVER_ABI,
        Config: useLegacy ? LEGACY_CONFIG_ABI : CURRENT_CONFIG_ABI,
        Instrument: useLegacy ? LEGACY_INSTRUMENT_ABI : CURRENT_INSTRUMENT_ABI,
        CexMarket: useLegacy ? LEGACY_CEX_MARKET_ABI : CEX_MARKET_ABI,
        DexV2Market: useLegacy ? LEGACY_DEX_V2_MARKET_ABI : DEX_V2_MARKET_ABI,
    };
};

export const getABI = <K extends keyof ABISet>(version: AbiVersion, contractName: K): ABISet[K] => {
    const abiSet = getABISet(version);
    return abiSet[contractName];
};

export * from './latest/gate';
export * from './legacy/gate';
export * from './latest/observer';
export * from './legacy/observer';
export * from './latest/config';
export * from './legacy/config';
export * from './latest/instrument';
export * from './legacy/instrument';
export * from './latest/cexMarket';
export * from './legacy/cexMarket';
export * from './latest/dexV2Market';
export * from './legacy/dexV2Market';
export * from './latest/guardian';
export * from './latest/erc20WithPermit';
export * from './latest/gelatoRelayRouter';
