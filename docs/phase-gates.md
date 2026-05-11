# Phase Gates

各階段交付邊界與「下一階段啟動條件」。本 repo 目前完成到 **Phase C dry-run**。

---

## Phase A — 研究文件

**交付**：[`docs/arbitrage-research.md`](arbitrage-research.md)
**狀態**：✅ 完成
**關門條件**：使用者讀過、同意三種套利的可行性結論。

---

## Phase B — 公開資料監控

**交付**：
- [`api/cron/scan.ts`](../api/cron/scan.ts) — Vercel/GH-Actions 入口
- [`api/cron/daily-summary.ts`](../api/cron/daily-summary.ts) — Vercel 每日彙總
- 三個 strategy evaluator (`fx-premium`, `triangular`, `cross-exchange`)
- Telegram 通報

**狀態**：✅ 程式完成；尚未上線部署（待使用者填 env）。

**驗證**：
1. `pnpm scan:once` 本機印出三策略訊號（會打網路）
2. `pnpm scan:once -- --echo` 寄一條測試訊息確認 Telegram
3. Vercel 部署後手動觸發 GitHub Actions `workflow_dispatch`，預期回 200 / 207

**Phase B → C 啟動條件**：
- 監控連續運作 ≥ 3 天，無 unhandled error
- 觀察到至少幾筆 triangular 訊號（即便為負）
- 使用者決定要不要進入 dry-run；若否則停在 Phase B 收訊號即可

---

## Phase C — 三角套利 dry-run（**不下單**）

**交付**：
- [`src/lib/max-private.ts`](../src/lib/max-private.ts) — HMAC-SHA256 簽名
- [`src/lib/safety.ts`](../src/lib/safety.ts) — 啟動時驗證 key 無 withdraw 權限
- [`src/strategies/triangular-exec.ts`](../src/strategies/triangular-exec.ts) — 模擬執行 + 決策 log
- [`src/cli/dry-run.ts`](../src/cli/dry-run.ts) — `pnpm dry-run --cycle A --twd 50000 --loops 50`
- [`src/cli/verify-keys.ts`](../src/cli/verify-keys.ts) — 金鑰健檢

**狀態**：✅ 程式完成。**`live` mode 已預留但會 throw**，本 repo 不啟用實盤。

**驗證**：
1. 申請只給 `view+trade` 的 MAX key，填到 `.env`
2. `pnpm verify-keys` 確認 `ok: true`、無 withdraw、能讀到餘額
3. `pnpm dry-run -- --cycle A --twd 50000 --loops 50 --interval 30` 觀察輸出 summary

**Phase C → D 啟動條件（將來）**：
- 連續 ≥ 7 天的 dry-run 數據
- ≥ 100 筆 sample
- **p50 netEdgeBps > 10 bps**
- **p10 netEdgeBps ≥ 0 bps**（下尾不會虧）
- 0 unhandled exception
- `pnpm verify-keys` 持續通過

任一條件未達 → 留在 Phase C，調整 threshold 或加 maker rebate 策略。

---

## Phase D — 實盤（本 repo 暫不交付）

未來啟用時的設計骨架：

```
LIVE=true + KILL_SWITCH=false  +  safety.ensureNoWithdrawPermission()
                                          ▼
        balance sanity check (free TWD ≥ 1.2× notional)
                                          ▼
        position cap check  (MAX_NOTIONAL_TWD_PER_CYCLE)
                                          ▼
        circuit breaker     (MAX_DAILY_LOSS_TWD, MAX_CONSECUTIVE_LOSSES)
                                          ▼
        submit 3 IOC orders  →  log realized PnL  →  Telegram
```

主機選擇待 Phase C 數據出爐再決：
- **Vercel function**：簡單但 cold-start 變數大
- **Tokyo VPS / Cloudflare Worker**：延遲低、IP 穩，建議方案

**進 Phase D 前必須**：
1. 確認 Phase C 門檻全達標（見上）
2. Repo 增加 `src/lib/safety.ts` 的 balance + circuit breaker 細部規則
3. 第一週 `MAX_NOTIONAL_TWD_PER_CYCLE=10_000`（NT$10,000）
4. 第二週 PnL ≥ 0 再放大到 25k；第三週起依需求

未通過上面任一條件 → **不開 Phase D**。
