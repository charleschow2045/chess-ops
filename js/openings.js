/*
 * 開局訓練（openings.html）
 *  - 路線練習：學習者走自己一方，App 自動走對方（約 0.5 秒）；走錯即時顯示正確走法（箭頭）同解釋，可以再試；
 *    「也可以」走法（data 內 route.alts，Stockfish 驗證）：顯示「也可以！不過這條路線練習的是 X，請再走一次。」，還原棋步，唔當錯；
 *    同一條路線「連續 3 次全對」（整條路線冇走錯）= 已掌握。
 *  - 開局原則小測：10 題「下面哪一步最符合開局原則？」（3 個選項）。
 *  資料 data/openings.js 由 tools/verify-openings.js 產生，並已用 Stockfish 驗證（見 docs/stage4-content.md）。
 */
import { createBoard } from "./board.js";
import { Chess } from "../vendor/chess.js/chess.esm.js";

const CO = window.ChessOps;
const { el } = CO.Util;
const D = CO.Openings;
const stage = document.getElementById("stage");
const OL = CO.OpeningsLogic;
const NEED = OL.NEED;                            // 連續全對次數 = 已掌握
const uciOf = m => m.from + m.to + (m.promotion || "");
const delay = ms => new Promise(r => setTimeout(r, ms));
const getS = () => CO.State.loadState();
function update(fn) { const s = CO.State.loadState(); fn(s); return CO.State.saveState(s); }

function routeUcis(route) {
  const g = new Chess(), out = [];
  route.moves.forEach(s => { out.push(uciOf(g.move(s))); });
  return out;
}

/* ======================= 選單 ======================= */
function home() {
  const s = getS().openings;
  stage.textContent = "";
  const mastered = D.ROUTES.filter(r => s.routes[r.id].mastered).length;
  stage.append(
    el("div", { class: "card score-box" }, [
      el("div", { class: "muted", text: "已掌握的路線" }),
      el("div", { class: "big", id: "mastered", text: mastered + " / " + D.ROUTES.length }),
      el("p", { class: "muted", text: "同一條路線連續 " + NEED + " 次全對，就算掌握。" })]),
    el("h2", { class: "section-title", text: "白方路線" }),
    el("div", { class: "tile-grid" }, D.ROUTES.filter(r => r.side === "w").map(routeTile)),
    el("h2", { class: "section-title", text: "黑方路線" }),
    el("div", { class: "tile-grid" }, D.ROUTES.filter(r => r.side === "b").map(routeTile)),
    el("h2", { class: "section-title", text: "開局原則小測" }),
    el("button", { class: "tile", id: "quiz-tile", type: "button", style: "width:100%;text-align:left;color:inherit;font:inherit;cursor:pointer", onclick: startQuiz }, [
      el("b", { text: "下面哪一步最符合開局原則？" }),
      el("span", { text: "10 題局面題，每題 3 個選項" }),
      el("div", { class: "rec", text: s.quiz.plays ? "最佳 " + s.quiz.best + " / 10・完成 " + s.quiz.plays + " 次" : "尚未完成" })]),
    el("p", { class: "muted", style: "margin-top:16px", text: "開局原則：控制中心、盡快出子、儘早易位、不要過早出后、不要重複走同一枚子。" }));
}

function routeTile(r) {
  const st = getS().openings.routes[r.id];
  const rec = st.mastered ? "已掌握 ✓" : st.runs ? "連續全對 " + st.streak + " / " + NEED + "・練習 " + st.runs + " 次" : "尚未練習";
  return el("button", { class: "tile", type: "button", "data-route": r.id, style: "text-align:left;color:inherit;font:inherit;cursor:pointer", onclick: () => practice(r) }, [
    el("b", { text: r.title }), el("span", { text: r.desc }), el("div", { class: "rec", text: rec })]);
}

