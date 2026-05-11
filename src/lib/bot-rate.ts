import iconv from "iconv-lite";
import { fetchBuffer } from "./http.js";

export interface UsdTwdRates {
  cashBuy: number;   // bank cash buys USD from you (you sell USD)
  cashSell: number;  // bank cash sells USD to you (you buy USD)
  spotBuy: number;   // spot/sight, used for wires
  spotSell: number;
  asOf: Date;
}

const URL = "https://rate.bot.com.tw/xrt/flcsv/0/day/USD";

let cache: { value: UsdTwdRates; expiresAt: number } | null = null;

/**
 * Bank of Taiwan publishes daily exchange rates as a Big5-encoded CSV.
 * The current-day endpoint returns a header row plus one data row for "美金 (USD)".
 * Columns of interest: 現金買入(2), 現金賣出(3), 即期買入(4), 即期賣出(5).
 *
 * BoT does not update intra-minute; we cache for 5 minutes per process.
 */
export async function getUsdTwdRates(ttlMs = 5 * 60_000): Promise<UsdTwdRates> {
  if (cache && Date.now() < cache.expiresAt) return cache.value;

  const buf = await fetchBuffer(URL, { timeoutMs: 8_000, retries: 2 });
  const text = iconv.decode(buf, "big5");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  // First line is the header (in Chinese). Subsequent lines are per-rate-type rows.
  // We pick the line that looks like the daily/realtime rate for USD by parsing
  // columns and grabbing the first row with all four numeric rate cells.
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split(",").map((c) => c.trim());
    if (cells.length < 6) continue;
    const cashBuy = Number(cells[2]);
    const cashSell = Number(cells[3]);
    const spotBuy = Number(cells[4]);
    const spotSell = Number(cells[5]);
    if (
      Number.isFinite(cashBuy) && cashBuy > 0 &&
      Number.isFinite(cashSell) && cashSell > 0 &&
      Number.isFinite(spotBuy) && spotBuy > 0 &&
      Number.isFinite(spotSell) && spotSell > 0
    ) {
      const value: UsdTwdRates = {
        cashBuy, cashSell, spotBuy, spotSell,
        asOf: new Date(),
      };
      cache = { value, expiresAt: Date.now() + ttlMs };
      return value;
    }
  }
  throw new Error(`bot-rate: no parseable USD rate row in ${lines.length} lines`);
}

export function clearBotRateCache(): void {
  cache = null;
}
