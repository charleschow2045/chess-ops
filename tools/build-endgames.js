/*
 * 殘局訓練第 2 步：用真 Stockfish 19 驗證局面並產生 data/endgames.js（需要 Playwright + 本機伺服器）。
 *   先跑 node tools/endgames-tb.js（殘局庫篩選，產生 docs/stage5-endgames-tb.json）
 *   node tools/serve.js 8123；NODE_PATH=…/playwright-core 所在 node_modules node tools/build-endgames.js
 * 驗證：
 *   殺王課題：每個目標步數 N，由殘局庫候選局面逐個試：
 *     1. Stockfish（depth 30，或者 5 秒，先到先停）要算出「白方 N 步將死」（mate N，同殘局庫一致）；
 *     2. 自我對弈：白方用「提示」設定、黑方用「防守」設定（config.ENDGAME，同 App 實際一樣），要喺步數上限（N × 2 + 5，最多 50）內將死——
 *        證明用提示一路跟住走，一定做得到。
 *     兩項都合格先用；唔合格就換下一個候選。
 *   王兵對王：
 *     「贏」課題（promote）：Stockfish 分數要 >= WIN_CP（或將死分數）；自我對弈要升變成功，而且升變後 Stockfish 仍然判斷白方贏；
 *        shortest = 自我對弈白方升變用咗幾多步（引擎自我對弈步數，唔係嚴格最短），cap = shortest × 2 + 5（最多 50）。
 *     「判斷」課題（judge）：預期 win → Stockfish 分數 >= WIN_CP；預期 draw → 分數絕對值 <= 50。
 *   殘局庫同 Stockfish 結果一致先收；唔一致嘅局面唔用，並記錄喺報告。
 * 輸出：data/endgames.js、docs/stage5-endgames-verify.json
 */
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright-core");
const ROOT = path.resolve(__dirname, "..");
const { TOPICS } = require("./endgames-source.js");
const TBR = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/stage5-endgames-tb.json"), "utf8"));
const BASE = process.env.BASE || "http://localhost:8123/";
const SF_DEPTH = 30, SF_MS = 5000;

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER === "chrome" ? "chrome" : "msedge" });
  const page = await (await browser.newContext({ viewport: { width: 820, height: 1180 } })).newPage();
  await page.goto(BASE + "play.html"); await page.waitForTimeout(800);
  await page.addScriptTag({ path: path.join(ROOT, "js/endgames-logic.js") });

  // 候選：殺王課題 → 每個目標 N 一批；王兵對王 → 來源清單
  const jobs = [];
  TOPICS.forEach(t => {
    if (t.task === "mate") {
      const occ = {};
      t.targets.forEach(N => {
        // 同一個 N 出現多次：第 k 次用候選清單嘅第 3k 至 3k+2 個，確保唔會用同一個局面；只出現一次就用頭 6 個
        const k = occ[N] = (occ[N] === undefined ? 0 : occ[N] + 1);
        const dup = t.targets.filter(x => x === N).length > 1;
        const cands = ((TBR.mate[t.id].byN[N]) || []).slice(dup ? k * 3 : 0, dup ? k * 3 + 3 : 6);
        jobs.push({ topic: t.id, kind: "mate", N, cands });
      });
    } else t.positions.forEach((p, i) => jobs.push({ topic: t.id, kind: "kpk", pos: p, tb: TBR.kpk[i] }));
  });

  const res = await page.evaluate(async ({ jobs, SF_DEPTH, SF_MS }) => {
    const { Chess } = await import("/vendor/chess.js/chess.esm.js");
    const CO = window.ChessOps, EL = CO.EndgamesLogic, CFG = CO.Config.ENDGAME;
    const mgr = new CO.EngineManager("vendor/stockfish/stockfish-19-lite-single.js", () => {});
    await mgr.ensure();
    const sf = async fen => { const r = await mgr.run(fen, { depth: SF_DEPTH, movetime: SF_MS }, 60000); return { uci: r.uci, cp: r.info.cp, mate: r.info.mate, depth: r.info.depth, ms: Math.round(r.info.ms) }; };
    const whiteScore = (info, turn) => ({ cp: info.cp === null ? null : (turn === "w" ? info.cp : -info.cp), mate: info.mate === null ? null : (turn === "w" ? info.mate : -info.mate) });

    // 自我對弈：白方用提示設定、黑方用防守設定，直到成功／失敗／60 步
    async function selfPlay(fen, task, cap) {
      const g = new Chess(fen), start = EL.whiteMaterial(g);
      let moves = 0;
      for (let ply = 0; ply < 130; ply++) {
        const white = g.turn() === "w";
        const r = await mgr.run(g.fen(), white ? CFG.HINT : CFG.DEFENDER, 60000);
        const m = g.move({ from: r.uci.slice(0, 2), to: r.uci.slice(2, 4), promotion: r.uci[4] });
        if (white) moves++;
        const j = EL.judge(g, { task, moves, cap, startMaterial: start, sideJustMoved: m.color, promoted: !!m.promotion });
        if (j.status === "success") return { ok: true, moves };
        if (j.status === "fail") return { ok: false, moves, why: j.reason, text: j.text };
        if (j.status === "promoted") {
          const a = await mgr.run(g.fen(), { depth: CFG.DEFENDER.depth }, 60000);
          const v = EL.promotionVerdict(g, a.info);
          return { ok: v.win, moves, why: v.win ? "" : "promotion", text: v.text || "", promotionEval: { cp: a.info.cp, mate: a.info.mate } };
        }
      }
      return { ok: false, moves, why: "noend" };
    }

    const out = [];
    for (const job of jobs) {
      if (job.kind === "mate") {
        const tried = [];
        let chosen = null;
        const cap = EL.moveCap(job.N);
        for (const c of job.cands) {
          if (job.skip && job.skip.includes(c.fen)) continue;
          const a = await sf(c.fen);
          const sfN = a.mate;                                   // 白先走：mate > 0 = 白方 mate in N
          const rec = { fen: c.fen, tb: { dtm: c.dtm, dtz: c.dtz }, sf: { mate: a.mate, cp: a.cp, depth: a.depth, ms: a.ms } };
          if (sfN !== job.N) { rec.rejected = "Stockfish mate " + sfN + " ≠ 殘局庫 " + job.N; tried.push(rec); continue; }
          const sp = await selfPlay(c.fen, "mate", cap);
          rec.selfPlay = { ok: sp.ok, moves: sp.moves, why: sp.why || "" };
          if (!sp.ok) { rec.rejected = "自我對弈未能喺上限 " + cap + " 步內將死（" + (sp.why || "") + "）"; tried.push(rec); continue; }
          tried.push(rec); chosen = rec; break;
        }
        out.push({ topic: job.topic, kind: "mate", N: job.N, cap, chosen, tried });
      } else {
        const p = job.pos, rec = { fen: p.fen, task: p.task, expect: p.expect, tb: job.tb };
        const a = await sf(p.fen);
        const w = whiteScore(a, "w");
        rec.sf = { cp: w.cp, mate: w.mate, depth: a.depth, ms: a.ms };
        const winSF = w.mate !== null ? w.mate > 0 : w.cp >= CFG.WIN_CP;
        const drawSF = w.mate === null && Math.abs(w.cp) <= 50;
        const sfLabel = winSF ? "win" : drawSF ? "draw" : "unclear";
        rec.sfLabel = sfLabel;
        rec.consistent = sfLabel === p.expect && job.tb.category === p.expect && job.tb.startOK;
        if (rec.consistent && p.task === "promote") {
          const sp = await selfPlay(p.fen, "promote", 50);
          rec.selfPlay = { ok: sp.ok, moves: sp.moves, why: sp.why || "", promotionEval: sp.promotionEval || null };
          if (!sp.ok) rec.consistent = false;
          else { rec.shortest = sp.moves; rec.cap = EL.moveCap(sp.moves); }
        }
        out.push({ topic: job.topic, kind: "kpk", rec });
      }
    }
    return out;
  }, { jobs: jobs.map(j => Object.assign({}, j, { cands: j.cands && j.cands.slice(0, 6) })), SF_DEPTH, SF_MS });
  await browser.close();

  // 整理
  const report = { sfDepth: SF_DEPTH, sfMs: SF_MS, mate: [], kpk: [] };
  const topicsOut = [];
  for (const t of TOPICS) {
    const positions = [];
    if (t.task === "mate") {
      const usedFens = new Set();
      res.filter(r => r.topic === t.id).forEach(r => {
        report.mate.push({ topic: t.id, N: r.N, cap: r.cap, chosen: r.chosen && r.chosen.fen, tried: r.tried });
        if (!r.chosen) { console.warn("⚠ " + t.id + " N=" + r.N + " 冇合格候選"); return; }
        if (usedFens.has(r.chosen.fen)) { console.warn("⚠ " + t.id + " N=" + r.N + " 同之前重複"); return; }
        usedFens.add(r.chosen.fen);
        positions.push({ fen: r.chosen.fen, task: "mate", expect: "mate", shortest: r.N, cap: r.cap, tb: { category: "win", dtm: r.chosen.tb.dtm, dtz: r.chosen.tb.dtz }, sf: r.chosen.sf, selfPlayMoves: r.chosen.selfPlay.moves });
      });
    } else {
      res.filter(r => r.topic === t.id).forEach(r => {
        const x = r.rec; report.kpk.push(x);
        if (!x.consistent) { console.warn("⚠ KPK 不合格（唔用）：" + x.fen + " 預期 " + x.expect + "，Stockfish " + x.sfLabel + "，殘局庫 " + x.tb.category); return; }
        const src = t.positions.find(p => p.fen === x.fen);
        const o = { fen: x.fen, task: x.task, expect: x.expect, tb: { category: x.tb.category, dtz: x.tb.dtz, dtm: x.tb.dtm }, sf: x.sf };
        if (x.task === "promote") { o.shortest = x.shortest; o.cap = x.cap; o.tip = src.tip; o.selfPlayMoves = x.selfPlay.moves; }
        else o.explain = src.explain;
        positions.push(o);
      });
    }
    if (positions.length < 6) throw new Error(t.id + " 合格局面只有 " + positions.length + " 題（要 6–8 題）");
    positions.forEach((p, i) => { p.id = t.id + "-" + (i + 1); });
    topicsOut.push({ id: t.id, title: t.title, sub: t.sub, task: t.task, steps: t.steps, positions });
  }
  fs.writeFileSync(path.join(ROOT, "data/endgames.js"),
`/* 殘局訓練資料：4 個課題（后殺王、車殺王、雙車梯形殺、王兵對王）。由 tools/build-endgames.js 產生，請不要手改。
 * 每個局面已用 Lichess 殘局庫（tablebase.lichess.ovh）同 Stockfish 19（depth ${SF_DEPTH} 或 ${SF_MS / 1000} 秒）驗證；
 * 殺王課題 shortest = 將死步數（N），cap = N × 2 + 5（最多 50）；王兵對王「贏」課題 shortest = 引擎自我對弈升變步數。 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.Endgames = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  return {
    TOPICS: ${JSON.stringify(topicsOut, null, 1).replace(/\n\s*/g, " ")}
  };
});
`);
  fs.writeFileSync(path.join(ROOT, "docs/stage5-endgames-verify.json"), JSON.stringify(report, null, 1) + "\n");
  topicsOut.forEach(t => console.log(t.id + "：" + t.positions.length + " 題（" + t.positions.map(p => (p.task === "judge" ? "判斷 " + p.expect : "N=" + p.shortest + " 上限 " + p.cap)).join("、") + "）"));
})().catch(e => { console.error(e); process.exit(1); });
