import type { Address } from 'viem';
import { zeroAddress } from 'viem';
import { CURRENT_OBSERVER_ABI } from '../abis';
import type { IFuturesOrderBook, IFuturesOrderBookAllSteps, OrderDataFromApi } from '../apis/interfaces';
import { alphaWadToTickDelta, mulDivRoundingUp, ratioToWad, tickToSqrtX96, tickToWad } from '../math';
import { RATIO_BASE, WAD } from '../constants';
import {
    Order,
    PairSnapshot,
    Position,
    Range,
    type LiquidityDetails,
    type MinimalPearl,
    type OnchainContext,
    type Portfolio,
    type PriceData,
    type Quotation,
    type QuoteState,
} from '../types';
import type { ReadOptions, RpcConfig } from './config';

export type { OnchainContext, PairSnapshot } from '../types';

/**
 * Fetches OnchainContext from Observer contract (1:1 mapping with contract OnchainContext struct)
 * All fields are returned as required by the contract, even if empty/default values
 */
export async function fetchOnchainContext(
    instrumentAddress: Address,
    expiry: number,
    config: RpcConfig,
    traderAddress?: Address,
    signedSize?: bigint,
    options?: ReadOptions
): Promise<PairSnapshot> {
    const { blockNumber, blockTag } = options ?? {};

    const [rawContext] = await config.publicClient.multicall({
        contracts: [
            {
                address: config.observerAddress,
                abi: CURRENT_OBSERVER_ABI,
                functionName: 'fetchOnChainContext',
                args: [instrumentAddress, expiry, traderAddress ?? zeroAddress, signedSize ?? 0n],
            },
        ],
        allowFailure: false,
        blockNumber,
        blockTag,
    });

    const ctx = rawContext as OnchainContext;

    // Normalize portfolio arrays
    const includePortfolio = traderAddress !== undefined && traderAddress !== zeroAddress;
    const rawPortfolio = ctx.portfolio!;
    const rids = Array.from(rawPortfolio.rids ?? [], Number);
    const oids = Array.from(rawPortfolio.oids ?? [], Number);
    const portfolio: Portfolio = includePortfolio
        ? {
              oids,
              rids,
              position: rawPortfolio.position
                  ? new Position(
                        rawPortfolio.position.balance,
                        rawPortfolio.position.size,
                        rawPortfolio.position.entryNotional,
                        rawPortfolio.position.entrySocialLossIndex,
                        rawPortfolio.position.entryFundingIndex
                    )
                  : Position.empty(),
              orders: Array.from(rawPortfolio.orders ?? []).map((order, index) => {
                  const oid = oids[index];
                  if (oid === undefined) {
                      throw new Error('Order oid is missing');
                  }
                  const { tick, nonce } = Order.unpackKey(oid);
                  return new Order(order.balance, order.size, tick, nonce);
              }),
              ranges: Array.from(rawPortfolio.ranges ?? []).map((range, index) => {
                  const rid = rids[index];
                  if (rid === undefined) {
                      throw new Error('Range rid is missing');
                  }
                  const { tickLower, tickUpper } = Range.unpackKey(rid);
                  return new Range(
                      range.liquidity,
                      range.entryFeeIndex,
                      range.balance,
                      range.sqrtEntryPX96,
                      tickLower,
                      tickUpper
                  );
              }),
              ordersTaken: Array.from(rawPortfolio.ordersTaken ?? [], BigInt),
          }
        : PairSnapshot.emptyPortfolio();

    // Normalize quoteState
    const rawQuoteState = ctx.quoteState!;
    const quoteState: QuoteState = {
        quote: rawQuoteState.quote,
        decimals: Number(rawQuoteState.decimals),
        symbol: String(rawQuoteState.symbol),
        threshold: rawQuoteState.threshold,
        reserve: rawQuoteState.reserve,
        balance: rawQuoteState.balance,
        allowance: rawQuoteState.allowance,
        fundFlow: {
            totalIn: rawQuoteState.fundFlow.totalIn,
            totalOut: rawQuoteState.fundFlow.totalOut,
        },
        pending: {
            timestamp: Number(rawQuoteState.pending.timestamp),
            native: Boolean(rawQuoteState.pending.native),
            amount: rawQuoteState.pending.amount,
            exemption: rawQuoteState.pending.exemption,
        },
    };

    // Normalize priceData
    const priceData: PriceData = {
        instrument: ctx.priceData.instrument,
        expiry: Number(ctx.priceData.expiry),
        markPrice: ctx.priceData.markPrice,
        spotPrice: ctx.priceData.spotPrice,
        benchmarkPrice: ctx.priceData.benchmarkPrice,
        feeder0: ctx.priceData.feeder0,
        feeder1: ctx.priceData.feeder1,
        feeder0UpdatedAt: ctx.priceData.feeder0UpdatedAt,
        feeder1UpdatedAt: ctx.priceData.feeder1UpdatedAt,
    };

    return new PairSnapshot({
        setting: ctx.setting,
        condition: ctx.condition,
        amm: ctx.amm,
        priceData,
        spacing: ctx.spacing,
        blockInfo: ctx.blockInfo,
        portfolio,
        quotation: signedSize !== undefined ? ctx.quotation : undefined,
        quoteState,
    });
}

