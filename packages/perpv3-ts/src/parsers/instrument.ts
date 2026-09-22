import {
    createContractParser,
    type Address,
    type ContractWriteFunctionName,
    type ContractParser,
    type EventParserMap,
    type TransactionParser,
    type TransactionParserMap,
} from '@derivation-tech/viem-kit';
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
} from '../utils/format';
import { formatCondition, formatStatus } from './enums';
import {
    decodeAddParam,
    decodeBatchPlaceParam,
    decodeCancelParam,
    decodeFillParam,
    decodePlaceParam,
    decodeRemoveParam,
    decodeTradeParam,
} from '../utils/decode';
import type { ParserDeps } from './types';
import { parseCustomError } from './errors';
import { RATIO_BASE } from '../constants';
import { CURRENT_INSTRUMENT_ABI } from '../abis';
import {
    INSTRUMENT_OPERATION_METADATA,
    type InstrumentOperationCallMetadata,
    type InstrumentOperationForCallMetadata,
    type InstrumentOperationParamMetadata,
    type InstrumentPackedParamCodec,
} from '../operations/instrument';
import { tickToWad, wdiv } from '../math';

type CustomErrorParsers = {
    [name: string]: (args?: readonly unknown[]) => string;
};

type EventArgsBag = {
    [name: string]: unknown;
};

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
        `target: ${await formatAddress(decoded.target, deps)}`,
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

function formatPlaceArgs(decoded: ReturnType<typeof decodePlaceParam>): string {
    const sections = [
        `expiry: ${formatExpiry(decoded.expiry)}`,
        `tick: ${formatTick(decoded.tick)}`,
        `size: ${formatOrderSize(decoded.size)}`,
        `amount: ${formatWad(decoded.amount)}`,
        `deadline: ${formatDeadline(decoded.deadline)}`,
    ];
    return `{ ${sections.join(', ')} }`;
}

async function formatFillArgs(decoded: ReturnType<typeof decodeFillParam>, deps?: ParserDeps): Promise<string> {
    const target = await formatAddress(decoded.target, deps);
    const sections = [
        `expiry: ${formatExpiry(decoded.expiry)}`,
        `tick: ${formatTick(decoded.tick)}`,
        `nonce: ${decoded.nonce}`,
        `target: ${target}`,
    ];
    return `{ ${sections.join(', ')} }`;
}

function formatCancelArgs(decoded: ReturnType<typeof decodeCancelParam>): string {
    const sections = [
        `expiry: ${formatExpiry(decoded.expiry)}`,
        `ticks: [${decoded.ticks.map((tick) => formatTick(tick)).join(', ')}]`,
        `deadline: ${formatDeadline(decoded.deadline)}`,
    ];
    return `{ ${sections.join(', ')} }`;
}

type InstrumentFunctionName = ContractWriteFunctionName<typeof CURRENT_INSTRUMENT_ABI>;
type InstrumentTransactionParser<TFunctionName extends InstrumentFunctionName> = TransactionParser<
    typeof CURRENT_INSTRUMENT_ABI,
    TFunctionName
>;
type InstrumentPackedParamMetadata = Extract<InstrumentOperationParamMetadata, { kind: 'packedTuple' | 'packedArg' }>;

function createDirectPackedParser<const TFunctionName extends InstrumentFunctionName>(
    call: InstrumentOperationCallMetadata<TFunctionName>,
    param: InstrumentPackedParamMetadata,
    deps?: ParserDeps
): InstrumentTransactionParser<TFunctionName> {
    return async ({ args }) => {
        const packedArgs = readDirectPackedArgs(args, param);
        return `${call.label}(${param.parserArgLabel}: ${await formatPackedArgs(param.codec, packedArgs, deps)})`;
    };
}

