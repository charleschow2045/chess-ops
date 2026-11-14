/* 一步將死：每級 10 題。接受所有能將死的步（由 chess.js 即時判斷是否將死）。
 * 計分：第一次嘗試就答對、而且沒有看答案，才得 1 分。 */
import { createBoard } from "./board.js";

const CO = window.ChessOps;
const { el, qs } = CO.Util;
const stage = document.getElementById("stage");
const LEVEL_NAMES = { 1: "第 1 級：后", 2: "第 2 級：后和車", 3: "第 3 級：加入馬和象", 4: "第 4 級：挑戰" };

function pickLevel() {
  const rec = CO.State.loadState().records;
  stage.textContent = "";
  stage.append(el("p", { class: "muted", text: "白方走棋，找出一步將死黑王。接受所有能將死的走法。每級 10 題。" }));
  const grid = el("div", { class: "tile-grid" });
  [1, 2, 3, 4].forEach(n => {
    const r = rec["mate1-" + n];
    grid.append(el("a", { class: "tile", href: "game-mate1.html?level=" + n }, [
      el("b", { text: LEVEL_NAMES[n] }),
      el("span", { text: "10 題" }),
      el("div", { class: "rec", text: r.plays ? "最佳 " + r.best + " / 10・完成 " + r.plays + " 次" : "尚未完成" })
    ]));
  });
  stage.append(grid);
}

function play(level) {
  const puzzles = CO.Mate1.filter(p => p.level === level);
  let index = 0, score = 0;
  document.title = "一步將死・" + LEVEL_NAMES[level];

  function show() {
    const p = puzzles[index];
    stage.textContent = "";
    let attempts = 0, revealed = false, solved = false;
    const wrap = el("div"), fb = el("div", { "aria-live": "polite" });
    const nextBtn = el("button", { class: "btn primary hidden", type: "button", text: index === puzzles.length - 1 ? "看結果" : "下一題 ›" });
    const showBtn = el("button", { class: "btn", type: "button", text: "看答案" });
    stage.append(
      el("div", { class: "meta-row" }, [el("span", { class: "q-prog", text: LEVEL_NAMES[level] + "・第 " + (index + 1) + " / " + puzzles.length + " 題" }), el("span", { class: "chip gold", text: "得分 " + score })]),
      el("div", { class: "bar" }, [el("i", { style: "width:" + (index / puzzles.length * 100) + "%" })]),
      el("div", { class: "status-line", text: "白方走棋：一步將死" }), wrap, fb, el("div", { class: "btn-row" }, [showBtn, nextBtn]));

    const board = createBoard(wrap, {
      fen: p.fen, orientation: "white", interactive: "white", promotion: "ask",
      onMove(move) {
        if (solved) return;
        attempts++;
        if (board.game.isCheckmate()) {
          solved = true;
          if (attempts === 1 && !revealed) score++;
          board.setInteractive(false); board.feedback(true);
          CO.Feedback.show(fb, { ok: true, title: "將死！", text: move.san + " 是將死。" + (p.mates.length > 1 ? "這題有 " + p.mates.length + " 種將死的走法。" : "") });
          showBtn.classList.add("hidden"); nextBtn.classList.remove("hidden");
        } else {
          board.undo(); board.feedback(false);
          CO.Feedback.show(fb, { ok: false, title: "這步沒有將死", text: "請再試一次。" + (attempts >= 2 ? "（卡住時可以按「看答案」。）" : "") });
        }
      }
    });
    showBtn.addEventListener("click", () => {
      if (solved) return;
      revealed = true; solved = true;
      board.setInteractive(false);
      board.setShapes(p.mates.map(u => ({ orig: u.slice(0, 2), dest: u.slice(2, 4), brush: "green" })));
      CO.Feedback.show(fb, { ok: false, title: "答案", text: "綠色箭咀是將死的走法。這題不計分。" });
      showBtn.classList.add("hidden"); nextBtn.classList.remove("hidden");
    });
    nextBtn.addEventListener("click", () => { index++; index < puzzles.length ? show() : result(); window.scrollTo(0, 0); });
  }

  function result() {
    const s = CO.State.recordResult(CO.State.loadState(), "mate1-" + level, score);
    const rec = s.records["mate1-" + level];
    stage.textContent = "";
    stage.append(
      el("div", { class: "card score-box" }, [
        el("div", { class: "muted", text: LEVEL_NAMES[level] }),
        el("div", { class: "big", text: score + " / " + puzzles.length }),
        el("p", { text: score >= 9 ? "非常好，可以挑戰下一級！" : "多練習幾次，會越來越快。" }),
        el("p", { class: "muted", text: "最佳成績 " + rec.best + " / 10・已完成 " + rec.plays + " 次" })]),
      el("div", { class: "btn-row" }, [
        el("a", { class: "btn primary", href: "game-mate1.html?level=" + level, text: "再玩一次" }),
        level < 4 ? el("a", { class: "btn", href: "game-mate1.html?level=" + (level + 1), text: "下一級" }) : "",
        el("a", { class: "btn", href: "game-mate1.html", text: "選擇級別" })].filter(Boolean)));
  }
  show();
}

const lv = Number(qs("level", 0));
if (lv >= 1 && lv <= 4) play(lv); else pickLevel();
