import { SynFutureV3Plugin, SynFuturesV3Interface } from '@synfutures/oyster-sdk2';
import { GovernanceInterface } from './governance.interface';
import { GovernanceModule } from './governance.module';

export interface GovernancePlugin {
    governance: GovernanceInterface;
}

export function governancePlugin<T extends SynFuturesV3Interface>(): SynFutureV3Plugin<T, GovernancePlugin> {
    return {
        install(synfV3: T): T & GovernancePlugin {
            const plugin = new GovernanceModule(synfV3 as any);
            synfV3.addSetProviderHook(() => plugin.onSetProvider());
            (synfV3 as any).governance = plugin;
            return synfV3 as any as T & GovernancePlugin;
        },
    };
}
