/* 兩個棋盤測試頁共用：升變選擇視窗、棋步記錄文字 */
(function (root) {
  "use strict";
  var NAMES = { q: ["queen", "后 Queen"], r: ["rook", "車 Rook"], b: ["bishop", "象 Bishop"], n: ["knight", "馬 Knight"] };

  /* 顯示升變選擇；color = "w" | "b"；回傳 Promise<"q"|"r"|"b"|"n"|null>（null = 取消） */
  function askPromotion(color) {
    return new Promise(function (resolve) {
      var overlay = document.createElement("div");
      overlay.className = "promo-overlay";
      var box = document.createElement("div");
      box.className = "promo-box cg-wrap";
      var h = document.createElement("h3"); h.textContent = "升變為：";
      var list = document.createElement("div"); list.className = "promo-list";
      ["q", "r", "b", "n"].forEach(function (k) {
        var b = document.createElement("button");
        b.type = "button"; b.setAttribute("aria-label", NAMES[k][1]);
        var p = document.createElement("piece"); p.className = NAMES[k][0] + " " + (color === "w" ? "white" : "black");
        b.appendChild(p);
        b.addEventListener("click", function () { close(k); });
        list.appendChild(b);
      });
      var cancel = document.createElement("button");
      cancel.type = "button"; cancel.className = "btn promo-cancel"; cancel.textContent = "取消";
      cancel.addEventListener("click", function () { close(null); });
      box.appendChild(h); box.appendChild(list); box.appendChild(cancel);
      overlay.appendChild(box);
      overlay.addEventListener("click", function (e) { if (e.target === overlay) close(null); });
      document.body.appendChild(overlay);
      function close(v) { overlay.remove(); resolve(v); }
    });
  }

  /* history → "1. e4 e5 2. Nf3 Nc6" */
  function movesText(history) {
    var out = [];
    for (var i = 0; i < history.length; i += 2) {
      out.push((i / 2 + 1) + ". " + history[i] + (history[i + 1] ? " " + history[i + 1] : ""));
    }
    return out.join("  ") || "（未有棋步）";
  }

  function statusText(game) {
    var side = game.turn() === "w" ? "白方" : "黑方";
    if (game.isCheckmate()) return "將死 Checkmate！" + (game.turn() === "w" ? "黑方" : "白方") + "勝";
    if (game.isStalemate()) return "和棋：無子可動 Stalemate";
    if (game.isDraw()) return "和棋 Draw";
    return side + "走棋" + (game.inCheck() ? "（被將軍 Check）" : "");
  }

  root.ChessOps = root.ChessOps || {};
  root.ChessOps.UI = { askPromotion: askPromotion, movesText: movesText, statusText: statusText };
})(typeof self !== "undefined" ? self : this);
