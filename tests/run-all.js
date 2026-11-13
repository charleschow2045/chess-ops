/* 純邏輯測試：node tests/run-all.js（唔使安裝任何套件） */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const { Chess } = require(path.join(ROOT, "vendor/chess.js/chess.cjs"));
const POSITIONS = require(path.join(ROOT, "js/positions.js"));
const State = require(path.join(ROOT, "js/state.js"));
const PM = require(path.join(ROOT, "js/pickmove.js"));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function eq(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error((msg || "不相等") + "\n  實際：" + JSON.stringify(actual) + "\n  預期：" + JSON.stringify(expected));
}
function ok(cond, msg) { if (!cond) throw new Error(msg || "條件不成立"); }

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function perft(game, depth) {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of game.moves({ verbose: true })) {
    game.move({ from: m.from, to: m.to, promotion: m.promotion });
    n += perft(game, depth - 1);
    game.undo();
  }
  return n;
}
function isLegal(game, mv) {
  return !!mv && game.moves({ verbose: true }).some(m => m.from === mv.from && m.to === mv.to && (m.promotion || undefined) === (mv.promotion || undefined));
}
function walk(dir, exts, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.name === "node_modules" || f.name === ".git" || f.name === "vendor") continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, exts, out); else if (exts.includes(path.extname(f.name))) out.push(p);
  }
  return out;
}

/* 假引擎：回傳第一個合法步，並記錄收到嘅 search 參數 */
function fakeEngine(log) {
  return { bestMove(fen, search) { log && log.push(search); const g = new Chess(fen); const m = g.moves({ verbose: true })[0]; return Promise.resolve(m.from + m.to + (m.promotion || "")); } };
}

