/*
 * 戰術謎題的純邏輯（唔使 DOM、唔使 chess.js；tests/run-all.js 會測試）
 *  - 謎題分：Elo。預期 = 1 / (1 + 10^((題目分 − 謎題分) / 400))；第一次就答啱當贏，答錯當輸；
 *    頭 30 題計分嘅 K = 40，之後 K = 24；用咗提示嘅題目唔計分（分數不變）。
 *  - 選題：題目分喺謎題分 ±150 以內、未做過；搵唔到就每次擴闊 50 分；最後先容許重複。
 *  - 錯題本：答錯加入；連續答啱 2 次就移出。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.PuzzleLogic = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var THEME_NAMES = {
    hangingPiece: "送子 Hanging Piece",
    mateIn1: "一步殺 Mate in 1",
    fork: "捉雙 Fork",
    pin: "牽制 Pin",
    mateIn2: "兩步殺 Mate in 2",
    skewer: "串擊 Skewer",
    discoveredAttack: "閃擊 Discovered Attack"
  };
  var ALL_THEMES = ["hangingPiece", "mateIn1", "fork", "pin", "mateIn2", "skewer", "discoveredAttack"];
  var RECOMMENDED = ["hangingPiece", "mateIn1", "fork", "pin"];
  var START_RATING = 700;
  var WINDOW = 150;
  var MAX_DONE = 2000, MAX_HISTORY = 50;

  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  function expectedScore(userRating, puzzleRating) { return 1 / (1 + Math.pow(10, (puzzleRating - userRating) / 400)); }
  function kFactor(ratedCount) { return ratedCount < 30 ? 40 : 24; }

  /* puzzles = state.puzzles；回傳新嘅 puzzles 物件同變動 { puzzles, delta, rated } */
  function applyResult(puzzles, puzzleRating, won, usedHint) {
    var p = JSON.parse(JSON.stringify(puzzles));
    if (usedHint) return { puzzles: p, delta: 0, rated: false };
    var delta = Math.round(kFactor(p.rated) * ((won ? 1 : 0) - expectedScore(p.rating, puzzleRating)));
    p.rating = clamp(p.rating + delta, 100, 3000);
    p.rated += 1;
    return { puzzles: p, delta: delta, rated: true };
  }

  /* 一行資料 [id, fen, moves, rating, themes] → 謎題物件；moves 變成 uci 陣列 */
  function fromRow(r) { return { id: r[0], fen: r[1], moves: r[2].split(" "), rating: r[3], themes: r[4].split(" ") }; }

  function bandStart(rating) { return clamp(Math.floor(rating / 100) * 100, 400, 1300); }
  function bandFile(start) { return "r" + String(start).padStart(4, "0") + ".json"; }
  /* 揀題範圍 [rating − w, rating + w] 會用到嘅分數段起點 */
  function bandsFor(rating, w) {
    var out = [], lo = bandStart(rating - w), hi = bandStart(rating + w);
    for (var s = lo; s <= hi; s += 100) out.push(s);
    return out;
  }

  function matchesThemes(p, themes) { return p.themes.some(function (t) { return themes.indexOf(t) >= 0; }); }

  /*
   * pool：已載入嘅謎題；opts：{ rating, themes, done（id 陣列）, exclude（本輪已揀 id 陣列）, rng, maxWindow（最闊搜尋範圍，預設 1200）, allowDone（容許揀做過嘅，預設否）}
   * 回傳一題，或 null（連最闊範圍都冇）。
   */
  function selectPuzzle(pool, opts) {
    var rng = opts.rng || Math.random;
    var done = {}; (opts.done || []).forEach(function (id) { done[id] = 1; });
    var excl = {}; (opts.exclude || []).forEach(function (id) { excl[id] = 1; });
    var maxW = opts.maxWindow || 1200;
    var base = pool.filter(function (p) { return matchesThemes(p, opts.themes) && !excl[p.id]; });
    for (var w = WINDOW; w <= maxW; w += 50) {
      var c = base.filter(function (p) { return Math.abs(p.rating - opts.rating) <= w && (opts.allowDone || !done[p.id]); });
      if (c.length) return c[Math.min(c.length - 1, Math.floor(rng() * c.length))];
    }
    return null;
  }

  /* 一輪嘅主題安排：推薦模式輪流用 4 個主題（洗牌），按主題練習就全部同一主題 */
  function planThemes(mode, theme, n, rng) {
    rng = rng || Math.random;
    var out = [];
    if (mode !== "recommended") { for (var i = 0; i < n; i++) out.push(theme); return out; }
    while (out.length < n) {
      var bag = RECOMMENDED.slice();
      for (var k = bag.length - 1; k > 0; k--) { var j = Math.floor(rng() * (k + 1)); var t = bag[k]; bag[k] = bag[j]; bag[j] = t; }
      out = out.concat(bag);
    }
    return out.slice(0, n);
  }

  /* 錯題本：ok=false 加入（已有就重設連勝為 0）；ok=true 而且在錯題本內 → 連勝 +1，到 2 就移出 */
  function updateWrongBook(wrong, id, puzzleRating, ok) {
    var list = wrong.map(function (w) { return { id: w.id, r: w.r, streak: w.streak }; });
    var idx = -1;
    list.forEach(function (w, i) { if (w.id === id) idx = i; });
    if (!ok) {
      if (idx >= 0) list[idx].streak = 0; else list.push({ id: id, r: puzzleRating, streak: 0 });
      return list;
    }
    if (idx < 0) return list;
    list[idx].streak += 1;
    if (list[idx].streak >= 2) list.splice(idx, 1);
    return list;
  }

  /* 錯題本用：用咗提示嘅題目，無論最後答啱定答錯，都當「未掌握」入錯題本（唔計連勝） */
  function countsAsCorrect(won, usedHint) { return won && !usedHint; }

  function markDone(done, id) {
    var list = done.filter(function (x) { return x !== id; });
    list.push(id);
    return list.slice(-MAX_DONE);
  }
  function pushHistory(history, entry) { return history.concat([entry]).slice(-MAX_HISTORY); }

  /* 主題顯示名稱：優先用該題 themes 入面第一個屬於指定主題嘅，否則第一個 */
  function mainTheme(p, preferred) {
    if (preferred && p.themes.indexOf(preferred) >= 0) return preferred;
    return p.themes[0];
  }

  return {
    THEME_NAMES: THEME_NAMES, ALL_THEMES: ALL_THEMES, RECOMMENDED: RECOMMENDED, START_RATING: START_RATING, WINDOW: WINDOW,
    expectedScore: expectedScore, kFactor: kFactor, applyResult: applyResult, fromRow: fromRow,
    bandStart: bandStart, bandFile: bandFile, bandsFor: bandsFor, selectPuzzle: selectPuzzle, planThemes: planThemes,
    updateWrongBook: updateWrongBook, countsAsCorrect: countsAsCorrect, markDone: markDone, pushHistory: pushHistory, mainTheme: mainTheme
  };
});
