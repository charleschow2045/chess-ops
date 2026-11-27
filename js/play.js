/*
 * 對電腦下棋（play.html）
 *  - 開局設定 → 對局（悔棋、提示、認輸、自動保存／繼續上一局）→ 結束（原因）→ 升級／降級提示 → 賽後檢討
 *  - 電腦出棋：js/pickmove.js（級別 1–8），經 js/engine-manager.js（自動重新載入、失敗退回隨機步）
 *  - 規則數字（悔棋／提示次數、升降級條件）同引擎設定喺 js/config.js
 */
import { createBoard } from "./board.js";
import { Chess } from "../vendor/chess.js/chess.esm.js";

const CO = window.ChessOps;
const { el } = CO.Util;
const PLG = CO.PlayLogic, RV = CO.ReviewLogic, CFG = CO.Config, ST = CO.State, Dialog = CO.Dialog;
const $ = id => document.getElementById(id);
const stage = $("stage"), engineBox = $("engine-box"), backLink = $("back");
const ENGINE_URL = "vendor/stockfish/stockfish-19-lite-single.js";
const PIECE = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen" };
const delay = ms => new Promise(r => setTimeout(r, ms));
const pad = n => String(n).padStart(2, "0");
const todayStr = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
const uciOf = m => m.from + m.to + (m.promotion || "");
const sideName = c => (c === "w" ? "白方" : "黑方");
const getS = () => ST.loadState();
function update(fn) { const s = ST.loadState(); fn(s); return ST.saveState(s); }
function sanOf(fen, u) { try { return new Chess(fen).move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san; } catch (e) { return u; } }

/* ---------- 引擎狀態顯示 ---------- */
const mgr = new CO.EngineManager(ENGINE_URL, onEngineStatus);
window.__chessopsMgr = mgr;                          // 供 tools/shots3.js 自動測試使用
function onEngineStatus(state, detail) {
  engineBox.textContent = "";
  if (state === "loading") {
    engineBox.append(el("div", { class: "card", style: "margin-bottom:12px" }, [
      el("div", { text: "引擎載入中…（首次需要下載約 1.8 MB，之後會快很多）" }),
      el("div", { class: "prog indet" }, [el("i")])]));
  } else if (state === "recovering") {
    engineBox.append(el("div", { class: "card", style: "margin-bottom:12px" }, [
      el("div", { text: "引擎沒有回應，正在重新載入…（第 " + detail + " 次）" }), el("div", { class: "prog indet" }, [el("i")])]));
  } else if (state === "failed") {
    engineBox.append(el("div", { class: "card", style: "margin-bottom:12px" }, [
      el("p", { text: "引擎暫時無法使用，電腦會改用隨機的合法走法，提示和檢討也暫時無法使用。" }),
      el("button", { class: "btn", type: "button", text: "重新載入引擎", onclick() { mgr.reset(); engineBox.textContent = ""; mgr.ensure().catch(() => {}); } })]));
  }
}

/* ---------- PGN 複製 ---------- */
async function copyPgn(pgn) {
  try { await navigator.clipboard.writeText(pgn); await Dialog.show({ title: "已複製 PGN", text: "可以貼到其他棋類程式或網站分析。", buttons: [{ key: "ok", label: "好", primary: true }] }); }
  catch (e) { await Dialog.show({ title: "請手動複製 PGN", text: "長按下面的文字全選後複製。", textarea: pgn, buttons: [{ key: "ok", label: "關閉", primary: true }] }); }
}

