/* Assistant Music AI — main.js : bài mẫu + khởi động */
(function () {
  'use strict';
  const MS = globalThis.MS;
  const T = MS.Theory;

  // Bài mẫu 8 ô nhịp, Đô trưởng — viết theo bậc âm cho dễ đọc
  MS.demoSong = function () {
    const key = 0, mode = 'major';
    const bars = [
      [[0, 4, 2], [4, 2, 4], [6, 2, 5], [8, 4, 4], [12, 4, 2]],
      [[0, 6, 2], [6, 2, 1], [8, 4, 0], [12, 4, -2]],
      [[0, 4, 3], [4, 4, 5], [8, 4, 7], [12, 4, 5]],
      [[0, 4, 6], [4, 4, 4], [8, 8, 4]],
      [[0, 4, 2], [4, 2, 4], [6, 2, 5], [8, 4, 7], [12, 4, 4]],
      [[0, 4, 5], [4, 4, 4], [8, 4, 2], [12, 4, 0]],
      [[0, 4, 3], [4, 4, 5], [8, 4, 7], [12, 4, 6]],
      [[0, 4, 4], [4, 4, 1], [8, 8, 0]],
    ];
    const notes = [];
    bars.forEach((b, bi) => b.forEach(([t, d, deg]) => notes.push({
      id: MS.Store.uid(), start: bi * 16 + t, dur: d, pitch: T.degToPitch(deg, key, mode), vel: t === 0 ? 100 : 86,
    })));
    const dia = T.diatonicChords(key, mode);
    const prog = [0, 5, 3, 4, 0, 5, 3, 0];
    const chords = prog.map((d, i) => ({ id: MS.Store.uid(), start: i * 16, dur: 16, root: dia[d].root, quality: dia[d].quality }));
    return {
      title: 'Chiều rơi trên phố', key, mode, bpm: 84, bars: 8, notes, chords,
      lyrics: { 0: 'Chiều rơi trên phố nhỏ', 1: 'mình em đi qua', 2: 'nghe tim mình khẽ', 3: 'một bài ca', 4: 'Ngày mai nắng lên rồi', 5: 'ai đó vẫn chờ', 6: 'mình cùng nhau đi', 7: 'về nhà thôi' },
      sections: [{ bar: 0, name: 'Verse' }, { bar: 4, name: 'Chorus' }],
    };
  };

  function boot() {
    const had = MS.Store.load();
    if (!had) MS.Store.replace(MS.demoSong());
    MS.UI.init();
    if (MS.Studio) MS.Studio.init();
    if (MS.Voice) MS.Voice.init();
    if (MS.Projects) MS.Projects.init();
    if (!had) MS.UI.toast(matchMedia('(pointer: coarse)').matches ? 'Chào mừng! Đã nạp bài mẫu — chạm một chữ để chọn nốt, bấm ▶ để nghe.' : 'Chào mừng! Đã nạp bài mẫu — chạm một chữ để chọn nốt, Space để nghe.');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
