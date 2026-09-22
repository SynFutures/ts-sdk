import { describe, it } from '@jest/globals';
import {
    runCancelOrderFlow,
    runFullyTakenOrderFlow,
    runMultiOrderFillAndCancelFlow,
    runSameTickOrderFlow,
    runSharedRangeLiquidityFlow,
    runTradePullsEoaMarginWithMultipleRanges,
} from './orderFlow/cases';

describe('devnet instrument order flow (ported from v3-contracts hardhat Instrument/Helper tests)', () => {
    it('place -> taker trade -> maker fill (fully taken order)', runFullyTakenOrderFlow);
    it('place -> cancel removes the order', runCancelOrderFlow);
    it('two users can add/remove liquidity at the same tick range', runSharedRangeLiquidityFlow);
    it('multiple users can place orders at the same tick', runSameTickOrderFlow);
    it(
        'trade can pull margin from EOA when reserve is empty with multiple ranges',
        runTradePullsEoaMarginWithMultipleRanges
    );
    it('multi orders -> taker trades cross orders -> maker fill & cancel', runMultiOrderFillAndCancelFlow);
});
