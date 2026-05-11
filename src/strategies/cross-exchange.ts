import { getDepth as getMaxDepth } from "../lib/max-public.js";
import { getBinanceDepth } from "../lib/binance-public.js";
import { getKucoinDepth } from "../lib/kucoin-public.js";
import { getBitfinexBook } from "../lib/bitfinex-public.js";
import { vwapBuyByQuote, vwapSellByQuote, vwapBuyByBase, vwapSellByBase } from "../lib/orderbook.js";
import { getUsdTwdRates } from "../lib/bot-rate.js";
import { FEES_BPS, usdtWithdrawFeeBps, FIXED_FEES } from "../lib/fees.js";
import { log } from "../lib/logger.js";
import type { Signal } from "./types.js";

/**
 * USDT cross-venue arb: MAX <-> {Binance, KuCoin, Bitfinex} via TRC20.
 *
 * Path C1 (intl -> MAX): buy USDT cheap on intl venue with USDC/USD, TRC20 to MAX,
 * sell on MAX for TWD. The TWD value is then compared back to USD via BoT rate.
 *
 * Path C2 (MAX -> intl): reverse. Useful when MAX trades at a *discount*.
 *
 * The signal is informational. Execution is half-automated: the user receives a
 * one-tap suggestion but the TRC20 transfer & dest-side trade are run manually.
 */
export async function evaluateCrossExchange(
  notionalTwd: number,
  opts: { depegWarnBps: number; depegAbortBps: number; usdtUsdDepegBps: number },
): Promise<Signal[]> {
  const ts = Date.now();
  const tags: string[] = [];
  if (opts.usdtUsdDepegBps >= opts.depegAbortBps) {
    return [{
      type: "cross-exchange",
      edgeBps: 0,
      notionalTwd,
      route: "ABORTED",
      detail: { reason: "DEPEG_ABORT", depegBps: opts.usdtUsdDepegBps },
      tags: ["ABORTED"],
      ts,
    }];
  }
  if (opts.usdtUsdDepegBps >= opts.depegWarnBps) tags.push("DEPEG_WARNING");

  const [maxDepth, botRates] = await Promise.all([
    getMaxDepth("usdttwd", 50),
    getUsdTwdRates(),
  ]);

  // Pre-compute MAX VWAPs for both directions
  const maxSell = vwapSellByQuote(maxDepth.bids, notionalTwd);    // sell USDT for TWD
  const maxBuy = vwapBuyByQuote(maxDepth.asks, notionalTwd);      // buy USDT with TWD

  const usdtBudget = notionalTwd / botRates.cashSell;             // approx USDT to fetch elsewhere

  const venues = await collectVenues(usdtBudget, notionalTwd / botRates.cashBuy);

  const out: Signal[] = [];

  for (const v of venues) {
    // C1: intl-buy → MAX-sell
    if (v.buyUsdt && maxSell.filledBaseQty > 0) {
      const buyCost = v.buyUsdt.usdSpent;             // USD spent on intl
      const usdtAcquired = v.buyUsdt.usdtAcquired;
      // After fee on intl side already embedded in vwap; subtract MAX taker
      const twdReceived = maxSell.avgPrice * Math.min(usdtAcquired, maxSell.filledBaseQty) * (1 - FEES_BPS.max.taker / 10_000);
      const twdReceivedAfterTrc20 = twdReceived - (FIXED_FEES.maxTwdWithdrawTwd); // small
      const usdEquivOfTwdReceived = twdReceivedAfterTrc20 / botRates.cashSell;
      const edgeBps = (usdEquivOfTwdReceived / buyCost - 1) * 10_000;
      out.push({
        type: "cross-exchange",
        edgeBps,
        notionalTwd: maxSell.filledQuoteQty,
        route: `${v.name}->MAX (buy USDT cheap, sell on MAX)`,
        detail: {
          direction: "C1",
          intl: v.buyUsdt,
          maxBidVwap: maxSell.avgPrice,
          twdReceived,
          twdReceivedAfterTrc20,
          buyCostUsd: buyCost,
          usdEquivOfTwd: usdEquivOfTwdReceived,
          botCashSell: botRates.cashSell,
        },
        tags: [...tags],
        ts,
      });
    }

    // C2: MAX-buy → intl-sell
    if (v.sellUsdt && maxBuy.filledBaseQty > 0) {
      const twdSpent = maxBuy.filledQuoteQty;
      const usdtFromMax = maxBuy.filledBaseQty * (1 - FEES_BPS.max.taker / 10_000);
      const usdtToMove = Math.min(usdtFromMax, v.sellUsdt.usdtSpent);
      const usdReceived = (usdtToMove / v.sellUsdt.usdtSpent) * v.sellUsdt.usdAcquired;
      const usdEquivOfTwdSpent = twdSpent / botRates.cashBuy;
      const edgeBps = (usdReceived / usdEquivOfTwdSpent - 1) * 10_000;
      out.push({
        type: "cross-exchange",
        edgeBps,
        notionalTwd: maxBuy.filledQuoteQty,
        route: `MAX->${v.name} (buy USDT on MAX, sell on intl)`,
        detail: {
          direction: "C2",
          intl: v.sellUsdt,
          maxAskVwap: maxBuy.avgPrice,
          twdSpent,
          usdtFromMax,
          usdReceived,
          usdEquivOfTwdSpent,
          botCashBuy: botRates.cashBuy,
        },
        tags: [...tags],
        ts,
      });
    }
  }

  return out;
}

interface VenueResult {
  name: string;
  buyUsdt: { usdSpent: number; usdtAcquired: number; vwap: number; trc20FeeBps: number } | null;
  sellUsdt: { usdtSpent: number; usdAcquired: number; vwap: number; trc20FeeBps: number } | null;
}

