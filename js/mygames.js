/*
 * 我的對局（mygames.html）
 *  1. 輸入 chess.com 用戶名（只存喺本機）→ 讀取最近 30 日、最多 20 局、只取中速棋同快棋（第 0 階段核實過嘅公開介面）；
 *     讀取失敗就提供「貼上 PGN」後備。
 *  2. 揀一局 → 用第 3、4 階段嘅賽後檢討（Lichess 勝率分類 ＋ 四種原因），只分析用戶自己嘅步。
 *  3. 每個大錯可以「加入我的謎題」（局面＝走錯之前；答案＝引擎最佳步；勝率跌幅 < 0.05 嘅其他走法都當啱；最多 50 題），
 *     喺「戰術謎題」入面揀「我的謎題」練習（唔計謎題分）。
 *  對局本身唔長期儲存，只存最近分析過 5 局嘅摘要。
 */
import { createBoard } from "./board.js";
import { Chess } from "../vendor/chess.js/chess.esm.js";

const CO = window.ChessOps;
const { el } = CO.Util;
const MG = CO.MyGames, RV = CO.ReviewLogic, CFG = CO.Config, ST = CO.State, Dialog = CO.Dialog;
const $ = id => document.getElementById(id);
const stage = $("stage"), engineBox = $("engine-box"), backLink = $("back");
const ENGINE_URL = "vendor/stockfish/stockfish-19-lite-single.js";
const getS = () => ST.loadState();
function update(fn) { const s = ST.loadState(); fn(s); return ST.saveState(s); }
const TC = { rapid: "中速棋", blitz: "快棋", other: "其他" };
const RES = { win: "勝", loss: "負", draw: "和" };
const dayStr = ms => { const d = new Date(ms); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

const mgr = new CO.EngineManager(ENGINE_URL, onEngineStatus);
window.__chessopsMgr = mgr;
function onEngineStatus(state, detail) {
  engineBox.textContent = "";
  if (state === "loading") engineBox.append(el("div", { class: "card", style: "margin-bottom:12px" }, [el("div", { text: "引擎載入中…（首次需要下載約 1.8 MB，之後會快很多）" }), el("div", { class: "prog indet" }, [el("i")])]));
  else if (state === "recovering") engineBox.append(el("div", { class: "card", style: "margin-bottom:12px" }, [el("div", { text: "引擎沒有回應，正在重新載入…（第 " + detail + " 次）" }), el("div", { class: "prog indet" }, [el("i")])]));
  else if (state === "failed") engineBox.append(el("div", { class: "card", style: "margin-bottom:12px" }, [el("p", { text: "引擎暫時無法使用，無法分析對局。" }), el("button", { class: "btn", type: "button", text: "重新載入引擎", onclick() { mgr.reset(); engineBox.textContent = ""; mgr.ensure().catch(() => {}); } })]));
}

/* ======================= 讀取 chess.com ======================= */
async function getJson(url) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 20000);
  let res;
  try { res = await fetch(url, { headers: { Accept: "application/json" }, signal: ctl.signal }); }
  catch (e) { throw new Error(navigator.onLine === false ? "需要網絡才能讀取對局，可以改用貼上 PGN。" : "無法連接 chess.com（網絡問題，或者瀏覽器阻擋了連線）。"); }
  finally { clearTimeout(timer); }
  if (res.status === 404) throw new Error("找不到這個用戶名，請檢查拼寫。");
  if (res.status === 429) throw new Error("chess.com 暫時限制了請求次數，請稍後再試。");
  if (!res.ok) throw new Error("chess.com 回應了錯誤（HTTP " + res.status + "）。");
  try { return await res.json(); } catch (e) { throw new Error("chess.com 回傳的資料格式不正確。"); }
}
async function fetchGames(user) {
  const a = await getJson(MG.archivesUrl(user));
  const archives = a.archives || [];
  if (!archives.length) throw new Error("這個用戶沒有對局紀錄（帳戶可能是私人的）。");
  let games = [];
  for (const url of archives.slice(-2).reverse()) {              // 最近兩個月，夠 20 局就停
    const j = await getJson(url);
    games = games.concat(j.games || []);
    if (MG.filterGames(games, user, Date.now()).length >= CFG.MYGAMES.MAX_GAMES) break;
  }
  return MG.filterGames(games, user, Date.now());
}

