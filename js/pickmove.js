/*
 * pickMove(level, game, deps)：按級別揀電腦嘅一步棋（雛形，比例係預設值，等試玩後再調）
 *
 *  第 1–6 級：Stockfish 最佳步同隨機合法步按比例混合（P_BEST 越細，隨機越多）。
 *             第 1–3 級另外有「食免費子」規則：如果有一隻子可以白食（食完對方冇得食返，
 *             或者食到嘅子比自己值錢好多），就有機會（P_TAKE_FREE）一定食。
 *  第 7–8 級：直接用 Stockfish 最低設定（7：Skill Level 0；8：UCI_LimitStrength + UCI_Elo 最低值）。
 *
 *  game：chess.js 嘅 Chess 實例（唔會被改動，內部會複製）
 *  deps：{ Chess, engine, rng }
 *    engine.bestMove(fen, search) → Promise<"e2e4" 或 "e7e8q">；search = { depth, movetime, skill, elo }
 *    rng() → [0,1)，預設 Math.random（測試時可以傳固定數值）
 *  回傳 Promise<{ move:{from,to,promotion,san}, source, level }>；冇合法步（將死／和棋）回傳 null
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.PickMove = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

  // 所有比例同引擎設定都集中喺 js/config.js（PICKMOVE），要調就改嗰度
  var CFG = (typeof module === "object" && module.exports) ? require("./config.js") : self.ChessOps.Config;
  var P_BEST = CFG.PICKMOVE.P_BEST;
  var P_TAKE_FREE = CFG.PICKMOVE.P_TAKE_FREE;
  var BEST_SEARCH = CFG.PICKMOVE.BEST_SEARCH;
  var LOWEST = CFG.PICKMOVE.LOWEST;

  function legalMoves(game) { return game.moves({ verbose: true }); }

  function toResult(m, source, level) {
    return { move: { from: m.from, to: m.to, promotion: m.promotion, san: m.san }, source: source, level: level };
  }

  function randomOf(list, rng) { return list[Math.min(list.length - 1, Math.floor(rng() * list.length))]; }

  /* 搵「白食」嘅吃子：淨得益 = 被食子價值 −（食完會被食返 ? 自己價值 : 0）。淨得益 >= 1 先算。 */
  function findFreeCaptures(game, Chess) {
    var best = 0, picks = [];
    legalMoves(game).forEach(function (m) {
      if (!m.captured) return;
      var c = new Chess(game.fen());
      c.move({ from: m.from, to: m.to, promotion: m.promotion });
      var recapturable = c.moves({ verbose: true }).some(function (x) { return x.to === m.to && !!x.captured; });   // 合法吃返
      var gain = VALUE[m.captured] - (recapturable ? VALUE[m.piece] : 0);
      if (gain < 1) return;
      if (gain > best) { best = gain; picks = [m]; } else if (gain === best) picks.push(m);
    });
    return picks;
  }

  function matchUci(moves, uci) {
    if (typeof uci !== "string" || uci.length < 4) return null;
    var from = uci.slice(0, 2), to = uci.slice(2, 4), promo = uci.length > 4 ? uci[4] : undefined;
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      if (m.from === from && m.to === to && (m.promotion || undefined) === promo) return m;
    }
    return null;
  }

  function pickMove(level, game, deps) {
    level = Math.min(8, Math.max(1, Math.round(Number(level)) || 1));
    var rng = (deps && deps.rng) || Math.random;
    var Chess = deps && deps.Chess;
    var engine = deps && deps.engine;
    var moves = legalMoves(game);
    if (moves.length === 0) return Promise.resolve(null);

    function fallback(source) { return toResult(randomOf(moves, rng), source || "fallback", level); }

    function askEngine(search, source) {
      if (!engine) return Promise.resolve(fallback("fallback"));
      return Promise.resolve()
        .then(function () { return engine.bestMove(game.fen(), search); })
        .then(function (uci) {
          var m = matchUci(moves, uci);
          return m ? toResult(m, source, level) : fallback("fallback");
        })
        .catch(function () { return fallback("fallback"); });
    }

    if (level >= 7) return askEngine(LOWEST[level], "engine-lowest");

    // 第 1–3 級：先睇有冇白食
    if (level <= 3 && Chess) {
      var free = findFreeCaptures(game, Chess);
      if (free.length && rng() < P_TAKE_FREE[level]) return Promise.resolve(toResult(randomOf(free, rng), "free-capture", level));
    }

    if (rng() < P_BEST[level]) return askEngine(BEST_SEARCH, "engine-best");
    return Promise.resolve(toResult(randomOf(moves, rng), "random", level));
  }

  return {
    pickMove: pickMove, findFreeCaptures: findFreeCaptures, matchUci: matchUci,
    P_BEST: P_BEST, P_TAKE_FREE: P_TAKE_FREE, BEST_SEARCH: BEST_SEARCH, LOWEST: LOWEST
  };
});
