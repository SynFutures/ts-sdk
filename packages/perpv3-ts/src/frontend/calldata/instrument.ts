import type { Address, Hex } from 'viem';
import {
    Errors,
    ErrorCode,
    MAX_CANCEL_ORDER_COUNT,
    Side,
    type AddParam,
    type AdjustParam,
    type BatchPlaceParam,
    type FillParam,
    type PlaceParam,
    type RemoveParam,
    type TradeParam,
} from '../../types';
import {
    encodeAddParam,
    encodeAdjustParam,
    encodeBatchPlaceParam,
    encodeCancelParam,
    encodeFillParam,
    encodePlaceParam,
    encodeRemoveParam,
    encodeTradeParam,
} from '../../utils/encode';
import {
    INSTRUMENT_OPERATION_METADATA,
    type InstrumentOperationCallMetadata,
    type InstrumentOperationForCallMetadata,
} from '../../operations/instrument';
import { encodeInstrumentCall, encodeRouterCall } from './requests';
import { assertNever, requireAddress } from './shared';
import type {
    AddLiquidityEncodingOptions,
    AddLiquidityEncodingParam,
    AdjustMarginEncodingOptions,
    AdjustMarginEncodingParam,
    BatchPlaceScaledLimitOrderEncodingOptions,
    BatchPlaceScaledLimitOrderEncodingParam,
    CancelOrderEncodingOptions,
    CancelOrderEncodingParam,
    CrossLimitOrderEncodingOptions,
    CrossLimitOrderEncodingParam,
    FillLimitOrderEncodingParam,
    LimitOrderEncodingOptions,
    LimitOrderEncodingParam,
    MarketOrderEncodingOptions,
    MarketOrderEncodingParam,
    RemoveLiquidityEncodingOptions,
    RemoveLiquidityEncodingParam,
    SettleEncodingParam,
    TransactionParam,
} from './types';

type RouterBatchOperation = {
    routerBatch: {
        functionName: 'batchMulticall';
    };
};
type TupleCallFunctionName = 'trade' | 'place' | 'add' | 'remove' | 'batchPlace';
type TupleCallArgs<TFunctionName extends TupleCallFunctionName> = TFunctionName extends 'batchPlace'
    ? readonly [Hex, Hex, Hex]
    : readonly [Hex, Hex];
type TraderThenParamForCallFunctionName = 'tradeFor' | 'placeFor' | 'cancelFor' | 'batchPlaceFor' | 'addFor';
type TraderThenParamForCallArgs<TFunctionName extends TraderThenParamForCallFunctionName> =
    TFunctionName extends 'batchPlaceFor'
        ? readonly [Hex, Hex, Hex]
        : TFunctionName extends 'cancelFor'
          ? Hex
          : readonly [Hex, Hex];
type DirectPackedArgFunctionName = 'fill' | 'cancel';

function toTransactionParam(to: Address, data: Hex): TransactionParam {
    return {
        to,
        data,
        value: 0n,
    };
}

function encodeDirectTupleTransaction<const TFunctionName extends TupleCallFunctionName>(
    instrumentAddress: Address,
    call: InstrumentOperationCallMetadata<TFunctionName>,
    txArgs: TupleCallArgs<TFunctionName>
): TransactionParam {
    return toTransactionParam(instrumentAddress, encodeDirectTupleCallData(instrumentAddress, call, txArgs));
}

function encodeDirectTupleCallData<const TFunctionName extends TupleCallFunctionName>(
    instrumentAddress: Address,
    call: InstrumentOperationCallMetadata<TFunctionName>,
    txArgs: TupleCallArgs<TFunctionName>
): Hex {
    switch (call.functionName) {
        case 'trade':
            return encodeInstrumentCall(instrumentAddress, 'trade', [readHexTuple2(txArgs)]);
        case 'place':
            return encodeInstrumentCall(instrumentAddress, 'place', [readHexTuple2(txArgs)]);
        case 'add':
            return encodeInstrumentCall(instrumentAddress, 'add', [readHexTuple2(txArgs)]);
        case 'remove':
            return encodeInstrumentCall(instrumentAddress, 'remove', [readHexTuple2(txArgs)]);
        case 'batchPlace':
            return encodeInstrumentCall(instrumentAddress, 'batchPlace', [readHexTuple3(txArgs)]);
        default:
            return assertNever(call.functionName, 'instrument function');
    }
}

