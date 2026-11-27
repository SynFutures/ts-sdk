# SynFutures airdrop plugin

Install `@synfutures/airdrop` and `@synfutures/oyster-sdk2` from the SynFutures scoped registry. The plugin uses the ethers v5 provider and transaction settings of its Oyster host.

```ts
import { SynFuturesV3 } from '@synfutures/oyster-sdk2';
import { airdropPlugin } from '@synfutures/airdrop';

const sdk = new SynFuturesV3('base').useDefault().use(airdropPlugin());
await sdk.init();

const claimed = await sdk.airdrop.isClaimed(index, { blockTag });
const unsigned = await sdk.airdrop.claim(index, amount, account, proof);
const receipt = await sdk.airdrop.claim(distributor, index, amount, account, proof, { signer });
```

The calls without a distributor use `AirdropContracts` for the host chain and register its address and event parser. Pass a distributor as the first argument to `claim` or `isClaimed` to select the contract explicitly. Amounts are integer token units, encoded as strings.

The root exports `Airdrop__factory`, its typed contract, and `MerkleDistributorWithDeadlineAbi`. The raw JSON is available at `@synfutures/airdrop/build/abis/airdrop.json` and the parser at `@synfutures/airdrop/build/parser`.
