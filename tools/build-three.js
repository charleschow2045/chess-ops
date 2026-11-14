/*
 * 產生「走棋前三問」題庫 data/three.js：由第 2 階段嘅 Lichess 謎題（data/puzzles/，分數 400–1100）取「對手第一步走完」
 * 嘅局面（即玩家要解題嗰刻），主題覆蓋送子、捉雙、牽制、一步殺，共 60 題（每個主題 15 題）。
 * 答案全部由 js/three-logic.js 用 chess.js 計出（唔自己作局面、唔手寫答案）。固定種子，可重現。
 * 用法：node tools/build-three.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const { Chess } = require(path.join(ROOT, "vendor/chess.js/chess.cjs"));
const PL = require(path.join(ROOT, "js/puzzle-logic.js"));
const TL = require(path.join(ROOT, "js/three-logic.js"));

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rng = mulberry32(20261115);
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const THEMES = ["hangingPiece", "fork", "pin", "mateIn1"];
const PER_THEME = 15;
const CAP = { q1none: 24, q1mate: 9, q2none: 24, q2mate: 18 };      // 令答案類型有變化，唔會全部係「沒有」

const dir = path.join(ROOT, "data/puzzles");
const all = [].concat(...fs.readdirSync(dir).filter(f => /^r\d{4}\.json$/.test(f)).sort().map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).map(PL.fromRow)))
  .filter(p => p.rating >= 400 && p.rating <= 1100);

const chosen = [], count = { q1none: 0, q1mate: 0, q2none: 0, q2mate: 0 }, perTheme = {};
THEMES.forEach(t => { perTheme[t] = 0; });
let tried = 0, invalid = 0;
for (const p of shuffle(all)) {
  const theme = THEMES.find(t => p.themes.includes(t) && perTheme[t] < PER_THEME);
  if (!theme) continue;
  tried++;
  const g = new Chess(p.fen);
  const m0 = p.moves[0];
  g.move({ from: m0.slice(0, 2), to: m0.slice(2, 4), promotion: m0[4] });
  const fen = g.fen();
  const q12 = TL.analyzeQ12(Chess, fen);
  if (!q12) { invalid++; continue; }
  if (q12.q1.kind === "none" && count.q1none >= CAP.q1none) continue;
  if (q12.q1.kind === "mate" && count.q1mate >= CAP.q1mate) continue;
  if (q12.q2.kind === "none" && count.q2none >= CAP.q2none) continue;
  if (q12.q2.kind === "mate" && count.q2mate >= CAP.q2mate) continue;
  const q3 = TL.pickQ3(Chess, fen, rng, [p.moves[1]]);       // 唔用謎題答案做候選步，避免混淆
  if (!q3) { invalid++; continue; }
  if (!TL.checkQ3(Chess, fen, q3)) throw new Error("Q3 自我驗證失敗：" + p.id);
  perTheme[theme]++;
  if (q12.q1.kind === "none") count.q1none++; if (q12.q1.kind === "mate") count.q1mate++;
  if (q12.q2.kind === "none") count.q2none++; if (q12.q2.kind === "mate") count.q2mate++;
  chosen.push({ id: p.id, rating: p.rating, theme, fen, q1: q12.q1, q2: q12.q2, q3 });
  if (THEMES.every(t => perTheme[t] >= PER_THEME)) break;
}
chosen.sort((a, b) => a.rating - b.rating);
chosen.forEach((c, i) => { c.n = i + 1; });

const rows = chosen.map(c => "  " + JSON.stringify(c)).join(",\n");
fs.writeFileSync(path.join(ROOT, "data/three.js"),
`/* 走棋前三問題庫：Lichess 謎題（CC0）「對手第一步走完」之後嘅局面；答案由 js/three-logic.js 用 chess.js 計出。
 * 由 tools/build-three.js 產生（固定種子），請不要手改。id = Lichess 謎題編號（https://lichess.org/training/<id>）。 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.ThreeData = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  return [
${rows}
  ];
});
`);
const dist = k => ["squares", "mate", "none"].map(x => x + " " + chosen.filter(c => c[k].kind === x).length).join("、");
console.log("三問：入選 " + chosen.length + " 題（嘗試 " + tried + "，局面不適用 " + invalid + "）；各主題 " + JSON.stringify(perTheme));
console.log("Q1 答案類型：" + dist("q1") + "；Q2 答案類型：" + dist("q2") + "；分數 " + chosen[0].rating + "–" + chosen[chosen.length - 1].rating);
console.log("檔案大小：" + fs.statSync(path.join(ROOT, "data/three.js")).size + " bytes");
