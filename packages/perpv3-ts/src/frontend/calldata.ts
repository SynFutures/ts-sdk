import { Address, Hex, encodeFunctionData, ethAddress, zeroAddress } from 'viem';
import {
    CURRENT_GATE_ABI,
    CURRENT_GELATO_RELAY_ROUTER_ABI,
    CURRENT_INSTRUMENT_ABI,
    ERC20_WITH_PERMIT_ABI,
} from '../abis';
import {
    Errors,
    ErrorCode,
    MAX_CANCEL_ORDER_COUNT,
    Side,
    UserSetting,
    type AdjustParam,
    type AddParam,
    type BatchPlaceParam,
    type FillParam,
    type PlaceParam,
    type RemoveParam,
    type TradeParam,
} from '../types';
import {
    encodeAddParam,
    encodeAdjustParam,
    encodeBatchPlaceParam,
    encodeCancelParam,
    encodeDepositParam,
    encodeFillParam,
    encodePlaceParam,
    encodeRemoveParam,
    encodeTradeParam,
    encodeWithdrawParam,
} from '../utils/encode';
import { splitSignature } from './signature';

const requireAddress = (value: Address | undefined, label: string): Address => {
    if (!value) {
        throw Errors.validation(`${label} is required`, ErrorCode.INVALID_PARAM);
    }
    return value;
};

/**
 * Encodes contract calls for trading operations
 *
 * This class replaces SDK dependency with direct viem encoding,
 * providing lower-level control over transaction calldata generation.
 *
 * Implements IContractCallEncoder interface for future SDK migration.
 */
export class ContractCallEncoder implements IContractCallEncoder {
    /**
     * Encode Market Order transaction parameters for trade or tradeFor function
     *
     * For Gelato transactions with subAccountAddress, it will encode as router.batchMulticall
     * For regular Gelato transactions, it will encode as instrument.tradeFor
     * For standard transactions, it will encode as instrument.trade
     *
     * @param param - Market order parameters

     * @param options - Encoding options (from types/contract-call-encoder.types.ts)
     * @returns Complete transaction parameters including to, data, and value
     */
    encodeMarketOrder(param: MarketOrderEncodingParam, options?: MarketOrderEncodingOptions): TransactionParam {
        const { useTradeFor = false, subAccountAddress: subAccountAddress, routerAddress } = options || {};

        // Calculate side sign: LONG = 1, SHORT = -1
        const sideSign = param.side === Side.LONG ? 1n : -1n;

        // Calculate signed size based on side
        const signedSize = param.baseQuantity * sideSign;

        // Encode trade parameters
        const deadline = param.userSetting.getDeadline();
        const tradeParam: TradeParam = {
            expiry: param.expiry,
            size: signedSize,
            amount: param.margin,
            limitTick: param.limitTick,
            deadline,
        };

        const txArgs = encodeTradeParam(tradeParam);

        // Choose function based on mode
        if (useTradeFor) {
            const traderAddress = requireAddress(options?.traderAddress, 'traderAddress for tradeFor');
            // Encode tradeFor(address to, bytes32[2] args) for Gelato
            const calldata = encodeFunctionData({
                abi: CURRENT_INSTRUMENT_ABI,
                functionName: 'tradeFor',
                args: [traderAddress, txArgs],
            });

            // If subAccountAddress is provided, use router.batchMulticall for 1CT
            if (subAccountAddress && routerAddress) {
                // Encode tradeFor calldata for the instrument
                const tradeForData = encodeFunctionData({
                    abi: CURRENT_INSTRUMENT_ABI,
                    functionName: 'tradeFor',
                    args: [traderAddress, txArgs],
                });

                // For now, we only support single trade operation

                const callDatas = [tradeForData];
                const instrumentAddrs = [param.instrumentAddress];

                // Encode router.batchMulticall
                // Note: We need router ABI - for now using inline definition
                const batchMulticallData = encodeFunctionData({
                    abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
                    functionName: 'batchMulticall',
                    args: [subAccountAddress, traderAddress, instrumentAddrs, callDatas, false],
                });

                return {
                    to: routerAddress,
                    data: batchMulticallData,
                    value: 0n,
                };
            } else {
                return {
                    to: param.instrumentAddress,
                    data: calldata,
                    value: 0n, // Gelato handles margin separately
                };
            }
        } else {
            // Encode trade(bytes32[2] args) for regular transactions
            const calldata = encodeFunctionData({
                abi: CURRENT_INSTRUMENT_ABI,
                functionName: 'trade',
                args: [txArgs],
            });

            return {
                to: param.instrumentAddress,
                data: calldata,
                value: 0n, // trade() is nonpayable, margin is handled by the contract internally
            };
        }
    }

    /**
     * Encode Limit Order transaction parameters for place or placeFor function
     *
     * For Gelato transactions, it will encode as instrument.placeFor
     * For standard transactions, it will encode as instrument.place
     *
     * NOTE: Limit orders do NOT use batchMulticall, even with 1CT enabled.
     * They go directly to the instrument contract.
     *
     * @param param - Limit order parameters

     * @param options - Encoding options
     * @returns Complete transaction parameters including to, data, and value
     */
    encodeLimitOrder(param: LimitOrderEncodingParam, options?: LimitOrderEncodingOptions): TransactionParam {
        const { usePlaceFor = false } = options || {};

        // Calculate side sign: LONG = 1, SHORT = -1
        const sideSign = param.side === Side.LONG ? 1n : -1n;

        // Calculate signed size based on side
        const signedSize = param.baseQuantity * sideSign;

        // Encode limit order parameters (same structure as market order)
        const deadline = param.userSetting.getDeadline();
        const placeParam: PlaceParam = {
            expiry: param.expiry,
            size: signedSize,
            amount: param.amount,
            tick: param.tick,
            deadline,
        };

        const txArgs = encodePlaceParam(placeParam);

        // Choose function based on mode
        if (usePlaceFor) {
            const traderAddress = requireAddress(options?.traderAddress, 'traderAddress for placeFor');
            // Encode placeFor(address to, bytes32[2] args) for Gelato
            const calldata = encodeFunctionData({
                abi: CURRENT_INSTRUMENT_ABI,
                functionName: 'placeFor',
                args: [traderAddress, txArgs],
            });

            return {
                to: param.instrumentAddress,
                data: calldata,
                value: 0n, // Gelato handles margin separately
            };
        } else {
            // Encode place(bytes32[2] args) for regular transactions
            const calldata = encodeFunctionData({
                abi: CURRENT_INSTRUMENT_ABI,
                functionName: 'place',
                args: [txArgs],
            });

            return {
                to: param.instrumentAddress,
                data: calldata,
                value: 0n, // place() is nonpayable, margin is handled by the contract internally
            };
        }
    }

