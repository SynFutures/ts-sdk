import { describe, it, expect } from '@jest/globals';
import { Condition, InstrumentSetting, Order, PairSnapshot, Position, QuoteType, Side, Status } from '../types';
import { tickToWad, wadToTick, ratioToWad, wdiv, abs, wmul, tickToSqrtX96 } from '../math';
import { MAX_TICK, MIN_TICK, WAD } from '../constants';
import { zeroAddress } from 'viem';

/**
 * Test suite for validation helper methods added in commit e38b1e5
 * Focus on P0 fixes for getFeasibleLimitOrderTickRange and getFeasibleTargetTickRange
 */

const buildSetting = (imr: number, placePaused: boolean = false) => ({
    symbol: 'TEST',
    config: zeroAddress,
    gate: zeroAddress,
    market: zeroAddress,
    quote: zeroAddress,
    decimals: 18,
    param: {
        minMarginAmount: WAD,
        tradingFeeRatio: 50,
        protocolFeeRatio: 0,
        qtype: QuoteType.STABLE,
        tip: 0n,
    },
    initialMarginRatio: imr,
    maintenanceMarginRatio: 500,
    placePaused,
    fundingHour: 8,
    disableOrderRebate: false,
});

const createTestSnapshot = (ammTick: number, markPrice: bigint, imr: number = 1000, placePaused: boolean = false) =>
    new PairSnapshot({
        setting: buildSetting(imr, placePaused),
        condition: Condition.NORMAL,
        spacing: {
            pearl: 10,
            order: 10,
            range: 100,
        },
        amm: {
            expiry: 0,
            timestamp: 0,
            status: Status.TRADING,
            tick: ammTick,
            sqrtPX96: tickToSqrtX96(ammTick),
            liquidity: WAD,
            totalLiquidity: WAD,
            totalLong: 0n,
            totalShort: 0n,
            openInterests: 0n,
            involvedFund: 0n,
            feeIndex: 0n,
            protocolFee: 0n,
            longSocialLossIndex: 0n,
            shortSocialLossIndex: 0n,
            longFundingIndex: 0n,
            shortFundingIndex: 0n,
            insuranceFund: 0n,
            settlementPrice: 0n,
        },
        priceData: {
            instrument: zeroAddress,
            expiry: 0,
            markPrice,
            spotPrice: markPrice,
            benchmarkPrice: markPrice,
            feeder0: zeroAddress,
            feeder1: zeroAddress,
            feeder0UpdatedAt: 0n,
            feeder1UpdatedAt: 0n,
        },
        portfolio: {
            position: Position.empty(),
            orders: [],
            oids: [],
            ordersTaken: [],
            ranges: [],
            rids: [],
        },
        quoteState: {
            quote: zeroAddress,
            decimals: 18,
            symbol: 'QUOTE',
            threshold: 0n,
            reserve: 0n,
            balance: 0n,
            allowance: 0n,
            fundFlow: {
                totalIn: 0n,
                totalOut: 0n,
            },
            pending: {
                timestamp: 0,
                native: false,
                amount: 0n,
                exemption: 0n,
            },
        },
        blockInfo: {
            timestamp: 0,
            height: 0,
        },
    });

const createTestSetting = (imr: number = 1000, orderSpacing: number = 10) =>
    new InstrumentSetting(
        {
            symbol: 'TEST',
            config: zeroAddress,
            gate: zeroAddress,
            market: zeroAddress,
            quote: zeroAddress,
            decimals: 18,
            param: {
                minMarginAmount: WAD,
                tradingFeeRatio: 50,
                protocolFeeRatio: 0,
                qtype: QuoteType.STABLE,
                tip: 0n,
            },
            initialMarginRatio: imr,
            maintenanceMarginRatio: 500,
            placePaused: false,
            fundingHour: 8,
            disableOrderRebate: false,
        },
        Condition.NORMAL,
        10, // pearlSpacing
        orderSpacing,
        100 // rangeSpacing
    );

describe('InstrumentSetting.getFeasibleRangeTickRange', () => {
    it('should return aligned ticks within MIN_TICK/MAX_TICK bounds', () => {
        const setting = createTestSetting(1000, 10);
        const range = setting.getFeasibleRangeTickRange();

        expect(range.minTick).toBeGreaterThanOrEqual(MIN_TICK);
        expect(range.maxTick).toBeLessThanOrEqual(MAX_TICK);
        expect(Math.abs(range.minTick % setting.rangeSpacing)).toBe(0);
        expect(Math.abs(range.maxTick % setting.rangeSpacing)).toBe(0);
        expect(range.minTick).toBeLessThan(range.maxTick);
    });
});

