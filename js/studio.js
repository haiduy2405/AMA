/* Assistant Music AI — studio.js : bảng "Lời & nốt" — không gian làm việc chính.
   Mỗi ô nhịp = một dòng lời. Mỗi tiếng ↔ nốt thứ i (theo thời gian) trong ô đó.
   Vừa gõ lời, vừa chọn hợp âm, vừa chọn nốt cho từng chữ, nghe ngay; có AI hoàn thiện câu. */
(function () {
  'use strict';
  const MS = globalThis.MS;
  const T = MS.Theory, Gen = MS.Generator, Store = MS.Store, S = MS.S, Audio = MS.Audio, Tr = Audio.Transport;
  const $ = (id) => document.getElementById(id);

  const sel = { bar: 0, i: 0 };
  let body, dock, root;
  let editing = null; // số ô đang gõ lời
  let pendingRender = false;
  let auto = true; // chọn nốt xong tự nhảy sang chữ kế
  let seventh = false;
  let lastLen = 2;
  let seed = 1;
  let editCancel = false;
  let surgical = null; // chỉ vẽ lại 1 dòng sau khi gõ lời (không làm mất cú chạm đang diễn ra)

  const toast = (m) => { if (MS.UI && MS.UI.toast) MS.UI.toast(m); };
  const song = () => Store.song;
  const flats = () => T.useFlats(song().key, song().mode);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const notesOf = (bar) => Store.notesInBar(bar).slice().sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  const realTokens = (bar) => T.vnTokens(Store.lyricOf(bar));
  // ô có nốt nhưng chưa có lời (vd. vừa hát vào micro): mỗi nốt là một ô "♪" để vẫn chạm chọn / đổi nốt được
  const tokensOf = (bar) => {
    const t = realTokens(bar);
    if (t.length) return t;
    return Array.from({ length: Math.min(16, Store.notesInBar(bar).length) }, () => ({ text: '♪', tone: 'ngang', ph: true }));
  };
  const degOf = (p) => T.pitchToDeg(p, song().key, song().mode);
  const pitchOf = (d) => T.degToPitch(d, song().key, song().mode);
  const TONE_GLYPH = { sắc: '↗', ngã: '⤴', huyền: '↘', hỏi: '⤵', nặng: '↓', ngang: '' };

  function stepOf(bar, i, n, notes) {
    if (notes[i]) return notes[i].start;
    const r = Gen.lineRhythm(Math.max(1, n));
    return bar * 16 + (r[i] ? Math.min(15, r[i].start) : 15);
  }
  function toneBad(tone, prev, cur) {
    if (!prev || !cur) return false;
    if (tone === 'sắc' || tone === 'ngã') return cur.pitch < prev.pitch;
    if (tone === 'huyền' || tone === 'nặng') return cur.pitch > prev.pitch;
    return false;
  }

  // ---------- dựng giao diện ----------
  function lineHTML(b) {
    const toks = tokensOf(b), notes = notesOf(b), n = toks.length, ph = n > 0 && !realTokens(b).length;
    const sec = Store.sectionAt(b);
    let stat = '', cls = '';
    if (n > 16) { stat = n + ' tiếng — quá 16, hãy tách bớt'; cls = 'warn'; }
    else if (ph) { stat = notes.length + ' nốt · chưa có lời — bấm ✎ để viết lời'; cls = 'info'; }
    else if (n) {
      if (notes.length === n) { stat = n + ' tiếng · ' + n + ' nốt ✓'; cls = 'ok'; }
      else if (notes.length < n) { stat = n + ' tiếng · thiếu ' + (n - notes.length) + ' nốt'; cls = 'warn'; }
      else { stat = n + ' tiếng · ' + notes.length + ' nốt (luyến)'; cls = 'info'; }
    }
    let inner;
    if (editing === b) {
      inner = '<div class="st-edit"><input class="st-input" data-bar="' + b + '" value="' + esc(Store.lyricOf(b)) + '" placeholder="Gõ lời cho ô ' + (b + 1) + ' — Enter: dòng kế" autocomplete="off" autocapitalize="sentences" spellcheck="false"><span class="st-count" id="stCount">' + n + ' tiếng</span></div>';
    } else if (n === 0) {
      const chs = song().chords.filter((c) => c.start >= b * 16 && c.start < b * 16 + 16).map((c) => '<span class="chip">' + T.chordName(c, flats()) + '</span>').join('');
      inner = '<div class="ln-toks"><button class="ln-empty" data-act="edit" data-bar="' + b + '">＋ Gõ lời cho ô ' + (b + 1) + '</button>' + chs + '</div>';
    } else {
      let prevCh = null;
      inner = '<div class="ln-toks">' + toks.map((t, i) => {
        const note = notes[i], st = stepOf(b, i, n, notes), ch = Store.chordAt(st);
        const showCh = ch && (!prevCh || prevCh.id !== ch.id);
        prevCh = ch || prevCh;
        const bad = note && toneBad(t.tone, notes[i - 1], note);
        const on = sel.bar === b && sel.i === i;
        return '<button class="tk' + (on ? ' sel' : '') + (note ? '' : ' ghost') + (bad ? ' bad' : '') + '" data-bar="' + b + '" data-i="' + i + '"' + (bad ? ' title="Dấu ' + t.tone + ' nhưng nốt đi ngược chiều — nghe có thể lệch dấu"' : '') + '>' +
          '<em class="tk-ch">' + (showCh ? T.chordName(ch, flats()) : '') + '</em>' +
          '<b>' + esc(t.text) + '</b><i class="tk-tone">' + TONE_GLYPH[t.tone] + '</i>' +
          '<small>' + (note ? T.noteName(note.pitch, flats()) : '·') + '</small></button>';
      }).join('') + '</div>';
    }
    return '<section class="ln' + (sel.bar === b ? ' cur' : '') + '" data-bar="' + b + '"><header class="ln-head"><span class="ln-no">' + (b + 1) + '</span>' +
      (sec ? '<span class="ln-sec">' + esc(sec.name) + '</span>' : '') + '<span class="ln-stat ' + cls + '">' + stat + '</span><span class="grow"></span>' +
      '<button class="ibtn" data-act="playline" data-bar="' + b + '" aria-label="Nghe ô ' + (b + 1) + '">▶</button>' +
      '<button class="ibtn" data-act="edit" data-bar="' + b + '" aria-label="Sửa lời ô ' + (b + 1) + '">✎</button></header>' + inner + '</section>';
  }

  function render() {
    if (!body) return;
    if (editing !== null) { pendingRender = true; return; }
    pendingRender = false;
    const sc = body.scrollTop;
    let h = '';
    for (let b = 0; b < song().bars; b++) h += lineHTML(b);
    h += '<button class="btn ghost st-add" data-act="addbar">＋ Thêm ô nhịp</button>';
    body.innerHTML = h;
    body.scrollTop = sc;
    lastBars = song().bars;
    renderDock();
  }

  function replaceLine(bar) {
    const ln = body.querySelector('.ln[data-bar="' + bar + '"]');
    if (!ln) { render(); return; }
    const tmp = document.createElement('div');
    tmp.innerHTML = lineHTML(bar);
    ln.replaceWith(tmp.firstChild);
    renderDock();
  }

  function chordsRowHTML(step) {
    const dia = T.diatonicChords(song().key, song().mode, seventh);
    const cur = Store.chordAt(step);
    return dia.map((c) => {
      const on = cur && cur.root === c.root && cur.quality === c.quality;
      return '<button class="cc' + (on ? ' on' : '') + '" data-act="chord" data-d="' + c.deg + '"><b>' + T.chordName(c, flats()) + '</b><small>' + c.roman + '</small></button>';
    }).join('') + '<button class="cc mod' + (seventh ? ' on' : '') + '" data-act="seventh" aria-label="Hợp âm 7"><b>7</b></button>';
  }

  // ---- dock: 3 tab (Nốt / Hợp âm / AI) + thu gọn; nhớ lựa chọn ----
  const DK = 'ama-dock';
  let dockTab = 'note', dockOpen = true;
  try { const o = JSON.parse(localStorage.getItem(DK) || '{}'); if (o.tab) dockTab = o.tab; if (o.open === false) dockOpen = false; } catch (e) { /* ok */ }
  const saveDock = () => { try { localStorage.setItem(DK, JSON.stringify({ tab: dockTab, open: dockOpen })); } catch (e) { /* ok */ } };

  // bước kế tiếp thông minh cho ô đang chọn
  function nextStep(bar) {
    const real = realTokens(bar).length, notes = Store.notesInBar(bar).length;
    const hasChord = song().chords.some((c) => c.start >= bar * 16 && c.start < bar * 16 + 16);
    if (!real && !notes) return { act: 'edit', label: '✎ Viết lời cho ô ' + (bar + 1), why: 'Ô này còn trống' };
    if (!real) return { act: 'edit', label: '✎ Viết lời cho ' + notes + ' nốt', why: 'Đã có nốt, chưa có lời' };
    if (notes < Math.min(real, 16)) return { act: 'ai-fill', label: '✨ Gợi ý nốt cho câu', why: 'Thiếu ' + (Math.min(real, 16) - notes) + ' nốt' };
    if (!hasChord) return { act: 'ai-chords', label: '🎼 Gợi ý hợp âm', why: 'Chưa có hợp âm' };
    if (bar < song().bars - 1) return { act: 'ai-next', label: '➡ Viết tiếp dòng sau', why: 'Ô ' + (bar + 1) + ' đã đủ' };
    return { act: 'playall', label: '▶ Nghe cả bài', why: 'Đã đủ — nghe lại toàn bài' };
  }

  function renderDock() {
    if (!dock) return;
    const toks = tokensOf(sel.bar), notes = notesOf(sel.bar), n = toks.length;
    const tk = toks[sel.i], note = notes[sel.i];
    const step = tk ? stepOf(sel.bar, sel.i, n, notes) : sel.bar * 16;
    const ch = Store.chordAt(step);
    const pcs = ch ? T.chordPcs(ch) : [];
    let info;
    if (tk) info = '<b class="di-w">' + esc(tk.text) + '</b>' + (tk.tone !== 'ngang' ? '<span class="di-t">' + TONE_GLYPH[tk.tone] + ' ' + tk.tone + '</span>' : '') + '<span class="di-n">' + (note ? T.noteName(note.pitch, flats()) : 'chưa có nốt') + '</span>' + (ch ? '<span class="di-c">' + T.chordName(ch, flats()) + '</span>' : '');
    else info = '<span class="di-hint">Chạm một chữ để chọn nốt — hoặc viết lời cho ô ' + (sel.bar + 1) + '</span>';
    const ns = nextStep(sel.bar);

    let content = '';
    if (dockTab === 'note') {
      if (tk) {
        let pitches = '';
        for (let d = -3; d <= 9; d++) {
          const p = pitchOf(d);
          const ct = pcs.includes(T.mod(p, 12));
          pitches += '<button class="pk' + (note && note.pitch === p ? ' on' : '') + (ct ? ' ct' : '') + (T.mod(d, 7) === 0 ? ' tn' : '') + '" data-act="pitch" data-p="' + p + '"><b>' + T.noteName(p, flats()) + '</b></button>';
        }
        content += '<div class="dk-row dk-pitch" aria-label="Chọn nốt">' + pitches + '</div>';
        if (note) {
          const durs = [[1, '1/16'], [2, '1/8'], [3, '1/8.'], [4, '1/4'], [6, '1/4.'], [8, '1/2']];
          content += '<div class="dk-row dk-dur" aria-label="Độ dài">' + durs.map(([v, l]) => '<button class="dc' + (note.dur === v ? ' on' : '') + '" data-act="dur" data-v="' + v + '">' + l + '</button>').join('') +
            '<button class="dc" data-act="oct" data-v="1" aria-label="Lên quãng tám">8va ▲</button><button class="dc" data-act="oct" data-v="-1" aria-label="Xuống quãng tám">8va ▼</button><button class="dc del" data-act="delnote" aria-label="Xoá nốt">🗑</button></div>';
        }
      } else content += '<button class="btn gold dk-next" data-act="' + ns.act + '">' + ns.label + '</button>';
    } else if (dockTab === 'chord') {
      content += '<div class="dk-row dk-chords" aria-label="Hợp âm">' + chordsRowHTML(step) + '</div>';
    } else {
      content += '<button class="btn gold dk-next" data-act="' + ns.act + '">' + ns.label + '<small>' + ns.why + '</small></button>' +
        '<div class="dk-row dk-ai">' +
        '<button class="btn tiny" data-act="ai-regen">🎲 Làm lại</button>' +
        '<button class="btn tiny" data-act="ai-fill">✨ Nốt</button>' +
        '<button class="btn tiny" data-act="ai-chords">🎼 Hợp âm</button>' +
        '<button class="btn tiny" data-act="retime">⚖ Chia nhịp</button></div>';
    }
    const tab = (k, l) => '<button class="dk-tab' + (dockTab === k && dockOpen ? ' on' : '') + '" data-act="tab" data-k="' + k + '" role="tab" aria-selected="' + (dockTab === k) + '">' + l + '</button>';
    dock.classList.toggle('collapsed', !dockOpen);
    dock.innerHTML =
      '<div class="dk-info"><button class="ibtn" data-act="prev" aria-label="Chữ trước">‹</button><div class="dk-i">' + info + '</div><button class="ibtn" data-act="next" aria-label="Chữ sau">›</button></div>' +
      '<div class="dk-tabs" role="tablist">' + tab('note', '🎵 Nốt') + tab('chord', '🎶 Hợp âm') + tab('ai', '✨ AI') +
      '<button class="ibtn" data-act="playhere" aria-label="Nghe từ đây">▶</button>' +
      '<button class="ibtn" data-act="toroll" aria-label="Mở trong Piano roll" title="Mở trong Piano roll">🎹</button>' +
      '<button class="ibtn" data-act="toggledock" aria-label="' + (dockOpen ? 'Thu gọn' : 'Mở rộng') + '">' + (dockOpen ? '⌄' : '⌃') + '</button></div>' +
      (dockOpen ? '<div class="dk-content">' + content + '</div>' : '');
    const on = dock.querySelector('.pk.on');
    const strip = dock.querySelector('.dk-pitch');
    if (on && strip) strip.scrollLeft = on.offsetLeft - strip.clientWidth / 2 + on.offsetWidth / 2;
  }

  // ---------- chọn chữ ----------
  function select(bar, i, opts) {
    opts = opts || {};
    sel.bar = Math.max(0, Math.min(song().bars - 1, bar));
    const n = tokensOf(sel.bar).length;
    sel.i = Math.max(0, Math.min(Math.max(0, n - 1), i));
    const notes = notesOf(sel.bar);
    const step = stepOf(sel.bar, sel.i, n, notes);
    S.cursor = Math.min(Store.totalSteps(), step);
    const note = notes[sel.i];
    S.selection = note ? new Set([note.id]) : new Set();
    if (note && opts.preview !== false) Audio.preview(note.pitch, 0.35);
    body.querySelectorAll('.tk.sel').forEach((e) => e.classList.remove('sel'));
    body.querySelectorAll('.ln.cur').forEach((e) => e.classList.remove('cur'));
    const tkEl = body.querySelector('.tk[data-bar="' + sel.bar + '"][data-i="' + sel.i + '"]');
    if (tkEl) { tkEl.classList.add('sel'); if (opts.scroll !== false) tkEl.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    const ln = body.querySelector('.ln[data-bar="' + sel.bar + '"]');
    if (ln) ln.classList.add('cur');
    renderDock();
    if (MS.invalidate) MS.invalidate();
  }
  function move(dir) {
    const n = tokensOf(sel.bar).length;
    let b = sel.bar, i = sel.i + dir;
    if (i >= n) { b++; i = 0; while (b < song().bars && !tokensOf(b).length) b++; if (b >= song().bars) return; }
    else if (i < 0) { b--; while (b >= 0 && !tokensOf(b).length) b--; if (b < 0) return; i = tokensOf(b).length - 1; }
    select(b, i);
  }

  // ---------- sửa dữ liệu ----------
  function setPitch(bar, i, pitch) {
    const n = tokensOf(bar).length;
    if (i >= 16) { toast('Một ô chỉ chứa tối đa 16 nốt.'); return; }
    Store.commit((s) => {
      const a = bar * 16, b = a + 16;
      const cur = s.notes.filter((x) => x.start >= a && x.start < b).sort((p, q) => p.start - q.start || p.pitch - q.pitch);
      const rh = Gen.lineRhythm(Math.max(n, i + 1));
      for (let j = cur.length; j <= i; j++) {
        const prev = cur[j - 1];
        let st = a + (rh[j] ? rh[j].start : 0);
        if (prev) st = Math.max(st, prev.start + prev.dur);
        st = Math.min(st, b - 1);
        const nn = { id: Store.uid(), start: st, dur: Math.max(1, Math.min(rh[j] ? rh[j].dur : lastLen, b - st)), pitch: j === i ? pitch : (prev ? prev.pitch : pitch), vel: 92 };
        s.notes.push(nn); cur.push(nn);
      }
      cur[i].pitch = pitch;
    }, 'studio');
  }
  function setDur(bar, i, dur) {
    const note = notesOf(bar)[i];
    if (!note) return;
    const d = Math.max(1, Math.min(dur, bar * 16 + 16 - note.start));
    lastLen = d;
    Store.commit((s) => { const x = s.notes.find((q) => q.id === note.id); if (x) x.dur = d; }, 'studio');
  }
  function setChordAt(step, q) {
    const barEnd = Math.floor(step / 16) * 16 + 16;
    Store.commit((s) => {
      const cur = s.chords.find((c) => step >= c.start && step < c.start + c.dur);
      if (cur && cur.start === step) { cur.root = q.root; cur.quality = q.quality; return; }
      let end = barEnd;
      if (cur) { end = cur.start + cur.dur; cur.dur = step - cur.start; }
      else { const nx = s.chords.filter((c) => c.start > step).sort((x, y) => x.start - y.start)[0]; if (nx) end = Math.min(end, nx.start); }
      s.chords.push({ id: Store.uid(), start: step, dur: Math.max(1, end - step), root: q.root, quality: q.quality });
      s.chords.sort((x, y) => x.start - y.start);
    }, 'chord');
  }
  function retime(bar) {
    const notes = notesOf(bar), toks = tokensOf(bar);
    const m = toks.length || notes.length;
    if (!notes.length) { toast('Ô này chưa có nốt để chia nhịp.'); return; }
    const rh = Gen.lineRhythm(Math.min(m, notes.length));
    Store.commit((s) => {
      notes.slice(0, rh.length).forEach((nt, i) => { const x = s.notes.find((q) => q.id === nt.id); if (x) { x.start = bar * 16 + rh[i].start; x.dur = rh[i].dur; } });
    }, 'studio');
    toast('Đã chia đều nhịp cho ô ' + (bar + 1) + '.');
    playLine(bar);
  }

  // ---------- AI ----------
  function cadenceOf(bar) { return bar % 4 === 3 ? 'closed' : bar % 2 === 1 ? 'open' : 'mid'; }
  function aiFill(bar, regen) {
    const toks = realTokens(bar), n = toks.length;
    if (!n) { toast('Gõ lời cho ô ' + (bar + 1) + ' trước, rồi mình gợi ý nốt.'); return false; }
    if (n > 16) { toast('Dòng này quá 16 tiếng — hãy tách bớt.'); return false; }
    const have = notesOf(bar);
    const keep = regen ? 0 : Math.min(have.length, n);
    if (!regen && have.length >= n) { toast('Câu đã đủ nốt. Bấm “Làm lại” để mình gợi ý lại.'); return false; }
    const pn = bar > 0 ? notesOf(bar - 1) : [];
    const prevDeg = pn.length ? degOf(pn[pn.length - 1].pitch) : 2;
    const a = bar * 16, b = a + 16;
    const startNew = keep ? have[keep - 1].start + have[keep - 1].dur : a;
    const cnt = n - keep;
    const rh = Gen.lineRhythm(cnt, Math.max(cnt, b - startNew));
    const chords = toks.map((_, i) => Store.chordAt(i < keep ? have[i].start : startNew + (rh[i - keep] ? rh[i - keep].start : 0)));
    const fixed = toks.map((_, i) => (i < keep ? degOf(have[i].pitch) : null));
    const degs = Gen.melodyForLine({ tones: toks.map((t) => t.tone), key: song().key, mode: song().mode, chords, fixed, prevDeg, cadence: cadenceOf(bar), seed: (Date.now() + seed++) | 0 });
    Store.commit((s) => {
      if (regen) s.notes = s.notes.filter((x) => !(x.start >= a && x.start < b));
      for (let i = keep; i < n; i++) {
        const r = rh[i - keep];
        const st = Math.min(b - 1, startNew + r.start);
        s.notes.push({ id: Store.uid(), start: st, dur: Math.max(1, Math.min(r.dur, b - st)), pitch: pitchOf(degs[i]), vel: i === 0 ? 100 : 88 });
      }
      if (!s.chords.some((c) => c.start < b && c.start + c.dur > a)) {
        const sg = Gen.suggestChords(s, { fromBar: bar, toBar: bar + 1 });
        sg.forEach((c) => s.chords.push(c));
        s.chords.sort((x, y) => x.start - y.start);
      }
    }, 'ai-line');
    return true;
  }
  function aiChords(bar) {
    if (!notesOf(bar).length) { toast('Chọn vài nốt cho ô này trước, rồi mình gợi ý hợp âm.'); return; }
    const sg = Gen.suggestChords(song(), { fromBar: bar, toBar: bar + 1 });
    if (!sg.length) return;
    const a = bar * 16, b = a + 16;
    Store.commit((s) => {
      const keep = [];
      s.chords.forEach((c) => {
        const e = c.start + c.dur;
        if (e <= a || c.start >= b) keep.push(c);
        else {
          if (c.start < a) keep.push(Object.assign({}, c, { dur: a - c.start }));
          if (e > b) keep.push(Object.assign({}, c, { id: Store.uid(), start: b, dur: e - b }));
        }
      });
      s.chords = keep.concat(sg).sort((x, y) => x.start - y.start);
    }, 'chord');
    toast('Đã gợi ý hợp âm cho ô ' + (bar + 1) + '.');
    playLine(bar);
  }
  function aiNext() {
    let nb = sel.bar + 1;
    if (nb >= song().bars) {
      if (song().bars >= 128) { toast('Bài đã đạt tối đa 128 ô nhịp.'); return; }
      Store.commit((s) => { s.bars = Math.min(128, s.bars + 1); });
    }
    const toks = realTokens(nb);
    if (!toks.length) {
      select(nb, 0, { preview: false });
      startEdit(nb);
      toast('Gõ lời cho ô ' + (nb + 1) + ' — xong bấm “Hoàn thiện câu” để mình gợi ý nốt.');
      return;
    }
    if (notesOf(nb).length < toks.length) aiFill(nb, false);
    select(nb, 0);
    playLine(nb);
  }

  // ---------- nghe ----------
  function playLine(bar) { Tr.play({ from: bar * 16, to: bar * 16 + 16 }); }
  function playHere() {
    if (Tr.playing) { Tr.stop(); return; }
    const n = tokensOf(sel.bar).length;
    Tr.play({ from: stepOf(sel.bar, sel.i, n, notesOf(sel.bar)), to: Store.totalSteps() });
  }

  // ---------- gõ lời ----------
  function startEdit(bar) {
    if (editing !== null) commitEdit();
    editing = bar;
    editCancel = false;
    const sc = body.scrollTop;
    const ln = body.querySelector('.ln[data-bar="' + bar + '"]');
    if (!ln) { editing = null; return; }
    const tmp = document.createElement('div');
    tmp.innerHTML = lineHTML(bar);
    ln.replaceWith(tmp.firstChild);
    body.scrollTop = sc;
    const inp = body.querySelector('.st-input');
    if (inp) { inp.focus(); const L = inp.value.length; inp.setSelectionRange(L, L); inp.scrollIntoView({ block: 'nearest' }); }
  }
  function commitEdit(next) {
    if (editing === null) return;
    const bar = editing, inp = body.querySelector('.st-input');
    editing = null;
    const text = inp ? inp.value.replace(/\s+/g, ' ').trim() : Store.lyricOf(bar);
    if (!editCancel && text !== Store.lyricOf(bar)) {
      surgical = bar;
      Store.commit((s) => { if (text) s.lyrics[bar] = text; else delete s.lyrics[bar]; if (bar >= s.bars) s.bars = Math.min(128, bar + 1); }, 'lyric');
    } else replaceLine(bar);
    editCancel = false;
    if (next === 'next') {
      const nb = bar + 1;
      if (nb >= song().bars && song().bars < 128) Store.commit((s) => { s.bars = nb + 1; });
      if (nb < song().bars) { select(nb, 0, { preview: false }); startEdit(nb); }
    } else if (tokensOf(bar).length) select(bar, Math.min(sel.bar === bar ? sel.i : 0, tokensOf(bar).length - 1), { preview: false });
  }
  function pasteLines(inp, text) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const bar = +inp.dataset.bar;
    const total = Math.min(lines.length, 128 - bar);
    editCancel = true; editing = null;
    Store.commit((s) => {
      for (let k = 0; k < total; k++) s.lyrics[bar + k] = lines[k];
      if (bar + total > s.bars) s.bars = Math.min(128, bar + total);
    }, 'lyric');
    editCancel = false;
    toast('Đã dán ' + total + ' dòng lời vào ô ' + (bar + 1) + '–' + (bar + total) + '.');
    select(bar, 0, { preview: false });
  }

  // ---------- sự kiện ----------
  // mở piano roll tại chữ đang chọn (điện thoại: toàn màn hình ngang; máy tính: chế độ chia đôi)
  function toRoll() {
    const nt = notesOf(sel.bar)[sel.i];
    if (nt) S.selection = new Set([nt.id]);
    S.cursor = tokensOf(sel.bar).length ? stepOf(sel.bar, sel.i, tokensOf(sel.bar).length, notesOf(sel.bar)) : sel.bar * 16;
    const btn = document.querySelector('#bottomNav [data-nav="roll"]');
    const ph = document.body.classList.contains('phone');
    if (ph && btn) btn.click(); else { const sw = document.querySelector('#viewSw [data-mode="split"]'); if (sw) sw.click(); }
    setTimeout(() => { if (MS.UI && MS.UI.centerRoll) MS.UI.centerRoll(); if (MS.UI && MS.UI.revealRange) MS.UI.revealRange(nt ? nt.start : sel.bar * 16, nt ? nt.pitch : 64); }, 220);
  }
  function onClick(e) {
    const t = e.target.closest('button,[data-act]');
    if (!t) return;
    const tk = t.closest('.tk');
    if (tk) { select(+tk.dataset.bar, +tk.dataset.i); return; }
    const act = t.dataset.act;
    if (!act) return;
    const bar = t.dataset.bar != null ? +t.dataset.bar : sel.bar;
    const n = tokensOf(sel.bar).length, notes = notesOf(sel.bar);
    switch (act) {
      case 'edit': select(bar, 0, { preview: false, scroll: false }); startEdit(bar); break;
      case 'playline': select(bar, 0, { preview: false }); playLine(bar); break;
      case 'addbar': if (song().bars < 128) { Store.commit((s) => { s.bars++; }); select(song().bars - 1, 0, { preview: false }); startEdit(song().bars - 1); } break;
      case 'prev': move(-1); break;
      case 'next': move(1); break;
      case 'pitch': {
        if (!tokensOf(sel.bar).length) return;
        const p = +t.dataset.p, b = sel.bar, i = sel.i;
        setPitch(b, i, p);
        Audio.preview(p, 0.4);
        if (auto && i + 1 < tokensOf(b).length) select(b, i + 1, { preview: false });
        else select(b, i, { preview: false });
        break;
      }
      case 'dur': setDur(sel.bar, sel.i, +t.dataset.v); { const nt = notesOf(sel.bar)[sel.i]; if (nt) Audio.preview(nt.pitch, 0.1 + nt.dur * 0.07); } break;
      case 'oct': { const nt = notes[sel.i]; if (nt) { const p = Math.max(36, Math.min(96, nt.pitch + 12 * +t.dataset.v)); Store.commit((s) => { const x = s.notes.find((q) => q.id === nt.id); if (x) x.pitch = p; }, 'studio'); Audio.preview(p, 0.35); } break; }
      case 'delnote': { const nt = notes[sel.i]; if (nt) Store.commit((s) => { s.notes = s.notes.filter((q) => q.id !== nt.id); }, 'studio'); break; }
      case 'chord': {
        const q = T.diatonicChords(song().key, song().mode, seventh)[+t.dataset.d];
        const step = tokensOf(sel.bar).length ? stepOf(sel.bar, sel.i, n, notes) : sel.bar * 16;
        setChordAt(step, q); Audio.previewChord(q); break;
      }
      case 'seventh': seventh = !seventh; renderDock(); break;
      case 'ai-fill': if (aiFill(sel.bar, false)) { select(sel.bar, sel.i, { preview: false }); playLine(sel.bar); } break;
      case 'ai-regen': if (aiFill(sel.bar, true)) { select(sel.bar, 0, { preview: false }); playLine(sel.bar); } break;
      case 'ai-chords': aiChords(sel.bar); break;
      case 'ai-next': aiNext(); break;
      case 'retime': retime(sel.bar); break;
      case 'playhere': playHere(); break;
      case 'playall': Tr.play({ from: 0, to: Store.totalSteps() }); break;
      case 'tab': dockTab = t.dataset.k; dockOpen = true; saveDock(); renderDock(); break;
      case 'toggledock': dockOpen = !dockOpen; saveDock(); renderDock(); break;
      case 'toroll': toRoll(); break;
      default: break;
    }
  }
  function onKey(e) {
    const t = e.target;
    if (t.classList && t.classList.contains('st-input')) {
      if (e.key === 'Enter') { e.preventDefault(); commitEdit('next'); }
      else if (e.key === 'Escape') { e.preventDefault(); editCancel = true; commitEdit(); }
      e.stopPropagation();
      return;
    }
    if (t.closest && t.closest('select, input, textarea')) return;
    const inside = t.closest && t.closest('#studio');
    if (!inside && !(active && (t === document.body || t === document.documentElement))) return;
    if (!root.offsetParent) return;
    const nt = notesOf(sel.bar)[sel.i];
    let used = true;
    if (e.key === 'ArrowRight') move(1);
    else if (e.key === 'ArrowLeft') move(-1);
    else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && nt) {
      const d = degOf(nt.pitch) + (e.key === 'ArrowUp' ? 1 : -1);
      setPitch(sel.bar, sel.i, pitchOf(d)); Audio.preview(pitchOf(d), 0.35); select(sel.bar, sel.i, { preview: false });
    } else if (/^[1-7]$/.test(e.key) && tokensOf(sel.bar).length) {
      const base = nt ? degOf(nt.pitch) : 2, want = +e.key - 1;
      let best = want, bd = 99;
      for (let o = -1; o <= 1; o++) { const c = want + 7 * o; if (Math.abs(c - base) < bd) { bd = Math.abs(c - base); best = c; } }
      const p = pitchOf(best); setPitch(sel.bar, sel.i, p); Audio.preview(p, 0.4);
      if (auto) select(sel.bar, sel.i + 1, { preview: false }); else select(sel.bar, sel.i, { preview: false });
    } else if (e.key === 'Enter') { startEdit(sel.bar); }
    else used = false;
    if (used) { e.preventDefault(); e.stopPropagation(); }
  }

  // tô sáng chữ đang phát
  let lastKey = '', lastBar = -1;
  function tick() {
    requestAnimationFrame(tick);
    if (!body || !root.offsetParent) return;
    if (!Tr.playing) { if (lastKey) { body.querySelectorAll('.tk.playing').forEach((e) => e.classList.remove('playing')); lastKey = ''; } return; }
    const st = Tr.getStep();
    if (st == null || st < 0) return;
    const bar = Math.floor(st / 16);
    const notes = notesOf(bar);
    let i = -1;
    for (let k = 0; k < notes.length; k++) if (notes[k].start <= st + 0.01) i = k;
    const key = bar + ':' + i;
    if (key === lastKey) return;
    lastKey = key;
    body.querySelectorAll('.tk.playing').forEach((e) => e.classList.remove('playing'));
    const el = body.querySelector('.tk[data-bar="' + bar + '"][data-i="' + i + '"]');
    if (el) el.classList.add('playing');
    if (bar !== lastBar) { lastBar = bar; const ln = body.querySelector('.ln[data-bar="' + bar + '"]'); if (ln) ln.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }

  let active = false; // người dùng đang làm việc trong bảng lời (để phím tắt vẫn chạy sau khi bảng vẽ lại)
  let lastBars = 0;
  let raf = 0;
  function schedule() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; render(); }); }

  function init() {
    root = $('studio'); body = $('stBody'); dock = $('stDock');
    if (!root) return;
    body.addEventListener('click', onClick);
    dock.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', (e) => { active = !!(e.target.closest && e.target.closest('#studio')); }, true);
    body.addEventListener('input', (e) => {
      if (e.target.classList.contains('st-input')) { const c = $('stCount'); if (c) c.textContent = T.vnSyllables(e.target.value) + ' tiếng'; }
    });
    body.addEventListener('paste', (e) => {
      const inp = e.target.closest && e.target.closest('.st-input');
      if (!inp) return;
      const txt = (e.clipboardData || globalThis.clipboardData).getData('text');
      if (/\r?\n/.test(txt.trim())) { e.preventDefault(); pasteLines(inp, txt); }
    });
    body.addEventListener('focusout', (e) => {
      if (e.target.classList && e.target.classList.contains('st-input')) {
        const bar = +e.target.dataset.bar;
        setTimeout(() => { if (editing === bar && !(document.activeElement && document.activeElement.classList.contains('st-input'))) commitEdit(); }, 0);
      }
    });
    dock.addEventListener('change', (e) => { if (e.target.id === 'stAuto') auto = e.target.checked; });
    $('stPlayAll').addEventListener('click', () => { if (Tr.playing) Tr.stop(); else Tr.play({ from: 0, to: Store.totalSteps() }); });
    Store.on((reason) => {
      if (reason === 'replace' || reason === 'undo') { sel.bar = Math.min(sel.bar, song().bars - 1); surgical = null; }
      if (reason === 'lyric' && surgical !== null && editing === null) {
        const b = surgical; surgical = null;
        if (song().bars === lastBars) { replaceLine(b); return; }
      }
      surgical = null;
      schedule();
    });
    initChips(); renderChips();
    Store.on(() => renderChips());
    render();
    requestAnimationFrame(tick);
  }

  // ---- chip bài hát (Giọng · BPM · số ô) + chỉnh nhanh tại chỗ ----
  function renderChips() {
    const el = $('stChips'); if (!el) return;
    const sg = song();
    el.innerHTML = '<button class="sc" data-q="key"><b>' + T.pcName(sg.key, flats()) + ' ' + (sg.mode === 'minor' ? 'thứ' : 'trưởng') + '</b></button>' +
      '<button class="sc" data-q="bpm">♩ <b>' + sg.bpm + '</b></button>' +
      '<button class="sc" data-q="bars"><b>' + sg.bars + '</b> ô</button>';
    const pop = $('qsPop');
    if (pop && !pop.hidden) fillPop();
  }
  function fillPop() {
    const sg = song(), pop = $('qsPop');
    pop.querySelector('#qsKey').innerHTML = $('key').innerHTML;
    pop.querySelector('#qsKey').value = sg.key;
    pop.querySelector('#qsMode').value = sg.mode;
    pop.querySelector('#qsBpm').textContent = sg.bpm;
    pop.querySelector('#qsBars').textContent = sg.bars;
  }
  function initChips() {
    const el = $('stChips'), pop = $('qsPop');
    if (!el || !pop) return;
    el.addEventListener('click', (e) => { const b = e.target.closest('.sc'); if (!b) return; pop.hidden = !pop.hidden; if (!pop.hidden) fillPop(); });
    pop.addEventListener('click', (e) => {
      const b = e.target.closest('[data-qs]'); if (!b) return;
      const m = { keyDown: 'keyDown', keyUp: 'keyUp', bpmDown: 'bpmDown', bpmUp: 'bpmUp', barsDown: 'barsDown', barsUp: 'barsUp' }[b.dataset.qs];
      if (m) $(m).click(); else if (b.dataset.qs === 'close') pop.hidden = true;
    });
    pop.querySelector('#qsKey').addEventListener('change', (e) => { $('key').value = e.target.value; $('key').dispatchEvent(new Event('change')); });
    pop.querySelector('#qsMode').addEventListener('change', (e) => { $('mode').value = e.target.value; $('mode').dispatchEvent(new Event('change')); });
    document.addEventListener('pointerdown', (e) => { if (!pop.hidden && !e.target.closest('#qsPop, #stChips')) pop.hidden = true; }, true);
  }

  MS.Studio = { init, render, select, aiFill, aiChords, setPitch, setChordAt, startEdit, commitEdit };
})();
