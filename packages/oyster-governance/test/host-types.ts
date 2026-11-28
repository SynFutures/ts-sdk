// The host can pass nominal v5 classes across the plugin boundary in either direction.
import type { ChainContext, ContractParser } from '@derivation-tech/web3-core';
import type { LegacyPluginHost } from '../legacy-plugin-host';
import type { SynFuturesStakingVaultParser } from '../build/parser';

declare const host: ChainContext;
declare const plugin: LegacyPluginHost;
declare const parser: SynFuturesStakingVaultParser;
const pluginContext: LegacyPluginHost['ctx'] = host;
const originalContext: ChainContext = plugin.ctx;
const originalParser: ContractParser = parser;
void [pluginContext, originalContext, originalParser];
