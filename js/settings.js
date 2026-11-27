/*
 * 設定頁：顯示格名（settings.squareNames）、對局中顯示三問提醒（settings.threeReminder）、備份與還原。
 * 備份：匯出＝全部 chessops_ 資料經 normalizeState() 處理，加版本號，下載 JSON 檔（檔名有日期）；後備「複製備份文字」。
 * 匯入：揀檔案或貼上文字 → State.parseBackup() 檢查格式同版本（唔啱就講原因，唔寫入）→ App 內對話框確認「會覆蓋現有紀錄」→ 先寫入。
 */
(function () {
  "use strict";
  var CO = window.ChessOps, State = CO.State, Dialog = CO.Dialog;
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

  /* ---------- 電腦出棋速度（慢／中／快，預設慢） ---------- */
  var speedBtns = Array.prototype.slice.call(document.querySelectorAll("[data-speed]"));
  var SPEED_TEXT = { slow: "慢", medium: "中", fast: "快" };
  function paintSpeed() {
    var cur = State.loadState().settings.computerSpeed;
    speedBtns.forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-speed") === cur)); });
  }
  speedBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      var s = State.loadState();
      s.settings.computerSpeed = b.getAttribute("data-speed");
      State.saveState(s);
      paintSpeed();
      saved.textContent = "電腦出棋速度已設為「" + SPEED_TEXT[s.settings.computerSpeed] + "」。";
    });
  });
  paintSpeed();

  /* ---------- 備份與還原 ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var Daily = CO.Daily;
  function paintBackup() { $("last-backup").textContent = Daily.backupLabel(State.loadState(), new Date()); }
  function markBackedUp() { var s = State.loadState(); Daily.markBackup(s, new Date()); State.saveState(s); paintBackup(); }
  paintBackup();

  /* ---------- 版本同離線狀態 ---------- */
  $("app-version").textContent = window.CHESSOPS_VERSION || "—";
  (function () {
    var el = $("offline-status");
    if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) { el.textContent = "離線使用：這個瀏覽器或開啟方式不支援。"; return; }
    var done = false;
    navigator.serviceWorker.ready.then(function () { done = true; el.textContent = "離線使用：已準備好（頁面、題目和引擎都已儲存在這部裝置，沒有網絡也可以練習；讀取 chess.com 對局需要網絡）。"; });
    setTimeout(function () { if (!done) el.textContent = "離線使用：準備中…請保持網絡連線，等待幾秒後重新載入這一頁。"; }, 4000);
  })();
  var msg = $("backup-msg");
  function say(text, good) { msg.textContent = text; msg.className = "msg " + (good ? "good" : "bad"); }
  function paintSize() {
    var b = State.storedBytes();
    $("data-size").textContent = b ? (b / 1024 < 10 ? (b / 1024).toFixed(1) : Math.round(b / 1024)) + " KB" : "0 KB";
  }
  paintSize();

  $("export").addEventListener("click", function () {
    var text = State.exportBackup(State.loadState());
    try {
      var blob = new Blob([text], { type: "application/json" });
      var url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = State.backupFileName(new Date());
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 15000);
      markBackedUp();
      say("已匯出：" + a.download + "。如果沒有出現下載，請改用「複製備份文字」。", true);
    } catch (e) { say("無法下載檔案，請改用「複製備份文字」。", false); }
  });

  $("copy-backup").addEventListener("click", async function () {
    var text = State.exportBackup(State.loadState());
    try { await navigator.clipboard.writeText(text); markBackedUp(); say("已複製備份文字，可以貼到「備忘錄」等地方保存。", true); }
    catch (e) { await Dialog.show({ title: "請手動複製備份文字", text: "長按下面的文字全選後複製。", textarea: text, buttons: [{ key: "ok", label: "關閉", primary: true }] }); markBackedUp(); }
  });

  var fileText = null;
  $("import-file").addEventListener("change", function () {
    var f = $("import-file").files[0];
    fileText = null;
    if (!f) return;
    var r = new FileReader();
    r.onload = function () { fileText = String(r.result); say("已選擇檔案：" + f.name + "。按「檢查並匯入」繼續。", true); };
    r.onerror = function () { say("無法讀取這個檔案。", false); };
    r.readAsText(f);
  });

  $("import-go").addEventListener("click", async function () {
    var pasted = $("import-text").value.trim();
    var text = pasted || fileText;
    var parsed;
    try { parsed = State.parseBackup(text || ""); }
    catch (e) { say("無法匯入：" + e.message, false); return; }            // 格式不對：講明原因，不寫入
    var d = Object.keys(parsed.daily.days).length;
    var k = await Dialog.show({
      title: "匯入備份？",
      text: "匯入會覆蓋這部裝置上的現有紀錄，無法還原。備份內容：謎題分 " + parsed.puzzles.rating + "、電腦目前第 " + parsed.playLevel + " 級、每日紀錄 " + d + " 日、我的謎題 " + parsed.mygames.puzzles.length + " 題。",
      buttons: [{ key: "yes", label: "覆蓋並匯入", danger: true }, { key: "no", label: "取消", primary: true }]
    });
    if (k !== "yes") { say("已取消，沒有寫入任何資料。", true); return; }
    State.saveState(parsed);
    $("import-text").value = ""; $("import-file").value = ""; fileText = null;
    var s = State.loadState();
    boxes.forEach(function (b) { $(b.id).checked = s.settings[b.key] === true; });
    paintSize(); paintBackup();
    say("已匯入備份。", true);
  });
})();
