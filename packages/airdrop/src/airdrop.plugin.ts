import { AirdropInterface } from './airdrop.interface';
import { SynFuturesV3Interface, SynFutureV3Plugin } from '@synfutures/oyster-sdk2';
import { AirdropModule } from './airdrop.module';

export interface AirdropPlugin {
    airdrop: AirdropInterface;
}

export function airdropPlugin<T extends SynFuturesV3Interface>(): SynFutureV3Plugin<T, AirdropPlugin> {
    return {
        install(synfV3: T): T & AirdropPlugin {
            (synfV3 as any).airdrop = new AirdropModule(synfV3 as any);
            return synfV3 as any as T & AirdropPlugin;
        },
    };
}
