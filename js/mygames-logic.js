/*
 * 我的對局嘅純邏輯（唔使 DOM、唔直接連網絡；tests/run-all.js 會測試）
 *  - chess.com 對局篩選：只取最近 config.MYGAMES.DAYS 日、中速棋同快棋（config.MYGAMES.TIME_CLASSES）、標準規則、有 PGN，最多 MAX_GAMES 局
 *  - PGN 解析（chess.js loadPgn）、判斷用戶執邊方同結果
 *  - 我的謎題：局面＝走錯之前；答案＝引擎最佳步；其他走法勝率跌幅 < config.MYGAMES.ACCEPT_DROP 都當啱；最多保存 MAX_PUZZLES 題
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./config.js"), require("./review-logic.js"));
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.MyGames = factory(root.ChessOps.Config, root.ChessOps.ReviewLogic); }
})(typeof self !== "undefined" ? self : this, function (CFG, RV) {
  "use strict";
  var M = CFG.MYGAMES;

  /* chess.com 用戶名：3–25 個英數字、底線、連字號 */
  function cleanUser(s) {
    s = String(s || "").trim();
    return /^[A-Za-z0-9_-]{3,25}$/.test(s) ? s : "";
  }
  function archivesUrl(user) { return "https://api.chess.com/pub/player/" + encodeURIComponent(user.toLowerCase()) + "/games/archives"; }

  /* 用戶喺呢局嘅結果：win／loss／draw（chess.com 結果碼：win＝贏；其他非贏嘅對手結果＝對手贏） */
  function resultFor(game, color) {
    var me = color === "w" ? game.white : game.black, opp = color === "w" ? game.black : game.white;
    if (me && me.result === "win") return "win";
    if (opp && opp.result === "win") return "loss";
    return "draw";
  }

  /*
   * 篩選一個月嘅對局列表（chess.com games 陣列）。nowMs＝而家（毫秒）。
   * 回傳最新優先、最多 MAX_GAMES 局：{ id, url, pgn, tc, endTime, color, opp, result }
   */
  function filterGames(games, user, nowMs) {
    var u = user.toLowerCase(), minEnd = nowMs - M.DAYS * 86400000;
    var out = [];
    (games || []).forEach(function (g) {
      if (!g || g.rules !== "chess" || M.TIME_CLASSES.indexOf(g.time_class) < 0 || typeof g.pgn !== "string" || g.pgn.indexOf("[") < 0) return;
      if (!g.end_time || g.end_time * 1000 < minEnd) return;
      if (g.initial_setup && g.fen && g.initial_setup !== "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1") return;   // 唔係由標準開局起
      var wu = g.white && g.white.username ? String(g.white.username).toLowerCase() : "", bu = g.black && g.black.username ? String(g.black.username).toLowerCase() : "";
      var color = wu === u ? "w" : bu === u ? "b" : null;
      if (!color) return;
      out.push({ id: g.uuid || g.url || String(g.end_time), url: g.url || "", pgn: g.pgn, tc: g.time_class, endTime: g.end_time, color: color,
        opp: String(color === "w" ? g.black.username : g.white.username), result: resultFor(g, color) });
    });
    out.sort(function (a, b) { return b.endTime - a.endTime; });
    return out.slice(0, M.MAX_GAMES);
  }

  /* 一段文字可能有多局 PGN：喺每個「[Event 」標籤前切開 */
  function splitPgns(text) {
    var parts = String(text || "").replace(/\r\n/g, "\n").split(/\n(?=\[Event )/);
    return parts.map(function (p) { return p.trim(); }).filter(function (p) { return p.indexOf("[") === 0 || p.length > 20; });
  }

  function tag(pgn, name) { var m = new RegExp("\\[" + name + " \"([^\"]*)\"\\]").exec(pgn); return m ? m[1] : ""; }

  /*
   * 解析 PGN：回傳 { ucis, white, black, date（YYYY-MM-DD）, color（用戶名對得上就有，否則 null）, result }；唔支援就拋出錯誤（書面語）
   */
  function parsePgn(Chess, pgn, user) {
    if (/\[(SetUp|FEN) "/.test(pgn) || (/\[Variant "/.test(pgn) && !/\[Variant "(Standard|Live Chess)"/.test(pgn))) throw new Error("不支援從特殊局面開始或者變體的對局。");
    var g = new Chess();
    try { g.loadPgn(pgn); } catch (e) { throw new Error("無法讀取這局棋譜，PGN 格式可能有問題。"); }
    var hist = g.history({ verbose: true });
    if (hist.length < 2) throw new Error("這局的步數太少，無法分析。");
    var white = tag(pgn, "White"), black = tag(pgn, "Black"), u = (user || "").toLowerCase();
    var color = u && white.toLowerCase() === u ? "w" : u && black.toLowerCase() === u ? "b" : null;
    var d = (tag(pgn, "UTCDate") || tag(pgn, "Date")).replace(/\./g, "-");
    var res = tag(pgn, "Result");
    var result = null;
    if (color) result = res === "1-0" ? (color === "w" ? "win" : "loss") : res === "0-1" ? (color === "b" ? "win" : "loss") : "draw";
    return { ucis: hist.map(function (m) { return m.from + m.to + (m.promotion || ""); }), white: white, black: black, date: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "", color: color, result: result };
  }

  /* ---------- 我的謎題 ---------- */
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  /* m：RV.reviewGame 嘅一步（要有 fenBefore、bestUci） */
  function puzzleFromMove(m, side, date) {
    if (!m || !m.bestUci || !m.fenBefore) return null;
    var id = "m" + hash(m.fenBefore + m.bestUci).padStart(6, "0").slice(0, 10);
    return { id: id, fen: m.fenBefore, best: m.bestUci, bestSan: m.bestSan || "", cp: Math.max(-1000, Math.min(1000, Math.round(m.evalBefore))), side: side, date: date || "" };
  }
  /* 加入：回傳 { list, status: "added"|"dup"|"full" }（最多 MAX_PUZZLES 題，唔改動傳入陣列） */
  function addPuzzle(list, p) {
    if (list.some(function (x) { return x.id === p.id; })) return { list: list, status: "dup" };
    if (list.length >= M.MAX_PUZZLES) return { list: list, status: "full" };
    return { list: list.concat([p]), status: "added" };
  }
  function removePuzzle(list, id) { return list.filter(function (x) { return x.id !== id; }); }

  /*
   * 玩家走咗唔係最佳步嘅一步：夠唔夠好都當啱？
   * evalBefore＝走之前（玩家角度 cp）；evalAfter＝走完之後（玩家角度 cp，由引擎分析走完之後嘅局面換算）。
   * 勝率跌幅 < ACCEPT_DROP 就當啱。
   */
  function isAcceptable(evalBefore, evalAfter) { return RV.winDrop(evalBefore, evalAfter) < M.ACCEPT_DROP; }

  /* 最近分析過嘅對局摘要（只存摘要，唔存棋譜） */
  function summaryEntry(meta, counts) {
    return { date: meta.date || "", opp: meta.opp || "", color: meta.color, result: meta.result || "draw", tc: meta.tc === "rapid" || meta.tc === "blitz" ? meta.tc : "other",
      plies: meta.plies || 0, blunders: counts.blunder, mistakes: counts.mistake, inaccuracies: counts.inaccuracy };
  }

  return { cleanUser: cleanUser, archivesUrl: archivesUrl, resultFor: resultFor, filterGames: filterGames, splitPgns: splitPgns, parsePgn: parsePgn,
    puzzleFromMove: puzzleFromMove, addPuzzle: addPuzzle, removePuzzle: removePuzzle, isAcceptable: isAcceptable, summaryEntry: summaryEntry };
});
