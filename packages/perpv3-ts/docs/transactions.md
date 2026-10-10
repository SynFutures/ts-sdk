# Transactions and parsers

Create a `ChainKit` per RPC/workflow when clients or token metadata differ.
Inject the same public client used for reads and simulations. A process-wide
registry is suitable only when a shared default configuration is intended.
Wallets and signer policy belong to the caller; Node-only account helpers are
imported from `@derivation-tech/viem-kit/node`.

## Execute a typed request

The request carries the gate ABI, so the function name and argument tuple are
type-checked. `payload` is the packed deposit parameter returned by the relevant
PerpV3 encoder. The context supplies a configured wallet, public client and
effective chain. Fee, value or nonce options and the wait policy belong to the
caller.

```typescript
import type { Address, Hex } from 'viem';
import { assertTransactionSuccess, sendContractTransaction, type TxContext } from '@derivation-tech/viem-kit';
import { CURRENT_GATE_ABI } from '@synfutures/perpv3-ts/abis';
import { createGateParser } from '@synfutures/perpv3-ts/parsers';

export async function submitDeposit(context: TxContext, gate: Address, payload: Hex) {
    const sent = await sendContractTransaction(
        context,
        {
            address: gate,
            abi: CURRENT_GATE_ABI,
            functionName: 'deposit',
            args: [payload],
            parser: createGateParser(),
        },
        { diagnostics: { timeout: 1_000 } }
    );
    try {
        return assertTransactionSuccess(await sent.receipt);
    } finally {
        await sent.diagnostics;
    }
}
```

A reverted receipt is a completed transaction, not successful execution.
`assertTransactionSuccess` rejects it. Diagnostic work is a separate bounded
promise: awaiting a receipt alone does not mean event/error formatting has
finished. A CLI that needs diagnostic output awaits it before exiting, including
when the receipt assertion throws. Parser or observer failures do not undo an
already-submitted transaction.

Preserve submitted hashes and inspect the viem-kit submission/wait error before
retrying. An ambiguous send outcome requires reconciliation; submitting the same
business action again can duplicate it. Simulation freshness, fee policy, gas
buffering, approvals and persistent reconciliation remain caller responsibilities.

## Signature parsing and permits

Import `parseSignature` directly from viem; the SDK no longer exports
`splitSignature`. viem returns `r`, `s` and `yParity` (0 or 1). Its optional `v`
is a bigint, so do not substitute it directly for the removed helper's numeric `v`.
For contracts expecting the traditional recovery value, use `yParity + 27`:

```typescript
import { parseSignature, type Hex } from 'viem';

declare const signature: Hex;
const { r, s, yParity } = parseSignature(signature);
const v = yParity + 27;
console.log({ r, s, v });
```

`encodeApproveTransaction` with `useApproveFor` performs this conversion when
encoding ERC-20 `permit`: suffixes 0/1 and 27/28 are accepted and encoded as
27/28; other recovery values are rejected before encoding. This is stricter than
the removed helper. `signErc20PermitTypedData` remains the SDK's permit-signing helper.

## Parser ownership

`createInstrumentParser`, `createGateParser`, `createConfigParser` and the other
factories from `/parsers` use the viem-kit typed parser contract.
`createFrontendInstrumentParser` shares instrument transaction/error handling
while retaining UI-specific event descriptions.

Supply `ParserDeps` for token metadata, address labels and RPC queries. Parser
factories do not select a global chain or signer. Decoded errors are discriminated
by `kind`; only custom errors have the corresponding ABI name and arguments.
Register parsers with a kit, pass a request parser directly, or invoke them for
standalone formatting.
