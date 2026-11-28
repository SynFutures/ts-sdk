# Oyster governance

Create a staking client with `createOysterGovernanceClient(publicClient)`. Ethereum selects the Oyster vault. Base has a token entry and requires an explicit staking vault. Pass overrides as `{ vault, multicall }`. The independent governance SDK has its own vault and ABI.

Read `getStakingInfo(account, { blockNumber })` to obtain the balance and pending releases. Pass each entry's original `index` to `buildRelease`. The stake, unstake and release builders return unsigned viem requests. Amounts and indices use bigint.

See the [governance migration guide](https://github.com/SynFutures/ts-sdk/blob/main/docs/governance-viem.md) for the address table, transaction example and guidance for existing hosts.
