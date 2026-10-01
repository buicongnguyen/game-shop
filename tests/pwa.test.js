// Install metadata, icons, the service worker and the build that stamps it (node --test).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { inflateSync } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('manifest.webmanifest'));
const html = read('index.html');
const workerSource = read('sw.js');
const BUILD_ID_PLACEHOLDER = "const BUILD_ID = 'dev';";
const PRECACHE_PLACEHOLDER = 'const PRECACHE_URLS = [];';
const relativeUrl = url => typeof url === 'string' && url.startsWith('./') && !url.includes('://');

// ------------------------------------------------------------------ PNG reading (8-bit, non-interlaced)
function readPng(file) {
  const buffer = readFileSync(file);
  assert.equal(buffer.readUInt32BE(0), 0x89504e47, `${file} is not a PNG`);
  const chunks = {}, idat = [];
  for (let pos = 8; pos < buffer.length;) {
    const length = buffer.readUInt32BE(pos), type = buffer.toString('latin1', pos + 4, pos + 8), body = buffer.subarray(pos + 8, pos + 8 + length);
    if (type === 'IDAT') idat.push(body); else chunks[type] = body;
    pos += 12 + length;
    if (type === 'IEND') break;
  }
  const ihdr = chunks.IHDR;
  return { width: ihdr.readUInt32BE(0), height: ihdr.readUInt32BE(4), depth: ihdr[8], color: ihdr[9], interlace: ihdr[12], bytes: buffer.length, chunks, idat };
}
// RGBA of every pixel (colour types 2, 3 and 6).
function rgba(png) {
  assert.equal(png.depth, 8); assert.equal(png.interlace, 0); assert.ok([2, 3, 6].includes(png.color), `colour type ${png.color}`);
  const channels = { 2: 3, 3: 1, 6: 4 }[png.color], stride = png.width * channels;
  const raw = inflateSync(Buffer.concat(png.idat)), data = Buffer.alloc(stride * png.height);
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < png.height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x, a = x >= channels ? data[at - channels] : 0, b = y ? data[at - stride] : 0, c = y && x >= channels ? data[at - stride - channels] : 0;
      data[at] = (raw[y * (stride + 1) + 1 + x] + [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter]) & 0xff;
    }
  }
  const out = Buffer.alloc(png.width * png.height * 4), palette = png.chunks.PLTE, alpha = png.chunks.tRNS;
  for (let i = 0; i < png.width * png.height; i++) {
    if (png.color === 3) { const k = data[i]; out.set([palette[k * 3], palette[k * 3 + 1], palette[k * 3 + 2], alpha && k < alpha.length ? alpha[k] : 255], i * 4); }
    else out.set([data[i * channels], data[i * channels + 1], data[i * channels + 2], channels === 4 ? data[i * 4 + 3] : 255], i * 4);
  }
  return out;
}
const alphaAt = (pixels, png, x, y) => pixels[(y * png.width + x) * 4 + 3];

// ------------------------------------------------------------------ manifest, icons, page head
test('the web manifest carries the install metadata with relative URLs', () => {
  assert.equal(manifest.name, 'Tiệm Mì Cay');
  assert.equal(manifest.short_name, 'Mì Cay');
  assert.equal(manifest.lang, 'vi');
  assert.equal(manifest.display, 'fullscreen');
  assert.deepEqual(manifest.display_override, ['fullscreen', 'standalone']);
  assert.equal(manifest.orientation, 'any');
  assert.equal(manifest.background_color, '#5a2334');
  assert.equal(manifest.theme_color, '#5a2334');
  assert.deepEqual(manifest.categories, ['games', 'food']);
  const description = html.match(/<meta name="description" content="([^"]+)">/)?.[1];
  assert.ok(description, 'index.html keeps its meta description');
  assert.equal(manifest.description, description, 'The manifest describes the game exactly as the page does');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.deepEqual(manifest.icons.map(icon => [icon.sizes, icon.type, icon.purpose]), [
    ['192x192', 'image/png', 'any'], ['512x512', 'image/png', 'any'], ['512x512', 'image/png', 'maskable']
  ]);
  for (const icon of manifest.icons) assert.ok(relativeUrl(icon.src) && icon.src.startsWith('./assets/icons/'), `${icon.src} must be relative to the manifest`);
});

