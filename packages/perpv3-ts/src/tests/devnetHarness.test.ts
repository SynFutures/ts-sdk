import { describe, expect, test } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type HarnessProbe = {
    timestamp?: number;
    args: string[];
};

function probeHarness(instruments: Array<{ expiry: number }>): HarnessProbe {
    const moduleUrl = pathToFileURL(path.join(process.cwd(), 'scripts/devnet/anvil.js')).href;
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
