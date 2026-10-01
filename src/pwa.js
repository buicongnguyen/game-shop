// Home-screen install and offline play.
//
//   const pwa = initPwa({ onUpdateReady: () => showUpdateButtonOnPrepScreen() });
//
// Install: the browser's beforeinstallprompt event is kept (its mini-infobar suppressed) so the
// game can offer "Cài ngay" only when the browser supplied it; promptInstall() uses it once.
// Elsewhere the game shows manual steps for platform() (iPhone/iPad Safari: Share → Add to Home
// Screen; Android Chrome: ⋮ → Install app) and, on iPhones without the Fullscreen API, the tip
// from iosTipNeeded().
//
// Offline: after the load event, registers the worker at the site root (./sw.js from the page,
// scope ./, updateViaCache 'none' so the Pages HTTP cache never hides a new worker), checks for a
// new version whenever the page becomes visible, and never switches versions on its own. A new
// worker waits; onUpdateReady() tells the game, which shows a button at a safe moment (the prep
// screen); applyUpdate() then activates the new worker and reloads once when it takes control.
//
// Safe everywhere: without service workers (file://, old browsers, private modes) every call
// still answers, and nothing here throws at import time. On plain http the worker is only
// registered with ?sw in the address (local tests), unless enableServiceWorker says otherwise.

const SW_URL = './sw.js';
const UPDATE_CHECK_SPACING_MS = 10000;
const APPLY_FALLBACK_MS = 4000;

const install = { deferred: null, listeners: new Set() };
let shared = null;

// Listen from import time: the browser may offer the install prompt before initPwa() runs.
try {
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      install.deferred = event;
      notifyInstall();
    });
    window.addEventListener('appinstalled', () => {
      install.deferred = null;
      notifyInstall();
    });
  }
} catch { /* never throw at import time */ }

// A broken callback must not stop the others; its error still reaches the console.
function safely(fn, ...args) {
  try { fn(...args); } catch (error) { setTimeout(() => { throw error; }); }
}
function notifyInstall() {
  for (const fn of install.listeners) safely(fn, Boolean(install.deferred));
}
function nav() {
  return typeof navigator === 'undefined' ? null : navigator;
}
function userAgent() {
  return nav()?.userAgent || '';
}
function query(name) {
  try { return new URLSearchParams(location.search).has(name); } catch { return false; }
}
function https() {
  try { return location.protocol === 'https:'; } catch { return false; }
}
function media(text) {
  try { return typeof matchMedia === 'function' && matchMedia(text).matches; } catch { return false; }
}

