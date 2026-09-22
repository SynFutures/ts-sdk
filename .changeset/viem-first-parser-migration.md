---
'@synfutures/perpv3-ts': major
---

Migrate contract parsers to the typed parser API and remove legacy parser compatibility.

Instrument parser transaction and error handling are now shared between the standard and frontend parser entrypoints, and the smaller parser modules no longer depend on legacy formatter or broad transaction helper types.

The package integrates the refactored viem-kit API; its local tarball is pinned for validation until a release version is selected. Typed calldata requests preserve viem ABI argument inference, and PerpV3 contract parsers participate in transaction, event, and decoded-error lifecycle handling. Request builders return only their constructed ABI call fields; add transaction options with object spread instead of assigning them onto the builder result.

HTTP and WebSocket payloads now fail fast when required fields have invalid runtime shapes instead of widening unchecked wire data into domain types. MM instrument `minMarginAmount` and `tip` values are exposed as `bigint` to match their decoded runtime representation.

| Removed helper family    | Replacement                 |
| ------------------------ | --------------------------- |
| MM helpers               | `MarketMakerModule` methods |
| signed market helpers    | `MarketModule` methods      |
| public portfolio helpers | `PublicModule` methods      |
| token helpers            | `TokenModule` methods       |
| history helpers          | `HistoryModule` methods     |

Remove retired ABC deployment defaults and require explicit demo execution settings. Await receipt diagnostics separately, assert reverted receipts in examples, and restrict automatic HTTP retries to read-only requests.

Correct CommonJS declaration exports and validate actual tarballs through ESM, CJS, browser and ABI-aware type fixtures. Usage and development guides include typechecked TypeScript examples.
