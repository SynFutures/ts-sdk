# Development and validation

Run workspace commands from the repository root. The dependency lockfile and
`package.json` scripts define the toolchain (Node.js 24 LTS from `.nvmrc`, pinned pnpm 10).
Run `nvm install && nvm use` before workspace commands; CI and release read the same Node version file.
Published SDK runtime support remains Node.js 22 or later. CI executes the packed ESM/CJS
consumer on Node 22 to check the lowest supported major version; development and release tools use Node 24. The local viem-kit override and its
provenance in the repository's `vendor/README.md` define this branch's dependency bytes.

| Command                                                | Scope and effects                                               |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| `pnpm run build`                                       | builds workspace packages in dependency order                   |
| `pnpm install --frozen-lockfile`                       | installs the locked workspace dependencies                      |
| `pnpm -C packages/perpv3-ts run build:check`           | checks production source types                                  |
| `pnpm -C packages/perpv3-ts run typecheck:build`       | checks the tsdown build configuration                           |
| `pnpm -C packages/perpv3-ts run typecheck:tests`       | checks all unit, devnet and live test source types              |
| `pnpm -C packages/perpv3-ts run typecheck:tools`       | checks devnet regeneration scripts without executing them       |
| `pnpm -C packages/perpv3-ts run typecheck:public`      | checks public ABI/type fixtures                                 |
| `pnpm -C packages/perpv3-ts run typecheck:examples`    | checks example source                                           |
| `pnpm -C packages/perpv3-ts run typecheck:docs`        | compiles TypeScript documentation examples                      |
| `pnpm -C packages/perpv3-ts run test:unit --runInBand` | runs unit tests, including local HTTP fixtures                  |
| `pnpm -C packages/perpv3-ts run build`                 | rewrites `dist` with ESM/CJS bundles and declarations           |
| `pnpm -C packages/perpv3-ts run verify:consumer`       | checks built tarball exports, types, runtime and browser bundle |
| `pnpm -C packages/perpv3-ts run verify`                | runs the static, unit, build and consumer checks above          |
| `pnpm -C packages/perpv3-ts run test:devnet`           | starts local Anvil and exercises the committed snapshot         |
| `pnpm -C packages/perpv3-ts run test`                  | runs unit and devnet suites                                     |

Workspace tasks run through pnpm scripts. tsdown builds the 11 public entries with
shared chunks and bundled declarations, preserving `.mjs`/`.cjs` and `.d.ts`/`.d.cts`
exports. Runtime dependencies remain external; sourcemaps omit embedded source contents. ESLint 10 uses the root `eslint.config.mjs` flat config
for code checks; TypeScript checks types, and Prettier owns formatting. ESLint uses
TypeScript project services to check unhandled and misused Promises in handwritten SDK
source and examples. Explicit `any` and unused variables are errors; only test and
typecheck fixtures allow deliberately unused values. Lint commands fail on warnings. CI runs workspace lint
and `format:check` before package verification. The workspace owns one pinned Prettier version;
`pnpm run format` formats maintained source, configuration and documentation. Generated ABIs,
fixed fixtures and devnet snapshots are excluded.

TypeScript 6.0.3 is pinned once in the workspace catalog. Source, examples, tools,
tests and documentation snippets use explicit source roots and ambient types.
Path mappings resolve relative to their config (or use absolute paths for generated
documentation checks); no compiler `baseUrl` or deprecation suppression is needed.
The bundled SDK uses `Bundler` resolution; directly emitted package scaffolds use
`NodeNext`. Build-config checks use `--ignoreConfig` when passing a file to `tsc`.

Tests have three explicit scopes under `src/tests`:

- `unit/`: offline behavior and numerical fixtures; HTTP fixtures use loopback servers.
- `devnet/`: local Anvil integration against the committed deployment snapshot.
- `live/`: opt-in API/RPC checks, excluded from `test:unit`, `test` and CI verification.

Run live checks with `pnpm -C packages/perpv3-ts run test:live --runTestsByPath <test-path>`.
`live/observer.test.ts` requires `PERPV3_RPC_URL`, `PERPV3_CHAIN_ID` and
`PERPV3_INSTRUMENT`; `PERPV3_EXPIRY` defaults to perpetual and `PERPV3_OBSERVER`
can override the built-in deployment. `live/apiRpcParity.test.ts` requires a
non-empty `SIMULATE_PARITY_FIXTURE` matching the scenario types in
`src/tests/live/apiRpcParity/types.ts`, plus its explicit RPC/API settings.
A selected live test fails on missing configuration or request errors. API/RPC parity pins RPC
reads to the API snapshot height and compares independently simulated results, including funding
indices. A scenario block number must match that height; moving block tags are rejected.