/* ======================= 開局設定 ======================= */
function showSetup() {
  backLink.href = "./"; backLink.textContent = "‹ 返回";
  stage.textContent = "";
  const s = getS();
  let level = s.playLevel, colorChoice = "random";
  mgr.ensure().catch(() => {});                       // 預先載入引擎，開局時就唔使等
  const info = el("p", { class: "muted", id: "lvl-info" });
  const levelBtns = [1, 2, 3, 4, 5, 6, 7, 8].map(n => el("button", { type: "button", "data-level": n, text: String(n), onclick() { level = n; paint(); } }));
  const colorBtns = [["w", "執白"], ["b", "執黑"], ["random", "隨機"]].map(([k, t]) => el("button", { type: "button", "data-color": k, text: t, onclick() { colorChoice = k; paint(); } }));
  function paint() {
    levelBtns.forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.level) === level)));
    colorBtns.forEach(b => b.setAttribute("aria-pressed", String(b.dataset.color === colorChoice)));
    const r = getS().play.levels[level];
    info.textContent = "第 " + level + " 級：勝 " + r.w + "・和 " + r.d + "・負 " + r.l + "。連贏 " + r.streak + " / " + CFG.PLAY.winsToLevelUp + " 局" + (level < CFG.PLAY.maxLevel ? "（連贏 " + CFG.PLAY.winsToLevelUp + " 局會自動升一級；用過悔棋或提示的勝局不計）" : "（最高級別）");
  }

  const cur = s.play.current;
  if (cur && cur.moves.length) {
    stage.append(el("div", { class: "card", id: "resume-card", style: "margin-bottom:14px" }, [
      el("b", { text: "有一局未完成" }),
      el("p", { class: "muted", text: "第 " + cur.level + " 級・你執" + (cur.color === "w" ? "白" : "黑") + "・已走 " + cur.moves.length + " 個半步" }),
      el("div", { class: "btn-row" }, [
        el("button", { class: "btn primary", id: "resume", type: "button", text: "繼續上一局", onclick: () => startGame(Object.assign({}, cur, { resume: true })) }),
        el("button", { class: "btn", type: "button", text: "放棄這局", async onclick() {
          const k = await Dialog.show({ title: "放棄這局？", text: "放棄後這局不會計入勝負。", buttons: [{ key: "yes", label: "放棄", danger: true }, { key: "no", label: "保留", primary: true }] });
          if (k === "yes") { update(x => { x.play.current = null; }); showSetup(); }
        } })])]));
  }
  stage.append(
    el("h2", { class: "section-title", text: "電腦級別（1 最易，8 最難）" }), el("div", { class: "seg" }, levelBtns), info,
    el("h2", { class: "section-title", text: "你執" }), el("div", { class: "seg three" }, colorBtns),
    el("div", { class: "btn-row" }, [el("button", { class: "btn primary", id: "start", type: "button", text: "開始對局", async onclick() {
      if (cur && cur.moves.length) {
        const k = await Dialog.show({ title: "開始新局？", text: "開始新局會放棄上一局未完成的對局。", buttons: [{ key: "yes", label: "開始新局", primary: true }, { key: "no", label: "取消" }] });
        if (k !== "yes") return;
      }
      startGame({ level, color: colorChoice === "random" ? (Math.random() < 0.5 ? "w" : "b") : colorChoice, moves: [] });
    } })]));
  paint();

  const recent = s.play.recent;
  stage.append(el("h2", { class: "section-title", text: "最近的對局（最多 " + CFG.PLAY.recentGames + " 局）" }));
  if (!recent.length) stage.append(el("p", { class: "muted", text: "完成的對局會顯示在這裡，可以複製 PGN 或賽後檢討。" }));
  recent.forEach((g, i) => {
    const res = g.result === "win" ? "勝" : g.result === "loss" ? "負" : "和";
    stage.append(el("div", { class: "recent-row", "data-i": i }, [
      el("div", { class: "info", text: g.date + "・第 " + g.level + " 級・執" + (g.color === "w" ? "白" : "黑") + "・" + res + "（" + (PLG.REASON_TEXT[g.reason] || "").split("：")[0] + "）・" + (g.blunders === null ? "未檢討" : "大錯 " + g.blunders + " 步") }),
      el("button", { class: "btn", type: "button", text: "複製 PGN", onclick: () => copyPgn(g.pgn) }),
      el("button", { class: "btn", type: "button", text: "檢討", onclick: () => reviewFromPgn(g, i) })]));
  });
}

