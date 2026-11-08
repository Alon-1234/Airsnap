#!/usr/bin/env node
/**
 * Tiny static file server for the exported AirSnap web app
 * (`npx expo export --platform web` → dist/). Used by the Docker
 * "web" container. Unknown paths fall back to index.html.
 *
 *   node scripts/serve-web.js [dir=dist] [port=8081]
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv[2] || 'dist');
const PORT = Number(process.argv[3] || process.env.PORT || 8081);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
};

if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error(`[web] ${ROOT}/index.html not found — run the web export first.`);
  process.exit(1);
}

function send(res, file, status = 200) {
  const ext = path.extname(file).toLowerCase();
  const hashed = /[.-][0-9a-f]{8,}\./i.test(path.basename(file));
  res.writeHead(status, {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : hashed ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
  });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch (_) {
    res.writeHead(400).end();
    return;
  }
  if (urlPath === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
    return;
  }
  const file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  fs.stat(file, (err, st) => {
    if (!err && st.isFile()) return send(res, file);
    if (!err && st.isDirectory() && fs.existsSync(path.join(file, 'index.html'))) {
      return send(res, path.join(file, 'index.html'));
    }
    // SPA fallback for app routes; real 404 for missing assets.
    if (path.extname(urlPath)) {
      res.writeHead(404).end('Not found');
      return;
    }
    send(res, path.join(ROOT, 'index.html'));
  });
});

server.listen(PORT, () => {
  console.log(`[web] AirSnap app on http://localhost:${PORT}`);
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
