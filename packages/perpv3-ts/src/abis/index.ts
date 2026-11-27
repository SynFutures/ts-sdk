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

const deployments = {
    current: { Gate:CURRENT_GATE_ABI, Observer:CURRENT_OBSERVER_ABI, Config:CURRENT_CONFIG_ABI, Instrument:CURRENT_INSTRUMENT_ABI, CexMarket:CEX_MARKET_ABI, DexV2Market:DEX_V2_MARKET_ABI },
    legacy: { Gate:LEGACY_GATE_ABI, Observer:LEGACY_OBSERVER_ABI, Config:LEGACY_CONFIG_ABI, Instrument:LEGACY_INSTRUMENT_ABI, CexMarket:LEGACY_CEX_MARKET_ABI, DexV2Market:LEGACY_DEX_V2_MARKET_ABI },
} as const;

export type ABISet = typeof deployments[AbiVersion];

export function getABISet<V extends AbiVersion>(version:V): typeof deployments[V] {
    return deployments[version];
}

export function getABI<V extends AbiVersion,K extends keyof ABISet>(version:V, contractName:K): typeof deployments[V][K] {
    return deployments[version][contractName];
}

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
