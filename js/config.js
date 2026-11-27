/*
 * 可調整數字集中地（Config）
 *
 * ⚠️ 呢度所有數字都係「合理預設值」，因為未有 iPad 實測數據，之後要按實測結果再調。
 *    要調就只改呢個檔案，其他程式（pickmove.js、對電腦下棋、賽後檢討）會自動跟住用。
 *    tests/run-all.js 會檢查呢度嘅數字合理（例如比例隨級別上升、門檻由小到大）。
 *
 * 載入方式：瀏覽器 <script src="js/config.js">（要喺 pickmove.js 之前）；Node 用 require("./config.js")。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.Config = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  return {
    /* ---------- 電腦各級別（js/pickmove.js） ---------- */
    PICKMOVE: {
      // 第 1–6 級：用 Stockfish 最佳步嘅機率（其餘用隨機合法步）。沿用第 0 階段數值。
      P_BEST: { 1: 0.10, 2: 0.20, 3: 0.30, 4: 0.45, 5: 0.60, 6: 0.75 },
      // 第 1–3 級：見到「白食」嘅子（食完對方食唔返，或者淨得益 >= 1 分）會食嘅機率
      P_TAKE_FREE: { 1: 0.85, 2: 0.90, 3: 0.95 },
      // 「最佳步」嘅搜尋設定（Stockfish 19 lite 單執行緒）；depth 越大越強但越慢
      BEST_SEARCH: { depth: 10 },
      // 第 7、8 級：直接用 Stockfish 最低設定
      //   7：Skill Level 0（最低）＋搜尋深度 2；8：UCI_LimitStrength + UCI_Elo 最低值 1320 + 限時（毫秒）
      LOWEST: {
        7: { skill: 0, depth: 2 },
        8: { elo: 1320, movetime: 150 }
      }
    },

    /* ---------- 電腦出棋速度（設定頁「電腦出棋速度」：慢／中／快，預設慢；js/speed.js） ----------
     * 適用於電腦同 App 自動走嘅對手步（對電腦下棋、殘局、戰術謎題嘅對手步、開局對方步、兵仗、一步將死）。
     * pauseMin／pauseMax＝出棋前停頓（毫秒，隨機）；anim＝對手棋子移動動畫（毫秒）。玩家自己走棋嘅動畫一律 PLAYER_ANIM_MS，唔拖慢。
     * 「快」就係第 3 階段之前嘅速度（同下面 THINK_PAUSE 一致）。 */
    COMPUTER_SPEED: {
      DEFAULT: "slow",
      PLAYER_ANIM_MS: 180,
      LEVELS: {
        slow:   { label: "慢", pauseMin: 1200, pauseMax: 1800, anim: 500 },
        medium: { label: "中", pauseMin: 800,  pauseMax: 1200, anim: 350 },
        fast:   { label: "快", pauseMin: 400,  pauseMax: 800,  anim: 180 }
      }
    },

    /* ---------- 電腦出棋前嘅停頓（毫秒）：令玩家睇得清電腦嘅棋 ---------- */
    THINK_PAUSE: { minMs: 400, maxMs: 800 },

    /* ---------- 「白吃」門檻（淨得益，見 js/tactics.js）：走棋前三問用 1；賽後檢討嘅「送子」「漏吃」原因用 2 ---------- */
    TACTICS: { THREE_MIN_GAIN: 1, REVIEW_MIN_GAIN: 2 },

    /* ---------- 稱號（js/daily.js）：全部由現有數據計出，唔另外儲存進度 ----------
     * 條件 key：puzzle＝謎題分；play＝電腦目前級別（>= N 級）；stars＝殘局星數；routes＝已掌握開局路線數。
     * mode "any"＝任一項達成即可；"all"＝全部達成。稱號要逐級取得（要先達成前一級）。 */
    TITLES: {
      NAMES: ["入門棋手", "俱樂部棋手", "候選大師", "國際棋聯大師", "國際大師", "特級大師"],
      REQ: [
        null,
        { mode: "any", conds: { puzzle: 800, play: 4 } },
        { mode: "all", conds: { puzzle: 950, play: 5 } },
        { mode: "all", conds: { puzzle: 1100, play: 6, stars: 40 } },
        { mode: "all", conds: { puzzle: 1250, play: 7, routes: 4 } },
        { mode: "all", conds: { puzzle: 1400, play: 8, stars: 70 } }
      ]
    },

    /* ---------- 每日任務、連續日數、練習時間（js/daily.js） ---------- */
    DAILY: {
      PUZZLES: 5,                   // 每日要做幾題戰術謎題（任何模式都計）
      PLAY_DAYS: [0, 1, 3, 5],      // 要求「對電腦下一局」嘅星期（0 日、1 一、3 三、5 五）
      KEEP_DAYS: 60,                // 每日紀錄（任務、練習時間、數字）只保留最近幾多日
      IDLE_MS: 120000               // 練習時間：停咗呢段時間冇操作就停止計（2 分鐘）
    },

    /* ---------- 防止紀錄遺失（首頁備份提示、設定頁「上次備份」） ---------- */
    APP: {
      BACKUP_WARN_DAYS: 7,          // 超過幾多日冇備份，首頁頂部顯示一行細提示
      BACKUP_SNOOZE_DAYS: 3         // 關閉提示之後，幾多日內唔再顯示
    },

    /* ---------- 我的對局（js/mygames.js） ---------- */
    MYGAMES: {
      MAX_GAMES: 20,                // 最多讀取幾局
      DAYS: 30,                     // 讀取最近幾多日
      TIME_CLASSES: ["rapid", "blitz"],   // 只取中速棋同快棋
      MAX_PUZZLES: 50,              // 「我的謎題」最多保存幾題
      ACCEPT_DROP: 0.05,            // 其他走法勝率跌幅 < 呢個數值都當答對
      RECENT: 5                     // 只保存最近分析過幾局嘅摘要
    },

    /* ---------- 殘局訓練（js/endgames-logic.js、js/endgames.js） ---------- */
    ENDGAME: {
      CAP_MULT: 2, CAP_ADD: 5, CAP_MAX: 50,   // 殺王課題步數上限 = 引擎最短將死步數 × 2 + 5（最多 50 步）
      STAR3_EXTRA: 3,                         // 3 星：不用提示，而且步數 <= 引擎最短 + 3
      HINT_LIMIT: 3,                          // 每次練習最多提示次數
      DEFENDER: { depth: 14 },                // 黑方（電腦）防守：Stockfish 全力（不降低強度），搜尋深度
      HINT: { depth: 14 },                    // 提示：Stockfish 為白方建議嘅搜尋深度
      WIN_CP: 300                             // 兵升變為后之後，Stockfish 分數（白方角度）>= 呢個數值先當「仍然贏」
    },

    /* ---------- 引擎穩定（js/engine-manager.js）：載入、搜尋逾時，出錯自動重新載入並重試 ---------- */
    ENGINE: {
      initTimeoutMs: 30000,   // 首次載入（下載 + 編譯 wasm）上限；iPad 慢嘅話要加大
      moveTimeoutMs: 10000,   // 一次搜尋冇回應就當出錯
      retries: 1,             // 出錯後重新載入並重試嘅次數
      coolDownMs: 20000       // 全部失敗後，呢段時間內唔再等引擎，直接退回隨機合法步
    },

    /* ---------- 對電腦下棋規則（js/play-logic.js） ---------- */
    PLAY: {
      undoLimit: 3,           // 每局最多悔棋次數（一次退返雙方各一步）
      hintLimit: 3,           // 每局最多提示次數
      winsToLevelUp: 3,       // 同一級連贏幾局自動升一級（用過悔棋或提示嘅勝局唔計入）
      lossesToOfferDrop: 3,   // 同一級連輸幾局就問要唔要降一級（由玩家自己揀）
      minLevel: 1, maxLevel: 8, defaultLevel: 3,
      recentGames: 20         // 保存最近幾局（PGN、結果等；唔存分析過程）
    },

    /* ---------- 提示（對局中問「提示」時，Stockfish 全力計算嘅設定） ---------- */
    HINT: { depth: 12 },

    /* ---------- 賽後檢討（逐步分析） ---------- */
    REVIEW: {
      // 每一步分析嘅時間上限（毫秒）。iPad 上要按實測調整，否則整局分析會太慢
      maxMsPerMove: 300,
      // 分析深度上限（同時受時間上限限制，先到先停）
      maxDepth: 12,
      // 分類用 Lichess 勝率：勝率 wc(cp) = 2 / (1 + exp(−K × cp)) − 1（−1 至 1，玩家角度）；
      // 每步嘅「跌幅」= wc(走之前) − wc(走之後)；跌幅 >= 門檻就標記：疑問手 < 錯著 < 大錯。
      // 已輸局面（例如 −1000 → −1000）跌幅接近 0，唔會再標大錯。
      WIN_CHANCE: { K: 0.00368208, THRESHOLDS: { inaccuracy: 0.1, mistake: 0.2, blunder: 0.3 } },
      // 將殺局面換算成分數用嘅數值（避免「將殺」變無限大）
      MATE_CP: 1000
    }
  };
});
