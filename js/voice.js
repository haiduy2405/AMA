/* Assistant Music AI — voice.js : hát vào micro → melody (dò cao độ YIN, tách nốt, căn nhịp) */
(function () {
  'use strict';
  const G = globalThis;
  const MS = (G.MS = G.MS || {});

  // ---------- 1. dò cao độ (YIN) ----------
  function yin(buf, sr, minF, maxF, thr) {
    minF = minF || 75; maxF = maxF || 900; thr = thr || 0.12;
    const N = buf.length;
    const tauMax = Math.min(Math.floor(sr / minF), (N >> 1) - 1);
    const tauMin = Math.max(2, Math.floor(sr / maxF));
    const W = N - tauMax;
    const d = new Float32Array(tauMax + 2);
    for (let tau = 1; tau <= tauMax; tau++) {
      let s = 0;
      for (let i = 0; i < W; i++) { const x = buf[i] - buf[i + tau]; s += x * x; }
      d[tau] = s;
    }
    const cm = new Float32Array(tauMax + 2);
    cm[0] = 1;
    let run = 0;
    for (let tau = 1; tau <= tauMax; tau++) { run += d[tau]; cm[tau] = run > 0 ? (d[tau] * tau) / run : 1; }
    let tau = -1;
    for (let t = tauMin; t < tauMax; t++) {
      if (cm[t] < thr) { while (t + 1 < tauMax && cm[t + 1] < cm[t]) t++; tau = t; break; }
    }
    if (tau < 0) {
      let m = tauMin;
      for (let t = tauMin; t < tauMax; t++) if (cm[t] < cm[m]) m = t;
      if (cm[m] < 0.2) tau = m; else return { f: 0, p: 0 };
    }
    const a = cm[tau - 1], b = cm[tau], c = cm[tau + 1];
    const den = a - 2 * b + c;
    const sh = den ? (a - c) / (2 * den) : 0;
    return { f: sr / (tau + Math.max(-1, Math.min(1, sh))), p: 1 - b };
  }
  function rmsOf(buf) {
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / buf.length);
  }
  const hzToMidi = (f) => 69 + 12 * Math.log2(f / 440);
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

  // ---------- 2. khung dò → nốt ----------
  // frames: [{t (giây, 0 = lúc bắt đầu thu), f (Hz, 0 = không có tiếng), rms}]
  function toNotes(frames, o) {
    const T = MS.Theory;
    o = Object.assign({ bpm: 90, key: null, mode: 'major', scale: true, q: 1, gate: 0.012, minDur: 0.075, bridge: 0.06, jump: 0.75, startStep: 0, trimLead: true, origin: 0 }, o || {});
    const out = { notes: [], key: o.key, mode: o.mode, voiced: 0 };
    if (!frames || frames.length < 3) return out;
    const stepSec = 60 / o.bpm / 4;
    const hop = (frames[frames.length - 1].t - frames[0].t) / (frames.length - 1) || 0.025;

    const vf = frames.map((fr) => ({ t: fr.t, m: fr.f > 0 && fr.rms >= o.gate ? hzToMidi(fr.f) : null, rms: fr.rms }));
    const sm = vf.map((x, i) => {
      if (x.m == null) return x;
      const w = [];
      for (let k = -2; k <= 2; k++) { const y = vf[i + k]; if (y && y.m != null) w.push(y.m); }
      return { t: x.t, m: median(w), rms: x.rms };
    });
    out.voiced = sm.filter((x) => x.m != null).length;

    const segs = [];
    let cur = null, gap = 0, pend = [];
    const newSeg = (x) => ({ t0: x.t, t1: x.t + hop, ms: [x.m], rm: [x.rms] });
    const add = (s, x) => { s.ms.push(x.m); s.rm.push(x.rms); s.t1 = x.t + hop; };
    const close = (t1) => { if (cur) { if (t1 != null) cur.t1 = t1; segs.push(cur); } cur = null; pend = []; gap = 0; };
    for (const x of sm) {
      if (x.m == null) {
        if (cur) { gap += hop; if (gap > o.bridge) close(); }
        continue;
      }
      if (!cur) { cur = newSeg(x); gap = 0; continue; }
      gap = 0;
      const ref = median(cur.ms.slice(-6));
      if (Math.abs(x.m - ref) > o.jump) {
        pend.push(x);
        if (pend.length >= 3) {
          const p = pend;
          close(p[0].t);
          cur = newSeg(p[0]);
          p.slice(1).forEach((y) => add(cur, y));
          pend = [];
        }
      } else { pend = []; add(cur, x); }
    }
    close();

    const good = segs.filter((s) => s.t1 - s.t0 >= o.minDur && s.ms.length >= 2);
    if (!good.length) return out;
    good.forEach((s) => { s.p = Math.round(median(s.ms)); s.v = median(s.rm); });

    // giọng điệu
    let key = o.key, mode = o.mode;
    if (key == null) {
      const g = T.guessKey(good.map((s) => ({ pitch: s.p, start: 0, dur: Math.max(1, Math.round((s.t1 - s.t0) / stepSec)) })));
      key = g ? g.key : 0; mode = g ? g.mode : 'major';
    }
    out.key = key; out.mode = mode;

    // ép vào thang âm + gom về khoảng đàn
    const fit = (p) => {
      if (o.scale && !T.inScale(p, key, mode)) {
        for (const d of [1, -1, 2, -2]) if (T.inScale(p + d, key, mode)) { p += d; break; }
      }
      while (p < 36) p += 12;
      while (p > 96) p -= 12;
      return p;
    };

    // căn nhịp
    const q = Math.max(1, o.q | 0);
    let lead = 0;
    if (o.trimLead) lead = Math.floor(Math.max(0, Math.round((good[0].t0 - o.origin) / stepSec)) / 16) * 16;
    const notes = [];
    for (const s of good) {
      let start = Math.round((s.t0 - o.origin) / stepSec / q) * q - lead;
      let end = Math.round((s.t1 - o.origin) / stepSec / q) * q - lead;
      if (start < 0) start = 0;
      const prev = notes[notes.length - 1];
      if (prev && start < prev.start + prev.dur) {
        if (start > prev.start) prev.dur = Math.max(q, start - prev.start);
        else start = prev.start + prev.dur;
      }
      end = Math.max(end, start + q);
      notes.push({ start: o.startStep + start, dur: end - start, pitch: fit(s.p), vel: Math.round(68 + 48 * Math.min(1, s.v / 0.14)) });
    }
    // nốt trùng cao độ liền kề sau khi ép thang vẫn giữ nguyên (người hát có nhắc lại)
    out.notes = notes;
    return out;
  }

  MS.Voice = { yin, rmsOf, hzToMidi, toNotes, init: function () {} };

  // ---------- 3. giao diện thu âm (chỉ trong trình duyệt) ----------
  if (typeof document === 'undefined') return;
  const $ = (id) => document.getElementById(id);
  const S = MS.S;
  const st = { state: 'idle', ctx: null, stream: null, an: null, buf: null, timer: null, frames: [], t0: 0, tick: 0, ids: null, locked: false, trace: [], startedAt: 0, last: null };

  function setState(s) {
    st.state = s;
    const p = $('voicePanel');
    p.dataset.state = s;
    const go = $('vpGo');
    go.textContent = s === 'rec' ? '⏹ Dừng' : s === 'count' ? '… chuẩn bị' : s === 'review' ? '⏺ Hát lại' : '⏺ Bắt đầu hát';
    go.disabled = s === 'count';
    go.classList.toggle('danger', s === 'rec');
    $('vpOpts').hidden = s !== 'review';
    $('vpOpts').classList.toggle('locked', !!st.locked);
    $('vpAfter').hidden = s !== 'review';
  }
  function msg(t) { $('vpMsg').innerHTML = t; }

  function open() {
    if (MS.Audio && MS.Audio.Transport && MS.Audio.Transport.playing) MS.Audio.Transport.stop();
    if (MS.Input && MS.Input.recState !== 'idle') MS.Input.stopRecord();
    $('voicePanel').hidden = false;
    document.body.classList.add('voice-on');
    st.ids = null;
    setState('idle');
    $('vpNote').textContent = '–';
    $('vpHz').textContent = '';
    $('vpLevel').style.width = '0';
    msg('Đeo tai nghe để tiếng đếm nhịp không lọt vào micro. Bấm <b>Bắt đầu hát</b>, đếm 4 nhịp rồi hát một câu (la la la… hoặc cả lời).');
    drawTrace();
  }
  function close() {
    cleanup();
    $('voicePanel').hidden = true;
    document.body.classList.remove('voice-on');
    st.state = 'idle';
  }
  function cleanup() {
    clearInterval(st.timer); st.timer = null;
    if (st.stream) st.stream.getTracks().forEach((t) => t.stop());
    st.stream = null;
    if (st.ctx) { try { st.ctx.close(); } catch (e) { /* ok */ } }
    st.ctx = null;
  }

  async function start() {
    if (st.ids) {
      if (st.locked) { // bạn đã chỉnh tay đoạn trước → giữ nguyên, đoạn mới nối tiếp phía sau
        S.cursor = Math.min(MS.Store.totalSteps(), Math.ceil(st.last.end / 16) * 16);
        st.ids = null;
      } else removeInserted();
    }
    st.locked = false;
    const song = MS.Store.song;
    try {
      st.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) {
      msg('Không mở được micro. Hãy cho phép quyền micro cho trang này (biểu tượng ổ khoá cạnh địa chỉ) rồi thử lại.');
      return;
    }
    const AC = G.AudioContext || G.webkitAudioContext;
    st.ctx = new AC();
    try { await st.ctx.resume(); } catch (e) { /* ok */ }
    const src = st.ctx.createMediaStreamSource(st.stream);
    st.an = st.ctx.createAnalyser();
    st.an.fftSize = 2048;
    st.an.smoothingTimeConstant = 0;
    src.connect(st.an);
    st.buf = new Float32Array(st.an.fftSize);
    st.frames = [];
    st.trace = [];
    const beat = 60 / song.bpm;
    const count = $('vpCount').checked ? 4 : 0;
    const now = st.ctx.currentTime;
    st.t0 = now + count * beat + 0.05;
    st.startedAt = now;
    for (let i = 0; i < count; i++) {
      const o = st.ctx.createOscillator(), g = st.ctx.createGain();
      const t = now + 0.05 + i * beat;
      o.frequency.value = i === 0 ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      o.connect(g); g.connect(st.ctx.destination);
      o.start(t); o.stop(t + 0.09);
    }
    setState(count ? 'count' : 'rec');
    msg(count ? 'Đếm nhịp… chuẩn bị hát!' : 'Đang thu — hãy hát.');
    st.timer = setInterval(poll, 22);
  }

  function poll() {
    if (!st.ctx) return;
    st.an.getFloatTimeDomainData(st.buf);
    const t = st.ctx.currentTime;
    const rms = rmsOf(st.buf);
    let f = 0;
    if (rms >= 0.008) { const r = yin(st.buf, st.ctx.sampleRate); if (r.p >= 0.8 && r.f > 70 && r.f < 1000) f = r.f; }
    $('vpLevel').style.width = Math.min(100, rms * 600) + '%';
    if (f) {
      const m = hzToMidi(f);
      $('vpNote').textContent = MS.Theory.noteName(Math.round(m), MS.Theory.useFlats(MS.Store.song.key, MS.Store.song.mode));
      $('vpHz').textContent = Math.round(f) + ' Hz · ' + (Math.round((m - Math.round(m)) * 100) >= 0 ? '+' : '') + Math.round((m - Math.round(m)) * 100) + '¢';
    }
    if (st.state === 'count' && t >= st.t0) { setState('rec'); msg('Đang thu — hát đi! Bấm <b>Dừng</b> khi xong.'); }
    if (st.state === 'rec') {
      const rel = t - st.t0;
      st.frames.push({ t: rel, f, rms });
      st.trace.push({ t: rel, m: f ? hzToMidi(f) : null });
      if (rel > 90) stop();
    }
    drawTrace();
  }

  function drawTrace() {
    const cv = $('vpTrace');
    if (!cv) return;
    const w = cv.clientWidth || 300, h = cv.clientHeight || 90, d = Math.min(2, G.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
    const c = cv.getContext('2d');
    c.setTransform(d, 0, 0, d, 0, 0);
    c.clearRect(0, 0, w, h);
    const win = 6;
    const tr = st.trace;
    const tEnd = tr.length ? tr[tr.length - 1].t : 0;
    const ms = tr.filter((x) => x.m != null).map((x) => x.m);
    const lo = ms.length ? Math.min(...ms) - 3 : 55, hi = ms.length ? Math.max(...ms) + 3 : 75;
    const span = Math.max(12, hi - lo);
    c.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 4; i++) c.fillRect(0, (h / 4) * i, w, 1);
    c.fillStyle = '#22d3ee';
    tr.forEach((x) => {
      if (x.m == null) return;
      const px = w - ((tEnd - x.t) / win) * w;
      if (px < 0) return;
      const py = h - 6 - ((x.m - lo) / span) * (h - 12);
      c.beginPath(); c.arc(px, py, 2.2, 0, 7); c.fill();
    });
  }

  function stop() {
    if (st.state !== 'rec') return;
    clearInterval(st.timer); st.timer = null;
    cleanup();
    if (!st.frames.filter((x) => x.f > 0).length) { setState('idle'); msg('Chưa nghe thấy giọng hát. Thử hát to hơn hoặc lại gần micro hơn rồi bấm <b>Bắt đầu hát</b>.'); return; }
    setState('review');
    apply(true);
    play();
  }
  function play() {
    if (st.last && MS.UI) MS.UI.playRange(st.last.start, st.last.end);
  }
  // đưa đoạn vừa hát ra màn chính để chỉnh sửa
  function showMelody() {
    if (!st.ids) return;
    const ns = MS.Store.song.notes.filter((n) => st.ids.has(n.id));
    if (!ns.length) return;
    const start = Math.min(...ns.map((n) => n.start));
    const mid = Math.round(ns.reduce((a, n) => a + n.pitch, 0) / ns.length);
    const phone = document.body.classList.contains('phone');
    if (phone) {
      if (document.body.classList.contains('roll-full')) { const x = $('rollClose'); if (x) x.click(); }
      const b = document.querySelector('#bottomNav [data-nav="studio"]'); if (b) b.click();
    }
    else { const cur = document.querySelector('#viewSw .on'); if (cur && cur.dataset.mode === 'roll') document.querySelector('#viewSw [data-mode="split"]').click(); }
    S.cursor = start;
    if (MS.Studio) MS.Studio.select(Math.floor(start / 16), 0, { preview: false });
    S.selection = new Set(st.ids);
    if (MS.hooks && MS.hooks.selection) MS.hooks.selection();
    if (MS.UI) MS.UI.revealRange(start, mid);
  }

  function opts() {
    const song = MS.Store.song;
    const empty = !song.notes.length && !song.chords.length;
    return {
      bpm: song.bpm, key: empty ? null : song.key, mode: song.mode,
      scale: $('vpScale').checked, q: +$('vpQ').value, startStep: S.cursor, origin: 0, trimLead: true,
    };
  }
  function removeInserted() {
    if (!st.ids) return;
    const ids = st.ids;
    MS.Store.update((s) => { s.notes = s.notes.filter((n) => !ids.has(n.id)); }, 'voice');
    st.ids = null;
  }
  function apply(first) {
    const Store = MS.Store;
    const o = opts();
    const wasEmpty = o.key == null;
    const r = toNotes(st.frames, o);
    if (!r.notes.length) { msg('Không tách được nốt nào — hát rõ từng âm hơn nhé (la la la…).'); return; }
    const notes = r.notes.map((n) => Object.assign({ id: Store.uid() }, n));
    const ids = new Set(notes.map((n) => n.id));
    const end = Math.max(...notes.map((n) => n.start + n.dur));
    const body = (s) => {
      if (st.ids) s.notes = s.notes.filter((n) => !st.ids.has(n.id));
      notes.forEach((n) => s.notes.push(n));
      if (wasEmpty) { s.key = r.key; s.mode = r.mode; }
      if (end > s.bars * 16) s.bars = Math.min(128, Math.ceil(end / 16));
    };
    if (first) Store.commit(body, 'voice'); else Store.update(body, 'voice');
    st.ids = ids;
    st.last = { start: o.startStep, end };
    S.selection = new Set(ids);
    if (MS.hooks && MS.hooks.selection) MS.hooks.selection();
    if (MS.UI && MS.UI.centerRoll) MS.UI.centerRoll();
    const T = MS.Theory;
    msg('Đã tạo <b>' + notes.length + ' nốt</b>' + (wasEmpty ? ' · nhận giọng <b>' + T.pcName(r.key, T.useFlats(r.key, r.mode)) + (r.mode === 'minor' ? ' thứ' : ' trưởng') + '</b>' : '') + ' từ giọng hát. Bấm ▶ Nghe lại, hoặc chỉnh lưới/thang âm bên dưới.');
  }

  function init() {
    if (!$('voicePanel')) return;
    $('btnVoice').addEventListener('click', open);
    $('vpClose').addEventListener('click', close);
    $('vpEdit').addEventListener('click', () => { showMelody(); close(); });
    $('vpGo').addEventListener('click', () => {
      if (st.state === 'rec') stop();
      else if (st.state === 'idle' || st.state === 'review') start();
    });
    ['vpScale', 'vpQ'].forEach((id) => $(id).addEventListener('change', () => { if (st.state === 'review' && st.frames.length) apply(false); }));
    $('vpPlay').addEventListener('click', play);
    // nếu người dùng chỉnh tay đoạn vừa tạo thì khoá các tuỳ chọn (tránh ghi đè công sức chỉnh)
    MS.Store.on((reason) => {
      if (st.state !== 'review' || !st.ids || reason === 'voice' || st.locked) return;
      st.locked = true;
      $('vpOpts').classList.add('locked');
      msg('Bạn đã chỉnh tay đoạn này nên không đổi lưới/thang âm tự động nữa. Muốn tạo lại: <b>Hát lại</b> (đoạn mới sẽ nối tiếp phía sau).');
    });
    $('vpSuggest').addEventListener('click', () => { close(); if (MS.UI) { MS.Audio.ensure(); MS.UI.suggest(); } });
    $('vpLyrics').addEventListener('click', () => { showMelody(); close(); if (MS.Studio) MS.Studio.startEdit && MS.Studio.startEdit(Math.floor(S.cursor / 16)); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('voicePanel').hidden) { e.stopPropagation(); close(); } }, true);
  }
  MS.Voice.init = init;
  MS.Voice._state = st;
})();
