/*
 * App 內對話框（唔用瀏覽器 alert／confirm）
 *   const key = await ChessOps.Dialog.show({ title:"確定要認輸嗎？", text:"…", buttons:[{key:"yes",label:"認輸",danger:true},{key:"no",label:"繼續下棋",primary:true}] });
 * 只可以撳按鈕關閉（唔會撳旁邊就關）。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.Dialog = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function show(o) {
    return new Promise(function (resolve) {
      var overlay = document.createElement("div");
      overlay.className = "dlg-overlay";
      var box = document.createElement("div");
      box.className = "dlg-box";
      box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
      var h = document.createElement("h3"); h.textContent = o.title || "";
      box.appendChild(h);
      if (o.big) { var big = document.createElement("div"); big.className = "dlg-big"; big.textContent = o.big; box.insertBefore(big, h); }
      if (o.text) { var p = document.createElement("p"); p.textContent = o.text; box.appendChild(p); }
      var ta = null;
      if (o.textarea) {      // 例如「複製 PGN」失敗時，顯示文字俾用戶長按複製
        ta = document.createElement("textarea"); ta.readOnly = true; ta.value = o.textarea; ta.rows = 8;
        ta.style.cssText = "width:100%;font-size:14px;margin-bottom:12px;border-radius:10px;padding:8px;background:var(--surface2);color:var(--text);border:1px solid var(--line)";
        box.appendChild(ta);
      }
      var row = document.createElement("div"); row.className = "dlg-btns";
      (o.buttons || [{ key: "ok", label: "好", primary: true }]).forEach(function (b) {
        var btn = document.createElement("button");
        btn.type = "button"; btn.className = "btn" + (b.primary ? " primary" : "") + (b.danger ? " danger" : "");
        btn.textContent = b.label; btn.setAttribute("data-key", b.key);
        btn.addEventListener("click", function () { overlay.remove(); resolve(b.key); });
        row.appendChild(btn);
      });
      box.appendChild(row); overlay.appendChild(box); document.body.appendChild(overlay);
      if (ta) { ta.focus(); ta.select(); }
      else { var first = row.querySelector(".primary") || row.firstChild; if (first) first.focus(); }
    });
  }
  return { show: show };
});
