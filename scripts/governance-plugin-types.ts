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
