/*
 * 騎士迷宮（純邏輯，唔需要 chess.js）
 * 規則：棋盤上有一隻白馬、幾粒星同幾隻黑棋。馬走法同國際象棋一樣（日字形）。
 *       馬不可以停喺「被黑棋攻擊的格」，也不可以停喺黑棋所在的格。用最少步數食晒所有星。
 * 攻擊範圍：黑棋互相會擋住直線（黑兵向下斜吃）；白馬同星唔會擋住線。
 * level = { id, knight:"a1", stars:["c3",…], black:[{ t:"r|b|q|n|p", sq:"d4" }, …] }
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.KnightMaze = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var FILES = "abcdefgh";
  function sq(f, r) { return FILES[f] + (r + 1); }
  function parse(s) { return { f: FILES.indexOf(s[0]), r: Number(s[1]) - 1 }; }
  function inside(f, r) { return f >= 0 && f < 8 && r >= 0 && r < 8; }

  var KN = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  var DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  var ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function knightMoves(s) {
    var p = parse(s), out = [];
    KN.forEach(function (d) { if (inside(p.f + d[0], p.r + d[1])) out.push(sq(p.f + d[0], p.r + d[1])); });
    return out;
  }

  /* 黑棋攻擊到嘅格（Set） */
  function attackedSquares(black) {
    var occ = {}, att = {};
    black.forEach(function (b) { occ[b.sq] = true; });
    function slide(p, dirs) {
      dirs.forEach(function (d) {
        var f = p.f + d[0], r = p.r + d[1];
        while (inside(f, r)) {
          att[sq(f, r)] = true;
          if (occ[sq(f, r)]) break;
          f += d[0]; r += d[1];
        }
      });
    }
    black.forEach(function (b) {
      var p = parse(b.sq);
      if (b.t === "n") KN.forEach(function (d) { if (inside(p.f + d[0], p.r + d[1])) att[sq(p.f + d[0], p.r + d[1])] = true; });
      else if (b.t === "p") [-1, 1].forEach(function (df) { if (inside(p.f + df, p.r - 1)) att[sq(p.f + df, p.r - 1)] = true; });
      else if (b.t === "b") slide(p, DIAG);
      else if (b.t === "r") slide(p, ORTH);
      else if (b.t === "q") slide(p, DIAG.concat(ORTH));
      else if (b.t === "k") DIAG.concat(ORTH).forEach(function (d) { if (inside(p.f + d[0], p.r + d[1])) att[sq(p.f + d[0], p.r + d[1])] = true; });
    });
    return att;
  }

  /* 不可以停喺呢啲格：被攻擊嘅格 ＋ 黑棋所在嘅格 */
  function unsafeSquares(level) {
    var u = attackedSquares(level.black);
    level.black.forEach(function (b) { u[b.sq] = true; });
    return u;
  }

  function isLegalMove(level, from, to) {
    return knightMoves(from).indexOf(to) >= 0 && !unsafeSquares(level)[to];
  }

  /* BFS：食晒所有星嘅最少步數；解唔到回傳 null。回傳 { par, path } */
  function solve(level) {
    var unsafe = unsafeSquares(level);
    if (unsafe[level.knight]) return null;
    var starBit = {};
    level.stars.forEach(function (s, i) { starBit[s] = 1 << i; });
    var full = (1 << level.stars.length) - 1;
    var startMask = starBit[level.knight] || 0;
    var key = function (s, m) { return s + ":" + m; };
    var seen = {}, queue = [{ s: level.knight, m: startMask, prev: null }];
    seen[key(level.knight, startMask)] = true;
    var depth = { 0: 0 };
    for (var qi = 0; qi < queue.length; qi++) {
      var cur = queue[qi];
      if (cur.m === full) {
        var path = [], n = cur;
        while (n) { path.unshift(n.s); n = n.prev; }
        return { par: path.length - 1, path: path };
      }
      var moves = knightMoves(cur.s);
      for (var i = 0; i < moves.length; i++) {
        var to = moves[i];
        if (unsafe[to]) continue;
        var m = cur.m | (starBit[to] || 0);
        var k = key(to, m);
        if (seen[k]) continue;
        seen[k] = true;
        queue.push({ s: to, m: m, prev: cur });
      }
    }
    return null;
  }

  /* 轉成 FEN（只用嚟畫棋盤；黑棋細楷、白馬大楷 N） */
  function toFen(level) {
    var grid = [];
    for (var r = 0; r < 8; r++) grid.push(new Array(8).fill(""));
    level.black.forEach(function (b) { var p = parse(b.sq); grid[p.r][p.f] = b.t; });
    var k = parse(level.knight); grid[k.r][k.f] = "N";
    var rows = [];
    for (var rr = 7; rr >= 0; rr--) {
      var line = "", empty = 0;
      grid[rr].forEach(function (c) { if (!c) empty++; else { if (empty) { line += empty; empty = 0; } line += c; } });
      if (empty) line += empty;
      rows.push(line);
    }
    return rows.join("/") + " w - - 0 1";
  }

  return { knightMoves: knightMoves, attackedSquares: attackedSquares, unsafeSquares: unsafeSquares, isLegalMove: isLegalMove, solve: solve, toFen: toFen };
});
