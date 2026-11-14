/* 規則快測：一組 5 題。choice 題撳選項；play 題喺棋盤上走一步。答完先顯示解釋。 */
import { createBoard } from "./board.js";
import { Chess } from "../vendor/chess.js/chess.esm.js";

const CO = window.ChessOps;
const { el, qs } = CO.Util;
const group = CO.RulesQuiz.GROUPS.find(g => g.id === qs("g", "castling")) || CO.RulesQuiz.GROUPS[0];
const questions = CO.RulesQuiz.QUESTIONS.filter(q => q.group === group.id);
const stage = document.getElementById("stage");
document.getElementById("title").innerHTML = "";
document.getElementById("title").append(group.title, el("small", { text: "規則快測" }));
document.title = "規則快測：" + group.title;

let index = 0, score = 0;
const results = [];

function sideName(c) { return c === "w" ? "白方" : "黑方"; }
function uciOf(m) { return m.from + m.to + (m.promotion || ""); }
function movesLine(q) { return q.moves ? "走法記錄：" + q.moves.map((s, i) => (i % 2 === 0 ? (i / 2 + 1) + "." : "") + s).join(" ") : null; }

function showQuestion() {
  const q = questions[index];
  stage.textContent = "";
  document.getElementById("prog").textContent = "第 " + (index + 1) + " / " + questions.length + " 題";
  document.getElementById("bar").style.width = (index / questions.length * 100) + "%";
  const pos = CO.QuizVerify.positionOf(q, Chess);
  const wrap = el("div", { id: "board" });
  const fb = el("div", { id: "fb", "aria-live": "polite" });
  const next = el("button", { class: "btn primary hidden", type: "button", text: index === questions.length - 1 ? "看結果" : "下一題 ›" });
  stage.append(el("div", { class: "q-text", text: q.prompt }), wrap);
  const line = movesLine(q);
  if (line) stage.append(el("div", { class: "moves", text: line }));
  let answered = false;

  const board = createBoard(wrap, {
    fen: pos.fen(),
    orientation: pos.turn() === "w" ? "white" : "black",
    interactive: q.type === "play" ? "turn" : false,
    promotion: "ask",
    onMove(move) {
      if (answered) return;
      const ok = q.answer.includes(uciOf(move));
      finish(ok, ok ? null : move);
    }
  });

  function finish(ok, wrongMove) {
    answered = true;
    results.push(ok);
    if (ok) score++;
    board.setInteractive(false);
    board.feedback(ok);
    if (q.type === "play" && !ok) {
      board.undo();                                   // 收回錯誤的一步
      board.setShapes(q.answer.map(u => ({ orig: u.slice(0, 2), dest: u.slice(2, 4), brush: "green" })));
    }
    if (q.type === "play" && ok) board.setShapes([]);
    let detail = q.explain;
    if (q.type === "choice") {
      const right = q.options.find(o => o.key === q.answer);
      if (!ok) detail = "正確答案：" + right.text + "。" + q.explain;
    } else if (!ok) {
      detail = "綠色箭咀標示了正確的走法。" + q.explain;
    }
    CO.Feedback.show(fb, { ok, title: ok ? "答對了！" : "答錯了", text: detail });
    next.classList.remove("hidden");
    next.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  if (q.type === "choice") {
    const two = q.options.length <= 3 && q.options.every(o => o.text.length <= 8) && q.options.length === 2;
    const list = el("div", { class: "opt-list" + (two ? " two" : "") });
    q.options.forEach(o => {
      const b = el("button", { class: "opt", type: "button", text: o.text, "data-key": o.key, onclick() {
        if (answered) return;
        const ok = o.key === q.answer;
        list.querySelectorAll(".opt").forEach(x => { x.disabled = true; if (x.dataset.key === q.answer) x.classList.add("right"); });
        if (!ok) b.classList.add("wrong");
        finish(ok);
      } });
      list.append(b);
    });
    stage.append(list);
  } else {
    stage.append(el("div", { class: "status-line", text: sideName(pos.turn()) + "走棋：請在棋盤上走一步" }));
  }
  stage.append(fb, el("div", { class: "btn-row" }, [next]));
  next.addEventListener("click", () => { index++; index < questions.length ? showQuestion() : showResult(); window.scrollTo(0, 0); });
}

function showResult() {
  const next = CO.State.recordResult(CO.State.loadState(), "quiz-" + group.id, score);
  const rec = next.records["quiz-" + group.id];
  document.getElementById("bar").style.width = "100%";
  document.getElementById("prog").textContent = "完成";
  const msg = score === questions.length ? "全部答對，非常好！" : score >= 3 ? "不錯，再看看答錯的題目。" : "再練習一次，會越來越熟練。";
  stage.textContent = "";
  stage.append(
    el("div", { class: "card score-box" }, [
      el("div", { class: "muted", text: group.title }),
      el("div", { class: "big", text: score + " / " + questions.length }),
      el("p", { text: msg }),
      el("p", { class: "muted", text: "最佳成績 " + rec.best + " / " + questions.length + "・已完成 " + rec.plays + " 次" })
    ]),
    el("div", { class: "btn-row" }, [
      el("button", { class: "btn primary", type: "button", text: "再試一次", onclick() { index = 0; score = 0; results.length = 0; showQuestion(); } }),
      el("a", { class: "btn", href: "rules.html", text: "返回選單" })
    ])
  );
}

showQuestion();
