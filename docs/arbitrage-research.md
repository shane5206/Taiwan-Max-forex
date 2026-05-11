# Taiwan MAX 交易所 USDT/TWD 套利可行性研究

> 撰寫日期：2026-05-11
> 範圍：以 MaiCoin MAX（台灣）為核心，研究 USDT/TWD 對手方在哪、價差從何而來、能不能（與在什麼條件下）變現。
> 對應實作 repo：`shane5206/Taiwan-Max-forex`

---

## 1. Executive Summary

| 套利類型 | 平均 edge (bps) | 可全自動 | 最小資本 | 本 repo 的處理 |
|----------|----------------|----------|----------|-----------------|
| **A. USDT 溢價 vs 銀行美金牌告**（純法幣腿） | 50–300 | ✗（需 T+1 銀行電匯） | NT$1.5M+ | Phase B 訊號通報 |
| **B. MAX 內三角套利**（TWD ↔ USDT ↔ BTC ↔ TWD） | 5–60 | ✓ | NT$50k+ | Phase B 訊號 + Phase C dry-run |
| **C. 跨所 USDT 搬磚**（MAX ↔ Binance / KuCoin / Bitfinex via TRC20） | 30–250 | 半自動（一鍵） | 兩邊各 NT$200k+ USDT | Phase B 訊號通報 |

整體結論：**台灣 USDT/TWD 結構性溢價是真的**（過去三年大多時間 USDT 在 MAX 報價高於 BoT 美金等值換算 50–200 bps），但**唯一能寫成「全自動套利」的只有 B 類三角**。A、C 兩類因為涉及銀行電匯或鏈上轉帳，最快也只能做到「訊號彈出、人手按鈕」的半自動。

---

## 2. 市場背景

### 2.1 為什麼台灣有 USDT 溢價

- 台灣有外匯申報門檻（一年自由結匯 500 萬美元、單筆 50 萬美元觸發央行申報），且國人買 USD 透過銀行通常吃到 30–60 bps 的牌告價差。
- 台灣本地交易所（MAX、BitoPro、ACE）的 USDT/TWD 是國人「跨入加密世界」的主要管道，需求大、供給端被本地做市商與 OTC 控制，長期偏溢價。
- 國際交易所（Binance、KuCoin、Bitfinex）大多沒有 USDT/TWD 對，因此沒有有效的跨所自然套利壓力把溢價壓回零。

### 2.2 各交易所近況（撰寫當下）

- **MAX**（maicoin.com）：台灣合規交易所，有 `usdttwd`、`btctwd`、`btcusdt`、`ethtwd`、`ethusdt` 等市場。盤口偏薄，`usdttwd` top-of-book 通常 NT$500k–2M 級。
- **Binance**：撤離台灣 TWD 法幣業務多年，目前**沒有 USDT/TWD 現貨**；P2P 法幣管道存在但不在 API 自動化範圍。
- **KuCoin**：同樣沒有 USDT/TWD 現貨。
- **Bitfinex**：沒有 TWD 法幣支援。

所以「跨交易所 USDT/TWD vs USDT/TWD」這條路在使用者持有的三所**走不通**。實際可行的跨所路徑是用 USDT/USDC 或 USDT/USD 跨所對等價，再回 MAX 兌 TWD。

---

## 3. 套利類型 A — USDT 溢價 vs 銀行美金牌告

### 3.1 機制

兩個方向皆可，視當下溢價符號決定：

- **正溢價（USDT > 銀行美金）**：
  1. 銀行買美金（吃台銀現金賣出價）
  2. 入金到 Binance/KuCoin/Bitfinex
  3. 在該所買 USDT（吃 USDT/USDC 或 USDT/USD 賣價）
  4. TRC20 提幣到 MAX
  5. 在 MAX `usdttwd` 賣出（吃 bid VWAP）
  6. TWD 提領回銀行帳戶
- **負溢價（USDT < 銀行美金，較罕見）**：反向。

### 3.2 edge 公式

```
premium_bps = (P_max_usdttwd_bid / R_bot_usd_twd_cashSell - 1) × 10_000
```

實際淨利還要扣除：

| 成本項目 | 預估 bps（NT$1M 規模） | 備註 |
|----------|------------------------|------|
| 台銀 USD 現金價差 | ~50 | 例：賣 31.95 / 買 32.45 |
| 國際所 USDT taker | 10 | Binance/KuCoin；用 BNB/KCS 可再折 |
| MAX taker（usdttwd 賣單） | 15 | MAX token 折半至 7.5 |
| MAX TWD 提領 | NT$30 / NT$1M ≈ 0.3 | Bankee 免費 |
| TRC20 USDT 提領 | 0–1 USDT ≈ 0 | MAX 出金 USDT-TRC20 目前免費（上線前再確認） |
| 銀行電匯 USD 出入境 | 變動，可省（同所內或第三方支付） | |

