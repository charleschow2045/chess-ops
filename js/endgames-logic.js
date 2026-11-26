/*
 * 殘局訓練嘅純邏輯（唔使 DOM、唔直接用引擎；tests/run-all.js 會測試）
 *
 * 課題（task）：
 *   mate     殺王（后、車、雙車）：白方要喺步數上限內將死黑王
 *   promote  王兵對王：白方贏 — 兵升變為后，而且之後 Stockfish 仍然判斷白方贏（后冇即刻被吃）
 *   judge    王兵對王：判斷局面「白方能贏」定「只能和棋」
 *
 * 步數上限 cap = 引擎最短將死步數 × 2 + 5，最多 50 步（config.ENDGAME）。
 * 星星：3 = 冇用提示而且步數 <= 引擎最短 + 3；2 = 冇用提示，喺上限內完成；1 = 用過提示但完成；失敗 = 0。
 *       判斷題：答對 3 星，答錯 0 星。
 * judge() 喺每一步之後判斷：繼續／成功／失敗（逼和、棋子被吃、重複局面、超過步數上限）／升變（要引擎判斷）。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./config.js"));
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.EndgamesLogic = factory(root.ChessOps.Config); }
})(typeof self !== "undefined" ? self : this, function (CFG) {
  "use strict";
  var E = CFG.ENDGAME;

  var REASON = {
    stalemate: "逼和了！對方沒有棋可走，變成和棋。",
    lostPiece: "棋子被對方的王吃掉了，變成和棋。",
    lostPawn: "兵被對方的王吃掉了，變成和棋。",
    repeat: "局面重複出現，變成和棋。",
    queenHang: "升變之後，后馬上被對方的王吃掉了，變成和棋。",
    stillDraw: "升變之後，局面仍然只是和棋。"
  };
  function capText(cap) { return "超過步數上限（" + cap + " 步），這次沒有成功。"; }

  /* 殺王步數上限 */
  function moveCap(shortest) { return Math.min(E.CAP_MAX, shortest * E.CAP_MULT + E.CAP_ADD); }

  /* 星星（只計完成嘅一次）：hints = 用咗幾多次提示；moves = 白方走咗幾步 */
  function stars(o) {
    if (!o || !o.success) return 0;
    if (o.hints > 0) return 1;
    return o.moves <= o.shortest + E.STAR3_EXTRA ? 3 : 2;
  }

  /* 白方非王棋子數目（升變唔會改變數目） */
  function whiteMaterial(game) {
    var n = 0;
    game.board().forEach(function (row) { row.forEach(function (p) { if (p && p.color === "w" && p.type !== "k") n++; }); });
    return n;
  }

  /*
   * 每步之後判斷。ctx = { task, moves（白方已走步數）, cap, startMaterial, sideJustMoved（"w"｜"b"）, promoted（最後一步係咪白方升變） }
   * 回傳 { status: "continue"｜"success"｜"fail"｜"promoted", reason?, text? }
   */
  function judge(game, ctx) {
    if (game.isCheckmate()) return ctx.sideJustMoved === "w" ? { status: "success" } : { status: "fail", reason: "mated", text: "被將死了。" };
    if (whiteMaterial(game) < ctx.startMaterial) return { status: "fail", reason: "lost", text: ctx.task === "promote" ? REASON.lostPawn : REASON.lostPiece };
    if (game.isStalemate()) return { status: "fail", reason: "stalemate", text: REASON.stalemate };
    if (game.isInsufficientMaterial() || game.isThreefoldRepetition() || game.isDrawByFiftyMoves()) return { status: "fail", reason: "repeat", text: REASON.repeat };
    if (ctx.task === "promote" && ctx.promoted) return { status: "promoted" };
    if (ctx.sideJustMoved === "b" && ctx.moves >= ctx.cap) return { status: "fail", reason: "cap", text: capText(ctx.cap) };
    return { status: "continue" };
  }

  /*
   * 王兵對王「贏」課題：升變之後（輪到黑方走，局面 game），info = Stockfish 分數（黑方角度：{cp, mate}）。
   * 贏 = 黑方被將死／引擎話黑方會被將死／白方分數 >= WIN_CP；否則失敗，並指出原因（后即刻被吃／仍然和棋）。
   */
  function promotionVerdict(game, info) {
    var mate = info && info.mate !== null && info.mate !== undefined ? info.mate : null;
    var whiteCp = info && info.cp !== null && info.cp !== undefined ? -info.cp : 0;
    if (mate !== null ? mate < 0 : whiteCp >= E.WIN_CP) return { win: true };
    var hang = game.moves({ verbose: true }).some(function (m) { return m.captured === "q"; });
    return { win: false, text: hang ? REASON.queenHang : REASON.stillDraw };
  }

  /* 更新某個局面嘅紀錄：{ stars 最佳星數, wins 成功次數, runs 嘗試次數, best 最少步數（0 = 未成功） } */
  function applyRun(entry, r) {
    var e = { stars: 0, wins: 0, runs: 0, best: 0 };
    if (entry) { e.stars = entry.stars | 0; e.wins = entry.wins | 0; e.runs = entry.runs | 0; e.best = entry.best | 0; }
    e.runs += 1;
    if (r.success) {
      e.wins += 1;
      e.stars = Math.max(e.stars, r.stars);
      if (r.moves > 0) e.best = e.best ? Math.min(e.best, r.moves) : r.moves;
    }
    return e;
  }

  /* 已取得星數／總星數（data = ChessOps.Endgames.TOPICS；state = loadState().endgames） */
  function totals(data, state) {
    var got = 0, all = 0;
    data.forEach(function (t) { t.positions.forEach(function (p) { all += 3; got += Math.min(3, (state.pos[p.id] || {}).stars | 0); }); });
    return { got: got, all: all };
  }

  return { REASON: REASON, capText: capText, moveCap: moveCap, stars: stars, whiteMaterial: whiteMaterial, judge: judge, promotionVerdict: promotionVerdict, applyRun: applyRun, totals: totals };
});
