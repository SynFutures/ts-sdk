declare enum Side {
    FLAT = 0,
    SHORT = 1,
    LONG = 2,
}
declare enum Status {
    DORMANT = 0,
    TRADING = 1,
    SETTLING = 2,
    SETTLED = 3,
}
declare enum InstrumentCondition {
    NORMAL = 0,
    FROZEN = 1,
    RESOLVED = 2,
}
declare enum FeederType {
    NONE_STABLE = 0,
    QUOTE_STABLE = 1,
    BASE_STABLE = 2,
    BOTH_STABLE = 3,
}
declare enum QuoteType {
    INVALID = 0,
    STABLE = 1,
    NONSTABLE = 2,
}
declare enum MarketType {
    LINK = 'LINK',
    DEXV2 = 'DEXV2',
    EMG = 'EMG',
    PYTH = 'PYTH',
}
declare enum BatchOrderSizeDistribution {
    FLAT = 0,
    UPPER = 1,
    LOWER = 2,
    RANDOM = 3,
}

export type { Side, Status, InstrumentCondition, FeederType, QuoteType, MarketType, BatchOrderSizeDistribution };