/* ---------- chess.js ---------- */
test("chess.js 可以載入，開局 20 個合法步", () => {
  const g = new Chess();
  eq(g.moves().length, 20);
});
test("chess.js perft：開局深度 3 = 8902；Kiwipete 深度 2 = 2039", () => {
  eq(perft(new Chess(), 3), 8902);
  eq(perft(new Chess("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1"), 2), 2039);
});
test("chess.js：升變、王車易位、吃過路兵、將死", () => {
  const promo = new Chess("8/P7/8/8/8/8/8/k6K w - - 0 1");
  eq(promo.moves().filter(m => m.startsWith("a8")).length, 4);
  const castle = new Chess("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  ok(castle.moves().includes("O-O") && castle.moves().includes("O-O-O"));
  const ep = new Chess("rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3");
  ok(ep.moves().includes("exf6"));
  const mate = new Chess(); ["f3", "e5", "g4", "Qh4#"].forEach(s => mate.move(s));
  ok(mate.isCheckmate());
});
test("共用局面 FEN 全部有效", () => {
  for (const [k, fen] of Object.entries(POSITIONS)) { try { new Chess(fen); } catch (e) { throw new Error(k + " 無效：" + e.message); } }
});
test("設計預覽用嘅謎題 puzzleFork：Nc7+ 係合法將軍", () => {
  const g = new Chess(POSITIONS.puzzleFork);
  const m = g.move("Nc7+");
  ok(m && m.san === "Nc7+");
});

/* ---------- pickMove ---------- */
const TEST_FENS = Object.values(POSITIONS).concat([
  "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", // 好多合法步
  "8/P7/8/8/8/8/8/k6K w - - 0 1",                                        // 升變
  "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"                                       // 只有一個合法步（Kg8? 實際係被困）
]);

test("pickMove：每個級別（1–8）、每個局面都回傳合法步（假引擎）", async () => {
  for (let level = 1; level <= 8; level++) {
    for (const fen of TEST_FENS) {
      for (let seed = 1; seed <= 12; seed++) {
        const game = new Chess(fen);
        if (game.isGameOver()) continue;
        const r = await PM.pickMove(level, game, { Chess, engine: fakeEngine(), rng: mulberry32(seed * 7919 + level) });
        ok(r && isLegal(game, r.move), `級別 ${level} 回傳非法步 ${JSON.stringify(r)} @ ${fen}`);
        eq(r.level, level);
      }
    }
  }
});
test("pickMove：冇引擎、引擎出錯、引擎回傳非法步，都會 fallback 為合法步", async () => {
  const game = new Chess(POSITIONS.middlegame);
  const bad = [
    undefined,
    { bestMove() { return Promise.reject(new Error("壞咗")); } },
    { bestMove() { return Promise.resolve("a1a1"); } },
    { bestMove() { return Promise.resolve(null); } },
    { bestMove() { throw new Error("同步出錯"); } }
  ];
  for (const engine of bad) for (const level of [4, 5, 6, 7, 8]) {
    const r = await PM.pickMove(level, game, { Chess, engine, rng: () => 0 });
    ok(r && isLegal(game, r.move), "fallback 失敗");
    eq(r.source, "fallback");
  }
});
test("pickMove：將死／和棋局面回傳 null", async () => {
  const mate = new Chess(); ["f3", "e5", "g4", "Qh4#"].forEach(s => mate.move(s));
  eq(await PM.pickMove(5, mate, { Chess, engine: fakeEngine() }), null);
});
test("pickMove：唔會改動傳入嘅 game", async () => {
  const game = new Chess(POSITIONS.middlegame); const before = game.fen();
  await PM.pickMove(2, game, { Chess, engine: fakeEngine(), rng: mulberry32(3) });
  await PM.pickMove(8, game, { Chess, engine: fakeEngine(), rng: mulberry32(3) });
  eq(game.fen(), before);
});
test("pickMove：第 1–3 級見到白食嘅子會食（rng 固定為 0）", async () => {
  for (const level of [1, 2, 3]) {
    const game = new Chess(POSITIONS.hangingPiece);
    const r = await PM.pickMove(level, game, { Chess, engine: fakeEngine(), rng: () => 0 });
    eq(r.source, "free-capture");
    eq(r.move.san, "Nxd4");
  }
});
test("pickMove：第 4 級起唔使「食免費子」規則", async () => {
  const game = new Chess(POSITIONS.hangingPiece);
  const r = await PM.pickMove(4, game, { Chess, engine: fakeEngine(), rng: () => 0 });
  eq(r.source, "engine-best");
});
test("pickMove：食嘅子會俾人食返而且唔抵，就唔當白食", async () => {
  // 白后 d1 食 d5 兵，但 d5 有黑后保護 → 不是白食
  const game = new Chess("4k3/8/8/3p4/8/8/8/3QK3 w - - 0 1");
  ok(PM.findFreeCaptures(game, Chess).length === 1, "d5 兵無人保護，應該算白食");
  const guarded = new Chess("3rk3/8/8/3p4/8/8/8/3QK3 w - - 0 1");
  eq(PM.findFreeCaptures(guarded, Chess).length, 0, "d5 兵有車保護，不應算白食");
});
test("pickMove：第 7 級用 Skill Level 0；第 8 級用 UCI_Elo 最低值", async () => {
  const log = [], game = new Chess(POSITIONS.start);
  await PM.pickMove(7, game, { Chess, engine: fakeEngine(log), rng: () => 0.5 });
  await PM.pickMove(8, game, { Chess, engine: fakeEngine(log), rng: () => 0.5 });
  eq(log[0].skill, 0);
  eq(log[1].elo, 1320);
});
test("pickMove：用 Stockfish 最佳步嘅比例大致符合 P_BEST（1–6 級，每級 1000 次）", async () => {
  const game = new Chess("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"); // 合法步少，跑得快
  for (let level = 1; level <= 6; level++) {
    let calls = 0; const rng = mulberry32(100 + level);
    const engine = { bestMove(fen) { calls++; const m = new Chess(fen).moves({ verbose: true })[0]; return Promise.resolve(m.from + m.to); } };
    for (let i = 0; i < 1000; i++) await PM.pickMove(level, game, { Chess, engine, rng });
    const ratio = calls / 1000;
    ok(Math.abs(ratio - PM.P_BEST[level]) < 0.05, `級別 ${level} 引擎比例 ${ratio} 同預設 ${PM.P_BEST[level]} 差太遠`);
  }
});
test("pickMove：級別越高，P_BEST 單調上升；食子機率單調上升", () => {
  for (let l = 2; l <= 6; l++) ok(PM.P_BEST[l] > PM.P_BEST[l - 1]);
  for (let l = 2; l <= 3; l++) ok(PM.P_TAKE_FREE[l] >= PM.P_TAKE_FREE[l - 1]);
});

/* ---------- normalizeState ---------- */
test("normalizeState：刪走白名單以外嘅欄位（包括巢狀欄位）", () => {
  const dirty = {
    version: 99, hacker: "x", __proto__: { evil: 1 },
    rank: { index: 2, xp: 120, extra: "垃圾" },
    streak: { count: 5, lastDay: "2026-11-13", junk: true },
    settings: { board: "custom", design: "B", flipped: true, sneaky: 1 },
    playLevel: 5,
    unknownTop: { a: 1 }
  };
  const out = State.normalizeState(dirty);
  eq(Object.keys(out).sort(), Object.keys(State.STATE_FIELDS).sort(), "頂層欄位要同白名單完全一樣");
  eq(out.rank, { index: 2, xp: 120 });
  eq(out.streak, { count: 5, lastDay: "2026-11-13" });
  eq(out.settings, { board: "custom", design: "B", flipped: true });
  eq(out.playLevel, 5);
  ok(!("hacker" in out) && !("unknownTop" in out) && !("evil" in out));
});
test("normalizeState：型別錯誤／缺欄位會補預設值或夾返範圍", () => {
  eq(State.normalizeState(null), State.defaultState());
  eq(State.normalizeState("字串"), State.defaultState());
  eq(State.normalizeState([1, 2]), State.defaultState());
  const out = State.normalizeState({ rank: { index: 99, xp: -5 }, streak: { count: "abc", lastDay: "昨天" }, settings: { board: "foo" }, playLevel: 100 });
  eq(out.rank, { index: 5, xp: 0 });
  eq(out.streak, { count: 0, lastDay: "" });
  eq(out.settings.board, "chessground");
  eq(out.playLevel, 8);
});
test("normalizeState：已經乾淨嘅狀態再 normalize 結果不變（冪等）", () => {
  const s = State.defaultState();
  eq(State.normalizeState(s), s);
  eq(State.normalizeState(State.normalizeState(s)), s);
});
test("備份：exportBackup → parseBackup 往返一致；壞檔案會拋錯", () => {
  const s = State.normalizeState({ rank: { index: 3, xp: 900 }, playLevel: 6 });
  eq(State.parseBackup(State.exportBackup(s)), s);
  let threw = false; try { State.parseBackup('{"x":1}'); } catch (e) { threw = true; }
  ok(threw);
});
test("localStorage key 一律以 chessops_ 開頭（原始碼掃描）", () => {
  for (const k of Object.values(State.KEYS)) ok(k.startsWith("chessops_"), k);
  const files = walk(ROOT, [".js", ".html"]).filter(f => !f.includes(path.sep + "tests" + path.sep));
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/(?:localStorage|sessionStorage)\s*\.\s*(?:getItem|setItem|removeItem)\s*\(\s*["'`]([^"'`]+)["'`]/g))
      ok(m[1].startsWith("chessops_"), `${path.relative(ROOT, f)} 用咗唔啱規定嘅 key：${m[1]}`);
  }
});

/* ---------- 規格檢查 ---------- */
test("所有 CSS／內嵌樣式嘅 font-size 都 >= 13px", () => {
  const files = walk(ROOT, [".css", ".html"]);
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g)) if (parseFloat(m[1]) < 13) bad.push(path.relative(ROOT, f) + " → " + m[0]);
  }
  eq(bad, []);
});
test("唔用 CDN：html／css／js 入面冇 http(s):// 嘅 src／href／import", () => {
  const files = walk(ROOT, [".html", ".css", ".js"]).filter(f => !f.includes(path.sep + "tests" + path.sep));
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/(?:src|href)\s*=\s*["']https?:\/\/[^"']+["']|@import\s+url\(["']?https?:|import\s*\(?\s*["']https?:/g)) {
      // index 頁嘅外部連結（例如 GitHub 原始碼連結）用 <a href>，唔算載入資源
      if (/<a\s/.test(src.slice(Math.max(0, m.index - 40), m.index + 5))) continue;
      bad.push(path.relative(ROOT, f) + " → " + m[0]);
    }
  }
  eq(bad, []);
});
test("vendor/ 檔案齊全（只檢查存在同大小，唔讀內容）", () => {
  const need = ["vendor/chess.js/chess.esm.js", "vendor/chess.js/chess.cjs", "vendor/chess.js/LICENSE",
    "vendor/chessground/chessground.min.js", "vendor/chessground/chessground.base.css", "vendor/chessground/chessground.brown.css",
    "vendor/chessground/chessground.cburnett.css", "vendor/chessground/LICENSE",
    "vendor/stockfish/stockfish-18-lite-single.js", "vendor/stockfish/stockfish-18-lite-single.wasm", "vendor/stockfish/LICENSE-Copying.txt"];
  for (const f of need) ok(fs.existsSync(path.join(ROOT, f)) && fs.statSync(path.join(ROOT, f)).size > 500, "缺少或太細：" + f);
});

/* ---------- 執行 ---------- */
(async () => {
  let pass = 0, fail = 0;
  for (const t of tests) {
    try { await t.fn(); pass++; console.log("  ✓ " + t.name); }
    catch (e) { fail++; console.log("  ✗ " + t.name + "\n    " + String(e.message).replace(/\n/g, "\n    ")); }
  }
  console.log(`\n${pass} 通過，${fail} 失敗（共 ${tests.length}）`);
  process.exit(fail ? 1 : 0);
})();
