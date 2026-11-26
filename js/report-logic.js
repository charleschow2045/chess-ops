/*
 * 家長週報嘅數字計算（純邏輯；日期用本機時間；tests/run-all.js 會測試）
 * 最近 7 日 = 今日同之前 6 日；「上一個 7 日」= 再之前 7 日（只用嚟比較每局平均大錯數）。
 * 總結句只講數字事實，唔作評語。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./daily.js"));
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.ReportLogic = factory(root.ChessOps.Daily); }
})(typeof self !== "undefined" ? self : this, function (Daily) {
  "use strict";
  var WEEK = ["日", "一", "二", "三", "四", "五", "六"];

  function inRange(key, fromKey, toKey) { return key >= fromKey && key <= toKey; }

  /* 某段日期內「已檢討」嘅電腦對局平均大錯數；冇已檢討對局就 null */
  function avgBlunders(recent, fromKey, toKey) {
    var list = (recent || []).filter(function (g) { return g.date && inRange(g.date, fromKey, toKey) && g.blunders !== null && g.blunders !== undefined; });
    if (!list.length) return { avg: null, games: 0 };
    var sum = list.reduce(function (a, g) { return a + g.blunders; }, 0);
    return { avg: Math.round(sum / list.length * 10) / 10, games: list.length };
  }

  /*
   * build(state, today, extra)：extra = { stars: 殘局已取得星數, starsAll: 殘局總星數 }
   */
  function build(state, today, extra) {
    extra = extra || {};
    var keys = [], i;
    for (i = 6; i >= 0; i--) keys.push(Daily.dateKey(Daily.addDays(today, -i)));
    var todayKey = keys[6];
    var recs = keys.map(function (k) { return Daily.dayRec(state, k); });
    var days = keys.map(function (k, idx) {
      var d = Daily.parseKey(k), r = recs[idx];
      var active = r.puz + r.mini + r.w + r.d + r.l + r.sec > 0;
      return { key: k, weekday: WEEK[d.getDay()], md: (d.getMonth() + 1) + "/" + d.getDate(), done: r.done, today: k === todayKey, active: active, minutes: Math.round(r.sec / 60) };
    });
    function sum(f) { return recs.reduce(function (a, r) { return a + f(r); }, 0); }
    var doneDays = days.filter(function (d) { return d.done; }).length;
    var totalSec = sum(function (r) { return r.sec; });
    var puz = sum(function (r) { return r.puz; }), puzOk = sum(function (r) { return r.puzOk; }), pdelta = sum(function (r) { return r.pdelta; });
    var rating = state.puzzles.rating;
    var thisBl = avgBlunders(state.play.recent, keys[0], todayKey);
    var prevBl = avgBlunders(state.play.recent, Daily.dateKey(Daily.addDays(today, -13)), Daily.dateKey(Daily.addDays(today, -7)));
    var mastered = Object.keys(state.openings.routes).filter(function (k) { return state.openings.routes[k].mastered; }).length;
    var out = {
      days: days, doneDays: doneDays, streak: Daily.streakNow(state, today),
      minutesTotal: Math.round(totalSec / 60),
      puzzles: { count: puz, ok: puzOk, accuracy: puz ? Math.round(puzOk / puz * 100) : null, ratingNow: rating, ratingBefore: rating - pdelta, change: pdelta },
      play: { w: sum(function (r) { return r.w; }), d: sum(function (r) { return r.d; }), l: sum(function (r) { return r.l; }), level: state.playLevel, avgBlunders: thisBl, prevAvgBlunders: prevBl },
      endgames: { gained: sum(function (r) { return r.eg; }), stars: extra.stars || 0, starsAll: extra.starsAll || 0 },
      openings: { mastered: mastered, total: Object.keys(state.openings.routes).length },
      wrongBook: state.puzzles.wrong.length
    };
    out.summary = summaryText(out);
    return out;
  }

  /* 一句簡短書面語總結：只講數字事實 */
  function summaryText(r) {
    var parts = ["本週完成任務 " + r.doneDays + " 天"];
    if (r.minutesTotal > 0) parts.push("練習 " + r.minutesTotal + " 分鐘");
    if (r.puzzles.count > 0) parts.push("做了 " + r.puzzles.count + " 題謎題（正確率 " + r.puzzles.accuracy + "%）");
    var c = r.puzzles.change;
    if (r.puzzles.count > 0) parts.push(c > 0 ? "謎題分上升 " + c + " 分" : c < 0 ? "謎題分下降 " + (-c) + " 分" : "謎題分沒有變化");
    return parts.join("，") + "。";
  }

  return { build: build, summaryText: summaryText, avgBlunders: avgBlunders };
});
