/*
 * App 版本號（單一來源）。service worker（sw.js）同設定頁都讀呢個值；快取名稱 = "chessops-v" + 版本號 + "-" + 內容雜湊，
 * 所以版本號同快取版本一致。每次發佈新版本：改呢個數字，再跑 node tools/build-sw.js 更新 sw.js。
 */
(function (root, factory) {
  var v = factory();
  if (typeof module === "object" && module.exports) module.exports = v;
  else root.CHESSOPS_VERSION = v;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  return "1.0.0";
});
