/*
 * 檢討改良對比：用 3 局示範對局（電腦級別對電腦級別，真 Stockfish 19 depth 12 分析），
 * 比較「舊方法（centipawn 損失 300／150／80）」同「新方法（Lichess 勝率跌幅 0.3／0.2／0.1）」各標咗幾多大錯、錯著、疑問手。
 * 用法：node tools/serve.js 8123；NODE_PATH=…/playwright-core 所在 node_modules node tools/compare-review.js
 * 輸出：docs/stage4-review-compare.json（原始分數＋兩種分類結果）。
 */
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright-core");
const BASE = process.env.BASE || "http://localhost:8123/";
const GAMES = [{ name: "示範局 1（第 3 級 對 第 3 級）", w: 3, b: 3 }, { name: "示範局 2（第 2 級 對 第 5 級）", w: 2, b: 5 }, { name: "示範局 3（第 4 級 對 第 4 級）", w: 4, b: 4 }];
const OLD = { blunder: 300, mistake: 150, inaccuracy: 80 };       // 舊：centipawn 損失門檻
const NEW = { blunder: 0.3, mistake: 0.2, inaccuracy: 0.1 };      // 新：勝率跌幅門檻

function cls(v, T) { return v >= T.blunder ? "blunder" : v >= T.mistake ? "mistake" : v >= T.inaccuracy ? "inaccuracy" : null; }

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER === "chrome" ? "chrome" : "msedge" });
  const page = await (await browser.newContext({ viewport: { width: 820, height: 1180 } })).newPage();
  await page.goto(BASE + "play.html"); await page.waitForTimeout(800);
  const raw = await page.evaluate(async GAMES => {
    const { Chess } = await import("/vendor/chess.js/chess.esm.js");
    const CO = window.ChessOps, RV = CO.ReviewLogic;
    const mgr = new CO.EngineManager("vendor/stockfish/stockfish-19-lite-single.js", () => {});
    await mgr.ensure();
    const analyze = async fen => { const r = await mgr.run(fen, { depth: 12 }, 60000); return { cp: r.info.cp, mate: r.info.mate, best: r.uci }; };
    const out = [];
    for (const G of GAMES) {
      const g = new Chess(), ucis = [];
      while (!g.isGameOver() && ucis.length < 90) {
        const level = g.turn() === "w" ? G.w : G.b;
        const r = await CO.PickMove.pickMove(level, g, { Chess, engine: mgr });
        const m = g.move({ from: r.move.from, to: r.move.to, promotion: r.move.promotion });
        ucis.push(m.from + m.to + (m.promotion || ""));
      }
      const perSide = {};
      for (const side of ["w", "b"]) {
        const rv = await RV.reviewGame(Chess, ucis, side, analyze, {});
        perSide[side] = rv.moves.map(m => ({ ply: m.ply, san: m.san, lossCp: m.lossCp, drop: m.drop, evalBefore: m.evalBefore, evalAfter: m.evalAfter, cls: m.cls, reason: m.reason }));
      }
      out.push({ name: G.name, plies: ucis.length, result: g.isCheckmate() ? (g.turn() === "w" ? "黑勝（將死）" : "白勝（將死）") : g.isGameOver() ? "和棋" : "未完（90 個半步）", w: perSide.w, b: perSide.b });
    }
    return out;
  }, GAMES);
  await browser.close();

  const report = raw.map(g => {
    const moves = g.w.concat(g.b);
    const count = f => { const c = { blunder: 0, mistake: 0, inaccuracy: 0 }; moves.forEach(m => { const k = f(m); if (k) c[k]++; }); return c; };
    const old = count(m => cls(m.lossCp, OLD)), neu = count(m => cls(m.drop, NEW));
    const diff = moves.filter(m => cls(m.lossCp, OLD) !== cls(m.drop, NEW)).sort((a, b) => a.ply - b.ply)
      .map(m => ({ ply: m.ply, san: m.san, evalBefore: m.evalBefore, evalAfter: m.evalAfter, lossCp: m.lossCp, drop: Math.round(m.drop * 1000) / 1000, old: cls(m.lossCp, OLD), new: cls(m.drop, NEW) }));
    return { name: g.name, plies: g.plies, result: g.result, playerMoves: moves.length, old, new: neu, differences: diff.slice(0, 12), differenceCount: diff.length, reasons: moves.filter(m => m.reason).reduce((a, m) => { a[m.reason] = (a[m.reason] || 0) + 1; return a; }, {}) };
  });
  fs.writeFileSync(path.resolve(__dirname, "../docs/stage4-review-compare.json"), JSON.stringify({ oldThresholdsCp: OLD, newThresholdsWinDrop: NEW, games: report }, null, 1) + "\n");
  report.forEach(r => console.log(r.name + "｜" + r.plies + " 個半步｜" + r.result + "｜舊 大錯 " + r.old.blunder + " 錯著 " + r.old.mistake + " 疑問手 " + r.old.inaccuracy + "｜新 大錯 " + r.new.blunder + " 錯著 " + r.new.mistake + " 疑問手 " + r.new.inaccuracy + "｜分類不同 " + r.differenceCount + " 步｜原因 " + JSON.stringify(r.reasons)));
})().catch(e => { console.error(e); process.exit(1); });
