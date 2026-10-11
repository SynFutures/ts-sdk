import { Side, UserSetting } from '../../types';
import { DEFAULT_DEADLINE_SECONDS, WAD } from '../../constants';

describe('UserSetting', () => {
    it('adds an offset to the supplied block timestamp', () => {
        expect(new UserSetting(3600, 50, 3n * WAD).getDeadline(1000)).toBe(4600);
    });
    it.each([0, -1])('uses the default deadline for offset %i', (offset) => {
        expect(new UserSetting(offset, 50, WAD).getDeadline(1000)).toBe(1000 + DEFAULT_DEADLINE_SECONDS);
    });
    it.each([0n, -WAD])('rejects nonpositive leverage %s', (leverage) => {
        expect(() => new UserSetting(600, 50, leverage)).toThrow('Leverage must be positive');
    });
    it('accepts the maximum leverage and rejects a larger target', () => {
        const settings = new UserSetting(600, 50, 3n * WAD);
        expect(() => settings.validateLeverage(3n * WAD)).not.toThrow();
        expect(() => settings.validateLeverage(2n * WAD)).toThrow('Leverage exceeds maximum');
    });
    it('widens trade limits in the direction of the trade', () => {
        const exact = new UserSetting(600, 0, WAD);
        const tolerant = new UserSetting(600, 100, WAD);
        expect(tolerant.getTradeLimitTick(WAD, Side.LONG)).toBeGreaterThan(exact.getTradeLimitTick(WAD, Side.LONG));
        expect(tolerant.getTradeLimitTick(WAD, Side.SHORT)).toBeLessThan(exact.getTradeLimitTick(WAD, Side.SHORT));
    });
});
