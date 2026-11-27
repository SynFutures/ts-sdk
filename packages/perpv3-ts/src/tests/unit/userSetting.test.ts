import { Side, UserSetting, ValidationError } from '../../types';
import { DEFAULT_DEADLINE_SECONDS, MIN_TICK, WAD } from '../../constants';

describe('UserSetting', () => {
    const options = { deadlineSeconds: 60, slippageBps: 50, leverageWad: WAD };
    it.each([
        { deadlineSeconds: 1.5 },
        { deadlineSeconds: -1.5 },
        { deadlineSeconds: 2 ** 32 },
        { slippageBps: 1.5 },
        { slippageBps: -1 },
        { slippageBps: 10_001 },
        { markPriceBufferInBps: 1.5 },
        { markPriceBufferInBps: -1 },
    ])('rejects invalid settings at construction: %j', (invalid) => {
        expect(() => new UserSetting({ ...options, ...invalid })).toThrow(ValidationError);
    });
    it('checks the absolute deadline against the encoded uint32 boundary', () => {
        const settings = new UserSetting(options);
        const last = 0xffff_ffff;
        expect(settings.getDeadline(last - 60)).toBe(last);
        for (const timestamp of [1.5, -1, last - 59])
            expect(() => settings.getDeadline(timestamp)).toThrow(ValidationError);
    });
    it('uses the minimum trade tick for a 100% short-side tolerance', () => {
        const settings = new UserSetting({ ...options, slippageBps: 10_000 });
        expect(settings.getTradeLimitTick(WAD, Side.SHORT)).toBe(MIN_TICK);
    });
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
