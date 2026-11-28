# Oyster governance data source

Construct `new GovernanceDataSource(graphUrl)` with the subgraph URL for your deployment. The client uses fetch and accepts an optional fetch implementation as the second argument.

```ts
import { GovernanceDataSource } from '@synfutures/oyster-governance-data-source';

const source = new GovernanceDataSource(graphUrl);
const history = await source.getHistoryEvents({ accounts: [account], page: 0, size: 50 });
const pending = await source.getCurrentPendingUnstakes(account);
```

History uses Unix seconds and returns the newest block and log first. Omitting both page and size reads all matching events. Amounts, block numbers and pending indices are bigint. Convert them to decimal strings when serializing to JSON.
