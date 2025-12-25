import { parseUnits } from 'viem';
import { abs, sqrtX96ToWad, wmul } from '../src/math';
import { WAD_DECIMALS, ZERO } from '../src/constants';
import { CURRENT_INSTRUMENT_ABI } from '../src/abis';
import { AdjustInput } from '../src/actions/adjust';
import { TradeInput } from '../src/actions/trade';
import { QuotationWithSize, Side, UserSetting } from '../src/types';
import { encodeAdjustParam, encodeTradeParam } from '../src/utils/encode';
import { formatTick, formatTokenAmount, formatWad } from '../src/utils/format';
import type { DemoContext } from './framework/types';
import { registerDemo } from './framework/registry';
import { DefaultUserSetting, ensureMarginAndAllowance } from './utils';

/**
 * Demo: Trade by margin using TradeInput
 */
export async function demoTradeByMargin(context: DemoContext): Promise<void> {
    const { walletAddress, publicClient, walletClient, kit, perpClient } = context;

    // Get fresh snapshot
    const snapshot = await perpClient.getSnapshot(walletAddress);
    const { instrumentSetting } = snapshot;

    const fairPrice = sqrtX96ToWad(snapshot.amm.sqrtPX96);
    const markPrice = snapshot.priceData.markPrice;

    console.log(`ℹ️ Fair price: ${formatWad(fairPrice)}`);
    console.log(`ℹ️ Mark price: ${formatWad(markPrice)}`);

    // Determine trade direction
    const side = fairPrice > markPrice ? Side.SHORT : Side.LONG;
    const baseQuantity = parseUnits('0.01', WAD_DECIMALS);
    const marginAmountInWad = parseUnits('100', WAD_DECIMALS);

    console.log(`ℹ️ Trade direction: ${side === Side.LONG ? 'LONG' : 'SHORT'}`);
    console.log(`ℹ️ Base quantity: ${formatWad(baseQuantity)}`);

    const marginNeeded = wmul(marginAmountInWad, 10n ** BigInt(instrumentSetting.quoteDecimals));
    const marginFormatted = await formatTokenAmount(marginAmountInWad, instrumentSetting.quoteAddress, undefined, 6);
    console.log(`ℹ️ Margin amount: ${marginFormatted}`);

    await ensureMarginAndAllowance(snapshot, publicClient, walletClient, kit, marginNeeded);

    // Fetch quotation using client
    const signedSize = side === Side.LONG ? baseQuantity : -baseQuantity;
    const snapshotWithQuotation = await perpClient.getSnapshot(walletAddress, signedSize);
    const quotation = snapshotWithQuotation.quotation;

    if (!quotation) {
        throw new Error('Failed to fetch quotation');
    }

    const quotationWithSize = new QuotationWithSize(signedSize, quotation);

    // Create TradeInput (by margin) and simulate
    const tradeInput = new TradeInput(walletAddress, baseQuantity, side, marginAmountInWad);

    const [tradeParam, simulation] = tradeInput.simulate(snapshot, quotationWithSize, perpClient.userSetting);

    console.log(`📈 Executing trade by margin (limit tick: ${formatTick(tradeParam.limitTick)})...`);
    console.log(`ℹ️ Post-trade margin delta: ${formatWad(tradeParam.amount)}`);
    console.log(`ℹ️ Post-trade leverage: ${formatWad(simulation.postPosition.leverage(snapshot.amm, markPrice))}`);

    const { sendTxWithLog } = await import('@synfutures/viem-kit');
    await sendTxWithLog(publicClient, walletClient, kit, {
        address: perpClient.instrumentAddress,
        abi: CURRENT_INSTRUMENT_ABI,
        functionName: 'trade',
        args: [encodeTradeParam(tradeParam)],
        gas: BigInt(500000),
    });

    console.log(`✅ Trade by margin executed successfully!`);
}

/**
 * Demo: Trade by leverage using TradeInput
 */
