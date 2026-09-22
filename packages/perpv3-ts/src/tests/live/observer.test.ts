import { describe, expect, test } from '@jest/globals';
import type { Chain } from 'viem';
import { createPublicClient, http, isAddress } from 'viem';
import { resolveChain } from './apiRpcParity/fixtures';
import { getPerpInfo } from '../../info';
import { PERP_EXPIRY } from '../../types';
import type { RpcConfig } from '../../queries/config';
import { fetchLiquidityDetails, fetchOnchainContext, inquireByBaseSize, inquireByTick } from '../../queries/rpc';

describe('live observer calls', () => {
    test('fetchOnchainContext and inquiry methods succeed', async () => {
        const rpcUrl = process.env.PERPV3_RPC_URL;
        const chainId = Number(process.env.PERPV3_CHAIN_ID);
        const instrumentAddress = process.env.PERPV3_INSTRUMENT;
        const expiry = Number(process.env.PERPV3_EXPIRY ?? PERP_EXPIRY);
        const chain: Chain | undefined = resolveChain(chainId);
        if (!rpcUrl || !chain || !instrumentAddress || !isAddress(instrumentAddress)) {
            throw new Error('Set PERPV3_RPC_URL, PERPV3_CHAIN_ID and PERPV3_INSTRUMENT for live observer tests.');
        }
        if (!Number.isSafeInteger(expiry) || expiry < 0 || expiry > PERP_EXPIRY) {
            throw new Error('PERPV3_EXPIRY must be a uint32 expiry.');
        }
        const observer = process.env.PERPV3_OBSERVER ?? getPerpInfo(chainId).observer;
        if (!isAddress(observer)) throw new Error('PERPV3_OBSERVER must be an address.');
        const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
        const rpcConfig: RpcConfig = { chainId, publicClient, observerAddress: observer };
        const context = await fetchOnchainContext(instrumentAddress, expiry, rpcConfig);
        expect(Number.isFinite(context.amm.tick)).toBe(true);

        const tickSpacing = context.instrumentSetting.orderSpacing;
        expect(tickSpacing).toBeGreaterThan(0);

        const candidateTicks = [
            context.instrumentSetting.alignTickStrictlyBelow(context.amm.tick),
            context.instrumentSetting.alignTickStrictlyAbove(context.amm.tick),
        ];

        let tickQuote: Awaited<ReturnType<typeof inquireByTick>> | undefined;
        let lastError: unknown;
        for (const candidateTick of candidateTicks) {
            try {
                tickQuote = await inquireByTick(instrumentAddress, expiry, candidateTick, rpcConfig);
                break;
            } catch (error) {
                lastError = error;
            }
        }
        if (!tickQuote) {
            throw lastError ?? new Error('inquireByTick failed for all candidate ticks');
        }
        expect(tickQuote.quotation).toBeDefined();

        const baseQuote = await inquireByBaseSize(instrumentAddress, expiry, 1n, rpcConfig);
        expect(baseQuote).toBeDefined();

        const tickDelta = tickSpacing;
        const liquidity = await fetchLiquidityDetails(instrumentAddress, expiry, tickDelta, rpcConfig);
        expect(liquidity.amm.liquidity).toBeGreaterThanOrEqual(0n);
    });
});
