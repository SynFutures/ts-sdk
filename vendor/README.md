# Local SDK dependency

`derivation-tech-viem-kit-1.0.0-rc.0.tgz` is packed from the viem-kit
`refactor/viem-kit-core-hardening` branch at commit
`6c0c7c4c33d5e8edcf9fe524805502833540475c`. The package version in the archive is set to `1.0.0-rc.0`.

SHA-256: `46ddd53a42972bb385133addab514748c6f13cb86c18b64679718cf2d845419d`.

When viem-kit changes, rebuild the archive from a committed revision and update the
revision and SHA-256 above. Ledger remains a separately installed optional package; its
device dependencies are not included.

This unpublished dependency is pinned for reproducible local and CI validation.
Before publishing PerpV3, replace the workspace override and catalog version with the
released viem-kit version and regenerate the lockfile. `prepublishOnly` rejects the
local override and any direct `link:` or `file:` viem-kit dependency.

For local development against a viem-kit checkout, point the override at
`link:<absolute path>/packages/viem-kit` and run `pnpm install`. Do not commit that override.
