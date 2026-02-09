import { formatUnits } from 'viem';
import { buildDepthChartData } from '../frontend';
import { tickToSqrtX96 } from '../math';
import { WAD } from '../constants';
import { Range, type MinimalPearl } from '../types';

describe('Depth chart helpers', () => {
    test('buildDepthChartData handles current-tick residuals (tickDelta=1)', () => {
        const currTick = 0;
        const sqrt0 = tickToSqrtX96(currTick);
        const sqrt1 = tickToSqrtX96(currTick + 1);
        const currPX96 = (sqrt0 + sqrt1) / 2n;
        const liquidity = 1_000_000n * WAD;

        const tick2Pearl = new Map<number, MinimalPearl>();

        const size = 5;
        const length = 1;
        const pageAdjustmentDelta = 0;
        const tickDelta = 1;

        const asks = buildDepthChartData(
            currPX96,
            liquidity,
            currTick,
            tickDelta,
            tick2Pearl,
            size,
            length,
            pageAdjustmentDelta,
            true
        );

        expect(asks).toHaveLength(1);
        expect(asks[0]!.tick).toBe(1);

        const tempRange = new Range(0n, 0n, 0n, currPX96, 0, 0);
        const expectedAskBase = tempRange.getDeltaBase(currPX96, sqrt1, liquidity, false);
        const expectedAskBaseNumber = Number(formatUnits(expectedAskBase, 18));
        expect(asks[0]!.base).toBeCloseTo(expectedAskBaseNumber, 10);

        const bids = buildDepthChartData(
            currPX96,
            liquidity,
            currTick,
            tickDelta,
            tick2Pearl,
            size,
            length,
            pageAdjustmentDelta,
            false
        );

        expect(bids).toHaveLength(1);
        expect(bids[0]!.tick).toBe(-1);

        const expectedBidBase = tempRange.getDeltaBase(currPX96, sqrt0, liquidity, true);
        const expectedBidBaseNumber = Number(formatUnits(expectedBidBase, 18));
        expect(bids[0]!.base).toBeCloseTo(expectedBidBaseNumber, 10);
    });

    test('buildDepthChartData includes maker orders and applies liquidityNet updates', () => {
        const currTick = 123;
        const size = 5;
        const tickDelta = 20;
        const length = 10;

        const sqrtCurr = tickToSqrtX96(currTick);
        const sqrtNext = tickToSqrtX96(currTick + 1);
        const currPX96 = (sqrtCurr + sqrtNext) / 2n;
        const liquidity = 1_000_000n * WAD;

        const pageAdjustmentDelta =
            currTick % size === 0 ? 0 : currTick > 0 ? currTick % size : size - (-currTick % size);

        const tick2PearlNoOrder = new Map<number, MinimalPearl>([
            // No maker orders at current tick
            [
                130,
                {
                    liquidityNet: 0n,
                    left: 0n,
                },
            ],
        ]);

        const tick2PearlWithOrderNoUpdate = new Map<number, MinimalPearl>([
            [
                currTick,
                {
                    liquidityNet: 0n,
                    left: -WAD, // ask-side maker orders at current tick
                },
            ],
            [
                130,
                {
                    liquidityNet: 0n,
                    left: 0n,
                },
            ],
        ]);

        const tick2PearlWithOrderWithUpdate = new Map<number, MinimalPearl>([
            [
                currTick,
                {
                    liquidityNet: 0n,
                    left: -WAD,
                },
            ],
            [
                130,
                {
                    liquidityNet: 500_000n * WAD,
                    left: 0n,
                },
            ],
        ]);

        const rightNoOrder = buildDepthChartData(
            currPX96,
            liquidity,
            currTick,
            tickDelta,
            tick2PearlNoOrder,
            size,
            length,
            pageAdjustmentDelta,
            true
        );

        const rightWithOrderNoUpdate = buildDepthChartData(
            currPX96,
            liquidity,
            currTick,
            tickDelta,
            tick2PearlWithOrderNoUpdate,
            size,
            length,
            pageAdjustmentDelta,
            true
        );

        expect(rightNoOrder.length).toBeGreaterThan(0);
        expect(rightWithOrderNoUpdate).toHaveLength(rightNoOrder.length);
        for (let i = 0; i < rightNoOrder.length; i += 1) {
            expect(rightWithOrderNoUpdate[i]!.tick).toBe(rightNoOrder[i]!.tick);
        }

        // Maker orders at current tick should be added into the first ask level.
        // We expect the level base to increase by ~1 (WAD) compared with the no-order case.
        const baseDiff = rightWithOrderNoUpdate[0]!.base - rightNoOrder[0]!.base;
        expect(baseDiff).toBeCloseTo(1, 12);

        const rightWithOrderWithUpdate = buildDepthChartData(
            currPX96,
            liquidity,
            currTick,
            tickDelta,
            tick2PearlWithOrderWithUpdate,
            size,
            length,
            pageAdjustmentDelta,
            true
        );

        expect(rightWithOrderWithUpdate).toHaveLength(rightWithOrderNoUpdate.length);
        for (let i = 0; i < rightWithOrderNoUpdate.length; i += 1) {
            expect(rightWithOrderWithUpdate[i]!.tick).toBe(rightWithOrderNoUpdate[i]!.tick);
        }

        // Crossing a pearl with positive liquidityNet on the right should increase curve depth further out.
        const lastIndex = rightWithOrderNoUpdate.length - 1;
        expect(rightWithOrderWithUpdate[lastIndex]!.base).toBeGreaterThan(rightWithOrderNoUpdate[lastIndex]!.base);
    });

    test('buildDepthChartData applies current-tick liquidityNet when walking bids', () => {
        const currTick = 10;
        const size = 5;
        const tickDelta = 20;
        const length = 10;

        const sqrtCurr = tickToSqrtX96(currTick);
        const sqrtNext = tickToSqrtX96(currTick + 1);
        const currPX96 = (sqrtCurr + sqrtNext) / 2n;

        const startingLiquidity = 1_000_000n * WAD;
        const liquidityNetAtCurrTick = 500_000n * WAD;

        const pageAdjustmentDelta = 0; // currTick % size === 0

        const tick2PearlNoNet = new Map<number, MinimalPearl>([
            [
                currTick,
                {
                    liquidityNet: 0n,
                    left: 0n,
                },
            ],
        ]);

        const tick2PearlWithNet = new Map<number, MinimalPearl>([
            [
                currTick,
                {
                    liquidityNet: liquidityNetAtCurrTick,
                    left: 0n,
                },
            ],
        ]);

        const bidsNoNet = buildDepthChartData(
            currPX96,
            startingLiquidity,
            currTick,
            tickDelta,
            tick2PearlNoNet,
            size,
            length,
            pageAdjustmentDelta,
            false
        );

        const bidsWithNet = buildDepthChartData(
            currPX96,
            startingLiquidity,
            currTick,
            tickDelta,
            tick2PearlWithNet,
            size,
            length,
            pageAdjustmentDelta,
            false
        );

        expect(bidsNoNet.length).toBeGreaterThan(0);
        expect(bidsWithNet).toHaveLength(bidsNoNet.length);
        for (let i = 0; i < bidsNoNet.length; i += 1) {
            expect(bidsWithNet[i]!.tick).toBe(bidsNoNet[i]!.tick);
        }

        // With positive liquidityNet at currTick, crossing currTick while walking bids reduces in-range liquidity,
        // so depth further out should be smaller than the no-net case.
        const lastIndex = bidsNoNet.length - 1;
        expect(bidsWithNet[lastIndex]!.base).toBeLessThan(bidsNoNet[lastIndex]!.base);
    });
});
