#!/usr/bin/env tsx
import "dotenv/config";
import { signedRequest } from "../lib/max-private.js";

// Probe a signed endpoint; return { ok, status, body }
async function probe(path: string, params: Record<string,unknown> = {}) {
  try {
    const body = await signedRequest<unknown>({ method: "GET", path, params });
    return { ok: true, status: 200, body };
  } catch (err: unknown) {
    const e = err as { status?: number; body?: string };
    return { ok: false, status: e.status ?? 0, body: e.body ?? String(err) };
  }
}

(async () => {
  console.log("Probing MAX v3 endpoints...\n");

  // Try candidate paths for member profile / accounts
  const candidates = [
    "/api/v3/members/profile",
    "/api/v3/members/me",
    "/api/v3/members/accounts",
    "/api/v3/wallet/spot/accounts",
    "/api/v3/info",
  ];

  for (const path of candidates) {
    const r = await probe(path);
    const icon = r.ok ? "✅" : r.status === 404 ? "❌ 404" : `⚠️  ${r.status}`;
    const preview = r.ok
      ? JSON.stringify(r.body).slice(0, 120)
      : String(r.body).slice(0, 80);
    console.log(`${icon}  ${path}`);
    if (r.ok) console.log(`     ${preview}\n`);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
