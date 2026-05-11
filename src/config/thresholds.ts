export interface Thresholds {
  fxPremiumBps: number;
  triangularBps: number;
  crossExchangeBps: number;
  depegWarnBps: number;   // attach DEPEG_WARNING tag if |USDT-USD| drift > this
  depegAbortBps: number;  // refuse to emit fx-premium / cross-exchange if drift > this
}

export function loadThresholds(env = process.env): Thresholds {
  return {
    fxPremiumBps: numberOr(env.THRESHOLD_FX_BPS, 80),
    triangularBps: numberOr(env.THRESHOLD_TRI_BPS, 15),
    crossExchangeBps: numberOr(env.THRESHOLD_CROSS_BPS, 30),
    depegWarnBps: numberOr(env.DEPEG_WARN_BPS, 30),
    depegAbortBps: numberOr(env.DEPEG_ABORT_BPS, 100),
  };
}

function numberOr(v: string | undefined, fallback: number): number {
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
