/*
 * Stockfish 引擎封裝（Web Worker，lite 單執行緒）。只喺瀏覽器用。
 *   const e = new ChessOps.Engine("vendor/stockfish/stockfish-19-lite-single.js");
 *   const t = await e.init();                       // → { workerStartMs, uciokMs, readyMs, totalMs, options:[...] }
 *   const r = await e.bestMove(fen, {depth:10});    // 回傳 uci 字串；e.lastInfo 有 { ms, depth, nodes }
 * search：{ depth, movetime, skill（Skill Level 0–20）, elo（UCI_Elo；有就開 UCI_LimitStrength） }
 */
(function (root) {
  "use strict";
  function Engine(url) {
    this.url = url;
    this.worker = null;
    this.listeners = [];
    this.options = [];
    this.lastInfo = null;
    this._applied = {};
  }

  Engine.prototype._send = function (cmd) { this.worker.postMessage(cmd); };

  Engine.prototype._waitFor = function (test, timeoutMs) {
    var self = this;
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { remove(); reject(new Error("引擎逾時")); }, timeoutMs || 60000);
      function remove() { clearTimeout(timer); self.listeners = self.listeners.filter(function (l) { return l !== fn; }); }
      function fn(line) {
        if (/^__error__/.test(line)) { remove(); reject(new Error(line)); return; }
        var r = test(line);
        if (r !== undefined && r !== false) { remove(); resolve(r); }
      }
      self.listeners.push(fn);
    });
  };

  Engine.prototype.init = function () {
    var self = this, t0 = performance.now(), marks = {};
    try { this.worker = new Worker(this.url); }
    catch (e) { return Promise.reject(e); }
    this.worker.onmessage = function (ev) {
      var line = typeof ev.data === "string" ? ev.data : (ev.data && ev.data.data) || "";
      if (/^option name /.test(line)) self.options.push(line);
      self.listeners.slice().forEach(function (fn) { fn(line); });
    };
    this.worker.onerror = function (ev) {
      self.listeners.slice().forEach(function (fn) { fn("__error__ " + (ev && ev.message)); });
    };
    marks.workerStartMs = Math.round(performance.now() - t0);
    var uciok = this._waitFor(function (l) { return l === "uciok" ? true : undefined; }, 90000);
    this._send("uci");
    return uciok.then(function () {
      marks.uciokMs = Math.round(performance.now() - t0);
      self._send("setoption name Hash value 16");
      var ready = self._waitFor(function (l) { return l === "readyok" ? true : undefined; }, 30000);
      self._send("isready");
      return ready;
    }).then(function () {
      marks.readyMs = Math.round(performance.now() - t0);
      marks.totalMs = marks.readyMs;
      marks.options = self.options.slice();
      return marks;
    });
  };

  Engine.prototype._applyStrength = function (search) {
    var want = {
      "Skill Level": search.skill != null ? String(search.skill) : "20",
      "UCI_LimitStrength": search.elo != null ? "true" : "false"
    };
    if (search.elo != null) want["UCI_Elo"] = String(search.elo);
    for (var k in want) {
      if (this._applied[k] !== want[k]) { this._send("setoption name " + k + " value " + want[k]); this._applied[k] = want[k]; }
    }
  };

  Engine.prototype.bestMove = function (fen, search) {
    var self = this, t0 = performance.now(), info = { depth: 0, nodes: 0, ms: 0 };
    search = search || { depth: 10 };
    this._applyStrength(search);
    var done = this._waitFor(function (l) {
      var m;
      if ((m = /^info .*\bdepth (\d+)/.exec(l))) { info.depth = +m[1]; var n = /\bnodes (\d+)/.exec(l); if (n) info.nodes = +n[1]; }
      if ((m = /^bestmove (\S+)/.exec(l))) return m[1];
      return undefined;
    }, 120000);
    this._send("ucinewgame");
    this._send("position fen " + fen);
    this._send("go " + (search.movetime ? "movetime " + search.movetime : "depth " + (search.depth || 10)));
    return done.then(function (uci) {
      info.ms = Math.round(performance.now() - t0);
      self.lastInfo = info;
      return uci;
    });
  };

  Engine.prototype.terminate = function () { if (this.worker) this.worker.terminate(); this.worker = null; };

  root.ChessOps = root.ChessOps || {};
  root.ChessOps.Engine = Engine;
})(typeof self !== "undefined" ? self : this);
