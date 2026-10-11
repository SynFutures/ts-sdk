import { encodeFunctionData, type Address, type Hex } from 'viem';
import { CURRENT_GELATO_RELAY_ROUTER_ABI, CURRENT_INSTRUMENT_ABI } from '../../abis';
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
import { requireAddress } from './shared';
import type {
    AddLiquidityEncodingOptions,
    AddLiquidityEncodingParam,
    AdjustMarginEncodingOptions,
    AdjustMarginEncodingParam,
    BaseEncodingOptions,
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

function toTransactionParam(to: Address, data: Hex): TransactionParam {
    return {
        to,
        data,
        value: 0n,
    };
}

function encodeInstrumentMulticall(instrumentAddress: Address, callDatas: readonly Hex[]): TransactionParam {
    return toTransactionParam(
        instrumentAddress,
        encodeFunctionData({ abi: CURRENT_INSTRUMENT_ABI, functionName: 'multicall', args: [callDatas] })
    );
}

function encodeRouterBatchTransaction(
    routerAddress: Address,
    subAccountAddress: Address,
    traderAddress: Address,
    instrumentAddresses: readonly Address[],
    callDatas: readonly Hex[]
): TransactionParam {
    return toTransactionParam(
        routerAddress,
        encodeFunctionData({
            abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
            functionName: 'batchMulticall',
            args: [subAccountAddress, traderAddress, instrumentAddresses, callDatas, false],
        })
    );
}

/** Sends a `*For` instrument call directly, or through the router when a sub-account and router are configured. */
function encodeForCallTransaction(
    instrumentAddress: Address,
    traderAddress: Address,
    calldata: Hex,
    { subAccountAddress, routerAddress }: BaseEncodingOptions
): TransactionParam {
    if (subAccountAddress && routerAddress) {
        return encodeRouterBatchTransaction(
            routerAddress,
            subAccountAddress,
            traderAddress,
            [instrumentAddress],
            [calldata]
        );
    }

    return toTransactionParam(instrumentAddress, calldata);
}

export function encodeMarketOrderTransaction(
    param: MarketOrderEncodingParam,
    options?: MarketOrderEncodingOptions
): TransactionParam {
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

    if (options?.useTradeFor) {
        const traderAddress = requireAddress(options.traderAddress, 'traderAddress for tradeFor');
        const calldata = encodeFunctionData({
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'tradeFor',
            args: [traderAddress, txArgs],
        });
        return encodeForCallTransaction(param.instrumentAddress, traderAddress, calldata, options);
    }

    return toTransactionParam(
        param.instrumentAddress,
        encodeFunctionData({ abi: CURRENT_INSTRUMENT_ABI, functionName: 'trade', args: [txArgs] })
    );
}

export function encodeLimitOrderTransaction(
    param: LimitOrderEncodingParam,
    options?: LimitOrderEncodingOptions
): TransactionParam {
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

    if (options?.usePlaceFor) {
        const traderAddress = requireAddress(options.traderAddress, 'traderAddress for placeFor');
        return toTransactionParam(
            param.instrumentAddress,
            encodeFunctionData({ abi: CURRENT_INSTRUMENT_ABI, functionName: 'placeFor', args: [traderAddress, txArgs] })
        );
    }

    return toTransactionParam(
        param.instrumentAddress,
        encodeFunctionData({ abi: CURRENT_INSTRUMENT_ABI, functionName: 'place', args: [txArgs] })
    );
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
    if (!Number.isInteger(maxCancelCount) || maxCancelCount < 1 || maxCancelCount > MAX_CANCEL_ORDER_COUNT) {
        throw Errors.encoding(`maxCancelCount must be an integer between 1 and ${MAX_CANCEL_ORDER_COUNT}`);
    }
    const deadline = param.userSetting.getDeadline();
    const encodeCancel = (ticks: number[]) => encodeCancelParam({ expiry: param.expiry, ticks, deadline });
    const encodeCancelFor = (traderAddress: Address, ticks: number[]) =>
        encodeFunctionData({
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'cancelFor',
            args: [traderAddress, encodeCancel(ticks)],
        });
    const encodeDirectCancel = (ticks: number[]) =>
        encodeFunctionData({ abi: CURRENT_INSTRUMENT_ABI, functionName: 'cancel', args: [encodeCancel(ticks)] });

    if (param.ticks.length <= maxCancelCount) {
        if (useCancelFor) {
            const traderAddress = requireAddress(options?.traderAddress, 'traderAddress for cancelFor');
            return toTransactionParam(param.instrumentAddress, encodeCancelFor(traderAddress, param.ticks));
        }

        return toTransactionParam(param.instrumentAddress, encodeDirectCancel(param.ticks));
    }

    const tickGroups: number[][] = [];
    for (let i = 0; i < param.ticks.length; i += maxCancelCount) {
        tickGroups.push(param.ticks.slice(i, i + maxCancelCount));
    }

    if (!useCancelFor) {
        return encodeInstrumentMulticall(param.instrumentAddress, tickGroups.map(encodeDirectCancel));
    }

    if (!subAccountAddress || !routerAddress) {
        throw Errors.validation(
            'Agent and router addresses required for batching cancel orders in Gelato mode',
            ErrorCode.INVALID_PARAM,
            { subAccountAddress, routerAddress }
        );
    }
    const traderAddress = requireAddress(options?.traderAddress, 'traderAddress for cancelFor');
    return encodeRouterBatchTransaction(
        routerAddress,
        subAccountAddress,
        traderAddress,
        tickGroups.map(() => param.instrumentAddress),
        tickGroups.map((ticks) => encodeCancelFor(traderAddress, ticks))
    );
}

export function encodeAdjustMarginTransaction(
    param: AdjustMarginEncodingParam,
    options?: AdjustMarginEncodingOptions
): TransactionParam {
    const sideSign = param.transferIn ? 1n : -1n;
    const deadline = param.userSetting.getDeadline();
    const adjustParam: AdjustParam = {
        expiry: param.expiry,
        net: param.margin * sideSign,
        deadline,
    };
    const txArgs = encodeAdjustParam(adjustParam);

    if (options?.useAdjustFor) {
        const traderAddress = requireAddress(options.traderAddress, 'traderAddress for adjustFor');
        const calldata = encodeFunctionData({
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'tradeFor',
            args: [traderAddress, txArgs],
        });
        return encodeForCallTransaction(param.instrumentAddress, traderAddress, calldata, options);
    }

    return toTransactionParam(
        param.instrumentAddress,
        encodeFunctionData({ abi: CURRENT_INSTRUMENT_ABI, functionName: 'trade', args: [txArgs] })
    );
}

export function encodeBatchPlaceScaledLimitOrderTransaction(
    param: BatchPlaceScaledLimitOrderEncodingParam,
    options?: BatchPlaceScaledLimitOrderEncodingOptions
): TransactionParam {
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

    if (options?.usePlaceFor) {
        const traderAddress = requireAddress(options.traderAddress, 'traderAddress for batchPlaceFor');
        const calldata = encodeFunctionData({
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'batchPlaceFor',
            args: [traderAddress, txArgs],
        });
        return encodeForCallTransaction(param.instrumentAddress, traderAddress, calldata, options);
    }

    return toTransactionParam(
        param.instrumentAddress,
        encodeFunctionData({ abi: CURRENT_INSTRUMENT_ABI, functionName: 'batchPlace', args: [txArgs] })
    );
}

export function encodeCrossLimitOrderTransaction(
    param: CrossLimitOrderEncodingParam,
    options?: CrossLimitOrderEncodingOptions
): TransactionParam {
    const { useFor = false, subAccountAddress, routerAddress } = options || {};
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
        const callDatas = [
            encodeFunctionData({
                abi: CURRENT_INSTRUMENT_ABI,
                functionName: 'tradeFor',
                args: [traderAddress, tradeArgs],
            }),
            encodeFunctionData({
                abi: CURRENT_INSTRUMENT_ABI,
                functionName: 'placeFor',
                args: [traderAddress, placeArgs],
            }),
        ];

        if (subAccountAddress && routerAddress) {
            return encodeRouterBatchTransaction(
                routerAddress,
                subAccountAddress,
                traderAddress,
                [param.instrumentAddress, param.instrumentAddress],
                callDatas
            );
        }

        return encodeInstrumentMulticall(param.instrumentAddress, callDatas);
    }

    return encodeInstrumentMulticall(param.instrumentAddress, [
        encodeFunctionData({ abi: CURRENT_INSTRUMENT_ABI, functionName: 'trade', args: [tradeArgs] }),
        encodeFunctionData({ abi: CURRENT_INSTRUMENT_ABI, functionName: 'place', args: [placeArgs] }),
    ]);
}

