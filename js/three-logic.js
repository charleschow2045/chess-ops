/*
 * 走棋前三問嘅答案計算（純邏輯；Chess 由呼叫者傳入；tests/run-all.js 會逐題重新計算並核對 data/three.js）
 *
 *  局面：玩家（走棋方 S）要走棋嘅一刻（例如 Lichess 謎題「對手第一步走完」之後）。
 *  Q1「對方上一步想做甚麼？」＝ 假如輪到對方走，對方有咩威脅：
 *       對方可以白吃嘅己方棋子（squares）／對方可以一步將死（mate）／沒有直接威脅（none）
 *       → 用「交換走棋方」嘅 FEN 計（清走吃過路兵格；S 被將軍嘅局面唔合法，唔用）
 *  Q2「我有沒有機會？」＝ S 可以白吃嘅對方棋子（squares）／可以一步將死（mate）／沒有（none）
 *  Q3「這一步安全嗎？」＝ 3 個候選步：1 個會送子或被將死（unsafe）、2 個安全
 *       安全 = 走完之後對手冇白吃（淨得益 >= 1）同冇一步將死
 *  白吃定義見 js/tactics.js。mate 同 squares 同時存在會令答案有歧義，所以呢類局面唔用（invalid）。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./tactics.js"));
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.ThreeLogic = factory(root.ChessOps.Tactics); }
})(typeof self !== "undefined" ? self : this, function (T) {
  "use strict";
  var N = T.NAME_ZH;

  /* 被吃子所在格（吃過路兵嘅被吃兵喺 to 嘅檔、from 嘅橫行） */
  function targetSquare(m) { return m.flags.indexOf("e") >= 0 ? m.to[0] + m.from[1] : m.to; }

  function capText(c, who) {      // who："對方" | "你"
    var m = c.move, tgt = targetSquare(m);
    var unprotected = c.gain === T.VALUE[m.captured];
    var mine = who === "對方" ? "你" : "對方";
    return who + "的" + N[m.piece] + "可以吃掉" + mine + (unprotected ? "沒有保護的 " : "價值較高的 ") + tgt + " " + N[m.captured];
  }

  /* 一個局面（走棋方 = game.turn()）嘅「白吃／將死」摘要 */
  function threats(Chess, game, who) {
    var mates = T.mateMoves(Chess, game), caps = T.freeCaptures(Chess, game, 1);
    if (mates.length) {
      if (caps.length) return null;                        // 同時有將死同白吃 → 答案有歧義 → 唔用
      return { kind: "mate", moves: mates.map(function (m) { return m.san; }), squares: [] };
    }
    if (caps.length) {
      var squares = [];
      caps.forEach(function (c) { var s = targetSquare(c.move); if (squares.indexOf(s) < 0) squares.push(s); });
      return { kind: "squares", squares: squares.sort(), moves: caps.map(function (c) { return c.move.san; }), caps: caps };
    }
    return { kind: "none", squares: [], moves: [] };
  }

  /* Q1／Q2：回傳 { q1, q2 } 或 null（局面唔適合） */
  function analyzeQ12(Chess, fen) {
    var g;
    try { g = new Chess(fen); } catch (e) { return null; }
    if (g.isGameOver() || g.inCheck()) return null;
    var mine = threats(Chess, g, "你");
    if (!mine) return null;
    var swapped = T.swapTurn(Chess, fen);
    if (!swapped) return null;
    var gs = new Chess(swapped);
    if (gs.isGameOver()) return null;
    var theirs = threats(Chess, gs, "對方");
    if (!theirs) return null;
    var q2 = { kind: mine.kind, squares: mine.squares };
    q2.text = mine.kind === "mate" ? "你走 " + mine.moves[0] + " 就可以將死對方。"
      : mine.kind === "squares" ? mine.caps.map(function (c) { return capText(c, "你"); }).join("；") + "。"
      : "目前沒有可以白吃的對方棋子，也沒有一步將死的機會。";
    var q1 = { kind: theirs.kind, squares: theirs.squares };
    q1.text = theirs.kind === "mate" ? "假如輪到對方走，對方走 " + theirs.moves[0] + " 就可以將死你。"
      : theirs.kind === "squares" ? theirs.caps.map(function (c) { return capText(c, "對方"); }).join("；") + "。"
      : "假如輪到對方走，對方沒有可以白吃你的棋子，也沒有一步將死的威脅。";
    return { q1: q1, q2: q2 };
  }

  /* 走完某一步之後安全嗎？回傳 null（安全）或者懲罰細節 { kind:"mate"|"capture", san, text } */
  function punishment(Chess, game, m) {
    var c = new Chess(game.fen());
    c.move({ from: m.from, to: m.to, promotion: m.promotion });
    if (c.isGameOver()) return null;
    var mates = T.mateMoves(Chess, c);
    if (mates.length) return { kind: "mate", san: mates[0].san, text: "走 " + m.san + " 之後，對方走 " + mates[0].san + " 就可以將死你。" };
    var caps = T.freeCaptures(Chess, c, 1);
    if (caps.length) return { kind: "capture", san: caps[0].move.san, text: "走 " + m.san + " 之後，" + capText(caps[0], "對方") + "。" };
    return null;
  }

  function natural(m) {
    if (m.captured || /[+#]$/.test(m.san) || m.flags.indexOf("k") >= 0 || m.flags.indexOf("q") >= 0) return true;
    if (m.piece === "n" || m.piece === "b" || m.piece === "r" || m.piece === "q") return true;
    if (m.piece === "p") { var f = m.to[0]; return f >= "c" && f <= "f"; }
    return false;
  }

  /*
   * Q3：揀 1 個不安全 + 2 個安全嘅「自然」候選步（出子、吃子、將軍、易位、中心兵）。rng：() → [0,1)；exclude：唔用嘅 uci（例如謎題答案）
   * 回傳 { options:[{uci,san}]（已洗牌）, answer:uci, text } 或 null
   */
  function pickQ3(Chess, fen, rng, exclude) {
    var g = new Chess(fen), unsafe = [], safe = [];
    g.moves({ verbose: true }).forEach(function (m) {
      var u = T.uci(m);
      if ((exclude || []).indexOf(u) >= 0 || !natural(m)) return;
      var p = punishment(Chess, g, m);
      (p ? unsafe : safe).push({ m: m, p: p });
    });
    if (!unsafe.length || safe.length < 2) return null;
    function take(list) { return list.splice(Math.min(list.length - 1, Math.floor(rng() * list.length)), 1)[0]; }
    var bad = take(unsafe), s1 = take(safe), s2 = take(safe);
    var opts = [bad, s1, s2];
    for (var i = opts.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = opts[i]; opts[i] = opts[j]; opts[j] = t; }
    return {
      options: opts.map(function (o) { return { uci: T.uci(o.m), san: o.m.san }; }),
      answer: T.uci(bad.m),
      text: bad.p.text + "另外兩步是安全的。"
    };
  }

  /* 驗證一個 Q3：恰好 1 個不安全、2 個安全，answer 就係不安全嗰個 */
  function checkQ3(Chess, fen, q3) {
    var g = new Chess(fen), unsafe = [];
    if (!q3 || q3.options.length !== 3) return false;
    for (var i = 0; i < 3; i++) {
      var o = q3.options[i];
      var m = g.moves({ verbose: true }).filter(function (x) { return T.uci(x) === o.uci; })[0];
      if (!m) return false;
      if (punishment(Chess, g, m)) unsafe.push(o.uci);
    }
    return unsafe.length === 1 && unsafe[0] === q3.answer;
  }

  return { analyzeQ12: analyzeQ12, pickQ3: pickQ3, checkQ3: checkQ3, punishment: punishment, natural: natural, targetSquare: targetSquare, threats: threats };
});
