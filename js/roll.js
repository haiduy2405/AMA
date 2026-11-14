/* Assistant Music AI — roll.js : piano roll + làn hợp âm + làn lời (canvas, cuộn bằng scroller native) */
(function () {
  'use strict';
  const G = globalThis;
  const MS = (G.MS = G.MS || {});
  const S = MS.S;
  const Store = MS.Store;
  const T = MS.Theory;

  const LO = 36, HI = 96;
  const ROWS = HI - LO + 1;
  const KEYW = 64, RULER = 24, CHORD_H = 36, LYR_H = 42, VEL_H = 64;
  const BLACK = [1, 3, 6, 8, 10];
  const hook = (n, ...a) => MS.hooks && MS.hooks[n] && MS.hooks[n](...a);
  const SECTION_COLORS = { Intro: '#38bdf8', Verse: '#a78bfa', 'Pre-Chorus': '#f472b6', Chorus: '#fbbf24', Bridge: '#34d399', Outro: '#fb7185' };

  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  class Roll {
    constructor(scroller, canvas, spacer, lyricInput) {
      this.sc = scroller;
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.spacer = spacer;
      this.lin = lyricInput;
      this.zx = 22;
      this.rowH = 16;
      this.viewW = 800;
      this.viewH = 500;
      this.dpr = 1;
      this.dirty = true;
      this.drag = null;
      this.hover = null;
      this.keyHold = null;
      this.editBar = null;
      this._bind();
      this.resize();
      this.scrollToPitch(72);
    }

    // ---------- hình học ----------
    get gridTop() { return RULER + CHORD_H; }
    get velH() { return S.velLane ? VEL_H : 0; }
    get gridH() { return this.viewH - this.gridTop - LYR_H - this.velH; }
    get scrollLeft() { return this.sc.scrollLeft; }
    get scrollTop() { return this.sc.scrollTop; }
    xOf(step) { return KEYW + step * this.zx - this.scrollLeft; }
    stepOf(x) { return (x - KEYW + this.scrollLeft) / this.zx; }
    yOf(p) { return this.gridTop + (HI - p) * this.rowH - this.scrollTop; }
    pitchOf(y) { return HI - Math.floor((y - this.gridTop + this.scrollTop) / this.rowH); }
    snapStep(raw, mode) {
      const s = S.snap;
      return (mode === 'round' ? Math.round(raw / s) : Math.floor(raw / s)) * s;
    }

    invalidate() { this.dirty = true; }

    resize() {
      const w = this.sc.clientWidth, h = this.sc.clientHeight;
      if (!w || !h) return;
      this.viewW = w;
      this.viewH = h;
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.cv.width = Math.round(w * this.dpr);
      this.cv.height = Math.round(h * this.dpr);
      this.cv.style.width = w + 'px';
      this.cv.style.height = h + 'px';
      this.spacer.style.marginTop = -h + 'px';
      this.updateSpacer();
      this.dirty = true;
    }
    updateSpacer() {
      const total = Store.totalSteps();
      this.spacer.style.width = KEYW + total * this.zx + 140 + 'px';
      this.spacer.style.height = ROWS * this.rowH + this.gridTop + LYR_H + this.velH + 'px';
    }
    scrollToPitch(p) {
      this.sc.scrollTop = Math.max(0, (HI - p) * this.rowH - this.gridH / 2);
    }
    ensureVisible(step) {
      const x = this.xOf(step);
      if (x < KEYW + 20 || x > this.viewW - 60) this.sc.scrollLeft = Math.max(0, step * this.zx - 80);
    }
    zoom(fx, fy) {
      if (fx) {
        const c = this.stepOf(KEYW + (this.viewW - KEYW) / 2);
        this.zx = Math.max(6, Math.min(90, this.zx * fx));
        this.updateSpacer();
        this.sc.scrollLeft = Math.max(0, c * this.zx - (this.viewW - KEYW) / 2);
      }
      if (fy) {
        const cp = this.pitchOf(this.gridTop + this.gridH / 2);
        this.rowH = Math.max(9, Math.min(30, this.rowH * fy));
        this.updateSpacer();
        this.scrollToPitch(cp);
      }
      this.dirty = true;
    }

    // ---------- vẽ ----------
    draw() {
      const c = this.ctx, W = this.viewW, H = this.viewH, d = this.dpr;
      c.setTransform(d, 0, 0, d, 0, 0);
      c.clearRect(0, 0, W, H);
      const song = Store.song;
      const total = song.bars * 16;
      const gt = this.gridTop, gh = this.gridH;
      const x0 = KEYW;

      // theo dõi playhead
      if (S.playStep != null && S.follow && !this.drag) {
        const x = this.xOf(S.playStep);
        if (x > W - 50 || x < KEYW) this.sc.scrollLeft = Math.max(0, S.playStep * this.zx - 70);
      }

      // ---- vùng lưới ----
      c.save();
      c.beginPath();
      c.rect(x0, gt, W - x0, gh);
      c.clip();
      const pTop = Math.min(HI, this.pitchOf(gt) + 1), pBot = Math.max(LO, this.pitchOf(gt + gh) - 1);
      for (let p = pTop; p >= pBot; p--) {
        const y = this.yOf(p);
        const pc = p % 12;
        const black = BLACK.includes(pc);
        c.fillStyle = black ? 'rgba(2,0,16,0.34)' : 'rgba(255,255,255,0.022)';
        c.fillRect(x0, y, W - x0, this.rowH);
        if (T.inScale(p, song.key, song.mode)) {
          c.fillStyle = (p - song.key + 120) % 12 === 0 ? 'rgba(34,211,238,0.13)' : 'rgba(139,92,246,0.075)';
          c.fillRect(x0, y, W - x0, this.rowH);
        }
        c.fillStyle = pc === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.04)';
        c.fillRect(x0, y + this.rowH - 1, W - x0, 1);
      }
      const s0 = Math.max(0, Math.floor(this.stepOf(x0))), s1 = Math.min(total, Math.ceil(this.stepOf(W)) + 1);
      for (let s = s0; s <= s1; s++) {
        const x = Math.round(this.xOf(s)) + 0.5;
        if (s % 16 === 0) { c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(x - 0.5, gt, 1.5, gh); }
        else if (s % 4 === 0) { c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(x - 0.5, gt, 1, gh); }
        else if (this.zx >= 14) { c.fillStyle = 'rgba(255,255,255,0.04)'; c.fillRect(x - 0.5, gt, 1, gh); }
      }
      // phần ngoài bài
      const xe = this.xOf(total);
      if (xe < W) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(Math.max(x0, xe), gt, W, gh); }
      // vùng lặp
      if (S.loop.on && S.loop.end > S.loop.start) {
        c.fillStyle = 'rgba(251,191,36,0.07)';
        c.fillRect(this.xOf(S.loop.start), gt, (S.loop.end - S.loop.start) * this.zx, gh);
      }

      // phát hiện nốt đang phát
      const playing = new Set();
      const ps = S.playStep;
      // ghost (phương án trợ lý)
      const cand = S.candidates[S.activeCand];
      if (cand) {
        cand.notes.forEach((n) => {
          const x = this.xOf(n.start), w = n.dur * this.zx;
          if (x + w < x0 || x > W) return;
          const y = this.yOf(n.pitch);
          rr(c, x + 1, y + 1, Math.max(3, w - 2), this.rowH - 2, 4);
          c.fillStyle = 'rgba(251,191,36,0.20)';
          c.fill();
          c.setLineDash([4, 3]);
          c.strokeStyle = 'rgba(251,191,36,0.95)';
          c.lineWidth = 1.2;
          c.stroke();
          c.setLineDash([]);
        });
      }
      // nốt
      const showName = this.rowH >= 14;
      song.notes.forEach((n) => {
        const x = this.xOf(n.start), w = n.dur * this.zx;
        if (x + w < x0 || x > W) return;
        const y = this.yOf(n.pitch);
        if (y + this.rowH < gt || y > gt + gh) return;
        const sel = S.selection.has(n.id);
        const on = ps != null && ps >= n.start && ps < n.start + n.dur;
        if (on) playing.add(n.pitch);
        const ww = Math.max(4, w - 2), hh = this.rowH - 2;
        c.save();
        if (sel || on) { c.shadowColor = on ? '#ffffff' : '#fbbf24'; c.shadowBlur = on ? 16 : 12; }
        rr(c, x + 1, y + 1, ww, hh, 4);
        const g = c.createLinearGradient(0, y, 0, y + this.rowH);
        const vv = n.vel / 127;
        if (sel) { g.addColorStop(0, '#fde68a'); g.addColorStop(1, '#f59e0b'); }
        else if (on) { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c4b5fd'); }
        else { g.addColorStop(0, `hsl(${262 + (1 - vv) * 30},90%,${68 + vv * 6}%)`); g.addColorStop(1, `hsl(${262 + (1 - vv) * 30},78%,${44 + vv * 8}%)`); }
        c.fillStyle = g;
        c.fill();
        c.restore();
        // highlight cạnh trên
        c.fillStyle = 'rgba(255,255,255,0.35)';
        c.fillRect(x + 4, y + 2, Math.max(0, ww - 6), 1);
        if (showName && w > 26) {
          c.fillStyle = sel ? '#3b2300' : 'rgba(255,255,255,0.92)';
          c.font = '600 9.5px "Be Vietnam Pro", system-ui, sans-serif';
          c.textBaseline = 'middle';
          c.fillText(T.noteName(n.pitch, T.useFlats(song.key, song.mode)), x + 5, y + this.rowH / 2 + 0.5);
        }
      });
      // khung chọn
      if (this.drag && this.drag.type === 'box') {
        const b = this.drag;
        const x = Math.min(b.x0, b.x1), y = Math.min(b.y0, b.y1), w = Math.abs(b.x1 - b.x0), h = Math.abs(b.y1 - b.y0);
        c.fillStyle = 'rgba(34,211,238,0.12)';
        c.fillRect(x, y, w, h);
        c.strokeStyle = 'rgba(34,211,238,0.9)';
        c.lineWidth = 1;
        c.strokeRect(x + 0.5, y + 0.5, w, h);
      }
      c.restore();

      // ---- đường playhead / con trỏ ----
      const lineTop = RULER, lineBot = gt + gh;
      c.save();
      c.beginPath();
      c.rect(x0, 0, W - x0, H);
      c.clip();
      if (ps != null) {
        const x = this.xOf(ps);
        c.shadowColor = '#22d3ee';
        c.shadowBlur = 14;
        const g = c.createLinearGradient(0, lineTop, 0, lineBot);
        g.addColorStop(0, '#a5f3fc');
        g.addColorStop(1, '#22d3ee');
        c.fillStyle = g;
        c.fillRect(x - 1, lineTop, 2.2, lineBot - lineTop);
      } else {
        const x = this.xOf(S.cursor);
        c.setLineDash([5, 4]);
        c.strokeStyle = 'rgba(34,211,238,0.75)';
        c.lineWidth = 1.4;
        c.beginPath();
        c.moveTo(Math.round(x) + 0.5, lineTop);
        c.lineTo(Math.round(x) + 0.5, lineBot);
        c.stroke();
        c.setLineDash([]);
      }
      c.restore();

      this._drawRuler(c, song, total);
      this._drawChordLane(c, song, total);
      this._drawLyricLane(c, song, total);
      this._drawVel(c, song);
      this._drawKeys(c, song, playing);
    }

    _velBw(n) { return Math.max(5, Math.min(n.dur * this.zx - 2, 14)); }
    _drawVel(c, song) {
      if (!this.velH) return;
      const W = this.viewW, h = this.velH, y0 = this.gridTop + this.gridH, x0 = KEYW;
      c.fillStyle = 'rgba(10,6,30,0.92)';
      c.fillRect(0, y0, W, h);
      c.fillStyle = 'rgba(255,255,255,0.16)';
      c.fillRect(0, y0, W, 1);
      c.save();
      c.beginPath();
      c.rect(x0, y0, W - x0, h);
      c.clip();
      [0.25, 0.5, 0.75, 1].forEach((f) => { c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(x0, y0 + h - 4 - (h - 10) * f, W - x0, 1); });
      const s0 = Math.max(0, Math.floor(this.stepOf(x0)) - 1), s1 = Math.ceil(this.stepOf(W)) + 1;
      for (let st = s0 - (s0 % 4); st <= s1; st += 4) { c.fillStyle = st % 16 === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.05)'; c.fillRect(Math.round(this.xOf(st)), y0, 1, h); }
      song.notes.forEach((n) => {
        const x = this.xOf(n.start);
        if (x > W || x < x0 - 20) return;
        const bw = this._velBw(n), bh = Math.max(3, (h - 10) * n.vel / 127), sel = S.selection.has(n.id);
        c.fillStyle = sel ? '#fbbf24' : `hsl(${262 + (1 - n.vel / 127) * 30},85%,64%)`;
        rr(c, x + 1, y0 + h - 4 - bh, bw, bh, 2);
        c.fill();
        c.fillStyle = 'rgba(255,255,255,0.55)';
        c.fillRect(x + 2, y0 + h - 4 - bh, Math.max(1, bw - 2), 2);
      });
      c.restore();
      c.fillStyle = 'rgba(226,232,255,0.7)';
      c.font = '600 11px "Be Vietnam Pro", system-ui, sans-serif';
      c.textBaseline = 'middle';
      c.fillText('Lực nhấn', 6, y0 + h / 2);
    }
    _velAt(h, first) {
      const gb = this.gridTop + this.gridH, ph = this.velH - 10, notes = Store.song.notes, d = this.drag;
      const vel = Math.max(5, Math.min(127, Math.round(127 * (gb + this.velH - 4 - h.y) / ph)));
      const hit = notes.filter((n) => { const x = this.xOf(n.start); return h.x >= x - 3 && h.x <= x + this._velBw(n) + 3; });
      if (first) d.sel = hit.length > 0 && hit.some((n) => S.selection.has(n.id)) && S.selection.size > 1;
      const tgt = d.sel ? notes.filter((n) => S.selection.has(n.id)) : hit;
      if (!tgt.length) return;
      if (!d.moved) { Store.checkpoint(); d.moved = true; }
      const ids = new Set(tgt.map((n) => n.id));
      Store.update((s) => s.notes.forEach((n) => { if (ids.has(n.id)) n.vel = vel; }), 'vel');
      if (!d.sel && first) { S.selection = new Set(hit.map((n) => n.id)); hook('selection'); }
    }
    _lockPitch(p) {
      const s = Store.song;
      if (!S.scaleLock || T.inScale(p, s.key, s.mode)) return p;
      for (const d of [1, -1, 2, -2]) if (T.inScale(p + d, s.key, s.mode)) return p + d;
      return p;
    }

    _drawRuler(c, song, total) {
      const W = this.viewW;
      c.fillStyle = 'rgba(14,10,38,0.92)';
      c.fillRect(0, 0, W, RULER);
      c.save();
      c.beginPath();
      c.rect(KEYW, 0, W - KEYW, RULER);
      c.clip();
      if (S.loop.on && S.loop.end > S.loop.start) {
        const x = this.xOf(S.loop.start), w = (S.loop.end - S.loop.start) * this.zx;
        const g = c.createLinearGradient(x, 0, x + w, 0);
        g.addColorStop(0, 'rgba(251,191,36,0.55)');
        g.addColorStop(1, 'rgba(251,146,60,0.55)');
        c.fillStyle = g;
        c.fillRect(x, RULER - 7, w, 7);
      }
      const b0 = Math.max(0, Math.floor(this.stepOf(KEYW) / 16) - 1), b1 = Math.min(song.bars, Math.ceil(this.stepOf(W) / 16));
      c.font = '600 11px "Be Vietnam Pro", system-ui, sans-serif';
      c.textBaseline = 'middle';
      for (let b = b0; b <= b1; b++) {
        const x = this.xOf(b * 16);
        c.fillStyle = 'rgba(255,255,255,0.25)';
        c.fillRect(Math.round(x), 4, 1, RULER - 4);
        if (b < song.bars) {
          c.fillStyle = 'rgba(226,232,255,0.8)';
          c.fillText(String(b + 1), x + 5, 9);
        }
        if (this.zx >= 20 && b < song.bars) {
          for (let q = 1; q < 4; q++) { c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(Math.round(x + q * 4 * this.zx), 14, 1, 6); }
        }
      }
      // nhãn đoạn
      song.sections.forEach((s) => {
        const x = this.xOf(s.bar * 16);
        if (x > W || x < KEYW - 120) return;
        const col = SECTION_COLORS[s.name] || '#94a3b8';
        const tw = c.measureText(s.name).width + 12;
        rr(c, x + 18, 2, tw, 15, 7);
        c.fillStyle = col;
        c.globalAlpha = 0.92;
        c.fill();
        c.globalAlpha = 1;
        c.fillStyle = '#12082e';
        c.fillText(s.name, x + 24, 9.5);
      });
      // marker con trỏ
      const cx = this.xOf(S.cursor);
      c.fillStyle = '#22d3ee';
      c.beginPath();
      c.moveTo(cx - 5, RULER - 8);
      c.lineTo(cx + 5, RULER - 8);
      c.lineTo(cx, RULER - 1);
      c.closePath();
      c.fill();
      c.restore();
      c.fillStyle = 'rgba(255,255,255,0.08)';
      c.fillRect(0, RULER - 1, W, 1);
      c.fillStyle = 'rgba(226,232,255,0.6)';
      c.font = '600 10px "Be Vietnam Pro", system-ui, sans-serif';
      c.fillText('Ô nhịp', 10, 12);
    }

    _drawChordLane(c, song, total) {
      const W = this.viewW, y0 = RULER, h = CHORD_H;
      c.fillStyle = 'rgba(30,22,70,0.78)';
      c.fillRect(0, y0, W, h);
      c.save();
      c.beginPath();
      c.rect(KEYW, y0, W - KEYW, h);
      c.clip();
      const flats = T.useFlats(song.key, song.mode);
      const b0 = Math.max(0, Math.floor(this.stepOf(KEYW) / 16)), b1 = Math.min(song.bars, Math.ceil(this.stepOf(W) / 16));
      for (let b = b0; b <= b1; b++) {
        c.fillStyle = 'rgba(255,255,255,0.10)';
        c.fillRect(Math.round(this.xOf(b * 16)), y0 + 4, 1, h - 8);
      }
      const drawChord = (ch, ghost) => {
        const x = this.xOf(ch.start), w = ch.dur * this.zx;
        if (x + w < KEYW || x > W) return;
        const sel = !ghost && S.selChord === ch.id;
        rr(c, x + 2, y0 + 4, Math.max(8, w - 4), h - 8, 8);
        c.save();
        if (sel) { c.shadowColor = '#fbbf24'; c.shadowBlur = 12; }
        if (ghost) {
          c.fillStyle = 'rgba(251,191,36,0.18)';
          c.fill();
          c.setLineDash([4, 3]);
          c.strokeStyle = 'rgba(251,191,36,0.95)';
          c.stroke();
          c.setLineDash([]);
        } else {
          const g = c.createLinearGradient(0, y0 + 4, 0, y0 + h - 4);
          if (sel) { g.addColorStop(0, '#fde68a'); g.addColorStop(1, '#f59e0b'); }
          else { g.addColorStop(0, '#22d3ee'); g.addColorStop(1, '#0e7490'); }
          c.fillStyle = g;
          c.fill();
        }
        c.restore();
        if (!ghost) { c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(x + 8, y0 + 6, Math.max(0, w - 16), 1); }
        c.fillStyle = ghost ? '#fde68a' : sel ? '#3b2300' : '#04222b';
        c.font = '700 13px "Be Vietnam Pro", system-ui, sans-serif';
        c.textBaseline = 'middle';
        c.fillText(T.chordName(ch, flats), x + 10, y0 + h / 2 + 0.5);
      };
      song.chords.forEach((ch) => drawChord(ch, false));
      const cand = S.candidates[S.activeCand];
      if (cand) cand.chords.forEach((ch) => drawChord(ch, true));
      // xem trước hợp âm đang cầm
      if (S.armed && this.hover && this.hover.zone === 'chord' && !this.drag) {
        const bar = Math.floor(this.hover.step / 16);
        if (bar >= 0 && bar < song.bars) {
          const x = this.xOf(bar * 16);
          rr(c, x + 2, y0 + 4, 16 * this.zx - 4, h - 8, 8);
          c.fillStyle = 'rgba(255,255,255,0.10)';
          c.fill();
          c.fillStyle = 'rgba(255,255,255,0.65)';
          c.font = '700 13px "Be Vietnam Pro", system-ui, sans-serif';
          c.fillText('+ ' + T.chordName(S.armed, flats), x + 10, y0 + h / 2 + 0.5);
        }
      }
      c.restore();
      c.fillStyle = 'rgba(226,232,255,0.7)';
      c.font = '600 11px "Be Vietnam Pro", system-ui, sans-serif';
      c.textBaseline = 'middle';
      c.fillText('Hợp âm', 10, y0 + h / 2);
      c.fillStyle = 'rgba(255,255,255,0.08)';
      c.fillRect(0, y0 + h - 1, W, 1);
    }

    _drawLyricLane(c, song, total) {
      const W = this.viewW, y0 = this.viewH - LYR_H, h = LYR_H;
      c.fillStyle = 'rgba(30,22,70,0.82)';
      c.fillRect(0, y0, W, h);
      c.fillStyle = 'rgba(255,255,255,0.10)';
      c.fillRect(0, y0, W, 1);
      c.save();
      c.beginPath();
      c.rect(KEYW, y0, W - KEYW, h);
      c.clip();
      const counts = new Map();
      song.notes.forEach((n) => { const b = Math.floor(n.start / 16); counts.set(b, (counts.get(b) || 0) + 1); });
      const b0 = Math.max(0, Math.floor(this.stepOf(KEYW) / 16)), b1 = Math.min(song.bars - 1, Math.ceil(this.stepOf(W) / 16));
      for (let b = b0; b <= b1; b++) {
        const x = this.xOf(b * 16), w = 16 * this.zx;
        c.fillStyle = 'rgba(255,255,255,0.10)';
        c.fillRect(Math.round(x), y0 + 3, 1, h - 6);
        const txt = (song.lyrics[b] || '').trim();
        const hot = this.editBar === b;
        if (hot) { c.fillStyle = 'rgba(251,191,36,0.12)'; c.fillRect(x + 1, y0 + 1, w - 1, h - 2); }
        if (txt) {
          c.font = '500 13px "Be Vietnam Pro", system-ui, sans-serif';
          c.textBaseline = 'middle';
          c.fillStyle = '#f5f3ff';
          let t = txt;
          const maxW = w - 10;
          if (c.measureText(t).width > maxW) {
            while (t.length > 1 && c.measureText(t + '…').width > maxW) t = t.slice(0, -1);
            t += '…';
          }
          c.fillText(t, x + 6, y0 + 15);
          const syl = T.vnSyllables(txt), nn = counts.get(b) || 0;
          c.font = '600 10px "Be Vietnam Pro", system-ui, sans-serif';
          c.fillStyle = syl === nn ? '#6ee7b7' : '#fbbf24';
          c.fillText(`${syl} tiếng / ${nn} nốt`, x + 6, y0 + 31);
        } else if (this.zx >= 16) {
          c.font = '500 11px "Be Vietnam Pro", system-ui, sans-serif';
          c.textBaseline = 'middle';
          c.fillStyle = 'rgba(226,232,255,0.22)';
          c.fillText('+ lời', x + 6, y0 + h / 2);
        }
      }
      c.restore();
      c.fillStyle = 'rgba(226,232,255,0.7)';
      c.font = '600 11px "Be Vietnam Pro", system-ui, sans-serif';
      c.textBaseline = 'middle';
      c.fillText('Lời', 10, y0 + h / 2);
    }

    _drawKeys(c, song, playing) {
      const gt = this.gridTop, gh = this.gridH;
      c.save();
      c.beginPath();
      c.rect(0, gt, KEYW, gh);
      c.clip();
      c.fillStyle = 'rgba(12,8,34,0.95)';
      c.fillRect(0, gt, KEYW, gh);
      const pTop = Math.min(HI, this.pitchOf(gt) + 1), pBot = Math.max(LO, this.pitchOf(gt + gh) - 1);
      const flats = T.useFlats(song.key, song.mode);
      for (let p = pTop; p >= pBot; p--) {
        const y = this.yOf(p), pc = p % 12, black = BLACK.includes(pc);
        const act = S.activePitches.has(p) || playing.has(p) || (this.keyHold === p);
        const kw = black ? KEYW * 0.62 : KEYW - 2;
        const g = c.createLinearGradient(0, 0, kw, 0);
        if (act) { g.addColorStop(0, '#22d3ee'); g.addColorStop(1, '#a78bfa'); }
        else if (black) { g.addColorStop(0, '#0b0820'); g.addColorStop(1, '#2b2557'); }
        else { g.addColorStop(0, '#d9d4ff'); g.addColorStop(1, '#fbfaff'); }
        c.fillStyle = g;
        c.fillRect(0, y + 0.5, kw, this.rowH - 1);
        if (act) { c.save(); c.shadowColor = '#22d3ee'; c.shadowBlur = 10; c.fillRect(0, y + 0.5, kw, this.rowH - 1); c.restore(); }
        if (!black) { c.fillStyle = 'rgba(40,30,90,0.25)'; c.fillRect(0, y + this.rowH - 1, KEYW, 1); }
        if (pc === 0 || (this.rowH >= 14 && T.inScale(p, song.key, song.mode) && (p - song.key + 120) % 12 === 0)) {
          c.fillStyle = act ? '#06202b' : '#4c3f9c';
          c.font = '700 10px "Be Vietnam Pro", system-ui, sans-serif';
          c.textBaseline = 'middle';
          c.fillText(T.noteName(p, flats), KEYW - 26, y + this.rowH / 2 + 0.5);
        }
      }
      c.restore();
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.fillRect(KEYW - 1, gt, 1, gh);
    }

    // ---------- tương tác ----------
    _bind() {
      const cv = this.cv;
      cv.addEventListener('pointerdown', (e) => this._down(e));
      cv.addEventListener('pointermove', (e) => this._move(e));
      cv.addEventListener('pointerup', (e) => this._up(e));
      cv.addEventListener('pointercancel', (e) => this._up(e));
      cv.addEventListener('pointerleave', () => { this.hover = null; this.dirty = true; });
      cv.addEventListener('contextmenu', (e) => e.preventDefault());
      cv.addEventListener('click', () => {
        if (this.pendingLyric != null) { const b = this.pendingLyric; this.pendingLyric = null; this.editLyric(b); }
      });
      cv.addEventListener('dblclick', (e) => {
        if (this.lastType !== 'mouse') return; // chỉ PC; điện thoại chạm 1 lần là chọn
        const h = this._hit(e);
        if (h.zone === 'chord' && h.chord) hook('chordEdit', h.chord);
      });
      this.sc.addEventListener('scroll', () => { this.dirty = true; if (this.lin.style.display === 'block') this._placeEditor(); });
      this.sc.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, 0); }
        else if (e.altKey) { e.preventDefault(); this.zoom(0, e.deltaY < 0 ? 1.1 : 1 / 1.1); }
      }, { passive: false });
      if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(this.sc);
      else window.addEventListener('resize', () => this.resize());
      this.lin.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this._commitLyric(0); }
        else if (e.key === 'Tab') { e.preventDefault(); this._commitLyric(e.shiftKey ? -1 : 1); }
        else if (e.key === 'Escape') { this._closeEditor(); }
        e.stopPropagation();
      });
      this.lin.addEventListener('blur', () => { if (this.editBar !== null) this._commitLyric(null); });
    }

    _pos(e) {
      const r = this.cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    _noteAt(x, y) {
      const notes = Store.song.notes;
      for (let i = notes.length - 1; i >= 0; i--) {
        const n = notes[i];
        const nx = this.xOf(n.start), w = n.dur * this.zx, ny = this.yOf(n.pitch);
        if (x >= nx && x <= nx + w && y >= ny && y <= ny + this.rowH) return { note: n, edge: w > 12 && x > nx + w - 7 };
      }
      return null;
    }
    _chordAt(x) {
      const s = this.stepOf(x);
      const ch = Store.song.chords.find((c) => s >= c.start && s < c.start + c.dur);
      if (!ch) return null;
      return { chord: ch, edge: x > this.xOf(ch.start + ch.dur) - 8 };
    }
    _hit(e) {
      const { x, y } = this._pos(e);
      const h = { x, y, step: this.stepOf(x) };
      if (y < RULER) h.zone = x < KEYW ? 'corner' : 'ruler';
      else if (y < RULER + CHORD_H) { h.zone = x < KEYW ? 'corner' : 'chord'; if (x >= KEYW) { const ca = this._chordAt(x); if (ca) { h.chord = ca.chord; h.edge = ca.edge; } } }
      else if (y >= this.viewH - LYR_H) h.zone = x < KEYW ? 'corner' : 'lyric';
      else if (this.velH && y >= this.gridTop + this.gridH) h.zone = x < KEYW ? 'corner' : 'vel';
      else if (x < KEYW) { h.zone = 'keys'; h.pitch = this.pitchOf(y); }
      else {
        h.zone = 'grid';
        h.pitch = this.pitchOf(y);
        const na = this._noteAt(x, y);
        if (na) { h.note = na.note; h.edge = na.edge; }
      }
      return h;
    }

    // ----- cảm ứng: 2 ngón = cuộn + zoom ngang -----
    _touchDown(e) {
      this.tp = this.tp || new Map();
      this.tp.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.tp.size === 2) {
        const d = this.drag;
        if (d && d.type === 'create' && !d.moved) { MS.Store.undo(); S.selection = new Set(); }
        else if (d && d.moved) { /* giữ nguyên thay đổi đã làm */ }
        this.drag = null;
        const [a, b] = [...this.tp.values()];
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
        this.dirty = true;
        return true;
      }
      return this.tp.size > 2;
    }
    _touchMove(e) {
      const t = this.tp && this.tp.get(e.pointerId);
      if (!t) return false;
      t.x = e.clientX; t.y = e.clientY;
      if (this.tp.size >= 2 && this.pinch) {
        const [a, b] = [...this.tp.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        this.sc.scrollLeft -= mx - this.pinch.mx;
        this.sc.scrollTop -= my - this.pinch.my;
        const r = d / this.pinch.d;
        if (Math.abs(r - 1) > 0.015) { this.zoom(r, 0); this.pinch.d = d; }
        this.pinch.mx = mx; this.pinch.my = my;
        this.dirty = true;
        return true;
      }
      return false;
    }
    _touchUp(e) {
      if (!this.tp) return;
      this.tp.delete(e.pointerId);
      if (this.tp.size < 2) this.pinch = null;
    }

    _down(e) {
      this.lastType = e.pointerType || 'mouse';
      if (e.pointerType === 'touch' && this._touchDown(e)) return;
      this.cv.setPointerCapture(e.pointerId);
      const h = this._hit(e);
      const right = e.button === 2 && e.pointerType === 'mouse';
      if (!MS.Audio.ctx) MS.Audio.ensure();
      this._closeEditor(true);
      const song = Store.song;
      const total = song.bars * 16;
      if (h.zone === 'keys') {
        if (h.pitch >= LO && h.pitch <= HI) { this.keyHold = h.pitch; MS.Input.noteOn(h.pitch, 92); }
        this.drag = { type: 'key', pitch: h.pitch };
        this.dirty = true;
        return;
      }
      if (h.zone === 'ruler') {
        const step = Math.max(0, Math.min(total, this.snapStep(h.step, 'round')));
        if (e.shiftKey) {
          const b = Math.max(0, Math.min(song.bars - 1, Math.floor(h.step / 16)));
          this.drag = { type: 'loop', anchor: b };
          S.loop = { on: true, start: b * 16, end: b * 16 + 16 };
          hook('loopChanged');
        } else {
          this.drag = { type: 'scrub' };
          S.cursor = step;
          hook('seek', step);
        }
        this.dirty = true;
        return;
      }
      if (h.zone === 'chord') {
        if (right) { if (h.chord) this._deleteChord(h.chord.id); return; }
        if (h.chord) {
          S.selChord = h.chord.id;
          hook('chordSelect', h.chord);
          const ch = h.chord;
          this.drag = { type: h.edge ? 'chordResize' : 'chordMove', id: ch.id, orig: { start: ch.start, dur: ch.dur }, startStep: h.step, moved: false };
          MS.Audio.previewChord(ch);
        } else if (S.armed) {
          this._placeChord(h.step);
        } else {
          S.selChord = null;
          S.cursor = Math.max(0, Math.min(total, Math.floor(h.step / 16) * 16));
          hook('chordSelect', null);
          hook('seek', S.cursor);
        }
        this.dirty = true;
        return;
      }
      if (h.zone === 'vel') {
        this.drag = { type: 'vel', moved: false, sel: false };
        this._velAt(h, true);
        this.dirty = true;
        return;
      }
      if (h.zone === 'lyric') {
        const bar = Math.floor(h.step / 16);
        this.pendingLyric = bar >= 0 && bar < song.bars ? bar : null;
        return;
      }
      if (h.zone !== 'grid') return;
      S.selChord = null;
      const rc = this.cv.getBoundingClientRect(), yy = e.clientY - rc.top;
      const inVel = this.velH && yy >= this.gridTop + this.gridH && yy < this.viewH - LYR_H;
      if (S.tool === 'hand' && !inVel) {
        this.drag = { type: 'pan', x: e.clientX, y: e.clientY, sl: this.sc.scrollLeft, st: this.sc.scrollTop };
        return;
      }
      if (right) {
        if (h.note) this._deleteNotes([h.note.id]);
        return;
      }
      if (S.tool === 'erase') {
        Store.checkpoint();
        this.drag = { type: 'erase' };
        if (h.note) Store.update((s) => { s.notes = s.notes.filter((n) => n.id !== h.note.id); }, 'erase');
        return;
      }
      if (h.note) {
        const n = h.note;
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          if (S.selection.has(n.id)) S.selection.delete(n.id); else S.selection.add(n.id);
        } else if (!S.selection.has(n.id)) S.selection = new Set([n.id]);
        hook('selection');
        const sel = song.notes.filter((x) => S.selection.has(x.id));
        if (h.edge && S.selection.has(n.id)) {
          this.drag = { type: 'resize', orig: sel.map((x) => ({ id: x.id, dur: x.dur })), startStep: h.step, moved: false, primary: n.id };
        } else {
          this.drag = { type: 'move', orig: sel.map((x) => ({ id: x.id, start: x.start, pitch: x.pitch })), startStep: h.step, startPitch: h.pitch, moved: false, lastPitch: n.pitch };
          MS.Audio.preview(n.pitch, 0.3);
        }
        this.dirty = true;
        return;
      }
      // ô trống
      if (S.tool === 'select' || e.shiftKey) {
        if (!e.shiftKey && !e.ctrlKey) { S.selection = new Set(); hook('selection'); }
        this.drag = { type: 'box', x0: h.x, y0: h.y, x1: h.x, y1: h.y, base: new Set(S.selection) };
        this.dirty = true;
        return;
      }
      // vẽ nốt mới
      if (h.pitch < LO || h.pitch > HI) return;
      const pitch = this._lockPitch(h.pitch);
      const start = Math.max(0, this.snapStep(h.step));
      if (start >= 128 * 16) return;
      const id = Store.uid();
      const dur = Math.max(1, S.noteLen);
      Store.commit((s) => {
        s.notes.push({ id, start, dur, pitch, vel: 92 });
        if (start + dur > s.bars * 16) s.bars = Math.min(128, Math.ceil((start + dur) / 16));
      }, 'add');
      S.selection = new Set([id]);
      hook('selection');
      MS.Audio.preview(pitch, 0.35);
      this.drag = { type: 'create', id, start, startStep: h.step, moved: false };
      this.dirty = true;
    }

    _move(e) {
      if (e.pointerType === 'touch' && this._touchMove(e)) return;
      if (this.pinch) return;
      const h = this._hit(e);
      const d = this.drag;
      if (d && d.type === 'pan') {
        this.sc.scrollLeft = d.sl - (e.clientX - d.x);
        this.sc.scrollTop = d.st - (e.clientY - d.y);
        return;
      }
      if (!d) {
        if (e.pointerType === 'touch') return;
        this.hover = h;
        // con trỏ chuột
        let cur = 'default';
        if (h.zone === 'grid') cur = S.tool === 'hand' ? 'grab' : S.tool === 'erase' ? 'not-allowed' : h.note ? (h.edge ? 'ew-resize' : 'grab') : S.tool === 'select' ? 'crosshair' : 'cell';
        else if (h.zone === 'chord') cur = h.chord ? (h.edge ? 'ew-resize' : 'grab') : S.armed ? 'copy' : 'pointer';
        else if (h.zone === 'ruler' || h.zone === 'keys' || h.zone === 'lyric') cur = 'pointer';
        this.cv.style.cursor = cur;
        this.dirty = true;
        return;
      }
      const song = Store.song;
      if (d.type === 'scrub') {
        const step = Math.max(0, Math.min(song.bars * 16, this.snapStep(h.step, 'round')));
        S.cursor = step;
        hook('seek', step);
      } else if (d.type === 'loop') {
        const b = Math.max(0, Math.min(song.bars - 1, Math.floor(h.step / 16)));
        const a = Math.min(b, d.anchor), z = Math.max(b, d.anchor);
        S.loop = { on: true, start: a * 16, end: z * 16 + 16 };
        hook('loopChanged');
      } else if (d.type === 'key') {
        if (h.zone === 'keys' && h.pitch !== this.keyHold && h.pitch >= LO && h.pitch <= HI) {
          if (this.keyHold != null) MS.Input.noteOff(this.keyHold);
          this.keyHold = h.pitch;
          MS.Input.noteOn(h.pitch, 92);
        }
      } else if (d.type === 'move') {
        const ds0 = Math.round((h.step - d.startStep) / S.snap) * S.snap;
        const dp0 = this.pitchOf(h.y) - d.startPitch;
        const minStart = Math.min(...d.orig.map((o) => o.start)), maxP = Math.max(...d.orig.map((o) => o.pitch)), minP = Math.min(...d.orig.map((o) => o.pitch));
        const ds = Math.max(-minStart, ds0);
        const dp = Math.max(LO - minP, Math.min(HI - maxP, dp0));
        if (!d.moved && (ds || dp)) { Store.checkpoint(); d.moved = true; }
        if (d.moved) {
          Store.update((s) => {
            d.orig.forEach((o) => {
              const n = s.notes.find((x) => x.id === o.id);
              if (n) { n.start = o.start + ds; n.pitch = o.pitch + dp; }
            });
          }, 'move');
          const pr = d.orig[0].pitch + dp;
          if (pr !== d.lastPitch) { d.lastPitch = pr; MS.Audio.preview(pr, 0.25); }
        }
      } else if (d.type === 'resize') {
        const dd = Math.round((h.step - d.startStep) / S.snap) * S.snap;
        if (!d.moved && dd) { Store.checkpoint(); d.moved = true; }
        if (d.moved) {
          Store.update((s) => {
            d.orig.forEach((o) => {
              const n = s.notes.find((x) => x.id === o.id);
              if (n) n.dur = Math.max(1, o.dur + dd);
            });
          }, 'resize');
        }
      } else if (d.type === 'create') {
        const want = Math.max(S.snap, Math.round((h.step - d.start) / S.snap) * S.snap);
        const cur = Store.song.notes.find((n) => n.id === d.id);
        if (cur && Math.abs(h.step - d.startStep) >= Math.max(0.9, S.snap * 0.9) && cur.dur !== want) {
          d.moved = true;
          Store.update((s) => { const n = s.notes.find((x) => x.id === d.id); if (n) n.dur = want; }, 'resize');
        }
      } else if (d.type === 'box') {
        d.x1 = h.x; d.y1 = h.y;
        const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
        const sel = new Set(d.base);
        song.notes.forEach((n) => {
          const nx = this.xOf(n.start), nw = n.dur * this.zx, ny = this.yOf(n.pitch);
          if (nx < x1 && nx + nw > x0 && ny < y1 && ny + this.rowH > y0) sel.add(n.id);
        });
        S.selection = sel;
        hook('selection');
      } else if (d.type === 'vel') {
        this._velAt(h, false);
      } else if (d.type === 'erase') {
        const na = h.zone === 'grid' ? this._noteAt(h.x, h.y) : null;
        if (na) Store.update((s) => { s.notes = s.notes.filter((n) => n.id !== na.note.id); }, 'erase');
      } else if (d.type === 'chordResize' || d.type === 'chordMove') {
        const others = song.chords.filter((c) => c.id !== d.id).sort((a, b) => a.start - b.start);
        const dd = Math.round((h.step - d.startStep) / 4) * 4;
        if (d.type === 'chordResize') {
          const next = others.find((c) => c.start >= d.orig.start + 1);
          const max = (next ? next.start : song.bars * 16) - d.orig.start;
          const nd = Math.max(4, Math.min(max, d.orig.dur + dd));
          if (nd !== d.orig.dur) {
            if (!d.moved) { Store.checkpoint(); d.moved = true; }
            Store.update((s) => { const c = s.chords.find((x) => x.id === d.id); if (c) c.dur = nd; }, 'chord');
          }
        } else {
          const prev = [...others].reverse().find((c) => c.start < d.orig.start);
          const next = others.find((c) => c.start > d.orig.start);
          const lo = prev ? prev.start + prev.dur : 0;
          const hi = (next ? next.start : song.bars * 16) - d.orig.dur;
          const ns = Math.max(lo, Math.min(hi, d.orig.start + dd));
          const cur = song.chords.find((c) => c.id === d.id);
          if (cur && hi >= lo && cur.start !== ns) {
            if (!d.moved) { Store.checkpoint(); d.moved = true; }
            Store.update((s) => { const c = s.chords.find((x) => x.id === d.id); if (c) c.start = ns; }, 'chord');
          }
        }
      }
      this.dirty = true;
    }

    _up(e) {
      if (e.pointerType === 'touch') this._touchUp(e);
      const d = this.drag;
      this.drag = null;
      try { this.cv.releasePointerCapture(e.pointerId); } catch (er) { /* ok */ }
      if (!d) return;
      if (d.type === 'key') { if (this.keyHold != null) MS.Input.noteOff(this.keyHold); this.keyHold = null; }
      if (d.type === 'resize' && d.moved) {
        const n = Store.song.notes.find((x) => x.id === d.primary);
        if (n) { S.noteLen = n.dur; hook('noteLen'); }
      }
      if (d.type === 'create' && d.moved) {
        const n = Store.song.notes.find((x) => x.id === d.id);
        if (n) { S.noteLen = n.dur; hook('noteLen'); }
      }
      if (d.type === 'move' && d.moved || d.type === 'resize' && d.moved) {
        Store.update((s) => {
          let m = 0;
          s.notes.forEach((n) => { m = Math.max(m, n.start + n.dur); });
          if (m > s.bars * 16) s.bars = Math.min(128, Math.ceil(m / 16));
        }, 'bars');
      }
      if (d.type === 'create') {
        Store.update((s) => {
          let m = 0;
          s.notes.forEach((n) => { m = Math.max(m, n.start + n.dur); });
          if (m > s.bars * 16) s.bars = Math.min(128, Math.ceil(m / 16));
        }, 'bars');
      }
      this.dirty = true;
    }

    // ---------- thao tác ----------
    _deleteNotes(ids) {
      const set = new Set(ids);
      Store.commit((s) => { s.notes = s.notes.filter((n) => !set.has(n.id)); }, 'delete');
      ids.forEach((i) => S.selection.delete(i));
      hook('selection');
    }
    _deleteChord(id) {
      Store.commit((s) => { s.chords = s.chords.filter((c) => c.id !== id); }, 'chord');
      if (S.selChord === id) { S.selChord = null; hook('chordSelect', null); }
    }
    _placeChord(step) {
      const bar = Math.floor(step / 16);
      const song = Store.song;
      if (bar < 0 || bar >= song.bars || !S.armed) return;
      const barStart = bar * 16;
      const covering = song.chords.find((c) => barStart >= c.start && barStart < c.start + c.dur);
      const half = covering && covering.dur >= 16 && step - barStart >= 8 && covering.start === barStart;
      const start = half ? barStart + 8 : barStart;
      const dur = half ? 8 : 16;
      const id = Store.uid();
      const armed = { root: S.armed.root, quality: S.armed.quality };
      Store.commit((s) => {
        s.chords = s.chords.filter((c) => !(c.start >= start && c.start < start + dur));
        s.chords.forEach((c) => { if (c.start < start && c.start + c.dur > start) c.dur = start - c.start; });
        s.chords.push({ id, start, dur, root: armed.root, quality: armed.quality });
        s.chords.sort((a, b) => a.start - b.start);
      }, 'chord');
      S.selChord = id;
      hook('chordSelect', Store.song.chords.find((c) => c.id === id), true);
      MS.Audio.previewChord(armed);
    }

    // ---------- soạn lời ----------
    editLyric(bar) {
      this.editBar = bar;
      this.ensureVisible(bar * 16);
      this._placeEditor();
      this.lin.style.display = 'block';
      this.lin.value = Store.song.lyrics[bar] || '';
      this.lin.focus();
      this.lin.select();
      this.dirty = true;
    }
    _placeEditor() {
      if (this.editBar === null) return;
      const w = Math.max(220, 16 * this.zx - 4);
      let x = this.xOf(this.editBar * 16) + 1;
      x = Math.max(KEYW + 2, Math.min(x, this.viewW - w - 4));
      this.lin.style.left = x + 'px';
      this.lin.style.top = this.viewH - LYR_H + 4 + 'px';
      this.lin.style.width = w + 'px';
      this.lin.style.height = LYR_H - 8 + 'px';
    }
    _commitLyric(move) {
      const bar = this.editBar;
      if (bar === null) return;
      const val = this.lin.value.trim();
      this.editBar = null;
      this.lin.style.display = 'none';
      if (val !== (Store.song.lyrics[bar] || '')) {
        Store.commit((s) => { if (val) s.lyrics[bar] = val; else delete s.lyrics[bar]; }, 'lyric');
      }
      this.dirty = true;
      if (move) {
        const nb = bar + move;
        if (nb >= 0 && nb < Store.song.bars) setTimeout(() => this.editLyric(nb), 0);
      }
    }
    _closeEditor(commit) {
      if (this.editBar === null) return;
      if (commit) this._commitLyric(0);
      else { this.editBar = null; this.lin.style.display = 'none'; this.dirty = true; }
    }
  }

  MS.Roll = Roll;
  MS.RollConst = { LO, HI, KEYW, RULER, CHORD_H, LYR_H };
})();
