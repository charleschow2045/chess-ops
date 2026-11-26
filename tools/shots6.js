/*
 * 第 6 階段：用 Playwright 喺 820×1180 跑「稱號卡、每日任務、升稱號恭喜、家長週報、設定頁備份／匯入、我的對局、我的謎題」完整流程
 * （真滑鼠、真 Stockfish、真 chess.com 公開介面），截圖到 docs/stage6-shots/。
 * 用法同 tools/shots5.js（先 node tools/serve.js 8123；NODE_PATH 指向 playwright-core；BASE 可以指向線上網址）。
 * chess.com 讀取測試用公開帳戶 hikaru（只讀公開對局；唔會用到任何個人資料）。
 */
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright-core");
const ROOT = path.resolve(__dirname, "..");
const State = require(path.join(ROOT, "js/state.js"));
const Daily = require(path.join(ROOT, "js/daily.js"));

const BASE = process.env.BASE || "http://localhost:8123/";
const OUT = process.env.OUT || path.resolve(__dirname, "../docs/stage6-shots");
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
const today = new Date(), todayKey = Daily.dateKey(today), needPlay = Daily.requiresPlay(today);
const keyAgo = n => Daily.dateKey(Daily.addDays(today, -n));

async function scenario(browser, name, init, fn, opts) {
  console.log(name);
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1, acceptDownloads: true }, opts || {}));
  await ctx.addInitScript(st => { try { if (st && !localStorage.getItem("chessops_state")) localStorage.setItem("chessops_state", JSON.stringify(st)); } catch (e) { /* 忽略 */ } }, init);
  const page = await ctx.newPage();
  // 故意查詢不存在嘅 chess.com 用戶，瀏覽器會記一個 404 資源錯誤（預期，唔係程式錯誤）
  page.on("console", m => { if (m.type() === "error" && !(name.includes("讀取 chess.com") && m.text().includes("status of 404"))) errors.push(name + " → " + m.text()); });
  page.on("pageerror", e => errors.push(name + " → " + e.message));
  try { await fn(page, ctx); } catch (e) { failed++; console.log("  ✗ 例外：" + e.message.split("\n")[0]); }
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER === "chrome" ? "chrome" : "msedge" });

  await scenario(browser, "首頁：稱號卡（進度條）＋每日任務＋7 個模組全部開放", stateWith(s => {
    s.puzzles.rating = 812; s.playLevel = 5; s.rank.index = 1;
    s.daily.days[todayKey] = Object.assign(Daily.emptyDay(), { puz: 2, mini: 1 });
    s.streak = { count: 4, lastDay: keyAgo(1) };
  }), async page => {
    await page.goto(BASE + "index.html"); await page.waitForTimeout(500);
    ok((await page.locator("#title-name").textContent()) === "俱樂部棋手", "目前稱號：俱樂部棋手（電腦第 5 級達標）");
    ok((await page.locator("#next-title").textContent()).includes("候選大師"), "下一個稱號：候選大師");
    ok((await page.locator(".prog-row[data-key='puzzle']").textContent()).includes("謎題分 812 / 950"), "進度「謎題分 812 / 950」");
    ok((await page.locator(".prog-row[data-key='play']").textContent()).includes("電腦級別 5 / 5"), "進度「電腦級別 5 / 5」（已達標 ✓）");
    ok((await page.locator("#title-card .fine").textContent()).includes("App 內稱號，與國際棋聯正式稱號無關"), "註明「App 內稱號，與國際棋聯正式稱號無關」");
    ok((await page.locator("#title-card .fine").evaluate(e => parseFloat(getComputedStyle(e).fontSize))) >= 13, "註明字體不細過 13px");
    ok((await page.locator("#streak").textContent()).includes("連續 4 日"), "連續日數 4（昨日完成）");
    ok(await page.locator("[data-task='puzzles'] .tick").textContent() === "○" && (await page.locator("[data-task='puzzles']").textContent()).includes("2 / 5") && await page.locator("[data-task='mini'].ok").count() === 1, "謎題 2 / 5 未完成；小練習已打勾");
    ok(await page.locator("[data-task='play']").count() === (needPlay ? 1 : 0), "今日" + (needPlay ? "要求" : "不要求") + "對電腦下棋");
    ok(await page.locator("a.mod").count() === 7 && await page.locator(".mod.soon").count() === 0, "7 個模組全部可以進入");
    ok(await page.locator("a[href='report.html']").count() === 1, "頁底有「家長週報」");
    await shot(page, "01-home-title-daily");
  });

  await scenario(browser, "升稱號恭喜（只出一次）", stateWith(s => { s.puzzles.rating = 960; s.playLevel = 5; s.rank.index = 1; }), async page => {
    await page.goto(BASE + "index.html"); await page.waitForSelector(".dlg-box", { timeout: 5000 });
    ok((await page.locator(".dlg-box").textContent()).includes("恭喜升級") && (await page.locator(".dlg-box").textContent()).includes("候選大師"), "顯示恭喜畫面：升到「候選大師」");
    await shot(page, "02-title-congrats");
    await page.locator(".dlg-box button").click();
    ok((await stateOf(page)).rank.index === 2, "已記錄最高已恭喜稱號 = 2");
    await page.reload(); await page.waitForTimeout(600);
    ok(await page.locator(".dlg-box").count() === 0, "重新載入：唔會再恭喜");
  });

  await scenario(browser, "每日任務完成：做完第 5 題 → 提示 → 首頁打勾、連續日數 +1", stateWith(s => {
    s.daily.days[todayKey] = Object.assign(Daily.emptyDay(), { puz: 4, mini: 1, w: needPlay ? 1 : 0 });
    s.streak = { count: 2, lastDay: keyAgo(1) };
  }), async page => {
    await page.goto(BASE + "puzzles.html"); await page.waitForSelector("#go-rec");
    await page.locator("#go-rec").click(); await page.waitForSelector("cg-board");
    await page.waitForFunction(() => /走棋/.test(document.querySelector(".status-line").textContent), null, { timeout: 15000 });
    for (let k = 0; k < 6; k++) {                       // 有啲謎題要走多步：逐步走，直到完成（出現完成提示）
      const exp = await page.evaluate(() => window.__chessopsDebug.expected());
      await move(page, exp.slice(0, 2), exp.slice(2, 4));
      try { await page.waitForSelector("#daily-toast", { timeout: 2500 }); break; } catch (e) { await page.waitForTimeout(600); }
    }
    await page.waitForSelector("#daily-toast", { timeout: 5000 });
    ok((await page.locator("#daily-toast").textContent()).includes("今日任務全部完成！連續 3 日"), "出現「今日任務全部完成！連續 3 日。」");
    await shot(page, "03-daily-done-toast");
    const st = await stateOf(page);
    ok(st.daily.days[todayKey].done === true && st.streak.count === 3 && st.streak.lastDay === todayKey, "已記錄當日完成、連續日數 3");
    await page.goto(BASE + "index.html"); await page.waitForTimeout(500);
    ok(await page.locator("#daily-done").count() === 1 && await page.locator(".task.ok").count() === (needPlay ? 3 : 2), "首頁：全部打勾並顯示完成訊息");
    await shot(page, "04-home-daily-done");
  });

  await scenario(browser, "家長週報（最近 7 日）", stateWith(s => {
    const put = (n, o) => { s.daily.days[keyAgo(n)] = Object.assign(Daily.emptyDay(), o); };
    put(6, { puz: 5, puzOk: 4, pdelta: 12, mini: 1, w: 1, sec: 1380, done: true }); put(5, { puz: 6, puzOk: 3, pdelta: -4, mini: 1, sec: 840, done: true });
    put(4, { puz: 2, puzOk: 1, sec: 120 }); put(2, { puz: 5, puzOk: 5, pdelta: 28, mini: 2, d: 1, l: 1, sec: 1800, done: true, eg: 5 }); put(1, { puz: 5, puzOk: 4, pdelta: 8, mini: 1, w: 1, sec: 1500, done: true, eg: 2 });
    s.streak = { count: 2, lastDay: keyAgo(1) }; s.puzzles.rating = 752; s.playLevel = 4; s.puzzles.wrong = [{ id: "aaaaa", r: 700, streak: 0 }];
    s.openings.routes["w-italian"].mastered = true; s.endgames.pos["kqk-1"] = { stars: 3, wins: 1, runs: 1, best: 1 }; s.endgames.pos["krk-1"] = { stars: 2, wins: 1, runs: 1, best: 1 };
    s.play.recent = [{ date: keyAgo(1), level: 3, color: "w", result: "win", reason: "checkmate", pgn: "", blunders: 2, plies: 40 }, { date: keyAgo(9), level: 3, color: "w", result: "loss", reason: "resign", pgn: "", blunders: 5, plies: 40 }];
  }), async page => {
    await page.goto(BASE + "report.html"); await page.waitForSelector("#summary");
    ok(await page.locator("#week .wcell").count() === 7, "7 個格仔");
    ok(await page.locator("#week .wcell.done").count() === 4, "4 日完成任務（打勾）");
    ok((await page.locator("#done-days").textContent()).trim() === "4 / 7 天" && (await page.locator("#streak").textContent()).trim() === "2 日", "完成 4 / 7 天、連續 2 日");
    ok((await page.locator("#minutes").textContent()).trim() === "94 分鐘", "練習合共 94 分鐘（(1380+840+120+1800+1500)/60）");
    ok((await page.locator("#puz-count").textContent()).trim() === "23 題" && (await page.locator("#puz-acc").textContent()).trim() === "74%", "謎題 23 題、正確率 74%");
    ok((await page.locator("#puz-rating").textContent()).includes("708 → 752（+44）"), "謎題分 708 → 752（+44）");
    ok((await page.locator("#play-wdl").textContent()).includes("2 勝・1 和・1 負") && (await page.locator("#bl-now").textContent()).includes("2（1 局）") && (await page.locator("#bl-prev").textContent()).includes("5（1 局）"), "對電腦：戰績同每局平均大錯數（本週／上一個 7 日）");
    ok((await page.locator("#eg-gained").textContent()).includes("+7 星") && (await page.locator("#eg-total").textContent()).includes("5 / 84"), "殘局：新增 7 星、累計 5 / 84");
    ok((await page.locator("#summary").textContent()).includes("本週完成任務 4 天，練習 94 分鐘，做了 23 題謎題（正確率 74%），謎題分上升 44 分。"), "總結句：" + (await page.locator("#summary").textContent()));
    await shot(page, "05-parent-report");
  });

  await scenario(browser, "設定頁：備份（匯出、錯誤格式、匯入確認對話框）", stateWith(s => { s.puzzles.rating = 833; s.playLevel = 4; s.daily.days[todayKey] = Object.assign(Daily.emptyDay(), { puz: 3, sec: 200 }); }), async page => {
    await page.goto(BASE + "settings.html"); await page.waitForTimeout(400);
    ok(/^\d+(\.\d)? KB$/.test((await page.locator("#data-size").textContent()).trim()), "顯示資料大小：" + (await page.locator("#data-size").textContent()));
    await shot(page, "06-settings-backup");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.locator("#export").click()]);
    const name = dl.suggestedFilename();
    ok(/^chessops-backup-\d{4}-\d{2}-\d{2}\.json$/.test(name) && name.includes(todayKey), "下載檔名帶日期：" + name);
    const file = path.join(OUT, "_backup.json"); await dl.saveAs(file);
    const obj = JSON.parse(fs.readFileSync(file, "utf8"));
    ok(obj.app === "chessops" && obj.version === 2 && obj.state.puzzles.rating === 833, "備份內容：app／版本 2／謎題分 833");
    fs.unlinkSync(file);
    await page.locator("#import-text").fill("這不是備份"); await page.locator("#import-go").click();
    ok((await page.locator("#backup-msg").textContent()).includes("無法匯入：內容不是有效的 JSON"), "格式不對：講明原因（不是有效的 JSON）");
    ok((await stateOf(page)).puzzles.rating === 833 && await page.locator(".dlg-box").count() === 0, "格式不對：沒有寫入、沒有對話框");
    await page.locator("#import-text").fill(JSON.stringify({ app: "chessops", version: 99, state: {} })); await page.locator("#import-go").click();
    ok((await page.locator("#backup-msg").textContent()).includes("較新的版本"), "版本太新：講明原因");
    const good = Object.assign({}, obj); good.state = Object.assign({}, obj.state, { puzzles: Object.assign({}, obj.state.puzzles, { rating: 901 }) });
    await page.locator("#import-text").fill(JSON.stringify(good)); await page.locator("#import-go").click(); await page.waitForSelector(".dlg-box");
    ok((await page.locator(".dlg-box").textContent()).includes("會覆蓋這部裝置上的現有紀錄") && (await page.locator(".dlg-box").textContent()).includes("謎題分 901"), "確認對話框：「會覆蓋現有紀錄」＋備份內容");
    ok((await stateOf(page)).puzzles.rating === 833, "確認之前未寫入");
    await shot(page, "07-import-confirm");
    await page.locator(".dlg-box button[data-key='no']").click();
    ok((await stateOf(page)).puzzles.rating === 833 && (await page.locator("#backup-msg").textContent()).includes("沒有寫入"), "取消：沒有寫入");
    await page.locator("#import-go").click(); await page.waitForSelector(".dlg-box"); await page.locator(".dlg-box button[data-key='yes']").click(); await page.waitForTimeout(300);
    ok((await stateOf(page)).puzzles.rating === 901 && (await page.locator("#backup-msg").textContent()).includes("已匯入"), "確認覆蓋之後：已寫入（謎題分 901）");
  });

  await scenario(browser, "我的對局：讀取 chess.com 公開對局（hikaru）、錯誤用戶名", null, async page => {
    await page.goto(BASE + "mygames.html"); await page.waitForSelector("#user");
    await page.locator("#user").fill("hikaru"); await page.locator("#load").click();
    await page.waitForFunction(() => document.querySelectorAll(".game-row").length > 0 || /讀取|找不到|無法|限制/.test(document.querySelector("#msg").textContent) && !/正在/.test(document.querySelector("#msg").textContent), null, { timeout: 40000 });
    const n = await page.locator(".game-row").count();
    ok(n > 0 && n <= 20, "讀取成功：" + n + " 局（最多 20 局）：" + (await page.locator("#msg").textContent()).slice(0, 60));
    const rows = await page.locator(".game-row").allTextContents();
    ok(rows.every(t => /中速棋|快棋/.test(t)) && !rows.some(t => /超快棋|子彈/.test(t)), "只有中速棋同快棋");
    await shot(page, "08-mygames-list");
    ok((await stateOf(page)).mygames.user === "hikaru", "用戶名只存本機（localStorage）");
    await page.locator("#user").fill("zz_no_such_user_98765"); await page.locator("#load").click();
    await page.waitForFunction(() => /找不到|無法|限制|錯誤/.test(document.querySelector("#msg").textContent), null, { timeout: 30000 });
    ok((await page.locator("#msg").textContent()).includes("找不到這個用戶名") && (await page.locator("#msg").textContent()).includes("貼上 PGN"), "找不到用戶：講明原因並提示貼上 PGN");
  });

  // 貼上 PGN 後備＋對局分析＋加入我的謎題＋我的謎題練習（黑方 2…Nf6?? 錯過 Qh4#）
  const pgn = '[Event "Live Chess"]\n[Site "Chess.com"]\n[Date "2026.11.20"]\n[White "Rival"]\n[Black "Kid_User"]\n[Result "1-0"]\n[UTCDate "2026.11.20"]\n\n1. f3 e5 2. g4 Nf6 3. d3 d5 4. e4 dxe4 5. dxe4 Qxd1+ 6. Kxd1 Nxe4 7. fxe4 Bb4 1-0';
  await scenario(browser, "我的對局：貼上 PGN → 分析 → 加入我的謎題 → 我的謎題練習", null, async page => {
    await page.goto(BASE + "mygames.html"); await page.waitForSelector("#user");
    await page.locator("#user").fill("Kid_User");
    await page.locator("#pgn-text").fill(pgn); await page.locator("#pgn-go").click();
    await page.waitForSelector("#pgn-list .game-row");
    ok((await page.locator("#pgn-list .game-row").textContent()).includes("執黑") && (await page.locator("#pgn-msg").textContent()).includes("已讀取 1 局"), "PGN 後備：讀到 1 局，用戶名對到執黑");
    await shot(page, "09-mygames-pgn");
    await page.locator("#pgn-list [data-act='analyze']").click();
    await page.waitForSelector("#rv-summary", { timeout: 120000 });
    const sum = await page.locator("#rv-summary").textContent();
    ok(/大錯 [1-9]/.test(sum), "分析：有大錯（只計自己嘅步）→ " + sum.replace(/\s+/g, " ").slice(0, 80));
    await shot(page, "10-mygames-analysis");
    await page.locator(".rev-item.blunder").first().click(); await page.waitForSelector("#add-puzzle");
    ok((await page.locator("#rv-pos-text").textContent()).includes("較好的走法"), "局面頁：較好的走法（綠色箭頭）");
    await page.locator("#add-puzzle").click(); await page.waitForSelector("#fb .feedback.ok");
    ok((await page.locator("#fb").textContent()).includes("已加入我的謎題") && await page.locator("#add-puzzle:disabled").count() === 1, "已加入我的謎題（按鈕變為已加入）");
    await shot(page, "11-mygames-add-puzzle");
    const st = await stateOf(page);
    ok(st.mygames.puzzles.length >= 1 && st.mygames.recent.length === 1 && st.mygames.recent[0].color === "b" && st.mygames.recent[0].blunders >= 1, "已存我的謎題 " + st.mygames.puzzles.length + " 題、最近 1 局摘要（不存棋譜）");
    ok(!JSON.stringify(st).includes("1. f3"), "對局棋譜本身冇長期儲存");
    const first = st.mygames.puzzles[0];
    await page.goto(BASE + "puzzles.html"); await page.waitForSelector("#mine");
    ok((await page.locator("#mine").textContent()).includes("我的謎題（" + st.mygames.puzzles.length + " 題）"), "謎題頁有「我的謎題」");
    await page.locator("#mine").click(); await page.waitForSelector("cg-board");
    ok((await page.locator(".q-prog").textContent()).includes("我的謎題"), "我的謎題練習");
    const orient = (await rect(page)).flipped;
    ok(orient === (first.side === "b"), "棋盤方向 = 走錯嗰方（" + first.side + "）");
    await move(page, first.best.slice(0, 2), first.best.slice(2, 4));
    await page.waitForSelector(".feedback.ok", { timeout: 15000 });
    ok((await page.locator(".feedback").textContent()).includes("答對了"), "走引擎最佳步：答對");
    await shot(page, "12-my-puzzle-practice");
    const st2 = await stateOf(page);
    ok(st2.puzzles.rating === 700 && st2.puzzles.rated === 0 && st2.daily.days[todayKey].puz === 1, "我的謎題不計謎題分，但計入每日任務（謎題 1 題）");
  });

  await browser.close();
  console.log(errors.length ? "\nconsole 錯誤：\n" + errors.join("\n") : "\n沒有 console 錯誤");
  process.exit(failed || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
