import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// SUITES=a.mjs,b.mjs runs only those files from tests/ (default: every browser suite).
const allSuites = ['parity-browser.mjs', 'mobile-interaction.mjs', 'mobile-layout.mjs', 'pwa-browser.mjs', 'fx-browser.mjs'];
const suites = process.env.SUITES ? process.env.SUITES.split(',').map(name => name.trim()).filter(Boolean) : allSuites;
for (const name of suites) if (!/^[\w.-]+\.mjs$/.test(name)) throw new Error(`SUITES lists an invalid file name: ${name}`);

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const root = path.join(projectRoot, 'dist');
const prefix = '/' + (process.env.PAGES_BASE_PATH || 'game-shop').replace(/^\/+|\/+$/g, '') + '/';
if (!/^\/(?:[a-zA-Z0-9_.-]+\/)+$/.test(prefix)) throw new Error('PAGES_BASE_PATH must be a non-root URL path.');
await access(path.join(root, 'index.html'));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.json': 'application/json' };

// Serve only the built artifact at a project-site path. Root asset requests must fail.
const server = http.createServer(async (request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400).end(); return; }
  if (pathname.includes('\0') || pathname.includes('\\')) { response.writeHead(400).end(); return; }
  if (pathname === prefix.slice(0, -1)) { response.writeHead(301, { Location: prefix }).end(); return; }
  if (!pathname.startsWith(prefix)) { response.writeHead(404).end('Not found'); return; }
  const relative = pathname.slice(prefix.length) || 'index.html';
  const file = path.resolve(root, relative);
  if (relative.split('/').includes('..') || !file.startsWith(root + path.sep)) { response.writeHead(404).end('Not found'); return; }
  try {
    const data = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    response.end(data);
  } catch { response.writeHead(404).end('Not found'); }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const url = origin + prefix;
try {
  for (const forbidden of ['/', '/assets/favicon.svg', '/src/app.js']) {
    assert.equal((await fetch(origin + forbidden)).status, 404, `Root URL ${forbidden} must not resolve.`);
  }
  assert.equal((await fetch(url + 'assets/favicon.svg')).status, 200);
  console.log(`Testing the built GitHub Pages artifact at ${url}`);
  for (const file of suites) {
  const tests = spawn(process.execPath, [`tests/${file}`], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env, PARITY_URL: url }
  });
  const [code, signal] = await once(tests, 'exit');
  if (code !== 0) process.exitCode = code || 1;
  if (signal) console.error(`Pages browser tests terminated with ${signal}.`);
  }
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
