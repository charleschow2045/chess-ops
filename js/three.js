/*
 * 走棋前三問（three.html）
 *  Q1 對方上一步想做甚麼？  Q2 我有沒有機會？  Q3 這一步安全嗎？
 *  局面來自 Lichess 謎題（data/three.js）；答案全部由 chess.js 計出（js/three-logic.js），呢度只負責顯示同判斷用戶嘅作答。
 *  一輪 5 個局面（每個局面 3 條問題）；完成顯示小結，並記錄完成次數同正確率。
 */
import { createBoard } from "./board.js";

const CO = window.ChessOps;
const { el, shuffle } = CO.Util;
const stage = document.getElementById("stage");
const DATA = CO.ThreeData;
const ROUND = 5;

const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));

function home() {
  const t = CO.State.loadState().three;
  stage.textContent = "";
  stage.append(
    el("div", { class: "card" }, [
      el("p", { style: "margin:0 0 8px;font-size:18px;font-weight:800", text: "走每一步棋之前，先問自己三條問題：" }),
      el("ol", { style: "margin:0;padding-left:22px;font-size:17px;line-height:1.7" }, [
        el("li", { text: "對方上一步想做甚麼？（對方有甚麼威脅）" }), el("li", { text: "我有沒有機會？（可以白吃對方的棋子，或者將死）" }), el("li", { text: "這一步安全嗎？（走完會不會送子、被將死）" })])]),
    el("div", { class: "card score-box", style: "margin-top:12px" }, [
      el("div", { class: "muted", text: "我的紀錄" }),
      el("div", { class: "big", id: "acc", text: t.asked ? Math.round(t.correct / t.asked * 100) + "%" : "—" }),
      el("p", { class: "muted", text: t.plays ? "已完成 " + t.plays + " 輪・共答 " + t.asked + " 條・答對 " + t.correct + " 條（正確率）" : "尚未完成。一輪 5 個局面，每個局面 3 條問題。" })]),
    el("div", { class: "btn-row" }, [el("button", { class: "btn primary", id: "start", type: "button", text: "開始（5 個局面）", onclick: startRound })]),
    el("p", { class: "muted", text: "局面來自 Lichess 的真實謎題（部分局面是對方走棋之前的位置，用來練習發現將死的威脅）。答案由程式用 chess.js 計算，不是人手編寫。" }));
}

function startRound() {
  const picks = shuffle(DATA).slice(0, ROUND);
  const results = [];
  let i = 0;
  (function next() {
    if (i >= picks.length) return summary(results);
    runPosition(picks[i], i, results).then(r => { results.push(r); i++; window.scrollTo(0, 0); next(); });
  })();
}

