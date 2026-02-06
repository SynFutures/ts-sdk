import type { Address } from 'viem';

/**
 * Common types used across multiple modules
 */

/**
 * Raw OnchainContext struct from contract (1:1 mapping with Solidity struct).
 * This represents the exact structure returned by the Observer contract's fetchOnChainContext function.
 *
 * Note: The contract always returns `quotation`, but when constructing PairSnapshot manually,
 * quotation may be optional (only present when signedSize is provided).
 */
export interface OnchainContext {
    setting: Setting;
    condition: Condition;
    amm: Amm;
    priceData: PriceData;
    portfolio: Portfolio;
    quotation?: Quotation;
    quoteState: QuoteState;
    spacing: SpacingConfig;
    blockInfo: BlockInfo;
}

/**
 * Perpetual contract expiry identifier
 * Used to identify perpetual contracts (expiry === PERP_EXPIRY)
 */
export const PERP_EXPIRY = 0xffffffff;

/**
 * Block information
 */
export interface BlockInfo {
    timestamp: number; // uint32
    height: number; // uint32
}

export enum Side {
    FLAT,
    SHORT,
    LONG,
}

/**
 * Get the sign multiplier for a side: LONG=1, SHORT=-1, FLAT=0
 */
export function sideSign(side: Side): number {
    return side === Side.LONG ? 1 : side === Side.SHORT ? -1 : 0;
}

export enum Status {
    DORMANT,
    TRADING,
    SETTLING,
    SETTLED,
}

export enum Condition {
    NORMAL,
    FROZEN,
    RESOLVED,
}

export enum QuoteType {
    INVALID,
    STABLE,
    NONSTABLE,
}

import type { Position } from './position';

// Order is now a class in types/order.ts
export { Order } from './order';
import type { Order } from './order';

export interface Record {
    taken: bigint; // int128
    fee: bigint; // uint128
    entrySocialLossIndex: bigint; // uint128
    entryFundingIndex: bigint; // int128
}

// Range is now a class in types/range.ts
export { Range } from './range';
import type { Range } from './range';

export interface Pearl {
    liquidityGross: bigint; // uint128
    liquidityNet: bigint; // int128
    nonce: number; // uint24
    left: bigint; // int96
    taken: bigint; // int96
    fee: bigint; // uint128
    entrySocialLossIndex: bigint; // uint128
    entryFundingIndex: bigint; // int128
}

export interface Amm {
    expiry: number; // uint32
    timestamp: number; // uint32
    status: Status;
    tick: number; // int24
    sqrtPX96: bigint; // uint160
    liquidity: bigint; // uint128
    totalLiquidity: bigint; // uint128
    totalShort: bigint; // uint128
    openInterests: bigint; // uint128
    totalLong: bigint; // uint128
    involvedFund: bigint; // uint128
    feeIndex: bigint; // uint128
    protocolFee: bigint; // uint128
    longSocialLossIndex: bigint; // uint128
    shortSocialLossIndex: bigint; // uint128
    longFundingIndex: bigint; // int128
    shortFundingIndex: bigint; // int128
    insuranceFund: bigint; // uint128
    settlementPrice: bigint; // uint128
}

export interface QuoteParam {
    minMarginAmount: bigint; // uint128
    tradingFeeRatio: number; // uint16
    protocolFeeRatio: number; // uint16
    qtype: QuoteType;
    tip: bigint; // uint128
}

export interface Setting {
    symbol: string;
    config: Address;
    gate: Address;
    market: Address;
    quote: Address;
    decimals: number; // uint8
    initialMarginRatio: number; // uint16
    maintenanceMarginRatio: number; // uint16
    placePaused: boolean;
    fundingHour: number; // uint8
    disableOrderRebate: boolean;
    param: QuoteParam;
}

export interface Quotation {
    benchmark: bigint; // uint
    sqrtFairPX96: bigint; // uint160
    tick: number; // int24
    mark: bigint; // uint
    entryNotional: bigint; // uint
    fee: bigint; // uint
    minAmount: bigint; // uint
    sqrtPostFairPX96: bigint; // uint160
    postTick: number; // int24
}

/**
 * Price data from Observer contract (1:1 mapping with contract PriceData struct)
 */
export interface PriceData {
    instrument: Address;
    expiry: number; // uint32
    markPrice: bigint; // uint
    spotPrice: bigint; // uint
    benchmarkPrice: bigint; // uint
    feeder0: Address;
    feeder1: Address;
    feeder0UpdatedAt: bigint; // uint (feeder0 update timestamp)
    feeder1UpdatedAt: bigint; // uint (feeder1 update timestamp)
}

/**
 * Spacing configuration from Observer contract (1:1 mapping with contract SpacingConfig struct)
 */
export interface SpacingConfig {
    pearl: number; // int24
    order: number; // int24
    range: number; // int24
}

export interface QuoteState {
    quote: Address;
    decimals: number; // uint8
    symbol: string;
    threshold: bigint; // uint256
    reserve: bigint; // uint256
    balance: bigint; // uint256
    allowance: bigint; // uint256
    fundFlow: FundFlow;
    pending: Pending;
}

export interface AdjustParam {
    expiry: number;
    net: bigint;
    deadline: number;
}

export interface AddParam {
    expiry: number;
    tickDeltaLower: number;
    tickDeltaUpper: number;
    amount: bigint;
    limitTicks: number;
    deadline: number;
}

export interface RemoveParam {
    expiry: number;
    target: Address;
    tickLower: number;
    tickUpper: number;
    limitTicks: number;
    deadline: number;
}

export interface TradeParam {
    expiry: number;
    size: bigint;
    amount: bigint;
    limitTick: number;
    deadline: number;
}

export interface FillParam {
    expiry: number;
    tick: number;
    target: Address;
    nonce: number;
}

export interface BatchCancelParam {
    expiry: number;
    ticks: number[];
    deadline: number;
}

export interface PlaceParam {
    expiry: number;
    tick: number;
    size: bigint;
    amount: bigint;
    deadline: number;
}

export interface BatchPlaceParam {
    expiry: number;
    ticks: number[];
    ratios: number[];
    size: bigint;
    leverage: bigint;
    deadline: number;
}

/**
 * Fund flow information
 */
export interface FundFlow {
    totalIn: bigint; // uint128
    totalOut: bigint; // uint128
}

/**
 * Pending withdrawal information
 */
export interface Pending {
    timestamp: number; // uint32
    native: boolean;
    amount: bigint; // uint96
    exemption: bigint; // uint120
}

/**
 * Minimal pearl information from Observer contract (1:1 mapping with contract MinimalPearl struct)
 */
export interface MinimalPearl {
    liquidityNet: bigint; // int128
    left: bigint; // int96
}

/**
 * Liquidity details fetched from Observer.liquidityDetails
 */
export interface LiquidityDetails {
    amm: {
        sqrtPX96: bigint; // uint160
        tick: number; // int24
        liquidity: bigint; // uint
    };
    tids: number[];
    pearls: MinimalPearl[];
    blockInfo: BlockInfo;
    tick2Pearl: Map<number, MinimalPearl>;
}

/**
 * Portfolio information
 */
export interface Portfolio {
    oids: readonly number[]; // uint48[]
    rids: readonly number[]; // uint48[]
    position: Position;
    orders: readonly Order[];
    ranges: readonly Range[];
    ordersTaken: readonly bigint[]; // int[]
}
