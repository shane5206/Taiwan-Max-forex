import { getDepth } from "../lib/max-public.js";
import { vwapBuyByQuote, vwapBuyByBase, vwapSellByBase } from "../lib/orderbook.js";
import { FEES_BPS } from "../lib/fees.js";
import { log } from "../lib/logger.js";

export type Cycle = "A" | "B";
export type Mode = "dry" | "live";

export interface LegPlan {
  market: string;
  side: "buy" | "sell";
  /** quote currency input (e.g. TWD spent or USDT spent) for "buy"; base output for sell */
  inputQty: number;
  expectedAvgPrice: number;
  expectedOutputQty: number;
  levelsHit: number;
  fullyFilled: boolean;
  /** Worst price we saw in the VWAP walk; used as the IOC limit (plus safety cushion). */
  worstPrice: number;
}

export interface CyclePlan {
  cycle: Cycle;
  notionalTwd: number;
  legs: [LegPlan, LegPlan, LegPlan];
  expectedTwdOut: number;
  expectedEdgeBps: number;
  decision: "EXECUTE" | "SKIP-NEGATIVE-AFTER-FEES" | "SKIP-BELOW-THRESHOLD";
  ts: number;
}

export interface DryRunOptions {
  mode: Mode;
  thresholdBps: number;
  safetyBufferBps: number;
  cushionBps: number;
}

const DEFAULT_OPTIONS: DryRunOptions = {
  mode: "dry",
  thresholdBps: 5,
  safetyBufferBps: 5,
  cushionBps: 5,
};

/**
 * Build and (optionally) execute one triangular cycle.
 * mode="dry" never submits any order; it logs the plan only.
 * mode="live" is intentionally NOT wired up in this repo phase — it throws.
 */
export async function runTriangular(cycle: Cycle, notionalTwd: number, options: Partial<DryRunOptions> = {}): Promise<CyclePlan> {
  const opts: DryRunOptions = { ...DEFAULT_OPTIONS, ...options };
  const ts = Date.now();
  const [usdttwd, btcusdt, btctwd] = await Promise.all([
    getDepth("usdttwd", 50),
    getDepth("btcusdt", 50),
    getDepth("btctwd", 50),
  ]);

  const takerBps = FEES_BPS.max.taker;
  const feeFactor = 1 - takerBps / 10_000;

  let legs: [LegPlan, LegPlan, LegPlan];
  let twdOut: number;

  if (cycle === "A") {
    // Leg 1: buy USDT on usdttwd with TWD
    const l1 = vwapBuyByQuote(usdttwd.asks, notionalTwd);
    const usdtAfter = l1.filledBaseQty * feeFactor;
    // Leg 2: buy BTC on btcusdt with USDT
    const l2 = vwapBuyByQuote(btcusdt.asks, usdtAfter);
    const btcAfter = l2.filledBaseQty * feeFactor;
    // Leg 3: sell BTC on btctwd
    const l3 = vwapSellByBase(btctwd.bids, btcAfter);
    twdOut = l3.filledQuoteQty * feeFactor;

    legs = [
      legPlan("usdttwd", "buy", l1.filledQuoteQty, l1.avgPrice, l1.filledBaseQty, l1.levelsHit, l1.fullyFilled, worstAskOrBid(usdttwd.asks, l1.levelsHit, "asc")),
      legPlan("btcusdt", "buy", l2.filledQuoteQty, l2.avgPrice, l2.filledBaseQty, l2.levelsHit, l2.fullyFilled, worstAskOrBid(btcusdt.asks, l2.levelsHit, "asc")),
      legPlan("btctwd", "sell", l3.filledBaseQty, l3.avgPrice, l3.filledQuoteQty, l3.levelsHit, l3.fullyFilled, worstAskOrBid(btctwd.bids, l3.levelsHit, "desc")),
    ];
  } else {
    // Leg 1: buy BTC on btctwd with TWD
    const l1 = vwapBuyByQuote(btctwd.asks, notionalTwd);
    const btcAfter = l1.filledBaseQty * feeFactor;
    // Leg 2: sell BTC on btcusdt for USDT
    const l2 = vwapSellByBase(btcusdt.bids, btcAfter);
    const usdtAfter = l2.filledQuoteQty * feeFactor;
    // Leg 3: sell USDT on usdttwd for TWD
    const l3 = vwapSellByBase(usdttwd.bids, usdtAfter);
    twdOut = l3.filledQuoteQty * feeFactor;

    legs = [
      legPlan("btctwd", "buy", l1.filledQuoteQty, l1.avgPrice, l1.filledBaseQty, l1.levelsHit, l1.fullyFilled, worstAskOrBid(btctwd.asks, l1.levelsHit, "asc")),
      legPlan("btcusdt", "sell", l2.filledBaseQty, l2.avgPrice, l2.filledQuoteQty, l2.levelsHit, l2.fullyFilled, worstAskOrBid(btcusdt.bids, l2.levelsHit, "desc")),
      legPlan("usdttwd", "sell", l3.filledBaseQty, l3.avgPrice, l3.filledQuoteQty, l3.levelsHit, l3.fullyFilled, worstAskOrBid(usdttwd.bids, l3.levelsHit, "desc")),
    ];
  }

  const twdIn = legs[0].inputQty;
  const expectedEdgeBps = twdIn > 0 ? ((twdOut / twdIn) - 1) * 10_000 : -Infinity;

  let decision: CyclePlan["decision"];
  if (expectedEdgeBps < 0) decision = "SKIP-NEGATIVE-AFTER-FEES";
  else if (expectedEdgeBps < opts.thresholdBps - opts.safetyBufferBps) decision = "SKIP-BELOW-THRESHOLD";
  else decision = "EXECUTE";

  const plan: CyclePlan = {
    cycle,
    notionalTwd: twdIn,
    legs,
    expectedTwdOut: twdOut,
    expectedEdgeBps,
    decision,
    ts,
  };

  log.info("triangular.plan", plan as unknown as Record<string, unknown>);

  if (opts.mode === "live") {
    // Intentionally guarded. Phase D will replace this with the real submitter,
    // gated by safety.ts + balance sanity + kill-switch + circuit breaker.
    throw new Error("Live triangular execution is not enabled in this repo phase. See docs/phase-gates.md.");
  }

  // dry-run: do nothing else
  void opts.cushionBps;
  return plan;
}

function legPlan(market: string, side: "buy" | "sell", inputQty: number, expectedAvgPrice: number, expectedOutputQty: number, levelsHit: number, fullyFilled: boolean, worstPrice: number): LegPlan {
  return { market, side, inputQty, expectedAvgPrice, expectedOutputQty, levelsHit, fullyFilled, worstPrice };
}

function worstAskOrBid(levels: [string, string][], levelsHit: number, dir: "asc" | "desc"): number {
  if (levels.length === 0 || levelsHit <= 0) return 0;
  const idx = Math.min(levelsHit - 1, levels.length - 1);
  const p = Number(levels[idx]![0]);
  void dir;
  return p;
}
