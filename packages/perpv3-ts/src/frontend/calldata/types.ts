import type { Address, Hex } from 'viem';
import { Side, UserSetting } from '../../types';

/**
 * Transaction parameters returned by all encoding methods
 */
export interface TransactionParam {
    /** Target contract address */
    to: Address;
    /** Encoded calldata */
    data: Hex;
    /** ETH value to send (for payable functions) */
    value?: bigint;
}

export type TransactionRoute =
    | { route?: 'direct'; traderAddress?: never; routerAddress?: never; subAccountAddress?: never }
    | { route: 'for'; traderAddress: Address; routerAddress?: never; subAccountAddress?: never }
    | { route: 'router'; traderAddress: Address; routerAddress: Address; subAccountAddress: Address };

export type CancelOrderEncodingOptions = TransactionRoute & { maxCancelCount?: number };

export interface InstrumentEncodingBaseParam {
    instrumentAddress: Address;
    expiry: number;
}

/**
 * Market Order encoding interface
 * param are the same with contract
 */
export interface MarketOrderEncodingParam extends InstrumentEncodingBaseParam {
    side: Side;
    baseQuantity: bigint; // Size of the order always to be positive, already signed by side. size = side * baseQuantity
    margin: bigint;
    limitTick: number;
    userSetting: UserSetting;
}

export interface MarketOrderEncoder {
    encodeMarketOrder(param: MarketOrderEncodingParam, options?: TransactionRoute): TransactionParam;
}

/**
 * Limit Order encoding interface
 * param are the same with contract
 */
export interface LimitOrderEncodingParam extends InstrumentEncodingBaseParam {
    side: Side;
    baseQuantity: bigint; // Size of the order always to be positive, already signed by side. size = side * baseQuantity
    amount: bigint;
    tick: number;
    userSetting: UserSetting;
}

export interface LimitOrderEncoder {
    encodeLimitOrder(param: LimitOrderEncodingParam, options?: TransactionRoute): TransactionParam;
}

/**
 * Cancel Order encoding interface
 * param are the same with contract
 */
export interface CancelOrderEncodingParam extends InstrumentEncodingBaseParam {
    ticks: number[];
    userSetting: UserSetting;
}

export interface CancelOrderEncoder {
    encodeCancelOrder(param: CancelOrderEncodingParam, options?: CancelOrderEncodingOptions): TransactionParam;
}

/**
 * Adjust Margin encoding interface
 * param need transfer to contract as netSize: param.margin * sideSign(by transferIn)
 */
export interface AdjustMarginEncodingParam extends InstrumentEncodingBaseParam {
    transferIn: boolean; // true to transfer in, false to transfer out, different from contract
    margin: bigint; // Margin amount to adjust, netSize: param.margin * sideSign(by transferIn)
    userSetting: UserSetting;
}

export interface AdjustMarginEncoder {
    encodeAdjustMargin(param: AdjustMarginEncodingParam, options?: TransactionRoute): TransactionParam;
}

/**
 * Batch Place Scaled Limit Order encoding interface
 * param are the same with contract
 */
export interface BatchPlaceScaledLimitOrderEncodingParam extends InstrumentEncodingBaseParam {
    side: Side;
    baseQuantity: bigint; // Total size across all always to be positive orders, already signed by side. size = side * baseQuantity
    leverage: bigint;
    ticks: number[]; // Array of tick levels
    ratios: number[]; // Size distribution ratios (must sum to 10000)
    userSetting: UserSetting;
}

export interface BatchPlaceScaledLimitOrderEncoder {
    encodeBatchPlaceScaledLimitOrder(
        param: BatchPlaceScaledLimitOrderEncodingParam,
        options?: TransactionRoute
    ): TransactionParam;
}

/**
 * Cross Limit Order encoding interface
 * will multicall market order and limit order
 */