    /**
     * Encode Cancel Order transaction parameters for cancel or cancelFor function
     *
     * For Gelato transactions, it will encode as instrument.cancelFor
     * For standard transactions, it will encode as instrument.cancel
     *
     * NOTE: When canceling multiple orders (> MAX_CANCEL_ORDER_COUNT), it will use batchMulticall
     *
     * @param param - Cancel order parameters

     * @param options - Encoding options
     * @returns Complete transaction parameters including to, data, and value
     */
    encodeCancelOrder(param: CancelOrderEncodingParam, options?: CancelOrderEncodingOptions): TransactionParam {
        const {
            useCancelFor = false,
            subAccountAddress: subAccountAddress,
            routerAddress,
            maxCancelCount = MAX_CANCEL_ORDER_COUNT,
        } = options || {};

        // Check if we need to batch (multiple cancel calls)
        const needBatch = param.ticks.length > maxCancelCount;

        // For single cancel or small batch (≤ maxCancelCount)
        if (!needBatch) {
            const deadline = param.userSetting.getDeadline();
            const cancelParam = {
                expiry: param.expiry,
                ticks: param.ticks,
                deadline,
            };

            const txArgs = encodeCancelParam(cancelParam);

            // Choose function based on mode
            if (useCancelFor) {
                const traderAddress = requireAddress(options?.traderAddress, 'traderAddress for cancelFor');
                // Encode cancelFor(address to, bytes32 args) for Gelato
                const calldata = encodeFunctionData({
                    abi: CURRENT_INSTRUMENT_ABI,
                    functionName: 'cancelFor',
                    args: [traderAddress, txArgs],
                });

                return {
                    to: param.instrumentAddress,
                    data: calldata,
                    value: 0n,
                };
            } else {
                // Encode cancel(bytes32 args) for standard mode
                const calldata = encodeFunctionData({
                    abi: CURRENT_INSTRUMENT_ABI,
                    functionName: 'cancel',
                    args: [txArgs],
                });

                return {
                    to: param.instrumentAddress,
                    data: calldata,
                    value: 0n,
                };
            }
        }

        // For large batch (> maxCancelCount): split into multiple cancel calls
        // Split ticks into groups
        const tickGroups: number[][] = [];
        for (let i = 0; i < param.ticks.length; i += maxCancelCount) {
            tickGroups.push(param.ticks.slice(i, i + maxCancelCount));
        }

        // Standard mode: use instrument.multicall
        if (!useCancelFor) {
            // Create calldata for each group using cancel
            const deadline = param.userSetting.getDeadline();
            const callDatas: Hex[] = tickGroups.map((ticks) => {
                const cancelParam = {
                    expiry: param.expiry,
                    ticks,
                    deadline,
                };

                const txArgs = encodeCancelParam(cancelParam);

                return encodeFunctionData({
                    abi: CURRENT_INSTRUMENT_ABI,
                    functionName: 'cancel',
                    args: [txArgs],
                });
            });

            // Encode instrument.multicall(bytes[] calldata)
            const multicallData = encodeFunctionData({
                abi: CURRENT_INSTRUMENT_ABI,
                functionName: 'multicall',
                args: [callDatas],
            });

            return {
                to: param.instrumentAddress,
                data: multicallData,
                value: 0n,
            };
        }

        // Gelato mode with 1CT: use router.batchMulticall
        if (!subAccountAddress || !routerAddress) {
            throw Errors.validation(
                'Agent and router addresses required for batching cancel orders in Gelato mode',
                ErrorCode.INVALID_PARAM,
                { subAccountAddress, routerAddress }
            );
        }
        const traderAddress = requireAddress(options?.traderAddress, 'traderAddress for cancelFor');

        // Create calldata for each group using cancelFor
        const deadline = param.userSetting.getDeadline();
        const callDatas: Hex[] = tickGroups.map((ticks) => {
            const cancelParam = {
                expiry: param.expiry,
                ticks,
                deadline,
            };

            const txArgs = encodeCancelParam(cancelParam);

            return encodeFunctionData({
                abi: CURRENT_INSTRUMENT_ABI,
                functionName: 'cancelFor',
                args: [traderAddress, txArgs],
            });
        });

        // All calls go to the same instrument
        const instrumentAddrs = tickGroups.map(() => param.instrumentAddress);

        // Encode router.batchMulticall
        const batchMulticallData = encodeFunctionData({
            abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
            functionName: 'batchMulticall',
            args: [subAccountAddress, traderAddress, instrumentAddrs, callDatas, false],
        });

        return {
            to: routerAddress,
            data: batchMulticallData,
            value: 0n,
        };
    }