export function platform() {
  const n = nav();
  if (!n) return 'desktop';
  // iPadOS reports itself as a Mac; touch points give it away.
  if (/iPhone|iPad|iPod/i.test(userAgent()) || (n.platform === 'MacIntel' && n.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(userAgent())) return 'android';
  return 'desktop';
}

export function isStandalone() {
  if (media('(display-mode: standalone)')) return true;
  // An element put into fullscreen by the game is not an installed app.
  let elementFullscreen = false;
  try { elementFullscreen = Boolean(document.fullscreenElement || document.webkitFullscreenElement); } catch {}
  if (media('(display-mode: fullscreen)') && !elementFullscreen) return true;
  return nav()?.standalone === true;
}

export function hasFullscreen() {
  try {
    const root = document.documentElement;
    return Boolean((document.fullscreenEnabled || document.webkitFullscreenEnabled) && (root.requestFullscreen || root.webkitRequestFullscreen));
  } catch { return false; }
}

export function isFramed() {
  try { return window.self !== window.top; } catch { return true; }
}

// The iPhone tip: no Fullscreen API, an iPhone or iPod, in Safari's browser view (not yet on the
// home screen), and not inside a frame.
export function iosTipNeeded() {
  return !hasFullscreen() && /iPhone|iPod/.test(userAgent()) && nav()?.standalone === false && !isFramed();
}

export function canInstall() {
  return Boolean(install.deferred);
}

export async function promptInstall() {
  const event = install.deferred;
  if (!event || typeof event.prompt !== 'function') return 'unavailable';
  install.deferred = null;
  try {
    await event.prompt();
  } catch (error) {
    // Without a user gesture the browser refuses; keep the event for a real tap.
    if (error && error.name === 'NotAllowedError') install.deferred = event;
    notifyInstall();
    return 'unavailable';
  }
  notifyInstall();
  let choice = null;
  try { choice = await event.userChoice; } catch {}
  return choice && choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
}

// initPwa() returns one shared controller; later calls add their callbacks to it. The
// serviceWorker and reload options are test hooks (a ServiceWorkerContainer stand-in and a
// replacement for location.reload); passing either builds a separate controller.
export function initPwa({ onUpdateReady, onInstallChange, enableServiceWorker, serviceWorker, reload } = {}) {
  const testing = serviceWorker !== undefined || reload !== undefined;
  if (shared && !testing) {
    shared._listen(onUpdateReady, onInstallChange);
    return shared;
  }
  let pwa;
  try {
    pwa = createPwa({ enableServiceWorker, container: serviceWorker, reload });
  } catch {
    pwa = createPwa({ enableServiceWorker: false });
  }
  pwa._listen(onUpdateReady, onInstallChange);
  if (!testing) shared = pwa;
  return pwa;
}

function createPwa({ enableServiceWorker, container, reload }) {
  const updateListeners = new Set();
  let sw = container;
  if (sw === undefined) { try { sw = nav()?.serviceWorker; } catch { sw = undefined; } }
  const enabled = Boolean(sw && typeof sw.register === 'function') && Boolean(enableServiceWorker ?? (https() || query('sw')));
  let registration = null, announced = null, takenOver = false, applying = false, reloaded = false, lastCheck = 0, checking = null;
  let hadController = Boolean(sw && sw.controller);

  const announce = () => { for (const fn of updateListeners) safely(fn); };
  let fallback = null;
  const reloadOnce = () => {
    clearTimeout(fallback);
    if (reloaded) return;
    reloaded = true;
    if (reload) reload(); else location.reload();
  };
  // A waiting worker is an update only when an older version is already running. The announced
  // worker also counts while it waits, in case its statechange arrived before registration.waiting.
  const waitingUpdate = () => {
    if (!registration || !(registration.active || (sw && sw.controller))) return null;
    if (registration.waiting) return registration.waiting;
    return announced && announced.state === 'installed' ? announced : null;
  };
  const noticeWaiting = (worker = registration && registration.waiting) => {
    if (!worker || worker === announced || worker.state !== 'installed') return;
    if (!(registration.active || (sw && sw.controller))) return;
    announced = worker;
    announce();
  };
  const watch = worker => {
    if (!worker || typeof worker.addEventListener !== 'function') return;
    worker.addEventListener('statechange', () => noticeWaiting(worker));
  };

  function track(reg) {
    if (!reg) return;
    registration = reg;
    watch(reg.installing);
    if (typeof reg.addEventListener === 'function') reg.addEventListener('updatefound', () => watch(reg.installing));
    noticeWaiting();
  }

  function checkForUpdate() {
    const now = Date.now();
    if (!registration || typeof registration.update !== 'function' || checking || now - lastCheck < UPDATE_CHECK_SPACING_MS) return checking || Promise.resolve();
    lastCheck = now;
    checking = Promise.resolve().then(() => registration.update()).then(() => noticeWaiting(), () => {}).finally(() => { checking = null; });
    return checking;
  }

  if (enabled) {
    try {
      sw.addEventListener('controllerchange', () => {
        const had = hadController;
        hadController = Boolean(sw.controller);
        if (applying) { reloadOnce(); return; }
        // The first claim is not an update; a later swap means another tab applied one, and this
        // page still runs the old code until it reloads.
        if (had) { takenOver = true; announce(); }
      });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
      const start = () => {
        Promise.resolve()
          .then(() => sw.register(SW_URL, { scope: './', updateViaCache: 'none' }))
          .then(track, error => console.warn('Tiệm Mì Cay: offline mode is unavailable.', error));
      };
      if (document.readyState === 'complete') start(); else window.addEventListener('load', start, { once: true });
    } catch (error) {
      console.warn('Tiệm Mì Cay: offline mode is unavailable.', error);
    }
  }

  return {
    canInstall,
    promptInstall,
    platform,
    isStandalone,
    hasFullscreen,
    isFramed,
    iosTipNeeded,
    updateReady: () => takenOver || Boolean(waitingUpdate()),
    applyUpdate() {
      if (applying) return;
      const waiting = waitingUpdate();
      if (waiting) {
        applying = true;
        waiting.postMessage({ type: 'SKIP_WAITING' });
        // controllerchange normally reloads first; this covers a worker that activated unseen.
        fallback = setTimeout(reloadOnce, APPLY_FALLBACK_MS);
      } else if (takenOver) {
        applying = true;
        reloadOnce();
      }
    },
    registration: () => registration,
    checkForUpdate,
    // The build id of the worker serving this page ('dev' un-built), or null without one.
    buildId(timeoutMs = 2000) {
      const controller = sw && sw.controller;
      if (!controller || typeof MessageChannel !== 'function') return Promise.resolve(null);
      return new Promise(resolve => {
        const channel = new MessageChannel(), timer = setTimeout(() => resolve(null), timeoutMs);
        channel.port1.onmessage = event => { clearTimeout(timer); resolve((event.data && event.data.build) || null); };
        try { controller.postMessage({ type: 'GET_VERSION' }, [channel.port2]); } catch { clearTimeout(timer); resolve(null); }
      });
    },
    _listen(onUpdate, onInstall) {
      if (typeof onUpdate === 'function') {
        updateListeners.add(onUpdate);
        // Already known: tell the new listener after initPwa() has returned.
        if (takenOver || waitingUpdate()) Promise.resolve().then(() => safely(onUpdate));
      }
      if (typeof onInstall === 'function') install.listeners.add(onInstall);
    }
  };
}
