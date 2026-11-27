// Preserve the registry release, including its original ABI, declarations and deep imports.
// The pinned package is a build input. Consumers install a self-contained artifact.
const { cpSync, rmSync } = require('node:fs');
const { dirname, join } = require('node:path');
const root = dirname(require.resolve('governance-sdk-legacy/package.json'));
rmSync(join(__dirname, '..', 'build'), { recursive: true, force: true });
cpSync(join(root, 'build'), join(__dirname, '..', 'build'), { recursive: true });
