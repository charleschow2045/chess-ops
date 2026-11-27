/*
 * 第 5 階段：用 Playwright 喺 820×1180 跑「殘局訓練」「開局也可以走法」「三問：對方威脅將死」完整流程（真滑鼠、真 Stockfish），
 * 截圖到 docs/stage5-shots/。用法同 tools/shots4.js（先 node tools/serve.js 8123；NODE_PATH 指向 playwright-core）。
 */
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright-core");
const ROOT = path.resolve(__dirname, "..");
const { Chess } = require(path.join(ROOT, "vendor/chess.js/chess.cjs"));
const State = require(path.join(ROOT, "js/state.js"));
const OPEN = require(path.join(ROOT, "data/openings.js"));
const EGD = require(path.join(ROOT, "data/endgames.js"));

const BASE = process.env.BASE || "http://localhost:8123/";
const OUT = process.env.OUT || path.resolve(__dirname, "../docs/stage5-shots");
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
let failed = 0;
function ok(cond, msg) { if (!cond) { failed++; console.log("  ✗ " + msg); } else console.log("  ✓ " + msg); }

async function rect(page) { return page.evaluate(() => { const b = document.querySelector("cg-board").getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, flipped: !!document.querySelector(".orientation-black") }; }); }
async function pt(page, sq) { const r = await rect(page), f = "abcdefgh".indexOf(sq[0]), rk = Number(sq[1]) - 1, s = r.w / 8; const col = r.flipped ? 7 - f : f, row = r.flipped ? rk : 7 - rk; return { x: r.x + (col + 0.5) * s, y: r.y + (row + 0.5) * s }; }
async function clickSq(page, sq) { const p = await pt(page, sq); await page.mouse.click(p.x, p.y); await page.waitForTimeout(120); }
async function move(page, from, to) { await clickSq(page, from); await clickSq(page, to); await page.waitForTimeout(250); }
async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name + ".png") }); console.log("  📷 " + name + ".png"); }
const stateOf = page => page.evaluate(() => JSON.parse(localStorage.getItem("chessops_state") || "{}"));
const stateWith = fn => { const s = State.defaultState(); fn(s); return State.normalizeState(s); };
const topic = id => EGD.TOPICS.find(t => t.id === id);

/* 電腦出棋速度：測試預設用「快」（避免等太耐）；SPEED=slow／medium／fast 可以覆蓋。預設值「慢」由 tests/run-all.js 同 tools/shots7.js 另外驗證 */
const SPEED = process.env.SPEED || "fast";
const forceSpeed = init => { const s = init ? JSON.parse(JSON.stringify(init)) : { settings: {} }; s.settings = Object.assign({}, s.settings, { computerSpeed: SPEED }); return s; };
async function scenario(browser, name, init, fn, routes) {
  console.log(name);
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(st => { try { if (st && !localStorage.getItem("chessops_state")) localStorage.setItem("chessops_state", JSON.stringify(st)); } catch (e) { /* 忽略 */ } }, forceSpeed(init));
  const page = await ctx.newPage();
  if (routes) await routes(page);
  page.on("console", m => { if (m.type() === "error") errors.push(name + " → " + m.text()); });
  page.on("pageerror", e => errors.push(name + " → " + e.message));
  try { await fn(page); } catch (e) { failed++; console.log("  ✗ 例外：" + e.message.split("\n")[0]); }
  await ctx.close();
}

