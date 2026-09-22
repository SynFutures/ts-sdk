# Local SDK dependency

`derivation-tech-viem-kit-a29a081.tgz` is built from viem-kit commit
`a29a081c42cf61614825da0335055e0640eb91e4` (package version `0.2.2`).

SHA-256: `5dbd4f310b80cf2e7cad35663b712cf1137c67bde0abbca7cac788f55a27c990`.

The archive is built from a clean Git snapshot with its frozen lockfile. It excludes
uncommitted Ledger dependency migration work.

This unpublished dependency is pinned for reproducible local and CI validation.
Before publishing PerpV3, replace the workspace override and catalog version with the released
viem-kit version and regenerate the lockfile. Do not publish with the relative
file dependency.