export async function inquireByTick(
    instrumentAddress: Address,
    expiry: number,
    tick: number,
    config: RpcConfig,
    options?: ReadOptions
): Promise<{ size: bigint; quotation: Quotation }> {
    const { blockNumber, blockTag } = options ?? {};
    const [size, quotation] = await config.publicClient.readContract({
        address: config.observerAddress,
        abi: CURRENT_OBSERVER_ABI,
        functionName: 'inquireByTick',
        args: [instrumentAddress, expiry, tick],
        blockNumber,
        blockTag,
    });
    return {
        size,
        quotation,
    };
}

export async function inquireByBaseSize(
    instrumentAddress: Address,
    expiry: number,
    signedSize: bigint,
    config: RpcConfig,
    options?: ReadOptions
): Promise<Quotation> {
    const { blockNumber, blockTag } = options ?? {};
    const [quotation] = (await config.publicClient.readContract({
        address: config.observerAddress,
        abi: CURRENT_OBSERVER_ABI,
        functionName: 'inquireByBase',
        args: [instrumentAddress, expiry, signedSize],
        blockNumber,
        blockTag,
    })) as [Quotation, { timestamp: number; height: number }];

    return quotation;
}

export async function fetchLiquidityDetails(
    instrumentAddress: Address,
    expiry: number,
    tickDelta: number,
    config: RpcConfig,
    options?: ReadOptions
): Promise<LiquidityDetails> {
    const { blockNumber, blockTag } = options ?? {};

    const [rawAmm, rawTids, rawPearls, rawBlockInfo] = (await config.publicClient.readContract({
        address: config.observerAddress,
        abi: CURRENT_OBSERVER_ABI,
        functionName: 'liquidityDetails',
        args: [instrumentAddress, expiry, tickDelta],
        blockNumber,
        blockTag,
    })) as [
        { sqrtPX96: bigint; tick: number; liquidity: bigint },
        readonly number[],
        readonly { liquidityNet: bigint; left: bigint }[],
        { timestamp: number; height: number },
    ];

    const tids = rawTids.map((tid) => Number(tid));
    const pearls: MinimalPearl[] = rawPearls.map((pearl) => ({
        liquidityNet: pearl.liquidityNet,
        left: pearl.left,
    }));

    const tick2Pearl = new Map<number, MinimalPearl>();
    tids.forEach((tick, index) => {
        const pearl = pearls[index];
        if (pearl) {
            tick2Pearl.set(tick, pearl);
        }
    });

    return {
        amm: {
            sqrtPX96: rawAmm.sqrtPX96,
            tick: Number(rawAmm.tick),
            liquidity: rawAmm.liquidity,
        },
        tids,
        pearls,
        tick2Pearl,
        blockInfo: {
            timestamp: Number(rawBlockInfo.timestamp),
            height: Number(rawBlockInfo.height),
        },
    };
}

export interface FetchOrderBookOptions extends ReadOptions {
    length?: number;
}

