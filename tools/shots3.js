/*
 * 第 3 階段：用 Playwright 喺 820×1180 跑「對電腦下棋」完整流程（真滑鼠）並截圖到 docs/stage3-shots/。
 * 用法同 tools/shots.js：先 node tools/serve.js 8123；需要 playwright-core（放喺 repo 外面，用 NODE_PATH）。
 * BASE=https://… 可以測試線上網址；OUT=… 可以改截圖目錄。
 * 每個情境用獨立瀏覽器環境，並預先寫入 localStorage（用 js/state.js 做白名單）。
 */
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright-core");
const ROOT = path.resolve(__dirname, "..");
const { Chess } = require(path.join(ROOT, "vendor/chess.js/chess.cjs"));
const State = require(path.join(ROOT, "js/state.js"));
const PLG = require(path.join(ROOT, "js/play-logic.js"));

const BASE = process.env.BASE || "http://localhost:8123/";
const OUT = process.env.OUT || path.resolve(__dirname, "../docs/stage3-shots");
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
let failed = 0;
function ok(cond, msg) { if (!cond) { failed++; console.log("  ✗ " + msg); } else console.log("  ✓ " + msg); }

async function rect(page) { return page.evaluate(() => { const b = document.querySelector("cg-board").getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, flipped: !!document.querySelector(".orientation-black") }; }); }
async function pt(page, sq) { const r = await rect(page), f = "abcdefgh".indexOf(sq[0]), rk = Number(sq[1]) - 1, s = r.w / 8; const col = r.flipped ? 7 - f : f, row = r.flipped ? rk : 7 - rk; return { x: r.x + (col + 0.5) * s, y: r.y + (row + 0.5) * s }; }
async function move(page, from, to) { const a = await pt(page, from), b = await pt(page, to); await page.mouse.click(a.x, a.y); await page.waitForTimeout(70); await page.mouse.click(b.x, b.y); await page.waitForTimeout(300); }
async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name + ".png") }); console.log("  📷 " + name + ".png"); }
const stateOf = page => page.evaluate(() => JSON.parse(localStorage.getItem("chessops_state") || "{}"));
const uciOf = m => m.from + m.to + (m.promotion || "");
const histUcis = sans => { const g = new Chess(); sans.forEach(s => g.move(s)); return g.history({ verbose: true }).map(uciOf); };

function stateWith(fn) { const s = State.defaultState(); fn(s); return State.normalizeState(s); }

