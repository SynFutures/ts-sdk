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

function loadPreset(): DevnetPreset {
    const presetPath = path.join(process.cwd(), 'devnet', 'preset.json');
    return JSON.parse(readFileSync(presetPath, 'utf8')) as DevnetPreset;
}

const preset = loadPreset();
const rpcUrl = `http://${preset.anvil.host}:${preset.anvil.port}`;
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
