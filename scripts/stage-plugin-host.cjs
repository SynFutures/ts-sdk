// Each compatibility package ships its own copy of this type-only contract.
const { copyFileSync, cpSync, rmSync, statSync, writeFileSync } = require('node:fs');
const { dirname, join, relative } = require('node:path');
copyFileSync(join(__dirname, 'legacy-plugin-host.d.ts'), 'legacy-plugin-host.d.ts');
rmSync('legacy-host-types', { recursive: true, force: true });
cpSync(join(__dirname, 'legacy-host-types'), 'legacy-host-types', { recursive: true });

// The host declarations refer to the complete v5 ChainContext. At runtime the plugins
// only use the original ABI parser, formatting helpers, or subgraph reader.
const coreRoot = dirname(require.resolve('@derivation-tech/web3-core/package.json', { paths: [process.cwd()] }));
const source = join(coreRoot, 'build');
const output = 'legacy-host-types/core';
const graph = require(join(process.cwd(), 'package.json')).name === '@synfutures/oyster-governance-data-source';
const modules = new Set(['constant.js', 'util/common.js', 'util/logger.js', graph ? 'util/graph.js' : 'tx/parser.js']);
cpSync(source, output, {
    recursive: true,
    filter: (file) => statSync(file).isDirectory() || file.endsWith('.d.ts') || modules.has(relative(source, file)),
});
if (!graph) {
    // The parser imports formatUnits through the old utility barrel.
    writeFileSync(join(output, 'util/index.js'), "exports.formatUnits = require('./common').formatUnits;\n");
}
