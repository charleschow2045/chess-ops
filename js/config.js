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

    /* ---------- 電腦出棋前嘅停頓（毫秒）：令玩家睇得清電腦嘅棋 ---------- */
    THINK_PAUSE: { minMs: 400, maxMs: 800 },

    /* ---------- 提示（對局中問「提示」時，Stockfish 全力計算嘅設定） ---------- */
    HINT: { depth: 12 },

    /* ---------- 賽後檢討（逐步分析） ---------- */
    REVIEW: {
      // 每一步分析嘅時間上限（毫秒）。iPad 上要按實測調整，否則整局分析會太慢
      maxMsPerMove: 300,
      // 分析深度上限（同時受時間上限限制，先到先停）
      maxDepth: 12,
      // 走完該步之後，相對最佳步損失嘅分數（centipawn，1 兵 = 100）達到門檻就標記
      //   疑問手（inaccuracy）< 錯著（mistake）< 大錯（blunder）
      THRESHOLDS_CP: { inaccuracy: 60, mistake: 150, blunder: 300 },
      // 將殺局面換算成分數用嘅數值（避免「將殺」變無限大）
      MATE_CP: 1000
    }
  };
});
