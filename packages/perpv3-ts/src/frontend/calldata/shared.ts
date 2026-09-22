import type { Address } from 'viem';
import { Errors, ErrorCode } from '../../types';

export const requireAddress = (value: Address | undefined, label: string): Address => {
    if (!value) {
        throw Errors.validation(`${label} is required`, ErrorCode.INVALID_PARAM);
    }
    return value;
};

export function assertNever(value: never, label: string): never {
    throw Errors.encoding(`Unsupported ${label}`, { value });
}
