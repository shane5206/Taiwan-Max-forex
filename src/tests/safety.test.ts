import { describe, expect, it } from "vitest";
import { collectPermissions, isWithdrawAllowed } from "../lib/safety.js";

describe("safety.collectPermissions", () => {
  it("unions perms from top-level and api_keys arrays", () => {
    const set = collectPermissions({
      permissions: ["READ", "Trade"],
      api_keys: [
        { permissions: ["read"], scopes: ["trade"] },
        { allowed_actions: ["read", "trade"] },
      ],
    });
    expect(set.has("read")).toBe(true);
    expect(set.has("trade")).toBe(true);
    expect(set.has("withdraw")).toBe(false);
  });

  it("detects withdraw in any field", () => {
    expect(isWithdrawAllowed({ permissions: ["read", "withdraw"] })).toBe(true);
    expect(isWithdrawAllowed({ api_keys: [{ scopes: ["fiat_withdraw"] }] })).toBe(true);
    expect(isWithdrawAllowed({ permissions: ["read", "trade"] })).toBe(false);
  });
});
