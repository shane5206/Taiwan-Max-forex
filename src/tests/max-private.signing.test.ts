import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { buildSignedHeaders } from "../lib/max-private.js";

describe("MAX HMAC signing (v3 spec)", () => {
  it("payload key order: nonce → params → path (path LAST)", () => {
    const secret = "test-secret";
    const accessKey = "test-key";
    const path = "/api/v3/wallet/spot/order";
    const params = { market: "usdttwd", side: "buy", volume: "10", price: "32.10", ord_type: "limit" };
    const nonce = 1234567890123;

    const out = buildSignedHeaders({ accessKey, secret, path, params, nonce });

    // v3 canonical order: nonce first, params in middle, path last
    const expectedJson = JSON.stringify({ nonce, ...params, path });
    expect(out.payloadJson).toBe(expectedJson);

    const expectedB64 = Buffer.from(expectedJson, "utf-8").toString("base64");
    expect(out.payloadB64).toBe(expectedB64);

    const expectedSig = createHmac("sha256", secret).update(expectedB64).digest("hex");
    expect(out.signature).toBe(expectedSig);

    expect(out.headers["X-MAX-ACCESSKEY"]).toBe(accessKey);
    expect(out.headers["X-MAX-PAYLOAD"]).toBe(expectedB64);
    expect(out.headers["X-MAX-SIGNATURE"]).toBe(expectedSig);
    expect(out.headers["Content-Type"]).toBe("application/json");
  });

  it("different nonces produce different signatures", () => {
    const a = buildSignedHeaders({ accessKey: "k", secret: "s", path: "/api/v3/members/me", params: {}, nonce: 1 });
    const b = buildSignedHeaders({ accessKey: "k", secret: "s", path: "/api/v3/members/me", params: {}, nonce: 2 });
    expect(a.signature).not.toBe(b.signature);
  });

  it("snapshot: known fixture with v3 order", () => {
    const out = buildSignedHeaders({
      accessKey: "fixed-key",
      secret: "fixed-secret",
      path: "/api/v3/members/me",
      params: {},
      nonce: 1700000000000,
    });
    // v3: { nonce, path } — no extra params
    const json = JSON.stringify({ nonce: 1700000000000, path: "/api/v3/members/me" });
    const b64 = Buffer.from(json, "utf-8").toString("base64");
    const sig = createHmac("sha256", "fixed-secret").update(b64).digest("hex");
    expect(out.payloadB64).toBe(b64);
    expect(out.signature).toBe(sig);
  });
});
