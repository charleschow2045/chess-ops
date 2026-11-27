/*
 * 棋盤唔可以移位測試（Playwright，真滑鼠、真 Stockfish）：
 * 每個有棋盤嘅頁面，喺各種狀態（輪到玩家、電腦思考中、被將軍、提示箭頭、答啱／答錯回饋、提醒收起、對局結束、引擎載入…）
 * 記錄棋盤（cg-board）嘅文件座標 top（= getBoundingClientRect().top + scrollY），全部狀態之間嘅差距必須 <= 1px。
 * 除咗每個狀態嘅量度，仲用 requestAnimationFrame 連續取樣，抓到「中途短暫跳一下」嘅情況（每個狀態嘅 min–max 都要 <= 1px）。
 * 820×1180（iPad 直向）同 1180×820（橫向）都跑。
 *   node tools/serve.js 8123；NODE_PATH=…playwright-core… node tools/layout-check.js [只跑名稱包含呢個字串嘅場景]
 * 結果寫入 docs/layout-check.json（供報告使用）。
 */
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright-core");
const ROOT = path.resolve(__dirname, "..");
const { Chess } = require(path.join(ROOT, "vendor/chess.js/chess.cjs"));
const State = require(path.join(ROOT, "js/state.js"));
const PLG = require(path.join(ROOT, "js/play-logic.js"));
const OPEN = require(path.join(ROOT, "data/openings.js"));
const EGD = require(path.join(ROOT, "data/endgames.js"));

const BASE = process.env.BASE || "http://localhost:8123/";
const FILTER = process.argv[2] || "";
const TOL = 1;                                        // 容許差距（px）
const VIEWPORTS = [{ name: "820x1180", width: 820, height: 1180 }, { name: "1180x820", width: 1180, height: 820 }];
const results = [];
const errors = [];
let failed = 0;
const uciOf = m => m.from + m.to + (m.promotion || "");
const stateWith = fn => { const s = State.defaultState(); fn(s); return State.normalizeState(s); };

/* ---------- 連續取樣（注入頁面） ---------- */
const RECORDER = () => {
  window.__tp = { min: null, max: null, last: null, n: 0 };
  window.__tpReset = () => { window.__tp.min = null; window.__tp.max = null; };
  (function loop() {
    const b = document.querySelector("cg-board");
    if (b) {
      const r = b.getBoundingClientRect(), t = Math.round((r.top + window.scrollY) * 10) / 10, p = window.__tp;
      p.last = t; p.n++;
      if (p.min === null || t < p.min) p.min = t;
      if (p.max === null || t > p.max) p.max = t;
    }
    requestAnimationFrame(loop);
  })();
};

class Run {
  constructor(page, name, vp) { this.page = page; this.name = name; this.vp = vp; this.marks = []; }
  /* 記錄一個狀態：等 settle 毫秒（等動畫／重新排版完成）之後量度；同時記低呢段時間內連續取樣嘅 min／max */
  async mark(label, settle) {
    await this.page.waitForTimeout(settle === undefined ? 350 : settle);
    const m = await this.page.evaluate(() => {
      const p = window.__tp, b = document.querySelector("cg-board");
      const top = b ? Math.round((b.getBoundingClientRect().top + window.scrollY) * 10) / 10 : null;
      const out = { top, min: p.min, max: p.max };
      window.__tpReset();
      return out;
    });
    this.marks.push({ label, top: m.top, min: m.min, max: m.max });
    return m;
  }
  /* 場景結束：全部量度之間嘅差距 <= TOL */
  finish() {
    const tops = this.marks.filter(m => m.top !== null);
    const all = [];
    tops.forEach(m => { all.push(m.top); if (m.min !== null) all.push(m.min); if (m.max !== null) all.push(m.max); });
    const spread = all.length ? Math.round((Math.max(...all) - Math.min(...all)) * 10) / 10 : null;
    const ok = spread !== null && spread <= TOL && tops.length === this.marks.length;
    if (!ok) failed++;
    results.push({ scenario: this.name, viewport: this.vp, states: this.marks.length, spread, ok, marks: this.marks });
    console.log((ok ? "  ✓ " : "  ✗ ") + this.vp + "｜" + this.name + "｜" + this.marks.length + " 個狀態｜棋盤 top 差距 " + spread + "px" + (ok ? "" : "  ← 超過 " + TOL + "px"));
    if (!ok) this.marks.forEach(m => console.log("      " + m.label + "：top " + m.top + "（連續取樣 " + m.min + "–" + m.max + "）"));
  }
}

