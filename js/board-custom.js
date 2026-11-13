/*
 * 自己寫嘅棋盤（極簡版，接 chess.js）
 *   const b = new ChessOps.CustomBoard(el, { game, askPromotion, onMove });
 *   支援：點棋子再點格子、拖拉、最後一步高亮、合法步提示、升變選擇、翻轉棋盤、畫箭咀（SVG）
 *   外部改咗 game（悔棋、重置）之後呼叫 b.render()
 */
(function (root) {
  "use strict";
  var FILES = "abcdefgh";
  var NAME = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
  var SVGNS = "http://www.w3.org/2000/svg";

  function CustomBoard(el, opts) {
    this.el = el;
    this.game = opts.game;
    this.askPromotion = opts.askPromotion || function () { return Promise.resolve("q"); };
    this.onMove = opts.onMove || function () {};
    this.orientation = "w";
    this.selected = null;
    this.last = null;
    this.arrows = [];
    this.drag = null;
    this.busy = false;
    el.classList.add("cb", "cg-wrap");   // cg-wrap：棋子圖案嘅 CSS 規則係掛喺呢個 class 下面
    var self = this;
    el.addEventListener("pointerdown", function (e) { self._down(e); });
    el.addEventListener("pointermove", function (e) { self._move(e); });
    el.addEventListener("pointerup", function (e) { self._up(e); });
    el.addEventListener("pointercancel", function (e) { self._cancel(e); });
    this.render();
  }

  CustomBoard.prototype.flip = function () { this.orientation = this.orientation === "w" ? "b" : "w"; this.render(); };

  CustomBoard.prototype._dests = function (from) {
    var out = {};
    this.game.moves({ square: from, verbose: true }).forEach(function (m) { out[m.to] = m; });
    return out;
  };

  CustomBoard.prototype._sqFromPoint = function (x, y) {
    var t = document.elementFromPoint(x, y);
    var s = t && t.closest ? t.closest(".sq") : null;
    return s && this.el.contains(s) ? s.getAttribute("data-sq") : null;
  };

  CustomBoard.prototype.render = function () {
    var g = this.game, el = this.el, o = this.orientation;
    var dests = this.selected ? this._dests(this.selected) : {};
    var kingSq = null;
    if (g.inCheck()) {
      g.board().forEach(function (row) { row.forEach(function (p) { if (p && p.type === "k" && p.color === g.turn()) kingSq = p.square; }); });
    }
    var frag = document.createDocumentFragment();
    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        var f = o === "w" ? c : 7 - c, rk = o === "w" ? 7 - r : r;
        var name = FILES[f] + (rk + 1);
        var sq = document.createElement("div");
        sq.className = "sq" + ((f + rk) % 2 === 0 ? " dark" : "");
        sq.setAttribute("data-sq", name);
        if (this.last && (this.last[0] === name || this.last[1] === name)) sq.classList.add("last");
        if (this.selected === name) sq.classList.add("sel");
        if (kingSq === name) sq.classList.add("check");
        if (dests[name]) { sq.classList.add("hint"); if (dests[name].captured || dests[name].flags.indexOf("e") >= 0) sq.classList.add("cap"); }
        var p = g.get(name);
        if (p) {
          var pe = document.createElement("piece");
          pe.className = NAME[p.type] + " " + (p.color === "w" ? "white" : "black");
          sq.appendChild(pe);
        }
        if (c === 0) { var rc = document.createElement("span"); rc.className = "coord rank"; rc.textContent = String(rk + 1); sq.appendChild(rc); }
        if (r === 7) { var fc = document.createElement("span"); fc.className = "coord file"; fc.textContent = FILES[f]; sq.appendChild(fc); }
        frag.appendChild(sq);
      }
    }
    el.textContent = "";
    el.appendChild(frag);
    this._renderArrows();
  };

  /* ---------- 畫箭咀（SVG 覆蓋層）：drawArrow("e2","e4","#15781b") ---------- */
  CustomBoard.prototype.drawArrow = function (from, to, color) { this.arrows.push({ from: from, to: to, color: color || "#15781b" }); this._renderArrows(); };
  CustomBoard.prototype.clearArrows = function () { this.arrows = []; this._renderArrows(); };
  CustomBoard.prototype._center = function (sq) {
    var f = FILES.indexOf(sq[0]), rk = Number(sq[1]) - 1, o = this.orientation;
    return { x: (o === "w" ? f : 7 - f) + 0.5, y: (o === "w" ? 7 - rk : rk) + 0.5 };
  };
  CustomBoard.prototype._renderArrows = function () {
    var old = this.el.querySelector(".cb-arrows");
    if (old) old.remove();
    if (!this.arrows.length) return;
    var svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", "cb-arrows"); svg.setAttribute("viewBox", "0 0 8 8");
    var self = this;
    this.arrows.forEach(function (a) {
      var p = self._center(a.from), q = self._center(a.to);
      var dx = q.x - p.x, dy = q.y - p.y, len = Math.sqrt(dx * dx + dy * dy), ux = dx / len, uy = dy / len;
      var head = 0.42, w = 0.17;
      var bx = q.x - ux * head, by = q.y - uy * head;                  // 箭桿終點
      var line = document.createElementNS(SVGNS, "line");
      line.setAttribute("x1", p.x + ux * 0.25); line.setAttribute("y1", p.y + uy * 0.25);
      line.setAttribute("x2", bx); line.setAttribute("y2", by);
      line.setAttribute("stroke", a.color); line.setAttribute("stroke-width", w); line.setAttribute("stroke-linecap", "round"); line.setAttribute("opacity", "0.8");
      var tri = document.createElementNS(SVGNS, "polygon");
      var nx = -uy, ny = ux, hw = 0.3;
      tri.setAttribute("points", [q.x - ux * 0.05, q.y - uy * 0.05, bx + nx * hw, by + ny * hw, bx - nx * hw, by - ny * hw].join(","));
      tri.setAttribute("fill", a.color); tri.setAttribute("opacity", "0.8");
      svg.appendChild(line); svg.appendChild(tri);
    });
    this.el.appendChild(svg);
  };

  /* ---------- 輸入：點擊 + 拖拉（Pointer Events，iPad / 滑鼠通用） ---------- */
  CustomBoard.prototype._down = function (e) {
    if (this.busy || (e.pointerType === "mouse" && e.button !== 0)) return;
    var sqName = this._sqFromPoint(e.clientX, e.clientY);
    if (!sqName) return;
    var piece = this.game.get(sqName);
    var mine = piece && piece.color === this.game.turn();
    if (this.arrows.length) this.clearArrows();
    if (mine) {
      var wasSelected = this.selected === sqName;
      this.selected = sqName;
      this.drag = { from: sqName, x: e.clientX, y: e.clientY, moved: false, id: e.pointerId, wasSelected: wasSelected, ghost: null };
      try { this.el.setPointerCapture(e.pointerId); } catch (err) { /* 舊瀏覽器 */ }
      this.render();
      return;
    }
    if (this.selected && this._dests(this.selected)[sqName]) { this._tryMove(this.selected, sqName); return; }
    this.selected = null;
    this.render();
  };

  CustomBoard.prototype._move = function (e) {
    var d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) {
      d.moved = true;
      var srcSq = this.el.querySelector('.sq[data-sq="' + d.from + '"]');
      var srcPiece = srcSq && srcSq.querySelector("piece");
      if (srcPiece) {
        srcPiece.classList.add("dragging-src");
        var cls = srcPiece.className.replace('dragging-src', '').trim();
        var ghost = document.createElement('div');
        ghost.className = 'cb-ghost cg-wrap';                // cg-wrap：令 cburnett 嘅棋子圖案規則適用
        var size = srcSq.getBoundingClientRect().width * 1.25;
        ghost.style.width = ghost.style.height = size + 'px';
        var inner = document.createElement('piece');
        inner.className = cls;
        inner.style.cssText = 'position:absolute;inset:0;background-size:cover';
        ghost.appendChild(inner);
        document.body.appendChild(ghost);
        d.ghost = ghost;
      }
    }
    if (d.moved) {
      if (d.ghost) { d.ghost.style.left = e.clientX + "px"; d.ghost.style.top = e.clientY + "px"; }
      var over = this._sqFromPoint(e.clientX, e.clientY);
      var prev = this.el.querySelector(".sq.over");
      if (prev && prev.getAttribute("data-sq") !== over) prev.classList.remove("over");
      if (over) { var cur = this.el.querySelector('.sq[data-sq="' + over + '"]'); if (cur) cur.classList.add("over"); }
    }
  };

  CustomBoard.prototype._up = function (e) {
    var d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this._endDrag();
    if (d.moved) {
      var to = this._sqFromPoint(e.clientX, e.clientY);
      if (to && to !== d.from && this._dests(d.from)[to]) this._tryMove(d.from, to);
      else { this.selected = null; this.render(); }
    } else if (d.wasSelected) {            // 再點一下已選中嘅棋子 = 取消選擇
      this.selected = null; this.render();
    }
  };

  CustomBoard.prototype._cancel = function () { if (this.drag) { this._endDrag(); this.selected = null; this.render(); } };

  CustomBoard.prototype._endDrag = function () {
    var d = this.drag; this.drag = null;
    if (d && d.ghost) d.ghost.remove();
    try { this.el.releasePointerCapture(d.id); } catch (err) { /* 忽略 */ }
  };

  CustomBoard.prototype._tryMove = function (from, to) {
    var self = this;
    var cands = this.game.moves({ square: from, verbose: true }).filter(function (m) { return m.to === to; });
    if (!cands.length) return;
    var needPromo = cands.some(function (m) { return m.promotion; });
    var color = this.game.turn();
    this.busy = true;
    Promise.resolve(needPromo ? this.askPromotion(color) : undefined).then(function (promo) {
      self.busy = false;
      if (needPromo && !promo) { self.selected = null; self.render(); return; }       // 取消升變
      var mv = self.game.move({ from: from, to: to, promotion: promo });
      self.last = [from, to]; self.selected = null;
      self.render();
      self.onMove(mv);
    });
  };

  root.ChessOps = root.ChessOps || {};
  root.ChessOps.CustomBoard = CustomBoard;
})(typeof self !== "undefined" ? self : this);
