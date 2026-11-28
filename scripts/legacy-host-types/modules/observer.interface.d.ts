import type { BigNumber, CallOverrides } from 'ethers';
import type { BlockInfo, TokenInfo } from '@derivation-tech/web3-core';
import type { Side } from '../enum';
import type {
    BaseInterface,
    FetchPortfolioParam,
    FetchInstrumentParam,
    FundFlow,
    InstrumentIdentifier,
    Pending,
    Quotation,
    Portfolio,
    Instrument,
    Position,
    RawAmm,
    LiquidityDetails,
} from '../types';
export interface ObserverInterface extends BaseInterface {
    /**
     * Get account infos from instrument
     * @param params {@link FetchPortfolioParam}
     * @param overrides {@link CallOverrides}
     */
    getPortfolio(params: FetchPortfolioParam, overrides?: CallOverrides): Promise<Portfolio>;
    getPortfolio(params: FetchPortfolioParam[], overrides?: CallOverrides): Promise<Portfolio[]>;
    getPortfolio(
        params: FetchPortfolioParam | FetchPortfolioParam[],
        overrides?: CallOverrides
    ): Promise<Portfolio | Portfolio[]>;
    /**
     * Get instrument by given params
     * @param params {@link FetchInstrumentParam}
     * @param overrides {@link CallOverrides}
     */
    getInstrument(params: FetchInstrumentParam | string, overrides?: CallOverrides): Promise<Instrument>;
    getInstrument(params: (FetchInstrumentParam | string)[], overrides?: CallOverrides): Promise<Instrument[]>;
    getInstrument(
        params: FetchInstrumentParam | string | (FetchInstrumentParam | string)[],
        overrides?: CallOverrides
    ): Promise<Instrument | Instrument[]>;
    /**
     * Get all instruments
     * @param overrides {@link CallOverrides}
     */
    getAllInstruments(overrides?: CallOverrides): Promise<Instrument[]>;
    /**
     * Get quote token info by quote symbol and instrument
     * @param quoteSymbol the quote symbol
     * @param instrumentAddr the instrument
     * @param overrides {@link CallOverrides}
     */
    getQuoteTokenInfo(quoteSymbol: string, instrumentAddr: string, overrides?: CallOverrides): Promise<TokenInfo>;
    /**
     * Inspect dex v2 market benchmark price
     * @param instrumentIdentifier the instrument
     * @param expiry the expiry
     * @param overrides {@link CallOverrides}
     */
    inspectDexV2MarketBenchmarkPrice(
        instrumentIdentifier: InstrumentIdentifier,
        expiry: number,
        overrides?: CallOverrides
    ): Promise<BigNumber>;
    /**
     * Inspect cex market benchmark price
     * @param instrumentIdentifier the instrument
     * @param expiry the expiry
     * @param overrides {@link CallOverrides}
     */
    inspectCexMarketBenchmarkPrice(
        instrumentIdentifier: InstrumentIdentifier,
        expiry: number,
        overrides?: CallOverrides
    ): Promise<BigNumber>;
    /**
     * Get raw spot price by instrument marketType
     * @param identifier the instrument identifier
     * @param overrides {@link CallOverrides}
     */
    getRawSpotPrice(identifier: InstrumentIdentifier, overrides?: CallOverrides): Promise<BigNumber>;
    /**
     * Get next initialized tick outside
     * @param instrumentAddr the instrument address
     * @param expiry the expiry
     * @param tick the tick
     * @param right whether search to the right
     * @param overrides {@link CallOverrides}
     */
    getNextInitializedTickOutside(
        instrumentAddr: string,
        expiry: number,
        tick: number,
        right: boolean,
        overrides?: CallOverrides
    ): Promise<number>;
    /**
     * Get trade size needed to move AMM price to target tick
     * @param instrumentAddr the instrument address
     * @param expiry the expiry
     * @param targetTick the target tick
     * @param overrides {@link CallOverrides}
     */
    getSizeToTargetTick(
        instrumentAddr: string,
        expiry: number,
        targetTick: number,
        overrides?: CallOverrides
    ): Promise<BigNumber>;
    /**
     * Get fund flows
     * @param quoteAddrs the quote addresses
     * @param trader the trader address
     * @param overrides {@link CallOverrides}
     */
    getFundFlows(
        quoteAddrs: string[],
        trader: string,
        overrides?: CallOverrides
    ): Promise<{
        fundFlows: FundFlow[];
        blockInfo: BlockInfo;
    }>;
    /**
     * Get user pendings
     * @param quoteAddrs the quote addresses
     * @param trader the trader address
     * @param overrides {@link CallOverrides}
     */
    getUserPendings(
        quoteAddrs: string[],
        trader: string,
        overrides?: CallOverrides
    ): Promise<{
        pendings: {
            maxWithdrawable: BigNumber;
            pending: Pending;
        }[];
        blockInfo: BlockInfo;
    }>;
    /**
     * Inquire by base
     * @param instrumentAddr the instrument address
     * @param expiry the expiry
     * @param side the side
     * @param baseAmount the base amount
     * @param overrides {@link CallOverrides}
     */
    inquireByBase(
        instrumentAddr: string,
        expiry: number,
        side: Side,
        baseAmount: BigNumber,
        overrides?: CallOverrides
    ): Promise<{
        quoteAmount: BigNumber;
        quotation: Quotation;
    }>;
    /**
     * Inquire by quote
     * @param instrumentAddr the instrument address
     * @param expiry the expiry
     * @param side the side
     * @param quoteAmount the quote amount
     * @param overrides {@link CallOverrides}
     */
    inquireByQuote(
        instrumentAddr: string,
        expiry: number,
        side: Side,
        quoteAmount: BigNumber,
        overrides?: CallOverrides
    ): Promise<{
        baseAmount: BigNumber;
        quotation: Quotation;
    }>;
    /**
     * Get position if settle
     * @param portfolio the trader account
     * @param amm the amm of instrument
     */
    getPositionIfSettle(portfolio: Portfolio, amm: RawAmm, overrides?: CallOverrides): Promise<Position>;
    /**
     * Get address balance in gate
     * @param target target address
     * @param quoteAddrs the quote addresses
     * @param overrides {@link CallOverrides}
     */
    getGateBalance(target: string, quoteAddrs: string[], overrides?: CallOverrides): Promise<BigNumber[]>;
    /**
     * Get address balances in gate
     * @param target target address
     * @param overrides {@link CallOverrides}
     */
    getGateBalances(
        target: string,
        overrides?: CallOverrides
    ): Promise<
        (TokenInfo & {
            balance: BigNumber;
        })[]
    >;
    /**
     * Get liquidity detail information
     * @param instrumentAddr the instrument address
     * @param expiry the expiry
     * @param tickDelta tick delta
     */
    getLiquidityDetails(
        instrumentAddr: string,
        expiry: number,
        tickDelta: number,
        overrides?: CallOverrides
    ): Promise<LiquidityDetails>;
}
