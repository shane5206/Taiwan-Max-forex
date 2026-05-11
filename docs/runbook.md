# Operations Runbook

維運層面的常見動作。緊急狀況請先翻「kill switch」章節。

---

## 部署到 Vercel（首次）

1. `vercel link` — 連到專案
2. `vercel env add CRON_SECRET production`（32-byte hex）
3. `vercel env add TELEGRAM_BOT_TOKEN production`
4. `vercel env add TELEGRAM_CHAT_ID production`
5. `vercel --prod` — 確認 `/api/cron/health` 回 200
6. `vercel env add MAX_ACCESSKEY production`（**只給 view+trade**）
7. `vercel env add MAX_SECRET production`

> Preview / Development 環境**不要**同步 `MAX_*` 金鑰，避免測試誤觸生產。

---

## 啟用 GitHub Actions 每 5 分鐘掃描

在 GitHub repo 的 Settings → Secrets and variables → Actions 新增：

- `CRON_SECRET` — 與 Vercel 相同那一組
- `VERCEL_HOST` — 例如 `taiwan-max-forex.vercel.app`（不含 `https://`）

`.github/workflows/scan.yml` 會自動每 5 分鐘觸發。可在 Actions 頁手動 `workflow_dispatch` 測試。

> GitHub Actions 公開 repo 的免費額度幾乎無限，私有 repo 每月 2000 分鐘。每次跑 ~5 秒，月用量 ~36 分鐘。

---

## 旋轉 MAX API 金鑰

1. https://max.maicoin.com → Account → API → **revoke** 舊 key
2. **create** 新 key，只勾 `view`、`trade`
3. `vercel env rm MAX_ACCESSKEY production && vercel env add MAX_ACCESSKEY production`
4. `vercel env rm MAX_SECRET production && vercel env add MAX_SECRET production`
5. `vercel --prod`（重新部署吃新值）
6. `pnpm verify-keys` 用本機 .env 確認新 key 可用

---

## Telegram 雜訊太多怎麼辦

不要改程式，改環境變數（不需要重新部署，下一次 cron 觸發就生效）：

```
THRESHOLD_FX_BPS=120        # 預設 80，調高訊號變少
THRESHOLD_TRI_BPS=25        # 預設 15
THRESHOLD_CROSS_BPS=50      # 預設 30
```

如果要降低 notional 階梯掃描頻率：

```
NOTIONAL_TWD_LADDER=500000,2000000   # 預設 100000,500000,2000000
```

---

## Kill switch（緊急停止）

目前 Phase C dry-run **不下單**，理論上沒有「停止下單」的需求。
但若未來啟用 Phase D 實盤：

1. `vercel env add KILL_SWITCH true production`（瞬間生效）
2. 下一次 cron 觸發進入 `triangular-exec.ts` 時會 throw
3. 同時建議 `vercel env add MAX_LIVE false production` 雙保險

如果懷疑金鑰外洩：先到 MAX 後台 revoke，再來處理環境變數。

---

## 觀察訊號品質

- Vercel Dashboard → Functions → `/api/cron/scan` → Logs 看每行 `scan.signal` 結構化 JSON。
- 用 `vercel logs --json | jq 'select(.msg=="scan.signal")'` 撈出來離線分析。
- 每日 Telegram 摘要訊息 (`/api/cron/daily-summary`) 給粗略 health-check。

---

## 常見錯誤

| 症狀 | 原因 | 解決 |
|------|------|------|
| Telegram 不送 | `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` 未設 | 補 env，重部署 |
| `bot-rate: no parseable USD rate row` | 台銀 CSV 結構變動或返 HTML | 看 `clearBotRateCache()`，再排錯 Big5 解析 |
| `usdt-usd-reference: no live USDT/USD venue` | Binance/KuCoin/Bitfinex 同時掛了，或 IP 被擋 | 等 5 分鐘；確認 Vercel region 是 `hnd1` |
| `MaxApiError 401` | 金鑰過期或時鐘飄移 > 30 秒 | 重新申請；確認 Node 時間正確 |
| `WithdrawPermissionError` | 金鑰勾了 withdraw | revoke + 重申請 |
