import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runScan } from "../../src/scan.js";
import { log } from "../../src/lib/logger.js";

/**
 * Cron entry: invoked by GitHub Actions workflow (every 5 min) and optionally
 * by Vercel's own cron (Hobby tier = daily). Authenticated via bearer token.
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
    res.status(result.ok ? 200 : 207).json(result);
  } catch (err) {
    log.error("scan.unhandled", { err: String(err) });
    res.status(500).json({ error: String(err) });
  }
}
