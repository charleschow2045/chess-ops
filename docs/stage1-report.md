# 第 1 階段報告：棋盤、規則快測、小遊戲

日期：2026-11-14　網址：https://charleschow2045.github.io/chess-ops/

> 「已測試」＝我用電腦（Microsoft Edge，820×1180 視窗，真滑鼠操作）實測；「未測試」＝要你用 iPad 試先知。我冇 iPad，所有觸控手感都係未測試。

## 1. 做咗咩

**A. 清理同升級**
- 刪走「自己寫」棋盤（`js/board-custom.js`、`css/board-custom.css`、`test-board-custom.html`）同所有引用（有測試掃描確保冇殘留）。
- Stockfish 18 → **19.0.1 lite 單執行緒**（`.wasm` 1,845,971 bytes ≈ 1.76 MB，比 18 版細 75%）。已刪 18 嘅檔案；`Copying.txt` 重新由 tag `v19.0.1` 下載核實（GPL v3，同根目錄 `LICENSE` 逐位元組相同）。`docs/THIRD_PARTY.md` 已更新，並加咗第 2 階段會用 Lichess 謎題資料庫（CC0）嘅預告。
- 桌面實測 19：載入到可用約 **0.3 秒**（18 版約 2 秒）；depth 10 最佳步約 20–65 ms；pickMove 各級別平均 14–100 ms。19 喺之前測試嘅「謎題局面」亦揀到 Nc7+（18 版揀錯）。**iPad 數字仍然要你用 `test-stockfish.html` 測**（首頁底部「開發者」連結入去）。

**B. App 外殼（設計 A）**
- `css/theme.css`：設計 A 嘅顏色、圓角、字體、卡片、按鈕全部做成 CSS 變數（token）；`css/board.css`：棋盤、回饋、升變視窗樣式。
- 首頁：標題 + 7 個模組入口（原創圖示），只有「規則快測與小遊戲」可以入，其餘 6 個灰色顯示「即將推出」、唔可以撳。**冇稱號卡、冇今日任務、冇連續日數、冇任何假數字**（有測試掃描）。
- 「開發者」細連結放喺頁底（`dev.html`），列出設計預覽同測試頁。
- App 文字一律書面語；加咗掃描測試（見第 3 節）。設計預覽內嘅廣東話亦已改好。

**C. 正式棋盤元件 `js/board.js`（Chessground + chess.js）**
- 點擊、拖拉走棋；最後一步高亮；合法步提示；將軍時王格高亮；升變彈出 4 款棋子（可取消）；可翻轉；座標字 13px。
- 阻止頁面捲動／縮放：Chessground `blockTouchScroll`、`touch-action:none`、全站 `touch-action:manipulation`（防雙擊放大）、game 頁加 `maximum-scale=1`。**（iPad 上是否完全有效：未測試）**
- API：`createBoard(el, {fen, orientation, interactive, promotion, onMove})`，方法有 `load / play / undo / flip / setOrientation / setInteractive / lock / unlock / setShapes / arrow / circle / clearShapes / feedback`。`setShapes` 之後提示功能直接用。`createRawBoard` 俾騎士迷宮呢類「唔係正常棋局」用。
- 統一回饋 `js/feedback.js`：答啱／答錯 = 顏色 + 短動畫（外框閃一下，答錯輕輕搖動）+ 文字，冇聲音；`prefers-reduced-motion` 會停動畫。

**D. 規則快測（30 題，6 組 × 5 題）**
易位、吃過路兵、升變、將死與逼和、和棋規則（三次重複、50 步、子力不足）、將軍的三種應對。選擇題撳選項，或者喺棋盤上走一步作答；答完先顯示解釋；答錯嘅棋盤題會收回棋步並用綠色箭咀標示正確走法。
**每題標準答案都由 `js/quiz-verify.js` 用 chess.js 計出，`tests/run-all.js` 逐題核對**（三次重複用 `isThreefoldRepetition()`、50 步用 `isDrawByFiftyMoves()` 並檢查 FEN 半回合數 = 100、子力不足用 `isInsufficientMaterial()`）。全部題目喺 `data/rules-quiz.js`。逐題清單見 [stage1-content.md](stage1-content.md)。

**E. 小遊戲（4 個）**
1. **一步將死**：40 題，4 級各 10 題（第 1 級全部由后將死，之後加入車、馬、象）。程式（`tools/gen-games.js`，固定種子）產生局面，每題用 chess.js 驗證至少有一步將死，並記錄**全部**將死步；遊戲內由 chess.js 即時判斷「呢步係咪將死」，所以接受所有將死嘅步。第一次嘗試答對而且冇睇答案先得分。
2. **找出將軍**：20 題（將軍數 2–5 個）；一輪 5 個局面，每個 30 秒，喺棋盤上逐步走出所有將軍步（每步後自動復位）；時間到會用黃色箭咀標示漏咗嘅。
3. **騎士迷宮**：15 關，最少步數用 BFS 計出（`js/knight-maze.js`，狀態 = 位置 + 已食星），測試重新計算並核對、同時驗證最短路徑每步合法。紅色格 = 被黑棋攻擊，馬不可以停；有「提示」（下一步箭咀）、「悔一步」、「重來」。
4. **兵仗**：規則寫喺遊戲內同 `js/pawnwar.js`——兵走到對方底線即勝（唔使升變）；將死獲勝；逼和或其他和棋規則則和局。對電腦（第 1–4 級，用 `pickMove`，玩家執白）或兩人同一部 iPad（可揀「每步後自動翻轉」）。