export function encodeFillLimitOrderTransaction(param: FillLimitOrderEncodingParam): TransactionParam {
    const fillParam: FillParam = {
        expiry: param.expiry,
        nonce: Number(param.nonce),
        tick: param.tick,
        target: param.target,
    };
    return toTransactionParam(
        param.instrumentAddress,
        encodeFunctionData({ abi: CURRENT_INSTRUMENT_ABI, functionName: 'fill', args: [encodeFillParam(fillParam)] })
    );
}

export function encodeAddLiquidityTransaction(
    param: AddLiquidityEncodingParam,
    options: AddLiquidityEncodingOptions = {}
): TransactionParam {
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

    if (options.useAddFor) {
        const traderAddress = requireAddress(options.traderAddress, 'traderAddress for addFor');
        const calldata = encodeFunctionData({
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'addFor',
            args: [traderAddress, txArgs],
        });
        return encodeForCallTransaction(param.instrumentAddress, traderAddress, calldata, options);
    }

    return toTransactionParam(
        param.instrumentAddress,
        encodeFunctionData({ abi: CURRENT_INSTRUMENT_ABI, functionName: 'add', args: [txArgs] })
    );
}

export function encodeRemoveLiquidityTransaction(
    param: RemoveLiquidityEncodingParam,
    options: RemoveLiquidityEncodingOptions = {}
): TransactionParam {
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

    if (options.useRemoveFor) {
        // removeFor takes no trader argument: the packed param already names the target.
        const calldata = encodeFunctionData({ abi: CURRENT_INSTRUMENT_ABI, functionName: 'removeFor', args: [txArgs] });
        return encodeForCallTransaction(param.instrumentAddress, param.traderAddress, calldata, options);
    }

    return toTransactionParam(
        param.instrumentAddress,
        encodeFunctionData({ abi: CURRENT_INSTRUMENT_ABI, functionName: 'remove', args: [txArgs] })
    );
}

export function encodeSettleTransaction(param: SettleEncodingParam): TransactionParam {
    return toTransactionParam(
        param.instrumentAddress,
        encodeFunctionData({
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'settle',
            args: [param.expiry, param.targetAddress],
        })
    );
}
