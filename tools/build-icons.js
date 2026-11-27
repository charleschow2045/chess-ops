/*
 * 由 icons/icon.svg 產生 PNG 圖示（用 Playwright 渲染）：apple-touch-icon 180×180、192×192、512×512。
 * 用法：NODE_PATH=…playwright-core… node tools/build-icons.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const ROOT = path.resolve(__dirname, "..");
const svg = fs.readFileSync(path.join(ROOT, "icons/icon.svg"), "utf8");
const SIZES = [["apple-touch-icon.png", 180], ["icon-192.png", 192], ["icon-512.png", 512]];
(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER === "chrome" ? "chrome" : "msedge" });
  for (const [name, size] of SIZES) {
    const page = await (await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })).newPage();
    await page.setContent('<!doctype html><body style="margin:0;background:#262522">' + svg.replace('width="512" height="512"', 'width="' + size + '" height="' + size + '"') + "</body>");
    await page.screenshot({ path: path.join(ROOT, "icons", name), clip: { x: 0, y: 0, width: size, height: size } });
    console.log(name, size + "×" + size);
    await page.close();
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
