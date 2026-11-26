/*
 * 殘局訓練第 1 步（Node，只需要網絡，唔使瀏覽器）：
 *   1. 殺王課題（后、車、雙車）：用固定種子隨機產生局面（白先走），逐個去 Lichess 殘局庫（tablebase.lichess.ovh）查「將死步數 N」，
 *      每個目標 N 儲起最多 6 個候選局面。條件：局面合法；黑王冇被將軍；黑方有棋可走（冇一開始就逼和）；冇白子一開始就可以被黑王白吃。
 *   2. 王兵對王：逐個檢查 tools/endgames-source.js 嘅預期結果（win／draw）係咪同殘局庫一致。
 * 輸出：docs/stage5-endgames-tb.json（供 tools/build-endgames.js 同報告使用）。
 * 用法：node tools/endgames-tb.js [explore]     （explore＝只印各課題嘅 N 分佈，唔寫檔）
 * 殘局庫查詢結果會暫存到系統暫存資料夾，重跑唔使再查。
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const { Chess } = require(path.join(ROOT, "vendor/chess.js/chess.cjs"));
const { TOPICS } = require("./endgames-source.js");

const CACHE = path.join(os.tmpdir(), "chessops-endgames-tb-cache.json");
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
const saveCache = () => fs.writeFileSync(CACHE, JSON.stringify(cache));
const delay = ms => new Promise(r => setTimeout(r, ms));

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rng = mulberry32(20261117);
const sqName = i => "abcdefgh"[i % 8] + (Math.floor(i / 8) + 1);

async function tb(fen) {
  if (cache[fen]) return cache[fen];
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const r = await fetch("https://tablebase.lichess.ovh/standard?fen=" + encodeURIComponent(fen), { headers: { "User-Agent": "chess-ops-stage5-research" } });
      if (r.status === 429) { await delay(3000 * (attempt + 1)); continue; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      const out = { category: j.category, dtz: j.dtz, dtm: j.dtm };
      cache[fen] = out;
      return out;
    } catch (e) { if (attempt === 5) throw e; await delay(1500); }
  }
}

/* 局面條件（白先走）：合法、黑王冇被將軍、黑方有棋可走、冇白子（唔係王）一開始就會被黑王白吃 */
function startOK(fen) {
  let g;
  try { g = new Chess(fen); } catch (e) { return false; }
  const bk = [].concat(...g.board()).find(p => p && p.type === "k" && p.color === "b");
  if (g.isAttacked(bk.square, "w")) return false;                       // 黑王被將軍而白先走 = 不合法
  const gb = new Chess(fen.replace(" w ", " b "));
  if (gb.moves().length === 0) return false;                            // 一開始黑方已經冇棋走
  for (const m of gb.moves({ verbose: true })) {
    if (m.captured && m.piece === "k") {
      const g2 = new Chess(fen.replace(" w ", " b ")); g2.move(m);
      if (!g2.isAttacked(m.to, "w")) return false;                      // 黑王可以白吃白子（唔受保護）
    }
  }
  return true;
}

function randomPosition(pieces, edgeBias) {
  for (;;) {
    const used = new Set();
    const take = fn => { for (;;) { const i = fn(); if (!used.has(i)) { used.add(i); return i; } } };
    const any = () => Math.floor(rng() * 64);
    const edge = () => { const k = Math.floor(rng() * 28); const ring = []; for (let i = 0; i < 64; i++) { const f = i % 8, r = Math.floor(i / 8); if (f === 0 || f === 7 || r === 0 || r === 7) ring.push(i); } return ring[k % ring.length]; };
    const bk = take(edgeBias ? edge : any);
    const wk = take(any);
    const wf = Math.abs((wk % 8) - (bk % 8)), wr = Math.abs(Math.floor(wk / 8) - Math.floor(bk / 8));
    if (Math.max(wf, wr) < 2) continue;                                  // 王不能相鄰
    const placed = { [wk]: "K", [bk]: "k" };
    pieces.forEach(p => { placed[take(any)] = p.type.toUpperCase(); });
    let fen = "";
    for (let r = 7; r >= 0; r--) { let e = 0; for (let f = 0; f < 8; f++) { const c = placed[r * 8 + f]; if (!c) { e++; continue; } if (e) { fen += e; e = 0; } fen += c; } if (e) fen += e; if (r) fen += "/"; }
    fen += " w - - 0 1";
    if (startOK(fen)) return fen;
  }
}

(async () => {
  const explore = process.argv[2] === "explore";
  const report = { generated: new Date().toISOString().slice(0, 10), mate: {}, kpk: [] };
  const BUDGET = 700, KEEP = 6, BATCH = 8;
  for (const t of TOPICS.filter(x => x.task === "mate")) {
    const byN = {}, seen = new Set();
    let queried = 0;
    const needMore = () => t.targets.some(n => (byN[n] || []).length < KEEP);
    for (let i = 0; i < BUDGET && needMore(); i += BATCH) {
      const fens = [];
      for (let k = 0; k < BATCH; k++) { const fen = randomPosition(t.pieces, (i + k) % 2 === 0); if (!seen.has(fen)) { seen.add(fen); fens.push(fen); } }
      const rs = await Promise.all(fens.map(async (fen, k) => { await delay(k * 60); return tb(fen); }));   // 同時查詢 BATCH 個，錯開 60 毫秒
      rs.forEach((r, k) => {
        queried++;
        if (r.category !== "win" || r.dtm == null) return;
        const N = Math.ceil(r.dtm / 2);
        (byN[N] = byN[N] || []).push({ fen: fens[k], dtm: r.dtm, dtz: r.dtz, category: r.category });
      });
      saveCache();
    }
    saveCache();
    const hist = Object.keys(byN).map(Number).sort((a, b) => a - b).map(n => n + ":" + byN[n].length).join(" ");
    console.log(t.id + "：查詢 " + queried + " 個局面；N 分佈 " + hist);
    report.mate[t.id] = { queried, byN: Object.fromEntries(t.targets.map(n => [n, (byN[n] || []).slice(0, KEEP)])), distribution: Object.fromEntries(Object.keys(byN).map(n => [n, byN[n].length])) };
  }
  const kp = TOPICS.find(x => x.id === "kpk");
  for (const p of kp.positions) {
    const r = await tb(p.fen);
    const ok = startOK(p.fen);
    const mism = r.category !== p.expect;
    console.log("KPK " + p.fen + " 預期 " + p.expect + " 殘局庫 " + r.category + " dtz " + r.dtz + (ok ? "" : "（開局條件不合）") + (mism ? "  ⚠ 不一致" : ""));
    report.kpk.push({ fen: p.fen, expect: p.expect, category: r.category, dtz: r.dtz, dtm: r.dtm, startOK: ok });
  }
  saveCache();
  if (!explore) fs.writeFileSync(path.join(ROOT, "docs/stage5-endgames-tb.json"), JSON.stringify(report, null, 1) + "\n");
})().catch(e => { console.error(e); process.exit(1); });
