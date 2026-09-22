# Development and validation

Run workspace commands from the repository root. The dependency lockfile and
`package.json` scripts define the toolchain; the local viem-kit override and its
provenance in the repository's `vendor/README.md` define this branch's dependency bytes.

| Command                                                | Scope and effects                                               |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                       | installs the locked workspace dependencies                      |
| `pnpm -C packages/perpv3-ts run build:check`           | checks production source types                                  |
| `pnpm -C packages/perpv3-ts run typecheck:public`      | checks public ABI/type fixtures                                 |
| `pnpm -C packages/perpv3-ts run typecheck:examples`    | checks example source                                           |
| `pnpm -C packages/perpv3-ts run typecheck:docs`        | compiles TypeScript documentation examples                      |
| `pnpm -C packages/perpv3-ts run test:unit --runInBand` | runs unit tests, including local HTTP fixtures                  |
| `pnpm -C packages/perpv3-ts run build`                 | rewrites `dist` with ESM/CJS bundles and declarations           |
| `pnpm -C packages/perpv3-ts run verify:consumer`       | checks built tarball exports, types, runtime and browser bundle |
| `pnpm -C packages/perpv3-ts run verify`                | runs the static, unit, build and consumer checks above          |
| `pnpm -C packages/perpv3-ts run test:devnet`           | starts local Anvil and exercises the committed snapshot         |
| `pnpm -C packages/perpv3-ts run test`                  | runs unit and devnet suites                                     |

Live API/RPC parity tests require explicit fixtures and credentials and are skipped
without them. Unit or devnet success does not establish parity with deployed APIs,
production configuration or hardware wallets. Keep dated run counts and logs in
CI output or release records rather than this guide.

## Local devnet

`devnet:check` verifies that the installed contract artifacts and preset match the
committed snapshot metadata. The harness uses pinned Anvil, selects an available
loopback port, loads the local state and isolates tests with snapshot/revert.
Dated futures start from a timestamp derived from the snapshot's expiries.

Run `devnet:regen` only when intentionally refreshing contract artifacts or the
preset; it rewrites snapshot files. A stale-state failure should not be bypassed
by changing expected hashes. Dependency lifecycle scripts can be disabled when
platform binaries are already installed; inspect a missing Anvil binary before
approving its installation script.

## Demos

```sh
pnpm -C packages/perpv3-ts run demo --list
pnpm -C packages/perpv3-ts run demo --help
```

Execution requires explicit `--chain`, `--signer` and `--instrument`; there is no
retired-network or implicit account default. Demos can submit real transactions,
approve tokens and perform cleanup. Listing and help do not load signer settings
or execute a demo. Inspect the selected example and configuration before running
it. Historical `.abc.json` files remain offline numerical fixtures, not supported
live network configuration.
