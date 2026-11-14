/* 找出將軍：每個局面 30 秒，在棋盤上逐一走出所有能將軍的步（每次走完會自動復位）。
 * 一輪 5 個局面，由淺入深（將軍數 2→5）；成績 = 完整找齊的局面數。 */
import { createBoard } from "./board.js";
import { Chess } from "../vendor/chess.js/chess.esm.js";

const CO = window.ChessOps;
const { el } = CO.Util;
const stage = document.getElementById("stage");
const SECONDS = 30;
const ROUND = 5;

/* 由 20 題中，每個「將軍數」（2、3、4、5）揀一題，再補一題，共 5 題，由淺入深 */
function pickRound() {
  const by = {};
  CO.CheckFind.forEach(p => { (by[p.checks.length] = by[p.checks.length] || []).push(p); });
  const list = [];
  [2, 3, 4, 5].forEach(n => { const a = CO.Util.shuffle(by[n] || []); if (a.length) list.push(a[0]); });
  const rest = CO.Util.shuffle(CO.CheckFind.filter(p => !list.includes(p)));
  list.push(rest[0]);
  return list.slice(0, ROUND).sort((a, b) => a.checks.length - b.checks.length);
}

let round, index, solvedCount;
window.__chessopsDebug = { puzzle: () => round[index] };    // 供 tools/shots.js 自動測試使用

function start() {
  round = pickRound(); index = 0; solvedCount = 0;
  intro();
}

function intro() {
  stage.textContent = "";
  stage.append(
    el("div", { class: "card" }, [
      el("p", { text: "每個局面有 30 秒。請在棋盤上走出所有能「將軍」的走法，走完一步棋會自動復位，讓你繼續找下一步。一輪共 5 個局面。" }),
      el("p", { class: "muted", text: "小提示：將軍可以是直接攻擊對方的王，也可以是移開棋子後由其他棋子形成的將軍。" })]),
    el("div", { class: "btn-row" }, [el("button", { class: "btn primary", type: "button", text: "開始", onclick: show })]));
}

function show() {
  const p = round[index];
  stage.textContent = "";
  const found = new Set();
  let left = SECONDS, timer = null, finished = false;
  const timerEl = el("span", { class: "timer", text: left + " 秒" });
  const foundEl = el("div", { class: "found-list" });
  const fb = el("div", { "aria-live": "polite" });
  const wrap = el("div");
  const nextBtn = el("button", { class: "btn primary hidden", type: "button", text: index === round.length - 1 ? "看結果" : "下一個局面 ›" });
  const counter = el("span", { class: "chip gold" });
  const side = new Chess(p.fen).turn() === "w" ? "白方" : "黑方";
  const upd = () => { counter.textContent = "已找到 " + found.size + " / " + p.checks.length; };
  upd();
  stage.append(
    el("div", { class: "meta-row" }, [el("span", { class: "q-prog", text: "第 " + (index + 1) + " / " + round.length + " 個局面・" + side + "走棋" }), timerEl]),
    el("div", { class: "meta-row" }, [counter, el("span", { class: "muted", text: "共有 " + p.checks.length + " 種將軍的走法" })]),
    wrap, foundEl, fb, el("div", { class: "btn-row" }, [nextBtn]));

  const board = createBoard(wrap, {
    fen: p.fen, orientation: side === "白方" ? "white" : "black", interactive: "turn", promotion: "ask",
    onMove(move) {
      if (finished) return;
      const u = move.from + move.to + (move.promotion || "");
      const isCheck = /[+#]$/.test(move.san);
      board.load(p.fen);                                       // 每步之後復位
      if (isCheck && !found.has(u)) {
        found.add(u); upd();
        foundEl.append(el("span", { class: "chip accent", text: move.san }));
        board.feedback(true);
        CO.Feedback.show(fb, { ok: true, title: "找到了！", text: move.san + " 是將軍。" });
        if (found.size === p.checks.length) end(true);
      } else if (isCheck) {
        CO.Feedback.show(fb, { ok: false, title: "已經找過了", text: move.san + " 已在清單內。" });
        board.feedback(false);
      } else {
        board.feedback(false);
        CO.Feedback.show(fb, { ok: false, title: "這步不是將軍", text: move.san + " 不會攻擊對方的王。" });
      }
    }
  });

  function end(allFound) {
    if (finished) return;
    finished = true; clearInterval(timer);
    board.setInteractive(false);
    if (allFound) {
      solvedCount++;
      CO.Feedback.show(fb, { ok: true, title: "全部找到了！", text: "用了 " + (SECONDS - left) + " 秒。" });
    } else {
      const missing = p.checks.filter(u => !found.has(u));
      board.setShapes(missing.map(u => ({ orig: u.slice(0, 2), dest: u.slice(2, 4), brush: "yellow" })));
      board.feedback(false);
      CO.Feedback.show(fb, { ok: false, title: "時間到", text: "還有 " + missing.length + " 種將軍的走法沒找到，已用黃色箭頭標示。" });
    }
    nextBtn.classList.remove("hidden");
  }
  timer = setInterval(() => {
    left--; timerEl.textContent = left + " 秒"; timerEl.classList.toggle("low", left <= 10);
    if (left <= 0) end(false);
  }, 1000);
  nextBtn.addEventListener("click", () => { index++; index < round.length ? show() : result(); window.scrollTo(0, 0); });
}

function result() {
  const s = CO.State.recordResult(CO.State.loadState(), "check-find", solvedCount);
  const rec = s.records["check-find"];
  stage.textContent = "";
  stage.append(
    el("div", { class: "card score-box" }, [
      el("div", { class: "muted", text: "完整找齊將軍的局面" }),
      el("div", { class: "big", text: solvedCount + " / " + round.length }),
      el("p", { class: "muted", text: "最佳成績 " + rec.best + " / " + ROUND + "・已完成 " + rec.plays + " 次" })]),
    el("div", { class: "btn-row" }, [
      el("button", { class: "btn primary", type: "button", text: "再玩一輪", onclick: start }),
      el("a", { class: "btn", href: "rules.html", text: "返回選單" })]));
}

start();
