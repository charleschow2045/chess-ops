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
  eq(out.settings, { board: "custom", design: "B", flipped: true, squareNames: false, threeReminder: true });
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
test("首頁：7 個模組，全部有連結（規則快測、走棋前三問、戰術謎題、對電腦下棋、開局、殘局、我的對局）；首頁沒有假數字（稱號／任務／連續日數）", () => {
  const mods = require(path.join(ROOT, "js/modules.js"));
  eq(mods.length, 7);
  eq(mods.filter(m => m.href).map(m => m.name), ["規則快測與小遊戲", "走棋前三問", "戰術謎題 Tactics", "對電腦下棋", "開局 Openings", "殘局 Endgames", "我的對局 My Games"]);
  eq(new Set(mods.map(m => m.icon)).size, 7, "7 個模組要用 7 個不同圖示");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8") + fs.readFileSync(path.join(ROOT, "js/home.js"), "utf8");
  ok(!/經驗/.test(html) && html.includes("Daily.titleInfo") && html.includes("Daily.status"), "首頁嘅稱號、任務、連續日數全部由 js/daily.js 用真實數據計出（第 6 階段起）；冇「經驗值」");
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
  eq(State.normalizeState({ settings: { squareNames: 1, evil: 1 } }).settings, { board: "chessground", design: "A", flipped: false, squareNames: false, threeReminder: true });
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
  eq(Object.keys(State.STATE_FIELDS).sort(), ["daily", "endgames", "mygames", "openings", "play", "playLevel", "puzzles", "rank", "records", "settings", "streak", "three", "version"]);
});
test("首頁：「戰術謎題」入口已開放並顯示真實謎題分；puzzles.html 引用嘅檔案齊全", () => {
  const mods = require(path.join(ROOT, "js/modules.js"));
  eq(mods.filter(m => m.href).map(m => m.href), ["rules.html", "three.html", "puzzles.html", "play.html", "openings.html", "endgames.html", "mygames.html"]);
  const home = fs.readFileSync(path.join(ROOT, "js/home.js"), "utf8");
  ok(home.includes("homeState.puzzles.rating"), "首頁要用儲存嘅謎題分");
  ok(!/經驗/.test(home) && home.includes("Daily.titleInfo"));
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
  const R = CFG.REVIEW, T = R.WIN_CHANCE.THRESHOLDS;
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

/* ======================= 第 3 階段（對電腦下棋、賽後檢討）新增測試 ======================= */
const PLG = require(path.join(ROOT, "js/play-logic.js"));
const RV = require(path.join(ROOT, "js/review-logic.js"));
const vm = require("vm");
const playMoves = (g, sans) => { sans.forEach(s => g.move(s)); return g; };

/* ---------- 結束原因 ---------- */
test("對局結束原因：將死、逼和、三次重複、50 步、子力不足都正確判斷並有原因文字", () => {
  const mate = playMoves(new Chess(), ["f3", "e5", "g4", "Qh4#"]);
  eq(PLG.endState(mate), { over: true, result: "b", reason: "checkmate", text: "將死 Checkmate" });
  const stale = new Chess("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
  const st = PLG.endState(stale);
  eq([st.over, st.result, st.reason], [true, "draw", "stalemate"]); ok(st.text.includes("逼和"));
  const trip = playMoves(new Chess(), ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"]);
  const tr = PLG.endState(trip);
  eq([tr.over, tr.result, tr.reason], [true, "draw", "threefold"]); ok(tr.text.includes("三次重複"));
  const fifty = PLG.endState(new Chess("4k3/8/8/8/8/8/R7/4K3 w - - 100 80"));
  eq([fifty.over, fifty.result, fifty.reason], [true, "draw", "fifty"]); ok(fifty.text.includes("50 步"));
  const insuf = PLG.endState(new Chess("8/8/4k3/8/8/4K3/8/6N1 w - - 0 1"));
  eq([insuf.over, insuf.result, insuf.reason], [true, "draw", "insufficient"]); ok(insuf.text.includes("子力不足"));
  eq(PLG.endState(new Chess()).over, false);
  const white = playMoves(new Chess(), ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7#"]);
  eq(PLG.endState(white).result, "w", "白方將死 → 白勝");
  ok(PLG.REASON_TEXT.resign.includes("認輸"));
  eq(PLG.outcomeFor("w", "w"), "win"); eq(PLG.outcomeFor("w", "b"), "loss"); eq(PLG.outcomeFor("draw", "b"), "draw");
});

/* ---------- 被吃棋子同子力差 ---------- */
test("被吃的棋子同子力差：e4 d5 exd5 → 白吃一兵，+1；互換后之後差為 0；排序由大到小", () => {
  const g = playMoves(new Chess(), ["e4", "d5", "exd5"]);
  eq(PLG.materialInfo(g), { capturedByWhite: ["p"], capturedByBlack: [], diff: 1 });
  const h = playMoves(new Chess(), ["e4", "d5", "exd5", "Qxd5", "Nc3", "Qxg2"]);
  const mi = PLG.materialInfo(h);
  eq(mi.capturedByWhite, ["p"], "白吃咗黑兵一隻");
  eq(mi.capturedByBlack, ["p", "p"], "黑方吃咗 d5、g2 兩隻白兵");
  eq(mi.diff, -1);
  const big = PLG.materialInfo(playMoves(new Chess("4k3/8/8/8/8/8/8/R3K1q1 w - - 0 1"), ["Rxg1"].slice(0, 0)));
  eq(big.diff, 5 - 9);
  eq(PLG.materialInfo(new Chess()).diff, 0);
});

/* ---------- 悔棋、提示次數 ---------- */
test("悔棋：每局最多 3 次，一次退返雙方各一步；輪到電腦或玩家未走過就唔可以悔", () => {
  const g = new Chess();
  eq(PLG.undoPlies(g, "w"), 0, "未走棋");
  g.move("e4"); eq(PLG.undoPlies(g, "w"), 0, "輪到電腦");
  g.move("e5"); eq(PLG.undoPlies(g, "w"), 2, "玩家（白）走過一步，輪到玩家 → 退 2 個半步");
  eq(PLG.canUndo(g, "w", 0), true); eq(PLG.canUndo(g, "w", 2), true); eq(PLG.canUndo(g, "w", 3), false, "已用 3 次");
  // 玩家執黑：電腦先走
  const b = new Chess();
  b.move("e4"); eq(PLG.undoPlies(b, "b"), 0, "黑方未走過");
  b.move("e5"); b.move("Nf3"); eq(PLG.undoPlies(b, "b"), 2);
  b.undo(); b.undo(); eq(b.history().length, 1, "退 2 個半步後剩電腦首步");
  eq(PLG.undoPlies(b, "b"), 0, "退到只剩電腦首步，唔可以再退");
  eq(CFG.PLAY.undoLimit, 3);
});
test("提示：每局最多 3 次，只喺輪到玩家時可用；對局完結後唔可用", () => {
  const g = new Chess();
  eq(PLG.canHint(g, "w", 0), true); eq(PLG.canHint(g, "w", 2), true); eq(PLG.canHint(g, "w", 3), false);
  eq(PLG.canHint(g, "b", 0), false, "輪到白方，黑方玩家唔可以要提示");
  eq(PLG.canHint(playMoves(new Chess(), ["f3", "e5", "g4", "Qh4#"]), "w", 0), false, "已完結");
  eq(CFG.PLAY.hintLimit, 3);
});

/* ---------- 升級、降級 ---------- */
test("升級：同一級連贏 3 局自動升一級；用過悔棋／提示嘅勝局照計勝負，但唔計入連贏（亦唔中斷）", () => {
  let lv = PLG.emptyLevels();
  let r = PLG.applyResult(lv, 3, "win", true); lv = r.levels; eq([r.levelUp, lv[3].streak, lv[3].w], [false, 1, 1]);
  r = PLG.applyResult(lv, 3, "win", false); lv = r.levels;
  eq([r.levelUp, lv[3].streak, lv[3].w], [false, 1, 2], "用過悔棋／提示嘅勝局：勝場 +1，連贏不變");
  r = PLG.applyResult(lv, 3, "win", true); lv = r.levels; eq([r.levelUp, lv[3].streak], [false, 2]);
  r = PLG.applyResult(lv, 3, "win", true); lv = r.levels;
  eq([r.levelUp, r.newLevel, lv[3].streak, lv[3].w], [true, 4, 0, 4], "第 3 個乾淨勝局 → 升到第 4 級，連贏歸零");
  // 和棋同敗局會中斷連贏
  lv = PLG.emptyLevels();
  lv = PLG.applyResult(lv, 2, "win", true).levels; lv = PLG.applyResult(lv, 2, "win", true).levels;
  lv = PLG.applyResult(lv, 2, "draw", true).levels; eq(lv[2].streak, 0, "和棋中斷連贏");
  lv = PLG.applyResult(lv, 2, "win", true).levels; lv = PLG.applyResult(lv, 2, "win", true).levels;
  r = PLG.applyResult(lv, 2, "loss", true); eq([r.levels[2].streak, r.levelUp], [0, false], "敗局中斷連贏");
  // 最高級唔再升
  let top = PLG.emptyLevels();
  for (let i = 0; i < 3; i++) { r = PLG.applyResult(top, 8, "win", true); top = r.levels; }
  eq([r.levelUp, r.newLevel], [false, 8]);
  // 其他級別唔受影響；輸入唔被改動
  const before = PLG.emptyLevels(); const snap = JSON.stringify(before);
  PLG.applyResult(before, 5, "win", true); eq(JSON.stringify(before), snap, "不可改動傳入物件");
  eq(CFG.PLAY.winsToLevelUp, 3);
});
test("降級提示：同一級連輸 3 局先問「要不要降一級」（第 1 級唔問）；勝／和會中斷連輸；揀保持就歸零", () => {
  let lv = PLG.emptyLevels(), r;
  r = PLG.applyResult(lv, 4, "loss", true); lv = r.levels; eq([r.offerDrop, lv[4].lstreak, lv[4].l], [false, 1, 1]);
  r = PLG.applyResult(lv, 4, "loss", true); lv = r.levels; eq(r.offerDrop, false);
  r = PLG.applyResult(lv, 4, "loss", true); lv = r.levels; eq([r.offerDrop, r.newLevel], [true, 4], "提示唔會自動降級，newLevel 仍然係 4");
  lv = PLG.declineDrop(lv, 4); eq(lv[4].lstreak, 0, "揀保持：連輸歸零");
  r = PLG.applyResult(lv, 4, "loss", true); eq(r.offerDrop, false, "要再連輸 3 局先再問");
  // 勝／和中斷連輸
  lv = PLG.emptyLevels();
  lv = PLG.applyResult(lv, 6, "loss", true).levels; lv = PLG.applyResult(lv, 6, "loss", true).levels;
  r = PLG.applyResult(lv, 6, "draw", true); eq(r.levels[6].lstreak, 0);
  r = PLG.applyResult(lv, 6, "win", false); eq(r.levels[6].lstreak, 0, "用過悔棋嘅勝局仍然中斷連輸");
  // 第 1 級唔問
  lv = PLG.emptyLevels();
  for (let i = 0; i < 4; i++) { r = PLG.applyResult(lv, 1, "loss", true); lv = r.levels; eq(r.offerDrop, false); }
  eq(CFG.PLAY.lossesToOfferDrop, 3);
});

/* ---------- PGN ---------- */
test("PGN：可以用 chess.js 重新載入，步序、結果、級別、日期一致（勝／負／和、認輸、升變）", () => {
  const ucis = ["e2e4", "e7e5", "d1h5", "b8c6", "f1c4", "g8f6", "h5f7"];
  const pgn = PLG.buildPgn(Chess, ucis, { playerColor: "w", level: 4, result: "w", date: "2026-11-14", reason: "checkmate" });
  const g = new Chess(); g.loadPgn(pgn);
  eq(g.history({ verbose: true }).map(uciOf), ucis);
  eq(g.header().Result, "1-0"); eq(g.header().Date, "2026.11.14"); ok(g.header().Black.includes("Level 4")); eq(g.header().White, "Player");
  ok(g.isCheckmate());
  const draw = PLG.buildPgn(Chess, ["e2e4", "e7e5"], { playerColor: "b", level: 2, result: "draw", date: "2026-11-14" });
  const d = new Chess(); d.loadPgn(draw); eq(d.header().Result, "1/2-1/2"); eq(d.header().Black, "Player");
  const res = PLG.buildPgn(Chess, ["e2e4"], { playerColor: "w", level: 1, result: "b", date: "2026-11-14", reason: "resign" });
  const r = new Chess(); r.loadPgn(res); eq(r.header().Result, "0-1"); eq(r.header().Termination, "resign");
  const promo = ["a2a4", "b7b5", "a4b5", "a7a6", "b5a6", "c8b7", "a6b7", "b8c6", "b7a8q"];
  const pp = PLG.buildPgn(Chess, promo, { playerColor: "w", level: 1, result: null, date: "2026-11-14" });
  const p2 = new Chess(); p2.loadPgn(pp); eq(p2.history({ verbose: true }).map(uciOf), promo); eq(p2.header().Result, "*");
  let threw = false; try { PLG.buildPgn(Chess, ["e2e5"], { playerColor: "w", level: 1, result: null, date: "2026-11-14" }); } catch (e) { threw = true; }
  ok(threw, "不合法步序列要拋錯");
  eq(PLG.replay(Chess, ["e2e4", "e7e5"]).fen(), new Chess("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2").fen());
  eq(PLG.replay(Chess, ["e2e5"]), null);
});

/* ---------- 賽後檢討：分數損失、分類、原因、小結 ---------- */
const TAC = require(path.join(ROOT, "js/tactics.js"));
test("檢討：引擎分數換算（將死 ±MATE_CP、cp 上限）、終局分數", () => {
  const M = CFG.REVIEW.MATE_CP;
  eq(RV.scoreToCp({ cp: 35, mate: null }), 35); eq(RV.scoreToCp({ cp: 5000, mate: null }), M); eq(RV.scoreToCp({ cp: -5000, mate: null }), -M);
  eq(RV.scoreToCp({ cp: null, mate: 3 }), M); eq(RV.scoreToCp({ cp: null, mate: -2 }), -M); eq(RV.scoreToCp({ cp: null, mate: 0 }), -M);
  eq(RV.terminalScore(playMoves(new Chess(), ["f3", "e5", "g4", "Qh4#"])), -M, "被將死");
  eq(RV.terminalScore(new Chess("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")), 0, "逼和 = 0");
  eq(RV.terminalScore(new Chess()), null);
  eq(RV.lossCp(50, -50), 0); eq(RV.lossCp(50, 100), 150); eq(RV.lossCp(-30, 10), 0); eq(RV.lossCp(0, M), M);
});
test("檢討（勝率）：Lichess 勝率公式 wc(cp) = 2/(1+exp(−0.00368208×cp)) − 1；跌幅同分類（0.1／0.2／0.3）；已輸局面唔會再標大錯", () => {
  const W = CFG.REVIEW.WIN_CHANCE;
  eq(W.K, 0.00368208); eq(W.THRESHOLDS, { inaccuracy: 0.1, mistake: 0.2, blunder: 0.3 });
  ok(CFG.REVIEW.THRESHOLDS_CP === undefined, "舊 THRESHOLDS_CP 要刪走");
  const wc = cp => 2 / (1 + Math.exp(-0.00368208 * cp)) - 1;
  for (const cp of [0, 50, 100, 300, -300, 800, -1000, 1000]) ok(Math.abs(RV.winChance(cp) - wc(cp)) < 1e-12, "wc(" + cp + ")");
  eq(RV.winChance(0), 0);
  ok(Math.abs(RV.winChance(100) - 0.18207) < 1e-4, "wc(100) ≈ 0.182");
  ok(RV.winChance(-300) === -RV.winChance(300), "對稱");
  ok(RV.winChance(100) > RV.winChance(50) && RV.winChance(1000) < 1 && RV.winChance(-1000) > -1, "單調而且喺 −1 至 1 之間");
  eq(RV.winChance(5000), RV.winChance(CFG.REVIEW.MATE_CP), "超過上限會被夾住");
  eq(RV.winDrop(0, 0), 0); eq(RV.winDrop(100, 300), 0, "變好唔係跌幅");
  ok(Math.abs(RV.winDrop(0, -300) - 0.5 + 0) > 0 && RV.winDrop(0, -300) > 0.3, "0 → −300 跌幅 > 0.3");
  ok(Math.abs(RV.winDrop(300, -300) - 1.0) < 0.01, "+300 → −300：跌幅約 1.0");
  // 已輸局面：−1000 → −1000 以及 −800 → −1000 都唔係大錯
  eq(RV.winDrop(-1000, -1000), 0); eq(RV.classify(RV.winDrop(-1000, -1000)), null);
  eq(RV.classify(RV.winDrop(-800, -1000)), null, "已輸局面再多輸少少唔會標大錯");
  eq(RV.classify(RV.winDrop(-1000, -1000)), null);
  // 已經大勝：+1000 → +700 唔係錯
  eq(RV.classify(RV.winDrop(1000, 700)), null);
  // 邊界值（跌幅）
  eq(RV.classify(0), null); eq(RV.classify(0.0999), null); eq(RV.classify(0.1), "inaccuracy"); eq(RV.classify(0.1999), "inaccuracy");
  eq(RV.classify(0.2), "mistake"); eq(RV.classify(0.2999), "mistake"); eq(RV.classify(0.3), "blunder"); eq(RV.classify(1.5), "blunder");
  // 實際數例：均勢送兵（0 → −100）約 0.18 → 疑問手；送馬（0 → −300）→ 大錯；將死（0 → −1000）→ 大錯
  eq(RV.classify(RV.winDrop(0, -100)), "inaccuracy"); eq(RV.classify(RV.winDrop(0, -300)), "blunder"); eq(RV.classify(RV.winDrop(0, -1000)), "blunder");
  eq(RV.classify(RV.winDrop(0, -150)), "mistake");
  ok(RV.CLASS_NAME.blunder.includes("大錯") && RV.CLASS_NAME.mistake.includes("錯著") && RV.CLASS_NAME.inaccuracy.includes("疑問手"));
});
test("白吃計算：淨得益 = 被吃子價值 −（吃完會被吃返 ? 自己價值 : 0）；吃過路兵；排序；將死步；交換走棋方", () => {
  const free = fen => TAC.freeCaptures(Chess, new Chess(fen), 1);
  // 無保護嘅兵：淨得益 1
  eq(free("4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1").map(c => [c.move.san, c.gain]), [["exd5", 1]]);
  // 有保護嘅兵（被兵保護）：兵吃兵 1 − 1 = 0 → 唔算
  eq(free("4k3/8/2p5/3p4/4P3/8/8/4K3 w - - 0 1").length, 0);
  // 后吃有保護嘅兵：1 − 9 = −8 → 唔算
  eq(free("4k3/8/2p5/3p4/8/8/8/3QK3 w - - 0 1").length, 0);
  // 兵吃有保護嘅馬：3 − 1 = 2
  const pn = free("4k3/8/2p5/3n4/4P3/8/8/4K3 w - - 0 1"); eq(pn.map(c => [c.move.san, c.gain]), [["exd5", 2]]);
  // 車吃無保護嘅馬：3；吃有保護嘅馬：3 − 5 = −2
  eq(free("4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1").map(c => c.gain), [3]);
  eq(free("4k3/8/2p5/3n4/8/8/8/3RK3 w - - 0 1").length, 0, "馬被 c7 兵保護，車換馬唔白吃");
  // 吃過路兵算一個吃子（吃嘅係兵）
  const ep = free("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1"); eq(ep.map(c => [c.move.san, c.gain]), [["exd6", 1]]);
  // 排序：得益大嘅排前面
  const two = free("4k3/8/8/3n1p2/4P3/8/8/3RK3 w - - 0 1"); ok(two.length >= 2 && two[0].gain >= two[1].gain, "按得益排序");
  eq(TAC.captureGain(Chess, new Chess("4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1"), new Chess("4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1").moves({ verbose: true }).find(m => m.san === "e5")), 0, "非吃子 = 0");
  // 將死步
  eq(TAC.mateMoves(Chess, new Chess("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1")).map(m => m.san), ["Ra8#"]);
  eq(TAC.mateMoves(Chess, new Chess()).length, 0);
  // 交換走棋方
  const sw = TAC.swapTurn(Chess, "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
  eq(sw, "4k3/8/8/3pP3/8/8/8/4K3 b - - 0 1", "走棋方改為黑，吃過路兵格清走");
  eq(TAC.swapTurn(Chess, "4k3/8/8/8/8/8/4r3/4K3 w - - 0 1"), null, "走棋方被將軍 → 交換後唔合法 → null");
  eq(TAC.swapTurn(Chess, "garbage"), null);
  const swg = new Chess(sw); eq(swg.turn(), "b");
  ok(TAC.swapTurn(Chess, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1") !== null);
});
test("檢討（原因）：四種原因按次序判斷，只標第一個符合嘅：被將死 > 漏殺 > 送子 > 漏吃；判斷唔到就 null", () => {
  const rf = (fenBefore, uci, before, after) => RV.reasonFor(Chess, { fenBefore, uci, before, after, playerColor: new Chess(fenBefore).turn() });
  const hangFen = "r3k3/8/8/8/8/8/4Q3/4K3 w - - 0 1";       // 白后走去 a6 會被車白吃
  eq(rf(hangFen, "e2a6", { cp: 0, best: "e2e5" }, { cp: 900, best: "a8a6" }), "hang", "送子");
  // 1. 被將死 優先於 其他
  eq(rf(hangFen, "e2a6", { cp: 0, mate: 1, best: "e2e5" }, { mate: 2, best: "a8a6" }), "mated", "對手有將死 → 被將死（即使同時送子、漏殺）");
  // 2. 漏殺（3 步內有將死而玩家冇將死）優先於送子
  eq(rf(hangFen, "e2a6", { mate: 2, best: "e2e8" }, { cp: 900, best: "a8a6" }), "missedMate");
  eq(rf(hangFen, "e2a6", { mate: 3, best: "e2e8" }, { cp: 900, best: "a8a6" }), "missedMate", "3 步內都算");
  eq(rf(hangFen, "e2a6", { mate: 4, best: "e2e8" }, { cp: 900, best: "a8a6" }), "hang", "4 步將死唔算漏殺");
  eq(rf(hangFen, "e2a6", { mate: -2, best: "e2e8" }, { cp: 900, best: "a8a6" }), "hang", "走之前係被將死（負數）唔係漏殺");
  const mateFen = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";   // 白方 Ra8# 一步殺
  eq(rf(mateFen, "g2g3", { mate: 1, best: "a1a8" }, { cp: 50, best: "g8f8" }), "missedMate", "冇走將死嘅步");
  eq(rf(mateFen, "a1a8", { mate: 1, best: "a1a8" }, { cp: -1000, mate: 0, best: null }), null, "走咗將死嘅步 → 唔係漏殺（亦冇其他原因）");
  // 3. 送子 優先於 漏吃：后被車攻擊，玩家走王（唔吃車），之後對手可以吃后（王回吃，淨得益 9 − 5 = 4）
  const bothFen = "4k3/8/8/3n4/8/8/r3Q3/4K3 w - - 0 1";
  eq(rf(bothFen, "e1d1", { cp: 500, best: "e2a2" }, { cp: 400, best: "a2e2" }), "hang", "送子（同時漏吃 Qxa2）→ 標送子");
  // 4. 漏吃：最佳步係白吃（淨得益 >= 2），玩家走咗安全嘅閒著
  const missFen = "4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1";       // Rxd5 白吃馬（3 分）
  eq(rf(missFen, "e1e2", { cp: 300, best: "d1d5" }, { cp: -300, best: "e8e7" }), "missedCapture");
  eq(rf("4k3/8/8/3p4/8/8/8/3RK3 w - - 0 1", "e1e2", { cp: 100, best: "d1d5" }, { cp: -100, best: "e8e7" }), null, "最佳吃子淨得益只有 1 → 唔算漏吃");
  eq(rf(missFen, "d1d5", { cp: 300, best: "d1d5" }, { cp: -300, best: "e8e7" }), null, "玩家走咗最佳吃子 → 冇原因");
  // 判斷唔到：安全閒著、最佳步唔係吃子
  eq(rf("4k3/8/8/8/8/8/8/R3K3 w - - 0 1", "e1e2", { cp: 0, best: "a1a7" }, { cp: 0, best: "e8e7" }), null);
  eq(rf(missFen, "e1e2", { cp: 300, best: null }, { cp: 0, best: null }), null);
  eq(RV.REASON_TEXT, { mated: "沒有注意到對方可以將死", missedMate: "錯過了將死的機會", hang: "沒有注意到對方可以吃子", missedCapture: "錯過了白吃對方棋子的機會" });
});
test("檢討：小結文字（簡單書面語）；分辨唔到原因只講數目，唔亂作原因；四種原因都有書面語文字", () => {
  const mk = (cls, reason) => ({ cls, reason: reason || null });
  eq(RV.summarize([mk("blunder", "hang"), mk("blunder", "hang")]).text, "這局有 2 步大錯，都是沒有注意到對方可以吃子。");
  eq(RV.summarize([mk("blunder", "hang")]).text, "這局有 1 步大錯，是沒有注意到對方可以吃子。");
  eq(RV.summarize([mk("blunder"), mk("blunder")]).text, "這局有 2 步大錯。", "原因不明 → 只講數目");
  eq(RV.summarize([mk("blunder", "hang"), mk("blunder")]).text, "這局有 2 步大錯，其中 1 步是沒有注意到對方可以吃子。");
  eq(RV.summarize([mk("blunder", "hang"), mk("blunder", "mated")]).text, "這局有 2 步大錯。", "原因不一致 → 只講數目");
  eq(RV.summarize([mk("blunder", "mated")]).text, "這局有 1 步大錯，是沒有注意到對方可以將死。");
  eq(RV.summarize([mk("blunder", "missedMate"), mk("blunder", "missedMate")]).text, "這局有 2 步大錯，都是錯過了將死的機會。");
  eq(RV.summarize([mk("mistake", "missedCapture")]).text, "這局有 1 步錯著，是錯過了白吃對方棋子的機會。");
  eq(RV.summarize([mk("blunder"), mk("mistake"), mk("mistake"), mk("inaccuracy")]).text, "這局有 1 步大錯。另有 2 步錯著。還有 1 步疑問手。");
  eq(RV.summarize([mk("inaccuracy"), mk("inaccuracy")]).text, "這局沒有大錯和錯著。這局有 2 步疑問手。");
  eq(RV.summarize([mk(null), mk(null)]).text, "這局沒有大錯、錯著或疑問手。");
  eq(RV.summarize([mk("blunder", "hang"), mk("blunder", "hang")]).counts, { blunder: 2, mistake: 0, inaccuracy: 0 });
});


/* 假分析器：2 步貪心（子力 + 對手最佳吃子），輪到走棋方角度；足夠令「送后」變成大錯 */
function fakeAnalyze(Chess) {
  const V = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const mat = g => { let s = 0; g.board().forEach(r => r.forEach(p => { if (p) s += (p.color === "w" ? 1 : -1) * V[p.type]; })); return s; };
  return async fen => {
    const g = new Chess(fen), side = g.turn() === "w" ? 1 : -1;
    let best = null, bestScore = -1e9;
    for (const m of g.moves({ verbose: true })) {
      const c = new Chess(fen); c.move({ from: m.from, to: m.to, promotion: m.promotion });
      let oppGain = 0;
      for (const o of c.moves({ verbose: true })) if (o.captured) oppGain = Math.max(oppGain, V[o.captured]);
      const score = side * mat(c) - oppGain;
      if (c.isCheckmate()) { best = m.from + m.to + (m.promotion || ""); bestScore = 100; break; }
      if (score > bestScore) { bestScore = score; best = m.from + m.to + (m.promotion || ""); }
    }
    return { cp: Math.round(bestScore * 100), mate: null, best };
  };
}
test("檢討整局（假分析器，勝率分類）：送后被標為大錯並寫明原因；最佳步跌幅 0；進度回報同取消", async () => {
  const ucis = ["e2e4", "e7e5", "d1h5", "b8c6", "h5e5", "c6e5"];       // 白方 3.Qxe5+?? 送后
  const prog = [];
  const res = await RV.reviewGame(Chess, ucis, "w", fakeAnalyze(Chess), { onProgress: (d, t) => prog.push([d, t]) });
  eq(res.cancelled, false);
  eq(res.moves.length, 3, "只分析玩家（白方）自己嘅步");
  eq(prog, [[1, 3], [2, 3], [3, 3]]);
  const last = res.moves[2];
  eq([last.san, last.cls, last.reason, last.moveNo], ["Qxe5+", "blunder", "hang", 3]);
  ok(last.drop >= 0.3 && last.lossCp >= 300, "勝率跌幅 " + last.drop.toFixed(2) + "、損失 " + last.lossCp + " cp");
  ok(last.bestUci && last.bestSan && last.bestUci !== last.uci, "有較好走法：" + last.bestSan);
  eq(res.moves[0].cls, null); eq(res.moves[0].drop, 0);
  eq(res.summary.text, "這局有 1 步大錯，是沒有注意到對方可以吃子。");
  const asBlack = await RV.reviewGame(Chess, ["e2e4", "e7e5"], "b", fakeAnalyze(Chess));
  eq(asBlack.moves.length, 1); eq(asBlack.moves[0].san, "e5");
  let calls = 0;
  const cancelled = await RV.reviewGame(Chess, ucis, "w", async f => { calls++; return fakeAnalyze(Chess)(f); }, { shouldCancel: () => calls >= 2 });
  eq(cancelled.cancelled, true); eq(cancelled.summary, null);
  const mate = await RV.reviewGame(Chess, ["f2f3", "e7e5", "g2g4", "d8h4"], "b", fakeAnalyze(Chess));
  eq(mate.moves[mate.moves.length - 1].san, "Qh4#"); eq(mate.moves[mate.moves.length - 1].drop, 0);
  let n = 0;
  await RV.reviewGame(Chess, ["e2e4", "e7e5", "g1f3", "b8c6"], "w", async f => { n++; return fakeAnalyze(Chess)(f); });
  ok(n <= 4, "分析次數 " + n);
});
test("檢討整局：走出將死劣勢 → 大錯（被將死）；錯過一步殺 → 大錯（漏殺）；已輸局面再走錯唔再標大錯", async () => {
  const analyzeMated = async fen => {
    if (fen.startsWith("rnbqkbnr/pppppppp/8/8/8/5P2/PPPPP1PP/RNBQKBNR b")) return { cp: null, mate: 1, best: "e7e5" };   // 1.f3 之後，黑方有將死（假設）
    return { cp: 0, mate: null, best: "e2e4" };
  };
  const res = await RV.reviewGame(Chess, ["f2f3", "e7e5"], "w", analyzeMated);
  eq([res.moves[0].cls, res.moves[0].reason, res.moves[0].lossCp], ["blunder", "mated", 1000]);
  ok(res.summary.text.includes("可以將死") && res.moves[0].drop > 0.9);
  // 漏殺：黑方喺 1.f3 e5 2.g4 之後有 Qh4# 但走咗 Nc6
  const analyzeMiss = async fen => {
    if (fen.startsWith("rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b")) return { cp: null, mate: 1, best: "d8h4" };
    if (fen.startsWith("r1bqkbnr/pppp1ppp/2n5/4p3/6P1/5P2/PPPPP2P/RNBQKBNR w")) return { cp: 100, mate: null, best: "d2d4" };
    return { cp: 0, mate: null, best: null };
  };
  const miss = await RV.reviewGame(Chess, ["f2f3", "e7e5", "g2g4", "b8c6"], "b", analyzeMiss);
  const m2 = miss.moves[miss.moves.length - 1];
  eq([m2.san, m2.cls, m2.reason], ["Nc6", "blunder", "missedMate"]);
  eq(miss.summary.text, "這局有 1 步大錯，是錯過了將死的機會。");
  // 已輸局面：之前已經 −1000，之後仍然 −1000 → 唔標
  const lost = await RV.reviewGame(Chess, ["e2e4", "e7e5"], "w", async f => ({ cp: -1000, mate: null, best: "a2a3" }));
  eq(lost.moves[0].cls, null); eq(lost.moves[0].drop, 0);
  eq(lost.summary.text, "這局沒有大錯、錯著或疑問手。");
});

/* ---------- 儲存：對局狀態 ---------- */
test("儲存（play 欄位）：白名單清洗、最近 20 局、不存分析過程、進行中對局保存／恢復、備份往返", () => {
  eq(State.defaultState().play.current, null); eq(State.defaultState().play.recent, []);
  eq(Object.keys(State.defaultState().play.levels).length, 8);
  const dirty = {
    play: {
      levels: { 3: { w: 2, d: 1, l: 4, streak: 1, lstreak: 2, extra: 9 }, 9: { w: 1 } },
      current: { level: 99, color: "x", moves: ["e2e4", "ZZ", "e7e5", "a1a9"], undos: 9, hints: -1, usedUndo: 1, usedHint: true, analysis: [1, 2, 3] },
      recent: Array.from({ length: 25 }, (_, i) => ({ date: "2026-11-14", level: 3, color: "w", result: "win", reason: "weird", pgn: "1. e4 e5", blunders: i === 0 ? null : 2, plies: 2, analysis: { moves: [1] } })),
      junk: 1
    }
  };
  const n = State.normalizeState(dirty).play;
  eq(Object.keys(n).sort(), ["current", "levels", "recent"]);
  eq(n.levels[3], { w: 2, d: 1, l: 4, streak: 1, lstreak: 2 });
  eq(Object.keys(n.levels).length, 8, "只有 1–8 級");
  eq(n.current, { level: 8, color: "w", moves: ["e2e4", "e7e5"], undos: 3, hints: 0, usedUndo: false, usedHint: true });
  eq(n.recent.length, 20);
  eq(Object.keys(n.recent[0]).sort(), ["blunders", "color", "date", "level", "pgn", "plies", "reason", "result"], "recent 只有指定欄位（冇分析過程）");
  eq(n.recent[0].blunders, null); eq(n.recent[1].blunders, 2); eq(n.recent[1].reason, "draw", "不明原因會被清洗");
  const s = State.normalizeState({ playLevel: 5, play: { levels: { 5: { w: 3, d: 0, l: 1, streak: 2, lstreak: 0 } }, current: { level: 5, color: "b", moves: ["e2e4"], undos: 1, hints: 2, usedUndo: true, usedHint: true }, recent: [{ date: "2026-11-14", level: 5, color: "b", result: "loss", reason: "resign", pgn: "1. e4 *", blunders: 3, plies: 1 }] } });
  eq(State.parseBackup(State.exportBackup(s)), s, "備份往返");
  eq(Object.keys(State.STATE_FIELDS).sort(), ["daily", "endgames", "mygames", "openings", "play", "playLevel", "puzzles", "rank", "records", "settings", "streak", "three", "version"]);
});
test("進行中對局：保存（localStorage）→ 恢復 → 重播出同一個局面；中途離開後可以繼續", () => {
  const store = {};
  global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  try {
    const g = playMoves(new Chess(), ["e4", "e5", "Nf3", "Nc6", "Bb5"]);
    const s = State.loadState();
    s.play.current = { level: 6, color: "b", moves: g.history({ verbose: true }).map(uciOf), undos: 1, hints: 2, usedUndo: true, usedHint: true };
    State.saveState(s);
    ok("chessops_state" in store);
    const back = State.loadState().play.current;
    eq(back.level, 6); eq(back.color, "b"); eq(back.hints, 2); eq(back.usedUndo, true);
    eq(PLG.replay(Chess, back.moves).fen(), g.fen(), "重播後局面一致");
    // 損壞嘅儲存內容：恢復時重播失敗要能偵測（回傳 null），唔會當機
    store.chessops_state = JSON.stringify({ play: { current: { level: 3, color: "w", moves: ["e2e4", "e2e4"] } } });
    eq(PLG.replay(Chess, State.loadState().play.current.moves), null);
  } finally { delete global.localStorage; }
});

/* ---------- 引擎穩定（EngineManager）：載入失敗、無回應、重新載入、冷卻、退回 ---------- */
function loadManager(fakeEngineFactory) {
  const sandbox = { setTimeout, clearTimeout, Date, Promise, performance, console };
  sandbox.self = sandbox;
  sandbox.ChessOps = { Config: CFG, Engine: fakeEngineFactory };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "js/engine-manager.js"), "utf8"), sandbox);
  return sandbox.ChessOps.EngineManager;
}
test("引擎穩定：正常載入有進度狀態；搜尋出錯會自動重新載入並由同一局面重試；全部失敗拋錯並進入冷卻（唔會卡死）", async () => {
  const created = []; let plan = [];     // plan：每個新引擎嘅行為
  function FakeEngine() { this.behaviour = plan.shift() || { init: "ok", move: "ok" }; this.id = created.length; created.push(this); this.terminated = false; this.lastInfo = { depth: 1, cp: 10, mate: null, pv: [] }; }
  FakeEngine.prototype.init = function () { return this.behaviour.init === "ok" ? Promise.resolve({}) : this.behaviour.init === "hang" ? new Promise(() => {}) : Promise.reject(new Error("init 失敗")); };
  FakeEngine.prototype.bestMove = function (fen) { return this.behaviour.move === "ok" ? Promise.resolve("e2e4") : this.behaviour.move === "hang" ? new Promise(() => {}) : Promise.reject(new Error("worker 出錯")); };
  FakeEngine.prototype.terminate = function () { this.terminated = true; };
  FakeEngine.prototype.stop = function () {};
  const EM = loadManager(FakeEngine);
  const cfgBackup = JSON.stringify(CFG.ENGINE);
  CFG.ENGINE.initTimeoutMs = 60; CFG.ENGINE.moveTimeoutMs = 60; CFG.ENGINE.coolDownMs = 150;
  try {
    // (a) 正常：loading → ready
    let st = []; let mgr = new EM("x.js", s => st.push(s));
    plan = [{ init: "ok", move: "ok" }];
    eq((await mgr.run("fen", {})).uci, "e2e4"); eq(st, ["loading", "ready"]); eq(created.length, 1);
    // (b) 搜尋出錯：自動重新載入新引擎並重試成功
    st = []; created.length = 0; mgr = new EM("x.js", s => st.push(s));
    plan = [{ init: "ok", move: "error" }, { init: "ok", move: "ok" }];
    eq((await mgr.run("fen", {})).uci, "e2e4");
    eq(created.length, 2, "重新載入咗一個新引擎"); ok(created[0].terminated, "舊引擎已終止"); ok(st.includes("recovering"));
    // (c) 搜尋無回應（逾時）：同樣重新載入並成功
    created.length = 0; mgr = new EM("x.js", () => {});
    plan = [{ init: "ok", move: "hang" }, { init: "ok", move: "ok" }];
    eq((await mgr.run("fen", {})).uci, "e2e4"); eq(created.length, 2);
    // (d) 載入無回應（逾時）：重新載入成功
    created.length = 0; mgr = new EM("x.js", () => {});
    plan = [{ init: "hang" }, { init: "ok", move: "ok" }];
    eq((await mgr.run("fen", {})).uci, "e2e4"); eq(created.length, 2);
    // (e) 全部失敗：拋錯、狀態 failed、冷卻期內即刻拋錯（唔再建立引擎）
    created.length = 0; st = []; mgr = new EM("x.js", s => st.push(s));
    plan = [{ init: "fail" }, { init: "fail" }];
    let threw = null; try { await mgr.run("fen", {}); } catch (e) { threw = e; }
    ok(threw, "全部失敗要拋錯"); ok(st.includes("failed")); eq(created.length, 2);
    const t0 = Date.now(); let threw2 = false;
    try { await mgr.run("fen", {}); } catch (e) { threw2 = true; }
    ok(threw2 && created.length === 2 && Date.now() - t0 < 50, "冷卻期內即刻拋錯，唔再等");
    // pickMove 配合：引擎不可用 → 退回隨機合法步（唔卡死）
    const game = new Chess(POSITIONS.middlegame);
    const r = await PM.pickMove(8, game, { Chess, engine: mgr, rng: mulberry32(3) });
    ok(r && isLegal(game, r.move) && r.source === "fallback", "退回隨機合法步");
    // 冷卻期過後（或 reset）可以恢復
    plan = [{ init: "ok", move: "ok" }];
    mgr.reset();
    eq((await mgr.run("fen", {})).uci, "e2e4");
    // (f) 排隊：同時兩個呼叫按次序完成
    created.length = 0; mgr = new EM("x.js", () => {});
    plan = [{ init: "ok", move: "ok" }];
    const order = [];
    await Promise.all([mgr.run("a", {}).then(() => order.push(1)), mgr.run("b", {}).then(() => order.push(2))]);
    eq(order, [1, 2]); eq(created.length, 1, "兩次搜尋共用同一個引擎");
  } finally { Object.assign(CFG.ENGINE, JSON.parse(cfgBackup)); }
});

/* ---------- 原始碼規範 ---------- */
test("對電腦下棋：用 App 內對話框（唔用 alert／confirm／prompt）；提示用 Stockfish 全力設定；引擎設定唔含弱化參數", () => {
  for (const f of walk(path.join(ROOT, "js"), [".js"])) {
    const src = stripComments(fs.readFileSync(f, "utf8"), "js");
    ok(!/\b(alert|confirm|prompt)\s*\(/.test(src), path.relative(ROOT, f) + " 唔應該用瀏覽器對話框");
  }
  const play = fs.readFileSync(path.join(ROOT, "js/play.js"), "utf8");
  ok(play.includes("mgr.run(board.game.fen(), CFG.HINT)"), "提示用 config.HINT");
  ok(!("skill" in CFG.HINT) && !("elo" in CFG.HINT), "提示唔可以用弱化設定（Skill Level／UCI_Elo）");
  ok(CFG.HINT.depth >= CFG.PICKMOVE.BEST_SEARCH.depth, "提示深度 >= 電腦「最佳步」深度");
  ok(play.includes("CFG.REVIEW.maxMsPerMove") && play.includes("CFG.THINK_PAUSE"), "檢討時間同出棋停頓來自 config");
  ok(fs.readFileSync(path.join(ROOT, "css/theme.css"), "utf8").includes(".invisible"));
});
test("首頁：「對電腦下棋」已開放，顯示目前級別（真實數字）；play.html 引用檔案齊全", () => {
  const mods = require(path.join(ROOT, "js/modules.js"));
  eq(mods.filter(m => m.href).map(m => m.href), ["rules.html", "three.html", "puzzles.html", "play.html", "openings.html", "endgames.html", "mygames.html"]);
  const home = fs.readFileSync(path.join(ROOT, "js/home.js"), "utf8");
  ok(home.includes("homeState.playLevel") && home.includes("目前第 "));
  const html = fs.readFileSync(path.join(ROOT, "play.html"), "utf8");
  for (const f of ["js/config.js", "js/pickmove.js", "js/engine.js", "js/engine-manager.js", "js/play-logic.js", "js/review-logic.js", "js/dialog.js", "js/play.js"]) ok(html.includes(f), "play.html 應引用 " + f);
  ok(html.indexOf("js/config.js") < html.indexOf("js/pickmove.js"), "config.js 要喺 pickmove.js 之前");
});

/* ======================= 第 4 階段（走棋前三問、開局訓練、檢討改良）新增測試 ======================= */
const TL = require(path.join(ROOT, "js/three-logic.js"));
const THREE = require(path.join(ROOT, "data/three.js"));
const OPEN = require(path.join(ROOT, "data/openings.js"));
const OL = require(path.join(ROOT, "js/openings-logic.js"));

/* ---------- 走棋前三問：答案計算 ---------- */
test("三問：Q1（假如輪到對方走）要交換走棋方：吃過路兵格清走、走棋方被將軍就不用；Q2 同 Q3 嘅答案計算", () => {
  // Q1 威脅：白方走棋，黑車可以白吃白馬（假如輪到黑方）
  const r = TL.analyzeQ12(Chess, "4k3/8/8/3p4/8/8/8/R3K3 w - - 0 1");
  eq(r.q2.kind, "none", "車 a1 吃唔到任何子");
  eq(r.q1.kind, "none");
  // 對方可以白吃我嘅馬：黑方象 b4 攻擊白馬 e1？ 用明確局面：白馬 d4 無保護，黑后 d8 對住
  const t1 = TL.analyzeQ12(Chess, "3qk3/8/8/8/3N4/8/8/4K3 w - - 0 1");
  eq([t1.q1.kind, t1.q1.squares], ["squares", ["d4"]], "假如輪到黑方，黑后可以白吃 d4 的馬");
  ok(t1.q1.text.includes("對方的后可以吃掉你沒有保護的 d4 馬"), t1.q1.text);
  eq(t1.q2.kind, "none", "白馬吃唔到任何子，亦冇一步將死");
});
test("三問：交換走棋方後仍然唔合法嘅局面唔用（走棋方被將軍）；同時有將死同白吃嘅局面（答案有歧義）唔用", () => {
  eq(TL.analyzeQ12(Chess, "4k3/8/8/8/8/8/4r3/4K3 w - - 0 1"), null, "白王被將軍");
  eq(TL.analyzeQ12(Chess, "garbage"), null);
  // 白方有 Ra8#（將死），同時有可以白吃嘅子 → 歧義 → null
  eq(TL.analyzeQ12(Chess, "6k1/5ppp/8/8/3n4/8/5PPP/R2R2K1 w - - 0 1"), null);
  // 吃過路兵格：Q1 用嘅交換 FEN 唔含 ep
  const swapped = TAC.swapTurn(Chess, "rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3");
  ok(swapped && swapped.split(" ")[3] === "-" && swapped.split(" ")[1] === "b");
});
test("三問：Q3 候選步——1 個不安全（送子或被將死）、2 個安全；不用被排除嘅步；候選步都係「自然」嘅步", () => {
  const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3";
  let got = 0;
  for (let seed = 1; seed <= 30 && got < 5; seed++) {
    const q3 = TL.pickQ3(Chess, fen, mulberry32(seed), ["g8f6"]);
    if (!q3) continue;
    got++;
    eq(q3.options.length, 3); ok(q3.options.some(o => o.uci === q3.answer));
    ok(TL.checkQ3(Chess, fen, q3), "checkQ3");
    ok(!q3.options.some(o => o.uci === "g8f6"), "排除嘅步唔會出現");
    const g = new Chess(fen);
    q3.options.forEach(o => ok(TL.natural(g.moves({ verbose: true }).find(m => uciOf(m) === o.uci)), o.san + " 係自然嘅步"));
    ok(q3.text.includes("另外兩步是安全的"));
  }
  ok(got >= 3, "應該揀到候選步");
  // 懲罰細節：走 Qh5?? 之類
  const g = new Chess("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  eq(TL.punishment(Chess, g, g.moves({ verbose: true }).find(m => m.san === "e4")), null, "e4 安全");
  const g2 = new Chess("r3k3/8/8/8/8/8/4Q3/4K3 w - - 0 1");
  const bad = TL.punishment(Chess, g2, g2.moves({ verbose: true }).find(m => m.san === "Qa6"));
  eq(bad.kind, "capture"); ok(bad.text.includes("對方的車可以吃掉") && bad.text.includes("Qa6"));
  const g3 = new Chess("6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 1");
  const mt = TL.punishment(Chess, g3, g3.moves({ verbose: true }).find(m => m.san === "h6"));
  eq(mt, null, "h6 後 Ra8+ Kh7 唔係將死 → 安全");
});

/* ---------- 走棋前三問：題庫（60 題）逐題重新計算 ---------- */
test("三問題庫：60 題原有主題（四個主題各 15 題）、分數 400–1100、Lichess id；局面係「對手第一步走完」之後（另外 10 題「對方威脅將死」見第 5 階段測試）", () => {
  const T60 = THREE.filter(q => q.theme !== "mateThreat");
  eq(T60.length, 60);
  const themes = {}; T60.forEach(q => { themes[q.theme] = (themes[q.theme] || 0) + 1; });
  eq([themes.hangingPiece, themes.fork, themes.pin, themes.mateIn1], [15, 15, 15, 15]); eq(Object.keys(themes).length, 4);
  eq(new Set(THREE.map(q => q.id)).size, THREE.length);
  const byId = {}; PUZZLES.forEach(p => { byId[p.id] = p; });
  for (const q of T60) {
    const p = byId[q.id];
    ok(p, q.id + " 應該係 data/puzzles 內嘅 Lichess 謎題");
    ok(q.rating === p.rating && q.rating >= 400 && q.rating <= 1100, q.id + " 分數");
    ok(p.themes.includes(q.theme), q.id + " 主題");
    const g = new Chess(p.fen); g.move({ from: p.moves[0].slice(0, 2), to: p.moves[0].slice(2, 4), promotion: p.moves[0][4] });
    eq(q.fen, g.fen(), q.id + " 局面應該係對手第一步走完之後");
  }
});
test("三問題庫：每一題 Q1／Q2／Q3 答案都用程式重新計算並核對（唔合法交換局面、歧義局面已排除）；答案類型有變化", () => {
  const kinds = { q1: {}, q2: {} };
  for (const q of THREE) {
    const r = TL.analyzeQ12(Chess, q.fen);
    ok(r, q.id + " 局面應該適用");
    eq([q.q1.kind, q.q1.squares, q.q1.text], [r.q1.kind, r.q1.squares, r.q1.text], q.id + " Q1");
    eq([q.q2.kind, q.q2.squares, q.q2.text], [r.q2.kind, r.q2.squares, r.q2.text], q.id + " Q2");
    ok(TL.checkQ3(Chess, q.fen, q.q3), q.id + " Q3：恰好 1 個不安全、2 個安全");
    ok(q.q3.text.length > 10 && q.q1.text.length > 10 && q.q2.text.length > 10, q.id + " 有解釋");
    // 獨立核對：Q1／Q2 嘅 squares 係正確一方嘅棋子；mate 類有將死步；Q3 候選步唔含謎題答案
    const side = q.fen.split(" ")[1];
    const g = new Chess(q.fen);
    q.q2.squares.forEach(s => ok(g.get(s) && g.get(s).color !== side, q.id + " Q2 格 " + s + " 應該係對方棋子"));
    q.q1.squares.forEach(s => ok(g.get(s) && g.get(s).color === side, q.id + " Q1 格 " + s + " 應該係己方棋子"));
    if (q.q2.kind === "mate") ok(TAC.mateMoves(Chess, g).length >= 1, q.id + " Q2 要有一步將死");
    const p = PUZZLES.find(x => x.id === q.id);
    if (q.theme !== "mateThreat") ok(!q.q3.options.some(o => o.uci === p.moves[1]), q.id + " Q3 候選步唔含謎題答案");
    eq(new Set(q.q3.options.map(o => o.uci)).size, 3);
    kinds.q1[q.q1.kind] = (kinds.q1[q.q1.kind] || 0) + 1; kinds.q2[q.q2.kind] = (kinds.q2[q.q2.kind] || 0) + 1;
  }
  ok(kinds.q1.squares >= 20 && kinds.q1.none >= 10, "Q1 答案類型有變化：" + JSON.stringify(kinds.q1));
  ok(kinds.q2.squares >= 10 && kinds.q2.mate >= 10 && kinds.q2.none >= 5, "Q2 答案類型有變化：" + JSON.stringify(kinds.q2));
});

/* ---------- 開局訓練 ---------- */
test("開局路線：6 條路線，id 同儲存白名單一致；每步都用 chess.js 驗證合法；每步有一句解釋；路線同要求一致", () => {
  eq(OPEN.ROUTES.map(r => r.id).sort(), State.OPENING_ROUTE_IDS.slice().sort());
  const spec = {
    "w-italian": "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O",
    "w-two-knights": "e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O",
    "w-philidor": "e4 e5 Nf3 d6 d4",
    "b-italian": "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O",
    "b-scholar": "e4 e5 Qh5 Nc6 Bc4 g6 Qf3 Nf6",
    "b-bishop": "e4 e5 Bc4 Nf6"
  };
  for (const r of OPEN.ROUTES) {
    ok(r.moves.join(" ").startsWith(spec[r.id]), r.id + " 要包含指定嘅走法：" + spec[r.id]);
    const g = new Chess();
    r.moves.forEach((s, i) => { try { g.move(s); } catch (e) { throw new Error(r.id + " 第 " + (i + 1) + " 步 " + s + " 不合法"); } });
    eq(r.notes.length, r.moves.length, r.id + " 解釋數目");
    r.notes.forEach(n => ok(typeof n === "string" && n.length > 8 && n.endsWith("。"), r.id + " 解釋要係一句完整嘅話：" + n));
    ok(r.side === "w" || r.side === "b"); ok(r.title && r.desc);
  }
  eq(OPEN.ROUTES.filter(r => r.side === "w").length, 3); eq(OPEN.ROUTES.filter(r => r.side === "b").length, 3);
});
test("開局路線：學習者一方每一步已用 Stockfish 驗證勝率跌幅 < 0.1（儲存嘅驗證結果）；deph 14", () => {
  for (const r of OPEN.ROUTES) {
    eq(r.verify.depth, 14);
    ok(r.verify.maxDrop < 0.1, r.id + " 最大跌幅 " + r.verify.maxDrop);
    const learner = r.moves.length ? r.moves.filter((_, i) => (i % 2 === 0) === (r.side === "w")).length : 0;
    eq(r.verify.moves.length, learner, r.id + " 每個學習者步都有驗證紀錄");
    r.verify.moves.forEach(m => ok(m.drop < 0.1, r.id + " " + m.san + " 跌幅 " + m.drop));
  }
});
test("開局原則小測：10 題、每題 3 個合法選項；正確答案係 Stockfish 評價最好，而且比次好嘅勝率高至少 0.05（儲存嘅驗證數字，勝率同 cp 一致）", () => {
  eq(OPEN.QUIZ.length, 10);
  eq(new Set(OPEN.QUIZ.map(q => q.id)).size, 10);
  for (const q of OPEN.QUIZ) {
    const g = new Chess(q.fen);
    eq(g.turn(), q.turn);
    eq(q.options.length, 3);
    const legal = new Set(g.moves({ verbose: true }).map(uciOf));
    q.options.forEach(o => ok(legal.has(o.uci), q.id + " 選項 " + o.san + " 要合法"));
    ok(q.options.some(o => o.uci === q.answer), q.id + " 答案要喺選項內");
    q.options.forEach(o => ok(Math.abs(RV.winChance(o.cp) - o.wc) < 0.002, q.id + " " + o.san + " 勝率同 cp 要一致"));
    const sorted = q.options.slice().sort((a, b) => b.wc - a.wc);
    eq(sorted[0].uci, q.answer, q.id + " 正確答案要係 3 個選項之中最好");
    ok(sorted[0].wc - sorted[1].wc >= 0.05 - 1e-9, q.id + " 比次好至少 0.05：" + (sorted[0].wc - sorted[1].wc).toFixed(3));
    ok(q.explain && q.explain.length > 15, q.id + " 有解釋");
    // 局面由開局步序走出
    const g2 = new Chess(); q.prefix.forEach(s => g2.move(s)); eq(g2.fen(), q.fen);
  }
});
test("開局路線紀錄：連續 3 次全對 = 已掌握；走錯歸零；已掌握之後再走錯仍然已掌握", () => {
  let r = { streak: 0, mastered: false, runs: 0 };
  r = OL.applyRun(r, true); eq(r, { streak: 1, mastered: false, runs: 1 });
  r = OL.applyRun(r, true); eq(r, { streak: 2, mastered: false, runs: 2 });
  r = OL.applyRun(r, false); eq(r, { streak: 0, mastered: false, runs: 3 }, "走錯：連續歸零");
  r = OL.applyRun(r, true); r = OL.applyRun(r, true);
  eq(r.mastered, false); r = OL.applyRun(r, true); eq([r.streak, r.mastered, r.runs], [3, true, 6], "連續 3 次全對 → 已掌握");
  r = OL.applyRun(r, false); eq([r.streak, r.mastered], [0, true], "已掌握之後走錯：連續歸零但仍然已掌握");
  eq(OL.NEED, 3);
});

/* ---------- 三問提醒設定、儲存 ---------- */
test("設定「對局中顯示三問提醒」：預設開；false 會保留；非布林值當預設（開）；屬白名單；備份往返", () => {
  eq(State.defaultState().settings.threeReminder, true);
  eq(State.normalizeState({ settings: { threeReminder: false } }).settings.threeReminder, false);
  eq(State.normalizeState({ settings: { threeReminder: true } }).settings.threeReminder, true);
  eq(State.normalizeState({ settings: { squareNames: true } }).settings.threeReminder, true, "冇設定 → 預設開");
  eq(State.normalizeState({ settings: { threeReminder: "no" } }).settings.threeReminder, true);
  const s = State.normalizeState({ settings: { threeReminder: false, squareNames: true } });
  eq(State.parseBackup(State.exportBackup(s)).settings, { board: "chessground", design: "A", flipped: false, squareNames: true, threeReminder: false });
  const src = fs.readFileSync(path.join(ROOT, "js/play.js"), "utf8");
  ok(src.includes("先想三問：對方想做甚麼？我有機會嗎？這步安全嗎？") && src.includes("settings.threeReminder") && src.includes("收起"), "對局中提醒文字、設定同「收起」");
  ok(fs.readFileSync(path.join(ROOT, "settings.html"), "utf8").includes("對局中顯示三問提醒"));
});
test("儲存（three、openings 欄位）：白名單清洗、備份往返；首頁顯示真數字", () => {
  eq(State.defaultState().three, { plays: 0, asked: 0, correct: 0 });
  eq(State.normalizeState({ three: { plays: 2, asked: 30, correct: 99, x: 1 } }).three, { plays: 2, asked: 30, correct: 30 }, "答對不可以多過作答");
  const o = State.normalizeState({ openings: { routes: { "w-italian": { streak: 2, mastered: true, runs: 5, x: 1 }, nope: { streak: 1 } }, quiz: { plays: 3, best: 99, y: 1 } } }).openings;
  eq(Object.keys(o).sort(), ["quiz", "routes"]); eq(Object.keys(o.routes).sort(), State.OPENING_ROUTE_IDS.slice().sort());
  eq(o.routes["w-italian"], { streak: 2, mastered: true, runs: 5 }); eq(o.quiz, { plays: 3, best: 10 });
  const s = State.normalizeState({ three: { plays: 4, asked: 60, correct: 51 }, openings: { routes: { "b-scholar": { streak: 1, mastered: false, runs: 2 } }, quiz: { plays: 1, best: 8 } } });
  eq(State.parseBackup(State.exportBackup(s)), s, "備份往返");
  eq(Object.keys(State.STATE_FIELDS).sort(), ["daily", "endgames", "mygames", "openings", "play", "playLevel", "puzzles", "rank", "records", "settings", "streak", "three", "version"]);
  const home = fs.readFileSync(path.join(ROOT, "js/home.js"), "utf8");
  ok(home.includes("homeState.three.plays") && home.includes("homeState.openings.routes"), "首頁用儲存嘅真數字");
  const mods = require(path.join(ROOT, "js/modules.js"));
  eq(mods.filter(m => m.href).map(m => m.href), ["rules.html", "three.html", "puzzles.html", "play.html", "openings.html", "endgames.html", "mygames.html"]);
});
test("頁面：three.html／openings.html 引用嘅檔案齊全；play.html 有載入 tactics.js", () => {
  const th = fs.readFileSync(path.join(ROOT, "three.html"), "utf8"), oh = fs.readFileSync(path.join(ROOT, "openings.html"), "utf8");
  for (const f of ["data/three.js", "js/three.js", "js/state.js"]) ok(th.includes(f), "three.html 應引用 " + f);
  for (const f of ["data/openings.js", "js/openings.js", "js/openings-logic.js"]) ok(oh.includes(f), "openings.html 應引用 " + f);
  ok(fs.readFileSync(path.join(ROOT, "play.html"), "utf8").indexOf("js/tactics.js") < fs.readFileSync(path.join(ROOT, "play.html"), "utf8").indexOf("js/review-logic.js"), "tactics.js 要喺 review-logic.js 之前");
});

/* ======================= 第 5 階段（修正第 4 階段＋殘局訓練）新增測試 ======================= */
const EG = require(path.join(ROOT, "js/endgames-logic.js"));
const EGD = require(path.join(ROOT, "data/endgames.js"));
const EG_TOPICS = EGD.TOPICS;
const THREE_CHANGES = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/stage5-three-changes.json"), "utf8"));

/* ---------- A1：「白吃」要檢查吃返係咪合法 ---------- */
test("白吃（淨得益）：王唔可以吃返有後援保護嘅棋子（Qxf7+ 有 Bc4 保護，黑王吃唔返，得益 = 1）", () => {
  const g = new Chess("4k3/5p2/8/8/2B5/5Q2/8/4K3 w - - 0 1");
  const m = g.moves({ verbose: true }).find(x => x.san === "Qxf7+");
  eq(TAC.captureGain(Chess, g, m), 1, "黑王吃返 f7 唔合法（f7 有象保護）");
  // 對比：冇象保護，黑王吃得返 → 淨得益 = 1 − 9
  const g2 = new Chess("4k3/5p2/8/8/8/5Q2/8/4K3 w - - 0 1");
  eq(TAC.captureGain(Chess, g2, g2.moves({ verbose: true }).find(x => x.san === "Qxf7+")), 1 - 9, "冇保護：黑王可以吃返后");
});
test("白吃（淨得益）：被牽制嘅棋子唔可以吃返（Bd6 被 Rd1 牽制住 Kd8，Nxe5 之後 Bxe5 唔合法，得益 = 1）", () => {
  const g = new Chess("3k4/8/3b4/4p3/8/5N2/8/3R2K1 w - - 0 1");
  const m = g.moves({ verbose: true }).find(x => x.san === "Nxe5");
  eq(TAC.captureGain(Chess, g, m), 1, "象被牽制，吃返不合法");
  const g2 = new Chess("4k3/8/3b4/4p3/8/5N2/8/3R2K1 w - - 0 1");       // 黑王唔喺 d8，象冇被牽制
  eq(TAC.captureGain(Chess, g2, g2.moves({ verbose: true }).find(x => x.san === "Nxe5")), 1 - 3, "冇牽制：象吃得返");
});
test("白吃：真實謎題 WSU09、CxYbj（修正前判斷錯誤）重新計算：WSU09 Q1 包括 f7 兵；吃返不合法嘅吃子步淨得益正確", () => {
  const byId = {}; PUZZLES.forEach(p => { byId[p.id] = p; });
  const pos = id => { const p = byId[id], g = new Chess(p.fen), u = p.moves[0]; g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); return g.fen(); };
  const w = TL.analyzeQ12(Chess, pos("WSU09"));
  eq(w.q1.kind, "squares"); eq(w.q1.squares, ["b8", "f7"], "對方嘅后可以白吃 b8 車同 f7 兵（黑王吃返 f7 唔合法，因為 f1 嘅車保護）");
  eq(w.q2.kind, "mate");
  const c = TL.analyzeQ12(Chess, pos("CxYbj"));
  eq([c.q1.kind, c.q1.squares], ["squares", ["c5"]]); eq([c.q2.kind, c.q2.squares], ["squares", ["a4"]]);
  // 受影響嘅題目已經從題庫換走
  ["SB6PX", "EGXZl", "FYJaI", "QlYYC", "CxYbj", "WSU09", "0VOtI", "22FAH", "2cpHp"].forEach(id => ok(THREE_CHANGES.changed.some(x => x.id === id), id + " 應記錄為已更換"));
  THREE_CHANGES.changed.forEach(x => ok(!THREE.some(q => q.id === x.id), x.id + " 已從題庫換走"));
  eq(THREE_CHANGES.total, 70);
  eq(THREE_CHANGES.changed.length, THREE_CHANGES.replacedBy.length, "換走多少題就補返多少題");
});

/* ---------- A2：門檻放 config ---------- */
test("白吃門檻：三問用 1、賽後檢討嘅「送子」「漏吃」用 2，兩個數字都喺 config.js，程式冇寫死", () => {
  eq(CFG.TACTICS, { THREE_MIN_GAIN: 1, REVIEW_MIN_GAIN: 2 });
  const three = fs.readFileSync(path.join(ROOT, "js/three-logic.js"), "utf8"), rv = fs.readFileSync(path.join(ROOT, "js/review-logic.js"), "utf8");
  ok(three.includes("CFG.TACTICS.THREE_MIN_GAIN") && rv.includes("CFG.TACTICS.REVIEW_MIN_GAIN"));
  // 行為：白吃一隻兵（得益 1）：三問當有威脅；檢討唔當「送子」
  const g = new Chess("4k3/8/8/3p4/4P3/8/8/4K3 b - - 0 1");            // 黑方可以吃 e4 兵？e4 兵有冇保護：冇 → 得益 1
  ok(TAC.freeCaptures(Chess, g, CFG.TACTICS.THREE_MIN_GAIN).length === 1, "門檻 1：吃兵算白吃");
  eq(TAC.freeCaptures(Chess, g, CFG.TACTICS.REVIEW_MIN_GAIN).length, 0, "門檻 2：吃兵唔算「送子」");
  const q = TL.analyzeQ12(Chess, "4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1");
  eq(q.q1.kind, "squares", "三問：對方可以白吃我嘅兵");
});

/* ---------- A5：三問 70 題 ---------- */
test("三問題庫：70 題＝60 題原有主題（送子、捉雙、牽制、一步殺各 15）＋10 題「對方威脅將死」（謎題 FEN 本身）；條件全部重新驗證", () => {
  eq(THREE.length, 70);
  const themes = {}; THREE.forEach(q => { themes[q.theme] = (themes[q.theme] || 0) + 1; });
  eq([themes.hangingPiece, themes.fork, themes.pin, themes.mateIn1, themes.mateThreat], [15, 15, 15, 15, 10]);
  eq(new Set(THREE.map(q => q.id)).size, 70);
  const byId = {}; PUZZLES.forEach(p => { byId[p.id] = p; });
  for (const q of THREE.filter(x => x.theme === "mateThreat")) {
    const p = byId[q.id];
    ok(p && p.themes.includes("mateIn1"), q.id + " 應該係 Lichess mateIn1 謎題");
    eq(q.fen, p.fen, q.id + " 用謎題 FEN 本身（對手第一步之前）");
    const g = new Chess(q.fen);
    ok(!g.inCheck(), q.id + " 走棋方冇被將軍");
    const sw = TAC.swapTurn(Chess, q.fen);
    ok(sw, q.id + " 交換走棋方之後局面合法");
    ok(TAC.mateMoves(Chess, new Chess(sw)).length >= 1, q.id + " 交換走棋方之後有一步將死");
    eq(q.q1.kind, "mate", q.id + " Q1 答案係「對方威脅將死」");
    ok(q.q1.text.includes("將死你"), q.id + " Q1 解釋");
    ok(TL.checkQ3(Chess, q.fen, q.q3), q.id + " Q3 成立");
  }
  for (const q of THREE.filter(x => x.theme !== "mateThreat")) {
    const p = byId[q.id], g = new Chess(p.fen); g.move({ from: p.moves[0].slice(0, 2), to: p.moves[0].slice(2, 4), promotion: p.moves[0][4] });
    eq(q.fen, g.fen(), q.id + " 局面係對手第一步走完之後");
  }
});

/* ---------- A3：開局措辭修正 ---------- */
test("開局措辭修正：指定嘅句子已改，舊句子唔再出現（路線解釋同小測）", () => {
  const all = JSON.stringify(OPEN);
  for (const s of ["保護 e5 兵，但這樣會限制自己 f8 的象", "出馬擋住白后對 f7 的攻擊，同時出子，防守完成", "為日後推進 d4 做準備，爭取更多中心空間", "用馬吃回兵，馬同時佔據中心", "用馬吃回 d4 的兵，馬同時佔據中心", "急著"]) ok(all.includes(s), "應有：" + s);
  for (const s of ["限制自己 c8 的象", "出馬保護 f7，同時出子", "準備下一步 d4", "出子的同時奪回兵", "出子並奪回兵", "急着"]) ok(!all.includes(s), "不應再有：" + s);
  const italian = OPEN.ROUTES.filter(r => r.id.endsWith("italian"));
  eq(italian.length, 2);
  italian.forEach(r => ok(r.notes[r.moves.indexOf("c3")].includes("為日後推進 d4 做準備，爭取更多中心空間"), r.id + " 4.c3 句子"));
});

/* ---------- A4：「也可以」走法 ---------- */
test("開局「也可以」走法：每步最多 2 個；合法、唔係主線、係學習者嗰一步；Stockfish depth 14 勝率跌幅 < 0.03（儲存嘅驗證數字）", () => {
  let total = 0;
  for (const r of OPEN.ROUTES) {
    for (const k of Object.keys(r.alts || {})) {
      const ply = Number(k), list = r.alts[k];
      ok(ply < r.moves.length && (ply % 2 === 0) === (r.side === "w"), r.id + " 第 " + (ply + 1) + " 個半步要係學習者嘅一步");
      ok(list.length >= 1 && list.length <= 2, r.id + " 每步最多 2 個「也可以」");
      const g = new Chess(); r.moves.slice(0, ply).forEach(s => g.move(s));
      const main = uciOf(new Chess(g.fen()).move(r.moves[ply])), legal = new Set(g.moves({ verbose: true }).map(uciOf));
      list.forEach(a => {
        ok(legal.has(a.uci) && a.uci !== main, r.id + " 第 " + (ply + 1) + " 步 " + a.san + " 要合法而且唔係主線");
        eq(new Chess(g.fen()).move(a.uci.length === 5 ? { from: a.uci.slice(0, 2), to: a.uci.slice(2, 4), promotion: a.uci[4] } : { from: a.uci.slice(0, 2), to: a.uci.slice(2, 4) }).san, a.san);
        ok(a.drop < 0.03 && a.drop >= 0, r.id + " " + a.san + " 跌幅 " + a.drop);
        total++;
      });
    }
  }
  ok(total >= 20, "「也可以」走法總數：" + total);
  const src = fs.readFileSync(path.join(ROOT, "js/openings.js"), "utf8");
  ok(src.includes("也可以！") && src.includes("不過這條路線練習的是 ") && src.includes("請再走一次。"), "提示文字");
  const a0 = src.indexOf("else if (((route.alts"), a1 = src.indexOf("} else {", a0);
  ok(a0 > 0 && a1 > a0 && !src.slice(a0, a1).includes("mistakes++") && src.slice(a1).includes("mistakes++"), "「也可以」分支喺「走錯」之前判斷，內裡冇 mistakes++");
});

/* ---------- B：殘局資料 ---------- */
const blackToMove = fen => fen.replace(" w ", " b ");
function hangsAtStart(fen) {
  const gb = new Chess(blackToMove(fen));
  return gb.moves({ verbose: true }).some(m => { if (!(m.captured && m.piece === "k")) return false; const g2 = new Chess(blackToMove(fen)); g2.move(m); return !g2.isAttacked(m.to, "w"); });
}
function mateWithin(g, n) {
  for (const m of g.moves({ verbose: true })) {
    const c = new Chess(g.fen()); c.move(m);
    if (c.isCheckmate()) return true;
    if (n > 1 && !c.isGameOver() && c.moves({ verbose: true }).every(r => { const d = new Chess(c.fen()); d.move(r); return mateWithin(d, n - 1); })) return true;
  }
  return false;
}
test("殘局資料：4 個課題（后殺王、車殺王、雙車梯形殺、王兵對王），每個課題 6–8 題，3–5 步說明（書面語、完整句子），id 在儲存白名單內", () => {
  eq(EG_TOPICS.map(t => t.id), ["kqk", "krk", "k2rk", "kpk"]);
  eq(EG_TOPICS.map(t => t.title), ["后殺王", "車殺王", "雙車梯形殺", "王兵對王"]);
  for (const t of EG_TOPICS) {
    ok(t.positions.length >= 6 && t.positions.length <= 8, t.id + " 題數 " + t.positions.length);
    ok(t.steps.length >= 3 && t.steps.length <= 5, t.id + " 說明步數 " + t.steps.length);
    t.steps.forEach(s => ok(s.length > 10 && /[。？]$/.test(s), t.id + " 說明要係完整句子：" + s));
    t.positions.forEach((p, i) => { eq(p.id, t.id + "-" + (i + 1)); ok(State.ENDGAME_IDS.includes(p.id), p.id + " 要喺白名單"); });
  }
  eq(State.ENDGAME_IDS.length, 32);
});
test("殘局資料：每個局面合法、白先走、黑王冇被將軍、黑方有棋走（唔係一開始就逼和）、冇白子一開始就俾黑王白吃", () => {
  for (const t of EG_TOPICS) for (const p of t.positions) {
    const g = new Chess(p.fen);
    eq(g.turn(), "w", p.id + " 白先走");
    const bk = g.board().flat().find(x => x && x.type === "k" && x.color === "b");
    ok(!g.isAttacked(bk.square, "w"), p.id + " 黑王冇被將軍");
    ok(new Chess(blackToMove(p.fen)).moves().length > 0, p.id + " 黑方有棋走（冇一開始就逼和）");
    ok(!hangsAtStart(p.fen), p.id + " 冇白子一開始就俾黑王白吃");
    ok(g.moves().length > 0 && !g.isGameOver());
    const wp = g.board().flat().filter(x => x && x.color === "w" && x.type !== "k").map(x => x.type).sort().join("");
    const bp = g.board().flat().filter(x => x && x.color === "b" && x.type !== "k").length;
    eq(bp, 0, p.id + " 黑方只有王");
    eq(wp, t.id === "kqk" ? "q" : t.id === "krk" ? "r" : t.id === "k2rk" ? "rr" : "p", p.id + " 白方子力");
  }
});
test("殘局資料：殺王課題 shortest = 殘局庫將死步數 = Stockfish 將死步數；上限 = 2N + 5（最多 50）；由易到難（N 不減）；N ≤ 2 用 chess.js 窮舉重新驗證", () => {
  for (const t of EG_TOPICS.filter(x => x.task === "mate")) {
    let prev = 0;
    for (const p of t.positions) {
      eq(p.task, "mate"); eq(p.expect, "mate");
      eq(p.tb.category, "win"); eq(Math.ceil(p.tb.dtm / 2), p.shortest, p.id + " 殘局庫 DTM 同 N 一致");
      eq(p.sf.mate, p.shortest, p.id + " Stockfish 將死步數同 N 一致"); ok(p.sf.depth >= 20 || p.sf.ms >= 3000, p.id + " Stockfish 深度／時間 " + p.sf.depth + "／" + p.sf.ms);
      eq(p.cap, Math.min(50, p.shortest * 2 + 5), p.id + " 上限");
      ok(p.shortest >= prev, p.id + " 由易到難"); prev = p.shortest;
      ok(p.selfPlayMoves <= p.cap, p.id + " 自我對弈（提示線）步數 " + p.selfPlayMoves + " 喺上限內");
      if (p.shortest <= 2) {
        const g = new Chess(p.fen);
        ok(mateWithin(g, p.shortest), p.id + " 用 chess.js 窮舉：" + p.shortest + " 步內有將死");
        if (p.shortest === 2) ok(!mateWithin(g, 1), p.id + " 唔會一步將死");
      }
    }
  }
});
test("殘局資料：王兵對王——「贏」課題同「判斷」課題；預期結果同殘局庫、Stockfish 一致；兩種答案（能贏／和棋）都有", () => {
  const t = EG_TOPICS.find(x => x.id === "kpk");
  const kinds = {};
  for (const p of t.positions) {
    ok(["promote", "judge"].includes(p.task), p.id + " 課題");
    ok(["win", "draw"].includes(p.expect));
    eq(p.tb.category, p.expect, p.id + " 殘局庫結果同預期一致");
    if (p.expect === "win") ok(p.sf.mate > 0 || p.sf.cp >= CFG.ENDGAME.WIN_CP, p.id + " Stockfish 判斷白方贏：" + JSON.stringify(p.sf));
    else ok(p.sf.mate === null && Math.abs(p.sf.cp) <= 50, p.id + " Stockfish 判斷和棋：" + JSON.stringify(p.sf));
    if (p.task === "promote") { eq(p.expect, "win"); ok(p.shortest >= 1 && p.cap === Math.min(50, p.shortest * 2 + 5) && p.tip, p.id + " 升變步數／上限／提示"); }
    else ok(p.explain && p.explain.length > 10, p.id + " 判斷題要有解釋");
    kinds[p.task + ":" + p.expect] = (kinds[p.task + ":" + p.expect] || 0) + 1;
  }
  ok(kinds["promote:win"] >= 3 && kinds["judge:win"] >= 1 && kinds["judge:draw"] >= 1, "題型：" + JSON.stringify(kinds));
});

/* ---------- B：完成／失敗判斷、星星 ---------- */
const egCtx = (over) => Object.assign({ task: "mate", moves: 1, cap: 7, startMaterial: 1, sideJustMoved: "w", promoted: false }, over);
test("殘局判斷：將死＝成功；逼和＝失敗並顯示「逼和了！對方沒有棋可走，變成和棋。」；棋子被吃＝失敗；重複局面＝失敗", () => {
  const mate = new Chess("7k/6Q1/5K2/8/8/8/8/8 b - - 0 1");
  eq(mate.isCheckmate(), true); eq(EG.judge(mate, egCtx()).status, "success");
  const stale = new Chess("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
  eq(stale.isStalemate(), true);
  eq(EG.judge(stale, egCtx()), { status: "fail", reason: "stalemate", text: "逼和了！對方沒有棋可走，變成和棋。" });
  const lost = new Chess("8/8/8/8/8/8/8/K1k5 w - - 0 1");
  const j = EG.judge(lost, egCtx({ sideJustMoved: "b" }));
  eq([j.status, j.reason, j.text], ["fail", "lost", "棋子被對方的王吃掉了，變成和棋。"]);
  eq(EG.judge(lost, egCtx({ sideJustMoved: "b", task: "promote" })).text, "兵被對方的王吃掉了，變成和棋。");
  const rep = new Chess("7k/8/5K2/8/8/8/8/6Q1 w - - 0 1");
  ["Qg2", "Kh7", "Qg1", "Kh8", "Qg2", "Kh7", "Qg1", "Kh8"].forEach(s => rep.move(s));
  eq(EG.judge(rep, egCtx({ sideJustMoved: "b" })).reason, "repeat");
});
test("殘局判斷：步數上限（超過就失敗，顯示步數）；未到上限繼續；升變交俾引擎判斷", () => {
  const g = new Chess("7k/8/5K2/8/8/8/8/6Q1 b - - 0 1");
  eq(EG.judge(g, egCtx({ moves: 7, cap: 7, sideJustMoved: "b" })), { status: "fail", reason: "cap", text: "超過步數上限（7 步），這次沒有成功。" });
  eq(EG.judge(g, egCtx({ moves: 6, cap: 7, sideJustMoved: "b" })).status, "continue");
  eq(EG.judge(g, egCtx({ moves: 7, cap: 7, sideJustMoved: "w" })).status, "continue", "白方剛走完第 7 步，要等黑方回應先判斷（可能剛好將死）");
  eq(EG.judge(g, egCtx({ task: "promote", promoted: true })).status, "promoted");
});
test("王兵對王升變判斷：升變後仍然贏＝成功；后即刻俾吃＝失敗（說明原因）；仍然和棋＝失敗", () => {
  const safe = new Chess("8/3Q4/8/3K4/8/8/8/k7 b - - 0 1");                     // 后有保護，黑王遠
  eq(EG.promotionVerdict(safe, { cp: -900, mate: null }), { win: true });
  eq(EG.promotionVerdict(safe, { cp: null, mate: -5 }), { win: true });
  eq(EG.promotionVerdict(safe, { cp: -299, mate: null }).win, false, "門檻 300");
  eq(EG.promotionVerdict(safe, { cp: -300, mate: null }).win, true);
  const hang = new Chess("1k6/1Q6/8/8/8/8/8/K7 b - - 0 1");                       // 后喺 b7，黑王 b8 可以吃，冇保護
  eq(EG.promotionVerdict(hang, { cp: 0, mate: null }), { win: false, text: "升變之後，后馬上被對方的王吃掉了，變成和棋。" });
  eq(EG.promotionVerdict(safe, { cp: 0, mate: null }), { win: false, text: "升變之後，局面仍然只是和棋。" });
  eq(EG.promotionVerdict(safe, { cp: null, mate: 3 }).win, false);
});
test("殘局星星：3 星＝冇用提示而且步數 <= 最短 + 3；2 星＝冇用提示、喺上限內完成；1 星＝用過提示完成；失敗 0 星", () => {
  const s = (hints, moves, shortest) => EG.stars({ success: true, hints, moves, shortest });
  eq(s(0, 2, 2), 3); eq(s(0, 5, 2), 3, "最短 + 3 仍然 3 星"); eq(s(0, 6, 2), 2); eq(s(1, 2, 2), 1); eq(s(3, 20, 2), 1);
  eq(EG.stars({ success: false, hints: 0, moves: 3, shortest: 3 }), 0);
  eq(EG.moveCap(1), 7); eq(EG.moveCap(10), 25); eq(EG.moveCap(15), 35); eq(EG.moveCap(24), 50); eq(EG.moveCap(40), 50, "上限最多 50");
  eq(CFG.ENDGAME, { CAP_MULT: 2, CAP_ADD: 5, CAP_MAX: 50, STAR3_EXTRA: 3, HINT_LIMIT: 3, DEFENDER: { depth: 14 }, HINT: { depth: 14 }, WIN_CP: 300 });
  ok(!("skill" in CFG.ENDGAME.DEFENDER) && !("elo" in CFG.ENDGAME.DEFENDER), "黑方用 Stockfish 全力（唔降低強度）");
});
test("殘局紀錄：applyRun 記錄嘗試／成功次數、最佳星數、最少步數；失敗唔會洗走最佳；totals 計星數", () => {
  let e = EG.applyRun(undefined, { success: true, stars: 2, moves: 9 });
  eq(e, { stars: 2, wins: 1, runs: 1, best: 9 });
  e = EG.applyRun(e, { success: false, stars: 0, moves: 0 }); eq(e, { stars: 2, wins: 1, runs: 2, best: 9 });
  e = EG.applyRun(e, { success: true, stars: 3, moves: 6 }); eq(e, { stars: 3, wins: 2, runs: 3, best: 6 });
  e = EG.applyRun(e, { success: true, stars: 1, moves: 12 }); eq(e, { stars: 3, wins: 3, runs: 4, best: 6 }, "較差成績唔會降低最佳");
  const t = EG.totals(EG_TOPICS, { pos: { "kqk-1": { stars: 3 }, "krk-2": { stars: 1 }, "kpk-1": { stars: 2 } } });
  eq(t.got, 6); eq(t.all, EG_TOPICS.reduce((a, x) => a + x.positions.length * 3, 0));
  eq(EG.totals(EG_TOPICS, { pos: {} }).got, 0);
});

/* ---------- C：儲存 ---------- */
test("儲存（endgames 欄位）：預設、白名單清洗（未知 id、多餘欄位刪走、夾範圍）、備份往返、冪等", () => {
  eq(State.defaultState().endgames, { pos: {} });
  const n = State.normalizeState({ endgames: { pos: { "kqk-1": { stars: 9, wins: 3, runs: 1, best: 12, junk: 1 }, "kqk-9": { stars: 1 }, "xxx-1": { stars: 3 }, "kpk-2": { stars: -2, wins: "a", runs: 5, best: 7 } }, extra: 1 }, evil: 1 }).endgames;
  eq(Object.keys(n), ["pos"]);
  eq(n.pos["kqk-1"], { stars: 3, wins: 3, runs: 3, best: 12 }, "星數夾到 3；runs 不少於 wins");
  eq(n.pos["kpk-2"], { stars: 0, wins: 0, runs: 5, best: 7 });
  ok(!("kqk-9" in n.pos) && !("xxx-1" in n.pos), "未登記 id 刪走");
  eq(State.normalizeState({ endgames: "x" }).endgames, { pos: {} });
  eq(State.normalizeState({ endgames: { pos: [] } }).endgames, { pos: {} });
  const s = State.normalizeState({ endgames: { pos: { "k2rk-3": { stars: 2, wins: 4, runs: 6, best: 5 }, "kpk-1": { stars: 3, wins: 1, runs: 1, best: 0 } } } });
  eq(State.parseBackup(State.exportBackup(s)), s, "備份往返");
  eq(State.normalizeState(s), s, "冪等");
  eq(Object.keys(State.STATE_FIELDS).sort(), ["daily", "endgames", "mygames", "openings", "play", "playLevel", "puzzles", "rank", "records", "settings", "streak", "three", "version"]);
});
test("殘局頁面：endgames.html 引用檔案齊全（config、logic、data 次序正確）；首頁「殘局」入口顯示真實星數；殘局資料 id 全部可儲存", () => {
  const h = fs.readFileSync(path.join(ROOT, "endgames.html"), "utf8");
  for (const f of ["js/config.js", "js/engine.js", "js/engine-manager.js", "js/endgames-logic.js", "data/endgames.js", "js/endgames.js", "js/state.js"]) ok(h.includes(f), "endgames.html 應引用 " + f);
  ok(h.indexOf("js/config.js") < h.indexOf("js/endgames-logic.js"), "config.js 要喺 endgames-logic.js 之前");
  const idx = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  for (const f of ["js/config.js", "data/endgames.js", "js/endgames-logic.js"]) ok(idx.includes(f), "index.html 應引用 " + f);
  const home = fs.readFileSync(path.join(ROOT, "js/home.js"), "utf8");
  ok(home.includes("EndgamesLogic.totals") && home.includes("已取得 ") && home.includes(" 星"), "首頁用真實星數");
  const mods = require(path.join(ROOT, "js/modules.js"));
  eq(mods.find(m => m.name.startsWith("殘局")).href, "endgames.html");
  const js = fs.readFileSync(path.join(ROOT, "js/endgames.js"), "utf8");
  ok(js.includes("CFG.HINT_LIMIT") && js.includes("CFG.DEFENDER") && js.includes("CFG.HINT"), "引擎設定來自 config.ENDGAME");
  ok(js.includes("白方能贏") && js.includes("只能和棋") && js.includes("判斷：這局面能贏嗎？") && js.includes("白方贏：把兵升變為后"), "王兵對王兩種課題文字");
});

/* ======================= 第 6 階段（稱號、每日任務、週報、備份、我的對局）新增測試 ======================= */
const DAILY = require(path.join(ROOT, "js/daily.js"));
const RPT = require(path.join(ROOT, "js/report-logic.js"));
const MGL = require(path.join(ROOT, "js/mygames-logic.js"));
const EGD6 = require(path.join(ROOT, "data/endgames.js"));
const dt = (y, m, d, h, mi) => new Date(y, m - 1, d, h || 12, mi || 0);

/* ---------- A：車殺王說明卡 ---------- */
test("車殺王說明卡第 3 點已改為新句子，舊句子不再出現；其他說明卡不變（5 點）", () => {
  const krk = EGD6.TOPICS.find(t => t.id === "krk");
  eq(krk.steps.length, 5);
  eq(krk.steps[2], "兩個王面對面（中間隔一格，叫做「對王」）時，輪到你走就用車將軍，對方的王只能後退一行。");
  ok(!JSON.stringify(EGD6).includes("輪到對方走棋時，對方的王只能後退或讓開"), "舊句子不應再出現");
});

/* ---------- B：稱號 ---------- */
function mkState(o) {
  const s = State.defaultState();
  s.puzzles.rating = o.puzzle === undefined ? 700 : o.puzzle; s.playLevel = o.play === undefined ? 3 : o.play;
  const ids = State.OPENING_ROUTE_IDS;
  ids.forEach((id, i) => { s.openings.routes[id].mastered = i < (o.routes || 0); });
  if (o.rank !== undefined) s.rank.index = o.rank;
  return s;
}
const titleOf = (o) => DAILY.titleInfo(mkState(o), { stars: o.stars || 0 }).index;
test("稱號條件（config.TITLES）同指令完全一致：6 個稱號、各級數字", () => {
  eq(CFG.TITLES.NAMES, ["入門棋手", "俱樂部棋手", "候選大師", "國際棋聯大師", "國際大師", "特級大師"]);
  eq(CFG.TITLES.REQ[1], { mode: "any", conds: { puzzle: 800, play: 4 } });
  eq(CFG.TITLES.REQ[2], { mode: "all", conds: { puzzle: 950, play: 5 } });
  eq(CFG.TITLES.REQ[3], { mode: "all", conds: { puzzle: 1100, play: 6, stars: 40 } });
  eq(CFG.TITLES.REQ[4], { mode: "all", conds: { puzzle: 1250, play: 7, routes: 4 } });
  eq(CFG.TITLES.REQ[5], { mode: "all", conds: { puzzle: 1400, play: 8, stars: 70 } });
});
test("稱號計算：每個門檻上下（俱樂部：謎題分 800 或電腦第 4 級；其餘要全部達成；逐級取得）", () => {
  eq(titleOf({}), 0);
  eq(titleOf({ puzzle: 799, play: 3 }), 0); eq(titleOf({ puzzle: 800 }), 1); eq(titleOf({ puzzle: 700, play: 4 }), 1, "電腦第 4 級也可以");
  eq(titleOf({ puzzle: 949, play: 5 }), 1); eq(titleOf({ puzzle: 950, play: 4 }), 1); eq(titleOf({ puzzle: 950, play: 5 }), 2);
  eq(titleOf({ puzzle: 1100, play: 6, stars: 39 }), 2); eq(titleOf({ puzzle: 1099, play: 6, stars: 40 }), 2); eq(titleOf({ puzzle: 1100, play: 5, stars: 40 }), 2);
  eq(titleOf({ puzzle: 1100, play: 6, stars: 40 }), 3);
  eq(titleOf({ puzzle: 1250, play: 7, routes: 3, stars: 40 }), 3); eq(titleOf({ puzzle: 1249, play: 7, routes: 4, stars: 40 }), 3); eq(titleOf({ puzzle: 1250, play: 6, routes: 4, stars: 40 }), 3);
  eq(titleOf({ puzzle: 1250, play: 7, routes: 4, stars: 40 }), 4);
  eq(titleOf({ puzzle: 1400, play: 8, routes: 4, stars: 69 }), 4); eq(titleOf({ puzzle: 1399, play: 8, routes: 4, stars: 70 }), 4); eq(titleOf({ puzzle: 1400, play: 7, routes: 4, stars: 70 }), 4);
  eq(titleOf({ puzzle: 1400, play: 8, routes: 4, stars: 70 }), 5);
  eq(titleOf({ puzzle: 1400, play: 8, routes: 3, stars: 70 }), 3, "要逐級取得：未達國際大師（路線不足），特級大師唔會跳級");
  eq(DAILY.titleInfo(mkState({ puzzle: 1400, play: 8, routes: 6, stars: 84 }), { stars: 84 }).next, null, "最高級冇下一級");
});
test("稱號卡進度：每個條件有「現值 / 目標」（例如謎題分 812 / 950）；俱樂部條件係任一項", () => {
  const s = mkState({ puzzle: 812, play: 5, rank: 1 });
  const i = DAILY.titleInfo(s, { stars: 12 });
  eq(i.index, 1); eq(i.name, "俱樂部棋手"); eq(i.next.name, "候選大師"); eq(i.next.mode, "all");
  eq(i.next.conds.map(c => c.label + " " + c.have + " / " + c.need), ["謎題分 812 / 950", "電腦級別 5 / 5"]);
  eq(i.next.conds.map(c => c.ok), [false, true]);
  const i0 = DAILY.titleInfo(mkState({}), { stars: 0 });
  eq(i0.next.mode, "any"); eq(i0.next.conds.map(c => c.label + " " + c.have + " / " + c.need), ["謎題分 700 / 800", "電腦級別 3 / 4"]);
  const i3 = DAILY.titleInfo(mkState({ puzzle: 1100, play: 6, stars: 40 }), { stars: 40 });
  eq(i3.next.conds.map(c => c.label + " " + c.have + " / " + c.need), ["謎題分 1100 / 1250", "電腦級別 6 / 7", "已掌握開局路線 0 / 4"]);
  const home = fs.readFileSync(path.join(ROOT, "js/home.js"), "utf8"), idx = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  ok(home.includes("App 內稱號，與國際棋聯正式稱號無關") && home.includes('class: "muted fine"'), "稱號卡有註明");
  ok(/\.fine \{[^}]*font-size:\s*13px/.test(fs.readFileSync(path.join(ROOT, "css/theme.css"), "utf8")), "註明字體 13px（不細過 13px）");
  ok(idx.includes('id="title-card"') && idx.includes('id="daily-card"'));
});
test("升稱號恭喜只出一次：高過「最高已恭喜稱號」先恭喜；標記後唔再出；唔會降低；rank 欄位係唯一新增嘅稱號儲存", () => {
  const s = mkState({ puzzle: 950, play: 5 });                       // 候選大師（2）
  eq(DAILY.titleCongrats(s, { stars: 0 }), 2);
  DAILY.markCongratulated(s, 2);
  eq(DAILY.titleCongrats(s, { stars: 0 }), null, "已恭喜過");
  DAILY.markCongratulated(s, 1); eq(s.rank.index, 2, "唔會降低");
  const s2 = State.normalizeState(JSON.parse(JSON.stringify(s)));
  eq(DAILY.titleCongrats(s2, { stars: 0 }), null, "儲存再載入之後都唔會再恭喜");
  s2.puzzles.rating = 1100; s2.playLevel = 6;
  eq(DAILY.titleCongrats(s2, { stars: 40 }), 3, "再升級先再恭喜");
  eq(DAILY.titleCongrats(mkState({}), { stars: 0 }), null, "入門棋手冇恭喜");
  eq(State.defaultState().rank, { index: 0, xp: 0 });
});

/* ---------- C：每日任務、連續日數 ---------- */
test("每日任務：謎題 5 題 + 1 個小練習；星期一、三、五、日加「對電腦下一局」；其他日子唔顯示", () => {
  eq(CFG.DAILY, { PUZZLES: 5, PLAY_DAYS: [0, 1, 3, 5], KEEP_DAYS: 60, IDLE_MS: 120000 });
  const names = { 23: "一", 24: "二", 25: "三", 26: "四", 27: "五", 28: "六", 29: "日" };
  for (let d = 23; d <= 29; d++) {
    const st = DAILY.status(State.defaultState(), dt(2026, 11, d));
    const needPlay = [23, 25, 27, 29].includes(d);
    eq(st.items.map(i => i.id), needPlay ? ["puzzles", "mini", "play"] : ["puzzles", "mini"], "星期" + names[d]);
  }
  const s = State.defaultState(), tue = dt(2026, 11, 24);
  for (let i = 0; i < 4; i++) DAILY.apply(s, "puzzle", { ok: i % 2 === 0, delta: 3 }, tue);
  eq(DAILY.status(s, tue).items.find(i => i.id === "puzzles").have, 4);
  eq(DAILY.status(s, tue).done, false);
  DAILY.apply(s, "mini", {}, tue); eq(DAILY.status(s, tue).done, false, "謎題未夠 5 題");
  const r = DAILY.apply(s, "puzzle", { ok: true, delta: 3 }, tue);
  eq([r.done, r.newlyDone], [true, true], "星期二：5 題 + 小練習就完成（唔使對局）");
  ok(DAILY.status(s, tue).items.every(i => i.ok));
  const mon = dt(2026, 11, 23), s2 = State.defaultState();
  for (let i = 0; i < 5; i++) DAILY.apply(s2, "puzzle", { ok: true, delta: 0 }, mon);
  DAILY.apply(s2, "mini", {}, mon);
  eq(DAILY.status(s2, mon).done, false, "星期一要對局先完成");
  eq(DAILY.apply(s2, "play", { result: "loss" }, mon).newlyDone, true, "輸咗都算下咗一局");
});
test("每日任務：任何一種小練習都計（三問、小遊戲、殘局、開局）；每日紀錄記錄勝和負、謎題分變化、殘局新增星數", () => {
  const d = dt(2026, 11, 24), s = State.defaultState();
  DAILY.apply(s, "mini", {}, d);                                       // 例如三問一輪／小遊戲／殘局一題／開局路線一次，全部經同一個 "mini"
  DAILY.apply(s, "eg", { gain: 2 }, d); DAILY.apply(s, "eg", { gain: -5 }, d);
  DAILY.apply(s, "play", { result: "win" }, d); DAILY.apply(s, "play", { result: "draw" }, d); DAILY.apply(s, "play", { result: "loss" }, d);
  DAILY.apply(s, "puzzle", { ok: true, delta: 8 }, d); DAILY.apply(s, "puzzle", { ok: false, delta: -6 }, d);
  eq(s.daily.days["2026-11-24"], { puz: 2, puzOk: 1, pdelta: 2, mini: 1, w: 1, d: 1, l: 1, eg: 2, sec: 0, done: false });
  let threw = false; try { DAILY.apply(s, "nope", {}, d); } catch (e) { threw = true; } ok(threw, "未登記活動會拋錯");
  for (const f of ["js/game-check.js", "js/game-mate1.js", "js/game-maze.js", "js/game-pawnwar.js", "js/three.js", "js/openings.js", "js/endgames.js"]) ok(fs.readFileSync(path.join(ROOT, f), "utf8").includes('CO.Activity.log("mini")'), f + " 要記錄小練習");
  ok(fs.readFileSync(path.join(ROOT, "js/play.js"), "utf8").includes('CO.Activity.log("play"') && fs.readFileSync(path.join(ROOT, "js/puzzles.js"), "utf8").includes('CO.Activity.log("puzzle"'));
});
test("每日任務跨午夜：23:59 同 00:01 係兩個日子，各自計算；日期用本機時間", () => {
  const s = State.defaultState();
  DAILY.apply(s, "puzzle", { ok: true, delta: 0 }, dt(2026, 11, 24, 23, 59));
  DAILY.apply(s, "puzzle", { ok: true, delta: 0 }, dt(2026, 11, 25, 0, 1));
  eq(Object.keys(s.daily.days).sort(), ["2026-11-24", "2026-11-25"]);
  eq(DAILY.status(s, dt(2026, 11, 25, 0, 30)).items[0].have, 1, "新一日重新由 0 計（只有 00:01 嗰題）");
  eq(DAILY.status(s, dt(2026, 11, 24, 23, 59)).items[0].have, 1);
  eq(DAILY.dateKey(new Date(2026, 0, 5, 0, 0, 1)), "2026-01-05"); eq(DAILY.dateKey(new Date(2026, 11, 31, 23, 59, 59)), "2026-12-31");
  eq(DAILY.dateKey(DAILY.addDays(dt(2026, 12, 31), 1)), "2027-01-01"); eq(DAILY.dateKey(DAILY.addDays(dt(2026, 3, 1), -1)), "2026-02-28");
});
test("連續日數：連續完成 +1；隔一日冇完成重新計；同日重複完成唔重複計；顯示用「今日或昨日」先算", () => {
  const s = State.defaultState();
  const finish = d => { for (let i = 0; i < 5; i++) DAILY.apply(s, "puzzle", { ok: true, delta: 0 }, d); return DAILY.apply(s, "mini", {}, d); };
  const tue = dt(2026, 11, 24), wed = dt(2026, 11, 25), thu = dt(2026, 11, 26);
  // 避開要求對局嘅日子：星期二、四（星期三要對局）
  eq(finish(tue).newlyDone, true); eq(s.streak, { count: 1, lastDay: "2026-11-24" });
  DAILY.apply(s, "mini", {}, tue); eq(s.streak.count, 1, "同日再做唔會重複計");
  for (let i = 0; i < 5; i++) DAILY.apply(s, "puzzle", { ok: true, delta: 0 }, wed); DAILY.apply(s, "mini", {}, wed);
  eq(DAILY.status(s, wed).done, false, "星期三未對局");
  DAILY.apply(s, "play", { result: "win" }, wed); eq(s.streak, { count: 2, lastDay: "2026-11-25" }, "連續第二日");
  eq(DAILY.streakNow(s, thu), 2, "昨日完成，今日未做：仍然顯示 2");
  eq(DAILY.streakNow(s, dt(2026, 11, 27)), 0, "隔咗一日（星期四冇完成）：顯示 0");
  finish(dt(2026, 11, 28));                                            // 星期六完成（唔使對局）
  eq(s.streak, { count: 1, lastDay: "2026-11-28" }, "中斷之後重新計");
  eq(DAILY.streakNow(State.defaultState(), tue), 0);
});
test("每日紀錄只保留最近 60 日（apply 同儲存清洗都會裁剪；60 同 config 一致）", () => {
  eq(State.DAILY_KEEP, CFG.DAILY.KEEP_DAYS); eq(CFG.DAILY.KEEP_DAYS, 60);
  const s = State.defaultState();
  for (let i = 0; i < 75; i++) DAILY.apply(s, "mini", {}, DAILY.addDays(dt(2026, 9, 1), i));
  const keys = Object.keys(s.daily.days).sort();
  eq(keys.length, 60); eq(keys[59], DAILY.dateKey(DAILY.addDays(dt(2026, 9, 1), 74))); eq(keys[0], DAILY.dateKey(DAILY.addDays(dt(2026, 9, 1), 15)));
  const raw = { daily: { days: {} } };
  for (let i = 0; i < 90; i++) raw.daily.days[DAILY.dateKey(DAILY.addDays(dt(2026, 6, 1), i))] = { puz: 1 };
  const n = State.normalizeState(raw).daily.days;
  eq(Object.keys(n).length, 60); ok(!("2026-06-01" in n) && ("2026-08-29" in n));
  eq(Object.keys(State.normalizeState({ daily: { days: { "bad": { puz: 1 }, "2026-13": { puz: 1 }, "2026-11-01": { puz: 2, puzOk: 9, sec: 999999, junk: 1 } } } }).daily.days), ["2026-11-01"]);
  eq(State.normalizeState({ daily: { days: { "2026-11-01": { puz: 2, puzOk: 9, sec: 999999, junk: 1 } } } }).daily.days["2026-11-01"], { puz: 2, puzOk: 2, pdelta: 0, mini: 0, w: 0, d: 0, l: 0, eg: 0, sec: 86400, done: false });
});

/* ---------- D：練習時間 ---------- */
test("練習時間：只計前景而且有操作；停 2 分鐘冇操作就停止計；背景唔計；回到前景要再有操作", () => {
  const tr = DAILY.createTracker(120000);
  tr.activity(0);
  for (let t = 10000; t <= 300000; t += 10000) tr.tick(t);
  eq(tr.takeSeconds(), 120, "只計操作後 2 分鐘");
  tr.activity(300000);
  for (let t = 310000; t <= 360000; t += 10000) tr.tick(t);
  eq(tr.takeSeconds(), 60);
  tr.activity(360000); tr.visibility(380000, false);                   // 20 秒後切去背景
  for (let t = 390000; t <= 600000; t += 10000) tr.tick(t);
  eq(tr.takeSeconds(), 20, "背景時間唔計（之前 20 秒前景有計）");
  tr.visibility(600000, true); tr.activity(600000);
  for (let t = 610000; t <= 640000; t += 10000) tr.tick(t);
  eq(tr.takeSeconds(), 40);
  const t2 = DAILY.createTracker(120000);
  for (let t = 0; t <= 100000; t += 10000) t2.tick(t);
  eq(t2.takeSeconds(), 0, "完全冇操作就唔計");
  t2.activity(100000); t2.activity(150000); t2.activity(200000);
  for (let t = 210000; t <= 400000; t += 10000) t2.tick(t);
  eq(t2.takeSeconds(), 200 - 100 + 120, "持續操作期間全部計，最後一次操作後再計 2 分鐘");
  ok(CFG.DAILY.IDLE_MS === 120000);
  const act = fs.readFileSync(path.join(ROOT, "js/activity.js"), "utf8");
  ok(act.includes("visibilitychange") && act.includes("pagehide") && act.includes("IDLE_MS") && act.includes("pointerdown") && act.includes("keydown"), "瀏覽器端有監聽前景／離開／操作");
});

/* ---------- 週報 ---------- */
test("家長週報：任務完成格仔、連續日數、練習分鐘、謎題題數／正確率／謎題分變化、大錯比較、殘局／開局／錯題本；總結只講數字", () => {
  const s = State.defaultState(), today = dt(2026, 11, 29);   // 星期日
  const put = (k, o) => { s.daily.days[k] = Object.assign(DAILY.emptyDay(), o); };
  put("2026-11-22", { puz: 5, puzOk: 3, pdelta: 10, mini: 1, w: 1, sec: 600, done: true });       // 7 日之前（唔計，第 8 日）
  put("2026-11-23", { puz: 5, puzOk: 4, pdelta: 12, mini: 1, w: 1, sec: 1200, done: true });
  put("2026-11-24", { puz: 6, puzOk: 3, pdelta: -4, mini: 1, sec: 590, done: true, eg: 3 });
  put("2026-11-26", { puz: 2, puzOk: 1, pdelta: 0, sec: 30 });
  put("2026-11-27", { puz: 5, puzOk: 5, pdelta: 28, mini: 2, d: 1, l: 1, sec: 1800, done: true, eg: 2 });
  s.streak = { count: 3, lastDay: "2026-11-28" };
  s.puzzles.rating = 746; s.playLevel = 4;
  s.openings.routes["w-italian"].mastered = true; s.openings.routes["b-scholar"].mastered = true;
  s.puzzles.wrong = [{ id: "aaaaa", r: 700, streak: 0 }, { id: "bbbbb", r: 800, streak: 1 }];
  s.play.recent = [{ date: "2026-11-28", level: 3, color: "w", result: "loss", reason: "resign", pgn: "", blunders: 4, plies: 30 }, { date: "2026-11-25", level: 3, color: "w", result: "win", reason: "checkmate", pgn: "", blunders: 1, plies: 30 },
    { date: "2026-11-24", level: 3, color: "w", result: "win", reason: "checkmate", pgn: "", blunders: null, plies: 30 }, { date: "2026-11-20", level: 3, color: "w", result: "win", reason: "checkmate", pgn: "", blunders: 6, plies: 30 },
    { date: "2026-11-10", level: 3, color: "w", result: "win", reason: "checkmate", pgn: "", blunders: 9, plies: 30 }];
  const r = RPT.build(s, today, { stars: 12, starsAll: 84 });
  eq(r.days.map(d => d.key), ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"]);
  eq(r.days.map(d => d.done), [true, true, false, false, true, false, false]); eq(r.doneDays, 3);
  eq(r.days.map(d => d.minutes), [20, 10, 0, 1, 30, 0, 0]); eq(r.minutesTotal, Math.round((1200 + 590 + 30 + 1800) / 60));
  eq(r.days[6].today, true); eq(r.days[0].weekday, "一"); eq(r.days[6].weekday, "日");
  eq(r.streak, 3);
  eq([r.puzzles.count, r.puzzles.ok, r.puzzles.accuracy, r.puzzles.change, r.puzzles.ratingNow, r.puzzles.ratingBefore], [18, 13, 72, 36, 746, 710], "11/22 唔計；pdelta 12 − 4 + 0 + 28 = 36");
  eq([r.play.w, r.play.d, r.play.l, r.play.level], [1, 1, 1, 4]);
  eq(r.play.avgBlunders, { avg: 2.5, games: 2 }, "本週只計已檢討（blunders 不是 null）嘅 11/23–11/29 對局"); eq(r.play.prevAvgBlunders, { avg: 6, games: 1 }, "上一個 7 日 11/16–11/22");
  eq([r.endgames.gained, r.endgames.stars, r.endgames.starsAll], [5, 12, 84]); eq([r.openings.mastered, r.openings.total], [2, 6]); eq(r.wrongBook, 2);
  eq(r.summary, "本週完成任務 3 天，練習 60 分鐘，做了 18 題謎題（正確率 72%），謎題分上升 36 分。");
  ok(!/很好|加油|不錯|可惜|希望|建議|應該|太少|太多/.test(r.summary), "總結只講數字事實，唔作評語");
  eq(RPT.build(State.defaultState(), today, {}).summary, "本週完成任務 0 天。", "冇資料：只講 0 天，唔作評語");
  const down = State.defaultState(); down.daily.days["2026-11-29"] = Object.assign(DAILY.emptyDay(), { puz: 3, puzOk: 1, pdelta: -9, sec: 120 });
  eq(RPT.build(down, today, {}).summary, "本週完成任務 0 天，練習 2 分鐘，做了 3 題謎題（正確率 33%），謎題分下降 9 分。");
  const html = fs.readFileSync(path.join(ROOT, "report.html"), "utf8") + fs.readFileSync(path.join(ROOT, "js/report.js"), "utf8");
  for (const f of ["js/report-logic.js", "js/report.js", "js/daily.js"]) ok(html.includes(f), "report.html 引用 " + f);
  ok(fs.readFileSync(path.join(ROOT, "index.html"), "utf8").includes('href="report.html"'), "首頁頁底有「家長週報」入口");
});

/* ---------- E：備份與還原 ---------- */
test("備份：匯出帶版本號、用 normalizeState 處理；匯入往返一致（包括 daily、mygames、endgames）；檔名帶日期", () => {
  const s = State.normalizeState({ puzzles: { rating: 888 }, playLevel: 5, daily: { days: { "2026-11-24": { puz: 5, sec: 300, done: true } } }, rank: { index: 2, xp: 0 },
    endgames: { pos: { "kqk-1": { stars: 3, wins: 1, runs: 1, best: 2 } } }, mygames: { user: "someone", puzzles: [{ id: "mabc123", fen: "8/8/8/8/8/8/8/K1k5 w - - 0 1", best: "a1a2", bestSan: "Ka2", cp: 50, side: "w", date: "2026-11-20" }], recent: [] } });
  const text = State.exportBackup(s, new Date(2026, 10, 27, 10, 0));
  const obj = JSON.parse(text);
  eq([obj.app, obj.version, typeof obj.exportedAt], ["chessops", State.SCHEMA_VERSION, "string"]); eq(State.SCHEMA_VERSION, 2);
  eq(State.parseBackup(text), s, "往返一致");
  eq(State.parseBackup(State.exportBackup({ puzzles: { rating: 99999 }, evil: 1 })).puzzles.rating, 3000, "匯出經過 normalizeState");
  eq(State.backupFileName(new Date(2026, 10, 5)), "chessops-backup-2026-11-05.json"); eq(State.backupFileName(new Date(2027, 0, 31)), "chessops-backup-2027-01-31.json");
  eq(State.sizeBytes("abc"), 3); eq(State.sizeBytes("棋"), 3, "UTF-8：中文 3 位元組");
  const kb = State.sizeBytes(JSON.stringify(State.defaultState()));
  ok(kb > 200 && kb < 4000, "預設資料大小 " + kb);
});
test("匯入備份：格式或版本不對會拋出清楚原因（書面語）而且唔會寫入；舊／缺欄位資料補預設值", () => {
  const good = JSON.parse(State.exportBackup(State.defaultState()));
  const bad = (v, re) => { let msg = ""; try { State.parseBackup(typeof v === "string" ? v : JSON.stringify(v)); } catch (e) { msg = e.message; } ok(re.test(msg), "應拒絕並說明：" + re + " 得到：" + msg); };
  bad("", /沒有內容/); bad("   ", /沒有內容/); bad("{不是 json", /不是有效的 JSON/);
  bad({ version: 2, state: {} }, /不是「國際象棋 Ops」的備份/); bad(Object.assign({}, good, { app: "other" }), /不是「國際象棋 Ops」的備份/); bad([1, 2], /不是「國際象棋 Ops」的備份/);
  bad(Object.assign({}, good, { version: undefined }), /沒有有效的版本號/); bad(Object.assign({}, good, { version: "2" }), /沒有有效的版本號/); bad(Object.assign({}, good, { version: 1.5 }), /沒有有效的版本號/); bad(Object.assign({}, good, { version: 0 }), /沒有有效的版本號/);
  bad(Object.assign({}, good, { version: 99 }), /較新的版本（版本 99）/);
  bad(Object.assign({}, good, { state: null }), /沒有資料/); bad(Object.assign({}, good, { state: [] }), /沒有資料/);
  bad("x".repeat(3000001), /太大/);
  const old = State.parseBackup(JSON.stringify({ app: "chessops", version: 1, state: { puzzles: { rating: 900 } } }));
  eq(old.puzzles.rating, 900); eq(old.daily, { days: {} }); eq(old.mygames, { user: "", puzzles: [], recent: [] }, "版本 1 備份：新欄位補預設值");
  eq(State.parseBackup(JSON.stringify({ app: "chessops", version: 2, state: { junk: 1, playLevel: 99 } })).playLevel, 8, "經 normalizeState 清洗");
  const src = fs.readFileSync(path.join(ROOT, "js/settings.js"), "utf8");
  const iParse = src.indexOf("State.parseBackup"), iDlg = src.indexOf("Dialog.show", iParse), iSave = src.indexOf("State.saveState(parsed)");
  ok(iParse > 0 && iDlg > iParse && iSave > iDlg, "先檢查格式 → App 內對話框確認 → 先寫入");
  ok(src.includes("會覆蓋這部裝置上的現有紀錄") && src.includes('catch (e) { say("無法匯入：" + e.message') && !/\balert\(|\bconfirm\(/.test(src), "確認文字、錯誤顯示原因、唔用 alert／confirm");
  ok(src.includes("navigator.clipboard") && src.includes("State.backupFileName") && src.includes("a.download") && src.includes("State.storedBytes"), "匯出下載、複製後備、顯示資料大小");
  const html = fs.readFileSync(path.join(ROOT, "settings.html"), "utf8");
  for (const id of ["export", "copy-backup", "import-file", "import-text", "import-go", "data-size"]) ok(html.includes('id="' + id + '"'), "settings.html 有 #" + id);
});

/* ---------- F：我的對局 ---------- */
const mkGame = (o) => Object.assign({ url: "https://www.chess.com/game/live/1", pgn: '[Event "Live Chess"]\n\n1. e4 e5 1-0', time_class: "rapid", rules: "chess", end_time: Math.floor(Date.UTC(2026, 10, 20) / 1000), uuid: "u1",
  white: { username: "Kid_User", result: "win" }, black: { username: "Other", result: "resigned" } }, o);
test("我的對局：篩選（最近 30 日、只取中速棋同快棋、標準規則、有 PGN、最多 20 局、最新優先）；顏色同結果判斷", () => {
  eq(CFG.MYGAMES, { MAX_GAMES: 20, DAYS: 30, TIME_CLASSES: ["rapid", "blitz"], MAX_PUZZLES: 50, ACCEPT_DROP: 0.05, RECENT: 5 });
  const now = Date.UTC(2026, 10, 27), day = 86400;
  const games = [
    mkGame({ uuid: "a", end_time: now / 1000 - 1 * day }),                                  // 合格（執白，贏）
    mkGame({ uuid: "b", time_class: "blitz", end_time: now / 1000 - 2 * day, white: { username: "Other", result: "checkmated" }, black: { username: "kid_user", result: "win" } }),   // 執黑，贏（用戶名大細楷唔同）
    mkGame({ uuid: "c", time_class: "bullet" }), mkGame({ uuid: "d", time_class: "daily" }),      // 唔取
    mkGame({ uuid: "e", rules: "chess960" }), mkGame({ uuid: "f", pgn: undefined }),              // 唔取
    mkGame({ uuid: "g", end_time: now / 1000 - 31 * day }),                                       // 超過 30 日
    mkGame({ uuid: "h", white: { username: "A", result: "win" }, black: { username: "B", result: "x" } }),   // 唔係呢個用戶
    mkGame({ uuid: "i", end_time: now / 1000 - 3 * day, white: { username: "Kid_User", result: "timeout" }, black: { username: "Other", result: "win" } }),   // 輸（超時）
    mkGame({ uuid: "j", end_time: now / 1000 - 4 * day, white: { username: "Kid_User", result: "agreed" }, black: { username: "Other", result: "agreed" } })   // 和
  ];
  const out = MGL.filterGames(games, "Kid_User", now);
  eq(out.map(g => g.id), ["a", "b", "i", "j"], "最新優先，其他全部過濾");
  eq(out.map(g => g.color), ["w", "b", "w", "w"]); eq(out.map(g => g.result), ["win", "win", "loss", "draw"]); eq(out[1].opp, "Other"); eq(out[0].tc, "rapid");
  const many = []; for (let i = 0; i < 30; i++) many.push(mkGame({ uuid: "m" + i, end_time: now / 1000 - i * 3600 }));
  const lim = MGL.filterGames(many, "Kid_User", now); eq(lim.length, 20); eq(lim[0].id, "m0");
  eq(MGL.cleanUser(" Kid_User "), "Kid_User"); eq(MGL.cleanUser("ab"), ""); eq(MGL.cleanUser("a b c"), ""); eq(MGL.cleanUser("x".repeat(26)), "");
  eq(MGL.archivesUrl("Kid_User"), "https://api.chess.com/pub/player/kid_user/games/archives");
});
test("我的對局：PGN 解析（chess.com 格式含標籤同時間註解）、判斷執邊方；特殊局面／變體／太短會拒絕；貼上多局可以切開", () => {
  const g = new Chess(); ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"].forEach(s => g.move(s));
  g.setHeader("White", "Kid_User"); g.setHeader("Black", "Rival"); g.setHeader("Result", "0-1"); g.setHeader("UTCDate", "2026.11.20");
  const pgn = g.pgn().replace("1. e4", "1. e4 {[%clk 0:09:58.9]}");
  const r = MGL.parsePgn(Chess, pgn, "kid_user");
  eq(r.ucis, ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6"]); eq([r.color, r.result, r.date, r.white, r.black], ["w", "loss", "2026-11-20", "Kid_User", "Rival"]);
  eq(MGL.parsePgn(Chess, pgn, "rival").color, "b"); eq(MGL.parsePgn(Chess, pgn, "rival").result, "win"); eq(MGL.parsePgn(Chess, pgn, "").color, null, "對唔到用戶名：由用戶揀");
  const rejects = (p, re) => { let m = ""; try { MGL.parsePgn(Chess, p, "x"); } catch (e) { m = e.message; } ok(re.test(m), "應拒絕：" + m); };
  rejects('[SetUp "1"]\n[FEN "8/8/8/8/8/8/8/K1k5 w - - 0 1"]\n\n1. Ka2 Kd2', /特殊局面/); rejects('[Variant "Chess960"]\n\n1. e4 e5', /變體/); rejects("1. e4", /步數太少|PGN 格式/); rejects("垃圾文字", /PGN/);
  const two = pgn + "\n\n" + pgn.replace("Rival", "Second");
  eq(MGL.splitPgns(two).length, 2); eq(MGL.splitPgns("").length, 0);
});
test("我的謎題：由大錯產生（局面＝走錯之前、答案＝引擎最佳步）；最多 50 題；重複唔加；移除；其他走法勝率跌幅 < 0.05 當啱", async () => {
  // 假分析器：黑方 2…Nf6?? 錯過 Qh4#
  const ucis = ["f2f3", "e7e5", "g2g4", "g8f6"];
  const analyze = async fen => fen.startsWith("rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b") ? { cp: null, mate: 1, best: "d8h4" } : { cp: 0, mate: null, best: "a2a3" };
  const res = await RV.reviewGame(Chess, ucis, "b", analyze, {});
  const bl = res.moves.find(m => m.cls === "blunder");
  ok(bl, "有大錯"); eq(bl.reason, "missedMate");
  const p = MGL.puzzleFromMove(bl, "b", "2026-11-20");
  ok(/^m[0-9a-z]{4,12}$/.test(p.id), "id 格式 " + p.id);
  eq([p.fen, p.best, p.bestSan, p.cp, p.side, p.date], [bl.fenBefore, "d8h4", "Qh4#", 1000, "b", "2026-11-20"]);
  eq(MGL.puzzleFromMove(bl, "b", "x").id, p.id, "同一局面同答案 → 同一個 id");
  eq(MGL.puzzleFromMove({ fenBefore: "x", bestUci: null }, "b", ""), null, "冇引擎建議就唔產生");
  let list = [];
  let r = MGL.addPuzzle(list, p); eq(r.status, "added"); list = r.list; eq(list.length, 1);
  eq(MGL.addPuzzle(list, p).status, "dup"); eq(MGL.addPuzzle(list, p).list.length, 1);
  let full = []; for (let i = 0; i < 50; i++) full = MGL.addPuzzle(full, Object.assign({}, p, { id: "m" + String(100000 + i) })).list;
  eq(full.length, 50); eq(MGL.addPuzzle(full, p).status, "full"); eq(MGL.addPuzzle(full, p).list.length, 50, "最多 50 題");
  eq(MGL.removePuzzle(full, "m100000").length, 49); eq(list.length, 1, "不改動傳入陣列");
  // 其他走法：勝率跌幅 < 0.05 當啱
  ok(MGL.isAcceptable(100, 90), "差 10 cp 當啱"); ok(MGL.isAcceptable(100, 100)); ok(MGL.isAcceptable(300, 300));
  ok(!MGL.isAcceptable(100, -100), "差 200 cp 唔啱"); ok(!MGL.isAcceptable(1000, 0), "將死變 0 唔啱");
  ok(MGL.isAcceptable(0, -20), "約 20 cp 內當啱（勝率跌幅約 0.04）"); ok(!MGL.isAcceptable(0, -40), "40 cp 唔啱（勝率跌幅約 0.07）");
  const e = MGL.summaryEntry({ date: "2026-11-20", opp: "Rival", color: "b", result: "loss", tc: "rapid", plies: 40 }, { blunder: 2, mistake: 1, inaccuracy: 4 });
  eq(e, { date: "2026-11-20", opp: "Rival", color: "b", result: "loss", tc: "rapid", plies: 40, blunders: 2, mistakes: 1, inaccuracies: 4 });
});
test("儲存（mygames 欄位）：用戶名、我的謎題（最多 50、id／FEN／答案要有效、重複刪走）、最近 5 局摘要；白名單清洗；備份往返", () => {
  eq(State.defaultState().mygames, { user: "", puzzles: [], recent: [] });
  const mk = i => ({ id: "m" + String(100000 + i), fen: "8/8/8/8/8/8/8/K1k5 w - - 0 1", best: "a1a2", bestSan: "Ka2", cp: 5000, side: "b", date: "2026-11-20", junk: 1 });
  const raw = { mygames: { user: "Kid_User", puzzles: [].concat(Array.from({ length: 60 }, (_, i) => mk(i)), [{ id: "bad", fen: "x", best: "zz" }, mk(0)]), recent: Array.from({ length: 9 }, (_, i) => ({ date: "2026-11-2" + (i % 10), opp: "Rival", color: "b", result: "win", tc: "blitz", plies: 30 + i, blunders: 1, mistakes: 2, inaccuracies: 3, junk: 1 })), junk: 1 } };
  const n = State.normalizeState(raw).mygames;
  eq(Object.keys(n).sort(), ["puzzles", "recent", "user"]); eq(n.user, "Kid_User"); eq(n.puzzles.length, 50, "最多 50 題"); eq(n.recent.length, 5, "最多 5 局摘要");
  eq(n.puzzles[0], { id: "m100000", fen: "8/8/8/8/8/8/8/K1k5 w - - 0 1", best: "a1a2", bestSan: "Ka2", cp: 1000, side: "w", date: "2026-11-20" }, "cp 夾範圍、side 由 FEN 決定、多餘欄位刪走");
  eq(new Set(n.puzzles.map(p => p.id)).size, 50); ok(!n.puzzles.some(p => p.id === "bad"));
  eq(State.normalizeState({ mygames: { user: "a b" } }).mygames.user, "", "無效用戶名清走"); eq(State.normalizeState({ mygames: "x" }).mygames, { user: "", puzzles: [], recent: [] });
  eq(State.normalizeState(State.normalizeState(raw)), State.normalizeState(raw), "冪等"); eq(State.parseBackup(State.exportBackup(State.normalizeState(raw))), State.normalizeState(raw), "備份往返");
  eq(Object.keys(State.STATE_FIELDS).sort(), ["daily", "endgames", "mygames", "openings", "play", "playLevel", "puzzles", "rank", "records", "settings", "streak", "three", "version"]);
});
test("我的對局頁面：引用檔案齊全；用同一套檢討（RV.reviewGame）；只分析自己嘅步；大錯先可加入我的謎題；謎題頁有「我的謎題」；首頁入口開放", () => {
  const h = fs.readFileSync(path.join(ROOT, "mygames.html"), "utf8");
  for (const f of ["js/mygames-logic.js", "js/mygames.js", "js/review-logic.js", "js/tactics.js", "js/engine-manager.js", "js/config.js", "js/activity.js"]) ok(h.includes(f), "mygames.html 引用 " + f);
  ok(h.indexOf("js/tactics.js") < h.indexOf("js/review-logic.js") && h.indexOf("js/config.js") < h.indexOf("js/review-logic.js"));
  const js = fs.readFileSync(path.join(ROOT, "js/mygames.js"), "utf8");
  ok(js.includes("RV.reviewGame(Chess, ucis, g.color") && js.includes("不分析對手的步"), "用同一套檢討，只分析自己嘅步");
  ok(js.includes('m.cls === "blunder"') && js.includes("加入我的謎題") && js.includes("貼上 PGN") && js.includes("api.chess.com") === false, "大錯加入我的謎題、PGN 後備；網址集中喺 mygames-logic");
  ok(fs.readFileSync(path.join(ROOT, "js/mygames-logic.js"), "utf8").includes("https://api.chess.com/pub/player/"));
  const pz = fs.readFileSync(path.join(ROOT, "js/puzzles.js"), "utf8") + fs.readFileSync(path.join(ROOT, "puzzles.html"), "utf8");
  ok(pz.includes("我的謎題") && pz.includes("MG.isAcceptable") && pz.includes('mode: "mine"') && pz.includes("js/mygames-logic.js") && pz.includes("不計謎題分"));
  const mods = require(path.join(ROOT, "js/modules.js"));
  eq(mods.find(m => m.name.startsWith("我的對局")).href, "mygames.html"); eq(mods.filter(m => !m.href).length, 0, "7 個模組全部開放");
});
test("頁面引用：所有練習頁面載入 config → daily → activity；對話框樣式喺 theme.css（首頁、設定頁都用到）", () => {
  for (const p of ["quiz", "game-check", "game-mate1", "game-maze", "game-pawnwar", "puzzles", "play", "three", "openings", "endgames", "mygames"]) {
    const h = fs.readFileSync(path.join(ROOT, p + ".html"), "utf8");
    const a = h.indexOf("js/config.js"), b = h.indexOf("js/daily.js"), c = h.indexOf("js/activity.js");
    ok(a > 0 && a < b && b < c, p + ".html 要按次序載入 config、daily、activity");
  }
  const theme = fs.readFileSync(path.join(ROOT, "css/theme.css"), "utf8"), board = fs.readFileSync(path.join(ROOT, "css/board.css"), "utf8");
  ok(theme.includes(".dlg-overlay") && !board.includes(".dlg-overlay"));
  const idx = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  ok(idx.indexOf("js/config.js") < idx.indexOf("js/daily.js") && idx.includes("js/dialog.js"));
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
