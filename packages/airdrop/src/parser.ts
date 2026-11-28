import { ContractParser, formatWad } from '@derivation-tech/web3-core';
import { Airdrop__factory } from './typechain';
import { LogDescription, TransactionDescription } from '@ethersproject/abi';
import { ErrorDescription } from '@ethersproject/abi/lib/interface';
import { ParamType } from 'ethers/lib/utils';

export class AirdropParser extends ContractParser {
    constructor() {
        super(Airdrop__factory.createInterface());
    }

    async parseBaseParam(
        _description: TransactionDescription | LogDescription | ErrorDescription,
        param: ParamType,
        data: any
    ): Promise<string> {
        switch (param.name) {
            case 'amount':
                return formatWad(data);
            default:
                return data.toString();
        }
    }
}
