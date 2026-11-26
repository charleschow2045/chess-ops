/*
 * 殘局訓練（endgames.html）
 *  - 課題清單 → 說明卡（書面語 3–5 步）→ 局面清單（由易到難）→ 練習
 *  - 殺王課題（后、車、雙車）：白方要喺步數上限內將死黑王；王兵對王：「贏」＝兵升變為后，而且之後 Stockfish 仍然判斷白方贏；
 *    「判斷」＝選「白方能贏」或「只能和棋」。
 *  - 黑方（電腦）＝Stockfish 全力（config.ENDGAME.DEFENDER）；提示每次練習最多 3 次（config.ENDGAME.HINT_LIMIT），畫出引擎建議嘅箭頭。
 *  - 每一步之後用 js/endgames-logic.js 判斷：成功／失敗（逼和、棋子被吃、局面重複、超過步數上限）／升變（交俾引擎判斷）。
 *  資料 data/endgames.js 由 tools/build-endgames.js 產生，每個局面已用殘局庫同 Stockfish 驗證（見 docs/stage5-content.md）。
 */
import { createBoard } from "./board.js";
import { Chess } from "../vendor/chess.js/chess.esm.js";

const CO = window.ChessOps;
const { el } = CO.Util;
const EL = CO.EndgamesLogic, CFG = CO.Config.ENDGAME, DATA = CO.Endgames.TOPICS;
const $ = id => document.getElementById(id);
const stage = $("stage"), engineBox = $("engine-box"), backLink = $("back");
const ENGINE_URL = "vendor/stockfish/stockfish-19-lite-single.js";
const delay = ms => new Promise(r => setTimeout(r, ms));
const getS = () => CO.State.loadState();
function update(fn) { const s = CO.State.loadState(); fn(s); return CO.State.saveState(s); }
const uciOf = m => m.from + m.to + (m.promotion || "");
function sanOf(fen, u) { try { return new Chess(fen).move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san; } catch (e) { return u; } }

const mgr = new CO.EngineManager(ENGINE_URL, onEngineStatus);
window.__chessopsMgr = mgr;                          // 供 tools/shots5.js 自動測試使用
function onEngineStatus(state, detail) {
  engineBox.textContent = "";
  if (state === "loading") engineBox.append(el("div", { class: "card", style: "margin-bottom:12px" }, [el("div", { text: "引擎載入中…（首次需要下載約 1.8 MB，之後會快很多）" }), el("div", { class: "prog indet" }, [el("i")])]));
  else if (state === "recovering") engineBox.append(el("div", { class: "card", style: "margin-bottom:12px" }, [el("div", { text: "引擎沒有回應，正在重新載入…（第 " + detail + " 次）" }), el("div", { class: "prog indet" }, [el("i")])]));
  else if (state === "failed") engineBox.append(el("div", { class: "card", style: "margin-bottom:12px" }, [el("p", { text: "引擎暫時無法使用，黑方無法走棋，提示也暫時無法使用。" }), el("button", { class: "btn", type: "button", text: "重新載入引擎", onclick() { mgr.reset(); engineBox.textContent = ""; mgr.ensure().catch(() => {}); } })]));
}

/* 離開／重新開始練習時，停止上一次練習（引擎回應遲到都唔會再影響畫面或者紀錄） */
let cur = null;
function leave() { if (cur) { cur.over = true; cur.token++; cur = null; } }

const starsText = n => "★".repeat(n) + "☆".repeat(3 - n);
function starsEl(n) { return el("span", { class: "stars", "aria-label": n + " 星", text: starsText(n) }); }
const posStars = id => (getS().endgames.pos[id] || {}).stars | 0;
const topicStars = t => t.positions.reduce((a, p) => a + posStars(p.id), 0);
const taskText = (p) => p.task === "judge" ? "判斷：這局面能贏嗎？" : p.task === "promote" ? "白方贏：把兵升變為后" : "白方先走，將死黑方";