function createForCallPackedParser<const TFunctionName extends InstrumentFunctionName>(
    call: InstrumentOperationForCallMetadata<TFunctionName>,
    param: InstrumentPackedParamMetadata,
    deps?: ParserDeps
): InstrumentTransactionParser<TFunctionName> {
    return async ({ args }) => {
        const { target, packedArgs } = readForCallPackedArgs(args, call, param);
        const formattedArgs = await formatPackedArgs(param.codec, packedArgs, deps);

        if (target) {
            return `${call.label}(to: ${await formatAddress(target, deps)}, ${param.parserArgLabel}: ${formattedArgs})`;
        }

        return `${call.label}(${param.parserArgLabel}: ${formattedArgs})`;
    };
}

function readDirectPackedArgs(args: readonly unknown[], param: InstrumentPackedParamMetadata): readonly string[] {
    if (param.kind === 'packedTuple') {
        return readPackedTuple(args[0], param.tupleSize);
    }

    return [readPackedArg(args[0])];
}

function readForCallPackedArgs(
    args: readonly unknown[],
    call: InstrumentOperationForCallMetadata,
    param: InstrumentPackedParamMetadata
): { target?: Address; packedArgs: readonly string[] } {
    if (call.argumentLayout === 'traderThenParam') {
        const target = readAddress(args[0]);
        const packed =
            param.kind === 'packedTuple' ? readPackedTuple(args[1], param.tupleSize) : [readPackedArg(args[1])];
        return { target, packedArgs: packed };
    }

    return {
        packedArgs: param.kind === 'packedTuple' ? readPackedTuple(args[0], param.tupleSize) : [readPackedArg(args[0])],
    };
}

function readPackedTuple(value: unknown, tupleSize: 2 | 3): readonly string[] {
    if (!Array.isArray(value) || value.length !== tupleSize) {
        throw new Error(`invalid packed tuple argument: expected ${tupleSize} values`);
    }

    return value.map((item) => readPackedArg(item));
}

function readPackedArg(value: unknown): string {
    if (typeof value !== 'string') {
        throw new Error('invalid packed argument: expected string');
    }

    return value;
}

function readAddress(value: unknown): Address {
    if (typeof value !== 'string') {
        throw new Error('invalid address argument: expected string');
    }

    return value as Address;
}

async function formatPackedArgs(
    codec: InstrumentPackedParamCodec,
    packedArgs: readonly string[],
    deps?: ParserDeps
): Promise<string> {
    switch (codec) {
        case 'add':
            return formatAddArgs(decodeAddParam([...packedArgs]));
        case 'remove':
            return formatRemoveArgs(decodeRemoveParam([...packedArgs]), deps);
        case 'trade':
            return formatTradeArgs(decodeTradeParam([...packedArgs]));
        case 'place':
            return formatPlaceArgs(decodePlaceParam([...packedArgs]));
        case 'batchPlace':
            return formatBatchPlaceArgs(decodeBatchPlaceParam([...packedArgs]));
        case 'fill':
            return formatFillArgs(decodeFillParam(packedArgs[0]), deps);
        case 'cancel':
            return formatCancelArgs(decodeCancelParam(packedArgs[0]));
    }
}

type PositionPic = {
    balance: bigint;
    size: bigint;
    entryNotional: bigint;
    entrySocialLossIndex: bigint;
    entryFundingIndex: bigint;
};

type InstrumentQuoteParam = {
    minMarginAmount: bigint;
    tradingFeeRatio: number;
    protocolFeeRatio: number;
    qtype: number;
    tip: bigint;
};

function formatPositionPic(pic: PositionPic): string {
    return [
        `balance: ${formatWad(pic.balance)}`,
        `size: ${formatOrderSize(pic.size)}`,
        `entryNotional: ${formatWad(pic.entryNotional)}`,
        `entrySocialLossIndex: ${formatWad(pic.entrySocialLossIndex)}`,
        `entryFundingIndex: ${formatWad(pic.entryFundingIndex)}`,
    ].join(', ');
}

