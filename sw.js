/*
 * Service worker（由 tools/build-sw.js 產生，請唔好手改；改完任何檔案後要重新跑 node tools/build-sw.js）
 *  - 第一次打開後，將全部頁面、CSS、JS、資料、Chessground、Stockfish 快取，之後冇網絡都可以用晒（「我的對局」讀 chess.com 除外）。
 *  - 更新：新版本安裝好之後唔會自動啟用（唔打斷做緊嘅題目或對局）；用戶按首頁嘅「有新版本，按此更新」先會啟用同重新載入。
 *  - 快取名稱 = chessops-v<App 版本號>-<內容雜湊>，同 js/version.js 一致。
 */
importScripts("js/version.js");
var VERSION = self.CHESSOPS_VERSION;
var HASH = "3f47d2b5";
var CACHE = "chessops-v" + VERSION + "-" + HASH;
var PRECACHE = [
  "./",
  "css/board.css",
  "css/test.css",
  "css/theme.css",
  "data/check-find.js",
  "data/endgames.js",
  "data/knight-maze.js",
  "data/mate1.js",
  "data/openings.js",
  "data/puzzles/index.json",
  "data/puzzles/r0400.json",
  "data/puzzles/r0500.json",
  "data/puzzles/r0600.json",
  "data/puzzles/r0700.json",
  "data/puzzles/r0800.json",
  "data/puzzles/r0900.json",
  "data/puzzles/r1000.json",
  "data/puzzles/r1100.json",
  "data/puzzles/r1200.json",
  "data/puzzles/r1300.json",
  "data/rules-quiz.js",
  "data/three.js",
  "endgames.html",
  "favicon.svg",
  "game-check.html",
  "game-mate1.html",
  "game-maze.html",
  "game-pawnwar.html",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon.svg",
  "index.html",
  "js/activity.js",
  "js/board.js",
  "js/config.js",
  "js/daily.js",
  "js/dialog.js",
  "js/endgames-logic.js",
  "js/endgames.js",
  "js/engine-manager.js",
  "js/engine.js",
  "js/feedback.js",
  "js/game-check.js",
  "js/game-mate1.js",
  "js/game-maze.js",
  "js/game-pawnwar.js",
  "js/home.js",
  "js/icons.js",
  "js/knight-maze.js",
  "js/modules.js",
  "js/mygames-logic.js",
  "js/mygames.js",
  "js/openings-logic.js",
  "js/openings.js",
  "js/pawnwar.js",
  "js/pickmove.js",
  "js/play-logic.js",
  "js/play.js",
  "js/positions.js",
  "js/puzzle-logic.js",
  "js/puzzles.js",
  "js/pwa.js",
  "js/quiz-verify.js",
  "js/quiz.js",
  "js/report-logic.js",
  "js/report.js",
  "js/review-logic.js",
  "js/rules-hub.js",
  "js/settings.js",
  "js/speed.js",
  "js/state.js",
  "js/tactics.js",
  "js/three-logic.js",
  "js/three.js",
  "js/ui-common.js",
  "js/util.js",
  "js/version.js",
  "manifest.webmanifest",
  "mygames.html",
  "openings.html",
  "play.html",
  "puzzles.html",
  "quiz.html",
  "report.html",
  "rules.html",
  "settings.html",
  "three.html",
  "vendor/chess.js/LICENSE",
  "vendor/chess.js/chess.cjs",
  "vendor/chess.js/chess.esm.js",
  "vendor/chessground/LICENSE",
  "vendor/chessground/chessground.base.css",
  "vendor/chessground/chessground.brown.css",
  "vendor/chessground/chessground.cburnett.css",
  "vendor/chessground/chessground.min.js",
  "vendor/stockfish/LICENSE-Copying.txt",
  "vendor/stockfish/stockfish-19-lite-single.js",
  "vendor/stockfish/stockfish-19-lite-single.wasm"
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
