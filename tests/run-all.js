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
  const files = walk(ROOT, [".css", ".html", ".js"]).filter(f => !f.includes(path.sep + "tests" + path.sep));
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
    "vendor/stockfish/stockfish-19-lite-single.js", "vendor/stockfish/stockfish-19-lite-single.wasm", "vendor/stockfish/LICENSE-Copying.txt"];
  for (const f of need) ok(fs.existsSync(path.join(ROOT, f)) && fs.statSync(path.join(ROOT, f)).size > 500, "缺少或太細：" + f);
});

/* ======================= 第 1 階段新增測試 ======================= */
const QV = require(path.join(ROOT, "js/quiz-verify.js"));
const QUIZ = require(path.join(ROOT, "data/rules-quiz.js"));
const MATE1 = require(path.join(ROOT, "data/mate1.js"));
const CHECKFIND = require(path.join(ROOT, "data/check-find.js"));
const MAZE = require(path.join(ROOT, "data/knight-maze.js"));
const KM = require(path.join(ROOT, "js/knight-maze.js"));
const PW = require(path.join(ROOT, "js/pawnwar.js"));
const uciOf = m => m.from + m.to + (m.promotion || "");

/* ---------- 規則快測 ---------- */
test("規則快測：30 題，6 組各 5 題，id 不重複，每題有解釋", () => {
  eq(QUIZ.QUESTIONS.length, 30);
  eq(QUIZ.GROUPS.length, 6);
  for (const g of QUIZ.GROUPS) eq(QUIZ.QUESTIONS.filter(q => q.group === g.id).length, 5, "組別 " + g.id);
  eq(new Set(QUIZ.QUESTIONS.map(q => q.id)).size, 30);
  for (const q of QUIZ.QUESTIONS) ok(q.explain && q.explain.length > 10 && q.prompt, q.id + " 缺解釋或問題");
});
test("規則快測：每一題的標準答案都用 chess.js 重新計算並核對（30 題）", () => {
  for (const q of QUIZ.QUESTIONS) {
    eq(QV.computeAnswer(q, Chess), q.answer, "題目 " + q.id + " 的答案與 chess.js 計算結果不同");
  }
});
test("規則快測：局面有效；選擇題的選項與答案一致；play 題的答案全部是合法步", () => {
  for (const q of QUIZ.QUESTIONS) {
    const g = QV.positionOf(q, Chess);
    ok(!g.isGameOver() || q.verify.kind === "status" || q.verify.kind === "flag", q.id + " 局面已結束");
    if (q.type === "choice") {
      ok(Array.isArray(q.options) && q.options.length >= 2, q.id + " 選項不足");
      eq(new Set(q.options.map(o => o.key)).size, q.options.length, q.id + " 選項 key 重複");
      ok(q.options.some(o => o.key === q.answer), q.id + " 答案不在選項內");
    } else {
      ok(Array.isArray(q.answer) && q.answer.length > 0, q.id + " 答案空");
      const legal = new Set(g.moves({ verbose: true }).map(uciOf));
      for (const u of q.answer) ok(legal.has(u), q.id + " 答案 " + u + " 不是合法步");
    }
  }
});
test("規則快測：三次重複、50 步、子力不足、將死、逼和分別用 chess.js 的對應函數驗證", () => {
  const byId = id => QUIZ.QUESTIONS.find(q => q.id === id);
  ok(QV.positionOf(byId("draw-1"), Chess).isThreefoldRepetition());
  ok(!QV.positionOf(byId("draw-2"), Chess).isThreefoldRepetition());
  ok(QV.positionOf(byId("draw-3"), Chess).isDrawByFiftyMoves());
  eq(new Chess(byId("draw-3").fen).fen().split(" ")[4], "100", "半回合數應為 100");
  ok(QV.positionOf(byId("draw-4"), Chess).isInsufficientMaterial());
  ok(!QV.positionOf(byId("draw-5"), Chess).isInsufficientMaterial());
  ok(QV.positionOf(byId("mate-1"), Chess).isCheckmate());
  ok(QV.positionOf(byId("mate-2"), Chess).isStalemate());
});

