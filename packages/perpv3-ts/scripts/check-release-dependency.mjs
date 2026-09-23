import { execFileSync } from 'node:child_process';

const overrides = JSON.parse(
    execFileSync('pnpm', ['config', 'get', 'overrides', '--json'], {
        cwd: new URL('../../../', import.meta.url),
        encoding: 'utf8',
    })
);
if (overrides?.['@derivation-tech/viem-kit']) {
    throw new Error('Replace the local viem-kit override with a released catalog version before publishing.');
}
