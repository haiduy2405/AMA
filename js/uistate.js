/* Assistant Music AI — uistate.js : trạng thái giao diện dùng chung (không vào undo/redo) */
(function () {
  'use strict';
  const G = globalThis;
  const MS = (G.MS = G.MS || {});
  MS.S = {
    tool: 'draw', // draw | select | hand | erase
    snap: 1, // bước (1 = 1/16)
    noteLen: 2, // độ dài nốt mới
    cursor: 0, // vị trí con trỏ / điểm bắt đầu phát (bước)
    selection: new Set(), // id nốt đang chọn
    selChord: null, // id hợp âm đang chọn
    armed: null, // {root, quality} hợp âm đang "cầm" để đặt vào làn
    chordMod: '', // '' | 'seventh' | 'sus4' | 'sus2' | 'add9' | '6'
    candidates: [], // phương án melody do trợ lý sinh
    activeCand: -1,
    candInfo: null,
    activePitches: new Map(), // pitch -> 'live' | 'play'
    loop: { on: false, start: 0, end: 0 },
    follow: true,
    velLane: false,
    scaleLock: false,
    stepInput: false,
    stepLen: 2,
    quant: 1, // lưới quantize khi thu
    countIn: true,
    kbPiano: true,
    octave: 0,
    held: [],
    detected: null,
    autoSuggest: false,
    playStep: null,
    clip: [],
    midiStatus: 'idle',
  };
  MS.invalidate = function () {};
})();