/* ---------- 一步將死 ---------- */
test("一步將死：40 題，4 級各 10 題，每題局面有效、白方走棋、至少一步將死，所有將死步都記錄齊全", () => {
  eq(MATE1.length, 40);
  for (let lv = 1; lv <= 4; lv++) eq(MATE1.filter(p => p.level === lv).length, 10, "第 " + lv + " 級");
  eq(new Set(MATE1.map(p => p.fen)).size, 40, "局面重複");
  for (const p of MATE1) {
    const g = new Chess(p.fen);
    eq(g.turn(), "w", p.id + " 應為白方走棋");
    ok(!g.inCheck(), p.id + " 白方不應被將軍");
    const mates = g.moves({ verbose: true }).filter(m => { const c = new Chess(p.fen); c.move({ from: m.from, to: m.to, promotion: m.promotion }); return c.isCheckmate(); }).map(uciOf).sort();
    ok(mates.length >= 1, p.id + " 沒有一步將死");
    eq(mates, p.mates, p.id + " 記錄的將死步與 chess.js 計算不同");
  }
});
test("一步將死：后、車、馬、象各有題目，難度由淺入深（第 1 級全部是后將死）", () => {
  const cnt = {}; MATE1.forEach(p => { cnt[p.piece] = (cnt[p.piece] || 0) + 1; });
  for (const k of ["q", "r", "n", "b"]) ok(cnt[k] >= 6, "將死棋子 " + k + " 題數不足：" + cnt[k]);
  ok(MATE1.filter(p => p.level === 1).every(p => p.piece === "q"), "第 1 級應全部由后將死");
  ok(MATE1.filter(p => p.level === 4).some(p => p.piece === "n" || p.piece === "b"), "第 4 級應有馬或象");
});

/* ---------- 找出將軍 ---------- */
test("找出將軍：20 題，記錄的將軍步與 chess.js 計算完全相同（沒有漏、沒有多）", () => {
  eq(CHECKFIND.length, 20);
  for (const p of CHECKFIND) {
    const g = new Chess(p.fen);
    ok(!g.inCheck() && !g.isGameOver(), p.id + " 局面不應已被將軍或已結束");
    const checks = g.moves({ verbose: true }).filter(m => { const c = new Chess(p.fen); c.move({ from: m.from, to: m.to, promotion: m.promotion }); return c.inCheck(); }).map(uciOf).sort();
    eq(checks, p.checks, p.id + " 將軍步不一致");
    ok(checks.length >= 2 && checks.length <= 6, p.id + " 將軍數不在 2–6");
  }
});

