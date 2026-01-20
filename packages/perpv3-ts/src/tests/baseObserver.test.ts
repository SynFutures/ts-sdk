import { describe, expect, jest, test } from '@jest/globals';
import type { Address } from 'viem';
import { createPublicClient, http } from 'viem';
import { base as baseChain } from 'viem/chains';
import { getPerpInfo } from '../info';
import type { RpcConfig } from '../queries/config';
import { fetchLiquidityDetails, fetchOnchainContext, inquireByBaseSize, inquireByTick } from '../queries/rpc';

const CHAIN_ID = 8453;
const rpcUrl = process.env.BASE_RPC;
const instrumentAddress = process.env.BASE_INSTRUMENT as Address | undefined;
const expiryRaw = process.env.BASE_EXPIRY;
const expiry = expiryRaw ? Number(expiryRaw) : undefined;

jest.setTimeout(120_000);

describe('Base observer calls', () => {
    if (!rpcUrl) {
        test.skip('BASE_RPC is not set, skipping Base observer test', () => {});
        return;
    }
    if (!instrumentAddress) {
        test.skip('BASE_INSTRUMENT is not set, skipping Base observer test', () => {});
        return;
    }
    if (!expiryRaw || !Number.isFinite(expiry)) {
        test.skip('BASE_EXPIRY is not set or invalid, skipping Base observer test', () => {});
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

        const tick = context.amm.tick;
        const tickQuote = await inquireByTick(instrumentAddress, expiry, tick, rpcConfig);
        expect(tickQuote.quotation).toBeDefined();

        const baseQuote = await inquireByBaseSize(instrumentAddress, expiry, 1n, rpcConfig);
        expect(baseQuote).toBeDefined();

        const tickDelta = Math.max(context.instrumentSetting.orderSpacing, 1);
        const liquidity = await fetchLiquidityDetails(instrumentAddress, expiry, tickDelta, rpcConfig);
        expect(liquidity.amm.liquidity).toBeGreaterThanOrEqual(0n);
    });
});
