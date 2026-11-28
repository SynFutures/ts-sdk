import { LogDescription, ParamType, TransactionDescription } from '@ethersproject/abi';
import { ErrorDescription } from '@ethersproject/abi/lib/interface';
import { ContractParser } from '../legacy-host-types/core/tx/parser';
import { formatWad } from '../legacy-host-types/core/util/common';
import { SynFuturesStakingVault__factory } from './typechain';

export class SynFuturesStakingVaultParser extends ContractParser {
    constructor() {
        super(SynFuturesStakingVault__factory.createInterface());
    }

    async parseBaseParam(
        _description: TransactionDescription | LogDescription | ErrorDescription,
        param: ParamType,
        data: any
    ): Promise<string> {
        switch (param.name) {
            case 'amount':
            case 'totalStaking':
            case 'totalPending':
                return formatWad(data);
            default:
                return data.toString();
        }
    }
}