async function rect(page) { await page.locator("cg-board").scrollIntoViewIfNeeded(); return page.evaluate(() => { const b = document.querySelector("cg-board").getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, flipped: !!document.querySelector(".orientation-black") }; }); }
async function pt(page, sq) { const r = await rect(page), f = "abcdefgh".indexOf(sq[0]), rk = Number(sq[1]) - 1, s = r.w / 8; const col = r.flipped ? 7 - f : f, row = r.flipped ? rk : 7 - rk; return { x: r.x + (col + 0.5) * s, y: r.y + (row + 0.5) * s }; }
async function clickSq(page, sq) { const p = await pt(page, sq); await page.mouse.click(p.x, p.y); await page.waitForTimeout(100); }
async function move(page, from, to) { await clickSq(page, from); await clickSq(page, to); }
const mvUci = async (page, u) => move(page, u.slice(0, 2), u.slice(2, 4));

/* 電腦出棋速度：測試預設用「快」（避免等太耐）；SPEED=slow／medium／fast 可以覆蓋。預設值「慢」由 tests/run-all.js 同 tools/shots7.js 另外驗證 */
const SPEED = process.env.SPEED || "slow";
const forceSpeed = init => { const s = init ? JSON.parse(JSON.stringify(init)) : { settings: {} }; s.settings = Object.assign({}, s.settings, { computerSpeed: SPEED }); s.onboarding = { welcomed: true }; return s; };
async function scenario(browser, vp, name, init, fn) {
  if (FILTER && !name.includes(FILTER)) return;
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
  await ctx.addInitScript(RECORDER);
  await ctx.addInitScript(st => { try { if (st && !localStorage.getItem("chessops_state")) localStorage.setItem("chessops_state", JSON.stringify(st)); } catch (e) { /* 忽略 */ } }, forceSpeed(init));
  const page = await ctx.newPage();
  const run = new Run(page, name, vp.name);
  page.on("console", m => { if (m.type() === "error") errors.push(vp.name + "｜" + name + " → " + m.text()); });
  page.on("pageerror", e => errors.push(vp.name + "｜" + name + " → " + e.message));
  try { await fn(page, run); } catch (e) { failed++; console.log("  ✗ " + vp.name + "｜" + name + "｜例外：" + e.message.split("\n")[0]); }
  if (run.marks.length) run.finish();
  await ctx.close();
}