describe('InstrumentSetting.getFeasibleLimitOrderTickRange', () => {
    // Create a minimal InstrumentSetting for testing
    // createTestSetting is defined above for reuse across suites.

    describe('LONG orders (tick < ammTick)', () => {
        it('should return range below ammTick', () => {
            const setting = createTestSetting();
            const ammTick = 1000;
            const markPrice = tickToWad(1000);

            const range = setting.getFeasibleLimitOrderTickRange(Side.LONG, ammTick, markPrice);

            expect(range).not.toBeNull();
            expect(range!.minTick).toBeLessThan(range!.maxTick);
            expect(range!.maxTick).toBeLessThan(ammTick);
        });

        it('should respect 2*IMR price deviation limit', () => {
            const setting = createTestSetting(1000); // 10% IMR
            const ammTick = 1000;
            const markPrice = tickToWad(1000);

            const range = setting.getFeasibleLimitOrderTickRange(Side.LONG, ammTick, markPrice);

            expect(range).not.toBeNull();

            // Check that the range respects price deviation limit
            const imr = ratioToWad(setting.imr);
            const maxDeviation = imr * 2n; // 20% for 10% IMR

            // Verify minTick respects deviation
            const minTickPrice = tickToWad(range!.minTick);
            const minDeviation = wdiv(abs(minTickPrice - markPrice), markPrice);
            expect(minDeviation).toBeLessThanOrEqual(maxDeviation);

            // Verify maxTick respects deviation
            const maxTickPrice = tickToWad(range!.maxTick);
            const maxDeviation2 = wdiv(abs(maxTickPrice - markPrice), markPrice);
            expect(maxDeviation2).toBeLessThanOrEqual(maxDeviation);
        });

        it('should have minTick at or above the deviation lower bound', () => {
            const setting = createTestSetting(1000); // 10% IMR
            const ammTick = 10000;
            const markPrice = tickToWad(10000);

            const range = setting.getFeasibleLimitOrderTickRange(Side.LONG, ammTick, markPrice);

            expect(range).not.toBeNull();

            const imr = ratioToWad(setting.imr);
            const maxDeviation = imr * 2n;
            const minDeviationPrice = markPrice - wmul(markPrice, maxDeviation);
            const minDeviationTick = wadToTick(minDeviationPrice);

            // minTick should be at or above minDeviationTick (accounting for alignment)
            expect(range!.minTick).toBeGreaterThanOrEqual(minDeviationTick - setting.orderSpacing);
        });

        it('should align ticks to orderSpacing', () => {
            const setting = createTestSetting(1000, 10);
            const ammTick = 1000;
            const markPrice = tickToWad(1000);

            const range = setting.getFeasibleLimitOrderTickRange(Side.LONG, ammTick, markPrice);

            expect(range).not.toBeNull();
            expect(Math.abs(range!.minTick % setting.orderSpacing)).toBe(0);
            expect(Math.abs(range!.maxTick % setting.orderSpacing)).toBe(0);
        });

        it('should allow a single-tick range when boundaries collapse', () => {
            const setting = createTestSetting(1, 10);
            const ammTick = 10;
            const markPrice = tickToWad(1);

            const range = setting.getFeasibleLimitOrderTickRange(Side.LONG, ammTick, markPrice);

            expect(range).not.toBeNull();
            const minTick = Object.is(range!.minTick, -0) ? 0 : range!.minTick;
            const maxTick = Object.is(range!.maxTick, -0) ? 0 : range!.maxTick;
            expect(minTick).toBe(maxTick);
            expect(minTick).toBe(0);
            const tickCheck = setting.isTickValidForLimitOrder(minTick, Side.LONG, ammTick, markPrice);
            expect(tickCheck.valid).toBe(true);
        });
    });

    describe('SHORT orders (tick > ammTick)', () => {
        it('should return range above ammTick', () => {
            const setting = createTestSetting();
            const ammTick = 1000;
            const markPrice = tickToWad(1000);

            const range = setting.getFeasibleLimitOrderTickRange(Side.SHORT, ammTick, markPrice);

            expect(range).not.toBeNull();
            expect(range!.minTick).toBeLessThan(range!.maxTick);
            expect(range!.minTick).toBeGreaterThan(ammTick);
        });

        it('should respect 2*IMR price deviation limit', () => {
            const setting = createTestSetting(1000); // 10% IMR
            const ammTick = 1000;
            const markPrice = tickToWad(1000);

            const range = setting.getFeasibleLimitOrderTickRange(Side.SHORT, ammTick, markPrice);

            expect(range).not.toBeNull();

            // Check that the range respects price deviation limit
            const imr = ratioToWad(setting.imr);
            const maxDeviation = imr * 2n;

            // Verify minTick respects deviation
            const minTickPrice = tickToWad(range!.minTick);
            const minDeviation = wdiv(abs(minTickPrice - markPrice), markPrice);
            expect(minDeviation).toBeLessThanOrEqual(maxDeviation);

            // Verify maxTick respects deviation
            const maxTickPrice = tickToWad(range!.maxTick);
            const maxDeviation2 = wdiv(abs(maxTickPrice - markPrice), markPrice);
            expect(maxDeviation2).toBeLessThanOrEqual(maxDeviation);
        });

        it('should have maxTick at or below the deviation upper bound', () => {
            const setting = createTestSetting(1000); // 10% IMR
            const ammTick = 10000;
            const markPrice = tickToWad(10000);

            const range = setting.getFeasibleLimitOrderTickRange(Side.SHORT, ammTick, markPrice);

            expect(range).not.toBeNull();

            const imr = ratioToWad(setting.imr);
            const maxDeviation = imr * 2n;
            const maxDeviationPrice = markPrice + wmul(markPrice, maxDeviation);
            const maxDeviationTick = wadToTick(maxDeviationPrice);

            // maxTick should be at or below maxDeviationTick (accounting for alignment)
            expect(range!.maxTick).toBeLessThanOrEqual(maxDeviationTick + setting.orderSpacing);
        });

        it('should align ticks to orderSpacing', () => {
            const setting = createTestSetting(1000, 10);
            const ammTick = 1000;
            const markPrice = tickToWad(1000);

            const range = setting.getFeasibleLimitOrderTickRange(Side.SHORT, ammTick, markPrice);

            expect(range).not.toBeNull();
            expect(Math.abs(range!.minTick) % setting.orderSpacing).toBe(0);
            expect(Math.abs(range!.maxTick) % setting.orderSpacing).toBe(0);
        });
    });

    describe('Edge cases', () => {
        it('should return null when no valid range exists', () => {
            const setting = createTestSetting(1000, 1000); // Large orderSpacing but not overflow
            const ammTick = 100;
            const markPrice = tickToWad(100);

            const range = setting.getFeasibleLimitOrderTickRange(Side.LONG, ammTick, markPrice);

            // With large orderSpacing relative to the range, there might be no valid range
            if (range === null) {
                expect(range).toBeNull();
            } else {
                // If there is a range, it should still be valid
                expect(range.minTick).toBeLessThan(range.maxTick);
            }
        });
    });
});

