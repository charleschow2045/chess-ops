/*
 * 首頁：標題、稱號卡（目前稱號＋去下一級仲差咩）、每日任務、7 個模組入口、頁底（家長週報、設定、開發者）。
 * 稱號由現有數據計出（js/daily.js，條件喺 config.TITLES）；升稱號嘅恭喜畫面只出一次（state.rank.index 記低最高已恭喜稱號）。
 */
(function () {
  "use strict";
  var CO = window.ChessOps, el = CO.Util.el, I = CO.Icons.ICONS, Daily = CO.Daily, CFG = CO.Config;
  var brand = document.getElementById("brand");
  brand.appendChild(el("div", { class: "brand-logo", html: I.pawn }));
  brand.appendChild(el("div", {}, [el("h1", { text: "國際象棋 Ops" }), el("p", { text: "每天練習一點，少送子、多留意" })]));

  var homeState = CO.State.loadState();
  var puzzleRating = homeState.puzzles.rating, playLevel = homeState.playLevel;
  var egTotals = CO.EndgamesLogic.totals(CO.Endgames.TOPICS, homeState.endgames);
  var now = new Date();

  /* ---------- 稱號卡 ---------- */
  function progressRow(c) {
    var pct = Math.max(0, Math.min(100, Math.round(c.have / c.need * 100)));
    return el("div", { class: "prog-row", "data-key": c.key }, [
      el("div", { class: "prog-top" }, [el("span", { text: c.label + " " + c.have + " / " + c.need }), el("span", { class: "prog-ok", text: c.ok ? "✓" : "" })]),
      el("div", { class: "bar" }, [el("i", { style: "width:" + pct + "%" })])]);
  }
  function renderTitle(info) {
    var box = document.getElementById("title-card");
    box.textContent = "";
    box.appendChild(el("div", { class: "muted", text: "目前稱號" }));
    box.appendChild(el("div", { class: "title-name", id: "title-name", text: info.name }));
    box.appendChild(el("div", { class: "muted", text: "第 " + (info.index + 1) + " / " + CFG.TITLES.NAMES.length + " 級" }));
    if (info.next) {
      box.appendChild(el("p", { class: "next-title", id: "next-title", text: "下一個稱號：" + info.next.name + (info.next.mode === "any" ? "（以下任一項達成即可）" : "（以下全部達成）") }));
      info.next.conds.forEach(function (c) { box.appendChild(progressRow(c)); });
    } else box.appendChild(el("p", { class: "next-title", text: "已達到最高稱號。" }));
    box.appendChild(el("p", { class: "muted fine", text: "App 內稱號，與國際棋聯正式稱號無關" }));
  }

  /* ---------- 每日任務 ---------- */
  function renderDaily(st) {
    var box = document.getElementById("daily-card");
    box.textContent = "";
    box.appendChild(el("div", { class: "daily-head" }, [el("b", { text: "今日任務" }), el("span", { class: "chip gold", id: "streak", text: "連續 " + st.streak + " 日" })]));
    st.items.forEach(function (i) {
      box.appendChild(el("div", { class: "task" + (i.ok ? " ok" : ""), "data-task": i.id }, [
        el("span", { class: "tick", text: i.ok ? "✓" : "○" }),
        el("span", { text: i.label + (i.id === "puzzles" ? "（" + i.have + " / " + i.need + "）" : "") })]));
    });
    if (!st.play) box.appendChild(el("p", { class: "muted", text: "今天不用對電腦下棋（只在星期一、三、五、日要求）。" }));
    if (st.done) box.appendChild(el("p", { class: "daily-done", id: "daily-done", text: "今日任務全部完成！連續 " + st.streak + " 日。" }));
    else box.appendChild(el("p", { class: "muted", text: "完成後會自動打勾。小練習：走棋前三問一輪、小遊戲、殘局一題或開局路線一次。" }));
  }

  var info = Daily.titleInfo(homeState, { stars: egTotals.got });
  renderTitle(info);
  renderDaily(Daily.status(homeState, now));

  /* ---------- 模組入口 ---------- */
  var box = document.getElementById("modules");
  CO.Modules.forEach(function (m) {
    var sub = m.dynamicSub === "puzzleRating" ? "謎題分 " + puzzleRating + "・捉雙 Fork、牽制 Pin 等" : m.dynamicSub === "playLevel" ? "目前第 " + playLevel + " 級・完整對局，可悔棋和提示" : m.dynamicSub === "three" ? (homeState.three.plays ? "已完成 " + homeState.three.plays + " 輪・正確率 " + Math.round(homeState.three.correct / homeState.three.asked * 100) + "%" : "走之前先停一停，避免送子") : m.dynamicSub === "openings" ? "已掌握 " + Object.keys(homeState.openings.routes).filter(function (k) { return homeState.openings.routes[k].mastered; }).length + " / " + Object.keys(homeState.openings.routes).length + " 條路線" : m.dynamicSub === "endgames" ? "已取得 " + egTotals.got + " / " + egTotals.all + " 星・基本將死、王兵對王" : m.dynamicSub === "mygames" ? (homeState.mygames.puzzles.length ? "我的謎題 " + homeState.mygames.puzzles.length + " 題・匯入 chess.com 棋譜" : m.sub) : m.sub;
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

  /* ---------- 升稱號恭喜（只出一次） ---------- */
  var up = Daily.titleCongrats(homeState, { stars: egTotals.got });
  if (up !== null && CO.Dialog) {
    Daily.markCongratulated(homeState, up);
    CO.State.saveState(homeState);
    CO.Dialog.show({ big: "★ " + (up + 1), title: "恭喜升級！", text: "你的稱號升到「" + CFG.TITLES.NAMES[up] + "」。繼續努力！", buttons: [{ key: "ok", label: "好", primary: true }] });
  }
})();