function encodeDirectPackedArgTransaction<const TFunctionName extends DirectPackedArgFunctionName>(
    instrumentAddress: Address,
    call: InstrumentOperationCallMetadata<TFunctionName>,
    txArg: Hex
): TransactionParam {
    return toTransactionParam(instrumentAddress, encodeDirectPackedArgCallData(instrumentAddress, call, txArg));
}

function encodeDirectPackedArgCallData<const TFunctionName extends DirectPackedArgFunctionName>(
    instrumentAddress: Address,
    call: InstrumentOperationCallMetadata<TFunctionName>,
    txArg: Hex
): Hex {
    switch (call.functionName) {
        case 'fill':
            return encodeInstrumentCall(instrumentAddress, 'fill', [txArg]);
        case 'cancel':
            return encodeInstrumentCall(instrumentAddress, 'cancel', [txArg]);
        default:
            return assertNever(call.functionName, 'instrument function');
    }
}

function encodeTraderThenParamForCall<const TFunctionName extends TraderThenParamForCallFunctionName>(
    instrumentAddress: Address,
    call: InstrumentOperationForCallMetadata<TFunctionName>,
    traderAddress: Address,
    txArgs: TraderThenParamForCallArgs<TFunctionName>
): Hex {
    switch (call.functionName) {
        case 'tradeFor':
            return encodeInstrumentCall(instrumentAddress, 'tradeFor', [traderAddress, readHexTuple2(txArgs)]);
        case 'placeFor':
            return encodeInstrumentCall(instrumentAddress, 'placeFor', [traderAddress, readHexTuple2(txArgs)]);
        case 'cancelFor':
            return encodeInstrumentCall(instrumentAddress, 'cancelFor', [traderAddress, readHexArg(txArgs)]);
        case 'batchPlaceFor':
            return encodeInstrumentCall(instrumentAddress, 'batchPlaceFor', [traderAddress, readHexTuple3(txArgs)]);
        case 'addFor':
            return encodeInstrumentCall(instrumentAddress, 'addFor', [traderAddress, readHexTuple2(txArgs)]);
        default:
            return assertNever(call.functionName, 'instrument function');
    }
}

function encodeParamOnlyForCall(
    instrumentAddress: Address,
    call: InstrumentOperationForCallMetadata<'removeFor'>,
    txArgs: readonly [Hex, Hex]
): Hex {
    return encodeInstrumentCall(instrumentAddress, call.functionName, [txArgs]);
}

function readHexTuple2(value: readonly Hex[] | Hex): readonly [Hex, Hex] {
    if (!Array.isArray(value) || value.length !== 2) {
        throw Errors.encoding('expected two packed calldata args', { value });
    }

    return [value[0], value[1]];
}

function readHexTuple3(value: readonly Hex[] | Hex): readonly [Hex, Hex, Hex] {
    if (!Array.isArray(value) || value.length !== 3) {
        throw Errors.encoding('expected three packed calldata args', { value });
    }

    return [value[0], value[1], value[2]];
}

function readHexArg(value: readonly Hex[] | Hex): Hex {
    if (typeof value !== 'string') {
        throw Errors.encoding('expected one packed calldata arg', { value });
    }

    return value;
}

