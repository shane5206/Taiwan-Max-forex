import { fetchJson } from "./http.js";
import type { Level } from "./orderbook.js";

const BASE = "https://api.binance.com";

interface RawBookTicker { symbol: string; bidPrice: string; bidQty: string; askPrice: string; askQty: string; }
interface RawDepth { lastUpdateId: number; bids: [string, string][]; asks: [string, string][]; }

export async function getBinanceBookTicker(symbol: string): Promise<{
  bid: number; bidQty: number; ask: number; askQty: number;
}> {
  const raw = await fetchJson<RawBookTicker>(`${BASE}/api/v3/ticker/bookTicker?symbol=${symbol}`);
  return {
    bid: Number(raw.bidPrice),
    bidQty: Number(raw.bidQty),
    ask: Number(raw.askPrice),
    askQty: Number(raw.askQty),
  };
}

export async function getBinanceDepth(symbol: string, limit = 50): Promise<{ asks: Level[]; bids: Level[] }> {
  const raw = await fetchJson<RawDepth>(`${BASE}/api/v3/depth?symbol=${symbol}&limit=${limit}`);
  return { asks: raw.asks ?? [], bids: raw.bids ?? [] };
}
