/*
 * 離線測試（Playwright，Chromium／Edge）：
 *   1. 正常打開一次首頁，等 service worker 安裝好、快取齊全
 *   2. 設定離線（context.setOffline(true)）
 *   3. 逐個頁面打開並做一個基本操作（謎題答一題、對電腦走一步、殘局走一步…），全部要成功，冇 console 錯誤、冇失敗嘅請求
 *      （「我的對局」讀 chess.com 除外：離線時要顯示「需要網絡才能讀取對局，可以改用貼上 PGN」，貼上 PGN 分析照常）
 * 用法：node tools/serve.js 8123；NODE_PATH=…playwright-core… node tools/offline-test.js     （BASE 可以指向線上網址）
 */
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright-core");
const ROOT = path.resolve(__dirname, "..");
const { Chess } = require(path.join(ROOT, "vendor/chess.js/chess.cjs"));
const { precacheList } = require("./build-sw.js");
const M1 = require(path.join(ROOT, "data/mate1.js"));

const BASE = process.env.BASE || "http://localhost:8123/";
const errors = [];
let failed = 0;
function ok(cond, msg) { if (!cond) { failed++; console.log("  ✗ " + msg); } else console.log("  ✓ " + msg); }
const uciOf = m => m.from + m.to + (m.promotion || "");