function encodeRouterBatchTransaction(
    routerAddress: Address,
    operation: RouterBatchOperation,
    subAccountAddress: Address,
    traderAddress: Address,
    instrumentAddresses: readonly Address[],
    callDatas: readonly Hex[]
): TransactionParam {
    return toTransactionParam(
        routerAddress,
        encodeRouterCall(routerAddress, operation.routerBatch.functionName, [
            subAccountAddress,
            traderAddress,
            instrumentAddresses,
            callDatas,
            false,
        ])
    );
}

function encodeSingleInstrumentRouterBatchTransaction(
    routerAddress: Address,
    operation: RouterBatchOperation,
    subAccountAddress: Address,
    traderAddress: Address,
    instrumentAddress: Address,
    callData: Hex
): TransactionParam {
    return encodeRouterBatchTransaction(
        routerAddress,
        operation,
        subAccountAddress,
        traderAddress,
        [instrumentAddress],
        [callData]
    );
}

export function encodeMarketOrderTransaction(
    param: MarketOrderEncodingParam,
    options?: MarketOrderEncodingOptions
): TransactionParam {
    const { useTradeFor = false, subAccountAddress, routerAddress } = options || {};
    const sideSign = param.side === Side.LONG ? 1n : -1n;
    const signedSize = param.baseQuantity * sideSign;
    const deadline = param.userSetting.getDeadline();
    const tradeParam: TradeParam = {
        expiry: param.expiry,
        size: signedSize,
        amount: param.margin,
        limitTick: param.limitTick,
        deadline,
    };
    const txArgs = encodeTradeParam(tradeParam);
    const operation = INSTRUMENT_OPERATION_METADATA.marketOrder.write;

    if (useTradeFor) {
        const traderAddress = requireAddress(options?.traderAddress, 'traderAddress for tradeFor');
        const calldata = encodeTraderThenParamForCall(
            param.instrumentAddress,
            operation.forCall,
            traderAddress,
            txArgs
        );

        if (subAccountAddress && routerAddress) {
            return encodeSingleInstrumentRouterBatchTransaction(
                routerAddress,
                operation,
                subAccountAddress,
                traderAddress,
                param.instrumentAddress,
                calldata
            );
        }

        return toTransactionParam(param.instrumentAddress, calldata);
    }

    return encodeDirectTupleTransaction(param.instrumentAddress, operation.direct, txArgs);
}

export function encodeLimitOrderTransaction(
    param: LimitOrderEncodingParam,
    options?: LimitOrderEncodingOptions
): TransactionParam {
    const { usePlaceFor = false } = options || {};
    const sideSign = param.side === Side.LONG ? 1n : -1n;
    const signedSize = param.baseQuantity * sideSign;
    const deadline = param.userSetting.getDeadline();
    const placeParam: PlaceParam = {
        expiry: param.expiry,
        size: signedSize,
        amount: param.amount,
        tick: param.tick,
        deadline,
    };
    const txArgs = encodePlaceParam(placeParam);
    const operation = INSTRUMENT_OPERATION_METADATA.limitOrder.write;

    if (usePlaceFor) {
        const traderAddress = requireAddress(options?.traderAddress, 'traderAddress for placeFor');
        const calldata = encodeTraderThenParamForCall(
            param.instrumentAddress,
            operation.forCall,
            traderAddress,
            txArgs
        );

        return toTransactionParam(param.instrumentAddress, calldata);
    }

    return encodeDirectTupleTransaction(param.instrumentAddress, operation.direct, txArgs);
}

