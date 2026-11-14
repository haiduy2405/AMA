#!/usr/bin/env node
/* Phát hành: node tools/bump.js [x.y.z]
   - đặt version/build mới (build = thời gian) vào js/version.js + version.json
   - gắn ?v=<build> vào css/js trong index.html để vượt cache CDN GitHub Pages
   - kiểm tra mọi file trong sw.js ASSETS tồn tại */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const rd = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const wr = (f, s) => fs.writeFileSync(path.join(root, f), s);
const cur = JSON.parse(rd('version.json')).version;
const version = process.argv[2] || cur;
const d = new Date();
const p = (n) => String(n).padStart(2, '0');
const build = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}.${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
wr('version.json', JSON.stringify({ version, build }) + '\n');
wr('js/version.js', `/* tự sinh bởi tools/bump.js — đừng sửa tay */\n(function () { const MS = (globalThis.MS = globalThis.MS || {}); MS.VERSION = '${version}'; MS.BUILD = '${build}'; })();\n`);
let html = rd('index.html');
html = html.replace(/((?:src|href)="(?:js|css)\/[\w.-]+\.(?:js|css))(?:\?v=[^"]*)?"/g, `$1?v=${build}"`);
wr('index.html', html);
const sw = rd('sw.js');
const assets = [...sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
const miss = assets.filter((a) => a !== './' && !fs.existsSync(path.join(root, a)));
if (miss.length) { console.error('Thiếu file trong ASSETS:', miss.join(', ')); process.exit(1); }
console.log(`OK  v${version}  build ${build}`);
