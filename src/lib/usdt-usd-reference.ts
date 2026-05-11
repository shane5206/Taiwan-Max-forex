import { getBinanceBookTicker } from "./binance-public.js";
import { getKucoinTicker } from "./kucoin-public.js";
import { getBitfinexTicker } from "./bitfinex-public.js";
import { log } from "./logger.js";

export interface UsdtUsdReference {
  /** Best estimate of 1 USDT in USD, median of the venues that responded. */
  midPrice: number;
  /** Best ask to BUY USDT priced in USD (so a buyer pays this for 1 USDT). */
  buyUsdt: number;
  /** Best bid to SELL USDT priced in USD. */
  sellUsdt: number;
  /** Absolute drift from 1.0000 in basis points (depeg magnitude). */
  depegBps: number;
  sources: Record<string, { bid: number; ask: number } | { error: string }>;
}

/**
 * Build a USDT/USD reference price from Binance, KuCoin and Bitfinex.
 * - Binance: USDCUSDT (USDT price in USDC) → invert
 * - KuCoin: USDT-USDC (USDT priced in USDC)
 * - Bitfinex: USTUSD (USDT priced in USD)
 *
 * USDC is treated as 1.0000 USD for the purpose of this reference; the small
 * USDC-USD drift is folded into the depeg signal and accepted.
 */
export async function getUsdtUsdReference(): Promise<UsdtUsdReference> {
  const sources: UsdtUsdReference["sources"] = {};
  const buys: number[] = [];
  const sells: number[] = [];

  // Binance USDCUSDT: bid = best price to sell USDC for USDT; we want 1 USDT in USDC.
  // Symbol USDCUSDT: base=USDC, quote=USDT, so price = USDT per 1 USDC.
  // 1 USDT in USDC = 1 / price. ask of USDCUSDT means buy 1 USDC for `ask` USDT,
  // i.e. sell 1 USDT for `1/ask` USDC. So buyUsdt (in USD) ≈ 1/bid, sellUsdt ≈ 1/ask.
  try {
    const t = await getBinanceBookTicker("USDCUSDT");
    if (t.bid > 0 && t.ask > 0) {
      const buy = 1 / t.bid;   // we BUY USDT by selling USDC at bid
      const sell = 1 / t.ask;  // we SELL USDT by buying USDC at ask
      sources["binance"] = { bid: sell, ask: buy };
      buys.push(buy);
      sells.push(sell);
    }
  } catch (err) {
    sources["binance"] = { error: String(err) };
  }

  // KuCoin USDT-USDC: base=USDT quote=USDC, price = USDC per 1 USDT.
  // ask = USDC needed to BUY 1 USDT (buyUsdt = ask), bid = USDC received per USDT (sellUsdt = bid).
  try {
    const t = await getKucoinTicker("USDT-USDC");
    if (t.bid > 0 && t.ask > 0) {
      sources["kucoin"] = { bid: t.bid, ask: t.ask };
      buys.push(t.ask);
      sells.push(t.bid);
    }
  } catch (err) {
    sources["kucoin"] = { error: String(err) };
  }

  // Bitfinex tUSTUSD: USDT priced in USD directly.
  try {
    const t = await getBitfinexTicker("tUSTUSD");
    if (t.bid > 0 && t.ask > 0) {
      sources["bitfinex"] = { bid: t.bid, ask: t.ask };
      buys.push(t.ask);
      sells.push(t.bid);
    }
  } catch (err) {
    sources["bitfinex"] = { error: String(err) };
  }

  if (buys.length === 0 || sells.length === 0) {
    log.error("usdt-usd-reference.no-source", { sources });
    throw new Error("usdt-usd-reference: no live USDT/USD venue responded");
  }

  const buyUsdt = median(buys);
  const sellUsdt = median(sells);
  const midPrice = (buyUsdt + sellUsdt) / 2;
  const depegBps = Math.abs(midPrice - 1) * 10_000;

  return { midPrice, buyUsdt, sellUsdt, depegBps, sources };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