export async function fetchOrderBookFromObserver(
    instrumentAddress: Address,
    expiry: number,
    config: RpcConfig,
    options?: FetchOrderBookOptions
): Promise<IFuturesOrderBookAllSteps | null> {
    const { length = 10, ...readOptions } = options ?? {};
    const context = await fetchOnchainContext(instrumentAddress, expiry, config, undefined, undefined, readOptions);
    const imr = context.instrumentSetting.initialMarginRatio;
    const ratios = getImrStepRatios(imr);

    const ratioConfigs = ratios.map((ratio) => {
        const { tickDelta, size } = calcTickDeltaAndSize(ratio);
        return { ratio, tickDelta, size };
    });

    const liquidityDetailsList = await Promise.all(
        ratioConfigs.map(({ tickDelta }) =>
            tickDelta > 0
                ? fetchLiquidityDetails(instrumentAddress, expiry, tickDelta, config, readOptions)
                : Promise.resolve(null)
        )
    );

    const orderBook: IFuturesOrderBookAllSteps = {};
    ratioConfigs.forEach(({ ratio, tickDelta, size }, index) => {
        const details = liquidityDetailsList[index];
        if (!details || size <= 0 || tickDelta <= 0) {
            return;
        }
        const orderbookForRatio = calcOrderBookFromLiquidityDetails(details, size, tickDelta, length);
        orderBook[ratio.toString()] = {
            asks: sortByTickAsc(orderbookForRatio.asks),
            bids: sortByTickDesc(orderbookForRatio.bids),
        };
    });

    return Object.keys(orderBook).length > 0 ? orderBook : null;
}

function sortByTickAsc(side: OrderDataFromApi[]): OrderDataFromApi[] {
    return [...side].sort((a, b) => a.tick - b.tick);
}

function sortByTickDesc(side: OrderDataFromApi[]): OrderDataFromApi[] {
    return [...side].sort((a, b) => b.tick - a.tick);
}

// ============================================================================
// Order Book Calculation Functions
// ============================================================================

const DEFAULT_ORDERBOOK_LENGTH = 10;

const abs = (value: bigint): bigint => (value < 0n ? -value : value);

function getImrStepRatios(imr: number): number[] {
    if (imr <= 100) {
        return [1, 10, 20, 40];
    }
    if (imr >= 1000) {
        return [1, 10, 100, 200];
    }
    return [1, 10, Math.floor((imr * 10) / 100), Math.floor((imr * 20) / 100)];
}

function calcTickDeltaAndSize(ratio: number): { tickDelta: number; size: number } {
    const alphaInput = Math.max(0, Math.round(1.1 * ratio * 10 + RATIO_BASE));
    const tickDeltaRaw = alphaWadToTickDelta(ratioToWad(alphaInput));
    const tickDelta = tickDeltaRaw <= 0 ? 0 : Math.ceil(tickDeltaRaw / 10) * 10;

    const base = Math.max(0, Math.round(ratio + RATIO_BASE));
    const size = alphaWadToTickDelta(ratioToWad(base));

    return { tickDelta, size };
}

function calcOrderBookFromLiquidityDetails(
    liquidityDetails: LiquidityDetails | null | undefined,
    size: number,
    tickDelta: number,
    length: number = DEFAULT_ORDERBOOK_LENGTH
): IFuturesOrderBook {
    if (!liquidityDetails || !liquidityDetails.amm || size <= 0 || tickDelta <= 0) {
        return { asks: [], bids: [] };
    }

    const pageAdjustmentDelta =
        liquidityDetails.amm.tick % size === 0
            ? 0
            : liquidityDetails.amm.tick > 0
              ? liquidityDetails.amm.tick % size
              : size - (-liquidityDetails.amm.tick % size);

    const asks = buildOrderBookSide(
        liquidityDetails.amm.sqrtPX96,
        liquidityDetails.amm.liquidity,
        liquidityDetails.amm.tick,
        tickDelta,
        liquidityDetails.tick2Pearl,
        size,
        length,
        pageAdjustmentDelta,
        true
    );

    const bids = buildOrderBookSide(
        liquidityDetails.amm.sqrtPX96,
        liquidityDetails.amm.liquidity,
        liquidityDetails.amm.tick,
        tickDelta,
        liquidityDetails.tick2Pearl,
        size,
        length,
        pageAdjustmentDelta,
        false
    );

    return { asks, bids };
}

