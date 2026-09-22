import type { ReadOptions } from '../../../queries/config';
import fs from 'fs';
import path from 'path';
import type { Address, Chain } from 'viem';
import * as chains from 'viem/chains';
import type { ApiSigner } from '../../../apis/interfaces';
import { WAD } from '../../../constants';
import { getPerpInfo } from '../../../info';
import { UserSetting } from '../../../types';
import { isRecord } from '../../helpers/record';
import type { BaseScenario, RawUserSetting, Scenario, ScenarioType } from './types';

export function buildBaseUserSetting(raw: RawUserSetting): UserSetting {
    return new UserSetting(raw.deadline, raw.slippage, 3n * WAD, raw.markPriceBufferInBps ?? 0, raw.strictMode);
}

export function createTestApiSigner(): ApiSigner {
    return {
        sign: ({ ts }) => ({
            'X-Api-Nonce': 'test',
            'X-Api-Sign': 'test',
            'X-Api-Ts': ts,
        }),
    };
}

export function resolveChain(chainId: number): Chain | undefined {
    return Object.values(chains).find((chain) => chain.id === chainId);
}

export function resolveObserverAddress(chainId: number): Address | undefined {
    try {
        const perpInfo = getPerpInfo(chainId);
        return perpInfo.observer;
    } catch {
        return undefined;
    }
}

export function resolveRpcUrl(scenario: BaseScenario): string | undefined {
    if (scenario.rpcUrl) {
        return scenario.rpcUrl;
    }
    if (scenario.rpcUrlEnv) {
        return process.env[scenario.rpcUrlEnv];
    }
    return process.env.PERPV3_RPC_URL;
}

export function loadScenarios(fixturePath: string): Scenario[] {
    const resolved = path.isAbsolute(fixturePath) ? fixturePath : path.join(process.cwd(), fixturePath);
    const content = fs.readFileSync(resolved, 'utf8');
    return parseScenarioList(JSON.parse(content));
}

function parseScenarioList(value: unknown): Scenario[] {
    if (!Array.isArray(value)) {
        throw new Error('Parity fixture must be an array of scenarios');
    }
    return value.map(parseScenario);
}

function parseScenario(value: unknown): Scenario {
    if (!isScenario(value)) {
        throw new Error('Parity fixture scenario has an unsupported type');
    }
    return value;
}

function isScenario(value: unknown): value is Scenario {
    if (!isRecord(value) || !isScenarioType(value.type)) {
        return false;
    }
    return (
        typeof value.chainId === 'number' &&
        typeof value.expiry === 'number' &&
        typeof value.instrumentAddress === 'string' &&
        typeof value.traderAddress === 'string' &&
        isRecord(value.userSetting) &&
        isRecord(value.input)
    );
}

function isScenarioType(value: unknown): value is ScenarioType {
    return (
        value === 'marketByMargin' ||
        value === 'marketByLeverage' ||
        value === 'marketClose' ||
        value === 'adjustMargin' ||
        value === 'adjustMarginByLeverage' ||
        value === 'limitOrder'
    );
}

export function scenarioReadOptions(
    scenario: Pick<BaseScenario, 'blockNumber' | 'blockTag'>,
    contextBlock?: number
): ReadOptions {
    if (scenario.blockNumber !== undefined && scenario.blockTag !== undefined) {
        throw new Error('Choose blockNumber or blockTag, not both.');
    }
    if (scenario.blockTag !== undefined) return { blockTag: scenario.blockTag };
    if (scenario.blockNumber !== undefined) {
        if (!/^\d+$/.test(scenario.blockNumber)) throw new Error('blockNumber must be a non-negative integer string.');
        return { blockNumber: BigInt(scenario.blockNumber) };
    }
    if (contextBlock === undefined || !Number.isSafeInteger(contextBlock) || contextBlock < 0) {
        throw new Error('API context must include a valid block height for parity checks.');
    }
    return { blockNumber: BigInt(contextBlock) };
}
