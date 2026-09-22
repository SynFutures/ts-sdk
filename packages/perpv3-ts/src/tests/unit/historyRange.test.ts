import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { HISTORY_RANGE } from '../../apis/constants';
import { getStartEndTimeByRangeType } from '../../frontend/history';

describe('history ranges', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-07-10T12:00:00.000Z'));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('uses the current epoch second as endTime', () => {
        expect(getStartEndTimeByRangeType().endTime).toBe(1_783_684_800);
    });

    test('uses exact UTC day ranges', () => {
        const oneDay = getStartEndTimeByRangeType(HISTORY_RANGE.D_1);
        const sevenDays = getStartEndTimeByRangeType(HISTORY_RANGE.D_7);
        expect(oneDay.endTime - oneDay.startTime).toBe(86_400);
        expect(sevenDays.endTime - sevenDays.startTime).toBe(7 * 86_400);
    });
});
