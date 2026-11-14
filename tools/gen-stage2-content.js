/*
 * 產生 docs/stage2-content.md：隨機抽 30 題謎題（每個主題約 4 題）供抽查，另列出 check-5 新題目。
 * 用法：node tools/gen-stage2-content.js    （固定種子，結果可重現）
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const { Chess } = require(path.join(ROOT, "vendor/chess.js/chess.cjs"));
const PL = require(path.join(ROOT, "js/puzzle-logic.js"));
const QUIZ = require(path.join(ROOT, "data/rules-quiz.js"));
const QV = require(path.join(ROOT, "js/quiz-verify.js"));

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rng = mulberry32(20261114);
const dir = path.join(ROOT, "data/puzzles");
const all = [].concat(...fs.readdirSync(dir).filter(f => /^r\d{4}\.json$/.test(f)).sort().map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).map(PL.fromRow)));
const index = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));

const PRIORITY = ["skewer", "discoveredAttack", "pin", "fork", "hangingPiece", "mateIn2", "mateIn1"];
const primary = p => PRIORITY.find(t => p.themes.includes(t));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const chosen = [], used = new Set();
for (const t of PL.ALL_THEMES) {
  shuffle(all.filter(p => primary(p) === t)).slice(0, 4).forEach(p => { chosen.push(p); used.add(p.id); });
}
shuffle(all.filter(p => !used.has(p.id))).slice(0, 30 - chosen.length).forEach(p => chosen.push(p));

function describe(p) {
  const g = new Chess(p.fen);
  const player = g.turn() === "w" ? "黑" : "白";
  const sans = p.moves.map(u => g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san);
  return { player, opp: sans[0], answer: sans.slice(1).join(" → "), mate: g.isCheckmate() };
}

const L = [];
L.push("# 第 2 階段內容抽查清單", "",
  "由 `node tools/gen-stage2-content.js` 自動產生（固定種子）。", "",
  "## 一、隨機抽 30 題謎題（每個主題 4 題，另外隨機 2 題）", "",
  "- 「玩家」是要走棋的一方（FEN 是對手走之前的局面，所以玩家是 FEN 輪到走棋方的對方）。",
  "- 「答案」是 Lichess 的標準答案（含對手回應的步，以「→」分隔）；玩家走出不同但同樣將死的步，App 一樣當答對。",
  "- 點 Lichess 連結可以在網站上核對同一題。", "",
  "| # | Lichess 連結 | 謎題分 | 主題 | 玩家 | 對手先走 | 答案 | FEN（對手走之前） |", "|---|---|---|---|---|---|---|---|");
chosen.forEach((p, i) => {
  const d = describe(p);
  L.push(`| ${i + 1} | [${p.id}](https://lichess.org/training/${p.id}) | ${p.rating} | ${p.themes.map(t => PL.THEME_NAMES[t]).join("、")} | ${d.player} | ${d.opp} | ${d.answer} | \`${p.fen}\` |`);
});
L.push("", `（資料庫共 ${index.total} 題，來源與篩選條件見 \`docs/THIRD_PARTY.md\` 和 \`docs/stage2-report.md\`。）`, "");

const q = QUIZ.QUESTIONS.find(x => x.id === "check-5");
const g = new Chess(q.fen);
const moves = g.moves({ verbose: true });
L.push("## 二、規則快測 check-5（新題目）", "",
  `- 局面 FEN：\`${q.fen}\``,
  `- 題目：${q.prompt}`,
  `- 選項：${q.options.map(o => o.text + (o.key === q.answer ? " ✅" : "")).join("　／　")}`,
  `- 解釋：${q.explain}`,
  `- chess.js 驗證：白王被將軍＝${g.inCheck()}；全部合法步＝${moves.map(m => m.san).join("、")}；是否全部是王的步＝${moves.every(m => m.piece === "k")}；答案計算結果＝\`${QV.computeAnswer(q, Chess)}\``, "");

fs.writeFileSync(path.join(ROOT, "docs/stage2-content.md"), L.join("\n") + "\n");
console.log("已寫入 docs/stage2-content.md；抽樣 " + chosen.length + " 題；主題分布：" + PL.ALL_THEMES.map(t => t + " " + chosen.filter(p => p.themes.includes(t)).length).join("，"));
