/*
 * 賽後檢討嘅純邏輯（唔使 DOM、唔直接用引擎：分析函數由呼叫者傳入；tests/run-all.js 會用假分析器測試）
 *
 * 用玩家角度計每一步嘅分數損失（centipawn）：
 *   evalBefore   = 走之前嗰個局面，輪到玩家走，最佳走法嘅分數（玩家角度）
 *   evalAfterOpp = 走完之後嗰個局面，輪到對手走，對手最佳走法嘅分數（對手角度）
 *   損失 = max(0, evalBefore + evalAfterOpp)    （玩家走完後嘅分數 = −evalAfterOpp）
 * 將死分數換算成 ±MATE_CP；玩家走嘅就係引擎最佳步 → 損失 0（避免搜尋雜訊）。
 * 門檻、時間上限喺 js/config.js 嘅 REVIEW。
 * 原因：只有喺能夠確定時先寫（對方可以吃子／對方可以將死），否則只講數目，唔亂作原因。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./config.js"));
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.ReviewLogic = factory(root.ChessOps.Config); }
})(typeof self !== "undefined" ? self : this, function (CFG) {
  "use strict";
  var R = CFG.REVIEW;
  var VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  var CLASS_NAME = { blunder: "大錯 Blunder", mistake: "錯著 Mistake", inaccuracy: "疑問手 Inaccuracy" };
  var REASON_TEXT = { hang: "沒有注意到對方可以吃子", mate: "沒有注意到對方可以將死" };

  function clamp(n) { return Math.max(-R.MATE_CP, Math.min(R.MATE_CP, n)); }

  /* 引擎分數（cp 或 mate；輪到走棋方角度）→ 上限 ±MATE_CP 嘅 cp */
  function scoreToCp(s) {
    if (s.mate !== null && s.mate !== undefined) return s.mate > 0 ? R.MATE_CP : -R.MATE_CP;      // mate 0 = 輪到走棋方已被將死
    return clamp(s.cp || 0);
  }

  /* 終局局面（引擎唔使分析）：被將死 = −MATE_CP；其他和棋 = 0；未完 = null（輪到走棋方角度） */
  function terminalScore(game) {
    if (game.isCheckmate()) return -R.MATE_CP;
    if (game.isGameOver()) return 0;
    return null;
  }

  function lossCp(evalBefore, evalAfterOpp) { return Math.max(0, clamp(evalBefore) + clamp(evalAfterOpp)); }

  function classify(loss) {
    var T = R.THRESHOLDS_CP;
    if (loss >= T.blunder) return "blunder";
    if (loss >= T.mistake) return "mistake";
    if (loss >= T.inaccuracy) return "inaccuracy";
    return null;
  }

  /*
   * 原因：fenAfter = 玩家走完之後嘅局面；oppBest = 對手最佳回應（uci）；oppMate = 對手有冇將死（分析得出）
   *   mate：對手有將死
   *   hang：對手最佳回應係吃子，而且吃嘅係玩家嘅棋子——食到嘅子冇人保護，或者食到嘅子比自己值錢（>= 3 分）
   */
  function reasonFor(Chess, fenAfter, oppBest, oppMate, playerColor) {
    if (oppMate) return "mate";
    if (!oppBest) return null;
    var g = new Chess(fenAfter), mv;
    try { mv = g.move({ from: oppBest.slice(0, 2), to: oppBest.slice(2, 4), promotion: oppBest[4] }); } catch (e) { return null; }
    if (!mv.captured || mv.color === playerColor) return null;
    var capVal = VALUE[mv.captured], byVal = VALUE[mv.piece];
    var recapturable = g.isAttacked(mv.to, playerColor);
    if (capVal >= 1 && !recapturable) return "hang";
    if (capVal >= 3 && capVal > byVal) return "hang";
    return null;
  }

  /*
   * 檢討整局。analyze(fen) → Promise<{ cp, mate, best }>（輪到走棋方角度；best 係引擎最佳步 uci）
   * opts：{ onProgress(done, total), shouldCancel() }
   * 回傳 { cancelled, moves:[{ ply, moveNo, san, uci, fenBefore, bestUci, bestSan, loss, cls, reason }], summary }
   *   moves 只包括玩家自己嘅步。
   */
  async function reviewGame(Chess, uciMoves, playerColor, analyze, opts) {
    opts = opts || {};
    var game = new Chess(), cache = {}, out = [];
    var total = uciMoves.filter(function (_, i) { return (i % 2 === 0) === (playerColor === "w"); }).length, done = 0;

    async function evalPos(g) {
      var t = terminalScore(g);
      if (t !== null) return { cp: t, mate: null, best: null, terminal: true };
      var fen = g.fen();
      if (!cache[fen]) cache[fen] = await analyze(fen);
      return cache[fen];
    }

    for (var i = 0; i < uciMoves.length; i++) {
      var u = uciMoves[i];
      var isPlayer = (i % 2 === 0) === (playerColor === "w");
      if (!isPlayer) { game.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); continue; }
      if (opts.shouldCancel && opts.shouldCancel()) return { cancelled: true, moves: out, summary: null };

      var fenBefore = game.fen();
      var before = await evalPos(game);
      var move = game.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      var after = await evalPos(game);
      var evalBefore = scoreToCp(before), evalAfterOpp = scoreToCp(after);
      var loss = (before.best && u === before.best) ? 0 : lossCp(evalBefore, evalAfterOpp);
      var cls = classify(loss);
      var reason = null;
      if (cls === "blunder" || cls === "mistake") reason = reasonFor(Chess, game.fen(), after.best, after.mate > 0, playerColor);
      var bestSan = null;
      if (before.best) { try { bestSan = new Chess(fenBefore).move({ from: before.best.slice(0, 2), to: before.best.slice(2, 4), promotion: before.best[4] }).san; } catch (e) { bestSan = null; } }
      out.push({ ply: i + 1, moveNo: Number(fenBefore.split(" ")[5]), san: move.san, uci: u, fenBefore: fenBefore,
        bestUci: before.best || null, bestSan: bestSan, loss: loss, cls: cls, reason: reason });
      done++;
      if (opts.onProgress) opts.onProgress(done, total);
    }
    return { cancelled: false, moves: out, summary: summarize(out) };
  }

  /* 小結：數目＋（能確定時先寫）原因 */
  function summarize(moves) {
    var cnt = { blunder: 0, mistake: 0, inaccuracy: 0 };
    moves.forEach(function (m) { if (m.cls) cnt[m.cls]++; });
    var parts = [], i;
    function reasonClause(kind) {
      var list = moves.filter(function (m) { return m.cls === kind; });
      var known = list.filter(function (m) { return m.reason; });
      if (!known.length) return "";
      var reasons = {}; known.forEach(function (m) { reasons[m.reason] = (reasons[m.reason] || 0) + 1; });
      var keys = Object.keys(reasons);
      if (keys.length === 1 && known.length === list.length) return (list.length === 1 ? "，是" : "，都是") + REASON_TEXT[keys[0]];
      if (keys.length === 1) return "，其中 " + known.length + " 步是" + REASON_TEXT[keys[0]];
      return "";
    }
    if (cnt.blunder) parts.push("這局有 " + cnt.blunder + " 步大錯" + reasonClause("blunder") + "。");
    if (cnt.mistake) parts.push((cnt.blunder ? "另有 " : "這局有 ") + cnt.mistake + " 步錯著" + reasonClause("mistake") + "。");
    if (cnt.inaccuracy) parts.push((cnt.blunder || cnt.mistake ? "還有 " : "這局有 ") + cnt.inaccuracy + " 步疑問手。");
    if (!parts.length) parts.push("這局沒有大錯、錯著或疑問手。");
    else if (!cnt.blunder && !cnt.mistake) parts.unshift("這局沒有大錯和錯著。");
    return { counts: cnt, text: parts.join("") };
  }

  return {
    CLASS_NAME: CLASS_NAME, REASON_TEXT: REASON_TEXT,
    scoreToCp: scoreToCp, terminalScore: terminalScore, lossCp: lossCp, classify: classify, reasonFor: reasonFor,
    reviewGame: reviewGame, summarize: summarize
  };
});