/* ======================= 首頁 ======================= */
function home(note) {
  backLink.href = "./"; backLink.textContent = "‹ 返回";
  stage.textContent = "";
  const s = getS().mygames;
  const input = el("input", { id: "user", type: "text", value: s.user, placeholder: "chess.com 用戶名", autocapitalize: "off", autocomplete: "off", autocorrect: "off", spellcheck: "false",
    style: "width:100%;box-sizing:border-box;font-size:18px;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--surface2);color:var(--text)" });
  const msg = el("p", { class: "muted", id: "msg", "aria-live": "polite", text: note || "" });
  const list = el("div", { id: "game-list" });
  const go = el("button", { class: "btn primary", id: "load", type: "button", text: "讀取最近對局", async onclick() {
    const user = MG.cleanUser(input.value);
    if (!user) { msg.className = "muted bad"; msg.textContent = "請輸入有效的用戶名（3–25 個英文字母、數字、底線或連字號）。"; return; }
    update(x => { x.mygames.user = user; });
    go.disabled = true; msg.className = "muted"; msg.textContent = "正在從 chess.com 讀取…"; list.textContent = "";
    try {
      const games = await fetchGames(user);
      msg.textContent = games.length ? "最近 " + CFG.MYGAMES.DAYS + " 日的中速棋和快棋：共 " + games.length + " 局（最多 " + CFG.MYGAMES.MAX_GAMES + " 局）。選擇一局進行分析。" : "最近 " + CFG.MYGAMES.DAYS + " 日沒有中速棋或快棋對局。你也可以貼上 PGN。";
      list.append(...games.map(g => gameRow({ ucis: null, pgn: g.pgn, color: g.color, meta: { date: dayStr(g.endTime * 1000), opp: g.opp, tc: g.tc, result: g.result } })));
    } catch (e) {
      msg.className = "muted bad"; msg.textContent = e.message + " 可以改用下面的「貼上 PGN」。";
    }
    go.disabled = false;
  } });

  const ta = el("textarea", { id: "pgn-text", placeholder: "在 chess.com 對局頁面複製 PGN，貼在這裡（可以貼多局）", "aria-label": "貼上 PGN", style: "width:100%;min-height:120px;box-sizing:border-box;font-size:14px;padding:8px;border-radius:10px;border:1px solid var(--line);background:var(--surface2);color:var(--text)" });
  const pgnMsg = el("p", { class: "muted", id: "pgn-msg", "aria-live": "polite" });
  const pgnList = el("div", { id: "pgn-list" });
  const pgnBtn = el("button", { class: "btn", id: "pgn-go", type: "button", text: "讀取貼上的 PGN", onclick() {
    pgnList.textContent = ""; pgnMsg.className = "muted";
    const parts = MG.splitPgns(ta.value);
    if (!parts.length) { pgnMsg.className = "muted bad"; pgnMsg.textContent = "沒有可以讀取的 PGN。"; return; }
    const user = MG.cleanUser($("user").value) || getS().mygames.user;
    let ok = 0;
    parts.forEach((p, i) => {
      let r;
      try { r = MG.parsePgn(Chess, p, user); } catch (e) { pgnList.append(el("p", { class: "muted bad", text: "第 " + (i + 1) + " 局：" + e.message })); return; }
      ok++;
      pgnList.append(gameRow({ ucis: r.ucis, pgn: p, color: r.color, meta: { date: r.date, opp: r.color === "w" ? r.black : r.white, tc: "other", result: r.result, white: r.white, black: r.black } }));
    });
    pgnMsg.textContent = ok ? "已讀取 " + ok + " 局。" + (user ? "" : "沒有用戶名時，請自己選擇你執白還是執黑。") : "";
  } });

  stage.append(
    el("div", { class: "card" }, [
      el("b", { style: "font-size:18px", text: "chess.com 用戶名" }),
      el("p", { class: "muted", text: "用戶名只儲存在這部裝置，只會用來向 chess.com 讀取你的公開對局。" }),
      input, el("div", { class: "btn-row" }, [go]), msg]),
    list,
    el("h2", { class: "section-title", text: "讀取不到？貼上 PGN" }),
    el("div", { class: "card" }, [ta, el("div", { class: "btn-row" }, [pgnBtn]), pgnMsg]), pgnList,
    el("h2", { class: "section-title", text: "我的謎題（" + s.puzzles.length + " / " + CFG.MYGAMES.MAX_PUZZLES + " 題）" }),
    el("div", { class: "card" }, [
      el("p", { class: "muted", style: "margin:0 0 10px", text: "在對局分析中，把大錯加入「我的謎題」，之後可以到戰術謎題頁面選擇「我的謎題」練習（不計謎題分）。" }),
      el("a", { class: "btn" + (s.puzzles.length ? " primary" : ""), id: "to-puzzles", href: "puzzles.html", text: "前往戰術謎題" })]),
    el("h2", { class: "section-title", text: "最近分析過的對局（最多 " + CFG.MYGAMES.RECENT + " 局）" }),
    s.recent.length ? el("div", { class: "card", id: "recent" }, s.recent.map(g => el("div", { class: "meta-row" }, [
      el("span", { text: (g.date || "—") + "・" + TC[g.tc] + "・執" + (g.color === "w" ? "白" : "黑") + "・對 " + (g.opp || "—") + "・" + RES[g.result] }),
      el("span", { class: "muted", text: "大錯 " + g.blunders + "・錯著 " + g.mistakes + "・疑問手 " + g.inaccuracies })]))) : el("p", { class: "muted", text: "還沒有分析過的對局。先輸入用戶名讀取對局，或者貼上 PGN，選擇一局分析。" }));
}

