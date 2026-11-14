/* Máy chủ tĩnh nhỏ để chạy app offline trên PC: node tools/serve.js [cổng]
   Cần vì micro, service worker và MIDI chỉ chạy trên localhost/HTTPS (không chạy khi mở file trực tiếp). */
const http = require('http'), fs = require('fs'), path = require('path'), { exec } = require('child_process');
const root = path.join(__dirname, '..'), port = +process.argv[2] || 8080;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mid': 'audio/midi' };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(d);
  });
}).listen(port, '127.0.0.1', () => {
  const url = 'http://localhost:' + port + '/';
  console.log('Assistant Music AI chạy tại ' + url + '  (Ctrl+C để tắt)');
  if (process.platform === 'win32') exec('start "" ' + url); else if (process.platform === 'darwin') exec('open ' + url);
});