function buildOrderBookSide(
    currPX96: bigint,
    startingLiquidity: bigint,
    currTick: number,
    tickDelta: number,
    tick2Pearl: Map<number, MinimalPearl>,
    size: number,
    length: number,
    pageAdjustmentDelta: number,
    right: boolean
): OrderDataFromApi[] {
    const page2BaseQuantity = new Map<number, bigint>();
    const lastPageTick = new Map<number, number>();
    let currentLiquidity = startingLiquidity;
    let currentPX96 = currPX96;

    for (let tick = currTick; right ? tick < currTick + tickDelta : tick > currTick - tickDelta; ) {
        const page = calcPage(currTick, tick, pageAdjustmentDelta, size, right);
        if (page >= length) {
            break;
        }

        if (tick === currTick) {
            let currBaseQuantity = page2BaseQuantity.get(page) ?? 0n;
            const pearl = tick2Pearl.get(tick);
            if (pearl) {
                if ((right && pearl.left < 0n) || (!right && pearl.left > 0n)) {
                    currBaseQuantity += abs(pearl.left);
                }
            }

            const boundaryTick = right ? tick + 1 : tick;
            const targetPX96 = tickToSqrtX96(boundaryTick);
            const deltaBase = calcDeltaBase(currentPX96, targetPX96, currentLiquidity, !right);
            currBaseQuantity += abs(deltaBase);
            currentPX96 = targetPX96;

            // When walking bids (right=false), reaching `boundaryTick = currTick` means we will cross `currTick`
            // before moving further left. Apply liquidityNet at currTick so subsequent levels use correct liquidity,
            // matching Oyster.swapCrossRange tick-cross semantics.
            if (!right && pearl && pearl.liquidityNet !== 0n) {
                currentLiquidity = currentLiquidity - pearl.liquidityNet;
            }
            page2BaseQuantity.set(page, currBaseQuantity);
            lastPageTick.set(page, right ? boundaryTick : tick - 1);

            tick = right ? tick + 1 : tick - 1;
            continue;
        }

        let currBaseQuantity = page2BaseQuantity.get(page) ?? 0n;
        lastPageTick.set(page, tick);

        const pearl = tick2Pearl.get(tick);
        if (pearl) {
            if ((right && pearl.left < 0n) || (!right && pearl.left > 0n)) {
                currBaseQuantity += abs(pearl.left);
            }
            const targetPX96 = tickToSqrtX96(tick);
            currBaseQuantity += calcDeltaBase(currentPX96, targetPX96, currentLiquidity, false);
            currentPX96 = targetPX96;
            if (pearl.liquidityNet !== 0n) {
                currentLiquidity = right
                    ? currentLiquidity + pearl.liquidityNet
                    : currentLiquidity - pearl.liquidityNet;
            }
            page2BaseQuantity.set(page, currBaseQuantity);
        } else if (tick % size === 0) {
            const targetPX96 = tickToSqrtX96(tick);
            const deltaBase = calcDeltaBase(currentPX96, targetPX96, currentLiquidity, !right);
            currBaseQuantity += abs(deltaBase);
            currentPX96 = targetPX96;
            page2BaseQuantity.set(page, currBaseQuantity);
        }

        tick = right ? tick + 1 : tick - 1;
    }

    const items: OrderDataFromApi[] = [];
    for (const [page, baseQuantity] of page2BaseQuantity.entries()) {
        const tickValue = lastPageTick.get(page);
        if (tickValue === undefined) {
            continue;
        }
        const price = tickToWad(tickValue);
        const quoteSize = (price * baseQuantity) / WAD;
        items.push({
            tick: tickValue,
            price,
            baseQuantity,
            quoteSize,
            baseSum: 0n,
            quoteSum: 0n,
        });
    }

    items.sort((a, b) => (right ? a.tick - b.tick : b.tick - a.tick));

    let baseSum = 0n;
    let quoteSum = 0n;
    return items.map((item) => {
        baseSum += item.baseQuantity;
        quoteSum += item.quoteSize;
        return {
            ...item,
            baseSum,
            quoteSum,
        };
    });
}

function calcPage(
    currTick: number,
    tick: number,
    pageAdjustmentDelta: number,
    size: number,
    right: boolean
): number {
    if (size <= 0) {
        return 0;
    }
    const adjustedCurrTick = currTick - pageAdjustmentDelta;
    const tmp = right ? tick - adjustedCurrTick : adjustedCurrTick - tick;
    if (tmp <= 0) {
        return 0;
    }
    return Math.ceil(tmp / size) - 1;
}

function calcDeltaBase(sqrtRatioAX96: bigint, sqrtRatioBX96: bigint, liquidity: bigint, roundUp: boolean): bigint {
    let sqrtLower = sqrtRatioAX96;
    let sqrtUpper = sqrtRatioBX96;
    if (sqrtLower > sqrtUpper) {
        [sqrtLower, sqrtUpper] = [sqrtUpper, sqrtLower];
    }
    const numerator1 = liquidity << 96n;
    const numerator2 = sqrtUpper - sqrtLower;
    if (roundUp) {
        const first = mulDivRoundingUp(numerator1, numerator2, sqrtUpper);
        return mulDivRoundingUp(first, 1n, sqrtLower);
    }
    return (numerator1 * numerator2) / sqrtUpper / sqrtLower;
}
