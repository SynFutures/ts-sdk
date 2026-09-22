import onchainFixture from '../fixtures/simulation-context.json';
import { parseOnchainContext } from '../helpers/snapshotFixture';
import { WAD } from '../../constants';
import { tickToSqrtX96 } from '../../math';
import { simulateImpermanentLoss } from '../../frontend';

const fixtureSnapshot = parseOnchainContext(onchainFixture.context);

describe('simulateImpermanentLoss', () => {
    test('returns points over aligned range and contains entry tick', () => {
        // Make entry sqrt price match the entry tick boundary so we can assert ~0 IL at entry tick.
        const entryAligned = fixtureSnapshot.with({
            amm: {
                ...fixtureSnapshot.amm,
                sqrtPX96: tickToSqrtX96(fixtureSnapshot.amm.tick),
            },
        });

        const results = simulateImpermanentLoss(entryAligned, {
            alphaWadLower: WAD,
            alphaWadUpper: WAD,
        });

        expect(results.length).toBeGreaterThan(0);

        const step = entryAligned.instrumentSetting.orderSpacing;
        for (let i = 1; i < results.length; i += 1) {
            expect(results[i]!.tick - results[i - 1]!.tick).toBe(step);
        }

        const entryPoint = results.find((p) => p.tick === entryAligned.amm.tick);
        expect(entryPoint).toBeDefined();
        expect(Math.abs(entryPoint!.impermanentLoss)).toBeLessThan(1e-8);
    });
});