/* ======================= 課題清單 ======================= */
function home() {
  leave();
  backLink.href = "./"; backLink.textContent = "‹ 返回";
  stage.textContent = "";
  const tot = EL.totals(DATA, getS().endgames);
  stage.append(
    el("div", { class: "card score-box" }, [
      el("div", { class: "muted", text: "已取得的星星" }),
      el("div", { class: "big", id: "star-total", text: tot.got + " / " + tot.all + " ★" }),
      el("p", { class: "muted", text: "先看說明，再練習。黑方是全力防守的 Stockfish，不會讓你輕易將死。" })]),
    el("h2", { class: "section-title", text: "選擇課題" }),
    el("div", { class: "tile-grid" }, DATA.map(t => el("button", { class: "tile", type: "button", "data-topic": t.id, style: "text-align:left;color:inherit;font:inherit;cursor:pointer", onclick: () => topic(t) }, [
      el("b", { text: t.title }), el("span", { text: t.sub }),
      el("div", { class: "rec", text: topicStars(t) + " / " + t.positions.length * 3 + " ★・" + t.positions.length + " 題" })]))));
}

/* ======================= 說明卡＋局面清單 ======================= */
function topic(t) {
  leave();
  backLink.href = "endgames.html"; backLink.textContent = "‹ 殘局";
  stage.textContent = "";
  stage.append(
    el("div", { class: "card", id: "explain" }, [
      el("b", { style: "font-size:18px", text: t.title + "：怎樣做？" }),
      el("ol", { class: "steps", style: "margin:10px 0 0;padding-left:22px;line-height:1.7;font-size:16px" }, t.steps.map(s => el("li", { text: s })))]),
    el("h2", { class: "section-title", text: "練習（由易到難）" }),
    el("div", { class: "tile-grid" }, t.positions.map((p, i) => {
      const e = getS().endgames.pos[p.id] || {};
      const rec = e.wins ? "最少 " + (e.best ? e.best + " 步" : "已答對") : e.runs ? "嘗試 " + e.runs + " 次" : "尚未練習";
      return el("button", { class: "tile", type: "button", "data-pos": p.id, style: "text-align:left;color:inherit;font:inherit;cursor:pointer", onclick: () => practice(t, p) }, [
        el("b", { text: "第 " + (i + 1) + " 題" }), el("span", { text: taskText(p) + (p.task === "judge" ? "" : "・上限 " + p.cap + " 步") }),
        el("div", { class: "rec" }, [starsEl(e.stars | 0), el("span", { style: "display:inline;margin-left:8px;color:var(--muted)", text: rec })])]);
    })));
}