    /**
     * Encode Adjust Margin transaction parameters using trade/tradeFor functions
     *
     * Note: Adjust margin is implemented via trade/tradeFor with size=0
     * For Gelato transactions, it will encode as instrument.tradeFor
     * For standard transactions, it will encode as instrument.trade
     *
     * @param param - Adjust margin parameters

     * @param options - Encoding options
     * @returns Complete transaction parameters including to, data, and value
     */
    encodeAdjustMargin(param: AdjustMarginEncodingParam, options?: AdjustMarginEncodingOptions): TransactionParam {
        const { useAdjustFor = false, subAccountAddress: subAccountAddress, routerAddress } = options || {};
        const sideSign = param.transferIn ? 1n : -1n;

        // Encode adjust parameters using SDK's encodeAdjustParam
        const deadline = param.userSetting.getDeadline();
        const adjustParam: AdjustParam = {
            expiry: param.expiry,
            net: param.margin * sideSign,
            deadline,
        };

        const txArgs = encodeAdjustParam(adjustParam);

        // Adjust margin uses trade/tradeFor functions (not separate adjust/adjustFor functions)
        if (useAdjustFor) {
            const traderAddress = requireAddress(options?.traderAddress, 'traderAddress for adjustFor');
            // Encode tradeFor(address to, bytes32[2] args) for Gelato
            const tradeForData = encodeFunctionData({
                abi: CURRENT_INSTRUMENT_ABI,
                functionName: 'tradeFor',
                args: [traderAddress, txArgs],
            });

            // If subAccountAddress is provided, use router.batchMulticall for 1CT
            if (subAccountAddress && routerAddress) {
                // For now, we only support single trade operation

                const callDatas = [tradeForData];
                const instrumentAddrs = [param.instrumentAddress];

                // Encode router.batchMulticall
                // Note: We need router ABI - for now using inline definition
                const batchMulticallData = encodeFunctionData({
                    abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
                    functionName: 'batchMulticall',
                    args: [subAccountAddress, traderAddress, instrumentAddrs, callDatas, false],
                });

                return {
                    to: routerAddress,
                    data: batchMulticallData,
                    value: 0n,
                };
            } else {
                return {
                    to: param.instrumentAddress,
                    data: tradeForData,
                    value: 0n,
                };
            }
        } else {
            // Encode trade(bytes32[2] args) for regular transactions
            const calldata = encodeFunctionData({
                abi: CURRENT_INSTRUMENT_ABI,
                functionName: 'trade',
                args: [txArgs],
            });

            return {
                to: param.instrumentAddress,
                data: calldata,
                value: 0n,
            };
        }
    }

    /**
     * Encode Batch Place Scaled Limit Order transaction parameters
     *
     * Places multiple limit orders at different price levels with specified size distribution.
     *
     * @param param - Batch scaled limit order parameters

     * @param options - Encoding options
     * @returns Complete transaction parameters including to, data, and value
     */
    encodeBatchPlaceScaledLimitOrder(
        param: BatchPlaceScaledLimitOrderEncodingParam,
        options?: BatchPlaceScaledLimitOrderEncodingOptions
    ): TransactionParam {
        const { usePlaceFor = false, subAccountAddress: subAccountAddress, routerAddress } = options || {};

        // Calculate side sign: LONG = 1, SHORT = -1
        const sideSign = param.side === Side.LONG ? 1n : -1n;

        // Calculate signed size based on side
        const signedTotalSize = param.baseQuantity * sideSign;

        // Encode batch place parameters using SDK utility
        // Note: SDK's encodeBatchPlace expects PlaceParam for each order
        const deadline = param.userSetting.getDeadline();
        const batchPlaceParam: BatchPlaceParam = {
            expiry: param.expiry,
            size: signedTotalSize,
            leverage: param.leverage,
            ticks: param.ticks,
            ratios: param.ratios,
            deadline,
        };

        // Note: encodeBatchPlaceParam takes individual param, not an object
        const txArgs = encodeBatchPlaceParam({
            expiry: batchPlaceParam.expiry,
            size: batchPlaceParam.size,
            leverage: batchPlaceParam.leverage,
            ticks: batchPlaceParam.ticks,
            ratios: batchPlaceParam.ratios,
            deadline: batchPlaceParam.deadline,
        });

        // Choose function based on mode
        // Reference: perp.ts uses getContractMethodName(BATCH_PLACE_LIMIT_ORDER, isGelato)
        if (usePlaceFor) {
            const traderAddress = requireAddress(options?.traderAddress, 'traderAddress for batchPlaceFor');
            // Encode batchPlaceFor(address to, bytes32[] args) for Gelato
            // perpMethodMappings: BATCH_PLACE_LIMIT_ORDER -> 'batchPlaceFor'
            const calldata = encodeFunctionData({
                abi: CURRENT_INSTRUMENT_ABI,
                functionName: 'batchPlaceFor',
                args: [traderAddress, txArgs],
            });

            // If subAccountAddress is provided, use router.batchMulticall for 1CT
            if (subAccountAddress && routerAddress) {
                // Encode batchPlaceFor calldata for the instrument
                // Reference: perp.ts batchPlaceLimitOrder - uses getContractMethodName which returns 'batchPlaceFor'
                const batchPlaceForData = encodeFunctionData({
                    abi: CURRENT_INSTRUMENT_ABI,
                    functionName: 'batchPlaceFor',
                    args: [traderAddress, txArgs],
                });

                const callDatas = [batchPlaceForData];
                const instrumentAddrs = [param.instrumentAddress];

                // Encode router.batchMulticall
                const batchMulticallData = encodeFunctionData({
                    abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
                    functionName: 'batchMulticall',
                    args: [subAccountAddress, traderAddress, instrumentAddrs, callDatas, false],
                });

                return {
                    to: routerAddress,
                    data: batchMulticallData,
                    value: 0n,
                };
            } else {
                return {
                    to: param.instrumentAddress,
                    data: calldata,
                    value: 0n,
                };
            }
        } else {
            // Encode batchPlace(bytes32[] args) for regular transactions
            // perpMethodMappings: BATCH_PLACE_LIMIT_ORDER -> 'batchPlace'
            const calldata = encodeFunctionData({
                abi: CURRENT_INSTRUMENT_ABI,
                functionName: 'batchPlace',
                args: [txArgs],
            });

            return {
                to: param.instrumentAddress,
                data: calldata,
                value: 0n,
            };
        }
    }

