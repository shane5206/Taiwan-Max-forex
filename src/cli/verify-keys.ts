#!/usr/bin/env tsx
import "dotenv/config";
import { getMe, getAccounts } from "../lib/max-private.js";

(async () => {
  const me = await getMe();
  const accounts = await getAccounts();

  const balances = accounts
    .filter((a) => Number(a.balance) + Number(a.locked) > 0)
    .map((a) => ({ currency: a.currency, balance: a.balance, locked: a.locked }));

  // v3 /info does not expose per-key withdraw permission; we can only confirm
  // the key authenticated successfully. Withdraw permission should be checked
  // manually in MAX dashboard (Account → API Keys → Key details).
  console.log(JSON.stringify({
    ok: true,
    email: me.email ?? null,
    level: me.level ?? null,
    balances,
    advice: "✅ Key authenticated. Verify manually in MAX dashboard that this key has NO withdraw permission.",
  }, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
