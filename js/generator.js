/* Assistant Music AI — generator.js : phân tích motif, sinh melody đồng sáng tác, gợi ý hợp âm (thuần logic) */
(function () {
  'use strict';
  const G = globalThis;
  const MS = (G.MS = G.MS || {});
  const T = MS.Theory;
  const { mod } = T;

  // ---------- tiện ích ngẫu nhiên có seed ----------
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const chance = (r, p) => r() < p;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function weighted(r, items) {
    let sum = 0;
    items.forEach((i) => (sum += i[1]));
    let x = r() * sum;
    for (const i of items) {
      x -= i[1];
      if (x <= 0) return i[0];
    }
    return items[items.length - 1][0];
  }

  // ---------- nhịp điệu mẫu cho 1 ô nhịp 16 bước: [bắt đầu, độ dài] ----------
  const RHYTHMS = [
    [[0, 4], [4, 4], [8, 4], [12, 4]],
    [[0, 6], [6, 2], [8, 4], [12, 4]],
    [[0, 4], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]],
    [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4]],
    [[0, 3], [3, 1], [4, 4], [8, 4], [12, 4]],
    [[0, 2], [2, 2], [4, 2], [6, 2], [8, 8]],
    [[0, 8], [8, 4], [12, 4]],
    [[2, 2], [4, 4], [8, 2], [10, 2], [12, 4]],
    [[0, 4], [4, 4], [8, 2], [10, 2], [12, 2], [14, 2]],
    [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 4]],
    [[0, 6], [6, 2], [8, 6], [14, 2]],
    [[0, 4], [4, 4], [8, 4], [12, 2], [14, 2]],
    [[0, 4], [4, 6], [10, 2], [12, 4]],
    [[0, 3], [3, 3], [6, 2], [8, 4], [12, 4]],
  ];
  const rhythmSig = (ev) => ev.map((e) => e.t + ':' + e.d).join(',');

  function pickRhythm(r, eff, avoidSig, longEnd) {
    let pool = RHYTHMS;
    if (longEnd) pool = RHYTHMS.filter((p) => p[p.length - 1][1] >= 4);
    const scored = pool.map((p) => {
      const n = p.length;
      let w = 1;
      // độ phiêu cao -> ưa nhịp dày; thấp -> nhịp thoáng
      w *= n >= 6 ? 0.4 + eff * 1.6 : n <= 4 ? 1.6 - eff * 0.9 : 1;
      if (avoidSig && rhythmSig(p.map((x) => ({ t: x[0], d: x[1] }))) === avoidSig) w *= 0.15;
      return [p, Math.max(0.05, w)];
    });
    return weighted(r, scored).map((x) => ({ t: x[0], d: x[1] }));
  }

  // ---------- chuyển đổi nốt <-> ô nhịp (theo bậc âm) ----------
  function notesToBar(notes, barIdx, key, mode) {
    const a = barIdx * 16, b = a + 16;
    const inBar = notes.filter((n) => n.start >= a && n.start < b).sort((x, y) => x.start - y.start || y.pitch - x.pitch);
    const ev = [];
    let lastT = -1;
    inBar.forEach((n) => {
      const t = n.start - a;
      if (t === lastT) return; // lấy nốt cao nhất khi đánh hợp âm
      lastT = t;
      ev.push({ t, d: Math.max(1, Math.min(n.dur, 16 - t)), deg: T.pitchToDeg(n.pitch, key, mode), v: n.vel });
    });
    return { ev };
  }
  const cloneBar = (bar) => ({ ev: bar.ev.map((e) => Object.assign({}, e)) });

  function analyzeMotif(notes, key, mode) {
    if (!notes || !notes.length) return null;
    const s = [...notes].sort((a, b) => a.start - b.start);
    const pitches = s.map((n) => n.pitch);
    const lo = Math.min(...pitches), hi = Math.max(...pitches);
    const first = pitches[0], last = pitches[pitches.length - 1];
    const maxP = pitches.indexOf(hi);
    let contour = 'đi ngang';
    const pos = maxP / Math.max(1, pitches.length - 1);
    if (hi - lo <= 2) contour = 'đi ngang';
    else if (pos > 0.25 && pos < 0.75 && hi - first >= 2 && hi - last >= 2) contour = 'hình vòm';
    else if (last - first >= 2) contour = 'đi lên';
    else if (first - last >= 2) contour = 'đi xuống';
    else contour = 'lượn sóng';
    const bars = Math.max(1, Math.ceil((s[s.length - 1].start + s[s.length - 1].dur) / 16));
    const density = s.length / bars;
    const rhythm = density <= 3.5 ? 'thoáng' : density <= 6 ? 'vừa' : 'dày';
    const span = hi - lo;
    return { count: s.length, bars, range: span, contour, rhythm, spanLabel: span <= 5 ? 'quãng hẹp' : span <= 9 ? 'quãng vừa' : 'quãng rộng' };
  }


  // ---------- chấm điểm motif / câu nhạc ----------
  // opts.phrase = true: chấm một câu đã sinh (bỏ tiêu chí độ dài motif)
  function evaluateMotif(notes, key, mode, opts) {
    if (!notes || !notes.length) return null;
    const phrase = !!(opts && opts.phrase);
    const s = [...notes].sort((a, b) => a.start - b.start || a.pitch - b.pitch);
    const n = s.length, ps = s.map((x) => x.pitch);
    const lo = Math.min(...ps), hi = Math.max(...ps), range = hi - lo;
    const first = Math.floor(s[0].start / 16) * 16;
    const end = Math.max(...s.map((x) => x.start + x.dur));
    const bars = Math.max(1, Math.ceil((end - first) / 16));
    const items = [];
    let score = 0;
    const add = (pts, max, good, text) => { score += pts; items.push({ ok: good, text, pts, max }); };

    if (phrase) add(25, 25, true, 'Độ dài câu phù hợp.');
    else if (n >= 4 && n <= 16 && bars <= 2) add(25, 25, true, 'Độ dài tốt (' + n + ' nốt, ' + bars + ' ô) — đủ ngắn để phát triển.');
    else if (n < 4) add(6, 25, false, 'Hơi ít nốt (' + n + ') — thêm vài nốt để giai điệu rõ hơn.');
    else if (bars > 2) add(n <= 24 ? 15 : 8, 25, false, 'Motif dài ' + bars + ' ô — 1–2 ô thường dễ phát triển nhất.');
    else add(15, 25, false, 'Khá dày nốt (' + n + ') — bớt bớt cho dễ nhớ.');

    const durs = new Set(s.map((x) => x.dur));
    if (durs.size >= 2) add(15, 15, true, 'Nhịp có đổi độ dài nốt — tạo được điểm nhấn.');
    else add(5, 15, false, 'Mọi nốt dài bằng nhau — thử xen một nốt dài hoặc ngắn để có điểm nhấn.');

    let rep = 0, maxLeap = 0, big = 0;
    for (let i = 1; i < n; i++) {
      const d = Math.abs(ps[i] - ps[i - 1]);
      if (d === 0) rep++;
      if (d > maxLeap) maxLeap = d;
      if (d > 7) big++;
    }
    const repR = n > 1 ? rep / (n - 1) : 0;
    if (repR <= 0.4) add(10, 10, true, 'Nốt thay đổi đều, không bị lặp một cao độ.');
    else add(3, 10, false, 'Lặp một cao độ khá nhiều (' + Math.round(repR * 100) + '%) — thêm nốt cao/thấp hơn.');

    if (maxLeap <= 9 && big <= Math.max(1, Math.floor(n * 0.2))) add(15, 15, true, 'Bước nhảy vừa tầm giọng hát.');
    else add(5, 15, false, 'Có bước nhảy lớn (' + maxLeap + ' bán cung) — khó hát; thử nối bằng nốt trung gian.');

    if (range <= 12) add(15, 15, true, 'Quãng ' + range + ' bán cung — nằm gọn trong một quãng tám.');
    else if (range <= 16) add(8, 15, false, 'Quãng khá rộng (' + range + ' bán cung) — người hát thường chỉ thoải mái trong 1 quãng tám.');
    else add(3, 15, false, 'Quãng rất rộng (' + range + ' bán cung) — nên thu hẹp.');

    const inK = ps.filter((p) => T.inScale(p, key, mode)).length / n;
    if (inK >= 0.9) add(10, 10, true, 'Các nốt khớp giọng hiện tại.');
    else add(Math.round(10 * Math.max(0, (inK - 0.5) * 2)), 10, false, 'Có nốt ngoài giọng (' + Math.round((1 - inK) * 100) + '%) — thử “Đoán giọng” hoặc sửa nốt lạc.');

    const dg = T.pitchToDeg(s[n - 1].pitch, key, mode);
    const stable = dg != null && [0, 2, 4].includes(((dg % 7) + 7) % 7);
    if (stable) add(10, 10, true, 'Kết ở nốt vững — câu nghe khép lại, hợp làm câu đóng.');
    else add(7, 10, true, 'Kết ở nốt chưa vững — hợp làm câu mở, tạo cảm giác chờ nối tiếp.');

    score = Math.max(0, Math.min(100, Math.round(score)));
    const grade = score >= 80 ? 'Rất tốt' : score >= 60 ? 'Tốt' : score >= 40 ? 'Tạm ổn' : 'Cần chỉnh';
    const level = score >= 80 ? 'great' : score >= 60 ? 'good' : score >= 40 ? 'ok' : 'low';
    return { score, grade, level, items, bars, count: n, range, maxLeap, closed: stable };
  }


  // ---------- lời → nốt (tiếng Việt, có dấu thanh) ----------
  // Chia 16 bước của một ô cho n chữ: chữ cuối kéo dài hơn, chữ đầu hơi nhấn.
  function lineRhythm(n, total) {
    total = total || 16;
    if (n <= 0) return [];
    const unit = total % 2 === 0 && n <= total / 2 ? 2 : 1, slots = total / unit;
    const m = Math.min(n, slots);
    const w = [];
    for (let i = 0; i < m; i++) w.push(1 + (i === m - 1 ? 0.9 : 0) + (i === 0 ? 0.25 : 0) + (i % 2 === 0 ? 0.12 : 0));
    const sum = w.reduce((a, b) => a + b, 0);
    const a = w.map((x) => Math.max(1, Math.floor((x / sum) * slots)));
    let left = slots - a.reduce((x, y) => x + y, 0);
    const order = w.map((x, i) => [x / sum * slots - Math.floor(x / sum * slots), i]).sort((p, q) => q[0] - p[0]);
    for (let k = 0; left > 0; k++, left--) a[order[k % m][1]]++;
    for (let k = m - 1; left < 0 && k >= 0; k--) while (a[k] > 1 && left < 0) { a[k]--; left++; }
    const out = [];
    let t = 0;
    for (let i = 0; i < n; i++) {
      if (i < m) { out.push({ start: t, dur: a[i] * unit }); t += a[i] * unit; } else out.push({ start: total, dur: 1 });
    }
    return out;
  }

  const TONE_UP = { sắc: 1, ngã: 1 }, TONE_DOWN = { huyền: 1, nặng: 1 };
  // Chọn bậc âm cho từng chữ. opts: tones[], chords[] (hợp âm tại từng chữ hoặc null), fixed[] (bậc đã có hoặc null),
  // prevDeg, key, mode, cadence 'closed'|'open'|'mid', seed
  function melodyForLine(o) {
    const n = o.tones.length, r = rng(o.seed || 1);
    const LO_D = -2, HI_D = 9;
    const out = [];
    let cur = o.prevDeg == null ? 2 : o.prevDeg;
    const stableSet = o.cadence === 'closed' ? [0] : o.cadence === 'open' ? [4, 1] : [2, 4, 0];
    for (let i = 0; i < n; i++) {
      const fx = o.fixed && o.fixed[i];
      if (fx != null) { out.push(fx); cur = fx; continue; }
      const tone = o.tones[i], ch = o.chords && o.chords[i];
      const pcs = ch ? T.chordPcs(ch) : null;
      const strong = i === 0 || i === n - 1 || i % 2 === 0;
      let best = null, bs = -1e9;
      for (let d = Math.max(LO_D, cur - 3); d <= Math.min(HI_D, cur + 3); d++) {
        const dl = d - cur, ad = Math.abs(dl);
        let sc = -0.55 * Math.pow(Math.max(0, ad - 1), 1.35) - 0.12 * ad;
        if (TONE_UP[tone]) sc += dl > 0 ? 3 : dl === 0 ? 0 : -3.2;
        else if (TONE_DOWN[tone]) sc += dl < 0 ? 3 : dl === 0 ? 0.4 : -3.2;
        else if (tone === 'hỏi') sc += dl < 0 ? 2 : dl === 0 ? 0.8 : -2;
        else sc += dl === 0 ? 1.2 : ad === 1 ? 0.5 : -0.4;
        const inChord = pcs && pcs.includes(T.mod(T.degToPitch(d, o.key, o.mode), 12));
        if (inChord) sc += strong ? 1.6 : 0.5;
        if (i === n - 1) sc += stableSet.includes(T.mod(d, 7)) ? 4 + (T.mod(d, 7) === stableSet[0] ? 1 : 0) : -3;
        sc += (r() - 0.5) * 0.7;
        if (d > 7 || d < -1) sc -= 0.8;
        if (sc > bs) { bs = sc; best = d; }
      }
      out.push(best); cur = best;
    }
    return out;
  }

  // ---------- biến đổi ô nhịp ----------
  function shiftBar(bar, k) {
    const b = cloneBar(bar);
    b.ev.forEach((e) => (e.deg += k));
    return b;
  }
  function invertBar(bar) {
    const b = cloneBar(bar);
    if (!b.ev.length) return b;
    const pv = b.ev[0].deg;
    b.ev.forEach((e) => (e.deg = pv - (e.deg - pv)));
    return b;
  }
  function rhythmVar(bar, r) {
    const b = cloneBar(bar);
    const ev = b.ev;
    if (ev.length < 2) return b;
    if (chance(r, 0.55)) {
      // tách một nốt dài thành 2 nốt (chấm dôi / nốt qua)
      const cand = ev.map((e, i) => [e, i]).filter((x) => x[0].d >= 4 && x[1] < ev.length - 1);
      if (cand.length && ev.length < 8) {
        const [e, i] = pick(r, cand);
        const d1 = e.d >= 6 ? e.d - 2 : e.d - 1 >= 3 ? 3 : e.d / 2;
        const d2 = e.d - d1;
        const dir = chance(r, 0.5) ? 1 : -1;
        const ne = { t: e.t + d1, d: d2, deg: e.deg + (chance(r, 0.5) ? dir : 0), v: e.v };
        e.d = d1;
        ev.splice(i + 1, 0, ne);
        return b;
      }
    }
    // gộp 2 nốt ngắn liền nhau
    for (let i = 0; i < ev.length - 1; i++) {
      if (ev[i].d <= 2 && ev[i + 1].d <= 2 && ev[i].t + ev[i].d === ev[i + 1].t && chance(r, 0.6)) {
        ev[i].d += ev[i + 1].d;
        ev.splice(i + 1, 1);
        break;
      }
    }
    return b;
  }
  // nối bước nhảy lớn bằng nốt lướt
  function fillLeaps(bar, r) {
    const b = cloneBar(bar);
    for (let i = 0; i < b.ev.length - 1; i++) {
      const a = b.ev[i], c = b.ev[i + 1];
      const diff = c.deg - a.deg;
      if (Math.abs(diff) >= 3 && a.d >= 4 && a.t + a.d === c.t && chance(r, 0.6)) {
        a.d -= 2;
        b.ev.splice(i + 1, 0, { t: a.t + a.d, d: 2, deg: a.deg + Math.sign(diff), v: a.v });
        i++;
      }
    }
    return b;
  }

  // ---------- ngữ cảnh sinh ----------
  function chordTonesDeg(deg, pcs, key, mode) {
    // tìm bậc gần deg nhất có âm thuộc hợp âm
    for (const off of [0, 1, -1, 2, -2, 3, -3]) {
      const d = deg + off;
      if (pcs.includes(mod(T.degToPitch(d, key, mode), 12))) return d;
    }
    return deg;
  }

  function makeCtx(song, o, chordsByBar, eff, center) {
    const { key, mode } = song;
    const base = T.tonicBase(key);
    const user = song.notes.map((n) => n.pitch);
    const lo = clamp(Math.min(base - 7, ...user), 40, 96);
    const hi = clamp(Math.max(base + 16, ...user), 40, 90);
    return {
      key, mode, eff, center,
      degMin: T.pitchToDeg(lo, key, mode),
      degMax: T.pitchToDeg(hi, key, mode),
      chordAt(step) {
        const c = chordsByBar[Math.floor(step / 16)];
        if (!c) return null;
        return c;
      },
    };
  }

  // đi bộ ngẫu nhiên quanh trung tâm; trả về ô nhịp mới
  function walkBar(r, ctx, rhythm, startDeg, targetDeg, barStartStep) {
    const ev = [];
    let deg = startDeg;
    let streak = 0, lastDir = 0;
    rhythm.forEach((rh, i) => {
      if (i > 0) {
        const dist = ctx.center - deg;
        const tdist = targetDeg != null && i >= rhythm.length - 2 ? targetDeg - deg : 0;
        const steps = [[-1, 34], [1, 34], [0, 8], [-2, 11], [2, 11], [-3, ctx.eff * 8], [3, ctx.eff * 8], [-4, ctx.eff * 4], [4, ctx.eff * 4]];
        const weighted2 = steps.map(([s, w]) => {
          let m = 1;
          if (dist !== 0 && Math.sign(s) === Math.sign(dist)) m *= 1 + Math.min(Math.abs(dist), 5) * 0.25;
          if (tdist !== 0 && Math.sign(s) === Math.sign(tdist)) m *= 1 + Math.min(Math.abs(tdist), 5) * 0.5;
          if (s !== 0 && Math.sign(s) === lastDir && streak >= 3) m *= 0.15; // tránh đi 1 chiều quá dài
          if (s === 0 && i > 1 && ev[i - 1].deg === ev[i - 2].deg) m = 0; // không lặp 3 nốt
          return [s, w * m];
        });
        const s = weighted(r, weighted2);
        if (s !== 0 && Math.sign(s) === lastDir) streak++;
        else streak = s === 0 ? 0 : 1;
        if (s !== 0) lastDir = Math.sign(s);
        deg += s;
      }
      deg = clamp(deg, ctx.degMin, ctx.degMax);
      ev.push({ t: rh.t, d: rh.d, deg, v: 88 });
      deg = ev[ev.length - 1].deg;
    });
    return { ev };
  }

  // sửa ô nhịp: chuẩn hóa tầm âm + bám nốt hợp âm ở phách mạnh
  function repairBar(bar, ctx, barStartStep, snap) {
    const chord = ctx.chordAt(barStartStep);
    bar.ev.forEach((e) => {
      while (e.deg > ctx.degMax) e.deg -= 7;
      while (e.deg < ctx.degMin) e.deg += 7;
      if (snap && chord) {
        const pcs = T.chordPcs(chord);
        const p = mod(T.degToPitch(e.deg, ctx.key, ctx.mode), 12);
        if (!pcs.includes(p)) {
          const prob = e.t % 8 === 0 ? 0.92 : e.t % 4 === 0 ? 0.55 : 0.1;
          // snap chỉ khi chord tone cách ≤ 2 bậc
          if ((ctx.rnd || Math.random)() < prob) {
            const nd = chordTonesDeg(e.deg, pcs, ctx.key, ctx.mode);
            if (Math.abs(nd - e.deg) <= 2) e.deg = nd;
          }
        }
      }
    });
    // tránh 3 nốt trùng liên tiếp
    for (let i = 2; i < bar.ev.length; i++) {
      if (bar.ev[i].deg === bar.ev[i - 1].deg && bar.ev[i - 1].deg === bar.ev[i - 2].deg) bar.ev[i - 1].deg += i % 2 ? 1 : -1;
    }
    bar.ev.sort((a, b) => a.t - b.t);
    return bar;
  }

  // kết câu
  function applyCadence(bar, kind, r, ctx, barStartStep, lastDegBefore) {
    const minTEnd = kind === 'final' ? 8 : 12;
    let keep = bar.ev.filter((e) => e.t < minTEnd);
    keep.forEach((e) => {
      if (e.t + e.d > minTEnd) e.d = minTEnd - e.t;
    });
    let tEnd = keep.length ? keep[keep.length - 1].t + keep[keep.length - 1].d : 0;
    tEnd = Math.max(tEnd, kind === 'final' ? 6 : 8);
    if (tEnd > minTEnd) tEnd = minTEnd;
    const prev = keep.length ? keep[keep.length - 1].deg : lastDegBefore != null ? lastDegBefore : ctx.center;
    let target;
    if (kind === 'final' || kind === 'closed') {
      const tonics = [];
      for (let k = -2; k <= 3; k++) tonics.push(7 * k);
      let cand = tonics;
      if (kind === 'closed' && chance(r, 0.25)) cand = tonics.map((x) => x + 2);
      target = cand.reduce((b, x) => (Math.abs(x - prev) < Math.abs(b - prev) ? x : b), cand[0]);
    } else {
      const chord = ctx.chordAt(barStartStep + 12);
      let cand = [1, 4, 6, 8, 11, 13, -3, -1, -6];
      if (chord) {
        const pcs = T.chordPcs(chord);
        cand = [];
        for (let d = ctx.degMin; d <= ctx.degMax; d++) if (pcs.includes(mod(T.degToPitch(d, ctx.key, ctx.mode), 12))) cand.push(d);
      }
      cand = cand.filter((d) => d >= ctx.degMin && d <= ctx.degMax && d !== prev);
      if (!cand.length) cand = [prev + 1];
      // chọn gần prev nhất (có chút ngẫu nhiên)
      cand.sort((a, b) => Math.abs(a - prev) - Math.abs(b - prev));
      target = cand[Math.min(cand.length - 1, Math.floor(r() * 2))];
    }
    // nốt dẫn vào kết câu
    if (keep.length && chance(r, 0.7)) {
      keep[keep.length - 1].deg = target + (keep[keep.length - 1].deg >= target ? 1 : -1);
    }
    const out = keep.map((e) => e);
    out.push({ t: tEnd, d: 16 - tEnd, deg: target, v: 90, end: true });
    return { ev: out };
  }

  // ---------- hợp âm cho vùng sinh ----------
  const OPEN_PROG = { 4: [[0, 5, 3, 4], [0, 3, 5, 4], [5, 3, 0, 4], [0, 2, 3, 4], [0, 5, 1, 4]], 2: [[0, 4], [3, 4], [5, 4], [1, 4]] };
  const CLOSED_PROG = { 4: [[3, 4, 0, 0], [0, 5, 3, 0], [5, 3, 4, 0], [0, 3, 4, 0], [1, 4, 5, 0]], 2: [[3, 0], [4, 0], [0, 0], [1, 0]] };
  const MINOR_OPEN = { 4: [[0, 5, 2, 6], [0, 3, 5, 6], [0, 6, 5, 6], [0, 5, 3, 6]], 2: [[0, 6], [3, 6], [5, 6]] };
  const MINOR_CLOSED = { 4: [[3, 6, 2, 0], [0, 5, 6, 0], [5, 6, 0, 0], [0, 3, 6, 0]], 2: [[3, 0], [6, 0], [0, 0]] };

  function pickProgression(r, mode, kind, P) {
    const open = mode === 'minor' ? MINOR_OPEN : OPEN_PROG;
    const closed = mode === 'minor' ? MINOR_CLOSED : CLOSED_PROG;
    const tbl = kind === 'open' ? open : closed;
    const list = tbl[P] || tbl[4];
    return pick(r, list);
  }

  // ---------- xây một câu ----------
  function buildPhrase(song, o, start, variant, r) {
    const { key, mode } = song;
    const P = o.phraseBars;
    const L = P * 16;
    const idx = Math.floor(start / L);
    const pStart = idx * L;
    const usableEnd = Math.min(pStart + L, song.bars * 16);
    const lastQ = Math.max(0, (usableEnd - pStart) / 16 - 1);
    const startLocal = (start - pStart) / 16;
    const isLast = usableEnd >= song.bars * 16;
    const form = o.form || 'AABA';
    const label = form[idx % form.length];
    const cadKind = isLast ? 'final' : idx % 2 === 1 || idx % form.length === form.length - 1 ? 'closed' : 'open';
    const eff = clamp(o.adventure * variant.mul, 0, 1);
    const pBar0 = pStart / 16;

    // theme: 1-2 ô nhịp đầu bài
    const themeBars = [];
    const pre = song.notes.filter((n) => n.start < start);
    if (pre.length) {
      const b0 = notesToBar(pre, 0, key, mode);
      if (b0.ev.length) themeBars.push(b0);
      if (start >= 32) {
        const b1 = notesToBar(pre, 1, key, mode);
        if (b1.ev.length && b0.ev.length) themeBars.push(b1);
      }
    }
    // chord map: hợp âm hiện có + hợp âm tự tạo cho ô còn thiếu
    const existing = {};
    song.chords.forEach((c) => {
      for (let b = Math.floor(c.start / 16); b <= Math.floor((c.start + c.dur - 1) / 16); b++) if (!existing[b]) existing[b] = c;
    });
    const chordsByBar = Object.assign({}, existing);
    const newChords = [];
    const dia = T.diatonicChords(key, mode, false);
    let needGen = false;
    for (let q = 0; q <= lastQ; q++) if (!existing[pBar0 + q] && (q >= startLocal || bars0Has(song, pBar0 + q))) needGen = true;
    if (needGen) {
      const degs = pickProgression(r, mode, cadKind === 'open' ? 'open' : 'closed', P);
      for (let q = 0; q <= lastQ; q++) {
        const bi = pBar0 + q;
        if (existing[bi] || (q < startLocal && !bars0Has(song, bi))) continue;
        const dc = dia[degs[Math.min(q, degs.length - 1)]];
        const ch = { id: MS.Store ? MS.Store.uid() : 'c' + bi, start: bi * 16, dur: 16, root: dc.root, quality: dc.quality };
        chordsByBar[bi] = ch;
        newChords.push(ch);
      }
    }

    // trung tâm âm vực
    const themeDegs = themeBars.flatMap((b) => b.ev.map((e) => e.deg));
    const center = themeDegs.length ? Math.round(themeDegs.reduce((a, b) => a + b, 0) / themeDegs.length) : 2;
    const ctx = makeCtx(song, o, chordsByBar, eff, center);
    ctx.rnd = r;

    // các ô trong câu
    const bars = [];
    for (let q = 0; q < P; q++) bars[q] = q < startLocal ? notesToBar(song.notes, pBar0 + q, key, mode) : null;
    let prevDeg = null;
    const prevBarIdx = start / 16 - 1;
    if (prevBarIdx >= 0) {
      const pb = notesToBar(song.notes, prevBarIdx, key, mode);
      if (pb.ev.length) prevDeg = pb.ev[pb.ev.length - 1].deg;
    }
    let lastSig = null;
    const srcOf = (b) => (b && b.ev.length ? b : null);

    for (let q = startLocal; q <= lastQ; q++) {
      const role = q === lastQ ? 'cadence' : q === 0 ? 'statement' : q === 1 ? 'answer' : 'develop';
      const barStart = (pBar0 + q) * 16;
      let bar = null;
      const fresh = (startDeg, longEnd) => {
        const rh = pickRhythm(r, eff, lastSig, longEnd);
        return walkBar(r, ctx, rh, startDeg, null, barStart);
      };
      const prevBar = srcOf(bars[q - 1]);

      if (role === 'statement') {
        const t0 = srcOf(themeBars[0]);
        if (label === 'B' || !t0) {
          bar = fresh(label === 'B' ? ctx.center + pick(r, [2, 3, -2]) : pick(r, [0, 2, 4]), false);
        } else {
          bar = chance(r, 0.65) ? cloneBar(t0) : shiftBar(t0, pick(r, [1, -1, 2]));
          if (idx > 0 && chance(r, 0.3 + eff * 0.3)) bar = rhythmVar(bar, r);
        }
      } else if (role === 'answer') {
        const t1 = label === 'A' ? srcOf(themeBars[1]) : null;
        if (t1) {
          bar = chance(r, 0.6) ? cloneBar(t1) : shiftBar(t1, pick(r, [-1, 1]));
        } else if (prevBar) {
          bar = shiftBar(prevBar, pick(r, [-1, -2, 1, -1]));
          if (chance(r, 0.35 + eff * 0.5)) bar = rhythmVar(bar, r);
          if (chance(r, 0.4)) bar = fillLeaps(bar, r);
        } else bar = fresh(ctx.center, false);
      } else if (role === 'develop') {
        if (label === 'B') {
          bar = fresh(ctx.center + pick(r, [2, 3, 4]), false);
        } else if (chance(r, variant.repeat) && srcOf(bars[0])) {
          bar = chance(r, 0.6) ? cloneBar(bars[0]) : shiftBar(bars[0], pick(r, [1, 2]));
        } else if (prevBar) {
          bar = chance(r, 0.4) ? invertBar(prevBar) : shiftBar(prevBar, pick(r, [1, 2, -2]));
          if (chance(r, 0.4 + eff * 0.4)) bar = rhythmVar(bar, r);
        } else bar = fresh(ctx.center + 2, false);
      } else {
        // cadence
        const base = srcOf(bars[1]) || srcOf(bars[0]) || prevBar;
        if (base && chance(r, 0.7)) {
          bar = chance(r, 0.5) ? cloneBar(base) : shiftBar(base, pick(r, [-1, 0, 1]));
        } else {
          bar = fresh(ctx.center + pick(r, [1, 0, -1]), true);
        }
      }
      if (!bar.ev.length) bar = fresh(ctx.center, role === 'cadence');
      // ghép nốt đầu ô với nốt cuối ô trước: tránh nhảy quãng quá lớn
      if (prevDeg != null && bar.ev.length) {
        const f = bar.ev[0];
        while (f.deg - prevDeg > 6) shiftBarInPlace(bar, -7);
        while (f.deg - prevDeg < -6) shiftBarInPlace(bar, 7);
      }
      bar = repairBar(bar, ctx, barStart, true);
      if (role === 'cadence') {
        bar = applyCadence(bar, cadKind, r, ctx, barStart, prevDeg);
        bar.ev.forEach((e) => {
          while (e.deg > ctx.degMax) e.deg -= 7;
          while (e.deg < ctx.degMin) e.deg += 7;
        });
      }
      // chuẩn hóa độ dài, không chồng lấn
      bar.ev.sort((a, b) => a.t - b.t);
      for (let i = 0; i < bar.ev.length; i++) {
        const e = bar.ev[i];
        const nxt = bar.ev[i + 1];
        e.d = Math.max(1, Math.min(e.d, (nxt ? nxt.t : 16) - e.t));
      }
      bars[q] = bar;
      lastSig = rhythmSig(bar.ev);
      prevDeg = bar.ev[bar.ev.length - 1].deg;
    }

    // chuyển thành nốt
    const notes = [];
    let prevPitch = null;
    for (let q = startLocal; q <= lastQ; q++) {
      const bar = bars[q];
      const barStart = (pBar0 + q) * 16;
      bar.ev.forEach((e) => {
        let pitch = T.degToPitch(e.deg, key, mode);
        if (prevPitch != null) {
          while (pitch - prevPitch > 12) pitch -= 12;
          while (prevPitch - pitch > 12) pitch += 12;
        }
        prevPitch = pitch;
        const accent = e.t === 0 ? 100 : e.t % 8 === 0 ? 94 : e.t % 4 === 0 ? 88 : 80;
        notes.push({
          id: MS.Store ? MS.Store.uid() : 'n' + notes.length,
          start: barStart + e.t, dur: e.d, pitch: clamp(pitch, 36, 96),
          vel: clamp(accent + Math.floor(r() * 7) - 3, 40, 120),
        });
      });
    }
    const chords = o.addChords ? newChords : [];
    const label2 = { A: 'Chủ đề', B: 'Tương phản' }[label] || label;
    return {
      notes, chords, start, end: usableEnd, name: variant.name,
      info: { phrase: idx + 1, label: label2, cadence: { open: 'kết mở', closed: 'kết khép', final: 'kết bài' }[cadKind] },
    };
  }
  function bars0Has(song, barIdx) {
    return song.notes.some((n) => n.start >= barIdx * 16 && n.start < barIdx * 16 + 16);
  }
  function shiftBarInPlace(bar, k) {
    bar.ev.forEach((e) => (e.deg += k));
  }

  const VARIANTS = [
    { name: 'Bám sát', mul: 0.55, repeat: 0.8 },
    { name: 'Cân bằng', mul: 1, repeat: 0.5 },
    { name: 'Phiêu', mul: 1.6, repeat: 0.25 },
  ];

  function suggestStart(song) {
    let m = 0;
    song.notes.forEach((n) => (m = Math.max(m, n.start + n.dur)));
    return Math.ceil(m / 16) * 16;
  }

  // ---------- API chính ----------
  function generate(song, opts) {
    const o = Object.assign({ phraseBars: 4, form: 'AABA', adventure: 0.4, addChords: true, count: 3, seed: (Math.random() * 1e9) | 0 }, opts || {});
    const start = o.startStep != null ? o.startStep : suggestStart(song);
    const out = [];
    for (let i = 0; i < o.count; i++) {
      const r = rng(o.seed + i * 7919 + 13);
      out.push(buildPhrase(song, o, start, VARIANTS[i % VARIANTS.length], r));
    }
    return { start, end: out[0].end, candidates: out, seed: o.seed };
  }

  // tự hoàn thiện đến hết bài (dùng phương án "Cân bằng")
  function autoComplete(song, opts) {
    const o = Object.assign({ phraseBars: 4, form: 'AABA', adventure: 0.4, addChords: true, seed: (Math.random() * 1e9) | 0 }, opts || {});
    const work = Object.assign({}, song, { notes: song.notes.slice(), chords: song.chords.slice() });
    const addedNotes = [], addedChords = [];
    let start = o.startStep != null ? o.startStep : suggestStart(work);
    let guard = 0;
    while (start < work.bars * 16 && guard++ < 64) {
      const r = rng(o.seed + guard * 104729);
      const ph = buildPhrase(work, o, start, VARIANTS[1], r);
      ph.notes.forEach((n) => { work.notes.push(n); addedNotes.push(n); });
      ph.chords.forEach((c) => { work.chords.push(c); addedChords.push(c); });
      start = ph.end;
    }
    return { notes: addedNotes, chords: addedChords };
  }

  // ---------- gợi ý hợp âm từ melody (Viterbi) ----------
  const TRANS = { '4>0': 0.5, '3>4': 0.4, '5>3': 0.3, '0>5': 0.3, '0>3': 0.3, '1>4': 0.4, '3>0': 0.25, '5>1': 0.25, '2>5': 0.25, '6>0': 0.3, '0>4': 0.2, '4>5': 0.2, '5>4': 0.25, '2>3': 0.2, '3>2': 0.1 };
  function suggestChords(song, range) {
    const rg = Object.assign({ fromBar: 0, toBar: song.bars }, range || {});
    const dia = T.diatonicChords(song.key, song.mode, false);
    const bars = [];
    for (let b = rg.fromBar; b < rg.toBar; b++) bars.push(b);
    if (!bars.length) return [];
    const scores = bars.map((b) => {
      const w = new Array(12).fill(0);
      let total = 0;
      song.notes.forEach((n) => {
        const a = Math.max(n.start, b * 16), e = Math.min(n.start + n.dur, b * 16 + 16);
        if (e <= a) return;
        const strong = (n.start - b * 16) % 8 === 0 ? 1.5 : 1;
        w[mod(n.pitch, 12)] += (e - a) * strong;
        total += (e - a) * strong;
      });
      return dia.map((c) => {
        if (!total) return 0;
        const pcs = T.chordPcs(c);
        let inn = 0, out = 0;
        for (let pc = 0; pc < 12; pc++) (pcs.includes(pc) ? (inn += w[pc]) : (out += w[pc]));
        return (inn - 0.6 * out) / total;
      });
    });
    const N = bars.length;
    const dp = [], bp = [];
    for (let i = 0; i < N; i++) {
      dp.push(new Array(7).fill(-1e9));
      bp.push(new Array(7).fill(0));
      for (let d = 0; d < 7; d++) {
        let local = scores[i][d];
        if (i === 0 && rg.fromBar === 0 && d === 0) local += 0.3;
        if (i === N - 1 && rg.toBar >= song.bars && d === 0) local += 0.5;
        if (i === 0) {
          dp[i][d] = local;
        } else {
          for (let p = 0; p < 7; p++) {
            const tr = p === d ? 0.15 : TRANS[p + '>' + d] || 0;
            const v = dp[i - 1][p] + local + tr;
            if (v > dp[i][d]) {
              dp[i][d] = v;
              bp[i][d] = p;
            }
          }
        }
      }
    }
    let bd = 0;
    for (let d = 1; d < 7; d++) if (dp[N - 1][d] > dp[N - 1][bd]) bd = d;
    const seq = new Array(N);
    for (let i = N - 1; i >= 0; i--) {
      seq[i] = bd;
      bd = bp[i][bd];
    }
    const chords = [];
    for (let i = 0; i < N; i++) {
      const last = chords[chords.length - 1];
      if (last && last.deg === seq[i]) {
        last.dur += 16;
      } else {
        const c = dia[seq[i]];
        chords.push({ id: MS.Store ? MS.Store.uid() : 'c' + i, start: bars[i] * 16, dur: 16, root: c.root, quality: c.quality, deg: seq[i] });
      }
    }
    chords.forEach((c) => delete c.deg);
    return chords;
  }

  // áp dụng tiến trình hợp âm (bậc) lặp từ ô fromBar đến hết
  function applyProgression(song, degs, fromBar, repeat, seventh) {
    const dia = T.diatonicChords(song.key, song.mode, !!seventh);
    const out = [];
    const total = repeat ? song.bars - fromBar : Math.min(degs.length, song.bars - fromBar);
    for (let i = 0; i < total; i++) {
      const c = dia[degs[i % degs.length]];
      out.push({ id: MS.Store ? MS.Store.uid() : 'c' + i, start: (fromBar + i) * 16, dur: 16, root: c.root, quality: c.quality });
    }
    return out;
  }

  MS.Generator = { rng, generate, autoComplete, suggestChords, applyProgression, analyzeMotif, evaluateMotif, lineRhythm, melodyForLine, suggestStart, notesToBar, VARIANTS };
})();