async function rect(page) { await page.locator("cg-board").scrollIntoViewIfNeeded(); return page.evaluate(() => { const b = document.querySelector("cg-board").getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, flipped: !!document.querySelector(".orientation-black") }; }); }
async function pt(page, sq) { const r = await rect(page), f = "abcdefgh".indexOf(sq[0]), rk = Number(sq[1]) - 1, s = r.w / 8; const col = r.flipped ? 7 - f : f, row = r.flipped ? rk : 7 - rk; return { x: r.x + (col + 0.5) * s, y: r.y + (row + 0.5) * s }; }
async function clickSq(page, sq) { const p = await pt(page, sq); await page.mouse.click(p.x, p.y); await page.waitForTimeout(100); }
async function move(page, from, to) { await clickSq(page, from); await clickSq(page, to); }
const mvUci = (page, u) => move(page, u.slice(0, 2), u.slice(2, 4));
const turnMe = (page, t) => page.waitForFunction(() => { const s = document.querySelector("#status") || document.querySelector(".status-line"); return s && s.dataset.turn === "me"; }, null, { timeout: t || 40000 });

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER === "chrome" ? "chrome" : "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1 });     // 允許 service worker
  await ctx.addInitScript(() => { try { if (!localStorage.getItem("chessops_state")) localStorage.setItem("chessops_state", JSON.stringify({ settings: { computerSpeed: "fast" }, onboarding: { welcomed: true } })); } catch (e) { /* 忽略 */ } });
  let current = "";
  async function open(url) {
    const page = await ctx.newPage();
    // 「我的對局」離線時故意去讀 chess.com：瀏覽器會記一個 ERR_INTERNET_DISCONNECTED（預期，頁面會顯示「需要網絡才能讀取對局」）
    page.on("console", m => { const u = m.location() && m.location().url; if (m.type() === "error" && !(u && !u.startsWith(BASE)) && !(current === "我的對局" && /ERR_INTERNET_DISCONNECTED/.test(m.text()))) errors.push(current + " → console：" + m.text() + (u ? "（" + u.replace(BASE, "").slice(0, 60) + "）" : "")); });
    page.on("pageerror", e => errors.push(current + " → 頁面錯誤：" + e.message));
    // 只計 App 自己（BASE 之下）嘅請求；瀏覽器自己對網站根目錄嘅隨機路徑請求（Edge 內建功能，唔係 App 發出）唔計
    page.on("requestfailed", r => { if (r.url().startsWith(BASE)) errors.push(current + " → 請求失敗：" + r.url().replace(BASE, "")); });
    await page.goto(BASE + url);
    return page;
  }

  console.log("第 1 步：有網絡，打開首頁，等 service worker 安裝同快取齊全");
  current = "首次打開";
  const first = await open("index.html");
  const info = await first.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    const names = await caches.keys();
    const c = names.length ? await (await caches.open(names.find(n => n.startsWith("chessops-")))).keys() : [];
    return { active: !!reg.active, names, count: c.length };
  });
  const list = precacheList();
  ok(info.active, "service worker 已啟用");
  ok(info.names.length === 1 && /^chessops-v\d+\.\d+\.\d+-[0-9a-f]{8}$/.test(info.names[0]), "快取名稱：" + info.names.join(","));
  ok(info.count === list.length, "已快取 " + info.count + " 個檔案（清單 " + list.length + " 個）");
  const ver = require(path.join(ROOT, "js/version.js"));
  ok(info.names[0] && info.names[0].startsWith("chessops-v" + ver + "-"), "快取版本同 App 版本號一致（" + ver + "）");
  await first.reload(); await first.waitForTimeout(500);
  ok(await first.evaluate(() => !!navigator.serviceWorker.controller), "重新載入後頁面由 service worker 控制");
  await first.close();

  await ctx.setOffline(true);
  console.log("\n第 2 步：離線，逐個頁面做基本操作");
  const test = async (name, url, fn) => {
    current = name;
    const before = errors.length;
    let page;
    try {
      page = await open(url);
      await fn(page);
    } catch (e) { failed++; console.log("  ✗ " + name + "｜例外：" + e.message.split("\n")[0]); }
    if (page) { await page.waitForTimeout(300); await page.close(); }
    const mine = errors.slice(before);
    ok(mine.length === 0, name + "：離線冇 console 錯誤／失敗請求" + (mine.length ? "（" + mine.join("；").slice(0, 200) + "）" : ""));
  };

  await test("首頁", "index.html", async p => { await p.waitForSelector("#title-name"); ok((await p.locator("a.mod").count()) === 7, "首頁：稱號卡同 7 個入口"); });
  await test("規則快測與小遊戲", "rules.html", async p => { await p.waitForSelector("a"); ok(await p.locator("a.tile, a.mod, a").count() > 3, "規則頁載入"); });
  await test("規則快測", "quiz.html?g=castling", async p => { await p.waitForSelector("cg-board"); await p.locator(".opt").first().click(); await p.waitForSelector(".feedback"); ok(true, "規則快測：答一題有回饋"); });
  await test("一步將死", "game-mate1.html?level=1", async p => {
    const mv = M1.filter(x => x.level === 1)[0].moves.split(" ");
    await p.waitForSelector("cg-board"); await turnMe(p); await mvUci(p, mv[1]); await p.waitForSelector(".feedback.ok"); ok(true, "一步將死：走出將死步");
  });
  await test("找出將軍", "game-check.html", async p => { await p.locator(".btn.primary").click(); await p.waitForSelector("cg-board"); ok(true, "找出將軍：開始"); });
  await test("騎士迷宮", "game-maze.html?level=1", async p => { await p.waitForSelector("cg-board"); await p.locator("button:has-text('提示')").click(); ok(true, "騎士迷宮：棋盤同提示"); });
  await test("兵仗", "game-pawnwar.html", async p => {
    await p.locator("button:has-text('開始對局')").click(); await p.waitForSelector("cg-board"); await turnMe(p);
    await move(p, "e2", "e4"); await turnMe(p); ok(/^電腦走了 /.test(await p.locator(".status-line").textContent()), "兵仗：電腦（引擎快取）回應：" + (await p.locator(".status-line").textContent()));
  });
  await test("戰術謎題", "puzzles.html", async p => {
    await p.locator("#go-rec").click(); await p.waitForSelector("cg-board"); await turnMe(p);
    for (let k = 0; k < 6; k++) {
      const exp = await p.evaluate(() => window.__chessopsDebug.expected()); await mvUci(p, exp);
      try { await p.waitForSelector(".feedback.ok", { timeout: 2500 }); break; } catch (e) { await p.waitForTimeout(700); }
    }
    ok(await p.locator(".feedback.ok").count() === 1, "戰術謎題：離線載入題目並答對一題");
  });
  await test("對電腦下棋", "play.html", async p => {
    await p.locator("button[data-level='1']").click(); await p.locator("button[data-color='w']").click(); await p.locator("#start").click(); await p.waitForSelector("cg-board"); await turnMe(p);
    await move(p, "e2", "e4"); await p.waitForFunction(() => document.querySelector("#status").dataset.turn === "opp"); await turnMe(p);
    ok(/^電腦走了 /.test(await p.locator("#status").textContent()), "對電腦下棋：Stockfish（離線快取）走了一步：" + (await p.locator("#status").textContent()));
  });
  await test("走棋前三問", "three.html", async p => { await p.locator("#start").click(); await p.waitForSelector("cg-board"); await p.locator("#opt-none").click(); await p.waitForSelector("#fb .feedback"); ok(true, "走棋前三問：答一題"); });
  await test("開局訓練", "openings.html", async p => {
    await p.locator("[data-route='w-italian']").click(); await p.waitForSelector("cg-board"); await turnMe(p);
    await move(p, "e2", "e4"); await p.waitForFunction(() => document.querySelector("#status").dataset.turn === "opp"); await turnMe(p);
    ok(/^對手走了 e5/.test(await p.locator("#status").textContent()), "開局：走 e4，對手回應 e5");
  });
  await test("殘局訓練", "endgames.html", async p => {
    await p.locator("[data-topic='kqk']").click(); await p.locator("[data-pos]").nth(2).click(); await p.waitForSelector("cg-board"); await turnMe(p);
    const fen = await p.evaluate(() => window.__chessopsEg.board().game.fen());
    const u = await p.evaluate(f => window.__chessopsMgr.run(f, { depth: 10 }).then(r => r.uci), fen);
    await mvUci(p, u); await p.waitForFunction(() => document.querySelector("#end-box .btn-row") || document.querySelector("#status").dataset.turn === "opp", null, { timeout: 20000 });
    await p.waitForFunction(() => document.querySelector("#end-box .btn-row") || document.querySelector("#status").dataset.turn === "me", null, { timeout: 40000 });
    ok(true, "殘局：離線走一步，黑方（引擎）回應");
  });
  await test("我的對局", "mygames.html", async p => {
    await p.locator("#user").fill("hikaru"); await p.locator("#load").click();
    await p.waitForFunction(() => /需要網絡才能讀取對局/.test(document.querySelector("#msg").textContent), null, { timeout: 15000 });
    ok((await p.locator("#msg").textContent()).includes("需要網絡才能讀取對局，可以改用貼上 PGN"), "離線：「需要網絡才能讀取對局，可以改用貼上 PGN」");
    const pgn = '[Event "x"]\n[White "Rival"]\n[Black "Kid_User"]\n[Result "1-0"]\n\n1. f3 e5 2. g4 Nf6 3. d3 d5 4. e4 dxe4 1-0';
    await p.locator("#user").fill("Kid_User"); await p.locator("#pgn-text").fill(pgn); await p.locator("#pgn-go").click();
    await p.waitForSelector("#pgn-list [data-act='analyze']"); await p.locator("#pgn-list [data-act='analyze']").click();
    await p.waitForSelector("#rv-summary", { timeout: 90000 }); ok(true, "貼上 PGN：離線分析（引擎快取）成功");
  });
  await test("家長週報", "report.html", async p => { await p.waitForSelector("#summary"); ok(true, "週報載入"); });
  await test("設定", "settings.html", async p => {
    await p.waitForSelector("#app-version"); await p.waitForFunction(() => /已準備好/.test(document.querySelector("#offline-status").textContent), null, { timeout: 8000 });
    ok((await p.locator("#app-version").textContent()).trim() === ver, "設定頁：版本 " + ver + "、離線狀態「已準備好」");
  });

  await ctx.setOffline(false);
  await browser.close();
  console.log(errors.length ? "\n錯誤：\n" + errors.join("\n") : "\n離線全部頁面：沒有 console 錯誤、沒有失敗請求");
  process.exit(failed || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