/* ======================= 路線練習 ======================= */
function practice(route) {
  const ucis = routeUcis(route);
  const mine = route.side;                                   // 學習者顏色
  let idx = 0, mistakes = 0, auto = true, done = false;
  stage.textContent = "";
  const wrap = el("div", { id: "board" }), fb = el("div", { id: "fb", "aria-live": "polite" });
  const log = el("div", { class: "movelist-box", id: "route-log", style: "max-height:220px" });
  const status = el("div", { class: "status-line", id: "status" });
  const retry = el("button", { class: "btn hidden", id: "retry", type: "button", text: "再試一次" });
  stage.append(
    el("div", { class: "meta-row" }, [el("span", { class: "q-prog", text: route.title + "・你執" + (mine === "w" ? "白" : "黑") }), el("span", { class: "chip gold", id: "mistakes", text: "走錯 0 次" })]),
    status, wrap, fb, el("div", { class: "btn-row" }, [retry, el("button", { class: "btn", id: "leave", type: "button", text: "返回選單", onclick: home })]),
    el("h2", { class: "section-title", text: "每一步的想法" }), log);

  const board = createBoard(wrap, {
    orientation: mine === "w" ? "white" : "black", interactive: false, promotion: "ask",
    onMove(move) { if (!auto) onLearnerMove(move); }
  });

  function note(i) { return route.notes[i]; }
  function addLog(i, san) {
    const n = Math.floor(i / 2) + 1, white = i % 2 === 0;
    log.append(el("div", {}, [el("b", { text: (white ? n + ". " : n + "… ") + san + "　" }), el("span", { text: note(i) })]));
    log.scrollTop = log.scrollHeight;
  }
  const side = i => (i % 2 === 0 ? "w" : "b");

  async function playOpponentUntilMine() {
    auto = true; board.setInteractive(false);
    while (idx < ucis.length && side(idx) !== mine) {
      status.textContent = "對方走棋…";
      await delay(500);
      const u = ucis[idx];
      const m = board.play({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      addLog(idx, m.san); idx++;
    }
    auto = false;
    if (idx >= ucis.length) return finish();
    board.setInteractive(mine === "w" ? "white" : "black");
    status.textContent = "輪到你：走出這條路線的下一步";
  }

  function onLearnerMove(move) {
    const u = uciOf(move);
    if (u === ucis[idx]) {
      CO.Feedback.show(fb, { ok: true, title: "走對了！", text: note(idx) });
      addLog(idx, move.san); idx++; board.clearShapes();
      board.feedback(true);
      if (idx >= ucis.length) return finish();
      playOpponentUntilMine();
    } else if (((route.alts && route.alts[idx]) || []).some(a => a.uci === u)) {
      // 「也可以」走法（Stockfish 驗證勝率跌幅 < 0.03，符合開局原則）：唔當錯，還原棋步，等學習者走主線；唔影響「連續 3 次全對」
      board.undo(); board.clearShapes();
      board.setInteractive(mine === "w" ? "white" : "black");
      CO.Feedback.show(fb, { ok: true, title: "也可以！", text: "不過這條路線練習的是 " + route.moves[idx] + "，請再走一次。" });
    } else {
      mistakes++;
      stage.querySelector("#mistakes").textContent = "走錯 " + mistakes + " 次";
      board.undo(); board.setInteractive(false); board.feedback(false);
      const exp = ucis[idx];
      board.setShapes([{ orig: exp.slice(0, 2), dest: exp.slice(2, 4), brush: "green" }]);
      const san = new Chess(board.game.fen()).move({ from: exp.slice(0, 2), to: exp.slice(2, 4), promotion: exp[4] }).san;
      CO.Feedback.show(fb, { ok: false, title: "走錯了", text: "這條路線的下一步是 " + san + "（綠色箭頭）。" + note(idx) });
      retry.classList.remove("hidden");
    }
  }
  retry.addEventListener("click", () => { retry.classList.add("hidden"); CO.Feedback.clear(fb); board.clearShapes(); board.setInteractive(mine === "w" ? "white" : "black"); status.textContent = "輪到你：走出這條路線的下一步"; });

  function finish() {
    done = true; board.setInteractive(false);
    const clean = mistakes === 0;
    let st;
    update(s => {
      const r = s.openings.routes[route.id];
      st = OL.applyRun(r, clean);
      s.openings.routes[route.id] = st;
    });
    CO.Activity.log("mini");
    status.textContent = "路線完成";
    CO.Feedback.show(fb, { ok: clean, title: clean ? (st.mastered && st.streak === NEED ? "已掌握這條路線！" : "全對！") : "完成，但這次走錯了 " + mistakes + " 次",
      text: clean ? "連續全對 " + st.streak + " / " + NEED + " 次" + (st.mastered ? "，已掌握。" : "，再練 " + (NEED - st.streak) + " 次就掌握。") : "連續全對次數歸零，再練習一次吧。" });
    stage.querySelector("#leave").before(el("button", { class: "btn primary", id: "again", type: "button", text: "再練一次", onclick: () => practice(route) }));
  }

  playOpponentUntilMine();
}

/* ======================= 開局原則小測 ======================= */
function startQuiz() {
  let i = 0, score = 0;
  function show() {
    const q = D.QUIZ[i];
    stage.textContent = "";
    const wrap = el("div", { id: "board" }), fb = el("div", { id: "fb", "aria-live": "polite" });
    const next = el("button", { class: "btn primary hidden", id: "next", type: "button", text: i === D.QUIZ.length - 1 ? "看結果" : "下一題 ›" });
    const box = el("div", { class: "opt-list" });
    stage.append(
      el("div", { class: "meta-row" }, [el("span", { class: "q-prog", text: "第 " + (i + 1) + " / " + D.QUIZ.length + " 題" }), el("span", { class: "chip gold", text: "得分 " + score })]),
      el("div", { class: "bar" }, [el("i", { style: "width:" + (i / D.QUIZ.length * 100) + "%" })]),
      el("div", { class: "q-text", text: "下面哪一步最符合開局原則？（" + (q.turn === "w" ? "白方" : "黑方") + "走棋）" }), wrap, box, fb, el("div", { class: "btn-row" }, [next]));
    const board = createBoard(wrap, { fen: q.fen, orientation: q.turn === "w" ? "white" : "black", interactive: false, viewOnly: true });
    q.options.forEach(o => box.append(el("button", { class: "opt", type: "button", "data-uci": o.uci, text: "走 " + o.san, onclick() {
      const ok = o.uci === q.answer;
      if (ok) score++;
      box.querySelectorAll(".opt").forEach(b => { b.disabled = true; if (b.dataset.uci === q.answer) b.classList.add("right"); });
      if (!ok) box.querySelector('[data-uci="' + o.uci + '"]').classList.add("wrong");
      board.setShapes([{ orig: q.answer.slice(0, 2), dest: q.answer.slice(2, 4), brush: "green" }].concat(ok ? [] : [{ orig: o.uci.slice(0, 2), dest: o.uci.slice(2, 4), brush: "red" }]));
      board.feedback(ok);
      CO.Feedback.show(fb, { ok, title: ok ? "答對了！" : "答錯了", text: q.explain });
      next.classList.remove("hidden");
    } })));
    next.addEventListener("click", () => { i++; window.scrollTo(0, 0); i < D.QUIZ.length ? show() : result(); });
  }
  function result() {
    const s = update(x => { x.openings.quiz.plays += 1; x.openings.quiz.best = Math.max(x.openings.quiz.best, score); });
    stage.textContent = "";
    stage.append(
      el("div", { class: "card score-box" }, [
        el("div", { class: "muted", text: "開局原則小測" }),
        el("div", { class: "big", id: "quiz-score", text: score + " / " + D.QUIZ.length }),
        el("p", { text: score >= 9 ? "非常好，開局原則掌握得很好！" : "多練習幾次，記住：控制中心、盡快出子、儘早易位。" }),
        el("p", { class: "muted", text: "最佳成績 " + s.openings.quiz.best + " / 10・已完成 " + s.openings.quiz.plays + " 次" })]),
      el("div", { class: "btn-row" }, [el("button", { class: "btn primary", id: "again", type: "button", text: "再試一次", onclick: startQuiz }), el("button", { class: "btn", id: "back-home", type: "button", text: "返回選單", onclick: home })]));
  }
  show();
}

home();
