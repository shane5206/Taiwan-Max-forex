import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { buildSignedHeaders } from "../lib/max-private.js";

describe("MAX HMAC signing", () => {
  it("matches MAX spec: base64(JSON) then hex HMAC-SHA256", () => {
    const secret = "test-secret";
    const accessKey = "test-key";
    const path = "/api/v2/orders";
    const params = { market: "usdttwd", side: "buy", volume: "10", price: "32.10", ord_type: "limit" };
    const nonce = 1234567890123;

    const out = buildSignedHeaders({ accessKey, secret, path, params, nonce });

    const expectedJson = JSON.stringify({ path, nonce, ...params });
    expect(out.payloadJson).toBe(expectedJson);

    const expectedB64 = Buffer.from(expectedJson, "utf-8").toString("base64");
    expect(out.payloadB64).toBe(expectedB64);

    const expectedSig = createHmac("sha256", secret).update(expectedB64).digest("hex");
    expect(out.signature).toBe(expectedSig);

    expect(out.headers["X-MAX-ACCESSKEY"]).toBe(accessKey);
    expect(out.headers["X-MAX-PAYLOAD"]).toBe(expectedB64);
    expect(out.headers["X-MAX-SIGNATURE"]).toBe(expectedSig);
  });

  it("different nonces produce different signatures", () => {
    const a = buildSignedHeaders({ accessKey: "k", secret: "s", path: "/api/v2/members/me", params: {}, nonce: 1 });
    const b = buildSignedHeaders({ accessKey: "k", secret: "s", path: "/api/v2/members/me", params: {}, nonce: 2 });
    expect(a.signature).not.toBe(b.signature);
  });

  it("snapshot signature for a known fixture", () => {
    const out = buildSignedHeaders({
      accessKey: "fixed-key",
      secret: "fixed-secret",
      path: "/api/v2/members/me",
      params: {},
      nonce: 1700000000000,
    });
    // Locked snapshot. If MAX changes the protocol, this test must be updated.
    const json = JSON.stringify({ path: "/api/v2/members/me", nonce: 1700000000000 });
    const b64 = Buffer.from(json, "utf-8").toString("base64");
    const sig = createHmac("sha256", "fixed-secret").update(b64).digest("hex");
    expect(out.payloadB64).toBe(b64);
    expect(out.signature).toBe(sig);
  });
});
