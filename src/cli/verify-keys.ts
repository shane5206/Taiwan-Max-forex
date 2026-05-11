#!/usr/bin/env tsx
import { getMe, getAccounts } from "../lib/max-private.js";
import { collectPermissions, isWithdrawAllowed } from "../lib/safety.js";

(async () => {
  const me = await getMe();
  const perms = [...collectPermissions(me)].sort();
  const withdraw = isWithdrawAllowed(me);
  const accounts = await getAccounts();

  const balances = accounts
    .filter((a) => Number(a.balance) + Number(a.locked) > 0)
    .map((a) => ({ currency: a.currency, balance: a.balance, locked: a.locked }));

  console.log(JSON.stringify({
    ok: !withdraw,
    sn: me.sn ?? null,
    email: me.email ?? null,
    permissions: perms,
    withdrawAllowed: withdraw,
    balances,
    advice: withdraw
      ? "❌ Revoke this key NOW and reissue with view + trade only. Do not enable withdraw."
      : "✅ Key has no withdraw permission. Safe for monitor and dry-run.",
  }, null, 2));

  if (withdraw) process.exit(2);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
