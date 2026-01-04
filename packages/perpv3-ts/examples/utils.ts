import type { Address, PublicClient, WalletClient } from 'viem';
import { createPublicClient, http } from 'viem';
import { ChainKit, ChainKitRegistry, ERC20, sendTxWithLog } from '@derivation-tech/viem-kit';
import { abs, wdiv } from '@synfutures/perpv3-ts/math';
import { WAD, ZERO } from '@synfutures/perpv3-ts/constants';
import { PlaceInput, RemoveInput } from '@synfutures/perpv3-ts/actions';
import {
    Condition,
    Errors,
    ErrorCode,
    InstrumentSetting,
    Order,
    PairSnapshot,
    PERP_EXPIRY,
    Range,
    Side,
    UserSetting,
    type PlaceParam,
    type Setting,
    type SpacingConfig,
    type TradeParam,
} from '@synfutures/perpv3-ts/types';
import { getPerpInfo, type PerpInfo } from '@synfutures/perpv3-ts';
import { CURRENT_OBSERVER_ABI, CURRENT_INSTRUMENT_ABI } from '@synfutures/perpv3-ts/abis';
import { createInstrumentParser, createGateParser } from '@synfutures/perpv3-ts/parsers';
import { fetchOnchainContext, type RpcConfig } from '@synfutures/perpv3-ts/queries';
import { encodeCancelParam, encodeTradeParam, encodeRemoveParam, formatTick, formatWad } from '@synfutures/perpv3-ts/utils';

export const DefaultUserSetting = new UserSetting(10, 10, 3n * WAD, 1); // 10 seconds deadline, 0.1% slippage tolerance, 3x leverage, 1bps margin buffer

export async function prepare(chainName: string): Promise<{
    kit: ChainKit;
    publicClient: PublicClient;
    perpInfo: PerpInfo;
    instrumentSettingMap: Map<Address, InstrumentSetting>;
}> {
    const kit = ChainKitRegistry.for(chainName);

    const publicClient = createPublicClient({
        chain: kit.chain,
        transport: http(kit.chain.rpcUrls.default.http[0]),
    });

    const perpInfo = getPerpInfo(kit.chain.id);

    kit.registerAddressName(perpInfo.config, 'Config');
    kit.registerAddressName(perpInfo.observer, 'Observer');
    kit.registerAddressName(perpInfo.gate, 'Gate');
    if (perpInfo.guardian) {
        kit.registerAddressName(perpInfo.guardian, 'Guardian');
    }

    const gateParser = createGateParser({
        async resolveAddress(address: Address) {
            return kit.getAddressName(address) || address;
        },
        async getTokenInfo(symbolOrAddress: string) {
            return kit.getErc20TokenInfo(symbolOrAddress);
        },
        publicClient,
        nativeTokenAddress: kit.nativeTokenInfo.address,
    });

    kit.registerParser(perpInfo.gate, gateParser);

    const instrumentParser = createInstrumentParser({
        publicClient,
        async getTokenInfo(symbolOrAddress: string) {
            return kit.getErc20TokenInfo(symbolOrAddress);
        },
        async resolveAddress(address: Address) {
            return kit.getAddressName(address) || address;
        },
    });

    const instrumentAddresses = (await publicClient.readContract({
        address: perpInfo.observer,
        abi: CURRENT_OBSERVER_ABI,
        functionName: 'getAllInstrumentList',
    })) as readonly Address[];

    const instrumentSettingMap = new Map<Address, InstrumentSetting>();
    for (const instrumentAddress of instrumentAddresses) {
        try {
            const result = await publicClient.readContract({
                address: perpInfo.observer,
                abi: CURRENT_OBSERVER_ABI,
                functionName: 'getInstrument',
                args: [instrumentAddress, PERP_EXPIRY],
            });

            // getInstrument returns a tuple: (setting, amm, priceData, spacing, blockInfo)
            // Viem may return it as an array [setting, amm, priceData, spacing, blockInfo] or as an object
            let setting: Setting;
            let spacing: SpacingConfig | undefined;

            if (Array.isArray(result)) {
                // Tuple returned as array
                [setting, , , spacing] = result;
            } else if (result && typeof result === 'object' && 'setting' in result) {
                // Tuple returned as object (when ABI has named return values)
                const typedResult = result as { setting: Setting; spacing?: SpacingConfig };
                setting = typedResult.setting;
                spacing = typedResult.spacing;
            } else {
                throw new Error(`Unexpected result type: ${typeof result}`);
            }

            if (!setting) {
                throw new Error('Setting is undefined');
            }

            const orderSpacing = Number(spacing?.order ?? perpInfo.orderSpacing);
            const rangeSpacing = Number(spacing?.range ?? perpInfo.rangeSpacing);
            const pearlSpacing = Number(spacing?.pearl ?? perpInfo.pearlSpacing ?? rangeSpacing);
            const instrumentSetting = new InstrumentSetting(
                setting,
                Condition.NORMAL,
                pearlSpacing,
                orderSpacing,
                rangeSpacing
            );
            instrumentSettingMap.set(instrumentAddress, instrumentSetting);
            kit.registerAddressName(instrumentAddress, instrumentSetting.symbol);
            kit.registerParser(instrumentAddress, instrumentParser);

            const spacingSource = spacing ? 'observer' : 'fallback';
            console.log(
                `ℹ️ Loaded instrument ${instrumentSetting.symbol}: spacing(order=${orderSpacing}, range=${rangeSpacing}, pearl=${pearlSpacing}) [${spacingSource}]`
            );
        } catch (error) {
            console.warn(`⚠️ Failed to load instrument ${instrumentAddress}: ${(error as Error).message}`);
        }
    }

    return { kit, publicClient, perpInfo, instrumentSettingMap } as const;
}

