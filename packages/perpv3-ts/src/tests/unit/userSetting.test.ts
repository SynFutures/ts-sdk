import { Side, UserSetting } from '../../types';
import { DEFAULT_DEADLINE_SECONDS, WAD } from '../../constants';

describe('UserSetting', () => {
    it('adds an offset to the supplied block timestamp', () => {
        expect(
            new UserSetting({ deadlineSeconds: 3600, slippageBps: 50, leverageWad: 3n * WAD }).getDeadline(1000)
        ).toBe(4600);
    });
    it.each([0, -1])('uses the default deadline for offset %i', (offset) => {
        expect(new UserSetting({ deadlineSeconds: offset, slippageBps: 50, leverageWad: WAD }).getDeadline(1000)).toBe(
            1000 + DEFAULT_DEADLINE_SECONDS
        );
    });
    it.each([0n, -WAD])('rejects nonpositive leverage %s', (leverage) => {
        expect(() => new UserSetting({ deadlineSeconds: 600, slippageBps: 50, leverageWad: leverage })).toThrow(
            'Leverage must be positive'
        );
    });
    it('accepts the maximum leverage and rejects a larger target', () => {
        const settings = new UserSetting({ deadlineSeconds: 600, slippageBps: 50, leverageWad: 3n * WAD });
        expect(() => settings.validateLeverage(3n * WAD)).not.toThrow();
        expect(() => settings.validateLeverage(2n * WAD)).toThrow('Leverage exceeds maximum');
    });
    it('widens trade limits in the direction of the trade', () => {
        const exact = new UserSetting({ deadlineSeconds: 600, slippageBps: 0, leverageWad: WAD });
        const tolerant = new UserSetting({ deadlineSeconds: 600, slippageBps: 100, leverageWad: WAD });
        expect(tolerant.getTradeLimitTick(WAD, Side.LONG)).toBeGreaterThan(exact.getTradeLimitTick(WAD, Side.LONG));
        expect(tolerant.getTradeLimitTick(WAD, Side.SHORT)).toBeLessThan(exact.getTradeLimitTick(WAD, Side.SHORT));
    });
});
