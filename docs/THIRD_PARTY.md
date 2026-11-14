# 第三方檔案與授權

> 核實日期：2026-11-13。授權文字已經睇過各自 LICENSE／Copying 原文（檔案已放喺 `vendor/` 對應資料夾）。
> 凡係冇辦法核實嘅地方，一律寫「未確定」，唔係估。

## 一覽

| 名稱 | 版本 | 授權 | 用途 | 來源 |
|---|---|---|---|---|
| chess.js | 1.4.0 | BSD-2-Clause | 棋規、合法步、FEN／PGN | npm 套件 `chess.js@1.4.0`（https://registry.npmjs.org/chess.js/-/chess.js-1.4.0.tgz）；原始碼 https://github.com/jhlywa/chess.js |
| Stockfish.js（Stockfish 19 lite 單執行緒） | 19.0.1（GitHub release `v19.0.1`） | GPL-3.0 | 電腦對手、分析 | https://github.com/nmrugg/stockfish.js/releases/tag/v19.0.1 （檔案：`stockfish-19-lite-single.js`、`stockfish-19-lite-single.wasm`）；原始碼 https://github.com/nmrugg/stockfish.js |
| Chessground | 9.2.1 | GPL-3.0-or-later | 棋盤測試頁 A | npm 套件 `chessground@9.2.1`（https://registry.npmjs.org/chessground/-/chessground-9.2.1.tgz）；原始碼 https://github.com/lichess-org/chessground |
| Lichess 謎題資料庫（子集） | 2026-11-01 版 | CC0 | 戰術謎題、一步將死 | https://database.lichess.org/lichess_db_puzzle.csv.zst |
| cburnett 棋子圖案（內嵌喺 `chessground.cburnett.css`） | 隨 Chessground 9.2.1 | GPLv2+（見下面說明） | 兩個棋盤測試頁同設計預覽嘅棋子圖案 | 隨 Chessground 一齊發佈；作者 Colin M.L. Burnett |

## 逐項說明

### chess.js 1.4.0 — BSD-2-Clause
- LICENSE 原文：`vendor/chess.js/LICENSE`（"Copyright (c) 2025, Jeff Hlywa"，兩條款 BSD）。
- 放入 repo 嘅檔案：`vendor/chess.js/chess.esm.js`（瀏覽器用，ES module）、`vendor/chess.js/chess.cjs`（Node 測試用）。兩個都係 npm 套件 `dist/` 內嘅原檔，冇改動。
- 條件：再發佈時要保留版權聲明同免責聲明（已保留喺 LICENSE）。BSD-2-Clause 同 GPL 相容。

### Stockfish.js 19.0.1 — GPL-3.0
- 第 1 階段由 18.0.0 升級到 19.0.1（已刪走 18 嘅檔案）。
- 授權原文：`vendor/stockfish/LICENSE-Copying.txt`（由 Stockfish.js repo 嘅 `Copying.txt` 於 tag `v19.0.1` 重新下載並核實：GNU GPL Version 3, 29 June 2007，35,821 bytes，同根目錄 `LICENSE` 逐位元組相同）。
- `stockfish-19-lite-single.js` 檔頭註明：「Stockfish.js 19 (c) 2026, Chess.com, LLC … License: GPLv3 … Based on Stockfish (c) T. Romstad, M. Costalba, J. Kiiski, G. Linscott and other contributors … Nets by Chris Bao (sscg13)」。
- 檔案大小：`.js` 28,230 bytes；`.wasm` 1,845,971 bytes（約 1.76 MB；18 版係約 7.0 MB）。
- 來源：`gh release download v19.0.1 -R nmrugg/stockfish.js -p 'stockfish-19-lite-single.*'`。
- **GPL-3.0 影響：** 因為 repo 內帶有 GPL 檔案並一齊發佈，整個 repo 以 GPL-3.0 公開（見根目錄 `LICENSE` 同 `README.md`）。Stockfish.js 標明係 GPLv3（冇寫「or later」），所以對外統一寫 GPL-3.0。

