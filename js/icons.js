/* 原創圖示（簡單 SVG，viewBox 48×48，用 currentColor 描線；冇抄任何品牌圖案）。由 design-preview 抽出，首頁同預覽共用。 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.Icons = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  /* ---------- 圖示（viewBox 48×48，用 currentColor 描線） ---------- */
  function svg(inner, extra) {
    return '<svg class="ic" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || "") + ">" + inner + "</svg>";
  }
  var ICONS = {
    // 1 規則快測與小遊戲：閃電
    quiz: svg('<path d="M27 5 11 27h11l-3 16 18-24H26z"/>'),
    // 2 走棋前三問：三行問題（圓點＋橫線）
    three: svg('<circle cx="10" cy="12" r="3.5"/><path d="M19 12h20"/><circle cx="10" cy="24" r="3.5"/><path d="M19 24h20"/><circle cx="10" cy="36" r="3.5"/><path d="M19 36h14"/>'),
    // 3 戰術謎題：燈泡
    puzzle: svg('<path d="M17 33c0-3-5-6-5-12a12 12 0 0 1 24 0c0 6-5 9-5 12z"/><path d="M18 39h12M20 44h8"/><path d="M24 14v8M20 18l4 4 4-4"/>'),
    // 4 對電腦下棋：機械人頭
    robot: svg('<rect x="8" y="15" width="32" height="24" rx="7"/><path d="M24 15V8"/><circle cx="24" cy="6" r="2.2"/><circle cx="17" cy="26" r="2.4"/><circle cx="31" cy="26" r="2.4"/><path d="M18 33h12M4 24v6M44 24v6"/>'),
    // 5 開局：打開嘅書
    book: svg('<path d="M24 12C19 8 11 8 5 10v28c6-2 14-2 19 2 5-4 13-4 19-2V10c-6-2-14-2-19 2z"/><path d="M24 12v28"/>'),
    // 6 殘局：終點旗
    flag: svg('<path d="M12 6v37"/><path d="M12 8c8-4 14 4 24 0v17c-10 4-16-4-24 0z"/>'),
    // 7 我的對局：記錄簿＋書籤
    log: svg('<rect x="9" y="5" width="30" height="38" rx="5"/><path d="M16 15h16M16 23h16M16 31h9"/><path d="M33 31v10l3-2.5 3 2.5V31" />'),
    check: svg('<path d="M10 25l9 9 19-20" stroke-width="5"/>'),
    spark: svg('<path d="M24 4c2 9 4 12 12 14-8 2-10 5-12 14-2-9-4-12-12-14 8-2 10-5 12-14z"/><path d="M36 30c1 4 2 6 6 7-4 1-5 3-6 7-1-4-2-6-6-7 4-1 5-3 6-7z" stroke-width="2.6"/>'),
    pawn: svg('<circle cx="24" cy="12" r="6"/><path d="M18 21h12M20 21c0 6-2 9-6 12h20c-4-3-6-6-6-12M12 40h24" />'),
    undo: svg('<path d="M14 18H30a9 9 0 0 1 0 18H18"/><path d="M20 10l-8 8 8 8"/>'),
    bulb: svg('<path d="M17 33c0-3-5-6-5-12a12 12 0 0 1 24 0c0 6-5 9-5 12z"/><path d="M18 39h12"/>'),
    resign: svg('<path d="M12 6v37"/><path d="M12 8h24l-6 8 6 8H12"/>'),
    again: svg('<path d="M38 24a14 14 0 1 1-5-10.7"/><path d="M36 5v10H26"/>')
  };


  return { svg: svg, ICONS: ICONS };
});
