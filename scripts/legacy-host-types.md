# Compatibility host declarations

`legacy-plugin-host.d.ts` and `legacy-host-types/modules`, `types`, and `enum.d.ts` describe the ethers v5 host published in `@synfutures/oyster-sdk2@0.0.83` under `build/core.d.ts`, `build/modules`, `build/types`, and `build/enum.d.ts`. The ten contract bindings in `legacy-host-types/contracts` come from `build/typechain` of `@synfutures/oyster-abi@0.0.3`. Their ethers types resolve through the public ethers v5 package.

Each compatibility plugin ships these declarations alongside its own code. Edit the files here before building or packing. The build copies them into the package, and `pnpm run test:plugin-types` checks consumer calls and overloads.
