import { describe, expect, jest, test } from '@jest/globals';
import type { Address } from 'viem';
import { createPublicClient, http } from 'viem';
import { base as baseChain } from 'viem/chains';
import { getPerpInfo } from '../info';
import { PERP_EXPIRY } from '../types';
import type { RpcConfig } from '../queries/config';
import { fetchLiquidityDetails, fetchOnchainContext, inquireByBaseSize, inquireByTick } from '../queries/rpc';

const CHAIN_ID = 8453;
const DEFAULT_RPC_URL = 'https://base-mainnet.public.blastapi.io';
const DEFAULT_INSTRUMENT = '0xec6c44e704eb1932ec5fe1e4aba58db6fee71460' as Address;

const rpcUrl = process.env.BASE_RPC ?? DEFAULT_RPC_URL;
const instrumentAddress = (process.env.BASE_INSTRUMENT ?? DEFAULT_INSTRUMENT) as Address;
const expiryRaw = process.env.BASE_EXPIRY;
const expiry = expiryRaw ? Number(expiryRaw) : PERP_EXPIRY;

jest.setTimeout(120_000);

describe('Base observer calls', () => {
    if (expiryRaw && !Number.isFinite(expiry)) {
        test.skip('BASE_EXPIRY is set but invalid, skipping Base observer test', () => {});
        return;
    }

    const publicClient = createPublicClient({
        chain: baseChain,
        transport: http(rpcUrl),
    });

    const rpcConfig: RpcConfig = {
        chainId: CHAIN_ID,
        publicClient,
        observerAddress: getPerpInfo(CHAIN_ID).observer,
    };

    test('fetchOnchainContext and inquiry methods succeed', async () => {
        const context = await fetchOnchainContext(instrumentAddress, expiry, rpcConfig);
        expect(context.amm.tick).toBeGreaterThanOrEqual(0);

        const tickSpacing = Math.max(context.instrumentSetting.orderSpacing, 1);
        const alignedTick = Math.floor(context.amm.tick / tickSpacing) * tickSpacing;
        const tickQuote = await inquireByTick(instrumentAddress, expiry, alignedTick, rpcConfig);
        expect(tickQuote.quotation).toBeDefined();

        const baseQuote = await inquireByBaseSize(instrumentAddress, expiry, 1n, rpcConfig);
        expect(baseQuote).toBeDefined();

        const tickDelta = tickSpacing;
        const liquidity = await fetchLiquidityDetails(instrumentAddress, expiry, tickDelta, rpcConfig);
        expect(liquidity.amm.liquidity).toBeGreaterThanOrEqual(0n);
    });
});
