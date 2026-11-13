# 第 0 階段報告（準備同設計預覽）

日期：2026-11-13　網址：https://charleschow2045.github.io/chess-ops/

> 讀法：**已測試** = 我喺桌面瀏覽器（Claude 內置瀏覽器，Chromium，8 核）實測；**未測試** = 要你用 iPad 試先知。我冇 iPad，所以所有 iPad 手感、速度都係未測試，下面只寫已知風險，唔扮知道。

## 1. 授權結果

詳細見 [THIRD_PARTY.md](THIRD_PARTY.md)。

| 元件 | 版本 | 授權（睇咗原文） | 備註 |
|---|---|---|---|
| chess.js | 1.4.0 | BSD-2-Clause | LICENSE 原文已睇；同 GPL 相容 |
| Stockfish.js | 18.0.0（lite 單執行緒） | GPL-3.0 | `Copying.txt` 係 GPL v3 全文；檔頭寫 "License: GPLv3" |
| Chessground | 9.2.1 | GPL-3.0-or-later | `package.json`＋LICENSE（GPL v3 全文）＋README 都一致；README 明確話用於網站要按 GPL 公開原始碼 |
| cburnett 棋子圖案 | 隨 Chessground | GPLv2+（**第二手資料**） | 內嵌喺 CSS，冇獨立授權標頭；我係根據 Lichess `COPYING.md` 寫 GPLv2+，未喺套件內找到作者原文 → 標「未獨立核實」 |

**結論：** 因為 repo 內有 GPL 檔案，**整個 repo 以 GPL-3.0 公開**（已放 `LICENSE`，README 已寫明）。Stockfish.js 只寫 GPLv3（冇 "or later"），所以統一寫 GPL-3.0。呢個決定會影響日後：想轉閉源或其他授權，就要先拆走所有 GPL 檔案（包括 Stockfish）。

## 2. 棋盤比較同建議（請你揀）

兩個測試頁功能一樣：點棋子再點格子、拖拉、最後一步高亮、合法步提示（圓點／吃子圈）、升變選擇（4 款棋子，可取消）、翻轉棋盤、畫箭咀示範。連埋 chess.js。

| 項目 | A：Chessground | B：自己寫（CSS grid + Pointer Events） |
|---|---|---|
| 程式量（原始大小） | `chessground.min.js` 30.0 KB（gzip 約 11 KB）＋ CSS 3 個共 17.7 KB（其中 11.5 KB 係棋子圖案） | `board-custom.js` 9.8 KB（約 200 行，gzip 約 3.5 KB）＋ `board-custom.css` 2.0 KB ＋ 同一份棋子圖案 CSS 11.5 KB |
| 授權 | GPL-3.0-or-later | 自己寫，但棋子圖案同樣借用 cburnett（GPLv2+）。反正 Stockfish 已令全 repo 係 GPL，所以**授權唔係分別點** |
| 桌面實測 | 點擊、拖拉、非法步彈返、最後一步高亮、升變、翻轉全部正常（真滑鼠操作） | 點擊、拖拉（ghost 跟手）、非法步取消、升變、翻轉正常（用模擬 Pointer 事件測試，未用真滑鼠拖拉） |
| iPad 手感 | **未測試**。Lichess 網站（包括手機瀏覽器）一直用呢個程式庫，touch 事件處理應該成熟（有動畫、拖拉距離門檻、ghost） | **未測試**。用 Pointer Events＋`touch-action:none`，理論上 iPadOS 13+ 正常；但冇動畫，細節（拖拉時頁面捲動、長按、多指）要實機驗證 |
| 動畫、鍵盤無障礙等 | 內置走子動畫、吃子淡出、將軍高亮 | 冇動畫；要自己加 |
| 日後畫箭咀 | **容易**：內置 `setShapes([{orig,dest,brush}])`，仲有圈、自訂 SVG；但「用手指自由畫箭咀」嘅操作方式要喺 iPad 上另外驗證／自己接（未測試） | **中等**：我已寫咗 `drawArrow()`（約 35 行 SVG）；任何形狀都自己控制，但圈、多色、動畫要逐樣寫 |
| 風險 | 版本升級要跟（GPL 要求）；樣式要覆蓋（座標預設 9px，我已覆蓋成 13px） | 所有 bug 自己負責；日後加功能（預走、動畫、3D）要自己寫 |

**建議：A（Chessground）。** 原因：iPad 觸控處理由大量用戶驗證過；日後謎題提示、對局分析都要畫箭咀同圈，Chessground 已內置；授權上兩者冇分別。代價係多約 30 KB 檔案同一個外部依賴。**請你用 iPad 兩個頁都試，揀一個。**（如果 B 手感明顯更好，或者你想日後完全唔靠 Lichess 嘅程式庫，揀 B 都可行。）