/* 電腦出棋速度：測試預設用「快」（避免等太耐）；SPEED=slow／medium／fast 可以覆蓋。預設值「慢」由 tests/run-all.js 同 tools/shots7.js 另外驗證 */
const SPEED = process.env.SPEED || "fast";
const forceSpeed = init => { const s = init ? JSON.parse(JSON.stringify(init)) : { settings: {} }; s.settings = Object.assign({}, s.settings, { computerSpeed: SPEED }); return s; };
async function scenario(browser, name, init, fn, ctxOpts) {
  console.log(name);
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1 }, ctxOpts || {}));
  await ctx.addInitScript(st => { try { if (!localStorage.getItem("chessops_state")) localStorage.setItem("chessops_state", JSON.stringify(st)); } catch (e) { /* 忽略 */ } }, forceSpeed(init));
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") errors.push(name + " → " + m.text()); });
  page.on("pageerror", e => errors.push(name + " → " + e.message));
  try { await fn(page, ctx); } catch (e) { failed++; console.log("  ✗ 例外：" + e.message.split("\n")[0]); }
  await ctx.close();
}
const waitMyTurn = (page, t) => page.waitForFunction(() => (document.querySelector("#status") ? document.querySelector("#status").dataset.turn === "me" : false), null, { timeout: t || 20000 });

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER === "chrome" ? "chrome" : "msedge" });

  await scenario(browser, "首頁：「對電腦下棋」已開放，顯示目前級別", stateWith(s => { s.playLevel = 5; }), async page => {
    await page.goto(BASE + "index.html"); await page.waitForTimeout(500);
    ok(await page.locator("a.mod").count() === 7, "首頁有 7 個可進入的模組");
    ok((await page.locator("a.mod[href='play.html']").textContent()).includes("目前第 5 級"), "首頁顯示「目前第 5 級」（真實數字）");
    await shot(page, "01-home");
  });

  await scenario(browser, "開局設定、對局、悔棋／提示次數上限、認輸對話框", null, async page => {
    await page.goto(BASE + "play.html"); await page.waitForTimeout(600);
    ok(await page.locator("button[data-level='3'][aria-pressed='true']").count() === 1, "第一次預設第 3 級");
    await shot(page, "02-setup");
    await page.locator("button[data-level='2']").click(); await page.locator("button[data-color='w']").click();
    await page.locator("#start").click();
    await page.waitForSelector("cg-board");
    ok(!(await rect(page)).flipped, "執白：白方在下面");
    await move(page, "e2", "e4");
    await waitMyTurn(page);
    ok((await page.locator("#moves").textContent()).includes("e4"), "棋譜顯示 e4（SAN 記譜）");
    ok(await page.locator("#moves .mv").count() === 2, "電腦已回應（棋譜 2 步）");
    ok((await page.locator("#status").getAttribute("data-turn")) === "me" && (await page.locator("#status").textContent()).startsWith("電腦走了 "), "狀態：顯示電腦上一步（並且輪到你）");
    // 提示：最多 3 次
    await page.locator("#hint").click();
    await page.waitForFunction(() => /提示 1 \/ 3/.test(document.querySelector("#fb").textContent), null, { timeout: 20000 });
    await page.waitForTimeout(350);
    ok(await page.locator(".cg-shapes line, .cg-shapes path, .cg-shapes polygon").count() > 0, "提示：棋盤上有箭頭");
    await shot(page, "03-game-hint");
    await page.locator("#hint").click(); await page.waitForFunction(() => /提示 2 \/ 3/.test(document.querySelector("#fb").textContent), null, { timeout: 20000 });
    await page.locator("#hint").click(); await page.waitForFunction(() => /提示 3 \/ 3/.test(document.querySelector("#fb").textContent), null, { timeout: 20000 });
    ok(await page.locator("#hint").isDisabled(), "提示用完 3 次後按鈕停用");
    ok((await page.locator("#hint").textContent()).includes("剩 0"), "顯示剩餘提示次數 0");
    // 悔棋：每次退雙方各一步，最多 3 次
    for (let i = 1; i <= 3; i++) {
      ok(await page.locator("#undo").isEnabled(), "悔棋第 " + i + " 次可用");
      await page.locator("#undo").click(); await page.waitForTimeout(500);
      ok(await page.locator("#moves .mv").count() === 0, "悔棋後退回雙方各一步（棋譜清空）");
      if (i < 3) { await move(page, "d2", "d4"); await waitMyTurn(page); }
    }
    ok(await page.locator("#undo").isDisabled(), "悔棋用完 3 次後停用");
    // 認輸：App 內對話框，要確認先生效
    let nativeDialog = false; page.on("dialog", d => { nativeDialog = true; d.dismiss(); });
    await page.locator("#resign").click();
    ok(await page.locator(".dlg-box").count() === 1, "認輸要先彈出 App 內對話框");
    await shot(page, "04-resign-dialog");
    await page.locator(".dlg-btns button[data-key='no']").click();
    ok(await page.locator("#fb .feedback").count() === 0 || !(await page.locator("#fb").textContent()).includes("你輸了"), "揀「繼續下棋」不會認輸");
    await page.locator("#resign").click(); await page.locator(".dlg-btns button[data-key='yes']").click();
    await page.waitForSelector("#review");
    ok((await page.locator("#fb").textContent()).includes("你認輸了"), "確認後認輸生效，顯示原因");
    ok(!nativeDialog, "冇用瀏覽器 alert／confirm");
    const st = await stateOf(page);
    ok(st.play.levels[2].l === 1 && st.play.recent.length === 1 && st.play.recent[0].reason === "resign" && st.play.current === null, "已記錄敗局、最近對局，並清除進行中對局");
  });

  await scenario(browser, "電腦先走（玩家執黑）＋中途離開後「繼續上一局」", null, async page => {
    await page.goto(BASE + "play.html"); await page.waitForTimeout(500);
    await page.locator("button[data-level='1']").click(); await page.locator("button[data-color='b']").click();
    await page.locator("#start").click(); await page.waitForSelector("cg-board");
    ok((await rect(page)).flipped, "執黑：黑方在下面");
    await waitMyTurn(page);
    ok(await page.locator("#moves .mv").count() === 1, "電腦（白方）先走了第 1 步");
    await shot(page, "05-play-as-black");
    await move(page, "e7", "e5"); await waitMyTurn(page);
    const before = await page.evaluate(() => window.__chessopsPlay.board().game.fen());
    const st1 = await stateOf(page);
    ok(st1.play.current && st1.play.current.moves.length === 3 && st1.play.current.color === "b", "走棋後已自動保存進行中對局（3 個半步）");
    await page.goto(BASE + "play.html"); await page.waitForTimeout(600);
    ok(await page.locator("#resume").count() === 1, "重新進入顯示「繼續上一局」");
    await page.locator("#resume").click(); await page.waitForSelector("cg-board");
    const after = await page.evaluate(() => window.__chessopsPlay.board().game.fen());
    ok(after === before, "繼續上一局：局面完全一致");
    ok(await page.locator("#moves .mv").count() === 3, "棋譜同樣恢復");
  });

  const mateMoves = ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6"];       // 白方下一步 Qxf7#
  const craft = (lvl, streak) => stateWith(s => { s.playLevel = lvl; s.play.levels[lvl].streak = streak; s.play.current = { level: lvl, color: "w", moves: histUcis(mateMoves), undos: 0, hints: 0, usedUndo: false, usedHint: false }; });

  await scenario(browser, "將死結束畫面（原因）", craft(1, 0), async page => {
    await page.goto(BASE + "play.html"); await page.waitForTimeout(500);
    await page.locator("#resume").click(); await page.waitForSelector("cg-board");
    await move(page, "h5", "f7");
    await page.waitForSelector("#review");
    const t = await page.locator("#fb").textContent();
    ok(t.includes("你贏了") && t.includes("將死 Checkmate"), "顯示「你贏了」同結束原因：將死");
    ok(await page.locator("#board cg-board").count() === 1 && await page.locator("#btn-row.hidden").count() === 1, "結束後隱藏悔棋／提示／認輸");
    await shot(page, "06-checkmate-end");
    const st = await stateOf(page);
    ok(st.play.levels[1].w === 1 && st.play.levels[1].streak === 1 && st.play.recent[0].result === "win" && st.play.recent[0].reason === "checkmate", "勝場 +1、連贏 1、最近對局已記錄");
    ok(st.play.recent[0].pgn.includes("Qxf7#") && st.play.recent[0].blunders === null, "已保存 PGN；未檢討時大錯數目為空");
  });

  await scenario(browser, "升級：同一級連贏 3 局 → 恭喜畫面；之後預設級別變成新級別", craft(1, 2), async page => {
    await page.goto(BASE + "play.html"); await page.waitForTimeout(500);
    await page.locator("#resume").click(); await page.waitForSelector("cg-board");
    await move(page, "h5", "f7");
    await page.waitForSelector(".dlg-box");
    const t = await page.locator(".dlg-box").textContent();
    ok(t.includes("恭喜升級") && t.includes("第 2 級"), "顯示恭喜升級畫面（升到第 2 級）");
    await shot(page, "07-level-up");
    await page.locator(".dlg-btns button").first().click();
    const st = await stateOf(page);
    ok(st.playLevel === 2 && st.play.levels[1].streak === 0, "目前級別升到 2，連贏歸零");
    await page.goto(BASE + "play.html"); await page.waitForTimeout(500);
    ok(await page.locator("button[data-level='2'][aria-pressed='true']").count() === 1, "下次開局預設用第 2 級");
  });

  await scenario(browser, "用過提示的勝局：照計勝負但唔計入連贏；唔會升級", craft(1, 2), async page => {
    await page.goto(BASE + "play.html"); await page.waitForTimeout(500);
    await page.locator("#resume").click(); await page.waitForSelector("cg-board");
    await page.locator("#hint").click(); await page.waitForFunction(() => /提示 1/.test(document.querySelector("#fb").textContent), null, { timeout: 20000 });
    await move(page, "h5", "f7");
    await page.waitForSelector("#review"); await page.waitForTimeout(400);
    ok(await page.locator(".dlg-box").count() === 0, "冇出現升級畫面");
    ok((await page.locator("#fb").textContent()).includes("不計入"), "結束畫面說明用過提示不計入連贏");
    const st = await stateOf(page);
    ok(st.play.levels[1].w === 1 && st.play.levels[1].streak === 2 && st.playLevel === 1, "勝場 +1，但連贏仍然係 2，級別不變");
  });

  const lossState = (lvl) => stateWith(s => { s.playLevel = lvl; s.play.levels[lvl].lstreak = 2; s.play.current = { level: lvl, color: "w", moves: histUcis(["e4", "e5"]), undos: 0, hints: 0, usedUndo: false, usedHint: false }; });
  await scenario(browser, "連輸 3 局：問「要不要降一級？」，由玩家揀（降）", lossState(4), async page => {
    await page.goto(BASE + "play.html"); await page.waitForTimeout(500);
    await page.locator("#resume").click(); await page.waitForSelector("cg-board");
    await page.locator("#resign").click(); await page.locator(".dlg-btns button[data-key='yes']").click();
    await page.waitForSelector(".dlg-box:has-text('降一級')");
    ok((await page.locator(".dlg-box").textContent()).includes("要不要降一級"), "顯示「要不要降一級？」");
    ok((await stateOf(page)).playLevel === 4, "未揀之前級別唔會自動降");
    await shot(page, "08-drop-level-offer");
    await page.locator(".dlg-btns button[data-key='drop']").click();
    ok((await stateOf(page)).playLevel === 3, "揀「降一級」後級別變成 3");
  });
  await scenario(browser, "連輸 3 局：揀「保持」就唔降，連輸歸零", lossState(4), async page => {
    await page.goto(BASE + "play.html"); await page.waitForTimeout(500);
    await page.locator("#resume").click(); await page.waitForSelector("cg-board");
    await page.locator("#resign").click(); await page.locator(".dlg-btns button[data-key='yes']").click();
    await page.waitForSelector(".dlg-box:has-text('降一級')");
    await page.locator(".dlg-btns button[data-key='stay']").click();
    const st = await stateOf(page);
    ok(st.playLevel === 4 && st.play.levels[4].lstreak === 0, "保持第 4 級，連輸歸零");
  });

  // 賽後檢討：用真正引擎分析一局有送后嘅對局
  const blunderPgn = PLG.buildPgn(Chess, histUcis(["e4", "e5", "Qh5", "Nc6", "Qxe5+", "Nxe5", "d4", "Ng6", "Nf3", "Nf6"]), { playerColor: "w", level: 3, result: "b", date: "2026-11-14", reason: "resign" });
  const reviewState = stateWith(s => { s.play.recent = [{ date: "2026-11-14", level: 3, color: "w", result: "loss", reason: "resign", pgn: blunderPgn, blunders: null, plies: 10 }]; });
  await scenario(browser, "賽後檢討：進度、取消、大錯清單、局面箭頭、小結", reviewState, async page => {
    await page.goto(BASE + "play.html"); await page.waitForTimeout(600);
    ok((await page.locator(".recent-row").textContent()).includes("未檢討"), "最近對局列表顯示該局（未檢討）");
    // 先取消一次
    await page.locator(".recent-row button:has-text('檢討')").click();
    await page.waitForSelector("#rv-label");
    ok(await page.locator("#rv-cancel").count() === 1, "檢討中有「取消」掣");
    await page.locator("#rv-cancel").click(); await page.waitForTimeout(400);
    ok(await page.locator(".recent-row").count() === 1, "取消後返回列表");
    // 完整檢討
    await page.locator(".recent-row button:has-text('檢討')").click();
    await page.waitForSelector("#rv-label");
    await shot(page, "09-review-progress");
    await page.waitForSelector("#rv-summary", { timeout: 60000 });
    const sum = await page.locator("#rv-summary").textContent();
    ok(/這局有 \d+ 步大錯/.test(sum), "小結：" + sum.replace(/\s+/g, " ").slice(0, 60));
    ok(await page.locator(".rev-item.blunder").count() >= 1, "清單有至少 1 個大錯");
    const itemText = await page.locator(".rev-item").first().textContent();
    ok(/Qxe5\+/.test(itemText) && itemText.includes("較好的走法是"), "第一項：送后一步（Qxe5+），並列出較好的走法：" + itemText.replace(/\s+/g, " ").slice(0, 70));
    await shot(page, "10-review-list");
    await page.locator(".rev-item").first().click();
    await page.waitForSelector("#rv-pos-text");
    ok(await page.locator(".cg-shapes line, .cg-shapes path, .cg-shapes polygon").count() >= 2, "局面上有箭頭（綠：較好走法；紅：你走的）");
    await shot(page, "11-review-position");
    await page.locator("#rv-list").click(); await page.locator("#rv-back").click();
    await page.waitForSelector(".recent-row");
    const st = await stateOf(page);
    ok(st.play.recent[0].blunders >= 1, "檢討後最近對局記錄大錯數目：" + st.play.recent[0].blunders);
    ok(JSON.stringify(st.play).indexOf("fenBefore") < 0 && Object.keys(st.play.recent[0]).sort().join() === "blunders,color,date,level,pgn,plies,reason,result", "冇保存分析過程");
    ok((await page.locator(".recent-row").textContent()).includes("大錯"), "列表顯示大錯數目");
  });

  await scenario(browser, "引擎穩定：Worker 完全無法使用 → 電腦退回隨機合法步，唔會卡死", null, async page => {
    await page.addInitScript(() => { window.Worker = function () { throw new Error("模擬 Worker 無法建立"); }; });
    await page.goto(BASE + "play.html"); await page.waitForTimeout(600);
    await page.locator("button[data-level='8']").click(); await page.locator("button[data-color='b']").click();
    await page.locator("#start").click(); await page.waitForSelector("cg-board");
    await waitMyTurn(page, 25000);
    ok(await page.locator("#moves .mv").count() === 1, "引擎失敗，電腦仍然走了第 1 步（隨機合法步）");
    ok((await page.locator("#engine-box").textContent()).includes("引擎暫時無法使用"), "顯示「引擎暫時無法使用」同「重新載入引擎」");
    await shot(page, "12-engine-failed");
    await page.locator("#hint").click(); await page.waitForFunction(() => /提示暫時無法使用/.test(document.querySelector("#fb").textContent), null, { timeout: 10000 });
    ok((await page.locator("#hint").textContent()).includes("剩 3"), "提示失敗不扣次數");
    await move(page, "e7", "e5"); await waitMyTurn(page, 25000);
    ok(await page.locator("#moves .mv").count() === 3, "之後照樣可以繼續下棋");
  });
  await scenario(browser, "引擎穩定：Worker 無回應（逾時）→ 自動重新載入，最後仍然唔卡死", null, async page => {
    await page.addInitScript(() => { window.Worker = function () { this.postMessage = () => {}; this.terminate = () => {}; }; });
    await page.goto(BASE + "play.html"); await page.waitForTimeout(500);
    await page.evaluate(() => { window.ChessOps.Config.ENGINE.initTimeoutMs = 1200; window.ChessOps.Config.ENGINE.moveTimeoutMs = 1200; window.__chessopsMgr.reset(); });   // 設定頁已預先載入引擎，要重設先會用新逾時
    await page.locator("button[data-level='7']").click(); await page.locator("button[data-color='b']").click();
    await page.locator("#start").click(); await page.waitForSelector("cg-board");
    await waitMyTurn(page, 30000);
    ok(await page.locator("#moves .mv").count() === 1, "引擎無回應，電腦改用隨機步，遊戲繼續");
  });

  await scenario(browser, "慢網絡：引擎載入提示消失令棋盤移位後，點擊仍然正確（Chessground 位置快取）", null, async page => {
    await page.route("**/stockfish-19-lite-single.wasm", async r => { await new Promise(x => setTimeout(x, 2500)); r.continue(); });
    await page.goto(BASE + "play.html"); await page.waitForTimeout(500);
    await page.locator("button[data-level='2']").click(); await page.locator("button[data-color='w']").click();
    await page.locator("#start").click(); await page.waitForSelector("cg-board");
    const top0 = (await rect(page)).y;
    await page.waitForFunction(() => !document.querySelector("#engine-box .card"), null, { timeout: 30000 });
    await page.waitForTimeout(300);
    ok(Math.abs((await rect(page)).y - top0) <= 1, "引擎提示消失後棋盤唔會移位（" + Math.round(top0) + " → " + Math.round((await rect(page)).y) + "）");
    await move(page, "e2", "e4");
    ok(await page.locator("#moves .mv").count() >= 1, "移位之後第一次點擊走棋仍然成功");
  });

  await browser.close();
  console.log(errors.length ? "\nconsole 錯誤：\n" + errors.join("\n") : "\n沒有 console 錯誤");
  process.exit(failed || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
