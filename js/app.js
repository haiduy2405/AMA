/* Assistant Music AI — app.js : vỏ ứng dụng (splash, toàn màn hình, cài app, cập nhật bắt buộc, bố cục điện thoại) */
(function () {
  'use strict';
  const MS = globalThis.MS;
  const $ = (id) => document.getElementById(id);
  const body = document.body;
  const standalone = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
  const isTouch = matchMedia('(pointer: coarse)').matches;
  const isPhoneDevice = isTouch && Math.min(screen.width, screen.height) < 700;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const toast = (m) => MS.UI && MS.UI.toast && MS.UI.toast(m);
  const ver = () => 'v' + MS.VERSION;

  body.classList.toggle('touch', isTouch);
  $('splashVer').textContent = ver();
  $('verLabel').textContent = ver() + (MS.BUILD !== 'dev' ? ' · ' + MS.BUILD : '');

  // ---------- toàn màn hình ----------
  function fsActive() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function goFull() {
    const el = document.documentElement;
    const f = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!f || fsActive()) return Promise.resolve();
    try { return Promise.resolve(f.call(el, { navigationUI: 'hide' })).catch(() => {}); } catch (e) { return Promise.resolve(); }
  }
  function exitFull() { const f = document.exitFullscreen || document.webkitExitFullscreen; if (f && fsActive()) f.call(document); }
  $('btnFull').addEventListener('click', () => { if (fsActive()) exitFull(); else goFull(); });
  if (!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)) $('btnFull').hidden = true;

  // ---------- splash ----------
  const splash = $('splash');
  let started = false;
  function setProgress(p) { $('splashBar').style.width = Math.round(p * 100) + '%'; }
  setProgress(0.25);
  function ready() {
    setProgress(1);
    $('splashTap').textContent = isTouch ? 'Chạm để bắt đầu' : 'Nhấn hoặc chạm để bắt đầu';
    splash.classList.add('ready');
  }
  if (document.readyState === 'complete') setTimeout(ready, 350); else addEventListener('load', () => setTimeout(ready, 350));
  function start() {
    if (started || !splash.classList.contains('ready')) return;
    started = true;
    try { if (MS.Audio) { MS.Audio.ensure(); if (MS.Audio.ctx && MS.Audio.ctx.state === 'suspended') MS.Audio.ctx.resume(); } } catch (e) { /* ok */ }
    lockPortrait(); // điện thoại mặc định màn dọc; chỉ piano roll mới xoay ngang
    splash.classList.add('go');
    setTimeout(() => { splash.hidden = true; if (MS.UI && MS.UI.centerRoll) MS.UI.centerRoll(); if (MS.afterSplash) MS.afterSplash(); }, 650);
  }
  splash.addEventListener('pointerup', start);
  splash.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(); } });
  splash.focus({ preventScroll: true });

  // ---------- cài app ----------
  let deferred = null;
  function refreshInstall() {
    const b = $('btnInstall'), h = $('installHint');
    if (standalone()) { b.textContent = '✓ Đã cài đặt'; b.disabled = true; h.textContent = ''; return; }
    b.disabled = false; b.textContent = '⤓ Cài ra màn hình chính';
    h.textContent = deferred ? '' : isIOS ? 'iPhone/iPad: mở bằng Safari → nút Chia sẻ → “Thêm vào MH chính”.' : 'Nếu chưa hiện hộp cài: menu trình duyệt (⋮) → “Cài đặt ứng dụng” / “Thêm vào màn hình chính”.';
  }
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; refreshInstall(); });
  addEventListener('appinstalled', () => { deferred = null; refreshInstall(); toast('Đã cài Assistant Music AI ra màn hình chính.'); });
  $('btnInstall').addEventListener('click', async () => {
    if (deferred) { deferred.prompt(); try { await deferred.userChoice; } catch (e) { /* ok */ } deferred = null; refreshInstall(); }
    else toast($('installHint').textContent || 'Dùng menu trình duyệt để thêm vào màn hình chính.');
  });
  refreshInstall();

  // ---------- cập nhật bắt buộc ----------
  let gateShown = false;
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  async function remote() {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }
  function setStatus(t, bad) { const e = $('gateStatus'); e.textContent = t || ''; e.classList.toggle('bad', !!bad); }
  function setProg(p) {
    const pr = $('gateProg'); pr.hidden = false;
    const v = Math.max(0, Math.min(100, Math.round(p * 100)));
    $('gateBar').style.width = v + '%'; pr.setAttribute('aria-valuenow', v);
  }
  function showGate(j) {
    if (gateShown) return;
    gateShown = true;
    try { MS.Store.saveNow && MS.Store.saveNow(); } catch (e) { /* ok */ }
    $('gateFrom').textContent = MS.VERSION; $('gateTo').textContent = j.version;
    $('gateText').textContent = j.title ? j.title : 'Bản mới đã sẵn sàng — bấm để cập nhật, mất vài giây.';
    if (Array.isArray(j.items) && j.items.length) {
      const l = $('gateList'); l.hidden = false;
      l.innerHTML = j.items.map((t) => '<li>' + String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) + '</li>').join('');
    }
    $('updateGate').hidden = false;
    if (MS.Audio && MS.Audio.Transport && MS.Audio.Transport.stop) { try { MS.Audio.Transport.stop(); } catch (e) { /* ok */ } }
    $('gateBtn').onclick = () => apply(j);
    $('gateHard').onclick = () => hardReload(j);
  }
  // đường lui: huỷ SW + xoá cache rồi nạp lại với tham số mới để chắc chắn lấy bản mới từ mạng
  async function hardReload(j) {
    setStatus('Đang xoá bộ nhớ đệm và nạp lại…');
    try {
      if ('serviceWorker' in navigator) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
      if (self.caches) for (const k of await caches.keys()) if (k.startsWith('muse-')) await caches.delete(k);
    } catch (e) { /* vẫn nạp lại */ }
    location.replace(location.pathname + '?u=' + encodeURIComponent((j && j.build) || Date.now()));
  }
  let applying = false;
  async function apply(j) {
    if (applying) return;
    applying = true;
    const btn = $('gateBtn');
    btn.disabled = true; btn.textContent = 'Đang cập nhật…';
    $('gateHard').hidden = true;
    setProg(0.02); setStatus('Đang tải các tệp của bản mới…');
    let bc = null, total = 0, failed = false;
    const fail = (msg) => {
      if (failed) return; failed = true; applying = false;
      setStatus(msg, true); btn.disabled = false; btn.textContent = 'Thử lại'; $('gateHard').hidden = false;
      try { bc && bc.close(); } catch (e) { /* ok */ }
    };
    try {
      if (!('serviceWorker' in navigator)) return hardReload(j);
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel('ama-sw');
        bc.onmessage = (ev) => {
          const m = ev.data || {};
          if (m.t === 'start') total = m.total;
          else if (m.t === 'progress') { setProg(0.05 + 0.85 * (m.done / (m.total || total || 1))); setStatus('Đang tải ' + m.done + '/' + (m.total || total) + ' tệp…'); }
          else if (m.t === 'installed') { setProg(0.92); setStatus('Đang cài đặt…'); }
          else if (m.t === 'error') fail('Tải thất bại (' + m.msg + '). Kiểm tra mạng rồi thử lại.');
        };
      }
      const reg = await navigator.serviceWorker.register('sw.js?v=' + encodeURIComponent(j.build));
      const ok = await new Promise((res) => {
        const t = setTimeout(() => res(false), 30000);
        const w = reg.installing || reg.waiting || reg.active;
        if (!w) return res(false);
        if (w.state === 'activated' && reg.active && /v=/.test(reg.active.scriptURL) && reg.active.scriptURL.includes(j.build)) { clearTimeout(t); return res(true); }
        w.addEventListener('statechange', () => {
          if (w.state === 'activated') { clearTimeout(t); res(true); }
          else if (w.state === 'redundant') { clearTimeout(t); res(false); }
        });
      });
      if (failed) return;
      if (!ok) { setStatus('Cách thường chưa được — đang thử cách mạnh hơn…'); return hardReload(j); }
      setProg(1); setStatus('Xong! Đang khởi động lại…');
      try { bc && bc.close(); } catch (e) { /* ok */ }
      setTimeout(() => location.reload(), 350);
    } catch (e) { fail('Không cập nhật được: ' + (e && e.message || e)); }
  }
  async function check(manual) {
    try {
      const j = await remote();
      if (j.build !== MS.BUILD) { showGate(j); return true; }
      if (manual) toast('Bạn đang dùng bản mới nhất (' + ver() + ').');
    } catch (e) { if (manual) toast('Không kiểm tra được — hãy kiểm tra mạng.'); }
    return false;
  }
  $('btnCheckUpd').addEventListener('click', () => check(true));
  if (!(local && MS.BUILD === 'dev')) {
    check(false);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(false); });
    addEventListener('online', () => check(false));
    setInterval(() => check(false), 60000);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js?v=' + encodeURIComponent(MS.BUILD)).catch(() => {});
  }


  // ---------- popup "Có gì mới" ----------
  const SEEN_KEY = 'ama-seen-version';
  const li = (items) => items.map((t) => '<li>' + String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) + '</li>').join('');
  function showWhatsNew(manual) {
    const log = MS.CHANGELOG || [];
    if (!log.length) return;
    const cur = log.find((x) => x.v === MS.VERSION) || log[0];
    $('wnBadge').textContent = 'v' + cur.v;
    $('wnTitle').textContent = manual ? 'Có gì mới & lịch sử' : 'Đã cập nhật lên v' + cur.v;
    $('wnSub').textContent = cur.title + ' · ' + cur.date;
    $('wnList').innerHTML = li(cur.items);
    const old = log.filter((x) => x !== cur);
    $('wnHist').hidden = !old.length;
    $('wnHist').open = !!manual;
    $('wnHistList').innerHTML = old.map((x) => '<div class="wn-ver"><b>v' + x.v + '</b> <span>' + x.date + '</span><em>' + x.title + '</em><ul>' + li(x.items) + '</ul></div>').join('');
    $('whatsNew').hidden = false;
    $('wnClose').textContent = manual ? 'Đóng' : 'Bắt đầu sáng tác';
  }
  function closeWhatsNew() {
    $('whatsNew').hidden = true;
    try { localStorage.setItem(SEEN_KEY, MS.VERSION); } catch (e) { /* ok */ }
  }
  $('wnClose').addEventListener('click', closeWhatsNew);
  $('btnWhatsNew').addEventListener('click', () => { closeSheetsForPopup(); showWhatsNew(true); });
  function closeSheetsForPopup() { /* popup nằm trên cùng, không cần đóng ngăn */ }
  let seenVer = null;
  try { seenVer = localStorage.getItem(SEEN_KEY); } catch (e) { /* ok */ }
  MS.afterSplash = function () { if (seenVer !== MS.VERSION && !gateShown) showWhatsNew(false); };

  // ---------- bố cục: desktop / gọn (máy tính bảng) / điện thoại ----------
  const compactMQ = matchMedia('(max-width: 1020px)');
  const phoneMQ = matchMedia('(max-width: 700px), (pointer: coarse) and (max-height: 520px)');
  const center = document.querySelector('.center'), rollbar = document.querySelector('.rollbar');
  const dockHome = document.createElement('div');
  dockHome.id = 'dockHome'; dockHome.className = 'glass';
  document.querySelector('.layout').parentNode.insertBefore(dockHome, document.querySelector('.layout'));
  const moves = [
    { el: document.querySelector('.topbar .group[aria-label="Giọng và tempo"]'), to: () => $('setSong') },
    { el: document.querySelector('.topbar .group.files'), to: () => $('setFiles') },
    { el: document.querySelector('.topbar .group.transport'), dock: true },
  ];
  moves.forEach((m) => { m.ph = document.createComment('slot'); m.el.parentNode.insertBefore(m.ph, m.el); });
  const dock = moves[2];
  function placeDock() {
    const c = compactMQ.matches, ph = body.classList.contains('phone'), full = body.classList.contains('roll-full');
    dock.el.classList.toggle('dock', c);
    if (!c) dock.ph.parentNode.insertBefore(dock.el, dock.ph.nextSibling);
    else if (ph && !full) dockHome.appendChild(dock.el);
    else if (ph && full) center.insertBefore(dock.el, rollbar);
    else center.appendChild(dock.el);
  }
  const left = document.querySelector('.side.left'), right = document.querySelector('.side.right'), settings = $('settings'), studio = $('studio');
  const panels = [left, right, settings, studio];
  const panelOf = (name) => (name === 'chords' ? left : name === 'settings' ? settings : name === 'studio' ? studio : right);
  const clickTab = (name) => { if (name === 'assist' || name === 'lyrics') { const t = document.querySelector('.tab[data-tab="' + name + '"]'); if (t) t.click(); } };
  function setNav(name) { document.querySelectorAll('#bottomNav button').forEach((b) => b.classList.toggle('on', b.dataset.nav === name)); }
  // chế độ xem ở màn hình rộng: studio | split | roll
  let viewMode = 'split';
  function setMode(m) {
    viewMode = m;
    ['studio', 'split', 'roll'].forEach((k) => center.classList.toggle('mode-' + k, k === m));
    document.querySelectorAll('#viewSw [data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    setTimeout(() => { if (MS.UI && MS.UI.centerRoll && m !== 'studio') MS.UI.centerRoll(); window.dispatchEvent(new Event('resize')); }, 60);
  }
  document.querySelectorAll('#viewSw [data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  function closeSheets() {
    if (body.classList.contains('phone')) return showPage('studio');
    [left, right, settings].forEach((x) => x.classList.remove('open'));
    settings.hidden = true; $('sheetBack').hidden = true;
    setNav(viewMode === 'roll' ? 'roll' : 'studio');
  }
  function showPage(name) {
    [left, right, settings].forEach((x) => x.classList.remove('open'));
    studio.classList.toggle('open', name === 'studio');
    settings.hidden = false;
    if (name !== 'studio') { clickTab(name); panelOf(name).classList.add('open'); }
    setNav(name);
  }
  function openSheet(name) {
    if (body.classList.contains('phone')) return showPage(name);
    if (name === 'studio') { setMode(viewMode === 'roll' ? 'split' : viewMode); closeSheets(); return; }
    const el = panelOf(name);
    if (el.classList.contains('open')) return closeSheets();
    [left, right, settings].forEach((x) => x.classList.remove('open'));
    clickTab(name);
    settings.hidden = false; el.classList.add('open'); $('sheetBack').hidden = false;
    setNav(name);
  }
  // ----- piano roll toàn màn hình ngang (điện thoại) -----
  // nút Back của Android / vuốt lùi của iOS chỉ đóng piano roll, không thoát app
  let rollPushed = false;
  function openRoll() {
    body.classList.add('roll-full');
    if (!rollPushed) { try { history.pushState({ ms: 'roll' }, ''); rollPushed = true; } catch (e) { /* ok */ } }
    placeDock();
    lockLandscape();
    if (!MS.Store.song.notes.length) setVkb(true);
    setTimeout(() => { if (MS.UI && MS.UI.centerRoll) MS.UI.centerRoll(); if (innerHeight > innerWidth) toast('Xoay ngang điện thoại để có chỗ soạn rộng hơn.'); }, 120);
  }
  function lockLandscape() { try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* ok */ } }
  function lockPortrait() { try { if (isPhoneDevice && screen.orientation && screen.orientation.lock) screen.orientation.lock('portrait').catch(() => {}); } catch (e) { /* ok */ } }
  function closeRoll(fromPop) {
    body.classList.remove('roll-full');
    if (rollPushed) { rollPushed = false; if (fromPop !== true && history.state && history.state.ms === 'roll') history.back(); }
    if (!vkb.hidden) setVkb(false);
    lockPortrait();
    if (MS.UI.renderMotif) MS.UI.renderMotif();
    placeDock();
  }
  $('rollClose').addEventListener('click', () => closeRoll());
  addEventListener('popstate', () => { if (rollPushed && body.classList.contains('roll-full')) closeRoll(true); });

  // an toàn dữ liệu: iOS có thể tắt trang nền bất cứ lúc nào → lưu ngay khi rời/ẩn trang, xin lưu trữ bền
  const flush = () => { try { MS.Store.saveNow(); } catch (e) { /* ok */ } };
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  document.addEventListener('pointerdown', function once() {
    document.removeEventListener('pointerdown', once, true);
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ok */ }
  }, true);
  let rzT; addEventListener('resize', () => { if (!body.classList.contains('roll-full')) return; clearTimeout(rzT); rzT = setTimeout(() => MS.UI.centerRoll && MS.UI.centerRoll(), 250); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && body.classList.contains('roll-full')) closeRoll(); });

  function layout() {
    const c = compactMQ.matches;
    if (!c) body.classList.remove('roll-full');
    // đang ở roll toàn màn hình thì giữ chế độ điện thoại (xoay máy có thể báo media query lệch nhịp)
    const ph = phoneMQ.matches || (c && body.classList.contains('roll-full'));
    body.classList.toggle('compact', c);
    body.classList.toggle('phone', ph);
    moves.forEach((m) => {
      if (m.dock) return;
      if (c) m.to().appendChild(m.el); else m.ph.parentNode.insertBefore(m.el, m.ph.nextSibling);
    });
    placeDock();
    const lay = document.querySelector('.layout');
    if (ph) { if (studio.parentNode !== lay) lay.insertBefore(studio, lay.firstChild); }
    else if (studio.parentNode !== center) center.insertBefore(studio, rollbar);
    try { if (MS.UI && MS.UI.renderMotif) MS.UI.renderMotif(); } catch (e) { /* chưa khởi tạo */ }
    $('navRollLbl').textContent = ph ? 'Piano roll' : 'Soạn';
    if (ph) showPage(left.classList.contains('open') ? 'chords' : right.classList.contains('open') ? 'assist' : settings.classList.contains('open') ? 'settings' : 'studio');
    else { panels.forEach((x) => x.classList.remove('open')); settings.hidden = true; $('sheetBack').hidden = true; setMode(viewMode); setNav('studio'); }
  }
  document.querySelectorAll('#bottomNav button').forEach((b) => b.addEventListener('click', () => {
    const n = b.dataset.nav;
    if (n === 'roll') { if (body.classList.contains('phone')) openRoll(); else { setMode('roll'); closeSheets(); } } else openSheet(n);
  }));
  $('sheetBack').addEventListener('pointerdown', closeSheets);
  // chọn hợp âm xong trong ngăn thì thu ngăn lại để đặt lên làn hợp âm (máy tính bảng)
  document.addEventListener('click', (e) => {
    if (!compactMQ.matches || body.classList.contains('phone')) return;
    if (e.target.closest('#chordPalette button') && left.classList.contains('open')) closeSheets();
  }, true);
  [compactMQ, phoneMQ].forEach((q) => (q.addEventListener ? q.addEventListener('change', layout) : q.addListener(layout)));
  layout();


  // ---------- đàn ảo (nhập motif trên điện thoại) ----------
  const S = MS.S;
  const vkb = $('vkb');
  let vkOct = 4;
  const WHITE = [0, 2, 4, 5, 7, 9, 11], BLACK = [[1, 0], [3, 1], [6, 3], [8, 4], [10, 5]];
  const NN = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  function buildKeys() {
    const box = $('vkKeys'); box.innerHTML = '';
    const base = 12 * (vkOct + 1), nW = 14;
    for (let i = 0; i < nW; i++) {
      const p = base + Math.floor(i / 7) * 12 + WHITE[i % 7];
      const k = document.createElement('button');
      k.className = 'vk w' + (i % 7 === 0 ? ' c' : ''); k.dataset.p = p; k.setAttribute('aria-label', NN[i % 7] + (vkOct + Math.floor(i / 7)));
      k.innerHTML = i % 7 === 0 ? '<i>C' + (vkOct + Math.floor(i / 7)) + '</i>' : '';
      box.appendChild(k);
    }
    for (let o = 0; o < 2; o++) BLACK.forEach(([semi, wi]) => {
      const k = document.createElement('button');
      k.className = 'vk b'; k.dataset.p = base + o * 12 + semi; k.setAttribute('aria-label', 'nốt thăng');
      k.style.left = ((o * 7 + wi + 1) / nW * 100) + '%';
      box.appendChild(k);
    });
    $('vkOct').textContent = 'C' + vkOct + '–B' + (vkOct + 1);
  }
  const down = new Map();
  $('vkKeys').addEventListener('pointerdown', (e) => {
    const k = e.target.closest('.vk'); if (!k) return;
    e.preventDefault();
    try { k.setPointerCapture(e.pointerId); } catch (er) { /* ok */ }
    const p = +k.dataset.p; down.set(e.pointerId, p); k.classList.add('down');
    MS.Input.noteOn(p, 92);
  });
  const up = (e) => {
    const p = down.get(e.pointerId); if (p == null) return;
    down.delete(e.pointerId); MS.Input.noteOff(p);
    const k = $('vkKeys').querySelector('.vk[data-p="' + p + '"]'); if (k) k.classList.remove('down');
  };
  $('vkKeys').addEventListener('pointerup', up);
  $('vkKeys').addEventListener('pointercancel', up);
  $('vkOctDn').addEventListener('click', () => { vkOct = Math.max(1, vkOct - 1); buildKeys(); });
  $('vkOctUp').addEventListener('click', () => { vkOct = Math.min(6, vkOct + 1); buildKeys(); });
  function setStep(on) { S.stepInput = on; $('vkStep').checked = on; const t = $('stepToggle'); if (t) t.checked = on; }
  $('vkStep').addEventListener('change', (e) => setStep(e.target.checked));
  $('vkLen').addEventListener('change', (e) => { S.stepLen = +e.target.value; const l = $('stepLen'); if (l) l.value = e.target.value; });
  $('vkRest').addEventListener('click', () => MS.Input.stepRest());
  $('vkBack').addEventListener('click', () => MS.Input.stepBack());
  function setVkb(on) {
    vkb.hidden = !on; body.classList.toggle('vkb-on', on);
    $('btnVkb').classList.toggle('on', on);
    if (on) {
      buildKeys(); setStep(true);
      S.stepLen = +$('vkLen').value;
      const end = MS.Store.lastNoteEnd();
      if (end > 0) S.cursor = Math.min(MS.Store.totalSteps(), end);
      if (MS.UI.centerRoll) setTimeout(MS.UI.centerRoll, 60);
    } else setStep(false);
  }
  $('btnVkb').addEventListener('click', () => setVkb(vkb.hidden));
  $('btnSuggestRoll').addEventListener('click', () => {
    if (!MS.Store.song.notes.length) { toast('Vẽ hoặc bấm vài nốt làm motif trước, rồi bấm Gợi ý.'); return; }
    MS.UI.suggest();
  });

  // ---------- thanh chọn phương án (trong piano roll toàn màn hình) ----------
  const candBar = $('candBar');
  function renderCandBar() {
    const c = S.candidates || [];
    if (!c.length) { candBar.hidden = true; return; }
    const i = S.activeCand < 0 ? 0 : S.activeCand;
    candBar.hidden = false;
    candBar.innerHTML = '<button class="btn tiny" data-a="prev" aria-label="Phương án trước">‹</button><span class="cb-name">' + c[i].name + ' · ★' + (c[i].score || 0) + ' <small>(' + (i + 1) + '/' + c.length + ')</small></span><button class="btn tiny" data-a="next" aria-label="Phương án sau">›</button>' +
      '<button class="btn tiny" data-a="play">▶</button><button class="btn tiny gold" data-a="pick">✓ Chọn</button><button class="btn tiny" data-a="no" aria-label="Bỏ">✕</button>';
  }
  candBar.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const n = S.candidates.length, i = S.activeCand < 0 ? 0 : S.activeCand;
    const a = b.dataset.a;
    if (a === 'prev') MS.UI.selectCand((i + n - 1) % n);
    else if (a === 'next') MS.UI.selectCand((i + 1) % n);
    else if (a === 'play') MS.UI.previewCand(i);
    else if (a === 'pick') MS.UI.acceptCand(i);
    else if (a === 'no') MS.UI.dismissCands();
  });
  document.addEventListener('ms-cands', renderCandBar);

  // ---------- kiểu app trên cảm ứng ----------
  const allowSel = (t) => t && t.closest && t.closest('input, textarea, select, [contenteditable]');
  document.addEventListener('selectstart', (e) => { if (!allowSel(e.target)) e.preventDefault(); });
  document.addEventListener('contextmenu', (e) => { if (isTouch || !allowSel(e.target)) { if (isTouch || e.target.closest('.roll-wrap')) e.preventDefault(); } });
  ['gesturestart', 'gesturechange'].forEach((n) => document.addEventListener(n, (e) => e.preventDefault()));
})();
