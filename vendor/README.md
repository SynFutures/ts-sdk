# Local SDK dependency

`derivation-tech-viem-kit-85252d4.tgz` is built from viem-kit commit
`85252d4e4cc17b2bfbbbec734a04c7725a96b25f` (package version `0.2.2`).

SHA-256: `0a07e7855c833a974600093eab1d2c7ae52409d5b3693b420dc96c26717fd06e`.

The archive is built from a clean Git snapshot with its frozen lockfile and TypeScript 6.0.3.
Ledger remains a separately installed optional package; its device dependencies are not included.

This unpublished dependency is pinned for reproducible local and CI validation.
Before publishing PerpV3, replace the workspace override and catalog version with the released
viem-kit version and regenerate the lockfile. Do not publish with the relative
file dependency.
