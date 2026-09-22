import { UserSetting, WAD } from '../../../index';
import { createDevnetContext, createDevnetHelpers } from '../devnet';

export const ctx = createDevnetContext();

const defaultInstrument = ctx.manifest.defaults.instrument;
const defaultQuote = ctx.manifest.tokens.quotes[defaultInstrument.quoteSymbol];
if (!defaultQuote) {
    throw new Error(`Missing quote token info in manifest for ${defaultInstrument.quoteSymbol}`);
}

export const INSTRUMENT_ADDRESS = defaultInstrument.address;
export const EXPIRY = defaultInstrument.expiry;
export const QUOTE_UNIT = 10n ** BigInt(defaultQuote.decimals);
export const QUOTE_SCALER = 10n ** BigInt(18 - defaultQuote.decimals);

export const DEFAULT_SLIPPAGE_BPS = 50;
export const DEFAULT_LEVERAGE = 4n * WAD;

const QUOTE_TOKEN = defaultQuote.address;
export const { createUserWallet, waitForTx, transferQuote, approveQuote, depositQuote, getQuoteBalance } =
    createDevnetHelpers(ctx, QUOTE_TOKEN);

export function createUserSetting() {
    return new UserSetting(3600, DEFAULT_SLIPPAGE_BPS, DEFAULT_LEVERAGE);
}
