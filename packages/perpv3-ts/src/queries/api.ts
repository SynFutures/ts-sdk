import type { Address } from 'viem';
import { MarketModule } from '../apis/market';
import { Errors, type PairSnapshot, type Quotation } from '../types';
import { HttpClient } from '../utils/http';
import type { ApiConfig } from './config';

export function createQueryMarketModule(config: ApiConfig): MarketModule {
    if (!config.signer) {
        throw Errors.apiRequestFailed('Signer is required for API query helpers');
    }
    return new MarketModule(new HttpClient(config), config.signer);
}

// The aggregate market endpoint combines independently updated cache and quotation data.
// Use one Observer call so the snapshot height applies to all simulation inputs.
export async function fetchOnchainContext(
    instrumentAddress: Address,
    expiry: number,
    config: ApiConfig,
    traderAddress?: Address,
    signedSize?: bigint
): Promise<PairSnapshot> {
    const snapshot = await createQueryMarketModule(config).fetchMarketOnChainContextQuery({
        chainId: config.chainId,
        instrument: instrumentAddress,
        expiry,
        userAddress: traderAddress,
        signedSize: signedSize?.toString(),
    });
    if (!snapshot) throw Errors.apiRequestFailed('Missing Observer context');
    return snapshot;
}

export async function inquireByTick(
    instrumentAddress: Address,
    expiry: number,
    tick: number,
    config: ApiConfig
): Promise<{ size: bigint; quotation: Quotation }> {
    if (!config.signer) {
        throw Errors.apiRequestFailed('Signer is required for inquireByTick');
    }

    const market = createQueryMarketModule(config);
    const result = await market.fetchFuturesInstrumentInquireByTick({
        chainId: config.chainId,
        instrument: instrumentAddress,
        expiry,
        tick,
    });

    if (!result || result.size === undefined) {
        throw Errors.missingQuotation();
    }

    return {
        size: result.size,
        quotation: {
            benchmark: result.benchmark,
            sqrtFairPX96: result.sqrtFairPX96,
            tick: result.tick,
            mark: result.mark,
            entryNotional: result.entryNotional,
            fee: result.fee,
            minAmount: result.minAmount,
            sqrtPostFairPX96: result.sqrtPostFairPX96,
            postTick: result.postTick,
        },
    };
}
