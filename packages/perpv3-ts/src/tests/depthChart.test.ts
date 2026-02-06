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
});

