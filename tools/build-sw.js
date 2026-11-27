/*
 * 產生 sw.js（service worker）同檢查離線檔案清單。
 *   node tools/build-sw.js          → 寫入 sw.js（precache 清單＋內容雜湊）
 * 清單 = 所有使用者頁面（唔包括開發用嘅 dev.html、test-*.html、design-preview，呢啲只係喺有網絡時用）、css/、js/、data/（包括 data/puzzles/）、vendor/（chess.js、Chessground、Stockfish .js／.wasm）、
 *        icons/、favicon.svg、manifest.webmanifest、"./"（網站根目錄）。
 * 快取名稱 = "chessops-v" + 版本號（js/version.js）+ "-" + 內容雜湊（檔案內容有任何改動，雜湊就會變，舊快取會喺新版本啟用時刪走）。
 * tests/run-all.js 會用程式掃描頁面引用嘅檔案，同呢個清單對照；雜湊對唔上就 fail（提醒要重新跑呢個工具）。
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ROOT = path.resolve(__dirname, "..");
const TEXT = new Set([".html", ".js", ".css", ".json", ".svg", ".webmanifest", ".md", ".mjs"]);

function walk(dir) {
  const out = [];
  for (const f of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir + "/" + f.name;
    if (f.name.startsWith(".")) continue;                    // .gitkeep 等隱藏檔案唔使快取
    if (f.isDirectory()) out.push(...walk(rel)); else out.push(rel);
  }
  return out;
}
function userPages() { return fs.readdirSync(ROOT).filter(f => f.endsWith(".html") && !/^test-/.test(f) && f !== "dev.html").sort(); }
function precacheList() {
  const list = ["./"].concat(userPages(), ["favicon.svg", "manifest.webmanifest"], walk("css"), walk("js"), walk("data"), walk("vendor"), walk("icons"));
  return Array.from(new Set(list)).sort((a, b) => (a === "./" ? -1 : b === "./" ? 1 : a < b ? -1 : 1));
}
/* 內容雜湊：文字檔先將換行統一做 \n（Windows 同 GitHub 嘅換行唔同，雜湊要一致） */
function contentHash(list) {
  const h = crypto.createHash("sha1");
  for (const f of list) {
    if (f === "./") continue;
    let buf = fs.readFileSync(path.join(ROOT, f));
    if (TEXT.has(path.extname(f))) buf = Buffer.from(buf.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
    h.update(f + "\0"); h.update(buf); h.update("\0");
  }
  return h.digest("hex").slice(0, 8);
}

function build() {
  const list = precacheList(), hash = contentHash(list);
  const src = `/*
 * Service worker（由 tools/build-sw.js 產生，請唔好手改；改完任何檔案後要重新跑 node tools/build-sw.js）
 *  - 第一次打開後，將全部頁面、CSS、JS、資料、Chessground、Stockfish 快取，之後冇網絡都可以用晒（「我的對局」讀 chess.com 除外）。
 *  - 更新：新版本安裝好之後唔會自動啟用（唔打斷做緊嘅題目或對局）；用戶按首頁嘅「有新版本，按此更新」先會啟用同重新載入。
 *  - 快取名稱 = chessops-v<App 版本號>-<內容雜湊>，同 js/version.js 一致。
 */
importScripts("js/version.js");
var VERSION = self.CHESSOPS_VERSION;
var HASH = ${JSON.stringify(hash)};
var CACHE = "chessops-v" + VERSION + "-" + HASH;
var PRECACHE = [
  ${list.map(f => JSON.stringify(f)).join(",\n  ")}
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(PRECACHE.map(function (u) { return new Request(u, { cache: "reload" }); })); })
      .then(function () { if (!self.registration.active) return self.skipWaiting(); })   // 第一次安裝：即刻啟用；更新：等用戶撳「按此更新」
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.filter(function (k) { return k.indexOf("chessops-") === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("message", function (e) {
  var d = e.data || {};
  if (d.type === "SKIP_WAITING") self.skipWaiting();
  if (d.type === "GET_VERSION" && e.source) e.source.postMessage({ type: "VERSION", version: VERSION, cache: CACHE });
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;            // chess.com 等外部網絡唔經快取
  e.respondWith(
    caches.open(CACHE)
      .then(function (c) { return c.match(req, { ignoreSearch: true }); })
      .then(function (hit) {
        if (hit) return hit;
        return fetch(req).catch(function () {
          return req.mode === "navigate" ? caches.match("index.html") : Response.error();
        });
      })
  );
});
`;
  fs.writeFileSync(path.join(ROOT, "sw.js"), src);
  const bytes = list.filter(f => f !== "./").reduce((a, f) => a + fs.statSync(path.join(ROOT, f)).size, 0);
  console.log("sw.js：" + list.length + " 個檔案，約 " + (bytes / 1048576).toFixed(1) + " MB，雜湊 " + hash);
}

module.exports = { precacheList, contentHash, userPages };
if (require.main === module) build();
