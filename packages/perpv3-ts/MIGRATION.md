# Migrating from PerpV3 0.2.8

This guide describes the refactor's API changes. Local validation pins an
unpublished viem-kit tarball through the workspace override. Replace that override
and set the released dependency version before publishing PerpV3; the package's
unchanged version number does not identify a published refactor release.

## Typed parsers and calldata

Replace formatter compatibility APIs with `create*Parser` factories from `/parsers`
or the frontend instrument parser from `/frontend`. Parsers receive typed
transaction/event envelopes and discriminated decoded errors. Do not read custom
error fields before narrowing `error.kind`.

Use `createInstrumentWriteRequest`, `createGateWriteRequest`,
`createRouterWriteRequest` or `createTokenWriteRequest` for ABI-aware writes.
Invalid method/argument combinations fail typechecking. Builders return only the
ABI call fields they construct; add fee/value options with object spread instead
of assigning optional transaction fields onto the builder result. Fee, nonce and wait policy
continue to belong to the caller. See [transactions](docs/transactions.md) for the
separate receipt and diagnostics promises and explicit revert checks.

## API modules and strict decoding

| Removed standalone helper family | Replacement from `/apis` |
| -------------------------------- | ------------------------ |
| MM helpers                       | `MarketMakerModule`      |
| signed market helpers            | `MarketModule`           |
| public portfolio helpers         | `PublicModule`           |
| token helpers                    | `TokenModule`            |
| history helpers                  | `HistoryModule`          |

HTTP and WebSocket responses are validated at their boundary. Invalid required
fields now throw or reach the stream error handler instead of entering the domain
model unchecked. Review callers that depended on permissive malformed values.
MM instrument `minMarginAmount` and `tip` are `bigint`. Serialize them explicitly
when crossing JSON boundaries.

Automatic HTTP 5xx retry applies only to GET, HEAD and OPTIONS. Write requests
are not repeated automatically. Handle ambiguous write outcomes in the caller.

## Configuration and retired defaults

Pass workflow-owned clients and metadata to `ChainKit`; import Node signer helpers
from `@derivation-tech/viem-kit/node`. ABC deployment lookup and live ABC parity
coverage have been removed. Historical offline snapshots remain test data.
Demos require an explicit chain, signer and instrument.

The viem-kit dependency no longer supplies ABC, Goerli/bArtio token defaults or
fixed addresses for local chain 31337. Register local deployment token metadata
explicitly. Anvil support remains available.

## Package consumers

ESM uses `.d.ts` declarations and CommonJS uses `.d.cts` declarations. The public
subpaths are listed in [README](README.md#choose-an-entry-point); source-internal
paths are not a compatibility contract. Validate a real tarball rather than a
source link, especially when an unpublished dependency keeps the same version.

To roll back an application migration, restore its previous package pin and matching
call-site changes together. Retain the refactor migration until the replacement
release and consumer validation are complete.
