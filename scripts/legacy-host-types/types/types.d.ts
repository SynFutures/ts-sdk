import type { BlockInfo, CHAIN_ID } from '../core';
import type { BigNumber, CallOverrides, Signer } from 'ethers';
import type {
    CexMarket,
    Config,
    DexV2Market,
    Beacon,
    Gate,
    Observer,
    Guardian,
    EmergingFeederFactory,
    PythFeederFactory,
} from '../contracts';
import type { LegacyPluginHost } from '../../legacy-plugin-host';
import type { FeederType, InstrumentCondition, MarketType, Side, Status } from '../enum';
import type { InstrumentSetting, QuoteParam } from './params';
export interface BaseInterface {
    get synfV3(): LegacyPluginHost;
}
export interface Portfolio {
    instrumentAddr: string;
    expiry: number;
    traderAddr: string;
    orders: Map<number, Order>;
    ranges: Map<number, Range>;
    position: Position;
    isEmpty: boolean;
    isInverse?: boolean;
    blockInfo?: BlockInfo;
}
export interface FundFlow {
    totalIn: BigNumber;
    totalOut: BigNumber;
}
export interface Pending {
    timestamp: number;
    native: boolean;
    amount: BigNumber;
    exemption: BigNumber;
}
export interface Instrument {
    instrumentAddr: string;
    symbol: string;
    market: InstrumentMarket;
    condition: InstrumentCondition;
    setting: InstrumentSetting;
    spotPrice: BigNumber;
    amms: Map<number, Amm>;
    base: BaseInfo;
    quote: TokenInfo;
    instrumentType: FeederType;
    marketType: MarketType;
    minTradeValue: BigNumber;
    minOrderValue: BigNumber;
    minRangeValue: BigNumber;
    minTickDelta: number;
    displayBase: BaseInfo;
    displayQuote: TokenInfo;
    placePaused: boolean;
    fundingHour: number;
    isInverse?: boolean;
    blockInfo?: BlockInfo;
}
export interface InstrumentMarket extends Market {
    feeder: PriceFeeder | DexV2Feeder;
}
export interface Market {
    info: MarketInfo;
    config: MarketConfig;
}
export interface MarketInfo {
    addr: string;
    type: string;
    beacon: string;
}
export interface CexFeederSource {
    baseSymbol: string;
    quoteSymbol: string;
    ftype: FeederType;
    aggregator0: string;
    heartBeat0: number;
    aggregator1?: string;
    heartBeat1?: number;
}
export interface DexV2FeederSource {
    factory: string;
    router: string;
}
export interface MarketConfig {
    dailyInterestRate: number;
    feederSource: CexFeederSource[] | DexV2FeederSource[];
}
export interface PythMarketConfig extends MarketConfig {
    pythCore: string;
}
export interface PriceFeeder {
    ftype: FeederType;
    scaler0: BigNumber;
    aggregator0: string;
    heartBeat0: number;
    scaler1: BigNumber;
    aggregator1: string;
    heartBeat1: number;
}
export interface DexV2Feeder {
    ftype: FeederType;
    isToken0Quote: boolean;
    pair: string;
    scaler0: BigNumber;
    scaler1: BigNumber;
}
export interface RawOrder {
    balance: BigNumber;
    size: BigNumber;
    taken: BigNumber;
    tick: number;
    nonce: number;
}
export interface Order extends RawOrder {
    instrumentAddr: string;
    expiry: number;
    traderAddr: string;
    oid: number;
    side: Side;
    limitPrice: BigNumber;
    isInverse?: boolean;
    blockInfo?: BlockInfo;
}
export interface RawAmm {
    expiry: number;
    timestamp: number;
    status: Status;
    tick: number;
    sqrtPX96: BigNumber;
    liquidity: BigNumber;
    totalLiquidity: BigNumber;
    involvedFund: BigNumber;
    openInterests: BigNumber;
    feeIndex: BigNumber;
    protocolFee: BigNumber;
    totalLong: BigNumber;
    totalShort: BigNumber;
    longSocialLossIndex: BigNumber;
    shortSocialLossIndex: BigNumber;
    longFundingIndex: BigNumber;
    shortFundingIndex: BigNumber;
    insuranceFund: BigNumber;
    settlementPrice: BigNumber;
    timestampUpdatedAt?: number;
    markPrice: BigNumber;
}
export interface Amm extends RawAmm {
    instrumentAddr: string;
    fairPrice: BigNumber;
    isInverse?: boolean;
    blockInfo?: BlockInfo;
}
export interface RawPosition {
    balance: BigNumber;
    size: BigNumber;
    entryNotional: BigNumber;
    entrySocialLossIndex: BigNumber;
    entryFundingIndex: BigNumber;
}
export interface Position extends RawPosition {
    instrumentAddr: string;
    expiry: number;
    traderAddr: string;
    side: Side;
    entryPrice: BigNumber;
    isInverse?: boolean;
    blockInfo?: BlockInfo;
}
export interface Quotation {
    benchmark: BigNumber;
    sqrtFairPX96: BigNumber;
    tick: number;
    mark: BigNumber;
    entryNotional: BigNumber;
    fee: BigNumber;
    minAmount: BigNumber;
    sqrtPostFairPX96: BigNumber;
    postTick: number;
}
export interface RawRange {
    liquidity: BigNumber;
    balance: BigNumber;
    sqrtEntryPX96: BigNumber;
    entryFeeIndex: BigNumber;
    tickLower: number;
    tickUpper: number;
}
export interface Range extends RawRange {
    instrumentAddr: string;
    expiry: number;
    traderAddr: string;
    rid: number;
    lowerPrice: BigNumber;
    upperPrice: BigNumber;
    entryPrice: BigNumber;
    isInverse?: boolean;
    blockInfo?: BlockInfo;
}
export interface MinimalPearl {
    liquidityNet: BigNumber;
    left: BigNumber;
}
export interface LiquidityDetails {
    amm: {
        sqrtPX96: BigNumber;
        tick: number;
        liquidity: BigNumber;
    };
    tids: number[];
    pearls: MinimalPearl[];
    tick2Pearl: Map<number, MinimalPearl>;
    blockInfo: BlockInfo;
}
export interface TokenInfo {
    name?: string;
    symbol: string;
    address: string;
    decimals: number;
    isStableCoin?: boolean;
}
export interface BaseInfo {
    name?: string;
    symbol: string;
    address: string;
    decimals: number;
}
export interface GasOptions {
    gasLimitMultiple?: number;
    gasPriceMultiple?: number;
    enableGasPrice?: boolean;
    disableGasLimit?: boolean;
}
export interface TxOptions extends CallOverrides, GasOptions {
    signer?: Signer;
}
export type TxOptionsWithSigner = Omit<TxOptions, 'signer'> & {
    signer: Signer;
};
export interface MarketAddress {
    beacon: string;
    market: string;
    feeders?: {
        [key in string]?: string;
    };
}
export interface FeederFactoryAddress {
    beacon: string;
    factory: string;
}
export interface ContractAddress {
    gate: string;
    observer: string;
    config: string;
    guardian?: string;
    market: {
        [key in MarketType]?: MarketAddress;
    };
    feederFactory: {
        [key in MarketType]?: FeederFactoryAddress;
    };
}
export interface SynFuturesConfig {
    marketConfig: {
        [key in MarketType]?: MarketConfig | PythMarketConfig;
    };
    quotesParam: {
        [key in string]?: QuoteParam;
    };
    contractAddress: ContractAddress;
    instrumentProxyByteCode: string;
    tokenInfo?: TokenInfo[];
    inversePairs?: InversePairsInfo;
}
export type InversePairsInfo = string[];
export interface SynFuturesV3Contracts {
    config: Config;
    gate: Gate;
    observer: Observer;
    guardian?: Guardian;
    marketContracts: {
        [key in MarketType]?: MarketContracts;
    };
    feederFactoryContracts: {
        [key in MarketType]?: FeederFactoryContracts;
    };
}
export interface MarketContracts {
    market: CexMarket | DexV2Market;
    beacon: Beacon;
}
export interface FeederFactoryContracts {
    factory: EmergingFeederFactory | PythFeederFactory;
    beacon: Beacon;
}
