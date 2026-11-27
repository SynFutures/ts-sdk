import type { Address } from 'viem';
import { encodeDepositTransaction, encodeWithdrawTransaction } from './calldata/account';
import {
    encodeAddLiquidityTransaction,
    encodeAdjustMarginTransaction,
    encodeBatchPlaceScaledLimitOrderTransaction,
    encodeCancelOrderTransaction,
    encodeCrossLimitOrderTransaction,
    encodeFillLimitOrderTransaction,
    encodeLimitOrderTransaction,
    encodeMarketOrderTransaction,
    encodeRemoveLiquidityTransaction,
    encodeSettleTransaction,
} from './calldata/instrument';
import { encodeApproveTransaction, encodePermitTransaction } from './calldata/token';
import type {
    TransactionRoute,
    AddLiquidityEncodingParam,
    AdjustMarginEncodingParam,
    SignedPermit,
    ApproveEncodingParam,
    BatchPlaceScaledLimitOrderEncodingParam,
    CancelOrderEncodingOptions,
    CancelOrderEncodingParam,
    CrossLimitOrderEncodingParam,
    DepositEncodingParam,
    FillLimitOrderEncodingParam,
    IContractCallEncoder,
    LimitOrderEncodingParam,
    MarketOrderEncodingParam,
    RemoveLiquidityEncodingParam,
    SettleEncodingParam,
    TransactionParam,
    WithdrawEncodingParam,
} from './calldata/types';

export * from './calldata/types';

export class ContractCallEncoder implements IContractCallEncoder {
    encodeMarketOrder(param: MarketOrderEncodingParam, options?: TransactionRoute): TransactionParam {
        return encodeMarketOrderTransaction(param, options);
    }

    encodeLimitOrder(param: LimitOrderEncodingParam, options?: TransactionRoute): TransactionParam {
        return encodeLimitOrderTransaction(param, options);
    }

    encodeCancelOrder(param: CancelOrderEncodingParam, options?: CancelOrderEncodingOptions): TransactionParam {
        return encodeCancelOrderTransaction(param, options);
    }

    encodeAdjustMargin(param: AdjustMarginEncodingParam, options?: TransactionRoute): TransactionParam {
        return encodeAdjustMarginTransaction(param, options);
    }

    encodeBatchPlaceScaledLimitOrder(
        param: BatchPlaceScaledLimitOrderEncodingParam,
        options?: TransactionRoute
    ): TransactionParam {
        return encodeBatchPlaceScaledLimitOrderTransaction(param, options);
    }

    encodeCrossLimitOrder(param: CrossLimitOrderEncodingParam, options?: TransactionRoute): TransactionParam {
        return encodeCrossLimitOrderTransaction(param, options);
    }

    encodeFillLimitOrder(param: FillLimitOrderEncodingParam): TransactionParam {
        return encodeFillLimitOrderTransaction(param);
    }

    encodeAddLiquidity(param: AddLiquidityEncodingParam, options: TransactionRoute = {}): TransactionParam {
        return encodeAddLiquidityTransaction(param, options);
    }

    encodeRemoveLiquidity(param: RemoveLiquidityEncodingParam, options: TransactionRoute = {}): TransactionParam {
        return encodeRemoveLiquidityTransaction(param, options);
    }

    encodeSettle(param: SettleEncodingParam): TransactionParam {
        return encodeSettleTransaction(param);
    }

    encodeDeposit(param: DepositEncodingParam, gateAddr: Address, options?: TransactionRoute): TransactionParam {
        return encodeDepositTransaction(param, gateAddr, options);
    }

    encodeWithdraw(param: WithdrawEncodingParam, gateAddr: Address, options?: TransactionRoute): TransactionParam {
        return encodeWithdrawTransaction(param, gateAddr, options);
    }

    encodeApprove(params: ApproveEncodingParam): TransactionParam {
        return encodeApproveTransaction(params);
    }

    encodePermit(permit: SignedPermit): TransactionParam {
        return encodePermitTransaction(permit);
    }
}

export const contractCallEncoder = new ContractCallEncoder();
