# SynFutures TypeScript SDK

The workspace maintains [`@synfutures/perpv3-ts`](packages/perpv3-ts/README.md),
a TypeScript SDK for SynFutures V3 queries, simulations, calldata and contract parsers.

## Development

Use Node.js 24 LTS (pinned in `.nvmrc`) and the pnpm version pinned in `package.json`.
Published SDK runtime support starts at Node.js 22. Access to the configured `@synfutures`
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

Add package changes with `make changeset SUMMARY='Describe the change' BUMP=major`
(or the appropriate bump). `make changeset-dry-run` previews the result.
The workspace has no fixed-version package group; inspect `.changeset/config.json`
and the generated changeset before committing it.

`make version` changes package versions and the lockfile. `make publish` publishes
packages. `make release` performs both operations. The `release:dry` script reports pending changeset status without applying versions.

Replace the local viem-kit override with the released dependency before publishing.
The PerpV3 `prepublishOnly` check rejects a remaining override. Release execution
is separate from local verification.
