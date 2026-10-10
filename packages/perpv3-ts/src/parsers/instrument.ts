import {
    createContractParser,
    type Address,
    type ContractParser,
    type ErrorParserMap,
    type EventParserMap,
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
import { RATIO_BASE } from '../constants';
import { CURRENT_INSTRUMENT_ABI } from '../abis';
import { tickToWad, wdiv } from '../math';

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

function formatBatchPlaceArgs(decoded: ReturnType<typeof decodeBatchPlaceParam>): string {
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

const instrumentErrorParsers: ErrorParserMap = {
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
    const formatTarget = (target: Address) => formatAddress(target, deps);
    return {
        add({ args: [packed] }) {
            return `add(args: ${formatAddArgs(decodeAddParam(packed))})`;
        },
        async addFor({ args: [target, packed] }) {
            return `addFor(to: ${await formatTarget(target)}, args: ${formatAddArgs(decodeAddParam(packed))})`;
        },
        async remove({ args: [packed] }) {
            return `remove(args: ${await formatRemoveArgs(decodeRemoveParam(packed), deps)})`;
        },
        async removeFor({ args: [packed] }) {
            return `removeFor(args: ${await formatRemoveArgs(decodeRemoveParam(packed), deps)})`;
        },
        trade({ args: [packed] }) {
            return `trade(args: ${formatTradeArgs(decodeTradeParam(packed))})`;
        },
        async tradeFor({ args: [target, packed] }) {
            return `tradeFor(to: ${await formatTarget(target)}, args: ${formatTradeArgs(decodeTradeParam(packed))})`;
        },
        place({ args: [packed] }) {
            return `place(args: ${formatPlaceArgs(decodePlaceParam(packed))})`;
        },
        async placeFor({ args: [target, packed] }) {
            return `placeFor(to: ${await formatTarget(target)}, args: ${formatPlaceArgs(decodePlaceParam(packed))})`;
        },
        batchPlace({ args: [packed] }) {
            return `batchPlace(args: ${formatBatchPlaceArgs(decodeBatchPlaceParam(packed))})`;
        },
        async batchPlaceFor({ args: [target, packed] }) {
            return `batchPlaceFor(to: ${await formatTarget(target)}, args: ${formatBatchPlaceArgs(
                decodeBatchPlaceParam(packed)
            )})`;
        },
        async fill({ args: [packed] }) {
            return `fill(arg: ${await formatFillArgs(decodeFillParam(packed), deps)})`;
        },
        cancel({ args: [packed] }) {
            return `cancel(arg: ${formatCancelArgs(decodeCancelParam(packed))})`;
        },
        async cancelFor({ args: [target, packed] }) {
            return `cancelFor(to: ${await formatTarget(target)}, arg: ${formatCancelArgs(decodeCancelParam(packed))})`;
        },
        async settle({ args: [expiry, target] }) {
            return `settle(expiry: ${formatExpiry(expiry)}, target: ${await formatTarget(target)})`;
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
            const { expiry, trader, tickLower, tickUpper, range } = args;
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
            const { expiry, trader, tickLower, tickUpper, fee, pic } = args;
            return `Remove(expiry: ${formatExpiry(expiry)}, trader: ${await formatAddress(
                trader,
                deps
            )}, tickLower: ${formatTick(tickLower)}, tickUpper: ${formatTick(
                tickUpper
            )}, fee: ${formatWad(fee)}, pic: { ${formatPositionPic(pic)} })`;
        },
        async Trade({ args }) {
            const { expiry, trader, size, amount, takenSize, takenValue, entryNotional, feeRatio, sqrtPX96, mark } =
                args;
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
            const { expiry, trader, tick, nonce, order } = args;
            return `Place(expiry: ${formatExpiry(expiry)}, trader: ${await formatAddress(
                trader,
                deps
            )}, tick: ${formatTick(tick)}, nonce: ${nonce}, order: { balance: ${formatWad(
                order.balance
            )}, size: ${formatOrderSize(order.size)} })`;
        },
        async Fill({ args }) {
            const { expiry, trader, tick, nonce, fee, pic, operator, tip } = args;
            return `Fill(expiry: ${formatExpiry(expiry)}, trader: ${await formatAddress(
                trader,
                deps
            )}, tick: ${formatTick(tick)}, nonce: ${nonce}, fee: ${formatWad(
                fee
            )}, pic: { ${formatPositionPic(pic)} }, operator: ${await formatAddress(operator, deps)}, tip: ${formatWad(tip)})`;
        },
        async Cancel({ args }) {
            const { expiry, trader, tick, nonce, fee, pic } = args;
            return `Cancel(expiry: ${formatExpiry(expiry)}, trader: ${await formatAddress(
                trader,
                deps
            )}, tick: ${formatTick(tick)}, nonce: ${nonce}, fee: ${formatWad(fee)}, pic: { ${formatPositionPic(pic)} })`;
        },
        async Settle({ args }) {
            const { expiry, trader, settlement, balance, operator } = args;
            return `Settle(expiry: ${formatExpiry(expiry)}, trader: ${await formatAddress(
                trader,
                deps
            )}, settlement: ${formatWad(settlement)}, balance: ${formatWad(balance)}, operator: ${await formatAddress(
                operator,
                deps
            )})`;
        },
        async DonateInsuranceFund({ args }) {
            const { expiry, donator, amount } = args;
            return `DonateInsuranceFund(expiry: ${formatExpiry(expiry)}, donator: ${await formatAddress(
                donator,
                deps
            )}, amount: ${formatWad(amount)})`;
        },
        RecycleInsuranceFund({ args }) {
            const { expiry, amount } = args;
            return `RecycleInsuranceFund(expiry: ${formatExpiry(expiry)}, amount: ${formatWad(amount)})`;
        },
        ClaimProtocolFee({ args }) {
            const { expiry, amount } = args;
            return `ClaimProtocolFee(expiry: ${formatExpiry(expiry)}, amount: ${formatWad(amount)})`;
        },
        UpdateParam({ args }) {
            const { param } = args;
            return `UpdateParam(param: { ${formatInstrumentQuoteParam(param)} })`;
        },
        UpdateMarginRatio({ args }) {
            const { initialMarginRatio, maintenanceMarginRatio } = args;
            return `UpdateMarginRatio(initialMarginRatio: ${formatRatio(
                initialMarginRatio
            )}, maintenanceMarginRatio: ${formatRatio(maintenanceMarginRatio)})`;
        },
        UpdateCondition({ args }) {
            const { timestamp, condition } = args;
            return `UpdateCondition(timestamp: ${formatTimestamp(timestamp)}, condition: ${formatCondition(condition)})`;
        },
        UpdateFundingHour({ args }) {
            const { fundingHour } = args;
            return `UpdateFundingHour(fundingHour: ${fundingHour})`;
        },
        DeleteContext({ args }) {
            const { expiry } = args;
            return `DeleteContext(expiry: ${formatExpiry(expiry)})`;
        },
        async Adjust({ args }) {
            const { expiry, trader, net } = args;
            return `Adjust(expiry: ${formatExpiry(expiry)}, trader: ${await formatAddress(
                trader,
                deps
            )}, net: ${formatWad(net)})`;
        },
        async Sweep({ args }) {
            const { expiry, trader, size, takenSize, takenValue, entryNotional, feeRatio, sqrtPX96, mark, operator } =
                args;
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
            const { expiry, trader, amount, mark, target, size } = args;
            return `Liquidate(expiry: ${formatExpiry(expiry)}, trader: ${await formatAddress(
                trader,
                deps
            )}, amount: ${formatWad(amount)}, mark: ${formatWad(mark)}, target: ${await formatAddress(
                target,
                deps
            )}, size: ${formatOrderSize(size)})`;
        },
        async FundingFee({ args }) {
            const { trader, funding } = args;
            return `FundingFee(trader: ${await formatAddress(trader, deps)}, funding: ${formatWad(funding)})`;
        },
        async UpdatePosition({ args }) {
            const { expiry, trader, pic } = args;
            return `UpdatePosition(expiry: ${formatExpiry(expiry)}, trader: ${await formatAddress(
                trader,
                deps
            )}, pic: { ${formatPositionPic(pic)} })`;
        },
        UpdateAmmStatus({ args }) {
            const { expiry, status, sqrtPX96, mark } = args;
            return `UpdateAmmStatus(expiry: ${formatExpiry(expiry)}, status: ${formatStatus(status)}, sqrtPX96: ${formatSqrtPX96(
                sqrtPX96
            )}, mark: ${formatWad(mark)})`;
        },
        UpdateFeeState({ args }) {
            const { expiry, feeIndex, protocolFee } = args;
            return `UpdateFeeState(expiry: ${formatExpiry(expiry)}, feeIndex: ${formatWad(
                feeIndex
            )}, protocolFee: ${formatWad(protocolFee)})`;
        },
        UpdateFundingIndex({ args }) {
            const { fundingIndex } = args;
            const longFundingIndex = fundingIndex & ((1n << 128n) - 1n);
            const shortFundingIndex = fundingIndex >> 128n;
            return `UpdateFundingIndex(longFundingIndex: ${formatWad(longFundingIndex)}, shortFundingIndex: ${formatWad(shortFundingIndex)})`;
        },
        UpdateSocialLossInsuranceFund({ args }) {
            const { expiry, longSocialLossIndex, shortSocialLossIndex, insuranceFund } = args;
            return `UpdateSocialLossInsuranceFund(expiry: ${formatExpiry(
                expiry
            )}, longSocialLossIndex: ${formatWad(longSocialLossIndex)}, shortSocialLossIndex: ${formatWad(
                shortSocialLossIndex
            )}, insuranceFund: ${formatWad(insuranceFund)})`;
        },
        async AdminChanged({ args }) {
            const { previousAdmin, newAdmin } = args;
            return `AdminChanged(previousAdmin: ${await formatAddress(
                previousAdmin,
                deps
            )}, newAdmin: ${await formatAddress(newAdmin, deps)})`;
        },
        async BeaconUpgraded({ args }) {
            const { beacon } = args;
            return `BeaconUpgraded(beacon: ${await formatAddress(beacon, deps)})`;
        },
        async Upgraded({ args }) {
            const { implementation } = args;
            return `Upgraded(implementation: ${await formatAddress(implementation, deps)})`;
        },
    };
}

export function createInstrumentParser(deps?: ParserDeps): ContractParser<typeof CURRENT_INSTRUMENT_ABI> {
    return createContractParser({
        abi: CURRENT_INSTRUMENT_ABI,
        transactions: createInstrumentTransactionParsers(deps),
        events: createInstrumentEventParsers(deps),
        errors: instrumentErrorParsers,
        parseTransactionFallback({ functionName, args }) {
            return `${functionName}(${stringifyArgs(args)})`;
        },
        parseEventFallback({ eventName }) {
            return `${eventName}(...)`;
        },
    });
}

export function createFrontendInstrumentEventParsers(): EventParserMap<typeof CURRENT_INSTRUMENT_ABI> {
    return {
        Add({ args }) {
            const { tickLower, tickUpper, range } = args;
            return JSON.stringify({
                balance: formatWad(range.balance),
                upperPrice: formatWad(tickToWad(tickUpper)),
                lowerPrice: formatWad(tickToWad(tickLower)),
            });
        },
        Remove({ args }) {
            const { tickLower, tickUpper, pic } = args;
            return JSON.stringify({
                balance: formatWad(pic.balance),
                upperPrice: formatWad(tickToWad(tickUpper)),
                lowerPrice: formatWad(tickToWad(tickLower)),
            });
        },
        Trade({ args }) {
            const { size, entryNotional, sqrtPX96 } = args;
            return JSON.stringify({
                size: formatWad(size),
                price: formatSqrtPX96(sqrtPX96),
                tradeType: size > 0n ? 'buy' : 'sell',
                tradePriceB: (size === 0n ? 0n : wdiv(entryNotional, size < 0n ? -size : size)).toString(),
            });
        },
        Place({ args }) {
            const { order, tick } = args;
            return JSON.stringify({
                size: formatWad(order.size),
                tradeType: order.size > 0n ? 'buy' : 'sell',
                tickPrice: formatWad(tickToWad(tick)),
            });
        },
        Fill({ args }) {
            const { tick, pic } = args;
            return JSON.stringify({
                tickPrice: formatWad(tickToWad(tick)),
                size: formatWad(pic.size),
                tradeType: pic.size > 0n ? 'buy' : 'sell',
            });
        },
        Cancel({ args }) {
            const { tick } = args;
            return JSON.stringify({ tickPrice: formatWad(tickToWad(tick)) });
        },
        Settle({ args }) {
            const { balance } = args;
            return JSON.stringify({ balance: formatWad(balance) });
        },
        Adjust({ args }) {
            const { net } = args;
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
