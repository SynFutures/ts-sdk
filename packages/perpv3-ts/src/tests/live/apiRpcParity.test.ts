import { describe, test } from '@jest/globals';
import { createPublicClient, http } from 'viem';
import { fetchOnchainContext } from '../../queries';
import type { ApiConfig, RpcConfig } from '../../queries/config';
import {
    buildBaseUserSetting,
    marketApiSigner,
    loadScenarios,
    resolveChain,
    resolveObserverAddress,
    resolveRpcUrl,
    scenarioSignedSize,
} from './apiRpcParity/fixtures';
import { executeScenario } from './apiRpcParity/runners';
import type { PreparedScenario, Scenario } from './apiRpcParity/types';

async function prepareScenario(scenario: Scenario): Promise<PreparedScenario> {
    const rpcUrl = resolveRpcUrl(scenario);
    if (!rpcUrl) {
        throw new Error(`Missing RPC URL (${scenario.rpcUrlEnv ?? ''})`);
    }

    const chain = resolveChain(scenario.chainId);
    if (!chain) {
        throw new Error(`Unknown chain ID: ${scenario.chainId}`);
    }

    const observerAddress = scenario.observerAddress ?? resolveObserverAddress(scenario.chainId);
    if (!observerAddress) {
        throw new Error(`Observer address not found for chain ${scenario.chainId}`);
    }

    const apiConfig: ApiConfig = {
        chainId: scenario.chainId,
        signer: marketApiSigner(scenario.apiKeyEnv),
    };

    const userSetting = buildBaseUserSetting(scenario.userSetting);
    const onchainContext = await fetchOnchainContext(
        scenario.instrumentAddress,
        scenario.expiry,
        apiConfig,
        scenario.traderAddress,
        scenarioSignedSize(scenario)
    );
    const publicClient = createPublicClient({
        chain,
        transport: http(rpcUrl),
    });

    if ((await publicClient.getChainId()) !== scenario.chainId) throw new Error('RPC chain ID differs from scenario');
    const rpcConfig: RpcConfig = {
        chainId: scenario.chainId,
        publicClient,
        observer: { address: observerAddress, version: 'current' },
    };

    return { scenario, userSetting, onchainContext, rpcConfig };
}

const fixture = process.env.SIMULATE_PARITY_FIXTURE;
const scenarios = fixture ? loadScenarios(fixture) : [];
describe('live API/RPC simulation parity', () => {
    if (scenarios.length === 0) {
        test('requires explicit parity scenarios', () => {
            throw new Error('Set SIMULATE_PARITY_FIXTURE to a non-empty scenario JSON file.');
        });
    }
    for (const scenario of scenarios) {
        test(scenario.name ?? `${scenario.type} at ${scenario.instrumentAddress}`, async () => {
            await executeScenario(await prepareScenario(scenario));
        });
    }
});
