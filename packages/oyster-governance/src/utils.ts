import { BigNumber, constants } from 'ethers';
import type { CallOverrides } from 'ethers';
import type { TxOptions } from './host';

export function toPopulatedTxOverrides(options?: TxOptions): CallOverrides {
    const overrides = { ...options };
    if (overrides.signer && overrides.from === undefined) overrides.from = overrides.signer.getAddress();
    delete overrides.signer;
    for (const key of [
        'blockTag',
        'enableGasPrice',
        'disableGasLimit',
        'gasLimitMultiple',
        'gasPriceMultiple',
    ] as const) {
        delete overrides[key];
    }
    return overrides;
}

export function wdiv(x: BigNumber, y: BigNumber): BigNumber {
    return x.mul(constants.WeiPerEther).add(y.div(2)).div(y);
}

export function wmul(x: BigNumber, y: BigNumber): BigNumber {
    return x.mul(y).add(constants.WeiPerEther.div(2)).div(constants.WeiPerEther);
}

export function min(x: BigNumber, y: BigNumber): BigNumber {
    return x.gt(y) ? y : x;
}

export function max(x: BigNumber, y: BigNumber): BigNumber {
    return x.gt(y) ? x : y;
}