/**
 * Find instrument by symbol from instrumentSettingMap
 * @param symbol - The symbol to search for (e.g., 'ETH-USDM')
 * @param instrumentSettingMap - The map of instrument addresses to setting wrappers
 * @returns The instrument address and setting wrapper, or throws if not found
 */
export function findInstrumentBySymbol(
    symbol: string,
    instrumentSettingMap: Map<Address, InstrumentSetting>
): { instrumentAddress: Address; instrumentSetting: InstrumentSetting } {
    for (const [address, wrapper] of instrumentSettingMap.entries()) {
        if (wrapper.symbol === symbol) {
            return {
                instrumentAddress: address,
                instrumentSetting: wrapper,
            };
        }
    }
    throw Errors.validation(`Instrument with symbol ${symbol} not found`, ErrorCode.INVALID_PARAM, { symbol });
}

/**
 * Check margin availability and handle allowance approval if needed
 * @param snapshot - PairSnapshot instance (contains quote and gate addresses)
 * @param publicClient - Viem public client
 * @param walletClient - Viem wallet client
 * @param kit - ChainKit instance
 * @param marginRequired - Required margin amount in token decimals
 * @throws Error if insufficient margin is available
 */
export async function ensureMarginAndAllowance(
    snapshot: PairSnapshot,
    publicClient: PublicClient,
    walletClient: WalletClient,
    kit: ChainKit,
    marginRequired: bigint
): Promise<void> {
    if (marginRequired <= 0n) {
        return;
    }

    const { allowanceGap, marginGap } = snapshot.checkMargin(marginRequired);

    if (marginGap > 0) {
        throw Errors.simulation(`Insufficient margin: need ${marginGap} more`, ErrorCode.INSUFFICIENT_MARGIN, {
            needed: marginGap.toString(),
        });
    }

    if (allowanceGap > 0) {
        const quoteAddress = snapshot.instrumentSetting.quoteAddress;
        const gateAddress = snapshot.instrumentSetting.gateAddress;
        // ERC20 `approve` sets the allowance value (not an additive increase), so we approve the target allowance.
        const requiredAllowance = snapshot.quoteState.allowance + allowanceGap;
        await ERC20.approve(publicClient, walletClient, kit, quoteAddress, gateAddress, requiredAllowance);
    }
}

/**
 * Cancel orders at specific ticks if they still exist in the portfolio
 * @param publicClient - Viem public client
 * @param walletClient - Viem wallet client
 * @param kit - ChainKit instance
 * @param instrumentAddress - Instrument contract address
 * @param rpcConfig - RPC configuration for fetching onchain context
 * @param walletAddress - Trader wallet address
 * @param ticksToCancel - Array of ticks to cancel
 * @param waitSeconds - Optional wait time before checking (default: 2)
 * @returns Array of ticks that were actually canceled
 */