function pgnToUcis(pgn) {
  const g = new Chess();
  g.loadPgn(pgn);
  return g.history({ verbose: true }).map(uciOf);
}
function reviewFromPgn(g, idx) {
  let ucis;
  try { ucis = pgnToUcis(g.pgn); } catch (e) { Dialog.show({ title: "無法讀取這局", text: "PGN 格式有問題。", buttons: [{ key: "ok", label: "好", primary: true }] }); return; }
  startReview({ ucis, color: g.color, level: g.level, idx, back: showSetup });
}

/* ======================= 對局 ======================= */
function startGame(init) {
  const G = Object.assign({ level: 3, color: "w", moves: [], undos: 0, hints: 0, usedUndo: false, usedHint: false }, init);
  G.over = false; G.thinking = false; G.busy = false; G.token = 0; G.lastText = null;   // lastText＝電腦上一步嘅文字（「電腦走了 Nf6（g8 → f6）」），玩家走下一步先清走
  update(s => { s.playLevel = G.level; });
  backLink.href = "play.html"; backLink.textContent = "‹ 離開";
  stage.textContent = "";
  mgr.ensure().catch(() => {});

  const oppCaps = el("div", { class: "cap-row cg-wrap" }), meCaps = el("div", { class: "cap-row cg-wrap" });
  const status = el("div", { class: "status-line", id: "status" });
  const wrap = el("div", { id: "board" });
  const fb = el("div", { "aria-live": "polite", id: "fb" }), endBox = el("div", { id: "end-box" });
  const movesBox = el("div", { class: "movelist-box", id: "moves" });
  const undoBtn = el("button", { class: "btn", id: "undo", type: "button", onclick: doUndo });
  const hintBtn = el("button", { class: "btn", id: "hint", type: "button", onclick: doHint });
  const btnRow = el("div", { class: "btn-row", id: "btn-row" });
  // 三問提醒（設定「對局中顯示三問提醒」，預設開）：只係提醒，唔幫玩家判斷；可以收起
  let remCollapsed = false;
  const remText = el("span", { class: "rtxt", text: "先想三問：對方想做甚麼？我有機會嗎？這步安全嗎？" });
  const remBtn = el("button", { class: "rbtn", id: "rem-toggle", type: "button", text: "收起", onclick() { remCollapsed = !remCollapsed; refresh(); } });
  // 提醒行：設定開啟就由開局起一直佔位（固定高度）；電腦思考／對局結束時變淡，唔收起，棋盤先唔會移位。設定關閉就完全唔出現。
  const useReminder = getS().settings.threeReminder;
  const reminder = el("div", { class: "reminder dim", id: "reminder" }, [remText, remBtn]);
  const resignBtn = el("button", { class: "btn danger", id: "resign", type: "button", text: "認輸", onclick: doResign });
  btnRow.append(undoBtn, hintBtn, resignBtn);
  stage.append(
    el("div", { class: "player-row" }, [el("span", { class: "who", text: "電腦" }), el("span", { class: "lvl-badge", text: "第 " + G.level + " 級" }), oppCaps]),
    status, ...(useReminder ? [reminder] : []), wrap,
    el("div", { class: "player-row" }, [el("span", { class: "who", text: "你（" + sideName(G.color) + "）" }), meCaps]),
    fb, endBox, btnRow, movesBox);

  const board = createBoard(wrap, {
    orientation: G.color === "w" ? "white" : "black", interactive: G.color === "w" ? "white" : "black", promotion: "ask",
    onMove(move) { afterMove(move); }
  });
  if (G.moves.length && !board.loadMoves(G.moves)) {
    update(s => { s.play.current = null; });
    Dialog.show({ title: "無法恢復上一局", text: "儲存的棋譜有問題，已放棄這局。", buttons: [{ key: "ok", label: "好", primary: true }] }).then(showSetup);
    return;
  }
  window.__chessopsPlay = { board: () => board, G: () => G, mgr };

  function history() { return board.game.history({ verbose: true }); }

  function saveCurrent() {
    update(s => {
      const moves = history().map(uciOf);
      s.play.current = G.over || !moves.length ? null : { level: G.level, color: G.color, moves, undos: G.undos, hints: G.hints, usedUndo: G.usedUndo, usedHint: G.usedHint };
    });
  }

  function renderCaps() {
    const mi = PLG.materialInfo(board.game);
    const mine = G.color === "w" ? mi.capturedByWhite : mi.capturedByBlack;       // 我吃掉的（對方顏色）
    const theirs = G.color === "w" ? mi.capturedByBlack : mi.capturedByWhite;     // 電腦吃掉的（我方顏色）
    const myDiff = G.color === "w" ? mi.diff : -mi.diff;
    const fill = (box, list, colorClass, diff) => {
      box.textContent = "";
      list.forEach(t => box.append(el("piece", { class: PIECE[t] + " " + colorClass })));
      if (diff > 0) box.append(el("span", { class: "cap-diff", text: "+" + diff }));
    };
    fill(meCaps, mine, G.color === "w" ? "black" : "white", myDiff);
    fill(oppCaps, theirs, G.color === "w" ? "white" : "black", -myDiff);
  }
  function renderMoves() {
    const h = board.game.history();
    movesBox.textContent = "";
    if (!h.length) { movesBox.textContent = "（未有棋步）"; return; }
    h.forEach((san, i) => {
      if (i % 2 === 0) movesBox.append(el("span", { class: "no", text: (i / 2 + 1) + "." }));
      movesBox.append(el("span", { class: "mv" + (i === h.length - 1 ? " cur" : ""), text: san }));
    });
    movesBox.scrollTop = movesBox.scrollHeight;
  }
  function refresh() {
    const g = board.game;
    renderCaps(); renderMoves();
    reminder.classList.toggle("dim", G.over || G.thinking || g.turn() !== G.color);
    remText.textContent = remCollapsed ? "三問提醒" : "先想三問：對方想做甚麼？我有機會嗎？這步安全嗎？";
    remBtn.textContent = remCollapsed ? "展開" : "收起";
    const myTurn = !G.over && !G.thinking && g.turn() === G.color;
    status.textContent = G.over ? "對局結束" : G.thinking ? "電腦思考中…" : myTurn ? (G.lastText || "輪到你（" + sideName(G.color) + "）" + (g.inCheck() ? "：你被將軍！" : "")) : "輪到電腦";
    status.dataset.turn = G.over ? "over" : myTurn ? "me" : "opp";       // 供自動測試判斷（狀態行文字會顯示電腦上一步，唔再固定係「輪到你」）
    undoBtn.textContent = "悔棋（剩 " + (CFG.PLAY.undoLimit - G.undos) + "）";
    hintBtn.textContent = G.busy ? "計算中…" : "提示（剩 " + (CFG.PLAY.hintLimit - G.hints) + "）";
    undoBtn.disabled = G.over || G.thinking || G.busy || !PLG.canUndo(g, G.color, G.undos);
    hintBtn.disabled = G.over || G.thinking || G.busy || !PLG.canHint(g, G.color, G.hints);
    resignBtn.disabled = G.over;
  }

  function afterMove(move) {
    if (G.over) return;
    G.lastText = move && move.color !== G.color ? CO.Speed.describeMove(move, "電腦") : null;
    board.clearShapes();
    const end = PLG.endState(board.game);
    if (end.over) { refresh(); finishGame(end); return; }
    saveCurrent(); refresh();
    if (board.game.turn() !== G.color) computerTurn();
  }

  async function computerTurn() {
    if (G.over || G.thinking) return;
    const my = ++G.token;
    G.thinking = true; board.lock(); refresh();
    const t0 = performance.now();
    let r = null;
    try { r = await CO.PickMove.pickMove(G.level, board.game, { Chess, engine: mgr }); } catch (e) { r = null; }
    const spd = CO.Speed.current(), pause = CO.Speed.pauseMs(spd);          // 電腦出棋速度（設定：慢／中／快）
    const rest = pause - (performance.now() - t0);
    if (rest > 0) await delay(rest);
    if (G.over || my !== G.token) return;
    G.thinking = false; board.unlock();
    if (r && r.source === "fallback") CO.Feedback.show(fb, { ok: false, title: "引擎暫時無法使用", text: "電腦這一步用了隨機的合法走法。" });
    if (r) board.play(r.move, { duration: spd.anim }); else refresh();
  }

  function doUndo() {
    if (!PLG.canUndo(board.game, G.color, G.undos)) return;
    G.token++;
    board.undo(); board.undo();
    G.undos++; G.usedUndo = true; G.lastText = null;
    board.clearShapes(); CO.Feedback.clear(fb);
    saveCurrent(); refresh();
  }

  async function doHint() {
    if (!PLG.canHint(board.game, G.color, G.hints) || G.thinking || G.busy) return;
    G.busy = true; board.lock(); refresh();
    try {
      const r = await mgr.run(board.game.fen(), CFG.HINT);             // 用 Stockfish 全力設定（唔係對手嘅弱化設定）
      G.hints++; G.usedHint = true;
      const san = sanOf(board.game.fen(), r.uci);
      board.setShapes([{ orig: r.uci.slice(0, 2), dest: r.uci.slice(2, 4), brush: "green" }]);
      CO.Feedback.show(fb, { ok: true, title: "提示 " + G.hints + " / " + CFG.PLAY.hintLimit, text: "建議走 " + san + "（綠色箭頭）。" });
    } catch (e) {
      CO.Feedback.show(fb, { ok: false, title: "提示暫時無法使用", text: "引擎沒有回應，這次不會扣除提示次數。" });
    }
    G.busy = false; board.unlock(); saveCurrent(); refresh();
  }

  async function doResign() {
    if (G.over) return;
    const k = await Dialog.show({ title: "確定要認輸嗎？", text: "認輸會算作這局落敗。", buttons: [{ key: "yes", label: "認輸", danger: true }, { key: "no", label: "繼續下棋", primary: true }] });
    if (k === "yes" && !G.over) finishGame({ over: true, result: G.color === "w" ? "b" : "w", reason: "resign", text: PLG.REASON_TEXT.resign });
  }

  function endDetail(end, outcome, clean) {
    let t;
    if (end.reason === "checkmate") t = outcome === "win" ? "將死 Checkmate：你將死了電腦。" : "將死 Checkmate：你被電腦將死了。";
    else if (end.reason === "resign") t = "你認輸了。";
    else t = PLG.REASON_TEXT[end.reason] + "。";
    if (outcome === "win" && !clean) t += "（這局用過悔棋或提示，不計入「連贏」。）";
    return t;
  }

  async function finishGame(end) {
    if (G.over) return;
    G.over = true; G.token++; G.thinking = false;
    board.setInteractive(false); board.clearShapes(); btnRow.classList.add("hidden");
    const ucis = history().map(uciOf);
    const outcome = PLG.outcomeFor(end.result, G.color);
    const clean = !G.usedUndo && !G.usedHint;
    let pgn = "";
    try { pgn = PLG.buildPgn(Chess, ucis, { playerColor: G.color, level: G.level, result: end.result, date: todayStr(), reason: end.reason }); } catch (e) { pgn = ""; }
    let prog;
    update(s => {
      prog = PLG.applyResult(s.play.levels, G.level, outcome, clean);
      s.play.levels = prog.levels; s.play.current = null;
      s.play.recent.unshift({ date: todayStr(), level: G.level, color: G.color, result: outcome, reason: end.reason, pgn, blunders: null, plies: ucis.length });
      s.play.recent = s.play.recent.slice(0, CFG.PLAY.recentGames);
      if (prog.levelUp) s.playLevel = prog.newLevel;
    });
    CO.Activity.log("play", { result: outcome });
    refresh(); board.feedback(outcome === "win");
    CO.Feedback.show(fb, { ok: outcome === "win", title: outcome === "win" ? "你贏了！" : outcome === "loss" ? "你輸了" : "和棋", text: endDetail(end, outcome, clean) });
    endBox.textContent = "";
    endBox.append(el("div", { class: "btn-row" }, [
      el("button", { class: "btn primary", id: "review", type: "button", text: "檢討", onclick: () => startReview({ ucis, color: G.color, level: G.level, idx: 0, back: showSetup }) }),
      el("button", { class: "btn", id: "again", type: "button", text: "再玩一局", onclick: () => startGame({ level: getS().playLevel, color: G.color, moves: [] }) }),
      el("button", { class: "btn", type: "button", text: "複製 PGN", onclick: () => copyPgn(pgn) }),
      el("a", { class: "btn", href: "./", text: "返回首頁" })]));
    window.__chessopsPlay.lastEnd = { outcome, prog };
    if (prog.levelUp) {
      await Dialog.show({ big: "↑ " + prog.newLevel, title: "恭喜升級！", text: "你在第 " + G.level + " 級連贏了 " + CFG.PLAY.winsToLevelUp + " 局，升到第 " + prog.newLevel + " 級。", buttons: [{ key: "ok", label: "繼續", primary: true }] });
    } else if (prog.offerDrop) {
      const k = await Dialog.show({ title: "要不要降一級？", text: "你在第 " + G.level + " 級已經連輸 " + CFG.PLAY.lossesToOfferDrop + " 局。可以降到第 " + (G.level - 1) + " 級再練習，也可以保持目前級別。", buttons: [{ key: "drop", label: "降到第 " + (G.level - 1) + " 級", primary: true }, { key: "stay", label: "保持第 " + G.level + " 級" }] });
      if (k === "drop") update(s => { s.playLevel = G.level - 1; });
      else update(s => { s.play.levels = PLG.declineDrop(s.play.levels, G.level); });
    }
  }

  refresh();
  if (board.game.turn() !== G.color && !G.over) computerTurn();                  // 電腦先走，或者繼續上一局時輪到電腦
}

