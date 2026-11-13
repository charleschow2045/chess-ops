# 國際象棋 Ops（chess-ops）

俾小五學生用 iPad 直向玩嘅國際象棋學習 App，目標係提升 chess.com 水平（主要問題：送子、睇漏）。

- 網址：https://charleschow2045.github.io/chess-ops/
- 狀態：**第 0 階段（準備同設計預覽）**。正式模組仍未開始。
- 報告：[docs/stage0-report.md](docs/stage0-report.md)　第三方授權：[docs/THIRD_PARTY.md](docs/THIRD_PARTY.md)

## 授權

本 repo 帶有 GPL 授權嘅第三方檔案（Stockfish.js：GPL-3.0；Chessground：GPL-3.0-or-later），所以**整個 repo 以 GPL-3.0 公開**（全文見 [LICENSE](LICENSE)）。其他第三方檔案（chess.js：BSD-2-Clause）同 GPL 相容。詳情見 [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md)。

## 技術規定

- 純 HTML／CSS／JavaScript，無 build step，唔用 React，唔用 CDN。所有第三方檔案放 `vendor/`。
- App 介面用書面語中文；戰術名稱中英對照（例如「捉雙 Fork」）；棋步用 e4、Nf3 記譜。
- 所有文字不細過 13px；返回掣要大；以 iPad 直向（約 820×1180）為主。
- localStorage key 一律以 `chessops_` 開頭。每加一個儲存欄位，必須加入 `js/state.js` 嘅 `STATE_FIELDS` 白名單（`normalizeState()` 只保留白名單欄位）。

## 結構

```
index.html          首頁（暫時「建設中」＋測試頁連結）
css/ js/            自己寫嘅樣式同程式（state.js、pickmove.js、engine.js、board-custom.js…）
vendor/             第三方檔案（chess.js、Chessground、Stockfish.js）
data/               資料（暫時空）
tools/serve.js      本機測試伺服器：node tools/serve.js 8123
tests/run-all.js    純邏輯測試：node tests/run-all.js
design-preview/     三個設計風格預覽
docs/               報告同授權說明
test-*.html         階段 0 測試頁
```

## 本機運行

```bash
node tools/serve.js 8123
node tests/run-all.js
```

（ES module 同 Web Worker 需要經 http 載入，直接雙擊 `index.html` 開 `file://` 會唔work。）
