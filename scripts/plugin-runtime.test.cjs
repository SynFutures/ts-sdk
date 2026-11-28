const assert = require('node:assert/strict');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

for (const name of ['airdrop', 'oyster-governance', 'oyster-governance-data-source']) {
    test(`${name} loads without the legacy web3-core runtime`, () => {
        const entry = resolve(__dirname, '../packages', name, 'build');
        const child = spawnSync(
            process.execPath,
            [
                '-e',
                `
            const Module = require('node:module');
            const load = Module._load;
            Module._load = function (id, ...args) {
                if (id === '@derivation-tech/web3-core' || id.startsWith('@derivation-tech/web3-core/')) {
                    throw new Error('Legacy dependency loaded: ' + id);
                }
                return load.call(this, id, ...args);
            };
            require(process.argv[1]);
        `,
                entry,
            ],
            { encoding: 'utf8' }
        );
        assert.equal(child.status, 0, child.stderr);
    });
}
