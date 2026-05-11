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
  // Monotonic; MAX rejects re-used or backwards-moving nonces within 30 s.
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
 * Build MAX v3 signed headers.
 *
 * Official v3 payload key order: { nonce, ...params, path }  (path LAST)
 * Ref: https://max-api.maicoin.com/doc/v3.html (Authentication section)
 */
export function buildSignedHeaders(input: {
  path: string;
  params: Record<string, unknown>;
  secret: string;
  accessKey: string;
  nonce: number;
  method?: "GET" | "POST" | "DELETE";
}): {
  headers: Record<string, string>;
  payloadJson: string;
  payloadB64: string;
  signature: string;
  nonce: number;
} {
  // path goes LAST per v3 spec: { nonce, ...params, path }
  const payloadObj = { nonce: input.nonce, ...input.params, path: input.path };
  const payloadJson = JSON.stringify(payloadObj);
  const payloadB64 = Buffer.from(payloadJson, "utf-8").toString("base64");
  const signature = createHmac("sha256", input.secret).update(payloadB64).digest("hex");
  return {
    headers: {
      "X-MAX-ACCESSKEY": input.accessKey,
      "X-MAX-PAYLOAD": payloadB64,
      "X-MAX-SIGNATURE": signature,
      "Content-Type": "application/json",
    },
    payloadJson,
    payloadB64,
    signature,
    nonce: input.nonce,
  };
}

export async function signedRequest<T>({ method, path, params = {} }: SignedRequest): Promise<T> {
  const keys = readKeys();
  const nonce = freshNonce();
  // Request params always include nonce (sent in QS for GET, body for POST/DELETE)
  const requestParams = { nonce, ...params };
  const signed = buildSignedHeaders({ path, params, secret: keys.secret, accessKey: keys.accessKey, nonce, method });

  let url = `${BASE}${path}`;
  const opts: Parameters<typeof fetchJson<T>>[1] = { method, headers: signed.headers, timeoutMs: 8_000, retries: 1 };

  if (method === "GET") {
    const qs = new URLSearchParams(toStringRecord(requestParams));
    url += `?${qs}`;
  } else {
    // POST / DELETE: JSON body per v3 spec
    opts.body = JSON.stringify(requestParams);
  }

  try {
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

// ----- Concrete endpoints (v3 paths) -----

// /api/v3/info response shape
export interface MaxMemberMe {
  sn?: string;
  email?: string;
  level?: number;
  m_wallet_enabled?: boolean;
  // v3 /info does not expose per-key permission fields directly;
  // the fields below are kept for safety.ts compatibility (will be empty sets).
  permissions?: string[];
  api_keys?: Array<{ permissions?: string[]; scopes?: string[]; allowed_actions?: string[] }>;
}

export interface MaxAccount {
  currency: string;
  balance: string;
  locked: string;
  staked?: string | null;
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
  return signedRequest<MaxMemberMe>({ method: "GET", path: "/api/v3/info" });
}

export function getAccounts(): Promise<MaxAccount[]> {
  return signedRequest<MaxAccount[]>({ method: "GET", path: "/api/v3/wallet/spot/accounts" });
}

export function getOrder(id: number): Promise<MaxOrder> {
  return signedRequest<MaxOrder>({ method: "GET", path: "/api/v3/order", params: { id } });
}

export function placeOrder(params: {
  market: string;
  side: "buy" | "sell";
  volume: number | string;
  price?: number | string;
  ord_type: "limit" | "market" | "stop_limit" | "stop_market" | "ioc_limit";
  client_oid?: string;
}): Promise<MaxOrder> {
  return signedRequest<MaxOrder>({ method: "POST", path: "/api/v3/wallet/spot/order", params });
}

export function cancelOrder(id: number): Promise<MaxOrder> {
  return signedRequest<MaxOrder>({ method: "DELETE", path: "/api/v3/order", params: { id } });
}
