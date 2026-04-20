import type { Address } from 'viem';
import { zeroAddress } from 'viem';
import { fetchFuturesInstrumentInquireByTick, fetchMarketOnChainContext } from '../apis/api';
import { getPerpInfo } from '../info';
import {
    Errors,
    Order,
    PairSnapshot,
    Position,
    Range,
    type Amm,
    type Portfolio,
    type PriceData,
    type Quotation,
    type QuoteState,
    type Setting,
    type SpacingConfig,
} from '../types';
import type { ApiConfig } from './config';
import type {
    InstrumentFromApi,
    OrderFromApi,
    PortfolioFromApi,
    RangeFromApi,
    AmmFromApi,
    PriceDataFromApi,
    QuoteStateFromApi,
} from '../apis/interfaces';
// ============================================================================
// Exported Functions
// ============================================================================

/**
 * Unified context fetcher that always fetches SettingWrapper, amm, markPrice, and blockInfo.
 * Automatically fetches portfolio if traderAddress is provided, and quotation if signedSize is provided.
 *
 * Note: The API design could be improved to fetch all context in a single request.
 * Consider including user margin state in the context response.
 *
 * @param instrumentAddress - Instrument contract address
 * @param expiry - Expiry timestamp
 * @param config - API configuration
 * @param traderAddress - Optional trader address to fetch portfolio
 * @param signedSize - Optional signed size to fetch quotation
 * @returns PairSnapshot with required fields and optional quotation
 */
export async function fetchOnchainContext(
    instrumentAddress: Address,
    expiry: number,
    config: ApiConfig,
    traderAddress?: Address,
    signedSize?: bigint,
): Promise<PairSnapshot> {
    const { chainId } = config;
    if (!config.signer) {
        throw Errors.apiRequestFailed('Signer is required for fetchOnchainContext');
    }

    const userAddressParam = traderAddress ?? zeroAddress;
    const signedSizeParam = signedSize !== undefined ? signedSize.toString() : '0';

    const onChainContextResponse = await fetchMarketOnChainContext(
        { chainId, instrument: instrumentAddress, expiry, userAddress: userAddressParam, signedSize: signedSizeParam },
        config.signer,
        config.httpClient
    );

    if (!onChainContextResponse?.instrument) {
        throw Errors.apiRequestFailed('Onchain context api request error');
    }

    const instrumentFromApi = onChainContextResponse.instrument;

    // Extract Setting, AMM, and markPrice from instrument response
    const perpInfo = getPerpInfo(chainId);
    const { setting, amm, markPrice } = extractSettingAmmAndMarkPriceInternal(instrumentFromApi, expiry, perpInfo.gate);

    const priceData = onChainContextResponse.priceData
        ? buildPriceDataFromApi(onChainContextResponse.priceData)
        : buildPriceDataInternal(instrumentFromApi, markPrice, expiry);
    const spacing = buildSpacingInternal(perpInfo.orderSpacing, perpInfo.rangeSpacing, perpInfo.pearlSpacing);

    // Automatically fetch portfolio if traderAddress is provided, otherwise use empty portfolio
    let portfolio: Portfolio;
    if (traderAddress) {
        const portfolioEntries = onChainContextResponse.portfolioRes?.portfolios;
        if (Array.isArray(portfolioEntries) && portfolioEntries.length > 0 && portfolioEntries[0]) {
            portfolio = buildPortfolioInternal(portfolioEntries[0]);
        } else {
            portfolio = PairSnapshot.emptyPortfolio();
        }
    } else {
        portfolio = PairSnapshot.emptyPortfolio();
    }

    // Automatically fetch quotation if signedSize is provided
    let quotation: Quotation | undefined;
    if (signedSize !== undefined) {
        const fetchedQuotation = onChainContextResponse.inquireRes;

        if (!fetchedQuotation) {
            throw Errors.missingQuotation();
        }

        quotation = fetchedQuotation;
    }

    // Always provide quoteState (required field)
    const quoteState: QuoteState = onChainContextResponse.quoteState
        ? buildQuoteStateFromApi(onChainContextResponse.quoteState)
        : PairSnapshot.emptyQuoteState(
            instrumentFromApi.quote.address as Address,
            instrumentFromApi.quote.decimals,
            instrumentFromApi.quote.symbol
        );

    return new PairSnapshot({
        setting,
        condition: instrumentFromApi.condition,
        amm,
        priceData,
        spacing,
        blockInfo: instrumentFromApi.blockInfo,
        portfolio,
        quotation,
        quoteState,
    });
}

