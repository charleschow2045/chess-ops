/*
 * 正式棋盤元件：包住 Chessground ＋ chess.js（ES module）
 *
 *   import { createBoard } from "./board.js";
 *   const board = createBoard(el, { fen, orientation:"white", interactive:"turn", onMove(move){…} });
 *
 * 功能：點擊／拖拉走棋、最後一步高亮、合法步提示、將軍時王格高亮、升變選擇（4 款，可取消）、翻轉、
 *       座標 13px、拖拉時頁面唔捲動（blockTouchScroll＋touch-action:none）、箭頭同圈（setShapes）。
 *
 * options：
 *   fen            初始局面（預設開局）
 *   orientation    "white" | "black"
 *   interactive    "turn"（輪到邊方邊方走，預設）| "white" | "black" | false（唔俾走）
 *   promotion      "ask"（彈出視窗，預設）| "q" | "r" | "b" | "n"（自動升變，唔彈視窗）
 *   viewOnly       true = 只供觀看（唔綁定操作／觸控事件，頁面自己處理點擊）
 *   onMove(move)   走完一步之後呼叫（move 係 chess.js 嘅 Move 物件）。呼叫者可以用 board.load()／board.undo() 退回。
 *
 * 方法：load(fen,{lastMove}) loadMoves(ucis) play({from,to,promotion},{duration}) flip() setOrientation(c) setInteractive(m) undo() lock() unlock()
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

const DEFAULT_ANIM = 180;                         // 玩家自己走棋嘅動畫（毫秒）

/* 共用基本設定（阻止捲動、高亮；showNames = 設定「顯示格名」，開咗先喺每格印 e4 這類名稱） */
function baseConfig(showNames) {
  return {
    coordinates: showNames,
    coordinatesOnSquares: showNames,
    blockTouchScroll: true,
    disableContextMenu: true,
    highlight: { lastMove: true, check: true },
    premovable: { enabled: false },
    animation: { enabled: true, duration: DEFAULT_ANIM },
    draggable: { enabled: true, showGhost: true, distance: 6 },
    selectable: { enabled: true }
  };
}

function squareNamesSetting() {
  try { return !!(CO.State && CO.State.loadState().settings.squareNames); } catch (e) { return false; }
}

/* 棋盤邊座標：左邊 1–8、下面 a–h（小寫，14px）；翻轉時要更新 */
function edgeLabels(ranksEl, filesEl, orientation) {
  const white = orientation !== "black";
  const r = white ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const f = white ? "abcdefgh" : "hgfedcba";
  ranksEl.textContent = ""; filesEl.textContent = "";
  r.forEach(n => { const s = document.createElement("span"); s.textContent = String(n); ranksEl.appendChild(s); });
  f.split("").forEach(c => { const s = document.createElement("span"); s.textContent = c; filesEl.appendChild(s); });
}

export function createRawBoard(el, extra = {}) {
  el.classList.add("board-wrap");
  const ranks = document.createElement("div"); ranks.className = "bf-ranks";
  const holder = document.createElement("div"); holder.className = "bf-board";
  const files = document.createElement("div"); files.className = "bf-files";
  el.append(ranks, holder, files);
  edgeLabels(ranks, files, extra.orientation);
  const cg = Chessground(holder, Object.assign(baseConfig(squareNamesSetting()), extra));
  cg.setEdgeLabels = (orientation) => edgeLabels(ranks, files, orientation);
  // Chessground 會快取棋盤位置；頁面上方嘅內容改變（例如引擎載入提示消失）會令棋盤移位，快取就會過期，點擊錯位。
  // 每次按下／觸碰棋盤前先清走快取（捕獲階段，早過 Chessground 自己嘅處理）。
  const refreshBounds = () => { try { cg.state.dom.bounds.clear(); } catch (e) { /* 忽略 */ } };
  ["mousedown", "touchstart"].forEach(t => el.addEventListener(t, refreshBounds, true));
  return cg;
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
    cg.setShapes(shapes);                       // cg.set() 會清走箭頭，所以每次同步後重新畫返
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
    viewOnly: !!opts.viewOnly,                    // 只供觀看（例如走棋前三問要自己處理點擊）：唔綁定任何棋子操作／觸控事件
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
    /* 由開局載入一串 uci 步（保留棋譜，俾悔棋同 PGN 用）；有不合法步就回傳 false */
    loadMoves(ucis) {
      game.reset();
      let last;
      for (const u of ucis) {
        try { game.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch (e) { return false; }
        last = [u.slice(0, 2), u.slice(2, 4)];
      }
      lastMove = last; shapes = []; cg.setShapes([]);
      sync();
      return true;
    },
    /* 程式走一步（例如電腦走棋）：會有動畫，並會呼叫 onMove。o.duration＝呢一步嘅動畫毫秒（電腦出棋速度設定）；玩家自己走嘅動畫保持預設 180ms */
    play(m, o) {
      const move = game.move({ from: m.from, to: m.to, promotion: m.promotion });
      lastMove = [m.from, m.to];
      if (o && o.duration) cg.set({ animation: { duration: o.duration } });
      sync();
      if (o && o.duration) cg.set({ animation: { duration: DEFAULT_ANIM } });     // 動畫喺開始時已經讀取咗時間，之後立即還原
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
    flip() { cg.toggleOrientation(); cg.setEdgeLabels(cg.state.orientation); },
    setOrientation(c) { cg.set({ orientation: c }); cg.setEdgeLabels(c); },
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
