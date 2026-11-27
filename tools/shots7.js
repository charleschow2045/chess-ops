/*
 * 「電腦出棋速度」流程測試（Playwright，真滑鼠、真 Stockfish、820×1180）：截圖到 docs/speed-shots/
 *  - 設定頁：慢／中／快，預設「慢」，儲存後重新載入仍然保留
 *  - 對電腦下棋（慢／中／快）：玩家走棋之後到電腦走棋嘅停頓、電腦棋子動畫時間（用 requestAnimationFrame 取樣棋子位置）、玩家自己嘅動畫仍然約 180ms
 *  - 狀態行：電腦走完顯示「電腦走了 Nf6（g8 → f6）」，直到玩家走下一步先換回；最後一步高亮夠深
 *  - 戰術謎題：棋盤顯示原本局面之後先停一陣（跟速度）先走對手第一步；開局、殘局、兵仗、一步將死嘅對手步文字
 * 用法同 tools/shots6.js（先 node tools/serve.js 8123；NODE_PATH 指向 playwright-core）。
 */
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright-core");
const ROOT = path.resolve(__dirname, "..");
const State = require(path.join(ROOT, "js/state.js"));
const CFG = require(path.join(ROOT, "js/config.js"));
const OPEN = require(path.join(ROOT, "data/openings.js"));
const EGD = require(path.join(ROOT, "data/endgames.js"));
const { Chess } = require(path.join(ROOT, "vendor/chess.js/chess.cjs"));

const BASE = process.env.BASE || "http://localhost:8123/";
const OUT = process.env.OUT || path.resolve(__dirname, "../docs/speed-shots");
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
let failed = 0;
function ok(cond, msg) { if (!cond) { failed++; console.log("  ✗ " + msg); } else console.log("  ✓ " + msg); }
const uciOf = m => m.from + m.to + (m.promotion || "");
const LV = CFG.COMPUTER_SPEED.LEVELS;
const SAY = /^(電腦|對手)走了 \S+（[a-h][1-8] → [a-h][1-8]）/;

async function rect(page) { await page.locator("cg-board").scrollIntoViewIfNeeded(); return page.evaluate(() => { const b = document.querySelector("cg-board").getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, flipped: !!document.querySelector(".orientation-black") }; }); }
async function pt(page, sq) { const r = await rect(page), f = "abcdefgh".indexOf(sq[0]), rk = Number(sq[1]) - 1, s = r.w / 8; const col = r.flipped ? 7 - f : f, row = r.flipped ? rk : 7 - rk; return { x: r.x + (col + 0.5) * s, y: r.y + (row + 0.5) * s }; }
async function clickSq(page, sq) { const p = await pt(page, sq); await page.mouse.click(p.x, p.y); await page.waitForTimeout(100); }
async function move(page, from, to) { await clickSq(page, from); await clickSq(page, to); }
async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name + ".png") }); console.log("  📷 " + name + ".png"); }
const stateOf = page => page.evaluate(() => JSON.parse(localStorage.getItem("chessops_state") || "{}"));
const stateSpeed = key => { const s = State.defaultState(); if (key) s.settings.computerSpeed = key; return State.normalizeState(s); };
const turnIs = (page, who) => page.waitForFunction(w => { const s = document.querySelector("#status") || document.querySelector(".status-line"); return s && s.dataset.turn === w; }, who, { timeout: 40000 });
const statusText = page => page.evaluate(() => (document.querySelector("#status") || document.querySelector(".status-line")).textContent);

/* 棋子移動取樣：記錄每一幀棋子位置有冇改變，將連續改變嘅時間分成「一段動作」（段與段之間空 150ms 以上） */
const SAMPLER = () => {
  window.__bursts = [];
  let prev = "", cur = null, last = 0;
  (function loop(t) {
    const pcs = document.querySelectorAll("cg-board piece");
    let snap = ""; pcs.forEach(p => { snap += p.style.transform + ";"; });
    if (prev && snap !== prev) {
      if (!cur || t - last > 150) { cur = { start: t, end: t }; window.__bursts.push(cur); }
      cur.end = t; last = t;
    }
    prev = snap;
    requestAnimationFrame(loop);
  })(0);
};

