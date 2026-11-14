/* Assistant Music AI — store.js : trạng thái bài hát, undo/redo, tự lưu */
(function () {
  'use strict';
  const G = globalThis;
  const MS = (G.MS = G.MS || {});
  const KEY = 'muse-studio-song-v1';

  const uid = () => Math.random().toString(36).slice(2, 9);

  function blank() {
    return { v: 1, title: 'Bài hát mới', key: 0, mode: 'major', bpm: 90, bars: 8, notes: [], chords: [], lyrics: {}, sections: [] };
  }

  function normalize(s) {
    const d = blank();
    const o = Object.assign(d, s || {});
    o.key = ((Math.round(+o.key) % 12) + 12) % 12;
    o.mode = o.mode === 'minor' ? 'minor' : 'major';
    o.bpm = Math.max(30, Math.min(240, +o.bpm || 90));
    o.bars = Math.max(1, Math.min(128, Math.round(+o.bars) || 8));
    o.notes = (o.notes || []).filter((n) => n && isFinite(n.start) && isFinite(n.pitch)).map((n) => ({
      id: n.id || uid(), start: Math.max(0, Math.round(n.start)), dur: Math.max(1, Math.round(n.dur || 1)),
      pitch: Math.max(0, Math.min(127, Math.round(n.pitch))), vel: Math.max(1, Math.min(127, Math.round(n.vel || 90))),
    }));
    o.chords = (o.chords || []).filter((c) => c && isFinite(c.start)).map((c) => ({
      id: c.id || uid(), start: Math.max(0, Math.round(c.start)), dur: Math.max(1, Math.round(c.dur || 16)),
      root: ((Math.round(c.root) % 12) + 12) % 12, quality: c.quality || '',
    }));
    o.lyrics = o.lyrics && typeof o.lyrics === 'object' ? o.lyrics : {};
    o.sections = Array.isArray(o.sections) ? o.sections.filter((x) => x && isFinite(x.bar) && x.name) : [];
    return o;
  }

  const listeners = [];
  const state = {
    song: blank(),
    rev: 0,
    undoStack: [],
    redoStack: [],
  };
  let saveTimer = null;

  function emit(reason) {
    listeners.forEach((fn) => {
      try { fn(reason); } catch (e) { console.error(e); }
    });
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  }
  function save() {
    try {
      if (G.localStorage) G.localStorage.setItem(KEY, JSON.stringify(state.song));
    } catch (e) { /* bộ nhớ đầy / bị chặn */ }
  }

  const Store = {
    uid,
    saveNow() { clearTimeout(saveTimer); save(); },
    blank,
    normalize,
    get song() { return state.song; },
    get rev() { return state.rev; },
    get canUndo() { return state.undoStack.length > 0; },
    get canRedo() { return state.redoStack.length > 0; },
    on(fn) { listeners.push(fn); },
    // Lưu mốc undo (gọi trước khi sửa). Dùng cho thao tác kéo thả: checkpoint 1 lần rồi update nhiều lần.
    checkpoint() {
      state.undoStack.push(JSON.stringify(state.song));
      if (state.undoStack.length > 150) state.undoStack.shift();
      state.redoStack.length = 0;
    },
    update(fn, reason) {
      fn(state.song);
      state.rev++;
      emit(reason || 'update');
      scheduleSave();
    },
    commit(fn, reason) {
      Store.checkpoint();
      Store.update(fn, reason);
    },
    undo() {
      if (!state.undoStack.length) return false;
      state.redoStack.push(JSON.stringify(state.song));
      state.song = normalize(JSON.parse(state.undoStack.pop()));
      state.rev++;
      emit('undo');
      scheduleSave();
      return true;
    },
    redo() {
      if (!state.redoStack.length) return false;
      state.undoStack.push(JSON.stringify(state.song));
      state.song = normalize(JSON.parse(state.redoStack.pop()));
      state.rev++;
      emit('undo');
      scheduleSave();
      return true;
    },
    // Thay cả bài (mở file, bài mẫu, bài mới)
    replace(song, keepHistory) {
      if (keepHistory) Store.checkpoint();
      else { state.undoStack.length = 0; state.redoStack.length = 0; }
      state.song = normalize(song);
      state.rev++;
      emit('replace');
      scheduleSave();
    },
    load() {
      try {
        const raw = G.localStorage && G.localStorage.getItem(KEY);
        if (raw) {
          state.song = normalize(JSON.parse(raw));
          state.rev++;
          return true;
        }
      } catch (e) { /* ignore */ }
      return false;
    },
    toJSON() { return JSON.stringify(state.song, null, 2); },
    // tiện ích
    lyricOf(bar) { return state.song.lyrics[bar] || ''; },
    notesInBar(bar) {
      const a = bar * 16, b = a + 16;
      return state.song.notes.filter((n) => n.start >= a && n.start < b);
    },
    chordAt(step) {
      return state.song.chords.find((c) => step >= c.start && step < c.start + c.dur) || null;
    },
    sectionAt(bar) {
      return state.song.sections.find((s) => s.bar === bar) || null;
    },
    totalSteps() { return state.song.bars * 16; },
    lastNoteEnd() {
      let m = 0;
      state.song.notes.forEach((n) => { m = Math.max(m, n.start + n.dur); });
      return m;
    },
  };

  MS.Store = Store;
})();
