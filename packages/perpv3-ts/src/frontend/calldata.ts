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
import { encodeApproveTransaction } from './calldata/token';
import type {
    AddLiquidityEncodingOptions,
    AddLiquidityEncodingParam,
    AdjustMarginEncodingOptions,
    AdjustMarginEncodingParam,
    ApproveEncodingOptions,
    ApproveEncodingParam,
    BatchPlaceScaledLimitOrderEncodingOptions,
    BatchPlaceScaledLimitOrderEncodingParam,
    CancelOrderEncodingOptions,
    CancelOrderEncodingParam,
    CrossLimitOrderEncodingOptions,
    CrossLimitOrderEncodingParam,
    DepositEncodingOptions,
    DepositEncodingParam,
    FillLimitOrderEncodingParam,
    IContractCallEncoder,
    LimitOrderEncodingOptions,
    LimitOrderEncodingParam,
    MarketOrderEncodingOptions,
    MarketOrderEncodingParam,
    RemoveLiquidityEncodingOptions,
    RemoveLiquidityEncodingParam,
    SettleEncodingParam,
    TransactionParam,
    WithdrawEncodingOptions,
    WithdrawEncodingParam,
} from './calldata/types';

export * from './calldata/account';
export * from './calldata/instrument';
export * from './calldata/requests';
export * from './calldata/token';
export * from './calldata/types';

export class ContractCallEncoder implements IContractCallEncoder {
    encodeMarketOrder(param: MarketOrderEncodingParam, options?: MarketOrderEncodingOptions): TransactionParam {
        return encodeMarketOrderTransaction(param, options);
    }

    encodeLimitOrder(param: LimitOrderEncodingParam, options?: LimitOrderEncodingOptions): TransactionParam {
        return encodeLimitOrderTransaction(param, options);
    }

    encodeCancelOrder(param: CancelOrderEncodingParam, options?: CancelOrderEncodingOptions): TransactionParam {
        return encodeCancelOrderTransaction(param, options);
    }

    encodeAdjustMargin(param: AdjustMarginEncodingParam, options?: AdjustMarginEncodingOptions): TransactionParam {
        return encodeAdjustMarginTransaction(param, options);
    }

    encodeBatchPlaceScaledLimitOrder(
        param: BatchPlaceScaledLimitOrderEncodingParam,
        options?: BatchPlaceScaledLimitOrderEncodingOptions
    ): TransactionParam {
        return encodeBatchPlaceScaledLimitOrderTransaction(param, options);
    }

    encodeCrossLimitOrder(
        param: CrossLimitOrderEncodingParam,
        options?: CrossLimitOrderEncodingOptions
    ): TransactionParam {
        return encodeCrossLimitOrderTransaction(param, options);
    }

    encodeFillLimitOrder(param: FillLimitOrderEncodingParam): TransactionParam {
        return encodeFillLimitOrderTransaction(param);
    }

    encodeAddLiquidity(param: AddLiquidityEncodingParam, options: AddLiquidityEncodingOptions = {}): TransactionParam {
        return encodeAddLiquidityTransaction(param, options);
    }

    encodeRemoveLiquidity(
        param: RemoveLiquidityEncodingParam,
        options: RemoveLiquidityEncodingOptions = {}
    ): TransactionParam {
        return encodeRemoveLiquidityTransaction(param, options);
    }

    encodeSettle(param: SettleEncodingParam): TransactionParam {
        return encodeSettleTransaction(param);
    }

    encodeDeposit(param: DepositEncodingParam, gateAddr: Address, options?: DepositEncodingOptions): TransactionParam {
        return encodeDepositTransaction(param, gateAddr, options);
    }

    encodeWithdraw(
        param: WithdrawEncodingParam,
        gateAddr: Address,
        options?: WithdrawEncodingOptions
    ): TransactionParam {
        return encodeWithdrawTransaction(param, gateAddr, options);
    }

    encodeApprove(params: ApproveEncodingParam, options?: ApproveEncodingOptions): TransactionParam {
        return encodeApproveTransaction(params, options);
    }
}

export const contractCallEncoder = new ContractCallEncoder();