export function encodeCancelOrderTransaction(
    param: CancelOrderEncodingParam,
    options?: CancelOrderEncodingOptions
): TransactionParam {
    const {
        useCancelFor = false,
        subAccountAddress,
        routerAddress,
        maxCancelCount = MAX_CANCEL_ORDER_COUNT,
    } = options || {};
    const operation = INSTRUMENT_OPERATION_METADATA.cancelOrder.write;
    const needBatch = param.ticks.length > maxCancelCount;

    if (!needBatch) {
        const deadline = param.userSetting.getDeadline();
        const txArgs = encodeCancelParam({
            expiry: param.expiry,
            ticks: param.ticks,
            deadline,
        });

        if (useCancelFor) {
            const traderAddress = requireAddress(options?.traderAddress, 'traderAddress for cancelFor');
            const calldata = encodeTraderThenParamForCall(
                param.instrumentAddress,
                operation.forCall,
                traderAddress,
                txArgs
            );

            return toTransactionParam(param.instrumentAddress, calldata);
        }

        return encodeDirectPackedArgTransaction(param.instrumentAddress, operation.direct, txArgs);
    }

    const tickGroups: number[][] = [];
    for (let i = 0; i < param.ticks.length; i += maxCancelCount) {
        tickGroups.push(param.ticks.slice(i, i + maxCancelCount));
    }

    if (!useCancelFor) {
        const deadline = param.userSetting.getDeadline();
        const callDatas: Hex[] = tickGroups.map((ticks) => {
            const txArgs = encodeCancelParam({
                expiry: param.expiry,
                ticks,
                deadline,
            });

            return encodeDirectPackedArgCallData(param.instrumentAddress, operation.direct, txArgs);
        });

        const multicallData = encodeInstrumentCall(param.instrumentAddress, operation.multicall.functionName, [
            callDatas,
        ]);

        return {
            to: param.instrumentAddress,
            data: multicallData,
            value: 0n,
        };
    }

    if (!subAccountAddress || !routerAddress) {
        throw Errors.validation(
            'Agent and router addresses required for batching cancel orders in Gelato mode',
            ErrorCode.INVALID_PARAM,
            { subAccountAddress, routerAddress }
        );
    }
    const traderAddress = requireAddress(options?.traderAddress, 'traderAddress for cancelFor');
    const deadline = param.userSetting.getDeadline();
    const callDatas: Hex[] = tickGroups.map((ticks) => {
        const txArgs = encodeCancelParam({
            expiry: param.expiry,
            ticks,
            deadline,
        });

        return encodeTraderThenParamForCall(param.instrumentAddress, operation.forCall, traderAddress, txArgs);
    });
    const instrumentAddrs = tickGroups.map(() => param.instrumentAddress);
    return encodeRouterBatchTransaction(
        routerAddress,
        operation,
        subAccountAddress,
        traderAddress,
        instrumentAddrs,
        callDatas
    );
}

export function encodeAdjustMarginTransaction(
    param: AdjustMarginEncodingParam,
    options?: AdjustMarginEncodingOptions
): TransactionParam {
    const { useAdjustFor = false, subAccountAddress, routerAddress } = options || {};
    const sideSign = param.transferIn ? 1n : -1n;
    const deadline = param.userSetting.getDeadline();
    const adjustParam: AdjustParam = {
        expiry: param.expiry,
        net: param.margin * sideSign,
        deadline,
    };
    const txArgs = encodeAdjustParam(adjustParam);
    const operation = INSTRUMENT_OPERATION_METADATA.adjustMargin.write;

    if (useAdjustFor) {
        const traderAddress = requireAddress(options?.traderAddress, 'traderAddress for adjustFor');
        const tradeForData = encodeTraderThenParamForCall(
            param.instrumentAddress,
            operation.forCall,
            traderAddress,
            txArgs
        );

        if (subAccountAddress && routerAddress) {
            return encodeSingleInstrumentRouterBatchTransaction(
                routerAddress,
                operation,
                subAccountAddress,
                traderAddress,
                param.instrumentAddress,
                tradeForData
            );
        }

        return toTransactionParam(param.instrumentAddress, tradeForData);
    }

    return encodeDirectTupleTransaction(param.instrumentAddress, operation.direct, txArgs);
}

