import { CHAIN_ID } from '../legacy-host-types/core/constant';
import { type TokenInfo } from '../legacy-host-types/core/type';

export const STAKE_ADDRESSES: { [chainId: number]: string } = {
    [CHAIN_ID.ETHEREUM]: '0x93432aFf5A44865Bd2cfC028C147AE1D0094cf05',
};

export const S_TOKENINFO: { [chainId: number]: TokenInfo } = {
    [CHAIN_ID.BASE]: {
        name: 'SynFutures',
        address: '0x2C24497D4086490e7EaD87CC12597fb50c2E6eD6',
        symbol: 'S',
        decimals: 18,
    },
    [CHAIN_ID.ETHEREUM]: {
        name: 'SynFutures',
        address: '0x6e15A54B5EcAc17e58daDedDbe8506a7560252F9',
        symbol: 'S',
        decimals: 18,
    },
};
