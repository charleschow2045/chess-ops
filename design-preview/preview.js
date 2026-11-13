/* 設計預覽：切換風格 A/B/C 同三個畫面。原創圖示（全部係自己畫嘅簡單 SVG，冇抄任何品牌圖案）。 */
(function () {
  "use strict";
  var CO = window.ChessOps;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

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

  /* 稱號盾牌：pips = 星點數 1–6 */
  function rankBadge(n) {
    var pips = "", rows = n <= 3 ? [n] : [3, n - 3];
    rows.forEach(function (cnt, r) {
      var y = rows.length === 1 ? 27 : 22 + r * 11;
      for (var i = 0; i < cnt; i++) {
        var x = 24 + (i - (cnt - 1) / 2) * 9;
        pips += '<circle cx="' + x + '" cy="' + y + '" r="3.2" fill="currentColor" stroke="none"/>';
      }
    });
    return '<svg viewBox="0 0 48 56" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M24 3 42 10v17c0 12-9 20-18 25C15 47 6 39 6 27V10z" fill="currentColor" fill-opacity=".16"/>' +
      '<path d="M16 14h16" stroke-width="2.6" stroke-linecap="round"/>' + pips + "</svg>";
  }

  /* ---------- 資料 ---------- */
  var TITLES = ["入門棋手", "俱樂部棋手", "候選大師", "國際棋聯大師", "國際大師", "特級大師"];
  var MODULES = [
    { h: 1, icon: "quiz",   name: "規則快測與小遊戲", sub: "棋子點樣走・快速小測驗" },
    { h: 2, icon: "three",  name: "走棋前三問",       sub: "走之前先停一停，避免送子" },
    { h: 3, icon: "puzzle", name: "戰術謎題 Tactics", sub: "謎題分 720・今日 2 / 3 題" },
    { h: 4, icon: "robot",  name: "對電腦下棋",       sub: "目前級別：第 3 級" },
    { h: 5, icon: "book",   name: "開局 Openings",    sub: "意大利開局 Italian Game 等" },
    { h: 6, icon: "flag",   name: "殘局 Endgames",    sub: "王兵殘局・兵升變" },
    { h: 7, icon: "log",    name: "我的對局 My Games", sub: "匯入 chess.com 棋譜，找出送子位置", wide: true }
  ];

  /* ---------- 棋盤（由 FEN 畫出） ---------- */
  var NAME = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
  function renderBoard(el, fen, opt) {
    opt = opt || {};
    var rows = fen.split(" ")[0].split("/"), grid = [];
    rows.forEach(function (row) {
      var line = [];
      row.split("").forEach(function (ch) {
        if (/\d/.test(ch)) { for (var i = 0; i < +ch; i++) line.push(null); } else line.push(ch);
      });
      grid.push(line);
    });
    var html = "";
    for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
      var name = "abcdefgh"[c] + (8 - r), ch = grid[r][c];
      var cls = "sq" + ((r + c) % 2 ? " d" : "") + (opt.last && opt.last.indexOf(name) >= 0 ? " hl" : "");
      html += '<div class="' + cls + '">' +
        (ch ? '<piece class="' + NAME[ch.toLowerCase()] + " " + (ch === ch.toUpperCase() ? "white" : "black") + '"></piece>' : "") +
        (c === 0 ? '<span class="co r">' + (8 - r) + "</span>" : "") + (r === 7 ? '<span class="co f">' + "abcdefgh"[c] + "</span>" : "") + "</div>";
    }
    el.className = "pv-board cg-wrap";
    el.innerHTML = html;
    if (opt.arrow) addArrow(el, opt.arrow[0], opt.arrow[1]);
  }
  function addArrow(el, from, to) {
    var f = function (s) { return { x: "abcdefgh".indexOf(s[0]) + 0.5, y: 8 - Number(s[1]) + 0.5 }; };
    var p = f(from), q = f(to), dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
    var bx = q.x - ux * 0.42, by = q.y - uy * 0.42, nx = -uy, ny = ux;
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("class", "arrows"); s.setAttribute("viewBox", "0 0 8 8");
    s.innerHTML = '<line x1="' + (p.x + ux * 0.25) + '" y1="' + (p.y + uy * 0.25) + '" x2="' + bx + '" y2="' + by + '" stroke="#f5b301" stroke-width=".17" stroke-linecap="round" opacity=".9"/>' +
      '<polygon points="' + [q.x - ux * 0.05, q.y - uy * 0.05, bx + nx * 0.3, by + ny * 0.3, bx - nx * 0.3, by - ny * 0.3].join(",") + '" fill="#f5b301" opacity=".9"/>';
    el.appendChild(s);
  }

  /* ---------- 三個畫面 ---------- */
  function homeHTML() {
    var cur = 0, xp = 740, need = 1000, pct = Math.round(xp / need * 100);
    var ladder = TITLES.map(function (t, i) {
      return '<div class="step ' + (i < cur ? "done" : i === cur ? "now" : "") + '">' + rankBadge(i + 1) + t + "</div>";
    }).join("");
    var tasks = [
      { done: false, main: "完成 3 條戰術謎題", small: "Tactics Puzzles・已完成 2 / 3", pts: "+30" },
      { done: false, main: "對電腦下 1 局（第 3 級）", small: "走每一步前，先問自己三條問題", pts: "+40" },
      { done: true,  main: "走棋前三問：連續 5 步做足", small: "已完成", pts: "+20" }
    ].map(function (t) {
      return '<div class="task ' + (t.done ? "done" : "") + '"><div class="tick">' + ICONS.check + '</div><div class="t-main">' + t.main + "<small>" + t.small + '</small></div><div class="reward">' + t.pts + " 經驗</div></div>";
    }).join("");
    var mods = MODULES.map(function (m) {
      return '<button class="mod' + (m.wide ? " wide" : "") + '" type="button"><span class="mod-ic" style="--h:var(--h' + m.h + ')">' + ICONS[m.icon] + '</span><span><span class="mod-name">' + m.name + '</span><span class="mod-sub" style="display:block">' + m.sub + "</span></span></button>";
    }).join("");
    return '<div class="home-head"><div class="brand"><div class="brand-logo">' + ICONS.pawn + '</div><div><h1>國際象棋 Ops</h1><p>每日練習，少送子、多留意</p></div></div>' +
      '<div class="streak">' + ICONS.spark + '<div><b>5</b><span>連續日數</span></div></div></div>' +
      '<section class="hero"><div class="hero-top"><div class="rank-badge">' + rankBadge(cur + 1) + '</div><div><div class="hero-label">目前稱號</div><div class="hero-title">' + TITLES[cur] + '</div>' +
      '<div class="hero-next">距離「' + TITLES[cur + 1] + '」還差 <b>' + (need - xp) + '</b> 經驗值</div></div></div>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div><div class="bar-meta"><span>經驗值 ' + xp + ' / ' + need + '</span><span>' + pct + '%</span></div>' +
      '<div class="ladder">' + ladder + "</div></section>" +
      '<h2 class="section-title">今日任務</h2><div class="tasks">' + tasks + "</div>" +
      '<h2 class="section-title">練習項目</h2><div class="modules">' + mods + "</div>";
  }

  function puzzleHTML() {
    return '<div class="sub-head"><button class="btn btn-back" type="button">‹ 返回</button><h2>戰術謎題<small>Tactics Puzzles</small></h2>' +
      '<div class="rating-pill"><b>720</b><span>謎題分</span></div></div>' +
      '<div class="tags"><span class="chip accent">捉雙 Fork</span><span class="chip">殘局 Endgame</span><span class="chip">1 步取勝</span></div>' +
      '<div id="pz-board"></div>' +
      '<div class="prompt"><span class="turn-dot"></span>白方走棋：找出最好嘅一步</div>' +
      '<div class="actions"><button class="btn" type="button" id="pz-hint">' + ICONS.bulb.replace('class="ic"', 'class="ic" style="width:24px;height:24px"') + ' 提示 Hint</button>' +
      '<button class="btn" type="button">看答案</button><button class="btn primary" type="button">下一題</button></div>' +
      '<div class="hint-text hidden" id="pz-hint-text">提示：留意黑王同黑車，有冇一隻子可以同時攻擊兩者？（捉雙 Fork）</div>' +
      '<div class="dots"><span>最近 6 題：</span><i class="ok"></i><i class="ok"></i><i class="bad"></i><i class="ok"></i><i class="ok"></i><i></i></div>';
  }

  function playHTML() {
    var lv = [1, 2, 3, 4, 5, 6, 7, 8].map(function (n) { return '<button class="lv" type="button" aria-pressed="' + (n === 3) + '">' + n + "</button>"; }).join("");
    return '<div class="sub-head"><button class="btn btn-back" type="button">‹ 返回</button><h2>對電腦下棋<small>Play the Computer</small></h2></div>' +
      '<div class="muted" style="margin:0 4px 6px">電腦級別（1 最易・8 最難）</div><div class="levels">' + lv + "</div>" +
      '<div class="player"><div class="avatar">' + ICONS.robot + '</div><div><b>電腦・第 <span id="lv-num">3</span> 級</b><span>黑方</span></div></div>' +
      '<div id="pl-board"></div>' +
      '<div class="player"><div class="avatar me">' + ICONS.pawn + '</div><div><b>你</b><span>白方</span></div></div>' +
      '<div class="turn-banner">輪到你走棋（白方）</div>' +
      '<div class="movelist"><b>1.</b>e4 e5 <b>2.</b>Nf3 Nc6 <b>3.</b>Bb5 a6 <b>4.</b>Ba4 Nf6</div>' +
      '<div class="actions four" style="margin-top:12px">' +
      '<button class="btn" type="button">' + ICONS.undo.replace('class="ic"', 'class="ic" style="width:24px;height:24px"') + ' 悔棋</button>' +
      '<button class="btn" type="button">' + ICONS.bulb.replace('class="ic"', 'class="ic" style="width:24px;height:24px"') + ' 提示</button>' +
      '<button class="btn danger" type="button">' + ICONS.resign.replace('class="ic"', 'class="ic" style="width:24px;height:24px"') + ' 認輸</button>' +
      '<button class="btn" type="button">' + ICONS.again.replace('class="ic"', 'class="ic" style="width:24px;height:24px"') + ' 新局</button></div>';
  }

  /* ---------- 切換 ---------- */
  var state = CO.State.loadState();
  var screens = { home: homeHTML, puzzle: puzzleHTML, play: playHTML };
  var current = (location.hash || "#home").slice(1);
  if (!screens[current]) current = "home";

  function show() {
    document.body.setAttribute("data-theme", state.settings.design);
    $$("[data-design]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-design") === state.settings.design)); });
    $$("[data-screen]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-screen") === current)); });
    var root = $("#screen");
    root.innerHTML = screens[current]();
    if (current === "puzzle") {
      renderBoard($("#pz-board"), CO.POSITIONS.puzzleFork);
      $("#pz-hint").onclick = function () {
        var shown = $("#pz-hint-text").classList.toggle("hidden") === false;
        renderBoard($("#pz-board"), CO.POSITIONS.puzzleFork, shown ? { arrow: ["d5", "c7"] } : {});
      };
    }
    if (current === "play") {
      renderBoard($("#pl-board"), CO.POSITIONS.playDemo, { last: ["g8", "f6"] });
      $$(".lv").forEach(function (b) {
        b.onclick = function () {
          $$(".lv").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
          b.setAttribute("aria-pressed", "true"); $("#lv-num").textContent = b.textContent;
          state.playLevel = Number(b.textContent); state = CO.State.saveState(state);
        };
      });
    }
  }
  $$("[data-design]").forEach(function (b) {
    b.addEventListener("click", function () { state.settings.design = b.getAttribute("data-design"); state = CO.State.saveState(state); show(); });
  });
  $$("[data-screen]").forEach(function (b) {
    b.addEventListener("click", function () { current = b.getAttribute("data-screen"); history.replaceState(null, "", "#" + current); show(); window.scrollTo(0, 0); });
  });
  show();
})();
