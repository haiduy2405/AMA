/* Assistant Music AI — audio.js : synth Web Audio, reverb, trống nhẹ, metronome, transport có lookahead */
(function () {
  'use strict';
  const G = globalThis;
  const MS = (G.MS = G.MS || {});
  const T = MS.Theory;
  const Store = MS.Store;

  // osc: [kiểu, semitone, mức, cents]
  const INST = {
    piano: { label: 'Piano', osc: [['triangle', 0, 1, 0], ['sine', 12, 0.3, 0], ['sine', 19, 0.08, 0]], a: 0.003, d: 0.5, s: 0.22, r: 0.35, cutoff: 2600, fenv: 3500, gain: 1 },
    epiano: { label: 'Piano điện', osc: [['sine', 0, 1, 0], ['sine', 12, 0.35, 0], ['sine', 24, 0.1, 0]], a: 0.004, d: 0.9, s: 0.3, r: 0.5, cutoff: 4000, fenv: 1500, gain: 0.9 },
    pad: { label: 'Pad', osc: [['sawtooth', 0, 0.45, -7], ['sawtooth', 0, 0.45, 7], ['sine', -12, 0.4, 0]], a: 0.22, d: 0.8, s: 0.8, r: 0.7, cutoff: 1100, fenv: 400, gain: 0.55 },
    pluck: { label: 'Guitar gảy', osc: [['triangle', 0, 0.8, 0], ['square', 0, 0.22, 3]], a: 0.002, d: 0.22, s: 0.05, r: 0.15, cutoff: 1800, fenv: 4000, gain: 0.9 },
    sao: { label: 'Sáo', osc: [['sine', 0, 1, 0], ['triangle', 12, 0.08, 0]], a: 0.06, d: 0.1, s: 0.9, r: 0.15, cutoff: 5000, fenv: 0, gain: 0.85, vib: 5.2 },
  };

  let ctx = null, master, comp, analyser, wetBus, noiseBuf;
  const buses = {};
  const settings = {
    inst: { melody: 'piano', chord: 'pad' },
    vol: { melody: 0.9, chord: 0.6, drums: 0.5, click: 0.6 },
    mute: { melody: false, chord: false, drums: true },
    metronome: false,
    chordStyle: 'arp', // 'arp' | 'block'
  };
  const live = new Set();

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    const AC = G.AudioContext || G.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = 0.85;
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    master.connect(comp);
    comp.connect(analyser);
    analyser.connect(ctx.destination);
    // reverb: xung nhiễu suy giảm
    const len = Math.floor(ctx.sampleRate * 1.9);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    wetBus = ctx.createGain();
    wetBus.gain.value = 0.22;
    wetBus.connect(conv);
    conv.connect(master);
    ['melody', 'chord', 'drums', 'click'].forEach((k) => {
      const g = ctx.createGain();
      g.gain.value = settings.vol[k];
      g.connect(master);
      if (k !== 'click' && k !== 'drums') {
        const send = ctx.createGain();
        send.gain.value = k === 'melody' ? 0.5 : 0.7;
        g.connect(send);
        send.connect(wetBus);
      }
      buses[k] = g;
    });
    const nl = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, nl, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function makeVoice(pitch, t, vel, instName, bus, gainMul) {
    const def = INST[instName] || INST.piano;
    const f = 440 * Math.pow(2, (pitch - 69) / 12);
    const g = ctx.createGain();
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    const peak = Math.max(0.02, vel / 127) * def.gain * (gainMul || 1) * 0.42;
    flt.frequency.setValueAtTime(Math.min(def.cutoff + def.fenv, 14000), t);
    flt.frequency.setTargetAtTime(def.cutoff, t, Math.max(0.05, def.d / 3));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + def.a);
    g.gain.setTargetAtTime(peak * def.s, t + def.a, Math.max(0.02, def.d / 3));
    const oscs = [];
    def.osc.forEach(([type, semi, lvl, cents]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * Math.pow(2, semi / 12);
      o.detune.value = cents;
      const lg = ctx.createGain();
      lg.gain.value = lvl;
      o.connect(lg);
      lg.connect(flt);
      o.start(t);
      oscs.push(o);
    });
    let lfo = null;
    if (def.vib) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = def.vib;
      const lg = ctx.createGain();
      lg.gain.value = 7;
      lfo.connect(lg);
      oscs.forEach((o) => lg.connect(o.detune));
      lfo.start(t);
    }
    flt.connect(g);
    g.connect(bus);
    let released = false;
    const voice = {
      pitch,
      release(tr) {
        if (released) return;
        released = true;
        tr = Math.max(tr, t + def.a + 0.005);
        g.gain.cancelScheduledValues(tr);
        g.gain.setTargetAtTime(0.0001, tr, def.r / 3);
        const end = tr + def.r * 1.6 + 0.05;
        oscs.forEach((o) => o.stop(end));
        if (lfo) lfo.stop(end);
        oscs[0].onended = () => {
          try { g.disconnect(); flt.disconnect(); } catch (e) { /* ok */ }
          live.delete(voice);
        };
      },
    };
    live.add(voice);
    return voice;
  }

  function note(pitch, t, dur, vel, track) {
    const inst = settings.inst[track === 'chord' ? 'chord' : 'melody'];
    const v = makeVoice(pitch, t, vel, inst, buses[track], 1);
    v.release(t + dur);
    return v;
  }

  // ---- trống & click ----
  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g); g.connect(buses.drums);
    o.start(t); o.stop(t + 0.3);
  }
  function noiseHit(t, type, freq, dur, level) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(buses.drums);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  function click(t, accent) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = accent ? 1900 : 1250;
    g.gain.setValueAtTime(accent ? 0.5 : 0.32, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g); g.connect(buses.click);
    o.start(t); o.stop(t + 0.07);
  }

  // ---- chỉ mục theo bước (build lại khi rev đổi) ----
  const idx = { rev: -1, extraRef: null, notes: new Map(), chords: [] };
  function reindex(extra) {
    if (idx.rev === Store.rev && idx.extraRef === extra) return;
    idx.rev = Store.rev;
    idx.extraRef = extra;
    idx.notes = new Map();
    const add = (n) => {
      if (!idx.notes.has(n.start)) idx.notes.set(n.start, []);
      idx.notes.get(n.start).push(n);
    };
    Store.song.notes.forEach(add);
    if (extra && extra.notes) extra.notes.forEach(add);
    idx.chords = Store.song.chords.concat(extra && extra.chords ? extra.chords : []).sort((a, b) => a.start - b.start);
  }

  // ---- transport ----
  const Tr = {
    playing: false, queue: [], timer: null, nextStep: 0, nextTime: 0, endStep: 0,
    loop: null, extra: null, finished: false, stopAt: 0, from: 0, countIn: 0, onstop: null,
  };
  const stepDur = () => 60 / Store.song.bpm / 4;

  function scheduleStep(s, time, sd, extra) {
    if (s < 0) {
      if (mod4(s) === 0) click(time, mod16(s) === 0);
      return;
    }
    reindex(extra);
    if (settings.metronome && s % 4 === 0) click(time, s % 16 === 0);
    if (!settings.mute.melody) {
      const list = idx.notes.get(s);
      if (list) list.forEach((n) => note(n.pitch, time, Math.max(0.05, n.dur * sd * 0.97), n.vel, 'melody'));
    }
    if (!settings.mute.chord) {
      for (const c of idx.chords) {
        if (c.start > s) break;
        if (s >= c.start + c.dur) continue;
        const v = T.voicing(c);
        const k = s - c.start;
        if (settings.chordStyle === 'block') {
          if (k === 0) [v.bass, ...v.upper].forEach((p, i) => note(p, time + i * 0.014, c.dur * sd * 0.98, i === 0 ? 78 : 62, 'chord'));
        } else if (k % 2 === 0) {
          const pat = [-1, 0, 1, 2, 1, 0, 1, 2];
          const sel = pat[(k / 2) % 8];
          const up = v.upper;
          const p = sel < 0 ? v.bass : up[Math.min(sel, up.length - 1)];
          const dur = Math.min(sel < 0 ? 8 : 5, c.start + c.dur - s) * sd;
          note(p, time, dur, sel < 0 ? 80 : 58 + (k % 8 === 0 ? 6 : 0), 'chord');
        }
        break;
      }
    }
    if (!settings.mute.drums) {
      const k = s % 16;
      if (k === 0 || k === 10) kick(time);
      if (k === 4 || k === 12) noiseHit(time, 'bandpass', 1800, 0.14, 0.22);
      if (k % 2 === 0) noiseHit(time, 'highpass', 7500, 0.05, k % 4 === 0 ? 0.1 : 0.06);
    }
  }
  const mod4 = (n) => ((n % 4) + 4) % 4;
  const mod16 = (n) => ((n % 16) + 16) % 16;

  function tick() {
    if (!Tr.playing) return;
    const now = ctx.currentTime;
    const sd = stepDur();
    while (!Tr.finished && Tr.nextTime < now + 0.14) {
      scheduleStep(Tr.nextStep, Tr.nextTime, sd, Tr.extra);
      Tr.queue.push({ time: Tr.nextTime, step: Tr.nextStep });
      Tr.nextStep++;
      Tr.nextTime += sd;
      if (Tr.loop) {
        if (Tr.nextStep >= Tr.loop.end) Tr.nextStep = Tr.loop.start;
      } else if (Tr.nextStep >= Tr.endStep) {
        Tr.finished = true;
        Tr.stopAt = Tr.nextTime + 0.45;
      }
    }
    while (Tr.queue.length > 2 && Tr.queue[1].time < now - 0.5) Tr.queue.shift();
    if (Tr.finished && now >= Tr.stopAt) Transport.stop();
  }

  const Transport = {
    get playing() { return Tr.playing; },
    get countingIn() {
      if (!Tr.playing) return false;
      const s = Transport.getStep();
      return s !== null && s < Tr.from;
    },
    play(o) {
      o = o || {};
      ensure();
      Transport.stop(true);
      Tr.from = Math.max(0, o.from || 0);
      Tr.countIn = o.countIn || 0;
      Tr.nextStep = Tr.from - Tr.countIn * 16;
      Tr.nextTime = ctx.currentTime + 0.07;
      Tr.queue = [];
      Tr.endStep = o.to != null ? o.to : Store.totalSteps();
      Tr.loop = o.loop && o.loop.end > o.loop.start ? { start: o.loop.start, end: o.loop.end } : null;
      if (Tr.loop && Tr.from >= Tr.loop.end) Tr.from = Tr.loop.start;
      Tr.extra = o.extra || null;
      Tr.onstop = o.onstop || null;
      Tr.finished = false;
      Tr.playing = true;
      tick();
      Tr.timer = setInterval(tick, 25);
    },
    stop(silent) {
      if (!Tr.playing) return;
      Tr.playing = false;
      clearInterval(Tr.timer);
      Tr.timer = null;
      const cb = Tr.onstop;
      Tr.onstop = null;
      if (!silent) Audio.panic(0.12);
      else Audio.panic(0.03);
      if (cb && !silent) cb();
    },
    getStep() {
      if (!Tr.playing || !ctx) return null;
      const now = ctx.currentTime;
      const q = Tr.queue;
      if (!q.length) return Tr.nextStep;
      let e = null;
      for (let i = 0; i < q.length; i++) {
        if (q[i].time <= now) e = q[i];
        else break;
      }
      if (!e) return q[0].step - (q[0].time - now) / stepDur();
      return e.step + (now - e.time) / stepDur();
    },
  };

  const Audio = {
    INST, settings, Transport,
    get ctx() { return ctx; },
    ensure,
    // nốt trực tiếp (MIDI / bàn phím / click đàn)
    noteOn(pitch, vel, track) {
      ensure();
      const tr = track || 'melody';
      const v = makeVoice(pitch, ctx.currentTime, vel || 90, settings.inst[tr === 'chord' ? 'chord' : 'melody'], buses[tr], 1);
      return v;
    },
    preview(pitch, dur) {
      ensure();
      note(pitch, ctx.currentTime, dur || 0.4, 92, 'melody');
    },
    previewChord(c) {
      ensure();
      const v = T.voicing(c);
      const t = ctx.currentTime;
      [v.bass, ...v.upper].forEach((p, i) => note(p, t + i * 0.025, 1.3, i === 0 ? 80 : 66, 'chord'));
    },
    setInst(track, name) { if (INST[name]) settings.inst[track] = name; },
    setVolume(track, v) {
      settings.vol[track] = v;
      if (buses[track]) buses[track].gain.value = v;
    },
    setMute(track, m) { settings.mute[track] = m; },
    panic(fade) {
      if (!ctx) return;
      const t = ctx.currentTime + (fade || 0);
      live.forEach((v) => v.release(t));
    },
    level() {
      if (!analyser) return 0;
      const a = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(a);
      let s = 0;
      for (let i = 0; i < a.length; i++) { const x = (a[i] - 128) / 128; s += x * x; }
      return Math.min(1, Math.sqrt(s / a.length) * 3.2);
    },
  };

  MS.Audio = Audio;
})();
