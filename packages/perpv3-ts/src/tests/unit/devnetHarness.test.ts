import { describe, expect, test } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type HarnessProbe = {
    timestamp?: number;
    args: string[];
};

function probeHarness(instruments: Array<{ expiry: number }>): HarnessProbe {
    const moduleUrl = pathToFileURL(path.resolve(__dirname, '../../../scripts/devnet/anvil.js')).href;
    const script = `
        import { buildAnvilArgs, getDevnetInitialTimestamp } from ${JSON.stringify(moduleUrl)};
        const timestamp = getDevnetInitialTimestamp(${JSON.stringify({ instruments })});
        const args = buildAnvilArgs({
            host: '127.0.0.1',
            port: 8545,
            chainId: 31337,
            mnemonic: 'test mnemonic',
            loadStatePath: '/tmp/state.json',
            timestamp,
        });
        process.stdout.write(JSON.stringify({ timestamp, args }));
    `;
    return JSON.parse(
        execFileSync(process.execPath, ['--input-type=module', '--eval', script], { encoding: 'utf8' })
    ) as HarnessProbe;
}

describe('devnet harness', () => {
    test('starts loaded dated-futures state one day before its earliest expiry', () => {
        const { timestamp, args } = probeHarness([
            { expiry: 0xffffffff },
            { expiry: 1_800_000_000 },
            { expiry: 1_700_000_000 },
        ]);

        expect(timestamp).toBe(1_700_000_000 - 86_400);
        expect(args).toEqual([
            '--host',
            '127.0.0.1',
            '--port',
            '8545',
            '--chain-id',
            '31337',
            '--mnemonic',
            'test mnemonic',
            '--load-state',
            '/tmp/state.json',
            '--timestamp',
            String(timestamp),
        ]);
    });

    test('keeps wall-clock startup when the state has no dated futures', () => {
        expect(probeHarness([{ expiry: 0xffffffff }]).timestamp).toBeUndefined();
    });
});

describe('devnet process ownership', () => {
    test('teardown ignores stale environment data and stops only its captured child', () => {
        const teardown = pathToFileURL(path.resolve(__dirname, '../../../scripts/devnet/jest/globalTeardown.js')).href;
        const script = `
            import assert from 'node:assert/strict';
            import { spawn } from 'node:child_process';
            import { once } from 'node:events';
            import teardown from ${JSON.stringify(teardown)};
            const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
            const owned = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true });
            try {
                await Promise.all([once(unrelated, 'spawn'), once(owned, 'spawn')]);
                process.env.PERPV3_DEVNET_RPC_URL = 'http://127.0.0.1:8545';
                await teardown();
                assert.equal(unrelated.exitCode, null);
                assert.equal(owned.exitCode, null);
                globalThis.__perpv3Devnet = owned;
                await teardown();
                assert.notEqual(owned.signalCode, null);
                assert.equal(unrelated.exitCode, null);
                assert.equal(unrelated.signalCode, null);
                assert.equal(globalThis.__perpv3Devnet, undefined);
                assert.equal(process.env.PERPV3_DEVNET_RPC_URL, undefined);
                await teardown();
            } finally {
                unrelated.kill();
                if (owned.exitCode === null && owned.signalCode === null) owned.kill();
            }
        `;
        expect(() => execFileSync(process.execPath, ['--input-type=module', '--eval', script])).not.toThrow();
    });
});

describe('devnet connection requirements', () => {
    test('requires the runtime URL instead of falling back to the preset port', async () => {
        const { loadDevnetManifest } = await import('../devnet/devnet');
        const previous = process.env.PERPV3_DEVNET_RPC_URL;
        try {
            delete process.env.PERPV3_DEVNET_RPC_URL;
            expect(() => loadDevnetManifest()).toThrow('Devnet runtime missing');
            process.env.PERPV3_DEVNET_RPC_URL = 'https://example.com';
            expect(() => loadDevnetManifest()).toThrow('local RPC');
        } finally {
            if (previous === undefined) delete process.env.PERPV3_DEVNET_RPC_URL;
            else process.env.PERPV3_DEVNET_RPC_URL = previous;
        }
    });
});

test('snapshot publication preserves the previous generation when staging is incomplete', () => {
    const moduleUrl = pathToFileURL(path.resolve(__dirname, '../../../scripts/devnet/snapshot.js')).href;
    const script = `
        import assert from 'node:assert/strict';
        import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
        import { tmpdir } from 'node:os';
        import path from 'node:path';
        import { publishSnapshot } from ${JSON.stringify(moduleUrl)};
        const dir = mkdtempSync(path.join(tmpdir(), 'snapshot-test-'));
        const staging = path.join(dir, 'staging');
        mkdirSync(staging);
        const names = ['state.json', 'manifest.json', 'state.meta.json'];
        try {
            for (const name of names) writeFileSync(path.join(dir, name), '{"generation":1}');
            writeFileSync(path.join(staging, 'state.json'), '{"generation":2}');
            assert.throws(() => publishSnapshot(staging, dir));
            for (const name of names) assert.equal(JSON.parse(readFileSync(path.join(dir, name))).generation, 1);
            for (const name of names) writeFileSync(path.join(staging, name), '{"generation":2}');
            publishSnapshot(staging, dir);
            for (const name of names) assert.equal(JSON.parse(readFileSync(path.join(dir, name))).generation, 2);
        } finally { rmSync(dir, { recursive: true, force: true }); }
    `;
    expect(() => execFileSync(process.execPath, ['--input-type=module', '--eval', script])).not.toThrow();
});
