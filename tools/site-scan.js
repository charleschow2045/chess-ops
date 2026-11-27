/*
 * 全站掃描（Playwright）：每個頁面喺 820×1180 同 1180×820 都檢查
 *   1. 冇 console 錯誤／頁面錯誤／失敗嘅請求
 *   2. 冇橫向捲動
 *   3. 冇細過 13px 嘅字
 *   4. 按鈕／連結／輸入嘅觸控範圍 >= 44×44px（隱藏嘅唔計；checkbox 計包住佢嘅 label）
 *   5. 文字同背景對比度：細字 >= 4.5:1、大字（>= 24px，或者 >= 18.66px 而且粗體）>= 3:1（停用嘅按鈕、變淡嘅提醒行唔計）
 *   6. 顯示出嚟嘅文字冇廣東話字
 * 並截圖（820×1180）到 docs/stage7-shots/<頁面>.png。
 * 用法：node tools/serve.js 8123；NODE_PATH=…playwright-core… node tools/site-scan.js [頁面名稱過濾]
 * 結果：docs/site-scan.json
 */
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright-core");
const ROOT = path.resolve(__dirname, "..");
const BASE = process.env.BASE || "http://localhost:8123/";
const OUT = process.env.OUT || path.resolve(ROOT, "docs/stage7-shots");
fs.mkdirSync(OUT, { recursive: true });
const FILTER = process.argv[2] || "";
const VIEWPORTS = [{ name: "820x1180", width: 820, height: 1180 }, { name: "1180x820", width: 1180, height: 820 }];
/* 額外狀態頁：init＝預設儲存資料（會合併 onboarding／設定）；act＝喺頁面載入後做嘅操作 */
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); const p = x => String(x).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); };
const EXTRA = [
  { name: "首頁（第一次使用：歡迎卡）", url: "index.html", fresh: true },
  { name: "首頁（備份提示）", url: "index.html", init: { backup: { since: daysAgo(10) } } },
  { name: "戰術謎題（練習中）", url: "puzzles.html", act: async p => { await p.locator("#go-rec").click(); await p.waitForSelector("cg-board"); await p.waitForTimeout(2500); } },
  { name: "對電腦下棋（對局中）", url: "play.html", act: async p => { await p.locator("button[data-level='1']").click(); await p.locator("button[data-color='w']").click(); await p.locator("#start").click(); await p.waitForSelector("cg-board"); await p.waitForTimeout(1500); } },
  { name: "走棋前三問（題目）", url: "three.html", act: async p => { await p.locator("#start").click(); await p.waitForSelector("cg-board"); await p.waitForTimeout(800); } },
  { name: "開局（路線練習）", url: "openings.html", act: async p => { await p.locator("[data-route]").first().click(); await p.waitForSelector("cg-board"); await p.waitForTimeout(1500); } },
  { name: "開局（小測）", url: "openings.html", act: async p => { await p.locator("#quiz-tile").click(); await p.waitForSelector("cg-board"); await p.waitForTimeout(500); } },
  { name: "殘局（課題說明）", url: "endgames.html", act: async p => { await p.locator("[data-topic]").first().click(); await p.waitForSelector("#explain"); } },
  { name: "殘局（練習）", url: "endgames.html", act: async p => { await p.locator("[data-topic]").first().click(); await p.locator("[data-pos]").first().click(); await p.waitForSelector("cg-board"); await p.waitForTimeout(800); } },
  { name: "規則快測（答錯）", url: "quiz.html?g=castling", act: async p => { const k = await p.evaluate(() => window.ChessOps.RulesQuiz.QUESTIONS.find(q => q.group === "castling").answer); await p.locator(".opt:not([data-key='" + k + "'])").first().click(); await p.waitForSelector(".feedback.bad"); await p.waitForTimeout(900); } },
  { name: "對電腦下棋（認輸確認對話框）", url: "play.html", act: async p => { await p.locator("button[data-level='1']").click(); await p.locator("#start").click(); await p.waitForSelector("cg-board"); await p.locator("#resign").click(); await p.waitForSelector(".dlg-box"); await p.waitForTimeout(400); } },
  { name: "設定（匯入確認對話框）", url: "settings.html", act: async p => { await p.locator("#import-text").fill(JSON.stringify({ app: "chessops", version: 2, state: {} })); await p.locator("#import-go").click(); await p.waitForSelector(".dlg-box"); await p.waitForTimeout(400); } },
  { name: "設定（匯入錯誤訊息）", url: "settings.html", act: async p => { await p.locator("#import-text").fill("不是備份"); await p.locator("#import-go").click(); await p.waitForTimeout(400); } },
  { name: "戰術謎題（提示）", url: "puzzles.html", act: async p => { await p.locator("#go-rec").click(); await p.waitForSelector("cg-board"); await p.waitForFunction(() => document.querySelector(".status-line").dataset.turn === "me", null, { timeout: 15000 }); await p.locator("#hint").click(); await p.waitForSelector(".feedback"); await p.waitForTimeout(900); } },
  { name: "走棋前三問（回饋）", url: "three.html", act: async p => { await p.locator("#start").click(); await p.waitForSelector("cg-board"); await p.locator("#opt-none").click(); await p.waitForSelector("#fb .feedback"); await p.waitForTimeout(900); } },
  { name: "殘局（判斷題答錯）", url: "endgames.html", act: async p => { await p.locator("[data-topic='kpk']").click(); const id = await p.evaluate(() => window.ChessOps.Endgames.TOPICS[3].positions.find(x => x.task === "judge" && x.expect === "draw").id); await p.locator("[data-pos='" + id + "']").click(); await p.waitForSelector("cg-board"); await p.locator("[data-ans='win']").click(); await p.waitForSelector("#fb .feedback"); await p.waitForTimeout(900); } },
  { name: "規則快測（答題後）", url: "quiz.html?g=castling", act: async p => { await p.locator(".opt").first().click(); await p.waitForSelector(".feedback"); await p.waitForTimeout(900); } }
];
const PAGES = [
  ["首頁", "index.html"], ["規則快測與小遊戲", "rules.html"], ["規則快測", "quiz.html?g=castling"], ["一步將死選級", "game-mate1.html"], ["一步將死", "game-mate1.html?level=1"],
  ["找出將軍", "game-check.html"], ["騎士迷宮選關", "game-maze.html"], ["騎士迷宮", "game-maze.html?level=1"], ["兵仗", "game-pawnwar.html"],
  ["戰術謎題", "puzzles.html"], ["對電腦下棋", "play.html"], ["走棋前三問", "three.html"], ["開局訓練", "openings.html"], ["殘局訓練", "endgames.html"],
  ["我的對局", "mygames.html"], ["家長週報", "report.html"], ["設定", "settings.html"]
].map(([name, url]) => ({ name, url })).concat(EXTRA);
const CANTONESE = /[嘅咗唔佢喺俾啲嘢冇哋嚟嗰咁乜咩啱睇揀攞嘥畀係諗仲晒呢哩囉喇喎撳搵揸咀隻]|點樣|點解|邊個|而家/;

