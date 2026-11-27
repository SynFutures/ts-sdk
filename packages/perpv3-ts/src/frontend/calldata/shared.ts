import type { TransactionRoute } from './types';
import type { Address } from 'viem';
import { Errors, ErrorCode } from '../../types';

export const requireAddress = (value: Address | undefined, label: string): Address => {
    if (!value) {
        throw Errors.validation(`${label} is required`, ErrorCode.INVALID_PARAM);
    }
    return value;
};

export function isDelegated(route?: TransactionRoute): route is Extract<TransactionRoute, { route: 'for' | 'router' }> {
    if (!route) return false;
    if (route.route === 'router') {
        requireAddress(route.routerAddress, 'routerAddress');
        requireAddress(route.subAccountAddress, 'subAccountAddress');
    } else if (route.routerAddress || route.subAccountAddress) {
        throw Errors.encoding('Router addresses require the router route');
    }
    if (route.route === 'for' || route.route === 'router') {
        requireAddress(route.traderAddress, 'traderAddress');
        return true;
    }
    if (route.route !== 'direct') throw Errors.encoding('Unknown transaction route');
    return false;
}
