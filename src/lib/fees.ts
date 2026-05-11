// Single source of truth for fees. All numbers in basis points unless noted.
// Verify against docs/arbitrage-research.md §7 before any production change.

export const FEES_BPS = {
  max: {
    taker: 15,
    maker: 5,
    takerWithMaxToken: 7.5,
    makerWithMaxToken: 2.5,
  },
  binance: {
    taker: 10,
  },
  kucoin: {
    taker: 10,
  },
  bitfinex: {
    taker: 20,
  },
  bankUsdSpreadEstimate: 50, // BoT cash-sell vs cash-buy mid spread, half-width
} as const;

// Fixed-fee items: convert to bps per-notional at call time
export const FIXED_FEES = {
  maxTwdWithdrawTwd: 30, // free if user banks at Bankee
  maxUsdtTrc20WithdrawUsdt: 0, // verify against MAX docs before production
  binanceUsdtTrc20WithdrawUsdt: 1,
  kucoinUsdtTrc20WithdrawUsdt: 1,
  bitfinexUsdtTrc20WithdrawUsdt: 1,
} as const;

export function twdWithdrawFeeBps(notionalTwd: number, bankeeFree = false): number {
  if (bankeeFree || notionalTwd <= 0) return 0;
  return (FIXED_FEES.maxTwdWithdrawTwd / notionalTwd) * 10_000;
}

export function usdtWithdrawFeeBps(notionalUsdt: number, perWithdraw: number): number {
  if (notionalUsdt <= 0) return 0;
  return (perWithdraw / notionalUsdt) * 10_000;
}
