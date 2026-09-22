import { generateBatchOrderRatios, BatchOrderSizeDistribution } from '../../../actions/scaledLimitOrder';

describe('generateBatchOrderRatios', () => {
    it('satisfies invariants for supported order counts and distributions', () => {
        const distributions = [
            BatchOrderSizeDistribution.FLAT,
            BatchOrderSizeDistribution.UPPER,
            BatchOrderSizeDistribution.LOWER,
            BatchOrderSizeDistribution.RANDOM,
        ];

        for (const distribution of distributions) {
            for (let orderCount = 1; orderCount <= 9; orderCount++) {
                const ratios = generateBatchOrderRatios(distribution, orderCount);
                expect(ratios).toHaveLength(orderCount);
                expect(ratios.reduce((a, b) => a + b, 0)).toBe(10_000);
                ratios.forEach((ratio) => {
                    expect(Number.isInteger(ratio)).toBe(true);
                    expect(ratio).toBeGreaterThanOrEqual(0);
                });
            }
        }
    });

    it('generates flat ratios', () => {
        const ratios = generateBatchOrderRatios(BatchOrderSizeDistribution.FLAT, 3);
        expect(ratios).toEqual([3333, 3333, 3334]);
        expect(ratios.reduce((a, b) => a + b, 0)).toBe(10_000);
    });

    it('generates upper weighted ratios', () => {
        const ratios = generateBatchOrderRatios(BatchOrderSizeDistribution.UPPER, 4);
        for (let i = 1; i < ratios.length; i++) {
            expect(ratios[i]).toBeGreaterThanOrEqual(ratios[i - 1]);
        }
        expect(ratios.reduce((a, b) => a + b, 0)).toBe(10_000);
    });

    it('generates lower weighted ratios', () => {
        const ratios = generateBatchOrderRatios(BatchOrderSizeDistribution.LOWER, 4);
        for (let i = 1; i < ratios.length; i++) {
            expect(ratios[i]).toBeLessThanOrEqual(ratios[i - 1]);
        }
        expect(ratios.reduce((a, b) => a + b, 0)).toBe(10_000);
    });

    it('generates random ratios within bounds', () => {
        const ratios = generateBatchOrderRatios(BatchOrderSizeDistribution.RANDOM, 5);
        const total = ratios.reduce((a, b) => a + b, 0);
        expect(total).toBe(10_000);
        const average = 10_000 / 5;
        ratios.forEach((ratio) => {
            expect(ratio).toBeGreaterThanOrEqual(Math.ceil(average * 0.95));
            expect(ratio).toBeLessThanOrEqual(Math.floor(average * 1.05));
        });
    });

    it('throws when orderCount exceeds batchPlace limit', () => {
        expect(() => generateBatchOrderRatios(BatchOrderSizeDistribution.RANDOM, 10)).toThrow(
            'orderCount must be between 1 and 9'
        );
    });
});