/* ---------- 騎士迷宮 ---------- */
test("騎士迷宮：攻擊範圍計算（黑兵向下、黑棋互相擋住直線、馬走日字）", () => {
  eq(KM.knightMoves("a1").sort(), ["b3", "c2"]);
  eq(KM.knightMoves("e4").length, 8);
  const p = KM.attackedSquares([{ t: "p", sq: "e5" }]);
  ok(p.d4 && p.f4 && !p.e4 && !p.d6, "黑兵 e5 應攻擊 d4、f4，不攻擊 e4、d6");
  const blocked = KM.attackedSquares([{ t: "r", sq: "a1" }, { t: "p", sq: "a4" }]);
  ok(blocked.a2 && blocked.a3 && blocked.a4 && !blocked.a5, "被擋住的車攻擊到 a4 為止");
  const q = KM.attackedSquares([{ t: "q", sq: "d4" }]);
  ok(q.d8 && q.h8 && q.a1 && q.a4 && q.g1 && q.a7 && !q.e6 && !q.b3, "后攻擊直線同斜線，不攻擊日字位");
  const n = KM.attackedSquares([{ t: "n", sq: "d4" }]);
  eq(Object.keys(n).length, 8);
});
test("騎士迷宮：15 關，最少步數用 BFS 重新計算並核對；起點與星都在安全格；路徑合法", () => {
  eq(MAZE.length, 15);
  for (const lv of MAZE) {
    const unsafe = KM.unsafeSquares(lv);
    ok(!unsafe[lv.knight], lv.id + " 馬的起點不安全");
    lv.stars.forEach(s => ok(!unsafe[s], lv.id + " 星 " + s + " 在危險格"));
    ok(lv.stars.length >= 2 && lv.stars.length <= 4, lv.id + " 星數");
    const sol = KM.solve(lv);
    ok(sol, lv.id + " 無解");
    eq(sol.par, lv.par, lv.id + " 最少步數與記錄不同");
    let pos = lv.knight; const got = new Set(lv.stars.includes(pos) ? [pos] : []);
    for (const nx of sol.path.slice(1)) { ok(KM.isLegalMove(lv, pos, nx), lv.id + " 路徑含非法步 " + pos + nx); pos = nx; if (lv.stars.includes(pos)) got.add(pos); }
    eq(got.size, lv.stars.length, lv.id + " 路徑沒有吃晒所有星");
  }
  const pars = MAZE.map(l => l.par);
  ok(pars[0] <= 4 && pars[pars.length - 1] >= 10, "難度應由淺入深：" + pars.join(","));
  for (let i = 1; i < pars.length; i++) ok(pars[i] >= pars[i - 1] - 2, "難度不應大幅倒退：" + pars.join(","));
});
test("騎士迷宮：BFS 最少步數的手作例子", () => {
  eq(KM.solve({ knight: "a1", stars: ["b3"], black: [] }).par, 1);
  eq(KM.solve({ knight: "a1", stars: ["b3", "c2"], black: [] }).par, 3);
  eq(KM.solve({ knight: "a1", stars: ["b3"], black: [{ t: "r", sq: "b8" }] }), null, "b3 被 b8 的車攻擊，星不可達");
  eq(KM.solve({ knight: "a1", stars: ["h8"], black: [{ t: "p", sq: "c3" }] }) !== null, true);
});

