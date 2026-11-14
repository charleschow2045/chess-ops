/*
 * 規則快測：用 chess.js 計出每題嘅標準答案（tests/run-all.js 會逐題核對 data/rules-quiz.js 內寫低嘅答案）
 *   computeAnswer(q, Chess) → choice 題：選項 key（字串）；play 題：合法答案嘅 uci 陣列（已排序）
 *   positionOf(q, Chess)    → 題目局面（有 moves 就由 startFen 逐步走出嚟）
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.QuizVerify = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function positionOf(q, Chess) {
    var g = new Chess(q.startFen || q.fen);
    (q.moves || []).forEach(function (san) { g.move(san); });
    return g;
  }
  function uci(m) { return m.from + m.to + (m.promotion || ""); }
  function yn(b) { return b ? "yes" : "no"; }
  function verbose(g) { return g.moves({ verbose: true }); }
  function isMate(m) { return /#$/.test(m.san); }
  function isCheck(m) { return /[+#]$/.test(m.san); }

  var PRED = {
    castle: function (m) { return m.flags.indexOf("k") >= 0 || m.flags.indexOf("q") >= 0; },
    ep: function (m) { return m.flags.indexOf("e") >= 0; },
    mate: isMate,
    promoCheck: function (m) { return !!m.promotion && isCheck(m); },
    promoMate: function (m) { return !!m.promotion && isMate(m); },
    kingMove: function (m) { return m.piece === "k"; },
    block: function (m) { return m.piece !== "k" && !m.captured; },
    capture: function (m) { return !!m.captured; }
  };

  function stalemateMoves(g, Chess) {
    return verbose(g).filter(function (m) {
      var c = new Chess(g.fen());
      c.move({ from: m.from, to: m.to, promotion: m.promotion });
      return c.isStalemate();
    });
  }

  function computeAnswer(q, Chess) {
    var g = positionOf(q, Chess), v = q.verify, ms = verbose(g), i;
    switch (v.kind) {
      case "castle": return yn(g.moves().indexOf(v.wing === "k" ? "O-O" : "O-O-O") >= 0);
      case "ep": return yn(ms.some(PRED.ep));
      case "epCaptured": {
        var em = ms.filter(PRED.ep);
        if (em.length !== 1) return "INVALID:ep-count=" + em.length;
        var before = {}, sq, c = new Chess(g.fen());
        g.board().forEach(function (row) { row.forEach(function (p) { if (p) before[p.square] = 1; }); });
        c.move({ from: em[0].from, to: em[0].to });
        var after = {};
        c.board().forEach(function (row) { row.forEach(function (p) { if (p) after[p.square] = 1; }); });
        var gone = Object.keys(before).filter(function (s) { return !after[s] && s !== em[0].from; });
        return gone.length === 1 ? gone[0] : "INVALID:gone=" + gone.join(",");
      }
      case "flag":
        return yn(v.name === "threefold" ? g.isThreefoldRepetition() : v.name === "fifty" ? g.isDrawByFiftyMoves() : g.isInsufficientMaterial());
      case "status":
        return g.isCheckmate() ? "checkmate" : g.isStalemate() ? "stalemate" : g.inCheck() ? "check" : "none";
      case "legalChoice": {
        var legal = q.options.filter(function (o) {
          return ms.some(function (m) { return uci(m) === o.uci; });
        }).map(function (o) { return o.key; });
        return legal.length === 1 ? legal[0] : "INVALID:legal=" + legal.join(",");
      }
      case "promoRequired": {
        var pm = ms.filter(function (m) { return m.from === v.from && m.to === v.to; });
        return pm.length > 0 && pm.every(function (m) { return !!m.promotion; }) ? "must" : "optional";
      }
      case "impossible": {
        var none = [];
        if (!ms.some(PRED.kingMove)) none.push("king");
        if (!ms.some(PRED.block)) none.push("block");
        if (!ms.some(PRED.capture)) none.push("capture");
        return none.length === 1 ? none[0] : "INVALID:none=" + none.join(",");
      }
      case "onlyKing": return ms.length > 0 && ms.every(PRED.kingMove) ? "only" : "other";
      case "plays": {
        var list;
        if (v.pred === "stalemate") list = stalemateMoves(g, Chess);
        else if (/^promo:/.test(v.pred)) { var pc = v.pred.slice(6); list = ms.filter(function (m) { return m.promotion === pc; }); }
        else list = ms.filter(PRED[v.pred]);
        return list.map(uci).sort();
      }
    }
    return "INVALID:unknown-kind:" + v.kind;
  }

  return { computeAnswer: computeAnswer, positionOf: positionOf, uci: uci };
});