export interface CrossLimitOrderEncodingParam extends InstrumentEncodingBaseParam {
    side: Side;
    orderSize: bigint; // Size for limit order
    tradeSize: bigint; // Size for market trade
    tradeLimitTick: number; // Limit tick for market trade
    orderTick: number; // Tick for limit order
    tradeMargin: bigint; // Margin for market trade
    orderMargin: bigint; // Margin for limit order
    userSetting: UserSetting;
}

export interface CrossLimitOrderEncoder {
    encodeCrossLimitOrder(param: CrossLimitOrderEncodingParam, options?: TransactionRoute): TransactionParam;
}

/**
 * Fill Limit Order encoding interface
 * param are the same with contract
 */
export interface FillLimitOrderEncodingParam extends InstrumentEncodingBaseParam {
    nonce: bigint; // Order nonce
    tick: number; // Order tick
    target: Address; // Target address (maker)
}

export interface FillLimitOrderEncoder {
    encodeFillLimitOrder(param: FillLimitOrderEncodingParam): TransactionParam;
}

/**
 * Add Liquidity encoding interface
 */
export interface AddLiquidityEncodingParam extends InstrumentEncodingBaseParam {
    tickDeltaLower: number;
    tickDeltaUpper: number;
    amount: bigint;
    limitTicks: number; // use encodeLiquidityLimitTicks to get it from sqrtPX96 and slippage
    userSetting: UserSetting;
}

export interface AddLiquidityEncoder {
    encodeAddLiquidity(param: AddLiquidityEncodingParam, options?: TransactionRoute): TransactionParam;
}

/**
 * Remove Liquidity encoding interface
 */
export interface RemoveLiquidityEncodingParam extends InstrumentEncodingBaseParam {
    tickLower: number;
    tickUpper: number;
    limitTicks: number; // use encodeLiquidityLimitTicks to get it from sqrtPX96 and slippage
    traderAddress: Address;
    userSetting: UserSetting;
}

export interface RemoveLiquidityEncoder {
    encodeRemoveLiquidity(param: RemoveLiquidityEncodingParam, options?: TransactionRoute): TransactionParam;
}

export interface SettleEncodingParam extends InstrumentEncodingBaseParam {
    targetAddress: Address;
}

export interface SettleEncoder {
    encodeSettle(param: SettleEncodingParam): TransactionParam;
}

/**
 * Deposit encoding interface
 */
export interface DepositEncodingParam {
    tokenAddress: Address;
    amount: bigint;
}

export interface DepositEncoder {
    encodeDeposit(param: DepositEncodingParam, gateAddress: Address, options?: TransactionRoute): TransactionParam;
}

/**
 * Withdraw encoding interface
 */
export interface WithdrawEncodingParam {
    tokenAddress: Address;
    amount: bigint;
}

export interface WithdrawEncoder {
    encodeWithdraw(param: WithdrawEncodingParam, gateAddress: Address, options?: TransactionRoute): TransactionParam;
}

export interface ApproveEncodingParam {
    tokenAddress: Address;
    spenderAddress: Address;
    amount: bigint;
}

export interface SignedPermit extends ApproveEncodingParam {
    ownerAddress: Address;
    deadline: bigint;
    signature: Hex;
}

export interface ApproveEncoder {
    encodeApprove(params: ApproveEncodingParam): TransactionParam;
    encodePermit(permit: SignedPermit): TransactionParam;
}

/**
 * Complete contract call encoder interface
 * Combines all individual encoding interfaces
 */
export interface IContractCallEncoder
    extends
        MarketOrderEncoder,
        LimitOrderEncoder,
        CancelOrderEncoder,
        AdjustMarginEncoder,
        BatchPlaceScaledLimitOrderEncoder,
        CrossLimitOrderEncoder,
        FillLimitOrderEncoder,
        AddLiquidityEncoder,
        RemoveLiquidityEncoder,
        SettleEncoder,
        DepositEncoder,
        WithdrawEncoder,
        ApproveEncoder {
    // All encoding methods are inherited from individual encoder interfaces
}
