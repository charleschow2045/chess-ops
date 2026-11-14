/*
 * 產生 docs/stage1-content.md：全部題目（FEN、問題、答案、解釋），方便逐題核對。
 * 用法：node tools/gen-content.js
 * 答案欄位同時列出「寫低的答案」同「chess.js 計出的答案」，兩者必須一致（tests/run-all.js 會驗證）。
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const { Chess } = require(path.join(ROOT, "vendor/chess.js/chess.cjs"));
const QV = require(path.join(ROOT, "js/quiz-verify.js"));
const QUIZ = require(path.join(ROOT, "data/rules-quiz.js"));
const MATE1 = require(path.join(ROOT, "data/mate1.js"));
const CHECKFIND = require(path.join(ROOT, "data/check-find.js"));
const MAZE = require(path.join(ROOT, "data/knight-maze.js"));
const KM = require(path.join(ROOT, "js/knight-maze.js"));

const sanOf = (fen, u) => { const g = new Chess(fen); return g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san; };
const sansOf = (fen, list) => list.map(u => sanOf(fen, u)).join("、");
const esc = s => String(s).replace(/\|/g, "\\|");
const L = [];

L.push("# 第 1 階段題目清單（供逐題核對）", "",
  "由 `node tools/gen-content.js` 自動產生。每個局面的 FEN 可以貼到任何棋盤程式（例如 lichess.org/editor）核對。",
  "「chess.js 計算結果」欄位是程式用 chess.js 重新算出來的答案，`tests/run-all.js` 會確保它與題庫內寫的答案一致。", "");

L.push("## 一、規則快測（30 題）", "");
for (const g of QUIZ.GROUPS) {
  L.push(`### ${g.title}（${g.desc}）`, "");
  for (const q of QUIZ.QUESTIONS.filter(x => x.group === g.id)) {
    const pos = QV.positionOf(q, Chess);
    const computed = QV.computeAnswer(q, Chess);
    L.push(`**${q.id}**（${q.type === "choice" ? "選擇題" : "在棋盤上走一步"}）`, "");
    L.push(`- 局面 FEN：\`${pos.fen()}\`${q.moves ? `（由開局走：${q.moves.join(" ")}）` : ""}`);
    L.push(`- 問題：${q.prompt}`);
    if (q.type === "choice") {
      L.push(`- 選項：${q.options.map(o => `${o.text}${o.key === q.answer ? " ✅" : ""}`).join("　／　")}`);
      const right = q.options.find(o => o.key === computed);
      L.push(`- 標準答案：**${right ? right.text : computed}**（chess.js 計算結果：\`${computed}\`，與題庫${computed === q.answer ? "一致" : "不一致 ⚠️"}）`);
    } else {
      L.push(`- 標準答案：**${sansOf(pos.fen(), q.answer)}**（uci：${q.answer.join("、")}；chess.js 計算結果：${computed.join("、")}，與題庫${JSON.stringify(computed) === JSON.stringify(q.answer) ? "一致" : "不一致 ⚠️"}）`);
    }
    L.push(`- 驗證方法：\`${JSON.stringify(q.verify)}\``);
    L.push(`- 解釋：${q.explain}`, "");
  }
}

L.push("## 二、一步將死（40 題）", "", "白方走棋；接受所有能將死的走法（已列出全部）。", "",
  "| 編號 | 級 | 將死棋子 | FEN | 全部將死的走法 |", "|---|---|---|---|---|");
for (const p of MATE1) L.push(`| ${p.id} | ${p.level} | ${p.piece.toUpperCase()} | \`${p.fen}\` | ${esc(sansOf(p.fen, p.mates))} |`);
L.push("");

L.push("## 三、找出將軍（20 題）", "", "列出該局面全部能將軍的走法（走棋一方見「走棋」欄）。", "",
  "| 編號 | 走棋 | FEN | 將軍數 | 全部將軍的走法 |", "|---|---|---|---|---|");
for (const p of CHECKFIND) L.push(`| ${p.id} | ${p.turn === "w" ? "白" : "黑"} | \`${p.fen}\` | ${p.checks.length} | ${esc(sansOf(p.fen, p.checks))} |`);
L.push("");

L.push("## 四、騎士迷宮（15 關）", "", "白馬（N）、黑棋用小寫字母（r 車、b 象、q 后、n 馬、p 兵）；星的位置另列。最少步數由 BFS 計出，並附一條最短路徑。", "",
  "| 關 | 起點 | 星 | 黑棋 | 最少步數 | 最短路徑 |", "|---|---|---|---|---|---|");
MAZE.forEach((lv, i) => {
  const sol = KM.solve(lv);
  L.push(`| ${i + 1} | ${lv.knight} | ${lv.stars.join("、")} | ${lv.black.map(b => b.t + b.sq).join("、")} | ${lv.par} | ${sol.path.join("→")} |`);
});
L.push("");

fs.writeFileSync(path.join(ROOT, "docs/stage1-content.md"), L.join("\n") + "\n");
console.log("已寫入 docs/stage1-content.md（" + L.length + " 行）");
