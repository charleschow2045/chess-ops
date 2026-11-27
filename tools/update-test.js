/*
 * 更新機制測試（Playwright）：模擬發佈新版本——暫時改 sw.js 內嘅雜湊（測試完還原），驗證：
 *   1. 新 service worker 安裝後唔會自動啟用／刷新（用戶做緊嘅頁面唔受影響）
 *   2. 下次打開首頁，頁底顯示「有新版本，按此更新」
 *   3. 撳咗之後先啟用新版本並重新載入；新快取名稱生效，舊快取刪走
 * 用法：node tools/serve.js 8123；NODE_PATH=…playwright-core… node tools/update-test.js（只可以本機測，因為會暫時改 sw.js）
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const ROOT = path.resolve(__dirname, "..");
const SW = path.join(ROOT, "sw.js");
const BASE = process.env.BASE || "http://localhost:8123/";
let failed = 0;
function ok(c, m) { if (!c) { failed++; console.log("  ✗ " + m); } else console.log("  ✓ " + m); }

(async () => {
  const original = fs.readFileSync(SW, "utf8");
  const browser = await chromium.launch({ channel: process.env.BROWSER === "chrome" ? "chrome" : "msedge" });
  try {
    const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 } });
    await ctx.addInitScript(() => { try { if (!localStorage.getItem("chessops_state")) localStorage.setItem("chessops_state", JSON.stringify({ onboarding: { welcomed: true } })); } catch (e) { /* 忽略 */ } });
    const page = await ctx.newPage();
    await page.goto(BASE + "index.html");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); await page.waitForTimeout(500);
    const cache1 = await page.evaluate(async () => (await caches.keys()).join(","));
    console.log("舊版本快取：" + cache1);
    ok(await page.locator("#update-btn").count() === 0, "冇新版本時冇更新按鈕");

    // 發佈「新版本」：sw.js 內容雜湊改變
    fs.writeFileSync(SW, original.replace(/var HASH = "[0-9a-f]{8}";/, 'var HASH = "deadbeef";'));
    await page.evaluate(() => window.__navCount = 1);
    await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); await reg.update(); });
    await page.waitForFunction(async () => { const reg = await navigator.serviceWorker.getRegistration(); return !!reg.waiting; }, null, { timeout: 30000 });
    ok(true, "新 service worker 已安裝，進入等待狀態（reg.waiting）");
    ok(await page.evaluate(() => window.__navCount === 1), "頁面冇被自動刷新（用戶做緊嘅嘢唔受打斷）");
    const keys = await page.evaluate(async () => (await caches.keys()).sort().join(","));
    ok(keys.includes("deadbeef") && keys.includes(cache1), "新舊兩份快取並存（新版本未啟用）：" + keys);
    ok(await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return r.active && r.active.state === "activated"; }), "舊版本仍然係使用中嘅版本");

    // 下次打開首頁：頁底出現更新按鈕
    await page.reload(); await page.waitForSelector("#update-btn", { timeout: 10000 });
    ok((await page.locator("#update-btn").textContent()).trim() === "有新版本，按此更新", "首頁頁底顯示「有新版本，按此更新」");
    const box = await page.locator("#update-bar").boundingBox(), vp = page.viewportSize();
    ok(box && box.y + box.height > vp.height - 120 && (await page.locator("#update-btn").boundingBox()).height >= 44, "按鈕喺頁底、觸控高度 >= 44px");
    await page.waitForTimeout(1500);

    const still = await page.evaluate(async () => ({ waiting: !!(await navigator.serviceWorker.getRegistration()).waiting, keys: (await caches.keys()).length }));
    ok(still.waiting && still.keys === 2, "未撳之前：新版本仍然等待，舊快取仍在，唔會自動更新");
    // 撳「按此更新」：先啟用新版本並重新載入
    await Promise.all([page.waitForEvent("load"), page.locator("#update-btn").click()]);
    await page.waitForTimeout(1500);
    const after = await page.evaluate(async () => ({ keys: (await caches.keys()).sort(), waiting: !!(await navigator.serviceWorker.getRegistration()).waiting }));
    ok(after.keys.length === 1 && after.keys[0].endsWith("deadbeef"), "更新後只剩新快取，舊快取已刪走：" + after.keys.join(","));
    ok(!after.waiting && await page.locator("#update-btn").count() === 0, "更新完成，按鈕消失");
    ok(await page.locator("#title-name").count() === 1, "更新後頁面正常");
    await ctx.close();
  } catch (e) { failed++; console.log("  ✗ 例外：" + e.message.split("\n")[0]); }
  finally { fs.writeFileSync(SW, original); await browser.close(); }
  console.log(failed ? "\n失敗 " + failed + " 項" : "\n更新機制測試全部通過");
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