Unit or devnet success does not establish parity with deployed APIs, production
configuration or hardware wallets. Keep dated run counts and logs in CI output
or release records rather than this guide.

## Local devnet

`devnet:check` verifies that the installed contract artifacts and preset match the
committed snapshot metadata. The harness uses pinned Anvil, assigns a separate loopback port to each run,
loads the local state and isolates tests with snapshot/revert. Workers receive
the started RPC through the run environment; they never fall back to a fixed port.
Teardown stops only the child process owned by that run.
Dated futures start from a timestamp derived from the snapshot's expiries.

Run `devnet:regen` only when intentionally refreshing contract artifacts or the
preset; it stages state, manifest and metadata before replacing the snapshot files.
Caught publication failures restore the prior files; abrupt process or machine failure during
the multi-file replacement is not crash-atomic. Use `devnet:regen -- --output-dir <directory>`
to inspect a separate snapshot without replacing the committed one. A stale-state failure should not be bypassed
by changing expected hashes. Dependency lifecycle scripts can be disabled when
platform binaries are already installed; inspect a missing Anvil binary before
approving its installation script.

## Adding a package

Run `bash scripts/init.sh package-name` from the workspace root. The scaffolder
refuses existing targets and creates source/test directories, a manifest, README
and TypeScript configuration links. Add source and tests, install the declared
dependencies, then run the generated package's build and tests. Edit `templates/`
when changing future scaffolds; existing packages are not regenerated.

## Demos

```sh
pnpm -C packages/perpv3-ts run demo --list
pnpm -C packages/perpv3-ts run demo --help
```

Execution requires explicit `--chain`, `--signer` and `--instrument`; there is no
retired-network or implicit account default. Demos can submit real transactions,
approve tokens and perform cleanup. Listing and help do not load signer settings
or execute a demo. Inspect the selected example and configuration before running
it. Numerical fixtures use synthetic addresses and network-independent names. They
preserve fixed regression inputs and expectations without selecting a live chain.

## Published package checks

`verify:consumer` checks the existing build through one `pnpm pack` tarball, with
lifecycle hooks disabled. It runs strict `publint` and `attw --profile node16`, then
compiles and executes ESM/CJS consumers, checks all public entries and shared class/logger
identity, and bundles a browser consumer using a direct esbuild dependency.
TypeScript consumers must use exports-aware resolution (`Node16`, `NodeNext` or
`Bundler`); legacy `node10` resolution is not supported. The attw profile still checks
both CJS and ESM under Node16 resolution and bundler resolution.

Set `PERPV3_CONSUMER_NODE` to an absolute Node executable path to run the packed
consumer on another supported runtime. Package-check tools and TypeScript continue
to run on the development Node version.

## Release tooling

Create a changeset with
`pnpm changeset add --patch @synfutures/perpv3-ts --message 'Describe the change'`
from the workspace root. Choose `--minor` or `--major` when appropriate and review
the generated file before committing it.

Changesets 3 and `changesets/action@v2` share the root release commands:

- `pnpm run release:dry` reports the pending version plan without applying it.
- `pnpm run release:version` applies changesets and refreshes
  only the lockfile with lifecycle scripts disabled. It changes package versions,
  changelogs and the lockfile. With no pending changesets, Changesets exits with code 1
  and the command stops before refreshing the lockfile.
- `pnpm run release` publishes packages. Versioning and publishing require release authorization.

The workflow uses the v2 inputs `version-script`, `publish-script` and `github-token`.
A temporary npm config preserves both private registry scopes (`@synfutures` and
`@derivation-tech`). Its token is supplied through `NODE_AUTH_TOKEN` only to the
install and release steps, because installing the private contract artifacts also
requires authentication. Verification steps do not receive the registry token.

Changesets 3 skips private-package versioning by default and defaults peer-dependent
bumps to patch. Describe incompatible public changes with an explicit changeset;
do not rely on a peer dependency update to select a breaking release. Keep the
local viem-kit override's publication guard until the dependency is released.
