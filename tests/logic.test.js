/* Chạy: node tests/logic.test.js */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const ctx = vm.createContext({ console, TextEncoder, setTimeout, clearTimeout, Math, JSON });
ctx.globalThis = ctx;
for (const f of ['theory', 'store', 'generator', 'midifile'])
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
const MS = ctx.MS, T = MS.Theory, G = MS.Generator;
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };

// --- theory ---
ok(T.degToPitch(0, 0, 'major') === 60, 'C tonic = 60');
ok(T.degToPitch(2, 0, 'major') === 64 && T.degToPitch(7, 0, 'major') === 72 && T.degToPitch(-1, 0, 'major') === 59, 'degToPitch');
for (let key = 0; key < 12; key++) for (const mode of ['major', 'minor'])
  for (let d = -7; d <= 14; d++) { const p = T.degToPitch(d, key, mode); ok(T.pitchToDeg(p, key, mode) === d, `roundtrip ${key}${mode}${d}`); ok(T.inScale(p, key, mode), 'in scale'); }
const dia = T.diatonicChords(0, 'major');
ok(['', 'm', 'm', '', '', 'm', 'dim'].every((q, i) => dia[i].quality === q), 'C major triads');
ok(T.diatonicChords(9, 'minor')[0].quality === 'm', 'Am');
const det = (a) => (T.detectChord(a) || {}).name;
ok(det([60, 64, 67]) === 'C', 'C'); ok(det([57, 60, 64]) === 'Am', 'Am'); ok(det([55, 59, 62, 65]) === 'G7', 'G7');
ok(det([60, 64, 67, 71]) === 'Cmaj7', 'Cmaj7'); ok(det([62, 67, 69]) === 'Dsus4', 'Dsus4'); ok(det([64, 67, 72]) === 'C/E', 'C/E inversion');
ok(det([60, 67]) === 'C5', 'power'); ok(det([60]) === undefined, 'single');
ok(T.vnSyllables('Chiều rơi trên phố nhỏ') === 5 && T.vnSyllables('  ') === 0 && T.vnSyllables('mình, em - đi!') === 3, 'syllables');
const gk = T.guessKey([60, 62, 64, 65, 67, 69, 71, 72, 64, 60].map((p, i) => ({ pitch: p, start: i * 4, dur: 4 })));
ok(gk.key === 0 && gk.mode === 'major', 'guessKey C');

// --- chấm điểm motif ---
const mk = (arr) => arr.map(([t, d, p], i) => ({ id: 'e' + i, start: t, dur: d, pitch: p, vel: 90 }));
const good = G.evaluateMotif(mk([[0, 4, 64], [4, 2, 67], [6, 2, 69], [8, 4, 67], [12, 4, 64]]), 0, 'major');
const bad = G.evaluateMotif(mk([[0, 2, 60], [2, 2, 60], [4, 2, 60], [6, 2, 90], [8, 2, 61]]), 0, 'major');
ok(good.score >= 80 && good.items.length === 7, 'motif tốt điểm cao: ' + good.score);
ok(bad.score < 55 && bad.score < good.score, 'motif xấu điểm thấp: ' + bad.score);
ok(G.evaluateMotif([], 0, 'major') === null, 'rỗng');
ok(G.evaluateMotif(mk([[0, 4, 60]]), 0, 'major').items[0].ok === false, 'quá ít nốt bị nhắc');
ok(G.evaluateMotif(mk([[0, 4, 64], [4, 4, 67], [8, 8, 72]]), 0, 'major', { phrase: true }).items[0].ok, 'phrase bỏ tiêu chí dài');