/* 揀一個合法步（優先兵步／馬步，避免送將死）用嚟「亂走」 */
const anyMove = page => page.evaluate(() => { const g = window.__chessopsPlay.board().game; const ms = g.moves({ verbose: true }); const pick = ms.find(m => m.piece === "p") || ms[0]; return pick.from + pick.to + (pick.promotion || ""); });
const waitPlayerTurn = page => page.waitForFunction(() => document.querySelector("#status").dataset.turn === "me", null, { timeout: 30000 });

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER === "chrome" ? "chrome" : "msedge" });
  for (const vp of VIEWPORTS) {
    console.log("\n=== 視窗 " + vp.name + " ===");

    /* ---------- 對電腦下棋 ---------- */
    for (const color of ["w", "b"]) {
      await scenario(browser, vp, "對電腦下棋（執" + (color === "w" ? "白" : "黑") + "，真走 3 個來回）", null, async (page, run) => {
        await page.goto(BASE + "play.html"); await page.waitForSelector("#start");
        await page.locator("button[data-level='1']").click(); await page.locator("button[data-color='" + color + "']").click();
        await page.locator("#start").click(); await page.waitForSelector("cg-board");
        await run.mark(color === "w" ? "開局：輪到玩家（引擎可能仍在載入）" : "開局：電腦先走，思考中（引擎可能仍在載入）", 200);
        await waitPlayerTurn(page); await run.mark("輪到玩家");
        await page.locator("#hint").click(); await page.waitForSelector("#fb .feedback", { timeout: 30000 });
        await run.mark("提示：箭頭顯示");
        for (let i = 1; i <= 3; i++) {
          await mvUci(page, await anyMove(page));
          await run.mark("第 " + i + " 步後：電腦思考中", 60);
          await waitPlayerTurn(page); await run.mark("第 " + i + " 個來回：電腦走完，輪到玩家");
          if (i === 1) { await page.locator("#rem-toggle").click(); await run.mark("提醒收起"); }
          if (i === 2) { await page.locator("#rem-toggle").click(); await run.mark("提醒展開"); }
        }
        await page.locator("#resign").click(); await page.waitForSelector(".dlg-box"); await run.mark("認輸確認對話框", 200);
        await page.locator(".dlg-box button[data-key='yes']").click(); await page.waitForSelector("#end-box .btn-row", { timeout: 15000 });
        await run.mark("對局結束（結果、按鈕）");
      });
    }
    await scenario(browser, vp, "對電腦下棋：被將軍（你被將軍！）、對局中提醒關閉", stateWith(s => { s.settings.threeReminder = false; s.play.current = { level: 1, color: "b", moves: ["e2e4", "e7e5", "d1h5", "b8c6", "h5e5"], undos: 0, hints: 0, usedUndo: false, usedHint: false }; }), async (page, run) => {
      await page.goto(BASE + "play.html"); await page.waitForSelector("#resume");
      await page.locator("#resume").click(); await page.waitForSelector("cg-board");
      await run.mark("被將軍（提醒設定關閉）");
      ok(await page.locator("#status").textContent(), /被將軍/);
      await mvUci(page, "c6e5");
      await run.mark("吃掉后之後：電腦思考中", 60); await waitPlayerTurn(page); await run.mark("輪到玩家（提醒設定關閉）");
    });
    await scenario(browser, vp, "對電腦下棋：被將軍（提醒開啟）", stateWith(s => { s.play.current = { level: 1, color: "b", moves: ["e2e4", "e7e5", "d1h5", "b8c6", "h5e5"], undos: 0, hints: 0, usedUndo: false, usedHint: false }; }), async (page, run) => {
      await page.goto(BASE + "play.html"); await page.waitForSelector("#resume");
      await page.locator("#resume").click(); await page.waitForSelector("cg-board");
      await run.mark("被將軍（提醒開啟）");
      await mvUci(page, "c6e5");
      await run.mark("電腦思考中", 60); await waitPlayerTurn(page); await run.mark("輪到玩家");
    });

    /* ---------- 戰術謎題 ---------- */
    await scenario(browser, vp, "戰術謎題（推薦練習：對手先走、提示、答錯、再試、答對、下一題）", null, async (page, run) => {
      await page.goto(BASE + "puzzles.html"); await page.waitForSelector("#go-rec");
      await page.locator("#go-rec").click(); await page.waitForSelector("cg-board");
      await run.mark("對手先走一步…", 100);
      await page.waitForFunction(() => document.querySelector(".status-line").dataset.turn === "me", null, { timeout: 15000 });
      await run.mark("輪到玩家");
      await page.locator("#hint").click(); await page.waitForSelector(".feedback"); await run.mark("提示 1：圈出棋子");
      await page.locator("#hint").click(); await page.waitForTimeout(150); await run.mark("提示 2：箭頭");
      const wm = await page.evaluate(() => window.__chessopsDebug.wrongMove());
      await mvUci(page, wm); await page.waitForSelector(".feedback.bad"); await run.mark("答錯回饋（綠色箭頭、再試／下一題按鈕）");
      await page.locator("#retry").click(); await run.mark("再試一次（對手重新先走）", 100);
      await page.waitForFunction(() => document.querySelector(".status-line").dataset.turn === "me", null, { timeout: 15000 });
      await run.mark("再試：輪到玩家");
      for (let k = 0; k < 6; k++) {
        const exp = await page.evaluate(() => window.__chessopsDebug.expected()); await mvUci(page, exp);
        try { await page.waitForSelector(".feedback.ok", { timeout: 2500 }); break; } catch (e) { await page.waitForTimeout(700); }
      }
      await run.mark("答對回饋");
      await page.locator("#next").click(); await run.mark("下一題：對手先走", 100);
      await page.waitForFunction(() => document.querySelector(".status-line").dataset.turn === "me", null, { timeout: 15000 });
      await run.mark("下一題：輪到玩家");
    });

    /* ---------- 走棋前三問 ---------- */
    await scenario(browser, vp, "走棋前三問（Q1、Q2、Q3：題目長短不同、點選棋子、回饋、下一個局面）", null, async (page, run) => {
      await page.goto(BASE + "three.html"); await page.waitForSelector("#start");
      await page.locator("#start").click(); await page.waitForSelector("cg-board");
      for (let pos = 0; pos < 2; pos++) {
        for (let step = 1; step <= 3; step++) {
          await page.waitForFunction(s => document.querySelector("#qno") && document.querySelector("#qno").textContent.startsWith("第 " + s), step, { timeout: 10000 });
          await run.mark("第 " + (pos + 1) + " 個局面 Q" + step + " 題目");
          if (step < 3) { await clickSq(page, "e4"); await run.mark("Q" + step + " 點選棋子（黃色圈）"); await page.locator("#opt-none").click(); }
          else await page.locator(".opt").first().click();
          await page.waitForSelector("#fb .feedback"); await run.mark("Q" + step + " 答啱／答錯回饋");
          await page.locator("#next").click();
        }
      }
    });

    /* ---------- 開局 ---------- */
    await scenario(browser, vp, "開局路線練習（對方自動走、走錯、也可以、再試、完成）", null, async (page, run) => {
      const route = OPEN.ROUTES.find(r => r.id === "w-italian"), g0 = new Chess(), ucis = route.moves.map(s => uciOf(g0.move(s)));
      const alt = route.alts[0][0];
      await page.goto(BASE + "openings.html"); await page.waitForSelector("[data-route]");
      await page.locator("[data-route='w-italian']").click(); await page.waitForSelector("cg-board");
      await run.mark("開局", 100);
      for (let i = 0; i < ucis.length; i++) {
        if (i % 2 !== 0) continue;
        await page.waitForFunction(() => document.querySelector("#status").dataset.turn === "me", null, { timeout: 15000 });
        await run.mark("輪到你（第 " + (i / 2 + 1) + " 步）");
        if (i === 0) { await mvUci(page, alt.uci); await page.waitForSelector("#fb .feedback.ok"); await run.mark("「也可以！」訊息"); }
        if (i === 2) { await move(page, "a2", "a3"); await page.waitForSelector("#fb .feedback.bad"); await run.mark("走錯回饋（箭頭＋解釋）"); await page.locator("#retry").click(); await run.mark("再試一次"); }
        await mvUci(page, ucis[i]); await run.mark("走對（對方自動走中）", 80);
      }
      await page.waitForSelector("#again", { timeout: 15000 }); await run.mark("路線完成");
    });
    await scenario(browser, vp, "開局原則小測（題目、答案回饋、下一題）", null, async (page, run) => {
      await page.goto(BASE + "openings.html"); await page.waitForSelector("#quiz-tile");
      await page.locator("#quiz-tile").click(); await page.waitForSelector("cg-board");
      for (let i = 0; i < 3; i++) { await run.mark("第 " + (i + 1) + " 題"); await page.locator(".opt").first().click(); await page.waitForSelector("#fb .feedback"); await run.mark("第 " + (i + 1) + " 題回饋"); await page.locator("#next").click(); }
    });

    /* ---------- 殘局 ---------- */
    await scenario(browser, vp, "殘局練習（提示箭頭、黑方思考、結束）", null, async (page, run) => {
      const p = EGD.TOPICS[0].positions.find(x => x.shortest >= 3);
      await page.goto(BASE + "endgames.html"); await page.waitForSelector("[data-topic]");
      await page.locator("[data-topic='kqk']").click(); await page.locator("[data-pos='" + p.id + "']").click(); await page.waitForSelector("cg-board");
      await run.mark("開局（引擎載入中）", 100); await run.mark("輪到玩家");
      await page.locator("#hint").click(); await page.waitForSelector("#fb .feedback", { timeout: 30000 }); await run.mark("提示：箭頭");
      for (let i = 0; i < p.cap; i++) {
        if (await page.locator("#end-box .btn-row").count()) break;
        await page.waitForFunction(() => document.querySelector("#end-box .btn-row") || document.querySelector("#status").dataset.turn === "me", null, { timeout: 60000 });
        if (await page.locator("#end-box .btn-row").count()) break;
        const fen = await page.evaluate(() => window.__chessopsEg.board().game.fen());
        const u = await page.evaluate(f => window.__chessopsMgr.run(f, { depth: 12 }).then(r => r.uci), fen);
        await mvUci(page, u); await run.mark("走一步：黑方思考中", 60);
      }
      await page.waitForSelector("#end-box .btn-row", { timeout: 60000 }); await run.mark("結束（星級／原因）");
    });
    await scenario(browser, vp, "殘局判斷題（答錯回饋）", null, async (page, run) => {
      const p = EGD.TOPICS[3].positions.find(x => x.task === "judge" && x.expect === "draw");
      await page.goto(BASE + "endgames.html"); await page.waitForSelector("[data-topic]");
      await page.locator("[data-topic='kpk']").click(); await page.locator("[data-pos='" + p.id + "']").click(); await page.waitForSelector("cg-board");
      await run.mark("題目"); await page.locator("[data-ans='win']").click(); await page.waitForSelector("#fb .feedback"); await run.mark("答錯回饋");
    });

    /* ---------- 小遊戲 ---------- */
    await scenario(browser, vp, "一步將死（對手先走、答錯、答對）", null, async (page, run) => {
      const M1 = require(path.join(ROOT, "data/mate1.js")), p = M1.filter(x => x.level === 1)[0], mv = p.moves.split(" ");
      await page.goto(BASE + "game-mate1.html?level=1"); await page.waitForSelector("cg-board");
      await run.mark("對手先走一步…", 100); await page.waitForFunction(() => { const s = document.querySelector(".status-line"); return s && s.dataset.turn === "me"; }, null, { timeout: 20000 }); await run.mark("輪到玩家");
      const g = new Chess(p.fen); g.move({ from: mv[0].slice(0, 2), to: mv[0].slice(2, 4), promotion: mv[0][4] });
      const bad = g.moves({ verbose: true }).find(m => { const c = new Chess(g.fen()); c.move(m); return !c.isCheckmate(); });
      await mvUci(page, uciOf(bad)); await page.waitForSelector(".feedback.bad"); await run.mark("答錯回饋");
      await mvUci(page, mv[1]); await page.waitForSelector(".feedback.ok"); await run.mark("答對回饋");
    });
    await scenario(browser, vp, "找出將軍（走法、已找到、時間）", null, async (page, run) => {
      await page.goto(BASE + "game-check.html"); await page.waitForSelector(".btn.primary");
      await page.locator(".btn.primary").click(); await page.waitForSelector("cg-board");
      const pz = await page.evaluate(() => window.__chessopsDebug.puzzle());
      await run.mark("開始");
      const g = new Chess(pz.fen), ms = g.moves({ verbose: true }), checks = new Set(pz.checks);
      const bad = ms.find(m => !checks.has(uciOf(m))), good = ms.find(m => checks.has(uciOf(m)));
      await mvUci(page, uciOf(bad)); await run.mark("走咗唔係將軍嘅一步");
      await mvUci(page, uciOf(good)); await run.mark("找到一個將軍");
    });
    await scenario(browser, vp, "騎士迷宮（提示、走步、悔一步、過關）", null, async (page, run) => {
      await page.goto(BASE + "game-maze.html?level=2"); await page.waitForSelector("cg-board");
      const path1 = await page.evaluate(() => { const l = window.ChessOps.MazeLevels[1]; return window.ChessOps.KnightMaze.solve(l); });
      await run.mark("開局");
      await page.locator("button:has-text('提示')").click(); await run.mark("提示");
      for (let i = 0; i + 1 < path1.path.length; i++) {
        await move(page, path1.path[i], path1.path[i + 1]); await run.mark("走第 " + (i + 1) + " 步", 120);
        if (i === 0) { await page.locator("button:has-text('悔一步')").click(); await run.mark("悔一步"); await move(page, path1.path[0], path1.path[1]); }
      }
      await page.waitForSelector(".feedback.ok"); await run.mark("過關回饋");
    });
    await scenario(browser, vp, "兵仗（設定、對局、電腦思考）", null, async (page, run) => {
      await page.goto(BASE + "game-pawnwar.html"); await page.waitForSelector("button:has-text('開始對局')");
      await page.locator("button:has-text('開始對局')").click(); await page.waitForSelector("cg-board");
      await run.mark("開始", 300);
      for (let i = 0; i < 2; i++) {
        const mv = await page.evaluate(() => { const b = document.querySelector("cg-board"); return !!b; });
        const f = ["e2e4", "d2d4"][i];
        await mvUci(page, f); await run.mark("走一步：電腦思考中", 60);
        await page.waitForFunction(() => document.querySelector(".status-line").dataset.turn === "me", null, { timeout: 20000 }); await run.mark("輪到玩家");
      }
    });

    /* ---------- 規則快測：6 組、每組 5 題（選擇題同棋盤題；單數題故意答錯） ---------- */
    for (const gid of ["castling", "enpassant", "promotion", "mate", "draw", "check"]) {
      await scenario(browser, vp, "規則快測：" + gid + "（5 題連續，題目長短唔同）", null, async (page, run) => {
        await page.goto(BASE + "quiz.html?g=" + gid); await page.waitForSelector("cg-board");
        const qs = await page.evaluate(g => window.ChessOps.RulesQuiz.QUESTIONS.filter(q => q.group === g), gid);
        for (let i = 0; i < qs.length; i++) {
          const q = qs[i];
          await run.mark("第 " + (i + 1) + " 題（" + q.type + "）");
          if (q.type === "choice") {
            const wrong = i % 2 === 1 ? q.options.find(o => o.key !== q.answer) : null;
            await page.locator(".opt[data-key=\"" + (wrong ? wrong.key : q.answer) + "\"]").click();
          } else {
            const u = q.answer[0]; await move(page, u.slice(0, 2), u.slice(2, 4));
            if (u.length > 4) { await page.locator(".promo-list button").nth("qrbn".indexOf(u[4])).click(); }
          }
          await page.waitForSelector(".feedback"); await run.mark("第 " + (i + 1) + " 題回饋（答啱／答錯）");
          if (i < qs.length - 1) await page.locator("button.primary").click();
        }
      });
    }

    /* ---------- 我的謎題、我的對局分析、賽後檢討 ---------- */
    const bad = '[Event "Live Chess"]\n[White "Rival"]\n[Black "Kid_User"]\n[Result "1-0"]\n[UTCDate "2026.11.20"]\n\n1. f3 e5 2. g4 Nf6 3. d3 d5 4. e4 dxe4 5. dxe4 Qxd1+ 6. Kxd1 Nxe4 7. fxe4 Bb4 1-0';
    await scenario(browser, vp, "我的對局：分析結果 → 局面頁（上一個／下一個、加入我的謎題）", null, async (page, run) => {
      await page.goto(BASE + "mygames.html"); await page.waitForSelector("#user");
      await page.locator("#user").fill("Kid_User"); await page.locator("#pgn-text").fill(bad); await page.locator("#pgn-go").click();
      await page.waitForSelector("#pgn-list [data-act='analyze']"); await page.locator("#pgn-list [data-act='analyze']").click();
      await page.waitForSelector("#rv-summary", { timeout: 120000 });
      const n = await page.locator(".rev-item").count();
      await page.locator(".rev-item").first().click(); await page.waitForSelector("#add-puzzle");
      await run.mark("第 1 個局面");
      await page.locator("#add-puzzle").click(); await page.waitForSelector("#fb .feedback"); await run.mark("加入我的謎題（回饋）");
      for (let i = 1; i < n; i++) { await page.locator("button:has-text('下一個')").click(); await run.mark("第 " + (i + 1) + " 個局面"); }
    });
    await scenario(browser, vp, "我的謎題練習（提示、答錯、答對）", stateWith(s => {
      s.mygames.puzzles = [{ id: "mabc123", fen: "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2", best: "d8h4", bestSan: "Qh4#", cp: 1000, side: "b", date: "2026-11-20" }];
    }), async (page, run) => {
      await page.goto(BASE + "puzzles.html"); await page.waitForSelector("#mine");
      await page.locator("#mine").click(); await page.waitForSelector("cg-board"); await run.mark("題目");
      await page.locator("#hint").click(); await page.waitForSelector(".feedback"); await run.mark("提示 1");
      await mvUci(page, "g8f6"); await page.waitForSelector(".feedback.bad", { timeout: 20000 }); await run.mark("答錯回饋");
      await page.locator("#retry").click(); await run.mark("再試");
      await mvUci(page, "d8h4"); await page.waitForSelector(".feedback.ok", { timeout: 20000 }); await run.mark("答對回饋");
    });
    const missPgn = PLG.buildPgn(Chess, (() => { const g = new Chess(); ["f3", "e5", "g4", "Nf6", "d3", "d5"].forEach(x => g.move(x)); return g.history({ verbose: true }).map(uciOf); })(), { playerColor: "b", level: 3, result: "w", date: "2026-11-14", reason: "resign" });
    await scenario(browser, vp, "對電腦下棋：賽後檢討（局面頁上一個／下一個）", stateWith(s => { s.play.recent = [{ date: "2026-11-14", level: 3, color: "b", result: "loss", reason: "resign", pgn: missPgn, blunders: null, plies: 6 }]; }), async (page, run) => {
      await page.goto(BASE + "play.html"); await page.waitForSelector(".recent-row");
      await page.locator(".recent-row button:has-text('檢討')").click(); await page.waitForSelector("#rv-summary", { timeout: 120000 });
      const n = await page.locator(".rev-item").count();
      await page.locator(".rev-item").first().click(); await page.waitForSelector("#rv-pos-text"); await run.mark("檢討：第 1 個局面");
      for (let i = 1; i < n; i++) { await page.locator("button:has-text('下一個')").click(); await run.mark("檢討：第 " + (i + 1) + " 個局面"); }
    });
  }
  await browser.close();
  fs.writeFileSync(process.env.OUTJSON || path.resolve(ROOT, "docs/layout-check.json"), JSON.stringify({ tolerancePx: TOL, results }, null, 1) + "\n");
  console.log(errors.length ? "\nconsole 錯誤：\n" + errors.join("\n") : "\n沒有 console 錯誤");
  console.log(failed ? "\n失敗 " + failed + " 項" : "\n全部通過");
  process.exit(failed || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

function ok(v, re) { if (!re.test(String(v))) { failed++; console.log("  ✗ 預期內容符合 " + re + "：" + v); } }
