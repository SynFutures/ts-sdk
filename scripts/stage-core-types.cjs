// Preserve the registry declaration paths and package ID. TypeScript can then
// identify nominal v5 classes in a host that already imports the original types.
const { copyFileSync, cpSync, statSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

module.exports = function stageCoreTypes(root, output, runtimeModules = []) {
    const { name, version } = require(join(root, 'package.json'));
    const source = join(root, 'build');
    const included = new Set(runtimeModules.map((file) => join(source, file)));
    cpSync(source, join(output, 'build'), {
        recursive: true,
        filter: (file) => statSync(file).isDirectory() || file.endsWith('.d.ts') || included.has(file),
    });
    copyFileSync(join(__dirname, 'legacy-core-peer.cjs'), join(output, 'peer.cjs'));
    writeFileSync(
        join(output, 'package.json'),
        JSON.stringify({ name, version, main: './index.js', types: './build/index.d.ts' })
    );
};
