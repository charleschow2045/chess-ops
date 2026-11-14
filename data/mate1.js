/* 一步將死題庫：白方走棋，一步將死。mates = 全部能將死嘅步（uci）。level 1–4，由淺入深。
 * 由 tools/gen-games.js 產生（固定種子）；請不要手改。 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.Mate1 = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  return [
    {"fen":"5k2/4rP1Q/6b1/8/8/8/8/2K5 w - - 0 1","mates":["h7g8"],"piece":"q","white":2,"black":3,"id":"m1-01","level":1},
    {"fen":"8/8/N7/8/k7/8/KQ6/8 w - - 0 1","mates":["b2b4"],"piece":"q","white":2,"black":1,"id":"m1-02","level":1},
    {"fen":"7k/5Q1p/5pp1/6P1/8/8/3K4/8 w - - 0 1","mates":["f7f8"],"piece":"q","white":2,"black":4,"id":"m1-03","level":1},
    {"fen":"8/8/8/8/P1Q5/8/8/2B1k1K1 w - - 0 1","mates":["c4f1"],"piece":"q","white":3,"black":1,"id":"m1-04","level":1},
    {"fen":"8/8/3P4/1K6/2p5/k7/8/BQ6 w - - 0 1","mates":["b1b2"],"piece":"q","white":3,"black":2,"id":"m1-05","level":1},
    {"fen":"3K3k/5Q1p/2B5/3P4/8/8/8/8 w - - 0 1","mates":["f7f8"],"piece":"q","white":3,"black":2,"id":"m1-06","level":1},
    {"fen":"4k3/2Q3b1/8/8/2K5/BP6/8/8 w - - 0 1","mates":["c7e7"],"piece":"q","white":3,"black":2,"id":"m1-07","level":1},
    {"fen":"kb6/p7/p2B4/5K2/8/4Q3/8/8 w - - 0 1","mates":["e3e4","e3f3"],"piece":"q","white":2,"black":4,"id":"m1-08","level":1},
    {"fen":"4k3/2B2pr1/2pQ4/5P1K/8/8/8/8 w - - 0 1","mates":["d6d8"],"piece":"q","white":3,"black":4,"id":"m1-09","level":1},
    {"fen":"8/BP6/8/8/8/Qb1K4/p7/k1r5 w - - 0 1","mates":["a3c1"],"piece":"q","white":3,"black":4,"id":"m1-10","level":1},
    {"fen":"k7/ppp5/BQr5/8/8/6PK/8/8 w - - 0 1","mates":["b6b7"],"piece":"q","white":3,"black":5,"id":"m1-11","level":2},
    {"fen":"1bBk4/2pp4/4p2K/7P/8/8/3Q4/8 w - - 0 1","mates":["d2d7"],"piece":"q","white":3,"black":5,"id":"m1-12","level":2},
    {"fen":"8/8/8/4P3/8/2BQp1b1/3p2K1/2b1k3 w - - 0 1","mates":["d3f1"],"piece":"q","white":3,"black":5,"id":"m1-13","level":2},
    {"fen":"5B1k/5npp/6Qp/6P1/8/8/5K2/8 w - - 0 1","mates":["g6g7"],"piece":"q","white":3,"black":5,"id":"m1-14","level":2},
    {"fen":"2K5/8/4Q3/r7/B3P3/k1p5/pn6/8 w - - 0 1","mates":["e6b3"],"piece":"q","white":3,"black":5,"id":"m1-15","level":2},
    {"fen":"8/8/8/8/4R3/R3K3/8/4k3 w - - 0 1","mates":["a3a1"],"piece":"r","white":2,"black":1,"id":"m1-16","level":2},
    {"fen":"7k/7p/5RR1/8/8/4K3/8/8 w - - 0 1","mates":["f6f8"],"piece":"r","white":2,"black":2,"id":"m1-17","level":2},
    {"fen":"7k/3R4/8/1K6/R7/8/8/8 w - - 0 1","mates":["a4a8"],"piece":"r","white":2,"black":1,"id":"m1-18","level":2},
    {"fen":"7k/8/6R1/8/R7/8/1K6/8 w - - 0 1","mates":["a4h4"],"piece":"r","white":2,"black":1,"id":"m1-19","level":2},
    {"fen":"8/7N/8/8/8/2K1R3/7P/2k5 w - - 0 1","mates":["e3e1"],"piece":"r","white":3,"black":1,"id":"m1-20","level":2},
    {"fen":"8/8/8/8/4K3/1R6/B7/k1N5 w - - 0 1","mates":["b3b1"],"piece":"r","white":3,"black":1,"id":"m1-21","level":3},
    {"fen":"knR5/p7/8/6K1/8/1R6/8/8 w - - 0 1","mates":["b3b8","c8b8"],"piece":"r","white":2,"black":3,"id":"m1-22","level":3},
    {"fen":"8/4K3/8/R7/8/2r5/pR6/kn6 w - - 0 1","mates":["a5a2","b2a2"],"piece":"r","white":2,"black":4,"id":"m1-23","level":3},
    {"fen":"7k/3K1pRp/5Npp/8/8/8/8/5B2 w - - 0 1","mates":["g7g8","g7h7"],"piece":"r","white":3,"black":5,"id":"m1-24","level":3},
    {"fen":"k7/B7/1K4B1/8/8/8/8/8 w - - 0 1","mates":["g6e4"],"piece":"b","white":2,"black":1,"id":"m1-25","level":3},
    {"fen":"8/8/4B3/8/8/6B1/8/5K1k w - - 0 1","mates":["e6d5"],"piece":"b","white":2,"black":1,"id":"m1-26","level":3},
    {"fen":"1R6/k7/p2K4/Nr6/8/8/8/8 w - - 0 1","mates":["a5c6"],"piece":"n","white":2,"black":3,"id":"m1-27","level":3},
    {"fen":"5N1k/5Q2/7p/5K2/8/8/8/8 w - - 0 1","mates":["f7h7","f8g6"],"piece":"n","white":2,"black":2,"id":"m1-28","level":3},
    {"fen":"4B3/8/8/7K/8/6Q1/8/7k w - - 0 1","mates":["e8c6"],"piece":"b","white":2,"black":1,"id":"m1-29","level":3},
    {"fen":"3k4/3B1nB1/1pKpb3/8/8/8/8/8 w - - 0 1","mates":["g7f6"],"piece":"b","white":2,"black":5,"id":"m1-30","level":3},
    {"fen":"8/8/8/8/8/1Kp5/n7/kB3Q2 w - - 0 1","mates":["b1a2"],"piece":"b","white":2,"black":3,"id":"m1-31","level":4},
    {"fen":"8/8/8/8/8/1K5N/4R3/5k1N w - - 0 1","mates":["h1g3"],"piece":"n","white":3,"black":1,"id":"m1-32","level":4},
    {"fen":"8/8/1K6/8/8/1p3r2/2p5/2nkNQ2 w - - 0 1","mates":["e1f3"],"piece":"n","white":2,"black":5,"id":"m1-33","level":4},
    {"fen":"8/8/8/8/bNb3K1/kn6/2p5/1Q6 w - - 0 1","mates":["b4c2"],"piece":"n","white":2,"black":5,"id":"m1-34","level":4},
    {"fen":"8/8/8/8/8/5QnK/3p2p1/2N1k3 w - - 0 1","mates":["c1d3"],"piece":"n","white":2,"black":4,"id":"m1-35","level":4},
    {"fen":"krN5/npQ5/p7/8/8/8/8/K7 w - - 0 1","mates":["c8b6"],"piece":"n","white":2,"black":5,"id":"m1-36","level":4},
    {"fen":"3k4/8/4Q3/2K5/1B6/4P3/8/8 w - - 0 1","mates":["b4a5"],"piece":"b","white":3,"black":1,"id":"m1-37","level":4},
    {"fen":"1K6/1R6/k1N5/p2B4/8/8/8/8 w - - 0 1","mates":["d5c4"],"piece":"b","white":3,"black":2,"id":"m1-38","level":4},
    {"fen":"8/8/8/6K1/8/5pbB/5pRp/5N1k w - - 0 1","mates":["f1g3"],"piece":"n","white":3,"black":5,"id":"m1-39","level":4},
    {"fen":"8/K7/8/8/8/5RNr/4p1p1/5Nkr w - - 0 1","mates":["g3e2"],"piece":"n","white":3,"black":5,"id":"m1-40","level":4}
  ];
});
