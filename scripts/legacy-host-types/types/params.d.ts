import type { BigNumber } from 'ethers';
import type { TokenInfo } from '@derivation-tech/web3-core';
import type { BatchOrderSizeDistribution, MarketType, QuoteType, Side } from '../enum';
import type { Portfolio, Instrument, Position } from './types';
export interface InstrumentSetting {
    initialMarginRatio: number;
    maintenanceMarginRatio: number;
    quoteParam: QuoteParam;
}
export interface QuoteParam {
    minMarginAmount: BigNumber;
    tradingFeeRatio: number;
    protocolFeeRatio: number;
    stabilityFeeRatioParam: BigNumber;
    tip: BigNumber;
    qtype: QuoteType;
}
export interface InstrumentIdentifier {
    marketType: MarketType;
    baseSymbol: string | TokenInfo;
    quoteSymbol: string | TokenInfo;
}
export interface RemoveParam {
    expiry: number;
    traderAddr: string;
    tickLower: number;
    tickUpper: number;
    limitTicks: BigNumber;
    deadline: number;
}
export interface FillParam {
    expiry: number;
    tick: number;
    target: string;
    nonce: number;
}
export interface CancelParam {
    expiry: number;
    tick: number;
    deadline: number;
}
export interface FetchPortfolioParam {
    traderAddr: string;
    instrumentAddr: string;
    expiry: number;
}
export interface FetchInstrumentParam {
    instrument: string;
    expiries: number[];
}
export interface FillOrderParam extends FillParam {
    instrumentAddr: string;
}
export interface AdjustMarginParam {
    instrumentAddr: string;
    expiry: number;
    transferIn: boolean;
    margin: BigNumber;
    deadline: number;
    referralCode?: string;
}
export interface AddLiquidityParam {
    instrumentAddr: string | InstrumentIdentifier;
    expiry: number;
    tickDeltaLower: number;
    tickDeltaUpper: number;
    margin: BigNumber;
    limitTicks: BigNumber;
    deadline: number;
    referralCode?: string;
}
export interface RemoveLiquidityParam extends RemoveParam {
    instrumentAddr: string;
}
export interface PlaceLimitOrderParam {
    instrumentAddr: string;
    expiry: number;
    tick: number;
    baseSize: BigNumber;
    margin: BigNumber;
    side: Side;
    deadline: number;
    referralCode?: string;
}
export interface BatchPlaceLimitOrderParam {
    instrumentAddr: string;
    expiry: number;
    ticks: number[];
    ratios: number[];
    baseSize: BigNumber;
    side: Side;
    leverage: BigNumber;
    deadline: number;
    referralCode?: string;
}
export interface PlaceMarketOrderParam {
    instrumentAddr: string;
    expiry: number;
    side: Side;
    baseSize: BigNumber;
    margin: BigNumber;
    limitTick: number;
    deadline: number;
    referralCode?: string;
}
export interface CancelOrderParam extends CancelParam {
    instrumentAddr: string;
}
export interface BatchCancelOrderParam {
    instrumentAddr: string;
    expiry: number;
    orderTicks: number[];
    deadline: number;
}
export interface PlaceCrossMarketOrderParam {
    instrumentAddr: string;
    expiry: number;
    side: Side;
    tradeSize: BigNumber;
    tradeMargin: BigNumber;
    tradeLimitTick: number;
    orderTick: number;
    orderSize: BigNumber;
    orderMargin: BigNumber;
    deadline: number;
    referralCode?: string;
}
export interface SettleParam {
    instrumentAddr: string;
    expiry: number;
    target: string;
}
export type ByBase = {
    base: BigNumber;
};
export type ByQuote = {
    quote: BigNumber;
};
export type TradeInfo = {
    instrumentAddr: string;
    expiry: number;
    traderAddr: string;
};
export interface SimulateTradeParamsBase {
    tradeInfo: TradeInfo | Position;
    side: Side;
    size: ByBase | ByQuote;
    slippage: number;
    strictMode?: boolean;
    instrument?: Instrument;
}
export interface SimulateMarketOrderByMarginParams extends SimulateTradeParamsBase {
    margin: BigNumber;
}
export interface SimulateMarketOrderByLeverageParams extends SimulateTradeParamsBase {
    leverage: BigNumber;
}
export interface SimulateCloseParams {
    tradeInfo: TradeInfo | Position;
    size: ByBase | ByQuote;
    slippage: number;
    strictMode?: boolean;
    instrument?: Instrument;
}
export interface SimulateTradeResult {
    tradePrice: BigNumber;
    tradeValue: BigNumber;
    tradingFee: BigNumber;
    stabilityFee: BigNumber;
    margin: BigNumber;
    marginChanged: BigNumber;
    leverage: BigNumber;
    priceImpact: BigNumber;
    realized: BigNumber;
    postPosition: Position;
    limitTick: number;
    exceedMaxLeverage: boolean;
    size: ByBase & ByQuote;
}
export interface SimulateAdjustMarginParamsBase {
    tradeInfo: TradeInfo | Position;
    slippage: number;
    instrument?: Instrument;
}
export interface SimulateAdjustMarginByMarginParams extends SimulateAdjustMarginParamsBase {
    transferIn: boolean;
    margin: BigNumber;
}
export interface SimulateAdjustMarginByLeverageParams extends SimulateAdjustMarginParamsBase {
    leverage: BigNumber;
}
export interface SimulateAdjustMarginByMarginResult {
    leverage: BigNumber;
    postPosition: Position;
}
export interface SimulateAdjustMarginByLeverageResult {
    transferIn: boolean;
    margin: BigNumber;
    postPosition: Position;
}
export interface SimulateAddLiquidityParams {
    expiry: number;
    instrument: Instrument | InstrumentIdentifier;
    alphaWad: BigNumber;
    margin: BigNumber;
    slippage: number;
    currentSqrtPX96?: BigNumber;
}
export interface SimulateAddLiquidityResult {
    tickDelta: number;
    liquidity: BigNumber;
    upperPrice: BigNumber;
    lowerPrice: BigNumber;
    lowerPosition: Position;
    lowerLeverage: BigNumber;
    upperPosition: Position;
    upperLeverage: BigNumber;
    limitTicks: BigNumber;
    minMargin: BigNumber;
    minEffectiveQuoteAmount: BigNumber;
    equivalentAlpha: BigNumber;
    capitalEfficiencyBoost: number;
}
export interface SimulateAddLiquidityWithAsymmetricRangeParams {
    expiry: number;
    instrument: Instrument | InstrumentIdentifier;
    alphaWadLower: BigNumber;
    alphaWadUpper: BigNumber;
    margin: BigNumber;
    slippage: number;
    currentSqrtPX96?: BigNumber;
}
export interface SimulateAddLiquidityWithAsymmetricRangeResult {
    tickDeltaLower: number;
    tickDeltaUpper: number;
    liquidity: BigNumber;
    upperPrice: BigNumber;
    lowerPrice: BigNumber;
    lowerPosition: Position;
    lowerLeverage: BigNumber;
    upperPosition: Position;
    upperLeverage: BigNumber;
    limitTicks: BigNumber;
    minMargin: BigNumber;
    minEffectiveQuoteAmount: BigNumber;
    equivalentAlphaLower: BigNumber;
    equivalentAlphaUpper: BigNumber;
    capitalEfficiencyBoost: number;
}
export interface SimulateRemoveLiquidityParams {
    tradeInfo: TradeInfo | Portfolio;
    tickUpper: number;
    tickLower: number;
    slippage: number;
    instrument?: Instrument;
}
export interface SimulateRemoveLiquidityResult {
    removedPosition: Position;
    postPosition: Position;
    limitTicks: BigNumber;
    removedPositionEntryPrice: BigNumber;
}
export interface SimulateCrossMarketOrderParams {
    tradeInfo: TradeInfo | Portfolio;
    priceInfo: BigNumber | number;
    size: ByBase | ByQuote;
    side: Side;
    leverage: BigNumber;
    slippage: number;
    strictMode?: boolean;
    instrument?: Instrument;
}
export interface SimulateCrossMarketOrderResult {
    canPlaceOrder: boolean;
    minOrderSize: BigNumber;
    tradeSimulation: SimulateTradeResult;
    orderSimulation: SimulateLimitOrderResult;
}
export interface SimulateLimitOrderParams {
    tradeInfo: TradeInfo;
    priceInfo: BigNumber | number;
    size: ByBase | ByQuote;
    side: Side;
    leverage: BigNumber;
    instrument?: Instrument;
}
export interface SimulateLimitOrderResult {
    tick: number;
    margin: BigNumber;
    leverage: BigNumber;
    size: ByBase & ByQuote;
    minFeeRebate: BigNumber;
    limitPrice: BigNumber;
    tradeValue: BigNumber;
}
export interface SimulateScaledLimitOrderParams {
    tradeInfo: TradeInfo;
    priceInfo: (BigNumber | number)[];
    sizeDistribution: BatchOrderSizeDistribution;
    size: ByBase | ByQuote;
    side: Side;
    leverage: BigNumber;
    instrument?: Instrument;
}
export interface SimulateScaledLimitOrderResult {
    orders: (
        | (SimulateLimitOrderResult & {
              ratio: number;
              minOrderSize: BigNumber;
          })
        | null
    )[];
    totalMinSize: BigNumber;
    size: ByBase & ByQuote;
}