**round-trip 成本下限 ≈ 75 bps**。歷史溢價 50–300 bps，所以**只有 edge > 100 bps 才有充足安全邊際**。

### 3.3 為什麼不能全自動

- TWD 銀行電匯只能銀行營業時間，且**台幣每日大額提領需臨櫃確認**（部分銀行）
- 台銀牌告匯率每日數次更新、即時報價需要登入網銀
- 大額 USD 買賣可能觸發央行 50 萬美元申報門檻
- 銀行端任何步驟都沒有公開 API

### 3.4 結論

**只做訊號通報**：每 5 分鐘抓 MAX `usdttwd` 與台銀 USD 牌告 CSV，當淨 edge > `THRESHOLD_FX_BPS`（預設 80 bps）時推 Telegram，附建議方向與大致 PnL。實際下單由使用者人手執行。

---

## 4. 套利類型 B — MAX 內三角套利

### 4.1 機制

兩條主 cycle，可實時偵測：

**Cycle A：TWD → USDT → BTC → TWD**
1. 用 TWD 買 USDT（吃 `usdttwd` ask VWAP）
2. 用 USDT 買 BTC（吃 `btcusdt` ask VWAP）
3. 用 BTC 賣 TWD（吃 `btctwd` bid VWAP）

**Cycle B：TWD → BTC → USDT → TWD**（反向）

### 4.2 edge 公式（以 Cycle A 為例）

```
expected_twd_out = notional_twd
                 ÷ usdttwd_ask_vwap
                 ÷ btcusdt_ask_vwap
                 × btctwd_bid_vwap

edge_bps = (expected_twd_out / notional_twd - 1) × 10_000 - 3 × taker_bps
```

固定 fee 成本：3 × 15 bps = **45 bps**（用 MAX token 可降至 22.5 bps）。

### 4.3 實務考量

- USDT/TWD 盤口最薄，是真正的瓶頸；其他兩 leg 流動性遠較好。
- 必須用 walk-the-book VWAP，不能用 mid-price（會嚴重高估 edge）。
- 因為 MAX 是中心化撮合，三 leg 可以串列 IOC 下單，沒有原子性保證 → 必須處理 partial fill。
- 觀察期 edge 中位數 5–20 bps，**多數時候是負的**；機會多半在大行情變動之後幾秒鐘。

### 4.4 結論

**唯一能 Phase D 全自動化的路徑**。本 repo Phase C 先做 dry-run 模擬器，累計至少 7 天的 `netEdgeBps` 分布，確認 p50 > 0 之後再決定要不要進 Phase D 實盤。

---

## 5. 套利類型 C — 跨所 USDT 搬磚（MAX ↔ Binance / KuCoin / Bitfinex）

### 5.1 機制

使用者已持有 Bitfinex / Binance / KuCoin 帳戶，這三所都有 USDT 與美元計價穩定幣（USDC、USD）的現貨對。透過 **USDT-TRC20 鏈上轉帳（幾分鐘、近乎免費）** 在 MAX 與這些所之間搬幣。

兩條主路徑：

**路徑 C1：國際所 → MAX（拿 TWD 出來）**
1. 在 Binance/KuCoin 用 USDC 或 USD 買 USDT
2. TRC20 提幣到 MAX
3. MAX 賣 USDT 拿 TWD
4. TWD 提領（如要兌回成本端可再操作，但通常停在 TWD 即可）

**路徑 C2：MAX → 國際所（拿 USDT 出來）**
1. MAX 用 TWD 買 USDT
2. TRC20 提幣到 Binance/KuCoin
3. 賣 USDT 換 USDC/USD（如要轉換為其他資產或下次回頭再買）

C1 比 C2 常見、edge 也較好，因為 USDT/TWD 通常溢價，從便宜的地方（國際所，USDT ≈ 1.00）轉到貴的地方（MAX，USDT > 1.00 等值美元）賣。

### 5.2 edge 公式（C1）

```
implied_max_usdt_price_in_usd = MAX_USDT_TWD_bid_vwap / BoT_USD_TWD_cashSell
edge_bps = (implied_max_usdt_price_in_usd / Binance_USDC_USDT_ask_vwap - 1) × 10_000 - fees_bps

fees_bps ≈ Binance_taker (10)
         + USDC↔USDT bid-ask (~2)
         + TRC20 攤提 (0)
         + MAX_taker (15)
         + MAX TWD 提領攤提 (~0.3 @ NT$1M)
         ≈ 27 bps
```

**淨 edge 30 bps 以上才值得執行。**

### 5.3 半自動 vs 全自動

無法全自動的原因：

- TRC20 轉帳需鏈上確認（~3 分鐘）；期間市場價格可能變動，最後 leg 的 edge 不確定。
- 各所 USDT 充提地址需先白名單，不能由 API 即興下達。
- 部分所要求大額提現二次驗證（電郵或 2FA），無法純 API 完成。

