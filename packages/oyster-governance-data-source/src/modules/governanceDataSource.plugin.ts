import { SynFutureV3Plugin, SynFuturesV3Interface } from '@synfutures/oyster-sdk2';
import { GovernanceDataSourceInterface } from './governanceDataSource.inteface';
import { GovernanceDataSourceModule } from './governanceDataSource.module';

export interface GovernanceDataSourcePlugin {
    governanceDataSource: GovernanceDataSourceInterface;
}

export function governanceDataSourcePlugin<T extends SynFuturesV3Interface>(
    endpoint: string
): SynFutureV3Plugin<T, GovernanceDataSourcePlugin> {
    return {
        install(synfV3: T): T & GovernanceDataSourcePlugin {
            (synfV3 as any).governanceDataSource = new GovernanceDataSourceModule(synfV3 as any, endpoint);
            return synfV3 as any as T & GovernanceDataSourcePlugin;
        },
    };
}
