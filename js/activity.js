/*
 * 瀏覽器端：記錄每日活動同練習時間（只喺練習頁面載入）。
 *   ChessOps.Activity.log("puzzle", { ok, delta }) / log("mini") / log("play", { result }) / log("eg", { gain })
 *     → 經 State.loadState／saveState 寫入 daily（連續日數都喺 Daily.apply 入面更新）；回傳 { done, newlyDone }
 *   練習時間：頁面喺前景而且有操作（按、點、鍵盤、捲動）先計；停咗 2 分鐘冇操作就停止計（config.DAILY.IDLE_MS）。
 *   每 10 秒、離開頁面或者切換去背景時寫入 daily[日期].sec。
 */
(function () {
  "use strict";
  var CO = window.ChessOps, State = CO.State, Daily = CO.Daily, CFG = CO.Config;

  /* 簡單提示（唔係對話框，唔阻擋操作）：今日任務全部完成 */
  function toast(text) {
    var d = document.createElement("div");
    d.id = "daily-toast"; d.setAttribute("role", "status");
    d.textContent = text;
    d.style.cssText = "position:fixed;left:16px;right:16px;bottom:20px;z-index:100;padding:14px 18px;border-radius:14px;background:var(--accent);color:var(--accent-fg);font-size:17px;font-weight:800;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.4);pointer-events:none";
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 6000);
  }

  function log(kind, payload) {
    var s = State.loadState();
    var r = Daily.apply(s, kind, payload, new Date());
    var saved = State.saveState(s);
    if (r.newlyDone) toast("今日任務全部完成！連續 " + Daily.streakNow(saved, new Date()) + " 日。");
    return r;
  }

  var tracker = Daily.createTracker(CFG.DAILY.IDLE_MS);
  function flush() {
    tracker.tick(Date.now());
    var sec = tracker.takeSeconds();
    if (sec > 0) log("sec", { sec: sec });
  }
  function act() { tracker.activity(Date.now()); }
  ["pointerdown", "pointermove", "keydown", "touchstart", "touchmove", "scroll", "wheel", "click"].forEach(function (ev) {
    window.addEventListener(ev, act, { passive: true, capture: true });
  });
  document.addEventListener("visibilitychange", function () {
    var vis = document.visibilityState === "visible";
    tracker.visibility(Date.now(), vis);
    if (vis) act(); else flush();
  });
  window.addEventListener("pagehide", flush);
  act();                                         // 開啟頁面本身算一次操作
  setInterval(flush, 10000);

  CO.Activity = { log: log, flush: flush, tracker: tracker };
})();
