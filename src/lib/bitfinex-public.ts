import { fetchJson } from "./http.js";
import type { Level } from "./orderbook.js";

const BASE = "https://api-pub.bitfinex.com";

// v2 ticker response is a positional array; for spot symbols (t-prefixed):
// [bid, bidSize, ask, askSize, dailyChange, dailyChangePerc, lastPrice, volume, high, low]
export async function getBitfinexTicker(symbol: string): Promise<{
  bid: number; bidSize: number; ask: number; askSize: number; last: number; volume: number;
}> {
  const arr = await fetchJson<number[]>(`${BASE}/v2/ticker/${symbol}`);
  return {
    bid: Number(arr[0]),
    bidSize: Number(arr[1]),
    ask: Number(arr[2]),
    askSize: Number(arr[3]),
    last: Number(arr[6]),
    volume: Number(arr[7]),
  };
}

// v2 book response: [[price, count, amount], ...]; amount > 0 = bid, < 0 = ask
export async function getBitfinexBook(symbol: string, precision: "P0" | "P1" | "P2" | "P3" = "P0", len = 25): Promise<{ asks: Level[]; bids: Level[] }> {
  const arr = await fetchJson<[number, number, number][]>(`${BASE}/v2/book/${symbol}/${precision}?len=${len}`);
  const asks: Level[] = [];
  const bids: Level[] = [];
  for (const [price, _count, amount] of arr) {
    const p = String(price);
    const v = String(Math.abs(amount));
    if (amount > 0) bids.push([p, v]);
    else if (amount < 0) asks.push([p, v]);
  }
  asks.sort((a, b) => Number(a[0]) - Number(b[0]));
  bids.sort((a, b) => Number(b[0]) - Number(a[0]));
  return { asks, bids };
}
