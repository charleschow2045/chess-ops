/*
 * 賽後檢討嘅純邏輯（唔使 DOM、唔直接用引擎：分析函數由呼叫者傳入；tests/run-all.js 會用假分析器測試）
 *
 * 分類用 Lichess 勝率（玩家角度）：
 *   勝率 wc(cp) = 2 / (1 + exp(−K × cp)) − 1        （K = 0.00368208，範圍 −1 至 1）
 *   跌幅 = wc(走之前最佳) − wc(走完之後)；跌幅 >= 0.3 大錯、>= 0.2 錯著、>= 0.1 疑問手（係數同門檻喺 config.REVIEW.WIN_CHANCE）
 * 走之前／走完之後嘅分數：
 *   evalBefore   = 走之前嗰個局面，輪到玩家走，最佳走法嘅分數（玩家角度）
 *   evalAfterOpp = 走完之後嗰個局面，輪到對手走，對手最佳走法嘅分數（對手角度）→ 玩家走完後嘅分數 = −evalAfterOpp
 * 將死分數換算成 ±MATE_CP；玩家走嘅就係引擎最佳步 → 跌幅 0（避免搜尋雜訊）。
 *
 * 原因：只有喺能夠確定時先寫，按以下次序判斷，只標第一個符合嘅（對大錯同錯著）：
 *   1 mated       被將死：走完之後對手有將死
 *   2 missedMate  漏殺：走之前引擎話 3 步內有將死，但玩家冇走將死嘅步
 *   3 hang        送子：走完之後對手可以白吃一枚子（白吃定義見 js/tactics.js）
 *   4 missedCapture 漏吃：引擎最佳步係吃子，而且淨得益 >= 2 分，但玩家冇走
 * 判斷唔到就唔寫原因（只講數目），唔亂作。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./config.js"), require("./tactics.js"));
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.ReviewLogic = factory(root.ChessOps.Config, root.ChessOps.Tactics); }
})(typeof self !== "undefined" ? self : this, function (CFG, T) {
  "use strict";
  var R = CFG.REVIEW, WC = R.WIN_CHANCE;
  var CLASS_NAME = { blunder: "大錯 Blunder", mistake: "錯著 Mistake", inaccuracy: "疑問手 Inaccuracy" };
  var REASON_TEXT = {
    mated: "沒有注意到對方可以將死",
    missedMate: "錯過了將死的機會",
    hang: "沒有注意到對方可以吃子",
    missedCapture: "錯過了白吃對方棋子的機會"
  };
  var MIN_MISSED_CAPTURE_GAIN = 2;       // 漏吃：最佳步嘅「白吃」淨得益至少 2 分
  var MAX_MATE_PLIES = 3;                // 漏殺：3 步內有將死

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

  /* Lichess 勝率（玩家角度，−1 至 1） */
  function winChance(cp) { return 2 / (1 + Math.exp(-WC.K * clamp(cp))) - 1; }

  /* 勝率跌幅（>= 0）：evalBefore = 走之前（玩家角度）；evalAfter = 走完之後（玩家角度） */
  function winDrop(evalBefore, evalAfter) { return Math.max(0, winChance(evalBefore) - winChance(evalAfter)); }

  /* 分數差（centipawn，只用嚟顯示「損失約幾多兵」） */
  function lossCp(evalBefore, evalAfterOpp) { return Math.max(0, clamp(evalBefore) + clamp(evalAfterOpp)); }

  function classify(drop) {
    var T3 = WC.THRESHOLDS;
    if (drop >= T3.blunder) return "blunder";
    if (drop >= T3.mistake) return "mistake";
    if (drop >= T3.inaccuracy) return "inaccuracy";
    return null;
  }

  /*
   * 原因。ctx = { fenBefore, uci, before:{cp,mate,best}, after:{cp,mate,best}, playerColor }
   * before = 走之前局面嘅分析（玩家角度）；after = 走完之後局面嘅分析（對手角度）。
   */
  function reasonFor(Chess, ctx) {
    var before = ctx.before || {}, after = ctx.after || {};
    var g = new Chess(ctx.fenBefore), mv;
    try { mv = g.move({ from: ctx.uci.slice(0, 2), to: ctx.uci.slice(2, 4), promotion: ctx.uci[4] }); } catch (e) { return null; }
    // 1. 被將死：走完之後對手有將死（引擎分數：輪到對手，mate > 0）
    if (after.mate !== null && after.mate !== undefined && after.mate > 0) return "mated";
    // 2. 漏殺：走之前 3 步內有將死，但玩家冇將死（走完之後唔係將死）
    if (before.mate !== null && before.mate !== undefined && before.mate >= 1 && before.mate <= MAX_MATE_PLIES && !g.isCheckmate()) return "missedMate";
    // 3. 送子：走完之後對手可以白吃一枚（玩家嘅）子
    if (!g.isGameOver() && T.freeCaptures(Chess, g, 1).length) return "hang";
    // 4. 漏吃：引擎最佳步係吃子，白吃淨得益 >= 2，但玩家冇走
    if (before.best && before.best !== ctx.uci) {
      var gb = new Chess(ctx.fenBefore);
      var bm = gb.moves({ verbose: true }).filter(function (m) { return T.uci(m) === before.best; })[0];
      if (bm && bm.captured && T.captureGain(Chess, gb, bm) >= MIN_MISSED_CAPTURE_GAIN) return "missedCapture";
    }
    return null;
  }

  /*
   * 檢討整局。analyze(fen) → Promise<{ cp, mate, best }>（輪到走棋方角度；best 係引擎最佳步 uci）
   * opts：{ onProgress(done, total), shouldCancel() }
   * 回傳 { cancelled, moves:[{ ply, moveNo, san, uci, fenBefore, bestUci, bestSan, drop, lossCp, evalBefore, evalAfter, cls, reason }], summary }
   *   moves 只包括玩家自己嘅步；evalBefore／evalAfter 都係玩家角度（cp，已換算將死）。
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
      var evalBefore = scoreToCp(before), evalAfterOpp = scoreToCp(after), evalAfter = -evalAfterOpp;
      var isBest = !!(before.best && u === before.best);
      var drop = isBest ? 0 : winDrop(evalBefore, evalAfter);
      var cls = classify(drop);
      var reason = null;
      if (cls === "blunder" || cls === "mistake") reason = reasonFor(Chess, { fenBefore: fenBefore, uci: u, before: before, after: after, playerColor: playerColor });
      var bestSan = null;
      if (before.best) { try { bestSan = new Chess(fenBefore).move({ from: before.best.slice(0, 2), to: before.best.slice(2, 4), promotion: before.best[4] }).san; } catch (e) { bestSan = null; } }
      out.push({ ply: i + 1, moveNo: Number(fenBefore.split(" ")[5]), san: move.san, uci: u, fenBefore: fenBefore,
        bestUci: before.best || null, bestSan: bestSan, drop: drop, lossCp: isBest ? 0 : lossCp(evalBefore, evalAfterOpp),
        evalBefore: evalBefore, evalAfter: evalAfter, cls: cls, reason: reason });
      done++;
      if (opts.onProgress) opts.onProgress(done, total);
    }
    return { cancelled: false, moves: out, summary: summarize(out) };
  }

  /* 小結：數目＋（能確定時先寫）原因 */
  function summarize(moves) {
    var cnt = { blunder: 0, mistake: 0, inaccuracy: 0 };
    moves.forEach(function (m) { if (m.cls) cnt[m.cls]++; });
    var parts = [];
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
    scoreToCp: scoreToCp, terminalScore: terminalScore, winChance: winChance, winDrop: winDrop, lossCp: lossCp, classify: classify,
    reasonFor: reasonFor, reviewGame: reviewGame, summarize: summarize
  };
});