/* 一局嘅清單列：已知顏色就一個「分析」鍵；未知（貼上 PGN 又對唔到用戶名）就俾用戶揀執白／執黑 */
function gameRow(g) {
  const m = g.meta;
  const title = (m.date || "—") + (m.tc && m.tc !== "other" ? "・" + TC[m.tc] : "") + (g.color ? "・執" + (g.color === "w" ? "白" : "黑") : "") + "・對 " + (m.opp || (m.white ? m.white + " 對 " + m.black : "—")) + (m.result ? "・" + RES[m.result] : "");
  const row = el("div", { class: "card game-row", style: "margin-top:10px" }, [el("div", { text: title })]);
  const start = color => analyze(Object.assign({}, g, { color, meta: Object.assign({}, m, { result: m.result || null }) }));
  if (g.color) row.append(el("div", { class: "btn-row" }, [el("button", { class: "btn primary", type: "button", "data-act": "analyze", text: "分析這局", onclick: () => start(g.color) })]));
  else row.append(el("div", { class: "btn-row" }, [
    el("button", { class: "btn primary", type: "button", text: "我執白", onclick: () => start("w") }),
    el("button", { class: "btn primary", type: "button", text: "我執黑", onclick: () => start("b") })]));
  return row;
}

/* ======================= 分析 ======================= */
async function analyze(g) {
  let cancelled = false;
  let ucis = g.ucis;
  if (!ucis) { try { ucis = MG.parsePgn(Chess, g.pgn, getS().mygames.user).ucis; } catch (e) { home(e.message); return; } }
  const info = { ucis, color: g.color, meta: Object.assign({}, g.meta, { color: g.color, plies: ucis.length }) };
  stage.textContent = "";
  backLink.href = "mygames.html"; backLink.textContent = "‹ 離開";
  mgr.ensure().catch(() => {});
  const bar = el("i"), label = el("p", { id: "rv-label", text: "準備分析…" });
  stage.append(el("div", { class: "card" }, [
    el("h2", { style: "margin:0 0 8px;font-size:20px", text: "對局分析" }),
    el("p", { class: "muted", text: "逐步分析你自己的每一步（不分析對手的步），需要一點時間，可以隨時取消。" }),
    label, el("div", { class: "prog" }, [bar]),
    el("button", { class: "btn", id: "rv-cancel", type: "button", text: "取消", onclick() { cancelled = true; mgr.stop(); home(); } })]));
  const analyzeFen = async fen => {
    if (cancelled) throw new Error("cancel");
    const r = await mgr.run(fen, { movetime: CFG.REVIEW.maxMsPerMove, depth: CFG.REVIEW.maxDepth });
    return { cp: r.info.cp, mate: r.info.mate, best: r.uci };
  };
  let res;
  try {
    res = await RV.reviewGame(Chess, ucis, g.color, analyzeFen, {
      onProgress(d, t) { label.textContent = "分析中：第 " + d + " / " + t + " 步"; bar.style.width = (d / t * 100) + "%"; },
      shouldCancel: () => cancelled
    });
  } catch (e) {
    if (cancelled) return;
    stage.textContent = "";
    stage.append(el("div", { class: "card" }, [el("p", { text: "引擎暫時無法使用，無法分析這局。請稍後再試。" }), el("button", { class: "btn", type: "button", text: "返回", onclick: () => home() })]));
    return;
  }
  if (cancelled || res.cancelled) return;
  update(s => { s.mygames.recent.unshift(MG.summaryEntry(info.meta, res.summary.counts)); s.mygames.recent = s.mygames.recent.slice(0, CFG.MYGAMES.RECENT); });
  result(info, res);
}

const lossText = loss => loss >= CFG.REVIEW.MATE_CP ? "涉及將死" : "損失約 " + (loss / 100).toFixed(1) + " 兵";

