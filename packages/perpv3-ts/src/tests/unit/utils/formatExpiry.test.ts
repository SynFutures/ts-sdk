import { PERP_EXPIRY } from '../../../types';
import { formatExpiryLabel } from '../../../utils/expiry';
import { formatExpiry } from '../../../utils/format';

describe('sdk utils', () => {
    it('formatExpiry()', () => {
        expect(formatExpiry(PERP_EXPIRY)).toBe('PERP');
        expect(formatExpiry(0)).toBe('19700101');
        expect(formatExpiry(951782400)).toBe('20000229');
        expect(formatExpiryLabel(951782400, true)).toBe('000229');
        expect(() => formatExpiry(NaN)).toThrow(RangeError);
        expect(formatExpiry(1687507200)).toBe('20230623');
        expect(formatExpiry(1689926400)).toBe('20230721');
    });
});
