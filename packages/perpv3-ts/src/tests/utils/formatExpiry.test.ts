import { PERP_EXPIRY } from '../../types';
import { formatExpiry } from '../../utils/format';

describe('sdk utils', () => {
    it('formatExpiry()', () => {
        expect(formatExpiry(PERP_EXPIRY)).toBe('PERP');
        expect(formatExpiry(1687507200)).toBe('20230623');
        expect(formatExpiry(1689926400)).toBe('20230721');
    });
});

