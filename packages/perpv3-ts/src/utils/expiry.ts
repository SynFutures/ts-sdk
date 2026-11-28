import { PERP_EXPIRY } from '../types/contract';

export function formatExpiryLabel(expiry: number, shortYear: boolean): string {
    if (expiry === PERP_EXPIRY) return 'PERP';
    const date = new Date(expiry * 1000);
    if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid time value');
    const year = date.getUTCFullYear();
    const calendarYear = year > 0 ? year : 1 - year;
    const yyyy = String(calendarYear).padStart(4, '0');
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return (shortYear ? yyyy.slice(-2) : yyyy) + mm + dd;
}