/* 喺頁面內執行：回傳問題清單 */
function inPage(cfg) {
  const out = { small: [], targets: [], contrast: [], canto: [], hscroll: false };
  const vis = e => { const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; for (let p = e; p && p.nodeType === 1; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.display === "none" || cs.visibility === "hidden") return false; } return true; };
  const parse = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(",").map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  function bgOf(e) {
    const stack = [];
    for (let p = e; p && p.nodeType === 1; p = p.parentElement) {
      const c = parse(getComputedStyle(p).backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; }
    }
    let base = { r: 38, g: 37, b: 34, a: 1 };           // body 背景（--bg）
    for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
    return base;
  }
  function opacityOf(e) { let o = 1; for (let p = e; p && p.nodeType === 1; p = p.parentElement) o *= Number(getComputedStyle(p).opacity); return o; }
  const exempt = e => !!e.closest("[disabled], .dim, .invisible, .hidden, cg-board, piece, .promo-list piece");
  const txt = e => Array.from(e.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join("").trim();
  document.querySelectorAll("body *").forEach(e => {
    if (["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "PATH"].includes(e.tagName.toUpperCase()) || e.closest("svg")) return;
    const t = txt(e);
    if (!t || !vis(e)) return;
    const cs = getComputedStyle(e), fs = parseFloat(cs.fontSize);
    if (fs < 13 - 0.01) out.small.push({ text: t.slice(0, 24), size: fs, el: e.tagName.toLowerCase() + (e.className && typeof e.className === "string" ? "." + e.className.split(" ")[0] : "") });
    if (!exempt(e)) {
      const fg0 = parse(cs.color); if (fg0) {
        const bg = bgOf(e), o = opacityOf(e), fg = over({ r: fg0.r, g: fg0.g, b: fg0.b, a: fg0.a * o }, bg);
        const large = fs >= 24 || (fs >= 18.66 && Number(cs.fontWeight) >= 700), need = large ? 3 : 4.5, r = ratio(fg, bg);
        if (r < need - 0.005) out.contrast.push({ text: t.slice(0, 24), ratio: Math.round(r * 100) / 100, need, size: fs, el: e.tagName.toLowerCase() + (e.className && typeof e.className === "string" ? "." + e.className.split(" ")[0] : "") });
      }
    }
    if (cfg.canto.test(t)) out.canto.push(t.slice(0, 30));
  });
  const seen = new Set();
  document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=switch]").forEach(e => {
    if (!vis(e) && !(e.tagName === "INPUT" && e.closest("label") && vis(e.closest("label")))) return;
    if (e.closest("cg-board")) return;
    let t = e;
    if (e.tagName === "INPUT" && (e.type === "checkbox" || e.type === "radio") && e.closest("label")) t = e.closest("label");
    if (e.tagName === "INPUT" && e.type === "file") return;                              // 原生檔案選擇器
    if (seen.has(t)) return; seen.add(t);
    const r = t.getBoundingClientRect();
    if (r.width < 44 - 0.5 || r.height < 44 - 0.5) out.targets.push({ text: (t.textContent || t.value || t.getAttribute("aria-label") || "").trim().slice(0, 20), w: Math.round(r.width), h: Math.round(r.height), el: t.tagName.toLowerCase() + (t.className && typeof t.className === "string" ? "." + t.className.split(" ")[0] : "") });
  });
  out.topbar = !!document.querySelector(".topbar a.btn-back") && !!document.querySelector(".topbar h1");      // 一致嘅頂部：返回掣＋標題（首頁除外）
  out.hscroll = document.documentElement.scrollWidth > window.innerWidth + 1;
  out.hscrollDetail = [document.documentElement.scrollWidth, window.innerWidth];
  return out;
}

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER === "chrome" ? "chrome" : "msedge" });
  const results = [];
  let failed = 0;
  for (const vp of VIEWPORTS) {
    console.log("\n=== 視窗 " + vp.name + " ===");
    for (const pg of PAGES) {
      const { name, url } = pg;
      if (FILTER && !name.includes(FILTER) && !url.includes(FILTER)) continue;
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, serviceWorkers: "block" });
      const init = Object.assign({ settings: { computerSpeed: "fast" } }, pg.fresh ? {} : { onboarding: { welcomed: true } }, pg.init || {});
      await ctx.addInitScript(st => { try { localStorage.setItem("chessops_state", JSON.stringify(st)); } catch (e) { /* 忽略 */ } }, init);
      const page = await ctx.newPage();
      const errs = [];
      page.on("console", m => { if (m.type() === "error") errs.push("console：" + m.text()); });
      page.on("pageerror", e => errs.push("頁面錯誤：" + e.message));
      page.on("requestfailed", r => errs.push("請求失敗：" + r.url().replace(BASE, "")));
      let r = { name, url, viewport: vp.name };
      try {
        await page.goto(BASE + url); await page.waitForTimeout(1500);
        if (pg.act) await pg.act(page);
        const res = await page.evaluate(inPage, { canto: CANTONESE });
        Object.assign(r, res, { errors: errs });
        if (vp.name === "820x1180") await page.screenshot({ path: path.join(OUT, name + ".png") });
      } catch (e) { r.exception = e.message.split("\n")[0]; r.errors = errs; }
      if (!r.exception && !url.startsWith("index.html") && !r.topbar) { (r.errors = r.errors || []).push("頂部缺少返回掣或標題（.topbar）"); }
      const bad = r.exception ? 1 : (r.errors.length + (r.hscroll ? 1 : 0) + r.small.length + r.targets.length + r.contrast.length + r.canto.length);
      if (bad) failed++;
      results.push(r);
      console.log((bad ? "  ✗ " : "  ✓ ") + vp.name + "｜" + name + (bad ? "｜錯誤 " + r.errors.length + "、橫向捲動 " + (r.hscroll ? "有" : "冇") + "、細字 " + (r.small || []).length + "、觸控範圍 " + (r.targets || []).length + "、對比度 " + (r.contrast || []).length + "、廣東話 " + (r.canto || []).length + (r.exception ? "｜例外：" + r.exception : "") : ""));
      await ctx.close();
    }
  }
  await browser.close();
  fs.writeFileSync(path.resolve(ROOT, process.env.SCANJSON || "docs/site-scan.json"), JSON.stringify({ viewports: VIEWPORTS.map(v => v.name), results }, null, 1) + "\n");
  if (process.env.VERBOSE) results.forEach(r => { ["errors", "small", "targets", "contrast", "canto"].forEach(k => (r[k] || []).slice(0, 6).forEach(x => console.log("    " + r.viewport + "｜" + r.name + "｜" + k + "：" + JSON.stringify(x)))); });
  console.log(failed ? "\n有問題嘅頁面：" + failed : "\n全部通過");
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