    /**
     * Encode Cross Market Order transaction parameters
     *
     * A cross market order combines a market order and a limit order in one transaction.
     *
     * @param param - Cross market order parameters

     * @param options - Encoding options
     * @returns Complete transaction parameters including to, data, and value
     */
    encodeCrossLimitOrder(
        param: CrossLimitOrderEncodingParam,
        options?: CrossLimitOrderEncodingOptions
    ): TransactionParam {
        const { useFor = false, subAccountAddress: subAccountAddress, routerAddress } = options || {};

        // Calculate side sign: LONG = 1, SHORT = -1
        const sideSign = param.side === Side.LONG ? 1n : -1n;

        // Calculate signed sizes based on side
        const signedTradeSize = param.tradeSize * sideSign;
        const signedOrderSize = param.orderSize * sideSign;

        // Encode cross limit order parameters using SDK utility
        const crossLimitParam = {
            expiry: param.expiry,
            tradeSize: signedTradeSize,
            orderSize: signedOrderSize,
            tradeLimitTick: param.tradeLimitTick,
            orderTick: param.orderTick,
            tradeAmount: param.tradeMargin,
            orderAmount: param.orderMargin,
            deadline: param.userSetting.getDeadline(),
        };

        // Cross Limit Order uses multicall to combine trade and place operations
        // Reference: perp.ts placeCrossLimitOrder implementation

        // Encode trade part
        const tradeArgs = encodeTradeParam({
            expiry: crossLimitParam.expiry,
            size: crossLimitParam.tradeSize,
            amount: crossLimitParam.tradeAmount,
            limitTick: crossLimitParam.tradeLimitTick,
            deadline: crossLimitParam.deadline,
        });

        // Encode place/order part
        const placeArgs = encodePlaceParam({
            expiry: crossLimitParam.expiry,
            tick: crossLimitParam.orderTick,
            size: crossLimitParam.orderSize,
            amount: crossLimitParam.orderAmount,
            deadline: crossLimitParam.deadline,
        });

        if (useFor) {
            const traderAddress = requireAddress(options?.traderAddress, 'traderAddress for crossLimit useFor');
            const callDatas: Hex[] = [];

            // Encode tradeFor calldata
            const tradeForData = encodeFunctionData({
                abi: CURRENT_INSTRUMENT_ABI,
                functionName: 'tradeFor',
                args: [traderAddress, tradeArgs],
            });

            // Encode placeFor calldata
            const placeForData = encodeFunctionData({
                abi: CURRENT_INSTRUMENT_ABI,
                functionName: 'placeFor',
                args: [traderAddress, placeArgs],
            });

            callDatas.push(tradeForData, placeForData);

            if (subAccountAddress && routerAddress) {
                // Both calls go to the same instrument, so duplicate the address
                const instrumentAddrs = [param.instrumentAddress, param.instrumentAddress];

                // Encode router.batchMulticall
                const batchMulticallData = encodeFunctionData({
                    abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
                    functionName: 'batchMulticall',
                    args: [subAccountAddress, traderAddress, instrumentAddrs, callDatas, false],
                });

                return {
                    to: routerAddress,
                    data: batchMulticallData,
                    value: 0n,
                };
            } else {
                // Encode instrument.multicall
                const multicallData = encodeFunctionData({
                    abi: CURRENT_INSTRUMENT_ABI,
                    functionName: 'multicall',
                    args: [callDatas],
                });

                return {
                    to: param.instrumentAddress,
                    data: multicallData,
                    value: 0n,
                };
            }
        } else {
            const callDatas: Hex[] = [];

            // Encode trade calldata
            const tradeData = encodeFunctionData({
                abi: CURRENT_INSTRUMENT_ABI,
                functionName: 'trade',
                args: [tradeArgs],
            });

            // Encode place calldata
            const placeData = encodeFunctionData({
                abi: CURRENT_INSTRUMENT_ABI,
                functionName: 'place',
                args: [placeArgs],
            });

            callDatas.push(tradeData, placeData);

            // Encode instrument.multicall
            const multicallData = encodeFunctionData({
                abi: CURRENT_INSTRUMENT_ABI,
                functionName: 'multicall',
                args: [callDatas],
            });

            return {
                to: param.instrumentAddress,
                data: multicallData,
                value: 0n,
            };
        }
    }

    /**
     * Encode Fill Limit Order transaction parameters
     *
     * Fills an existing limit order (takes the other side).
     *
     * @param param - Fill limit order parameters

     * @param options - Encoding options
     * @returns Complete transaction parameters including to, data, and value
     */
    encodeFillLimitOrder(param: FillLimitOrderEncodingParam): TransactionParam {
        // Encode fill limit order parameters
        const fillParam: FillParam = {
            expiry: param.expiry,
            nonce: Number(param.nonce), // FillParam expects number, not BigNumber
            tick: param.tick,
            target: param.target,
        };

        const txArgs = encodeFillParam(fillParam);

        // Note: fill function does NOT have a separate "fillFor" version
        // Both standard and Gelato modes use the same fill(bytes32 arg) signature
        const calldata = encodeFunctionData({
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'fill',
            args: [txArgs],
        });

        return {
            to: param.instrumentAddress,
            data: calldata,
            value: 0n,
        };
    }