**F. 儲存**
- `js/state.js` 新增 `records` 欄位（已加入白名單）：每個項目 `{best, plays}`（最佳成績、完成次數）。項目：6 組規則快測、一步將死 4 級、找出將軍、騎士迷宮、兵仗。每項「最佳」嘅意思：規則快測＝最高答對題數；一步將死＝每級最高答對數；找出將軍＝最多完整找齊嘅局面數（/5）；騎士迷宮＝已通關最高關數；兵仗＝打贏過嘅最高電腦級別（兩人對戰唔計）。
- 新增 `recordResult()`；測試涵蓋白名單清洗、累計、備份往返（`exportBackup → parseBackup`）、`chessops_` key 前綴，並確保只有 `state.js` 直接用 localStorage。

## 2. 網址

- 首頁：https://charleschow2045.github.io/chess-ops/
- 規則快測與小遊戲選單：https://charleschow2045.github.io/chess-ops/rules.html
- 開發者（測試頁、設計預覽）：https://charleschow2045.github.io/chess-ops/dev.html
- Stockfish 測試（請用 iPad）：https://charleschow2045.github.io/chess-ops/test-stockfish.html

## 3. 測試

`node tools/serve.js 8123` 後可用 `node tests/run-all.js`（純邏輯，45 項）：

- 規則題 30 題逐題用 chess.js 重算答案；play 題答案全部係合法步；選擇題選項、答案一致。
- 一步將死 40 題：每題記錄嘅將死步 = chess.js 算出嘅全部將死步；第 1 級全部由后將死；后、車、馬、象各有題。
- 找出將軍 20 題：記錄嘅將軍步 = chess.js 算出嘅全部將軍步（冇漏冇多）。
- 騎士迷宮 15 關：BFS 最少步數核對、路徑合法、起點同星都喺安全格、難度由淺入深。
- 兵仗：到底線即勝（黑白各一次）、將死、逼和、子力不足；起始局面；pickMove 第 1–4 級模擬 16 局都能完結且每步合法。
- normalizeState／records／備份往返；廣東話字掃描（掃描首頁、規則快測、小遊戲、設計預覽、題庫同 js 內嘅顯示文字，會先去除註解，並有自我測試）；所有頁面引用嘅本地檔案存在；字體 ≥ 13px；冇 CDN；舊棋盤同 Stockfish 18 冇殘留。

另外 `node tools/shots.js`（Playwright，Edge，820×1180，真滑鼠）跑完整流程並截圖：6 組規則快測全部用標準答案答對（5/5）、答錯路徑、一步將死第 1 級 10/10、騎士迷宮第 1／8／15 關用最少步數過關、兵仗兩人對戰 5 步獲勝，**冇任何 console 錯誤**。截圖喺 [stage1-shots/](stage1-shots/)。

## 4. 未確定／要留意

- **iPad 觸控**全部未測試（Playwright 用滑鼠，唔係觸控）。重點見第 5 節。
- **題目質素要你逐題睇**：一步將死同找出將軍嘅局面係程式隨機產生（固定種子），部分局面嘅棋子擺位唔似真實對局（例如黑棋分佈奇怪）；難度只係用「將死棋子種類、棋子數量」估算。騎士迷宮亦係程式產生。如果你覺得局面太怪或者難度唔順，可以改 `tools/gen-games.js` 嘅條件再產生，或者我手挑。
- 規則快測嘅解釋文字係我寫嘅書面語，請你睇 `stage1-content.md` 有冇用字或棋理上要改。
- 「兵仗」電腦：第 1–3 級大部分時間係隨機走，第 4 級約 45% 用 Stockfish；Stockfish 並唔知道「到底線即勝」呢條規則，只係當正常棋局計，所以對兵仗嘅強弱同第 0 階段嘅預設比例一樣，未經試玩調整。
- 兵仗兩人對戰唔計入成績；電腦對戰輸、和都計入「完成次數」。
- 第 0 階段嘅 `rank`、`streak` 儲存欄位仍然喺白名單內但未使用（第 6 階段先用）。
- 首頁／選單嘅成績只係儲存喺該瀏覽器：iPad Safari 版同主畫面版係分開，而且 Safari 7 日冇用可能清走資料；備份功能（`exportBackup`／`parseBackup`）有，但仲未有介面（之後階段做）。
- 完全離線（PWA）仍然未做。

## 5. iPad 要特別試嘅地方

1. 拖棋子時頁面有冇跟住捲動、有冇下拉重新整理；快速連續點兩下棋盤有冇放大。
2. 兩個手指同時碰棋盤、手指擋住棋子時嘅操作。
3. 升變視窗：4 個棋子按鈕夠唔夠大、取消容唔容易。
4. 規則快測選項按鈕、「下一題」掣大小；答完自動捲動到「下一題」位置是否自然。
5. 騎士迷宮：紅色格同星嘅圖案係咪清楚；星係用 Chessground 自訂 SVG 畫，要確認 iPad Safari 顯示正常。
6. 找出將軍嘅 30 秒倒數：彈出升變視窗時計時唔會暫停（目前設計），睇下係咪太緊張。
7. 兵仗：電腦載入（Stockfish 19，約 1.8 MB）嘅等待時間；「兩人對戰」同一部 iPad 嘅坐位同翻轉棋盤方便唔方便。
8. 文字大小同按鈕位置喺直向 820×1180 係咪舒適。

## 6. 要你決定

- 規則快測、小遊戲嘅題量、難度順序、解釋用字有冇要改？（題目清單喺 `stage1-content.md`）
- 兵仗電腦級別 1–4 嘅強弱，試玩後要唔要調（`js/pickmove.js` 內嘅比例）？
- 第 2 階段開始前，你用 iPad 試完之後想先改乜？
