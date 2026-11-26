/*
 * 產生 docs/stage4-content.md：全部走棋前三問題目、開局路線（最終走法＋每步解釋＋引擎驗證）、原則小測，供逐題核對。
 * 用法：node tools/gen-stage4-content.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const THREE = require(path.join(ROOT, "data/three.js"));
const OPEN = require(path.join(ROOT, "data/openings.js"));
const verify = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/stage4-openings-verify.json"), "utf8"));
const esc = s => String(s).replace(/\|/g, "\\|");
const THEME = { hangingPiece: "送子", fork: "捉雙", pin: "牽制", mateIn1: "一步殺", mateThreat: "對方威脅將死" };
const ans = q => q.kind === "squares" ? "點出 " + q.squares.join("、") : q.kind === "mate" ? "選「將死」類選項" : "選「沒有」類選項";

const L = ["# 第 4 階段內容清單（供逐題核對）", "",
  "由 `node tools/gen-stage4-content.js` 自動產生。FEN 可以貼到 lichess.org/editor 核對；Lichess 連結格式 `https://lichess.org/training/<id>`。", ""];

L.push("## 一、走棋前三問（" + THREE.length + " 題；第 5 階段已修正「白吃」判斷並加入 10 題「對方威脅將死」，見 stage5-content.md）", "",
  "局面＝Lichess 謎題「對手第一步走完」之後（輪到玩家）；主題「對方威脅將死」嘅局面係謎題 FEN 本身（對手第一步之前）。三條問題的答案全部由程式用 chess.js 計出（見 `js/three-logic.js`）：",
  "- Q1「對方上一步想做甚麼？」：假如輪到對方走（交換走棋方 FEN，清走吃過路兵格；玩家被將軍的局面不用）：對方可以白吃嘅己方棋子／對方可以一步將死／沒有直接威脅。",
  "- Q2「我有沒有機會？」：玩家可以白吃嘅對方棋子／可以一步將死／沒有。",
  "- Q3「這一步安全嗎？」：3 個候選步（1 個會送子或被將死，2 個安全；候選步不含謎題答案）。",
  "- 「白吃」＝被吃子價值 −（吃完之後會被吃返 ? 自己嗰枚子價值 : 0）≥ 1（三問；賽後檢討用 ≥ 2），而且「吃返」要係合法嘅吃子步（王唔可以吃返有保護嘅子、被牽制嘅子唔可以吃返）；兵 1、馬象 3、車 5、后 9。", "",
  "| # | Lichess | 分數 | 主題 | 走棋方 | FEN | Q1 答案 | Q2 答案 | Q3 三個候選步（✅＝會送子／被將死） |", "|---|---|---|---|---|---|---|---|---|");
for (const q of THREE) {
  const side = q.fen.split(" ")[1] === "w" ? "白" : "黑";
  L.push(`| ${q.n} | [${q.id}](https://lichess.org/training/${q.id}) | ${q.rating} | ${THEME[q.theme]} | ${side} | \`${q.fen}\` | ${esc(ans(q.q1))} | ${esc(ans(q.q2))} | ${q.q3.options.map(o => o.san + (o.uci === q.q3.answer ? " ✅" : "")).join("、")} |`);
}
L.push("", "### 解釋文字（答完顯示）", "");
THREE.forEach(q => { L.push(`**${q.n}. ${q.id}**`, `- Q1：${q.q1.text}`, `- Q2：${q.q2.text}`, `- Q3：${q.q3.text}`, ""); });

L.push("## 二、開局路線（最終走法＋每步解釋＋引擎驗證）", "",
  `驗證方法：每一步用 chess.js 驗證合法；學習者一方每一步用 Stockfish 19（depth ${verify.depth}）計 Lichess 勝率跌幅，必須 < ${verify.maxDrop}。以下「跌幅」係該步嘅勝率跌幅（0 ＝ 引擎最佳步）。`, "");
const removed = verify.routes.filter(r => r.failing);
L.push(removed.length ? "**被刪走嘅步**：" + removed.map(r => `${r.id} 嘅 ${r.failing.san}`).join("；") : "**所有學習者步全部合格，冇步被刪走。**（路線同你指定嘅一樣，我只係喺三條路線後面加咗幾步正常出子：雙馬防禦、黑方 2…d6、對 2.Bc4。）", "");
for (const r of OPEN.ROUTES) {
  const v = verify.routes.find(x => x.id === r.id);
  L.push(`### ${r.title}（${r.side === "w" ? "學習者執白" : "學習者執黑"}，id：\`${r.id}\`）`, "", `${r.desc}`, "",
    `最終走法：${r.moves.map((s, i) => (i % 2 === 0 ? (i / 2 + 1) + "." : "") + s).join(" ")}`, "",
    "| 步 | 走法 | 誰走 | 解釋 | 引擎驗證 |", "|---|---|---|---|---|");
  r.moves.forEach((s, i) => {
    const white = i % 2 === 0, learner = (white ? "w" : "b") === r.side;
    const d = v.drops.find(x => x.ply === i + 1);
    L.push(`| ${i + 1} | ${white ? (i / 2 + 1) + "." : (i + 1) / 2 + "…"}${s} | ${learner ? "學習者" : "對方（自動）"} | ${esc(r.notes[i])} | ${learner && d ? "跌幅 " + d.drop + (d.best && d.best !== s ? "（引擎最佳：" + d.best + "）" : "（引擎最佳步）") : "—"} |`);
  });
  L.push("");
}

L.push("## 三、開局原則小測（10 題）", "",
  `驗證：3 個選項之中，正確答案要係 Stockfish（depth ${verify.depth}）評價最好，而且勝率比次好嘅高至少 ${verify.minMargin}。勝率＝Lichess 勝率（玩家角度，−1 至 1）；cp＝走完之後嘅引擎分數（玩家角度）。`, "",
  "| # | 局面 FEN（走棋方） | 選項（勝率／cp） | 正確答案 | 領先次好 | 解釋 |", "|---|---|---|---|---|---|");
OPEN.QUIZ.forEach((q, i) => {
  const ans2 = q.options.find(o => o.uci === q.answer);
  L.push(`| ${i + 1} | \`${q.fen}\`（${q.turn === "w" ? "白" : "黑"}） | ${q.options.map(o => `${o.san}（${o.wc}／${o.cp}）`).join("、")} | **${ans2.san}** | ${q.margin} | ${esc(q.explain)} |`);
});
const rejected = verify.quizAll.filter(q => !q.pass);
L.push("", `候選題共 ${verify.quizAll.length} 題，合格 ${verify.quizAll.filter(q => q.pass).length} 題，取頭 10 題。不合格（已換走）：`, "");
rejected.forEach(q => L.push(`- ${q.prefix.join(" ")} → ${q.evals.map(e => e.san + " " + e.wc).join("／")}（最好同次好相差 ${q.margin}，或者最好嘅唔係預期答案）`));
L.push("");
fs.writeFileSync(path.join(ROOT, "docs/stage4-content.md"), L.join("\n") + "\n");
console.log("已寫入 docs/stage4-content.md（" + L.length + " 行）");