    /**
     * Encode add liquidity transaction
     * @param param - Contract-level add liquidity parameters

     * @param options - Encoding options (from types/contract-call-encoder.types.ts)
     * @returns Transaction parameters ready for execution
     */
    encodeAddLiquidity(param: AddLiquidityEncodingParam, options: AddLiquidityEncodingOptions = {}): TransactionParam {
        const { useAddFor = false, subAccountAddress: subAccountAddress, routerAddress } = options;

        // Prepare AddParam for SDK encoding
        const deadline = param.userSetting.getDeadline();
        const addParam: AddParam = {
            expiry: param.expiry,
            tickDeltaLower: param.tickDeltaLower,
            tickDeltaUpper: param.tickDeltaUpper,
            amount: param.amount,
            limitTicks: param.limitTicks,
            deadline,
        };

        // Encode add liquidity parameters using SDK utility
        const txArgs = encodeAddParam(addParam);

        // Handle Gelato case: use instrument.addFor
        if (useAddFor) {
            const traderAddress = requireAddress(options?.traderAddress, 'traderAddress for addFor');
            const addForCalldata = encodeFunctionData({
                abi: CURRENT_INSTRUMENT_ABI,
                functionName: 'addFor',
                args: [traderAddress, txArgs],
            });

            // Handle 1CT case: use router.batchMulticall with addFor
            if (subAccountAddress && routerAddress) {
                const traderAddress = requireAddress(options?.traderAddress, 'traderAddress for addFor');

                // Encode router.batchMulticall(signer, user, targets, data, userPaid)
                const batchMulticallData = encodeFunctionData({
                    abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
                    functionName: 'batchMulticall',
                    args: [subAccountAddress, traderAddress, [param.instrumentAddress], [addForCalldata], false],
                });

                return {
                    to: routerAddress,
                    data: batchMulticallData,
                    value: 0n, // Assuming no ETH needed for add liquidity
                };
            } else {
                return {
                    to: param.instrumentAddress,
                    data: addForCalldata,
                    value: 0n,
                };
            }
        }

        // Standard case: use instrument.add
        const calldata = encodeFunctionData({
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'add',
            args: [txArgs],
        });

        return {
            to: param.instrumentAddress,
            data: calldata,
            value: 0n,
        };
    }

    /**
     * Encode remove liquidity transaction
     * @param param - Contract-level remove liquidity parameters

     * @param options - Encoding options (from types/contract-call-encoder.types.ts)
     * @returns Transaction parameters ready for execution
     */
    encodeRemoveLiquidity(
        param: RemoveLiquidityEncodingParam,
        options: RemoveLiquidityEncodingOptions = {}
    ): TransactionParam {
        const { useRemoveFor = false, subAccountAddress: subAccountAddress, routerAddress } = options;

        // Prepare RemoveParam for SDK encoding
        const deadline = param.userSetting.getDeadline();
        const removeParam: RemoveParam = {
            expiry: param.expiry,
            target: param.traderAddress,
            tickLower: param.tickLower,
            tickUpper: param.tickUpper,
            limitTicks: param.limitTicks,
            deadline,
        };

        // Encode remove liquidity parameters using SDK utility
        const txArgs = encodeRemoveParam(removeParam);

        // Handle Gelato case: use instrument.removeFor
        if (useRemoveFor) {
            const removeForCalldata = encodeFunctionData({
                abi: CURRENT_INSTRUMENT_ABI,
                functionName: 'removeFor',
                args: [txArgs],
            });

            // Handle 1CT case: use router.batchMulticall with removeFor
            if (subAccountAddress && routerAddress) {
                // Encode router.batchMulticall(signer, user, targets, data, userPaid)
                const batchMulticallData = encodeFunctionData({
                    abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
                    functionName: 'batchMulticall',
                    args: [
                        subAccountAddress,
                        param.traderAddress,
                        [param.instrumentAddress],
                        [removeForCalldata],
                        false,
                    ],
                });

                return {
                    to: routerAddress,
                    data: batchMulticallData,
                    value: 0n,
                };
            } else {
                return {
                    to: param.instrumentAddress,
                    data: removeForCalldata,
                    value: 0n,
                };
            }
        }

        // Standard case: use instrument.remove
        const calldata = encodeFunctionData({
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'remove',
            args: [txArgs],
        });

        return {
            to: param.instrumentAddress,
            data: calldata,
            value: 0n,
        };
    }

    encodeSettle(param: SettleEncodingParam): TransactionParam {
        const calldata = encodeFunctionData({
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'settle',
            args: [param.expiry, param.targetAddress],
        });

        return {
            to: param.instrumentAddress,
            data: calldata,
            value: 0n,
        };
    }

