import type { LegacyPluginHost } from '../../legacy-plugin-host';
import type { GovernanceDataSourceInterface } from './governanceDataSource.inteface';
import { GovernanceDataSourceModule } from './governanceDataSource.module';

export interface GovernanceDataSourcePlugin<Host extends object = LegacyPluginHost> {
    governanceDataSource: GovernanceDataSourceInterface<Host>;
}

// The overloads preserve the concrete host for both direct install() and host.use(plugin()).
interface Installer<T extends object> {
    install<Host extends T>(host: Host): Host & GovernanceDataSourcePlugin<Host>;
    install(host: T): T & GovernanceDataSourcePlugin<T>;
}

export function governanceDataSourcePlugin<T extends object = object>(endpoint: string): Installer<T> {
    return {
        install<Host extends T>(synfV3: Host): Host & GovernanceDataSourcePlugin<Host> {
            const module = new GovernanceDataSourceModule(synfV3, endpoint);
            return Object.assign(synfV3, { governanceDataSource: module });
        },
    };
}
