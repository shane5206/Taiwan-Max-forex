import { getDepth } from "../lib/max-public.js";
import { vwapSellByQuote, vwapBuyByQuote } from "../lib/orderbook.js";
import { getUsdTwdRates } from "../lib/bot-rate.js";
import { getUsdtUsdReference } from "../lib/usdt-usd-reference.js";
import { FEES_BPS, twdWithdrawFeeBps } from "../lib/fees.js";
import { log } from "../lib/logger.js";
import type { Signal } from "./types.js";

/**
 * Compare MAX usdttwd against Bank of Taiwan USD cash rates.
 *
 * Two directions:
 *  - Positive premium (MAX > bank USD-implied): sell USDT on MAX, withdraw TWD,
 *    buy USD at bank, buy USDT on Binance/KuCoin/Bitfinex, TRC20 back to MAX.
 *  - Negative premium (rare): reverse.
 *
 * In both directions the bank-cash leg dominates frictions. The signal is
 * informational; the user executes the bank leg manually.
 */
export async function evaluateFxPremium(
  notionalTwd: number,
  opts: { bankeeFreeWithdraw?: boolean; depegWarnBps: number; depegAbortBps: number },
): Promise<Signal[]> {
  const ts = Date.now();

  const [maxDepth, botRates, usdtUsd] = await Promise.all([
    getDepth("usdttwd", 50),
    getUsdTwdRates(),
    getUsdtUsdReference(),
  ]);

  const tags: string[] = [];
  if (usdtUsd.depegBps >= opts.depegAbortBps) {
    log.warn("fx-premium.depeg-abort", { depegBps: usdtUsd.depegBps });
    return [
      makeAbortedSignal(notionalTwd, ts, "MAX vs BoT USD", {
        reason: "DEPEG_ABORT",
        depegBps: usdtUsd.depegBps,
        usdtUsd,
      }),
    ];
  }
  if (usdtUsd.depegBps >= opts.depegWarnBps) {
    tags.push("DEPEG_WARNING");
  }

  // Direction 1: sell USDT on MAX (positive premium hypothesis)
  // VWAP for selling notionalTwd worth of USDT into bids
  const sell = vwapSellByQuote(maxDepth.bids, notionalTwd);
  // Direction 2: buy USDT on MAX (negative premium hypothesis)
  const buy = vwapBuyByQuote(maxDepth.asks, notionalTwd);

  const results: Signal[] = [];

  if (sell.filledQuoteQty > 0 && sell.avgPrice > 0) {
    // For each USDT sold we receive sell.avgPrice TWD.
    // Equivalent USD cost at bank cash-sell = sell.avgPrice / botRates.cashSell USD per USDT.
    const usdPerUsdtAtMaxBid = sell.avgPrice / botRates.cashSell;
    const fairUsdPerUsdt = usdtUsd.buyUsdt; // we'd have to BUY USDT on Binance at this
    const grossBps = (usdPerUsdtAtMaxBid / fairUsdPerUsdt - 1) * 10_000;
    const feesBps =
      FEES_BPS.max.taker +
      FEES_BPS.bankUsdSpreadEstimate +
      FEES_BPS.binance.taker +
      twdWithdrawFeeBps(notionalTwd, opts.bankeeFreeWithdraw);
    const edgeBps = grossBps - feesBps;
    results.push({
      type: "fx-premium",
      edgeBps,
      notionalTwd,
      route: "MAX-SELL-USDT (positive premium)",
      detail: {
        direction: "sell-on-max",
        maxBidVwap: sell.avgPrice,
        maxFilledUsdt: sell.filledBaseQty,
        maxLevelsHit: sell.levelsHit,
        botCashSell: botRates.cashSell,
        usdtUsdFairBuy: fairUsdPerUsdt,
        grossBps,
        feesBps,
        usdtUsdDepegBps: usdtUsd.depegBps,
      },
      tags: [...tags],
      ts,
    });
  }

  if (buy.filledQuoteQty > 0 && buy.avgPrice > 0) {
    // Reverse hypothesis: buy USDT cheap on MAX, sell on Binance for USDC/USD,
    // bring USD back via bank.
    const usdPerUsdtAtMaxAsk = buy.avgPrice / botRates.cashBuy;
    const fairUsdPerUsdt = usdtUsd.sellUsdt;
    const grossBps = (fairUsdPerUsdt / usdPerUsdtAtMaxAsk - 1) * 10_000;
    const feesBps =
      FEES_BPS.max.taker +
      FEES_BPS.bankUsdSpreadEstimate +
      FEES_BPS.binance.taker +
      twdWithdrawFeeBps(notionalTwd, opts.bankeeFreeWithdraw);
    const edgeBps = grossBps - feesBps;
    results.push({
      type: "fx-premium",
      edgeBps,
      notionalTwd,
      route: "MAX-BUY-USDT (negative premium)",
      detail: {
        direction: "buy-on-max",
        maxAskVwap: buy.avgPrice,
        maxFilledUsdt: buy.filledBaseQty,
        maxLevelsHit: buy.levelsHit,
        botCashBuy: botRates.cashBuy,
        usdtUsdFairSell: fairUsdPerUsdt,
        grossBps,
        feesBps,
        usdtUsdDepegBps: usdtUsd.depegBps,
      },
      tags: [...tags],
      ts,
    });
  }

  return results;
}

function makeAbortedSignal(notionalTwd: number, ts: number, route: string, detail: Record<string, unknown>): Signal {
  return {
    type: "fx-premium",
    edgeBps: 0,
    notionalTwd,
    route,
    detail,
    tags: ["ABORTED"],
    ts,
  };
}
