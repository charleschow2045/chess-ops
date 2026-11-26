/* 家長週報（report.html）：最近 7 日。數字全部來自儲存資料（js/report-logic.js 計算），冇假數字；總結只講數字事實。 */
(function () {
  "use strict";
  var CO = window.ChessOps, el = CO.Util.el;
  var state = CO.State.loadState();
  var eg = CO.EndgamesLogic.totals(CO.Endgames.TOPICS, state.endgames);
  var r = CO.ReportLogic.build(state, new Date(), { stars: eg.got, starsAll: eg.all });
  var box = document.getElementById("report");

  function stat(label, value, id) { return el("div", { class: "stat" }, [el("span", { text: label }), el("b", Object.assign({ text: value }, id ? { id: id } : {}))]); }
  var blText = function (b) { return b.avg === null ? "—" : b.avg + "（" + b.games + " 局）"; };

  box.append(
    el("div", { class: "card" }, [el("div", { class: "summary", id: "summary", text: r.summary })]),
    el("h2", { class: "section-title", text: "每日任務與練習時間" }),
    el("div", { class: "card" }, [
      el("div", { class: "week", id: "week" }, r.days.map(function (d) {
        return el("div", { class: "wcell" + (d.done ? " done" : "") + (d.today ? " today" : ""), "data-key": d.key }, [
          el("div", { class: "wd", text: "週" + d.weekday }), el("div", { class: "md", text: d.md }),
          el("div", { class: "mark", text: d.done ? "✓" : d.active || d.today ? "○" : "—" }),
          el("div", { class: "min", text: d.minutes + " 分" })]);
      })),
      el("p", { class: "muted", style: "margin:10px 0 0", text: "✓ 當日任務全部完成；○ 有練習但未完成（或今日未完成）；— 沒有紀錄。下面數字是練習分鐘。" }),
      stat("任務完成天數", r.doneDays + " / 7 天", "done-days"),
      stat("連續日數", r.streak + " 日", "streak"),
      stat("練習時間合計", r.minutesTotal + " 分鐘", "minutes")]),
    el("p", { class: "muted", text: "練習時間只計頁面在前景而且有操作的時間，停了 2 分鐘沒有操作就停止計算。" }),
    el("h2", { class: "section-title", text: "戰術謎題" }),
    el("div", { class: "card" }, [
      stat("做了幾題", r.puzzles.count + " 題", "puz-count"),
      stat("正確率（第一次就答對）", r.puzzles.accuracy === null ? "—" : r.puzzles.accuracy + "%", "puz-acc"),
      stat("謎題分", r.puzzles.ratingBefore + " → " + r.puzzles.ratingNow + "（" + (r.puzzles.change > 0 ? "+" : "") + r.puzzles.change + "）", "puz-rating"),
      stat("錯題本現有", r.wrongBook + " 題", "wrong-book")]),
    el("h2", { class: "section-title", text: "對電腦下棋" }),
    el("div", { class: "card" }, [
      stat("本週戰績", r.play.w + " 勝・" + r.play.d + " 和・" + r.play.l + " 負", "play-wdl"),
      stat("目前級別", "第 " + r.play.level + " 級", "play-level"),
      stat("每局平均大錯數（本週）", blText(r.play.avgBlunders), "bl-now"),
      stat("每局平均大錯數（上一個 7 日）", blText(r.play.prevAvgBlunders), "bl-prev")]),
    el("p", { class: "muted", text: "大錯數只計算已做過賽後檢討的對局；沒有已檢討的對局時顯示「—」。" }),
    el("h2", { class: "section-title", text: "殘局與開局" }),
    el("div", { class: "card" }, [
      stat("殘局：本週新增星數", "+" + r.endgames.gained + " 星", "eg-gained"),
      stat("殘局：累計星數", r.endgames.stars + " / " + r.endgames.starsAll + " 星", "eg-total"),
      stat("開局：已掌握路線", r.openings.mastered + " / " + r.openings.total + " 條", "open-mastered")]));
})();