    /**
     * Encode Deposit transaction parameters for deposit or depositFor function
     *
     * For Gelato transactions with subAccountAddress, it will encode as router.batch with gate.depositFor
     * For regular Gelato transactions, it will encode as gate.depositFor
     * For standard transactions, it will encode as gate.deposit
     *
     * @param param - Deposit parameters
     * @param gateAddr - Gate contract address

     * @param options - Encoding options (from types/contract-call-encoder.types.ts)
     * @returns Complete transaction parameters including to, data, and value
     */
    encodeDeposit(param: DepositEncodingParam, gateAddr: Address, options?: DepositEncodingOptions): TransactionParam {
        const useDepositFor = options?.useDepositFor ?? false;
        const subAccountAddress = options?.subAccountAddress;
        const routerAddress = options?.routerAddress;

        // Encode deposit parameter: (amount << 160) | tokenAddress
        const depositArg = encodeDepositParam(param.tokenAddress, param.amount);

        // Determine if native token (for value)
        const isNativeToken =
            param.tokenAddress.toLowerCase() === ethAddress || param.tokenAddress.toLowerCase() === zeroAddress;
        const value = isNativeToken ? param.amount : 0n;

        // Handle Gelato case: use gate.depositFor
        if (useDepositFor) {
            const traderAddress = requireAddress(options?.traderAddress, 'traderAddress for depositFor');
            const depositForCalldata = encodeFunctionData({
                abi: CURRENT_GATE_ABI,
                functionName: 'depositFor',
                args: [depositArg, traderAddress],
            });

            // Handle 1CT case: use router.batch with gate.depositFor
            if (subAccountAddress && routerAddress) {
                const traderAddress = requireAddress(options?.traderAddress, 'traderAddress for depositFor');

                // Encode router.batch(subAccountAddress, gateAddr, depositForCalldata, false)
                const batchData = encodeFunctionData({
                    abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
                    functionName: 'batch',
                    args: [subAccountAddress, traderAddress, gateAddr, depositForCalldata, false],
                });

                return {
                    to: routerAddress,
                    data: batchData,
                    value,
                };
            } else {
                return {
                    to: gateAddr,
                    data: depositForCalldata,
                    value,
                };
            }
        }

        // Standard case: use gate.deposit
        const calldata = encodeFunctionData({
            abi: CURRENT_GATE_ABI,
            functionName: 'deposit',
            args: [depositArg],
        });

        return {
            to: gateAddr,
            data: calldata,
            value,
        };
    }

    /**
     * Encode Withdraw transaction parameters for withdraw or withdrawFor function
     *
     * For Gelato transactions with subAccountAddress, it will encode as router.batch with gate.withdrawFor
     * For regular Gelato transactions, it will encode as gate.withdrawFor
     * For standard transactions, it will encode as gate.withdraw
     *
     * @param param - Withdraw parameters
     * @param gateAddr - Gate contract address

     * @param options - Encoding options (from types/contract-call-encoder.types.ts)
     * @returns Complete transaction parameters including to, data, and value
     */
    encodeWithdraw(
        param: WithdrawEncodingParam,
        gateAddr: Address,
        options?: WithdrawEncodingOptions
    ): TransactionParam {
        const useWithdrawFor = options?.useWithdrawFor ?? false;
        const subAccountAddress = options?.subAccountAddress;
        const routerAddress = options?.routerAddress;

        // Encode withdraw parameter: (amount << 160) | tokenAddr
        const withdrawArg = encodeWithdrawParam(param.tokenAddress, param.amount);

        // Handle Gelato case: use gate.withdrawFor
        if (useWithdrawFor) {
            const traderAddress = requireAddress(options?.traderAddress, 'traderAddress for withdrawFor');
            const withdrawForCalldata = encodeFunctionData({
                abi: CURRENT_GATE_ABI,
                functionName: 'withdrawFor',
                args: [withdrawArg, traderAddress],
            });

            // Handle 1CT case: use router.batch with gate.withdrawFor
            if (subAccountAddress && routerAddress) {
                const traderAddress = requireAddress(options?.traderAddress, 'traderAddress for withdrawFor');

                // Encode router.batch(subAccountAddress, gateAddr, withdrawForCalldata, false)
                const batchData = encodeFunctionData({
                    abi: CURRENT_GELATO_RELAY_ROUTER_ABI,
                    functionName: 'batch',
                    args: [subAccountAddress, traderAddress, gateAddr, withdrawForCalldata, false],
                });

                return {
                    to: routerAddress,
                    data: batchData,
                    value: 0n,
                };
            } else {
                return {
                    to: gateAddr,
                    data: withdrawForCalldata,
                    value: 0n,
                };
            }
        }

        // Standard case: use gate.withdraw
        const calldata = encodeFunctionData({
            abi: CURRENT_GATE_ABI,
            functionName: 'withdraw',
            args: [withdrawArg],
        });

        return {
            to: gateAddr,
            data: calldata,
            value: 0n,
        };
    }

    encodeApprove(params: ApproveEncodingParam, options?: ApproveEncodingOptions): TransactionParam {
        let calldata: Hex;

        if (options?.useApproveFor) {
            if (!options.signature) {
                throw Errors.validation('Signature is required for approveFor', ErrorCode.INVALID_PARAM);
            }
            if (options.deadline === undefined) {
                throw Errors.invalidDeadline(options.deadline ?? -1);
            }
            const ownerAddress = requireAddress(options.ownerAddress, 'ownerAddress for approveFor');

            const { r, s, v } = splitSignature(options.signature);

            calldata = encodeFunctionData({
                abi: ERC20_WITH_PERMIT_ABI,
                functionName: 'permit',
                args: [
                    ownerAddress, // owner
                    params.spenderAddress, // spender
                    params.amount, // value
                    BigInt(options.deadline), // deadline
                    v, // v
                    r, // r
                    s, // s
                ],
            });
        } else {
            calldata = encodeFunctionData({
                abi: ERC20_WITH_PERMIT_ABI,
                functionName: 'approve',
                args: [params.spenderAddress, params.amount],
            });
        }

        return {
            to: params.tokenAddress,
            data: calldata,
            value: 0n,
        };
    }
}

/**
 * Singleton instance for convenience
 */
export const contractCallEncoder = new ContractCallEncoder();

/**
 * Encoding options and interfaces for contract call encoding
 *
 * This file contains complete type definitions for encoding various transaction types,
 * including input parameters, encoding options, and return types.
 * These interfaces will be gradually migrated to the new SDKs.
 */

/**
 * Transaction parameters returned by all encoding methods
 */
export interface TransactionParam {
    /** Target contract address */
    to: Address;
    /** Encoded calldata */
    data: Hex;
    /** ETH value to send (for payable functions) */
    value?: bigint;
}

