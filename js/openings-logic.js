/*
 * 開局訓練嘅純邏輯：一次完整練習路線之後更新該路線紀錄。
 *   clean = 整條路線冇走錯 → 連續全對 streak + 1；有走錯 → streak 歸零
 *   連續全對達到 NEED（3）次 → mastered（已掌握；之後再走錯唔會取消「已掌握」，只係連續次數重新計）
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.OpeningsLogic = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var NEED = 3;
  function applyRun(rec, clean) {
    var r = { streak: rec.streak, mastered: rec.mastered, runs: rec.runs + 1 };
    r.streak = clean ? rec.streak + 1 : 0;
    if (r.streak >= NEED) r.mastered = true;
    return r;
  }
  return { NEED: NEED, applyRun: applyRun };
});
