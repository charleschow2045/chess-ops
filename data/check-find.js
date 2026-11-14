/* 找出將軍題庫：checks = 全部可以將軍嘅步（uci）。
 * 由 tools/gen-games.js 產生（固定種子）；請不要手改。 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.CheckFind = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  return [
    {"fen":"2b1kb1r/1rqppp1p/p5pn/1pB1PP2/1np1B1PP/1P6/2PPN3/RN1QK1R1 b Qk - 5 16","checks":["b4c2","b4d3"],"turn":"b","id":"ck-01"},
    {"fen":"rn1q1b2/1p1bk1p1/p1pNp2r/7p/P1B2PP1/4PP2/1PPP1K1R/R1BQ2N1 w - - 1 14","checks":["d6c8","d6f5"],"turn":"w","id":"ck-02"},
    {"fen":"rn1qkb1r/4pp1p/p1p2np1/1pPp1b2/1P6/P3PP2/3P1KPP/RNBQ1BNR b kq - 2 8","checks":["f6e4","f6g4"],"turn":"b","id":"ck-03"},
    {"fen":"rn3b1r/p2qpkpp/1pp4n/4Bp2/1P1Pb3/2P2PPP/P1QNBK2/R5NR w - - 0 15","checks":["c2b3","e2c4"],"turn":"w","id":"ck-04"},
    {"fen":"3qkbn1/1bppp1p1/r1n2p2/pp6/P1PNPPp1/7r/QP1P4/RNB2K1R b - - 0 17","checks":["h3f3","h3h1"],"turn":"b","id":"ck-05"},
    {"fen":"rnq1k2r/1pp3bp/4p2n/p2p2p1/b3Qp1P/PP1PPN2/2P2PP1/R1B1KBNR w KQkq - 1 12","checks":["e4a4","e4e6","e4g6"],"turn":"w","id":"ck-06"},
    {"fen":"r1bqkb1r/1p1ppppp/p1n5/2p3N1/2N3P1/1P2Pn2/P1P1KP1P/R1BQ1B1R b kq - 0 8","checks":["c6d4","f3d4","f3g1"],"turn":"b","id":"ck-07"},
    {"fen":"1rbq1knr/p2n3p/3p1pp1/1pp3B1/3Q2P1/NP3N1P/P1P1PP2/R3KB1R w KQ - 1 12","checks":["d4d6","d4f6","g5h6"],"turn":"w","id":"ck-08"},
    {"fen":"4kbn1/1bp2p1p/r2p1Bp1/pP6/2N1n1PP/3Pq3/P1P1PP2/1R1QK1NR b K - 0 15","checks":["e3d2","e3e2","e3f2"],"turn":"b","id":"ck-09"},
    {"fen":"1rb1rB2/pppp1kpp/7n/4pP2/N5Pq/1P1P1B1N/P2P1P1P/R2Q1RK1 b - - 0 15","checks":["h4f2","h4g3","h4g4"],"turn":"b","id":"ck-10"},
    {"fen":"1rb2br1/pp3ppp/3ppk1P/2p1n1Nq/1P1P1P2/P1P1B1P1/5K2/RN1Q1B1R w - - 0 15","checks":["d4e5","f4e5","g5e4","g5h7"],"turn":"w","id":"ck-11"},
    {"fen":"r1b1k2r/p1p1qp2/3p3P/1p2n3/N2PPp1n/1N4P1/1bPB1K2/R2Q1BR1 b kq - 2 17","checks":["b2d4","e5d3","e5g4","f4g3"],"turn":"b","id":"ck-12"},
    {"fen":"r2qkb1r/2pn1n1p/bp1P2p1/pP2pQ2/3P2P1/4P2B/P4P1P/RNB1K1NR w kq - 1 14","checks":["f5d7","f5e5","f5e6","f5f7"],"turn":"w","id":"ck-13"},
    {"fen":"5bnr/p2n1kp1/5p1p/q1p5/Q3Pp1P/NpP2B1b/PP1P2P1/R1B1K1NR w KQ - 2 19","checks":["a4b3","a4c4","a4d7","f3h5"],"turn":"w","id":"ck-14"},
    {"fen":"1n1qkbn1/2pbp1p1/2rBQ3/p4p1p/P2P3P/4r1P1/RPpNPP2/2K2BNR w - - 3 19","checks":["e6d7","e6e7","e6f7","e6g6"],"turn":"w","id":"ck-15"},
    {"fen":"1n1k2nr/1r1b3p/3b1pp1/p1pppqN1/PPp1PB2/R2P2K1/3N1PPP/4QB1R b - - 1 18","checks":["e5f4","f5f4","f5g4","f5g5","f5h3"],"turn":"b","id":"ck-16"},
    {"fen":"r1b1qbnr/p2kppp1/Bpnp4/2pQ3p/P3P3/R1P5/1P1P1PPP/1NB1K1NR w K - 0 10","checks":["a6c8","d5c6","d5d6","d5e6","d5f5"],"turn":"w","id":"ck-17"},
    {"fen":"rnb2kn1/pp1p1p2/4p2b/r1p3pp/PqPP2P1/3KBB1P/2Q1PP2/RN4NR b - - 3 15","checks":["b4a3","b4b3","b4c3","b4c4","b4d2"],"turn":"b","id":"ck-18"},
    {"fen":"r1bq3r/1ppp1kb1/2n1p3/pn3p1p/2P1N3/PP2PN2/5KPP/R1BQ1B1R w - - 2 18","checks":["d1d7","e4d6","e4g5","f3e5","f3g5"],"turn":"w","id":"ck-19"},
    {"fen":"1rb1kb1r/ppp2qpp/n2p3n/1N1Ppp2/Q7/2P4B/PP2PP1P/R3BKNR w k - 1 13","checks":["b5a3","b5a7","b5c7","b5d4","b5d6"],"turn":"w","id":"ck-20"}
  ];
});