/* 一個局面：Q1 → Q2 → Q3 */
function runPosition(p, index, soFar) {
  return new Promise(resolve => {
    const got = [];
    const side = p.fen.split(" ")[1];
    const orientation = side === "w" ? "white" : "black";
    stage.textContent = "";
    const head = el("div", { class: "meta-row" }, [el("span", { class: "q-prog", text: "第 " + (index + 1) + " / " + ROUND + " 個局面・" + (side === "w" ? "白方" : "黑方") + "走棋" }), el("span", { class: "chip gold", id: "qno" })]);
    const qText = el("div", { class: "q-text", id: "q-text" });
    const wrap = el("div", { id: "board" });
    const ctrl = el("div", { id: "ctrl" });
    const fb = el("div", { id: "fb", "aria-live": "polite" });
    const nextBtn = el("button", { class: "btn primary hidden", id: "next", type: "button" });
    stage.append(head, qText, wrap, ctrl, fb, el("div", { class: "btn-row" }, [nextBtn]));
    window.__chessopsThree = { current: () => p };            // 供 tools/shots4.js 自動測試使用
    const board = createBoard(wrap, { fen: p.fen, orientation, interactive: false, viewOnly: true });
    let selected = [];
    let pickable = false;

    // 點棋盤選棋子（Q1／Q2）
    const boardEl = wrap.querySelector("cg-board");
    wrap.querySelector(".bf-board").addEventListener("click", e => {
      if (!pickable) return;
      const r = boardEl.getBoundingClientRect();
      const col = Math.floor((e.clientX - r.left) / (r.width / 8)), row = Math.floor((e.clientY - r.top) / (r.height / 8));
      if (col < 0 || col > 7 || row < 0 || row > 7) return;
      const file = orientation === "white" ? col : 7 - col, rank = orientation === "white" ? 7 - row : row;
      const sq = "abcdefgh"[file] + (rank + 1);
      selected = selected.includes(sq) ? selected.filter(x => x !== sq) : selected.concat(sq);
      board.setShapes(selected.map(s => ({ orig: s, brush: "yellow" })));
      confirmBtn && (confirmBtn.disabled = selected.length === 0);
    });

    let confirmBtn = null;

    function finish(step, ok, q, extraShapes) {
      pickable = false; got.push(ok);
      ctrl.querySelectorAll("button").forEach(b => { b.disabled = true; });
      board.feedback(ok);
      if (extraShapes) board.setShapes(extraShapes);
      CO.Feedback.show(fb, { ok, title: ok ? "答對了！" : "答錯了", text: q.text });
      nextBtn.textContent = step < 3 ? "下一條問題 ›" : (index === ROUND - 1 ? "看小結" : "下一個局面 ›");
      nextBtn.classList.remove("hidden");
      nextBtn.onclick = () => { CO.Feedback.clear(fb); nextBtn.classList.add("hidden"); step < 3 ? ask(step + 1) : resolve({ id: p.id, theme: p.theme, results: got }); };
    }

    function ask(step) {
      ctrl.textContent = ""; selected = []; board.setShapes([]); confirmBtn = null;
      head.querySelector("#qno").textContent = "第 " + step + " / 3 條";
      if (step === 1 || step === 2) {
        const q = step === 1 ? p.q1 : p.q2;
        const mateLabel = step === 1 ? "對方威脅將死" : "可以將死";
        const noneLabel = step === 1 ? "沒有直接威脅" : "沒有";
        qText.textContent = step === 1
          ? "① 對方上一步想做甚麼？　假如現在輪到對方走，對方可以白吃你的哪些棋子？請點選這些棋子，再按「確定」；或者選擇下面的選項。"
          : "② 我有沒有機會？　你可以白吃對方的哪些棋子？請點選這些棋子，再按「確定」；或者選擇下面的選項。";
        pickable = true;
        confirmBtn = el("button", { class: "btn primary", id: "confirm", type: "button", text: "確定（我點選的棋子）", disabled: true, onclick() { finish(step, q.kind === "squares" && sameSet(selected, q.squares), q, answerShapes(q, selected)); } });
        ctrl.append(el("div", { class: "btn-row" }, [confirmBtn,
          el("button", { class: "btn", id: "opt-mate", type: "button", text: mateLabel, onclick() { finish(step, q.kind === "mate", q, answerShapes(q, [])); } }),
          el("button", { class: "btn", id: "opt-none", type: "button", text: noneLabel, onclick() { finish(step, q.kind === "none", q, answerShapes(q, [])); } })]));
      } else {
        const q = p.q3;
        qText.textContent = "③ 這一步安全嗎？　下面三步棋，哪一步會送子（或者走完會被將死）？";
        board.setShapes(q.options.map(o => ({ orig: o.uci.slice(0, 2), dest: o.uci.slice(2, 4), brush: "blue" })));
        const box = el("div", { class: "opt-list" });
        q.options.forEach(o => box.append(el("button", { class: "opt", type: "button", "data-uci": o.uci, text: "走 " + o.san, onclick() {
          const ok = o.uci === q.answer;
          box.querySelectorAll(".opt").forEach(b => { if (b.dataset.uci === q.answer) b.classList.add("right"); });
          if (!ok) box.querySelector('[data-uci="' + o.uci + '"]').classList.add("wrong");
          finish(3, ok, q, q.options.map(x => ({ orig: x.uci.slice(0, 2), dest: x.uci.slice(2, 4), brush: x.uci === q.answer ? "red" : "green" })));
        } })));
        ctrl.append(box);
      }
    }
    function answerShapes(q, picked) {
      const shapes = q.squares.map(s => ({ orig: s, brush: "green" }));
      picked.filter(s => !q.squares.includes(s)).forEach(s => shapes.push({ orig: s, brush: "red" }));
      return shapes;
    }
    ask(1);
  });
}

function summary(results) {
  const total = results.length * 3, correct = results.reduce((a, r) => a + r.results.filter(Boolean).length, 0);
  const s = CO.State.loadState();
  s.three.plays += 1; s.three.asked += total; s.three.correct += correct;
  CO.State.saveState(s);
  const three = CO.State.loadState().three;
  const names = { hangingPiece: "送子", fork: "捉雙", pin: "牽制", mateIn1: "一步殺", mateThreat: "將死威脅" };
  stage.textContent = "";
  stage.append(
    el("div", { class: "card score-box" }, [
      el("div", { class: "muted", text: "本輪小結" }),
      el("div", { class: "big", id: "round-score", text: correct + " / " + total }),
      el("p", { text: correct === total ? "全部答對，走棋前的三問做得很好！" : correct >= total * 0.7 ? "不錯，繼續保持每一步先問三問。" : "再練習幾輪，走棋前先問自己三條問題。" }),
      el("p", { class: "muted", text: "累計：已完成 " + three.plays + " 輪，正確率 " + Math.round(three.correct / three.asked * 100) + "%" })]),
    el("div", { class: "card", style: "margin-top:12px" }, results.map((r, i) => el("div", { class: "meta-row" }, [
      el("span", { text: "第 " + (i + 1) + " 個局面（" + names[r.theme] + "）" }),
      el("span", { class: "muted", text: r.results.map((x, k) => "Q" + (k + 1) + (x ? " ✓" : " ✗")).join("　") })]))),
    el("div", { class: "btn-row" }, [
      el("button", { class: "btn primary", id: "again", type: "button", text: "再來一輪", onclick: startRound }),
      el("button", { class: "btn", id: "back-home", type: "button", text: "返回", onclick: home })]));
}

home();