### Chessground 9.2.1 — GPL-3.0-or-later
- `package.json` 寫 `"license": "GPL-3.0-or-later"`；`vendor/chessground/LICENSE` 係 GPL Version 3 全文；README 寫明：「Chessground is distributed under the GPL-3.0 license (or any later version, at your option)」，用於網站時合併作品只可以按 GPL 發佈，並須向用戶公開原始碼。
- 放入 repo 嘅檔案：`chessground.min.js`（ES module，30,016 bytes）、`chessground.base.css`、`chessground.brown.css`、`chessground.cburnett.css`。全部係 npm 套件 `dist/`、`assets/` 內嘅原檔，冇改動。
- 我哋嘅覆蓋樣式（例如座標字改為 13px）寫喺 `css/test.css`，唔改 vendor 檔案。

### cburnett 棋子圖案 — GPLv2+
- 圖案以 base64 SVG 內嵌喺 `chessground.cburnett.css`，該檔案冇獨立授權標頭。
- 根據 Lichess 主 repo 嘅 `COPYING.md`（https://github.com/lichess-org/lila/blob/master/COPYING.md ）：`public/piece/cburnett` — Colin M.L. Burnett — GPLv2+。此資料來自第二手（Lichess 嘅聲明），**未有喺 Chessground 套件內找到原作者授權原文**，所以標為「按 Lichess 聲明為 GPLv2+，未獨立核實原作者授權」。
- 「自己寫」棋盤測試頁同設計預覽亦借用呢套圖案，所以呢兩處都受同一授權約束。日後如果想完全獨立，可以改用自己畫嘅棋子（未決定）。

## Lichess 謎題資料庫（第 2 階段已加入，經篩選的子集）

- 來源：https://database.lichess.org/lichess_db_puzzle.csv.zst ；授權 **CC0**（用戶已核實；Lichess 資料庫頁面同樣標示 CC0）。
- 下載日期：2026-11-14；檔案大小：309,751,173 bytes（原始檔 Last-Modified：2026-11-01）；解壓後 6,193,530 條謎題。
- 處理方式：`tools/build-puzzles.js`（Node 內建 zstd、逐個 frame 串流解壓，終端機只印統計，原始檔不會被讀入 context）。Lichess 檔案是 pzstd 格式（每個 zstd frame 前有一個 skippable frame），Node 內建串流解壓遇到會報錯，所以腳本自己按 frame 讀取。
- 篩選條件：Rating 400–1400；RatingDeviation ≤ 90；Popularity ≥ 85；NbPlays ≥ 300；主題只保留 hangingPiece、mateIn1、fork、pin、mateIn2、skewer、discoveredAttack。符合條件共 792,365 題。
- 抽樣：每題先歸入一個「主要主題」（按罕見程度：skewer、discoveredAttack、pin、fork、hangingPiece、mateIn2、mateIn1），每個主要主題抽約 350 題、盡量平均分佈在 10 個分數段（每 100 分一段；固定種子 20261114，可重現）。共 **2,450 題**。
- 保留欄位：id、fen、moves、rating、themes（只留上面 7 個主題）。放在 `data/puzzles/r0400.json … r1300.json`（按分數段分檔，需要時才載入）和 `index.json`（統計）。10 個檔案合共 256,033 bytes（約 250 KB），連 `index.json`（2,011 bytes）與 `data/mate1.js`（8,198 bytes）仍遠低於 1.5 MB。
- 「一步將死」小遊戲：同一資料庫的 mateIn1 題，每個分數段 6 題，共 60 題（`data/mate1.js`）。
- 原始 `.csv`／`.zst` 不放入 repo（`.gitignore` 已排除）。
- 重新產生：`node tools/build-puzzles.js <lichess_db_puzzle.csv.zst>`。
- 注意：Lichess 資料庫本身 CC0，不要求署名；為方便核對，`docs/stage2-content.md` 提供每題的 Lichess 連結。

## 其他
- 設計預覽嘅圖示、稱號盾牌：自己畫嘅簡單 SVG，冇抄任何品牌圖案或吉祥物，隨 repo 以 GPL-3.0 發佈。
- 測試用嘅 chess.com 公開資料：只喺瀏覽器即時讀取，冇存入 repo。
- 根目錄 `LICENSE`：GPL-3.0 全文（同 Stockfish.js 嘅 `Copying.txt` 內容一樣）。本 repo 自己寫嘅檔案以 GPL-3.0 授權。**呢個選擇係為咗符合 Stockfish／Chessground 嘅 GPL 要求；如果日後想改用其他授權，必須先拆走全部 GPL 檔案。**
