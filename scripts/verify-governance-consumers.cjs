// Install each release artifact as the only requested package in an empty npm project.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve, dirname } = require('node:path');

const consumers = {
    airdrop: `import { createAirdropClient } from '@synfutures/airdrop';
        const request = createAirdropClient(client).buildClaim({index:0n, account, amount:1n, proof:[]});
        if (request.data.slice(0, 10) !== '0x2e7ba6ef') throw Error('Invalid claim');`,
    'oyster-governance': `import { createOysterGovernanceClient } from '@synfutures/oyster-governance';
        if (createOysterGovernanceClient(client).buildStake(1n).data.slice(0,10) !== '0xa694fc3a') throw Error('Invalid stake');`,
    'oyster-governance-data-source': `import { GovernanceDataSource } from '@synfutures/oyster-governance-data-source';
        const source = new GovernanceDataSource('https://example.invalid', async () => Response.json({data:{pendingUnstakes:[]}}));
        async function check() { const rows = await source.getCurrentPendingUnstakes(account); if (rows.length) throw Error('Invalid pending list'); }
        check().catch(error => {throw error});`,
    'governance-sdk': `import { createGovernanceClient } from '@synfutures/governance-sdk';
        import { createTgeClient } from '@synfutures/governance-sdk/tge';
        const stake = createGovernanceClient(client).buildRelease(0n);
        const tge = createTgeClient(client,{vault:account,multicall:account,graphUrl:'https://example.invalid'});
        if(stake.to === tge.governance.vault || tge.governance.vault !== account) throw Error('Invalid deployments');`,
};
const common = `import {createPublicClient,custom} from 'viem';
import {mainnet} from 'viem/chains';
const account = '0x1111111111111111111111111111111111111111' as const;
const client = createPublicClient({chain:mainnet,transport:custom({request(){throw Error('Unexpected RPC')}})});`;
const compiler = require.resolve('typescript/package.json');
const tsc = join(dirname(compiler), require(compiler).bin.tsc);
const root = mkdtempSync(join(tmpdir(), 'governance-consumers-'));
try {
    for (const [name, example] of Object.entries(consumers)) {
        const pkg = resolve(__dirname, '../packages', name),
            app = join(root, name),
            tarball = join(root, name + '.tgz');
        console.log('Verifying @synfutures/' + name);
        mkdirSync(app);
        execFileSync('pnpm', ['pack', '--out', tarball], { cwd: pkg, stdio: 'inherit' });
        writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'consumer', version: '1.0.0', private: true }));
        const run = (bin, args) => execFileSync(bin, args, { cwd: app, stdio: 'inherit' });
        run('npm', ['install', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund', tarball]);
        const lock = JSON.parse(readFileSync(join(app, 'package-lock.json'), 'utf8'));
        for (const [path, manifest] of Object.entries(lock.packages)) {
            const installed = path.split('node_modules/').at(-1);
            for (const id of [installed, manifest.name].filter(Boolean)) {
                assert.ok(
                    !['ethers', 'elliptic', '@derivation-tech/web3-core'].includes(id) &&
                        !id.startsWith('@ethersproject/'),
                    `Unexpected dependency ${id} in ${name}`
                );
            }
        }
        for (const ext of ['cts', 'mts']) writeFileSync(join(app, 'consumer.' + ext), common + '\n' + example);
        run(process.execPath, [
            tsc,
            '--ignoreConfig',
            '--strict',
            '--target',
            'ES2022',
            '--module',
            'NodeNext',
            'consumer.cts',
            'consumer.mts',
        ]);
        for (const ext of ['cjs', 'mjs']) run(process.execPath, ['consumer.' + ext]);
        const audit = JSON.parse(
            execFileSync('npm', ['audit', '--omit=dev', '--json'], { cwd: app, encoding: 'utf8' })
        );
        assert.equal(audit.metadata.vulnerabilities.total, 0);
        console.log(name + ': no ethers, @ethersproject or elliptic; 0 production vulnerabilities');
    }
} finally {
    rmSync(root, { recursive: true, force: true });
}