試用要點：慢拖、快拖、拖出棋盤放手、點錯再改點、升變取消、翻轉後再走、拖拉時頁面有冇跟住捲動、棋子大小同手指會唔會擋住。

## 3. Stockfish 載入同運算時間

引擎：Stockfish.js 18.0.0 lite 單執行緒（`.wasm` 7,295,411 bytes ≈ 6.96 MB；喺 GitHub Pages 以 gzip 傳送，約 5.4 MB）。以 Web Worker 載入，單執行緒（**唔需要** SharedArrayBuffer／跨來源隔離，所以 GitHub Pages 可以用）。引擎選項：Skill Level 0–20、UCI_LimitStrength、UCI_Elo 最低 1320 最高 3190、Hash 預設 16 MB（我設咗 16）、Threads 只可以係 1。

**桌面測試（已測試；iPad 未測試）**

| 項目 | 本機 | GitHub Pages（首次，冇快取） |
|---|---|---|
| 載入到可用（Worker＋下載＋編譯＋uciok/readyok） | 約 2.0 秒 | 約 4.0 秒 |

| 局面（depth 10，各跑 3 次） | 最佳步 | 最短／平均／最長（ms） |
|---|---|---|
| 開局 | e2e4 | 35／79／154（Pages）；38／74／129（本機） |
| 中局（意大利開局） | c3a4 | 87／95／104（Pages）；95／121／161（本機） |
| 謎題局面（Nc7+ 嗰個） | d5e3 | 19／21／24（Pages）；24／26／28（本機） |

備註：喺「謎題局面」，depth 10 嘅引擎揀 Ne3 而唔係 Nc7+（Nc7+ 後黑王可以走 Kd7，馬仍然被追，所以未必最強）。呢個局面只係設計預覽用，**唔係正式謎題**。

**估計：** iPad 預計比呢部 8 核桌面機慢（幾倍都有可能），所以請用 `test-stockfish.html` 撳「全部測試」，再「複製結果」貼俾我，我先可以決定 depth 同載入畫面要點做。首次載入 7 MB 要有進度提示；`.wasm` 之後會靠瀏覽器快取（離線 PWA 未做，見第 8 節）。

## 4. pickMove 比例（預設值，等你試玩後調）

`js/pickmove.js` 嘅 `pickMove(level, game, {Chess, engine, rng})`：

| 級別 | 用 Stockfish 最佳步（depth 10） | 其餘用隨機合法步 | 見到白食嘅子會食（先於混合判斷） |
|---|---|---|---|
| 1 | 10% | 90% | 85% |
| 2 | 20% | 80% | 90% |
| 3 | 30% | 70% | 95% |
| 4 | 45% | 55% | —（唔使特別規則） |
| 5 | 60% | 40% | — |
| 6 | 75% | 25% | — |
| 7 | Stockfish 最低設定：Skill Level 0，depth 2 | — | — |
| 8 | Stockfish 最低設定：UCI_LimitStrength，UCI_Elo = 1320（引擎容許嘅最低值），movetime 150 ms | — | — |

「白食」定義：可以吃一隻子，而淨得益 ≥ 1 分（被吃子價值 −（吃完會被吃返 ? 自己價值 : 0），兵 1、馬象 3、車 5、后 9）。第 1–3 級見到就有 85–95% 機率食（取淨得益最大嗰個）。
安全網：引擎出錯、逾時、回傳非法步，一律退回隨機合法步（測試已覆蓋）。

**已測試：** 8 個級別 × 多個局面（含升變、只剩一步合法步）全部回傳合法步；統計測試確認各級用引擎嘅比例貼近上表（每級 1000 次，誤差 5% 內）。**未測試：** 實際強弱——表內數字係「合理預設」，冇對照過你仔仔嘅真實水平。注意第 8 級（UCI_Elo 1320）對 chess.com 470 分嘅小朋友可能已經好難；第 1 級（90% 隨機）有可能仍然會因為隨機亂走而偶然咁「送」對手分數，要試玩先知道。

## 5. chess.com 公開資料介面（hikaru 公開帳戶）

在瀏覽器直接 `fetch`，兩個來源都測試過：

| 來源網頁 | 結果 |
|---|---|
| `http://localhost:8123`（本機） | `/games/archives` HTTP 200，155 個月份；最新月份 220 局，**220 局全部有 `pgn` 欄位**；`/stats` 正常 |
| `https://charleschow2045.github.io`（真正網址） | 同上，全部成功 |

