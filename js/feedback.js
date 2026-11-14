/*
 * 統一嘅「答啱／答錯」回饋：顏色＋短動畫＋文字，冇聲音。
 *   ChessOps.Feedback.show(container, { ok:true, title:"答對了！", text:"解釋…" })
 *   ChessOps.Feedback.flash(boardWrapEl, ok)     // 棋盤外框閃一下（答錯會輕輕搖動）
 *   ChessOps.Feedback.clear(container)
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.Feedback = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function clear(container) { if (container) container.textContent = ""; }

  function show(container, o) {
    clear(container);
    var box = document.createElement("div");
    box.className = "feedback " + (o.ok ? "ok" : "bad");
    box.setAttribute("role", "status");
    var mark = document.createElement("div");
    mark.className = "fb-mark";
    mark.textContent = o.ok ? "✓" : "✗";
    var body = document.createElement("div");
    var b = document.createElement("b");
    b.textContent = o.title || (o.ok ? "答對了！" : "答錯了");
    body.appendChild(b);
    if (o.text) { var t = document.createElement("span"); t.textContent = o.text; body.appendChild(t); }
    box.appendChild(mark); box.appendChild(body);
    container.appendChild(box);
    return box;
  }

  function flash(wrap, ok) {
    if (!wrap) return;
    wrap.classList.remove("fb-ok", "fb-bad");
    void wrap.offsetWidth;                       // 重新觸發動畫
    wrap.classList.add(ok ? "fb-ok" : "fb-bad");
  }

  return { show: show, flash: flash, clear: clear };
});