export function encodeBatchPlaceScaledLimitOrderTransaction(
    param: BatchPlaceScaledLimitOrderEncodingParam,
    options?: BatchPlaceScaledLimitOrderEncodingOptions
): TransactionParam {
    const { usePlaceFor = false, subAccountAddress, routerAddress } = options || {};
    const sideSign = param.side === Side.LONG ? 1n : -1n;
    const signedTotalSize = param.baseQuantity * sideSign;
    const deadline = param.userSetting.getDeadline();
    const batchPlaceParam: BatchPlaceParam = {
        expiry: param.expiry,
        size: signedTotalSize,
        leverage: param.leverage,
        ticks: param.ticks,
        ratios: param.ratios,
        deadline,
    };
    const txArgs = encodeBatchPlaceParam({
        expiry: batchPlaceParam.expiry,
        size: batchPlaceParam.size,
        leverage: batchPlaceParam.leverage,
        ticks: batchPlaceParam.ticks,
        ratios: batchPlaceParam.ratios,
        deadline: batchPlaceParam.deadline,
    });
    const operation = INSTRUMENT_OPERATION_METADATA.batchPlaceScaledLimitOrder.write;

    if (usePlaceFor) {
        const traderAddress = requireAddress(options?.traderAddress, 'traderAddress for batchPlaceFor');
        const calldata = encodeTraderThenParamForCall(
            param.instrumentAddress,
            operation.forCall,
            traderAddress,
            txArgs
        );

        if (subAccountAddress && routerAddress) {
            return encodeSingleInstrumentRouterBatchTransaction(
                routerAddress,
                operation,
                subAccountAddress,
                traderAddress,
                param.instrumentAddress,
                calldata
            );
        }

        return toTransactionParam(param.instrumentAddress, calldata);
    }

    return encodeDirectTupleTransaction(param.instrumentAddress, operation.direct, txArgs);
}

export function encodeCrossLimitOrderTransaction(
    param: CrossLimitOrderEncodingParam,
    options?: CrossLimitOrderEncodingOptions
): TransactionParam {
    const { useFor = false, subAccountAddress, routerAddress } = options || {};
    const operation = INSTRUMENT_OPERATION_METADATA.crossLimitOrder.write;
    const sideSign = param.side === Side.LONG ? 1n : -1n;
    const signedTradeSize = param.tradeSize * sideSign;
    const signedOrderSize = param.orderSize * sideSign;
    const deadline = param.userSetting.getDeadline();
    const tradeArgs = encodeTradeParam({
        expiry: param.expiry,
        size: signedTradeSize,
        amount: param.tradeMargin,
        limitTick: param.tradeLimitTick,
        deadline,
    });
    const placeArgs = encodePlaceParam({
        expiry: param.expiry,
        tick: param.orderTick,
        size: signedOrderSize,
        amount: param.orderMargin,
        deadline,
    });

    if (useFor) {
        const traderAddress = requireAddress(options?.traderAddress, 'traderAddress for crossLimit useFor');
        const callDatas: Hex[] = [
            encodeTraderThenParamForCall(param.instrumentAddress, operation.trade.forCall, traderAddress, tradeArgs),
            encodeTraderThenParamForCall(param.instrumentAddress, operation.place.forCall, traderAddress, placeArgs),
        ];

        if (subAccountAddress && routerAddress) {
            const instrumentAddrs = [param.instrumentAddress, param.instrumentAddress];
            return encodeRouterBatchTransaction(
                routerAddress,
                operation,
                subAccountAddress,
                traderAddress,
                instrumentAddrs,
                callDatas
            );
        }

        const multicallData = encodeInstrumentCall(param.instrumentAddress, operation.multicall.functionName, [
            callDatas,
        ]);

        return {
            to: param.instrumentAddress,
            data: multicallData,
            value: 0n,
        };
    }

    const callDatas: Hex[] = [
        encodeDirectTupleCallData(param.instrumentAddress, operation.trade.direct, tradeArgs),
        encodeDirectTupleCallData(param.instrumentAddress, operation.place.direct, placeArgs),
    ];
    const multicallData = encodeInstrumentCall(param.instrumentAddress, operation.multicall.functionName, [callDatas]);

    return {
        to: param.instrumentAddress,
        data: multicallData,
        value: 0n,
    };
}