// --- generator ---
function song(key, mode, bars, motif) {
  const s = MS.Store.normalize({ key, mode, bars, notes: motif || [] });
  return s;
}
const motif = (key, mode) => [[0, 4, 2], [4, 2, 4], [6, 2, 5], [8, 4, 4], [12, 4, 2]].map(([t, d, deg], i) => ({ id: 'm' + i, start: t, dur: d, pitch: T.degToPitch(deg, key, mode), vel: 90 }));
function check(s, res, label) {
  const bars = s.bars * 16;
  const all = s.notes.concat(res.notes).sort((a, b) => a.start - b.start);
  res.notes.forEach((n) => {
    ok(T.inScale(n.pitch, s.key, s.mode), `${label}: pitch in scale ${n.pitch}`);
    ok(n.start >= 0 && n.start + n.dur <= bars, `${label}: within song (${n.start}+${n.dur})`);
    ok(n.dur >= 1 && n.pitch >= 36 && n.pitch <= 96, `${label}: dur/pitch range`);
  });
  for (let i = 1; i < all.length; i++) {
    ok(Math.abs(all[i].pitch - all[i - 1].pitch) <= 12, `${label}: leap<=octave (${all[i - 1].pitch}->${all[i].pitch})`);
    ok(all[i].start >= all[i - 1].start + all[i - 1].dur, `${label}: mono no overlap at ${all[i].start}`);
  }
}
let trials = 0;
for (let key = 0; key < 12; key++) for (const mode of ['major', 'minor']) for (const P of [2, 4]) for (let seed = 1; seed <= 3; seed++) {
  const s = song(key, mode, 8, motif(key, mode));
  const g = G.generate(s, { phraseBars: P, seed: seed * 997 });
  ok(g.candidates.length === 3, 'three candidates');
  g.candidates.forEach((c, i) => { check(s, c, `k${key}${mode} P${P} s${seed} c${i}`); trials++; });
  // các phương án khác nhau
  const sig = g.candidates.map((c) => c.notes.map((n) => n.pitch + ':' + n.start).join());
  ok(new Set(sig).size >= 2, 'candidates differ');
  // câu cuối bài kết ở chủ âm
  const full = song(key, mode, 4, motif(key, mode));
  const g2 = G.generate(full, { phraseBars: 4, seed });
  const last = g2.candidates[1].notes[g2.candidates[1].notes.length - 1];
  ok(g2.end === 64 && T.mod(last.pitch - key, 12) === 0, `final cadence on tonic k${key}${mode} (got ${last.pitch})`);
  ok(last.start + last.dur === 64, 'final note ends at song end');
}
// tự hoàn thiện cả bài từ motif
for (const mode of ['major', 'minor']) {
  const s = song(2, mode, 16, motif(2, mode));
  const r = G.autoComplete(s, { seed: 5 });
  check(s, r, 'auto ' + mode);
  const covered = new Set(); r.notes.concat(s.notes).forEach((n) => covered.add(Math.floor(n.start / 16)));
  ok(covered.size === 16, 'auto-complete fills every bar: ' + covered.size);
  ok(r.chords.length >= 12, 'auto chords created');
  const lastN = r.notes[r.notes.length - 1];
  ok(T.mod(lastN.pitch - 2, 12) === 0 && lastN.start + lastN.dur === 256, 'auto ends on tonic at end');
}
// từ trống (không motif)
{ const s = song(0, 'major', 8, []); const r = G.autoComplete(s, { seed: 11 }); check(s, r, 'scratch'); ok(r.notes.length > 20, 'scratch notes'); }
// tôn trọng hợp âm có sẵn: không sinh hợp âm mới ở ô đã có
{ const s = song(0, 'major', 8, motif(0, 'major')); s.chords = [{ id: 'x', start: 0, dur: 64, root: 0, quality: '' }];
  const g = G.generate(s, { phraseBars: 4 }); ok(g.candidates[0].chords.length === 0, 'respect existing chords'); }
// gợi ý hợp âm
{ const s = song(0, 'major', 4, []); const mel = [[0, 0], [4, 4], [8, 7]].concat([[16, 5], [20, 0], [24, 9]], [[32, 3], [36, 5], [40, 9]], [[48, 2], [52, 7], [56, 11]]);
  s.notes = mel.map(([st, p], i) => ({ id: 'n' + i, start: st, dur: 4, pitch: 60 + p, vel: 90 }));
  const ch = G.suggestChords(s); const names = ch.map((c) => T.chordName(c));
  ok(names[0] === 'C' && names[names.length - 1] === 'C' || names[names.length - 1] === 'G', 'harmonize sane: ' + names.join(',')); ok(ch.reduce((a, c) => a + c.dur, 0) === 64, 'harmonize covers all'); }
// tiến trình
{ const s = song(0, 'major', 8, []); const pr = G.applyProgression(s, [5, 3, 0, 4], 0, true); ok(pr.length === 8 && T.chordName(pr[0]) === 'Am' && T.chordName(pr[3]) === 'G', 'progression'); }
// phân tích motif
{ const a = G.analyzeMotif(motif(0, 'major'), 0, 'major'); ok(a.count === 5 && a.bars === 1 && a.contour, 'motif analysis'); }

// --- MIDI file ---
{ const s = song(0, 'major', 2, motif(0, 'major')); s.chords = [{ id: 'c', start: 0, dur: 16, root: 0, quality: '' }]; s.lyrics = { 0: 'Chiều rơi' };
  const bin = MS.MidiFile.build(s);
  ok(String.fromCharCode(...bin.slice(0, 4)) === 'MThd' && bin[9] === 1 && bin[11] === 3, 'SMF header (type1, 3 tracks)');
  let pos = 14, tracks = 0, noteOns = 0;
  while (pos < bin.length) { ok(String.fromCharCode(...bin.slice(pos, pos + 4)) === 'MTrk', 'track chunk'); const len = (bin[pos + 4] << 24) | (bin[pos + 5] << 16) | (bin[pos + 6] << 8) | bin[pos + 7]; const body = bin.slice(pos + 8, pos + 8 + len); ok(body[len - 3] === 0xff && body[len - 2] === 0x2f, 'end of track'); for (let i = 0; i < len - 2; i++) if (body[i] === 0x90 && body[i + 2] > 0 && i > 0) noteOns++; pos += 8 + len; tracks++; }
  ok(tracks === 3 && pos === bin.length, 'chunks consistent'); ok(noteOns >= 5, 'notes written ' + noteOns);
  ok(MS.Export.toChart(s).includes('Chiều rơi'), 'chart contains lyrics'); }
// --- store ---
{ const S = MS.Store; S.replace({ bars: 4 }); S.commit((x) => x.notes.push({ id: 'a', start: 0, dur: 4, pitch: 60, vel: 90 })); ok(S.song.notes.length === 1, 'commit');
  S.undo(); ok(S.song.notes.length === 0, 'undo'); S.redo(); ok(S.song.notes.length === 1, 'redo'); }
console.log(`OK — ${pass} assertions, ${trials} candidate phrases checked`);