/* ======================= 賽後檢討 ======================= */
async function startReview(info) {
  const back = info.backToEnd || info.back || showSetup;
  let cancelled = false;
  stage.textContent = "";
  backLink.href = "play.html"; backLink.textContent = "‹ 離開";
  const bar = el("i"), label = el("p", { id: "rv-label", text: "準備分析…" });
  stage.append(el("div", { class: "card" }, [
    el("h2", { style: "margin:0 0 8px;font-size:20px", text: "賽後檢討" }),
    el("p", { class: "muted", text: "逐步分析你的每一步，需要一點時間，可以隨時取消。" }),
    label, el("div", { class: "prog" }, [bar]),
    el("button", { class: "btn", id: "rv-cancel", type: "button", text: "取消", onclick() { cancelled = true; mgr.stop(); back(); } })]));

  const analyze = async fen => {
    if (cancelled) throw new Error("cancel");
    const r = await mgr.run(fen, { movetime: CFG.REVIEW.maxMsPerMove, depth: CFG.REVIEW.maxDepth });
    return { cp: r.info.cp, mate: r.info.mate, best: r.uci };
  };
  let res;
  try {
    res = await RV.reviewGame(Chess, info.ucis, info.color, analyze, {
      onProgress(d, t) { label.textContent = "分析中：第 " + d + " / " + t + " 步"; bar.style.width = (d / t * 100) + "%"; },
      shouldCancel: () => cancelled
    });
  } catch (e) {
    if (cancelled) return;
    stage.textContent = "";
    stage.append(el("div", { class: "card" }, [el("p", { text: "引擎暫時無法使用，無法檢討這局。請稍後再試。" }), el("button", { class: "btn", type: "button", text: "返回", onclick: back })]));
    return;
  }
  if (cancelled || res.cancelled) return;
  update(s => { if (s.play.recent[info.idx]) s.play.recent[info.idx].blunders = res.summary.counts.blunder; });
  showReviewResult(info, res, back);
}

