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
  eq(out.settings, { board: "custom", design: "B", flipped: true, squareNames: false });
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

/* ---------- 一步將死（Lichess 真實 mateIn1 謎題） ---------- */
test("一步將死：60 題 Lichess 謎題，4 級各 15 題，分數由低至高；每題 FEN 合法、2 步、最後一步是將死", () => {
  eq(MATE1.length, 60);
  for (let lv = 1; lv <= 4; lv++) eq(MATE1.filter(p => p.level === lv).length, 15, "第 " + lv + " 級");
  eq(new Set(MATE1.map(p => p.id)).size, 60, "id 重複");
  for (let i = 1; i < MATE1.length; i++) ok(MATE1[i].rating >= MATE1[i - 1].rating, "分數應由低至高");
  for (let lv = 1; lv < 4; lv++) ok(Math.max(...MATE1.filter(p => p.level === lv).map(p => p.rating)) <= Math.min(...MATE1.filter(p => p.level === lv + 1).map(p => p.rating)), "各級分數不重疊");
  for (const p of MATE1) {
    ok(/^[A-Za-z0-9]{5}$/.test(p.id), p.id);
    ok(p.rating >= 400 && p.rating <= 1400, p.id + " 分數範圍");
    const mv = p.moves.split(" ");
    eq(mv.length, 2, p.id + " mateIn1 應有 2 步（對手 1 步 + 玩家將死 1 步）");
    const g = new Chess(p.fen);
    g.move({ from: mv[0].slice(0, 2), to: mv[0].slice(2, 4), promotion: mv[0][4] });
    const mates = g.moves({ verbose: true }).filter(m => { const c = new Chess(g.fen()); c.move({ from: m.from, to: m.to, promotion: m.promotion }); return c.isCheckmate(); }).map(uciOf);
    ok(mates.includes(mv[1]), p.id + " 答案步 " + mv[1] + " 不是將死");
    ok(mates.length >= 1);
  }
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
const CANTONESE = /[嘅咗唔佢喺俾啲嘢冇哋嚟嗰咁乜咩啱睇揀攞嘥畀係諗仲晒呢哩囉喇喎撳搵揸咀隻]|點樣|點解|邊個|而家/;
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
  for (const w of ["箭咀", "一隻馬", "冇", "係", "揀", "晒", "啱", "嚟", "咁", "睇", "撳", "畀", "嘢"]) ok(CANTONESE.test(w), "應抓到 " + w);
  for (const w of ["箭頭", "一枚馬", "這枚棋子", "只有", "是", "選擇", "完", "正確"]) ok(!CANTONESE.test(w), "不應誤判 " + w);
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
test("首頁：7 個模組，只有「規則快測與小遊戲」和「戰術謎題」有連結，其餘「即將推出」；首頁沒有假數字（稱號／任務／連續日數）", () => {
  const mods = require(path.join(ROOT, "js/modules.js"));
  eq(mods.length, 7);
  eq(mods.filter(m => m.href).map(m => m.name), ["規則快測與小遊戲", "戰術謎題 Tactics"]);
  eq(new Set(mods.map(m => m.icon)).size, 7, "7 個模組要用 7 個不同圖示");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8") + fs.readFileSync(path.join(ROOT, "js/home.js"), "utf8");
  ok(!/稱號|連續|今日任務|經驗/.test(html), "首頁不應有稱號卡／任務／連續日數");
});

/* ======================= 第 2 階段新增測試 ======================= */
const PL = require(path.join(ROOT, "js/puzzle-logic.js"));
const PUZ_DIR = path.join(ROOT, "data/puzzles");
const PUZ_INDEX = JSON.parse(fs.readFileSync(path.join(PUZ_DIR, "index.json"), "utf8"));
const PUZ_FILES = fs.readdirSync(PUZ_DIR).filter(f => /^r\d{4}\.json$/.test(f)).sort();
const PUZZLES = [].concat(...PUZ_FILES.map(f => JSON.parse(fs.readFileSync(path.join(PUZ_DIR, f), "utf8")).map(PL.fromRow)));
const THEMES7 = ["hangingPiece", "mateIn1", "fork", "pin", "mateIn2", "skewer", "discoveredAttack"];

/* ---------- A. 修正第 1 階段 ---------- */
test("check-5 新局面：白王同時被 2 隻棋子（車和馬）將軍，所有合法步都是王的步，答案「只能走王」", () => {
  const q = QUIZ.QUESTIONS.find(x => x.id === "check-5");
  eq(q.fen, "4r1k1/8/8/8/8/3n4/8/4K3 w - - 0 1");
  ok(q.prompt.includes("e8 的車") && q.prompt.includes("d3 的馬") && q.prompt.includes("雙將"));
  eq(q.answer, "only");
  ok(q.explain.includes("d1、d2 或 f1"));
  const g = new Chess(q.fen);
  ok(g.inCheck());
  // 逐隻黑棋單獨測試：只有車和馬各自會將軍（共 2 隻）
  const checkers = [];
  g.board().flat().filter(p => p && p.color === "b" && p.type !== "k").forEach(p => {
    const solo = new Chess("6k1/8/8/8/8/8/8/4K3 w - - 0 1");
    solo.put({ type: p.type, color: "b" }, p.square);
    if (solo.inCheck()) checkers.push(p.type + p.square);
  });
  eq(checkers.sort(), ["ne3".replace("e3", "d3"), "re8"].sort(), "將軍的棋子");
  const moves = g.moves({ verbose: true });
  ok(moves.length > 0 && moves.every(m => m.piece === "k"), "所有合法步都應是王的步");
  eq(moves.map(m => m.to).sort(), ["d1", "d2", "f1"]);
  eq(QV.computeAnswer(q, Chess), "only");
});

/* ---------- 座標設定 ---------- */
test("座標：設定「顯示格名」預設關閉、屬白名單、非布林值會被清洗、備份往返一致", () => {
  eq(State.defaultState().settings.squareNames, false);
  eq(State.normalizeState({ settings: { squareNames: true } }).settings.squareNames, true);
  eq(State.normalizeState({ settings: { squareNames: "yes" } }).settings.squareNames, false);
  eq(State.normalizeState({ settings: { squareNames: 1, evil: 1 } }).settings, { board: "chessground", design: "A", flipped: false, squareNames: false });
  const s = State.normalizeState({ settings: { squareNames: true } });
  eq(State.parseBackup(State.exportBackup(s)).settings.squareNames, true);
});
test("座標：棋盤邊座標（小寫 a–h、1–8，14px）；格名只在設定開啟時顯示且為小寫", () => {
  const js = fs.readFileSync(path.join(ROOT, "js/board.js"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "css/board.css"), "utf8");
  ok(js.includes("coordinates: showNames") && js.includes("coordinatesOnSquares: showNames"), "每格格名應由設定控制");
  ok(js.includes('"abcdefgh"') && /\[8, 7, 6, 5, 4, 3, 2, 1\]/.test(js), "邊座標內容：a–h 同 1–8");
  ok(!/coordinates:\s*true/.test(js), "不應預設每格顯示格名");
  const m = css.match(/\.bf-ranks span, \.bf-files span \{[^}]*font-size:\s*(\d+)px/);
  ok(m && Number(m[1]) >= 13, "邊座標字體不細過 13px");
  ok(/coords\.squares \{ text-transform: lowercase !important/.test(css), "每格格名要用小寫");
  ok(fs.readFileSync(path.join(ROOT, "settings.html"), "utf8").includes("顯示格名"));
  ok(fs.readFileSync(path.join(ROOT, "index.html"), "utf8").includes("settings.html"), "首頁底部要有設定連結");
});

/* ---------- 謎題資料 ---------- */
test("謎題資料：檔案合共 < 1.5 MB；index.json 與檔案一致；總數約 2,500；按 100 分一段", () => {
  let bytes = 0, count = 0;
  for (const f of PUZ_FILES) bytes += fs.statSync(path.join(PUZ_DIR, f)).size;
  bytes += fs.statSync(path.join(PUZ_DIR, "index.json")).size + fs.statSync(path.join(ROOT, "data/mate1.js")).size;
  ok(bytes < 1.5 * 1048576, "資料檔案太大：" + bytes);
  eq(PUZ_FILES.length, 10);
  PUZ_INDEX.bands.forEach(b => {
    const rows = JSON.parse(fs.readFileSync(path.join(PUZ_DIR, b.file), "utf8"));
    eq(rows.length, b.count, b.file + " 題數");
    rows.forEach(r => { const p = PL.fromRow(r); ok(p.rating >= b.min && p.rating <= b.max + 1, p.id + " 不在 " + b.file + " 分數段"); });
    count += b.count;
  });
  eq(count, PUZ_INDEX.total); eq(PUZZLES.length, PUZ_INDEX.total);
  ok(PUZ_INDEX.total >= 2300 && PUZ_INDEX.total <= 2700, "總數應約 2,500：" + PUZ_INDEX.total);
  eq(new Set(PUZZLES.map(p => p.id)).size, PUZZLES.length, "id 重複");
});
test("謎題資料：7 個主題各約 300–400 題（主要主題），只含指定的 7 個主題；篩選條件已記錄", () => {
  const primary = {};
  THEMES7.forEach(t => { primary[t] = 0; });
  PUZZLES.forEach(p => { p.themes.forEach(t => ok(THEMES7.includes(t), p.id + " 含未允許主題 " + t)); });
  const PRIORITY = ["skewer", "discoveredAttack", "pin", "fork", "hangingPiece", "mateIn2", "mateIn1"];
  PUZZLES.forEach(p => { primary[PRIORITY.find(t => p.themes.includes(t))]++; });
  for (const t of THEMES7) ok(primary[t] >= 300 && primary[t] <= 400, `主題 ${t} 題數 ${primary[t]} 不在 300–400`);
  eq(PUZ_INDEX.filter, { minRating: 400, maxRating: 1400, maxDeviation: 90, minPopularity: 85, minPlays: 300 });
  for (const t of THEMES7) ok(PUZZLES.filter(p => p.themes.includes(t)).length >= 300, t + " 含該主題的題數不足 300");
});
test("謎題資料：每一題 FEN 合法、moves 每一步都合法；mateIn1／mateIn2 的最後一步確實是將死（2,450 題）", () => {
  let checkedMates = 0;
  for (const p of PUZZLES) {
    let g;
    try { g = new Chess(p.fen); } catch (e) { throw new Error(p.id + " FEN 不合法：" + e.message); }
    ok(p.moves.length >= 2, p.id + " moves 太短");
    let last = null;
    p.moves.forEach((u, i) => {
      try { last = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); }
      catch (e) { throw new Error(p.id + " 第 " + (i + 1) + " 步 " + u + " 不合法"); }
    });
    if (p.themes.includes("mateIn1") || p.themes.includes("mateIn2")) {
      ok(g.isCheckmate(), p.id + " 是 mateIn 題，最後一步應為將死");
      checkedMates++;
    }
    if (p.themes.includes("mateIn1")) eq(p.moves.length, 2, p.id + " mateIn1 應只有 2 步");
    if (p.themes.includes("mateIn2")) eq(p.moves.length, 4, p.id + " mateIn2 應有 4 步");
    ok(p.moves.length % 2 === 0, p.id + " moves 應為雙數（對手先走、玩家最後走）");
  }
  ok(checkedMates > 800, "應檢查超過 800 題將死題：" + checkedMates);
});

/* ---------- 謎題邏輯 ---------- */
test("謎題分：Elo 預期值同升降（頭 30 題 K=40、之後 K=24；贏 +、輸 −；提示不計分）", () => {
  ok(Math.abs(PL.expectedScore(700, 700) - 0.5) < 1e-12);
  ok(Math.abs(PL.expectedScore(1100, 700) - 1 / (1 + Math.pow(10, -1))) < 1e-12, "高 400 分預期約 0.909");
  eq(PL.kFactor(0), 40); eq(PL.kFactor(29), 40); eq(PL.kFactor(30), 24); eq(PL.kFactor(500), 24);
  const base = { rating: 700, rated: 0, done: [], wrong: [], history: [] };
  eq(PL.applyResult(base, 700, true, false).delta, 20);
  eq(PL.applyResult(base, 700, false, false).delta, -20);
  eq(PL.applyResult(base, 1100, true, false).delta, Math.round(40 * (1 - 1 / (1 + Math.pow(10, 1)))));   // 打贏高分題，加得多
  ok(PL.applyResult(base, 1100, true, false).delta > PL.applyResult(base, 300, true, false).delta, "贏高分題比贏低分題加得多");
  eq(PL.applyResult(Object.assign({}, base, { rated: 30 }), 700, true, false).delta, 12);
  eq(PL.applyResult(Object.assign({}, base, { rated: 30 }), 700, false, false).delta, -12);
  const h = PL.applyResult(base, 900, true, true);
  eq(h.delta, 0); eq(h.puzzles.rating, 700); eq(h.puzzles.rated, 0, "用提示不計入已計分題數"); eq(h.rated, false);
  const w = PL.applyResult(base, 900, false, false);
  eq(w.puzzles.rated, 1); ok(w.puzzles.rating < 700);
  eq(PL.applyResult({ rating: 100, rated: 0, done: [], wrong: [], history: [] }, 1400, false, false).puzzles.rating >= 100, true, "分數有下限");
  eq(base.rating, 700, "不可改動傳入物件");
});
test("選題：只揀分數 ±150 內、未做過、符合主題；搵唔到會擴闊；最後先容許重複", () => {
  const mk = (id, rating, themes) => ({ id, fen: "x", moves: ["a1a2", "a2a3"], rating, themes });
  const pool = [mk("aaaaa", 700, ["fork"]), mk("bbbbb", 840, ["fork"]), mk("ccccc", 860, ["fork"]), mk("ddddd", 700, ["pin"]), mk("eeeee", 1000, ["fork"])];
  const rng = mulberry32(5);
  for (let i = 0; i < 50; i++) {
    const p = PL.selectPuzzle(pool, { rating: 700, themes: ["fork"], done: ["aaaaa"], exclude: [], rng });
    ok(p && Math.abs(p.rating - 700) <= 150 && p.id !== "aaaaa" && p.themes.includes("fork"), "揀到範圍外／做過／錯主題：" + (p && p.id));
  }
  eq(PL.selectPuzzle(pool, { rating: 700, themes: ["fork"], done: ["aaaaa", "bbbbb"], exclude: [], rng, maxWindow: 150 }), null, "範圍內冇題時，限制 150 就應該揀唔到");
  eq(PL.selectPuzzle(pool, { rating: 700, themes: ["fork"], done: ["aaaaa", "bbbbb"], exclude: [], rng }).id, "ccccc", "擴闊範圍後揀最近嘅可用題（860 在 ±160）");
  eq(PL.selectPuzzle(pool, { rating: 700, themes: ["fork"], done: ["aaaaa", "bbbbb", "ccccc", "eeeee"], exclude: [], rng }), null, "全部做過就揀唔到");
  ok(PL.selectPuzzle(pool, { rating: 700, themes: ["fork"], done: ["aaaaa", "bbbbb", "ccccc", "eeeee"], exclude: [], rng, allowDone: true }), "容許重複時應揀到");
  eq(PL.selectPuzzle(pool, { rating: 700, themes: ["pin"], done: [], exclude: ["ddddd"], rng }), null, "本輪已揀過嘅唔會再揀");
  eq(PL.selectPuzzle(pool, { rating: 700, themes: ["skewer"], done: [], exclude: [], rng }), null, "冇該主題");
});
test("選題：用真實資料，分數 700 揀題都在 ±150 內；每個主題都揀到題；一輪 5 題主題安排正確", () => {
  const rng = mulberry32(11);
  for (const t of THEMES7) {
    for (let i = 0; i < 20; i++) {
      const p = PL.selectPuzzle(PUZZLES, { rating: 700, themes: [t], done: [], exclude: [], rng, maxWindow: 150 });
      ok(p, t + " 在 700±150 應有題目");
      ok(Math.abs(p.rating - 700) <= 150 && p.themes.includes(t));
    }
  }
  const plan = PL.planThemes("recommended", null, 5, mulberry32(3));
  eq(plan.length, 5);
  eq(new Set(plan.slice(0, 4)).size, 4, "頭 4 題應涵蓋推薦嘅 4 個主題");
  plan.forEach(t => ok(PL.RECOMMENDED.includes(t)));
  eq(PL.planThemes("theme", "pin", 5), ["pin", "pin", "pin", "pin", "pin"]);
  eq(PL.RECOMMENDED, ["hangingPiece", "mateIn1", "fork", "pin"]);
  eq(PL.bandsFor(700, 150), [500, 600, 700, 800]);
  eq(PL.bandFile(400), "r0400.json"); eq(PL.bandStart(1399), 1300); eq(PL.bandStart(200), 400);
  for (const t of THEMES7) ok(PL.THEME_NAMES[t], "缺少主題名稱 " + t);
  ok(PL.THEME_NAMES.fork.includes("捉雙") && PL.THEME_NAMES.fork.includes("Fork"), "主題名稱中英對照");
});
test("錯題本：答錯加入；連續答對 2 次移出；中間答錯會重新計算；不在本內答對不會加入", () => {
  let w = [];
  w = PL.updateWrongBook(w, "aaaaa", 800, false);
  eq(w, [{ id: "aaaaa", r: 800, streak: 0 }]);
  w = PL.updateWrongBook(w, "aaaaa", 800, true); eq(w[0].streak, 1);
  w = PL.updateWrongBook(w, "aaaaa", 800, false); eq(w[0].streak, 0, "中間答錯，連勝歸零");
  w = PL.updateWrongBook(w, "aaaaa", 800, true);
  w = PL.updateWrongBook(w, "aaaaa", 800, true);
  eq(w, [], "連續答對 2 次就移出");
  eq(PL.updateWrongBook([], "bbbbb", 900, true), [], "不在錯題本內答對，不會加入");
  const orig = [{ id: "ccccc", r: 700, streak: 0 }];
  PL.updateWrongBook(orig, "ccccc", 700, true); eq(orig[0].streak, 0, "不可改動傳入陣列");
  eq(PL.updateWrongBook([{ id: "ccccc", r: 700, streak: 0 }], "ddddd", 600, false).length, 2);
});
test("謎題儲存：done 最多 2,000（保留最近）、history 最多 50、錯題本去重；備份往返一致", () => {
  let done = [];
  for (let i = 0; i < 2105; i++) done = PL.markDone(done, "i" + String(i).padStart(4, "0"));
  eq(done.length, 2000); eq(done[done.length - 1], "i2104"); ok(!done.includes("i0000"));
  eq(PL.markDone(["aaaaa", "bbbbb"], "aaaaa"), ["bbbbb", "aaaaa"], "重複 id 移到最後");
  let hist = [];
  for (let i = 0; i < 60; i++) hist = PL.pushHistory(hist, { id: "h" + String(i).padStart(4, "0"), ok: true, hint: false, rated: true, theme: "fork", delta: 5 });
  eq(hist.length, 50); eq(hist[0].id, "h0010");
  const dirty = { puzzles: { rating: 99999, rated: -4, done: done.concat(["bad", "bad2"]), wrong: [{ id: "aaaaa", r: 800, streak: 9, extra: 1 }, { id: "aaaaa", r: 1, streak: 0 }, { id: "xx", r: 1 }], history: hist.concat([{ id: "zzzzz", ok: true, theme: "notATheme", delta: 5000, extra: 1 }]), junk: 1 } };
  const n = State.normalizeState(dirty).puzzles;
  eq(Object.keys(n).sort(), ["done", "history", "rated", "rating", "wrong"]);
  eq(n.rating, 3000); eq(n.rated, 0); eq(n.done.length, 2000); eq(n.history.length, 50);
  eq(n.wrong, [{ id: "aaaaa", r: 800, streak: 1 }]);
  eq(n.history[49].theme, ""); eq(n.history[49].delta, 200);
  const s = State.normalizeState({ puzzles: { rating: 815, rated: 12, done: ["aaaaa", "bbbbb"], wrong: [{ id: "ccccc", r: 1000, streak: 1 }], history: [{ id: "aaaaa", ok: true, hint: true, rated: false, theme: "pin", delta: 0 }] } });
  eq(State.parseBackup(State.exportBackup(s)), s, "備份往返");
  eq(State.defaultState().puzzles, { rating: 700, rated: 0, done: [], wrong: [], history: [] });
  eq(Object.keys(State.STATE_FIELDS).sort(), ["playLevel", "puzzles", "rank", "records", "settings", "streak", "version"]);
});
test("首頁：「戰術謎題」入口已開放並顯示真實謎題分；puzzles.html 引用嘅檔案齊全", () => {
  const mods = require(path.join(ROOT, "js/modules.js"));
  eq(mods.filter(m => m.href).map(m => m.href), ["rules.html", "puzzles.html"]);
  const home = fs.readFileSync(path.join(ROOT, "js/home.js"), "utf8");
  ok(home.includes("State.loadState().puzzles.rating"), "首頁要用儲存嘅謎題分");
  ok(!/經驗|稱號|連續日數/.test(home));
  const html = fs.readFileSync(path.join(ROOT, "puzzles.html"), "utf8");
  for (const f of ["js/puzzle-logic.js", "js/puzzles.js", "js/state.js"]) ok(html.includes(f), "puzzles.html 應引用 " + f);
});

/* ======================= 第 3 階段新增測試 ======================= */
const CFG = require(path.join(ROOT, "js/config.js"));

test("設定集中（js/config.js）：數字合理；pickMove 用嘅就係 config 嘅同一份", () => {
  const P = CFG.PICKMOVE;
  for (let l = 1; l <= 6; l++) ok(P.P_BEST[l] > 0 && P.P_BEST[l] < 1, "P_BEST " + l);
  for (let l = 2; l <= 6; l++) ok(P.P_BEST[l] > P.P_BEST[l - 1], "P_BEST 應隨級別上升");
  eq(P.P_BEST, { 1: 0.10, 2: 0.20, 3: 0.30, 4: 0.45, 5: 0.60, 6: 0.75 }, "沿用第 0 階段數值");
  eq(P.P_TAKE_FREE, { 1: 0.85, 2: 0.90, 3: 0.95 });
  eq(P.LOWEST[7].skill, 0); eq(P.LOWEST[8].elo, 1320);
  ok(P.BEST_SEARCH.depth >= 4 && P.BEST_SEARCH.depth <= 20);
  ok(PM.P_BEST === P.P_BEST && PM.P_TAKE_FREE === P.P_TAKE_FREE && PM.BEST_SEARCH === P.BEST_SEARCH && PM.LOWEST === P.LOWEST, "pickmove 應直接用 config");
  ok(CFG.THINK_PAUSE.minMs >= 400 && CFG.THINK_PAUSE.maxMs <= 800 && CFG.THINK_PAUSE.minMs < CFG.THINK_PAUSE.maxMs, "出棋前停頓 0.4–0.8 秒");
  ok(CFG.HINT.depth >= 4);
  const R = CFG.REVIEW, T = R.THRESHOLDS_CP;
  ok(R.maxMsPerMove > 0 && R.maxDepth > 0 && R.MATE_CP >= 500);
  ok(T.inaccuracy > 0 && T.inaccuracy < T.mistake && T.mistake < T.blunder, "疑問手 < 錯著 < 大錯");
});
test("設定檔案有註解說明（未有 iPad 實測數據，要按實測再調）", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/config.js"), "utf8");
  ok(src.includes("iPad 實測") && src.includes("PICKMOVE") && src.includes("THINK_PAUSE") && src.includes("HINT") && src.includes("REVIEW"));
});

/* ---------- 第 2 階段修正：錯題本與提示 ---------- */
test("錯題本：用咗提示嘅題目，無論答啱定答錯都入錯題本（唔計連勝）；錯題本練習用提示答啱唔計連勝", () => {
  eq(PL.countsAsCorrect(true, false), true);
  eq(PL.countsAsCorrect(true, true), false);
  eq(PL.countsAsCorrect(false, false), false);
  eq(PL.countsAsCorrect(false, true), false);
  // 用提示答啱：入錯題本
  eq(PL.updateWrongBook([], "aaaaa", 800, PL.countsAsCorrect(true, true)), [{ id: "aaaaa", r: 800, streak: 0 }]);
  // 不用提示答啱：唔入
  eq(PL.updateWrongBook([], "aaaaa", 800, PL.countsAsCorrect(true, false)), []);
  // 錯題本練習中用提示答啱：連勝歸零、仍在本內
  eq(PL.updateWrongBook([{ id: "aaaaa", r: 800, streak: 1 }], "aaaaa", 800, PL.countsAsCorrect(true, true)), [{ id: "aaaaa", r: 800, streak: 0 }]);
  // 用提示答啱：仍然唔計謎題分
  eq(PL.applyResult({ rating: 700, rated: 0, done: [], wrong: [], history: [] }, 800, true, true).delta, 0);
});
test("書面語修正：「箭咀」改為「箭頭」、「隻」改為「枚」；App 文字有「箭頭」「這枚棋子」", () => {
  const files = ["js/puzzles.js", "js/quiz.js", "js/game-mate1.js", "js/game-check.js"].map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
  ok(files.includes("綠色箭頭是正確的走法") && files.includes("提示 2：箭頭是答案") && files.includes("要走這枚棋子"));
  ok(!/箭咀/.test(files));
  const quiz = fs.readFileSync(path.join(ROOT, "data/rules-quiz.js"), "utf8");
  ok(!/隻/.test(quiz) && quiz.includes("一枚馬"));
});
test("主題標籤：「推薦」模式答完先顯示；「按主題練習」及錯題本照舊一開始顯示（原始碼檢查，流程見 tools/shots2.js）", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/puzzles.js"), "utf8");
  ok(/ctx\.cfg\.mode === "recommended" \? " invisible"/.test(src), "推薦模式標籤初始隱藏（保留位置，避免棋盤移位）");
  ok((src.match(/tagsEl\.classList\.remove\("invisible"\)/g) || []).length >= 2, "答對同答錯後都要顯示標籤");
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
