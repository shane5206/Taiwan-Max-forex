#!/usr/bin/env tsx
import "dotenv/config";
import { createHmac } from "node:crypto";
import { getAccounts, buildSignedHeaders } from "../lib/max-private.js";
import { collectPermissions, isWithdrawAllowed } from "../lib/safety.js";

const BASE = "https://max-api.maicoin.com";

async function tryPath(path: string): Promise<{ path: string; status: number; body: unknown }> {
  const accessKey = process.env.MAX_ACCESSKEY ?? "";
  const secret = process.env.MAX_SECRET ?? "";
  const nonce = Date.now();
  const { headers } = buildSignedHeaders({ accessKey, secret, path, params: {}, nonce, method: "GET" });

  const res = await fetch(`${BASE}${path}`, { headers });
  let body: unknown;
  try { body = await res.json(); } catch { body = await res.text(); }
  return { path, status: res.status, body };
}

(async () => {
  // Try both v2 and v3 to see which the key accepts
  const [r2, r3] = await Promise.all([
    tryPath("/api/v2/members/me"),
    tryPath("/api/v3/members/me"),
  ]);

  console.log("\n=== /api/v2/members/me ===");
  console.log("Status:", r2.status);
  console.log("Body:", JSON.stringify(r2.body, null, 2));

  console.log("\n=== /api/v3/members/me ===");
  console.log("Status:", r3.status);
  console.log("Body:", JSON.stringify(r3.body, null, 2));

  // Use whichever succeeded
  const working = [r2, r3].find(r => r.status === 200);
  if (!working) {
    console.error("\n❌ Both endpoints failed. Check key or signing.");
    process.exit(1);
  }

  console.log(`\n✅ Working endpoint: ${working.path}`);

  const me = working.body as Record<string, unknown>;
  const perms = [...collectPermissions(me)].sort();
  const withdraw = isWithdrawAllowed(me);

  // Balances from whichever v worked
  const accountsPath = working.path.includes("v3") ? "/api/v3/members/accounts" : "/api/v2/members/accounts";
  const accRes = await tryPath(accountsPath);
  const accounts = Array.isArray(accRes.body) ? accRes.body as Array<{currency:string;balance:string;locked:string}> : [];

  const balances = accounts
    .filter((a) => Number(a.balance) + Number(a.locked) > 0)
    .map((a) => ({ currency: a.currency, balance: a.balance, locked: a.locked }));

  console.log(JSON.stringify({
    ok: !withdraw,
    endpoint: working.path,
    sn: (me.sn as string) ?? null,
    email: (me.email as string) ?? null,
    permissions: perms,
    withdrawAllowed: withdraw,
    balances,
    advice: withdraw
      ? "❌ Revoke key — has withdraw permission!"
      : "✅ No withdraw permission. Safe.",
  }, null, 2));

  if (withdraw) process.exit(2);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
