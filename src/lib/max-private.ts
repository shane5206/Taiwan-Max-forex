import { createHmac } from "node:crypto";
import { fetchJson, HttpError } from "./http.js";

const BASE = "https://max-api.maicoin.com";

export class MaxApiError extends Error {
  constructor(public readonly status: number, public readonly body: string) {
    super(`MAX API ${status}: ${body.slice(0, 200)}`);
  }
}

interface SignedRequest {
  method: "GET" | "POST" | "DELETE";
  path: string;
  params?: Record<string, string | number | boolean>;
}

let lastNonce = 0;
function freshNonce(): number {
  // Monotonic and ahead of wall-clock by 1 ms minimum; MAX rejects re-used or
  // backwards-moving nonces within a 30-second window per key.
  const n = Math.max(Date.now(), lastNonce + 1);
  lastNonce = n;
  return n;
}

interface KeyPair { accessKey: string; secret: string; }

function readKeys(): KeyPair {
  const accessKey = process.env.MAX_ACCESSKEY;
  const secret = process.env.MAX_SECRET;
  if (!accessKey || !secret) throw new Error("MAX_ACCESSKEY / MAX_SECRET not configured");
  return { accessKey, secret };
}

/**
 * Build the three MAX-specific headers for a signed request.
 *
 * Payload = base64( JSON({ ...params, nonce, path }) )
 * Signature = hex( HMAC-SHA256(secret, payload) )
 */
export function buildSignedHeaders(input: { path: string; params: Record<string, unknown>; secret: string; accessKey: string; nonce?: number; method?: "GET" | "POST" | "DELETE" }): {
  headers: Record<string, string>;
  payloadJson: string;
  payloadB64: string;
  signature: string;
} {
  const nonce = input.nonce ?? freshNonce();
  // MAX SDK canonical order: path → nonce → params. Key order affects the
  // base64 string that MAX re-serialises server-side for HMAC verification.
  const payloadObj = { path: input.path, nonce, ...input.params };
  const payloadJson = JSON.stringify(payloadObj);
  const payloadB64 = Buffer.from(payloadJson, "utf-8").toString("base64");
  const signature = createHmac("sha256", input.secret).update(payloadB64).digest("hex");
  const headers: Record<string, string> = {
    "X-MAX-ACCESSKEY": input.accessKey,
    "X-MAX-PAYLOAD": payloadB64,
    "X-MAX-SIGNATURE": signature,
  };
  // Only set Content-Type when there is a body (POST / DELETE). GET requests
  // must NOT carry this header or MAX treats the absent body as inconsistent.
  if (input.method && input.method !== "GET") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  return {
    headers,
    payloadJson,
    payloadB64,
    signature,
  };
}

export async function signedRequest<T>({ method, path, params = {} }: SignedRequest): Promise<T> {
  const keys = readKeys();
  const signed = buildSignedHeaders({ path, params, secret: keys.secret, accessKey: keys.accessKey, method });
  const qs = method === "GET" && Object.keys(params).length > 0
    ? `?${new URLSearchParams(toStringRecord(params))}`
    : "";
  const url = `${BASE}${path}${qs}`;
  try {
    const opts: Parameters<typeof fetchJson<T>>[1] = { method, headers: signed.headers, timeoutMs: 8_000, retries: 1 };
    if (method !== "GET") opts.body = new URLSearchParams(toStringRecord(params));
    return await fetchJson<T>(url, opts);
  } catch (err) {
    if (err instanceof HttpError) throw new MaxApiError(err.status, err.body);
    throw err;
  }
}

function toStringRecord(p: Record<string, unknown>): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) o[k] = String(v);
  return o;
}

// ----- Concrete endpoints -----

export interface MaxMemberMe {
  sn?: string;
  email?: string;
  identity_state?: string;
  level?: number;
  /**
   * MAX returns the per-key capability list under different keys across SDK
   * versions. We probe several and join the set in `safety.ts`.
   */
  permissions?: string[];
  api_keys?: Array<{ permissions?: string[]; scopes?: string[]; allowed_actions?: string[] }>;
}

export interface MaxAccount {
  currency: string;
  balance: string;
  locked: string;
  type?: string;
}

export interface MaxOrder {
  id: number;
  side: "buy" | "sell";
  ord_type: string;
  price: string | null;
  avg_price: string | null;
  state: string;
  market: string;
  created_at: number;
  volume: string;
  remaining_volume: string;
  executed_volume: string;
  trades_count: number;
}

export function getMe(): Promise<MaxMemberMe> {
  return signedRequest<MaxMemberMe>({ method: "GET", path: "/api/v2/members/me" });
}

export function getAccounts(): Promise<MaxAccount[]> {
  return signedRequest<MaxAccount[]>({ method: "GET", path: "/api/v2/members/accounts" });
}

export function getOrder(id: number): Promise<MaxOrder> {
  return signedRequest<MaxOrder>({ method: "GET", path: "/api/v2/order", params: { id } });
}

export function placeOrder(params: {
  market: string;
  side: "buy" | "sell";
  volume: number | string;
  price?: number | string;
  ord_type: "limit" | "market" | "stop_limit" | "stop_market" | "ioc_limit";
  client_oid?: string;
}): Promise<MaxOrder> {
  return signedRequest<MaxOrder>({ method: "POST", path: "/api/v2/orders", params });
}

export function cancelOrder(id: number): Promise<MaxOrder> {
  return signedRequest<MaxOrder>({ method: "POST", path: "/api/v2/order/delete", params: { id } });
}
