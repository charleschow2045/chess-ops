/*
 * 小遊戲題目產生器（固定種子，結果可重現）。用法：node tools/gen-games.js
 * 輸出：data/mate1.js（一步將死）、data/check-find.js（找出將軍）、data/knight-maze.js（騎士迷宮）
 * 每個局面都用 chess.js／BFS 驗證；tests/run-all.js 會再逐題重新驗證一次。
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const { Chess } = require(path.join(ROOT, "vendor/chess.js/chess.cjs"));
const KM = require(path.join(ROOT, "js/knight-maze.js"));

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const FILES = "abcdefgh";
const name = (f, r) => FILES[f] + (r + 1);
const uci = m => m.from + m.to + (m.promotion || "");
function wrap(varName, obj, header) {
  return `/* ${header}\n * 由 tools/gen-games.js 產生（固定種子）；請不要手改。 */\n(function (root, factory) {\n  if (typeof module === "object" && module.exports) module.exports = factory();\n  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.${varName} = factory(); }\n})(typeof self !== "undefined" ? self : this, function () {\n  "use strict";\n  return [\n${obj.map(o => "    " + JSON.stringify(o)).join(",\n")}\n  ];\n});\n`;
}
function fenFromPlacement(pieces) {
  const grid = Array.from({ length: 8 }, () => Array(8).fill(""));
  pieces.forEach(p => { grid[p.r][p.f] = p.c; });
  const rows = [];
  for (let r = 7; r >= 0; r--) {
    let line = "", e = 0;
    grid[r].forEach(c => { if (!c) e++; else { if (e) { line += e; e = 0; } line += c; } });
    if (e) line += e;
    rows.push(line);
  }
  return rows.join("/") + " w - - 0 1";
}

/* ---------- 一步將死 ---------- */
function genMate1() {
  const rng = mulberry32(20261113);
  const R = n => Math.floor(rng() * n);
  const pick = a => a[R(a.length)];
  const SETS = [["Q"], ["Q", "P"], ["R"], ["R", "P"], ["R", "R"], ["Q", "N"], ["R", "N"], ["N", "Q"], ["N", "R", "P"], ["B", "Q"], ["B", "R"], ["B", "N"], ["B", "B"], ["N", "N", "R"], ["B", "N", "R"], ["Q", "B", "P"]];
  const quota = { q: 9, r: 9, n: 9, b: 7, mix: 6 };
  const got = { q: [], r: [], n: [], b: [], mix: [] };
  const seen = new Set();
  const t0 = Date.now();
  let attempts = 0;
  const done = () => Object.keys(quota).every(k => got[k].length >= quota[k]);
  while (!done() && Date.now() - t0 < 240000) {
    attempts++;
    const wset = pick(SETS);
    // 黑王喺邊緣
    const edge = R(4), t = R(8);
    const bk = edge === 0 ? { f: t, r: 7 } : edge === 1 ? { f: 7, r: t } : edge === 2 ? { f: 0, r: t } : { f: t, r: 0 };
    const used = new Set([bk.f * 8 + bk.r]);
    const place = (c, near) => {
      for (let i = 0; i < 40; i++) {
        let f, r;
        if (near) { f = bk.f + R(5) - 2; r = bk.r + R(5) - 2; } else { f = R(8); r = R(8); }
        if (f < 0 || f > 7 || r < 0 || r > 7 || used.has(f * 8 + r)) continue;
        if ((c === "P" || c === "p") && (r === 0 || r === 7)) continue;
        used.add(f * 8 + r); return { f, r, c };
      }
      return null;
    };
    const pieces = [{ f: bk.f, r: bk.r, c: "k" }];
    let ok = true;
    const wk = place("K", false); if (!wk) continue;
    if (Math.abs(wk.f - bk.f) <= 1 && Math.abs(wk.r - bk.r) <= 1) continue;
    pieces.push(wk);
    wset.forEach(c => { const p = place(c, c !== "P" ? R(2) === 0 : false); if (p) pieces.push(p); else ok = false; });
    const nBlack = R(5);
    const bpool = ["p", "p", "p", "n", "b", "r"];
    for (let i = 0; i < nBlack; i++) { const p = place(pick(bpool), true); if (p) pieces.push(p); }
    if (!ok) continue;
    let g;
    try { g = new Chess(fenFromPlacement(pieces)); } catch (e) { continue; }
    const bkSq = name(bk.f, bk.r);
    if (g.isAttacked(bkSq, "w") || g.inCheck()) continue;
    const moves = g.moves({ verbose: true });
    if (moves.length < 10) continue;
    const mates = moves.filter(m => { const c = new Chess(g.fen()); c.move({ from: m.from, to: m.to, promotion: m.promotion }); return c.isCheckmate(); });
    if (mates.length < 1 || mates.length > 2) continue;
    const fen = g.fen();
    if (seen.has(fen)) continue;
    const piece = mates[0].piece;
    // 唔要靠兵吃子／升變嘅怪題；只接受 Q/R/N/B 將死
    if (!"qrnb".includes(piece)) continue;
    if (mates.some(m => m.promotion || m.piece === "p")) continue;
    const nWhite = pieces.filter(p => p.c === p.c.toUpperCase()).length - 1;
    const slot = got[piece].length < quota[piece] ? piece : (nWhite >= 3 && got.mix.length < quota.mix ? "mix" : null);
    if (!slot) continue;
    seen.add(fen);
    got[slot].push({ fen, mates: mates.map(uci).sort(), piece, white: nWhite, black: pieces.length - 1 - nWhite, moves: moves.length });
  }
  const all = [].concat(got.q, got.r, got.n, got.b, got.mix);
  const weight = { q: 1, r: 2, n: 4, b: 4 };
  all.sort((a, b) => (weight[a.piece] * 10 + a.white * 3 + a.black + a.moves / 6) - (weight[b.piece] * 10 + b.white * 3 + b.black + b.moves / 6));
  all.forEach((p, i) => { p.id = "m1-" + String(i + 1).padStart(2, "0"); p.level = Math.floor(i / 10) + 1; delete p.moves; });
  console.log("mate1:", all.length, "題；嘗試", attempts, "次；", Object.fromEntries(Object.entries(got).map(([k, v]) => [k, v.length])));
  return all;
}

/* ---------- 找出將軍 ---------- */
function genCheckFind() {
  const rng = mulberry32(20261114);
  const R = n => Math.floor(rng() * n);
  const want = [];
  const seen = new Set();
  const t0 = Date.now();
  let attempts = 0;
  while (want.length < 20 && Date.now() - t0 < 240000) {
    attempts++;
    const g = new Chess();
    const plies = 14 + R(24);
    for (let i = 0; i < plies && !g.isGameOver(); i++) { const ms = g.moves({ verbose: true }); g.move(ms[R(ms.length)]); }
    if (g.isGameOver() || g.inCheck()) continue;
    const ms = g.moves({ verbose: true });
    const pieces = g.board().flat().filter(Boolean).length;
    if (pieces < 14 || ms.length < 20) continue;
    const checks = ms.filter(m => /[+#]$/.test(m.san));
    if (checks.length < 2 || checks.length > 6) continue;
    const fen = g.fen();
    if (seen.has(fen)) continue;
    // 每個「將軍數」最多 5 題，令難度有層次
    if (want.filter(w => w.checks.length === checks.length).length >= 5) continue;
    seen.add(fen);
    want.push({ fen, checks: checks.map(uci).sort(), turn: g.turn() });
  }
  want.sort((a, b) => a.checks.length - b.checks.length || b.fen.length - a.fen.length);
  want.forEach((w, i) => { w.id = "ck-" + String(i + 1).padStart(2, "0"); });
  console.log("check-find:", want.length, "題；嘗試", attempts, "次；將軍數分布", want.map(w => w.checks.length).join(","));
  return want;
}

/* ---------- 騎士迷宮 ---------- */
function genMaze() {
  const rng = mulberry32(20261115);
  const R = n => Math.floor(rng() * n);
  const pick = a => a[R(a.length)];
  const cand = [];
  const seen = new Set();
  for (let attempt = 0; attempt < 200000 && cand.length < 600; attempt++) {
    const nb = 2 + R(4);
    const used = new Set();
    const rs = () => { for (let i = 0; i < 30; i++) { const s = name(R(8), R(8)); if (!used.has(s)) { used.add(s); return s; } } return null; };
    const black = [];
    for (let i = 0; i < nb; i++) {
      const t = pick(["r", "b", "q", "n", "p", "r", "b"]);
      let s = rs(); if (!s) break;
      if (t === "p" && (s[1] === "1" || s[1] === "8")) { used.delete(s); continue; }
      black.push({ t, sq: s });
    }
    if (black.length < 2) continue;
    const unsafe = KM.unsafeSquares({ black });
    const safeSq = []; for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) { const s = name(f, r); if (!unsafe[s]) safeSq.push(s); }
    if (safeSq.length < 18) continue;
    const knight = pick(safeSq);
    const nStars = 2 + R(3);
    const stars = new Set();
    while (stars.size < nStars) { const s = pick(safeSq); if (s !== knight) stars.add(s); }
    const level = { knight, stars: [...stars].sort(), black: black.sort((a, b) => a.sq.localeCompare(b.sq)) };
    const sol = KM.solve(level);
    if (!sol || sol.par < 3 || sol.par > 14) continue;
    const key = JSON.stringify(level);
    if (seen.has(key)) continue;
    seen.add(key);
    cand.push(Object.assign(level, { par: sol.par }));
  }
  // 由淺入深：揀 15 關，步數同星數逐漸增加
  cand.sort((a, b) => (a.par + a.stars.length * 1.5) - (b.par + b.stars.length * 1.5));
  const picks = [];
  for (let i = 0; i < 15; i++) picks.push(cand[Math.floor(i * (cand.length - 1) / 14)]);
  picks.forEach((l, i) => { l.id = "km-" + String(i + 1).padStart(2, "0"); });
  console.log("maze: 候選", cand.length, "；揀出", picks.length, "關；最少步數", picks.map(l => l.par).join(","));
  return picks;
}

const which = process.argv[2];
if (!which || which === "mate1") fs.writeFileSync(path.join(ROOT, "data/mate1.js"), wrap("Mate1", genMate1(), "一步將死題庫：白方走棋，一步將死。mates = 全部能將死嘅步（uci）。level 1–4，由淺入深。"));
if (!which || which === "check") fs.writeFileSync(path.join(ROOT, "data/check-find.js"), wrap("CheckFind", genCheckFind(), "找出將軍題庫：checks = 全部可以將軍嘅步（uci）。"));
if (!which || which === "maze") fs.writeFileSync(path.join(ROOT, "data/knight-maze.js"), wrap("MazeLevels", genMaze(), "騎士迷宮關卡：par = 食晒所有星嘅最少步數（BFS 計出）。"));
