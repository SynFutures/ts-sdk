import type { Address, PublicClient } from 'viem';
import type { ApiConfig, RpcConfig } from '../../queries/config';
import type { Amm, BlockInfo, InstrumentSetting, PairSnapshot, Portfolio, UserSetting } from '../../types';

export type ScenarioType =
    | 'marketByMargin'
    | 'marketByLeverage'
    | 'marketClose'
    | 'adjustMargin'
    | 'adjustMarginByLeverage'
    | 'limitOrder';

export interface RawUserSetting {
    deadline: number;
    slippage: number;
    strictMode?: boolean;
    markPriceBufferInBps?: number;
}

export interface BaseScenario {
    name?: string;
    type: ScenarioType;
    chainId: number;
    instrumentAddress: Address;
    expiry: number;
    traderAddress: Address;
    userSetting: RawUserSetting;
    apiKeyEnv?: string;
    rpcUrlEnv?: string;
    rpcUrl?: string;
    observerAddress?: Address;
    blockNumber?: string;
    blockTag?: 'latest' | 'earliest' | 'pending';
}

export interface MarketByMarginScenario extends BaseScenario {
    type: 'marketByMargin';
    input: {
        side: 'LONG' | 'SHORT';
        baseQuantity: string;
        margin: string;
    };
}

export interface MarketByLeverageScenario extends BaseScenario {
    type: 'marketByLeverage';
    input: {
        side: 'LONG' | 'SHORT';
        baseQuantity: string;
        targetLeverage: string;
    };
}

export interface MarketCloseScenario extends BaseScenario {
    type: 'marketClose';
    input: {
        baseQuantity: string;
    };
}

export interface AdjustMarginScenario extends BaseScenario {
    type: 'adjustMargin';
    input: {
        amount: string;
        transferIn: boolean;
    };
}

export interface AdjustMarginByLeverageScenario extends BaseScenario {
    type: 'adjustMarginByLeverage';
    input: {
        targetLeverage: string;
    };
}

export interface LimitOrderScenario extends BaseScenario {
    type: 'limitOrder';
    input: {
        side: 'LONG' | 'SHORT';
        baseQuantity: string;
        leverage: string;
        tick: number;
        dappSetting?: {
            markPriceBufferInBps?: number;
        };
    };
}

export type Scenario =
    | MarketByMarginScenario
    | MarketByLeverageScenario
    | MarketCloseScenario
    | AdjustMarginScenario
    | AdjustMarginByLeverageScenario
    | LimitOrderScenario;

export interface PortfolioContext {
    instrumentSetting: InstrumentSetting;
    portfolio: Portfolio;
    amm: Amm;
    markPrice?: bigint;
    blockInfo: BlockInfo;
}

export interface PreparedScenario {
    scenario: Scenario;
    apiConfig?: ApiConfig;
    instrumentAddress?: Address;
    expiry?: number;
    traderAddress?: Address;
    userSetting?: UserSetting;
    onchainContext?: PairSnapshot;
    portfolioContext?: PortfolioContext;
    rpcConfig?: RpcConfig;
    publicClient?: PublicClient;
    skipReason?: string;
}
