/*
 * 電腦出棋速度（設定 settings.computerSpeed：slow 慢／medium 中／fast 快，預設慢；數值喺 config.COMPUTER_SPEED）＋「電腦走了…」文字
 *   Speed.current(state?)      → { key, label, pauseMin, pauseMax, anim }（冇傳 state：瀏覽器由儲存讀取設定）
 *   Speed.levelOf(key)         → 同上（key 唔啱就用預設）
 *   Speed.pauseMs(level, rng)  → 出棋前停頓（毫秒，pauseMin–pauseMax 之間隨機）
 *   Speed.describeMove(move, actor) → 「電腦走了 Nf6（g8 → f6）」；吃子加「，吃掉你的馬」；升變「，升變為后」；易位「，王側易位」；將軍「，將軍！」；將死「，將死！」
 * 適用於電腦同 App 自動走嘅對手步；玩家自己走棋嘅動畫唔受影響（board.js 預設 180ms）。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./config.js"));
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.Speed = factory(root.ChessOps.Config); }
})(typeof self !== "undefined" ? self : this, function (CFG) {
  "use strict";
  var S = CFG.COMPUTER_SPEED;
  var NAME = { p: "兵", n: "馬", b: "象", r: "車", q: "后", k: "王" };

  function levelOf(key) {
    var k = S.LEVELS[key] ? key : S.DEFAULT, l = S.LEVELS[k];
    return { key: k, label: l.label, pauseMin: l.pauseMin, pauseMax: l.pauseMax, anim: l.anim };
  }
  /* current(state)：有傳入 state 就用佢；否則喺瀏覽器由儲存讀取（讀唔到就用預設「慢」） */
  function current(state) {
    var key = S.DEFAULT;
    try {
      var g = typeof self !== "undefined" ? self : null;
      var st = state || (g && g.ChessOps && g.ChessOps.State && g.ChessOps.State.loadState());
      if (st && st.settings) key = st.settings.computerSpeed;
    } catch (e) { /* 用預設 */ }
    return levelOf(key);
  }
  function pauseMs(level, rng) { return level.pauseMin + (rng || Math.random)() * (level.pauseMax - level.pauseMin); }

  /* move＝chess.js 嘅 Move 物件；actor＝「電腦」（預設）或「對手」 */
  function describeMove(move, actor) {
    actor = actor || "電腦";
    var san = move.san.replace(/[+#]+$/, "");
    var text = actor + "走了 " + san + "（" + move.from + " → " + move.to + "）";
    if (move.flags.indexOf("k") >= 0) text += "，王側易位";
    else if (move.flags.indexOf("q") >= 0) text += "，后側易位";
    if (move.promotion) text += "，升變為" + NAME[move.promotion];
    if (move.captured) text += "，吃掉你的" + NAME[move.captured];
    if (/#$/.test(move.san)) text += "，將死！";
    else if (/\+$/.test(move.san)) text += "，將軍！";
    return text;
  }

  return { LEVELS: S.LEVELS, DEFAULT: S.DEFAULT, levelOf: levelOf, current: current, pauseMs: pauseMs, describeMove: describeMove };
});
