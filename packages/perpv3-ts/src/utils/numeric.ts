export abstract class NumericConverter {
    static scaleQuoteAmount(amount: bigint, quoteDecimals: number): bigint {
        const quoteAmountScaler = BigInt(10) ** BigInt(18 - quoteDecimals);
        return amount * quoteAmountScaler;
    }

    static toContractQuoteAmount(amount: bigint, quoteDecimals: number): bigint {
        const quoteAmountScaler = BigInt(10) ** BigInt(18 - quoteDecimals);
        return amount / quoteAmountScaler;
    }

    static toContractRatio(ratioWad: bigint): bigint {
        return ratioWad / BigInt(10) ** BigInt(14);
    }
}

