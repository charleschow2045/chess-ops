/*
 * 第 3 階段：量度電腦出棋時間、提示時間、一局 40 步嘅賽後檢討總時間（真瀏覽器、真 Stockfish 19）。
 * 用法：node tools/serve.js 8123；NODE_PATH=…/playwright-core 所在 node_modules node tools/measure3.js
 * 結果印出並寫入 docs/stage3-timing.json。注意：呢啲係桌面電腦嘅數字；iPad 要用同一頁（play.html）自己再量。
 */
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright-core");
const BASE = process.env.BASE || "http://localhost:8123/";

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER === "chrome" ? "chrome" : "msedge" });
  const page = await (await browser.newContext({ viewport: { width: 820, height: 1180 } })).newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  await page.goto(BASE + "play.html"); await page.waitForTimeout(800);
  const result = await page.evaluate(async () => {
    const { Chess } = await import("/vendor/chess.js/chess.esm.js");
    const CO = window.ChessOps, CFG = CO.Config, RV = CO.ReviewLogic;
    const mgr = new CO.EngineManager("vendor/stockfish/stockfish-19-lite-single.js", () => {});
    const out = { cores: navigator.hardwareConcurrency, ua: navigator.userAgent.slice(0, 80), config: { PICKMOVE: CFG.PICKMOVE, HINT: CFG.HINT, REVIEW: CFG.REVIEW, THINK_PAUSE: CFG.THINK_PAUSE } };
    const t0 = performance.now(); await mgr.ensure(); out.loadMs = Math.round(performance.now() - t0);
    const POS = {
      "開局": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      "中局 A": "r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7",
      "中局 B": "r2q1rk1/pp2bppp/2n1pn2/2pp4/3P4/2PBPN2/PP1N1PPP/R1BQ1RK1 w - - 0 9",
      "殘局": "8/5pk1/6p1/8/3R4/6P1/5PK1/8 w - - 0 1"
    };
    const stats = a => ({ min: Math.round(Math.min(...a)), avg: Math.round(a.reduce((x, y) => x + y, 0) / a.length), max: Math.round(Math.max(...a)) });
    // 1. 各級電腦出棋時間（唔包停頓；每個局面 6 次）
    out.levels = {};
    for (let level = 1; level <= 8; level++) {
      const times = [], src = {};
      for (const fen of Object.values(POS)) for (let i = 0; i < 6; i++) {
        const g = new Chess(fen), s = performance.now();
        const r = await CO.PickMove.pickMove(level, g, { Chess, engine: mgr });
        times.push(performance.now() - s); src[r.source] = (src[r.source] || 0) + 1;
      }
      out.levels[level] = Object.assign(stats(times), { n: times.length, sources: src });
    }
    // 2. 提示時間
    const ht = [];
    for (const fen of Object.values(POS)) for (let i = 0; i < 3; i++) { const s = performance.now(); await mgr.run(fen, CFG.HINT); ht.push(performance.now() - s); }
    out.hint = Object.assign(stats(ht), { n: ht.length });
    // 3. 一局約 40 步嘅賽後檢討：用第 4 級自己對自己落出一局（>= 70 個半步），再逐步分析玩家（白方）每一步
    let ucis = [];
    for (let attempt = 0; attempt < 6 && ucis.length < 70; attempt++) {
      const g = new Chess(); ucis = [];
      while (!g.isGameOver() && ucis.length < 80) {
        const r = await CO.PickMove.pickMove(4, g, { Chess, engine: mgr });
        const m = g.move({ from: r.move.from, to: r.move.to, promotion: r.move.promotion });
        ucis.push(m.from + m.to + (m.promotion || ""));
      }
    }
    out.review = { plies: ucis.length };
    let calls = 0;
    const analyze = async fen => { calls++; const r = await mgr.run(fen, { movetime: CFG.REVIEW.maxMsPerMove, depth: CFG.REVIEW.maxDepth }); return { cp: r.info.cp, mate: r.info.mate, best: r.uci }; };
    const s0 = performance.now();
    const res = await RV.reviewGame(Chess, ucis, "w", analyze, {});
    out.review.totalMs = Math.round(performance.now() - s0);
    out.review.playerMoves = res.moves.length; out.review.analyses = calls;
    out.review.avgMsPerAnalysis = Math.round(out.review.totalMs / Math.max(1, calls));
    out.review.summary = res.summary.text;
    return out;
  });
  await browser.close();
  fs.writeFileSync(path.resolve(__dirname, "../docs/stage3-timing.json"), JSON.stringify(result, null, 1) + "\n");
  console.log(JSON.stringify({ loadMs: result.loadMs, levels: Object.fromEntries(Object.entries(result.levels).map(([k, v]) => [k, v.min + "/" + v.avg + "/" + v.max])), hint: result.hint, review: result.review }, null, 1));
  if (errs.length) { console.log("頁面錯誤：" + errs.join("；")); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