test('every icon exists at its pixel size, under 60 KB, opaque where a home screen needs it', () => {
  const iconFile = src => path.join(root, 'public', src.replace(/^\.\//, ''));
  for (const icon of manifest.icons) {
    const png = readPng(iconFile(icon.src)), [w, h] = icon.sizes.split('x').map(Number);
    assert.deepEqual([png.width, png.height], [w, h], `${icon.src} is ${png.width}x${png.height}`);
    assert.ok(png.bytes <= 60 * 1024, `${icon.src} is ${png.bytes} bytes`);
    const pixels = rgba(png);
    if (icon.purpose === 'maskable') assert.ok(pixels.every((v, i) => i % 4 !== 3 || v === 255), 'The maskable icon is full-bleed and opaque');
    else {
      assert.equal(alphaAt(pixels, png, 0, 0), 0, `${icon.src} has rounded, transparent corners`);
      assert.equal(alphaAt(pixels, png, png.width >> 1, png.height >> 1), 255);
    }
  }
  const apple = readPng(path.join(root, 'public/assets/icons/apple-touch-icon.png'));
  assert.deepEqual([apple.width, apple.height], [180, 180]);
  assert.ok(apple.bytes <= 60 * 1024);
  assert.ok(rgba(apple).every((v, i) => i % 4 !== 3 || v === 255), 'iOS paints transparent pixels black, so the apple-touch-icon is opaque');
  const svg = read('public/assets/icons/icon.svg');
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 512 512"/);
  assert.doesNotMatch(svg, /href=|url\((?!#)|<image|<text/, 'The icon is self-contained vector art');
});

test('the icon generator keeps the maskable art inside the safe zone it declares', async () => {
  const { appIcon, ART_CIRCLE, SAFE_RADIUS } = await import('../src/art/app-icon.js');
  assert.equal(appIcon(), appIcon(), 'The generator is deterministic');
  const masked = appIcon({ maskable: true }), scale = Number(masked.match(/scale\(([\d.]+)\)/)[1]);
  assert.ok(ART_CIRCLE.r * scale <= SAFE_RADIUS * 512 + 0.01, 'The art circle fits the 80% safe zone');
  assert.match(masked, /<rect width="512" height="512"/, 'The maskable background is full-bleed');
  assert.doesNotMatch(appIcon(), /<rect width="512" height="512"/, 'The "any" icon keeps its rounded card');
  for (const svg of [appIcon(), masked, appIcon({ fullBleed: true })]) {
    const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, 'Ids are unique');
    for (const [, ref] of svg.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.includes(ref), `url(#${ref}) points at a defined id`);
  }
});

test('index.html links the manifest and home-screen tags with relative URLs only', () => {
  const head = html.slice(0, html.indexOf('</head>'));
  const has = (pattern, why) => assert.match(head, pattern, why);
  has(/<link rel="manifest" href="\.\/manifest\.webmanifest">/, 'manifest link');
  has(/<link rel="apple-touch-icon" href="\.\/assets\/icons\/apple-touch-icon\.png">/, 'apple-touch-icon');
  has(/<meta name="application-name" content="Tiệm Mì Cay">/, 'application-name');
  has(/<meta name="apple-mobile-web-app-title" content="Mì Cay">/, 'apple-mobile-web-app-title');
  has(/<meta name="mobile-web-app-capable" content="yes">/, 'mobile-web-app-capable');
  has(/<meta name="apple-mobile-web-app-capable" content="yes">/, 'apple-mobile-web-app-capable');
  has(/<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">/, 'status bar style');
  has(/<meta name="theme-color" content="#5a2334">/, 'theme colour kept');
  has(/<meta name="viewport" content="[^"]*viewport-fit=cover[^"]*">/, 'viewport-fit=cover kept');
  has(/<link rel="icon" type="image\/svg\+xml" href="\.\/assets\/favicon\.svg">/, 'favicon kept');
  has(/<link rel="stylesheet" href="\.\/assets\/fonts\.css">/, 'fonts kept');
  has(/<link rel="stylesheet" href="\.\/src\/style\.css">/, 'stylesheet kept');
  assert.doesNotMatch(html, /\b(?:href|src)\s*=\s*["']\//, 'No root-absolute or protocol-relative URLs: the game lives under /game-shop/');
});

test('the source service worker parses, holds its placeholders and only skips waiting on request', () => {
  const check = spawnSync(process.execPath, ['--check', path.join(root, 'sw.js')], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
  assert.equal(workerSource.split(BUILD_ID_PLACEHOLDER).length, 2, 'One build id placeholder');
  assert.equal(workerSource.split(PRECACHE_PLACEHOLDER).length, 2, 'One precache placeholder');
  assert.match(workerSource, /const CACHE_PREFIX = 'tiem-mi-cay-';/);
  assert.equal(workerSource.match(/skipWaiting\(\)/g).length, 1);
  assert.match(workerSource, /data\.type === 'SKIP_WAITING'\) self\.skipWaiting\(\)/);
  const pwa = read('src/pwa.js');
  assert.match(pwa, /const SW_URL = '\.\/sw\.js';/);
  assert.match(pwa, /register\(SW_URL, \{ scope: '\.\/', updateViaCache: 'none' \}\)/);
});

// ------------------------------------------------------------------ the build
const scratch = mkdtempSync(path.join(tmpdir(), 'tiem-mi-cay-build-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
const builds = new Map();
function build(name) {
  if (builds.has(name)) return builds.get(name);
  const out = path.join(scratch, name);
  const run = spawnSync(process.execPath, [path.join(root, 'tools/build.mjs'), `--out=${out}`], { cwd: root, encoding: 'utf8', timeout: 120000 });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const worker = readFileSync(path.join(out, 'sw.js'), 'utf8');
  const id = worker.match(/const BUILD_ID = '([^']*)';/)?.[1];
  const list = JSON.parse(worker.match(/const PRECACHE_URLS = (\[.*?\]);/)?.[1] ?? 'null');
  const result = { out, worker, id, list };
  builds.set(name, result);
  return result;
}

test('the build stamps a 12-hex build id and a complete precache list into dist/sw.js', () => {
  const { out, worker, id, list } = build('a');
  assert.match(id, /^[0-9a-f]{12}$/);
  assert.ok(!worker.includes(BUILD_ID_PLACEHOLDER) && !worker.includes(PRECACHE_PLACEHOLDER), 'Both placeholders are replaced');
  const check = spawnSync(process.execPath, ['--check', path.join(out, 'sw.js')], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
  assert.ok(Array.isArray(list) && list[0] === './', 'The list starts with the scope itself');
  for (const url of ['./index.html', './manifest.webmanifest', './src/app.js', './src/ride.js', './src/pwa.js', './assets/icons/icon-192.png', './assets/fonts.css']) assert.ok(list.includes(url), `${url} is precached`);
  assert.ok(!list.includes('./sw.js') && !list.includes('./.nojekyll'));
  assert.equal(new Set(list).size, list.length, 'No duplicates');
  for (const url of list.slice(1)) {
    assert.ok(relativeUrl(url), url);
    const file = path.join(out, ...decodeURIComponent(url.slice(2)).split('/'));
    assert.ok(existsSync(file) && statSync(file).isFile(), `${url} exists in the build`);
  }
  assert.ok(existsSync(path.join(out, '.nojekyll')));
  assert.deepEqual(JSON.parse(readFileSync(path.join(out, 'manifest.webmanifest'), 'utf8')), manifest);
  assert.equal(readFileSync(path.join(out, 'index.html'), 'utf8'), html);
});

test('two builds of the same files get the same id', () => {
  assert.equal(build('b').id, build('a').id);
  assert.deepEqual(build('b').list, build('a').list);
});

// ------------------------------------------------------------------ the worker's behaviour, in a sandbox
const SCOPE = 'https://pages.test/game-shop/';
const response = (body, { status = 200, type = 'basic', redirected = false } = {}) => ({ body, status, type, redirected, ok: status >= 200 && status < 300, clone() { return response(body, { status, type, redirected }); } });
const request = (url, { mode = 'cors', method = 'GET', headers = {} } = {}) => ({ url: new URL(url, SCOPE).href, mode, method, cache: 'default', headers: new Headers(headers) });

function sandbox(source, network) {
  const listeners = {}, stores = new Map(), timers = [], log = { fetched: [], precacheModes: [], skipWaiting: 0, claimed: 0, preload: false };
  const keyOf = r => (typeof r === 'string' ? r : r.url);
  const bare = url => { const u = new URL(url); u.search = ''; return u.href; };
  const fetch = async r => { log.fetched.push(keyOf(r)); return network(keyOf(r), r); };
  const open = name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {
      store,
      async match(r, options = {}) {
        const key = keyOf(r);
        if (store.has(key)) return store.get(key);
        if (options.ignoreSearch) for (const [url, value] of store) if (bare(url) === bare(key)) return value;
        return undefined;
      },
      async put(r, value) { store.set(keyOf(r), value); },
      async addAll(list) {
        for (const r of list) { log.precacheModes.push(r.cache); const value = await fetch(r); if (!value.ok) throw new TypeError('precache failed'); store.set(keyOf(r), value); }
      }
    };
  };
  const self = {
    location: new URL('sw.js', SCOPE),
    registration: { scope: SCOPE, navigationPreload: { enable: async () => { log.preload = true; } } },
    clients: { claim: async () => { log.claimed++; } },
    skipWaiting: () => { log.skipWaiting++; return Promise.resolve(); },
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); }
  };
  class Request { constructor(url, init = {}) { this.url = String(url); this.cache = init.cache; } }
  const context = vm.createContext({
    self, fetch, Request, URL, console,
    caches: { open: async name => open(name), keys: async () => [...stores.keys()], delete: async name => stores.delete(name) },
    setTimeout: (fn, ms) => { const timer = { fn, ms, cleared: false }; timers.push(timer); return timer; },
    clearTimeout: timer => { if (timer) timer.cleared = true; }
  });
  vm.runInContext(source, context, { filename: 'sw.js' });
  function dispatch(type, init = {}) {
    const waits = [];
    let responded = null;
    const event = { ...init, waitUntil: p => { waits.push(Promise.resolve(p)); }, respondWith: p => { responded = Promise.resolve(p); } };
    for (const fn of listeners[type] || []) fn(event);
    const settle = async () => { for (let seen = -1; seen !== waits.length;) { seen = waits.length; await Promise.all(waits); await new Promise(r => setImmediate(r)); } };
    return { event, get responded() { return responded; }, settle };
  }
  return { dispatch, stores, timers, log, open };
}

test('the built worker precaches its build, keeps other caches, and waits to be told to switch', async () => {
  const { worker, id, list } = build('a');
  const sw = sandbox(worker, url => response(`net:${url}`));
  await sw.dispatch('install').settle();
  const cache = sw.stores.get(`tiem-mi-cay-${id}`);
  assert.ok(cache, 'One cache per build, named after the build id');
  assert.equal(cache.size, list.length);
  for (const url of list) assert.ok(cache.has(new URL(url, SCOPE).href), `${url} is precached under the scope`);
  assert.ok(sw.log.precacheModes.every(mode => mode === 'reload'), 'Precaching skips the max-age=600 HTTP cache');
  assert.equal(sw.log.skipWaiting, 0, 'No automatic skipWaiting');

  sw.open('tiem-mi-cay-0123456789ab'); sw.open('another-game-v3');
  await sw.dispatch('activate').settle();
  assert.deepEqual([...sw.stores.keys()].sort(), [`tiem-mi-cay-${id}`, 'another-game-v3'].sort(), 'Only older Tiệm Mì Cay caches are deleted');
  assert.equal(sw.log.claimed, 1);
  assert.equal(sw.log.preload, true, 'Navigation preload is switched on');

  sw.dispatch('message', { data: { type: 'HELLO' } });
  assert.equal(sw.log.skipWaiting, 0);
  sw.dispatch('message', { data: { type: 'SKIP_WAITING' } });
  assert.equal(sw.log.skipWaiting, 1);
  const replies = [];
  sw.dispatch('message', { data: { type: 'GET_VERSION' }, ports: [{ postMessage: message => replies.push(message) }] });
  assert.deepEqual(JSON.parse(JSON.stringify(replies)), [{ type: 'VERSION', build: id }], 'The worker reports its build id');
});

test('the built worker serves files cache-first and caches only same-origin successes', async () => {
  const { worker, id } = build('a');
  const answers = new Map([['https://pages.test/game-shop/src/opaque.js', response('', { status: 0, type: 'opaque' })], ['https://pages.test/game-shop/src/missing.js', response('nope', { status: 404 })]]);
  const sw = sandbox(worker, url => answers.get(url) || response(`net:${url}`));
  await sw.dispatch('install').settle();
  const cache = sw.stores.get(`tiem-mi-cay-${id}`), fetchedBefore = sw.log.fetched.length;

  for (const ignored of [request('https://cdn.example/lib.js'), request('https://pages.test/other-project/app.js'), request('./src/app.js', { method: 'POST' }), request('./assets/font-0.ttf', { headers: { range: 'bytes=0-9' } })]) {
    assert.equal(sw.dispatch('fetch', { request: ignored }).responded, null, `${ignored.method} ${ignored.url} is left to the browser`);
  }
  const hit = sw.dispatch('fetch', { request: request('./src/app.js') });
  assert.equal((await hit.responded).body, 'net:https://pages.test/game-shop/src/app.js');
  assert.equal(sw.log.fetched.length, fetchedBefore, 'A precached file never touches the network');

  const miss = sw.dispatch('fetch', { request: request('./src/later.js?v=2') });
  assert.equal((await miss.responded).body, 'net:https://pages.test/game-shop/src/later.js?v=2');
  await miss.settle();
  assert.ok(cache.has('https://pages.test/game-shop/src/later.js?v=2'), 'A same-origin 200 is cached for next time');
  for (const url of ['./src/opaque.js', './src/missing.js']) {
    const event = sw.dispatch('fetch', { request: request(url) });
    await event.responded;
    await event.settle();
    assert.ok(!cache.has(new URL(url, SCOPE).href), `${url} (opaque or failed) is not cached`);
  }
});

test('the built worker loads pages network-first and falls back to its shell offline, slow or broken', async () => {
  const { worker, id } = build('a');
  let mode = 'online', version = 1;
  const pending = [];
  const sw = sandbox(worker, url => {
    if (mode === 'offline') throw new TypeError('Failed to fetch');
    if (mode === 'slow') return new Promise(resolve => pending.push(() => resolve(response('late page'))));
    if (mode === 'broken') return response('Service unavailable', { status: 503 });
    return response(url.endsWith('/') || url.includes('/?') ? `page v${version}` : `net:${url}`);
  });
  await sw.dispatch('install').settle();
  const shell = sw.stores.get(`tiem-mi-cay-${id}`).get(SCOPE);
  assert.equal(shell.body, 'page v1');
  version = 2;
  const page = url => sw.dispatch('fetch', { request: request(url, { mode: 'navigate' }) });

  assert.equal((await page('./?utm=home').responded).body, 'page v2', 'Online, the newest page wins');
  assert.equal(sw.stores.get(`tiem-mi-cay-${id}`).get(SCOPE), shell, 'A build keeps its own precached shell');

  mode = 'offline';
  assert.equal((await page('./?sw=1&from=homescreen').responded).body, shell.body, 'Offline, the cached shell answers, whatever the query string');
  assert.equal((await page('./index.html').responded).body, `net:${SCOPE}index.html`);

  mode = 'broken';
  assert.equal((await page('./').responded).body, shell.body, 'A server error falls back to the shell');

  mode = 'slow';
  const slow = page('./');
  await new Promise(r => setImmediate(r));
  const timer = sw.timers.find(t => t.ms === 4000 && !t.cleared);
  assert.ok(timer, 'Navigations race a 4 s timeout');
  timer.fn();
  assert.equal((await slow.responded).body, shell.body, 'A slow network falls back to the shell after 4 s');
  pending.forEach(resolve => resolve());

  mode = 'online';
  const preloaded = sw.dispatch('fetch', { request: request('./', { mode: 'navigate' }), preloadResponse: Promise.resolve(response('preloaded page')) });
  const fetched = sw.log.fetched.length;
  assert.equal((await preloaded.responded).body, 'preloaded page');
  assert.equal(sw.log.fetched.length, fetched, 'The navigation preload response is used instead of a second request');
});

test('the un-built worker on the dev server caches at run time and asks the network first', async () => {
  let offline = false, version = 1;
  const sw = sandbox(workerSource, url => { if (offline) throw new TypeError('Failed to fetch'); return response(`v${version}:${url}`); });
  await sw.dispatch('install').settle();
  assert.equal(sw.stores.size, 0, 'Nothing is precached without a build');
  await sw.dispatch('activate').settle();

  const page = sw.dispatch('fetch', { request: request('./?sw=1', { mode: 'navigate' }) });
  assert.equal((await page.responded).body, `v1:${SCOPE}?sw=1`);
  await page.settle();
  const file = sw.dispatch('fetch', { request: request('./src/app.js') });
  await file.responded;
  await file.settle();
  const cache = sw.stores.get('tiem-mi-cay-dev');
  assert.ok(cache.has(SCOPE) && cache.has(`${SCOPE}src/app.js`), 'The page (without its query) and the file are kept');

  version = 2;
  assert.equal((await sw.dispatch('fetch', { request: request('./src/app.js') }).responded).body, `v2:${SCOPE}src/app.js`, 'Edits show up on reload');
  offline = true;
  assert.equal((await sw.dispatch('fetch', { request: request('./src/app.js') }).responded).body, `v2:${SCOPE}src/app.js`, 'Offline, the last copy answers');
  assert.equal((await sw.dispatch('fetch', { request: request('./?sw=1&again', { mode: 'navigate' }) }).responded).body, `v1:${SCOPE}?sw=1`);
});

// ------------------------------------------------------------------ src/pwa.js with stand-ins for the browser
class FakeWorker extends EventTarget {
  constructor(state) { super(); this.state = state; this.messages = []; }
  postMessage(message) { this.messages.push(message); }
  become(state) { this.state = state; this.dispatchEvent(new Event('statechange')); }
}
function fakeBrowser({ controlled = true } = {}) {
  const active = controlled ? new FakeWorker('activated') : null;
  const registration = Object.assign(new EventTarget(), { active, waiting: null, installing: null, updates: 0, async update() { this.updates++; } });
  const container = Object.assign(new EventTarget(), { controller: active, registered: [], async register(url, options) { this.registered.push([url, options]); return registration; } });
  return { container, registration };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
// Install a worker the way browsers do: installing (updatefound) → waiting + installed; with no
// active worker yet (a first install) it then moves straight on to active.
async function deliver(registration) {
  const next = new FakeWorker('installing');
  registration.installing = next;
  registration.dispatchEvent(new Event('updatefound'));
  registration.installing = null;
  registration.waiting = next;
  next.become('installed');
  if (!registration.active) {
    registration.waiting = null;
    registration.active = next;
    next.become('activating');
    next.become('activated');
  }
  await tick();
  return next;
}

test('pwa.js announces a waiting update once and applies it with one reload', async () => {
  globalThis.document ??= Object.assign(new EventTarget(), { readyState: 'complete', visibilityState: 'visible', documentElement: {} });
  const { initPwa } = await import('../src/pwa.js');
  const { container, registration } = fakeBrowser();
  let ready = 0, reloads = 0;
  const pwa = initPwa({ serviceWorker: container, reload: () => reloads++, enableServiceWorker: true, onUpdateReady: () => ready++ });
  await tick();
  assert.deepEqual(container.registered, [['./sw.js', { scope: './', updateViaCache: 'none' }]]);
  assert.equal(pwa.registration(), registration);
  assert.equal(pwa.updateReady(), false);

  document.dispatchEvent(new Event('visibilitychange'));
  await tick();
  assert.equal(registration.updates, 1, 'Coming back to the page checks for a new version');
  document.dispatchEvent(new Event('visibilitychange'));
  await tick();
  assert.equal(registration.updates, 1, 'Checks are spaced out');

  const next = await deliver(registration);
  assert.equal(ready, 1);
  assert.equal(pwa.updateReady(), true);
  next.become('installed');
  assert.equal(ready, 1, 'One announcement per new version');
  assert.equal(reloads, 0, 'Nothing switches until the game asks');

  pwa.applyUpdate();
  pwa.applyUpdate();
  assert.deepEqual(next.messages, [{ type: 'SKIP_WAITING' }], 'The waiting worker is told once');
  assert.equal(reloads, 0, 'The reload waits for the new worker to take control');
  container.controller = next;
  container.dispatchEvent(new Event('controllerchange'));
  container.dispatchEvent(new Event('controllerchange'));
  assert.equal(reloads, 1, 'Exactly one reload');
});

test('pwa.js stays quiet on a first install and offers a reload after another tab updated', async () => {
  const { initPwa } = await import('../src/pwa.js');
  const first = fakeBrowser({ controlled: false });
  let ready = 0, reloads = 0;
  initPwa({ serviceWorker: first.container, reload: () => reloads++, enableServiceWorker: true, onUpdateReady: () => ready++ });
  await tick();
  const worker = await deliver(first.registration);
  first.container.controller = worker;
  first.container.dispatchEvent(new Event('controllerchange'));
  assert.deepEqual([ready, reloads], [0, 0], 'The first worker claiming the page is not an update');

  const elsewhere = fakeBrowser();
  let told = 0, reloaded = 0;
  const pwa = initPwa({ serviceWorker: elsewhere.container, reload: () => reloaded++, enableServiceWorker: true, onUpdateReady: () => told++ });
  await tick();
  elsewhere.container.controller = new FakeWorker('activated');
  elsewhere.container.dispatchEvent(new Event('controllerchange'));
  assert.equal(told, 1, 'Another tab switched versions: this page runs old code until it reloads');
  assert.equal(pwa.updateReady(), true);
  assert.equal(reloaded, 0);
  pwa.applyUpdate();
  assert.equal(reloaded, 1);

  const off = fakeBrowser();
  initPwa({ serviceWorker: off.container, reload: () => {}, enableServiceWorker: false });
  await tick();
  assert.deepEqual(off.container.registered, [], 'Disabled means no registration at all');
});
