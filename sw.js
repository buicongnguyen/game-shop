// Tiệm Mì Cay service worker: offline play and quiet updates on GitHub Pages.
//
// Pages serves every file with Cache-Control: max-age=600 and no way to change it, so this worker
// gives the long-term cache, one cache per build:
// - install: precache the app shell. tools/build.mjs stamps BUILD_ID and PRECACHE_URLS below, so
//   every deploy changes this file. There is no automatic skipWaiting: a new version waits until
//   the page applies it at a safe moment (src/pwa.js posts {type: 'SKIP_WAITING'}, then reloads
//   once when the new worker takes control).
// - activate: delete the caches of older builds and take control of open pages.
// - fetch, for same-origin GET requests inside the scope only:
//   - navigations are network-first with a 4 s timeout, falling back to the cached shell;
//   - everything else is cache-first, falling back to the network; successful same-origin
//     responses are cached. Opaque and cross-origin responses are never cached.
// Un-built (on the dev server), BUILD_ID stays 'dev' and the list stays empty: nothing is
// precached, pages and files are cached as they load, and the network is asked first so that
// edits show up on reload; the cache then only serves offline.
// Never rename this file: browsers look for updates at the same URL.

const BUILD_ID = 'dev';
const PRECACHE_URLS = [];

const CACHE_PREFIX = 'tiem-mi-cay-';
const CACHE = CACHE_PREFIX + BUILD_ID;
const RUNTIME_ONLY = PRECACHE_URLS.length === 0;
const NAVIGATION_TIMEOUT_MS = 4000;
const SHELL_URLS = ['./', './index.html'];
const MATCH_SHELL = { ignoreSearch: true, ignoreVary: true };

self.addEventListener('install', event => {
  if (RUNTIME_ONLY) return;
  // cache: 'reload' skips the HTTP cache, which may still hold files from the previous deploy.
  event.waitUntil(caches.open(CACHE).then(cache =>
    cache.addAll(PRECACHE_URLS.map(url => new Request(new URL(url, self.location).href, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE).map(name => caches.delete(name)));
    // Navigation preload starts the page request while the worker boots.
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  else if (data.type === 'GET_VERSION' && event.ports && event.ports[0]) event.ports[0].postMessage({ type: 'VERSION', build: BUILD_ID });
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;
  if (request.mode === 'navigate') {
    const network = fromNetwork(event);
    event.waitUntil(network.then(() => {}, () => {}));
    event.respondWith(navigation(event.request, network));
  } else {
    event.respondWith(RUNTIME_ONLY ? networkFirst(event) : cacheFirst(event));
  }
});

// The page from the network (the preloaded response when there is one). Un-built, a good copy
// is kept for offline use; a build keeps its precached shell, so a newer page from the next
// deploy never mixes with this build's files offline.
async function fromNetwork(event) {
  const response = (await event.preloadResponse) || (await fetch(event.request));
  if (RUNTIME_ONLY && cacheable(response)) {
    const key = new URL(event.request.url);
    key.search = '';
    key.hash = '';
    await (await caches.open(CACHE)).put(key.href, response.clone()).catch(() => {});
  }
  return response;
}

async function navigation(request, network) {
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(resolve, NAVIGATION_TIMEOUT_MS); });
  try {
    const first = await Promise.race([network, timeout]);
    if (first && first.status < 500) return first;
    // Too slow, or a server error: the cached shell if there is one, else keep waiting.
    return (await cachedShell(request)) || first || (await network);
  } catch (error) {
    const shell = await cachedShell(request);
    if (shell) return shell;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function cachedShell(request) {
  const cache = await caches.open(CACHE);
  for (const key of [request, ...SHELL_URLS.map(url => new URL(url, self.location).href)]) {
    const hit = await cache.match(key, MATCH_SHELL);
    if (hit) return hit;
  }
  return undefined;
}

async function cacheFirst(event) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(event.request, { ignoreVary: true });
  if (hit) return hit;
  const response = await fetch(event.request);
  if (cacheable(response)) keep(event, cache.put(event.request, response.clone()));
  return response;
}

async function networkFirst(event) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(event.request);
    if (cacheable(response)) keep(event, cache.put(event.request, response.clone()));
    return response;
  } catch (error) {
    const hit = await cache.match(event.request, { ignoreVary: true });
    if (hit) return hit;
    throw error;
  }
}

// Only complete, same-origin, non-opaque answers ("basic" responses) are worth keeping.
function cacheable(response) {
  return Boolean(response) && response.status === 200 && response.type === 'basic' && !response.redirected;
}

// Lets a cache write finish after the response has gone to the page.
function keep(event, promise) {
  const settled = promise.catch(() => {});
  try { event.waitUntil(settled); } catch { /* the event already ended; the write usually still completes */ }
}
