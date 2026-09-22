import { URL } from 'node:url';
import { readFileSync } from 'node:fs';

const workspace = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
const override = workspace.pnpm?.overrides?.['@derivation-tech/viem-kit'];
if (override) {
    throw new Error('Replace the local viem-kit override with a released catalog version before publishing.');
}
