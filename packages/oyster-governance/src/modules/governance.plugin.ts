import type { GovernanceHost } from '../host';
import type { GovernanceInterface } from './governance.interface';
import { GovernanceModule } from './governance.module';

export interface GovernancePlugin<Host extends GovernanceHost = GovernanceHost> {
    governance: GovernanceInterface<Host>;
}

// The overloads preserve the concrete host for both direct install() and host.use(plugin()).
interface Installer<T extends GovernanceHost> {
    install<Host extends T>(host: Host): Host & GovernancePlugin<Host>;
    install(host: T): T & GovernancePlugin<T>;
}

export function governancePlugin<T extends GovernanceHost = GovernanceHost>(): Installer<T> {
    return {
        install<Host extends T>(synfV3: Host): Host & GovernancePlugin<Host> {
            const module = new GovernanceModule(synfV3);
            synfV3.addSetProviderHook(() => module.onSetProvider());
            return Object.assign(synfV3, { governance: module });
        },
    };
}
