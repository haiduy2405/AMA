/* Assistant Music AI — midifile.js : xuất .mid (SMF type 1) và bản chép hợp âm + lời (thuần logic) */
(function () {
  'use strict';
  const G = globalThis;
  const MS = (G.MS = G.MS || {});
  const T = MS.Theory;

  const PPQ = 480;
  const STEP = PPQ / 4;

  function vlq(n) {
    let buf = n & 0x7f;
    const out = [];
    while ((n >>= 7)) {
      buf <<= 8;
      buf |= (n & 0x7f) | 0x80;
    }
    for (;;) {
      out.push(buf & 0xff);
      if (buf & 0x80) buf >>= 8;
      else break;
    }
    return out;
  }
  const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const u16 = (n) => [(n >>> 8) & 255, n & 255];
  const ascii = (s) => Array.from(s).map((c) => c.charCodeAt(0) & 0x7f);
  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(s));
    return ascii(s);
  }

  function track(events) {
    // events: {tick, order, bytes[]}
    events.sort((a, b) => a.tick - b.tick || a.order - b.order);
    const body = [];
    let last = 0;
    events.forEach((e) => {
      body.push(...vlq(e.tick - last), ...e.bytes);
      last = e.tick;
    });
    body.push(0, 0xff, 0x2f, 0);
    return [...ascii('MTrk'), ...u32(body.length), ...body];
  }
  const meta = (tick, type, data, order) => ({ tick, order: order === undefined ? 0 : order, bytes: [0xff, type, ...vlq(data.length), ...data] });

  const SHARPS_MAJOR = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];
  function keySig(key, mode) {
    if (mode === 'minor') return { sf: SHARPS_MAJOR[(key + 3) % 12], mi: 1 };
    return { sf: SHARPS_MAJOR[key], mi: 0 };
  }

  function build(song) {
    const tempo = Math.round(60000000 / song.bpm);
    const ks = keySig(song.key, song.mode);
    const t0 = [
      meta(0, 0x03, utf8(song.title || 'Assistant Music AI')),
      meta(0, 0x51, [(tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255]),
      meta(0, 0x58, [4, 2, 24, 8]),
      meta(0, 0x59, [ks.sf & 255, ks.mi]),
    ];
    Object.keys(song.lyrics || {}).forEach((b) => {
      const txt = (song.lyrics[b] || '').trim();
      if (txt) t0.push(meta(+b * 16 * STEP, 0x05, utf8(txt), 1));
    });
    (song.sections || []).forEach((s) => t0.push(meta(s.bar * 16 * STEP, 0x06, utf8(s.name), 1)));

    const t1 = [meta(0, 0x03, utf8('Melody')), { tick: 0, order: 0, bytes: [0xc0, 0] }];
    song.notes.forEach((n) => {
      const a = n.start * STEP, b = (n.start + n.dur) * STEP;
      t1.push({ tick: a, order: 2, bytes: [0x90, n.pitch & 127, n.vel & 127] });
      t1.push({ tick: b, order: 1, bytes: [0x80, n.pitch & 127, 0] });
    });

    const t2 = [meta(0, 0x03, utf8('Chords')), { tick: 0, order: 0, bytes: [0xc1, 4] }];
    song.chords.forEach((c) => {
      const v = T.voicing(c);
      const a = c.start * STEP, b = (c.start + c.dur) * STEP;
      [v.bass, ...v.upper].forEach((p, i) => {
        t2.push({ tick: a, order: 2, bytes: [0x91, p & 127, i === 0 ? 80 : 64] });
        t2.push({ tick: b, order: 1, bytes: [0x81, p & 127, 0] });
      });
    });

    const tracks = [track(t0), track(t1), track(t2)];
    const head = [...ascii('MThd'), ...u32(6), ...u16(1), ...u16(tracks.length), ...u16(PPQ)];
    return Uint8Array.from([...head, ...tracks.flat()]);
  }

  // Bản chép: hợp âm + lời theo ô nhịp, 4 ô / dòng
  function toChart(song) {
    const flats = T.useFlats(song.key, song.mode);
    const lines = [];
    lines.push(`${song.title || 'Bài hát'}`);
    lines.push(`Giọng: ${T.pcName(song.key, flats)}${song.mode === 'minor' ? 'm' : ''}   Tempo: ${song.bpm} BPM   ${song.bars} ô nhịp`);
    lines.push('');
    const secAt = {};
    (song.sections || []).forEach((s) => (secAt[s.bar] = s.name));
    for (let b = 0; b < song.bars; b += 4) {
      if (secAt[b]) lines.push(`[${secAt[b]}]`);
      const cs = [], ls = [];
      for (let i = b; i < Math.min(b + 4, song.bars); i++) {
        const inBar = song.chords.filter((c) => c.start >= i * 16 && c.start < i * 16 + 16).sort((x, y) => x.start - y.start);
        cs.push(inBar.length ? inBar.map((c) => T.chordName(c, flats)).join(' ') : '–');
        ls.push((song.lyrics[i] || '').trim());
      }
      const w = Math.max(14, ...cs.map((x) => x.length + 2), ...ls.map((x) => x.length + 2));
      const pad = (s) => s + ' '.repeat(Math.max(0, w - s.length));
      lines.push('| ' + cs.map(pad).join('| ') + '|');
      lines.push('  ' + ls.map(pad).join('  '));
      lines.push('');
    }
    return lines.join('\n');
  }

  MS.MidiFile = { build, PPQ, STEP, keySig };
  MS.Export = { toChart };
})();
