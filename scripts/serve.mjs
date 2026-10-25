// A tiny local web server for previewing dist/.
//
//   npm run dev            → build, serve on http://localhost:8080, rebuild on changes
//   node scripts/serve.mjs --port 4173 --dir dist-test   → serve only (used by the tests)

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT } from './build.mjs';

const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1]) || 8080;
const watch = args.includes('--watch');
const DIST = path.resolve(ROOT, args.includes('--dir') ? args[args.indexOf('--dir') + 1] : 'dist');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.txt': 'text/plain; charset=utf-8',
};

function rebuild() {
  return new Promise((resolve) => {
    spawn(process.execPath, [path.join(ROOT, 'scripts/build.mjs')], { stdio: 'inherit' }).on('exit', resolve);
  });
}

if (watch) {
  await rebuild();
  let timer = null;
  const onChange = () => {
    clearTimeout(timer);
    timer = setTimeout(() => rebuild(), 150);
  };
  for (const target of ['config.yml', 'src', 'screenshots']) {
    fs.watch(path.join(ROOT, target), { recursive: true }, onChange);
  }
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let file;
  try {
    file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
  } catch {
    file = '';
  }
  if (file !== DIST && !file.startsWith(DIST + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'content-type': TYPES['.html'] });
    fs.createReadStream(path.join(DIST, '404.html')).on('error', () => res.end('Not found')).pipe(res);
    return;
  }
  res.writeHead(200, {
    'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
    'cache-control': 'no-store',
  });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => {
  console.log(`Serving ${path.relative(ROOT, DIST)}/ at http://localhost:${port}/` + (watch ? '  (rebuilding on changes)' : ''));
});
