import type { BigNumber, ethers } from 'ethers';
import type { Instrument } from '../contracts';
import type {
    PlaceLimitOrderParam,
    BatchPlaceLimitOrderParam,
    AddLiquidityParam,
    PlaceMarketOrderParam,
    AdjustMarginParam,
    BaseInterface,
    BatchCancelOrderParam,
    CancelOrderParam,
    FillOrderParam,
    InstrumentIdentifier,
    PlaceCrossMarketOrderParam,
    RemoveLiquidityParam,
    SettleParam,
    TxOptions,
    TxOptionsWithSigner,
} from '../types';
export interface InstrumentInterface extends BaseInterface {
    /**
     * Get instrument contract instance
     * @param address the instrument address
     * @param signerOrProvider ethers signer or provider
     */
    getInstrumentContract(address: string, signerOrProvider?: ethers.providers.Provider | ethers.Signer): Instrument;
    /**
     * Compute instrument address
     * the instrument address is created by Create2
     * @param instrumentIdentifier {@link InstrumentIdentifier}
     */
    computeInstrumentAddress(instrumentIdentifier: InstrumentIdentifier): Promise<string>;
    /**
     * Donate insurance fund
     * @param instrumentAddr the instrument address
     * @param expiry the expiry
     * @param amount the insurance fund amount, all the quote should format 18 decimals
     * @param txOptions {@link TxOptions}
     */
    donateInsuranceFund(
        instrumentAddr: string,
        expiry: number,
        amount: BigNumber,
        txOptions: TxOptionsWithSigner
    ): Promise<ethers.providers.TransactionReceipt>;
    donateInsuranceFund(
        instrumentAddr: string,
        expiry: number,
        amount: BigNumber,
        txOptions?: TxOptions
    ): Promise<ethers.PopulatedTransaction>;
    donateInsuranceFund(
        instrumentAddr: string,
        expiry: number,
        amount: BigNumber,
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction>;
    /**
     * Fill limit order
     * @param param {@link FillOrderParam}
     * @param txOptions {@link TxOptions}
     */
    fillLimitOrder(param: FillOrderParam, txOptions: TxOptionsWithSigner): Promise<ethers.providers.TransactionReceipt>;
    fillLimitOrder(param: FillOrderParam, txOptions?: TxOptions): Promise<ethers.PopulatedTransaction>;
    fillLimitOrder(
        param: FillOrderParam,
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction>;
    /**
     * Adjust position
     * @param param {@link AdjustMarginParam}
     * @param txOptions {@link TxOptions}
     */
    adjustMargin(
        param: AdjustMarginParam,
        txOptions: TxOptionsWithSigner
    ): Promise<ethers.providers.TransactionReceipt>;
    adjustMargin(param: AdjustMarginParam, txOptions?: TxOptions): Promise<ethers.PopulatedTransaction>;
    adjustMargin(
        param: AdjustMarginParam,
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction>;
    /**
     * Add liquidity
     * @param param {@link AddLiquidityParam}
     * @param txOptions {@link TxOptions}
     */
    addLiquidity(
        param: AddLiquidityParam,
        txOptions: TxOptionsWithSigner
    ): Promise<ethers.providers.TransactionReceipt>;
    addLiquidity(param: AddLiquidityParam, txOptions?: TxOptions): Promise<ethers.PopulatedTransaction>;
    addLiquidity(
        param: AddLiquidityParam,
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction>;
    /**
     * Remove liquidity
     * @param param {@link RemoveLiquidityParam}
     * @param txOptions {@link TxOptions}
     */
    removeLiquidity(
        param: RemoveLiquidityParam,
        txOptions: TxOptionsWithSigner
    ): Promise<ethers.providers.TransactionReceipt>;
    removeLiquidity(param: RemoveLiquidityParam, txOptions?: TxOptions): Promise<ethers.PopulatedTransaction>;
    removeLiquidity(
        param: RemoveLiquidityParam,
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction>;
    /**
     * Place limit order
     * @param param {@link PlaceLimitOrderParam}
     * @param txOptions {@link TxOptions}
     */
    placeLimitOrder(
        param: PlaceLimitOrderParam,
        txOptions: TxOptionsWithSigner
    ): Promise<ethers.providers.TransactionReceipt>;
    placeLimitOrder(param: PlaceLimitOrderParam, txOptions?: TxOptions): Promise<ethers.PopulatedTransaction>;
    placeLimitOrder(
        param: PlaceLimitOrderParam,
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction>;
    /**
     * Place market order
     * @param param {@link PlaceMarketOrderParam}
     * @param txOptions {@link TxOptions}
     */
    placeMarketOrder(
        param: PlaceMarketOrderParam,
        txOptions: TxOptionsWithSigner
    ): Promise<ethers.providers.TransactionReceipt>;
    placeMarketOrder(param: PlaceMarketOrderParam, txOptions?: TxOptions): Promise<ethers.PopulatedTransaction>;
    placeMarketOrder(
        param: PlaceMarketOrderParam,
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction>;
    /**
     * Cancel limit order
     * @param param {@link CancelOrderParam}
     * @param txOptions {@link TxOptions}
     */
    cancelLimitOrder(
        param: CancelOrderParam,
        txOptions: TxOptionsWithSigner
    ): Promise<ethers.providers.TransactionReceipt>;
    cancelLimitOrder(param: CancelOrderParam, txOptions?: TxOptions): Promise<ethers.PopulatedTransaction>;
    cancelLimitOrder(
        param: CancelOrderParam,
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction>;
    /**
     * Batch place limit order
     * @param param {@link BatchPlaceLimitOrderParam}
     * @param txOptions {@link TxOptions}
     */
    batchPlaceLimitOrder(
        param: BatchPlaceLimitOrderParam,
        txOptions: TxOptionsWithSigner
    ): Promise<ethers.providers.TransactionReceipt>;
    batchPlaceLimitOrder(param: BatchPlaceLimitOrderParam, txOptions?: TxOptions): Promise<ethers.PopulatedTransaction>;
    batchPlaceLimitOrder(
        param: BatchPlaceLimitOrderParam,
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction>;
    /**
     * Batch cancel limit order
     * @param param {@link BatchCancelOrderParam}
     * @param txOptions {@link TxOptions}
     */
    batchCancelLimitOrder(
        param: BatchCancelOrderParam,
        txOptions: TxOptionsWithSigner
    ): Promise<ethers.providers.TransactionReceipt>;
    batchCancelLimitOrder(param: BatchCancelOrderParam, txOptions?: TxOptions): Promise<ethers.PopulatedTransaction>;
    batchCancelLimitOrder(
        param: BatchCancelOrderParam,
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction>;
    /**
     * Place cross market order
     * @param param {@link PlaceCrossMarketOrderParam}
     * @param txOptions {@link TxOptions}
     */
    placeCrossMarketOrder(
        param: PlaceCrossMarketOrderParam,
        txOptions: TxOptionsWithSigner
    ): Promise<ethers.providers.TransactionReceipt>;
    placeCrossMarketOrder(
        param: PlaceCrossMarketOrderParam,
        txOptions?: TxOptions
    ): Promise<ethers.PopulatedTransaction>;
    placeCrossMarketOrder(
        param: PlaceCrossMarketOrderParam,
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction>;
    /**
     * Settle user from the specified pair
     * @param param {@link SettleParam}
     * @param txOptions {@link TxOptions}
     */
    settle(param: SettleParam, txOptions: TxOptionsWithSigner): Promise<ethers.providers.TransactionReceipt>;
    settle(param: SettleParam, txOptions?: TxOptions): Promise<ethers.PopulatedTransaction>;
    settle(
        param: SettleParam,
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction>;
    /**
     * Multi call
     * @param instrumentAddr the instrument address
     * @param callData multi call data
     * @param txOptions {@link TxOptions}
     */
    multicall(
        instrumentAddr: string,
        callData: string[],
        txOptions: TxOptionsWithSigner
    ): Promise<ethers.providers.TransactionReceipt>;
    multicall(instrumentAddr: string, callData: string[], txOptions?: TxOptions): Promise<ethers.PopulatedTransaction>;
    multicall(
        instrumentAddr: string,
        callData: string[],
        txOptions?: TxOptions
    ): Promise<ethers.providers.TransactionReceipt | ethers.PopulatedTransaction>;
}
