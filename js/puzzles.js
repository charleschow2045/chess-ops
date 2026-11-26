/*
 * 戰術謎題（Lichess 格式）
 *  - 題目 FEN 是「對手走之前」的局面；moves[0] 是對手的步，App 自動走（停約 0.5 秒，有動畫），之後輪到玩家，
 *    玩家以自己一方在下面。玩家逐步走出 moves 內屬於自己的步，對手的回應由 App 自動走。
 *  - 玩家最後一步與答案不同、但同樣是將死，一樣當答對（Lichess 同樣接受）。
 *  - 走錯：即時顯示「答錯」＋箭頭標示正確走法，然後可以「再試一次」或「下一題」。
 *  - 計分：第一次嘗試就答對＝贏，答錯＝輸（Elo，見 puzzle-logic.js）；用咗提示唔計分。
 */
import { createBoard } from "./board.js";
import { Chess } from "../vendor/chess.js/chess.esm.js";

const CO = window.ChessOps;
const { el } = CO.Util;
const PL = CO.PuzzleLogic, ST = CO.State, MG = CO.MyGames, RV = CO.ReviewLogic, CFG = CO.Config;
const stage = document.getElementById("stage");
const ROUND = 5;
const parse = u => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
const themeName = t => PL.THEME_NAMES[t] || t;
const delay = ms => new Promise(r => setTimeout(r, ms));
let myMgr = null;                       // 「我的謎題」檢查其他走法用嘅引擎（用到先載入）
const getMgr = () => myMgr || (myMgr = new CO.EngineManager("vendor/stockfish/stockfish-19-lite-single.js", () => {}));

/* ---------- 資料載入（按分數段，需要時先載入） ---------- */
const cache = new Map();
async function loadBand(start) {
  if (!cache.has(start)) {
    const res = await fetch("data/puzzles/" + PL.bandFile(start));
    if (!res.ok) throw new Error("載入謎題檔案失敗：" + PL.bandFile(start));
    cache.set(start, (await res.json()).map(PL.fromRow));
  }
  return cache.get(start);
}
async function poolFor(rating, w) {
  const lists = await Promise.all(PL.bandsFor(rating, w).map(loadBand));
  return [].concat(...lists);
}
async function pickPuzzle(theme, chosen) {
  const s = ST.loadState().puzzles;
  for (const allowDone of [false, true]) {
    for (const w of [150, 300, 600, 1200]) {
      const pool = await poolFor(s.rating, w);
      const p = PL.selectPuzzle(pool, { rating: s.rating, themes: [theme], done: s.done, exclude: chosen, maxWindow: w, allowDone });
      if (p) return p;
    }
  }
  return null;
}
async function bookPuzzles() {
  const wrong = ST.loadState().puzzles.wrong;
  const picked = CO.Util.shuffle(wrong).slice(0, ROUND);
  const out = [];
  for (const w of picked) {
    const list = await loadBand(PL.bandStart(w.r));
    const p = list.find(x => x.id === w.id);
    if (p) out.push(p);
  }
  return out;
}

