/* Muse Studio — input.js : MIDI keyboard (Web MIDI), bàn phím máy tính làm đàn, thu âm, nhập từng nốt */
(function () {
  'use strict';
  const G = globalThis;
  const MS = (G.MS = G.MS || {});
  const S = MS.S;
  const Store = MS.Store;
  const Audio = MS.Audio;
  const T = MS.Theory;

  const listeners = [];
  const emit = (type, data) => listeners.forEach((fn) => { try { fn(type, data); } catch (e) { console.error(e); } });

  const voices = new Map();
  const held = new Set();
  const sustained = new Set();
  let pedal = false;

  // ---------- thu âm ----------
  const Rec = { state: 'idle', pending: new Map(), notes: [], from: 0, lastStep: 0 };

  function curStep() {
    const s = Audio.Transport.getStep();
    if (s !== null) Rec.lastStep = s;
    return s;
  }

  function recNoteOn(pitch, vel) {
    if (Rec.state !== 'rec') return;
    const s = curStep();
    if (s === null || s < Rec.from - 0.2) return; // đang đếm nhịp
    Rec.pending.set(pitch, { s: Math.max(s, Rec.from), vel });
  }
  function recNoteOff(pitch) {
    if (Rec.state !== 'rec') return;
    const p = Rec.pending.get(pitch);
    if (!p) return;
    Rec.pending.delete(pitch);
    const e = curStep();
    Rec.notes.push({ pitch, s: p.s, e: e === null ? Rec.lastStep : e, vel: p.vel });
  }

  const Input = {
    held, listeners,
    on(fn) { listeners.push(fn); },
    get recState() { return Rec.state; },
    get recFrom() { return Rec.from; },

    noteOn(pitch, vel) {
      vel = vel || 90;
      Audio.ensure();
      const old = voices.get(pitch);
      if (old) old.release(G.MS.Audio.ctx.currentTime);
      voices.set(pitch, Audio.noteOn(pitch, vel, 'melody'));
      sustained.delete(pitch);
      held.add(pitch);
      S.activePitches.set(pitch, 'live');
      recNoteOn(pitch, vel);
      stepEnter(pitch, vel);
      this.heldChanged();
    },
    noteOff(pitch) {
      held.delete(pitch);
      recNoteOff(pitch);
      if (pedal) sustained.add(pitch);
      else {
        const v = voices.get(pitch);
        if (v) v.release(Audio.ctx.currentTime);
        voices.delete(pitch);
        S.activePitches.delete(pitch);
      }
      this.heldChanged();
    },
    setPedal(on) {
      pedal = on;
      if (!on) {
        sustained.forEach((p) => {
          if (held.has(p)) return;
          const v = voices.get(p);
          if (v) v.release(Audio.ctx.currentTime);
          voices.delete(p);
          S.activePitches.delete(p);
        });
        sustained.clear();
        MS.invalidate();
      }
    },
    allOff() {
      voices.forEach((v) => v.release(Audio.ctx ? Audio.ctx.currentTime : 0));
      voices.clear(); held.clear(); sustained.clear();
      S.activePitches.forEach((v, k) => { if (v === 'live') S.activePitches.delete(k); });
      this.heldChanged();
    },
    heldChanged() {
      S.held = [...held].sort((a, b) => a - b);
      S.detected = S.held.length >= 2 ? T.detectChord(S.held) : null;
      MS.invalidate();
      emit('held', S.held);
    },

    // --- thu âm ---
    startRecord() {
      if (Rec.state !== 'idle') return;
      Audio.ensure();
      Rec.state = 'rec';
      Rec.notes = [];
      Rec.pending.clear();
      Rec.from = Math.min(S.cursor, Store.totalSteps() - 1);
      Rec.lastStep = Rec.from;
      Audio.Transport.play({ from: Rec.from, countIn: S.countIn ? 1 : 0, loop: null, to: Store.totalSteps(), onstop: finishRecord });
      emit('rec', 'rec');
    },
    stopRecord() {
      if (Rec.state === 'idle') return;
      if (Audio.Transport.playing) Audio.Transport.stop();
      else finishRecord();
    },

    // --- nhập từng nốt ---
    stepRest() {
      S.cursor = Math.min(Store.totalSteps(), S.cursor + S.stepLen);
      MS.invalidate();
      emit('cursor');
    },
    stepBack() {
      S.cursor = Math.max(0, S.cursor - S.stepLen);
      MS.invalidate();
      emit('cursor');
    },
  };

  function finishRecord() {
    if (Rec.state === 'idle') return;
    Rec.state = 'idle';
    const endNow = Rec.lastStep;
    Rec.pending.forEach((p, pitch) => Rec.notes.push({ pitch, s: p.s, e: endNow, vel: p.vel }));
    Rec.pending.clear();
    const q = S.quant || 1;
    const total = Store.totalSteps();
    const out = [];
    Rec.notes.forEach((n) => {
      let start = Math.round(n.s / q) * q;
      start = Math.max(Rec.from, Math.min(total - 1, start));
      let dur = Math.max(q, Math.round((n.e - n.s) / q) * q);
      dur = Math.max(1, Math.min(dur, total - start));
      out.push({ id: Store.uid(), start, dur, pitch: n.pitch, vel: n.vel });
    });
    Rec.notes = [];
    if (out.length) {
      Store.commit((song) => out.forEach((n) => song.notes.push(n)), 'record');
      S.selection = new Set(out.map((n) => n.id));
    }
    emit('rec', 'idle');
    emit('recorded', out.length);
    if (out.length && S.autoSuggest && MS.hooks && MS.hooks.suggest) MS.hooks.suggest();
  }

  // ---------- nhập từng nốt ----------
  let stepGroup = null;
  let stepTimer = null;
  function stepEnter(pitch, vel) {
    if (!S.stepInput || Rec.state !== 'idle') return;
    if (!stepGroup) {
      stepGroup = { at: S.cursor };
      Store.checkpoint();
    }
    const at = stepGroup.at;
    const len = S.stepLen;
    Store.update((song) => {
      song.notes.push({ id: Store.uid(), start: at, dur: len, pitch, vel });
      if (at + len > song.bars * 16) song.bars = Math.min(128, Math.ceil((at + len) / 16));
    }, 'step');
    clearTimeout(stepTimer);
    stepTimer = setTimeout(() => {
      S.cursor = stepGroup.at + len;
      stepGroup = null;
      MS.invalidate();
      emit('cursor');
    }, 90);
  }

  // ---------- Web MIDI ----------
  const Midi = {
    supported: typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess,
    access: null,
    inputs: [],
    selected: 'all',
    connect() {
      if (!Midi.supported) { setStatus('unsupported'); return Promise.resolve(false); }
      setStatus('connecting');
      return navigator.requestMIDIAccess({ sysex: false }).then(
        (a) => {
          Midi.access = a;
          a.onstatechange = refresh;
          try { localStorage.setItem('ms-midi', '1'); } catch (e) { /* ok */ }
          refresh();
          return true;
        },
        () => { setStatus('denied'); return false; }
      );
    },
    select(id) { Midi.selected = id; },
  };

  function setStatus(s) {
    S.midiStatus = s;
    emit('midi', s);
  }
  function refresh() {
    if (!Midi.access) return;
    Midi.inputs = [...Midi.access.inputs.values()];
    Midi.inputs.forEach((inp) => {
      inp.onmidimessage = (e) => handle(inp.id, e.data);
    });
    setStatus(Midi.inputs.length ? 'ready' : 'nodevice');
  }
  function handle(id, d) {
    if (Midi.selected !== 'all' && Midi.selected !== id) return;
    const cmd = d[0] & 0xf0;
    if (cmd === 0x90 && d[2] > 0) Input.noteOn(d[1], d[2]);
    else if (cmd === 0x80 || (cmd === 0x90 && d[2] === 0)) Input.noteOff(d[1]);
    else if (cmd === 0xb0 && d[1] === 64) Input.setPedal(d[2] >= 64);
    else if (cmd === 0xb0 && d[1] === 123) Input.allOff();
  }

  // ---------- bàn phím máy tính làm đàn ----------
  const KB = { KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16 };
  const kbDown = new Map();
  const isTyping = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', (e) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyZ' || e.code === 'KeyX') {
        if (!S.kbPiano || e.repeat) return;
        S.octave = Math.max(-3, Math.min(3, S.octave + (e.code === 'KeyZ' ? -1 : 1)));
        emit('octave');
        return;
      }
      if (!S.kbPiano || !(e.code in KB)) return;
      if (e.repeat) { e.preventDefault(); return; }
      const pitch = 60 + S.octave * 12 + KB[e.code];
      if (kbDown.has(e.code)) return;
      kbDown.set(e.code, pitch);
      e.preventDefault();
      Input.noteOn(pitch, 92);
    });
    document.addEventListener('keyup', (e) => {
      if (!kbDown.has(e.code)) return;
      const p = kbDown.get(e.code);
      kbDown.delete(e.code);
      Input.noteOff(p);
    });
    window.addEventListener('blur', () => { kbDown.clear(); Input.allOff(); });
  }

  Input.Midi = Midi;
  Input.frame = curStep;
  MS.Input = Input;
  MS.Midi = Midi;
})();
