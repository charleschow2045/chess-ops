/*
 * 儲存狀態（localStorage）
 *
 * ⚠️ 規則：
 *  1. 所有 localStorage key 一律以 chessops_ 開頭（見下面 KEYS）。
 *  2. 日後每加一個儲存欄位，必須喺 STATE_FIELDS 登記（預設值 + 檢查函數）。
 *     normalizeState() 只保留 STATE_FIELDS 入面嘅欄位，其他一律刪走；
 *     備份／還原都經過 normalizeState，所以漏登記 = 備份會漏。
 *  3. 唔好喺其他檔案直接用 localStorage，一律經 loadState() / saveState()。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.State = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var KEYS = {
    state: "chessops_state"
  };
  var SCHEMA_VERSION = 2;      // 第 6 階段：新增 daily、mygames 欄位，備份檔帶版本號
  var DAILY_KEEP = 60;         // 每日紀錄保留日數（同 config.DAILY.KEEP_DAYS 一致，tests 會核對）
  var MY_PUZZLES_MAX = 50, MY_RECENT_MAX = 5;

  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function int(v, min, max, dflt) {
    v = Math.round(Number(v));
    if (!isFinite(v)) return dflt;
    return Math.min(max, Math.max(min, v));
  }
  function oneOf(list, dflt) { return function (v) { return list.indexOf(v) >= 0 ? v : dflt; }; }
  function dateStr(v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ""; }

  /*
   * 成績記錄：每個項目 { best, plays }（最佳成績、完成次數）。項目 id 必須喺 RECORD_IDS 入面，其他一律刪走。
   *   quiz-*   規則快測各組：best = 最高答對題數（0–5）
   *   mate1-N  一步將死第 N 級（15 題一輪）：best = 最高答對題數（0–15）
   *   check-find 找出將軍（5 個局面一輪）：best = 最多完整找齊嘅局面數（0–5）
   *   maze     騎士迷宮：best = 已通關嘅最高關數（0–15）
   *   pawnwar  兵仗：best = 打贏過嘅最高電腦級別（0–4；兩人對戰唔計）
   */
  var RECORD_IDS = ["quiz-castling", "quiz-enpassant", "quiz-promotion", "quiz-mate", "quiz-draw", "quiz-check",
    "mate1-1", "mate1-2", "mate1-3", "mate1-4", "check-find", "maze", "pawnwar"];

  var OPENING_ROUTE_IDS = ["w-italian", "w-two-knights", "w-philidor", "b-italian", "b-scholar", "b-bishop"];
  /* 殘局局面 id：課題 id + "-" + 序號（1–8）。課題：后殺王 kqk、車殺王 krk、雙車 k2rk、王兵對王 kpk */
  var ENDGAME_IDS = [];
  ["kqk", "krk", "k2rk", "kpk"].forEach(function (t) { for (var i = 1; i <= 8; i++) ENDGAME_IDS.push(t + "-" + i); });

  var PUZZLE_THEMES = ["hangingPiece", "mateIn1", "fork", "pin", "mateIn2", "skewer", "discoveredAttack"];

  /* 白名單：欄位名 → { def: 預設值（函數，每次新建）, clean: 檢查／清洗函數 } */
  var STATE_FIELDS = {
    version: {
      def: function () { return SCHEMA_VERSION; },
      clean: function () { return SCHEMA_VERSION; }
    },
    // 稱號：稱號本身由現有數據計出（js/daily.js），唔儲存。index＝最高已經恭喜過嘅稱號（0 入門棋手 … 5 特級大師），用嚟令升稱號嘅恭喜畫面只出一次；xp 保留兼容舊資料
    rank: {
      def: function () { return { index: 0, xp: 0 }; },
      clean: function (v) {
        v = isObj(v) ? v : {};
        return { index: int(v.index, 0, 5, 0), xp: int(v.xp, 0, 10000000, 0) };
      }
    },
    // 連續日數
    streak: {
      def: function () { return { count: 0, lastDay: "" }; },
      clean: function (v) {
        v = isObj(v) ? v : {};
        return { count: int(v.count, 0, 100000, 0), lastDay: dateStr(v.lastDay) };
      }
    },
    // 設定
    settings: {
      def: function () { return { board: "chessground", design: "A", flipped: false, squareNames: false, threeReminder: true, computerSpeed: "slow" }; },
      clean: function (v) {
        v = isObj(v) ? v : {};
        return {
          board: oneOf(["chessground", "custom"], "chessground")(v.board),
          design: oneOf(["A", "B", "C"], "A")(v.design),
          flipped: v.flipped === true,
          squareNames: v.squareNames === true,
          threeReminder: v.threeReminder !== false,
          computerSpeed: oneOf(["slow", "medium", "fast"], "slow")(v.computerSpeed)
        };
      }
    },
    records: {
      def: function () { var r = {}; RECORD_IDS.forEach(function (id) { r[id] = { best: 0, plays: 0 }; }); return r; },
      clean: function (v) {
        v = isObj(v) ? v : {};
        var r = {};
        RECORD_IDS.forEach(function (id) {
          var e = isObj(v[id]) ? v[id] : {};
          r[id] = { best: int(e.best, 0, 100000, 0), plays: int(e.plays, 0, 1000000, 0) };
        });
        return r;
      }
    },
    /*
     * 戰術謎題（第 2 階段）：
     *   rating   謎題分（起始 700）；rated 已計分嘅題數（用嚟決定 K 值）
     *   done     做過嘅題目 id（最多保留最近 2000 個）
     *   wrong    錯題本：{ id, r（題目分，用嚟搵檔案）, streak（連續答啱次數，到 2 就移出） }
     *   history  最近 50 題紀錄：{ id, ok, hint, rated, theme, delta }
     */
    puzzles: {
      def: function () { return { rating: 700, rated: 0, done: [], wrong: [], history: [] }; },
      clean: function (v) {
        v = isObj(v) ? v : {};
        var seen = {};
        function pid(x) { return typeof x === "string" && /^[A-Za-z0-9]{5}$/.test(x); }
        var done = (Array.isArray(v.done) ? v.done : []).filter(function (x) { if (!pid(x) || seen[x]) return false; seen[x] = 1; return true; }).slice(-2000);
        var seenW = {};
        var wrong = (Array.isArray(v.wrong) ? v.wrong : []).filter(function (w) { if (!isObj(w) || !pid(w.id) || seenW[w.id]) return false; seenW[w.id] = 1; return true; })
          .slice(-500).map(function (w) { return { id: w.id, r: int(w.r, 0, 4000, 0), streak: int(w.streak, 0, 1, 0) }; });
        var history = (Array.isArray(v.history) ? v.history : []).filter(function (h) { return isObj(h) && pid(h.id); }).slice(-50).map(function (h) {
          return { id: h.id, ok: h.ok === true, hint: h.hint === true, rated: h.rated === true,
            theme: PUZZLE_THEMES.indexOf(h.theme) >= 0 ? h.theme : "", delta: int(h.delta, -200, 200, 0) };
        });
        return { rating: int(v.rating, 100, 3000, 700), rated: int(v.rated, 0, 1000000, 0), done: done, wrong: wrong, history: history };
      }
    },
    /*
     * 對電腦下棋（第 3 階段）。目前級別用下面嘅 playLevel。
     *   levels   各級紀錄：{ w 勝, d 和, l 負, streak 連贏（唔計用過悔棋／提示嘅勝局）, lstreak 連輸 }
     *   current  進行中嘅對局（中途離開自動保存）：{ level, color, moves（uci 序列）, undos, hints, usedUndo, usedHint }，冇就係 null
     *   recent   最近 20 局（新→舊）：{ date, level, color, result（win/loss/draw）, reason, pgn, blunders（未檢討就係 null）, plies }
     *            只存結果同 PGN，唔存分析過程
     */
    play: {
      def: function () { return { levels: defaultPlayLevels(), current: null, recent: [] }; },
      clean: function (v) {
        v = isObj(v) ? v : {};
        var levels = {}, lv = isObj(v.levels) ? v.levels : {};
        for (var l = 1; l <= 8; l++) {
          var e = isObj(lv[l]) ? lv[l] : {};
          levels[l] = { w: int(e.w, 0, 100000, 0), d: int(e.d, 0, 100000, 0), l: int(e.l, 0, 100000, 0), streak: int(e.streak, 0, 1000, 0), lstreak: int(e.lstreak, 0, 1000, 0) };
        }
        var current = null, c = v.current;
        if (isObj(c) && Array.isArray(c.moves)) {
          var mv = c.moves.filter(function (m) { return typeof m === "string" && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m); }).slice(0, 700);
          current = {
            level: int(c.level, 1, 8, 3), color: c.color === "b" ? "b" : "w", moves: mv,
            undos: int(c.undos, 0, 3, 0), hints: int(c.hints, 0, 3, 0), usedUndo: c.usedUndo === true, usedHint: c.usedHint === true
          };
        }
        var recent = (Array.isArray(v.recent) ? v.recent : []).filter(isObj).slice(0, 20).map(function (g) {
          return {
            date: dateStr(g.date), level: int(g.level, 1, 8, 3), color: g.color === "b" ? "b" : "w",
            result: oneOf(["win", "loss", "draw"], "draw")(g.result),
            reason: oneOf(["checkmate", "stalemate", "insufficient", "threefold", "fifty", "draw", "resign"], "draw")(g.reason),
            pgn: typeof g.pgn === "string" ? g.pgn.slice(0, 30000) : "",
            blunders: g.blunders === null || g.blunders === undefined ? null : int(g.blunders, 0, 500, 0),
            plies: int(g.plies, 0, 1000, 0)
          };
        });
        return { levels: levels, current: current, recent: recent };
      }
    },
    /*
     * 走棋前三問（第 4 階段）：plays 完成輪數；asked 累計作答條數；correct 累計答對條數（正確率 = correct / asked）
     */
    three: {
      def: function () { return { plays: 0, asked: 0, correct: 0 }; },
      clean: function (v) {
        v = isObj(v) ? v : {};
        var asked = int(v.asked, 0, 10000000, 0);
        return { plays: int(v.plays, 0, 10000000, 0), asked: asked, correct: Math.min(asked, int(v.correct, 0, 10000000, 0)) };
      }
    },
    /*
     * 開局訓練（第 4 階段）：
     *   routes  各路線：{ streak 連續全對次數（走錯就歸零）, mastered 已掌握（連續 3 次全對）, runs 完成次數 }
     *   quiz    開局原則小測：{ plays 完成次數, best 最高答對題數（0–10） }
     */
    openings: {
      def: function () { var r = {}; OPENING_ROUTE_IDS.forEach(function (id) { r[id] = { streak: 0, mastered: false, runs: 0 }; }); return { routes: r, quiz: { plays: 0, best: 0 } }; },
      clean: function (v) {
        v = isObj(v) ? v : {};
        var routes = {}, rv = isObj(v.routes) ? v.routes : {};
        OPENING_ROUTE_IDS.forEach(function (id) {
          var e = isObj(rv[id]) ? rv[id] : {};
          routes[id] = { streak: int(e.streak, 0, 1000, 0), mastered: e.mastered === true, runs: int(e.runs, 0, 1000000, 0) };
        });
        var q = isObj(v.quiz) ? v.quiz : {};
        return { routes: routes, quiz: { plays: int(q.plays, 0, 1000000, 0), best: int(q.best, 0, 10, 0) } };
      }
    },
    /*
     * 殘局訓練（第 5 階段）：pos 各局面紀錄（只存有紀錄嘅局面；id 必須喺 ENDGAME_IDS 入面，其他刪走）
     *   { stars 最佳星數（0–3）, wins 成功次數, runs 嘗試次數, best 最少步數（0 = 未成功；判斷題冇步數） }
     */
    endgames: {
      def: function () { return { pos: {} }; },
      clean: function (v) {
        v = isObj(v) ? v : {};
        var src = isObj(v.pos) ? v.pos : {}, pos = {};
        ENDGAME_IDS.forEach(function (id) {
          if (!isObj(src[id])) return;
          var e = src[id];
          var r = { stars: int(e.stars, 0, 3, 0), wins: int(e.wins, 0, 1000000, 0), runs: int(e.runs, 0, 1000000, 0), best: int(e.best, 0, 100000, 0) };
          r.runs = Math.max(r.runs, r.wins);
          pos[id] = r;
        });
        return { pos: pos };
      }
    },
    /*
     * 每日紀錄（第 6 階段）：days = { "YYYY-MM-DD": 當日紀錄 }，只保留最近 60 日。
     *   puz 完成謎題題數、puzOk 第一次就答對、pdelta 謎題分變化合計；mini 小練習次數；w／d／l 對電腦勝和負；eg 殘局新增星數；
     *   sec 練習秒數（只計頁面喺前景而且有操作）；done 當日任務全部完成
     */
    daily: {
      def: function () { return { days: {} }; },
      clean: function (v) {
        v = isObj(v) ? v : {};
        var src = isObj(v.days) ? v.days : {};
        var keys = Object.keys(src).filter(function (k) { return /^\d{4}-\d{2}-\d{2}$/.test(k) && isObj(src[k]); }).sort().slice(-DAILY_KEEP);
        var days = {};
        keys.forEach(function (k) {
          var e = src[k], puz = int(e.puz, 0, 100000, 0);
          days[k] = { puz: puz, puzOk: Math.min(puz, int(e.puzOk, 0, 100000, 0)), pdelta: int(e.pdelta, -3000, 3000, 0), mini: int(e.mini, 0, 100000, 0),
            w: int(e.w, 0, 100000, 0), d: int(e.d, 0, 100000, 0), l: int(e.l, 0, 100000, 0), eg: int(e.eg, 0, 1000, 0), sec: int(e.sec, 0, 86400, 0),
            done: e.done === true };
        });
        return { days: days };
      }
    },
    /*
     * 我的對局（第 6 階段）：
     *   user    chess.com 用戶名（只存喺本機）
     *   puzzles 我的謎題（最多 50 題）：{ id, fen（走錯之前）, best（引擎最佳步 uci）, bestSan, cp（走之前嘅評分，玩家角度）, side（w｜b）, date }
     *   recent  最近分析過嘅 5 局摘要：{ date, opp, color, result, tc（時限類型）, plies, blunders, mistakes, inaccuracies }
     */
    mygames: {
      def: function () { return { user: "", puzzles: [], recent: [] }; },
      clean: function (v) {
        v = isObj(v) ? v : {};
        var user = typeof v.user === "string" && /^[A-Za-z0-9_-]{3,25}$/.test(v.user) ? v.user : "";
        var seen = {};
        var puzzles = (Array.isArray(v.puzzles) ? v.puzzles : []).filter(function (p) {
          return isObj(p) && typeof p.id === "string" && /^m[0-9a-z]{4,12}$/.test(p.id) && !seen[p.id] && (seen[p.id] = 1) &&
            typeof p.fen === "string" && /^[prnbqkPRNBQK1-8\/]+ [wb] [KQkq-]+ [a-h1-8-]+ \d+ \d+$/.test(p.fen) && typeof p.best === "string" && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(p.best);
        }).slice(0, MY_PUZZLES_MAX).map(function (p) {
          return { id: p.id, fen: p.fen, best: p.best, bestSan: typeof p.bestSan === "string" ? p.bestSan.slice(0, 12) : "", cp: int(p.cp, -1000, 1000, 0), side: p.fen.split(" ")[1], date: dateStr(p.date) };
        });
        var recent = (Array.isArray(v.recent) ? v.recent : []).filter(isObj).slice(0, MY_RECENT_MAX).map(function (g) {
          return { date: dateStr(g.date), opp: typeof g.opp === "string" && /^[A-Za-z0-9_-]{1,25}$/.test(g.opp) ? g.opp : "", color: g.color === "b" ? "b" : "w",
            result: oneOf(["win", "loss", "draw"], "draw")(g.result), tc: oneOf(["rapid", "blitz", "other"], "other")(g.tc), plies: int(g.plies, 0, 1000, 0),
            blunders: int(g.blunders, 0, 500, 0), mistakes: int(g.mistakes, 0, 500, 0), inaccuracies: int(g.inaccuracies, 0, 500, 0) };
        });
        return { user: user, puzzles: puzzles, recent: recent };
      }
    },
    // 對電腦下棋：目前選擇嘅級別（1–8）
    playLevel: {
      def: function () { return 3; },
      clean: function (v) { return int(v, 1, 8, 3); }
    }
  };

  function defaultPlayLevels() { var o = {}; for (var l = 1; l <= 8; l++) o[l] = { w: 0, d: 0, l: 0, streak: 0, lstreak: 0 }; return o; }

  function defaultState() {
    var s = {};
    Object.keys(STATE_FIELDS).forEach(function (k) { s[k] = STATE_FIELDS[k].def(); });
    return s;
  }

  /* 只保留白名單欄位；缺嘅補預設；型別錯嘅清洗。輸入唔使可信。 */
  function normalizeState(raw) {
    var src = isObj(raw) ? raw : {};
    var out = {};
    Object.keys(STATE_FIELDS).forEach(function (k) {
      var f = STATE_FIELDS[k];
      out[k] = Object.prototype.hasOwnProperty.call(src, k) ? f.clean(src[k]) : f.def();
    });
    return out;
  }

  function storage() {
    try { return typeof localStorage !== "undefined" ? localStorage : null; } catch (e) { return null; }
  }

  function loadState() {
    var ls = storage();
    if (!ls) return defaultState();
    try { return normalizeState(JSON.parse(ls.getItem(KEYS.state))); }
    catch (e) { return defaultState(); }
  }

  function saveState(state) {
    var clean = normalizeState(state);
    var ls = storage();
    if (ls) { try { ls.setItem(KEYS.state, JSON.stringify(clean)); } catch (e) { /* 私隱模式或容量已滿 */ } }
    return clean;
  }

  /* 記錄一次完成嘅成績：plays + 1，best 取較高者。回傳已儲存嘅新狀態。 */
  function recordResult(state, id, score) {
    if (RECORD_IDS.indexOf(id) < 0) throw new Error("未登記的成績項目：" + id);
    var s = normalizeState(state);
    s.records[id].plays += 1;
    s.records[id].best = Math.max(s.records[id].best, int(score, 0, 100000, 0));
    return saveState(s);
  }

  /* 備份：輸出 JSON 字串；還原：解析後再 normalizeState */
  function exportBackup(state, now) {
    return JSON.stringify({ app: "chessops", version: SCHEMA_VERSION, exportedAt: (now || new Date()).toISOString(), state: normalizeState(state) }, null, 2);
  }
  /* 備份檔名：chessops-備份-日期.json（用本機日期） */
  function backupFileName(now) {
    now = now || new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return "chessops-backup-" + now.getFullYear() + "-" + p(now.getMonth() + 1) + "-" + p(now.getDate()) + ".json";
  }
  /* 檢查並解析備份：格式唔啱就拋出清楚講原因嘅錯誤（書面語），唔會寫入任何嘢 */
  function parseBackup(text) {
    if (typeof text !== "string" || !text.trim()) throw new Error("沒有內容可以匯入。請選擇備份檔案，或者貼上備份文字。");
    if (text.length > 3000000) throw new Error("內容太大（超過 3 MB），不是這個 App 的備份。");
    var obj;
    try { obj = JSON.parse(text); } catch (e) { throw new Error("內容不是有效的 JSON，可能複製不完整或者檔案已損壞。"); }
    if (!isObj(obj) || obj.app !== "chessops") throw new Error("這不是「國際象棋 Ops」的備份檔案（缺少 chessops 標記）。");
    if (typeof obj.version !== "number" || Math.floor(obj.version) !== obj.version || obj.version < 1) throw new Error("備份檔案沒有有效的版本號。");
    if (obj.version > SCHEMA_VERSION) throw new Error("這個備份來自較新的版本（版本 " + obj.version + "），請先更新 App 再匯入。");
    if (!isObj(obj.state)) throw new Error("備份檔案內沒有資料。");
    return normalizeState(obj.state);
  }
  /* 目前儲存資料大約佔用幾多位元組（UTF-8） */
  function sizeBytes(str) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str).length;
    var n = 0; for (var i = 0; i < str.length; i++) { var c = str.charCodeAt(i); n += c < 0x80 ? 1 : c < 0x800 ? 2 : 3; } return n;
  }
  function storedBytes() {
    var ls = storage();
    try { var v = ls ? ls.getItem(KEYS.state) : null; return v ? sizeBytes(v) : 0; } catch (e) { return 0; }
  }

  return {
    KEYS: KEYS, SCHEMA_VERSION: SCHEMA_VERSION, STATE_FIELDS: STATE_FIELDS, RECORD_IDS: RECORD_IDS, PUZZLE_THEMES: PUZZLE_THEMES, OPENING_ROUTE_IDS: OPENING_ROUTE_IDS, ENDGAME_IDS: ENDGAME_IDS, recordResult: recordResult,
    defaultState: defaultState, normalizeState: normalizeState,
    loadState: loadState, saveState: saveState, exportBackup: exportBackup, parseBackup: parseBackup, backupFileName: backupFileName, sizeBytes: sizeBytes, storedBytes: storedBytes,
    DAILY_KEEP: DAILY_KEEP, MY_PUZZLES_MAX: MY_PUZZLES_MAX, MY_RECENT_MAX: MY_RECENT_MAX
  };
});
