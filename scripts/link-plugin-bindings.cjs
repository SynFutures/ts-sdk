// TypeChain's ethers-v5 template imports the wallet and provider umbrella packages.
// These factories only need the v5 contract and ABI modules at runtime.
const { readdirSync, readFileSync, writeFileSync } = require('node:fs');
const { dirname, join, relative, sep } = require('node:path');
const root = process.argv[2] || 'src/typechain';
for (const file of readdirSync(root, { recursive: true })) {
    if (!file.endsWith('.ts')) continue;
    const path = join(root, file);
    const types = relative(dirname(path), 'legacy-host-types/v5/ethers').split(sep).join('/');
    const source = readFileSync(path, 'utf8')
        .replace(
            /import \{ Contract, Signer, utils \} from ['"]ethers['"];/g,
            [
                "import { Contract } from '@ethersproject/contracts';",
                "import type { Signer } from '@ethersproject/abstract-signer';",
                "import * as utils from '@ethersproject/abi';",
            ].join('\n')
        )
        .replace(/from ['"]ethers['"]/g, `from '${types}'`)
        .replace(/from ['"]@ethersproject\/providers['"]/g, "from '@ethersproject/abstract-provider'");
    writeFileSync(path, source);
}
