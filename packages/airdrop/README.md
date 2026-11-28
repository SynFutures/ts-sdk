# SynFutures airdrop plugin

Install `@synfutures/airdrop` from the SynFutures scoped registry. Supply a host with an ethers v5 provider, parser and address registration, and a transaction sender for claims. An application that already owns a `SynFuturesV3` instance can install the plugin on it.

```ts
import { airdropPlugin } from '@synfutures/airdrop';

const sdk = airdropPlugin().install(host);

const claimed = await sdk.airdrop.isClaimed(index, { blockTag });
const unsigned = await sdk.airdrop.claim(index, amount, account, proof);
const receipt = await sdk.airdrop.claim(distributor, index, amount, account, proof, { signer });
```

The calls without a distributor use `AirdropContracts` for the host chain and register its address and event parser. Pass a distributor as the first argument to `claim` or `isClaimed` to select the contract explicitly. Amounts are integer token units, encoded as strings.

The root exports `Airdrop__factory`, its typed contract, and `MerkleDistributorWithDeadlineAbi`. The raw JSON is available at `@synfutures/airdrop/build/abis/airdrop.json` and the parser at `@synfutures/airdrop/build/parser`.
