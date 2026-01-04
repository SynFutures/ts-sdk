import { parseUnits } from 'viem';
import { ratioToWad, sqrtX96ToWad, wadToTick, wmul } from '@synfutures/perpv3-ts/math';
import { RATIO_BASE } from '@synfutures/perpv3-ts/constants';
import { CURRENT_INSTRUMENT_ABI } from '@synfutures/perpv3-ts/abis';
import { AddInput, RemoveInput } from '@synfutures/perpv3-ts/actions';
import { encodeAddParam, encodeRemoveParam, formatTick, formatTokenAmount, formatWad } from '@synfutures/perpv3-ts/utils';
import type { DemoContext } from './framework/types';
import { registerDemo } from './framework/registry';
import { ensureMarginAndAllowance } from './utils';

/**
 * Demo: Add liquidity using AddInput
 */
export async function demoAddLiquidity(context: DemoContext): Promise<void> {
    const { walletAddress, publicClient, walletClient, kit, perpClient } = context;

    // Get fresh snapshot
    const snapshot = await perpClient.getSnapshot(walletAddress);
    const { instrumentSetting } = snapshot;

    // Calculate range bounds with random offsets
    const fairPrice = sqrtX96ToWad(snapshot.amm.sqrtPX96);
    const upperOffset = Math.floor(Math.random() * 1001) + 1000;
    const lowerOffset = Math.floor(Math.random() * 1001) + 1000;
    const priceUpper = wmul(fairPrice, ratioToWad(RATIO_BASE + upperOffset));
    const priceLower = wmul(fairPrice, ratioToWad(RATIO_BASE - lowerOffset));

    const tickUpper = instrumentSetting.alignRangeTickUpper(wadToTick(priceUpper));
    const tickLower = instrumentSetting.alignRangeTickLower(wadToTick(priceLower));

    console.log(`ℹ️ Fair price: ${formatWad(fairPrice)}`);
    console.log(`ℹ️ Range: ${formatTick(tickLower)} to ${formatTick(tickUpper)}`);

    // Prepare add liquidity input
    const amountInDecimals = parseUnits('10', instrumentSetting.quoteDecimals);
    // Convert from token decimals to WAD (18 decimals)
    // Formula: value * 10^(18 - decimals)
    const amountInWad = amountInDecimals * 10n ** BigInt(18 - instrumentSetting.quoteDecimals);

    const addInput = new AddInput(walletAddress, amountInWad, tickLower, tickUpper);
    const [addParam] = addInput.simulate(snapshot, perpClient.userSetting);

    // Convert WAD to token decimals: multiply by 10^decimals
    const marginNeededInDecimals = wmul(addInput.marginAmount, 10n ** BigInt(instrumentSetting.quoteDecimals));
    const marginFormatted = await formatTokenAmount(
        addInput.marginAmount,
        instrumentSetting.quoteAddress,
        undefined,
        6
    );
    console.log(`ℹ️ Margin required: ${marginFormatted}`);

    await ensureMarginAndAllowance(snapshot, publicClient, walletClient, kit, marginNeededInDecimals);

    // Add liquidity
    console.log(`📝 Adding liquidity...`);
    const { sendTxWithLog } = await import('@derivation-tech/viem-kit');
    await sendTxWithLog(publicClient, walletClient, kit, {
        address: perpClient.instrumentAddress,
        abi: CURRENT_INSTRUMENT_ABI,
        functionName: 'add',
        args: [encodeAddParam(addParam)],
        gas: BigInt(500000),
    });

    console.log(`✅ Liquidity added successfully!`);
}

/**
 * Demo: Remove liquidity using RemoveInput
 */
export async function demoRemoveLiquidity(context: DemoContext): Promise<void> {
    const { walletAddress, publicClient, walletClient, kit, perpClient } = context;

    // Get fresh snapshot
    const snapshot = await perpClient.getSnapshot(walletAddress);

    if (snapshot.portfolio.ranges.length === 0) {
        console.log(`ℹ️ No ranges to remove. Skipping remove liquidity demo.`);
        return;
    }

    const ranges = snapshot.portfolio.ranges;

    // Find the first range to remove
    const rangeToRemove = ranges[0];
    const tickLower = rangeToRemove.tickLower;
    const tickUpper = rangeToRemove.tickUpper;

    console.log(`ℹ️ Removing range: ${formatTick(tickLower)} to ${formatTick(tickUpper)}`);
    console.log(`ℹ️ Range liquidity: ${formatWad(rangeToRemove.liquidity)}`);

    // Create RemoveInput and simulate
    const removeInput = new RemoveInput(walletAddress, tickLower, tickUpper);
    const [removeParam, simulation] = removeInput.simulate(snapshot, perpClient.userSetting);

    console.log(`📝 Removing liquidity...`);
    console.log(`ℹ️ Removed position size: ${formatWad(simulation.removedPosition.size)}`);
    console.log(`ℹ️ Removed position margin: ${formatWad(simulation.removedPosition.balance)}`);
    console.log(`ℹ️ Post position size: ${formatWad(simulation.postPosition.size)}`);
    console.log(`ℹ️ Post position margin: ${formatWad(simulation.postPosition.balance)}`);

    const { sendTxWithLog } = await import('@derivation-tech/viem-kit');
    await sendTxWithLog(publicClient, walletClient, kit, {
        address: perpClient.instrumentAddress,
        abi: CURRENT_INSTRUMENT_ABI,
        functionName: 'remove',
        args: [encodeRemoveParam(removeParam)],
        gas: BigInt(500000),
    });

    console.log(`✅ Liquidity removed successfully!`);
}

// Register all range demos
registerDemo({
    name: 'add-liquidity',
    description: 'Add liquidity to a price range',
    category: 'range',
    run: demoAddLiquidity,
});

registerDemo({
    name: 'remove-liquidity',
    description: 'Remove liquidity from a price range',
    category: 'range',
    prerequisites: ['add-liquidity'],
    run: demoRemoveLiquidity,
});
