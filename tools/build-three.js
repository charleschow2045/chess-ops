/*
 * 產生「走棋前三問」題庫 data/three.js（共 70 題）：
 *  1. 60 題：Lichess 謎題（data/puzzles/，分數 400–1100）「對手第一步走完」之後嘅局面（即玩家要解題嗰刻），
 *     主題送子、捉雙、牽制、一步殺各 15 題。
 *  2. 10 題「對方威脅將死」：Lichess mateIn1 謎題「對手第一步走之前」嘅局面（謎題 FEN 本身）；條件：交換走棋方之後有一步將死、
 *     局面合法、走棋方冇被將軍；Q1 答案係「對方威脅將死」，Q2、Q3 照一般規則計。
 * 答案全部由 js/three-logic.js 用 chess.js 計出（唔自己作局面、唔手寫答案）。固定種子，可重現。
 *
 * 增量更新：如果 data/three.js 已經存在，會先用最新嘅判斷邏輯重算每一題；答案（Q1／Q2）改變或者 Q3 唔再成立嘅題目會被換走，
 * 同一主題補返新題，令總數保持 60 + 10。改動咗嘅題目 id 寫入 docs/stage5-three-changes.json（報告用）。
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
const PER_THEME = 15, THREAT_N = 10;
const CAP = { q1none: 24, q1mate: 9, q2none: 24, q2mate: 18 };

const dir = path.join(ROOT, "data/puzzles");
const all = [].concat(...fs.readdirSync(dir).filter(f => /^r\d{4}\.json$/.test(f)).sort().map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).map(PL.fromRow)))
  .filter(p => p.rating >= 400 && p.rating <= 1100);
const byId = {}; all.forEach(p => { byId[p.id] = p; });

const sameQ = (a, b) => a.kind === b.kind && JSON.stringify(a.squares) === JSON.stringify(b.squares) && a.text === b.text;

// ---- 1. 重算現有題目 ----
let OLD = [];
try { OLD = require(path.join(ROOT, "data/three.js")); } catch (e) { OLD = []; }
const kept = [], changed = [];
for (const q of OLD.filter(x => x.theme !== "mateThreat")) {
  const r = TL.analyzeQ12(Chess, q.fen);
  const reasons = [];
  if (!r) reasons.push("局面不再適用");
  else { if (!sameQ(q.q1, r.q1)) reasons.push("Q1 答案改變：" + q.q1.kind + " " + q.q1.squares.join(",") + " → " + r.q1.kind + " " + r.q1.squares.join(",")); if (!sameQ(q.q2, r.q2)) reasons.push("Q2 答案改變：" + q.q2.kind + " " + q.q2.squares.join(",") + " → " + r.q2.kind + " " + r.q2.squares.join(",")); }
  if (!TL.checkQ3(Chess, q.fen, q.q3)) reasons.push("Q3 不再成立（候選步安全／不安全判斷改變）");
  if (reasons.length) changed.push({ id: q.id, theme: q.theme, rating: q.rating, reasons }); else kept.push(q);
}

// ---- 2. 補返新題（同一主題）----
const count = { q1none: 0, q1mate: 0, q2none: 0, q2mate: 0 }, perTheme = {};
THEMES.forEach(t => { perTheme[t] = 0; });
const bump = q => { perTheme[q.theme]++; if (q.q1.kind === "none") count.q1none++; if (q.q1.kind === "mate") count.q1mate++; if (q.q2.kind === "none") count.q2none++; if (q.q2.kind === "mate") count.q2mate++; };
kept.forEach(bump);
const used = new Set(OLD.map(q => q.id));
const added = [];
for (const p of shuffle(all)) {
  if (THEMES.every(t => perTheme[t] >= PER_THEME)) break;
  if (used.has(p.id)) continue;
  const theme = THEMES.find(t => p.themes.includes(t) && perTheme[t] < PER_THEME);
  if (!theme) continue;
  const g = new Chess(p.fen);
  const m0 = p.moves[0];
  g.move({ from: m0.slice(0, 2), to: m0.slice(2, 4), promotion: m0[4] });
  const fen = g.fen();
  const q12 = TL.analyzeQ12(Chess, fen);
  if (!q12) continue;
  if (q12.q1.kind === "none" && count.q1none >= CAP.q1none) continue;
  if (q12.q1.kind === "mate" && count.q1mate >= CAP.q1mate) continue;
  if (q12.q2.kind === "none" && count.q2none >= CAP.q2none) continue;
  if (q12.q2.kind === "mate" && count.q2mate >= CAP.q2mate) continue;
  const q3 = TL.pickQ3(Chess, fen, rng, [p.moves[1]]);
  if (!q3 || !TL.checkQ3(Chess, fen, q3)) continue;
  const q = { id: p.id, rating: p.rating, theme, fen, q1: q12.q1, q2: q12.q2, q3 };
  bump(q); kept.push(q); added.push(q); used.add(p.id);
}
THEMES.forEach(t => { if (perTheme[t] !== PER_THEME) throw new Error("主題 " + t + " 只有 " + perTheme[t] + " 題"); });

// ---- 3. 10 題「對方威脅將死」（謎題 FEN 本身）----
let threats = OLD.filter(x => x.theme === "mateThreat");
const threatOK = threats.filter(q => { const r = TL.analyzeQ12(Chess, q.fen); return r && r.q1.kind === "mate" && sameQ(q.q1, r.q1) && sameQ(q.q2, r.q2) && TL.checkQ3(Chess, q.fen, q.q3); });
const threatChanged = threats.filter(q => !threatOK.includes(q)).map(q => q.id);
threats = threatOK.slice();
const threatIds = new Set(threats.map(q => q.id));
for (const p of shuffle(all.filter(x => x.themes.includes("mateIn1")))) {
  if (threats.length >= THREAT_N) break;
  if (used.has(p.id) || threatIds.has(p.id)) continue;
  const r = TL.analyzeQ12(Chess, p.fen);
  if (!r || r.q1.kind !== "mate") continue;
  const q3 = TL.pickQ3(Chess, p.fen, rng, []);
  if (!q3 || !TL.checkQ3(Chess, p.fen, q3)) continue;
  threats.push({ id: p.id, rating: p.rating, theme: "mateThreat", fen: p.fen, q1: r.q1, q2: r.q2, q3 });
  threatIds.add(p.id);
}
if (threats.length !== THREAT_N) throw new Error("「對方威脅將死」題目只有 " + threats.length);

const chosen = kept.concat(threats).sort((a, b) => a.rating - b.rating || a.id.localeCompare(b.id));
chosen.forEach((c, i) => { c.n = i + 1; });
const rows = chosen.map(c => "  " + JSON.stringify(c)).join(",\n");
fs.writeFileSync(path.join(ROOT, "data/three.js"),
`/* 走棋前三問題庫：Lichess 謎題（CC0）。60 題＝「對手第一步走完」之後嘅局面；10 題 mateThreat＝謎題 FEN 本身（對手走之前），Q1 答案係「對方威脅將死」。
 * 答案由 js/three-logic.js 用 chess.js 計出。由 tools/build-three.js 產生（固定種子，增量更新），請不要手改。id = Lichess 謎題編號（https://lichess.org/training/<id>）。 */
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
fs.writeFileSync(path.join(ROOT, "docs/stage5-three-changes.json"), JSON.stringify({
  changed, replacedBy: added.map(q => ({ id: q.id, theme: q.theme, rating: q.rating })), threatChanged, mateThreatIds: threats.map(q => q.id), total: chosen.length
}, null, 1) + "\n");
const dist = k => ["squares", "mate", "none"].map(x => x + " " + chosen.filter(c => c[k].kind === x).length).join("、");
console.log("三問：共 " + chosen.length + " 題（保留 " + kept.length + "，換走 " + changed.length + "，新補 " + added.length + "，威脅將死 " + threats.length + "）");
console.log("換走：" + changed.map(c => c.id).join("、"));
console.log("Q1 答案類型：" + dist("q1") + "；Q2：" + dist("q2"));
