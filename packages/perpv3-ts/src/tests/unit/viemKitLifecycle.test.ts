import type { TxLifecycleHooks } from '@derivation-tech/viem-kit';
import { describe, expect, it, jest } from '@jest/globals';
import type { Address, Hash, TransactionReceipt } from 'viem';
import { createPublicClient, createWalletClient, custom, encodeErrorResult } from 'viem';
import { mainnet } from 'viem/chains';
import { sendContractTransaction, type TxContext } from '@derivation-tech/viem-kit';
import { CURRENT_INSTRUMENT_ABI } from '../../abis';
import { createInstrumentParser } from '../../parsers';

const sender = '0x0000000000000000000000000000000000000001' as Address;
const instrument = '0x0000000000000000000000000000000000000002' as Address;
const hash = '0x4444444444444444444444444444444444444444444444444444444444444444' as Hash;

function revertedReceipt(): TransactionReceipt {
    return {
        transactionHash: hash,
        blockNumber: 10n,
        status: 'reverted',
        logs: [],
        cumulativeGasUsed: 21_000n,
        effectiveGasPrice: 1n,
        gasUsed: 21_000n,
        from: sender,
        to: instrument,
        contractAddress: null,
        logsBloom: '0x',
        blockHash: hash,
        transactionIndex: 0,
        type: 'eip1559',
    };
}

describe('viem-kit lifecycle integration', () => {
    it('routes decoded instrument errors through the direct request parser', async () => {
        const transport = custom({ request: async () => undefined });
        const publicClient = createPublicClient({ chain: mainnet, transport });
        const walletClient = createWalletClient({ account: sender, chain: mainnet, transport });
        const receipt = revertedReceipt();
        jest.spyOn(walletClient, 'sendTransaction').mockResolvedValue(hash);
        jest.spyOn(publicClient, 'waitForTransactionReceipt').mockResolvedValue(receipt);
        jest.spyOn(publicClient, 'call').mockRejectedValue({
            data: encodeErrorResult({
                abi: CURRENT_INSTRUMENT_ABI,
                errorName: 'OrderImrUnsafe',
                args: [1_000_000_000_000_000_000n, 2_000_000_000_000_000_000n],
            }),
        });
        const context: TxContext = {
            publicClient: publicClient as TxContext['publicClient'],
            walletClient: walletClient as TxContext['walletClient'],
            chain: mainnet,
        };
        const onReverted = jest.fn<NonNullable<TxLifecycleHooks['onReverted']>>();
        const onParseError = jest.fn<NonNullable<TxLifecycleHooks['onParseError']>>();

        const sent = await sendContractTransaction(
            context,
            {
                address: instrument,
                abi: CURRENT_INSTRUMENT_ABI,
                parser: createInstrumentParser(),
                functionName: 'claimProtocolFee',
                args: [1],
                account: sender,
            },
            { silent: true, hooks: { onReverted, onParseError } }
        );
        expect((await sent.receipt).status).toBe('reverted');
        await sent.diagnostics;

        expect(onReverted).toHaveBeenCalledWith(
            expect.objectContaining({
                error: expect.objectContaining({ kind: 'custom', name: 'OrderImrUnsafe' }),
                message: expect.stringContaining('OrderImrUnsafe'),
            })
        );
        expect(onParseError).not.toHaveBeenCalled();
    });
});
