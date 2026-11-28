# SynFutures governance SDK

The root and the published `build/*` paths retain the ethers v5 APIs from 0.0.5. Existing callers can keep using `GovClient.getInstance(chain)`, `setProvider`, and the signer-first `stake`, `unstake` and `release` methods with their original receipt behavior.

## Airdrop and staking clients

Import `createTgeClient` from `@synfutures/governance-sdk/tge` (or `/tge/index.js` for native ES modules). Supply an ethers v5 provider and the gas limit multiplier. To enable staking, also supply the vault address, Multicall3 address and governance subgraph URL for that network.

```ts
const { airdrop, governance, governanceDataSource } = createTgeClient(provider, 1.7, {
    vault,
    multicall,
    graphUrl,
});
const claimed = await airdrop.isClaimed(distributor, index);
const { stakes, pendingUnstakes } = await governance.getStakingInfo(account);
const history = await governanceDataSource.getHistoryEvents({ accounts: [account] });
```

`airdrop.claim`, `governance.stake`, `unstake` and `release` return unsigned transactions. The caller chooses a signer and waits for the receipt. Staking records are sorted by creation time and retain their contract index for release. The balance and withdrawal duration come from one multicall. The next-day simulations use ethers BigNumber fixed-point arithmetic and UTC calendar days.

## Release ownership

The ts-sdk Changesets workflow is the intended publisher of the next version to the existing scoped registry. Before merging the release PR, the registry owners must confirm that the workflow targets the registry serving 0.0.5, has write access to this package and replaces manual publishes from the contract repository. The package starts at the already published version, and the Changeset increments it to 0.0.6.

The build stages the released 0.0.5 distribution from a pinned development dependency. This preserves its CommonJS entry, deep imports, original factories, parser, graph and signer implementation. The resulting package contains that distribution and the new client. Installing it does not require a second copy of the governance package. The registry artifact differs from the current contract repository's SDK directory. The latter also contains deployment and Merkle proof helpers used directly by its scripts and tests. Contract, subgraph and proof-generation maintenance stays with that repository.

The standalone runtime includes the original v5 chain context, the Optimism L2 provider adapter and the gas oracle services. Their transport and cryptography dependencies are installed as ordinary npm packages. When the application already provides the matching web3-core version, it supplies the shared chain context and parsers.
