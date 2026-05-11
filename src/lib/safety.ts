import { getMe, type MaxMemberMe } from "./max-private.js";
import { log } from "./logger.js";

export class WithdrawPermissionError extends Error {
  constructor() {
    super("REFUSING TO RUN: API key has withdraw permission. Revoke and reissue with view+trade only.");
  }
}

/**
 * Collect all permission/scope hints MAX returns about the active key.
 * Different SDK eras use different field names; we union them to be safe.
 */
export function collectPermissions(me: MaxMemberMe): Set<string> {
  const acc = new Set<string>();
  for (const p of me.permissions ?? []) acc.add(p.toLowerCase());
  for (const k of me.api_keys ?? []) {
    for (const p of k.permissions ?? []) acc.add(p.toLowerCase());
    for (const p of k.scopes ?? []) acc.add(p.toLowerCase());
    for (const p of k.allowed_actions ?? []) acc.add(p.toLowerCase());
  }
  return acc;
}

export function isWithdrawAllowed(me: MaxMemberMe): boolean {
  const perms = collectPermissions(me);
  return perms.has("withdraw") || perms.has("withdraws") || perms.has("crypto_withdraw") || perms.has("fiat_withdraw");
}

/**
 * Hard refuse to operate if the active key has withdraw permission. Call this
 * before any code path that may submit orders.
 */
export async function ensureNoWithdrawPermission(): Promise<MaxMemberMe> {
  const me = await getMe();
  if (isWithdrawAllowed(me)) {
    log.error("safety.withdraw-permission-detected", { permissions: [...collectPermissions(me)] });
    throw new WithdrawPermissionError();
  }
  log.info("safety.permission-check-passed", { permissions: [...collectPermissions(me)] });
  return me;
}
