import { beforeAll, describe, jest, test } from '@jest/globals';
import { createPublicClient, http } from 'viem';
import { fetchOnchainContext } from '../queries';
import type { ApiConfig, RpcConfig } from '../queries/config';
import {
    buildBaseUserSetting,
    createTestApiSigner,
    loadScenarios,
    resolveChain,
    resolveObserverAddress,
    resolveRpcUrl,
} from './apiRpcParity/fixtures';
import { executeScenario } from './apiRpcParity/runners';
import type { PreparedScenario, Scenario } from './apiRpcParity/types';

jest.setTimeout(120_000);

const parityFixtureEnv = process.env.SIMULATE_PARITY_FIXTURE;
const scenarios: Scenario[] = parityFixtureEnv ? loadScenarios(parityFixtureEnv) : [];
const prepared: PreparedScenario[] = scenarios.map((scenario) => ({ scenario }));

beforeAll(async () => {
    for (const entry of prepared) {
        const { scenario } = entry;
        const rpcUrl = resolveRpcUrl(scenario);
        if (!rpcUrl) {
            entry.skipReason = `Missing RPC URL (${scenario.rpcUrlEnv ?? ''})`;
            continue;
        }

        const chain = resolveChain(scenario.chainId);
        if (!chain) {
            entry.skipReason = `Unknown chain ID: ${scenario.chainId}`;
            continue;
        }

        const observerAddress = scenario.observerAddress ?? resolveObserverAddress(scenario.chainId);
        if (!observerAddress) {
            entry.skipReason = `Observer address not found for chain ${scenario.chainId}`;
            continue;
        }

        const apiConfig: ApiConfig = {
            chainId: scenario.chainId,
            signer: createTestApiSigner(),
        };

        const apiKeyEnv = scenario.apiKeyEnv ?? 'SYNF_PARITY_API_KEY';
        const apiKey = process.env[apiKeyEnv];
        if (apiKey) {
            const passphrase = process.env.SYNF_PARITY_PASSPHRASE;
            const secretKey = process.env.SYNF_PARITY_SECRET_KEY;
            if (passphrase && secretKey) {
                apiConfig.authInfo = { apiKey, passphrase, secretKey };
            }
        }

        entry.apiConfig = apiConfig;
        entry.instrumentAddress = scenario.instrumentAddress;
        entry.expiry = scenario.expiry;
        entry.traderAddress = scenario.traderAddress;
        entry.userSetting = buildBaseUserSetting(scenario.userSetting);

        try {
            entry.onchainContext = await fetchOnchainContext(scenario.instrumentAddress, scenario.expiry, apiConfig);
        } catch (error) {
            entry.skipReason = `fetchOnchainContext failed: ${(error as Error).message}`;
            continue;
        }

        try {
            const portfolioCtx = await fetchOnchainContext(
                scenario.instrumentAddress,
                scenario.expiry,
                apiConfig,
                scenario.traderAddress
            );
            if (portfolioCtx.portfolio) {
                entry.portfolioContext = {
                    instrumentSetting: portfolioCtx.instrumentSetting,
                    portfolio: portfolioCtx.portfolio,
                    amm: portfolioCtx.amm,
                    markPrice: portfolioCtx.priceData.markPrice,
                    blockInfo: portfolioCtx.blockInfo,
                };
            } else {
                entry.portfolioContext = undefined;
            }
        } catch {
            entry.portfolioContext = undefined;
        }

        if (!entry.portfolioContext?.portfolio?.position) {
            entry.skipReason = 'Missing portfolio.position for trader in API context';
            continue;
        }

        const publicClient = createPublicClient({
            chain,
            transport: http(rpcUrl),
        });

        const rpcConfig: RpcConfig = {
            chainId: scenario.chainId,
            publicClient,
            observerAddress,
        };

        entry.publicClient = publicClient;
        entry.rpcConfig = rpcConfig;
    }
});

if (!parityFixtureEnv || scenarios.length === 0) {
    describe('simulate api/rpc parity', () => {
        test.skip('SIMULATE_PARITY_FIXTURE not provided, skipping parity tests', () => {});
    });
} else {
    describe('simulate api/rpc parity', () => {
        for (const entry of prepared) {
            const displayName =
                entry.scenario.name ??
                `${entry.scenario.type} - ${entry.scenario.instrumentAddress} @ ${entry.scenario.expiry}`;

            if (entry.skipReason) {
                test.skip(displayName, () => {
                    throw new Error(entry.skipReason!);
                });
                continue;
            }

            const testFn = async () => {
                if (!entry.apiConfig || !entry.rpcConfig || !entry.onchainContext) {
                    throw new Error('Test initialization failed: required context missing');
                }

                await executeScenario(entry);
            };

            test(displayName, testFn);
        }
    });
}
