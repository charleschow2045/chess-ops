/* 騎士迷宮關卡：par = 食晒所有星嘅最少步數（BFS 計出）。
 * 由 tools/gen-games.js 產生（固定種子）；請不要手改。 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.MazeLevels = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  return [
    {"knight":"f8","stars":["b7","e6"],"black":[{"t":"b","sq":"d4"},{"t":"n","sq":"g1"},{"t":"r","sq":"h3"},{"t":"n","sq":"h8"}],"par":3,"id":"km-01"},
    {"knight":"a7","stars":["c7","d4"],"black":[{"t":"r","sq":"a2"},{"t":"b","sq":"a3"},{"t":"p","sq":"c3"},{"t":"r","sq":"f6"},{"t":"b","sq":"g4"}],"par":4,"id":"km-02"},
    {"knight":"c6","stars":["f3","g1","h3"],"black":[{"t":"p","sq":"d4"},{"t":"n","sq":"e6"},{"t":"b","sq":"f7"},{"t":"n","sq":"h7"}],"par":4,"id":"km-03"},
    {"knight":"f3","stars":["d1","f2"],"black":[{"t":"q","sq":"b4"},{"t":"r","sq":"b5"},{"t":"r","sq":"h7"},{"t":"b","sq":"h8"}],"par":6,"id":"km-04"},
    {"knight":"h8","stars":["a6","b4"],"black":[{"t":"p","sq":"d6"},{"t":"b","sq":"d8"},{"t":"n","sq":"e6"}],"par":7,"id":"km-05"},
    {"knight":"h4","stars":["d6","e3"],"black":[{"t":"r","sq":"a5"},{"t":"n","sq":"c6"},{"t":"b","sq":"g2"},{"t":"b","sq":"h8"}],"par":8,"id":"km-06"},
    {"knight":"d2","stars":["e2","e6","e8"],"black":[{"t":"r","sq":"b5"},{"t":"b","sq":"c2"},{"t":"b","sq":"g1"},{"t":"p","sq":"g4"}],"par":7,"id":"km-07"},
    {"knight":"g7","stars":["a3","e7","f4"],"black":[{"t":"n","sq":"a8"},{"t":"b","sq":"c8"},{"t":"n","sq":"e4"},{"t":"b","sq":"f2"}],"par":8,"id":"km-08"},
    {"knight":"f6","stars":["b7","e6","g6","g8"],"black":[{"t":"q","sq":"a1"},{"t":"r","sq":"d4"},{"t":"b","sq":"f2"}],"par":7,"id":"km-09"},
    {"knight":"d6","stars":["c4","f2","f4","g5"],"black":[{"t":"q","sq":"b7"},{"t":"r","sq":"h1"},{"t":"b","sq":"h5"}],"par":8,"id":"km-10"},
    {"knight":"c2","stars":["b3","e2","h2"],"black":[{"t":"r","sq":"a5"},{"t":"n","sq":"b6"},{"t":"n","sq":"d3"},{"t":"q","sq":"d8"}],"par":10,"id":"km-11"},
    {"knight":"c8","stars":["e6","f2","g1"],"black":[{"t":"b","sq":"d6"},{"t":"b","sq":"f1"}],"par":11,"id":"km-12"},
    {"knight":"c4","stars":["a1","f1"],"black":[{"t":"n","sq":"a2"},{"t":"q","sq":"d2"},{"t":"r","sq":"h6"}],"par":13,"id":"km-13"},
    {"knight":"e3","stars":["a4","b5","b8","c1"],"black":[{"t":"b","sq":"d8"},{"t":"r","sq":"h2"}],"par":12,"id":"km-14"},
    {"knight":"g3","stars":["b2","c2","g5","h4"],"black":[{"t":"b","sq":"c7"},{"t":"b","sq":"c8"},{"t":"r","sq":"d6"},{"t":"q","sq":"f7"},{"t":"n","sq":"g7"}],"par":14,"id":"km-15"}
  ];
});
