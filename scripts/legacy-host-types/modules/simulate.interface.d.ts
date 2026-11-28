import type { CallOverrides, BigNumber } from 'ethers';
import type {
    SimulateMarketOrderByMarginParams,
    SimulateMarketOrderByLeverageParams,
    SimulateCloseParams,
    SimulateAdjustMarginByMarginParams,
    SimulateAdjustMarginByLeverageParams,
    SimulateAdjustMarginByMarginResult,
    SimulateAdjustMarginByLeverageResult,
    SimulateTradeResult,
    SimulateRemoveLiquidityParams,
    SimulateRemoveLiquidityResult,
    SimulateCrossMarketOrderParams,
    SimulateCrossMarketOrderResult,
    SimulateLimitOrderParams,
    SimulateLimitOrderResult,
    SimulateAddLiquidityWithAsymmetricRangeParams,
    SimulateAddLiquidityWithAsymmetricRangeResult,
    SimulateAddLiquidityResult,
    SimulateAddLiquidityParams,
    SimulateScaledLimitOrderResult,
    SimulateScaledLimitOrderParams,
    InstrumentIdentifier,
} from '../types';
export interface SimulateInterface {
    /**
     * Simulate cross market order
     * @param param {@link SimulateCrossMarketOrderParams}
     * @param overrides {@link CallOverrides}
     * @returns result {@link SimulateCrossMarketOrderResult}
     */
    simulateCrossMarketOrder(
        param: SimulateCrossMarketOrderParams,
        overrides?: CallOverrides
    ): Promise<SimulateCrossMarketOrderResult>;
    /**
     * Simulate limit order
     * @param param {@link SimulateLimitOrderParams}
     * @param overrides {@link CallOverrides}
     * @returns result {@link SimulateLimitOrderResult}
     */
    simulateLimitOrder(param: SimulateLimitOrderParams, overrides?: CallOverrides): Promise<SimulateLimitOrderResult>;
    /**
     * Simulate batch limit order according to different strategies
     * @param param {@link SimulateScaledLimitOrderParams}
     * @param overrides {@link CallOverrides}
     * @returns result {@link SimulateScaledLimitOrderResult}
     */
    simulateScaledLimitOrder(
        param: SimulateScaledLimitOrderParams,
        overrides?: CallOverrides
    ): Promise<SimulateScaledLimitOrderResult>;
    /**
     * Simulate market order by user-specified margin
     * @param params {@link SimulateMarketOrderByMarginParams}
     * @param overrides {@link CallOverrides}
     * @returns result {@link SimulateTradeResult}
     */
    simulateMarketOrderByMargin(
        params: SimulateMarketOrderByMarginParams,
        overrides?: CallOverrides
    ): Promise<SimulateTradeResult>;
    /**
     * Simulate market order by user-specified leverage
     * @param params {@link SimulateMarketOrderByLeverageParams}
     * @param overrides {@link CallOverrides}
     * @returns result {@link SimulateTradeResult}
     */
    simulateMarketOrderByLeverage(
        params: SimulateMarketOrderByLeverageParams,
        overrides?: CallOverrides
    ): Promise<SimulateTradeResult>;
    /**
     * Simulate close position
     * @param params {@link SimulateCloseParams}
     * @param overrides {@link CallOverrides}
     * @returns result {@link SimulateTradeResult}
     */
    simulateClose(params: SimulateCloseParams, overrides?: CallOverrides): Promise<SimulateTradeResult>;
    /**
     * Simulate margin adjustments by user-specified margin transfers
     * @param params {@link SimulateAdjustMarginByMarginParams}
     * @param overrides {@link CallOverrides}
     * @returns result {@link SimulateAdjustMarginByMarginResult}
     */
    simulateAdjustMarginByMargin(
        params: SimulateAdjustMarginByMarginParams,
        overrides?: CallOverrides
    ): Promise<SimulateAdjustMarginByMarginResult>;
    /**
     * Simulate margin adjustments by user-specified leverage
     * @param params {@link SimulateAdjustMarginByLeverageParams}
     * @param overrides {@link CallOverrides}
     * @returns result {@link SimulateAdjustMarginByLeverageResult}
     */
    simulateAdjustMarginByLeverage(
        params: SimulateAdjustMarginByLeverageParams,
        overrides?: CallOverrides
    ): Promise<SimulateAdjustMarginByLeverageResult>;
    /**
     * Simulate adding liquidity
     * @param params {@link SimulateAddLiquidityParams}
     * @param overrides {@link CallOverrides}
     * @returns result {@link SimulateAddLiquidityResult}
     */
    simulateAddLiquidity(
        params: SimulateAddLiquidityParams,
        overrides?: CallOverrides
    ): Promise<SimulateAddLiquidityResult>;
    /**
     * Simulate adding asymmetric liquidity
     * @param params {@link SimulateAddLiquidityWithAsymmetricRangeParams}
     * @param overrides {@link CallOverrides}
     * @returns result {@link SimulateAddLiquidityWithAsymmetricRangeResult}
     */
    simulateAddLiquidityWithAsymmetricRange(
        params: SimulateAddLiquidityWithAsymmetricRangeParams,
        overrides?: CallOverrides
    ): Promise<SimulateAddLiquidityWithAsymmetricRangeResult>;
    /**
     * Simulate remove liquidity
     * @param params {@link SimulateRemoveLiquidityParams}
     * @param overrides {@link CallOverrides}
     * @returns result {@link SimulateRemoveLiquidityResult}
     */
    simulateRemoveLiquidity(
        params: SimulateRemoveLiquidityParams,
        overrides?: CallOverrides
    ): Promise<SimulateRemoveLiquidityResult>;
    /**
     * Simulate benchmark price by instrument identifier
     * @param instrumentIdentifier {@link InstrumentIdentifier}
     * @param expiry Expiry
     * @param overrides {@link CallOverrides}
     */
    simulateBenchmarkPrice(
        instrumentIdentifier: InstrumentIdentifier,
        expiry: number,
        overrides?: CallOverrides
    ): Promise<BigNumber>;
}