export async function demoTradeByLeverage(context: DemoContext): Promise<void> {
    const { walletAddress, publicClient, walletClient, kit, perpClient } = context;

    // Get fresh snapshot
    const snapshot = await perpClient.getSnapshot(walletAddress);
    const { instrumentSetting } = snapshot;

    const fairPrice = sqrtX96ToWad(snapshot.amm.sqrtPX96);
    const markPrice = snapshot.priceData.markPrice;

    console.log(`ℹ️ Fair price: ${formatWad(fairPrice)}`);
    console.log(`ℹ️ Mark price: ${formatWad(markPrice)}`);

    const side = fairPrice > markPrice ? Side.SHORT : Side.LONG;
    const baseQuantity = parseUnits('0.01', WAD_DECIMALS);
    const targetLeverage = parseUnits('3', WAD_DECIMALS); // 3x leverage

    console.log(`ℹ️ Trade direction: ${side === Side.LONG ? 'LONG' : 'SHORT'}`);
    console.log(`ℹ️ Base quantity: ${formatWad(baseQuantity)}`);
    console.log(`ℹ️ Target leverage: ${formatWad(targetLeverage)}x`);

    // Fetch quotation using client
    const signedSize = side === Side.LONG ? baseQuantity : -baseQuantity;
    const snapshotWithQuotation = await perpClient.getSnapshot(walletAddress, signedSize);
    const quotation = snapshotWithQuotation.quotation;

    if (!quotation) {
        throw new Error('Failed to fetch quotation');
    }

    const quotationWithSize = new QuotationWithSize(signedSize, quotation);

    // Create TradeInput (by leverage) and simulate
    const tradeInput = new TradeInput(walletAddress, baseQuantity, side);

    const [tradeParam, simulation] = tradeInput.simulate(snapshot, quotationWithSize, perpClient.userSetting);

    if (tradeParam.amount > ZERO) {
        const marginNeeded = wmul(tradeParam.amount, 10n ** BigInt(instrumentSetting.quoteDecimals));
        const marginFormatted = await formatTokenAmount(marginNeeded, instrumentSetting.quoteAddress, undefined, 6);
        console.log(`ℹ️ Required margin: ${marginFormatted}`);
        await ensureMarginAndAllowance(snapshot, publicClient, walletClient, kit, marginNeeded);
    }

    console.log(`📈 Executing trade by leverage (limit tick: ${formatTick(tradeParam.limitTick)})...`);
    console.log(`ℹ️ Post-trade margin delta: ${formatWad(tradeParam.amount)}`);
    console.log(`ℹ️ Post-trade leverage: ${formatWad(simulation.postPosition.leverage(snapshot.amm, markPrice))}`);

    const { sendTxWithLog } = await import('@synfutures/viem-kit');
    await sendTxWithLog(publicClient, walletClient, kit, {
        address: perpClient.instrumentAddress,
        abi: CURRENT_INSTRUMENT_ABI,
        functionName: 'trade',
        args: [encodeTradeParam(tradeParam)],
        gas: BigInt(500000),
    });

    console.log(`✅ Trade by leverage executed successfully!`);
}

/**
 * Demo: Close position using TradeInput
 */