export async function inquireByTick(
    instrumentAddress: Address,
    expiry: number,
    tick: number,
    config: ApiConfig,
): Promise<{ size: bigint; quotation: Quotation }> {
    if (!config.signer) {
        throw Errors.apiRequestFailed('Signer is required for inquireByTick');
    }

    const result = await fetchFuturesInstrumentInquireByTick(
        {
            chainId: config.chainId,
            instrument: instrumentAddress,
            expiry,
            tick,
        },
        config.signer,
        config.httpClient
    );

    if (!result || result.size === undefined) {
        throw Errors.missingQuotation();
    }

    return {
        size: result.size,
        quotation: {
            benchmark: result.benchmark,
            sqrtFairPX96: result.sqrtFairPX96,
            tick: result.tick,
            mark: result.mark,
            entryNotional: result.entryNotional,
            fee: result.fee,
            minAmount: result.minAmount,
            sqrtPostFairPX96: result.sqrtPostFairPX96,
            postTick: result.postTick,
        },
    };
}

// ============================================================================
// Internal Functions
// ============================================================================

/**
 * Extract Setting, AMM, and markPrice for specific expiry from instrument API response.
 */
function extractSettingAmmAndMarkPriceInternal(
    instrumentFromApi: InstrumentFromApi,
    expiry: number,
    gateAddress: Address
): { setting: Setting; amm: Amm; markPrice: bigint } {
    // Find the AMM for the requested expiry
    const responseAmm: AmmFromApi | undefined = instrumentFromApi.amms.find((amm) => amm.expiry === expiry);

    if (!responseAmm) {
        throw Errors.missingAmm(expiry);
    }

    if (responseAmm.markPrice === undefined) {
        throw Errors.missingMarkPrice(instrumentFromApi.instrumentAddr, expiry);
    }

    // Convert AmmFromApi to Amm for the specific expiry
    const amm: Amm = {
        expiry: responseAmm.expiry,
        timestamp: responseAmm.timestamp,
        status: responseAmm.status,
        tick: responseAmm.tick,
        sqrtPX96: responseAmm.sqrtPX96,
        liquidity: responseAmm.liquidity,
        totalLiquidity: responseAmm.totalLiquidity,
        totalShort: responseAmm.totalShort,
        openInterests: responseAmm.openInterests,
        totalLong: responseAmm.totalLong,
        involvedFund: responseAmm.involvedFund,
        feeIndex: responseAmm.feeIndex,
        protocolFee: responseAmm.protocolFee,
        longSocialLossIndex: responseAmm.longSocialLossIndex,
        shortSocialLossIndex: responseAmm.shortSocialLossIndex,
        longFundingIndex: responseAmm.longFundingIndex,
        shortFundingIndex: responseAmm.shortFundingIndex,
        insuranceFund: responseAmm.insuranceFund,
        settlementPrice: responseAmm.settlementPrice,
    };

    // Build Setting from the data
    const setting: Setting = {
        symbol: instrumentFromApi.symbol,
        config: instrumentFromApi.market.info.addr,
        gate: gateAddress,
        market: instrumentFromApi.market.info.addr,
        quote: instrumentFromApi.quote.address as Address,
        decimals: instrumentFromApi.quote.decimals,
        initialMarginRatio: instrumentFromApi.setting.initialMarginRatio,
        maintenanceMarginRatio: instrumentFromApi.setting.maintenanceMarginRatio,
        placePaused: instrumentFromApi.placePaused,
        fundingHour: instrumentFromApi.fundingHour,
        disableOrderRebate: instrumentFromApi.disableOrderRebate,
        param: {
            minMarginAmount: instrumentFromApi.setting.quoteParam.minMarginAmount,
            tradingFeeRatio: instrumentFromApi.setting.quoteParam.tradingFeeRatio,
            protocolFeeRatio: instrumentFromApi.setting.quoteParam.protocolFeeRatio,
            qtype: instrumentFromApi.setting.quoteParam.qtype,
            tip: instrumentFromApi.setting.quoteParam.tip,
        },
    };

    return {
        setting,
        amm,
        markPrice: responseAmm.markPrice,
    };
}

