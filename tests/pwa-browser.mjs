// Installing and offline play in a real browser: the manifest and icons resolve under the base
// path, the service worker takes control and the game starts offline, a new version waits until
// the game applies it (then the page reloads once), no worker registers on plain http without
// ?sw, and nothing leaves the origin. Reads PARITY_URL like the other browser suites: the dev
// server (un-built worker) or the built site under /game-shop/ (tools/run-pages.mjs).
import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = (process.env.PARITY_URL || 'http://127.0.0.1:4175').replace(/\/?$/, '/');
const origin = new URL(base).origin;
const pwaModule = base + 'src/pwa.js';
const WAIT = 30000;
const results = [], errors = [], badResponses = [], externalRequests = [];

const worker = await fetch(base + 'sw.js').then(response => {
  assert.equal(response.status, 200, `Start the local server at ${base} before running this suite.`);
  return response.text();
});
const build = {
  id: worker.match(/const BUILD_ID = '([^']+)';/)?.[1],
  precache: JSON.parse(worker.match(/const PRECACHE_URLS = (\[.*?\]);/)?.[1] ?? '[]')
};
build.built = build.id !== 'dev';
console.log(`Service worker ${build.built ? `build ${build.id} with ${build.precache.length} precached URLs` : 'un-built (dev)'} at ${base}`);

