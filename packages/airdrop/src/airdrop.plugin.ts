import type { LegacyPluginHost } from '../legacy-plugin-host';
import type { AirdropHost } from './host';
import type { AirdropInterface } from './airdrop.interface';
import { AirdropModule } from './airdrop.module';

export interface AirdropPlugin<Host extends AirdropHost = LegacyPluginHost> {
    airdrop: AirdropInterface<Host>;
}

// The overloads preserve the concrete host for both direct install() and host.use(plugin()).
interface Installer<T extends AirdropHost> {
    install<Host extends T>(host: Host): Host & AirdropPlugin<Host>;
    install(host: T): T & AirdropPlugin<T>;
}

export function airdropPlugin<T extends AirdropHost = AirdropHost>(): Installer<T> {
    return {
        install<Host extends T>(synfV3: Host): Host & AirdropPlugin<Host> {
            const module = new AirdropModule(synfV3);
            return Object.assign(synfV3, { airdrop: module });
        },
    };
}