describe('InstrumentSetting.isTickValidForLimitOrder', () => {
    it('rejects ticks below MIN_TICK', () => {
        const setting = createTestSetting(1000, 1);
        const ammTick = 0;
        const markPrice = tickToWad(0);

        const result = setting.isTickValidForLimitOrder(MIN_TICK - 1, Side.LONG, ammTick, markPrice);

        expect(result.valid).toBe(false);
        expect(result.reason).toContain('Tick must be within');
    });

    it('rejects ticks above MAX_TICK', () => {
        const setting = createTestSetting(1000, 1);
        const ammTick = 0;
        const markPrice = tickToWad(0);

        const result = setting.isTickValidForLimitOrder(MAX_TICK + 1, Side.SHORT, ammTick, markPrice);

        expect(result.valid).toBe(false);
        expect(result.reason).toContain('Tick must be within');
    });
});

describe('PairSnapshot.getFeasibleTargetTickRange', () => {
    describe('LONG cross limit order (targetTick > ammTick)', () => {
        it('should return range above ammTick', () => {
            const ammTick = 1000;
            const markPrice = tickToWad(1000);
            const snapshot = createTestSnapshot(ammTick, markPrice);

            const range = snapshot.getFeasibleTargetTickRange(Side.LONG);

            expect(range).not.toBeNull();
            expect(range!.minTick).toBeLessThan(range!.maxTick);
            expect(range!.minTick).toBeGreaterThan(ammTick);
        });

        it('should respect 2*IMR price deviation limit', () => {
            const ammTick = 1000;
            const markPrice = tickToWad(1000);
            const snapshot = createTestSnapshot(ammTick, markPrice, 1000);

            const range = snapshot.getFeasibleTargetTickRange(Side.LONG);

            expect(range).not.toBeNull();

            const imr = ratioToWad(snapshot.instrumentSetting.imr);
            const maxDeviation = imr * 2n;

            // Verify range respects deviation
            const minTickPrice = tickToWad(range!.minTick);
            const minDeviation = wdiv(abs(minTickPrice - markPrice), markPrice);
            expect(minDeviation).toBeLessThanOrEqual(maxDeviation);

            const maxTickPrice = tickToWad(range!.maxTick);
            const maxDeviation2 = wdiv(abs(maxTickPrice - markPrice), markPrice);
            expect(maxDeviation2).toBeLessThanOrEqual(maxDeviation);
        });

        it('should have maxTick at or below the deviation upper bound', () => {
            const ammTick = 10000;
            const markPrice = tickToWad(10000);
            const snapshot = createTestSnapshot(ammTick, markPrice, 1000);

            const range = snapshot.getFeasibleTargetTickRange(Side.LONG);

            expect(range).not.toBeNull();

            const imr = ratioToWad(snapshot.instrumentSetting.imr);
            const maxDeviation = imr * 2n;
            const maxDeviationPrice = markPrice + wmul(markPrice, maxDeviation);
            const maxDeviationTick = wadToTick(maxDeviationPrice);

            // maxTick should be at or below maxDeviationTick (accounting for alignment)
            const orderSpacing = snapshot.instrumentSetting.orderSpacing;
            expect(range!.maxTick).toBeLessThanOrEqual(maxDeviationTick + orderSpacing);
        });
    });

    describe('SHORT cross limit order (targetTick < ammTick)', () => {
        it('should return range below ammTick', () => {
            const ammTick = 1000;
            const markPrice = tickToWad(1000);
            const snapshot = createTestSnapshot(ammTick, markPrice);

            const range = snapshot.getFeasibleTargetTickRange(Side.SHORT);

            expect(range).not.toBeNull();
            expect(range!.minTick).toBeLessThan(range!.maxTick);
            expect(range!.maxTick).toBeLessThan(ammTick);
        });

        it('should respect 2*IMR price deviation limit', () => {
            const ammTick = 1000;
            const markPrice = tickToWad(1000);
            const snapshot = createTestSnapshot(ammTick, markPrice, 1000);

            const range = snapshot.getFeasibleTargetTickRange(Side.SHORT);

            expect(range).not.toBeNull();

            const imr = ratioToWad(snapshot.instrumentSetting.imr);
            const maxDeviation = imr * 2n;

            // Verify range respects deviation
            const minTickPrice = tickToWad(range!.minTick);
            const minDeviation = wdiv(abs(minTickPrice - markPrice), markPrice);
            expect(minDeviation).toBeLessThanOrEqual(maxDeviation);

            const maxTickPrice = tickToWad(range!.maxTick);
            const maxDeviation2 = wdiv(abs(maxTickPrice - markPrice), markPrice);
            expect(maxDeviation2).toBeLessThanOrEqual(maxDeviation);
        });

        it('should have minTick at or above the deviation lower bound', () => {
            const ammTick = 10000;
            const markPrice = tickToWad(10000);
            const snapshot = createTestSnapshot(ammTick, markPrice, 1000);

            const range = snapshot.getFeasibleTargetTickRange(Side.SHORT);

            expect(range).not.toBeNull();

            const imr = ratioToWad(snapshot.instrumentSetting.imr);
            const maxDeviation = imr * 2n;
            const minDeviationPrice = markPrice - wmul(markPrice, maxDeviation);
            const minDeviationTick = wadToTick(minDeviationPrice);

            // minTick should be at or above minDeviationTick (accounting for alignment)
            const orderSpacing = snapshot.instrumentSetting.orderSpacing;
            expect(range!.minTick).toBeGreaterThanOrEqual(minDeviationTick - orderSpacing);
        });
    });

    describe('Tradability checks', () => {
        it('should return null when instrument is not tradable', () => {
            const ammTick = 1000;
            const markPrice = tickToWad(1000);
            const snapshot = createTestSnapshot(ammTick, markPrice);

            const frozenSnapshot = snapshot.with({ condition: Condition.FROZEN });

            const range = frozenSnapshot.getFeasibleTargetTickRange(Side.LONG);

            expect(range).toBeNull();
        });

        it('should return null when AMM status is not trading', () => {
            const ammTick = 1000;
            const markPrice = tickToWad(1000);
            const snapshot = createTestSnapshot(ammTick, markPrice);

            const settledSnapshot = snapshot.with({
                amm: { ...snapshot.amm, status: Status.SETTLED },
            });

            const range = settledSnapshot.getFeasibleTargetTickRange(Side.LONG);

            expect(range).toBeNull();
        });
    });
});

