// Keep the 0.0.5 entry points, but bind their core imports to this package's v5 runtime.
const { cpSync, readdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { dirname, join, relative, sep } = require('node:path');
const { build } = require('esbuild');
const { linkV5, linkFiles, stageProvider } = require('./stage-provider.cjs');

const output = join(__dirname, '../build');
const core = join(output, 'legacy-core');
const legacyRoot = dirname(require.resolve('governance-sdk-legacy/package.json'));
const coreRequire = createRequire(require.resolve('@derivation-tech/web3-core/package.json'));
const coreSource = dirname(coreRequire.resolve('@derivation-tech/web3-core'));
const opRequire = createRequire(coreRequire.resolve('@eth-optimism/sdk/package.json'));
const oracleRoot = dirname(coreRequire.resolve('gas-price-oracle/package.json'));
const opRoot = dirname(opRequire.resolve('./package.json'));

async function stage() {
    rmSync(output, { recursive: true, force: true });
    cpSync(join(legacyRoot, 'build'), output, { recursive: true });
    for (const file of readdirSync(output, { recursive: true })) {
        if (!file.endsWith('.js') && !file.endsWith('.d.ts')) continue;
        const path = join(output, file);
        const source = readFileSync(path, 'utf8');
        if (!source.includes('@derivation-tech/web3-core')) continue;
        const local = relative(dirname(path), core).split(sep).join('/');
        writeFileSync(
            path,
            source.replaceAll('@derivation-tech/web3-core', local.startsWith('.') ? local : './' + local)
        );
    }
    require('../../../scripts/stage-core-types.cjs')(dirname(coreSource), core);

    linkFiles(output, output);
    stageProvider(output);
    // The hosted ABI factories, signer, fee policy and OP receipt formatter stay on v5.
    // Only the OP L2 provider and gas oracle services are used. Keep ethers, crypto,
    // HTTP transports and other npm dependencies external so consumers can audit them.
    const { predeploys, getContractInterface } = opRequire('@eth-optimism/contracts');
    const abi = getContractInterface('OVM_GasPriceOracle').format('json');
    const result = await build({
        entryPoints: [join(coreSource, 'index.js')],
        outfile: join(core, 'standalone.js'),
        platform: 'node',
        format: 'cjs',
        bundle: true,
        packages: 'external',
        metafile: true,
        plugins: [
            {
                name: 'legacy-governance-runtime',
                setup(plugin) {
                    plugin.onResolve({ filter: /^(ethers(\/lib\/utils)?|@ethersproject\/providers)$/ }, ({ path }) => ({
                        path: linkV5(output, core, path),
                        external: true,
                    }));

                    plugin.onResolve({ filter: /^gas-price-oracle\/lib\/services$/ }, () => ({
                        path: coreRequire.resolve('gas-price-oracle/lib/services'),
                    }));
                    plugin.onResolve({ filter: /^@eth-optimism\/sdk$/ }, () => ({
                        path: join(opRoot, 'src/l2-provider.ts'),
                    }));
                    plugin.onResolve({ filter: /^\.\/utils$/ }, ({ importer }) =>
                        importer === join(opRoot, 'src/l2-provider.ts')
                            ? { path: join(opRoot, 'src/utils/coercion.ts') }
                            : null
                    );
                    plugin.onResolve({ filter: /^@eth-optimism\/contracts$/ }, () => ({
                        path: 'oracle',
                        namespace: 'op-abi',
                    }));
                    plugin.onLoad({ filter: /.*/, namespace: 'op-abi' }, () => ({
                        contents: `export const predeploys = { OVM_GasPriceOracle: ${JSON.stringify(predeploys.OVM_GasPriceOracle)} };
                               export const getContractInterface = () => ${abi};`,
                    }));
                },
            },
        ],
    });
    writeFileSync(
        join(core, 'index.js'),
        "module.exports = require('./peer.cjs') ? require('@derivation-tech/web3-core') : require('./standalone');\n"
    );
    // Fail closed if a new external import lacks a runtime dependency.
    const deps = require('../package.json').dependencies;
    for (const { path } of Object.values(result.metafile.outputs)[0].imports) {
        if (['ethers', 'ethers/lib/utils', '@ethersproject/providers'].some((id) => path === linkV5(output, core, id)))
            continue;
        const name = path.startsWith('@') ? path.split('/').slice(0, 2).join('/') : path.split('/')[0];
        if (!(name in deps) && name !== '@derivation-tech/ethers-ledger' && !require('node:module').isBuiltin(name)) {
            throw new Error('Undeclared legacy runtime dependency: ' + name);
        }
    }
    for (const [name, dir] of [
        ['optimism-sdk', opRoot],
        ['optimism-contracts', dirname(opRequire.resolve('@eth-optimism/contracts/package.json'))],
        ['gas-price-oracle', oracleRoot],
    ]) {
        cpSync(join(dir, 'LICENSE'), join(core, 'LICENSE-' + name));
    }
}

stage().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
