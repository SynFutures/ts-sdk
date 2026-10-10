import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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

// A direct local spec in the published manifest would bypass the override check above.
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    const spec = manifest[field]?.[VIEM_KIT];
    if (typeof spec === 'string' && /^(link|file):/.test(spec)) {
        throw new Error(
            `Replace the local viem-kit ${field} entry (${spec}) with a released version before publishing.`
        );
    }
}
