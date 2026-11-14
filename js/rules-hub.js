/* 「規則快測與小遊戲」選單頁：列出 6 組規則快測同 4 個小遊戲，並顯示最佳成績同完成次數 */
(function () {
  "use strict";
  var CO = window.ChessOps, el = CO.Util.el;
  var rec = CO.State.loadState().records;

  function recText(id, total) {
    var r = rec[id];
    if (!r || !r.plays) return "尚未完成";
    return "最佳 " + r.best + (total ? " / " + total : "") + "・完成 " + r.plays + " 次";
  }
  function tile(href, title, desc, recLine) {
    return el("a", { class: "tile", href: href }, [el("b", { text: title }), el("span", { text: desc }), el("div", { class: "rec", text: recLine })]);
  }

  var qbox = document.getElementById("quiz-tiles");
  CO.RulesQuiz.GROUPS.forEach(function (g) {
    qbox.appendChild(tile("quiz.html?g=" + g.id, g.title, g.desc, recText("quiz-" + g.id, 5)));
  });

  var m1 = [1, 2, 3, 4].map(function (n) { return rec["mate1-" + n]; });
  var m1best = Math.max.apply(null, m1.map(function (r) { return r.best; }));
  var m1plays = m1.reduce(function (a, r) { return a + r.plays; }, 0);
  var gbox = document.getElementById("game-tiles");
  gbox.appendChild(tile("game-mate1.html", "一步將死", "Lichess 真實謎題，找出一步將死，共 60 題，分 4 級", m1plays ? "最佳 " + m1best + " / 15・完成 " + m1plays + " 次" : "尚未完成"));
  gbox.appendChild(tile("game-check.html", "找出將軍", "30 秒內找出所有能將軍的走法", recText("check-find", 5).replace(" / 5", " / 5 個局面")));
  gbox.appendChild(tile("game-maze.html", "騎士迷宮", "避開黑棋，用最少步數吃掉所有星", rec.maze.plays ? "已通關第 " + rec.maze.best + " 關・完成 " + rec.maze.plays + " 次" : "尚未完成"));
  gbox.appendChild(tile("game-pawnwar.html", "兵仗", "只有王和兵，兵先到對方底線就贏", rec.pawnwar.plays ? "最高打贏第 " + rec.pawnwar.best + " 級電腦・完成 " + rec.pawnwar.plays + " 局" : "尚未完成"));
})();
