# MAX API 操作筆記

> 來源：[`github.com/maicoin/max-exchange-api-node`](https://github.com/maicoin/max-exchange-api-node) 與 MaiCoin 官方文件 (`https://max.maicoin.com/documents/api`)。文件偶有 403，必要時用瀏覽器再驗證一次。

---

## 基本資訊

- REST base URL：`https://max-api.maicoin.com`
- 兩個版本並存：`/api/v2/...`（穩定）與 `/api/v3/...`（部分端點對應）。本 repo 用 v2。
- 公開端點不需要 API key；私有端點走 HMAC-SHA256 簽名。

---

## 公開端點（無認證，本 repo Phase B 用）

| 用途 | Path | 備註 |
|------|------|------|
| 所有市場列表 | `GET /api/v2/markets` | 取得 `min_base_amount` / `min_quote_amount` / `precision` |
| 單市場 ticker | `GET /api/v2/tickers/{market}` | 例：`usdttwd`、`btctwd`、`btcusdt` |
| 訂單簿深度 | `GET /api/v2/depth?market={market}&limit=50` | `asks` 升序、`bids` 降序、各為 `[price, vol]` |
| 最近成交 | `GET /api/v2/trades?market={market}` | |

`limit` 預設 300，最大可達 300。本 repo 用 50 級足夠。

---

## 私有端點認證（Phase C）

### 簽名步驟

1. 構造 `payloadObj = { ...params, nonce, path }`
   - `nonce` 為毫秒 epoch，必須單調遞增，且 MAX server 端內**至多 30 秒、且不可重複**
   - `path` 例如 `/api/v2/orders`
2. `payloadJson = JSON.stringify(payloadObj)`
3. `payloadB64 = base64(payloadJson)`
4. `signature = hexDigest(HMAC-SHA256(secret, payloadB64))`
5. 設定 HTTP headers：
   - `X-MAX-ACCESSKEY: <access key>`
   - `X-MAX-PAYLOAD: <payloadB64>`
   - `X-MAX-SIGNATURE: <signature>`
   - `Content-Type: application/x-www-form-urlencoded`（POST/DELETE 時）

實作見 [`src/lib/max-private.ts`](../src/lib/max-private.ts)；snapshot 測試見 [`src/tests/max-private.signing.test.ts`](../src/tests/max-private.signing.test.ts)。

### 本 repo 用到的端點

| Method | Path | 用途 |
|--------|------|------|
| GET | `/api/v2/members/me` | 帳號權限檢查（safety.ts） |
| GET | `/api/v2/members/accounts` | 各幣別餘額 |
| POST | `/api/v2/orders` | 下單（`market`, `side`, `volume`, `price`, `ord_type`） |
| GET | `/api/v2/order?id=...` | 查詢單一訂單狀態 |
| POST | `/api/v2/order/delete?id=...` | 取消訂單 |

`ord_type` 可用值（節選）：`limit`、`market`、`ioc_limit`、`stop_limit`、`stop_market`。
本 repo 三角執行偏好 `ioc_limit` — 限價 + 立即吃單否則取消，避免掛單留庫存。

---

## 限流

MAX 公開未官方公布每分鐘上限，社群觀察 ~1200 req/min/IP。本 repo `src/lib/http.ts` 已內建 timeout + retry + jitter；若收到 429 或 5xx 會做 2 次 exponential backoff retry。每次 scan 約 10 次 call，遠低於估算上限。

---

## 編碼與時區陷阱

- MAX timestamps 多為 **秒** 級 epoch（`at`、`timestamp`），不是毫秒。
- Volume / price 都是 **字串**，必須 `Number(...)` 轉，否則精度會掉。
- Order ID 是 number（不一定 fit 在 32-bit signed int，但 JS Number 安全到 2^53）。