/**
 * Base encoding options shared across all transaction types
 */
export interface BaseEncodingOptions {
    /**
     * 1CT sub-account/agent address used by the router batching flow.
     * This is typically the tx sender, and is not necessarily the on-chain portfolio owner.
     */
    subAccountAddress?: Address;
    /** Router address for batchMulticall or batch operations */
    routerAddress?: Address;
    /**
     * Trader/portfolio owner address.
     * When encoding `*For` calls (e.g. `tradeFor/placeFor/addFor/removeFor/cancelFor`), this is the `to` address.
     */
    traderAddress?: Address;
}

/**
 * Encoding options for trade-related operations (market/limit orders)
 */
export interface TradeEncodingOptions extends BaseEncodingOptions {
    /** Use tradeFor/placeFor for Gelato transactions */
    useFor?: boolean;
}

/**
 * Encoding options for market order encoding
 */
export interface MarketOrderEncodingOptions extends BaseEncodingOptions {
    /** Use tradeFor for Gelato transactions */
    useTradeFor?: boolean;
}

/**
 * Encoding options for limit order encoding
 */
export interface LimitOrderEncodingOptions extends BaseEncodingOptions {
    /** Use placeFor for Gelato transactions */
    usePlaceFor?: boolean;
}

/**
 * Encoding options for cancel order encoding
 */
export interface CancelOrderEncodingOptions extends BaseEncodingOptions {
    /** Use cancelFor for Gelato transactions */
    useCancelFor?: boolean;
    /** Maximum orders per cancel call (default: MAX_CANCEL_ORDER_COUNT:8) */
    maxCancelCount?: number;
}

/**
 * Encoding options for adjust margin encoding
 */
export interface AdjustMarginEncodingOptions extends BaseEncodingOptions {
    /** Use adjustFor for Gelato transactions */
    useAdjustFor?: boolean;
}

/**
 * Encoding options for batch place scaled limit order
 */
export interface BatchPlaceScaledLimitOrderEncodingOptions extends BaseEncodingOptions {
    /** Use batchPlaceFor for Gelato transactions */
    usePlaceFor?: boolean;
}

/**
 * Encoding options for cross market order encoding
 */
export interface CrossLimitOrderEncodingOptions extends BaseEncodingOptions {
    /** Use tradeFor/placeFor for Gelato transactions */
    useFor?: boolean;
}

/**
 * Encoding options for fill limit order encoding
 */
export interface FillLimitOrderEncodingOptions {
    /** Use fill(address, bytes32) for Gelato transactions */
    useFillFor?: boolean;
}

/**
 * Encoding options for add liquidity operation
 */
export interface AddLiquidityEncodingOptions extends BaseEncodingOptions {
    /** Use addFor for Gelato transactions */
    useAddFor?: boolean;
    traderAddress?: Address;
}

/**
 * Encoding options for remove liquidity operation
 */
export interface RemoveLiquidityEncodingOptions extends BaseEncodingOptions {
    /** Use removeFor for Gelato transactions */
    useRemoveFor?: boolean;
}

/**
 * Encoding options for deposit operation
 */
export interface DepositEncodingOptions extends BaseEncodingOptions {
    /** Use depositFor for Gelato transactions */
    useDepositFor?: boolean;
}

/**
 * Encoding options for withdraw operation
 */
export interface WithdrawEncodingOptions extends BaseEncodingOptions {
    /** Use withdrawFor for Gelato transactions */
    useWithdrawFor?: boolean;
}

/**
 * Union type of all encoding options
 */
export type EncodingOptions =
    | MarketOrderEncodingOptions
    | LimitOrderEncodingOptions
    | CancelOrderEncodingOptions
    | AdjustMarginEncodingOptions
    | BatchPlaceScaledLimitOrderEncodingOptions
    | CrossLimitOrderEncodingOptions
    | FillLimitOrderEncodingOptions
    | AddLiquidityEncodingOptions
    | RemoveLiquidityEncodingOptions
    | DepositEncodingOptions
    | WithdrawEncodingOptions;

// ===== Complete Encoding Interfaces =====
// These interfaces define the full signature of each encoding method
// including input param, options, and return type

export interface InstrumentEncodingBaseParam {
    instrumentAddress: Address;
    expiry: number;
}

/**
 * Market Order encoding interface
 * param are the same with contract
 */
export interface MarketOrderEncodingParam extends InstrumentEncodingBaseParam {
    side: Side;
    baseQuantity: bigint; // Size of the order always to be positive, already signed by side. size = side * baseQuantity
    margin: bigint;
    limitTick: number;
    userSetting: UserSetting;
}

export interface MarketOrderEncoder {
    encodeMarketOrder(param: MarketOrderEncodingParam, options?: MarketOrderEncodingOptions): TransactionParam;
}

/**
 * Limit Order encoding interface
 * param are the same with contract
 */
export interface LimitOrderEncodingParam extends InstrumentEncodingBaseParam {
    side: Side;
    baseQuantity: bigint; // Size of the order always to be positive, already signed by side. size = side * baseQuantity
    amount: bigint;
    tick: number;
    userSetting: UserSetting;
}

export interface LimitOrderEncoder {
    encodeLimitOrder(param: LimitOrderEncodingParam, options?: LimitOrderEncodingOptions): TransactionParam;
}

/**
 * Cancel Order encoding interface
 * param are the same with contract
 */
export interface CancelOrderEncodingParam extends InstrumentEncodingBaseParam {
    ticks: number[];
    userSetting: UserSetting;
}

export interface CancelOrderEncoder {
    encodeCancelOrder(param: CancelOrderEncodingParam, options?: CancelOrderEncodingOptions): TransactionParam;
}

/**
 * Adjust Margin encoding interface
 * param need transfer to contract as netSize: param.margin * sideSign(by transferIn)
 */
