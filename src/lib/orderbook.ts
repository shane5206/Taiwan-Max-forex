// Walk-the-book VWAP helpers. Inputs are MAX-style `[price, volume][]` arrays
// with price and volume as decimal strings. Asks ascending, bids descending.

export type Level = [string, string];

export interface VwapResult {
  avgPrice: number;
  filledBaseQty: number;
  filledQuoteQty: number;
  levelsHit: number;
  fullyFilled: boolean;
}

/** Spend up to `targetBaseQty` against ascending asks. */
export function vwapBuyByBase(asks: Level[], targetBaseQty: number): VwapResult {
  return walk(asks, targetBaseQty, "base");
}

/** Spend up to `targetQuoteQty` (e.g. TWD budget) against ascending asks. */
export function vwapBuyByQuote(asks: Level[], targetQuoteQty: number): VwapResult {
  return walk(asks, targetQuoteQty, "quote");
}

/** Sell up to `targetBaseQty` into descending bids. */
export function vwapSellByBase(bids: Level[], targetBaseQty: number): VwapResult {
  return walk(bids, targetBaseQty, "base");
}

/** Sell up to producing `targetQuoteQty` against descending bids. */
export function vwapSellByQuote(bids: Level[], targetQuoteQty: number): VwapResult {
  return walk(bids, targetQuoteQty, "quote");
}

function walk(levels: Level[], target: number, mode: "base" | "quote"): VwapResult {
  let remaining = target;
  let baseFilled = 0;
  let quoteFilled = 0;
  let levelsHit = 0;

  for (const lvl of levels) {
    if (remaining <= 0) break;
    const price = Number(lvl[0]);
    const vol = Number(lvl[1]);
    if (!Number.isFinite(price) || !Number.isFinite(vol) || price <= 0 || vol <= 0) continue;

    const levelQuote = price * vol;
    let takeBase: number;
    let takeQuote: number;

    if (mode === "base") {
      takeBase = Math.min(vol, remaining);
      takeQuote = takeBase * price;
      remaining -= takeBase;
    } else {
      takeQuote = Math.min(levelQuote, remaining);
      takeBase = takeQuote / price;
      remaining -= takeQuote;
    }

    baseFilled += takeBase;
    quoteFilled += takeQuote;
    levelsHit += 1;
  }

  const avgPrice = baseFilled > 0 ? quoteFilled / baseFilled : 0;
  return {
    avgPrice,
    filledBaseQty: baseFilled,
    filledQuoteQty: quoteFilled,
    levelsHit,
    fullyFilled: remaining <= 1e-9,
  };
}
