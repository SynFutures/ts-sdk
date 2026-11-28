// Run after build:governance. Each tarball gets a separate, empty npm application.
const { execFileSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const assert = require('node:assert/strict');

const consumers = {
    airdrop:
        'import { Airdrop__factory } from "@synfutures/airdrop"; Airdrop__factory.createInterface().getSighash("withdraw");',
    'oyster-governance': 'import { governancePlugin } from "@synfutures/oyster-governance"; governancePlugin();',
    'oyster-governance-data-source':
        'import { governanceDataSourcePlugin } from "@synfutures/oyster-governance-data-source"; governanceDataSourcePlugin("https://example.invalid").install({});',
    'governance-sdk':
        'import { GovClient } from "@synfutures/governance-sdk"; import {createTgeClient} from "@synfutures/governance-sdk/tge"; createTgeClient(GovClient.getInstance("ethereum").ctx.provider);',
};
const root = mkdtempSync(join(tmpdir(), 'governance-consumers-'));
try {
    for (const [name, source] of Object.entries(consumers)) {
        const pkg = resolve(__dirname, '../packages', name);
        const app = join(root, name);
        console.log('Verifying @synfutures/' + name);
        mkdirSync(app);
        const filename = execFileSync('npm', ['pack', '--ignore-scripts', '--silent', '--pack-destination', root], {
            cwd: pkg,
            encoding: 'utf8',
        }).trim();
        writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'consumer', version: '1.0.0', private: true }));
        const run = (bin, args) => execFileSync(bin, args, { cwd: app, stdio: 'inherit' });
        run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(root, filename)]);
        const installed = Object.keys(require(join(app, 'package-lock.json')).packages);
        assert.ok(!installed.some((path) => /(^|\/)node_modules\/@derivation-tech\/web3-core$/.test(path)), name);
        writeFileSync(join(app, 'consumer.ts'), source);
        const tsc = createRequire(join(pkg, 'package.json')).resolve('typescript/bin/tsc');
        run(process.execPath, [
            tsc,
            '--strict',
            '--target',
            'ES2020',
            '--module',
            'Node16',
            '--resolveJsonModule',
            'consumer.ts',
        ]);
        run(process.execPath, ['consumer.js']);
        // Wallet-compatible v5 packages retain the unfixed elliptic low advisory.
        const threshold = name === 'oyster-governance-data-source' ? 'low' : 'moderate';
        run('npm', ['audit', '--omit=dev', '--audit-level=' + threshold]);
    }
} finally {
    rmSync(root, { recursive: true, force: true });
}
