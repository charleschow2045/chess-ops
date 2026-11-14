# 國際象棋 Ops（chess-ops）

俾小五學生用 iPad 直向玩嘅國際象棋學習 App，目標係提升 chess.com 水平（主要問題：送子、睇漏）。

- 網址：https://charleschow2045.github.io/chess-ops/
- 狀態：**第 3 階段（對電腦下棋、賽後檢討）**。走棋前三問、開局、殘局、我的對局未開始。
- 報告：[第 0 階段](docs/stage0-report.md)、[第 1 階段](docs/stage1-report.md)、[題目清單](docs/stage1-content.md)、[第 2 階段](docs/stage2-report.md)、[謎題抽查](docs/stage2-content.md)、[第 3 階段](docs/stage3-report.md)　第三方授權：[docs/THIRD_PARTY.md](docs/THIRD_PARTY.md)

## 授權

本 repo 帶有 GPL 授權嘅第三方檔案（Stockfish.js 19：GPL-3.0；Chessground：GPL-3.0-or-later），所以**整個 repo 以 GPL-3.0 公開**（全文見 [LICENSE](LICENSE)）。其他第三方檔案（chess.js：BSD-2-Clause）同 GPL 相容。詳情見 [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md)。

## 技術規定

- 純 HTML／CSS／JavaScript，無 build step，唔用 React，唔用 CDN。所有第三方檔案放 `vendor/`。
- App 介面用書面語中文；戰術名稱中英對照（例如「捉雙 Fork」）；棋步用 e4、Nf3 記譜。
- 所有文字不細過 13px；返回掣要大；以 iPad 直向（約 820×1180）為主。
- localStorage key 一律以 `chessops_` 開頭。每加一個儲存欄位，必須加入 `js/state.js` 嘅 `STATE_FIELDS` 白名單（`normalizeState()` 只保留白名單欄位）。

## 結構

```
index.html          首頁（7 個模組入口；「規則快測與小遊戲」「戰術謎題」已開放）
puzzles.html play.html settings.html   戰術謎題、對電腦下棋（含賽後檢討）、設定（顯示格名）
rules.html quiz.html game-*.html   規則快測與 4 個小遊戲
dev.html            開發者頁：測試頁同設計預覽連結
css/                theme.css（設計 A token）、board.css、test.css
js/                 board.js（正式棋盤）、config.js（可調數字）、play*.js／review-logic.js／engine-manager.js、state.js、pickmove.js、engine.js、quiz*.js、game-*.js、knight-maze.js、pawnwar.js…
data/               rules-quiz.js（手寫）、puzzles/（Lichess 謎題子集）、mate1.js（Lichess mateIn1）、check-find.js／knight-maze.js（tools/gen-games.js 產生）
vendor/             第三方檔案（chess.js、Chessground、Stockfish.js 19 lite）
tools/              serve.js、build-puzzles.js（由 Lichess 資料庫篩謎題）、gen-games.js、gen-content.js、gen-stage2-content.js、shots.js／shots2.js／shots3.js（Playwright 流程測試同截圖）、measure3.js（量度引擎時間）
tests/run-all.js    純邏輯測試
design-preview/     三個設計風格預覽
docs/               報告、題目清單、截圖、授權說明
test-*.html         開發用測試頁
```

## 本機運行

```bash
node tools/serve.js 8123
node tests/run-all.js
```

（ES module 同 Web Worker 需要經 http 載入，直接雙擊 `index.html` 開 `file://` 會唔work。）
