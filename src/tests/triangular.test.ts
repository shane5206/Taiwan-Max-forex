import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../lib/max-public.js", () => ({
  getDepth: vi.fn(),
}));

import { getDepth } from "../lib/max-public.js";
import { evaluateTriangular } from "../strategies/triangular.js";

const mocked = getDepth as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => mocked.mockReset());
afterEach(() => mocked.mockReset());

describe("triangular evaluator", () => {
  it("computes both cycles from injected depths", async () => {
    mocked.mockImplementation(async (market: string) => {
      if (market === "usdttwd") return { asks: [["32.10", "100000"]], bids: [["32.00", "100000"]], timestamp: 0 };
      if (market === "btcusdt") return { asks: [["60000", "100"]], bids: [["59950", "100"]], timestamp: 0 };
      if (market === "btctwd") return { asks: [["1925000", "100"]], bids: [["1920000", "100"]], timestamp: 0 };
      throw new Error(`unexpected ${market}`);
    });

    const signals = await evaluateTriangular(100_000);
    expect(signals.length).toBe(2);
    for (const s of signals) {
      expect(s.type).toBe("triangular");
      expect(typeof s.edgeBps).toBe("number");
      expect(Number.isFinite(s.edgeBps)).toBe(true);
    }
  });

  it("negative edge when crossing the spread three times costs more than the implied edge", async () => {
    mocked.mockImplementation(async (market: string) => {
      // Construct a flat-arbitrage book: cross prices give exactly 1.0000 round-trip pre-fee
      if (market === "usdttwd") return { asks: [["32.00", "100000"]], bids: [["32.00", "100000"]], timestamp: 0 };
      if (market === "btcusdt") return { asks: [["60000", "100"]], bids: [["60000", "100"]], timestamp: 0 };
      if (market === "btctwd") return { asks: [["1920000", "100"]], bids: [["1920000", "100"]], timestamp: 0 };
      throw new Error(`unexpected ${market}`);
    });
    const signals = await evaluateTriangular(100_000);
    for (const s of signals) {
      // After 3 × 15 bps taker, edge should be ~ -45 bps
      expect(s.edgeBps).toBeLessThan(-30);
      expect(s.edgeBps).toBeGreaterThan(-60);
    }
  });
});
