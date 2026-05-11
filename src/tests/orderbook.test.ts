import { describe, expect, it } from "vitest";
import { vwapBuyByBase, vwapBuyByQuote, vwapSellByBase, vwapSellByQuote, type Level } from "../lib/orderbook.js";

const asks: Level[] = [
  ["32.00", "100"],
  ["32.05", "200"],
  ["32.10", "500"],
];
const bids: Level[] = [
  ["31.95", "150"],
  ["31.90", "300"],
  ["31.80", "1000"],
];

describe("orderbook VWAP", () => {
  it("walks asks by base until budget filled", () => {
    const r = vwapBuyByBase(asks, 150);
    expect(r.filledBaseQty).toBe(150);
    // 100*32 + 50*32.05 = 3200 + 1602.5 = 4802.5
    expect(r.filledQuoteQty).toBeCloseTo(4802.5, 6);
    expect(r.avgPrice).toBeCloseTo(4802.5 / 150, 6);
    expect(r.levelsHit).toBe(2);
    expect(r.fullyFilled).toBe(true);
  });

  it("walks asks by quote (TWD budget)", () => {
    // 5000 TWD: 100*32=3200 (uses 100 USDT), remaining 1800 / 32.05 = 56.16 USDT
    const r = vwapBuyByQuote(asks, 5000);
    expect(r.filledQuoteQty).toBeCloseTo(5000, 6);
    expect(r.filledBaseQty).toBeCloseTo(100 + 1800 / 32.05, 6);
    expect(r.levelsHit).toBe(2);
  });

  it("partial fill when budget exceeds top-of-book depth", () => {
    const r = vwapBuyByBase(asks, 10_000);
    expect(r.fullyFilled).toBe(false);
    expect(r.filledBaseQty).toBe(800);
    expect(r.levelsHit).toBe(3);
  });

  it("sell by base walks bids high-to-low", () => {
    const r = vwapSellByBase(bids, 200);
    // 150 @ 31.95 = 4792.5; 50 @ 31.90 = 1595; total = 6387.5
    expect(r.filledBaseQty).toBe(200);
    expect(r.filledQuoteQty).toBeCloseTo(6387.5, 6);
    expect(r.avgPrice).toBeCloseTo(6387.5 / 200, 6);
  });

  it("sell by quote target", () => {
    const r = vwapSellByQuote(bids, 5000);
    // First level produces 150*31.95 = 4792.5; need 207.5 more at 31.90 -> 6.5047 USDT
    expect(r.filledQuoteQty).toBeCloseTo(5000, 6);
    expect(r.filledBaseQty).toBeCloseTo(150 + 207.5 / 31.90, 6);
  });

  it("ignores garbage levels", () => {
    const dirty: Level[] = [["NaN", "100"], ["32.00", "-10"], ["32.00", "100"]];
    const r = vwapBuyByBase(dirty, 50);
    expect(r.filledBaseQty).toBe(50);
    expect(r.avgPrice).toBeCloseTo(32, 6);
  });

  it("returns zero on empty book", () => {
    const r = vwapBuyByBase([], 100);
    expect(r.filledBaseQty).toBe(0);
    expect(r.avgPrice).toBe(0);
    expect(r.fullyFilled).toBe(false);
  });
});
