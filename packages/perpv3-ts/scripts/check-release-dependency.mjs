import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

const VIEM_KIT = '@derivation-tech/viem-kit';

const overrides = JSON.parse(
    execFileSync('pnpm', ['config', 'get', 'overrides', '--json'], {
        cwd: new URL('../../../', import.meta.url),
        encoding: 'utf8',
    })
);
if (overrides?.[VIEM_KIT]) {
    throw new Error('Replace the local viem-kit override with a released catalog version before publishing.');
}

// Let pnpm expand the catalog exactly as it will for publication.
const temporary = mkdtempSync(join(tmpdir(), 'perpv3-release-check-'));
try {
    const archive = join(temporary, 'package.tgz');
    execFileSync('pnpm', ['pack', '--out', archive], {
        cwd: new URL('../', import.meta.url),
        env: { ...process.env, pnpm_config_ignore_scripts: 'true' },
    });
    const packed = JSON.parse(execFileSync('tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8' }));
    const version = packed.dependencies?.[VIEM_KIT];
    if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
        throw new Error(`Packed viem-kit dependency must be an exact stable version; got ${version}`);
    }
} finally {
    rmSync(temporary, { recursive: true, force: true });
}
