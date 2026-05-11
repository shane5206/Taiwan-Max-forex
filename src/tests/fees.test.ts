import { describe, expect, it } from "vitest";
import { FEES_BPS, FIXED_FEES, twdWithdrawFeeBps, usdtWithdrawFeeBps } from "../lib/fees.js";

describe("fees", () => {
  it("MAX taker 15bps default", () => {
    expect(FEES_BPS.max.taker).toBe(15);
    expect(FEES_BPS.max.takerWithMaxToken).toBe(7.5);
  });

  it("TWD withdraw fee as bps shrinks with notional", () => {
    // NT$30 / NT$100k = 30 bps
    expect(twdWithdrawFeeBps(100_000)).toBeCloseTo(3, 6);
    // NT$30 / NT$1M = 3 bps... wait actually 30/1_000_000 * 10000 = 0.3 bps
    expect(twdWithdrawFeeBps(1_000_000)).toBeCloseTo(0.3, 6);
  });

  it("Bankee free path returns 0", () => {
    expect(twdWithdrawFeeBps(100_000, true)).toBe(0);
  });

  it("USDT TRC20 withdraw per-notional bps", () => {
    expect(usdtWithdrawFeeBps(10_000, 1)).toBeCloseTo(1, 6); // 1 USDT / 10k USDT * 10000 = 1 bps
    expect(usdtWithdrawFeeBps(100_000, FIXED_FEES.binanceUsdtTrc20WithdrawUsdt)).toBeCloseTo(0.1, 6);
  });
});