→ 本 repo 做**訊號通報 + 一鍵腳本**：訊號彈出時附上「現在按 yes 就會：(1) 在 Binance 下市價買 X USDT、(2) 觸發 TRC20 提幣 Y → MAX 地址」，由使用者確認後執行。

### 5.4 結論

**Phase B 只做訊號**。實際下單與提幣腳本留待 Phase D 規劃。USDT/USD 公允價的計算（用 Binance / KuCoin / Bitfinex 三所中位數）會復用到 fx-premium 的 depeg 防呆。

---

## 6. USDT/USD 公允價 與 depeg 防呆

任何把 USDT 視同 1 USD 的策略都假設 peg 穩定。實務上 USDT 偶有 30–200 bps 的 depeg。對策：

1. `src/lib/usdt-usd-reference.ts` 在每次掃描時抓
   - Binance `USDCUSDT`（USDC/USDT 即可，倒數即 USDT/USDC）
   - KuCoin `USDT-USDC`
   - Bitfinex `tUSTUSD`
2. 取三所 ask 中位數作為 USDT/USD fair value。
3. 若 |USDT/USD − 1.0000| > 30 bps，訊號附帶 `DEPEG_WARNING` 旗標。
4. 若 > 100 bps，**直接 ABORT 不發 fx-premium 訊號**（價差來源不可解釋）。

---

## 7. 手續費表（單一來源 of truth，對應 `src/lib/fees.ts`）

| 項目 | bps / 金額 | 備註 |
|------|------------|------|
| MAX taker | 15 | MAX token 7.5 |
| MAX maker | 5 | MAX token 2.5 |
| MAX TWD 提領 | NT$30/筆 | Bankee 免費 |
| MAX USDT-TRC20 提領 | 0 | 上線前再核 |
| MAX USDT-ERC20 提領 | ~8 USDT | 不走 |
| Binance Spot taker | 10 | BNB 7.5；零費對偶有 |
| Binance USDT-TRC20 提領 | 1 USDT | |
| KuCoin Spot taker | 10 | KCS 折扣 |
| KuCoin USDT-TRC20 提領 | 1 USDT | |
| Bitfinex Spot taker | 20 | LEO 折扣 |
| Bitfinex USDT-TRC20 提領 | 1 USDT | |
| 台銀 USD 現金價差 | ~50 | 例：賣 31.95 / 買 32.45 |

---

## 8. 風險矩陣

| 風險 | 影響 | 緩解 |
|------|------|------|
| MAX usdttwd 薄盤口 | edge 計算高估、partial fill | 一律用 VWAP；單筆 notional 不超過 top-3 levels 總量 |
| USDT depeg | fx-premium 假訊號 | 三所中位數 + 30/100 bps 雙閥值 |
| 銀行 AML 申報 | 大額 USD 進出觸發審查 | 單筆 < NT$500k；分散時間 |
| TRC20 網路擁堵 | 跨所搬幣延遲 30+ 分鐘 | 設定 30 分鐘 timeout；超時警示 |
| MAX 維護 / 限流 | 無資料、無訊號 | http.ts 含 retry+backoff；Telegram 失敗額外 alert |
| API key 外洩 | 帳戶被惡意下單 | 僅給 view+trade；safety.ts 啟動時驗證無 withdraw；env 隔離 |
| Vercel egress IP 不穩 | 若 MAX 要求白名單 | 監控階段純公開讀取無關；Phase D 改 VPS |
| 凌晨閃跌 / USDT 鎖盤 | 急跌時三角 cycle leg 1 成交但 leg 2/3 卡住 | partial fill abort 規則；持倉自動記錄 |

---

## 9. Phase 順序與 go/no-go 門檻

```
Phase A: 本研究文件                  ✅ commit 後立刻進 B
Phase B: 公開資料監控 + Telegram      → 觀察 ≥ 7 天，調 threshold
Phase C: MAX 私鑰 + 三角 dry-run     → ≥ 7 天，p50 netEdge > 10 bps，p10 > 0 bps
Phase D: 實盤（本 repo 暫不交付）     → 看 Phase C 數據再決
```

詳細門檻寫在 `docs/phase-gates.md`。

---

## 10. 後續可探討的延伸

- **MAX maker rebate 策略**：放限價單接 taker 的單，等於從 -15 bps 變 -5 bps，三角 cycle 成本可從 45 bps 壓到 15 bps；但執行不確定性大增，需要更高頻的 cancel/replace。
- **借貸資金套利**：MAX 沒有 margin，但若使用者在 Bitfinex 持有 USD 賺利息（已是 `bitfinex-vercel-cron` 在追蹤的場景），把閒置 USD 拿出來做 fx-premium 的話需算機會成本。
- **TWD 利息**：MAX 的 TWD 餘額沒有利息，因此 Phase D 若要持續持倉 TWD 等待機會，要考慮資金占用成本。
- **OTC vs 上幣**：超過 NT$2M/天 的量建議直接走 OTC，本 repo 不處理。