/* 用引擎建議嘅步（同 App 提示一樣嘅設定），用真滑鼠走到完結（成功或失敗） */
async function playWithEngine(page, maxMoves) {
  for (let i = 0; i < maxMoves; i++) {
    await page.waitForFunction(() => document.querySelector("#result") || document.querySelector("#fb .feedback.bad") || document.querySelector("#status").dataset.turn === "me", null, { timeout: 60000 });
    if (await page.locator("#end-box .btn-row").count()) return;
    const fen = await page.evaluate(() => window.__chessopsEg.board().game.fen());
    const uci = await page.evaluate(f => window.__chessopsMgr.run(f, { depth: 14 }).then(r => r.uci), fen);
    await move(page, uci.slice(0, 2), uci.slice(2, 4));
    await page.waitForTimeout(400);
  }
}

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER === "chrome" ? "chrome" : "msedge" });

  await scenario(browser, "首頁＋殘局課題清單（真實星數）", stateWith(s => { s.endgames.pos["kqk-1"] = { stars: 3, wins: 2, runs: 2, best: 1 }; s.endgames.pos["kqk-2"] = { stars: 2, wins: 1, runs: 3, best: 6 }; s.endgames.pos["kpk-1"] = { stars: 3, wins: 1, runs: 1, best: 0 }; }), async page => {
    await page.goto(BASE + "index.html"); await page.waitForTimeout(500);
    const total = EGD.TOPICS.reduce((a, t) => a + t.positions.length * 3, 0);
    ok((await page.locator("a.mod[href='endgames.html']").textContent()).includes("已取得 8 / " + total + " 星"), "首頁「殘局」顯示「已取得 8 / " + total + " 星」");
    await page.locator("a.mod[href='endgames.html']").click(); await page.waitForSelector("#star-total");
    ok((await page.locator("#star-total").textContent()).trim() === "8 / " + total + " ★", "課題清單頂部星數 8 / " + total);
    ok(await page.locator("[data-topic]").count() === 4, "有 4 個課題");
    await shot(page, "01-endgames-topics");
  });

  await scenario(browser, "課題說明卡＋局面清單", null, async page => {
    await page.goto(BASE + "endgames.html"); await page.waitForSelector("[data-topic]");
    await page.locator("[data-topic='krk']").click(); await page.waitForSelector("#explain");
    const steps = await page.locator("#explain li").count();
    ok(steps >= 3 && steps <= 5, "說明卡有 " + steps + " 步");
    ok(await page.locator("[data-pos]").count() === topic("krk").positions.length, "局面清單 " + topic("krk").positions.length + " 題");
    await shot(page, "02-explain-card");
  });

  const kqk = topic("kqk"), eg2 = kqk.positions.find(p => p.shortest >= 3) || kqk.positions[1];
  await scenario(browser, "練習：提示（綠色箭頭）、提示次數、步數上限顯示", null, async page => {
    await page.goto(BASE + "endgames.html"); await page.waitForSelector("[data-topic]");
    await page.locator("[data-topic='kqk']").click(); await page.locator("[data-pos='" + eg2.id + "']").click(); await page.waitForSelector("cg-board");
    ok((await page.locator("#moves").textContent()).includes("0 / " + eg2.cap), "顯示步數 0 / " + eg2.cap + "（上限 = 最短 " + eg2.shortest + " × 2 + 5）");
    ok((await page.locator("#goal").textContent()).includes(eg2.cap + " 步內將死黑王") && (await page.locator("#goal").textContent()).includes("最短 " + eg2.shortest + " 步"), "目標文字顯示上限同最短步數");
    await page.locator("#hint").click(); await page.waitForSelector("#fb .feedback", { timeout: 30000 });
    ok(await page.locator(".cg-shapes line, .cg-shapes path, .cg-shapes polygon").count() > 0, "提示：棋盤畫出引擎建議箭頭");
    ok((await page.locator("#hints").textContent()).includes("1 / 3"), "提示次數 1 / 3");
    await shot(page, "03-practice-hint");
    for (let i = 0; i < 2; i++) { await page.waitForFunction(() => !document.querySelector("#hint").disabled, null, { timeout: 30000 }); await page.locator("#hint").click(); await page.waitForFunction(n => document.querySelector("#hints").textContent.includes(n + " / 3"), i + 2, { timeout: 30000 }); }
    ok(await page.locator("#hint:disabled").count() === 1, "提示用完 3 次後按鈕停用");
  });

  const e1 = kqk.positions[0];
  await scenario(browser, "成功：不用提示將死 → 星星（3 星）並記錄", null, async page => {
    await page.goto(BASE + "endgames.html"); await page.waitForSelector("[data-topic]");
    await page.locator("[data-topic='kqk']").click(); await page.locator("[data-pos='" + e1.id + "']").click(); await page.waitForSelector("cg-board");
    await playWithEngine(page, e1.cap);
    await page.waitForSelector("#result", { timeout: 60000 });
    ok((await page.locator("#stars-got").textContent()).trim() === "★★★", "不用提示、最短步數內完成：3 星");
    ok((await page.locator("#fb").textContent()).includes("將死了"), "顯示「將死了！」");
    await shot(page, "04-success-stars");
    const st = await stateOf(page);
    ok(st.endgames.pos[e1.id].stars === 3 && st.endgames.pos[e1.id].wins === 1 && st.endgames.pos[e1.id].best >= 1, "已記錄最佳星數 3、成功 1 次、最少步數 " + st.endgames.pos[e1.id].best);
    await page.locator("#to-topic").click(); await page.waitForSelector("[data-pos]");
    ok((await page.locator("[data-pos='" + e1.id + "'] .stars").textContent()).trim() === "★★★", "局面清單顯示 3 星");
  });

  await scenario(browser, "成功（用提示）：1 星", null, async page => {
    await page.goto(BASE + "endgames.html"); await page.waitForSelector("[data-topic]");
    await page.locator("[data-topic='kqk']").click(); await page.locator("[data-pos='" + e1.id + "']").click(); await page.waitForSelector("cg-board");
    await page.locator("#hint").click(); await page.waitForSelector("#fb .feedback", { timeout: 30000 });
    await playWithEngine(page, e1.cap);
    await page.waitForSelector("#result", { timeout: 60000 });
    ok((await page.locator("#stars-got").textContent()).trim() === "★☆☆", "用過提示：1 星");
  });

  // 逼和失敗：攔截 data/endgames.js，將 kqk-1 換成「Qf7 即逼和」嘅局面（只用嚟測試介面）
  const staleFen = "7k/8/6K1/8/8/8/8/5Q2 w - - 0 1";
  await scenario(browser, "失敗：逼和（對方沒有棋可走）", null, async page => {
    await page.goto(BASE + "endgames.html"); await page.waitForSelector("[data-topic]");
    await page.locator("[data-topic='kqk']").click(); await page.locator("[data-pos='kqk-1']").click(); await page.waitForSelector("cg-board");
    await move(page, "f1", "f7");
    await page.waitForSelector("#end-box .btn-row", { timeout: 20000 });
    ok((await page.locator("#fb").textContent()).includes("逼和了！對方沒有棋可走，變成和棋。"), "顯示「逼和了！對方沒有棋可走，變成和棋。」");
    ok(await page.locator("#result").count() === 0 && await page.locator("#again").count() === 1, "失敗：冇星星，可以再試一次");
    await shot(page, "05-failure-stalemate");
    const st = await stateOf(page);
    ok(st.endgames.pos["kqk-1"].runs === 1 && st.endgames.pos["kqk-1"].wins === 0 && st.endgames.pos["kqk-1"].stars === 0, "已記錄嘗試 1 次、成功 0 次");
  }, async page => {
    await page.route("**/data/endgames.js", async route => {
      const resp = await route.fetch(); let body = await resp.text();
      const k = EGD.TOPICS[0].positions[0].fen;
      body = body.split(JSON.stringify(k)).join(JSON.stringify(staleFen));
      await route.fulfill({ response: resp, body });
    });
  });

  const kpk = topic("kpk"), judgeP = kpk.positions.filter(p => p.task === "judge"), prom = kpk.positions.filter(p => p.task === "promote");
  await scenario(browser, "王兵對王：判斷題（答對、答錯）", null, async page => {
    await page.goto(BASE + "endgames.html"); await page.waitForSelector("[data-topic]");
    await page.locator("[data-topic='kpk']").click(); await page.waitForSelector("[data-pos]");
    const dp = judgeP.find(p => p.expect === "draw") || judgeP[0];
    await page.locator("[data-pos='" + dp.id + "']").click(); await page.waitForSelector("cg-board");
    ok((await page.locator("#q").textContent()).includes("這個局面白方能贏嗎"), "顯示判斷題");
    await shot(page, "06-kpk-judge");
    await page.locator("[data-ans='win']").click(); await page.waitForSelector("#fb .feedback");
    ok(await page.locator("#fb .feedback.bad").count() === 1, "答錯：判斷為答錯（正確答案是和棋）");
    ok((await page.locator("#fb").textContent()).includes("只能和棋"), "顯示正確答案同解釋");
    await shot(page, "07-kpk-judge-wrong");
    await page.locator("#again").click(); await page.waitForSelector(".opt");
    await page.locator("[data-ans='draw']").click(); await page.waitForSelector("#fb .feedback");
    ok(await page.locator("#fb .feedback.ok").count() === 1 && (await page.locator("#stars-got").textContent()).trim() === "★★★", "答對：3 星");
    const st = await stateOf(page);
    ok(st.endgames.pos[dp.id].runs === 2 && st.endgames.pos[dp.id].wins === 1 && st.endgames.pos[dp.id].stars === 3, "已記錄嘗試 2 次、答對 1 次、3 星");
  });

  const pp = prom[0];
  await scenario(browser, "王兵對王：「贏」課題——升變後引擎判斷仍然贏", null, async page => {
    await page.goto(BASE + "endgames.html"); await page.waitForSelector("[data-topic]");
    await page.locator("[data-topic='kpk']").click(); await page.locator("[data-pos='" + pp.id + "']").click(); await page.waitForSelector("cg-board");
    ok((await page.locator("#goal").textContent()).includes("把兵升變為后"), "目標：把兵升變為后");
    await playWithEngine(page, pp.cap);
    await page.waitForSelector("#end-box .btn-row", { timeout: 90000 });
    ok(await page.locator("#result").count() === 1, "升變成功（后冇被吃，仍然贏）：" + (await page.locator("#fb").textContent()).slice(0, 40));
    await shot(page, "08-kpk-promote-success");
  });

  // 開局「也可以」
  const rt = OPEN.ROUTES.find(r => r.alts && r.alts[0] && r.side === "w") || OPEN.ROUTES.find(r => r.side === "w"), alt = rt.alts[0][0];
  await scenario(browser, "開局：走「也可以」嘅走法（唔當錯、還原棋步、再走主線）", null, async page => {
    await page.goto(BASE + "openings.html"); await page.waitForSelector("[data-route]");
    await page.locator("[data-route='" + rt.id + "']").click(); await page.waitForSelector("cg-board");
    await page.waitForFunction(() => document.querySelector("#status").dataset.turn === "me", null, { timeout: 15000 });
    await move(page, alt.uci.slice(0, 2), alt.uci.slice(2, 4));
    const fbText = await page.locator("#fb").textContent();
    ok(fbText.includes("也可以！") && fbText.includes("不過這條路線練習的是 " + rt.moves[0] + "，請再走一次。"), "顯示「也可以！不過這條路線練習的是 " + rt.moves[0] + "，請再走一次。」");
    ok(await page.locator("#fb .feedback.ok").count() === 1, "唔係錯誤提示（綠色）");
    ok((await page.locator("#mistakes").textContent()).includes("走錯 0 次"), "走錯次數仍然是 0");
    ok(await page.locator("cg-board piece.white").count() === 16 && await page.locator("cg-board piece.white.pawn").count() === 8, "棋盤已還原：白方仍然有 16 枚棋子、8 隻兵在原位");
    ok(await page.locator("#retry.hidden").count() === 1, "唔需要按「再試一次」，直接再走");
    await shot(page, "09-openings-alt-ok");
    const g = new Chess(); const m = g.move(rt.moves[0]);
    await move(page, m.from, m.to);
    ok(await page.locator("#route-log div").count() >= 1, "再走主線 " + rt.moves[0] + " 之後路線繼續");
    const st = await stateOf(page);
    ok(!st.openings || st.openings.routes[rt.id].runs === 0, "「也可以」不影響完成紀錄");
  });

  // 三問：對方威脅將死（只用 mateThreat 題）
  await scenario(browser, "走棋前三問：「對方威脅將死」題目（Q1 答案）", null, async page => {
    await page.goto(BASE + "three.html"); await page.waitForTimeout(400);
    await page.locator("#start").click(); await page.waitForSelector("cg-board");
    await page.waitForSelector("#q-text");
    const p = await page.evaluate(() => window.__chessopsThree.current());
    ok(p.theme === "mateThreat" && p.q1.kind === "mate", "題目：mateThreat，Q1 答案係「對方威脅將死」");
    await page.waitForFunction(() => document.querySelector("#qno") && document.querySelector("#qno").textContent.startsWith("第 1"), null, { timeout: 10000 });
    await shot(page, "10-three-mate-threat-q1");
    await page.locator("#opt-mate").click(); await page.waitForSelector("#fb .feedback");
    ok(await page.locator("#fb .feedback.ok").count() === 1, "選「對方威脅將死」判為答對");
    ok((await page.locator("#fb").textContent()).includes("將死你"), "解釋：" + (await page.locator("#fb .feedback span").textContent()).slice(0, 40));
    await shot(page, "11-three-mate-threat-q1-after");
  }, async page => {
    await page.route("**/data/three.js", async route => {
      const resp = await route.fetch(); let body = await resp.text();
      body = body.replace("return [", "return (function (a) { return a.filter(function (q) { return q.theme === 'mateThreat'; }); })([").replace(/(\r?\n)  \];(\r?\n)/, "$1  ]);$2");
      await route.fulfill({ response: resp, body });
    });
  });

  await browser.close();
  console.log(errors.length ? "\nconsole 錯誤：\n" + errors.join("\n") : "\n沒有 console 錯誤");
  process.exit(failed || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
