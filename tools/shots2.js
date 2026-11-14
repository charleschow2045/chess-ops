/*
 * 第 2 階段：用 Playwright 喺 820×1180 跑謎題完整流程（真滑鼠）並截圖到 docs/stage2-shots/。
 * 用法同 tools/shots.js：先 node tools/serve.js 8123；需要 playwright-core（放喺 repo 外面，用 NODE_PATH）。
 * BASE=https://… 可以測試線上網址；OUT=… 可以改截圖目錄。
 */
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright-core");

const BASE = process.env.BASE || "http://localhost:8123/";
const OUT = process.env.OUT || path.resolve(__dirname, "../docs/stage2-shots");
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
let failed = 0;
function ok(cond, msg) { if (!cond) { failed++; console.log("  ✗ " + msg); } else console.log("  ✓ " + msg); }

async function boardRect(page) { return page.evaluate(() => { const b = document.querySelector("cg-board").getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, flipped: !!document.querySelector(".orientation-black") }; }); }
async function pt(page, sq) {
  const r = await boardRect(page), f = "abcdefgh".indexOf(sq[0]), rk = Number(sq[1]) - 1, s = r.w / 8;
  const col = r.flipped ? 7 - f : f, row = r.flipped ? rk : 7 - rk;
  return { x: r.x + (col + 0.5) * s, y: r.y + (row + 0.5) * s };
}
async function move(page, from, to) {
  const a = await pt(page, from), b = await pt(page, to);
  await page.mouse.click(a.x, a.y); await page.waitForTimeout(60); await page.mouse.click(b.x, b.y); await page.waitForTimeout(300);
}
async function playUci(page, u) {
  await move(page, u.slice(0, 2), u.slice(2, 4));
  if (u.length > 4 && await page.locator(".promo-list button").count()) { await page.locator(".promo-list button").nth("qrbn".indexOf(u[4])).click(); await page.waitForTimeout(300); }
}
async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name + ".png") }); console.log("  📷 " + name + ".png"); }
const stateOf = page => page.evaluate(() => JSON.parse(localStorage.getItem("chessops_state") || "{}"));
const text = (page, sel) => page.locator(sel).first().textContent().then(t => t.trim()).catch(() => "");

