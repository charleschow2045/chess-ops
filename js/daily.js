/*
 * 稱號、每日任務、連續日數、練習時間（純邏輯；日期一律用裝置本機時間，午夜換日；tests/run-all.js 會測試）
 *
 * 稱號：由現有數據計出（唔另外儲存進度）。條件喺 config.TITLES；稱號逐級取得；每個條件有進度（例如「謎題分 812 / 950」）。
 *   state.rank.index 只係「最高已經恭喜過嘅稱號」，用嚟令恭喜畫面只出一次。
 * 每日任務（config.DAILY）：戰術謎題 5 題（任何模式）、1 個小練習（三問一輪／小遊戲／殘局一題／開局路線一次）、
 *   對電腦下一局（只喺 config.DAILY.PLAY_DAYS 嘅星期要求）。全部完成 = 當日完成，連續日數 +1；中斷就重新計。
 * 每日紀錄 state.daily.days["YYYY-MM-DD"]：puz／puzOk／pdelta／mini／w／d／l／eg／sec／done，只保留最近 60 日（state.js 清洗）。
 * 練習時間：createTracker(idleMs)——只計頁面喺前景而且有操作嘅時間；停咗 idleMs（預設 2 分鐘）冇操作就停止計。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./config.js"));
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.Daily = factory(root.ChessOps.Config); }
})(typeof self !== "undefined" ? self : this, function (CFG) {
  "use strict";
  var D = CFG.DAILY, T = CFG.TITLES;

  /* ---------- 日期（本機時間） ---------- */
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function dateKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function addDays(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12, 0, 0); return x; }   // 用中午避免夏令時間問題
  function parseKey(k) { var p = k.split("-"); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0); }

  /* ---------- 每日任務 ---------- */
  var LABEL = { puzzles: "戰術謎題 " + D.PUZZLES + " 題", mini: "1 個小練習", play: "對電腦下一局" };
  function requiresPlay(d) { return D.PLAY_DAYS.indexOf(d.getDay()) >= 0; }
  function emptyDay() { return { puz: 0, puzOk: 0, pdelta: 0, mini: 0, w: 0, d: 0, l: 0, eg: 0, sec: 0, done: false }; }
  function dayRec(state, key) { var r = state.daily && state.daily.days && state.daily.days[key]; return r ? r : emptyDay(); }

  /* 當日各項任務進度。items：[{ id, label, have, need, ok }]；done＝全部完成 */
  function status(state, d) {
    var r = dayRec(state, dateKey(d));
    var items = [
      { id: "puzzles", label: LABEL.puzzles, have: Math.min(r.puz, D.PUZZLES), need: D.PUZZLES },
      { id: "mini", label: LABEL.mini, have: Math.min(r.mini, 1), need: 1 }
    ];
    if (requiresPlay(d)) items.push({ id: "play", label: LABEL.play, have: Math.min(r.w + r.d + r.l, 1), need: 1 });
    items.forEach(function (i) { i.ok = i.have >= i.need; });
    return { key: dateKey(d), items: items, done: items.every(function (i) { return i.ok; }), streak: streakNow(state, d), play: requiresPlay(d) };
  }

  /* 連續日數：最後完成日係今日或者昨日先算，否則 0（隔咗一日冇完成就重新計） */
  function streakNow(state, d) {
    var s = state.streak || { count: 0, lastDay: "" };
    if (!s.lastDay) return 0;
    return s.lastDay === dateKey(d) || s.lastDay === dateKey(addDays(d, -1)) ? s.count : 0;
  }

  /*
   * 記錄一項活動（直接改 state；呼叫者負責儲存）。kind：
   *   "puzzle" { ok, delta }（每題第一次作答）｜"mini"｜"play" { result: win|loss|draw }｜"eg" { gain }｜"sec" { sec }
   * 回傳 { done, newlyDone }：newlyDone＝今次令當日任務由未完成變成完成（連續日數已 +1）。
   */
  function apply(state, kind, payload, d) {
    payload = payload || {}; d = d || new Date();
    if (!state.daily) state.daily = { days: {} };
    var key = dateKey(d), days = state.daily.days;
    var r = days[key] = Object.assign(emptyDay(), days[key] || {});
    if (kind === "puzzle") { r.puz++; if (payload.ok) r.puzOk++; r.pdelta += payload.delta || 0; }
    else if (kind === "mini") r.mini++;
    else if (kind === "play") { if (payload.result === "win") r.w++; else if (payload.result === "loss") r.l++; else r.d++; }
    else if (kind === "eg") r.eg += Math.max(0, payload.gain || 0);
    else if (kind === "sec") r.sec = Math.min(86400, r.sec + Math.max(0, payload.sec || 0));
    else throw new Error("未登記的活動：" + kind);
    var newlyDone = false;
    if (!r.done && status(state, d).done) {
      r.done = true; newlyDone = true;
      var s = state.streak = state.streak || { count: 0, lastDay: "" };
      if (s.lastDay !== key) { s.count = s.lastDay === dateKey(addDays(d, -1)) ? s.count + 1 : 1; s.lastDay = key; }
    }
    // 只保留最近 KEEP_DAYS 日
    var keys = Object.keys(days).sort();
    keys.slice(0, Math.max(0, keys.length - D.KEEP_DAYS)).forEach(function (k) { delete days[k]; });
    return { done: r.done, newlyDone: newlyDone };
  }

  /* ---------- 稱號 ---------- */
  var COND_LABEL = { puzzle: "謎題分", play: "電腦級別", stars: "殘局星數", routes: "已掌握開局路線" };
  /* 目前數值。extra.stars＝殘局已取得星數（由頁面用 EndgamesLogic.totals 計） */
  function metrics(state, extra) {
    var routes = state.openings && state.openings.routes ? Object.keys(state.openings.routes).filter(function (k) { return state.openings.routes[k].mastered; }).length : 0;
    return { puzzle: state.puzzles.rating, play: state.playLevel, stars: (extra && extra.stars) || 0, routes: routes };
  }
  function condList(req, m) {
    return Object.keys(req.conds).map(function (k) { return { key: k, label: COND_LABEL[k], have: m[k], need: req.conds[k], ok: m[k] >= req.conds[k] }; });
  }
  function reqMet(req, m) {
    var list = condList(req, m);
    return req.mode === "any" ? list.some(function (c) { return c.ok; }) : list.every(function (c) { return c.ok; });
  }
  /*
   * 目前稱號同去下一級仲差咩。index＝目前稱號（0–5）；next＝下一級 { index, name, mode, conds:[{ key, label, have, need, ok }] }（最高級就係 null）
   */
  function titleInfo(state, extra) {
    var m = metrics(state, extra), idx = 0;
    while (idx + 1 < T.NAMES.length && reqMet(T.REQ[idx + 1], m)) idx++;
    var next = idx + 1 < T.NAMES.length ? { index: idx + 1, name: T.NAMES[idx + 1], mode: T.REQ[idx + 1].mode, conds: condList(T.REQ[idx + 1], m) } : null;
    return { index: idx, name: T.NAMES[idx], next: next, metrics: m };
  }
  /* 要唔要顯示恭喜畫面：目前稱號高過「最高已恭喜稱號」就要（回傳新稱號 index），否則 null */
  function titleCongrats(state, extra) {
    var info = titleInfo(state, extra), seen = state.rank ? state.rank.index : 0;
    return info.index > seen ? info.index : null;
  }
  /* 標記已恭喜（只升不降） */
  function markCongratulated(state, index) { state.rank = state.rank || { index: 0, xp: 0 }; if (index > state.rank.index) state.rank.index = index; }

  /* ---------- 備份提醒（config.APP） ---------- */
  function daysBetween(fromKey, toKey) { return Math.round((parseKey(toKey) - parseKey(fromKey)) / 86400000); }
  /* 距離上次備份幾多日（未備份過就由第一次打開首頁起計；兩者都冇就 null） */
  function backupAge(state, today) {
    var b = state.backup || {}, base = b.last || b.since;
    if (!base) return null;
    return Math.max(0, daysBetween(base, dateKey(today)));
  }
  function backupLabel(state, today) {
    var b = state.backup || {};
    if (!b.last) return "上次備份：尚未備份";
    var d = Math.max(0, daysBetween(b.last, dateKey(today)));
    return "上次備份：" + (d === 0 ? "今日" : d + " 日前");
  }
  /* 首頁頂部提示：超過 BACKUP_WARN_DAYS 日冇備份，而且冇喺關閉後嘅 BACKUP_SNOOZE_DAYS 日內 → { days }，否則 null */
  function backupNotice(state, today) {
    var d = backupAge(state, today), b = state.backup || {};
    if (d === null || d < CFG.APP.BACKUP_WARN_DAYS) return null;
    if (b.snooze && dateKey(today) < b.snooze) return null;
    return { days: d };
  }
  function snoozeBackup(state, today) { state.backup = state.backup || {}; state.backup.snooze = dateKey(addDays(today, CFG.APP.BACKUP_SNOOZE_DAYS)); }
  function markBackup(state, today) { state.backup = state.backup || {}; state.backup.last = dateKey(today); state.backup.snooze = ""; }
  function touchSince(state, today) { state.backup = state.backup || {}; if (!state.backup.since) { state.backup.since = dateKey(today); return true; } return false; }

  /* ---------- 練習時間：只計前景而且有操作 ---------- */
  function createTracker(idleMs) {
    var s = { until: -1, last: null, visible: true, ms: 0 };
    function settle(t) {
      if (s.last !== null && s.visible) { var end = Math.min(t, s.until); if (end > s.last) s.ms += end - s.last; }
      s.last = t;
    }
    return {
      activity: function (t) { settle(t); s.until = t + idleMs; },
      visibility: function (t, visible) { settle(t); s.visible = visible; },
      tick: function (t) { settle(t); },
      takeSeconds: function () { var sec = Math.floor(s.ms / 1000); s.ms -= sec * 1000; return sec; },
      peekMs: function () { return s.ms; }
    };
  }

  return {
    dateKey: dateKey, addDays: addDays, parseKey: parseKey, requiresPlay: requiresPlay, emptyDay: emptyDay, dayRec: dayRec,
    status: status, streakNow: streakNow, apply: apply,
    COND_LABEL: COND_LABEL, metrics: metrics, titleInfo: titleInfo, titleCongrats: titleCongrats, markCongratulated: markCongratulated,
    createTracker: createTracker,
    daysBetween: daysBetween, backupAge: backupAge, backupLabel: backupLabel, backupNotice: backupNotice, snoozeBackup: snoozeBackup, markBackup: markBackup, touchSince: touchSince
  };
});