export async function demoCloseTrade(context: DemoContext): Promise<void> {
    const { walletAddress, publicClient, walletClient, kit, perpClient } = context;

    // Get fresh snapshot
    const snapshot = await perpClient.getSnapshot(walletAddress);

    if (snapshot.portfolio.position.size === ZERO) {
        console.log(`ℹ️ No position to close. Skipping close trade demo.`);
        return;
    }

    const position = snapshot.portfolio.position;
    const signedSize = position.size; // Signed: positive for LONG, negative for SHORT

    console.log(`ℹ️ Current position size: ${formatWad(abs(signedSize))}`);
    console.log(`ℹ️ Position side: ${signedSize >= ZERO ? 'LONG' : 'SHORT'}`);

    // Fetch quotation for closing using client
    const snapshotWithQuotation = await perpClient.getSnapshot(walletAddress, -signedSize); // Opposite sign to close
    const quotation = snapshotWithQuotation.quotation;

    if (!quotation) {
        throw new Error('Failed to fetch quotation');
    }

    const quotationWithSize = new QuotationWithSize(-signedSize, quotation);

    // Use TradeInput without `options.margin` to close the position.
    // This uses leverage-based margin simulation, so partial closes can release margin proportionally.
    const closeSignedSize = -signedSize;
    const closeSide = closeSignedSize >= ZERO ? Side.LONG : Side.SHORT;
    const closeInput = new TradeInput(
        walletAddress,
        abs(closeSignedSize), // positive quantity
        closeSide // side determined from signed size
    );

    const [tradeParam, simulation] = closeInput.simulate(snapshot, quotationWithSize, perpClient.userSetting);

    console.log(`📈 Closing position (limit tick: ${formatTick(tradeParam.limitTick)})...`);
    console.log(`ℹ️ Realized PnL: ${formatWad(simulation.realized)}`);

    const { sendTxWithLog } = await import('@synfutures/viem-kit');
    await sendTxWithLog(publicClient, walletClient, kit, {
        address: perpClient.instrumentAddress,
        abi: CURRENT_INSTRUMENT_ABI,
        functionName: 'trade',
        args: [encodeTradeParam(tradeParam)],
        gas: BigInt(500000),
    });

    console.log(`✅ Position closed successfully!`);
}

/**
 * Demo: Adjust margin using AdjustInput
 */
export async function demoAdjustMargin(context: DemoContext): Promise<void> {
    const { walletAddress, publicClient, walletClient, kit, perpClient } = context;

    // Get fresh snapshot
    const snapshot = await perpClient.getSnapshot(walletAddress);
    const { instrumentSetting } = snapshot;

    if (snapshot.portfolio.position.size === ZERO) {
        console.log(`ℹ️ No position to adjust margin for. Skipping adjust margin demo.`);
        return;
    }

    const position = snapshot.portfolio.position;
    const markPrice = snapshot.priceData.markPrice;

    console.log(`ℹ️ Current position margin: ${formatWad(position.balance)}`);
    console.log(`ℹ️ Current leverage: ${formatWad(position.leverage(snapshot.amm, markPrice))}`);

    // Add margin (transfer in)
    const marginAmountInWad = parseUnits('50', WAD_DECIMALS);
    const marginNeeded = wmul(marginAmountInWad, 10n ** BigInt(instrumentSetting.quoteDecimals));
    const marginFormatted = await formatTokenAmount(marginAmountInWad, instrumentSetting.quoteAddress, undefined, 6);
    console.log(`ℹ️ Adding margin: ${marginFormatted}`);

    await ensureMarginAndAllowance(snapshot, publicClient, walletClient, kit, marginNeeded);

    // Create AdjustInput and simulate
    const adjustInput = new AdjustInput(
        walletAddress,
        marginAmountInWad,
        true // transferIn
    );

    const [adjustParam, simulation] = adjustInput.simulate(snapshot, perpClient.userSetting);

    const postPosition = simulation.postPosition;
    const newLeverage = postPosition.leverage(snapshot.amm, markPrice);
    const newLiquidationPrice = postPosition.liquidationPrice(snapshot.amm, instrumentSetting.maintenanceMarginRatio);

    console.log(`📈 Adjusting margin (adding ${marginFormatted})...`);
    console.log(`ℹ️ New position margin: ${formatWad(postPosition.balance)}`);
    console.log(`ℹ️ New leverage: ${formatWad(newLeverage)}`);
    console.log(`ℹ️ Liquidation price: ${formatWad(newLiquidationPrice)}`);

    // Adjust margin uses trade function with size=0
    const { sendTxWithLog } = await import('@synfutures/viem-kit');
    await sendTxWithLog(publicClient, walletClient, kit, {
        address: perpClient.instrumentAddress,
        abi: CURRENT_INSTRUMENT_ABI,
        functionName: 'trade',
        args: [encodeAdjustParam(adjustParam)],
        gas: BigInt(500000),
    });

    console.log(`✅ Margin adjusted successfully!`);
}

/**
 * Demo: Adjust leverage using AdjustInput
 */