/* ---------- 兵仗 ---------- */
test("兵仗：兵走到對方底線即勝（白、黑各一次）", () => {
  const w = new Chess("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
  const mw = w.move({ from: "a7", to: "a8", promotion: "q" });
  eq(PW.status(w, mw), { over: true, winner: "w", reason: "reach" });
  const b = new Chess("4k3/8/8/8/8/8/p7/4K3 b - - 0 1");
  const mb = b.move({ from: "a2", to: "a1", promotion: "q" });
  eq(PW.status(b, mb), { over: true, winner: "b", reason: "reach" });
});
test("兵仗：起始局面進行中；將死、逼和、子力不足判斷正確", () => {
  const start = new Chess(PW.START_FEN);
  eq(start.moves().length, 16 + 2, "起始位置：16 個兵步加王 2 步（d1、f1）");
  eq(PW.status(start, null).over, false);
  eq(PW.status(new Chess("R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1"), null), { over: true, winner: "w", reason: "mate" });
  eq(PW.status(new Chess("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"), null), { over: true, winner: null, reason: "stalemate" });
  eq(PW.status(new Chess("4k3/8/8/8/8/8/8/4K3 w - - 0 1"), null).winner, null);
});
test("兵仗：起始局面雙方各有王和 8 隻兵；一步走兩格、吃過路兵仍可用", () => {
  const g = new Chess(PW.START_FEN);
  eq(g.board().flat().filter(p => p && p.type === "p" && p.color === "w").length, 8);
  eq(g.board().flat().filter(p => p && p.type === "p" && p.color === "b").length, 8);
  eq(g.board().flat().filter(p => p && p.type === "k").length, 2);
  ok(g.moves().includes("e4") && g.moves().includes("e3"));
  ["e4", "a6", "e5", "d5"].forEach(s => g.move(s));
  ok(g.moves().includes("exd6"), "吃過路兵應可用");
});
test("兵仗：電腦第 1–4 級（pickMove）每一步都回傳合法步，對局能在 200 步內完結（16 局模擬）", async () => {
  for (let level = 1; level <= 4; level++) {
    for (let i = 0; i < 4; i++) {
      const g = new Chess(PW.START_FEN), rng = mulberry32(level * 100 + i);
      let last = null, n = 0, st = { over: false };
      while (!st.over && n < 200) {
        const r = await PM.pickMove(level, g, { Chess, engine: fakeEngine(), rng });
        ok(r && isLegal(g, r.move), "級別 " + level + " 回傳非法步");
        last = g.move({ from: r.move.from, to: r.move.to, promotion: r.move.promotion });
        st = PW.status(g, last); n++;
      }
      ok(st.over, "級別 " + level + " 對局應在 200 步內完結");
    }
  }
});

/* ---------- 成績記錄（state） ---------- */
test("成績記錄：項目 id 涵蓋全部規則快測組別、小遊戲；不乾淨的資料會被清洗", () => {
  for (const g of QUIZ.GROUPS) ok(State.RECORD_IDS.includes("quiz-" + g.id), "缺 quiz-" + g.id);
  for (const id of ["mate1-1", "mate1-2", "mate1-3", "mate1-4", "check-find", "maze", "pawnwar"]) ok(State.RECORD_IDS.includes(id), "缺 " + id);
  const out = State.normalizeState({ records: { "quiz-castling": { best: 9, plays: -3, extra: 1 }, hacker: { best: 1 }, maze: "x" } });
  eq(out.records["quiz-castling"], { best: 9, plays: 0 });
  eq(out.records.maze, { best: 0, plays: 0 });
  ok(!("hacker" in out.records));
  eq(Object.keys(out.records).sort(), State.RECORD_IDS.slice().sort());
});
test("成績記錄：recordResult 累計完成次數、保留最佳；備份往返一致；未登記 id 會拋錯", () => {
  const store = {};
  global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  try {
    let s = State.loadState();
    s = State.recordResult(s, "quiz-mate", 3);
    s = State.recordResult(s, "quiz-mate", 5);
    s = State.recordResult(s, "quiz-mate", 4);
    eq(s.records["quiz-mate"], { best: 5, plays: 3 });
    eq(State.loadState().records["quiz-mate"], { best: 5, plays: 3 }, "應已寫入 localStorage");
    ok("chessops_state" in store);
    eq(State.parseBackup(State.exportBackup(s)), s);
    let threw = false; try { State.recordResult(s, "nope", 1); } catch (e) { threw = true; }
    ok(threw);
  } finally { delete global.localStorage; }
});
test("只有 js/state.js 直接使用 localStorage", () => {
  const files = walk(ROOT, [".js", ".html"]).filter(f => !/[\\/](tests|tools)[\\/]/.test(f) && !f.endsWith("state.js"));
  for (const f of files) ok(!/localStorage|sessionStorage/.test(fs.readFileSync(f, "utf8")), path.relative(ROOT, f) + " 直接使用了 localStorage");
});

/* ---------- App 文字：書面語（不可有廣東話用字） ---------- */
function stripComments(src, kind) {
  if (kind === "html") src = src.replace(/<!--[\s\S]*?-->/g, "");
  src = src.replace(/\/\*[\s\S]*?\*\//g, "");
  return src.split(/\r?\n/).map(line => line.replace(/(^|[^:"'\\])\/\/.*$/, "$1")).join("\n");
}
const CANTONESE = /[嘅咗唔佢喺俾啲嘢冇哋嚟嗰咁乜咩啱睇揀攞嘥畀係諗仲晒呢哩囉喇喎撳搵揸]|點樣|點解|邊個|而家/;
test("App 顯示文字一律用書面語：首頁、規則快測、小遊戲、設計預覽、題庫、js 內沒有廣東話用字", () => {
  const files = walk(ROOT, [".html", ".js", ".css"]).filter(f => {
    const rel = path.relative(ROOT, f).replace(/\\/g, "/");
    return !rel.startsWith("tests/") && !rel.startsWith("tools/") && !rel.startsWith("docs/") && !/^test-.*\.html$/.test(rel);
  });
  const bad = [];
  for (const f of files) {
    const rel = path.relative(ROOT, f).replace(/\\/g, "/");
    const kind = f.endsWith(".html") ? "html" : "js";
    const text = stripComments(fs.readFileSync(f, "utf8"), kind);
    text.split(/\r?\n/).forEach((line, i) => { const m = line.match(CANTONESE); if (m) bad.push(`${rel}:${i + 1} 「${m[0]}」 ${line.trim().slice(0, 50)}`); });
  }
  eq(bad, []);
});
test("廣東話掃描本身有效：會抓到「找出最好嘅一步」，不會誤判書面語「找出最好的一步」", () => {
  ok(CANTONESE.test("找出最好嘅一步"));
  ok(!CANTONESE.test("找出最好的一步"));
  eq(stripComments("var a = 1; // 嘅註解\n/* 唔 */ var b = 'http://x';", "js").includes("嘅"), false);
  ok(stripComments("var b = 'http://x';", "js").includes("http://x"));
});

/* ---------- 檔案與參照 ---------- */
test("所有頁面引用的本地檔案（script／link／連結）都存在", () => {
  const pages = walk(ROOT, [".html"]).filter(f => !f.includes(path.sep + "tests" + path.sep));
  const missing = [];
  for (const f of pages) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/(?:src|href)\s*=\s*"([^"#?]+)(?:[?#][^"]*)?"/g)) {
      const u = m[1];
      if (/^(https?:|data:|mailto:|#|\/\/)/.test(u)) continue;
      const target = path.resolve(path.dirname(f), u);
      const exists = fs.existsSync(target) || (u.endsWith("/") && fs.existsSync(path.join(target, "index.html")));
      if (!exists) missing.push(path.relative(ROOT, f) + " → " + u);
    }
  }
  eq(missing, []);
});
test("已刪除「自己寫」棋盤；Stockfish 已升級到 19（18 檔案不存在，程式沒有殘留引用）", () => {
  for (const f of ["js/board-custom.js", "css/board-custom.css", "test-board-custom.html", "vendor/stockfish/stockfish-18-lite-single.js", "vendor/stockfish/stockfish-18-lite-single.wasm"])
    ok(!fs.existsSync(path.join(ROOT, f)), f + " 應已刪除");
  const wasm = fs.statSync(path.join(ROOT, "vendor/stockfish/stockfish-19-lite-single.wasm")).size;
  ok(wasm > 1.5e6 && wasm < 2.5e6, "19 lite wasm 大小應約 1.8 MB，實際 " + wasm);
  for (const f of walk(ROOT, [".js", ".html", ".css"]).filter(f => !f.includes(path.sep + "tests" + path.sep))) {
    const src = fs.readFileSync(f, "utf8");
    ok(!/board-custom|CustomBoard|stockfish-18/.test(src), path.relative(ROOT, f) + " 仍有舊引用");
  }
});
test("首頁：7 個模組，只有「規則快測與小遊戲」有連結，其餘「即將推出」；首頁沒有假數字（稱號／任務／連續日數）", () => {
  const mods = require(path.join(ROOT, "js/modules.js"));
  eq(mods.length, 7);
  eq(mods.filter(m => m.href).map(m => m.name), ["規則快測與小遊戲"]);
  eq(new Set(mods.map(m => m.icon)).size, 7, "7 個模組要用 7 個不同圖示");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8") + fs.readFileSync(path.join(ROOT, "js/home.js"), "utf8");
  ok(!/稱號|連續|今日任務|經驗/.test(html), "首頁不應有稱號卡／任務／連續日數");
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
