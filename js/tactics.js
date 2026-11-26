/*
 * 戰術判斷工具（純邏輯；需要 chess.js 嘅 Chess 類別由呼叫者傳入）
 * 「白吃」定義：淨得益 = 被吃子價值 −（吃完之後對方有「合法」吃子步落喺同一格 ? 自己嗰枚子價值 : 0）；兵 1、馬象 3、車 5、后 9。
 * （用 moves({verbose:true}) 檢查合法性：王唔可以吃返有後援保護嘅棋子、被牽制嘅棋子唔可以吃返。）
 * 用於：走棋前三問、賽後檢討原因（送子、漏吃）、電腦（pickmove 有自己一份同定義嘅簡化版）。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.Tactics = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  var NAME_ZH = { p: "兵", n: "馬", b: "象", r: "車", q: "后", k: "王" };
  var CODE = { p: "", n: "N", b: "B", r: "R", q: "Q", k: "K" };

  function uci(m) { return m.from + m.to + (m.promotion || ""); }

  /* 某一步吃子嘅淨得益（m 係 game 當前局面嘅 verbose 合法步；唔係吃子就回傳 0） */
  function captureGain(Chess, game, m) {
    if (!m.captured) return 0;
    var c = new Chess(game.fen());
    c.move({ from: m.from, to: m.to, promotion: m.promotion });
    // 吃返要係「合法」嘅吃子步落喺同一格（王唔可以吃返有後援保護嘅子；被牽制嘅子唔可以吃返）。
    // 吃過路兵：我方吃子之後，我方兵企喺 m.to，對方吃返都係落喺 m.to，所以同一個檢查。
    var recapturable = c.moves({ verbose: true }).some(function (x) { return x.to === m.to && !!x.captured; });
    return VALUE[m.captured] - (recapturable ? VALUE[m.piece] : 0);
  }

  /* 輪到走棋方可以白吃（淨得益 >= minGain）嘅所有吃子，按得益由大到小 */
  function freeCaptures(Chess, game, minGain) {
    var out = [];
    game.moves({ verbose: true }).forEach(function (m) {
      if (!m.captured) return;
      var g = captureGain(Chess, game, m);
      if (g >= (minGain || 1)) out.push({ move: m, gain: g });
    });
    out.sort(function (a, b) { return b.gain - a.gain; });
    return out;
  }

  function mateMoves(Chess, game) {
    return game.moves({ verbose: true }).filter(function (m) {
      var c = new Chess(game.fen());
      c.move({ from: m.from, to: m.to, promotion: m.promotion });
      return c.isCheckmate();
    });
  }

  function kingSquare(game, color) {
    var sq = null;
    game.board().forEach(function (row) { row.forEach(function (p) { if (p && p.type === "k" && p.color === color) sq = p.square; }); });
    return sq;
  }

  /*
   * 交換走棋方：同一個局面，改為「對方」走。用嚟計「假如輪到對方走」嘅威脅。
   * 處理：吃過路兵格清走（因為只對剛走完兩格嘅一方有效）；走棋方被將軍時唔合法（回傳 null）；
   *       交換後不走棋嗰方嘅王被攻擊（唔合法）回傳 null；FEN 載入失敗回傳 null。
   */
  function swapTurn(Chess, fen) {
    var p = fen.split(" ");
    if (p.length < 6) return null;
    var g0;
    try { g0 = new Chess(fen); } catch (e) { return null; }
    if (g0.inCheck()) return null;                 // 走棋方被將軍，交換後對方可以「吃王」，唔合法
    p[1] = p[1] === "w" ? "b" : "w";
    p[3] = "-";
    var swapped = p.join(" "), g;
    try { g = new Chess(swapped); } catch (e) { return null; }
    var other = g.turn() === "w" ? "b" : "w";
    var ks = kingSquare(g, other);
    if (!ks || g.isAttacked(ks, g.turn())) return null;
    return swapped;
  }

  /* 簡單 SAN 風格標示（只用於顯示，例如 "Nf3"） */
  function label(m) { return m.san; }

  return { VALUE: VALUE, NAME_ZH: NAME_ZH, CODE: CODE, uci: uci, captureGain: captureGain, freeCaptures: freeCaptures, mateMoves: mateMoves, kingSquare: kingSquare, swapTurn: swapTurn, label: label };
});
