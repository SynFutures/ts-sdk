// Compile-only consumer. Model the public use() signature without installing a legacy host.
import { airdropPlugin, type AirdropHost, type TxOptionsWithSigner } from '../packages/airdrop/build';
import { governancePlugin, type GovernanceHost, type GovernanceInterface } from '../packages/oyster-governance/build';
import { governanceDataSourcePlugin } from '../packages/oyster-governance-data-source/build';
import type { GovernanceDataSourceInterface } from '../packages/oyster-governance-data-source/build/modules/governanceDataSource.inteface';

interface Plugin<Host, Extension> {
    install(host: Host): Host & Extension;
}

type ConsumerHost = GovernanceHost &
    AirdropHost & {
        applicationId: string;
        use<U>(plugin: Plugin<ConsumerHost, U>): ConsumerHost & U;
    };

declare const host: ConsumerHost;
declare const signed: TxOptionsWithSigner;
declare const amount: Parameters<GovernanceInterface['stake']>[0];
const airdrop = host.use(airdropPlugin()).airdrop;
const governance = host.use(governancePlugin()).governance;
const graph = host.use(governanceDataSourcePlugin('https://example.invalid')).governanceDataSource;
const hosts: ConsumerHost[] = [
    airdrop.synfV3,
    governance.synfV3,
    graph.synfV3,
    airdropPlugin().install(host).airdrop.synfV3,
    governancePlugin().install(host).governance.synfV3,
    governanceDataSourcePlugin('https://example.invalid').install(host).governanceDataSource.synfV3,
];
const view: GovernanceDataSourceInterface<ConsumerHost> = graph;
const index = 0;
const address = '0x0000000000000000000000000000000000000001';
airdrop.claim(index, '1', address, []).then((tx) => tx.data);
airdrop.claim(address, index, '1', address, [], signed).then((receipt) => receipt.transactionHash);
governance.stake(amount, signed).then((receipt) => receipt.transactionHash);
governance.release(index).then((tx) => tx.data);
view.getCurrentPendingUnstakes(hosts[0].applicationId);

// These bare public annotations predate host inference and still describe the original chain host.
declare const bareAirdrop: import('../packages/airdrop/build/airdrop.interface').AirdropInterface;
declare const bareGovernance: import('../packages/oyster-governance/build/modules/governance.interface').GovernanceInterface;
declare const bareGraph: GovernanceDataSourceInterface;
bareAirdrop.synfV3.init();
bareGovernance.synfV3.useDefault().tx.sendTx({});
const chainId: number = bareGraph.synfV3.ctx.chainId;
bareGraph.synfV3.setProvider(bareGraph.synfV3.ctx.provider);
bareGraph.synfV3.addInitHook(async () => {});
bareGraph.synfV3.addSetProviderHook(() => {});
bareGraph.synfV3.registerQuoteInfo(bareGraph.synfV3.ctx.tokenInfo.values().next().value!);
const gateInterface = bareGraph.synfV3.contracts.gate.interface;
bareGraph.synfV3.use(governanceDataSourcePlugin('https://example.invalid')).governanceDataSource.getHistoryEvents({});

declare const bareAirdropModule: import('../packages/airdrop/build/airdrop.module').AirdropModule;
declare const bareGovernanceModule: import('../packages/oyster-governance/build/modules/governance.module').GovernanceModule;
declare const bareGraphPlugin: import('../packages/oyster-governance-data-source/build/modules/governanceDataSource.plugin').GovernanceDataSourcePlugin;
bareAirdropModule.synfV3.tx.sendTx({});
bareGovernanceModule.synfV3.tx.sendTx({});
bareGraphPlugin.governanceDataSource.synfV3.init();
