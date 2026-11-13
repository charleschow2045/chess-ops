/*
 * 儲存狀態（localStorage）
 *
 * ⚠️ 規則：
 *  1. 所有 localStorage key 一律以 chessops_ 開頭（見下面 KEYS）。
 *  2. 日後每加一個儲存欄位，必須喺 STATE_FIELDS 登記（預設值 + 檢查函數）。
 *     normalizeState() 只保留 STATE_FIELDS 入面嘅欄位，其他一律刪走；
 *     備份／還原都經過 normalizeState，所以漏登記 = 備份會漏。
 *  3. 唔好喺其他檔案直接用 localStorage，一律經 loadState() / saveState()。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.State = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var KEYS = {
    state: "chessops_state"
  };
  var SCHEMA_VERSION = 1;

  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function int(v, min, max, dflt) {
    v = Math.round(Number(v));
    if (!isFinite(v)) return dflt;
    return Math.min(max, Math.max(min, v));
  }
  function oneOf(list, dflt) { return function (v) { return list.indexOf(v) >= 0 ? v : dflt; }; }
  function dateStr(v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ""; }

  /* 白名單：欄位名 → { def: 預設值（函數，每次新建）, clean: 檢查／清洗函數 } */
  var STATE_FIELDS = {
    version: {
      def: function () { return SCHEMA_VERSION; },
      clean: function () { return SCHEMA_VERSION; }
    },
    // 稱號進度：0 入門棋手 … 5 特級大師；xp 係累積經驗值
    rank: {
      def: function () { return { index: 0, xp: 0 }; },
      clean: function (v) {
        v = isObj(v) ? v : {};
        return { index: int(v.index, 0, 5, 0), xp: int(v.xp, 0, 10000000, 0) };
      }
    },
    // 連續日數
    streak: {
      def: function () { return { count: 0, lastDay: "" }; },
      clean: function (v) {
        v = isObj(v) ? v : {};
        return { count: int(v.count, 0, 100000, 0), lastDay: dateStr(v.lastDay) };
      }
    },
    // 設定
    settings: {
      def: function () { return { board: "chessground", design: "A", flipped: false }; },
      clean: function (v) {
        v = isObj(v) ? v : {};
        return {
          board: oneOf(["chessground", "custom"], "chessground")(v.board),
          design: oneOf(["A", "B", "C"], "A")(v.design),
          flipped: v.flipped === true
        };
      }
    },
    // 對電腦下棋：目前選擇嘅級別（1–8）
    playLevel: {
      def: function () { return 3; },
      clean: function (v) { return int(v, 1, 8, 3); }
    }
  };

  function defaultState() {
    var s = {};
    Object.keys(STATE_FIELDS).forEach(function (k) { s[k] = STATE_FIELDS[k].def(); });
    return s;
  }

  /* 只保留白名單欄位；缺嘅補預設；型別錯嘅清洗。輸入唔使可信。 */
  function normalizeState(raw) {
    var src = isObj(raw) ? raw : {};
    var out = {};
    Object.keys(STATE_FIELDS).forEach(function (k) {
      var f = STATE_FIELDS[k];
      out[k] = Object.prototype.hasOwnProperty.call(src, k) ? f.clean(src[k]) : f.def();
    });
    return out;
  }

  function storage() {
    try { return typeof localStorage !== "undefined" ? localStorage : null; } catch (e) { return null; }
  }

  function loadState() {
    var ls = storage();
    if (!ls) return defaultState();
    try { return normalizeState(JSON.parse(ls.getItem(KEYS.state))); }
    catch (e) { return defaultState(); }
  }

  function saveState(state) {
    var clean = normalizeState(state);
    var ls = storage();
    if (ls) { try { ls.setItem(KEYS.state, JSON.stringify(clean)); } catch (e) { /* 私隱模式或容量已滿 */ } }
    return clean;
  }

  /* 備份：輸出 JSON 字串；還原：解析後再 normalizeState */
  function exportBackup(state) {
    return JSON.stringify({ app: "chessops", exportedAt: new Date().toISOString(), state: normalizeState(state) }, null, 2);
  }
  function parseBackup(text) {
    var obj = JSON.parse(text);
    if (!isObj(obj) || obj.app !== "chessops" || !isObj(obj.state)) throw new Error("這不是有效的備份檔案");
    return normalizeState(obj.state);
  }

  return {
    KEYS: KEYS, SCHEMA_VERSION: SCHEMA_VERSION, STATE_FIELDS: STATE_FIELDS,
    defaultState: defaultState, normalizeState: normalizeState,
    loadState: loadState, saveState: saveState, exportBackup: exportBackup, parseBackup: parseBackup
  };
});
