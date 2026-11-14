/*
 * 引擎管理（瀏覽器專用）：包住 js/engine.js 嘅 Engine，加上
 *   - 首次載入進度回報（onStatus："loading" → "ready"）
 *   - 載入逾時、搜尋逾時、Worker 出錯：自動重新載入並由目前局面再試（每次呼叫都帶住完整 FEN，所以等於「由目前局面繼續」）
 *   - 全部失敗：run() 拋出錯誤，並進入冷卻期（config.ENGINE.coolDownMs 內唔再等，即刻拋錯），
 *     呼叫者（pickMove、提示、檢討）要自己退回隨機合法步／顯示訊息，唔會卡死。
 *   - 同一時間只處理一個搜尋（內部排隊）
 *   const mgr = new ChessOps.EngineManager("vendor/stockfish/stockfish-19-lite-single.js", (state, detail) => …);
 *   await mgr.run(fen, {depth:12}) → { uci, info:{ depth, cp, mate, pv, ms } }
 *   mgr.bestMove(fen, search) → Promise<uci>（俾 pickMove 用）
 * 設定喺 js/config.js 嘅 ENGINE。
 */
(function (root) {
  "use strict";
  var CO = root.ChessOps;

  function EngineManager(url, onStatus) {
    this.url = url;
    this.onStatus = onStatus || function () {};
    this.engine = null;
    this.ready = false;
    this.loading = null;
    this.brokenAt = 0;
    this.loadMs = null;
    this._queue = Promise.resolve();
    this._gen = 0;                 // 每次 restart 加 1：舊一輪載入嘅逾時／結果唔可以影響新一輪
  }

  EngineManager.prototype._cfg = function () { return CO.Config.ENGINE; };
  EngineManager.prototype._status = function (state, detail) { try { this.onStatus(state, detail); } catch (e) { /* 忽略介面錯誤 */ } };

  EngineManager.prototype.ensure = function () {
    var self = this;
    if (this.ready) return Promise.resolve();
    if (this.loading) return this.loading;
    this._status("loading");
    var gen = this._gen;
    var e = new CO.Engine(this.url), t0 = Date.now(), timer;
    var timeout = new Promise(function (_, reject) { timer = setTimeout(function () { reject(new Error("引擎載入逾時")); }, self._cfg().initTimeoutMs); });
    this.loading = Promise.race([e.init(), timeout]).then(function () {
      clearTimeout(timer);
      if (gen !== self._gen) { e.terminate(); return; }
      self.engine = e; self.ready = true; self.loading = null; self.loadMs = Date.now() - t0;
      self._status("ready", self.loadMs);
    }, function (err) {
      clearTimeout(timer);
      e.terminate();
      if (gen === self._gen) { self.loading = null; self.ready = false; }
      throw err;
    });
    return this.loading;
  };

  EngineManager.prototype.restart = function () {
    this._gen++;
    if (this.engine) this.engine.terminate();
    this.engine = null; this.ready = false; this.loading = null;
  };

  /* 排隊執行一個搜尋；出錯會重新載入並重試 retries 次，最後失敗就拋錯 */
  EngineManager.prototype.run = function (fen, search, timeoutMs) {
    var self = this;
    var job = this._queue.then(function () { return self._runNow(fen, search, timeoutMs); });
    this._queue = job.then(function () {}, function () {});
    return job;
  };

  EngineManager.prototype._runNow = async function (fen, search, timeoutMs) {
    var cfg = this._cfg();
    if (this.brokenAt && Date.now() - this.brokenAt < cfg.coolDownMs) throw new Error("引擎暫時無法使用");
    for (var attempt = 0; attempt <= cfg.retries; attempt++) {
      try {
        await this.ensure();
        var limit = timeoutMs || cfg.moveTimeoutMs, timer;
        var guard = new Promise(function (_, reject) { timer = setTimeout(function () { reject(new Error("引擎無回應")); }, limit + 500); });
        var uci;
        try { uci = await Promise.race([this.engine.bestMove(fen, search, limit), guard]); } finally { clearTimeout(timer); }
        this.brokenAt = 0;
        return { uci: uci, info: this.engine.lastInfo };
      } catch (e) {
        this._status("recovering", attempt + 1);
        this.restart();
      }
    }
    this.brokenAt = Date.now();
    this._status("failed");
    throw new Error("引擎無法使用");
  };

  /* 同 Engine.bestMove 一樣嘅介面，俾 pickMove 用 */
  EngineManager.prototype.bestMove = function (fen, search) {
    return this.run(fen, search).then(function (r) { return r.uci; });
  };

  /* 取消目前搜尋（檢討中途取消用）；結果會照常回傳，由呼叫者忽略 */
  EngineManager.prototype.stop = function () { if (this.engine) this.engine.stop(); };

  /* 手動重新載入（冷卻期過後或者用戶按「重新載入引擎」） */
  EngineManager.prototype.reset = function () { this.brokenAt = 0; this.restart(); };

  root.ChessOps = root.ChessOps || {};
  root.ChessOps.EngineManager = EngineManager;
})(typeof self !== "undefined" ? self : this);
