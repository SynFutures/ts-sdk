import type { ContractParser, Address, Hex } from '@derivation-tech/viem-kit';
import {
    formatAddress,
    formatExpiry,
    formatLimitTicks,
    formatTick,
    formatTimestamp,
    formatWad,
    formatRatio,
    formatSqrtPX96,
    formatBoolean,
} from '../../utils/format';
import {
    decodeAddParam,
    decodeBatchPlaceParam,
    decodeCancelParam,
    decodeFillParam,
    decodePlaceParam,
    decodeRemoveParam,
    decodeTradeParam,
    decodeTradeWithStabilityFeeParam,
} from '../../utils/decode';
import type { ParserDeps } from '../../parsers/types';
import { RATIO_BASE } from '../../constants';
import { CURRENT_INSTRUMENT_ABI } from '../../abis';
import { tickToWad, wdiv } from '../../math';

function stringifyArgs(values: readonly unknown[]): string {
    return values.map((value) => String(value)).join(', ');
}

function formatOrderSize(size: bigint | number | string): string {
    return formatWad(size, 18);
}

function formatDeadline(deadline: number): string {
    return `${deadline} (${formatTimestamp(deadline)})`;
}

function formatTradeArgs(decoded: ReturnType<typeof decodeTradeParam>): string {
    const sections = [
        `expiry: ${formatExpiry(decoded.expiry)}`,
        `limitTick: ${formatTick(decoded.limitTick)}`,
        `size: ${formatOrderSize(decoded.size)}`,
        `amount: ${formatWad(decoded.amount)}`,
        `deadline: ${formatDeadline(decoded.deadline)}`,
    ];
    return `{ ${sections.join(', ')} }`;
}

function formatTradeWithFeeArgs(decoded: ReturnType<typeof decodeTradeWithStabilityFeeParam>): string {
    const sections = [
        `expiry: ${formatExpiry(decoded.expiry)}`,
        `limitTick: ${formatTick(decoded.limitTick)}`,
        `size: ${formatOrderSize(decoded.size)}`,
        `amount: ${formatWad(decoded.amount)}`,
        `limitStabilityFeeRatio: ${formatRatio(decoded.limitStabilityFeeRatio)}`,
        `deadline: ${formatDeadline(decoded.deadline)}`,
    ];
    return `{ ${sections.join(', ')} }`;
}

function formatAddArgs(decoded: ReturnType<typeof decodeAddParam>): string {
    const sections = [
        `expiry: ${formatExpiry(decoded.expiry)}`,
        `limitTicks: ${formatLimitTicks(decoded.limitTicks)}`,
        `amount: ${formatWad(decoded.amount)}`,
        `tickDeltaLower: ${decoded.tickDeltaLower}`,
        `tickDeltaUpper: ${decoded.tickDeltaUpper}`,
        `deadline: ${formatDeadline(decoded.deadline)}`,
    ];
    return `{ ${sections.join(', ')} }`;
}

async function formatRemoveArgs(decoded: ReturnType<typeof decodeRemoveParam>, deps?: ParserDeps): Promise<string> {
    const sections = [
        `expiry: ${formatExpiry(decoded.expiry)}`,
        `limitTicks: ${formatLimitTicks(decoded.limitTicks)}`,
        `tickLower: ${formatTick(decoded.tickLower)}`,
        `tickUpper: ${formatTick(decoded.tickUpper)}`,
        `target: ${await formatAddress(decoded.target as Address, deps)}`,
        `deadline: ${formatDeadline(decoded.deadline)}`,
    ];
    return `{ ${sections.join(', ')} }`;
}

async function formatBatchPlaceArgs(decoded: ReturnType<typeof decodeBatchPlaceParam>): Promise<string> {
    const ticks = decoded.ticks.map((tick) => formatTick(tick));
    const ratios = decoded.ratios.map((ratio) => `${((Number(ratio) * 100) / RATIO_BASE).toFixed(2)}%`);
    const sections = [
        `expiry: ${formatExpiry(decoded.expiry)}`,
        `ticks: [${ticks.join(', ')}]`,
        `ratios: [${ratios.join(', ')}]`,
        `size: ${formatOrderSize(decoded.size)}`,
        `leverage: ${formatWad(decoded.leverage)}`,
        `deadline: ${formatDeadline(decoded.deadline)}`,
    ];
    return `{ ${sections.join(', ')} }`;
}

