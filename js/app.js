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
    setTimeout(() => { splash.hidden = true; if (MS.UI && MS.UI.centerRoll) MS.UI.centerRoll(); }, 650);
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
  function showGate(j) {
    if (gateShown) return;
    gateShown = true;
    try { MS.Store.saveNow && MS.Store.saveNow(); } catch (e) { /* ok */ }
    $('gateText').textContent = 'Phiên bản ' + j.version + ' đã sẵn sàng (đang dùng ' + MS.VERSION + '). Bấm để tải bản mới — việc này mất vài giây.';
    $('updateGate').hidden = false;
    if (MS.Audio && MS.Audio.Transport && MS.Audio.Transport.stop) { try { MS.Audio.Transport.stop(); } catch (e) { /* ok */ } }
    $('gateBtn').onclick = () => apply(j);
  }
  async function apply(j) {
    const btn = $('gateBtn');
    btn.disabled = true; btn.textContent = 'Đang tải bản mới…';
    const done = () => location.reload();
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.register('sw.js?v=' + encodeURIComponent(j.build));
        await new Promise((res) => {
          const t = setTimeout(res, 20000);
          const w = reg.installing || reg.waiting || reg.active;
          if (!w || w.state === 'activated') { clearTimeout(t); return res(); }
          w.addEventListener('statechange', () => { if (w.state === 'activated') { clearTimeout(t); res(); } });
        });
      }
    } catch (e) { /* tải thẳng */ }
    done();
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
  const left = document.querySelector('.side.left'), right = document.querySelector('.side.right'), settings = $('settings');
  const panels = [left, right, settings];
  function setNav(name) { document.querySelectorAll('#bottomNav button').forEach((b) => b.classList.toggle('on', b.dataset.nav === name)); }
  function closeSheets() {
    if (body.classList.contains('phone')) return showPage('assist');
    panels.forEach((x) => x.classList.remove('open'));
    settings.hidden = true; $('sheetBack').hidden = true;
    setNav('assist'); setNav(null);
    document.querySelector('#bottomNav [data-nav="roll"]').classList.add('on');
  }
  function showPage(name) {
    panels.forEach((x) => x.classList.remove('open'));
    settings.hidden = false;
    const el = name === 'chords' ? left : name === 'settings' ? settings : right;
    if (name === 'assist' || name === 'lyrics') { const t = document.querySelector('.tab[data-tab="' + name + '"]'); if (t) t.click(); }
    el.classList.add('open');
    setNav(name);
  }
  function openSheet(name) {
    if (body.classList.contains('phone')) return showPage(name);
    const el = name === 'chords' ? left : name === 'settings' ? settings : right;
    const tab = document.querySelector('.tab.on');
    const same = el.classList.contains('open') && ((name !== 'assist' && name !== 'lyrics') || (tab && tab.dataset.tab === name));
    if (same) return closeSheets();
    panels.forEach((x) => x.classList.remove('open'));
    if (name === 'assist' || name === 'lyrics') { const t = document.querySelector('.tab[data-tab="' + name + '"]'); if (t) t.click(); }
    settings.hidden = false; el.classList.add('open'); $('sheetBack').hidden = false;
    setNav(name);
  }
  // ----- piano roll toàn màn hình ngang (điện thoại) -----
  function openRoll() {
    body.classList.add('roll-full');
    placeDock();
    lockLandscape();
    setTimeout(() => { if (MS.UI && MS.UI.centerRoll) MS.UI.centerRoll(); if (innerHeight > innerWidth) toast('Xoay ngang điện thoại để có chỗ soạn rộng hơn.'); }, 120);
  }
  function lockLandscape() { try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* ok */ } }
  function lockPortrait() { try { if (isPhoneDevice && screen.orientation && screen.orientation.lock) screen.orientation.lock('portrait').catch(() => {}); } catch (e) { /* ok */ } }
  function closeRoll() {
    body.classList.remove('roll-full');
    lockPortrait();
    placeDock();
  }
  $('rollClose').addEventListener('click', closeRoll);
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
    $('navRollLbl').textContent = ph ? 'Piano roll' : 'Soạn';
    if (ph) showPage(right.classList.contains('open') || !panels.some((x) => x.classList.contains('open')) ? 'assist' : left.classList.contains('open') ? 'chords' : 'settings');
    else { panels.forEach((x) => x.classList.remove('open')); settings.hidden = true; $('sheetBack').hidden = true; }
  }
  document.querySelectorAll('#bottomNav button').forEach((b) => b.addEventListener('click', () => {
    const n = b.dataset.nav;
    if (n === 'roll') { if (body.classList.contains('phone')) openRoll(); else closeSheets(); } else openSheet(n);
  }));
  $('sheetBack').addEventListener('pointerdown', closeSheets);
  // chọn hợp âm xong trong ngăn thì thu ngăn lại để đặt lên làn hợp âm (máy tính bảng)
  document.addEventListener('click', (e) => {
    if (!compactMQ.matches || body.classList.contains('phone')) return;
    if (e.target.closest('#chordPalette button') && left.classList.contains('open')) closeSheets();
  }, true);
  [compactMQ, phoneMQ].forEach((q) => (q.addEventListener ? q.addEventListener('change', layout) : q.addListener(layout)));
  layout();

  // ---------- kiểu app trên cảm ứng ----------
  const allowSel = (t) => t && t.closest && t.closest('input, textarea, select, [contenteditable]');
  document.addEventListener('selectstart', (e) => { if (!allowSel(e.target)) e.preventDefault(); });
  document.addEventListener('contextmenu', (e) => { if (isTouch || !allowSel(e.target)) { if (isTouch || e.target.closest('.roll-wrap')) e.preventDefault(); } });
  ['gesturestart', 'gesturechange'].forEach((n) => document.addEventListener(n, (e) => e.preventDefault()));
  let lastTap = 0;
  document.addEventListener('touchend', (e) => { const n = Date.now(); if (n - lastTap < 320 && !allowSel(e.target)) e.preventDefault(); lastTap = n; }, { passive: false });
})();
