/*
 * 用 Playwright 喺 820×1180（iPad 直向）跑真實瀏覽器測試並截圖，輸出到 docs/stage1-shots/。
 * 用法：
 *   1. 另一個終端機：node tools/serve.js 8123
 *   2. npm i playwright-core（放喺 repo 外面，例如 NODE_PATH 指向嗰個 node_modules）
 *   3. node tools/shots.js            （使用本機已安裝嘅 Microsoft Edge；可用 BROWSER=chrome 轉用 Chrome）
 * 任何 console 錯誤或斷言失敗都會令程式以非 0 結束。
 */
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright-core");

const BASE = process.env.BASE || "http://localhost:8123/";
const OUT = process.env.OUT || path.resolve(__dirname, "../docs/stage1-shots");
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
let failed = 0;
function ok(cond, msg) { if (!cond) { failed++; console.log("  ✗ " + msg); } else console.log("  ✓ " + msg); }

async function boardRect(page) { return page.evaluate(() => { const b = document.querySelector("cg-board").getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, flipped: !!document.querySelector(".orientation-black") }; }); }
async function pt(page, sq) {
  const r = await boardRect(page), f = "abcdefgh".indexOf(sq[0]), rk = Number(sq[1]) - 1, s = r.w / 8;
  const col = r.flipped ? 7 - f : f, row = r.flipped ? rk : 7 - rk;
  return { x: r.x + (col + 0.5) * s, y: r.y + (row + 0.5) * s };
}
async function move(page, from, to, drag) {
  const a = await pt(page, from), b = await pt(page, to);
  if (drag) { await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 }); await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up(); }
  else { await page.mouse.click(a.x, a.y); await page.waitForTimeout(60); await page.mouse.click(b.x, b.y); }
  await page.waitForTimeout(350);
}
async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name + ".png") }); console.log("  📷 " + name + ".png"); }
async function fresh(ctx, url) {
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") errors.push(url + " → " + m.text()); });
  page.on("pageerror", e => errors.push(url + " → " + e.message));
  await page.goto(BASE + url);
  await page.waitForTimeout(500);
  return page;
}

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER === "chrome" ? "chrome" : "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1, hasTouch: false });
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) { /* 忽略 */ } });

  console.log("首頁");
  let page = await fresh(ctx, "index.html");
  ok(await page.locator(".mod.soon").count() === 5, "5 個模組顯示「即將推出」");
  ok(await page.locator("a.mod").count() === 2, "有 2 個模組可以進入（規則快測、戰術謎題）");
  await shot(page, "01-home");
  await page.close();

  console.log("規則快測（易位，choice 題）");
  page = await fresh(ctx, "quiz.html?g=castling");
  await shot(page, "02-quiz-before");
  await page.locator(".opt").first().click();
  await page.waitForTimeout(400);
  ok(await page.locator(".feedback.ok").count() === 1, "易位第 1 題答「可以」顯示答對");
  await shot(page, "03-quiz-after");
  await page.close();

  console.log("規則快測（吃過路兵，棋盤 play 題）");
  page = await fresh(ctx, "quiz.html?g=enpassant");
  await page.locator(".opt").nth(0).click(); await page.locator("button:has-text('下一題')").click();   // Q1 yes
  await page.locator(".opt").nth(1).click(); await page.locator("button:has-text('下一題')").click();   // Q2 no
  await page.waitForTimeout(300);
  await move(page, "e5", "f6");
  ok(await page.locator(".feedback.ok").count() === 1, "用滑鼠走 e5xf6 吃過路兵，判為答對");
  await shot(page, "04-quiz-play-correct");
  await page.close();

  console.log("一步將死");
  page = await fresh(ctx, "game-mate1.html?level=1");
  const m1 = await page.evaluate(() => window.ChessOps.Mate1.filter(p => p.level === 1)[0]);
  await page.waitForTimeout(900);                                  // 對手先自動走第 1 步
  const mu = m1.moves.split(" ")[1];
  await move(page, mu.slice(0, 2), mu.slice(2, 4));
  ok(await page.locator(".feedback.ok").count() === 1, "第 1 題用正確的將死步，顯示答對");
  await shot(page, "05-mate1-solved");
  await page.close();
  page = await fresh(ctx, "game-mate1.html?level=2");
  await shot(page, "05b-mate1-level2");
  await page.close();

  console.log("找出將軍");
  page = await fresh(ctx, "game-check.html");
  await page.locator("button:has-text('開始')").click(); await page.waitForTimeout(400);
  const ck = await page.evaluate(() => window.__chessopsDebug.puzzle());
  await move(page, ck.checks[0].slice(0, 2), ck.checks[0].slice(2, 4));
  ok(await page.locator(".found-list .chip").count() === 1, "走出一個將軍後，清單出現 1 個");
  await shot(page, "06-check-find");
  await page.close();

  console.log("騎士迷宮");
  page = await fresh(ctx, "game-maze.html?level=2");
  const path1 = await page.evaluate(() => { const l = window.ChessOps.MazeLevels[1]; return window.ChessOps.KnightMaze.solve(l); });
  await shot(page, "07-maze-start");
  for (let i = 0; i + 1 < path1.path.length; i++) await move(page, path1.path[i], path1.path[i + 1], i % 2 === 1);
  ok(await page.locator(".feedback.ok").count() === 1, "按 BFS 最短路徑走完第 2 關，顯示過關");
  await shot(page, "08-maze-solved");
  await page.close();

  console.log("兵仗");
  page = await fresh(ctx, "game-pawnwar.html");
  await shot(page, "09-pawnwar-setup");
  await page.locator("button:has-text('開始對局')").click();
  await page.waitForFunction(() => document.querySelector("cg-board") !== null, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  await move(page, "e2", "e4");
  await page.waitForFunction(() => document.querySelectorAll("cg-board piece.black").length > 0 && /輪到你/.test(document.querySelector(".status-line").textContent), null, { timeout: 20000 });
  ok(/1\. e4 \S+/.test(await page.locator(".moves").textContent()), "我方走 e4 後電腦有回應");
  await shot(page, "10-pawnwar-playing");
  await page.close();

  /* ---------- 完整流程測試（真滑鼠操作；不截圖） ---------- */
  console.log("規則快測：6 組全部答對（棋盤題用滑鼠走標準答案）");
  for (const gid of ["castling", "enpassant", "promotion", "mate", "draw", "check"]) {
    page = await fresh(ctx, "quiz.html?g=" + gid);
    const qs = await page.evaluate(g => window.ChessOps.RulesQuiz.QUESTIONS.filter(q => q.group === g), gid);
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];
      if (q.type === "choice") await page.locator(`.opt[data-key="${q.answer}"]`).click();
      else {
        const u = q.answer[0];
        await move(page, u.slice(0, 2), u.slice(2, 4));
        if (u.length > 4) { await page.locator(".promo-list button").nth("qrbn".indexOf(u[4])).click(); await page.waitForTimeout(300); }
      }
      await page.waitForTimeout(250);
      if (await page.locator(".feedback.ok").count() !== 1) { ok(false, `${gid} 第 ${i + 1} 題標準答案被判錯`); break; }
      await page.locator("button.primary").click(); await page.waitForTimeout(250);
    }
    const sc = await page.locator(".score-box .big").textContent().catch(() => "");
    ok(sc.trim() === "5 / 5", `組別 ${gid} 全對 → ${sc.trim()}`);
    if (gid === "check") await shot(page, "11-quiz-result");
    await page.close();
  }
  console.log("規則快測：答錯棋盤題會收回棋步並用綠色箭咀顯示答案");
  page = await fresh(ctx, "quiz.html?g=enpassant");
  await page.locator(".opt").nth(0).click(); await page.locator("button.primary").click();
  await page.locator(".opt").nth(1).click(); await page.locator("button.primary").click(); await page.waitForTimeout(300);
  await move(page, "a2", "a3");                                  // 非吃過路兵
  ok(await page.locator(".feedback.bad").count() === 1, "走錯一步顯示答錯");
  ok(await page.locator(".cg-shapes line, .cg-shapes path").count() > 0, "顯示綠色箭咀");
  await shot(page, "12-quiz-play-wrong");
  await page.close();
  console.log("成績已儲存並顯示喺選單頁");
  page = await fresh(ctx, "rules.html");
  await shot(page, "13-rules-hub");
  await page.close();

  console.log("一步將死：第 1 級 15 題全部答對");
  page = await fresh(ctx, "game-mate1.html?level=1");
  const m1all = await page.evaluate(() => window.ChessOps.Mate1.filter(p => p.level === 1));
  for (const p of m1all) {
    await page.waitForTimeout(900);
    const mv = p.moves.split(" ")[1];
    await move(page, mv.slice(0, 2), mv.slice(2, 4));
    await page.waitForTimeout(250);
    await page.locator("button.primary").click(); await page.waitForTimeout(250);
  }
  ok((await page.locator(".score-box .big").textContent()).trim() === "15 / 15", "一步將死第 1 級 15 / 15");
  await page.close();

  console.log("騎士迷宮：第 1、8、15 關按最短路徑過關");
  for (const n of [1, 8, 15]) {
    page = await fresh(ctx, "game-maze.html?level=" + n);
    const sol = await page.evaluate(i => window.ChessOps.KnightMaze.solve(window.ChessOps.MazeLevels[i - 1]), n);
    for (let i = 0; i + 1 < sol.path.length; i++) await move(page, sol.path[i], sol.path[i + 1], i % 2 === 1);
    ok(await page.locator(".feedback.ok").count() === 1 && /完美/.test(await page.locator(".feedback").textContent()), `第 ${n} 關用最少步數（${sol.par}）過關`);
    await page.close();
  }

  console.log("兵仗：兩人對戰，白方 5 步走到底線獲勝");
  page = await fresh(ctx, "game-pawnwar.html");
  await page.locator("button[data-mode='two']").click();
  await page.locator("button:has-text('開始對局')").click();
  await page.waitForSelector("cg-board");
  const seq = [["a2", "a4"], ["e8", "d8"], ["a4", "a5"], ["d8", "e8"], ["a5", "a6"], ["e8", "d8"], ["a6", "b7"], ["d8", "e8"], ["b7", "b8"]];
  for (const [a, b] of seq) await move(page, a, b);
  ok(/白方獲勝/.test(await page.locator(".feedback").textContent()), "兵走到 b8 後顯示「白方獲勝」");
  await shot(page, "14-pawnwar-win");
  await page.close();

  await browser.close();
  console.log(errors.length ? "\nconsole 錯誤：\n" + errors.join("\n") : "\n沒有 console 錯誤");
  process.exit(failed || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