/* ======================= 練習 ======================= */
function practice(t, p) {
  leave();
  if (p.task === "judge") return judgeQ(t, p);
  backLink.href = "endgames.html"; backLink.textContent = "‹ 殘局";
  mgr.ensure().catch(() => {});
  stage.textContent = "";
  const idx = t.positions.indexOf(p);
  const G = { moves: 0, hints: 0, over: false, busy: false, token: 0 };
  cur = G;
  const startMaterial = EL.whiteMaterial(new Chess(p.fen));
  const wrap = el("div", { id: "board" }), fb = el("div", { id: "fb", "aria-live": "polite" }), endBox = el("div", { id: "end-box" });
  const status = el("div", { class: "status-line", id: "status" });
  const info = el("div", { class: "meta-row" });
  const hintBtn = el("button", { class: "btn", id: "hint", type: "button", onclick: doHint });
  const restartBtn = el("button", { class: "btn", id: "restart", type: "button", text: "重新開始", onclick: () => practice(t, p) });
  stage.append(
    el("div", { class: "meta-row" }, [el("span", { class: "q-prog", text: t.title + "・第 " + (idx + 1) + " 題" }), starsEl(posStars(p.id))]),
    el("p", { class: "muted", id: "goal", text: p.task === "promote"
      ? "目標：" + p.cap + " 步內把兵升變為后，而且升變後仍然是白方贏。不用提示並在 " + (p.shortest + CFG.STAR3_EXTRA) + " 步內完成可得 3 星。"
      : "目標：" + p.cap + " 步內將死黑王（引擎最短 " + p.shortest + " 步）。不用提示並在 " + (p.shortest + CFG.STAR3_EXTRA) + " 步內完成可得 3 星。" }),
    info, status, wrap, fb, endBox, el("div", { class: "btn-row", id: "btn-row" }, [hintBtn, restartBtn]));

  const board = createBoard(wrap, { fen: p.fen, orientation: "white", interactive: "white", promotion: "q", onMove: afterMove });
  window.__chessopsEg = { board: () => board, G: () => G, p };

  function refresh() {
    info.textContent = "";
    info.append(el("span", { class: "chip", id: "moves", text: "步數 " + G.moves + " / " + p.cap }), el("span", { class: "chip gold", id: "hints", text: "提示 " + G.hints + " / " + CFG.HINT_LIMIT }));
    status.textContent = G.over ? "練習結束" : G.busy ? "電腦思考中…" : "輪到你（白方）";
    hintBtn.textContent = G.busy ? "計算中…" : "提示（剩 " + (CFG.HINT_LIMIT - G.hints) + "）";
    hintBtn.disabled = G.over || G.busy || G.hints >= CFG.HINT_LIMIT;
  }

  function end(ok, title, text, moves) {
    G.over = true; G.token++; G.busy = false;
    board.setInteractive(false); board.clearShapes();
    const st = ok ? EL.stars({ success: true, hints: G.hints, moves, shortest: p.shortest }) : 0;
    const before = posStars(p.id);
    update(s => { s.endgames.pos[p.id] = EL.applyRun(s.endgames.pos[p.id], { success: ok, stars: st, moves: ok ? moves : 0 }); });
    CO.Activity.log("mini"); CO.Activity.log("eg", { gain: posStars(p.id) - before });
    board.feedback(ok);
    refresh(); hintBtn.disabled = true;
    CO.Feedback.show(fb, { ok, title, text });
    endBox.textContent = "";
    const next = t.positions[idx + 1];
    endBox.append(...[
      ok ? el("div", { class: "card score-box", id: "result" }, [el("div", { class: "muted", text: "這次得到" }), el("div", { class: "big", id: "stars-got", text: starsText(st) }),
        el("p", { class: "muted", text: st === 3 ? "不用提示，而且步數很少，三星！" : st === 2 ? "完成了。不用提示並在 " + (p.shortest + CFG.STAR3_EXTRA) + " 步內完成可得 3 星。" : "用了提示完成，不用提示再試可以拿更多星星。" })]) : null,
      el("div", { class: "btn-row" }, [
        el("button", { class: "btn primary", id: "again", type: "button", text: ok ? "再練一次" : "再試一次", onclick: () => practice(t, p) }),
        ok && next ? el("button", { class: "btn", id: "next", type: "button", text: "下一題 ›", onclick: () => practice(t, next) }) : null,
        el("button", { class: "btn", id: "to-topic", type: "button", text: "返回課題", onclick: () => topic(t) })].filter(Boolean))].filter(Boolean));
  }

  async function afterMove(move) {
    if (G.over) return;
    board.clearShapes();
    const game = board.game;
    if (move.color === "w") G.moves++;
    const j = EL.judge(game, { task: p.task, moves: G.moves, cap: p.cap, startMaterial, sideJustMoved: move.color, promoted: !!move.promotion });
    if (j.status === "success") return end(true, "將死了！", "你用了 " + G.moves + " 步完成。", G.moves);
    if (j.status === "fail") return end(false, j.reason === "stalemate" ? "逼和了" : "這次沒有成功", j.text, 0);
    if (j.status === "promoted") return checkPromotion();
    refresh();
    if (move.color === "w") blackTurn();
  }

  async function checkPromotion() {
    const my = ++G.token;
    G.busy = true; board.lock(); refresh(); status.textContent = "兵升變了，正在檢查局面…";
    let r = null;
    try { r = await mgr.run(board.game.fen(), { depth: CFG.DEFENDER.depth }); } catch (e) { r = null; }
    if (G.over || my !== G.token) return;
    G.busy = false; board.unlock();
    if (!r) { CO.Feedback.show(fb, { ok: false, title: "引擎暫時無法使用", text: "無法檢查升變後的局面，請按「重新載入引擎」後再試一次。" }); G.over = true; board.setInteractive(false); refresh(); return; }
    const v = EL.promotionVerdict(board.game, r.info);
    if (v.win) end(true, "升變成功！", "兵升變為后，白方仍然是贏的局面。你用了 " + G.moves + " 步。", G.moves);
    else end(false, "這次沒有成功", v.text, 0);
  }

  async function blackTurn() {
    const my = ++G.token;
    G.busy = true; board.lock(); refresh();
    const t0 = performance.now();
    let r = null;
    try { r = await mgr.run(board.game.fen(), CFG.DEFENDER); } catch (e) { r = null; }
    const tp = CO.Config.THINK_PAUSE, rest = tp.minMs + Math.random() * (tp.maxMs - tp.minMs) - (performance.now() - t0);
    if (rest > 0) await delay(rest);
    if (G.over || my !== G.token) return;
    G.busy = false; board.unlock();
    if (!r) { G.over = true; board.setInteractive(false); refresh(); CO.Feedback.show(fb, { ok: false, title: "引擎暫時無法使用", text: "黑方無法走棋，這次不會記錄。請按「重新載入引擎」後再試一次。" }); return; }
    board.play({ from: r.uci.slice(0, 2), to: r.uci.slice(2, 4), promotion: r.uci[4] });
  }

  async function doHint() {
    if (G.over || G.busy || G.hints >= CFG.HINT_LIMIT) return;
    G.busy = true; board.lock(); refresh();
    try {
      const r = await mgr.run(board.game.fen(), CFG.HINT);
      G.hints++;
      board.setShapes([{ orig: r.uci.slice(0, 2), dest: r.uci.slice(2, 4), brush: "green" }]);
      CO.Feedback.show(fb, { ok: true, title: "提示 " + G.hints + " / " + CFG.HINT_LIMIT, text: "建議走 " + sanOf(board.game.fen(), r.uci) + "（綠色箭頭）。用過提示最多只能得 1 星。" });
    } catch (e) {
      CO.Feedback.show(fb, { ok: false, title: "提示暫時無法使用", text: "引擎沒有回應，這次不會扣除提示次數。" });
    }
    G.busy = false; board.unlock(); refresh();
  }

  refresh();
}