- **CORS：冇問題。** 回應帶 `Access-Control-Allow-Origin: *`（用 curl 確認）。
- **PGN：可以直接攞到。** 每局有 `pgn`（完整 PGN 文字）、`time_class`、`rules`、雙方 `rating`，大部分對局仲有 `accuracies`（精度）。
- **注意：** 瀏覽器唔可以自訂 User-Agent；用 curl 無 User-Agent 或 HEAD 請求曾被擋（403），但瀏覽器 fetch 正常。chess.com 有流量限制（太密集請求可能 429），日後要慢慢攞、只攞最近幾個月並快取。
- **未測試：** 你仔仔嘅帳戶（我冇佢嘅用戶名，亦唔應該拎）。如果佢嘅帳戶設為私人，API 會攞唔到。
- **後備方案（已設計，未做）：** 如果日後介面改變／被擋，「我的對局」改為俾佢貼 PGN（由 chess.com 對局頁面「下載／分享」複製），app 用 chess.js 解析。

## 6. iPad 可能有嘅問題（全部未實測）

1. **儲存會被清走：** iPad Safari 會清走 7 日冇互動網站嘅 localStorage（除非加到主畫面）；主畫面版同 Safari 版儲存係分開。→ 備份／還原（`exportBackup`/`parseBackup`，已有雛形）同提示用戶固定用主畫面版好重要。
2. **7 MB 引擎首次載入慢**，而且 iPad 低記憶體時 Safari 可能殺 Worker／分頁；要做「載入中」同「引擎斷咗，重新載入」處理。
3. **拖拉與捲動：** 拖棋子時頁面可能一齊捲動或觸發下拉重新整理；Chessground／自己寫都用咗阻止預設行為，但要實機驗證。雙擊放大、手指擋住棋子亦要看。
4. **ES module／Worker 要經 http(s)**，所以不能用檔案方式開；GitHub Pages 無問題。
5. **剪貼簿：** 「複製結果」靠 `navigator.clipboard`，iPad 通常可以，失敗時頁面會直接顯示文字等你長按複製。
6. **GitHub Pages 快取約 10 分鐘**：更新後 iPad 可能仍見舊版；日後 PWA／Service Worker 要記得改版本號（參考 japanese-ops 做法）。
7. **文字不細過 13px：** Chessground 預設座標字 9px，我已覆蓋為 13px，並有測試掃描 CSS 防止 <13px。
8. **直向 820×1180 以外**（例如分割畫面、橫向）只做咗基本自適應，未仔細設計。

## 7. 已完成項目對照

- repo 結構：`index.html`、`css/`、`js/`、`vendor/`、`data/`、`tools/`、`tests/`、`design-preview/`、`docs/` ✓
- vendor：chess.js 1.4.0、Chessground 9.2.1、Stockfish.js 18 lite 單執行緒（來源網址同版本見 THIRD_PARTY.md）✓
- 測試頁：兩個棋盤、Stockfish、chess.com 介面 ✓
- 設計預覽：A 深色經典／B 清爽淺色／C 夜空金色，各有主頁、謎題、對電腦下棋；7 個模組各有原創圖示 ✓（`design-preview/`，可切換）
- `tests/run-all.js`：`node tests/run-all.js`，23 項全部通過（chess.js 載入同 perft、pickMove 全級別合法步、normalizeState 白名單、localStorage key 前綴掃描、字體 ≥13px 掃描、無 CDN 掃描、vendor 檔案存在）✓
- `js/state.js`：`normalizeState()` 白名單（欄位：version、rank、streak、settings、playLevel）；備份／還原都經過佢 ✓

## 8. 仲未確定／未做

- **棋盤揀邊個**（等你）、**設計方向 A/B/C**（等你）。
- iPad 上嘅真實載入時間、運算時間、拖拉手感（等你試）。
- pickMove 各級比例同第 7、8 級設定嘅真實強弱（要試玩調）。
- Stockfish 18 vs 19：GitHub 已有 v19.0.0／v19.0.1，`stockfish-19-lite-single.wasm` 只有約 1.8 MB（18 係約 7.0 MB），載入會快好多。今次按指示用 18；**要唔要升級 19 等你決定**（升級要重新核實授權）。
- cburnett 棋子圖案嘅作者原文授權（只得 Lichess 聲明）；日後可改用自己畫嘅棋子。
- 離線 PWA／Service Worker（今次冇做；日後要處理 7 MB wasm 快取）。
- 「謎題」將來嘅題目來源（自己出？Lichess 公開謎題資料庫要另外核實授權）：未討論。
- 設計預覽嘅內容（稱號經驗門檻、任務、模組副標題）只係示範，唔係定案。
