# SynFutures TypeScript SDK

The workspace maintains [`@synfutures/perpv3-ts`](packages/perpv3-ts/README.md),
a TypeScript SDK for SynFutures V3 queries, simulations, calldata and contract parsers.

The ethers v5 governance packages also live here:

- `@synfutures/airdrop` supports chain-selected and explicit Merkle distributors.
- `@synfutures/oyster-governance` provides staking reads, transactions, and voting-power simulations.
- `@synfutures/oyster-governance-data-source` queries governance history and pending withdrawals.
- [`@synfutures/governance-sdk`](packages/governance-sdk/README.md) exposes the signer client and the standalone unsigned `/tge` client.

The three plugins support existing caller-supplied hosts and retain their original import paths.
Run `pnpm run verify:governance` to build the four packages and check runtime behavior and consumer types.

## Development

Use Node.js 24 LTS (pinned in `.nvmrc`) and the pnpm version pinned in `package.json`.
Published PerpV3 runtime support starts at Node.js 22. Access to the configured `@synfutures`
registry is required for the contract artifact development dependency.

```sh
nvm install
nvm use
pnpm install --frozen-lockfile
pnpm run build
pnpm -C packages/perpv3-ts run verify
pnpm -C packages/perpv3-ts run test:devnet
```

`verify` covers static checks, unit tests, bundle generation and a packed
consumer. Devnet tests are separate and run on a local Anvil snapshot.
See [development and validation](packages/perpv3-ts/docs/development.md) for
individual commands, snapshot handling and test boundaries.

The viem-kit refactor is pinned to a real local tarball through a workspace
override. Its source and checksum are recorded in [vendor/README.md](vendor/README.md).
No sibling source checkout is required to install this branch.

## Documentation

- [Package overview and quick start](packages/perpv3-ts/README.md)
- [Queries, HTTP and WebSocket data](packages/perpv3-ts/docs/data.md)
- [Simulation inputs and units](packages/perpv3-ts/docs/simulation.md)
- [Transactions and parsers](packages/perpv3-ts/docs/transactions.md)

## Changes and releases

Add a changeset with the native Changesets CLI, selecting the package and appropriate
bump explicitly:

```sh
pnpm changeset add --patch @synfutures/perpv3-ts --message 'Describe the change'
```

Use `--minor` or `--major` for larger changes. Inspect the generated changeset before
committing it; `pnpm run release:dry` reports the pending release plan without
applying versions. The workspace has no fixed-version package group.

`pnpm run release:version` applies changesets and refreshes only the lockfile, with
lifecycle scripts disabled. `pnpm run release` publishes packages. Versioning and
publishing are separate operations and require release authorization.
Changesets 3 and `changesets/action@v2` share these commands.

Replace the local viem-kit override with the released dependency before publishing.
The PerpV3 `prepublishOnly` check rejects a remaining override. Release execution
is separate from local verification.