/* ---------- 首頁 ---------- */
function home() {
  const s = ST.loadState().puzzles;
  const mine = ST.loadState().mygames.puzzles;
  stage.textContent = "";
  const recent = s.history.slice(-10).map(h => el("span", { class: "chip " + (h.ok ? "accent" : ""), text: h.ok ? "✓" : "✗", title: themeName(h.theme) }));
  stage.append(
    el("div", { class: "card score-box" }, [
      el("div", { class: "muted", text: "我的謎題分" }),
      el("div", { class: "big", id: "rating", text: String(s.rating) }),
      el("p", { class: "muted", text: s.rated ? "已計分 " + s.rated + " 題" : "起始分數 700，每答一題會升降" }),
      recent.length ? el("div", { class: "found-list", style: "justify-content:center" }, recent) : ""].filter(Boolean)),
    el("div", { class: "btn-row" }, [el("button", { class: "btn primary", type: "button", id: "go-rec", text: "推薦練習（5 題）", onclick: () => round({ mode: "recommended" }) })]),
    el("p", { class: "muted", text: "推薦練習會輪流出送子、一步殺、捉雙、牽制四種題目。" }),
    el("h2", { class: "section-title", text: "按主題練習" }),
    el("div", { class: "tile-grid" }, PL.ALL_THEMES.map(t => el("button", { class: "tile", type: "button", "data-theme": t, style: "text-align:left;color:inherit;font:inherit;cursor:pointer", onclick: () => round({ mode: "theme", theme: t }) }, [
      el("b", { text: themeName(t) }), el("span", { text: "5 題" })]))),
    el("h2", { class: "section-title", text: "我的謎題" }),
    el("button", { class: "tile", type: "button", id: "mine", disabled: !mine.length, style: "width:100%;text-align:left;color:inherit;font:inherit;cursor:pointer;" + (mine.length ? "" : "opacity:.5"), onclick: () => round({ mode: "mine" }) }, [
      el("b", { text: "我的謎題（" + mine.length + " 題）" }),
      el("span", { text: mine.length ? "練習你自己對局中的大錯局面，找出引擎最佳步（不計謎題分）" : "到「我的對局」分析對局，把大錯加入這裡" })]),
    el("h2", { class: "section-title", text: "錯題本" }),
    el("button", { class: "tile", type: "button", id: "book", disabled: !s.wrong.length, style: "width:100%;text-align:left;color:inherit;font:inherit;cursor:pointer;" + (s.wrong.length ? "" : "opacity:.5"), onclick: () => round({ mode: "book" }) }, [
      el("b", { text: "錯題本（" + s.wrong.length + " 題）" }),
      el("span", { text: s.wrong.length ? "重做答錯的題目，連續答對 2 次就移出錯題本（不計謎題分）" : "答錯的題目會自動加入這裡" })]));
}

/* ---------- 一輪 ---------- */
async function round(cfg) {
  const startRating = ST.loadState().puzzles.rating;
  const results = [];
  const chosen = [];
  let plan, bookList = null;
  stage.textContent = "";
  stage.append(el("p", { class: "muted", text: "載入題目中…" }));
  try {
    if (cfg.mode === "mine") return mineRound();
    if (cfg.mode === "book") { bookList = await bookPuzzles(); plan = bookList.map(() => ""); }
    else plan = PL.planThemes(cfg.mode, cfg.theme, ROUND);
  } catch (e) { stage.textContent = "載入失敗：" + e.message; return; }
  for (let i = 0; i < plan.length; i++) {
    let p;
    try { p = bookList ? bookList[i] : await pickPuzzle(plan[i], chosen); } catch (e) { stage.textContent = "載入失敗：" + e.message; return; }
    if (!p) break;
    chosen.push(p.id);
    results.push(await runPuzzle(p, { cfg, index: i, total: plan.length, theme: plan[i] }));
  }
  summary(cfg, results, startRating);
}