const browser = await chromium.launch({ headless: true });
await mkdir('test-results', { recursive: true });
try {
  await scenario('manifest-and-icons-resolve-under-the-base-path', async ({ page }) => {
    await page.goto(base);
    await appReady(page);
    const found = await page.evaluate(async () => {
      const link = selector => document.querySelector(selector)?.getAttribute('href');
      const manifestUrl = new URL(link('link[rel="manifest"]'), document.baseURI).href;
      const response = await fetch(manifestUrl), manifest = await response.json();
      const picture = async url => { const answer = await fetch(url), bitmap = await createImageBitmap(await answer.blob()); return { url, status: answer.status, type: answer.headers.get('content-type'), size: `${bitmap.width}x${bitmap.height}` }; };
      return {
        manifestUrl, status: response.status, name: manifest.name,
        start: new URL(manifest.start_url, manifestUrl).href, scope: new URL(manifest.scope, manifestUrl).href,
        icons: await Promise.all(manifest.icons.map(async icon => ({ ...(await picture(new URL(icon.src, manifestUrl).href)), declared: icon.sizes }))),
        apple: await picture(new URL(link('link[rel="apple-touch-icon"]'), document.baseURI).href)
      };
    });
    assert.equal(found.manifestUrl, base + 'manifest.webmanifest');
    assert.equal(found.status, 200);
    assert.equal(found.name, 'Tiệm Mì Cay');
    assert.equal(found.start, base, 'start_url opens the game folder');
    assert.equal(found.scope, base, 'scope is the game folder');
    for (const icon of [...found.icons, found.apple]) {
      assert.ok(icon.url.startsWith(base + 'assets/icons/'), icon.url);
      assert.equal(icon.status, 200, icon.url);
      assert.equal(icon.type, 'image/png', icon.url);
    }
    assert.deepEqual(found.icons.map(icon => icon.size), found.icons.map(icon => icon.declared));
    assert.equal(found.apple.size, '180x180');
  });

  await scenario('no-worker-on-plain-http-without-the-sw-flag', async ({ page }) => {
    await page.goto(base);
    await appReady(page);
    await usePwa(page);
    await page.waitForTimeout(1500);
    const state = await page.evaluate(async () => ({
      registrations: (await navigator.serviceWorker.getRegistrations()).length,
      controlled: Boolean(navigator.serviceWorker.controller),
      registration: window.__pwa.registration(),
      updateReady: window.__pwa.updateReady()
    }));
    if (base.startsWith('http:')) assert.deepEqual(state, { registrations: 0, controlled: false, registration: null, updateReady: false });
  });

  await scenario('worker-takes-control-and-the-game-starts-offline', async ({ page, context, notes }) => {
    await page.goto(base + '?sw=1');
    await appReady(page);
    await usePwa(page);
    const registered = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return { scope: r.scope, script: r.active.scriptURL }; });
    assert.deepEqual(registered, { scope: base, script: base + 'sw.js' }, 'One worker for exactly the game folder');
    await page.reload();
    await appReady(page);
    assert.equal(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), true, 'After a reload the worker controls the page');
    await usePwa(page);
    assert.equal(await page.evaluate(() => window.__pwa.buildId()), build.id, 'The page talks to the worker of this build');
    const cacheName = `tiem-mi-cay-${build.id}`;
    // Built: the whole precache list is stored at install. Un-built: whatever this page loaded.
    if (!build.built) await page.waitForLoadState('networkidle');
    const needed = build.built
      ? build.precache.map(url => new URL(url, base).href)
      : await page.evaluate(scope => [location.href.split('?')[0], ...performance.getEntriesByType('resource').map(entry => entry.name)].filter(url => url.startsWith(scope)), base);
    await until(async () => {
      const cached = await page.evaluate(async name => (await caches.has(name)) ? (await (await caches.open(name)).keys()).map(request => request.url) : [], cacheName);
      return needed.every(url => cached.includes(url));
    }, 'the cache to hold everything the game needs');

    await context.setOffline(true);
    notes.failed.length = 0;
    notes.consoleErrors.length = 0;
    const response = await page.reload();
    await appReady(page);
    assert.equal(response?.fromServiceWorker(), true, 'Offline, the page itself comes from the worker');
    const probe = await page.evaluate(async () => { try { await fetch(`./src/app.js?offline-probe=${Date.now()}`); return 'reached the network'; } catch { return 'offline'; } });
    assert.equal(probe, 'offline', "The worker's own requests are offline too (otherwise this test would prove nothing)");
    if (build.built) {
      const ride = await page.evaluate(async url => Object.keys(await import(url)), base + 'src/ride.js');
      assert.ok(ride.includes('mountRide'), 'The lazily loaded ride module is precached');
    }
    await page.waitForTimeout(500);
    assert.deepEqual(notes.failed.filter(line => !line.includes('offline-probe')), [], 'No file failed to load offline');
    assert.deepEqual(notes.consoleErrors.filter(text => !text.includes('offline-probe')), [], 'No console errors offline');
    await context.setOffline(false);
  });

  await scenario('a-new-version-waits-for-the-game-then-reloads-once', async ({ page, context }) => {
    // Version 1 runs as ./sw.js?v=1. Browsers install a new version whenever the script URL or its
    // bytes change, and Playwright cannot intercept the byte check of registration.update(), so
    // the "next deploy" is ./sw.js itself, served with a new build id (and so a new cache name).
    await page.goto(base);
    await appReady(page);
    await page.evaluate(async () => { await navigator.serviceWorker.register('./sw.js?v=1', { scope: './', updateViaCache: 'none' }); await navigator.serviceWorker.ready; });
    await page.reload();
    await appReady(page);
    await usePwa(page);
    const before = await page.evaluate(() => window.__pwa.buildId()), next = `${before}-next`;
    assert.equal(before, build.id, 'Version 1 controls the page');
    let served = 0;
    await context.route(url => url.href === base + 'sw.js', async route => {
      const answer = await route.fetch();
      served++;
      await route.fulfill({ response: answer, body: (await answer.text()).replace(/const BUILD_ID = '[^']*';/, `const BUILD_ID = '${next}';`) });
    });
    // src/pwa.js finds the new version (its own registration of ./sw.js) and announces it.
    await page.evaluate(async url => {
      const { initPwa } = await import(url);
      window.__announced = 0;
      window.__update = initPwa({ serviceWorker: navigator.serviceWorker, enableServiceWorker: true, onUpdateReady: () => window.__announced++ });
    }, pwaModule);
    await until(() => page.evaluate(() => window.__update.updateReady()), 'the update to be ready');
    assert.equal(served, 1, 'The new worker script was fetched once');
    await page.waitForTimeout(1000);
    const waiting = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      const ask = target => new Promise(resolve => { const channel = new MessageChannel(); channel.port1.onmessage = event => resolve(event.data.build); target.postMessage({ type: 'GET_VERSION' }, [channel.port2]); });
      return { state: r.waiting?.state ?? null, waitingBuild: r.waiting ? await ask(r.waiting) : null, serving: await window.__pwa.buildId(), announced: window.__announced };
    });
    assert.deepEqual(waiting, { state: 'installed', waitingBuild: next, serving: before, announced: 1 }, 'The new version waits; the old one keeps serving until the game applies it');

    let loads = 0;
    page.on('load', () => loads++);
    await Promise.all([page.waitForEvent('load', { timeout: WAIT }), page.evaluate(() => window.__update.applyUpdate()).catch(() => {})]);
    await appReady(page);
    await page.waitForTimeout(1500);
    assert.equal(loads, 1, 'Applying the update reloads the page exactly once');
    await usePwa(page);
    const after = await page.evaluate(async () => ({ script: navigator.serviceWorker.controller?.scriptURL, build: await window.__pwa.buildId(), caches: await caches.keys() }));
    assert.equal(after.script, base + 'sw.js');
    assert.equal(after.build, next, 'The new version now serves the page');
    assert.ok(!after.caches.includes(`tiem-mi-cay-${before}`), `The old cache is deleted (left: ${after.caches.join(', ')})`);
    if (build.built) {
      const cached = await page.evaluate(async name => (await (await caches.open(name)).keys()).length, `tiem-mi-cay-${next}`);
      assert.equal(cached, build.precache.length, 'The new version precached the whole app');
    }
  });

  await scenario('update-logic-with-a-stand-in-registration', async ({ page }) => {
    await page.goto(base);
    await appReady(page);
    const outcome = await page.evaluate(async url => {
      const { initPwa } = await import(url);
      const tick = () => new Promise(resolve => setTimeout(resolve, 0));
      class Worker extends EventTarget {
        constructor(state) { super(); this.state = state; this.messages = []; }
        postMessage(message) { this.messages.push(message); }
        become(state) { this.state = state; this.dispatchEvent(new Event('statechange')); }
      }
      const active = new Worker('activated');
      const registration = Object.assign(new EventTarget(), { active, waiting: null, installing: null, checks: 0, async update() { this.checks++; } });
      const container = Object.assign(new EventTarget(), { controller: active, async register() { return registration; } });
      let ready = 0, reloads = 0;
      const pwa = initPwa({ serviceWorker: container, reload: () => reloads++, enableServiceWorker: true, onUpdateReady: () => ready++ });
      await tick();
      const log = { before: pwa.updateReady() };
      document.dispatchEvent(new Event('visibilitychange'));
      await tick();
      log.checks = registration.checks;
      const next = new Worker('installing');
      registration.installing = next;
      registration.dispatchEvent(new Event('updatefound'));
      registration.installing = null;
      registration.waiting = next;
      next.become('installed');
      await tick();
      Object.assign(log, { ready, updateReady: pwa.updateReady(), reloadsBeforeApply: reloads });
      pwa.applyUpdate();
      Object.assign(log, { messages: next.messages, reloadsBeforeTakeover: reloads });
      container.controller = next;
      container.dispatchEvent(new Event('controllerchange'));
      container.dispatchEvent(new Event('controllerchange'));
      log.reloads = reloads;
      return log;
    }, pwaModule);
    assert.deepEqual(outcome, { before: false, checks: 1, ready: 1, updateReady: true, reloadsBeforeApply: 0, messages: [{ type: 'SKIP_WAITING' }], reloadsBeforeTakeover: 0, reloads: 1 });
  });

  await scenario('install-prompt-is-kept-and-used-once', async ({ page }) => {
    await page.goto(base);
    await appReady(page);
    const flow = await page.evaluate(async url => {
      const { initPwa } = await import(url);
      const changes = [], prompted = [];
      const pwa = initPwa({ onInstallChange: can => changes.push(can) });
      const offer = outcome => Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: async () => { prompted.push(outcome); }, userChoice: Promise.resolve({ outcome, platform: 'web' }) });
      const before = pwa.canInstall();
      const first = offer('accepted');
      window.dispatchEvent(first);
      const offered = { prevented: first.defaultPrevented, can: pwa.canInstall() };
      const accepted = await pwa.promptInstall(), afterwards = await pwa.promptInstall();
      window.dispatchEvent(offer('dismissed'));
      const dismissed = await pwa.promptInstall();
      window.dispatchEvent(offer('accepted'));
      window.dispatchEvent(new Event('appinstalled'));
      return { before, offered, accepted, afterwards, dismissed, prompted, installedForgetsPrompt: !pwa.canInstall(), changes, platform: pwa.platform(), standalone: pwa.isStandalone() };
    }, pwaModule);
    assert.deepEqual(flow, {
      before: false, offered: { prevented: true, can: true }, accepted: 'accepted', afterwards: 'unavailable', dismissed: 'dismissed',
      prompted: ['accepted', 'dismissed'], installedForgetsPrompt: true, changes: [true, false, true, false, true, false], platform: 'desktop', standalone: false
    });
  });

  await scenario('iphone-tip-follows-the-reference-rule', async ({ page }) => {
    // Chromium has the Fullscreen API and no navigator.standalone; make it look like iPhone Safari.
    await page.addInitScript(() => {
      Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false, configurable: true });
      Object.defineProperty(Document.prototype, 'webkitFullscreenEnabled', { get: () => false, configurable: true });
      Object.defineProperty(Navigator.prototype, 'standalone', { get: () => false, configurable: true });
    });
    await page.goto(base);
    await appReady(page);
    const seen = await page.evaluate(async url => {
      const pwa = await import(url);
      const top = { platform: pwa.platform(), fullscreen: pwa.hasFullscreen(), framed: pwa.isFramed(), tip: pwa.iosTipNeeded() };
      const frame = document.createElement('iframe');
      frame.srcdoc = '<p>frame</p>';
      await new Promise(resolve => { frame.onload = resolve; document.body.append(frame); });
      const inner = await frame.contentWindow.eval(`import(${JSON.stringify(url)})`);
      const framed = { framed: inner.isFramed(), tip: inner.iosTipNeeded() };
      frame.remove();
      return { top, framed };
    }, pwaModule);
    assert.deepEqual(seen, { top: { platform: 'ios', fullscreen: false, framed: false, tip: true }, framed: { framed: true, tip: false } });
  }, devices['iPhone 13']);
} finally {
  await browser.close();
  await writeFile('test-results/pwa-browser-results.json', JSON.stringify({ base, build: { id: build.id, built: build.built }, results, errors, badResponses, externalRequests }, null, 2));
}