async function scenario(browser, name, init, fn) {
  console.log(name);
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(st => { try { if (st && !localStorage.getItem("chessops_state")) localStorage.setItem("chessops_state", JSON.stringify(st)); } catch (e) { /* 忽略 */ } }, init);
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") errors.push(name + " → " + m.text()); });
  page.on("pageerror", e => errors.push(name + " → " + e.message));
  try { await fn(page); } catch (e) { failed++; console.log("  ✗ 例外：" + e.message.split("\n")[0]); }
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER === "chrome" ? "chrome" : "msedge" });

  await scenario(browser, "設定頁：電腦出棋速度（預設慢，儲存後保留）", null, async page => {
    await page.goto(BASE + "settings.html"); await page.waitForSelector("[data-speed]");
    ok((await page.locator("[data-speed='slow']").getAttribute("aria-pressed")) === "true", "預設選中「慢」");
    ok(await page.locator("[data-speed]").count() === 3 && (await page.locator(".speed-row").textContent()).includes("電腦出棋速度"), "有慢／中／快三個選項");
    await shot(page, "01-settings-speed-default");
    await page.locator("[data-speed='medium']").click();
    ok((await stateOf(page)).settings.computerSpeed === "medium" && (await page.locator("#saved").textContent()).includes("「中」"), "選「中」：已儲存並提示");
    await page.reload(); await page.waitForSelector("[data-speed]");
    ok((await page.locator("[data-speed='medium']").getAttribute("aria-pressed")) === "true", "重新載入後仍然是「中」");
    await page.locator("[data-speed='fast']").click();
    ok((await stateOf(page)).settings.computerSpeed === "fast", "選「快」：已儲存");
    await shot(page, "02-settings-speed-fast");
  });

  const measured = {};
  for (const key of ["slow", "medium", "fast"]) {
    await scenario(browser, "對電腦下棋（速度：" + LV[key].label + "）：停頓、動畫、「電腦走了…」文字、最後一步高亮", stateSpeed(key), async page => {
      await page.addInitScript(SAMPLER);
      await page.goto(BASE + "play.html"); await page.waitForSelector("#start");
      await page.locator("button[data-level='1']").click(); await page.locator("button[data-color='w']").click();
      await page.locator("#start").click(); await page.waitForSelector("cg-board");
      await turnIs(page, "me");
      ok((await statusText(page)).startsWith("輪到你"), "開局：狀態「輪到你」");
      await page.evaluate(() => { window.__bursts.length = 0; });
      await move(page, "e2", "e4");
      const t0 = Date.now();
      await turnIs(page, "opp"); ok((await statusText(page)) === "電腦思考中…", "玩家走完：「電腦思考中…」");
      await turnIs(page, "me");
      const dt = Date.now() - t0;
      measured[key] = { dt };
      ok(dt >= LV[key].pauseMin - 80, "停頓 " + dt + " 毫秒 >= " + LV[key].pauseMin + "（" + LV[key].label + "）");
      if (key !== "fast") ok(dt <= LV[key].pauseMax + 2500, "停頓 " + dt + " 毫秒（含引擎時間）冇過分長");
      const txt = await statusText(page);
      ok(SAY.test(txt) && txt.startsWith("電腦走了 "), "狀態行：" + txt);
      await page.waitForTimeout(LV[key].anim + 400);
      const bursts = await page.evaluate(() => window.__bursts.map(b => Math.round(b.end - b.start)));
      const comp = bursts[bursts.length - 1], mine = bursts[0];
      measured[key].anim = comp; measured[key].playerAnim = mine;
      console.log("    動作段（毫秒）：" + JSON.stringify(bursts));
      ok(comp >= LV[key].anim * 0.55 && comp <= LV[key].anim * 1.5 + 60, "電腦棋子動畫約 " + comp + " 毫秒（設定 " + LV[key].anim + "）");
      ok(mine <= 330, "玩家自己走棋動畫約 " + mine + " 毫秒（保持約 180，唔拖慢）");
      await page.waitForTimeout(1500);
      ok((await statusText(page)) === txt, "電腦上一步文字一直顯示，直到玩家走下一步");
      const hl = await page.evaluate(() => { const sq = document.querySelectorAll("cg-board square.last-move"); if (!sq.length) return null; const cs = getComputedStyle(sq[0]); return { n: sq.length, bg: cs.backgroundColor, sh: cs.boxShadow }; });
      ok(hl && hl.n === 2 && /rgba\(250, 196, 20, 0\.72\)/.test(hl.bg) && /inset/.test(hl.sh), "最後一步起點同終點高亮：" + (hl ? hl.bg + " ／ " + hl.sh.slice(0, 40) : "冇"));
      if (key === "slow") await shot(page, "03-play-computer-move-text-highlight");
      const u = await page.evaluate(() => { const g = window.__chessopsPlay.board().game; const m = g.moves({ verbose: true }).find(x => x.piece === "p") || g.moves({ verbose: true })[0]; return m.from + m.to; });
      await move(page, u.slice(0, 2), u.slice(2, 4));
      await turnIs(page, "opp"); ok((await statusText(page)) === "電腦思考中…", "玩家走下一步後，文字換成「電腦思考中…」");
      await turnIs(page, "me"); ok(/^電腦走了 /.test(await statusText(page)), "電腦再走：文字更新為新一步");
    });
  }
  ok(measured.slow && measured.medium && measured.fast && measured.slow.dt > measured.medium.dt - 300 && measured.medium.dt > measured.fast.dt - 300, "停頓時間：慢 " + (measured.slow || {}).dt + " ≥ 中 " + (measured.medium || {}).dt + " ≥ 快 " + (measured.fast || {}).dt + "（毫秒，含引擎時間，容許少量誤差）");
  ok(measured.slow && measured.slow.anim > (measured.medium || {}).anim && measured.medium.anim > (measured.fast || {}).anim - 30, "電腦動畫時間：慢 " + (measured.slow || {}).anim + " > 中 " + (measured.medium || {}).anim + " > 快 " + (measured.fast || {}).anim);

  for (const key of ["slow", "fast"]) {
    await scenario(browser, "戰術謎題（速度：" + LV[key].label + "）：棋盤顯示後先停一陣先走對手第一步；文字「對手走了…」", stateSpeed(key), async page => {
      await page.goto(BASE + "puzzles.html"); await page.waitForSelector("#go-rec");
      await page.locator("#go-rec").click(); await page.waitForSelector("cg-board");
      const t0 = Date.now();
      ok((await statusText(page)) === "對手先走一步…", "棋盤顯示好之後：「對手先走一步…」（原本局面）");
      await page.waitForTimeout(250);
      ok(await page.evaluate(() => document.querySelector(".status-line").dataset.turn) === "opp", "250 毫秒後對手仲未走");
      await turnIs(page, "me");
      const dt = Date.now() - t0;
      ok(dt >= LV[key].pauseMin - 150 && dt <= LV[key].pauseMax + 700, "對手第一步喺 " + dt + " 毫秒後先走（" + LV[key].label + "：" + LV[key].pauseMin + "–" + LV[key].pauseMax + "）");
      ok(/^對手走了 /.test(await statusText(page)) && SAY.test(await statusText(page)), "狀態行：" + (await statusText(page)));
      if (key === "slow") await shot(page, "04-puzzle-first-move");
    });
  }

  await scenario(browser, "開局訓練：對方自動走嘅步（停頓＋文字）", stateSpeed("fast"), async page => {
    const route = OPEN.ROUTES.find(r => r.id === "w-italian"), g0 = new Chess(), ucis = route.moves.map(s => uciOf(g0.move(s)));
    await page.goto(BASE + "openings.html"); await page.waitForSelector("[data-route]");
    await page.locator("[data-route='w-italian']").click(); await page.waitForSelector("cg-board");
    await turnIs(page, "me");
    ok((await statusText(page)).startsWith("輪到你"), "未有對方步：「輪到你…」");
    await move(page, ucis[0].slice(0, 2), ucis[0].slice(2, 4));
    await turnIs(page, "opp"); await turnIs(page, "me");
    ok(/^對手走了 e5（e7 → e5）/.test(await statusText(page)), "對方走 e5：" + (await statusText(page)));
    await shot(page, "05-openings-opponent-text");
  });
  await scenario(browser, "殘局訓練：黑方電腦嘅步（文字）", stateSpeed("fast"), async page => {
    const p = EGD.TOPICS[0].positions.find(x => x.shortest >= 3);
    await page.goto(BASE + "endgames.html"); await page.waitForSelector("[data-topic]");
    await page.locator("[data-topic='kqk']").click(); await page.locator("[data-pos='" + p.id + "']").click(); await page.waitForSelector("cg-board");
    await turnIs(page, "me");
    const fen = await page.evaluate(() => window.__chessopsEg.board().game.fen());
    const u = await page.evaluate(f => window.__chessopsMgr.run(f, { depth: 12 }).then(r => r.uci), fen);
    await move(page, u.slice(0, 2), u.slice(2, 4));
    await turnIs(page, "opp"); await turnIs(page, "me");
    ok(/^電腦走了 K\S+（[a-h][1-8] → [a-h][1-8]）/.test(await statusText(page)), "黑方走完：" + (await statusText(page)));
    await shot(page, "06-endgame-computer-text");
  });
  await scenario(browser, "兵仗：電腦嘅步（文字）", stateSpeed("fast"), async page => {
    await page.goto(BASE + "game-pawnwar.html"); await page.waitForSelector("button:has-text('開始對局')");
    await page.locator("button:has-text('開始對局')").click(); await page.waitForSelector("cg-board");
    await turnIs(page, "me"); await move(page, "e2", "e4");
    await turnIs(page, "opp"); await turnIs(page, "me");
    ok(/^電腦走了 /.test(await statusText(page)) && SAY.test(await statusText(page)), "兵仗：" + (await statusText(page)));
  });
  await scenario(browser, "一步將死：對手第一步（文字）", stateSpeed("fast"), async page => {
    await page.goto(BASE + "game-mate1.html?level=1"); await page.waitForSelector("cg-board");
    await turnIs(page, "me");
    ok(/^對手走了 /.test(await statusText(page)) && SAY.test(await statusText(page)), "一步將死：" + (await statusText(page)));
  });

  await browser.close();
  console.log(errors.length ? "\nconsole 錯誤：\n" + errors.join("\n") : "\n沒有 console 錯誤");
  process.exit(failed || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
