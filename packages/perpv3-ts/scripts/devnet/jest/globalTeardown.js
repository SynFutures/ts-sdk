/* eslint-env node */

import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

import { getDevnetPaths } from '../devnet-meta.js';

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForProcessExit(pid, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            process.kill(pid, 0);
        } catch {
            return;
        }
        await sleep(100);
    }
}

export default async function globalTeardown() {
    const { devnetRoot } = getDevnetPaths();
    const runtimeDir = path.join(devnetRoot, '.runtime');
    const runtimePath = path.join(runtimeDir, 'anvil.json');

    if (!existsSync(runtimePath)) return;

    const runtime = JSON.parse(readFileSync(runtimePath, 'utf8'));
    const pid = runtime?.pid;

    if (typeof pid === 'number') {
        try {
            process.kill(-pid, 'SIGTERM');
        } catch {
            try {
                process.kill(pid, 'SIGTERM');
            } catch {
                // ignore
            }
        }
        await waitForProcessExit(pid, 2_000);

        try {
            process.kill(pid, 0);
            try {
                process.kill(-pid, 'SIGKILL');
            } catch {
                try {
                    process.kill(pid, 'SIGKILL');
                } catch {
                    // ignore
                }
            }
            await waitForProcessExit(pid, 2_000);
        } catch {
            // already exited
        }
    }

    rmSync(runtimePath, { force: true });
}