function lossText(loss) { return loss >= CFG.REVIEW.MATE_CP ? "涉及將死" : "損失約 " + (loss / 100).toFixed(1) + " 兵"; }

function showReviewResult(info, res, back) {
  stage.textContent = "";
  const items = res.moves.filter(m => m.cls === "blunder" || m.cls === "mistake");
  stage.append(el("div", { class: "card", id: "rv-summary" }, [
    el("h2", { style: "margin:0 0 8px;font-size:20px", text: "檢討結果" }),
    el("p", { text: res.summary.text }),
    el("p", { class: "muted", text: "大錯 " + res.summary.counts.blunder + "・錯著 " + res.summary.counts.mistake + "・疑問手 " + res.summary.counts.inaccuracy + "（只計算你自己的步）" })]));
  if (items.length) stage.append(el("h2", { class: "section-title", text: "大錯和錯著（點選任一項可查看局面）" }));
  items.forEach((m, i) => stage.append(el("button", { class: "rev-item " + m.cls, type: "button", "data-i": i, onclick: () => showReviewPosition(info, res, items, i, back) }, [
    el("b", { text: "第 " + m.moveNo + " 步・" + RV.CLASS_NAME[m.cls] }),
    el("span", { text: "你走了 " + m.san + (m.bestSan ? "，較好的走法是 " + m.bestSan : "") + "。" + lossText(m.lossCp) + "。" })])));
  stage.append(el("div", { class: "btn-row" }, [el("button", { class: "btn primary", id: "rv-back", type: "button", text: "返回", onclick: back })]));
}

