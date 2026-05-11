import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runScan } from "../../src/scan.js";
import { sendTelegram } from "../../src/lib/telegram.js";
import { log } from "../../src/lib/logger.js";

/**
 * Vercel-native daily cron entry (Hobby tier supports daily).
 * Runs one scan and always reports the summary to Telegram, even when no
 * signal beat the threshold — gives the user proof-of-life and a daily pulse.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers["authorization"];
  if (!expected || auth !== `Bearer ${expected}`) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  try {
    const result = await runScan();
    const msg = [
      "<b>📊 MAX 套利每日掃描</b>",
      `<i>${result.ts}</i>`,
      `signals scanned: ${result.signalCount}`,
      `signals emitted: ${result.emittedCount}`,
      result.errors.length > 0 ? `errors: ${result.errors.length}` : "errors: 0",
    ].join("\n");
    await sendTelegram(msg);
    res.status(result.ok ? 200 : 207).json(result);
  } catch (err) {
    log.error("daily-summary.unhandled", { err: String(err) });
    res.status(500).json({ error: String(err) });
  }
}
