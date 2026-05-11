import { getDepth } from "../lib/max-public.js";
import { vwapBuyByQuote, vwapBuyByBase, vwapSellByBase } from "../lib/orderbook.js";
import { FEES_BPS } from "../lib/fees.js";
import type { Signal } from "./types.js";

/**
 * MAX triangular evaluation.
 *
 * Cycle A: TWD -> USDT -> BTC -> TWD
 *   leg1 buy USDT on usdttwd asks, leg2 buy BTC on btcusdt asks, leg3 sell BTC on btctwd bids.
 * Cycle B: TWD -> BTC -> USDT -> TWD (reverse)
 *
 * All edge numbers are net of 3 × MAX taker fee. Slippage is modelled by walking
 * the orderbook for the actual leg notional, not the top-of-book price.
 */
export async function evaluateTriangular(notionalTwd: number): Promise<Signal[]> {
  const ts = Date.now();
  const [usdttwd, btcusdt, btctwd] = await Promise.all([
    getDepth("usdttwd", 50),
    getDepth("btcusdt", 50),
    getDepth("btctwd", 50),
  ]);

  const takerBps = FEES_BPS.max.taker;
  const totalFeesBps = 3 * takerBps;
  const results: Signal[] = [];

  // Cycle A: TWD -> USDT -> BTC -> TWD
  {
    const leg1 = vwapBuyByQuote(usdttwd.asks, notionalTwd);
    if (leg1.filledQuoteQty > 0) {
      const usdtAcquired = leg1.filledBaseQty;
      // Apply leg1 fee (in USDT terms)
      const usdtAfterFee = usdtAcquired * (1 - takerBps / 10_000);
      const leg2 = vwapBuyByQuote(btcusdt.asks, usdtAfterFee);
      const btcAcquired = leg2.filledBaseQty;
      const btcAfterFee = btcAcquired * (1 - takerBps / 10_000);
      const leg3 = vwapSellByBase(btctwd.bids, btcAfterFee);
      const twdOut = leg3.filledQuoteQty * (1 - takerBps / 10_000);
      const edgeBps = ((twdOut / leg1.filledQuoteQty) - 1) * 10_000;
      results.push({
        type: "triangular",
        edgeBps,
        notionalTwd: leg1.filledQuoteQty,
        route: "Cycle A: TWD->USDT->BTC->TWD",
        detail: {
          leg1: { market: "usdttwd", side: "buy", vwap: leg1.avgPrice, baseQty: usdtAcquired, levels: leg1.levelsHit, fullyFilled: leg1.fullyFilled },
          leg2: { market: "btcusdt", side: "buy", vwap: leg2.avgPrice, baseQty: btcAcquired, levels: leg2.levelsHit, fullyFilled: leg2.fullyFilled },
          leg3: { market: "btctwd", side: "sell", vwap: leg3.avgPrice, quoteQty: leg3.filledQuoteQty, levels: leg3.levelsHit, fullyFilled: leg3.fullyFilled },
          twdIn: leg1.filledQuoteQty,
          twdOut,
          feesBps: totalFeesBps,
        },
        ts,
      });
    }
  }

  // Cycle B: TWD -> BTC -> USDT -> TWD
  {
    const leg1 = vwapBuyByQuote(btctwd.asks, notionalTwd);
    if (leg1.filledQuoteQty > 0) {
      const btcAcquired = leg1.filledBaseQty;
      const btcAfterFee = btcAcquired * (1 - takerBps / 10_000);
      const leg2 = vwapSellByBase(btcusdt.bids, btcAfterFee);
      const usdtAcquired = leg2.filledQuoteQty;
      const usdtAfterFee = usdtAcquired * (1 - takerBps / 10_000);
      const leg3 = vwapSellByBase(usdttwd.bids, usdtAfterFee);
      const twdOut = leg3.filledQuoteQty * (1 - takerBps / 10_000);
      const edgeBps = ((twdOut / leg1.filledQuoteQty) - 1) * 10_000;
      results.push({
        type: "triangular",
        edgeBps,
        notionalTwd: leg1.filledQuoteQty,
        route: "Cycle B: TWD->BTC->USDT->TWD",
        detail: {
          leg1: { market: "btctwd", side: "buy", vwap: leg1.avgPrice, baseQty: btcAcquired, levels: leg1.levelsHit, fullyFilled: leg1.fullyFilled },
          leg2: { market: "btcusdt", side: "sell", vwap: leg2.avgPrice, quoteQty: usdtAcquired, levels: leg2.levelsHit, fullyFilled: leg2.fullyFilled },
          leg3: { market: "usdttwd", side: "sell", vwap: leg3.avgPrice, quoteQty: leg3.filledQuoteQty, levels: leg3.levelsHit, fullyFilled: leg3.fullyFilled },
          twdIn: leg1.filledQuoteQty,
          twdOut,
          feesBps: totalFeesBps,
        },
        ts,
      });
    }
  }

  // Silence unused import in case bundler complains
  void vwapBuyByBase;
  return results;
}