function showReviewPosition(info, res, items, i, back) {
  const m = items[i];
  stage.textContent = "";
  const wrap = el("div", { id: "board" });
  const reasonLine = m.reason ? "原因：" + RV.REASON_TEXT[m.reason] + "。" : "";
  stage.append(
    el("div", { class: "q-text", text: "第 " + m.moveNo + " 步：你走了 " + m.san + "（" + RV.CLASS_NAME[m.cls] + "）" }), wrap,
    el("div", { class: "card", id: "rv-pos-text" }, [
      el("p", { style: "margin:0 0 6px", text: (m.bestSan ? "較好的走法：" + m.bestSan + "（綠色箭頭）。" : "") + "你走的是紅色箭頭。" + lossText(m.lossCp) + "。" }),
      reasonLine ? el("p", { style: "margin:0", text: reasonLine }) : ""].filter(Boolean)),
    el("div", { class: "btn-row" }, [
      el("button", { class: "btn", type: "button", text: "‹ 上一個", disabled: i === 0, onclick: () => showReviewPosition(info, res, items, i - 1, back) }),
      el("button", { class: "btn", type: "button", text: "下一個 ›", disabled: i === items.length - 1, onclick: () => showReviewPosition(info, res, items, i + 1, back) }),
      el("button", { class: "btn primary", id: "rv-list", type: "button", text: "返回清單", onclick: () => showReviewResult(info, res, back) })]));
  const board = createBoard(wrap, { fen: m.fenBefore, orientation: info.color === "w" ? "white" : "black", interactive: false });
  const shapes = [];
  if (m.bestUci) shapes.push({ orig: m.bestUci.slice(0, 2), dest: m.bestUci.slice(2, 4), brush: "green" });
  shapes.push({ orig: m.uci.slice(0, 2), dest: m.uci.slice(2, 4), brush: "red" });
  board.setShapes(shapes);
  window.__chessopsReview = { board };
}

showSetup();
