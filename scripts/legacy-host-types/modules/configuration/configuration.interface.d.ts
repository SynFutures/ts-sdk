import type { BaseInterface, InstrumentIdentifier, SynFuturesConfig } from '../../types';
export interface ConfigurationInterface extends BaseInterface {
    config: SynFuturesConfig;
    update(): Promise<void>;
    isInverse(instrument: string): Promise<boolean>;
    isInverseByIdentifier(instrument: InstrumentIdentifier): Promise<boolean>;
}