function runPuzzle(p, ctx) {
  return new Promise(resolve => {
    stage.textContent = "";
    const moves = p.moves;
    const playerColor = new Chess(p.fen).turn() === "w" ? "black" : "white";
    const shownTheme = PL.mainTheme(p, ctx.theme);
    let idx = 0, mistakes = 0, usedHint = false, hintLevel = 0, auto = true, finished = false, recorded = false;
    let outcome = { rated: false, delta: 0, ok: false };

    const wrap = el("div"), fb = el("div", { "aria-live": "polite" });
    const status = el("div", { class: "status-line", text: "對手先走一步…" });
    const hintBtn = el("button", { class: "btn", type: "button", id: "hint", text: "提示 Hint", disabled: true });
    const retryBtn = el("button", { class: "btn hidden", type: "button", id: "retry", text: "再試一次" });
    const nextBtn = el("button", { class: "btn primary hidden", type: "button", id: "next", text: ctx.index === ctx.total - 1 ? "看小結" : "下一題 ›" });
    const tags = p.themes.map(t => el("span", { class: "chip" + (t === shownTheme ? " accent" : ""), text: themeName(t) }));
    // 「推薦」模式：答完先顯示主題標籤（避免提示解法類型）；「按主題練習」一開始就顯示。
    // 用 visibility:hidden（invisible）而唔係 display:none，因為標籤出現會令棋盤位置移動，Chessground 快取咗舊位置會令點擊錯位
    const tagsEl = el("div", { class: "found-list" + (ctx.cfg.mode === "recommended" ? " invisible" : ""), id: "tags" }, tags);
    stage.append(
      el("div", { class: "topbar-lite meta-row" }, [el("span", { class: "q-prog", text: (ctx.cfg.mode === "book" ? "錯題本・" : "") + "第 " + (ctx.index + 1) + " / " + ctx.total + " 題" }), el("span", { class: "chip gold", text: "題目分 " + p.rating })]),
      tagsEl,
      status, wrap, fb, el("div", { class: "btn-row" }, [hintBtn, retryBtn, nextBtn]));

    const board = createBoard(wrap, {
      fen: p.fen, orientation: playerColor, interactive: false, promotion: "ask",
      onMove(move) {
        if (auto || finished) return;
        const uci = move.from + move.to + (move.promotion || "");
        const mate = board.game.isCheckmate();
        if (uci === moves[idx] || mate) {
          idx++;
          board.clearShapes(); hintLevel = 0;
          if (mate || idx >= moves.length) return solved();
          board.setInteractive(false); hintBtn.disabled = true;
          setTimeout(() => { auto = true; board.play(parse(moves[idx])); idx++; auto = false; board.setInteractive(playerColor); hintBtn.disabled = false; }, 500);
        } else wrongMove();
      }
    });

    function start() {
      auto = true; idx = 0; finished = false;
      board.load(p.fen); board.setInteractive(false); hintLevel = 0;
      retryBtn.classList.add("hidden"); nextBtn.classList.add("hidden"); hintBtn.disabled = true; CO.Feedback.clear(fb);
      status.textContent = "對手先走一步…";
      setTimeout(() => {
        board.play(parse(moves[0])); idx = 1; auto = false;
        board.setInteractive(playerColor); hintBtn.disabled = false;
        status.textContent = (playerColor === "white" ? "白方" : "黑方") + "走棋：找出最好的一步";
      }, 500);
    }

    function record(won) {
      recorded = true;
      let s = ST.loadState();
      const pz = s.puzzles;
      let res = { puzzles: pz, delta: 0, rated: false };
      if (ctx.cfg.mode !== "book") {
        res = PL.applyResult(pz, p.rating, won, usedHint);
        res.puzzles.done = PL.markDone(res.puzzles.done, p.id);
      }
      res.puzzles.wrong = PL.updateWrongBook(res.puzzles.wrong, p.id, p.rating, PL.countsAsCorrect(won, usedHint));
      res.puzzles.history = PL.pushHistory(res.puzzles.history, { id: p.id, ok: won, hint: usedHint, rated: res.rated, theme: shownTheme, delta: res.delta });
      s.puzzles = res.puzzles;
      ST.saveState(s);
      outcome = { rated: res.rated, delta: res.delta, ok: won, rating: res.puzzles.rating };
      CO.Activity.log("puzzle", { ok: won, delta: res.delta });
    }
    function scoreText() {
      if (ctx.cfg.mode === "book") return "錯題本練習不計謎題分。";
      if (!outcome.rated) return usedHint ? "這題用了提示，不計分。" : "";
      return "謎題分 " + (outcome.delta >= 0 ? "+" : "") + outcome.delta + "（現在 " + outcome.rating + "）。";
    }
    function solved() {
      finished = true; board.setInteractive(false); hintBtn.disabled = true; board.feedback(true);
      if (!recorded) record(true);
      tagsEl.classList.remove("invisible");
      const retry = mistakes > 0;
      CO.Feedback.show(fb, { ok: true, title: retry ? "這次答對了" : "答對了！", text: (retry ? "這題之前已記錄為答錯。" : "") + scoreText() + (usedHint ? "已加入錯題本，之後可以再練習。" : "") });
      status.textContent = "完成";
      nextBtn.classList.remove("hidden");
    }
    function wrongMove() {
      mistakes++;
      board.undo(); board.setInteractive(false); hintBtn.disabled = true; board.feedback(false);
      board.setShapes([{ orig: moves[idx].slice(0, 2), dest: moves[idx].slice(2, 4), brush: "green" }]);
      if (!recorded) record(false);
      tagsEl.classList.remove("invisible");
      CO.Feedback.show(fb, { ok: false, title: "答錯了", text: "綠色箭頭是正確的走法。" + scoreText() + "這題已加入錯題本。" });
      retryBtn.classList.remove("hidden"); nextBtn.classList.remove("hidden");
    }
    hintBtn.addEventListener("click", () => {
      if (finished || hintBtn.disabled) return;
      usedHint = true; hintLevel++;
      const u = moves[idx];
      if (hintLevel === 1) board.setShapes([{ orig: u.slice(0, 2), brush: "green" }]);                              // 第一次：圈出要走的棋子
      else board.setShapes([{ orig: u.slice(0, 2), brush: "green" }, { orig: u.slice(0, 2), dest: u.slice(2, 4), brush: "green" }]);   // 第二次：箭頭顯示答案
      CO.Feedback.show(fb, { ok: true, title: hintLevel === 1 ? "提示 1：要走這枚棋子" : "提示 2：箭頭是答案", text: recorded ? "" : "使用提示後，這題不計謎題分。" });
    });
    retryBtn.addEventListener("click", start);
    // 供 tools/shots2.js 自動測試使用
    window.__chessopsDebug = {
      puzzle: () => p, expected: () => moves[idx], mistakes: () => mistakes,
      wrongMove: () => { const m = board.game.moves({ verbose: true }).find(x => (x.from + x.to + (x.promotion || "")) !== moves[idx] && !/#/.test(x.san)); return m.from + m.to + (m.promotion || ""); }
    };
    nextBtn.addEventListener("click", () => { window.scrollTo(0, 0); resolve({ id: p.id, ok: mistakes === 0, hint: usedHint, rated: outcome.rated, delta: outcome.delta, theme: shownTheme, themes: p.themes, rating: p.rating }); });
    start();
  });
}

/* ---------- 我的謎題（來自「我的對局」嘅大錯；唔計謎題分） ---------- */
async function mineRound() {
  const list = CO.Util.shuffle(ST.loadState().mygames.puzzles).slice(0, ROUND);
  const results = [];
  for (let i = 0; i < list.length; i++) results.push(await runMyPuzzle(list[i], { index: i, total: list.length }));
  const correct = results.filter(r => r.ok).length;
  stage.textContent = "";
  stage.append(
    el("div", { class: "card score-box" }, [
      el("div", { class: "muted", text: "我的謎題小結" }),
      el("div", { class: "big", id: "mine-score", text: correct + " / " + results.length }),
      el("p", { class: "muted", text: "我的謎題不計謎題分。" })]),
    el("div", { class: "btn-row" }, [
      el("button", { class: "btn primary", type: "button", id: "again", text: "再來一輪", onclick: () => round({ mode: "mine" }) }),
      el("button", { class: "btn", type: "button", id: "back-home", text: "返回謎題首頁", onclick: home })]));
}

function runMyPuzzle(p, ctx) {
  return new Promise(resolve => {
    stage.textContent = "";
    const side = p.fen.split(" ")[1];
    let mistakes = 0, hintLevel = 0, finished = false, recorded = false, checking = false;
    const wrap = el("div"), fb = el("div", { "aria-live": "polite" });
    const status = el("div", { class: "status-line", text: (side === "w" ? "白方" : "黑方") + "走棋：找出引擎認為最好的一步" });
    const hintBtn = el("button", { class: "btn", type: "button", id: "hint", text: "提示 Hint" });
    const retryBtn = el("button", { class: "btn hidden", type: "button", id: "retry", text: "再試一次" });
    const removeBtn = el("button", { class: "btn hidden", type: "button", id: "remove", text: "從我的謎題移除" });
    const nextBtn = el("button", { class: "btn primary hidden", type: "button", id: "next", text: ctx.index === ctx.total - 1 ? "看小結" : "下一題 ›" });
    stage.append(
      el("div", { class: "topbar-lite meta-row" }, [el("span", { class: "q-prog", text: "我的謎題・第 " + (ctx.index + 1) + " / " + ctx.total + " 題" }), el("span", { class: "chip gold", text: p.date || "我的對局" })]),
      status, wrap, fb, el("div", { class: "btn-row" }, [hintBtn, retryBtn, removeBtn, nextBtn]));
    const board = createBoard(wrap, { fen: p.fen, orientation: side === "w" ? "white" : "black", interactive: "turn", promotion: "ask", onMove });

    function record(won) { recorded = true; CO.Activity.log("puzzle", { ok: won, delta: 0 }); }
    function end(ok, title, text) {
      finished = true; board.setInteractive(false); hintBtn.disabled = true; board.feedback(ok);
      CO.Feedback.show(fb, { ok, title, text });
      removeBtn.classList.remove("hidden"); nextBtn.classList.remove("hidden"); retryBtn.classList.toggle("hidden", ok);
    }
    async function onMove(move) {
      if (finished || checking) return;
      const uci = move.from + move.to + (move.promotion || "");
      if (uci === p.best || board.game.isCheckmate()) { if (!recorded) record(mistakes === 0); return end(true, "答對了！", "這是引擎認為最好的一步。"); }
      checking = true; board.lock(); status.textContent = "檢查這一步…";
      let after = null;
      try {
        if (board.game.isGameOver()) after = 0;
        else { const r = await getMgr().run(board.game.fen(), { movetime: CFG.REVIEW.maxMsPerMove, depth: CFG.REVIEW.maxDepth }); after = -RV.scoreToCp({ cp: r.info.cp, mate: r.info.mate }); }
      } catch (e) { after = null; }
      checking = false; board.unlock(); status.textContent = "";
      if (after !== null && MG.isAcceptable(p.cp, after)) { if (!recorded) record(mistakes === 0); return end(true, "答對了！", "你走的不是引擎最佳步（" + (p.bestSan || "") + "），但勝率差別很小（少於 " + Math.round(CFG.MYGAMES.ACCEPT_DROP * 100) + "%），也算答對。"); }
      mistakes++;
      board.undo(); board.setInteractive(false); hintBtn.disabled = true; board.feedback(false);
      board.setShapes([{ orig: p.best.slice(0, 2), dest: p.best.slice(2, 4), brush: "green" }]);
      if (!recorded) record(false);
      CO.Feedback.show(fb, { ok: false, title: "答錯了", text: after === null ? "引擎暫時無法檢查這一步，只接受引擎最佳步。綠色箭頭是最佳走法" + (p.bestSan ? "（" + p.bestSan + "）" : "") + "。" : "綠色箭頭是引擎最佳走法" + (p.bestSan ? "（" + p.bestSan + "）" : "") + "。" });
      retryBtn.classList.remove("hidden"); nextBtn.classList.remove("hidden");
    }
    hintBtn.addEventListener("click", () => {
      if (finished || checking) return;
      hintLevel++;
      board.setShapes(hintLevel === 1 ? [{ orig: p.best.slice(0, 2), brush: "green" }] : [{ orig: p.best.slice(0, 2), brush: "green" }, { orig: p.best.slice(0, 2), dest: p.best.slice(2, 4), brush: "green" }]);
      CO.Feedback.show(fb, { ok: true, title: hintLevel === 1 ? "提示 1：要走這枚棋子" : "提示 2：箭頭是答案", text: "" });
    });
    retryBtn.addEventListener("click", () => { board.load(p.fen); board.clearShapes(); board.setInteractive("turn"); retryBtn.classList.add("hidden"); nextBtn.classList.add("hidden"); CO.Feedback.clear(fb); hintBtn.disabled = false; hintLevel = 0; });
    removeBtn.addEventListener("click", () => { ST.saveState((() => { const s = ST.loadState(); s.mygames.puzzles = MG.removePuzzle(s.mygames.puzzles, p.id); return s; })()); removeBtn.disabled = true; removeBtn.textContent = "已移除"; });
    nextBtn.addEventListener("click", () => { window.scrollTo(0, 0); resolve({ id: p.id, ok: mistakes === 0 }); });
  });
}

/* ---------- 小結 ---------- */
function summary(cfg, results, startRating) {
  const s = ST.loadState().puzzles;
  const correct = results.filter(r => r.ok).length;
  const diff = s.rating - startRating;
  stage.textContent = "";
  stage.append(
    el("div", { class: "card score-box" }, [
      el("div", { class: "muted", text: "本輪小結" }),
      el("div", { class: "big", text: correct + " / " + results.length }),
      el("p", { text: cfg.mode === "book" ? "錯題本練習不計謎題分。" : "謎題分 " + startRating + " → " + s.rating + "（" + (diff >= 0 ? "+" : "") + diff + "）" })]),
    el("div", { class: "card", style: "margin-top:12px" }, results.map(r => el("div", { class: "meta-row" }, [
      el("span", { text: (r.ok ? "✓ " : "✗ ") + themeName(r.theme) }),
      el("span", { class: "muted", text: "題目分 " + r.rating + (r.hint ? "・用了提示" : "") + (r.rated ? "・" + (r.delta >= 0 ? "+" : "") + r.delta : "") })]))),
    el("div", { class: "btn-row" }, [
      el("button", { class: "btn primary", type: "button", id: "again", text: "再來一輪", onclick: () => round(cfg) }),
      el("button", { class: "btn", type: "button", id: "back-home", text: "返回謎題首頁", onclick: home })]));
}

home();
