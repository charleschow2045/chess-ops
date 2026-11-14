/*
 * 驗證開局訓練資料並產生 data/openings.js（需要 Playwright + 本機伺服器 + 真 Stockfish 19）。
 *   node tools/serve.js 8123；NODE_PATH=…/playwright-core 所在 node_modules node tools/verify-openings.js
 * 驗證：
 *   1. 每條路線每一步都用 chess.js 驗證合法。
 *   2. 學習者一方每一步用 Stockfish（depth 14）計勝率跌幅（Lichess 勝率，js/review-logic.js），要 < 0.1（唔係疑問手或更差）；
 *      唔合格嘅步連同之後嘅步一併刪走（路線截短），並記錄喺結果。
 *   3. 原則小測：3 個選項之中，正確答案要係 Stockfish 評價最好，而且比次好嘅勝率高至少 0.05；唔合格就換下一條候選題，揀滿 10 題。
 * 輸出：data/openings.js、docs/stage4-openings-verify.json（原始驗證數字，供報告同 stage4-content.md 使用）。
 */
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright-core");
const ROOT = path.resolve(__dirname, "..");
const { Chess } = require(path.join(ROOT, "vendor/chess.js/chess.cjs"));
const SRC = require("./openings-source.js");
const BASE = process.env.BASE || "http://localhost:8123/";
const DEPTH = 14;
const MAX_DROP = 0.1, MIN_MARGIN = 0.05, QUIZ_N = 10;

const uciOf = m => m.from + m.to + (m.promotion || "");
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function legalLine(sans) {
  const g = new Chess(), ucis = [];
  for (const s of sans) { const m = g.move(s); ucis.push(uciOf(m)); }
  return { ucis, fen: g.fen() };
}

