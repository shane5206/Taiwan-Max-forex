# Taiwan-Max-forex

MaiCoin **MAX** 交易所 USDT/TWD 套利訊號監控 + 三角套利 dry-run。
與 [`bitfinex-vercel-cron`](https://github.com/shane5206/bitfinex-vercel-cron) 同個風格：Vercel + TypeScript + Telegram + Cron。

> **狀態：Phase A + B + C 已實作（Phase D 實盤尚未啟用）。**
> 詳細交付邊界見 [`docs/phase-gates.md`](docs/phase-gates.md)。

---

## 為什麼有這個 repo

詳細研究見 [`docs/arbitrage-research.md`](docs/arbitrage-research.md)。三種套利路徑摘要：

| 套利類型 | edge | 自動 | 本 repo |
|----------|------|------|---------|
| A. USDT 溢價 vs 銀行美金 | 50–300 bps | ✗ | Phase B 訊號 |
| B. MAX 內三角 TWD↔USDT↔BTC | 5–60 bps | ✓ | Phase B 訊號 + Phase C dry-run |
| C. 跨所 USDT 搬磚（MAX↔Binance/KuCoin/Bitfinex） | 30–250 bps | 半自動 | Phase B 訊號 |

---

## 啟動

```bash
pnpm install            # or npm install / yarn

cp .env.example .env    # 填 CRON_SECRET / TELEGRAM_* 即可開始 Phase B

pnpm test               # 跑單元測試
pnpm check              # tsc --noEmit

pnpm scan:once          # 本機跑一次三策略掃描，印出所有訊號 JSON
pnpm scan:once -- --echo  # 寄一條 "monitor online" 訊息確認 Telegram 通

# Phase C — 需先把 MAX_ACCESSKEY / MAX_SECRET（**view+trade，無 withdraw**）填好
pnpm verify-keys                                    # 檢查金鑰權限與餘額
pnpm dry-run -- --cycle A --twd 50000 --loops 50 --interval 30
```

---

## 部署架構

```
        每 5 分鐘
GitHub Actions ─────────────► Vercel /api/cron/scan
   (公開 repo 免費 cron)             (TS handler，跑三策略，發 Telegram)

Vercel 自帶 cron 每天 04:00 UTC ─► /api/cron/daily-summary
                                  (即使無訊號也彙總一次)
```

Hobby Vercel 方案 cron 一天只能跑一次，所以 5 分鐘級的掃描放在 GitHub Actions。

### 必要 secret

| 環境 | secret |
|------|--------|
| Vercel | `CRON_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`（Phase C 加 `MAX_ACCESSKEY`, `MAX_SECRET`） |
| GitHub Actions | `CRON_SECRET`, `VERCEL_HOST`（無 https://，例如 `taiwan-max-forex.vercel.app`） |

---

## 安全提醒

- **絕對不要**在訊息、issue、commit 訊息或 README 中貼 API 金鑰。
- MAX 金鑰只給 **view + trade**，**不要**勾 withdraw。
- 啟動任何下單功能前，`src/lib/safety.ts` 會檢查金鑰權限；若有 withdraw 直接 throw。
- 操作中發現 key 外洩 → 立即到 MAX 後台撤銷並重申請。

---

## Repo 結構

```
api/cron/      Vercel HTTP handlers (scan, daily-summary, health)
src/cli/       Local CLI tools (scan-once, dry-run, verify-keys)
src/config/    Env loader + threshold defaults
src/lib/       Reusable clients & utilities
src/strategies Strategy evaluators + Phase C executor
src/tests/     Vitest unit tests
docs/          Research + ops docs
```

---

## License

MIT
