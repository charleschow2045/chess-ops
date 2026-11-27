/* 小工具：網址參數、建立 DOM、洗牌 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.Util = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function qs(name, dflt) {
    try { var v = new URLSearchParams(location.search).get(name); return v === null ? dflt : v; } catch (e) { return dflt; }
  }
  /* el("div", {class:"x", onclick:fn}, ["文字", childEl]) */
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k === "html") e.innerHTML = v;
      else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), v);
      else if (v !== false && v !== null && v !== undefined) e.setAttribute(k, v === true ? "" : v);
    });
    (children || []).forEach(function (c) { e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  /*
   * 棋盤上方嘅題目文字，每題長短唔同會令棋盤上下跳。做法：喺 host 入面用同一個 class 量度所有可能嘅文字要幾高，
   * 取最高者做 element 嘅 min-height（視窗大細改變時重新量度）。
   */
  function fixTextHeight(element, host, cls, texts) {
    function measure() {
      var probe = document.createElement("div");
      probe.className = cls; probe.style.visibility = "hidden"; probe.style.minHeight = "0";
      host.appendChild(probe);
      var h = 0;
      texts.forEach(function (t) { probe.textContent = t; h = Math.max(h, probe.offsetHeight); });
      host.removeChild(probe);
      element.style.minHeight = h + "px";
    }
    measure();
    window.addEventListener("resize", function () { if (document.body.contains(element)) measure(); });
  }
  function shuffle(a, rng) {
    rng = rng || Math.random;
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  return { qs: qs, el: el, shuffle: shuffle, fixTextHeight: fixTextHeight };
});
