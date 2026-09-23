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

/**
 * Base encoding options shared across all transaction types
 */
export interface BaseEncodingOptions {
    /**
     * 1CT sub-account/agent address used by the router batching flow.
     * This is typically the tx sender, and is not necessarily the on-chain portfolio owner.
     */
    subAccountAddress?: Address;
    /** Router address for batchMulticall or batch operations */
    routerAddress?: Address;
    /**
     * Trader/portfolio owner address.
     * When encoding `*For` calls (e.g. `tradeFor/placeFor/addFor/removeFor/cancelFor`), this is the `to` address.
     */
    traderAddress?: Address;
}

/**
 * Encoding options for trade-related operations (market/limit orders)
 */
export interface TradeEncodingOptions extends BaseEncodingOptions {
    /** Use tradeFor/placeFor for Gelato transactions */
    useFor?: boolean;
}

/**
 * Encoding options for market order encoding
 */
export interface MarketOrderEncodingOptions extends BaseEncodingOptions {
    /** Use tradeFor for Gelato transactions */
    useTradeFor?: boolean;
}

/**
 * Encoding options for limit order encoding
 */
export interface LimitOrderEncodingOptions extends BaseEncodingOptions {
    /** Use placeFor for Gelato transactions */
    usePlaceFor?: boolean;
}

/**
 * Encoding options for cancel order encoding
 */
export interface CancelOrderEncodingOptions extends BaseEncodingOptions {
    /** Use cancelFor for Gelato transactions */
    useCancelFor?: boolean;
    /** Maximum orders per cancel call (default: MAX_CANCEL_ORDER_COUNT:8) */
    maxCancelCount?: number;
}

/**
 * Encoding options for adjust margin encoding
 */
export interface AdjustMarginEncodingOptions extends BaseEncodingOptions {
    /** Use adjustFor for Gelato transactions */
    useAdjustFor?: boolean;
}

/**
 * Encoding options for batch place scaled limit order
 */
export interface BatchPlaceScaledLimitOrderEncodingOptions extends BaseEncodingOptions {
    /** Use batchPlaceFor for Gelato transactions */
    usePlaceFor?: boolean;
}

/**
 * Encoding options for cross market order encoding
 */
export interface CrossLimitOrderEncodingOptions extends BaseEncodingOptions {
    /** Use tradeFor/placeFor for Gelato transactions */
    useFor?: boolean;
}

/**
 * Encoding options for fill limit order encoding
 */
export interface FillLimitOrderEncodingOptions {
    /** Use fill(address, bytes32) for Gelato transactions */
    useFillFor?: boolean;
}

/**
 * Encoding options for add liquidity operation
 */
export interface AddLiquidityEncodingOptions extends BaseEncodingOptions {
    /** Use addFor for Gelato transactions */
    useAddFor?: boolean;
    traderAddress?: Address;
}

/**
 * Encoding options for remove liquidity operation
 */
export interface RemoveLiquidityEncodingOptions extends BaseEncodingOptions {
    /** Use removeFor for Gelato transactions */
    useRemoveFor?: boolean;
}

/**
 * Encoding options for deposit operation
 */
export interface DepositEncodingOptions extends BaseEncodingOptions {
    /** Use depositFor for Gelato transactions */
    useDepositFor?: boolean;
}

/**
 * Encoding options for withdraw operation
 */
export interface WithdrawEncodingOptions extends BaseEncodingOptions {
    /** Use withdrawFor for Gelato transactions */
    useWithdrawFor?: boolean;
}

/**
 * Union type of all encoding options
 */
export type EncodingOptions =
    | MarketOrderEncodingOptions
    | LimitOrderEncodingOptions
    | CancelOrderEncodingOptions
    | AdjustMarginEncodingOptions
    | BatchPlaceScaledLimitOrderEncodingOptions
    | CrossLimitOrderEncodingOptions
    | FillLimitOrderEncodingOptions
    | AddLiquidityEncodingOptions
    | RemoveLiquidityEncodingOptions
    | DepositEncodingOptions
    | WithdrawEncodingOptions;

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
    encodeMarketOrder(param: MarketOrderEncodingParam, options?: MarketOrderEncodingOptions): TransactionParam;
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
    encodeLimitOrder(param: LimitOrderEncodingParam, options?: LimitOrderEncodingOptions): TransactionParam;
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
    encodeAdjustMargin(param: AdjustMarginEncodingParam, options?: AdjustMarginEncodingOptions): TransactionParam;
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
        options?: BatchPlaceScaledLimitOrderEncodingOptions
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
    encodeCrossLimitOrder(
        param: CrossLimitOrderEncodingParam,
        options?: CrossLimitOrderEncodingOptions
    ): TransactionParam;
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
    encodeFillLimitOrder(param: FillLimitOrderEncodingParam, options?: FillLimitOrderEncodingOptions): TransactionParam;
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
    encodeAddLiquidity(param: AddLiquidityEncodingParam, options?: AddLiquidityEncodingOptions): TransactionParam;
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
    encodeRemoveLiquidity(
        param: RemoveLiquidityEncodingParam,
        options?: RemoveLiquidityEncodingOptions
    ): TransactionParam;
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
    encodeDeposit(
        param: DepositEncodingParam,
        gateAddress: Address,
        options?: DepositEncodingOptions
    ): TransactionParam;
}

/**
 * Withdraw encoding interface
 */
export interface WithdrawEncodingParam {
    tokenAddress: Address;
    amount: bigint;
}

export interface WithdrawEncoder {
    encodeWithdraw(
        param: WithdrawEncodingParam,
        gateAddress: Address,
        options?: WithdrawEncodingOptions
    ): TransactionParam;
}

export interface ApproveEncodingParam {
    tokenAddress: Address;
    spenderAddress: Address;
    amount: bigint;
}

export interface ApproveEncodingOptions extends BaseEncodingOptions {
    /** Use approveFor for Gelato transactions */
    useApproveFor?: boolean;
    signature?: Hex;
    deadline?: number;
    ownerAddress?: Address;
}

export interface ApproveEncoder {
    encodeApprove(params: ApproveEncodingParam, options?: ApproveEncodingOptions): TransactionParam;
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
