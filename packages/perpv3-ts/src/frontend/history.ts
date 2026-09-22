import { HISTORY_RANGE } from '../apis/constants';

const SECONDS_PER_DAY = 86_400;

function subtractUtcMonths(epochSeconds: number, months: number): number {
    const date = new Date(epochSeconds * 1_000);
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - months);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
    return Math.floor(date.getTime() / 1_000);
}

export function getStartEndTimeByRangeType(rangeType?: HISTORY_RANGE): { startTime: number; endTime: number } {
    const endTime = Math.floor(Date.now() / 1_000);

    if (rangeType === HISTORY_RANGE.D_1) {
        const startTime = endTime - SECONDS_PER_DAY;
        return { startTime, endTime };
    } else if (rangeType === HISTORY_RANGE.D_7) {
        const startTime = endTime - 7 * SECONDS_PER_DAY;
        return { startTime, endTime };
    } else if (rangeType === HISTORY_RANGE.M_1) {
        const startTime = subtractUtcMonths(endTime, 1);
        return { startTime, endTime };
    } else if (rangeType === HISTORY_RANGE.M_3) {
        const startTime = subtractUtcMonths(endTime, 3);
        return { startTime, endTime };
    }

    const startTime = 0;
    return { startTime, endTime };
}