export function encodeFillLimitOrderTransaction(param: FillLimitOrderEncodingParam): TransactionParam {
    const fillParam: FillParam = {
        expiry: param.expiry,
        nonce: Number(param.nonce),
        tick: param.tick,
        target: param.target,
    };
    const txArgs = encodeFillParam(fillParam);
    const operation = INSTRUMENT_OPERATION_METADATA.fillLimitOrder.write;
    return encodeDirectPackedArgTransaction(param.instrumentAddress, operation.direct, txArgs);
}

export function encodeAddLiquidityTransaction(
    param: AddLiquidityEncodingParam,
    options: AddLiquidityEncodingOptions = {}
): TransactionParam {
    const { useAddFor = false, subAccountAddress, routerAddress } = options;
    const deadline = param.userSetting.getDeadline();
    const addParam: AddParam = {
        expiry: param.expiry,
        tickDeltaLower: param.tickDeltaLower,
        tickDeltaUpper: param.tickDeltaUpper,
        amount: param.amount,
        limitTicks: param.limitTicks,
        deadline,
    };
    const txArgs = encodeAddParam(addParam);
    const operation = INSTRUMENT_OPERATION_METADATA.addLiquidity.write;

    if (useAddFor) {
        const traderAddress = requireAddress(options?.traderAddress, 'traderAddress for addFor');
        const addForCalldata = encodeTraderThenParamForCall(
            param.instrumentAddress,
            operation.forCall,
            traderAddress,
            txArgs
        );

        if (subAccountAddress && routerAddress) {
            return encodeSingleInstrumentRouterBatchTransaction(
                routerAddress,
                operation,
                subAccountAddress,
                traderAddress,
                param.instrumentAddress,
                addForCalldata
            );
        }

        return toTransactionParam(param.instrumentAddress, addForCalldata);
    }

    return encodeDirectTupleTransaction(param.instrumentAddress, operation.direct, txArgs);
}

export function encodeRemoveLiquidityTransaction(
    param: RemoveLiquidityEncodingParam,
    options: RemoveLiquidityEncodingOptions = {}
): TransactionParam {
    const { useRemoveFor = false, subAccountAddress, routerAddress } = options;
    const deadline = param.userSetting.getDeadline();
    const removeParam: RemoveParam = {
        expiry: param.expiry,
        target: param.traderAddress,
        tickLower: param.tickLower,
        tickUpper: param.tickUpper,
        limitTicks: param.limitTicks,
        deadline,
    };
    const txArgs = encodeRemoveParam(removeParam);
    const operation = INSTRUMENT_OPERATION_METADATA.removeLiquidity.write;

    if (useRemoveFor) {
        const removeForCalldata = encodeParamOnlyForCall(param.instrumentAddress, operation.forCall, txArgs);

        if (subAccountAddress && routerAddress) {
            return encodeSingleInstrumentRouterBatchTransaction(
                routerAddress,
                operation,
                subAccountAddress,
                param.traderAddress,
                param.instrumentAddress,
                removeForCalldata
            );
        }

        return toTransactionParam(param.instrumentAddress, removeForCalldata);
    }

    return encodeDirectTupleTransaction(param.instrumentAddress, operation.direct, txArgs);
}

export function encodeSettleTransaction(param: SettleEncodingParam): TransactionParam {
    const operation = INSTRUMENT_OPERATION_METADATA.settle.write;
    const calldata = encodeInstrumentCall(param.instrumentAddress, operation.direct.functionName, [
        param.expiry,
        param.targetAddress,
    ]);

    return {
        to: param.instrumentAddress,
        data: calldata,
        value: 0n,
    };
}
