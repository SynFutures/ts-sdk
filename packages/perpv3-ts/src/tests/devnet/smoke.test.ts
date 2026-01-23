import { createPublicClient, http, type Address } from 'viem';
import { foundry } from 'viem/chains';
import { PERP_EXPIRY, fetchOnchainContext, type RpcConfig } from '../../index';
import { loadDevnetManifest } from './devnet';

describe('devnet smoke', () => {
    it('fetches onchain context via Observer', async () => {
        const manifest = loadDevnetManifest();
        const instrument = manifest.defaults.instrument;

        const chain = manifest.chainId === foundry.id ? foundry : { ...foundry, id: manifest.chainId };
        const publicClient = createPublicClient({
            chain,
            transport: http(manifest.rpcUrl),
            batch: { multicall: { deployless: true } },
        });

        const rpcConfig: RpcConfig = {
            chainId: manifest.chainId,
            publicClient,
            observerAddress: manifest.contracts.observer,
        };

        const snapshot = await fetchOnchainContext(instrument.address, instrument.expiry, rpcConfig);

        expect(snapshot.expiry).toBe(PERP_EXPIRY);
        expect(snapshot.instrumentSymbol).toBe(`${instrument.baseSymbol}-${instrument.quoteSymbol}-${instrument.marketType}`);
        expect(snapshot.amm.liquidity).toBeGreaterThan(0n);
    });
});
