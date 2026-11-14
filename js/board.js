/*
 * 正式棋盤元件：包住 Chessground ＋ chess.js（ES module）
 *
 *   import { createBoard } from "./board.js";
 *   const board = createBoard(el, { fen, orientation:"white", interactive:"turn", onMove(move){…} });
 *
 * 功能：點擊／拖拉走棋、最後一步高亮、合法步提示、將軍時王格高亮、升變選擇（4 款，可取消）、翻轉、
 *       座標 13px、拖拉時頁面唔捲動（blockTouchScroll＋touch-action:none）、箭咀同圈（setShapes）。
 *
 * options：
 *   fen            初始局面（預設開局）
 *   orientation    "white" | "black"
 *   interactive    "turn"（輪到邊方邊方走，預設）| "white" | "black" | false（唔俾走）
 *   promotion      "ask"（彈出視窗，預設）| "q" | "r" | "b" | "n"（自動升變，唔彈視窗）
 *   onMove(move)   走完一步之後呼叫（move 係 chess.js 嘅 Move 物件）。呼叫者可以用 board.load()／board.undo() 退回。
 *
 * 方法：load(fen,{lastMove}) play({from,to,promotion}) flip() setOrientation(c) setInteractive(m) undo() lock() unlock()
 *       setShapes(list) arrow(from,to,brush) circle(sq,brush) clearShapes() feedback(ok) destroy()
 *       屬性：game（chess.js 實例）、cg（Chessground API）、el
 *
 * 騎士迷宮等「唔係正常棋局」嘅頁面可以用 createRawBoard() 直接拿 Chessground。
 */
import { Chessground } from "../vendor/chessground/chessground.min.js";
import { Chess } from "../vendor/chess.js/chess.esm.js";
import "./ui-common.js";
import "./feedback.js";

const CO = window.ChessOps;
const COLOR = { w: "white", b: "black" };

/* 共用基本設定（座標、阻止捲動、高亮） */
function baseConfig() {
  return {
    coordinates: true,
    coordinatesOnSquares: true,
    blockTouchScroll: true,
    disableContextMenu: true,
    highlight: { lastMove: true, check: true },
    premovable: { enabled: false },
    animation: { enabled: true, duration: 180 },
    draggable: { enabled: true, showGhost: true, distance: 6 },
    selectable: { enabled: true }
  };
}

export function createRawBoard(el, extra = {}) {
  el.classList.add("board-wrap");
  const holder = document.createElement("div");
  el.appendChild(holder);
  return Chessground(holder, Object.assign(baseConfig(), extra));
}

export function createBoard(el, opts = {}) {
  const game = new Chess(opts.fen);
  let interactive = opts.interactive === undefined ? "turn" : opts.interactive;
  let lastMove;
  let locked = false;
  let shapes = [];
  const promotionMode = opts.promotion || "ask";

  function dests() {
    const m = new Map();
    const turn = COLOR[game.turn()];
    if (locked || interactive === false || (interactive !== "turn" && interactive !== turn)) return m;
    for (const mv of game.moves({ verbose: true })) {
      if (!m.has(mv.from)) m.set(mv.from, []);
      m.get(mv.from).push(mv.to);
    }
    return m;
  }
  function sync() {
    cg.set({
      fen: game.fen(),
      turnColor: COLOR[game.turn()],
      check: game.inCheck() ? COLOR[game.turn()] : false,
      lastMove,
      movable: { color: interactive === "turn" ? COLOR[game.turn()] : (interactive || undefined), dests: dests() }
    });
  }

  async function handleMove(orig, dest) {
    const cands = game.moves({ square: orig, verbose: true }).filter(m => m.to === dest);
    if (!cands.length) { sync(); return; }
    let promotion;
    if (cands.some(m => m.promotion)) {
      if (promotionMode === "ask") {
        locked = true;
        promotion = await CO.UI.askPromotion(game.turn());
        locked = false;
        if (!promotion) { sync(); return; }       // 取消升變：棋子彈返原位
      } else promotion = promotionMode;
    }
    const move = game.move({ from: orig, to: dest, promotion });
    lastMove = [orig, dest];
    sync();
    if (opts.onMove) opts.onMove(move);
  }

  const cg = createRawBoard(el, {
    fen: game.fen(),
    orientation: opts.orientation || "white",
    turnColor: COLOR[game.turn()],
    movable: { free: false, showDests: true, events: { after: handleMove } }
  });
  sync();

  const api = {
    game, cg, el,
    load(fen, o = {}) {
      game.load(fen);
      lastMove = o.lastMove;
      shapes = []; cg.setShapes([]);
      sync();
    },
    /* 程式走一步（例如電腦走棋）：會有動畫，並會呼叫 onMove */
    play(m) {
      const move = game.move({ from: m.from, to: m.to, promotion: m.promotion });
      lastMove = [m.from, m.to];
      sync();
      if (opts.onMove) opts.onMove(move);
      return move;
    },
    undo() {
      const m = game.undo();
      const h = game.history({ verbose: true });
      const l = h[h.length - 1];
      lastMove = l ? [l.from, l.to] : undefined;
      sync();
      return m;
    },
    flip() { cg.toggleOrientation(); },
    setOrientation(c) { cg.set({ orientation: c }); },
    setInteractive(mode) { interactive = mode; sync(); },
    lock() { locked = true; sync(); },
    unlock() { locked = false; sync(); },
    setShapes(list) { shapes = list ? list.slice() : []; cg.setShapes(shapes); },
    arrow(from, to, brush = "green") { shapes = [...shapes, { orig: from, dest: to, brush }]; cg.setShapes(shapes); },
    circle(sq, brush = "green") { shapes = [...shapes, { orig: sq, brush }]; cg.setShapes(shapes); },
    clearShapes() { shapes = []; cg.setShapes([]); },
    feedback(ok) { CO.Feedback.flash(el, ok); },
    destroy() { cg.destroy(); }
  };
  return api;
}
