/*
 * 兵仗（純邏輯；配合 chess.js）
 * 雙方只有王同 8 隻兵（起始位置）。規則：
 *   1. 任何一隻兵走到對方底線，即時獲勝（唔使升變）。
 *   2. 將死對方，獲勝。
 *   3. 輪到走棋嘅一方冇合法步又未被將軍（逼和），或者出現其他和棋（三次重複、50 步等），和棋。
 *   4. 其餘照正常國際象棋規則（兵走法、吃過路兵、王不可以走入被攻擊嘅格）。
 * 因為 chess.js 要求兵到底線時指定升變棋子，棋盤用 promotion:"q" 自動處理，呢度只要見到 move.promotion 就當「到達底線」。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.PawnWar = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var START_FEN = "4k3/pppppppp/8/8/8/8/PPPPPPPP/4K3 w - - 0 1";

  /* game：剛走完 lastMove 之後嘅 chess.js 實例；回傳 { over, winner:"w"|"b"|null, reason } */
  function status(game, lastMove) {
    if (lastMove && lastMove.piece === "p" && lastMove.promotion) {
      return { over: true, winner: lastMove.color, reason: "reach" };
    }
    if (game.isCheckmate()) return { over: true, winner: game.turn() === "w" ? "b" : "w", reason: "mate" };
    if (game.isStalemate()) return { over: true, winner: null, reason: "stalemate" };
    if (game.isDraw()) return { over: true, winner: null, reason: "draw" };
    return { over: false, winner: null, reason: "" };
  }

  var REASON_TEXT = {
    reach: "兵走到對方底線",
    mate: "將死對方",
    stalemate: "逼和（無棋可走又沒有被將軍）",
    draw: "和棋"
  };

  return { START_FEN: START_FEN, status: status, REASON_TEXT: REASON_TEXT };
});
