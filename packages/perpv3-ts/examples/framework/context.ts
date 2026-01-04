import type { Address } from 'viem';
import { createWalletClient, http } from 'viem';
import { getAccount } from '@derivation-tech/viem-kit';
import { PerpClient, getPerpInfo, PERP_EXPIRY } from '@synfutures/perpv3-ts';
import type { DemoContext } from './types';
import { DefaultUserSetting, findInstrumentBySymbol, prepare } from '../utils';

/**
 * Create a demo context with all necessary setup.
 * This centralizes the boilerplate code that was repeated in each demo.
 */
export async function createDemoContext(
    chainName: string,
    signerId: string,
    instrumentSymbol: string
): Promise<DemoContext> {
    const { kit, publicClient, instrumentSettingMap } = await prepare(chainName);
    const { instrumentAddress } = findInstrumentBySymbol(instrumentSymbol, instrumentSettingMap);

    const account = await getAccount(kit, signerId);
    const walletClient = createWalletClient({
        account,
        chain: kit.chain,
        transport: http(kit.chain.rpcUrls.default.http[0]),
    });
    const walletAddress = walletClient.account!.address as Address;

    // Get perpInfo from chainId when needed
    const perpInfo = getPerpInfo(kit.chain.id);

    const rpcConfig = {
        chainId: kit.chain.id,
        publicClient,
        observerAddress: perpInfo.observer,
    };

    // Create PerpClient
    const perpClient = new PerpClient(rpcConfig, DefaultUserSetting, instrumentAddress, PERP_EXPIRY);

    return {
        chainName,
        signerId,
        kit,
        publicClient,
        walletClient,
        walletAddress,
        perpClient,
    };
}

/**
 * Refresh the demo context.
 * Useful when state may have changed after a transaction.
 * Note: PerpClient is immutable, so we don't need to refresh it.
 */
export async function refreshDemoContext(context: DemoContext): Promise<DemoContext> {
    // PerpClient is immutable and doesn't need refreshing
    // Snapshots are fetched fresh via client.getSnapshot() when needed
    return context;
}
