# SynFutures TypeScript SDK

TypeScript SDKs for SynFutures perpetual contracts, governance, and token distributions.

## 📦 Packages

### `@synfutures/perpv3-ts`

TypeScript SDK for simulating and interacting with SynFutures V3 Perpetual Contracts.

**Key Features:**

- 🚀 **Type-Safe** - Full TypeScript support with type definitions
- 🔧 **Viem Integration** - Built on top of viem for Ethereum interactions
- 📦 **Modular** - Clean, modular architecture
- 🎯 **Contract-First** - Types mirror Solidity contracts exactly
- 💼 **Simulation API** - Class-based input classes for trade, order, and range operations
- 🔄 **Unified Queries** - Single API for fetching data from RPC or API endpoints
- ✅ **Validation Helpers** - Comprehensive helper methods for order placement, position management, and range operations
- 🎬 **Demo Framework** - Built-in demo framework for testing and examples

See [packages/perpv3-ts/README.md](./packages/perpv3-ts/README.md) for detailed documentation and usage examples.

### Governance and airdrops

| Package                                     | Entry points and capabilities                                                                                                                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@synfutures/airdrop`                       | `airdropPlugin()`, the Merkle distributor ABI and ethers v5 factory, chain addresses, and the claim event parser. Supports both `isClaimed(index)` and `isClaimed(distributor, index)`, with the same two forms for `claim`. |
| `@synfutures/oyster-governance`             | `governancePlugin()` installs the vault and token clients, staking reads and transactions, boost and voting power simulations, and the provider change hook.                                                                 |
| `@synfutures/oyster-governance-data-source` | `governanceDataSourcePlugin(endpoint)` installs the governance subgraph client for paged or cursor-based event history, pending withdrawals, and last unstake time.                                                          |
| `@synfutures/governance-sdk`                | The signer-based governance client and the provider-scoped unsigned client at `/tge`. [Client documentation](./packages/governance-sdk/README.md)                                                                            |

The three Oyster plugins install on an ethers v5 `SynFuturesV3` host. Their original package names and `build/*` and `src/*` import paths are available from this workspace. For example, applications that supply a signer to a plugin transaction receive the host's transaction receipt.

## 🛠️ Development

### Install Dependencies

```shell
pnpm deps
```

### Build All Packages

```shell
pnpm run nx
```

### Lint & Format

```shell
pnpm run lint
pnpm run format
```

### Clean Build Artifacts

```shell
pnpm run clean
```

### Run Tests

```shell
pnpm test
```

### Release Workflow

- `make changeset SUMMARY='Describe the change' [BUMP=patch]` writes a non-interactive changeset. When generating a changeset, omitting `PACKAGES` automatically includes every workspace package at the specified bump type (default is `patch`). Supply `PACKAGES='pkg:major,...'` only when you need different bumps per package. Use `SUMMARY_FILE=path/to/message.md` if you prefer writing the summary in a file.
- `make changeset-dry-run …` previews the generated markdown without touching the `.changeset` directory.
- `make version` runs `pnpm changeset version` and refreshes the lockfile via `pnpm install`.
- `make publish` calls `pnpm changeset publish`.
- `make release` performs `make version` followed by `make publish`.
- Export `SLACK_WEBHOOK_URL` (and optionally `SLACK_MESSAGE_SUFFIX`) so the postpublish hook can notify Slack after each package is published.

## 🏗️ Project Structure

```
ts-sdk/
├── packages/
│   ├── airdrop/
│   ├── governance-sdk/
│   ├── oyster-governance/
│   ├── oyster-governance-data-source/
│   └── perpv3-ts/          # SynFutures V3 Perpetual Contracts SDK
├── scripts/                # Build and release scripts
├── templates/              # Package templates
├── package.json            # Workspace configuration
└── README.md               # This file
```

## 🔧 Adding New Packages

To add a new package to the workspace:

```shell
pnpm run init -- packageName
```

## 📦 Publishing

To publish a package:

1. Navigate to the package directory:

    ```shell
    cd packages/your-package
    ```

2. Run the publish command:
    ```shell
    pnpm run publish
    ```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Ensure code quality with `pnpm run lint` and `pnpm run format`
5. Add tests if applicable
6. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🔗 Links

- [Viem Documentation](https://viem.sh/)
- [Perpv3-ts Package Documentation](./packages/perpv3-ts/README.md)
- [Examples](./packages/perpv3-ts/examples/)
