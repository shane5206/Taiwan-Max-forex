import { fetchJson } from "./http.js";
import type { Level } from "./orderbook.js";

const BASE = "https://api.kucoin.com";

interface KuOrderbook { code: string; data: { sequence: string; time: number; bids: [string, string][]; asks: [string, string][] } }
interface KuTicker { code: string; data: { sequence: string; bestBid: string; bestBidSize: string; bestAsk: string; bestAskSize: string; price: string } }

export async function getKucoinTicker(symbol: string): Promise<{
  bid: number; bidQty: number; ask: number; askQty: number; last: number;
}> {
  const raw = await fetchJson<KuTicker>(`${BASE}/api/v1/market/orderbook/level1?symbol=${symbol}`);
  if (raw.code !== "200000") throw new Error(`kucoin ticker err ${raw.code}`);
  const d = raw.data;
  return {
    bid: Number(d.bestBid),
    bidQty: Number(d.bestBidSize),
    ask: Number(d.bestAsk),
    askQty: Number(d.bestAskSize),
    last: Number(d.price),
  };
}

export async function getKucoinDepth(symbol: string): Promise<{ asks: Level[]; bids: Level[] }> {
  // level2_20 is public (no auth); covers top 20 levels
  const raw = await fetchJson<KuOrderbook>(`${BASE}/api/v1/market/orderbook/level2_20?symbol=${symbol}`);
  if (raw.code !== "200000") throw new Error(`kucoin depth err ${raw.code}`);
  return { asks: raw.data.asks ?? [], bids: raw.data.bids ?? [] };
}
