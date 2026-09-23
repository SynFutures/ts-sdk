---
'@synfutures/perpv3-ts': major
---

Remove the public `splitSignature` helper and the SDK's direct `@noble/curves` dependency.
Import `parseSignature` from `viem` instead. It returns `r`, `s` and `yParity`;
`v` is an optional bigint rather than an always-present number. For contracts that
expect the traditional recovery value, pass `yParity + 27` as the numeric `v`.

ERC-20 permit calldata now uses viem parsing directly, normalizes recovery values
0/1 to 27/28, and rejects unsupported recovery values before encoding.
`signErc20PermitTypedData` remains available. Noble remains a transitive dependency
of other packages; this change removes only the SDK's direct dependency.