const instrumentErrorFormatters: Record<string, (args?: readonly unknown[]) => string> = {
    // General errors
    NotSynFuturesV3Admin() {
        return 'NotSynFuturesV3Admin';
    },
    AlreadyInitialized() {
        return 'AlreadyInitialized';
    },
    ZeroAddress() {
        return 'ZeroAddress';
    },
    Timeout() {
        return 'Timeout';
    },
    Locked() {
        return 'Locked';
    },
    ExpiryNotAligned() {
        return 'ExpiryNotAligned';
    },
    NotTradeable() {
        return 'NotTradeable';
    },
    BadAmmTiming() {
        return 'BadAmmTiming';
    },
    TickOutOfBound() {
        return 'TickOutOfBound';
    },
    LengthMismatch() {
        return 'LengthMismatch';
    },
    InvariantBroken() {
        return 'InvariantBroken';
    },
    BadInstrumentCondition() {
        return 'BadInstrumentCondition';
    },
    BadAmmStatus() {
        return 'BadAmmStatus';
    },
    BadMinMarginAmount() {
        return 'BadMinMarginAmount';
    },
    BadTip() {
        return 'BadTip';
    },
    BadTradingFeeRatio() {
        return 'BadTradingFeeRatio';
    },
    BadProtocolFeeRatio() {
        return 'BadProtocolFeeRatio';
    },
    BadMaintenanceMarginRatio() {
        return 'BadMaintenanceMarginRatio';
    },
    BadInitialMarginRatio() {
        return 'BadInitialMarginRatio';
    },
    PairNotCleared(args) {
        if (!args || args.length === 0) return 'PairNotCleared';
        const [expiry] = args as [number];
        return `PairNotCleared(expiry: ${formatExpiry(expiry)})`;
    },
    // Add/Remove errors
    RangeNotExist() {
        return 'RangeNotExist';
    },
    RangeFull() {
        return 'RangeFull';
    },
    RangeOccupied() {
        return 'RangeOccupied';
    },
    AddSlippage() {
        return 'AddSlippage';
    },
    AddTrivial(args) {
        if (!args || args.length < 2) return 'AddTrivial';
        const [liquidity, minLiquidity] = args as [bigint | number | string, bigint | number | string];
        return `AddTrivial(liquidity: ${formatWad(liquidity)}, minLiquidity: ${formatWad(minLiquidity)})`;
    },
    InitTrivial(args) {
        if (!args || args.length < 2) return 'InitTrivial';
        const [margin, minMargin] = args as [bigint | number | string, bigint | number | string];
        return `InitTrivial(margin: ${formatWad(margin)}, minMargin: ${formatWad(minMargin)})`;
    },
    AddInvalidTickDelta() {
        return 'AddInvalidTickDelta';
    },
    AddTraderIneligible() {
        return 'AddTraderIneligible';
    },
    AddLiquidityExceedMax() {
        return 'AddLiquidityExceedMax';
    },
    RemoveSlippage() {
        return 'RemoveSlippage';
    },
    RemoveActiveRange() {
        return 'RemoveActiveRange';
    },
    // Trade/Adjust errors
    PositionNotExist() {
        return 'PositionNotExist';
    },
    PositionBankrupt() {
        return 'PositionBankrupt';
    },
    TradeSlippage() {
        return 'TradeSlippage';
    },
    TradeTrivial() {
        return 'TradeTrivial';
    },
    TradeZeroSize() {
        return 'TradeZeroSize';
    },
    TradeImrUnsafe(args) {
        if (!args || args.length === 0) return 'TradeImrUnsafe';
        const [amount] = args as [bigint | number | string];
        return `TradeImrUnsafe(amount: ${formatWad(amount)})`;
    },
    TradeMmrUnsafe(args) {
        if (!args || args.length === 0) return 'TradeMmrUnsafe';
        const [amount] = args as [bigint | number | string];
        return `TradeMmrUnsafe(amount: ${formatWad(amount)})`;
    },
    TradeOutOfLiquidity() {
        return 'TradeOutOfLiquidity';
    },
    CrazyDeviation() {
        return 'CrazyDeviation';
    },
    ForbidNegativeAdjust() {
        return 'ForbidNegativeAdjust';
    },
    // Order errors
    OrderNotExist() {
        return 'OrderNotExist';
    },
    OrderFull() {
        return 'OrderFull';
    },
    PlacePaused() {
        return 'PlacePaused';
    },
    OrderTrivial() {
        return 'OrderTrivial';
    },
    OrderOccupied() {
        return 'OrderOccupied';
    },
    OrderTooFar() {
        return 'OrderTooFar';
    },
    BatchPlaceTooMany() {
        return 'BatchPlaceTooMany';
    },
    BatchPlaceBadRatios() {
        return 'BatchPlaceBadRatios';
    },
    BatchPlaceLengthMismatch() {
        return 'BatchPlaceLengthMismatch';
    },
    BatchPlaceInvalidRatios() {
        return 'BatchPlaceInvalidRatios';
    },
    FairDeviation() {
        return 'FairDeviation';
    },
    OrderTickUnaligned() {
        return 'OrderTickUnaligned';
    },
    OrderWrongSide() {
        return 'OrderWrongSide';
    },
    OrderImrUnsafe(args) {
        if (!args || args.length < 2) return 'OrderImrUnsafe';
        const [amount, minAmount] = args as [bigint | number | string, bigint | number | string];
        return `OrderImrUnsafe(amount: ${formatWad(amount)}, minAmount: ${formatWad(minAmount)})`;
    },
    OrderMmrUnsafe(args) {
        if (!args || args.length < 2) return 'OrderMmrUnsafe';
        const [amount, minAmount] = args as [bigint | number | string, bigint | number | string];
        return `OrderMmrUnsafe(amount: ${formatWad(amount)}, minAmount: ${formatWad(minAmount)})`;
    },
    OrderNotFullyTaken(args) {
        if (!args || args.length < 2) return 'OrderNotFullyTaken';
        const [requested, taken] = args as [bigint | number | string, bigint | number | string];
        return `OrderNotFullyTaken(requested: ${formatOrderSize(requested)}, taken: ${formatOrderSize(taken)})`;
    },
    ReuseNonEmptyRecord() {
        return 'ReuseNonEmptyRecord';
    },
    // Sweep/Liquidate errors
    LiquidatorIneligible() {
        return 'LiquidatorIneligible';
    },
    TargetSafe() {
        return 'TargetSafe';
    },
    LiquidatePostImrUnsafe() {
        return 'LiquidatePostImrUnsafe';
    },
    SelfLiquidation() {
        return 'SelfLiquidation';
    },
    NoCounterparty(args) {
        if (!args || args.length < 2) return 'NoCounterparty';
        const [noShortParty, socialLoss] = args as [boolean, bigint | number | string];
        return `NoCounterparty(noShortParty: ${formatBoolean(noShortParty)}, socialLoss: ${formatWad(socialLoss)})`;
    },
    BadTargetSize(args) {
        if (!args || args.length < 2) return 'BadTargetSize';
        const [totalSize, requestedSize] = args as [bigint | number | string, bigint | number | string];
        return `BadTargetSize(totalSize: ${formatOrderSize(totalSize)}, requestedSize: ${formatOrderSize(requestedSize)})`;
    },
    // Math errors
    AddOverflow() {
        return 'AddOverflow';
    },
    MulOverflow() {
        return 'MulOverflow';
    },
    DivByZero() {
        return 'DivByZero';
    },
    DivUnderflow() {
        return 'DivUnderflow';
    },
    CastUint256ToUint224Overflow() {
        return 'CastUint256ToUint224Overflow';
    },
    ExpiryBelowSettlingDuration() {
        return 'ExpiryBelowSettlingDuration';
    },
    ExpiryExceedMaxExpiryPeriod() {
        return 'ExpiryExceedMaxExpiryPeriod';
    },
    RoundHalfUpBadParam() {
        return 'RoundHalfUpBadParam';
    },
    NotConverge() {
        return 'NotConverge';
    },
    CrazySpot() {
        return 'CrazySpot';
    },
    SqrtPX96OutOfBound() {
        return 'SqrtPX96OutOfBound';
    },
};