/* 等到輪到玩家（對手第 1 步自動走完、狀態列有「走棋」） */
async function waitPlayerTurn(page) {
  await page.waitForFunction(() => /走棋/.test(document.querySelector(".status-line") ? document.querySelector(".status-line").textContent : ""), null, { timeout: 8000 });
  await page.waitForTimeout(150);
}
/* 一直走標準答案，直到出現「答對」 */
async function solve(page) {
  for (let guard = 0; guard < 8; guard++) {
    if (await page.locator("#next").isVisible()) return await page.locator(".feedback.ok").count() > 0;
    const u = await page.evaluate(() => window.__chessopsDebug.expected());
    if (!u) return false;
    await playUci(page, u);
    await page.waitForTimeout(800);                         // 對手回應（0.5 秒）
  }
  const done = (await page.locator("#next").isVisible()) && (await page.locator(".feedback.ok").count()) > 0;
  if (!done) console.log("    （除錯）solve 失敗：", JSON.stringify(await page.evaluate(() => ({ p: window.__chessopsDebug.puzzle(), exp: window.__chessopsDebug.expected(), mistakes: window.__chessopsDebug.mistakes(), fb: document.querySelector(".feedback") && document.querySelector(".feedback").textContent }))));
  return done;
}

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER === "chrome" ? "chrome" : "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem("chessops_test_cleared")) { localStorage.clear(); sessionStorage.setItem("chessops_test_cleared", "1"); } } catch (e) { /* 忽略 */ } });
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(e.message));
  const go = async url => { await page.goto(BASE + url); await page.waitForTimeout(500); };

  console.log("首頁（戰術謎題入口已開放，顯示謎題分）");
  await go("index.html");
  ok(await page.locator("a.mod").count() === 3, "首頁有 3 個可進入的模組");
  ok((await text(page, "a.mod[href='puzzles.html']")).includes("謎題分 700"), "首頁顯示真實謎題分 700");
  await shot(page, "01-home");

  console.log("謎題首頁");
  await go("puzzles.html");
  ok((await text(page, "#rating")) === "700", "起始謎題分 700");
  ok(await page.locator("#book").isDisabled(), "錯題本一開始是空的（按鈕停用）");
  await shot(page, "02-puzzles-home");

  console.log("推薦練習：第 1 題 — 對手先自動走一步，玩家以自己一方在下面");
  await page.locator("#go-rec").click();
  await page.waitForSelector("cg-board"); await waitPlayerTurn(page);
  const p1 = await page.evaluate(() => window.__chessopsDebug.puzzle());
  const white = await page.evaluate(fen => fen.split(" ")[1] === "b", p1.fen);   // FEN 輪到黑 → 玩家執白
  ok((await boardRect(page)).flipped === !white, "棋盤方向：玩家一方在下面（玩家執" + (white ? "白" : "黑") + "）");
  ok(await page.locator("cg-board square.last-move").count() >= 1, "對手第 1 步已自動走出（有最後一步高亮）");
  ok(await page.locator("#tags").isHidden(), "推薦模式：答題前不顯示主題標籤");
  await shot(page, "03-puzzle-before");

  console.log("走錯一步：即時顯示答錯＋箭頭，然後可「再試一次」");
  const bad = await page.evaluate(() => window.__chessopsDebug.wrongMove());
  await playUci(page, bad);
  ok(await page.locator(".feedback.bad").count() === 1, "顯示「答錯了」");
  ok(await page.locator(".cg-shapes line, .cg-shapes path, .cg-shapes polygon").count() > 0, "用箭頭顯示正確走法");
  ok(await page.locator("#retry").isVisible() && await page.locator("#next").isVisible(), "有「再試一次」同「下一題」");
  let st = await stateOf(page);
  ok(st.puzzles.rating < 700 && st.puzzles.wrong.length === 1, "答錯：謎題分下降（" + st.puzzles.rating + "），並加入錯題本");
  ok(await page.locator("#tags").isVisible(), "答完後顯示主題標籤");
  await shot(page, "04-puzzle-wrong");
  const ratingAfterWrong = st.puzzles.rating;
  await page.locator("#retry").click(); await waitPlayerTurn(page);
  ok(await solve(page), "再試一次後走對標準答案");
  st = await stateOf(page);
  ok(st.puzzles.rating === ratingAfterWrong, "再試一次答對不再改變謎題分");
  await page.locator("#next").click(); await page.waitForTimeout(400);

  console.log("第 2 題：第一次就答對 → 謎題分上升");
  await waitPlayerTurn(page);
  const before2 = (await stateOf(page)).puzzles.rating;
  ok(await solve(page), "第 2 題答對");
  const after2 = (await stateOf(page)).puzzles.rating;
  ok(after2 > before2, `答對加分：${before2} → ${after2}`);
  ok(/謎題分 \+\d+/.test(await text(page, ".feedback")), "回饋文字顯示謎題分變動");
  await shot(page, "05-puzzle-correct");
  await page.locator("#next").click(); await page.waitForTimeout(400);

  console.log("第 3 題：用提示（第一次圈出棋子，第二次箭頭）→ 不計分");
  await waitPlayerTurn(page);
  const before3 = (await stateOf(page)).puzzles;
  const hintId = await page.evaluate(() => window.__chessopsDebug.puzzle().id);
  await page.locator("#hint").click(); await page.waitForTimeout(250);
  const circles1 = await page.locator(".cg-shapes circle").count();
  ok(circles1 >= 1, "提示 1：圈出要走的棋子");
  await page.locator("#hint").click(); await page.waitForTimeout(250);
  ok(await page.locator(".cg-shapes line, .cg-shapes path, .cg-shapes polygon").count() > 0, "提示 2：箭頭顯示答案");
  await shot(page, "06-puzzle-hint");
  ok(await solve(page), "用提示後答對");
  const after3 = (await stateOf(page)).puzzles;
  ok(after3.rating === before3.rating && after3.rated === before3.rated, "用提示的題目不計分（謎題分同已計分題數不變）");
  ok(/不計分/.test(await text(page, ".feedback")), "回饋顯示「不計分」");
  ok((await stateOf(page)).puzzles.wrong.some(w => w.id === hintId), "用提示答對的題目都入錯題本");
  await page.locator("#next").click(); await page.waitForTimeout(400);

  for (const n of [4, 5]) {
    await waitPlayerTurn(page);
    ok(await solve(page), "第 " + n + " 題答對");
    await page.locator("#next").click(); await page.waitForTimeout(500);
  }
  console.log("一輪小結");
  await page.waitForSelector("#again");
  ok((await text(page, ".score-box .big")) === "4 / 5", "小結：答對 4 / 5（第 1 題答錯）");
  ok(/謎題分 700 → \d+/.test(await text(page, ".score-box p:last-child")), "小結顯示謎題分升跌");
  await shot(page, "07-round-summary");
  st = await stateOf(page);
  ok(st.puzzles.history.length === 5 && st.puzzles.done.length === 5, "已記錄最近題目（" + st.puzzles.history.length + "）同做過嘅題目 id（" + st.puzzles.done.length + "）");

  console.log("錯題本：重做，連續答對 2 次移出");
  await page.locator("#back-home").click(); await page.waitForTimeout(300);
  ok((await text(page, "#book")).includes("錯題本（2 題）"), "錯題本有 2 題（答錯 1 題＋用提示 1 題）");
  await shot(page, "08-wrong-book");
  const ratingBeforeBook = (await stateOf(page)).puzzles.rating;
  const nBook = st.puzzles.wrong.length;
  for (let i = 1; i <= 2; i++) {
    await page.locator("#book").click();
    for (let k = 0; k < nBook; k++) {
      await page.waitForSelector("cg-board"); await waitPlayerTurn(page);
      ok(await page.locator("#tags").isVisible(), "錯題本題目一開始就顯示主題標籤");
      if (i === 1 && k === 0) await shot(page, "09-wrong-book-run");
      ok(await solve(page), "錯題本第 " + i + " 輪第 " + (k + 1) + " 題答對");
      await page.locator("#next").click(); await page.waitForTimeout(500);
    }
    await page.waitForSelector("#back-home");
    await page.locator("#back-home").click(); await page.waitForTimeout(300);
    st = await stateOf(page);
    if (i === 1) ok(st.puzzles.wrong.length === nBook && st.puzzles.wrong.every(w => w.streak === 1), "答對 1 次：連勝 1，仍在錯題本");
  }
  ok(st.puzzles.wrong.length === 0, "連續答對 2 次後移出錯題本");
  ok(st.puzzles.rating === ratingBeforeBook, "錯題本練習不影響謎題分");

  console.log("按主題練習（捉雙 Fork）");
  await page.locator("button[data-theme='fork']").click();
  await page.waitForSelector("cg-board"); await waitPlayerTurn(page);
  ok(await page.locator("#tags").isVisible() && (await text(page, "#tags")).includes("捉雙 Fork"), "按主題練習：一開始就顯示標籤，包含「捉雙 Fork」");
  const p2 = page;                                    // 同一個分頁（sessionStorage 唔變，儲存唔會被清走）
  const go2 = async url => { await p2.goto(BASE + url); await p2.waitForTimeout(600); };

  console.log("首頁顯示更新後嘅謎題分");
  await go2("index.html");
  const homeText = await text(p2, "a.mod[href='puzzles.html']");
  const finalRating = (await stateOf(p2)).puzzles.rating;
  ok(homeText.includes("謎題分 " + finalRating), "首頁顯示 謎題分 " + finalRating);
  await shot(p2, "10-home-rating");

  console.log("一步將死（Lichess 真實題目）");
  await go2("game-mate1.html?level=1");
  await p2.locator("a.tile").first().waitFor().catch(() => {});
  await go2("game-mate1.html?level=1");
  await waitPlayerTurn(p2);
  await shot(p2, "11-mate1-lichess");
  const m1 = await p2.evaluate(() => window.ChessOps.Mate1.filter(p => p.level === 1)[0]);
  const mu = m1.moves.split(" ")[1];
  await playUci(p2, mu);
  ok(await p2.locator(".feedback.ok").count() === 1, "一步將死第 1 題用 Lichess 答案答對");
  await shot(p2, "12-mate1-solved");

  console.log("棋盤座標：預設只在棋盤邊；設定開啟後每格顯示小寫格名");
  await go2("quiz.html?g=castling");
  ok(await p2.locator(".bf-files span").count() === 8 && await p2.locator(".bf-ranks span").count() === 8, "棋盤邊有 8 個檔座標同 8 個橫行座標");
  ok((await p2.locator(".bf-files").textContent()) === "abcdefgh" && (await p2.locator(".bf-ranks").textContent()) === "87654321", "座標內容：a–h、8–1（小寫）");
  ok(await p2.locator("cg-board").evaluate(() => !document.querySelector("coords.squares")), "預設不在每一格顯示格名");
  const fs14 = await p2.locator(".bf-files span").first().evaluate(e => parseFloat(getComputedStyle(e).fontSize));
  ok(fs14 >= 13, "座標字大小 " + fs14 + "px（≥13）");
  await shot(p2, "13-board-edge-coords");
  await go2("settings.html");
  await p2.locator("#square-names").check(); await p2.waitForTimeout(200);
  await shot(p2, "14-settings");
  ok((await stateOf(p2)).settings.squareNames === true, "設定已存入儲存（squareNames = true）");
  await go2("quiz.html?g=castling");
  ok(await p2.locator("coords.squares").count() >= 1, "開啟後每格顯示格名");
  const nameSample = await p2.locator("coords.squares coord").first().evaluate(e => ({ t: e.textContent, tt: getComputedStyle(e.parentElement).textTransform, fs: parseFloat(getComputedStyle(e.parentElement).fontSize) }));
  ok(/^[a-h][1-8]$/.test(nameSample.t) && nameSample.tt === "lowercase" && nameSample.fs >= 13, `格名顯示為小寫（${nameSample.t}）、${nameSample.fs}px`);
  await shot(p2, "15-board-square-names");
  await go2("settings.html");
  await p2.locator("#square-names").uncheck();

  console.log("倒轉棋盤時邊座標同步翻轉（黑方走棋題）");
  await go2("quiz.html?g=mate");
  await p2.locator(".opt").first().click();
  ok((await p2.locator(".bf-files").textContent()) === "hgfedcba" && (await p2.locator(".bf-ranks").textContent()) === "12345678", "黑方視角：座標 h–a、1–8");

  await browser.close();
  console.log(errors.length ? "\nconsole 錯誤：\n" + errors.join("\n") : "\n沒有 console 錯誤");
  process.exit(failed || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
