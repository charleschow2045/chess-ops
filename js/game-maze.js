/* 騎士迷宮：用白馬吃掉所有星，馬不可以停在被黑棋攻擊的格（紅色）或黑棋所在的格。
 * 最少步數 par 由 BFS 計出（js/knight-maze.js）。 */
import { createRawBoard } from "./board.js";

const CO = window.ChessOps;
const { el, qs } = CO.Util;
const KM = CO.KnightMaze;
const LEVELS = CO.MazeLevels;
const stage = document.getElementById("stage");

const STAR_HTML = '<polygon points="50,10 61,38 91,38 67,56 76,86 50,68 24,86 33,56 9,38 39,38" fill="#e8bd4f" stroke="#7a5a10" stroke-width="4" stroke-linejoin="round"/>';
const RED_HTML = '<rect x="0" y="0" width="100" height="100" fill="rgba(224,60,40,0.32)"/>';

function levelSelect() {
  const rec = CO.State.loadState().records.maze;
  stage.textContent = "";
  stage.append(el("p", { class: "muted", text: "用白馬以最少步數吃掉所有星。馬不可以停在紅色的格（被黑棋攻擊）或黑棋所在的格。已通關到第 " + rec.best + " 關。" }));
  const grid = el("div", { class: "tile-grid" });
  LEVELS.forEach((lv, i) => {
    grid.append(el("a", { class: "tile", href: "game-maze.html?level=" + (i + 1) }, [
      el("b", { text: "第 " + (i + 1) + " 關" + (rec.best >= i + 1 ? " ✓" : "") }),
      el("span", { text: lv.stars.length + " 粒星・最少 " + lv.par + " 步" })]));
  });
  stage.append(grid);
}

function play(n) {
  const level = LEVELS[n - 1];
  const unsafe = KM.unsafeSquares(level);
  const att = KM.attackedSquares(level.black);
  let pos, got, moves, history;
  document.title = "騎士迷宮・第 " + n + " 關";

  const wrap = el("div");
  const fb = el("div", { "aria-live": "polite" });
  const info = el("div", { class: "meta-row" });
  const hintBtn = el("button", { class: "btn", type: "button", text: "提示" });
  const undoBtn = el("button", { class: "btn", type: "button", text: "悔一步" });
  const resetBtn = el("button", { class: "btn", type: "button", text: "重來" });
  const nextBtn = el("a", { class: "btn primary hidden", href: n < LEVELS.length ? "game-maze.html?level=" + (n + 1) : "game-maze.html", text: n < LEVELS.length ? "下一關 ›" : "返回選單" });
  stage.textContent = "";
  stage.append(el("div", { class: "q-text", text: "第 " + n + " 關：吃掉所有星（最少 " + level.par + " 步）" }), info, wrap, fb,
    el("div", { class: "btn-row" }, [hintBtn, undoBtn, resetBtn]), el("div", { class: "btn-row" }, [nextBtn]));

  function dests() {
    const d = new Map();
    if (got.size < level.stars.length) d.set(pos, KM.knightMoves(pos).filter(s => !unsafe[s]));
    return d;
  }
  function baseShapes() {
    const shapes = [];
    Object.keys(unsafe).forEach(s => { if (att[s] || unsafe[s]) shapes.push({ orig: s, customSvg: { html: RED_HTML, center: "orig" } }); });
    level.stars.forEach(s => { if (!got.has(s)) shapes.push({ orig: s, customSvg: { html: STAR_HTML, center: "orig" } }); });
    return shapes;
  }
  function refresh(extra) {
    cg.set({ turnColor: "white", movable: { color: "white", dests: dests(), showDests: true } });
    cg.setShapes(baseShapes().concat(extra || []));
    info.textContent = "";
    info.append(el("span", { class: "chip gold", text: "星 " + got.size + " / " + level.stars.length }), el("span", { class: "chip", text: "步數 " + moves + "（最少 " + level.par + "）" }));
    undoBtn.disabled = history.length === 0;
  }
  function reset() {
    pos = level.knight; got = new Set(); moves = 0; history = [];
    nextBtn.classList.add("hidden"); CO.Feedback.clear(fb);
    cg.set({ fen: KM.toFen(level), lastMove: undefined }); refresh();
  }
  function onAfter(from, to) {
    history.push({ pos, got: new Set(got), moves });
    pos = to; moves++;
    if (level.stars.indexOf(to) >= 0) got.add(to);
    if (got.size === level.stars.length) win(); else refresh();
  }
  function win() {
    refresh();
    cg.set({ movable: { color: undefined, dests: new Map() } });
    const best = moves <= level.par;
    const s = CO.State.recordResult(CO.State.loadState(), "maze", n);
    CO.Activity.log("mini");
    CO.Feedback.show(fb, { ok: true, title: best ? "完美！用了最少步數" : "過關！", text: "用了 " + moves + " 步（最少 " + level.par + " 步）。" + (best ? "" : "再試一次，看看能否減少步數。") + "已通關到第 " + s.records.maze.best + " 關。" });
    wrap.classList.remove("fb-ok"); CO.Feedback.flash(wrap, true);
    nextBtn.classList.remove("hidden");
  }

  const cg = createRawBoard(wrap, {
    fen: KM.toFen(level), orientation: "white", turnColor: "white",
    movable: { free: false, color: "white", dests: new Map(), showDests: true, events: { after: onAfter } },
    highlight: { lastMove: false, check: false }
  });
  reset();

  hintBtn.addEventListener("click", () => {
    if (got.size === level.stars.length) return;
    const sol = KM.solve({ knight: pos, stars: level.stars.filter(s => !got.has(s)), black: level.black });
    if (sol && sol.path.length > 1) { refresh([{ orig: sol.path[0], dest: sol.path[1], brush: "green" }]); }
  });
  undoBtn.addEventListener("click", () => {
    const h = history.pop(); if (!h) return;
    pos = h.pos; got = h.got; moves = h.moves;
    cg.set({ fen: KM.toFen(Object.assign({}, level, { knight: pos })), lastMove: undefined });
    CO.Feedback.clear(fb); nextBtn.classList.add("hidden");
    refresh();
  });
  resetBtn.addEventListener("click", reset);
}

const lv = Number(qs("level", 0));
if (lv >= 1 && lv <= LEVELS.length) play(lv); else levelSelect();
