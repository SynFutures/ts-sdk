// Each compatibility package ships its own copy of this type-only contract.
const { copyFileSync } = require('node:fs');
const { join } = require('node:path');
copyFileSync(join(__dirname, 'legacy-plugin-host.d.ts'), 'legacy-plugin-host.d.ts');
