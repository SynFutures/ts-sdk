/* eslint-env node */
/* global console */

import { execSync } from 'node:child_process';
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

/**
 * Attempt to kill any process listening on the given port.
 * This is a fallback when we can't read the PID from anvil.json.
 */
function tryKillProcessOnPort(port) {
    try {
        // Use lsof to find PID listening on port, works on Linux/macOS
        const result = execSync(`lsof -ti tcp:${port} 2>/dev/null`, { encoding: 'utf8' });
        const pids = result.trim().split('\n').filter(Boolean);
        for (const pidStr of pids) {
            const pid = parseInt(pidStr, 10);
            if (!isNaN(pid)) {
                try {
                    process.kill(pid, 'SIGTERM');
                    console.warn(`[globalTeardown] Killed orphaned process ${pid} on port ${port}`);
                } catch {
                    // Process may have already exited
                }
            }
        }
    } catch {
        // lsof failed or no process found - that's fine
    }
}

export default async function globalTeardown() {
    const { devnetRoot } = getDevnetPaths();
    const runtimeDir = path.join(devnetRoot, '.runtime');
    const runtimePath = path.join(runtimeDir, 'anvil.json');
    const presetPath = path.join(devnetRoot, 'preset.json');

    if (!existsSync(runtimePath)) return;

    let runtime;
    try {
        runtime = JSON.parse(readFileSync(runtimePath, 'utf8'));
    } catch {
        // Corrupted or invalid JSON - try to kill by preset port as fallback
        console.warn('[globalTeardown] Failed to parse anvil.json, attempting fallback cleanup');
        try {
            const preset = JSON.parse(readFileSync(presetPath, 'utf8'));
            const port = preset?.anvil?.port;
            if (typeof port === 'number') {
                tryKillProcessOnPort(port);
            }
        } catch {
            // Can't read preset either - nothing more we can do
        }
        rmSync(runtimePath, { force: true });
        return;
    }

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
