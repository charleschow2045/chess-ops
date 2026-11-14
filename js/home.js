/* 首頁：標題＋7 個模組入口（只有「規則快測與小遊戲」可以進入） */
(function () {
  "use strict";
  var CO = window.ChessOps, el = CO.Util.el, I = CO.Icons.ICONS;
  var brand = document.getElementById("brand");
  brand.appendChild(el("div", { class: "brand-logo", html: I.pawn }));
  brand.appendChild(el("div", {}, [el("h1", { text: "國際象棋 Ops" }), el("p", { text: "每天練習一點，少送子、多留意" })]));
  var box = document.getElementById("modules");
  var homeState = CO.State.loadState();
  var puzzleRating = homeState.puzzles.rating, playLevel = homeState.playLevel;
  CO.Modules.forEach(function (m) {
    var sub = m.dynamicSub === "puzzleRating" ? "謎題分 " + puzzleRating + "・捉雙 Fork、牽制 Pin 等" : m.dynamicSub === "playLevel" ? "目前第 " + playLevel + " 級・完整對局，可悔棋和提示" : m.sub;
    var inner = [
      el("span", { class: "mod-ic", style: "--h:var(--h" + m.h + ")", html: I[m.icon] }),
      el("span", {}, [el("span", { class: "mod-name", text: m.name }), el("span", { class: "mod-sub", text: sub })])
    ];
    var cls = "mod" + (m.wide ? " wide" : "");
    if (m.href) box.appendChild(el("a", { class: cls, href: m.href }, inner));
    else {
      inner.push(el("span", { class: "soon-tag", text: "即將推出" }));
      box.appendChild(el("div", { class: cls + " soon", "aria-disabled": "true" }, inner));
    }
  });
})();
