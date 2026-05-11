import { fetchJson } from "./http.js";
import type { Level } from "./orderbook.js";

const BASE = "https://max-api.maicoin.com";

export interface MaxTicker {
  market: string;
  last: number;
  buy: number;
  sell: number;
  open: number;
  high: number;
  low: number;
  vol: number;
  at: number;
}

export interface MaxDepth {
  asks: Level[];
  bids: Level[];
  timestamp: number;
}

export interface MaxMarket {
  id: string;
  base_unit: string;
  quote_unit: string;
  base_unit_precision?: number;
  quote_unit_precision?: number;
  min_base_amount?: number;
  min_quote_amount?: number;
}

interface RawTicker {
  at: number;
  buy: string;
  sell: string;
  last: string;
  open: string;
  high: string;
  low: string;
  vol: string;
}

interface RawDepth {
  asks: [string, string][];
  bids: [string, string][];
  timestamp: number;
}

export async function getTicker(market: string): Promise<MaxTicker> {
  const raw = await fetchJson<RawTicker>(`${BASE}/api/v2/tickers/${market}`);
  return {
    market,
    last: Number(raw.last),
    buy: Number(raw.buy),
    sell: Number(raw.sell),
    open: Number(raw.open),
    high: Number(raw.high),
    low: Number(raw.low),
    vol: Number(raw.vol),
    at: raw.at,
  };
}

export async function getDepth(market: string, limit = 50): Promise<MaxDepth> {
  const url = `${BASE}/api/v2/depth?market=${encodeURIComponent(market)}&limit=${limit}`;
  const raw = await fetchJson<RawDepth>(url);
  return {
    asks: raw.asks ?? [],
    bids: raw.bids ?? [],
    timestamp: raw.timestamp,
  };
}

export async function getMarkets(): Promise<MaxMarket[]> {
  return fetchJson<MaxMarket[]>(`${BASE}/api/v2/markets`);
}
