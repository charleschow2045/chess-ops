/*
 * 第 4 階段：用 Playwright 喺 820×1180 跑「走棋前三問」「開局訓練」「對局中三問提醒」「新檢討原因」完整流程（真滑鼠），
 * 截圖到 docs/stage4-shots/。用法同 tools/shots3.js（先 node tools/serve.js 8123；NODE_PATH 指向 playwright-core）。
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

const BASE = process.env.BASE || "http://localhost:8123/";
const OUT = process.env.OUT || path.resolve(__dirname, "../docs/stage4-shots");
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
let failed = 0;
function ok(cond, msg) { if (!cond) { failed++; console.log("  ✗ " + msg); } else console.log("  ✓ " + msg); }

const uciOf = m => m.from + m.to + (m.promotion || "");
async function rect(page) { return page.evaluate(() => { const b = document.querySelector("cg-board").getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, flipped: !!document.querySelector(".orientation-black") }; }); }
async function pt(page, sq) { const r = await rect(page), f = "abcdefgh".indexOf(sq[0]), rk = Number(sq[1]) - 1, s = r.w / 8; const col = r.flipped ? 7 - f : f, row = r.flipped ? rk : 7 - rk; return { x: r.x + (col + 0.5) * s, y: r.y + (row + 0.5) * s }; }
async function clickSq(page, sq) { const p = await pt(page, sq); await page.mouse.click(p.x, p.y); await page.waitForTimeout(120); }
async function move(page, from, to) { await clickSq(page, from); await clickSq(page, to); await page.waitForTimeout(250); }
async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name + ".png") }); console.log("  📷 " + name + ".png"); }
const stateOf = page => page.evaluate(() => JSON.parse(localStorage.getItem("chessops_state") || "{}"));
const stateWith = fn => { const s = State.defaultState(); fn(s); return State.normalizeState(s); };
const routeUcis = r => { const g = new Chess(); return r.moves.map(s => uciOf(g.move(s))); };

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

  await scenario(browser, "首頁：「走棋前三問」「開局」已開放並顯示真數字", stateWith(s => { s.three = { plays: 2, asked: 30, correct: 24 }; s.openings.routes["w-italian"].mastered = true; s.openings.routes["b-scholar"].mastered = true; }), async page => {
    await page.goto(BASE + "index.html"); await page.waitForTimeout(500);
    ok(await page.locator("a.mod").count() === 5, "首頁有 5 個可進入的模組");
    ok((await page.locator("a.mod[href='three.html']").textContent()).includes("已完成 2 輪・正確率 80%"), "走棋前三問顯示「已完成 2 輪・正確率 80%」");
    ok((await page.locator("a.mod[href='openings.html']").textContent()).includes("已掌握 2 / 6 條路線"), "開局顯示「已掌握 2 / 6 條路線」");
    await shot(page, "01-home");
  });

  await scenario(browser, "走棋前三問：一輪 5 個局面（Q1／Q2 點選棋子或選項、Q3 揀候選步）", null, async page => {
    await page.goto(BASE + "three.html"); await page.waitForTimeout(500);
    ok((await page.locator("#acc").textContent()) === "—", "尚未作答：正確率顯示「—」（冇假數字）");
    await page.locator("#start").click(); await page.waitForSelector("cg-board");
    let shotsTaken = { 1: false, 2: false, 3: false }, wrongDone = false;
    for (let pos = 0; pos < 5; pos++) {
      await page.waitForSelector("#q-text");
      const p = await page.evaluate(() => window.__chessopsThree.current());
      for (let step = 1; step <= 3; step++) {
        await page.waitForFunction(s => document.querySelector("#qno") && document.querySelector("#qno").textContent.startsWith("第 " + s), step, { timeout: 10000 });
        const q = step === 1 ? p.q1 : step === 2 ? p.q2 : p.q3;
        const tag = "0" + (1 + step * 2);
        if (!shotsTaken[step]) await shot(page, "02-three-q" + step + "-before");
        let wantOk = true;
        if (!wrongDone && step === 1 && pos === 1) wantOk = false;        // 故意答錯一次，睇答錯畫面
        if (step === 3) {
          const pick = wantOk ? q.answer : q.options.find(o => o.uci !== q.answer).uci;
          await page.locator('.opt[data-uci="' + pick + '"]').click();
        } else if (q.kind === "squares") {
          if (wantOk) { for (const sq of q.squares) await clickSq(page, sq); await page.locator("#confirm").click(); }
          else await page.locator("#opt-none").click();
        } else if (q.kind === "mate") await (wantOk ? page.locator("#opt-mate") : page.locator("#opt-none")).click();
        else await (wantOk ? page.locator("#opt-none") : page.locator("#opt-mate")).click();
        await page.waitForSelector("#fb .feedback");
        const isOk = await page.locator("#fb .feedback.ok").count() === 1;
        ok(isOk === wantOk, "第 " + (pos + 1) + " 個局面 Q" + step + "（" + (step === 3 ? "候選步" : q.kind) + "）" + (wantOk ? "標準答案判為答對" : "故意答錯判為答錯"));
        if (!wantOk) wrongDone = true;
        if (!shotsTaken[step] || !wantOk) { await shot(page, "02-three-q" + step + "-after" + (wantOk ? "" : "-wrong")); shotsTaken[step] = true; }
        ok((await page.locator("#fb").textContent()).length > 15, "答完顯示簡短解釋：" + (await page.locator("#fb .feedback span").textContent()).slice(0, 36));
        await page.locator("#next").click(); await page.waitForTimeout(250);
      }
    }
    await page.waitForSelector("#round-score");
    const sc = await page.locator("#round-score").textContent();
    ok(sc.trim() === "14 / 15", "小結：15 條中答對 14（故意錯 1 條）→ " + sc.trim());
    await shot(page, "03-three-summary");
    const st = await stateOf(page);
    ok(st.three.plays === 1 && st.three.asked === 15 && st.three.correct === 14, "已記錄完成次數 1、作答 15、答對 14");
  });

  await scenario(browser, "開局訓練：路線選擇、走錯（箭頭＋解釋）、連續 3 次全對 = 已掌握", null, async page => {
    await page.goto(BASE + "openings.html"); await page.waitForTimeout(500);
    ok(await page.locator("[data-route]").count() === 6, "選單有 6 條路線");
    await shot(page, "04-openings-home");
    const route = OPEN.ROUTES.find(r => r.id === "w-italian"), ucis = routeUcis(route);
    const playRoute = async (mistakeAt) => {
      for (let i = 0; i < ucis.length; i++) {
        if (i % 2 !== (route.side === "w" ? 0 : 1)) continue;          // 對方嘅步由 App 自動走
        await page.waitForFunction(() => /輪到你/.test(document.querySelector("#status").textContent), null, { timeout: 15000 });
        if (mistakeAt === i) {
          await move(page, "a2", "a3");                                   // 故意走錯（合法但唔係路線）
          ok(await page.locator("#fb .feedback.bad").count() === 1, "走錯：即時顯示「走錯了」");
          ok(await page.locator(".cg-shapes line, .cg-shapes path, .cg-shapes polygon").count() > 0, "用箭頭顯示正確走法");
          ok((await page.locator("#fb").textContent()).includes("下一步是 " + route.moves[i]), "顯示正確走法 " + route.moves[i] + " 同解釋");
          await shot(page, "05-openings-mistake");
          await page.locator("#retry").click();
        }
        await move(page, ucis[i].slice(0, 2), ucis[i].slice(2, 4));
        await page.waitForTimeout(200);
      }
      await page.waitForSelector("#again", { timeout: 15000 });
    };
    await page.locator("[data-route='w-italian']").click();
    await page.waitForSelector("cg-board");
    await playRoute(4);                                                  // 第 1 次：第 5 步（Bc4）走錯一次
    let st = await stateOf(page);
    ok(st.openings.routes["w-italian"].streak === 0 && st.openings.routes["w-italian"].runs === 1 && !st.openings.routes["w-italian"].mastered, "有走錯：連續全對次數歸零（未掌握）");
    for (let k = 1; k <= 3; k++) {
      await page.locator("#again").click(); await page.waitForSelector("cg-board");
      await playRoute(-1);
      st = await stateOf(page);
      ok(st.openings.routes["w-italian"].streak === k, "第 " + k + " 次全對：連續 " + k + " / 3");
      if (k === 1) await shot(page, "06-openings-clean-1");
    }
    ok(st.openings.routes["w-italian"].mastered === true, "連續 3 次全對 → 已掌握");
    ok((await page.locator("#fb").textContent()).includes("已掌握"), "顯示「已掌握這條路線！」");
    await shot(page, "07-openings-mastered");
    await page.goto(BASE + "openings.html"); await page.waitForTimeout(400);
    ok((await page.locator("#mastered").textContent()).trim() === "1 / 6", "選單顯示已掌握 1 / 6");
  });

  await scenario(browser, "開局訓練：執黑路線，對方（白方）先自動走", null, async page => {
    await page.goto(BASE + "openings.html"); await page.waitForTimeout(400);
    await page.locator("[data-route='b-scholar']").click(); await page.waitForSelector("cg-board");
    ok((await rect(page)).flipped, "執黑：黑方在下面");
    await page.waitForFunction(() => /輪到你/.test(document.querySelector("#status").textContent), null, { timeout: 15000 });
    ok(await page.locator("#route-log div").count() === 1, "白方先自動走 e4，並顯示想法");
    await shot(page, "08-openings-black");
  });

  await scenario(browser, "開局原則小測：10 題，3 個選項，答完有解釋", null, async page => {
    await page.goto(BASE + "openings.html"); await page.waitForTimeout(400);
    await page.locator("#quiz-tile").click(); await page.waitForSelector("cg-board");
    for (let i = 0; i < 10; i++) {
      const q = OPEN.QUIZ[i];
      ok((await page.locator(".opt").count()) === 3, "第 " + (i + 1) + " 題有 3 個選項");
      if (i === 0) await shot(page, "09-quiz-before");
      const wrong = i === 3;
      const pick = wrong ? q.options.find(o => o.uci !== q.answer).uci : q.answer;
      await page.locator('.opt[data-uci="' + pick + '"]').click();
      ok(await page.locator("#fb .feedback." + (wrong ? "bad" : "ok")).count() === 1, "第 " + (i + 1) + " 題" + (wrong ? "故意答錯" : "標準答案") + "判斷正確");
      if (i === 0) await shot(page, "09-quiz-after");
      await page.locator("#next").click(); await page.waitForTimeout(200);
    }
    await page.waitForSelector("#quiz-score");
    ok((await page.locator("#quiz-score").textContent()).trim() === "9 / 10", "小測 9 / 10");
    await shot(page, "10-quiz-result");
    const st = await stateOf(page);
    ok(st.openings.quiz.plays === 1 && st.openings.quiz.best === 9, "已記錄小測成績");
  });

  await scenario(browser, "對局中三問提醒：預設開、可收起；設定可以關閉", null, async page => {
    await page.goto(BASE + "play.html"); await page.waitForTimeout(500);
    await page.locator("button[data-level='1']").click(); await page.locator("button[data-color='w']").click();
    await page.locator("#start").click(); await page.waitForSelector("cg-board");
    ok(await page.locator("#reminder:not(.hidden)").count() === 1, "輪到玩家時顯示三問提醒");
    ok((await page.locator("#reminder").textContent()).includes("先想三問：對方想做甚麼？我有機會嗎？這步安全嗎？"), "提醒文字正確");
    await shot(page, "11-play-reminder");
    await page.locator("#rem-toggle").click();
    ok((await page.locator("#reminder").textContent()).includes("三問提醒") && !(await page.locator("#reminder").textContent()).includes("先想三問"), "可以收起");
    await page.locator("#rem-toggle").click();
    await move(page, "e2", "e4");
    await page.waitForFunction(() => /輪到你/.test(document.querySelector("#status").textContent), null, { timeout: 20000 });
    ok(await page.locator("#reminder:not(.hidden)").count() === 1, "電腦走完，再輪到玩家時又顯示");
    await page.goto(BASE + "settings.html"); await page.waitForTimeout(300);
    ok(await page.locator("#three-reminder").isChecked(), "設定「對局中顯示三問提醒」預設開");
    await page.locator("#three-reminder").uncheck();
    ok((await stateOf(page)).settings.threeReminder === false, "關閉後已存入儲存");
    await shot(page, "12-settings");
    await page.goto(BASE + "play.html"); await page.waitForTimeout(400);
    await page.locator("#resume").click(); await page.waitForSelector("cg-board");
    ok(await page.locator("#reminder.hidden").count() === 1, "關閉設定後唔顯示提醒");
  });

  // 新檢討：真 Stockfish 分析一局漏殺（黑方錯過 Qh4#）
  const missPgn = PLG.buildPgn(Chess, (() => { const g = new Chess(); ["f3", "e5", "g4", "Nf6", "d3", "d5"].forEach(s => g.move(s)); return g.history({ verbose: true }).map(uciOf); })(), { playerColor: "b", level: 3, result: "w", date: "2026-11-14", reason: "resign" });
  const matedPgn = PLG.buildPgn(Chess, (() => { const g = new Chess(); ["f3", "e5", "g4", "Qh4#"].forEach(s => g.move(s)); return g.history({ verbose: true }).map(uciOf); })(), { playerColor: "w", level: 3, result: "b", date: "2026-11-14", reason: "checkmate" });
  const reviewState = stateWith(s => { s.play.recent = [
    { date: "2026-11-14", level: 3, color: "b", result: "loss", reason: "resign", pgn: missPgn, blunders: null, plies: 6 },
    { date: "2026-11-14", level: 3, color: "w", result: "loss", reason: "checkmate", pgn: matedPgn, blunders: null, plies: 4 }]; });
  await scenario(browser, "賽後檢討（勝率分類＋新原因）：漏殺、被將死", reviewState, async page => {
    await page.goto(BASE + "play.html"); await page.waitForTimeout(600);
    await page.locator(".recent-row").nth(0).locator("button:has-text('檢討')").click();
    await page.waitForSelector("#rv-summary", { timeout: 60000 });
    const sum1 = await page.locator("#rv-summary").textContent();
    ok(sum1.includes("錯過了將死的機會"), "漏殺：小結寫「錯過了將死的機會」→ " + sum1.replace(/\s+/g, " ").slice(0, 70));
    ok((await page.locator(".rev-item.blunder").count()) >= 1, "清單有大錯");
    await shot(page, "13-review-missed-mate");
    await page.locator(".rev-item").first().click(); await page.waitForSelector("#rv-pos-text");
    ok((await page.locator("#rv-pos-text").textContent()).includes("原因：錯過了將死的機會"), "局面頁顯示原因");
    ok(await page.locator(".cg-shapes line, .cg-shapes path, .cg-shapes polygon").count() >= 2, "局面有較好走法（綠）同你走的（紅）箭頭");
    await shot(page, "14-review-position");
    await page.locator("#rv-list").click(); await page.locator("#rv-back").click(); await page.waitForSelector(".recent-row");
    await page.locator(".recent-row").nth(1).locator("button:has-text('檢討')").click();
    await page.waitForSelector("#rv-summary", { timeout: 60000 });
    const sum2 = await page.locator("#rv-summary").textContent();
    ok(sum2.includes("沒有注意到對方可以將死"), "被將死：小結寫「沒有注意到對方可以將死」→ " + sum2.replace(/\s+/g, " ").slice(0, 70));
    await shot(page, "15-review-mated");
  });

  await browser.close();
  console.log(errors.length ? "\nconsole 錯誤：\n" + errors.join("\n") : "\n沒有 console 錯誤");
  process.exit(failed || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
