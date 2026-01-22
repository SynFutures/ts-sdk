import { afterAll, afterEach, beforeAll, beforeEach } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Hex } from 'viem';
import { createTestClient, http } from 'viem';
import { foundry } from 'viem/chains';

type DevnetPreset = {
    anvil: {
        host: string;
        port: number;
        chainId: number;
    };
};

type DevnetRuntime = {
    rpcUrl?: string;
};

function loadPreset(): DevnetPreset {
    const presetPath = path.join(process.cwd(), 'devnet', 'preset.json');
    return JSON.parse(readFileSync(presetPath, 'utf8')) as DevnetPreset;
}

function loadRuntimeRpcUrl(): string | null {
    const runtimePath = path.join(process.cwd(), 'devnet', '.runtime', 'anvil.json');
    try {
        const runtime = JSON.parse(readFileSync(runtimePath, 'utf8')) as DevnetRuntime;
        return typeof runtime?.rpcUrl === 'string' && runtime.rpcUrl.length > 0 ? runtime.rpcUrl : null;
    } catch {
        return null;
    }
}

const preset = loadPreset();
const rpcUrl = loadRuntimeRpcUrl() ?? `http://${preset.anvil.host}:${preset.anvil.port}`;
const chain = preset.anvil.chainId === foundry.id ? foundry : { ...foundry, id: preset.anvil.chainId };
const testClient = createTestClient({ chain, mode: 'anvil', transport: http(rpcUrl) });

let fileSnapshotId: Hex | undefined;
let testSnapshotId: Hex | undefined;

beforeAll(async () => {
    fileSnapshotId = await testClient.snapshot();
});

afterAll(async () => {
    if (!fileSnapshotId) return;
    await testClient.revert({ id: fileSnapshotId });
    fileSnapshotId = undefined;
});

beforeEach(async () => {
    testSnapshotId = await testClient.snapshot();
});

afterEach(async () => {
    if (!testSnapshotId) return;
    await testClient.revert({ id: testSnapshotId });
    testSnapshotId = undefined;
});
