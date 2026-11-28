// A host that already supplies the matching v5 core must see its own constructors
// and ChainContext singleton. Standalone installations use the packaged runtime.
let matchingPeer = false;
try {
    matchingPeer = require('@derivation-tech/web3-core/package.json').version === require('./package.json').version;
} catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
}
module.exports = matchingPeer;
