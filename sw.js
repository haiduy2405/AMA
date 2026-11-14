/* Assistant Music AI — service worker. Phiên bản lấy từ ?v=<build> trên URL đăng ký:
   đổi build => URL mới => trình duyệt coi là SW mới (không bị CDN/HTTP cache giữ). */
const V = new URL(self.location.href).searchParams.get('v') || '0';
const CACHE = 'muse-' + V;
const ASSETS = ['./', 'index.html', 'css/style.css', 'css/fonts.css', 'fonts/be-vietnam-pro-vietnamese-400-normal.woff2', 'fonts/be-vietnam-pro-latin-400-normal.woff2', 'fonts/be-vietnam-pro-vietnamese-500-normal.woff2', 'fonts/be-vietnam-pro-latin-500-normal.woff2', 'fonts/be-vietnam-pro-vietnamese-600-normal.woff2', 'fonts/be-vietnam-pro-latin-600-normal.woff2', 'fonts/be-vietnam-pro-vietnamese-700-normal.woff2', 'fonts/be-vietnam-pro-latin-700-normal.woff2', 'fonts/be-vietnam-pro-vietnamese-800-normal.woff2', 'fonts/be-vietnam-pro-latin-800-normal.woff2', 'manifest.webmanifest', 'version.json',
  'assets/hero.webp', 'assets/mic.webp', 'assets/splash.webp', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
  'js/version.js', 'js/theory.js', 'js/store.js', 'js/uistate.js', 'js/generator.js', 'js/midifile.js',
  'js/audio.js', 'js/input.js', 'js/voice.js', 'js/roll.js', 'js/ui.js', 'js/studio.js', 'js/projects.js', 'js/main.js', 'js/changelog.js', 'js/app.js'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    for (const a of ASSETS) {
      const res = await fetch(a + (a.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(V), { cache: 'no-store' });
      if (!res.ok) throw new Error('precache ' + a + ' ' + res.status);
      await c.put(a, res);
    }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('muse-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // font Google: để trình duyệt tự xử lý
  if (url.pathname.endsWith('/version.json')) return; // luôn lấy mạng để phát hiện bản mới
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await c.match('index.html') : null);
    return hit || fetch(req);
  })());
});
