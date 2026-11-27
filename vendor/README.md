# Local SDK dependency

`derivation-tech-viem-kit-1.0.0-rc.5.tgz` is packed from the viem-kit
`refactor/viem-kit-core-hardening` branch at commit
`6ef27ca7122411f8d5a4cba5c203a14a2093348d`. The package version in the archive is set to `1.0.0-rc.5`.

SHA-256: `c8c4ded4d8e59c38c5d1c900ceba63095bde4b931cf4f2d49e7cf6df357371f2`.

When viem-kit changes, rebuild the archive from a committed revision and update the
revision and SHA-256 above. Ledger remains a separately installed optional package; its
device dependencies are not included.

This unpublished dependency is pinned for reproducible local and CI validation.
Before publishing PerpV3, replace the workspace override and catalog version with the
released viem-kit version and regenerate the lockfile. `prepublishOnly` rejects the
local override and any direct `link:` or `file:` viem-kit dependency.

For local development against a viem-kit checkout, point the override at
`link:<absolute path>/packages/viem-kit` and run `pnpm install`. Do not commit that override.
