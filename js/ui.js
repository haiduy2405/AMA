/* Assistant Music AI — ui.js : gắn giao diện, transport, trợ lý đồng sáng tác, lời, MIDI, phím tắt */
(function () {
  'use strict';
  const G = globalThis;
  const MS = (G.MS = G.MS || {});
  const S = MS.S, Store = MS.Store, T = MS.Theory, Audio = MS.Audio, Gen = MS.Generator, Input = MS.Input;
  const Tr = Audio.Transport;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  let roll = null;
  let phraseBars = 4;
  let lastSig = '';
  let seekTimer = null;
  let velTouched = false;
  let lastCount = null;
  const SECTIONS = ['', 'Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 'Outro'];

  // ---------- tiện ích ----------
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }
  function download(name, data, type) {
    const blob = new Blob([data], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const fileBase = () => (Store.song.title || 'bai-hat').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'bai-hat';
  const flats = () => T.useFlats(Store.song.key, Store.song.mode);
  const selNotes = () => Store.song.notes.filter((n) => S.selection.has(n.id));
  const cursorBar = () => clamp(Math.floor(S.cursor / 16), 0, Store.song.bars - 1);

  // ---------- transport ----------
  function startPlay(from) {
    const loop = S.loop.on && S.loop.end > S.loop.start ? { start: S.loop.start, end: S.loop.end } : null;
    let f = from != null ? from : S.cursor;
    if (loop && (f < loop.start || f >= loop.end)) f = loop.start;
    if (f >= Store.totalSteps()) f = 0;
    Tr.play({ from: f, loop });
  }
  // phát đúng một đoạn (dùng cho "Nghe lại" sau khi hát)
  function playRange(from, to) {
    if (Input.recState !== 'idle') Input.stopRecord();
    Audio.ensure();
    S.cursor = from;
    Tr.play({ from, to: Math.min(to + 2, Store.totalSteps()), loop: null });
  }
  // cuộn piano roll tới một đoạn giai điệu
  function revealRange(start, midPitch) {
    roll.sc.scrollLeft = Math.max(0, start * roll.zx - 80);
    if (midPitch != null) roll.scrollToPitch(midPitch);
    roll.invalidate();
  }
  function togglePlay() {
    if (Input.recState !== 'idle') { Input.stopRecord(); return; }
    if (Tr.playing) {
      const s = Tr.getStep();
      Tr.stop();
      if (s != null && s >= 0) S.cursor = Math.floor(s);
    } else startPlay();
    roll.invalidate();
  }
  function stopAll() {
    if (Input.recState !== 'idle') Input.stopRecord();
    else Tr.stop();
    S.playStep = null;
    roll.invalidate();
  }
  function toggleRecord() {
    if (Input.recState !== 'idle') Input.stopRecord();
    else {
      if (Tr.playing) Tr.stop();
      Input.startRecord();
    }
  }
  function setLoop(on) {
    S.loop.on = on;
    if (on && S.loop.end <= S.loop.start) S.loop = { on: true, start: 0, end: Store.totalSteps() };
    $('btnLoop').classList.toggle('on', S.loop.on);
    roll.invalidate();
  }

  // ---------- hợp âm ----------
  function applyMod(c) {
    const m = S.chordMod;
    const out = { root: c.root, quality: c.quality };
    if (m === 'seventh') return out; // đã xử lý ở diatonicChords
    if (c.quality === 'dim' || c.quality === 'aug') return out;
    if (m === 'sus4' || m === 'sus2') out.quality = m;
    else if (m === 'add9') out.quality = c.quality === '' ? 'add9' : c.quality;
    else if (m === '6') out.quality = c.quality === '' ? '6' : c.quality === 'm' ? 'm6' : c.quality;
    return out;
  }
  const sameChord = (a, b) => a && b && a.root === b.root && a.quality === b.quality;

  function renderPalette() {
    const song = Store.song;
    const dia = T.diatonicChords(song.key, song.mode, S.chordMod === 'seventh');
    const box = $('chordPalette');
    box.innerHTML = '';
    dia.forEach((c, i) => {
      const q = applyMod(c);
      const b = document.createElement('button');
      b.className = 'btn' + (i === 0 ? ' tonic' : '') + (sameChord(q, S.armed) ? ' on' : '');
      b.innerHTML = '<span>' + T.chordName(q, flats()) + '</span><small>' + c.roman + '</small>';
      b.title = 'Bấm để cầm hợp âm, rồi bấm vào làn Hợp âm để đặt';
      b.addEventListener('click', () => {
        Audio.previewChord(q);
        S.armed = sameChord(q, S.armed) ? null : q;
        S.selChord = null;
        renderPalette();
        renderInspector();
        roll.invalidate();
      });
      box.appendChild(b);
    });
    const hint = $('armedHint');
    hint.innerHTML = S.armed
      ? 'Đang cầm <b>' + T.chordName(S.armed, flats()) + '</b> — bấm vào <b>làn Hợp âm</b> để đặt (bấm nửa sau ô để chia đôi). <kbd>Esc</kbd> để thả.'
      : 'Bấm một hợp âm rồi bấm vào <b>làn Hợp âm</b> để đặt. Phím <kbd>1</kbd>–<kbd>7</kbd> đặt nhanh tại ô nhịp con trỏ.';
  }

  function renderInspector() {
    const box = $('chordInspector');
    const ch = Store.song.chords.find((c) => c.id === S.selChord);
    if (!ch) { box.hidden = true; return; }
    box.hidden = false;
    $('chInfo').textContent = 'Hợp âm ' + T.chordName(ch, flats()) + ' · ô ' + (Math.floor(ch.start / 16) + 1);
    if (document.activeElement !== $('chRoot')) $('chRoot').value = ch.root;
    if (document.activeElement !== $('chQual')) $('chQual').value = ch.quality;
  }

  function renderProgs() {
    const box = $('progList');
    const mode = Store.song.mode;
    box.innerHTML = '';
    T.PROGRESSIONS.filter((p) => p.mode === mode).forEach((p) => {
      const b = document.createElement('button');
      b.className = 'btn ghost';
      b.textContent = p.name;
      b.addEventListener('click', () => applyProgression(p));
      box.appendChild(b);
    });
  }
  function applyProgression(p) {
    const song = Store.song;
    const from = cursorBar();
    const repeat = $('progRepeat').checked;
    const chords = Gen.applyProgression(song, p.degs, from, repeat, p.seventh);
    if (!chords.length) return;
    const a = from * 16, b = repeat ? song.bars * 16 : a + chords.length * 16;
    Store.commit((s) => {
      s.chords = s.chords.filter((c) => c.start >= b || c.start + c.dur <= a);
      s.chords.forEach((c) => { if (c.start < a && c.start + c.dur > a) c.dur = a - c.start; });
      chords.forEach((c) => s.chords.push(c));
      s.chords.sort((x, y) => x.start - y.start);
    }, 'chord');
    toast('Đã áp dụng ' + p.name + ' từ ô ' + (from + 1));
  }
  function harmonize() {
    const song = Store.song;
    if (!song.notes.length) { toast('Hãy vẽ hoặc đàn melody trước, rồi mình gợi ý hợp âm.'); return; }
    const chords = Gen.suggestChords(song);
    Store.commit((s) => { s.chords = chords; }, 'chord');
    toast('Đã gợi ý ' + chords.length + ' hợp âm cho melody — nghe thử rồi chỉnh tay nhé.');
    startPlay(0);
  }
  function placeDegree(i) {
    const dia = T.diatonicChords(Store.song.key, Store.song.mode, S.chordMod === 'seventh');
    const q = applyMod(dia[i]);
    const prev = S.armed;
    S.armed = q;
    roll._placeChord(cursorBar() * 16);
    S.armed = prev;
    renderPalette();
  }

  // ---------- trợ lý ----------
  function renderMotif() {
    const song = Store.song;
    const card = $('motifCard');
    const phone = document.body.classList.contains('phone');
    if (!song.notes.length) {
      card.innerHTML = '<b>Khuôn nhạc</b><p class="hint">Chưa có nốt nào. ' +
        (phone ? 'Mở piano roll, chạm vào lưới để vẽ vài nốt (hoặc bật 🎹 Phím để bấm từng nốt) làm motif 1–2 ô.'
          : 'Đàn motif 1–2 ô bằng MIDI keyboard (nối dây USB), bàn phím máy tính, hoặc vẽ trên piano roll.') + '</p>' +
        '<div class="row">' + (phone ? '<button class="btn tiny cyan" id="mtOpenRoll">🎹 Mở piano roll</button>' : '<button class="btn tiny cyan" id="mtMidi">🎹 Nối MIDI keyboard</button><button class="btn tiny rec-b" id="mtRec">● Thu motif</button>') +
        '<button class="btn tiny" id="mtOpen">✨ Mở đầu giúp tôi</button></div>';
      const g = (id, fn) => { const e = $(id); if (e) e.addEventListener('click', fn); };
      g('mtOpenRoll', () => document.querySelector('#bottomNav [data-nav="roll"]').click());
      g('mtMidi', () => { const t = document.querySelector('.tab[data-tab="midi"]'); if (t) t.click(); });
      g('mtRec', toggleRecord);
      g('mtOpen', suggest);
      return;
    }
    const motifNotes = song.notes.filter((n) => n.start < 32);
    const src = motifNotes.length ? motifNotes : song.notes;
    const a = Gen.analyzeMotif(src, song.key, song.mode);
    const ev = Gen.evaluateMotif(src, song.key, song.mode);
    const next = Gen.suggestStart(song);
    const end = Store.lastNoteEnd();
    card.innerHTML =
      '<div class="mt-head"><b>Khuôn nhạc của bạn</b><span class="score s-' + ev.level + '" title="Điểm motif (0–100)">' + ev.score + '</span></div>' +
      '<div class="mt-grade s-' + ev.level + '">' + ev.grade + '</div>' +
      '<canvas id="motifMini" width="560" height="96"></canvas>' +
      '<ul class="evals">' + ev.items.map((i) => '<li class="' + (i.ok ? 'ok' : 'warn') + '">' + (i.ok ? '✓' : '!') + ' ' + i.text + '</li>').join('') + '</ul>' +
      '<div class="tags"><span class="tag">' + a.count + ' nốt</span><span class="tag">' + a.contour + '</span><span class="tag">' + a.spanLabel + '</span><span class="tag">nhịp ' + a.rhythm + '</span></div>' +
      '<p class="hint">Đã viết đến ô <b>' + Math.max(1, Math.ceil(end / 16)) + '</b>/' + song.bars + '. Gợi ý kế tiếp bắt đầu ở ô <b>' + Math.min(song.bars, next / 16 + 1) + '</b>.</p>' +
      '<div class="row"><button class="btn tiny" id="mtPlay">▶ Nghe motif</button><button class="btn tiny" id="btnGuess">🔍 Đoán giọng</button></div>';
    drawMini($('motifMini'), { notes: src, start: Math.floor(Math.min(...src.map((n) => n.start)) / 16) * 16, end: Math.max(...src.map((n) => n.start + n.dur)) });
    $('mtPlay').addEventListener('click', () => { Tr.play({ from: 0, to: Math.min(Math.max(...src.map((n) => n.start + n.dur)) + 4, 64) }); });
    $('btnGuess').addEventListener('click', () => {
      const g = T.guessKey(song.notes);
      if (!g) return;
      if (g.key === song.key && g.mode === song.mode) { toast('Giọng hiện tại đã khớp với melody.'); return; }
      Store.commit((s) => { s.key = g.key; s.mode = g.mode; });
      toast('Đoán giọng: ' + T.pcName(g.key, T.useFlats(g.key, g.mode)) + (g.mode === 'minor' ? ' thứ' : ' trưởng'));
    });
  }

  function getOpts() {
    return { phraseBars, form: $('formSel').value, adventure: +$('adv').value / 100, addChords: $('addChords').checked };
  }
  function suggest() {
    let song = Store.song;
    let start = Gen.suggestStart(song);
    if (start >= song.bars * 16) {
      if (song.bars >= 128) { toast('Bài đã đạt tối đa 128 ô nhịp.'); return; }
      Store.commit((s) => { s.bars = Math.min(128, s.bars + phraseBars); });
      song = Store.song;
    }
    const o = getOpts();
    o.seed = (Math.random() * 1e9) | 0;
    const res = Gen.generate(song, o);
    S.candidates = res.candidates;
    S.candInfo = res;
    S.activeCand = 1;
    renderCands();
    roll.ensureVisible(Math.max(0, res.start - 8));
    const mid = res.candidates[1].notes.map((n) => n.pitch);
    if (mid.length) roll.scrollToPitch(Math.round(mid.reduce((a, b) => a + b, 0) / mid.length));
    previewCand(1);
    roll.invalidate();
  }
  function previewCand(i) {
    const c = S.candidates[i];
    if (!c) return;
    const from = Math.max(0, c.start - 16);
    Tr.play({ from, to: c.end, extra: { notes: c.notes, chords: c.chords } });
  }
  function selectCand(i) {
    S.activeCand = i;
    renderCands();
    previewCand(i);
    roll.invalidate();
  }
  function acceptCand(i) {
    const c = S.candidates[i];
    if (!c) return;
    Tr.stop();
    Store.commit((s) => {
      c.notes.forEach((n) => s.notes.push(Object.assign({}, n)));
      c.chords.forEach((ch) => {
        s.chords = s.chords.filter((x) => !(x.start >= ch.start && x.start < ch.start + ch.dur));
        s.chords.push(Object.assign({}, ch));
      });
      s.chords.sort((a, b) => a.start - b.start);
      if (c.end > s.bars * 16) s.bars = Math.min(128, Math.ceil(c.end / 16));
    }, 'accept');
    const info = S.candInfo;
    S.selection = new Set(c.notes.map((n) => n.id));
    S.candidates = [];
    S.activeCand = -1;
    S.cursor = Math.min(Store.totalSteps(), c.end);
    renderCands();
    const done = c.end >= Store.totalSteps();
    toast(done ? 'Đã hoàn thành đến cuối bài. Tăng số ô nhịp để viết tiếp, hoặc chỉnh sửa tay.' : 'Đã thêm câu ' + (c.info ? c.info.phrase : '') + '. Bấm “Gợi ý” để cùng viết tiếp.');
    roll.invalidate();
    void info;
  }
  function dismissCands() {
    S.candidates = [];
    S.activeCand = -1;
    Tr.stop();
    renderCands();
    roll.invalidate();
  }
  function autoComplete() {
    const song = Store.song;
    const start = Gen.suggestStart(song);
    if (start >= song.bars * 16) { toast('Bài đã đầy — tăng số ô nhịp rồi bấm lại.'); return; }
    const o = getOpts();
    o.seed = (Math.random() * 1e9) | 0;
    const res = Gen.autoComplete(song, o);
    Store.commit((s) => {
      res.notes.forEach((n) => s.notes.push(n));
      res.chords.forEach((c) => s.chords.push(c));
      s.chords.sort((a, b) => a.start - b.start);
    }, 'auto');
    S.candidates = [];
    S.activeCand = -1;
    renderCands();
    toast('Đã điền ' + res.notes.length + ' nốt đến hết bài — đang phát thử.');
    startPlay(start);
  }

  function renderCands() {
    const box = $('candBox'), list = $('candList');
    if (!S.candidates.length) { box.hidden = true; list.innerHTML = ''; document.dispatchEvent(new CustomEvent('ms-cands')); return; }
    box.hidden = false;
    const song = Store.song;
    S.candidates.forEach((c) => { const e = Gen.evaluateMotif(c.notes, song.key, song.mode, { phrase: true }); c.score = e ? e.score : 0; });
    const best = Math.max(...S.candidates.map((c) => c.score));
    const info = S.candidates[0].info;
    $('candTitle').textContent = 'Câu ' + info.phrase + ' · ' + info.label;
    $('candInfo').textContent = info.cadence;
    list.innerHTML = '';
    S.candidates.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'cand' + (i === S.activeCand ? ' on' : '');
      el.innerHTML = '<div class="ch"><span>' + c.name + '</span><span class="hint">' + (c.score === best && S.candidates.length > 1 ? '<b class="best">★ Hay nhất</b> · ' : '') + c.score + ' điểm · ' + c.notes.length + ' nốt</span></div><canvas width="560" height="108"></canvas>' +
        '<div class="cb"><button class="btn tiny" data-a="play">▶ Nghe</button><button class="btn tiny gold" data-a="pick">✓ Chọn</button></div>';
      el.addEventListener('click', (e) => {
        const a = e.target.closest('button');
        if (a && a.dataset.a === 'pick') acceptCand(i);
        else selectCand(i);
      });
      list.appendChild(el);
      drawMini(el.querySelector('canvas'), c);
    });
    document.dispatchEvent(new CustomEvent('ms-cands'));
  }
  function drawMini(cv, c) {
    const x = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    x.clearRect(0, 0, W, H);
    const span = Math.max(16, c.end - c.start);
    const ps = c.notes.map((n) => n.pitch);
    const lo = Math.min(...ps) - 1, hi = Math.max(...ps) + 1;
    x.fillStyle = 'rgba(255,255,255,.08)';
    for (let s = 0; s <= span; s += 16) x.fillRect((s / span) * W, 0, 2, H);
    c.notes.forEach((n) => {
      const nx = ((n.start - c.start) / span) * W, nw = Math.max(4, (n.dur / span) * W - 2);
      const ny = H - 8 - ((n.pitch - lo) / Math.max(1, hi - lo)) * (H - 16);
      const g = x.createLinearGradient(0, ny, 0, ny + 10);
      g.addColorStop(0, '#fde68a');
      g.addColorStop(1, '#f59e0b');
      x.fillStyle = g;
      x.beginPath();
      x.roundRect ? x.roundRect(nx, ny, nw, 9, 3) : x.rect(nx, ny, nw, 9);
      x.fill();
    });
  }

  // ---------- lời ----------
  function renderLyrics() {
    const song = Store.song;
    const list = $('lyricList');
    while (list.children.length > song.bars) list.lastChild.remove();
    while (list.children.length < song.bars) {
      const bar = list.children.length;
      const row = document.createElement('div');
      row.className = 'lrow';
      row.dataset.bar = bar;
      row.innerHTML = '<span class="n">' + (bar + 1) + '</span><input class="field" type="text" placeholder="Lời ô ' + (bar + 1) + '" spellcheck="false" autocomplete="off">' +
        '<div class="meta"><select title="Nhãn đoạn">' + SECTIONS.map((s) => '<option value="' + s + '">' + (s || '— đoạn —') + '</option>').join('') + '</select><span class="cnt"></span></div>';
      const inp = row.querySelector('input'), sel = row.querySelector('select');
      inp.addEventListener('focus', () => {
        S.cursor = bar * 16;
        roll.ensureVisible(bar * 16);
        roll.invalidate();
        updateStatus();
        markCurLyric();
      });
      inp.addEventListener('input', () => updateCnt(row));
      inp.addEventListener('change', () => {
        const v = inp.value.trim();
        if (v !== (Store.song.lyrics[bar] || '')) Store.commit((s) => { if (v) s.lyrics[bar] = v; else delete s.lyrics[bar]; }, 'lyric');
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); const nx = list.children[bar + 1]; if (nx) nx.querySelector('input').focus(); }
        e.stopPropagation();
      });
      sel.addEventListener('change', () => {
        const v = sel.value;
        Store.commit((s) => {
          s.sections = s.sections.filter((x) => x.bar !== bar);
          if (v) s.sections.push({ bar, name: v });
          s.sections.sort((a, b) => a.bar - b.bar);
        }, 'section');
      });
      list.appendChild(row);
    }
    const counts = new Map();
    song.notes.forEach((n) => { const b = Math.floor(n.start / 16); counts.set(b, (counts.get(b) || 0) + 1); });
    Array.from(list.children).forEach((row, bar) => {
      const inp = row.querySelector('input'), sel = row.querySelector('select');
      if (document.activeElement !== inp) inp.value = song.lyrics[bar] || '';
      const sec = song.sections.find((x) => x.bar === bar);
      sel.value = sec ? sec.name : '';
      row.dataset.notes = counts.get(bar) || 0;
      updateCnt(row);
    });
    markCurLyric();
  }
  function updateCnt(row) {
    const v = row.querySelector('input').value;
    const nn = +row.dataset.notes || 0;
    const syl = T.vnSyllables(v);
    const el = row.querySelector('.cnt');
    if (!v.trim()) { el.textContent = nn + ' nốt'; el.className = 'cnt'; }
    else { el.textContent = syl + ' tiếng / ' + nn + ' nốt'; el.className = 'cnt ' + (syl === nn ? 'ok' : 'warn'); }
  }
  function markCurLyric() {
    const b = cursorBar();
    Array.from($('lyricList').children).forEach((r, i) => r.classList.toggle('cur', i === b));
  }
  function applyBulkLyrics() {
    const lines = $('lyricBulk').value.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) { toast('Hãy dán lời vào ô trước.'); return; }
    const per = +$('lyricPer').value;
    const from = cursorBar();
    Store.commit((s) => {
      lines.forEach((ln, i) => {
        const bar = from + i * per;
        if (bar >= 128) return;
        s.lyrics[bar] = ln;
        if (bar + per > s.bars) s.bars = Math.min(128, bar + per);
      });
    }, 'lyric');
    toast('Đã chia ' + lines.length + ' dòng lời vào các ô nhịp từ ô ' + (from + 1));
  }

  // ---------- MIDI ----------
  function renderMidi() {
    const st = S.midiStatus, badge = $('midiBadge'), note = $('midiNote'), btn = $('midiConnect');
    const M = Input.Midi;
    const map = {
      idle: ['Chưa kết nối', '', 'Cắm keyboard (USB/Bluetooth MIDI) rồi bấm Kết nối. Cần Chrome hoặc Edge, trang chạy HTTPS.'],
      connecting: ['Đang kết nối…', '', 'Trình duyệt có thể hỏi quyền dùng thiết bị MIDI — bấm Cho phép.'],
      unsupported: ['Không hỗ trợ', 'bad', (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'iPhone/iPad (Safari) chưa hỗ trợ MIDI keyboard. Hãy dùng đàn ảo trong piano roll, hát vào micro, hoặc vẽ nốt. MIDI chạy tốt trên máy tính (Chrome/Edge) và điện thoại Android (Chrome).' : 'Trình duyệt này chưa hỗ trợ Web MIDI. Dùng Chrome/Edge — hoặc đàn bằng bàn phím máy tính (A W S E D F…).')],
      denied: ['Bị từ chối', 'bad', 'Quyền MIDI đã bị chặn. Bấm biểu tượng ổ khoá trên thanh địa chỉ → cho phép “Thiết bị MIDI”, rồi tải lại trang.'],
      nodevice: ['Chưa thấy thiết bị', 'bad', 'Đã có quyền MIDI nhưng chưa thấy keyboard. Cắm USB hoặc ghép Bluetooth MIDI — app tự nhận ngay khi cắm.'],
      ready: ['Đã kết nối · ' + M.inputs.length + ' thiết bị', 'ok', M.inputs.map((i) => '• ' + (i.name || 'MIDI')).join('\n')],
    };
    const m = map[st] || map.idle;
    badge.textContent = m[0];
    badge.className = 'badge ' + m[1];
    note.textContent = m[2];
    note.style.whiteSpace = 'pre-line';
    btn.textContent = st === 'ready' ? '🎹 Quét lại thiết bị' : '🎹 Kết nối MIDI';
    const sel = $('midiDevice');
    const cur = sel.value;
    sel.innerHTML = '<option value="all">Tất cả thiết bị</option>' + M.inputs.map((i) => '<option value="' + i.id + '">' + (i.name || 'MIDI') + '</option>').join('');
    sel.value = M.inputs.some((i) => i.id === cur) ? cur : 'all';
  }
  function renderDetected() {
    const d = S.detected;
    const big = $('detBig'), chip = $('stDetected'), add = $('addDetected');
    if (d) {
      big.textContent = d.name;
      big.classList.remove('hit'); void big.offsetWidth; big.classList.add('hit');
      chip.hidden = false;
      chip.textContent = '🎹 ' + d.name;
      add.disabled = false;
    } else {
      big.textContent = S.held.length === 1 ? T.noteName(S.held[0], flats()) : '—';
      chip.hidden = true;
      add.disabled = true;
    }
  }

  // ---------- chọn nốt / thao tác ----------
  function updateSelInfo() {
    const ns = selNotes();
    const el = $('selInfo');
    if (!ns.length) el.textContent = 'Chưa chọn nốt';
    else if (ns.length === 1) el.textContent = T.noteName(ns[0].pitch, flats()) + ' · ô ' + (Math.floor(ns[0].start / 16) + 1);
    else el.textContent = ns.length + ' nốt đã chọn';
    if (ns.length && document.activeElement !== $('vel')) $('vel').value = Math.round(ns.reduce((a, n) => a + n.vel, 0) / ns.length);
  }
  function transpose(d) {
    const ns = selNotes();
    if (!ns.length) { toast('Chọn nốt trước (bấm vào nốt hoặc kéo vùng).'); return; }
    const ids = new Set(ns.map((n) => n.id));
    Store.commit((s) => s.notes.forEach((n) => { if (ids.has(n.id)) n.pitch = clamp(n.pitch + d, MS.RollConst.LO, MS.RollConst.HI); }), 'move');
    const f = Store.song.notes.find((n) => ids.has(n.id));
    if (f) Audio.preview(f.pitch, 0.3);
  }
  function moveSel(ds) {
    const ns = selNotes();
    if (!ns.length) return false;
    const minS = Math.min(...ns.map((n) => n.start));
    ds = Math.max(-minS, ds);
    const ids = new Set(ns.map((n) => n.id));
    Store.commit((s) => {
      s.notes.forEach((n) => { if (ids.has(n.id)) n.start += ds; });
      let m = 0;
      s.notes.forEach((n) => { m = Math.max(m, n.start + n.dur); });
      if (m > s.bars * 16) s.bars = Math.min(128, Math.ceil(m / 16));
    }, 'move');
    return true;
  }
  // ---------- lệnh chỉnh nốt nâng cao ----------
  function target() { const ns = selNotes(); return ns.length ? ns : Store.song.notes; }
  function needNotes() { if (!Store.song.notes.length) { toast('Chưa có nốt nào.'); return false; } return true; }
  function legato() {
    if (!needNotes()) return;
    const ns = target(), ids = new Set(ns.map((n) => n.id));
    const starts = [...new Set(Store.song.notes.map((n) => n.start))].sort((a, b) => a - b);
    Store.commit((s) => s.notes.forEach((n) => {
      if (!ids.has(n.id)) return;
      const nx = starts.find((t) => t > n.start);
      if (nx != null) n.dur = Math.max(1, nx - n.start);
    }), 'legato');
    toast('Legato: nối ' + ns.length + ' nốt.');
  }
  function chop() {
    if (!needNotes()) return;
    const ns = target().filter((n) => n.dur >= 2), ids = new Set(ns.map((n) => n.id));
    if (!ns.length) { toast('Các nốt đã ngắn nhất, không chia thêm được.'); return; }
    const add = [];
    ns.forEach((n) => { const a = Math.floor(n.dur / 2); add.push({ id: Store.uid(), start: n.start + a, dur: n.dur - a, pitch: n.pitch, vel: Math.max(20, n.vel - 8) }); });
    Store.commit((s) => { s.notes.forEach((n) => { if (ids.has(n.id)) n.dur = Math.floor(n.dur / 2); }); add.forEach((n) => s.notes.push(n)); }, 'chop');
    S.selection = new Set([...ids, ...add.map((n) => n.id)]);
    updateSelInfo(); roll.invalidate();
  }
  function reverseSel() {
    if (!needNotes()) return;
    const ns = target(), ids = new Set(ns.map((n) => n.id));
    const a = Math.min(...ns.map((n) => n.start)), b = Math.max(...ns.map((n) => n.start + n.dur));
    Store.commit((s) => s.notes.forEach((n) => { if (ids.has(n.id)) n.start = a + (b - (n.start + n.dur)); }), 'reverse');
    toast('Đã đảo ngược ' + ns.length + ' nốt.');
  }
  function scaleFix() {
    if (!needNotes()) return;
    const ns = target(), ids = new Set(ns.map((n) => n.id)), song = Store.song;
    let fixed = 0;
    Store.commit((s) => s.notes.forEach((n) => {
      if (!ids.has(n.id) || T.inScale(n.pitch, song.key, song.mode)) return;
      for (const d of [1, -1, 2, -2]) if (T.inScale(n.pitch + d, song.key, song.mode)) { n.pitch += d; fixed++; break; }
    }), 'scalefix');
    toast(fixed ? 'Đã đưa ' + fixed + ' nốt vào đúng thang âm.' : 'Mọi nốt đều đã đúng thang âm.');
  }
  function humanize() {
    if (!needNotes()) return;
    const ids = new Set(target().map((n) => n.id));
    Store.commit((s) => s.notes.forEach((n) => { if (ids.has(n.id)) n.vel = clamp(n.vel + Math.round((Math.random() - 0.5) * 18), 25, 127); }), 'vel');
    toast('Đã làm lực nhấn tự nhiên hơn.');
  }
  function loopSel() {
    if (!needNotes()) return;
    const ns = target();
    const a = Math.floor(Math.min(...ns.map((n) => n.start)) / 16) * 16, b = Math.ceil(Math.max(...ns.map((n) => n.start + n.dur)) / 16) * 16;
    S.loop = { on: true, start: a, end: Math.min(b, Store.totalSteps()) };
    $('btnLoop').classList.add('on');
    roll.invalidate();
    toast('Lặp ô ' + (a / 16 + 1) + '–' + Math.ceil(S.loop.end / 16) + '. Bấm ▶ để nghe.');
  }
  function fitView() {
    const ns = Store.song.notes;
    if (!ns.length) return;
    const end = Math.max(...ns.map((n) => n.start + n.dur)), lo = Math.min(...ns.map((n) => n.pitch)), hi = Math.max(...ns.map((n) => n.pitch));
    roll.zoom(Math.max(6, Math.min(60, (roll.viewW - 64 - 24) / end)) / roll.zx, 0);
    roll.zoom(0, Math.max(9, Math.min(26, roll.gridH / (hi - lo + 6))) / roll.rowH);
    roll.sc.scrollLeft = 0;
    roll.scrollToPitch((lo + hi) / 2);
    roll.invalidate();
  }
  function selectAll() { S.selection = new Set(Store.song.notes.map((n) => n.id)); updateSelInfo(); roll.invalidate(); }
  function setVelLane(on) {
    S.velLane = on;
    $('pVel').classList.toggle('on', on);
    roll.updateSpacer(); roll.resize(); roll.invalidate();
  }

  function quantizeSel() {
    const ns = selNotes().length ? selNotes() : Store.song.notes;
    if (!ns.length) return;
    const q = S.snap;
    if (q === 1) { toast('Chọn lưới 1/8 hoặc 1/4 ở thanh công cụ rồi bấm lại để căn nốt.'); return; }
    const ids = new Set(ns.map((n) => n.id));
    Store.commit((s) => s.notes.forEach((n) => {
      if (!ids.has(n.id)) return;
      n.start = Math.max(0, Math.round(n.start / q) * q);
      n.dur = Math.max(q, Math.round(n.dur / q) * q);
    }), 'quant');
    toast('Đã căn ' + ns.length + ' nốt vào lưới.');
  }
  function duplicateSel() {
    const ns = selNotes();
    if (!ns.length) return;
    const a = Math.min(...ns.map((n) => n.start)), b = Math.max(...ns.map((n) => n.start + n.dur));
    const off = b - a;
    const copies = ns.map((n) => Object.assign({}, n, { id: Store.uid(), start: n.start + off }));
    Store.commit((s) => {
      copies.forEach((n) => s.notes.push(n));
      if (b + off > s.bars * 16) s.bars = Math.min(128, Math.ceil((b + off) / 16));
    }, 'add');
    S.selection = new Set(copies.map((n) => n.id));
    roll.invalidate();
    updateSelInfo();
  }
  function deleteSel() {
    if (S.selChord) { roll._deleteChord(S.selChord); return; }
    const ns = selNotes();
    if (ns.length) roll._deleteNotes(ns.map((n) => n.id));
  }
  function copySel(cut) {
    const ns = selNotes();
    if (!ns.length) return;
    const a = Math.min(...ns.map((n) => n.start));
    S.clip = ns.map((n) => ({ ds: n.start - a, dur: n.dur, pitch: n.pitch, vel: n.vel }));
    toast('Đã sao chép ' + ns.length + ' nốt');
    if (cut) deleteSel();
  }
  function pasteClip() {
    if (!S.clip.length) return;
    const at = S.cursor;
    const copies = S.clip.map((c) => ({ id: Store.uid(), start: at + c.ds, dur: c.dur, pitch: c.pitch, vel: c.vel }));
    const end = Math.max(...copies.map((n) => n.start + n.dur));
    Store.commit((s) => {
      copies.forEach((n) => s.notes.push(n));
      if (end > s.bars * 16) s.bars = Math.min(128, Math.ceil(end / 16));
    }, 'add');
    S.selection = new Set(copies.map((n) => n.id));
    S.cursor = Math.min(Store.totalSteps(), end);
    roll.invalidate();
    updateSelInfo();
  }
  function transposeSong(d) {
    Store.commit((s) => {
      s.key = (s.key + d + 12) % 12;
      s.notes.forEach((n) => { n.pitch = clamp(n.pitch + d, 24, 108); });
      s.chords.forEach((c) => { c.root = (c.root + d + 12) % 12; });
    }, 'transpose');
  }
  function setBars(n) {
    const song = Store.song;
    let need = 1;
    song.notes.forEach((x) => { need = Math.max(need, Math.ceil((x.start + x.dur) / 16)); });
    song.chords.forEach((x) => { need = Math.max(need, Math.ceil((x.start + x.dur) / 16)); });
    const v = clamp(Math.round(n) || song.bars, need, 128);
    if (v !== n && n < need) toast('Không thể rút ngắn dưới ô ' + need + ' vì còn nốt/hợp âm ở đó.');
    if (v !== song.bars) Store.commit((s) => { s.bars = v; });
    $('bars').value = Store.song.bars;
  }

  // ---------- đồng bộ giao diện với store ----------
  function syncToolbar() {
    const s = Store.song;
    if (document.activeElement !== $('title')) $('title').value = s.title;
    $('key').value = s.key;
    $('mode').value = s.mode;
    if (document.activeElement !== $('bpm')) $('bpm').value = s.bpm;
    if (document.activeElement !== $('bars')) $('bars').value = s.bars;
    document.title = (s.title || 'Bài hát') + ' — Assistant Music AI';
    $('btnUndo').disabled = !Store.canUndo;
    $('btnRedo').disabled = !Store.canRedo;
  }
  function updateStatus() {
    const bar = cursorBar();
    const beat = Math.floor((S.cursor % 16) / 4) + 1;
    $('stCursor').textContent = 'Con trỏ: ô ' + (bar + 1) + ' · phách ' + beat;
    $('octLabel').textContent = T.noteName(60 + S.octave * 12, false);
  }
  function syncNoteLen() {
    const sel = $('noteLen');
    const v = String(S.noteLen);
    if (!Array.from(sel.options).some((o) => o.value === v)) {
      const o = document.createElement('option');
      o.value = v; o.textContent = v + '/16';
      sel.appendChild(o);
    }
    sel.value = v;
  }
  function onChange(reason) {
    const s = Store.song;
    // dọn chọn
    const ids = new Set(s.notes.map((n) => n.id));
    S.selection.forEach((id) => { if (!ids.has(id)) S.selection.delete(id); });
    if (S.selChord && !s.chords.some((c) => c.id === S.selChord)) S.selChord = null;
    S.cursor = clamp(S.cursor, 0, Store.totalSteps());
    if (S.loop.on) { S.loop.end = Math.min(S.loop.end, Store.totalSteps()); if (S.loop.end <= S.loop.start) S.loop = { on: false, start: 0, end: 0 }; $('btnLoop').classList.toggle('on', S.loop.on); }
    syncToolbar();
    const sig = s.key + ':' + s.mode;
    if (sig !== lastSig) { lastSig = sig; renderPalette(); renderProgs(); fillChordSelects(); }
    renderInspector();
    renderLyrics();
    renderMotif();
    updateSelInfo();
    updateStatus();
    $('rollEmpty').hidden = !!(s.notes.length || s.chords.length || S.candidates.length);
    roll.updateSpacer();
    roll.invalidate();
    void reason;
  }
  function fillChordSelects() {
    const f = flats();
    const root = $('chRoot');
    root.innerHTML = (f ? T.NAMES_F : T.NAMES_S).map((n, i) => '<option value="' + i + '">' + n + '</option>').join('');
  }

  function centerRoll() {
    const ps = Store.song.notes.map((n) => n.pitch);
    const mid = ps.length ? Math.round(ps.reduce((a, b) => a + b, 0) / ps.length) : T.tonicBase(Store.song.key) + 4;
    roll.scrollToPitch(mid);
    roll.sc.scrollLeft = 0;
  }

  // ---------- khởi tạo ----------
  function init() {
    // select giọng
    const keyNames = ['C', 'C♯/D♭', 'D', 'D♯/E♭', 'E', 'F', 'F♯/G♭', 'G', 'G♯/A♭', 'A', 'A♯/B♭', 'B'];
    $('key').innerHTML = keyNames.map((n, i) => '<option value="' + i + '">' + n + '</option>').join('');
    $('chQual').innerHTML = Object.keys(T.Q).map((q) => '<option value="' + q + '">' + (q === '' ? 'trưởng' : T.Q[q].label) + '</option>').join('');
    const instOpts = Object.keys(Audio.INST).map((k) => '<option value="' + k + '">' + Audio.INST[k].label + '</option>').join('');
    $('instMelody').innerHTML = instOpts;
    $('instChord').innerHTML = instOpts;
    $('instMelody').value = Audio.settings.inst.melody;
    $('instChord').value = Audio.settings.inst.chord;
    $('meter').innerHTML = '<i></i>'.repeat(14);
    const meterEls = Array.from($('meter').children);

    roll = new MS.Roll($('rollScroller'), $('rollCanvas'), $('rollSpacer'), $('lyricEdit'));
    MS.roll = roll;
    MS.invalidate = () => roll.invalidate();

    // hooks
    MS.hooks = {
      seek(step) {
        S.cursor = step;
        updateStatus();
        markCurLyric();
        if (Tr.playing && Input.recState === 'idle') {
          clearTimeout(seekTimer);
          seekTimer = setTimeout(() => startPlay(S.cursor), 140);
        }
      },
      selection() { updateSelInfo(); roll.invalidate(); },
      chordSelect(ch, keepArmed) { if (ch && !keepArmed) S.armed = null; renderPalette(); renderInspector(); roll.invalidate(); },
      chordEdit() { renderInspector(); $('chRoot').focus(); },
      loopChanged() { $('btnLoop').classList.toggle('on', S.loop.on); },
      noteLen: syncNoteLen,
      suggest, playRange, revealRange,
    };

    Store.on(onChange);

    // --- thanh trên ---
    $('title').addEventListener('change', (e) => Store.commit((s) => { s.title = e.target.value.trim() || 'Bài hát mới'; }));
    $('key').addEventListener('change', (e) => Store.commit((s) => { s.key = +e.target.value; }));
    $('mode').addEventListener('change', (e) => Store.commit((s) => { s.mode = e.target.value; }));
    $('keyDown').addEventListener('click', () => transposeSong(-1));
    $('keyUp').addEventListener('click', () => transposeSong(1));
    const setBpm = (v) => Store.commit((s) => { s.bpm = clamp(Math.round(v) || 90, 30, 240); });
    $('bpm').addEventListener('change', (e) => setBpm(+e.target.value));
    $('bpmDown').addEventListener('click', () => setBpm(Store.song.bpm - 2));
    $('bpmUp').addEventListener('click', () => setBpm(Store.song.bpm + 2));
    $('bars').addEventListener('change', (e) => setBars(+e.target.value));
    $('barsDown').addEventListener('click', () => setBars(Store.song.bars - 1));
    $('barsUp').addEventListener('click', () => setBars(Store.song.bars + 1));

    $('btnPlay').addEventListener('click', togglePlay);
    $('btnStop').addEventListener('click', stopAll);
    $('btnStart').addEventListener('click', () => { S.cursor = 0; roll.sc.scrollLeft = 0; if (Tr.playing) startPlay(0); roll.invalidate(); updateStatus(); });
    $('btnRec').addEventListener('click', toggleRecord);
    $('midiRec').addEventListener('click', toggleRecord);
    $('btnLoop').addEventListener('click', () => setLoop(!S.loop.on));
    $('btnMetro').addEventListener('click', () => { Audio.settings.metronome = !Audio.settings.metronome; $('btnMetro').classList.toggle('on', Audio.settings.metronome); });
    $('btnDrums').addEventListener('click', () => { Audio.settings.mute.drums = !Audio.settings.mute.drums; $('btnDrums').classList.toggle('on', !Audio.settings.mute.drums); });

    // file
    $('btnDemo').addEventListener('click', () => { Store.replace(MS.demoSong(), true); S.cursor = 0; toast('Đã nạp bài mẫu — bấm Space để nghe.'); centerRoll(); });
    $('btnSave').addEventListener('click', () => download(fileBase() + '.muse.json', Store.toJSON(), 'application/json'));
    $('btnOpen').addEventListener('click', () => $('fileOpen').click());
    $('fileOpen').addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try { Store.replace(JSON.parse(r.result), true); S.cursor = 0; toast('Đã mở “' + f.name + '”'); }
        catch (err) { toast('File không hợp lệ.'); }
      };
      r.readAsText(f);
      e.target.value = '';
    });
    $('btnMid').addEventListener('click', () => {
      if (!Store.song.notes.length && !Store.song.chords.length) { toast('Chưa có gì để xuất.'); return; }
      download(fileBase() + '.mid', MS.MidiFile.build(Store.song), 'audio/midi');
      toast('Đã xuất file MIDI — mở được trong FL Studio, Cubase, Logic…');
    });
    $('btnTxt').addEventListener('click', () => download(fileBase() + '.txt', MS.Export.toChart(Store.song), 'text/plain;charset=utf-8'));
    $('btnHelp').addEventListener('click', () => $('help').showModal());

    // --- thanh công cụ roll ---
    const tools = { draw: 'toolDraw', select: 'toolSelect', hand: 'toolHand', erase: 'toolErase' };
    Object.keys(tools).forEach((k) => $(tools[k]).addEventListener('click', () => {
      S.tool = k;
      Object.keys(tools).forEach((j) => $(tools[j]).classList.toggle('on', j === k));
    }));
    $('snap').addEventListener('change', (e) => { S.snap = +e.target.value; });
    $('noteLen').addEventListener('change', (e) => { S.noteLen = +e.target.value; });
    $('zoomInX').addEventListener('click', () => roll.zoom(1.25, 0));
    $('zoomOutX').addEventListener('click', () => roll.zoom(0.8, 0));
    $('zoomInY').addEventListener('click', () => roll.zoom(0, 1.2));
    $('zoomOutY').addEventListener('click', () => roll.zoom(0, 0.83));
    $('trDown').addEventListener('click', () => transpose(-1));
    $('trUp').addEventListener('click', () => transpose(1));
    $('trOctDown').addEventListener('click', () => transpose(-12));
    $('trOctUp').addEventListener('click', () => transpose(12));
    $('btnQuant').addEventListener('click', quantizeSel);
    $('pVel').addEventListener('click', () => setVelLane(!S.velLane));
    $('pLock').addEventListener('click', () => { S.scaleLock = !S.scaleLock; $('pLock').classList.toggle('on', S.scaleLock); toast(S.scaleLock ? 'Khoá thang âm: nốt vẽ mới sẽ tự vào đúng thang.' : 'Đã mở khoá thang âm.'); });
    $('pAll').addEventListener('click', selectAll);
    $('pLegato').addEventListener('click', legato);
    $('pChop').addEventListener('click', chop);
    $('pRev').addEventListener('click', reverseSel);
    $('pFix').addEventListener('click', scaleFix);
    $('pHum').addEventListener('click', humanize);
    $('pLoop').addEventListener('click', loopSel);
    $('pFit').addEventListener('click', fitView);

    $('btnDup').addEventListener('click', duplicateSel);
    $('btnDel').addEventListener('click', deleteSel);
    $('btnUndo').addEventListener('click', () => Store.undo());
    $('btnRedo').addEventListener('click', () => Store.redo());
    $('vel').addEventListener('input', (e) => {
      const ns = selNotes();
      if (!ns.length) return;
      if (!velTouched) { Store.checkpoint(); velTouched = true; }
      const v = +e.target.value, ids = new Set(ns.map((n) => n.id));
      Store.update((s) => s.notes.forEach((n) => { if (ids.has(n.id)) n.vel = v; }), 'vel');
    });
    $('vel').addEventListener('change', () => { velTouched = false; });

    // --- hợp âm / âm thanh ---
    $('chordMods').addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      S.chordMod = b.dataset.mod;
      S.armed = null;
      Array.from($('chordMods').children).forEach((c) => c.classList.toggle('on', c === b));
      renderPalette();
    });
    $('chRoot').addEventListener('change', (e) => Store.commit((s) => { const c = s.chords.find((x) => x.id === S.selChord); if (c) c.root = +e.target.value; }, 'chord'));
    $('chQual').addEventListener('change', (e) => Store.commit((s) => { const c = s.chords.find((x) => x.id === S.selChord); if (c) c.quality = e.target.value; }, 'chord'));
    $('chDelete').addEventListener('click', () => roll._deleteChord(S.selChord));
    $('chPlay').addEventListener('click', () => { const c = Store.song.chords.find((x) => x.id === S.selChord); if (c) Audio.previewChord(c); });
    $('btnHarmonize').addEventListener('click', harmonize);
    $('instMelody').addEventListener('change', (e) => Audio.setInst('melody', e.target.value));
    $('instChord').addEventListener('change', (e) => Audio.setInst('chord', e.target.value));
    $('chordStyle').addEventListener('change', (e) => { Audio.settings.chordStyle = e.target.value; });
    $('volMelody').addEventListener('input', (e) => Audio.setVolume('melody', +e.target.value));
    $('volChord').addEventListener('input', (e) => Audio.setVolume('chord', +e.target.value));
    $('muteMelody').addEventListener('change', (e) => Audio.setMute('melody', e.target.checked));
    $('muteChord').addEventListener('change', (e) => Audio.setMute('chord', e.target.checked));

    // --- tab phải ---
    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === t));
      document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.id === 'pane-' + t.dataset.tab));
    }));

    // --- trợ lý ---
    $('phraseSeg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      phraseBars = +b.dataset.v;
      Array.from($('phraseSeg').children).forEach((c) => c.classList.toggle('on', c === b));
    });
    $('adv').addEventListener('input', (e) => { $('advOut').textContent = e.target.value + '%'; });
    $('btnSuggest').addEventListener('click', () => { Audio.ensure(); suggest(); });
    $('btnAuto').addEventListener('click', () => { Audio.ensure(); autoComplete(); });
    $('candRegen').addEventListener('click', () => suggest());
    $('candDismiss').addEventListener('click', dismissCands);
    $('lyricApply').addEventListener('click', applyBulkLyrics);

    // --- MIDI ---
    $('midiConnect').addEventListener('click', () => { Audio.ensure(); Input.Midi.connect(); });
    $('midiDevice').addEventListener('change', (e) => Input.Midi.select(e.target.value));
    $('recQuant').addEventListener('change', (e) => { S.quant = +e.target.value; });
    $('recCount').addEventListener('change', (e) => { S.countIn = e.target.checked; });
    $('autoSuggest').addEventListener('change', (e) => { S.autoSuggest = e.target.checked; });
    $('stepToggle').addEventListener('change', (e) => { S.stepInput = e.target.checked; toast(S.stepInput ? 'Nhập từng nốt: bấm phím để đặt nốt tại con trỏ.' : 'Đã tắt nhập từng nốt.'); });
    $('stepLen').addEventListener('change', (e) => { S.stepLen = +e.target.value; });
    $('stepRest').addEventListener('click', () => Input.stepRest());
    $('stepBack').addEventListener('click', () => Input.stepBack());
    $('kbPiano').addEventListener('change', (e) => { S.kbPiano = e.target.checked; $('stKb').style.opacity = S.kbPiano ? 1 : 0.4; });
    $('addDetected').addEventListener('click', () => {
      const d = S.detected;
      if (!d) return;
      const prev = S.armed;
      S.armed = { root: d.root, quality: d.quality };
      roll._placeChord(cursorBar() * 16);
      S.armed = prev;
      S.cursor = Math.min(Store.totalSteps(), (cursorBar() + 1) * 16);
      updateStatus();
    });
    Input.on((type, data) => {
      if (type === 'midi') renderMidi();
      else if (type === 'held') renderDetected();
      else if (type === 'rec') {
        const on = data === 'rec';
        $('btnRec').classList.toggle('on', on);
        $('midiRec').classList.toggle('on', on);
        $('midiRec').textContent = on ? '■ Dừng thu' : '● Thu âm';
      } else if (type === 'recorded') {
        toast(data ? 'Đã thu ' + data + ' nốt' + (S.autoSuggest ? ' — đang gợi ý đoạn tiếp theo…' : '') : 'Không có nốt nào được thu.');
        roll.invalidate();
      } else if (type === 'cursor') { updateStatus(); roll.ensureVisible(S.cursor); }
      else if (type === 'octave') updateStatus();
    });
    renderMidi();
    if (!Input.Midi.supported) S.midiStatus = 'unsupported', renderMidi();
    else { try { if (localStorage.getItem('ms-midi') === '1') Input.Midi.connect(); } catch (e) { /* ok */ } }

    // --- phím tắt ---
    document.addEventListener('keydown', (e) => {
      const t = e.target;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if ($('help').open) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !typing) {
        const k = e.key.toLowerCase();
        if (k === 'z') { e.preventDefault(); e.shiftKey ? Store.redo() : Store.undo(); return; }
        if (k === 'y') { e.preventDefault(); Store.redo(); return; }
        if (k === 'a') { e.preventDefault(); S.selection = new Set(Store.song.notes.map((n) => n.id)); updateSelInfo(); roll.invalidate(); return; }
        if (k === 'c') { e.preventDefault(); copySel(false); return; }
        if (k === 'x') { e.preventDefault(); copySel(true); return; }
        if (k === 'v') { e.preventDefault(); pasteClip(); return; }
        if (k === 'd') { e.preventDefault(); duplicateSel(); return; }
        return;
      }
      if (typing || e.altKey) return;
      if (e.code === 'Space') { e.preventDefault(); Audio.ensure(); togglePlay(); return; }
      if (e.key === 'Home') { e.preventDefault(); $('btnStart').click(); return; }
      if (e.key === 'Escape') { S.armed = null; S.selection = new Set(); S.selChord = null; renderPalette(); renderInspector(); updateSelInfo(); roll.invalidate(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSel(); return; }
      if (e.key === '?') { $('help').showModal(); return; }
      if (/^[1-7]$/.test(e.key)) { placeDegree(+e.key - 1); return; }
      if (e.code === 'KeyR') { Audio.ensure(); toggleRecord(); return; }
      if (e.code === 'KeyM') { $('btnMetro').click(); return; }
      if (e.code === 'KeyB') { $('btnLoop').click(); return; }
      if (e.key.startsWith('Arrow')) {
        const has = selNotes().length > 0;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          const dir = e.key === 'ArrowLeft' ? -1 : 1;
          if (has) moveSel(dir * S.snap);
          else { S.cursor = clamp(S.cursor + dir * (e.shiftKey ? 16 : 4), 0, Store.totalSteps()); roll.ensureVisible(S.cursor); updateStatus(); markCurLyric(); roll.invalidate(); }
        } else if (has) {
          e.preventDefault();
          transpose((e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 12 : 1));
        }
      }
    });

    // --- vòng lặp khung hình ---
    function frame() {
      const st = Tr.getStep();
      S.playStep = st != null && st >= 0 ? st : null;
      Input.frame();
      const playingNow = Tr.playing && Input.recState === 'idle';
      $('btnPlay').classList.toggle('is-playing', playingNow);
      const ci = $('countIn');
      if (Tr.playing && Input.recState !== 'idle' && st != null && st < Input.recFrom) {
        const left = Math.max(1, Math.ceil((Input.recFrom - st) / 4));
        if (left !== lastCount) {
          lastCount = left;
          ci.textContent = left;
          ci.hidden = false;
          ci.style.animation = 'none'; void ci.offsetWidth; ci.style.animation = '';
        }
      } else if (!ci.hidden) { ci.hidden = true; lastCount = null; }
      if (Audio.ctx) {
        const lv = Audio.level();
        const n = Math.round(lv * meterEls.length);
        meterEls.forEach((el, i) => el.classList.toggle('on', i < n));
      }
      if (roll.dirty || Tr.playing || S.activePitches.size) {
        roll.dirty = false;
        roll.draw();
      }
      requestAnimationFrame(frame);
    }
    syncNoteLen();
    lastSig = '';
    onChange('init');
    centerRoll();
    $('btnLoop').classList.remove('on');
    requestAnimationFrame(frame);
  }

  MS.UI = { init, toast, startPlay, playRange, revealRange, suggest, centerRoll, renderMotif, selectCand, acceptCand, dismissCands, previewCand };
})();