function formatInstrumentQuoteParam(param: InstrumentQuoteParam): string {
    return [
        `minMarginAmount: ${formatWad(param.minMarginAmount)}`,
        `tradingFeeRatio: ${formatRatio(param.tradingFeeRatio)}`,
        `protocolFeeRatio: ${formatRatio(param.protocolFeeRatio)}`,
        `qtype: ${param.qtype}`,
        `tip: ${formatWad(param.tip)}`,
    ].join(', ');
}

const instrumentErrorParsers: CustomErrorParsers = {
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

export function createInstrumentTransactionParsers(
    deps?: ParserDeps
): TransactionParserMap<typeof CURRENT_INSTRUMENT_ABI> {
    const metadata = INSTRUMENT_OPERATION_METADATA;
    const operationParsers = {
        [metadata.addLiquidity.write.direct.functionName]: createDirectPackedParser(
            metadata.addLiquidity.write.direct,
            metadata.addLiquidity.param,
            deps
        ),
        [metadata.addLiquidity.write.forCall.functionName]: createForCallPackedParser(
            metadata.addLiquidity.write.forCall,
            metadata.addLiquidity.param,
            deps
        ),
        [metadata.removeLiquidity.write.direct.functionName]: createDirectPackedParser(
            metadata.removeLiquidity.write.direct,
            metadata.removeLiquidity.param,
            deps
        ),
        [metadata.removeLiquidity.write.forCall.functionName]: createForCallPackedParser(
            metadata.removeLiquidity.write.forCall,
            metadata.removeLiquidity.param,
            deps
        ),
        [metadata.marketOrder.write.direct.functionName]: createDirectPackedParser(
            metadata.marketOrder.write.direct,
            metadata.marketOrder.param,
            deps
        ),
        [metadata.marketOrder.write.forCall.functionName]: createForCallPackedParser(
            metadata.marketOrder.write.forCall,
            metadata.marketOrder.param,
            deps
        ),
        [metadata.limitOrder.write.direct.functionName]: createDirectPackedParser(
            metadata.limitOrder.write.direct,
            metadata.limitOrder.param,
            deps
        ),
        [metadata.limitOrder.write.forCall.functionName]: createForCallPackedParser(
            metadata.limitOrder.write.forCall,
            metadata.limitOrder.param,
            deps
        ),
        [metadata.batchPlaceScaledLimitOrder.write.direct.functionName]: createDirectPackedParser(
            metadata.batchPlaceScaledLimitOrder.write.direct,
            metadata.batchPlaceScaledLimitOrder.param,
            deps
        ),
        [metadata.batchPlaceScaledLimitOrder.write.forCall.functionName]: createForCallPackedParser(
            metadata.batchPlaceScaledLimitOrder.write.forCall,
            metadata.batchPlaceScaledLimitOrder.param,
            deps
        ),
        [metadata.fillLimitOrder.write.direct.functionName]: createDirectPackedParser(
            metadata.fillLimitOrder.write.direct,
            metadata.fillLimitOrder.param,
            deps
        ),
        [metadata.cancelOrder.write.direct.functionName]: createDirectPackedParser(
            metadata.cancelOrder.write.direct,
            metadata.cancelOrder.param,
            deps
        ),
        [metadata.cancelOrder.write.forCall.functionName]: createForCallPackedParser(
            metadata.cancelOrder.write.forCall,
            metadata.cancelOrder.param,
            deps
        ),
    } satisfies TransactionParserMap<typeof CURRENT_INSTRUMENT_ABI>;

    return {
        ...operationParsers,
        async [metadata.settle.write.direct.functionName]({ args }) {
            const [expiry, target] = args;
            return `${metadata.settle.write.direct.label}(expiry: ${formatExpiry(
                Number(expiry)
            )}, target: ${await formatAddress(target, deps)})`;
        },
        async sweep({ args }) {
            const [expiry, target, size] = args;
            return `sweep(expiry: ${formatExpiry(Number(expiry))}, target: ${await formatAddress(
                target,
                deps
            )}, size: ${formatOrderSize(size)})`;
        },
        async liquidate({ args }) {
            const [expiry, target, size, amount] = args;
            return `liquidate(expiry: ${formatExpiry(Number(expiry))}, target: ${await formatAddress(
                target,
                deps
            )}, size: ${formatOrderSize(size)}, amount: ${formatWad(amount)})`;
        },
        async update({ args }) {
            const [expiry] = args;
            return `update(expiry: ${formatExpiry(Number(expiry))})`;
        },
        async setQuoteParam({ args }) {
            const [param] = args;
            const paramStr = [
                `minMarginAmount: ${formatWad(param.minMarginAmount)}`,
                `tradingFeeRatio: ${formatRatio(param.tradingFeeRatio)}`,
                `protocolFeeRatio: ${formatRatio(param.protocolFeeRatio)}`,
                `qtype: ${param.qtype}`,
                `tip: ${formatWad(param.tip)}`,
            ].join(', ');
            return `setQuoteParam(param: { ${paramStr} })`;
        },
        async setLeverage({ args }) {
            const [initialMarginRatio, maintenanceMarginRatio] = args;
            return `setLeverage(initialMarginRatio: ${formatRatio(
                initialMarginRatio
            )}, maintenanceMarginRatio: ${formatRatio(maintenanceMarginRatio)})`;
        },
        async setPlacePaused({ args }) {
            const [paused] = args;
            return `setPlacePaused(paused: ${formatBoolean(paused)})`;
        },
        async setFundingHour({ args }) {
            const [fundingHour] = args;
            return `setFundingHour(fundingHour: ${fundingHour})`;
        },
        async setDisableOrderRebate({ args }) {
            const [disable] = args;
            return `setDisableOrderRebate(disable: ${formatBoolean(disable)})`;
        },
        async freeze() {
            return 'freeze()';
        },
        async resolve({ args }) {
            const [settlementPrice] = args;
            return `resolve(settlementPrice: ${formatWad(settlementPrice)})`;
        },
        async normalize() {
            return 'normalize()';
        },
        async donateInsuranceFund({ args }) {
            const [expiry, amount] = args;
            return `donateInsuranceFund(expiry: ${formatExpiry(Number(expiry))}, amount: ${formatWad(amount)})`;
        },
        async recycleInsuranceFund({ args }) {
            const [expiry] = args;
            return `recycleInsuranceFund(expiry: ${formatExpiry(Number(expiry))})`;
        },
        async claimProtocolFee({ args }) {
            const [expiry] = args;
            return `claimProtocolFee(expiry: ${formatExpiry(Number(expiry))})`;
        },
    };
}

export function createInstrumentEventParsers(deps?: ParserDeps): EventParserMap<typeof CURRENT_INSTRUMENT_ABI> {
    return {
        async Add({ args }) {
            const { expiry, trader, tickLower, tickUpper, range } = args as EventArgsBag as {
                expiry: number;
                trader: Address;
                tickLower: number;
                tickUpper: number;
                range: {
                    liquidity: bigint;
                    entryFeeIndex: bigint;
                    balance: bigint;
                    sqrtEntryPX96: bigint;
                };
            };
            const formattedRange = [
                `liquidity: ${formatWad(range.liquidity)}`,
                `entryFeeIndex: ${formatWad(range.entryFeeIndex)}`,
                `balance: ${formatWad(range.balance)}`,
                `sqrtEntryPX96: ${formatSqrtPX96(range.sqrtEntryPX96)}`,
            ].join(', ');
            return `Add(expiry: ${formatExpiry(expiry)}, trader: ${await formatAddress(
                trader,
                deps
            )}, tickLower: ${formatTick(tickLower)}, tickUpper: ${formatTick(tickUpper)}, range: { ${formattedRange} })`;
        },
        async Remove({ args }) {
            const { expiry, trader, tickLower, tickUpper, fee, pic } = args as EventArgsBag as {
                expiry: number;
                trader: Address;
                tickLower: number;
                tickUpper: number;
                fee: bigint;
                pic: PositionPic;
            };
            return `Remove(expiry: ${formatExpiry(expiry)}, trader: ${await formatAddress(
                trader,
                deps
            )}, tickLower: ${formatTick(tickLower)}, tickUpper: ${formatTick(
                tickUpper
            )}, fee: ${formatWad(fee)}, pic: { ${formatPositionPic(pic)} })`;
        },
        async Trade({ args }) {
            const { expiry, trader, size, amount, takenSize, takenValue, entryNotional, feeRatio, sqrtPX96, mark } =
                args as EventArgsBag as {
                    expiry: number;
                    trader: Address;
                    size: bigint;
                    amount: bigint;
                    takenSize: bigint;
                    takenValue: bigint;
                    entryNotional: bigint;
                    feeRatio: number;
                    sqrtPX96: bigint;
                    mark: bigint;
                };
            const payload = [
                `size: ${formatOrderSize(size)}`,
                `amount: ${formatWad(amount)}`,
                `takenSize: ${formatOrderSize(takenSize)}`,
                `takenValue: ${formatWad(takenValue)}`,
                `entryNotional: ${formatWad(entryNotional)}`,
                `feeRatio: ${formatRatio(feeRatio)}`,
                `sqrtPX96: ${formatSqrtPX96(sqrtPX96)}`,
                `mark: ${formatWad(mark)}`,
            ].join(', ');
            return `Trade(expiry: ${formatExpiry(expiry)}, trader: ${await formatAddress(trader, deps)}, ${payload})`;
        },
        async Place({ args }) {
            const { expiry, trader, tick, nonce, order } = args as EventArgsBag as {
                expiry: number;
                trader: Address;
                tick: number;
                nonce: number;
                order: { balance: bigint; size: bigint };
            };
            return `Place(expiry: ${formatExpiry(expiry)}, trader: ${await formatAddress(
                trader,
                deps
            )}, tick: ${formatTick(tick)}, nonce: ${nonce}, order: { balance: ${formatWad(
                order.balance
            )}, size: ${formatOrderSize(order.size)} })`;
        },
        async Fill({ args }) {
            const { expiry, trader, tick, nonce, fee, pic, operator, tip } = args as EventArgsBag as {
                expiry: number;
                trader: Address;
                tick: number;
                nonce: number;
                fee: bigint;
                pic: PositionPic;
                operator: Address;
                tip: bigint;
            };
            return `Fill(expiry: ${formatExpiry(expiry)}, trader: ${await formatAddress(
                trader,
                deps
            )}, tick: ${formatTick(tick)}, nonce: ${nonce}, fee: ${formatWad(
                fee
            )}, pic: { ${formatPositionPic(pic)} }, operator: ${await formatAddress(operator, deps)}, tip: ${formatWad(tip)})`;
        },
        async Cancel({ args }) {
            const { expiry, trader, tick, nonce, fee, pic } = args as EventArgsBag as {
                expiry: number;
                trader: Address;
                tick: number;
                nonce: number;
                fee: bigint;
                pic: PositionPic;
            };
            return `Cancel(expiry: ${formatExpiry(expiry)}, trader: ${await formatAddress(
                trader,
                deps
            )}, tick: ${formatTick(tick)}, nonce: ${nonce}, fee: ${formatWad(fee)}, pic: { ${formatPositionPic(pic)} })`;
        },
        async Settle({ args }) {
            const { expiry, trader, settlement, balance, operator } = args as EventArgsBag as {
                expiry: number;
                trader: Address;
                settlement: bigint;
                balance: bigint;
                operator: Address;
            };
            return `Settle(expiry: ${formatExpiry(expiry)}, trader: ${await formatAddress(
                trader,
                deps
            )}, settlement: ${formatWad(settlement)}, balance: ${formatWad(balance)}, operator: ${await formatAddress(
                operator,
                deps
            )})`;
        },
        async DonateInsuranceFund({ args }) {
            const { expiry, donator, amount } = args as EventArgsBag as {
                expiry: number;
                donator: Address;
                amount: bigint;
            };
            return `DonateInsuranceFund(expiry: ${formatExpiry(expiry)}, donator: ${await formatAddress(
                donator,
                deps
            )}, amount: ${formatWad(amount)})`;
        },
        RecycleInsuranceFund({ args }) {
            const { expiry, amount } = args as EventArgsBag as {
                expiry: number;
                amount: bigint;
            };
            return `RecycleInsuranceFund(expiry: ${formatExpiry(expiry)}, amount: ${formatWad(amount)})`;
        },
        ClaimProtocolFee({ args }) {
            const { expiry, amount } = args as EventArgsBag as {
                expiry: number;
                amount: bigint;
            };
            return `ClaimProtocolFee(expiry: ${formatExpiry(expiry)}, amount: ${formatWad(amount)})`;
        },
        UpdateParam({ args }) {
            const { param } = args as EventArgsBag as {
                param: InstrumentQuoteParam;
            };
            return `UpdateParam(param: { ${formatInstrumentQuoteParam(param)} })`;
        },
        UpdateMarginRatio({ args }) {
            const { initialMarginRatio, maintenanceMarginRatio } = args as EventArgsBag as {
                initialMarginRatio: number;
                maintenanceMarginRatio: number;
            };
            return `UpdateMarginRatio(initialMarginRatio: ${formatRatio(
                initialMarginRatio
            )}, maintenanceMarginRatio: ${formatRatio(maintenanceMarginRatio)})`;
        },
        UpdateCondition({ args }) {
            const { timestamp, condition } = args as EventArgsBag as {
                timestamp: number;
                condition: number;
            };
            return `UpdateCondition(timestamp: ${formatTimestamp(timestamp)}, condition: ${formatCondition(condition)})`;
        },
        UpdateFundingHour({ args }) {
            const { fundingHour } = args as EventArgsBag as {
                fundingHour: number;
            };
            return `UpdateFundingHour(fundingHour: ${fundingHour})`;
        },
        DeleteContext({ args }) {
            const { expiry } = args as EventArgsBag as {
                expiry: number;
            };
            return `DeleteContext(expiry: ${formatExpiry(expiry)})`;
        },
        async Adjust({ args }) {
            const { expiry, trader, net } = args as EventArgsBag as {
                expiry: number;
                trader: Address;
                net: bigint;
            };
            return `Adjust(expiry: ${formatExpiry(expiry)}, trader: ${await formatAddress(
                trader,
                deps
            )}, net: ${formatWad(net)})`;
        },
        async Sweep({ args }) {
            const { expiry, trader, size, takenSize, takenValue, entryNotional, feeRatio, sqrtPX96, mark, operator } =
                args as EventArgsBag as {
                    expiry: number;
                    trader: Address;
                    size: bigint;
                    takenSize: bigint;
                    takenValue: bigint;
                    entryNotional: bigint;
                    feeRatio: number;
                    sqrtPX96: bigint;
                    mark: bigint;
                    operator: Address;
                };
            const payload = [
                `size: ${formatOrderSize(size)}`,
                `takenSize: ${formatOrderSize(takenSize)}`,
                `takenValue: ${formatWad(takenValue)}`,
                `entryNotional: ${formatWad(entryNotional)}`,
                `feeRatio: ${formatRatio(feeRatio)}`,
                `sqrtPX96: ${formatSqrtPX96(sqrtPX96)}`,
                `mark: ${formatWad(mark)}`,
                `operator: ${await formatAddress(operator, deps)}`,
            ].join(', ');
            return `Sweep(expiry: ${formatExpiry(expiry)}, trader: ${await formatAddress(trader, deps)}, ${payload})`;
        },
        async Liquidate({ args }) {
            const { expiry, trader, amount, mark, target, size } = args as EventArgsBag as {
                expiry: number;
                trader: Address;
                amount: bigint;
                mark: bigint;
                target: Address;
                size: bigint;
            };
            return `Liquidate(expiry: ${formatExpiry(expiry)}, trader: ${await formatAddress(
                trader,
                deps
            )}, amount: ${formatWad(amount)}, mark: ${formatWad(mark)}, target: ${await formatAddress(
                target,
                deps
            )}, size: ${formatOrderSize(size)})`;
        },
        async FundingFee({ args }) {
            const { trader, funding } = args as EventArgsBag as {
                trader: Address;
                funding: bigint;
            };
            return `FundingFee(trader: ${await formatAddress(trader, deps)}, funding: ${formatWad(funding)})`;
        },
        async UpdatePosition({ args }) {
            const { expiry, trader, pic } = args as EventArgsBag as {
                expiry: number;
                trader: Address;
                pic: PositionPic;
            };
            return `UpdatePosition(expiry: ${formatExpiry(expiry)}, trader: ${await formatAddress(
                trader,
                deps
            )}, pic: { ${formatPositionPic(pic)} })`;
        },
        UpdateAmmStatus({ args }) {
            const { expiry, status, sqrtPX96, mark } = args as EventArgsBag as {
                expiry: number;
                status: number;
                sqrtPX96: bigint;
                mark: bigint;
            };
            return `UpdateAmmStatus(expiry: ${formatExpiry(expiry)}, status: ${formatStatus(status)}, sqrtPX96: ${formatSqrtPX96(
                sqrtPX96
            )}, mark: ${formatWad(mark)})`;
        },
        UpdateFeeState({ args }) {
            const { expiry, feeIndex, protocolFee } = args as EventArgsBag as {
                expiry: number;
                feeIndex: bigint;
                protocolFee: bigint;
            };
            return `UpdateFeeState(expiry: ${formatExpiry(expiry)}, feeIndex: ${formatWad(
                feeIndex
            )}, protocolFee: ${formatWad(protocolFee)})`;
        },
        UpdateFundingIndex({ args }) {
            const { fundingIndex } = args as EventArgsBag as {
                fundingIndex: bigint;
            };
            const longFundingIndex = fundingIndex & ((1n << 128n) - 1n);
            const shortFundingIndex = fundingIndex >> 128n;
            return `UpdateFundingIndex(longFundingIndex: ${formatWad(longFundingIndex)}, shortFundingIndex: ${formatWad(shortFundingIndex)})`;
        },
        UpdateSocialLossInsuranceFund({ args }) {
            const { expiry, longSocialLossIndex, shortSocialLossIndex, insuranceFund } = args as EventArgsBag as {
                expiry: number;
                longSocialLossIndex: bigint;
                shortSocialLossIndex: bigint;
                insuranceFund: bigint;
            };
            return `UpdateSocialLossInsuranceFund(expiry: ${formatExpiry(
                expiry
            )}, longSocialLossIndex: ${formatWad(longSocialLossIndex)}, shortSocialLossIndex: ${formatWad(
                shortSocialLossIndex
            )}, insuranceFund: ${formatWad(insuranceFund)})`;
        },
        async AdminChanged({ args }) {
            const { previousAdmin, newAdmin } = args as EventArgsBag as { previousAdmin: Address; newAdmin: Address };
            return `AdminChanged(previousAdmin: ${await formatAddress(
                previousAdmin,
                deps
            )}, newAdmin: ${await formatAddress(newAdmin, deps)})`;
        },
        async BeaconUpgraded({ args }) {
            const { beacon } = args as EventArgsBag as { beacon: Address };
            return `BeaconUpgraded(beacon: ${await formatAddress(beacon, deps)})`;
        },
        async Upgraded({ args }) {
            const { implementation } = args as EventArgsBag as { implementation: Address };
            return `Upgraded(implementation: ${await formatAddress(implementation, deps)})`;
        },
    };
}

export function createInstrumentParser(deps?: ParserDeps): ContractParser<typeof CURRENT_INSTRUMENT_ABI> {
    const parser = createContractParser({
        abi: CURRENT_INSTRUMENT_ABI,
        transactions: createInstrumentTransactionParsers(deps),
        events: createInstrumentEventParsers(deps),
        parseTransactionFallback({ functionName, args }) {
            return `${functionName}(${stringifyArgs(args)})`;
        },
        parseEventFallback({ eventName }) {
            return `${eventName}(...)`;
        },
    });

    return {
        ...parser,
        async parseError(error) {
            return parseCustomError(error, instrumentErrorParsers, 'Instrument error');
        },
    };
}

export function createFrontendInstrumentEventParsers(): EventParserMap<typeof CURRENT_INSTRUMENT_ABI> {
    return {
        Add({ args }) {
            const { tickLower, tickUpper, range } = args as {
                tickLower: number;
                tickUpper: number;
                range: { balance: bigint };
            };
            return JSON.stringify({
                balance: formatWad(range.balance),
                upperPrice: formatWad(tickToWad(tickUpper)),
                lowerPrice: formatWad(tickToWad(tickLower)),
            });
        },
        Remove({ args }) {
            const { tickLower, tickUpper, pic } = args as {
                tickLower: number;
                tickUpper: number;
                pic: { balance: bigint };
            };
            return JSON.stringify({
                balance: formatWad(pic.balance),
                upperPrice: formatWad(tickToWad(tickUpper)),
                lowerPrice: formatWad(tickToWad(tickLower)),
            });
        },
        Trade({ args }) {
            const { size, entryNotional, sqrtPX96 } = args as {
                size: bigint;
                entryNotional: bigint;
                sqrtPX96: bigint;
            };
            return JSON.stringify({
                size: formatWad(size),
                price: formatSqrtPX96(sqrtPX96),
                tradeType: size > 0n ? 'buy' : 'sell',
                tradePriceB: wdiv(entryNotional, size),
            });
        },
        Place({ args }) {
            const { order, tick } = args as { order: { size: bigint }; tick: number };
            return JSON.stringify({
                size: formatWad(order.size),
                tradeType: order.size > 0n ? 'buy' : 'sell',
                tickPrice: formatWad(tickToWad(tick)),
            });
        },
        Fill({ args }) {
            const { tick, pic } = args as { tick: number; pic: { size: bigint } };
            return JSON.stringify({
                tickPrice: formatWad(tickToWad(tick)),
                size: formatWad(pic.size),
                tradeType: pic.size > 0n ? 'buy' : 'sell',
            });
        },
        Cancel({ args }) {
            const { tick } = args as { tick: number };
            return JSON.stringify({ tickPrice: formatWad(tickToWad(tick)) });
        },
        Settle({ args }) {
            const { balance } = args as { balance: bigint };
            return JSON.stringify({ balance: formatWad(balance) });
        },
        Adjust({ args }) {
            const { net } = args as { net: bigint };
            const amount = BigInt(net);
            const type = amount > 0n ? 'toppedUp' : 'reduced';
            return JSON.stringify({ amount: formatWad(amount), type });
        },
    };
}

export function createFrontendInstrumentParser(deps?: ParserDeps): ContractParser<typeof CURRENT_INSTRUMENT_ABI> {
    const baseParser = createInstrumentParser(deps);
    const eventParser = createContractParser({
        abi: CURRENT_INSTRUMENT_ABI,
        events: createFrontendInstrumentEventParsers(),
        parseEventFallback(event) {
            return JSON.stringify({ eventName: event.eventName });
        },
    });

    return {
        abi: CURRENT_INSTRUMENT_ABI,
        parseTransaction: baseParser.parseTransaction,
        parseEvent: eventParser.parseEvent,
        parseError: baseParser.parseError,
    };
}