function buildPriceDataInternal(instrumentFromApi: InstrumentFromApi, markPrice: bigint, expiry: number): PriceData {
    const feeder = instrumentFromApi.market.feeder;
    const feeder0 = feeder?.aggregator0 ? (feeder.aggregator0 as Address) : zeroAddress;
    const feeder1 = feeder?.aggregator1 ? (feeder.aggregator1 as Address) : zeroAddress;

    return {
        instrument: instrumentFromApi.instrumentAddr,
        expiry,
        markPrice,
        spotPrice: instrumentFromApi.spotPrice,
        benchmarkPrice: 0n, // TODO should use real benchmark price
        feeder0,
        feeder1,
        feeder0UpdatedAt: 0n,
        feeder1UpdatedAt: 0n,
    };
}

function buildPriceDataFromApi(priceDataFromApi: PriceDataFromApi): PriceData {
    return {
        instrument: priceDataFromApi.instrumentAddr,
        expiry: Number(priceDataFromApi.expiry),
        markPrice: priceDataFromApi.markPrice,
        spotPrice: priceDataFromApi.spotPrice,
        benchmarkPrice: priceDataFromApi.benchmarkPrice,
        feeder0: priceDataFromApi.feeder0,
        feeder1: priceDataFromApi.feeder1,
        feeder0UpdatedAt: priceDataFromApi.feeder0UpdatedAt,
        feeder1UpdatedAt: priceDataFromApi.feeder1UpdatedAt,
    };
}

function buildQuoteStateFromApi(quoteStateFromApi: QuoteStateFromApi): QuoteState {
    return {
        quote: quoteStateFromApi.address,
        decimals: quoteStateFromApi.decimals,
        symbol: quoteStateFromApi.symbol,
        threshold: quoteStateFromApi.threshold,
        reserve: quoteStateFromApi.reserve,
        balance: quoteStateFromApi.balance,
        allowance: quoteStateFromApi.allowance,
        fundFlow: {
            totalIn: quoteStateFromApi.fundFlow.totalIn,
            totalOut: quoteStateFromApi.fundFlow.totalOut,
        },
        pending: {
            timestamp: quoteStateFromApi.pending.timestamp,
            native: quoteStateFromApi.pending.native,
            amount: quoteStateFromApi.pending.amount,
            exemption: quoteStateFromApi.pending.exemption,
        },
    };
}

function buildSpacingInternal(orderSpacing: number, rangeSpacing: number, pearlSpacing: number): SpacingConfig {
    return {
        pearl: pearlSpacing,
        order: orderSpacing,
        range: rangeSpacing,
    };
}

function buildPortfolioInternal(portfolioFromApi: PortfolioFromApi): Portfolio {
    const positionFromApi = portfolioFromApi.position[0];
    const position: Position = positionFromApi
        ? new Position(
            positionFromApi.balance,
            positionFromApi.size,
            positionFromApi.entryNotional,
            positionFromApi.entrySocialLossIndex,
            positionFromApi.entryFundingIndex
        )
        : Position.empty();

    // Create Portfolio from PortfolioFromApi
    const rids = portfolioFromApi.ranges.map((range: RangeFromApi) => range.rid);
    const oids = portfolioFromApi.orders.map((order: OrderFromApi) => order.oid);
    const portfolio: Portfolio = {
        oids,
        rids,
        position,
        orders: portfolioFromApi.orders.map((orderFromApi: OrderFromApi, index: number) => {
            const oid = oids[index];
            if (oid === undefined) {
                throw Errors.apiRequestFailed('Order oid is missing');
            }
            const { tick, nonce } = Order.unpackKey(oid);
            return new Order(orderFromApi.balance, orderFromApi.size, tick, nonce);
        }),
        ranges: portfolioFromApi.ranges.map((rangeFromApi: RangeFromApi, index: number) => {
            const rid = rids[index];
            if (rid === undefined) {
                throw Errors.apiRequestFailed('Range rid is missing');
            }
            const { tickLower, tickUpper } = Range.unpackKey(rid);
            return new Range(
                rangeFromApi.liquidity,
                rangeFromApi.entryFeeIndex,
                rangeFromApi.balance,
                rangeFromApi.sqrtEntryPX96,
                tickLower,
                tickUpper
            );
        }),
        ordersTaken: portfolioFromApi.orders.map((orderFromApi: OrderFromApi) => orderFromApi.taken),
    };

    return portfolio;
}