/**
 * Probe Binance (USDCUSDT), KuCoin (USDT-USDC), Bitfinex (tUSTUSD) for the USD-side
 * VWAPs we'd actually pay/receive at the given USDT notional.
 */
async function collectVenues(usdtBudget: number, usdtToSell: number): Promise<VenueResult[]> {
  const tasks: Array<Promise<VenueResult>> = [
    probeBinance(usdtBudget, usdtToSell),
    probeKucoin(usdtBudget, usdtToSell),
    probeBitfinex(usdtBudget, usdtToSell),
  ];
  const settled = await Promise.allSettled(tasks);
  const ok: VenueResult[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") ok.push(r.value);
    else log.warn("cross-exchange.venue-failed", { err: String(r.reason) });
  }
  return ok;
}

async function probeBinance(usdtBudget: number, usdtToSell: number): Promise<VenueResult> {
  const trc20Bps = usdtWithdrawFeeBps(usdtBudget, FIXED_FEES.binanceUsdtTrc20WithdrawUsdt);
  const depth = await getBinanceDepth("USDCUSDT", 50);
  // Binance USDCUSDT: base USDC, quote USDT.
  // To BUY USDT: sell USDC. On USDCUSDT we sell USDC at bid (price = USDT per USDC).
  //   spending S USDC yields S*bid USDT, but we walk bids by base USDC.
  // To SELL USDT (USDT->USDC): buy USDC at ask, spending `ask` USDT per 1 USDC.
  //   We want to convert usdtToSell USDT into USDC: walk asks by quote (USDT).
  const buy = vwapSellByBase(depth.bids, usdtBudget / averagePrice(depth.bids));
  const sell = vwapBuyByQuote(depth.asks, usdtToSell);
  const feeBps = FEES_BPS.binance.taker;
  return {
    name: "Binance",
    buyUsdt: buy.filledBaseQty > 0
      ? {
          usdSpent: buy.filledBaseQty * (1 + feeBps / 10_000),
          usdtAcquired: buy.filledQuoteQty * (1 - feeBps / 10_000),
          vwap: buy.avgPrice,
          trc20FeeBps: trc20Bps,
        }
      : null,
    sellUsdt: sell.filledQuoteQty > 0
      ? {
          usdtSpent: sell.filledQuoteQty * (1 + feeBps / 10_000),
          usdAcquired: sell.filledBaseQty * (1 - feeBps / 10_000),
          vwap: sell.avgPrice,
          trc20FeeBps: trc20Bps,
        }
      : null,
  };
}

async function probeKucoin(usdtBudget: number, usdtToSell: number): Promise<VenueResult> {
  const trc20Bps = usdtWithdrawFeeBps(usdtBudget, FIXED_FEES.kucoinUsdtTrc20WithdrawUsdt);
  const depth = await getKucoinDepth("USDT-USDC");
  // USDT-USDC: base USDT, quote USDC. To BUY USDT: take asks (pay USDC per 1 USDT).
  // To SELL USDT: take bids (receive USDC per 1 USDT).
  const buy = vwapBuyByBase(depth.asks, usdtBudget);
  const sell = vwapSellByBase(depth.bids, usdtToSell);
  const feeBps = FEES_BPS.kucoin.taker;
  return {
    name: "KuCoin",
    buyUsdt: buy.filledBaseQty > 0
      ? {
          usdSpent: buy.filledQuoteQty * (1 + feeBps / 10_000),
          usdtAcquired: buy.filledBaseQty * (1 - feeBps / 10_000),
          vwap: buy.avgPrice,
          trc20FeeBps: trc20Bps,
        }
      : null,
    sellUsdt: sell.filledBaseQty > 0
      ? {
          usdtSpent: sell.filledBaseQty * (1 + feeBps / 10_000),
          usdAcquired: sell.filledQuoteQty * (1 - feeBps / 10_000),
          vwap: sell.avgPrice,
          trc20FeeBps: trc20Bps,
        }
      : null,
  };
}

async function probeBitfinex(usdtBudget: number, usdtToSell: number): Promise<VenueResult> {
  const trc20Bps = usdtWithdrawFeeBps(usdtBudget, FIXED_FEES.bitfinexUsdtTrc20WithdrawUsdt);
  const book = await getBitfinexBook("tUSTUSD", "P0", 25);
  // tUSTUSD: base USDT (UST), quote USD. To BUY USDT: take asks. To SELL: take bids.
  const buy = vwapBuyByBase(book.asks, usdtBudget);
  const sell = vwapSellByBase(book.bids, usdtToSell);
  const feeBps = FEES_BPS.bitfinex.taker;
  return {
    name: "Bitfinex",
    buyUsdt: buy.filledBaseQty > 0
      ? {
          usdSpent: buy.filledQuoteQty * (1 + feeBps / 10_000),
          usdtAcquired: buy.filledBaseQty * (1 - feeBps / 10_000),
          vwap: buy.avgPrice,
          trc20FeeBps: trc20Bps,
        }
      : null,
    sellUsdt: sell.filledBaseQty > 0
      ? {
          usdtSpent: sell.filledBaseQty * (1 + feeBps / 10_000),
          usdAcquired: sell.filledQuoteQty * (1 - feeBps / 10_000),
          vwap: sell.avgPrice,
          trc20FeeBps: trc20Bps,
        }
      : null,
  };
}

function averagePrice(levels: [string, string][]): number {
  if (levels.length === 0) return 1;
  const first = Number(levels[0]![0]);
  const last = Number(levels[Math.min(levels.length - 1, 4)]![0]);
  return (first + last) / 2;
}
