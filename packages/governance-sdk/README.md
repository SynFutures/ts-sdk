# SynFutures governance SDK

Use `createGovernanceClient(publicClient)` from the package root for the independent Ethereum and Sepolia vaults. Supply `{ vault, token, multicall }` for a custom deployment. Use `getStakingInfo(account, { blockNumber })` for a consistent staking snapshot. The client exposes `buildStake(amount)`, `buildUnstake(amount)` and `buildRelease(index)` as unsigned viem requests with bigint arguments.

Use `createTgeClient(publicClient)` from `@synfutures/governance-sdk/tge` for claims against an explicit distributor. Pass `{ vault, multicall, graphUrl }` as the second argument to enable staking and history. The wallet belongs to the application. See the [migration guide and transaction examples](https://github.com/SynFutures/ts-sdk/blob/main/docs/governance-viem.md).

## Release ownership

The ts-sdk Changesets workflow is the intended publisher. Before publishing, registry owners should confirm that it targets the registry serving the existing scoped package, has write access and replaces manual publishes from the contracts repository.
