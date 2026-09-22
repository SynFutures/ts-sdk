import { afterAll, afterEach, beforeAll, beforeEach } from '@jest/globals';
import { loadDevnetManifest } from './devnet';
import type { Hex } from 'viem';
import { createTestClient, http } from 'viem';
import { foundry } from 'viem/chains';

const manifest = loadDevnetManifest();
const chain = manifest.chainId === foundry.id ? foundry : { ...foundry, id: manifest.chainId };
const testClient = createTestClient({ chain, mode: 'anvil', transport: http(manifest.rpcUrl) });

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
