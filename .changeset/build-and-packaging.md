---
'@synfutures/perpv3-ts': patch
---

Build the SDK with TypeScript 7 and tsdown. Node ESM and CommonJS consumers share
the same constructors across public entry points, including errors used with
`instanceof`. Bundlers can still select the ESM browser entry points.

HTTP requests use native `fetch`. The SDK uses viem 2.58.7 and accepts ws ^8.23.0
as an optional peer. Expiry formatting uses native UTC dates.
