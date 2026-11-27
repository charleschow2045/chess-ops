/*
 * 將 docs/stage7-shots/ 入面所有截圖縮細拼成一張總覽圖 docs/stage7-shots/_overview.png（用 Playwright 渲染一頁縮圖格仔）。
 * 用法：NODE_PATH=…playwright-core… node tools/montage.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const DIR = path.resolve(__dirname, "../docs/stage7-shots");
const files = fs.readdirSync(DIR).filter(f => f.endsWith(".png") && !f.startsWith("_")).sort();
const COLS = 6, W = 250;
(async () => {
  const cells = files.map(f => {
    const b64 = fs.readFileSync(path.join(DIR, f)).toString("base64");
    return '<figure><img src="data:image/png;base64,' + b64 + '" width="' + W + '"><figcaption>' + f.replace(/\.png$/, "") + "</figcaption></figure>";
  }).join("");
  const html = '<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:16px;background:#1b1a18;color:#f3f2ef;font:13px/1.3 -apple-system,"PingFang TC","Microsoft JhengHei",sans-serif}' +
    'h1{font-size:20px;margin:0 0 12px}.g{display:grid;grid-template-columns:repeat(' + COLS + ',' + W + 'px);gap:12px}figure{margin:0}img{display:block;border:1px solid #4a4641;border-radius:6px}figcaption{padding:4px 2px;color:#b9b4ac}</style>' +
    "<h1>國際象棋 Ops：全部頁面截圖總覽（820×1180，共 " + files.length + " 張）</h1><div class=\"g\">" + cells + "</div>";
  const browser = await chromium.launch({ channel: process.env.BROWSER === "chrome" ? "chrome" : "msedge" });
  const page = await (await browser.newContext({ viewport: { width: COLS * (W + 12) + 32, height: 900 } })).newPage();
  await page.setContent(html);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(DIR, "_overview.png"), fullPage: true });
  await browser.close();
  console.log("已產生 _overview.png（" + files.length + " 張縮圖）");
})().catch(e => { console.error(e); process.exit(1); });
