import { evaluateFxPremium } from "./strategies/fx-premium.js";
import { evaluateTriangular } from "./strategies/triangular.js";
import { evaluateCrossExchange } from "./strategies/cross-exchange.js";
import { getUsdtUsdReference } from "./lib/usdt-usd-reference.js";
import { sendTelegram, escapeHtml } from "./lib/telegram.js";
import { log } from "./lib/logger.js";
import { loadSettings } from "./config/env.js";
import { loadThresholds } from "./config/thresholds.js";
import type { Signal } from "./strategies/types.js";

export interface ScanResult {
  ok: boolean;
  signalCount: number;
  emittedCount: number;
  errors: string[];
  ts: string;
}

/**
 * Run all three strategies across the notional ladder, emit Telegram if any
 * signal beats its threshold, and log every signal as a JSON line.
 *
 * This function is pure-of-side-effects-other-than-logging when no signal is
 * actionable: it never sends Telegram on a quiet scan to avoid alert fatigue.
 */
export async function runScan(): Promise<ScanResult> {
  const tsStart = Date.now();
  const errors: string[] = [];
  const settings = loadSettings(process.env);
  const thresholds = loadThresholds(process.env);

  // Single shared depeg probe per scan (avoid 3x duplicate calls)
  let usdtUsdDepegBps = 0;
  try {
    const r = await getUsdtUsdReference();
    usdtUsdDepegBps = r.depegBps;
    log.info("scan.usdt-usd", { midPrice: r.midPrice, depegBps: r.depegBps, sources: Object.keys(r.sources) });
  } catch (err) {
    errors.push(`usdt-usd-reference: ${err}`);
    log.error("scan.usdt-usd-failed", { err: String(err) });
  }

  const allSignals: Signal[] = [];

  for (const notional of settings.notionalLadder) {
    const tasks: Array<Promise<Signal[]>> = [
      evaluateFxPremium(notional, {
        bankeeFreeWithdraw: settings.bankeeFreeWithdraw,
        depegWarnBps: thresholds.depegWarnBps,
        depegAbortBps: thresholds.depegAbortBps,
      }),
      evaluateTriangular(notional),
      evaluateCrossExchange(notional, {
        depegWarnBps: thresholds.depegWarnBps,
        depegAbortBps: thresholds.depegAbortBps,
        usdtUsdDepegBps,
      }),
    ];
    const settled = await Promise.allSettled(tasks);
    for (const r of settled) {
      if (r.status === "fulfilled") {
        allSignals.push(...r.value);
      } else {
        errors.push(String(r.reason));
        log.warn("scan.strategy-failed", { notional, err: String(r.reason) });
      }
    }
  }

  // Persist every signal as one JSON line (lands in Vercel logs)
  for (const s of allSignals) {
    log.info("scan.signal", s as unknown as Record<string, unknown>);
  }

  const actionable = allSignals.filter((s) => isActionable(s, thresholds));
  if (actionable.length > 0) {
    const html = formatTelegramMessage(actionable);
    await sendTelegram(html);
  }

  return {
    ok: errors.length === 0,
    signalCount: allSignals.length,
    emittedCount: actionable.length,
    errors,
    ts: new Date(tsStart).toISOString(),
  };
}

function isActionable(s: Signal, t: ReturnType<typeof loadThresholds>): boolean {
  if (s.tags?.includes("ABORTED")) return false;
  const threshold = s.type === "fx-premium"
    ? t.fxPremiumBps
    : s.type === "triangular"
    ? t.triangularBps
    : t.crossExchangeBps;
  return s.edgeBps >= threshold;
}

function formatTelegramMessage(signals: Signal[]): string {
  const sorted = [...signals].sort((a, b) => b.edgeBps - a.edgeBps);
  const lines: string[] = [];
  lines.push("<b>🚨 MAX 套利訊號</b>");
  lines.push(`<i>${new Date().toISOString()}</i>`);
  lines.push("");
  for (const s of sorted.slice(0, 10)) {
    const tag = s.tags && s.tags.length > 0 ? ` [${s.tags.join(",")}]` : "";
    lines.push(`<b>${escapeHtml(s.type)}</b> ${s.edgeBps.toFixed(1)} bps${tag}`);
    lines.push(`  ${escapeHtml(s.route)}`);
    lines.push(`  notional NT$${s.notionalTwd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
    lines.push("");
  }
  if (sorted.length > 10) lines.push(`... +${sorted.length - 10} more`);
  return lines.join("\n");
}
