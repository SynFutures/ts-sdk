# SynFutures TypeScript SDK

TypeScript SDK monorepo for SynFutures V3 Perpetual Contracts.

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

## 🛠️ Development

### Install Dependencies

```shell
pnpm deps
```

### Build All Packages

```shell
pnpm run build
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

- `make changeset SUMMARY='Describe the change' [BUMP=patch]` writes a non-interactive changeset. With our fixed-version setup, omitting `PACKAGES` automatically includes every workspace package at the specified bump type (default is `patch`). Supply `PACKAGES='pkg:major,...'` only when you need different bumps per package. Use `SUMMARY_FILE=path/to/message.md` if you prefer writing the summary in a file.
- `make changeset-dry-run …` previews the generated markdown without touching the `.changeset` directory.
- `make version` runs `pnpm changeset version` and refreshes the lockfile via `pnpm install`.
- `make publish` calls `pnpm changeset publish`.
- `make release` performs `make version` followed by `make publish`.
- Export `SLACK_WEBHOOK_URL` (and optionally `SLACK_MESSAGE_SUFFIX`) so the postpublish hook can notify Slack after each package is published.

## 🏗️ Project Structure

```
ts-sdk/
├── packages/
│   └── perpv3-ts/          # SynFutures V3 Perpetual Contracts SDK
├── scripts/                # Build and release scripts
├── templates/              # Package templates
├── package.json            # Workspace configuration
└── README.md               # This file
```

## 🔧 Adding New Packages

To add a new package to the workspace:

```shell
./scripts/init.sh packageName
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
