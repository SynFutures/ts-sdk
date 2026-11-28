# Local SDK dependency

`derivation-tech-viem-kit-1.0.0-rc.6.tgz` is packed from the viem-kit
`refactor/viem-kit-core-hardening` branch at commit
`b64448354a8698591a041d3f2ddfeae68e6a4ed5`. The package version in the archive is set to `1.0.0-rc.6`.

SHA-256: `c74e4858bb24aa5e5df3a9ac3659540d1a6a2f3ee7303200a19c314bbe26c1f4`.

When viem-kit changes, rebuild the archive from a committed revision and update the
revision and SHA-256 above. Ledger remains a separately installed optional package; its
device dependencies are not included.

This unpublished dependency is pinned for reproducible local and CI validation.
Before publishing PerpV3, replace the workspace override and catalog version with the
released viem-kit version and regenerate the lockfile. `prepublishOnly` rejects the
local override and any direct `link:` or `file:` viem-kit dependency.

For local development against a viem-kit checkout, point the override at
`link:<absolute path>/packages/viem-kit` and run `pnpm install`. Do not commit that override.
