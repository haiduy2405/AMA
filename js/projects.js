/* Assistant Music AI — projects.js : bài mới (new project) + thư viện "Bài gần đây" */
(function () {
  'use strict';
  const G = globalThis;
  const MS = (G.MS = G.MS || {});
  const LIB_KEY = 'muse-studio-library-v1', MAX = 12;
  const $ = (id) => document.getElementById(id);

  function readLib() {
    try { const a = JSON.parse(G.localStorage.getItem(LIB_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function writeLib(a) {
    try { G.localStorage.setItem(LIB_KEY, JSON.stringify(a.slice(0, MAX))); return true; } catch (e) { return false; }
  }
  const isEmpty = (s) => !s.notes.length && !s.chords.length && !Object.values(s.lyrics || {}).some((t) => String(t).trim());

  const P = {
    isEmpty,
    list: readLib,
    // lưu bài đang soạn vào thư viện (bỏ qua nếu trống hoặc trùng bản đã lưu)
    saveCurrent() {
      const s = MS.Store.song;
      if (isEmpty(s)) return false;
      const json = JSON.stringify(s), lib = readLib();
      if (lib.some((x) => JSON.stringify(x.song) === json)) return true;
      lib.unshift({ id: MS.Store.uid(), title: s.title || 'Bài chưa đặt tên', at: Date.now(), bars: s.bars, notes: s.notes.length, song: s });
      return writeLib(lib);
    },
    // tạo bài mới; keep=false → xoá hẳn bài hiện tại (vẫn Hoàn tác được bằng Ctrl+Z)
    create(o, keep) {
      if (keep !== false) P.saveCurrent();
      const s = MS.Store.blank();
      s.title = (o.title || '').trim() || 'Bài mới';
      s.key = o.key | 0; s.mode = o.mode === 'minor' ? 'minor' : 'major';
      s.bpm = Math.max(30, Math.min(240, Math.round(o.bpm) || 90));
      s.bars = Math.max(1, Math.min(128, Math.round(o.bars) || 8));
      reset(s);
    },
    open(id) {
      const lib = readLib(), i = lib.findIndex((x) => x.id === id);
      if (i < 0) return;
      const item = lib[i];
      lib.splice(i, 1);
      writeLib(lib);
      P.saveCurrent();
      reset(item.song);
    },
    remove(id) { writeLib(readLib().filter((x) => x.id !== id)); },
  };

  function reset(song) {
    const S = MS.S;
    if (MS.Audio && MS.Audio.Transport.playing) MS.Audio.Transport.stop();
    MS.Store.replace(song, true);
    S.cursor = 0; S.selection = new Set(); S.selChord = null; S.armed = null;
    S.candidates = []; S.activeCand = -1; S.loop = { on: false, start: 0, end: 0 };
    document.dispatchEvent(new CustomEvent('ms-cands'));
    if ($('btnLoop')) $('btnLoop').classList.remove('on');
    if (MS.Studio) MS.Studio.select(0, 0, { preview: false });
    if (MS.UI) { MS.UI.centerRoll(); }
    MS.Store.saveNow();
  }

  if (typeof document === 'undefined') { MS.Projects = P; return; }

  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function ago(ts) {
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'vừa xong';
    if (m < 60) return m + ' phút trước';
    const h = Math.round(m / 60);
    if (h < 24) return h + ' giờ trước';
    return Math.round(h / 24) + ' ngày trước';
  }
  function renderList() {
    const box = $('npRecent'), lib = readLib();
    $('npRecentWrap').hidden = !lib.length;
    box.innerHTML = lib.map((x) => '<div class="np-row" data-id="' + x.id + '"><div class="np-info"><b>' + esc(x.title) + '</b><small>' + x.notes + ' nốt · ' + x.bars + ' ô · ' + ago(x.at) + '</small></div>' +
      '<button class="btn tiny" data-act="open">Mở</button><button class="btn tiny danger" data-act="del" aria-label="Xoá bài khỏi danh sách">✕</button></div>').join('');
  }
  function openDialog() {
    const T = MS.Theory, s = MS.Store.song, cur = !isEmpty(s);
    const ks = $('npKey');
    if (!ks.options.length) for (let i = 0; i < 12; i++) ks.add(new Option(T.pcName(i, false), i));
    $('npTitle').value = '';
    ks.value = s.key; $('npMode').value = s.mode; $('npBpm').value = s.bpm; $('npBars').value = 8;
    $('npCurrent').hidden = !cur;
    $('npCurName').textContent = s.title || 'Bài chưa đặt tên';
    $('npDiscard').checked = false;
    renderList();
    $('newDlg').showModal();
    setTimeout(() => $('npTitle').focus(), 50);
  }
  function init() {
    if (!$('newDlg')) return;
    $('btnNew').onclick = openDialog;
    if ($('btnNewTop')) $('btnNewTop').onclick = openDialog;
    $('npCancel').addEventListener('click', () => $('newDlg').close());
    $('npCreate').addEventListener('click', () => {
      const cur = !isEmpty(MS.Store.song), discard = $('npDiscard').checked;
      P.create({ title: $('npTitle').value, key: +$('npKey').value, mode: $('npMode').value, bpm: +$('npBpm').value, bars: +$('npBars').value }, !discard);
      $('newDlg').close();
      if (MS.UI) MS.UI.toast(cur ? (discard ? 'Đã xoá bài cũ và tạo bài mới (Ctrl+Z để lấy lại).' : 'Đã tạo bài mới. Bài cũ nằm trong “Bài gần đây”.') : 'Đã tạo bài mới.');
    });
    $('npRecent').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const id = b.closest('.np-row').dataset.id;
      if (b.dataset.act === 'open') { P.open(id); $('newDlg').close(); if (MS.UI) MS.UI.toast('Đã mở bài. Bài trước đó được lưu vào “Bài gần đây”.'); }
      else { P.remove(id); renderList(); }
    });
    $('npTitle').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('npCreate').click(); } e.stopPropagation(); });
  }
  P.init = init;
  MS.Projects = P;
})();
