/*
 * 對電腦下棋嘅純邏輯（唔使 DOM；需要 chess.js 嘅函數會由呼叫者傳入 Chess 類別；tests/run-all.js 會測試）
 *   - endState(game)           結束原因（將死、逼和、三次重複、50 步、子力不足）
 *   - materialInfo(game)       雙方被吃嘅棋子同子力差
 *   - undoPlies / hint / 次數上限
 *   - applyResult(levels, level, outcome, clean)  升級（連贏）同降級提示（連輸）規則
 *   - buildPgn / replay        PGN 同 uci 步序列
 * 所有可調數字喺 js/config.js 嘅 PLAY。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./config.js"));
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.PlayLogic = factory(root.ChessOps.Config); }
})(typeof self !== "undefined" ? self : this, function (CFG) {
  "use strict";
  var P = CFG.PLAY;
  var VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  var ORDER = ["q", "r", "b", "n", "p"];

  /* ---------- 結束原因 ---------- */
  var REASON_TEXT = {
    checkmate: "將死 Checkmate",
    stalemate: "逼和 Stalemate：輪到走棋的一方沒有合法步，又沒有被將軍",
    insufficient: "子力不足：雙方都沒有足夠的棋子將死對方",
    threefold: "三次重複：同一個局面出現了三次",
    fifty: "50 步規則：連續 50 步沒有吃子，也沒有走兵",
    draw: "和棋",
    resign: "認輸"
  };

  function endState(game) {
    if (game.isCheckmate()) return { over: true, result: game.turn() === "w" ? "b" : "w", reason: "checkmate", text: REASON_TEXT.checkmate };
    var reason = null;
    if (game.isStalemate()) reason = "stalemate";
    else if (game.isInsufficientMaterial()) reason = "insufficient";
    else if (game.isThreefoldRepetition()) reason = "threefold";
    else if (game.isDrawByFiftyMoves()) reason = "fifty";
    else if (game.isDraw()) reason = "draw";
    if (reason) return { over: true, result: "draw", reason: reason, text: REASON_TEXT[reason] };
    return { over: false, result: null, reason: null, text: "" };
  }

  /* outcome：相對於玩家嘅結果 "win" | "loss" | "draw" */
  function outcomeFor(result, playerColor) { return result === "draw" ? "draw" : (result === playerColor ? "win" : "loss"); }

  /* ---------- 被吃嘅棋子同子力差 ---------- */
  function materialInfo(game) {
    var capturedByWhite = [], capturedByBlack = [];
    game.history({ verbose: true }).forEach(function (m) {
      if (!m.captured) return;
      (m.color === "w" ? capturedByWhite : capturedByBlack).push(m.captured);
    });
    var sum = { w: 0, b: 0 };
    game.board().forEach(function (row) { row.forEach(function (p) { if (p) sum[p.color] += VALUE[p.type]; }); });
    function sorted(list) { return list.slice().sort(function (a, b) { return ORDER.indexOf(a) - ORDER.indexOf(b); }); }
    return { capturedByWhite: sorted(capturedByWhite), capturedByBlack: sorted(capturedByBlack), diff: sum.w - sum.b };   // diff > 0：白方多
  }

  /* ---------- 悔棋、提示 ---------- */
  /* 悔棋要退返幾多個半步：輪到玩家、而且玩家至少走過一步，先可以退（退返電腦嗰步同玩家嗰步 = 2）；否則 0 */
  function undoPlies(game, playerColor) {
    var n = game.history().length;
    if (game.turn() !== playerColor) return 0;
    return n >= (playerColor === "w" ? 2 : 3) ? 2 : 0;
  }
  function canUndo(game, playerColor, undosUsed) { return undosUsed < P.undoLimit && undoPlies(game, playerColor) > 0; }
  function canHint(game, playerColor, hintsUsed) { return hintsUsed < P.hintLimit && game.turn() === playerColor && !game.isGameOver(); }

  /* ---------- 升級／降級 ---------- */
  function emptyRecord() { return { w: 0, d: 0, l: 0, streak: 0, lstreak: 0 }; }
  function emptyLevels() { var o = {}; for (var l = P.minLevel; l <= P.maxLevel; l++) o[l] = emptyRecord(); return o; }

  /*
   * 一局完成後更新該級紀錄。clean = 冇用過悔棋同提示。
   *  - 勝／和／負 都照計入該級勝和負總數
   *  - 連贏（streak）：只有「冇用悔棋／提示」嘅勝局先 +1；用過悔棋／提示嘅勝局唔計入，但唔會中斷連贏；和棋同敗局會歸零
   *  - 連輸（lstreak）：敗局 +1；勝或和歸零
   *  - 連贏到 winsToLevelUp 局（而且未去到最高級）→ levelUp，新級別由 0 重新計
   *  - 連輸到 lossesToOfferDrop 局（而且唔係第 1 級）→ offerDrop（由玩家揀；唔揀降就連輸歸零，之後再輸 3 局先再問）
   * 回傳 { levels（新物件）, levelUp, offerDrop, newLevel }
   */
  function applyResult(levels, level, outcome, clean) {
    var out = JSON.parse(JSON.stringify(levels));
    var r = out[level] || (out[level] = emptyRecord());
    var res = { levels: out, levelUp: false, offerDrop: false, newLevel: level };
    if (outcome === "win") {
      r.w++; r.lstreak = 0;
      if (clean) r.streak++;
    } else if (outcome === "draw") { r.d++; r.streak = 0; r.lstreak = 0; }
    else { r.l++; r.streak = 0; r.lstreak++; }
    if (outcome === "win" && clean && r.streak >= P.winsToLevelUp && level < P.maxLevel) {
      res.levelUp = true; res.newLevel = level + 1; r.streak = 0;
    }
    if (outcome === "loss" && r.lstreak >= P.lossesToOfferDrop && level > P.minLevel) res.offerDrop = true;
    return res;
  }
  /* 玩家揀「保持目前級別」之後：連輸歸零 */
  function declineDrop(levels, level) { var o = JSON.parse(JSON.stringify(levels)); o[level].lstreak = 0; return o; }

  /* ---------- 步序列、PGN ---------- */
  function replay(Chess, uciMoves) {
    var g = new Chess();
    for (var i = 0; i < uciMoves.length; i++) {
      var u = uciMoves[i];
      try { g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch (e) { return null; }
    }
    return g;
  }
  function resultCode(result) { return result === "w" ? "1-0" : result === "b" ? "0-1" : "1/2-1/2"; }

  /* opts：{ playerColor, level, result:"w"|"b"|"draw"|null, date:"YYYY-MM-DD", reason } */
  function buildPgn(Chess, uciMoves, opts) {
    var g = replay(Chess, uciMoves);
    if (!g) throw new Error("步序列不合法");
    var comp = "Computer (Level " + opts.level + ")";
    g.header("Event", "Chess Ops vs Computer", "Site", "chess-ops", "Date", (opts.date || "").replace(/-/g, "."),
      "White", opts.playerColor === "w" ? "Player" : comp, "Black", opts.playerColor === "b" ? "Player" : comp,
      "Result", opts.result ? resultCode(opts.result) : "*");
    if (opts.reason) g.header("Termination", opts.reason);
    return g.pgn();
  }

  return {
    REASON_TEXT: REASON_TEXT, VALUE: VALUE,
    endState: endState, outcomeFor: outcomeFor, materialInfo: materialInfo,
    undoPlies: undoPlies, canUndo: canUndo, canHint: canHint,
    emptyLevels: emptyLevels, emptyRecord: emptyRecord, applyResult: applyResult, declineDrop: declineDrop,
    replay: replay, buildPgn: buildPgn, resultCode: resultCode
  };
});