export async function demoAdjustLeverage(context: DemoContext): Promise<void> {
    const { walletAddress, publicClient, walletClient, kit, perpClient } = context;

    // Get fresh snapshot
    const snapshot = await perpClient.getSnapshot(walletAddress);
    const { instrumentSetting } = snapshot;

    if (snapshot.portfolio.position.size === ZERO) {
        console.log(`ℹ️ No position to adjust leverage for. Skipping adjust leverage demo.`);
        return;
    }

    const position = snapshot.portfolio.position;
    const markPrice = snapshot.priceData.markPrice;

    const currentLeverage = position.leverage(snapshot.amm, markPrice);
    const targetLeverage = parseUnits('2', WAD_DECIMALS); // 2x leverage

    console.log(`ℹ️ Current leverage: ${formatWad(currentLeverage)}x`);
    console.log(`ℹ️ Target leverage: ${formatWad(targetLeverage)}x`);

    // Create AdjustInput and simulate
    const targetLeverageUserSetting = new UserSetting(
        DefaultUserSetting.deadlineOffset,
        DefaultUserSetting.slippage,
        targetLeverage,
        DefaultUserSetting.markPriceBufferInBps,
        DefaultUserSetting.strictMode
    );
    const adjustInput = new AdjustInput(walletAddress);

    const [adjustParam, simulation] = adjustInput.simulate(snapshot, targetLeverageUserSetting);

    const marginDelta = adjustParam.net;
    const marginNeeded = abs(marginDelta);
    const marginFormatted = await formatTokenAmount(marginNeeded, instrumentSetting.quoteAddress, undefined, 6);

    if (marginDelta > ZERO) {
        console.log(`ℹ️ Adding margin: ${marginFormatted}`);
        await ensureMarginAndAllowance(
            snapshot,
            publicClient,
            walletClient,
            kit,
            wmul(marginNeeded, 10n ** BigInt(instrumentSetting.quoteDecimals))
        );
    } else {
        console.log(`ℹ️ Withdrawing margin: ${marginFormatted}`);
    }

    const postPosition = simulation.postPosition;
    const newLiquidationPrice = postPosition.liquidationPrice(snapshot.amm, instrumentSetting.maintenanceMarginRatio);

    console.log(`📈 Adjusting leverage to ${formatWad(targetLeverage)}x...`);
    console.log(`ℹ️ New position margin: ${formatWad(postPosition.balance)}`);
    console.log(`ℹ️ New leverage: ${formatWad(targetLeverage)}x`);
    console.log(`ℹ️ Margin delta: ${formatWad(marginDelta)}`);
    console.log(`ℹ️ Transfer in: ${marginDelta >= ZERO}`);
    console.log(`ℹ️ Liquidation price: ${formatWad(newLiquidationPrice)}`);

    // Adjust leverage uses trade function with size=0
    const { sendTxWithLog } = await import('@synfutures/viem-kit');
    await sendTxWithLog(publicClient, walletClient, kit, {
        address: perpClient.instrumentAddress,
        abi: CURRENT_INSTRUMENT_ABI,
        functionName: 'trade',
        args: [encodeAdjustParam(adjustParam)],
        gas: BigInt(500000),
    });

    console.log(`✅ Leverage adjusted successfully!`);
}

// Register all trade demos
registerDemo({
    name: 'trade-by-margin',
    description: 'Execute a trade by specifying margin amount',
    category: 'trade',
    run: demoTradeByMargin,
});

registerDemo({
    name: 'trade-by-leverage',
    description: 'Execute a trade by specifying target leverage',
    category: 'trade',
    run: demoTradeByLeverage,
});

registerDemo({
    name: 'close-trade',
    description: 'Close an existing position',
    category: 'trade',
    prerequisites: ['trade-by-margin', 'trade-by-leverage'],
    run: demoCloseTrade,
});

registerDemo({
    name: 'adjust-margin',
    description: 'Add or remove margin from a position',
    category: 'trade',
    prerequisites: ['trade-by-margin'],
    run: demoAdjustMargin,
});

registerDemo({
    name: 'adjust-leverage',
    description: 'Adjust position leverage to a target value',
    category: 'trade',
    prerequisites: ['trade-by-margin'],
    run: demoAdjustLeverage,
});