/* ======================= 判斷題（王兵對王） ======================= */
function judgeQ(t, p) {
  leave();
  backLink.href = "endgames.html"; backLink.textContent = "‹ 殘局";
  stage.textContent = "";
  const idx = t.positions.indexOf(p);
  const wrap = el("div", { id: "board" }), fb = el("div", { id: "fb", "aria-live": "polite" }), endBox = el("div", { id: "end-box" });
  const box = el("div", { class: "opt-list" });
  stage.append(
    el("div", { class: "meta-row" }, [el("span", { class: "q-prog", text: t.title + "・第 " + (idx + 1) + " 題" }), starsEl(posStars(p.id))]),
    el("div", { class: "q-text", id: "q", text: "白方先走。這個局面白方能贏嗎？" }), wrap, box, fb, endBox);
  const board = createBoard(wrap, { fen: p.fen, orientation: "white", interactive: false, viewOnly: true });
  [["win", "白方能贏"], ["draw", "只能和棋"]].forEach(([k, label]) => box.append(el("button", { class: "opt", type: "button", "data-ans": k, text: label, onclick() {
    const ok = k === p.expect;
    box.querySelectorAll(".opt").forEach(b => { b.disabled = true; if (b.dataset.ans === p.expect) b.classList.add("right"); });
    if (!ok) box.querySelector('[data-ans="' + k + '"]').classList.add("wrong");
    const st = ok ? 3 : 0;
    const before = posStars(p.id);
    update(s => { s.endgames.pos[p.id] = EL.applyRun(s.endgames.pos[p.id], { success: ok, stars: st, moves: 0 }); });
    CO.Activity.log("mini"); CO.Activity.log("eg", { gain: posStars(p.id) - before });
    board.feedback(ok);
    CO.Feedback.show(fb, { ok, title: ok ? "答對了！" : "答錯了", text: "正確答案：" + (p.expect === "win" ? "白方能贏。" : "只能和棋。") + p.explain });
    const next = t.positions[idx + 1];
    endBox.textContent = "";
    endBox.append(...[
      ok ? el("div", { class: "card score-box", id: "result" }, [el("div", { class: "muted", text: "這次得到" }), el("div", { class: "big", id: "stars-got", text: starsText(3) })]) : null,
      el("div", { class: "btn-row" }, [
        el("button", { class: "btn primary", id: "again", type: "button", text: ok ? "再看一次" : "再試一次", onclick: () => judgeQ(t, p) }),
        next ? el("button", { class: "btn", id: "next", type: "button", text: "下一題 ›", onclick: () => practice(t, next) }) : null,
        el("button", { class: "btn", id: "to-topic", type: "button", text: "返回課題", onclick: () => topic(t) })].filter(Boolean))].filter(Boolean));
  } })));
}

home();
