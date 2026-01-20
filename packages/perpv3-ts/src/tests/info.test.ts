import { describe, expect, test } from '@jest/globals';
import { getPerpInfo } from '../info';

describe('getPerpInfo', () => {
    test('returns Base observer address', () => {
        const info = getPerpInfo(8453);
        expect(info.observer).toBe('0x16Ae357dFe705D1B9862132Dca02e07150876e3E');
    });
});