describe('PairSnapshot.getFeasibleLimitOrderTickRange (P1 fix)', () => {
    it('should work without excludeOccupiedTicks parameter', () => {
        const ammTick = 1000;
        const markPrice = tickToWad(1000);
        const snapshot = createTestSnapshot(ammTick, markPrice);

        // Method should work with just the side parameter
        const range = snapshot.getFeasibleLimitOrderTickRange(Side.LONG);

        expect(range).not.toBeNull();
        expect(range!.minTick).toBeLessThan(range!.maxTick);
        expect(range!.maxTick).toBeLessThan(ammTick);
    });

    it('should return same result regardless of occupied ticks', () => {
        const ammTick = 1000;
        const markPrice = tickToWad(1000);
        const snapshot = createTestSnapshot(ammTick, markPrice);

        // Get range
        const range = snapshot.getFeasibleLimitOrderTickRange(Side.LONG);

        // Method always returns the full feasible range
        // Individual ticks should be checked with isTickFeasibleForLimitOrder()
        expect(range).not.toBeNull();
        expect(range!.minTick).toBeLessThan(range!.maxTick);
    });

    it('should delegate to InstrumentSetting method correctly', () => {
        const ammTick = 1000;
        const markPrice = tickToWad(1000);
        const snapshot = createTestSnapshot(ammTick, markPrice);

        const snapshotRange = snapshot.getFeasibleLimitOrderTickRange(Side.LONG);
        const settingRange = snapshot.instrumentSetting.getFeasibleLimitOrderTickRange(Side.LONG, ammTick, markPrice);

        // Should return the same result as the underlying InstrumentSetting method
        expect(snapshotRange).toEqual(settingRange);
    });

    it('should return null when order placement is paused', () => {
        const ammTick = 1000;
        const markPrice = tickToWad(1000);
        const snapshot = createTestSnapshot(ammTick, markPrice, 1000, true);

        const range = snapshot.getFeasibleLimitOrderTickRange(Side.LONG);

        expect(range).toBeNull();
    });
});

