/* 測試同設計預覽共用嘅局面。每條 FEN 都會喺 tests/run-all.js 用 chess.js 驗證。 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.POSITIONS = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  return {
    start: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    // 意大利開局中局（白先）
    middlegame: "r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7",
    // 設計預覽：捉雙 Fork（Nc7+ 同時攻擊王同車）
    puzzleFork: "r3k3/pp3ppp/2p5/3N4/8/8/PPP2PPP/R3K3 w - - 0 1",
    // 設計預覽：對電腦下棋（1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6）
    playDemo: "r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 2 5",
    // 「明顯送子」：黑象喺 d4 無保護，白馬可以免費食
    hangingPiece: "rnbqk2r/pppp1ppp/5n2/8/1b1bP3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 0 5"
  };
});
