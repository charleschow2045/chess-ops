/* 設定頁：顯示格名（settings.squareNames）、對局中顯示三問提醒（settings.threeReminder） */
(function () {
  "use strict";
  var State = window.ChessOps.State;
  var saved = document.getElementById("saved");
  var boxes = [
    { id: "square-names", key: "squareNames", on: "已開啟：棋盤每一格顯示格名。", off: "已關閉：只在棋盤邊顯示座標。" },
    { id: "three-reminder", key: "threeReminder", on: "已開啟：對局中會顯示三問提醒。", off: "已關閉：對局中不顯示三問提醒。" }
  ];
  boxes.forEach(function (b) {
    var el = document.getElementById(b.id);
    el.checked = State.loadState().settings[b.key] === true;
    el.addEventListener("change", function () {
      var s = State.loadState();
      s.settings[b.key] = el.checked;
      State.saveState(s);
      saved.textContent = el.checked ? b.on : b.off;
    });
  });
})();
