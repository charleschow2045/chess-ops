# 國際象棋 Ops（chess-ops）

俾小五學生用 iPad 直向練習嘅國際象棋學習 App（chess.com 約 470 分，主要問題：送子、睇漏戰術）。純 HTML／CSS／JavaScript，冇 build step，冇 CDN，所有紀錄喺本機（localStorage），可以加到主畫面、離線使用。

- 網址：https://charleschow2045.github.io/chess-ops/
- 版本：1.0.0（第 7 階段，最後階段）
- 各階段報告：[0](docs/stage0-report.md)、[1](docs/stage1-report.md)、[2](docs/stage2-report.md)、[3](docs/stage3-report.md)、[4](docs/stage4-report.md)、[5](docs/stage5-report.md)、[6](docs/stage6-report.md)、[棋盤唔移位修正](docs/layout-fix-report.md)、[7（最終）](docs/stage7-report.md)；題目清單：[第 1 階段](docs/stage1-content.md)、[第 2 階段](docs/stage2-content.md)、[第 4 階段](docs/stage4-content.md)、[第 5 階段](docs/stage5-content.md)

## 模組（首頁）

| 模組 | 內容 |
|---|---|
| 稱號卡、今日任務 | 6 個稱號（入門棋手 → 特級大師，由現有數據計出）；每日任務：謎題 5 題、1 個小練習、（星期一三五日）對電腦下一局；連續日數 |
| 規則快測與小遊戲 | 規則快測 6 組 30 題、一步將死、找出將軍、騎士迷宮、兵仗 |
| 走棋前三問 | 用 Lichess 真實謎題練習「對方想做甚麼？我有機會嗎？這步安全嗎？」，70 題 |
| 戰術謎題 | 約 2,450 題 Lichess 謎題、謎題分、錯題本、我的謎題 |
| 對電腦下棋 | 8 個級別（Stockfish 19）、悔棋、提示、賽後檢討（勝率分類＋原因）、電腦出棋速度（慢／中／快） |
| 開局 | 6 條路線＋10 題開局原則小測（路線同走法已用 Stockfish 驗證） |
| 殘局 | 后殺王、車殺王、雙車梯形殺、王兵對王，共 28 題（用殘局庫同 Stockfish 驗證），星級 |
| 我的對局 | 讀取 chess.com 公開對局（或貼上 PGN），分析自己嘅步，大錯加入「我的謎題」 |
| 家長週報 | 最近 7 日任務、練習時間、謎題、對電腦、殘局、開局（只講數字） |
| 設定 | 顯示格名、三問提醒、電腦出棋速度、備份與還原、App 版本、如何加到主畫面 |

## 如何加到主畫面（iPad）

1. 用 Safari 打開 https://charleschow2045.github.io/chess-ops/
2. 點按 Safari 的「分享」按鈕（方框加向上箭頭）。
3. 向下捲動，選擇「加入主畫面」，再點按「加入」。
4. 之後從主畫面圖示打開，就是全螢幕的 App。第一次打開後，全部頁面、題目同 Stockfish 都會儲存喺 iPad，**冇網絡都可以用**（只有「我的對局」讀取 chess.com 需要網絡，離線時可以貼上 PGN）。
5. 有新版本時，首頁頁底會顯示「有新版本，按此更新」，撳咗先會更新（唔會打斷做緊嘅題目或對局）。

注意：主畫面版同 Safari 網頁版嘅紀錄係分開儲存嘅，請固定用其中一個。

## 如何備份

紀錄全部儲存喺 iPad 瀏覽器內，iPad 可能會清除好耐冇用嘅網站資料，所以請定期備份：設定 → 備份與還原 → 「匯出備份」（下載 JSON 檔，可以存入「檔案」App）或者「複製備份文字」（貼去「備忘錄」）。還原：喺同一頁揀檔案或者貼上文字，確認後覆蓋現有紀錄。超過 7 日冇備份，首頁頂部會有細提示（可以關閉，3 日內唔再顯示）。

## 授權同第三方檔案

本 repo 帶有 GPL 授權嘅第三方檔案，所以**整個 repo 以 GPL-3.0 公開**（全文見 [LICENSE](LICENSE)）：

- Stockfish.js 19（lite，單執行緒）：GPL-3.0
- Chessground 9.2.1（棋盤）：GPL-3.0-or-later
- chess.js 1.4.0（棋規）：BSD-2-Clause（同 GPL 相容）
- Lichess 謎題資料庫（子集）：CC0
- cburnett 棋子圖案（隨 Chessground）：GPLv2+

完整清單、版本同來源見 [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md)。殘局局面用 Lichess 殘局庫（tablebase.lichess.ovh）驗證，只用嚟查證，冇打包。App 圖示係原創設計（`icons/icon.svg`）。

## 技術規定

- 純 HTML／CSS／JavaScript，無 build step，唔用 React，唔用 CDN。所有第三方檔案放 `vendor/`。
- App 介面用書面語中文（有測試掃描廣東話用字）；棋步用 e4、Nf3 記譜。
- 所有文字不細過 13px；文字對比度 ≥ 4.5:1（大字 ≥ 3:1）；按鈕觸控範圍 ≥ 44px；以 iPad 直向（約 820×1180）為主，橫向（1180×820）亦檢查。
- localStorage key 一律以 `chessops_` 開頭。每加一個儲存欄位，必須加入 `js/state.js` 嘅 `STATE_FIELDS` 白名單（`normalizeState()` 只保留白名單欄位）。
- 棋盤喺任何狀態下唔可以移位（提醒行、狀態行、引擎提示都係固定高度或放喺棋盤下面）。

## 結構

```
index.html          首頁（歡迎卡、備份提示、稱號卡、今日任務、7 個模組入口）
*.html              各模組頁面（puzzles、play、three、openings、endgames、mygames、report、settings、rules、quiz、game-*）
sw.js               service worker（由 tools/build-sw.js 產生；離線快取）
manifest.webmanifest 加到主畫面（名稱、圖示、standalone、直向）
icons/              原創圖示（icon.svg、180／192／512 PNG）
css/                theme.css（設計 A token、共用樣式）、board.css（棋盤、回饋）
js/                 board.js（棋盤）、config.js（可調數字）、state.js（儲存白名單）、daily.js、speed.js、pwa.js、version.js、各模組同純邏輯（*-logic.js）
data/               題庫同資料（rules-quiz、puzzles/、three、openings、endgames、mate1…）
vendor/             第三方檔案（chess.js、Chessground、Stockfish.js 19 lite）
tools/              serve.js（本機伺服器）、build-*.js（產生資料／sw.js／圖示）、shots*.js／layout-check.js／site-scan.js／offline-test.js（Playwright 測試）
tests/run-all.js    純邏輯測試
docs/               各階段報告、題目清單、截圖、授權說明
```

## 本機運行同測試

```bash
node tools/serve.js 8123
node tests/run-all.js
```

（ES module、Web Worker 同 service worker 需要經 http 載入，直接雙擊 `index.html` 開 `file://` 唔 work。）

Playwright 流程測試需要另外安裝 `playwright-core`（唔放入 repo）：`node tools/shots.js` 至 `shots7.js`、`node tools/layout-check.js`（棋盤唔移位）、`node tools/site-scan.js`（全站掃描＋截圖）、`node tools/offline-test.js`（離線測試）、`node tools/montage.js`（截圖總覽）。

**發佈新版本**：改完任何檔案後要跑 `node tools/build-sw.js`（更新 sw.js 嘅檔案清單同內容雜湊；`tests/run-all.js` 會檢查），重大更新時順便改 `js/version.js` 嘅版本號。
