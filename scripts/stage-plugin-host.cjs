// Each plugin ships the host declarations and just the original v5 helpers it uses.
const { copyFileSync, cpSync, rmSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const stageCoreTypes = require('./stage-core-types.cjs');
copyFileSync(join(__dirname, 'legacy-plugin-host.d.ts'), 'legacy-plugin-host.d.ts');
rmSync('legacy-host-types', { recursive: true, force: true });
cpSync(join(__dirname, 'legacy-host-types'), 'legacy-host-types', { recursive: true });

const root = dirname(require.resolve('@derivation-tech/web3-core/package.json', { paths: [process.cwd()] }));
const output = 'legacy-host-types/core';
const graph = require(join(process.cwd(), 'package.json')).name === '@synfutures/oyster-governance-data-source';
const feature = graph ? 'util/graph' : 'tx/parser';
stageCoreTypes(root, output, ['constant.js', 'util/common.js', 'util/logger.js', feature + '.js']);
if (!graph) {
    // The parser only imports formatUnits from the old utility barrel.
    writeFileSync(join(output, 'build/util/index.js'), "exports.formatUnits = require('./common').formatUnits;\n");
}
writeFileSync(
    join(output, 'index.js'),
    [
        "Object.assign(exports, require('./build/constant'), require('./build/util/common'));",
        `Object.assign(exports, require('./peer.cjs') ? require('@derivation-tech/web3-core/build/${feature}') : require('./build/${feature}'));`,
        '',
    ].join('\n')
);
