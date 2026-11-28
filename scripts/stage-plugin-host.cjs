// Each compatibility package ships its own copy of this type-only contract.
const { copyFileSync, cpSync, rmSync } = require('node:fs');
const { join } = require('node:path');
copyFileSync(join(__dirname, 'legacy-plugin-host.d.ts'), 'legacy-plugin-host.d.ts');
rmSync('legacy-host-types', { recursive: true, force: true });
cpSync(join(__dirname, 'legacy-host-types'), 'legacy-host-types', { recursive: true });
