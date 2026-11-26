/* 7 個模組入口（首頁用）。href 有值 = 已開放；冇 href = 即將推出。 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.Modules = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  return [
    { h: 1, icon: "quiz",   name: "規則快測與小遊戲", sub: "規則小測驗、一步將死、騎士迷宮、兵仗", href: "rules.html" },
    { h: 2, icon: "three",  name: "走棋前三問",       sub: "走之前先停一停，避免送子", href: "three.html", dynamicSub: "three" },
    { h: 3, icon: "puzzle", name: "戰術謎題 Tactics", sub: "捉雙 Fork、牽制 Pin 等戰術", href: "puzzles.html", dynamicSub: "puzzleRating" },
    { h: 4, icon: "robot",  name: "對電腦下棋",       sub: "選擇級別，練習完整對局", href: "play.html", dynamicSub: "playLevel" },
    { h: 5, icon: "book",   name: "開局 Openings",    sub: "常見開局的走法和想法", href: "openings.html", dynamicSub: "openings" },
    { h: 6, icon: "flag",   name: "殘局 Endgames",    sub: "王兵殘局、基本將死", href: "endgames.html", dynamicSub: "endgames" },
    { h: 7, icon: "log",    name: "我的對局 My Games", sub: "匯入 chess.com 棋譜，找出送子的位置", href: "mygames.html", dynamicSub: "mygames", wide: true }
  ];
});
