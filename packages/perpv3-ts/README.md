# SynFutures V3 TypeScript SDK

`@synfutures/perpv3-ts` reads market and portfolio data, simulates trades and
liquidity changes, builds typed calldata, and formats contract transactions,
events and errors. Transaction execution uses viem-kit; callers own wallets,
RPC selection, approvals and receipt-success decisions.

## Installation

```sh
pnpm add @synfutures/perpv3-ts viem
```

This refactor branch uses an unpublished viem-kit tarball. To validate this branch,
install the repository with `pnpm install --frozen-lockfile`; installing the last
published PerpV3 version does not install these changes. See the
[development guide](docs/development.md).

## Simulate a trade

The caller supplies a matching RPC configuration, instrument and portfolio owner.
A single snapshot supplies both position state and the quotation for the signed
trade size. This function simulates; it does not submit a transaction.

```typescript
import { parseUnits, type Address } from 'viem';
import { PerpClient } from '@synfutures/perpv3-ts';
import { TradeInput, QuotationWithSize } from '@synfutures/perpv3-ts/actions';
import { PERP_EXPIRY, Side, UserSetting } from '@synfutures/perpv3-ts/types';
import { WAD } from '@synfutures/perpv3-ts/constants';
import type { RpcConfig } from '@synfutures/perpv3-ts/queries';

export async function simulateLongTrade(rpc: RpcConfig, instrument: Address, trader: Address) {
    const settings = new UserSetting(10, 10, 3n * WAD, 1);
    const client = new PerpClient(rpc, settings, instrument, PERP_EXPIRY);
    const size = parseUnits('1', 18);
    const snapshot = await client.getSnapshot(trader, size);
    if (!snapshot.quotation) throw new Error('Snapshot has no quotation');
    const input = new TradeInput(trader, size, Side.LONG);
    return input.simulate(snapshot, new QuotationWithSize(size, snapshot.quotation), settings);
}
```

`trader` is the account that owns the portfolio. For relayed `tradeFor`/`placeFor`
calls it can differ from the transaction sender. Use `getPerpInfo(chainId)` for
built-in deployment addresses; unsupported chains throw instead of selecting a
fallback deployment.

## Choose an entry point

| Entry                           | Responsibility                                      |
| ------------------------------- | --------------------------------------------------- |
| package root                    | `PerpClient`, deployment lookup and public exports  |
| `/actions`                      | trade, order, range and margin simulation inputs    |
| `/types`, `/constants`, `/math` | domain models, units and numerical operations       |
| `/queries`                      | API/RPC reads and query configuration               |
| `/apis`                         | HTTP modules and WebSocket clients                  |
| `/frontend`                     | typed requests, calldata and presentation utilities |
| `/parsers`                      | viem-kit contract parser factories                  |
| `/abis`                         | contract ABI definitions                            |
| `/utils`                        | encoding, conversion, formatting and HTTP utilities |

ESM and CommonJS consumers receive their corresponding declaration files.
Browser imports do not load viem-kit Node signer or Ledger tooling.

## Guides

- [Queries and data boundaries](docs/data.md): configuration, fallback, decoding and subscriptions.
- [Simulation and units](docs/simulation.md): action families, validations and calldata.
- [Transactions and parsers](docs/transactions.md): typed execution, revert handling and diagnostics.
- [Development](docs/development.md): checks, local Anvil tests and demo execution.