export function createFrontendInstrumentParser(deps?: ParserDeps): ContractParser {
    return {
        abi: CURRENT_INSTRUMENT_ABI,
        async parseTransaction({ functionName, args }) {
            switch (functionName) {
                case 'add': {
                    const [tuple] = args as readonly [readonly [Hex, Hex]];
                    const [arg0, arg1] = tuple;
                    return `add(args: ${formatAddArgs(decodeAddParam([arg0, arg1]))})`;
                }
                case 'addFor': {
                    const [to, tuple] = args as readonly [Address, readonly [Hex, Hex]];
                    const [arg0, arg1] = tuple;
                    const callee = await formatAddress(to, deps);
                    return `addFor(to: ${callee}, args: ${formatAddArgs(decodeAddParam([arg0, arg1]))})`;
                }
                case 'remove': {
                    const [tuple] = args as readonly [readonly [Hex, Hex]];
                    const [arg0, arg1] = tuple;
                    return `remove(args: ${await formatRemoveArgs(decodeRemoveParam([arg0, arg1]), deps)})`;
                }
                case 'removeFor': {
                    const [tuple] = args as readonly [readonly [Hex, Hex]];
                    const [arg0, arg1] = tuple;
                    return `removeFor(args: ${await formatRemoveArgs(decodeRemoveParam([arg0, arg1]), deps)})`;
                }
                case 'trade': {
                    const [tuple] = args as readonly [readonly [Hex, Hex]];
                    const [arg0, arg1] = tuple;
                    return `trade(args: ${formatTradeArgs(decodeTradeParam([arg0, arg1]))})`;
                }
                case 'tradeFor': {
                    const [to, tuple] = args as readonly [Address, readonly [Hex, Hex]];
                    const [arg0, arg1] = tuple;
                    const target = await formatAddress(to, deps);
                    return `tradeFor(to: ${target}, args: ${formatTradeArgs(decodeTradeParam([arg0, arg1]))})`;
                }
                case 'tradeWithStabilityFee': {
                    const [tuple] = args as readonly [readonly [Hex, Hex]];
                    const [arg0, arg1] = tuple;
                    return `tradeWithStabilityFee(args: ${formatTradeWithFeeArgs(
                        decodeTradeWithStabilityFeeParam([arg0, arg1])
                    )})`;
                }
                case 'place': {
                    const [tuple] = args as readonly [readonly [Hex, Hex]];
                    const [arg0, arg1] = tuple;
                    const decoded = decodePlaceParam([arg0, arg1]);
                    const sections = [
                        `expiry: ${formatExpiry(decoded.expiry)}`,
                        `tick: ${formatTick(decoded.tick)}`,
                        `size: ${formatOrderSize(decoded.size)}`,
                        `amount: ${formatWad(decoded.amount)}`,
                        `deadline: ${formatDeadline(decoded.deadline)}`,
                    ];
                    return `place(args: { ${sections.join(', ')} })`;
                }
                case 'placeFor': {
                    const [to, tuple] = args as readonly [Address, readonly [Hex, Hex]];
                    const [arg0, arg1] = tuple;
                    const decoded = decodePlaceParam([arg0, arg1]);
                    const target = await formatAddress(to, deps);
                    const sections = [
                        `expiry: ${formatExpiry(decoded.expiry)}`,
                        `tick: ${formatTick(decoded.tick)}`,
                        `size: ${formatOrderSize(decoded.size)}`,
                        `amount: ${formatWad(decoded.amount)}`,
                        `deadline: ${formatDeadline(decoded.deadline)}`,
                    ];
                    return `placeFor(to: ${target}, args: { ${sections.join(', ')} })`;
                }
                case 'batchPlace': {
                    const [tuple] = args as readonly [readonly [Hex, Hex, Hex]];
                    const [a0, a1, a2] = tuple;
                    return `batchPlace(args: ${await formatBatchPlaceArgs(decodeBatchPlaceParam([a0, a1, a2]))})`;
                }
                case 'batchPlaceFor': {
                    const [to, tuple] = args as readonly [Address, readonly [Hex, Hex, Hex]];
                    const [a0, a1, a2] = tuple;
                    const target = await formatAddress(to, deps);
                    return `batchPlaceFor(to: ${target}, args: ${await formatBatchPlaceArgs(
                        decodeBatchPlaceParam([a0, a1, a2])
                    )})`;
                }
                case 'fill': {
                    const [arg] = args as readonly [Hex];
                    const decoded = decodeFillParam(arg);
                    const target = await formatAddress(decoded.target as Address, deps);
                    const sections = [
                        `expiry: ${formatExpiry(decoded.expiry)}`,
                        `tick: ${formatTick(decoded.tick)}`,
                        `nonce: ${decoded.nonce}`,
                        `target: ${target}`,
                    ];
                    return `fill(arg: { ${sections.join(', ')} })`;
                }
                case 'cancel':
                case 'cancelFor': {
                    const [arg] = args as readonly [Hex];
                    const decoded = decodeCancelParam(arg);
                    const sections = [
                        `expiry: ${formatExpiry(decoded.expiry)}`,
                        `ticks: [${decoded.ticks.map((tick) => formatTick(tick)).join(', ')}]`,
                        `deadline: ${formatDeadline(decoded.deadline)}`,
                    ];
                    return `${functionName}(arg: { ${sections.join(', ')} })`;
                }
                case 'settle': {
                    const [expiry, target] = args as readonly [number | bigint, Address];
                    return `settle(expiry: ${formatExpiry(Number(expiry))}, target: ${await formatAddress(target, deps)})`;
                }
                case 'sweep': {
                    const [expiry, target, size] = args as readonly [number | bigint, Address, bigint];
                    return `sweep(expiry: ${formatExpiry(Number(expiry))}, target: ${await formatAddress(
                        target,
                        deps
                    )}, size: ${formatOrderSize(size)})`;
                }
                case 'liquidate': {
                    const [expiry, target, size] = args as readonly [number | bigint, Address, bigint];
                    return `liquidate(expiry: ${formatExpiry(Number(expiry))}, target: ${await formatAddress(
                        target,
                        deps
                    )}, size: ${formatOrderSize(size)})`;
                }
                case 'adjust': {
                    const [expiry, net] = args as readonly [number | bigint, bigint];
                    return `adjust(expiry: ${formatExpiry(Number(expiry))}, net: ${formatWad(net)})`;
                }
                case 'update': {
                    const [expiry] = args as readonly [number | bigint];
                    return `update(expiry: ${formatExpiry(Number(expiry))})`;
                }
                case 'setQuoteParam': {
                    const [param] = args as readonly [
                        {
                            minMarginAmount: bigint;
                            tradingFeeRatio: number;
                            protocolFeeRatio: number;
                            qtype: number;
                            tip: bigint;
                        },
                    ];
                    const paramStr = [
                        `minMarginAmount: ${formatWad(param.minMarginAmount)}`,
                        `tradingFeeRatio: ${formatRatio(param.tradingFeeRatio)}`,
                        `protocolFeeRatio: ${formatRatio(param.protocolFeeRatio)}`,
                        `qtype: ${param.qtype}`,
                        `tip: ${formatWad(param.tip)}`,
                    ].join(', ');
                    return `setQuoteParam(param: { ${paramStr} })`;
                }
                case 'setLeverage': {
                    const [initialMarginRatio, maintenanceMarginRatio] = args as readonly [number, number];
                    return `setLeverage(initialMarginRatio: ${formatRatio(initialMarginRatio)}, maintenanceMarginRatio: ${formatRatio(maintenanceMarginRatio)})`;
                }
                case 'setPlacePaused': {
                    const [paused] = args as readonly [boolean];
                    return `setPlacePaused(paused: ${formatBoolean(paused)})`;
                }
                case 'setFundingHour': {
                    const [fundingHour] = args as readonly [number];
                    return `setFundingHour(fundingHour: ${fundingHour})`;
                }
                case 'setDisableOrderRebate': {
                    const [disable] = args as readonly [boolean];
                    return `setDisableOrderRebate(disable: ${formatBoolean(disable)})`;
                }
                case 'freeze': {
                    return 'freeze()';
                }
                case 'resolve': {
                    const [settlementPrice] = args as readonly [bigint];
                    return `resolve(settlementPrice: ${formatWad(settlementPrice)})`;
                }
                case 'normalize': {
                    return 'normalize()';
                }
                case 'donateInsuranceFund': {
                    const [expiry, amount] = args as readonly [number | bigint, bigint];
                    return `donateInsuranceFund(expiry: ${formatExpiry(Number(expiry))}, amount: ${formatWad(amount)})`;
                }
                case 'recycleInsuranceFund': {
                    const [expiry] = args as readonly [number | bigint];
                    return `recycleInsuranceFund(expiry: ${formatExpiry(Number(expiry))})`;
                }
                case 'claimProtocolFee': {
                    const [expiry] = args as readonly [number | bigint];
                    return `claimProtocolFee(expiry: ${formatExpiry(Number(expiry))})`;
                }
                default:
                    return `${functionName}(${stringifyArgs(args)})`;
            }
        },

        async parseEvent(event) {
            let parsedEvent;
            switch (event.eventName) {
                case 'Add': {
                    const { tickLower, tickUpper, range } = event.args as any;
                    parsedEvent = {
                        balance: formatWad(range.balance),
                        upperPrice: formatWad(tickToWad(tickUpper)),
                        lowerPrice: formatWad(tickToWad(tickLower)),
                    };
                    break;
                }
                case 'Remove': {
                    const { tickLower, tickUpper, pic } = event.args as any;
                    parsedEvent = {
                        balance: formatWad(pic.balance),
                        upperPrice: formatWad(tickToWad(tickUpper)),
                        lowerPrice: formatWad(tickToWad(tickLower)),
                    };
                    break;
                }
                case 'Trade': {
                    const { size, entryNotional, sqrtPX96 } = event.args as any;
                    parsedEvent = {
                        size: formatWad(size),
                        price: formatSqrtPX96(sqrtPX96),
                        tradeType: size > 0n ? 'buy' : 'sell',
                        tradePriceB: wdiv(entryNotional, size),
                    };
                    break;
                }
                case 'Place': {
                    const { order, tick } = event.args as any;
                    parsedEvent = {
                        size: formatWad(order.size),
                        tradeType: order.size > 0n ? 'buy' : 'sell',
                        tickPrice: formatWad(tickToWad(tick)),
                    };
                    break;
                }
                case 'Fill': {
                    const { tick, pic } = event.args as any;
                    parsedEvent = {
                        tickPrice: formatWad(tickToWad(tick)),
                        size: formatWad(pic.size),
                        tradeType: pic.size > 0n ? 'buy' : 'sell',
                    };
                    break;
                }
                case 'Cancel': {
                    const { tick } = event.args as any;
                    parsedEvent = { tickPrice: formatWad(tickToWad(tick)) };
                    break;
                }
                case 'Settle': {
                    const { balance } = event.args as any;
                    parsedEvent = { balance: formatWad(balance) };
                    break;
                }

                case 'Adjust': {
                    const { net } = event.args as any;
                    const amount = BigInt(net);
                    const type = amount > 0n ? 'toppedUp' : 'reduced';
                    parsedEvent = { amount: formatWad(amount), type };
                    break;
                }
                default:
                    parsedEvent = { eventName: event.eventName };
            }
            return JSON.stringify(parsedEvent);
        },

        async parseError(error) {
            if (typeof error === 'string') {
                return error;
            }
            if (error.name) {
                const formatter = instrumentErrorFormatters[error.name];
                if (formatter) {
                    try {
                        return formatter(error.args as readonly unknown[] | undefined);
                    } catch {
                        return formatter();
                    }
                }
            }
            if (error.name) return error.name;
            if (error.signature) return error.signature;
            return 'Instrument error';
        },
    };
}
