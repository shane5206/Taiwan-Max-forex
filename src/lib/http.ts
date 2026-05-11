import { log } from "./logger.js";

export class HttpError extends Error {
  constructor(public readonly status: number, public readonly body: string, public readonly url: string) {
    super(`HTTP ${status} ${url}: ${body.slice(0, 200)}`);
  }
}

export interface FetchJsonOptions {
  method?: "GET" | "POST" | "DELETE" | "PUT";
  headers?: Record<string, string>;
  body?: string | URLSearchParams;
  timeoutMs?: number;
  retries?: number;
}

export async function fetchJson<T>(url: string, opts: FetchJsonOptions = {}): Promise<T> {
  const buf = await fetchBuffer(url, opts);
  const text = buf.toString("utf-8");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(200, `non-JSON body: ${text.slice(0, 200)}`, url);
  }
}

export async function fetchBuffer(url: string, opts: FetchJsonOptions = {}): Promise<Buffer> {
  const { method = "GET", headers = {}, body, timeoutMs = 5_000, retries = 2 } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const init: RequestInit = { method, headers, signal: ctrl.signal };
      if (body !== undefined) init.body = body;
      const res = await fetch(url, init);
      clearTimeout(t);
      const arrayBuf = await res.arrayBuffer();
      const buf = Buffer.from(arrayBuf);
      if (!res.ok) {
        throw new HttpError(res.status, buf.toString("utf-8").slice(0, 500), url);
      }
      return buf;
    } catch (err) {
      clearTimeout(t);
      lastErr = err;
      const isLastAttempt = attempt === retries;
      const status = err instanceof HttpError ? err.status : 0;
      const retriable = status === 0 || status === 429 || (status >= 500 && status < 600);
      if (isLastAttempt || !retriable) break;
      const delay = 200 * 2 ** attempt + Math.floor(Math.random() * 100);
      log.warn("http.retry", { url, attempt, status, delay });
      await sleep(delay);
    }
  }
  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
