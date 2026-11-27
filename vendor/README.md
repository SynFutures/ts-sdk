# Local SDK dependency

`derivation-tech-viem-kit-1.0.0-rc.4.tgz` is packed from the viem-kit
`refactor/viem-kit-core-hardening` branch at commit
`4957887148d1478d6e4b9df3cfc2d4e7a5411bc6`. The package version in the archive is set to `1.0.0-rc.4`.

SHA-256: `cd72c5233eeec3d13b786caf0ed70ff58917066778202205e5ed696e0c183278`.

When viem-kit changes, rebuild the archive from a committed revision and update the
revision and SHA-256 above. Ledger remains a separately installed optional package; its
device dependencies are not included.

This unpublished dependency is pinned for reproducible local and CI validation.
Before publishing PerpV3, replace the workspace override and catalog version with the
released viem-kit version and regenerate the lockfile. `prepublishOnly` rejects the
local override and any direct `link:` or `file:` viem-kit dependency.

For local development against a viem-kit checkout, point the override at
`link:<absolute path>/packages/viem-kit` and run `pnpm install`. Do not commit that override.