(async () => {
  // 1. 合法性（Node 端）
  const routeIn = SRC.ROUTES.map(r => {
    if (r.notes.length !== r.moves.length) throw new Error(r.id + " 解釋數目同步數不一致");
    return Object.assign({}, r, legalLine(r.moves));
  });
  const quizIn = SRC.QUIZ_CANDIDATES.map((c, i) => {
    const g = new Chess(); c.prefix.forEach(s => g.move(s));
    const opts = c.options.map(s => { const g2 = new Chess(g.fen()); const m = g2.move(s); return { san: m.san, uci: uciOf(m), fenAfter: g2.fen() }; });
    return { n: i, fen: g.fen(), turn: g.turn(), prefix: c.prefix, options: opts, explain: c.explain };
  });

  // 2. 引擎驗證（瀏覽器端）
  const browser = await chromium.launch({ channel: process.env.BROWSER === "chrome" ? "chrome" : "msedge" });
  const page = await (await browser.newContext({ viewport: { width: 820, height: 1180 } })).newPage();
  await page.goto(BASE + "play.html"); await page.waitForTimeout(800);
  const res = await page.evaluate(async ({ routeIn, quizIn, DEPTH }) => {
    const { Chess } = await import("/vendor/chess.js/chess.esm.js");
    const CO = window.ChessOps, RV = CO.ReviewLogic;
    const mgr = new CO.EngineManager("vendor/stockfish/stockfish-19-lite-single.js", () => {});
    await mgr.ensure();
    const analyze = async fen => { const r = await mgr.run(fen, { depth: DEPTH }, 60000); return { cp: r.info.cp, mate: r.info.mate, best: r.uci }; };
    const out = { routes: [], quiz: [] };
    for (const r of routeIn) {
      const rv = await RV.reviewGame(Chess, r.ucis, r.side, analyze, {});
      out.routes.push({ id: r.id, moves: rv.moves.map(m => ({ ply: m.ply, san: m.san, drop: m.drop, cls: m.cls, bestSan: m.bestSan, evalBefore: m.evalBefore, evalAfter: m.evalAfter })) });
    }
    for (const q of quizIn) {
      const evals = [];
      for (const o of q.options) {
        const a = await analyze(o.fenAfter);
        const cpOpp = RV.scoreToCp({ cp: a.cp, mate: a.mate });          // 輪到對手，對手角度
        const cp = -cpOpp;                                                // 走棋方（玩家）角度
        evals.push({ san: o.san, cp, wc: RV.winChance(cp) });
      }
      out.quiz.push({ n: q.n, evals });
    }
    return out;
  }, { routeIn, quizIn, DEPTH });
  await browser.close();

  // 3. 整理結果
  const routes = [], routeReport = [];
  for (const r of routeIn) {
    const rr = res.routes.find(x => x.id === r.id);
    const failing = rr.moves.find(m => m.drop >= MAX_DROP);
    const keep = failing ? failing.ply - 1 : r.moves.length;       // 保留到失敗嗰步之前
    const removed = failing ? r.moves.slice(failing.ply - 1) : [];
    routes.push({ id: r.id, side: r.side, title: r.title, desc: r.desc, moves: r.moves.slice(0, keep), notes: r.notes.slice(0, keep),
      verify: { depth: DEPTH, maxDrop: Math.max(0, ...rr.moves.filter(m => !failing || m.ply < failing.ply).map(m => m.drop)), moves: rr.moves.filter(m => !failing || m.ply < failing.ply).map(m => ({ ply: m.ply, san: m.san, drop: Math.round(m.drop * 1000) / 1000, best: m.bestSan })) } });
    routeReport.push({ id: r.id, original: r.moves.join(" "), kept: r.moves.slice(0, keep).join(" "), removed: removed, failing: failing || null, drops: rr.moves.map(m => ({ ply: m.ply, san: m.san, drop: Math.round(m.drop * 1000) / 1000, best: m.bestSan })) });
  }
  const quizAll = quizIn.map(q => {
    const ev = res.quiz.find(x => x.n === q.n).evals;
    const sorted = ev.slice().sort((a, b) => b.wc - a.wc);
    const correct = ev[0];                                              // options[0] = 符合原則嘅答案
    const second = sorted.find(e => e !== correct);
    const margin = correct.wc - second.wc;
    const pass = sorted[0] === correct && margin >= MIN_MARGIN;
    return { n: q.n, prefix: q.prefix, evals: ev.map(e => ({ san: e.san, cp: e.cp, wc: Math.round(e.wc * 1000) / 1000 })), margin: Math.round(margin * 1000) / 1000, pass };
  });
  const rng = mulberry32(20261116);
  const chosen = [];
  for (const q of quizAll) {
    if (!q.pass || chosen.length >= QUIZ_N) continue;
    const src = quizIn[q.n];
    const opts = src.options.map((o, i) => ({ san: o.san, uci: o.uci, cp: q.evals[i].cp, wc: q.evals[i].wc }));
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    chosen.push({ id: "oq-" + String(chosen.length + 1).padStart(2, "0"), fen: src.fen, turn: src.turn, prefix: src.prefix, options: opts, answer: src.options[0].uci, explain: src.explain, margin: q.margin });
  }
  if (chosen.length < QUIZ_N) throw new Error("合格嘅小測題只有 " + chosen.length + " 題，要加候選題");

  fs.writeFileSync(path.join(ROOT, "data/openings.js"),
`/* 開局訓練資料：路線（每步一句解釋）同 10 題開局原則小測。由 tools/verify-openings.js 產生，請不要手改。
 * 學習者一方每一步已用 Stockfish 19（depth ${DEPTH}）驗證：勝率跌幅 < ${MAX_DROP}；小測正確答案比次好選項勝率高至少 ${MIN_MARGIN}。 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.Openings = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  return {
    ROUTES: ${JSON.stringify(routes, null, 1).replace(/\n\s*/g, " ")},
    QUIZ: ${JSON.stringify(chosen, null, 1).replace(/\n\s*/g, " ")}
  };
});
`);
  fs.writeFileSync(path.join(ROOT, "docs/stage4-openings-verify.json"), JSON.stringify({ depth: DEPTH, maxDrop: MAX_DROP, minMargin: MIN_MARGIN, routes: routeReport, quizAll }, null, 1) + "\n");
  console.log("路線：" + routes.map(r => r.id + " " + (r.moves.length) + "/" + routeIn.find(x => x.id === r.id).moves.length + " 步，最大跌幅 " + r.verify.maxDrop.toFixed(3)).join("；"));
  console.log("小測候選 " + quizAll.length + " 題，合格 " + quizAll.filter(q => q.pass).length + "，選用 " + chosen.length);
  quizAll.filter(q => !q.pass).forEach(q => console.log("  不合格：" + q.prefix.join(" ") + " → " + q.evals.map(e => e.san + " " + e.wc).join(" / ") + "（差 " + q.margin + "）"));
  routeReport.filter(r => r.failing).forEach(r => console.log("  路線被截短：" + r.id + "，不合格步 " + r.failing.san + "（跌幅 " + r.failing.drop + "，較好：" + r.failing.bestSan + "）"));
})().catch(e => { console.error(e); process.exit(1); });
