# Development and validation

Run workspace commands from the repository root. The dependency lockfile and
`package.json` scripts define the toolchain (Node.js 24 LTS from `.nvmrc`, pinned pnpm 10).
Run `nvm install && nvm use` before workspace commands; CI and release read the same Node version file.
Published SDK runtime support remains Node.js 18 or later. The local viem-kit override and its
provenance in the repository's `vendor/README.md` define this branch's dependency bytes.

| Command                                                | Scope and effects                                               |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| `pnpm run build`                                       | builds workspace packages in dependency order                   |
| `pnpm install --frozen-lockfile`                       | installs the locked workspace dependencies                      |
| `pnpm -C packages/perpv3-ts run build:check`           | checks production source types                                  |
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
A selected live test fails on missing configuration or request errors.

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
preset; it rewrites snapshot files. A stale-state failure should not be bypassed
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