export interface AdjustMarginEncodingParam extends InstrumentEncodingBaseParam {
    transferIn: boolean; // true to transfer in, false to transfer out, different from contract
    margin: bigint; // Margin amount to adjust, netSize: param.margin * sideSign(by transferIn)
    userSetting: UserSetting;
}

export interface AdjustMarginEncoder {
    encodeAdjustMargin(param: AdjustMarginEncodingParam, options?: AdjustMarginEncodingOptions): TransactionParam;
}

/**
 * Batch Place Scaled Limit Order encoding interface
 * param are the same with contract
 */
export interface BatchPlaceScaledLimitOrderEncodingParam extends InstrumentEncodingBaseParam {
    side: Side;
    baseQuantity: bigint; // Total size across all always to be positive orders, already signed by side. size = side * baseQuantity
    leverage: bigint;
    ticks: number[]; // Array of tick levels
    ratios: number[]; // Size distribution ratios (must sum to 10000)
    userSetting: UserSetting;
}

export interface BatchPlaceScaledLimitOrderEncoder {
    encodeBatchPlaceScaledLimitOrder(
        param: BatchPlaceScaledLimitOrderEncodingParam,
        options?: BatchPlaceScaledLimitOrderEncodingOptions
    ): TransactionParam;
}

/**
 * Cross Limit Order encoding interface
 * will multicall market order and limit order
 */
export interface CrossLimitOrderEncodingParam extends InstrumentEncodingBaseParam {
    side: Side;
    orderSize: bigint; // Size for limit order
    tradeSize: bigint; // Size for market trade
    tradeLimitTick: number; // Limit tick for market trade
    orderTick: number; // Tick for limit order
    tradeMargin: bigint; // Margin for market trade
    orderMargin: bigint; // Margin for limit order
    userSetting: UserSetting;
}

export interface CrossLimitOrderEncoder {
    encodeCrossLimitOrder(
        param: CrossLimitOrderEncodingParam,
        options?: CrossLimitOrderEncodingOptions
    ): TransactionParam;
}

/**
 * Fill Limit Order encoding interface
 * param are the same with contract
 */
export interface FillLimitOrderEncodingParam extends InstrumentEncodingBaseParam {
    nonce: bigint; // Order nonce
    tick: number; // Order tick
    target: Address; // Target address (maker)
}

export interface FillLimitOrderEncoder {
    encodeFillLimitOrder(
        param: FillLimitOrderEncodingParam,

        options?: FillLimitOrderEncodingOptions
    ): TransactionParam;
}

/**
 * Add Liquidity encoding interface
 */
export interface AddLiquidityEncodingParam extends InstrumentEncodingBaseParam {
    tickDeltaLower: number;
    tickDeltaUpper: number;
    amount: bigint;
    limitTicks: number; // use encodeLiquidityLimitTicks to get it from sqrtPX96 and slippage
    userSetting: UserSetting;
}

export interface AddLiquidityEncoder {
    encodeAddLiquidity(param: AddLiquidityEncodingParam, options?: AddLiquidityEncodingOptions): TransactionParam;
}

/**
 * Remove Liquidity encoding interface
 */
export interface RemoveLiquidityEncodingParam extends InstrumentEncodingBaseParam {
    tickLower: number;
    tickUpper: number;
    limitTicks: number; // use encodeLiquidityLimitTicks to get it from sqrtPX96 and slippage
    traderAddress: Address;

    userSetting: UserSetting;
}

export interface RemoveLiquidityEncoder {
    encodeRemoveLiquidity(
        param: RemoveLiquidityEncodingParam,
        options?: RemoveLiquidityEncodingOptions
    ): TransactionParam;
}

export interface SettleEncodingParam extends InstrumentEncodingBaseParam {
    targetAddress: Address;
}

export interface SettleEncoder {
    encodeSettle(param: SettleEncodingParam): TransactionParam;
}

/**
 * Deposit encoding interface
 */
export interface DepositEncodingParam {
    tokenAddress: Address;
    amount: bigint;
}

export interface DepositEncoder {
    encodeDeposit(
        param: DepositEncodingParam,
        gateAddress: Address,
        options?: DepositEncodingOptions
    ): TransactionParam;
}

/**
 * Withdraw encoding interface
 */
export interface WithdrawEncodingParam {
    tokenAddress: Address;
    amount: bigint;
}

export interface WithdrawEncoder {
    encodeWithdraw(
        param: WithdrawEncodingParam,
        gateAddress: Address,
        options?: WithdrawEncodingOptions
    ): TransactionParam;
}

export interface ApproveEncodingParam {
    tokenAddress: Address;
    spenderAddress: Address;
    amount: bigint;
}

export interface ApproveEncodingOptions extends BaseEncodingOptions {
    /** Use approveFor for Gelato transactions */
    useApproveFor?: boolean;
    signature?: Hex;
    deadline?: number;
    ownerAddress?: Address;
}

export interface ApproveEncoder {
    encodeApprove(
        params: ApproveEncodingParam,

        options?: ApproveEncodingOptions
    ): TransactionParam;
}

/**
 * Complete contract call encoder interface
 * Combines all individual encoding interfaces
 */
export interface IContractCallEncoder
    extends MarketOrderEncoder,
        LimitOrderEncoder,
        CancelOrderEncoder,
        AdjustMarginEncoder,
        BatchPlaceScaledLimitOrderEncoder,
        CrossLimitOrderEncoder,
        FillLimitOrderEncoder,
        AddLiquidityEncoder,
        RemoveLiquidityEncoder,
        SettleEncoder,
        DepositEncoder,
        WithdrawEncoder,
        ApproveEncoder {
    // All encoding methods are inherited from individual encoder interfaces
}