function result(info, res) {
  backLink.href = "mygames.html"; backLink.textContent = "‹ 離開";
  stage.textContent = "";
  const items = res.moves.filter(m => m.cls === "blunder" || m.cls === "mistake");
  const c = res.summary.counts;
  stage.append(el("div", { class: "card", id: "rv-summary" }, [
    el("h2", { style: "margin:0 0 8px;font-size:20px", text: "分析結果" }),
    el("p", { text: res.summary.text }),
    el("p", { class: "muted", text: "大錯 " + c.blunder + "・錯著 " + c.mistake + "・疑問手 " + c.inaccuracy + "（只計算你自己的步）" })]));
  if (items.length) stage.append(el("h2", { class: "section-title", text: "大錯和錯著（點選任一項可查看局面）" }));
  items.forEach((m, i) => stage.append(el("button", { class: "rev-item " + m.cls, type: "button", "data-i": i, onclick: () => position(info, res, items, i) }, [
    el("b", { text: "第 " + m.moveNo + " 步・" + RV.CLASS_NAME[m.cls] }),
    el("span", { text: "你走了 " + m.san + (m.bestSan ? "，較好的走法是 " + m.bestSan : "") + "。" + lossText(m.lossCp) + "。" })])));
  stage.append(el("div", { class: "btn-row" }, [el("button", { class: "btn primary", id: "rv-back", type: "button", text: "返回", onclick: () => home() })]));
}

function position(info, res, items, i) {
  const m = items[i];
  stage.textContent = "";
  const wrap = el("div", { id: "board" }), fb = el("div", { id: "fb", "aria-live": "polite" });
  const reasonLine = m.reason ? "原因：" + RV.REASON_TEXT[m.reason] + "。" : "";
  const addBtn = el("button", { class: "btn", id: "add-puzzle", type: "button", text: "加入我的謎題" });
  stage.append(
    el("div", { class: "q-text", text: "第 " + m.moveNo + " 步：你走了 " + m.san + "（" + RV.CLASS_NAME[m.cls] + "）" }), wrap,
    el("div", { class: "card", id: "rv-pos-text" }, [
      el("p", { style: "margin:0 0 6px", text: (m.bestSan ? "較好的走法：" + m.bestSan + "（綠色箭頭）。" : "") + "你走的是紅色箭頭。" + lossText(m.lossCp) + "。" }),
      reasonLine ? el("p", { style: "margin:0", text: reasonLine }) : ""].filter(Boolean)),
    fb,
    el("div", { class: "btn-row" }, [
      el("button", { class: "btn", type: "button", text: "‹ 上一個", disabled: i === 0, onclick: () => position(info, res, items, i - 1) }),
      el("button", { class: "btn", type: "button", text: "下一個 ›", disabled: i === items.length - 1, onclick: () => position(info, res, items, i + 1) }),
      el("button", { class: "btn primary", id: "rv-list", type: "button", text: "返回清單", onclick: () => result(info, res) })]),
    m.cls === "blunder" ? el("div", { class: "btn-row" }, [addBtn]) : el("p", { class: "muted", text: "只有大錯可以加入「我的謎題」。" }));
  const board = createBoard(wrap, { fen: m.fenBefore, orientation: info.color === "w" ? "white" : "black", interactive: false, viewOnly: true });
  const shapes = [];
  if (m.bestUci) shapes.push({ orig: m.bestUci.slice(0, 2), dest: m.bestUci.slice(2, 4), brush: "green" });
  shapes.push({ orig: m.uci.slice(0, 2), dest: m.uci.slice(2, 4), brush: "red" });
  board.setShapes(shapes);
  window.__chessopsReview = { board };
  const puz = MG.puzzleFromMove(m, info.color, info.meta.date);
  function paint() {
    const has = getS().mygames.puzzles.some(p => puz && p.id === puz.id);
    addBtn.disabled = !puz || has;
    addBtn.textContent = !puz ? "沒有引擎建議，無法加入" : has ? "已加入我的謎題" : "加入我的謎題";
  }
  addBtn.addEventListener("click", () => {
    let status;
    update(s => { const r = MG.addPuzzle(s.mygames.puzzles, puz); status = r.status; s.mygames.puzzles = r.list; });
    const n = getS().mygames.puzzles.length;
    if (status === "added") CO.Feedback.show(fb, { ok: true, title: "已加入我的謎題", text: "現在有 " + n + " / " + CFG.MYGAMES.MAX_PUZZLES + " 題。到戰術謎題頁面可以練習。" });
    else if (status === "full") CO.Feedback.show(fb, { ok: false, title: "我的謎題已滿", text: "最多保存 " + CFG.MYGAMES.MAX_PUZZLES + " 題。請先到戰術謎題頁面練習，並移除不需要的題目。" });
    paint();
  });
  paint();
}

home();