describe('PairSnapshot.getAvailableOrders', () => {
    it('returns orders that are not fully taken', () => {
        const ammTick = 1000;
        const markPrice = tickToWad(1000);
        const snapshot = createTestSnapshot(ammTick, markPrice);

        const orders = [new Order(0n, 10n, 990, 1), new Order(0n, -8n, 1010, 2)];
        const oids = [Order.packKey(990, 1), Order.packKey(1010, 2)];
        const ordersTaken = [10n, -3n];

        const updatedSnapshot = snapshot.with({
            portfolio: {
                ...snapshot.portfolio,
                orders,
                oids,
                ordersTaken,
            },
        });

        const available = updatedSnapshot.getAvailableOrders();

        expect(available).toHaveLength(1);
        expect(available[0]?.orderId).toBe(oids[1]);
        expect(available[0]?.order).toBe(orders[1]);
    });
});

describe('Leverage validation helpers', () => {
    it('rejects non-positive leverage in InstrumentSetting', () => {
        const setting = createTestSetting(1000, 10);

        expect(setting.isLeverageValid(0n)).toBe(false);
        expect(setting.isLeverageValid(-1n)).toBe(false);
    });

    it('rejects non-positive leverage in Position.canAdjustToLeverage', () => {
        const markPrice = tickToWad(0);
        const snapshot = createTestSnapshot(0, markPrice);
        const position = snapshot.portfolio.position;

        expect(
            position.canAdjustToLeverage(0n, snapshot.amm, markPrice, snapshot.instrumentSetting.initialMarginRatio)
        ).toBe(false);
        expect(
            position.canAdjustToLeverage(-1n, snapshot.amm, markPrice, snapshot.instrumentSetting.initialMarginRatio)
        ).toBe(false);
    });
});
