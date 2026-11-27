/* 一步將死：Lichess 真實 mateIn1 謎題（CC0），共 60 題，按謎題分由低至高分 4 級，每級 15 題。
 * 題目 FEN 是「對手走之前」：App 先自動走對手第 1 步（有動畫），之後輪到玩家，玩家以自己一方在下面。
 * 接受所有能將死的步（由 chess.js 即時判斷是否將死）。
 * 計分：第一次嘗試就答對、而且沒有看答案，才得 1 分。 */
import { createBoard } from "./board.js";
import { Chess } from "../vendor/chess.js/chess.esm.js";

const CO = window.ChessOps;
const { el, qs } = CO.Util;
const stage = document.getElementById("stage");
const PER_LEVEL = 15;

function levelRange(n) {
  const r = CO.Mate1.filter(p => p.level === n).map(p => p.rating);
  return "謎題分 " + Math.min(...r) + "–" + Math.max(...r);
}
const levelName = n => "第 " + n + " 級（" + levelRange(n) + "）";
const parse = u => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

function pickLevel() {
  const rec = CO.State.loadState().records;
  stage.textContent = "";
  stage.append(el("p", { class: "muted", text: "找出一步將死對方的走法，接受所有能將死的走法。題目來自 Lichess 的真實謎題，每級 15 題。對手會先走一步，然後輪到你。" }));
  const grid = el("div", { class: "tile-grid" });
  [1, 2, 3, 4].forEach(n => {
    const r = rec["mate1-" + n];
    grid.append(el("a", { class: "tile", href: "game-mate1.html?level=" + n }, [
      el("b", { text: "第 " + n + " 級" }),
      el("span", { text: levelRange(n) + "・" + PER_LEVEL + " 題" }),
      el("div", { class: "rec", text: r.plays ? "最佳 " + r.best + " / " + PER_LEVEL + "・完成 " + r.plays + " 次" : "尚未完成" })
    ]));
  });
  stage.append(grid);
}

function play(level) {
  const puzzles = CO.Mate1.filter(p => p.level === level);
  let index = 0, score = 0;
  document.title = "一步將死・第 " + level + " 級";

  function show() {
    const p = puzzles[index];
    stage.textContent = "";
    let attempts = 0, revealed = false, solved = false, auto = true;
    const first = new Chess(p.fen);
    const playerColor = first.turn() === "w" ? "black" : "white";       // 對手先走，所以玩家係另一方
    const wrap = el("div"), fb = el("div", { "aria-live": "polite" });
    const nextBtn = el("button", { class: "btn primary hidden", type: "button", text: index === puzzles.length - 1 ? "看結果" : "下一題 ›" });
    const showBtn = el("button", { class: "btn", type: "button", text: "看答案", disabled: true });
    const status = el("div", { class: "status-line", text: "對手先走一步…" });
    stage.append(
      el("div", { class: "meta-row" }, [el("span", { class: "q-prog", text: "第 " + level + " 級・第 " + (index + 1) + " / " + puzzles.length + " 題" }), el("span", { class: "chip gold", text: "得分 " + score })]),
      el("div", { class: "bar" }, [el("i", { style: "width:" + (index / puzzles.length * 100) + "%" })]),
      status, wrap, fb, el("div", { class: "btn-row" }, [showBtn, nextBtn]));

    const board = createBoard(wrap, {
      fen: p.fen, orientation: playerColor, interactive: false, promotion: "ask",
      onMove(move) {
        if (auto || solved) return;
        attempts++;
        if (board.game.isCheckmate()) {
          solved = true;
          if (attempts === 1 && !revealed) score++;
          board.setInteractive(false); board.feedback(true);
          CO.Feedback.show(fb, { ok: true, title: "將死！", text: move.san + " 是將死。" });
          showBtn.classList.add("hidden"); nextBtn.classList.remove("hidden");
        } else {
          board.undo(); board.feedback(false);
          CO.Feedback.show(fb, { ok: false, title: "這步沒有將死", text: "請再試一次。" + (attempts >= 2 ? "（卡住時可以按「看答案」。）" : "") });
        }
      }
    });
    // 對手先走第 1 步（停約 0.5 秒再走，有動畫）
    status.dataset.turn = "opp";
    const spd = CO.Speed.current();
    setTimeout(() => {
      auto = true;
      const om = board.play(parse(p.moves.split(" ")[0]), { duration: spd.anim });
      auto = false;
      board.setInteractive(playerColor);
      showBtn.disabled = false;
      status.textContent = CO.Speed.describeMove(om, "對手"); status.dataset.turn = "me";
    }, CO.Speed.pauseMs(spd));

    showBtn.addEventListener("click", () => {
      if (solved) return;
      revealed = true; solved = true;
      board.setInteractive(false);
      const mates = board.game.moves({ verbose: true }).filter(m => { const c = new Chess(board.game.fen()); c.move({ from: m.from, to: m.to, promotion: m.promotion }); return c.isCheckmate(); });
      board.setShapes(mates.map(m => ({ orig: m.from, dest: m.to, brush: "green" })));
      CO.Feedback.show(fb, { ok: false, title: "答案", text: "綠色箭頭是將死的走法。這題不計分。" });
      showBtn.classList.add("hidden"); nextBtn.classList.remove("hidden");
    });
    nextBtn.addEventListener("click", () => { index++; index < puzzles.length ? show() : result(); window.scrollTo(0, 0); });
  }

  function result() {
    const s = CO.State.recordResult(CO.State.loadState(), "mate1-" + level, score);
    CO.Activity.log("mini");
    const rec = s.records["mate1-" + level];
    stage.textContent = "";
    stage.append(
      el("div", { class: "card score-box" }, [
        el("div", { class: "muted", text: levelName(level) }),
        el("div", { class: "big", text: score + " / " + puzzles.length }),
        el("p", { text: score >= 13 ? "非常好，可以挑戰下一級！" : "多練習幾次，會越來越快。" }),
        el("p", { class: "muted", text: "最佳成績 " + rec.best + " / " + PER_LEVEL + "・已完成 " + rec.plays + " 次" })]),
      el("div", { class: "btn-row" }, [
        el("a", { class: "btn primary", href: "game-mate1.html?level=" + level, text: "再玩一次" }),
        level < 4 ? el("a", { class: "btn", href: "game-mate1.html?level=" + (level + 1), text: "下一級" }) : "",
        el("a", { class: "btn", href: "game-mate1.html", text: "選擇級別" })].filter(Boolean)));
  }
  show();
}

const lv = Number(qs("level", 0));
if (lv >= 1 && lv <= 4) play(lv); else pickLevel();
