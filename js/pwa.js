/*
 * 加到主畫面／離線使用（所有頁面載入）：
 *  - 註冊 service worker（sw.js）。第一次打開後全部檔案會被快取，之後冇網絡都可以用。
 *  - 更新機制：有新版本安裝好之後唔會自動刷新（唔打斷做緊嘅題目或對局）；喺首頁頁底顯示「有新版本，按此更新」，
 *    用戶撳咗先啟用新版本同重新載入。
 *  - ChessOps.PWA.version＝App 版本號（同快取版本一致，來自 js/version.js）。
 */
(function () {
  "use strict";
  var CO = (window.ChessOps = window.ChessOps || {});
  CO.PWA = { version: window.CHESSOPS_VERSION || "", supported: false, waiting: null };
  if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
  CO.PWA.supported = true;

  var asked = false;                              // 用戶撳咗「按此更新」先重新載入
  function showUpdate(worker) {
    CO.PWA.waiting = worker;
    var bar = document.getElementById("update-bar");
    if (!bar || bar.querySelector("button")) return;
    var btn = document.createElement("button");
    btn.type = "button"; btn.id = "update-btn"; btn.className = "btn primary";
    btn.textContent = "有新版本，按此更新";
    btn.addEventListener("click", function () { asked = true; btn.disabled = true; btn.textContent = "更新中…"; worker.postMessage({ type: "SKIP_WAITING" }); });
    bar.appendChild(btn);
  }

  navigator.serviceWorker.register("sw.js").then(function (reg) {
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
    reg.addEventListener("updatefound", function () {
      var w = reg.installing;
      if (!w) return;
      w.addEventListener("statechange", function () { if (w.state === "installed" && navigator.serviceWorker.controller) showUpdate(w); });
    });
  }).catch(function () { /* 註冊失敗（例如私人瀏覽模式）：照常使用，只係冇離線功能 */ });

  navigator.serviceWorker.addEventListener("controllerchange", function () { if (asked) location.reload(); });
})();