export async function cancelOrdersAtTicks(
    publicClient: PublicClient,
    walletClient: WalletClient,
    kit: ChainKit,
    instrumentAddress: Address,
    rpcConfig: RpcConfig,
    walletAddress: Address,
    ticksToCancel: number[],
    waitSeconds: number = 2
): Promise<number[]> {
    if (ticksToCancel.length === 0) {
        return [];
    }

    // Wait before checking order status
    if (waitSeconds > 0) {
        console.log(`⏳ Waiting ${waitSeconds} seconds before checking order status...`);
        await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
    }

    // Fetch updated portfolio to check which orders still exist
    const updatedOnchainContext = await fetchOnchainContext(instrumentAddress, PERP_EXPIRY, rpcConfig, walletAddress);
    const portfolio = updatedOnchainContext.portfolio;
    if (!portfolio) {
        console.log(`ℹ️ No portfolio found`);
        return [];
    }

    // Parse order IDs to find which orders still exist
    const existingOrderTicks = new Set<number>();
    portfolio.oids.forEach((oid) => {
        const { tick } = Order.unpackKey(oid);
        if (ticksToCancel.includes(tick)) {
            existingOrderTicks.add(tick);
        }
    });

    // Cancel all remaining orders
    if (existingOrderTicks.size > 0) {
        const ticksArray = Array.from(existingOrderTicks);
        if (ticksArray.length === 1) {
            console.log(`🗑️ Order still exists at ${formatTick(ticksArray[0])}, canceling...`);
        } else {
            console.log(
                `🗑️ Canceling ${ticksArray.length} remaining orders at: ${ticksArray.map((tick) => formatTick(tick)).join(', ')}`
            );
        }
        await sendTxWithLog(publicClient, walletClient, kit, {
            address: instrumentAddress,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'cancel',
            args: [
                encodeCancelParam({
                    expiry: PERP_EXPIRY,
                    ticks: ticksArray,
                    deadline: DefaultUserSetting.getDeadline(),
                }),
            ],
            gas: BigInt(500000),
        });
        return ticksArray;
    } else {
        if (ticksToCancel.length === 1) {
            console.log(`ℹ️ Order at ${formatTick(ticksToCancel[0])} was already filled`);
        } else {
            console.log(`ℹ️ All orders were already filled`);
        }
        return [];
    }
}

/**
 * Close position if one exists
 * @param publicClient - Viem public client
 * @param walletClient - Viem wallet client
 * @param kit - ChainKit instance
 * @param instrumentAddress - Instrument contract address
 * @param rpcConfig - RPC configuration for fetching onchain context
 * @param walletAddress - Trader wallet address
 * @param userSetting - User setting for slippage and deadline (defaults to DefaultUserSetting)
 * @returns true if a position was closed, false otherwise
 */
export async function closePositionIfExists(
    publicClient: PublicClient,
    walletClient: WalletClient,
    kit: ChainKit,
    instrumentAddress: Address,
    rpcConfig: RpcConfig,
    walletAddress: Address,
    userSetting: UserSetting = DefaultUserSetting
): Promise<boolean> {
    // Fetch updated portfolio to check for position
    const updatedOnchainContext = await fetchOnchainContext(instrumentAddress, PERP_EXPIRY, rpcConfig, walletAddress);
    const portfolio = updatedOnchainContext.portfolio;
    if (!portfolio) {
        console.log(`ℹ️ No portfolio found`);
        return false;
    }

    // Check if there's a position to close
    const currentPosition = portfolio.position;
    if (currentPosition && currentPosition.size !== BigInt(0)) {
        console.log(`📉 Closing position (size: ${formatWad(abs(currentPosition.size))})...`);

        const closeSize = -currentPosition.size;
        const closeOnchainContext = await fetchOnchainContext(
            instrumentAddress,
            PERP_EXPIRY,
            rpcConfig,
            walletAddress,
            closeSize
        );
        const closeQuotation = closeOnchainContext.quotation;

        if (!closeQuotation) {
            throw new Error('Failed to fetch quotation for closing');
        }

        const closeLimitTick = userSetting.getTradeLimitTick(
            wdiv(closeQuotation.entryNotional, abs(closeSize)),
            closeSize > BigInt(0) ? Side.LONG : Side.SHORT
        );

        const closeTradeParam: TradeParam = {
            expiry: PERP_EXPIRY,
            size: closeSize,
            amount: ZERO,
            limitTick: closeLimitTick,
            deadline: userSetting.getDeadline(),
        };

        await sendTxWithLog(publicClient, walletClient, kit, {
            address: instrumentAddress,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'trade',
            args: [encodeTradeParam(closeTradeParam)],
            gas: BigInt(500000),
        });
        console.log(`✅ Position closed successfully`);
        return true;
    } else {
        console.log(`ℹ️ No position to close`);
        return false;
    }
}

/**
 * Remove all ranges from the portfolio
 * @param publicClient - Viem public client
 * @param walletClient - Viem wallet client
 * @param kit - ChainKit instance
 * @param instrumentAddress - Instrument contract address
 * @param rpcConfig - RPC configuration for fetching onchain context
 * @param walletAddress - Trader wallet address
 * @param userSetting - User setting for slippage and deadline (defaults to DefaultUserSetting)
 * @param waitSeconds - Optional wait time before checking (default: 2)
 * @returns Array of range IDs that were removed
 */
