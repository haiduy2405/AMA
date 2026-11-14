/* Assistant Music AI — theory.js : âm giai, hợp âm, nhận diện hợp âm, âm tiết tiếng Việt (thuần logic, không DOM) */
(function () {
  'use strict';
  const G = globalThis;
  const MS = (G.MS = G.MS || {});

  const NAMES_S = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const NAMES_F = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
  const mod = (n, m) => ((n % m) + m) % m;

  // quality -> khoảng cách (semitone) + nhãn hiển thị
  const Q = {
    '': { iv: [0, 4, 7], label: 'trưởng' },
    m: { iv: [0, 3, 7], label: 'thứ' },
    '7': { iv: [0, 4, 7, 10], label: '7' },
    maj7: { iv: [0, 4, 7, 11], label: 'maj7' },
    m7: { iv: [0, 3, 7, 10], label: 'm7' },
    sus2: { iv: [0, 2, 7], label: 'sus2' },
    sus4: { iv: [0, 5, 7], label: 'sus4' },
    dim: { iv: [0, 3, 6], label: 'dim' },
    aug: { iv: [0, 4, 8], label: 'aug' },
    '6': { iv: [0, 4, 7, 9], label: '6' },
    m6: { iv: [0, 3, 7, 9], label: 'm6' },
    add9: { iv: [0, 2, 4, 7], label: 'add9' },
    m7b5: { iv: [0, 3, 6, 10], label: 'm7♭5' },
    dim7: { iv: [0, 3, 6, 9], label: 'dim7' },
    '5': { iv: [0, 7], label: '5' },
  };
  const DETECT_ORDER = ['', 'm', '7', 'maj7', 'm7', 'sus4', 'sus2', 'dim', 'aug', '6', 'm6', 'add9', 'm7b5', 'dim7', '5'];

  const FLAT_MAJORS = [5, 10, 3, 8, 1, 6];
  function useFlats(key, mode) {
    const relMajor = mode === 'minor' ? (key + 3) % 12 : key;
    return FLAT_MAJORS.includes(relMajor);
  }
  function pcName(pc, flats) {
    return (flats ? NAMES_F : NAMES_S)[mod(pc, 12)];
  }
  function noteName(midi, flats) {
    return pcName(midi, flats) + (Math.floor(midi / 12) - 1);
  }

  function scaleOf(mode) {
    return SCALES[mode] || SCALES.major;
  }
  function tonicBase(key) {
    let b = 60 + key;
    if (b > 66) b -= 12;
    return b;
  }
  function degToPitch(deg, key, mode) {
    const sc = scaleOf(mode);
    return tonicBase(key) + Math.floor(deg / 7) * 12 + sc[mod(deg, 7)];
  }
  function pitchToDeg(p, key, mode) {
    const sc = scaleOf(mode);
    const rel = p - tonicBase(key);
    const oct = Math.floor(rel / 12);
    const r = rel - oct * 12;
    let best = 0;
    let bd = 99;
    for (let i = 0; i < 7; i++) {
      const d = Math.abs(sc[i] - r);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (Math.abs(12 - r) < bd) best = 7;
    return oct * 7 + best;
  }
  function inScale(p, key, mode) {
    return scaleOf(mode).includes(mod(p - key, 12));
  }

  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  function diatonicChords(key, mode, seventh) {
    const sc = scaleOf(mode);
    const out = [];
    for (let i = 0; i < 7; i++) {
      const root = mod(key + sc[i], 12);
      const i3 = mod(sc[(i + 2) % 7] - sc[i], 12);
      const i5 = mod(sc[(i + 4) % 7] - sc[i], 12);
      const i7 = mod(sc[(i + 6) % 7] - sc[i], 12);
      let q = '';
      if (i3 === 3 && i5 === 7) q = 'm';
      else if (i3 === 3 && i5 === 6) q = 'dim';
      else if (i3 === 4 && i5 === 8) q = 'aug';
      let roman = ROMAN[i];
      if (q === 'm' || q === 'dim') roman = roman.toLowerCase();
      if (q === 'dim') roman += '°';
      if (seventh) {
        if (q === '' && i7 === 11) q = 'maj7';
        else if (q === '' && i7 === 10) q = '7';
        else if (q === 'm' && i7 === 10) q = 'm7';
        else if (q === 'dim' && i7 === 10) q = 'm7b5';
        else if (q === 'dim' && i7 === 9) q = 'dim7';
      }
      out.push({ deg: i, root, quality: q, roman });
    }
    return out;
  }

  function chordPcs(c) {
    const q = Q[c.quality] || Q[''];
    return [...new Set(q.iv.map((i) => mod(c.root + i, 12)))];
  }
  function chordName(c, flats) {
    const f = flats === undefined ? false : flats;
    let n = pcName(c.root, f) + (c.quality === '' ? '' : c.quality === 'm7b5' ? 'm7♭5' : c.quality);
    if (c.bass !== undefined && c.bass !== null && c.bass !== c.root) n += '/' + pcName(c.bass, f);
    return n;
  }
  // voicing: bass trầm + các âm trên trong khoảng [52, 64)
  function voicing(c) {
    const pcs = chordPcs(c);
    const bass = 36 + mod(c.root, 12);
    const upper = pcs.map((pc) => {
      let p = 48 + mod(pc - 48, 12);
      if (p < 52) p += 12;
      return p;
    });
    upper.sort((a, b) => a - b);
    return { bass, upper };
  }

  function detectChord(pitches) {
    if (!pitches || pitches.length < 2) return null;
    const sorted = [...pitches].sort((a, b) => a - b);
    const bass = mod(sorted[0], 12);
    const pcs = [...new Set(sorted.map((p) => mod(p, 12)))];
    if (pcs.length < 2) return null;
    let best = null;
    for (const root of pcs) {
      for (let qi = 0; qi < DETECT_ORDER.length; qi++) {
        const q = DETECT_ORDER[qi];
        const tpl = [...new Set(Q[q].iv.map((i) => mod(root + i, 12)))];
        const tset = new Set(tpl);
        const exact = tset.size === pcs.length && pcs.every((pc) => tset.has(pc));
        const subset = !exact && tpl.length >= 3 && pcs.length - tpl.length === 1 && tpl.every((pc) => pcs.includes(pc));
        if (!exact && !subset) continue;
        let score = (exact ? 100 : 60) + (root === bass ? 20 : 0) - qi * 0.5;
        if (q === '5' && pcs.length > 2) continue;
        if (!best || score > best.score) best = { score, root, quality: q };
      }
    }
    if (!best) return null;
    const res = { root: best.root, quality: best.quality, bass: bass };
    res.name = chordName(res, false);
    return res;
  }

  // đếm âm tiết tiếng Việt: mỗi tiếng (tách bằng khoảng trắng / dấu câu) = 1 âm tiết
  function vnSyllables(text) {
    if (!text) return 0;
    return text
      .split(/[\s,.;:!?…"“”()\-–—/]+/)
      .filter((t) => /\p{L}/u.test(t)).length;
  }

  // đoán giọng từ danh sách nốt
  function guessKey(notes) {
    if (!notes || !notes.length) return null;
    const hist = new Array(12).fill(0);
    let total = 0;
    notes.forEach((n) => {
      hist[mod(n.pitch, 12)] += n.dur;
      total += n.dur;
    });
    const sorted = [...notes].sort((a, b) => a.start - b.start);
    const first = mod(sorted[0].pitch, 12);
    const last = mod(sorted[sorted.length - 1].pitch, 12);
    let best = null;
    for (let key = 0; key < 12; key++) {
      for (const mode of ['major', 'minor']) {
        const set = new Set(scaleOf(mode).map((s) => mod(key + s, 12)));
        let inn = 0;
        for (let pc = 0; pc < 12; pc++) if (set.has(pc)) inn += hist[pc];
        const out = total - inn;
        const score = inn - out * 1.5 + hist[key] * 0.6 + (last === key ? total * 0.2 : 0) + (first === key ? total * 0.06 : 0) + hist[mod(key + 7, 12)] * 0.2;
        if (!best || score > best.score) best = { key, mode, score };
      }
    }
    return best;
  }

  // Thư viện tiến trình hợp âm (bậc 0-6)
  const PROGRESSIONS = [
    { id: 'pop', name: 'I – V – vi – IV (Pop)', mode: 'major', degs: [0, 4, 5, 3] },
    { id: 'ballad', name: 'vi – IV – I – V (Ballad)', mode: 'major', degs: [5, 3, 0, 4] },
    { id: '50s', name: 'I – vi – IV – V (Cổ điển)', mode: 'major', degs: [0, 5, 3, 4] },
    { id: 'canon', name: 'I – V – vi – iii – IV – I – IV – V (Canon)', mode: 'major', degs: [0, 4, 5, 2, 3, 0, 3, 4] },
    { id: 'jazz', name: 'ii – V – I – I (Jazz)', mode: 'major', degs: [1, 4, 0, 0], seventh: true },
    { id: 'plagal', name: 'I – IV – V – IV', mode: 'major', degs: [0, 3, 4, 3] },
    { id: 'minor1', name: 'i – VI – III – VII', mode: 'minor', degs: [0, 5, 2, 6] },
    { id: 'minor2', name: 'i – iv – VII – III', mode: 'minor', degs: [0, 3, 6, 2] },
    { id: 'minor3', name: 'i – VII – VI – VII', mode: 'minor', degs: [0, 6, 5, 6] },
    { id: 'minor4', name: 'i – iv – v – i', mode: 'minor', degs: [0, 3, 4, 0] },
  ];

  MS.Theory = {
    NAMES_S, NAMES_F, SCALES, Q, DETECT_ORDER, PROGRESSIONS,
    mod, useFlats, pcName, noteName, scaleOf, tonicBase, degToPitch, pitchToDeg, inScale,
    diatonicChords, chordPcs, chordName, voicing, detectChord, vnSyllables, guessKey,
  };
})();
