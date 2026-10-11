import { fetchOrderBookFromObserver } from '../../queries/rpc';
import { mockPublicClient } from '../helpers/viem';
import fixture from '../fixtures/simulation-context.json';
import { formatUnits, zeroAddress } from 'viem';
import { buildDepthChartData, getDepthRangeDataByLiquidityDetails } from '../../frontend';
import { tickToSqrtX96, alphaWadToTickDelta, ratioToWad } from '../../math';
import { WAD } from '../../constants';
import { Range, type MinimalPearl } from '../../types';

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

test('empty liquidity details produce an empty chart', () => {
    expect(
        getDepthRangeDataByLiquidityDetails(
            {
                amm: { sqrtPX96: tickToSqrtX96(0), tick: 0, liquidity: 0n },
                tids: [],
                pearls: [],
                tick2Pearl: new Map(),
                blockInfo: { height: 1, timestamp: 1 },
                length: 10,
                size: 5,
                stepRatio: 10,
                tickDelta: 20,
            },
            5,
            10
        )
    ).toEqual({ left: [], right: [] });
});

test('RPC order books and frontend charts share levels while RPC retains exact integer quantities', async () => {
    const amm = { sqrtPX96: tickToSqrtX96(-10), tick: -10, liquidity: 0n };
    const pearls = [{ left: -(WAD + 1n), liquidityNet: 0n }];
    const config = {
        chainId: 1,
        observerAddress: zeroAddress,
        publicClient: mockPublicClient({
            multicall: async () => [fixture.context],
            readContract: async () => [amm, [-10], pearls, { height: 1, timestamp: 1 }],
        }),
    };
    const book = await fetchOrderBookFromObserver(zeroAddress, 0xffffffff, config, { length: 2 });
    const ratio = 10;
    const size = alphaWadToTickDelta(ratioToWad(10000 + ratio));
    const delta = Math.ceil(alphaWadToTickDelta(ratioToWad(10000 + 11 * ratio)) / 10) * 10;
    const chart = buildDepthChartData(
        amm.sqrtPX96,
        0n,
        -10,
        delta,
        new Map([[-10, pearls[0]]]),
        size,
        2,
        10 % size === 0 ? 0 : size - (10 % size),
        true
    );
    const asks = book!['10'].asks;
    expect(asks[0].baseQuantity).toBe(WAD + 1n);
    expect(chart).toEqual(
        asks.map((level) => ({
            tick: level.tick,
            price: Number(formatUnits(level.price, 18)),
            base: Number(formatUnits(level.baseQuantity, 18)),
        }))
    );
    expect(asks.at(-1)!.baseSum).toBe(asks.reduce((sum, level) => sum + level.baseQuantity, 0n));
});
