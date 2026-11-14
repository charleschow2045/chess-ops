/* 設定頁：顯示格名（存入 state.settings.squareNames） */
(function () {
  "use strict";
  var State = window.ChessOps.State;
  var box = document.getElementById("square-names");
  var saved = document.getElementById("saved");
  box.checked = State.loadState().settings.squareNames === true;
  box.addEventListener("change", function () {
    var s = State.loadState();
    s.settings.squareNames = box.checked;
    State.saveState(s);
    saved.textContent = box.checked ? "已開啟：棋盤每一格顯示格名。" : "已關閉：只在棋盤邊顯示座標。";
  });
})();
