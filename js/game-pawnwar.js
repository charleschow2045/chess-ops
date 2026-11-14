/* 兵仗：雙方只有王和 8 隻兵。兵先走到對方底線即勝；也可以將死；逼和／其他和棋則和局。
 * 對電腦（第 1–4 級，用 pickMove；玩家執白）或兩人同一部 iPad 對戰。 */
import { createBoard } from "./board.js";
import { Chess } from "../vendor/chess.js/chess.esm.js";

const CO = window.ChessOps;
const { el } = CO.Util;
const PW = CO.PawnWar;
const stage = document.getElementById("stage");

let mode = "computer", level = 2, autoFlip = false;
let engine = null, board = null, over = false, thinking = false;

function setup() {
  stage.textContent = "";
  const modeBtns = [
    el("button", { class: "opt", type: "button", "data-mode": "computer", text: "對電腦（你執白）" }),
    el("button", { class: "opt", type: "button", "data-mode": "two", text: "兩人同一部 iPad 對戰" })];
  const lvBtns = [1, 2, 3, 4].map(n => el("button", { class: "opt", type: "button", "data-level": n, text: "第 " + n + " 級" }));
  const flipChk = el("input", { type: "checkbox", id: "autoflip", style: "width:24px;height:24px" });
  const flipRow = el("label", { class: "muted", style: "display:flex;align-items:center;gap:10px;font-size:16px;color:var(--text)" }, [flipChk, "每一步之後自動翻轉棋盤（兩人對戰）"]);
  const lvBox = el("div", { class: "opt-list two" }, lvBtns);
  function paint() {
    modeBtns.forEach(b => b.classList.toggle("right", b.dataset.mode === mode));
    lvBtns.forEach(b => b.classList.toggle("right", Number(b.dataset.level) === level));
    lvBox.classList.toggle("hidden", mode !== "computer");
    flipRow.classList.toggle("hidden", mode !== "two");
  }
  modeBtns.forEach(b => b.addEventListener("click", () => { mode = b.dataset.mode; paint(); }));
  lvBtns.forEach(b => b.addEventListener("click", () => { level = Number(b.dataset.level); paint(); }));
  flipChk.addEventListener("change", () => { autoFlip = flipChk.checked; });
  stage.append(
    el("details", { class: "card", open: true }, [
      el("summary", { style: "font-weight:800;font-size:18px;cursor:pointer;min-height:44px", text: "規則" }),
      el("ol", {}, [
        el("li", { text: "雙方只有王和 8 隻兵，擺在起始位置，白方先走。" }),
        el("li", { text: "任何一隻兵走到對方底線，即時獲勝（不需要升變）。" }),
        el("li", { text: "將死對方王，獲勝。" }),
        el("li", { text: "輪到走棋的一方沒有合法步又沒有被將軍（逼和），或出現三次重複等和棋規則，則為和棋。" }),
        el("li", { text: "其餘走法照正常規則：兵直走、斜吃，可以吃過路兵；王不可以走到被攻擊的格。" })])]),
    el("h2", { class: "section-title", text: "對手" }),
    el("div", { class: "opt-list two" }, modeBtns), lvBox, flipRow,
    el("div", { class: "btn-row" }, [el("button", { class: "btn primary", type: "button", text: "開始對局", onclick: start })]));
  paint();
}

async function start() {
  over = false; thinking = false;
  stage.textContent = "";
  const status = el("div", { class: "status-line" });
  const fb = el("div", { "aria-live": "polite" });
  const wrap = el("div");
  const log = el("div", { class: "moves" });
  stage.append(status, wrap, fb, log,
    el("div", { class: "btn-row" }, [
      el("button", { class: "btn", type: "button", text: "翻轉棋盤", onclick() { board.flip(); } }),
      el("button", { class: "btn", type: "button", text: "重新開始", onclick: start }),
      el("a", { class: "btn", href: "game-pawnwar.html", text: "更改設定" })]));

  function paintStatus() {
    const turn = board.game.turn() === "w" ? "白方" : "黑方";
    status.textContent = over ? "對局結束" : thinking ? "電腦思考中…" : (mode === "computer" ? (board.game.turn() === "w" ? "輪到你（白方）" : "輪到電腦（黑方）") : "輪到" + turn);
    log.textContent = CO.UI.movesText(board.game.history());
  }

  if (mode === "computer" && !engine) {
    status.textContent = "電腦載入中…";
    try {
      engine = new CO.Engine("vendor/stockfish/stockfish-19-lite-single.js");
      await engine.init();
    } catch (e) {
      engine = null;      // 載入失敗：電腦改用隨機走法（pickMove 會自動退回）
      CO.Feedback.show(fb, { ok: false, title: "引擎載入失敗", text: "電腦會用隨機走法應戰。" });
    }
  }

  function end(st) {
    over = true; board.setInteractive(false);
    let ok = true, title, text = PW.REASON_TEXT[st.reason] + "。";
    if (st.winner === null) { title = "和棋"; ok = false; }
    else if (mode === "computer") { ok = st.winner === "w"; title = ok ? "你贏了！" : "電腦贏了"; }
    else { title = (st.winner === "w" ? "白方" : "黑方") + "獲勝！"; }
    CO.Feedback.show(fb, { ok, title, text });
    board.feedback(ok);
    if (mode === "computer") {
      const s = CO.State.recordResult(CO.State.loadState(), "pawnwar", st.winner === "w" ? level : 0);
      text += "（最高打贏第 " + s.records.pawnwar.best + " 級）";
      CO.Feedback.show(fb, { ok, title, text });
    }
    paintStatus();
  }

  async function computerTurn() {
    const mine = board;                               // 中途按「重新開始」時，舊對局的電腦步不可以落到新棋盤
    thinking = true; board.lock(); paintStatus();
    const t0 = performance.now();
    let r = null;
    try { r = await CO.PickMove.pickMove(level, board.game, { Chess, engine }); } catch (e) { r = null; }
    const wait = Math.max(0, 500 - (performance.now() - t0));      // 最少停 0.5 秒，避免電腦走得太突然
    await new Promise(res => setTimeout(res, wait));
    if (board !== mine) return;
    thinking = false; board.unlock();
    if (over) return;
    if (r) board.play(r.move);
  }

  board = createBoard(wrap, {
    fen: PW.START_FEN, orientation: "white", interactive: mode === "computer" ? "white" : "turn", promotion: "q",
    onMove(move) {
      const st = PW.status(board.game, move);
      paintStatus();
      if (st.over) { end(st); return; }
      if (mode === "computer") { if (move.color === "w") computerTurn(); }
      else if (autoFlip) board.setOrientation(board.game.turn() === "w" ? "white" : "black");
    }
  });
  paintStatus();
}

setup();