export async function removeAllRanges(
    publicClient: PublicClient,
    walletClient: WalletClient,
    kit: ChainKit,
    instrumentAddress: Address,
    rpcConfig: RpcConfig,
    walletAddress: Address,
    userSetting: UserSetting = DefaultUserSetting,
    waitSeconds: number = 2
): Promise<number[]> {
    // Wait before checking range status
    if (waitSeconds > 0) {
        console.log(`⏳ Waiting ${waitSeconds} seconds before checking range status...`);
        await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
    }

    // Fetch updated portfolio to check which ranges still exist
    const updatedOnchainContext = await fetchOnchainContext(instrumentAddress, PERP_EXPIRY, rpcConfig, walletAddress);
    const portfolio = updatedOnchainContext.portfolio;
    if (!portfolio) {
        console.log(`ℹ️ No portfolio found`);
        return [];
    }

    // Parse range IDs to get tick bounds
    const rangesToRemove: Array<{ rid: number; tickLower: number; tickUpper: number }> = [];
    portfolio.rids.forEach((rid) => {
        const { tickLower, tickUpper } = Range.unpackKey(rid);
        rangesToRemove.push({ rid, tickLower, tickUpper });
    });

    if (rangesToRemove.length === 0) {
        console.log(`ℹ️ No ranges to remove`);
        return [];
    }

    // Remove each range
    const removedRids: number[] = [];
    for (const { rid, tickLower, tickUpper } of rangesToRemove) {
        console.log(`🗑️ Removing range: ${formatTick(tickLower)} to ${formatTick(tickUpper)}...`);

        // Fetch updated context to get latest AMM state
        const currentContext = await fetchOnchainContext(instrumentAddress, PERP_EXPIRY, rpcConfig, walletAddress);

        const removeInput = new RemoveInput(walletAddress, tickLower, tickUpper);
        const [removeParam] = removeInput.simulate(currentContext, userSetting);

        await sendTxWithLog(publicClient, walletClient, kit, {
            address: instrumentAddress,
            abi: CURRENT_INSTRUMENT_ABI,
            functionName: 'remove',
            args: [encodeRemoveParam(removeParam)],
            gas: BigInt(500000),
        });

        removedRids.push(rid);
    }

    console.log(`✅ Removed ${removedRids.length} range(s)`);
    return removedRids;
}

/**
 * Re-validate and re-simulate a place order if the AMM tick has moved.
 * This prevents "OrderWrongSide" panics when the AMM tick moves between simulation and execution.
 */
export async function ensureValidPlaceParam(
    placeInput: PlaceInput,
    originalPlaceParam: PlaceParam,
    rpcConfig: RpcConfig,
    walletAddress: Address,
    instrumentAddress: Address,
    expiry: number,
    userSetting: UserSetting
): Promise<PlaceParam> {
    // Re-fetch fresh onchain context
    const freshContext = await fetchOnchainContext(instrumentAddress, expiry, rpcConfig, walletAddress);

    // Quick check: is the order still on the correct side?
    const { amm } = freshContext;
    const isStillValid =
        (originalPlaceParam.size > 0 && originalPlaceParam.tick < amm.tick) ||
        (originalPlaceParam.size < 0 && originalPlaceParam.tick > amm.tick);

    if (isStillValid) {
        // Order is still valid, return original param
        return originalPlaceParam;
    }

    // AMM tick has moved, need to re-simulate
    console.log(`⚠️ AMM tick moved from simulation (current: ${amm.tick}). Re-simulating order...`);
    const [newPlaceParam] = placeInput.simulate(freshContext, userSetting);
    return newPlaceParam;
}

/**
 * Re-validate ticks for batch place orders.
 * Filters out ticks that are no longer valid (on wrong side of AMM tick).
 */
export async function ensureValidBatchPlaceTicks(
    instrumentAddress: Address,
    expiry: number,
    ticks: number[],
    side: Side,
    rpcConfig: RpcConfig,
    walletAddress: Address
): Promise<number[]> {
    if (ticks.length === 0) {
        return ticks;
    }

    // Re-fetch fresh onchain context
    const freshContext = await fetchOnchainContext(instrumentAddress, expiry, rpcConfig, walletAddress);
    const { amm } = freshContext;

    // Filter out ticks that are on the wrong side
    const validTicks = ticks.filter((tick) => {
        const isValid = side === Side.LONG ? tick < amm.tick : tick > amm.tick;
        if (!isValid) {
            console.log(`⚠️ Tick ${tick} is no longer valid (AMM tick: ${amm.tick}), skipping...`);
        }
        return isValid;
    });

    return validTicks;
}