results.push({ name: 'no-page-errors-no-4xx-no-external-requests', passed: !errors.length && !badResponses.length && !externalRequests.length, error: [...errors, ...badResponses, ...externalRequests].join('\n') });
const failures = results.filter(result => !result.passed);
console.log(`PWA browser checks: ${results.length - failures.length}/${results.length} passed.`);
for (const failure of failures) console.error(`${failure.name}: ${failure.error}`);
if (failures.length) process.exitCode = 1;

async function scenario(name, run, contextOptions = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...contextOptions });
  const page = await context.newPage();
  page.setDefaultTimeout(WAIT);
  const notes = { failed: [], consoleErrors: [] };
  context.on('request', request => { const url = request.url(); if (!url.startsWith(origin) && !/^(?:data|blob|about):/.test(url)) externalRequests.push(`${name}: ${url}`); });
  context.on('response', response => { if (response.status() >= 400) badResponses.push(`${name}: ${response.status()} ${response.url()}`); });
  page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') notes.consoleErrors.push(`${message.text()} @ ${message.location()?.url ?? ''}`); });
  page.on('requestfailed', request => notes.failed.push(`${request.resourceType()} ${request.url()} ${request.failure()?.errorText ?? ''}`));
  try {
    await run({ page, context, notes });
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, passed: false, error: error.stack });
    await page.screenshot({ path: `test-results/pwa-failed-${name}.png` }).catch(() => {});
    console.error(`FAIL ${name}: ${error.message}`);
  } finally {
    await context.close();
  }
}

// The game has drawn its first screen.
async function appReady(page) {
  await page.waitForFunction(() => { const app = document.querySelector('#app'); return Boolean(app && app.children.length && app.textContent.trim()); }, null, { timeout: WAIT });
}

// The page's shared pwa controller (the one the game made, or a new one) as window.__pwa.
async function usePwa(page) {
  await page.evaluate(async url => { const { initPwa } = await import(url); window.__pwa = initPwa(); }, pwaModule);
}

async function until(check, what, timeout = WAIT) {
  for (const end = Date.now() + timeout; ;) {
    if (await check()) return;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await new Promise(resolve => setTimeout(resolve, 150));
  }
}
