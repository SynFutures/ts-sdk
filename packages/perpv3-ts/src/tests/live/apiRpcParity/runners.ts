import { expect } from '@jest/globals';
import { AdjustInput } from '../../../actions/adjust';
import { PlaceInput } from '../../../actions/order';
import { TradeInput } from '../../../actions/trade';
import { abs } from '../../../math';
import { fetchOnchainContext as fetchRpcContext } from '../../../queries/rpc';
import { PairSnapshot, QuotationWithSize, Side, UserSetting } from '../../../types';
import { compareTradeResults, normalizeData } from './assertions';
import { scenarioReadOptions, scenarioSignedSize } from './fixtures';
import type { PreparedScenario, Scenario } from './types';

export function simulateScenario(scenario: Scenario, snapshot: PairSnapshot, settings: UserSetting): unknown {
    const trader = scenario.traderAddress;
    switch (scenario.type) {
        case 'marketByMargin':
        case 'marketByLeverage':
        case 'marketClose': {
            const signedSize = scenarioSignedSize(scenario)!;
            if (!snapshot.quotation) throw new Error('The API snapshot must include the requested quotation');
            const margin = scenario.type === 'marketByMargin' ? BigInt(scenario.input.margin) : undefined;
            const input = new TradeInput(trader, abs(signedSize), signedSize > 0n ? Side.LONG : Side.SHORT, margin);
            const leverage =
                scenario.type === 'marketByLeverage' ? BigInt(scenario.input.targetLeverage) : settings.leverage;
            const userSetting = withLeverage(settings, leverage);
            return input.simulate(snapshot, new QuotationWithSize(signedSize, snapshot.quotation), userSetting);
        }
        case 'adjustMargin':
            return new AdjustInput(trader, BigInt(scenario.input.amount), scenario.input.transferIn).simulate(
                snapshot,
                settings
            );
        case 'adjustMarginByLeverage':
            return new AdjustInput(trader).simulate(
                snapshot,
                withLeverage(settings, BigInt(scenario.input.targetLeverage))
            );
        case 'limitOrder': {
            const input = new PlaceInput(
                trader,
                scenario.input.tick,
                BigInt(scenario.input.baseQuantity),
                scenario.input.side === 'LONG' ? Side.LONG : Side.SHORT
            );
            return input.simulate(
                snapshot,
                withLeverage(
                    settings,
                    BigInt(scenario.input.leverage),
                    scenario.input.dappSetting?.markPriceBufferInBps
                )
            );
        }
    }
}

function withLeverage(settings: UserSetting, leverage: bigint, buffer = settings.markPriceBufferInBps): UserSetting {
    return new UserSetting(settings.deadlineOffset, settings.slippage, leverage, buffer, settings.strictMode);
}

export async function executeScenario({
    scenario,
    userSetting,
    rpcConfig,
    onchainContext,
}: PreparedScenario): Promise<void> {
    const rpcContext = await fetchRpcContext(
        scenario.instrumentAddress,
        scenario.expiry,
        rpcConfig,
        scenario.traderAddress,
        scenarioSignedSize(scenario),
        scenarioReadOptions(scenario, onchainContext.blockInfo.height)
    );
    expect(normalizeData(rpcContext.blockInfo)).toEqual(normalizeData(onchainContext.blockInfo));
    // Keep both providers' portfolios and funding indices intact: differences must fail parity.
    compareTradeResults(
        simulateScenario(scenario, onchainContext, userSetting),
        simulateScenario(scenario, rpcContext, userSetting)
    );
}
