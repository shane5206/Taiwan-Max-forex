#!/usr/bin/env tsx
import "dotenv/config";
import { runTriangular, type Cycle } from "../strategies/triangular-exec.js";

interface Args { cycle: Cycle; twd: number; loops: number; interval: number; }

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (name: string, fallback?: string): string | undefined => {
    const i = args.indexOf(name);
    if (i >= 0 && i + 1 < args.length) return args[i + 1];
    return fallback;
  };
  const cycle = (get("--cycle", "A") ?? "A").toUpperCase();
  if (cycle !== "A" && cycle !== "B") throw new Error(`--cycle must be A or B, got ${cycle}`);
  const twd = Number(get("--twd", "50000"));
  if (!Number.isFinite(twd) || twd <= 0) throw new Error(`--twd must be positive number`);
  const loops = Math.max(1, Math.floor(Number(get("--loops", "10"))));
  const interval = Math.max(0, Math.floor(Number(get("--interval", "30"))));
  return { cycle: cycle as Cycle, twd, loops, interval };
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  const args = parseArgs();
  const edges: number[] = [];
  let executableCount = 0;

  for (let i = 0; i < args.loops; i++) {
    try {
      const plan = await runTriangular(args.cycle, args.twd, { mode: "dry" });
      edges.push(plan.expectedEdgeBps);
      if (plan.decision === "EXECUTE") executableCount += 1;
    } catch (err) {
      console.error(JSON.stringify({ loop: i, error: String(err) }));
    }
    if (i < args.loops - 1 && args.interval > 0) await sleep(args.interval * 1000);
  }

  const sorted = [...edges].sort((a, b) => a - b);
  const pct = (p: number): number =>
    sorted.length === 0 ? NaN : sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
  const mean = edges.length === 0 ? NaN : edges.reduce((a, b) => a + b, 0) / edges.length;

  console.log("---SUMMARY---");
  console.log(JSON.stringify({
    cycle: args.cycle,
    notionalTwd: args.twd,
    loops: args.loops,
    samples: edges.length,
    executableCount,
    edgeBps: {
      min: sorted[0] ?? NaN,
      p10: pct(0.10),
      p50: pct(0.50),
      p90: pct(0.90),
      max: sorted[sorted.length - 1] ?? NaN,
      mean,
    },
  }, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
