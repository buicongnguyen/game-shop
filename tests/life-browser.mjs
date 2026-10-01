// The living street in a real browser: a fake .street box (the real backdrop picture, round customer cards and the
// app's own stylesheet) at phone and desktop sizes, a simulated dry day and rain day, every vignette, and the rules:
// no pointer events, nothing painted outside the box, budgets, motion off, pausing, clean teardown, no errors.
// Run: node tests/life-browser.mjs   (starts its own server; LIFE_SHOTS=<dir> chooses where screenshots go)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.resolve(process.env.LIFE_SHOTS || path.join(root, 'test-results', 'life'));
await mkdir(shots, { recursive: true });

// Viewport → the .street box the real layout gives it (measured), touch or mouse.
const SIZES = [
  { name: '390x844', viewport: { width: 390, height: 844 }, W: 370, H: 120, touch: true, scale: 2 },
  { name: '844x390', viewport: { width: 844, height: 390 }, W: 370, H: 133, touch: true, scale: 2 },
  { name: '1366x768', viewport: { width: 1366, height: 768 }, W: 372, H: 334, touch: false, scale: 1 },
  { name: '1920x1080', viewport: { width: 1920, height: 1080 }, W: 392, H: 642, touch: false, scale: 1 },
];
const only = process.env.LIFE_ONLY ? SIZES.filter(s => process.env.LIFE_ONLY.split(',').includes(s.name)) : SIZES;
const LEFT = 10, TOP = 10;

const probe = net.createServer();
probe.listen(0, '127.0.0.1');
await once(probe, 'listening');
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const url = `http://127.0.0.1:${port}/`;
const server = spawn(process.execPath, ['server.mjs'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PORT: String(port) } });
const results = [], report = {};
let browser;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('The test server did not start in 30 s.')), 30000);
    server.stdout.once('data', () => { clearTimeout(timer); resolve(); });
    server.once('exit', code => reject(Error(`The test server exited (${code}).`)));
  });
  browser = await chromium.launch({ headless: true });
  for (const size of only) await scenario(size);
} finally {
  await browser?.close().catch(() => {});
  server.kill();
}
await writeFile(path.join(shots, 'report.json'), JSON.stringify({ results, report }, null, 2));
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} life browser checks passed. Screenshots: ${shots}`);
for (const r of failed) console.error(`FAIL ${r.name}: ${r.error}`);
process.exitCode = failed.length ? 1 : 0;

async function scenario(size) {
  const context = await browser.newContext({ viewport: size.viewport, isMobile: size.touch, hasTouch: size.touch, deviceScaleFactor: size.scale, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
  const stats = { maxAmbient: 0, maxRunning: 0, maxRunningTargets: 0, maxActors: 0, families: {}, cap: 0, budget: 0 };
  report[size.name] = stats;
  const check = async (name, run) => {
    try { await run(); results.push({ name: `${size.name} ${name}`, ok: true }); console.log(`PASS ${size.name} ${name}`); }
    catch (error) { results.push({ name: `${size.name} ${name}`, ok: false, error: error.stack }); console.error(`FAIL ${size.name} ${name}: ${error.message}`); await page.screenshot({ path: path.join(shots, `failed-${size.name}-${name.replace(/\W+/g, '-')}.png`) }).catch(() => {}); }
  };
  try {
    await page.goto(url);
    await page.evaluate(() => document.fonts?.ready);
    await installHarness(page, size);
    const shot = async name => page.screenshot({ path: path.join(shots, `${size.name}-${name}.png`), clip: { x: LEFT - 4, y: TOP - 4, width: size.W + 8, height: size.H + 8 } });

    await check('mounts above the backdrop and below the lane', async () => {
      const info = await page.evaluate(() => {
        const { street, life } = window.__h, rootEl = street.querySelector('.street-life'), cs = getComputedStyle(rootEl);
        return {
          after: rootEl.previousElementSibling?.id, aria: rootEl.getAttribute('aria-hidden'), z: cs.zIndex, overflow: cs.overflow, contain: cs.contain, pe: cs.pointerEvents,
          rootBox: rootEl.getBoundingClientRect().toJSON(), box: street.getBoundingClientRect().toJSON(), laneZ: getComputedStyle(street.querySelector('#customers')).zIndex,
          inArt: street.querySelector('#street-art .street-life, #street-art .life-actor') !== null, stats: life.stats(),
        };
      });
      assert.equal(info.after, 'street-art', 'inserted right after #street-art');
      assert.equal(info.aria, 'true');
      assert.equal(info.z, '0'); assert.equal(info.laneZ, '1');
      assert.equal(info.overflow, 'hidden'); assert.match(info.contain, /strict|size layout paint|paint/);
      assert.equal(info.pe, 'none');
      assert.equal(info.inArt, false, 'nothing is added to #street-art');
      for (const k of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(info.rootBox[k] - info.box[k]) < .5, `layer covers the box exactly (${k})`);
      stats.cap = info.stats.view.cap; stats.budget = info.stats.budget; stats.view = info.stats.view;
      assert.equal(info.stats.budget, size.touch ? .6 : 1, 'touch screens get the 0.6 budget');
    });

    for (const [label, ctx] of [['dry day', { day: 7, event: 'normal', pet: 'pet_cat' }], ['rain day', { day: 8, event: 'rain', rain: true, pet: 'pet_dog' }], ['weekend', { day: 13, event: 'weekend', weekend: true }], ['festival', { day: 14, event: 'festival' }], ['cold day', { day: 15, event: 'cold' }]]) {
      await check(`${label}: a simulated day keeps every rule`, async () => {
        const run = await page.evaluate(ctx => window.__h.runDay(ctx), { ...ctx, steps: 260, dt: .8, wait: 16 });
        stats.maxAmbient = Math.max(stats.maxAmbient, run.maxAmbient);
        stats.maxRunning = Math.max(stats.maxRunning, run.maxRunning);
        stats.maxRunningTargets = Math.max(stats.maxRunningTargets, run.maxTargets);
        stats.maxActors = Math.max(stats.maxActors, run.maxActors);
        if (run.overflow) (stats.overflow ||= {})[label] = run.overflow;
        stats.measureMsMax = Math.max(stats.measureMsMax || 0, run.measureMs || 0);
        if (await page.evaluate(() => window.__h.sprite)) assert.equal(run.fallbacks, 0, 'no placeholder sprites');
        for (const [f, n] of Object.entries(run.families)) stats.families[f] = (stats.families[f] || 0) + n;
        assert.deepEqual(run.problems, [], 'no rule broken');
        assert.ok(run.maxAmbient <= stats.cap, `ambient ${run.maxAmbient} ≤ cap ${stats.cap}`);
        if (size.touch) assert.ok(run.maxTargets <= 8, `animating nodes on a phone: ${run.maxTargets}`);
        if (ctx.rain) {
          for (const f of ['sparrow', 'flock', 'kite']) assert.ok(!run.families[f], `no ${f} in the rain`);
          assert.ok(!run.kinds.pedestrian, 'people carry umbrellas in the rain');
        }
        if (!ctx.weekend) assert.ok(!run.families.kite, 'kites only on weekends');
        assert.ok(Object.keys(run.families).length >= 3, `some life: ${JSON.stringify(run.families)}`);
      });
    }

    // Real-time moments for the eye: morning, sunset, night, rain.
    for (const [name, ctx, seconds] of [['morning', { day: 21, progress: .14, pet: 'pet_cat' }, 7], ['sunset', { day: 22, progress: .72, pet: 'pet_dog' }, 7], ['night', { day: 23, progress: .9, pet: 'pet_cat', closing: true }, 7], ['rain', { day: 24, progress: .4, rain: true, event: 'rain' }, 6], ['dusk-lamp', { day: 26, progress: .7775 }, 1.4], ['festival', { day: 25, progress: .5, event: 'festival', weekend: true }, 7]]) {
      await check(`${name} looks alive`, async () => {
        const live = await page.evaluate(({ ctx, seconds }) => window.__h.realtime(ctx, seconds), { ctx, seconds });
        stats.maxRunningTargets = Math.max(stats.maxRunningTargets, live.targets);
        (stats.moments ||= {})[name] = live;
        await shot(name);
        assert.ok(live.actors >= 1, `${name}: ${JSON.stringify(live)}`);
        if (size.touch) assert.ok(live.targets <= 8, `${name}: ${live.targets} animating nodes`);
      });
    }

    await check('nothing paints outside the street box', async () => {
      await page.evaluate(() => { window.__h.setBackdrop(.5, false); window.__h.life.demo(); });
      await page.waitForTimeout(400);
      const strips = await outsideStrips(page, size);
      await page.evaluate(() => window.__h.life.clear());
      await page.waitForTimeout(150);
      const empty = await outsideStrips(page, size);
      strips.forEach((buf, i) => assert.ok(buf.equals(empty[i]), `outside strip ${i} unchanged`));
    });

    await check('demo layout: pointer-events none, nothing focusable, prefixed classes only', async () => {
      await page.evaluate(() => { window.__h.setBackdrop(.5, false); window.__h.life.demo(); });
      await page.waitForTimeout(300);
      await shot('demo');
      const audit = await page.evaluate(() => {
        const rootEl = window.__h.street.querySelector('.street-life'), all = [rootEl, ...rootEl.querySelectorAll('*')], bad = [];
        for (const node of all) {
          if (getComputedStyle(node).pointerEvents !== 'none') bad.push(`pointer-events on ${node.className}`);
          if (node.tabIndex >= 0 || node.hasAttribute('tabindex')) bad.push(`focusable ${node.className}`);
          if ([...node.attributes].some(a => a.name.startsWith('data-'))) bad.push(`data attribute on ${node.className}`);
          for (const cls of node.classList) if (!cls.startsWith('life-') && cls !== 'street-life') bad.push(`class ${cls}`);
          const pos = getComputedStyle(node).position;
          if (node !== rootEl && !['absolute'].includes(pos) && node.tagName !== 'IMG') bad.push(`${pos} ${node.className}`);
          if (node.tagName === 'IMG' && (node.dataset.fallback || !node.src.startsWith('data:image/svg+xml'))) bad.push('image fell back');
        }
        const box = window.__h.street.getBoundingClientRect(), hits = [];
        for (let i = 0; i < 40; i++) {
          const x = box.left + box.width * ((i % 8) + .5) / 8, y = box.top + box.height * (Math.floor(i / 8) + .5) / 5, hit = document.elementFromPoint(x, y);
          if (hit && rootEl.contains(hit)) hits.push(hit.className);
        }
        return { bad, hits, actors: window.__h.life.actors().length, kinds: [...new Set(window.__h.life.actors().map(a => a.family))] };
      });
      assert.deepEqual(audit.bad, []);
      assert.deepEqual(audit.hits, [], 'taps go through the life layer');
      assert.ok(audit.actors >= 3, `demo shows ${audit.kinds}`);
    });

    await check('every vignette plays', async () => {
      const played = await page.evaluate(async () => {
        const h = window.__h, out = {};
        h.life.clear();
        window.__sounds = [];
        for (const kind of h.L.VIGNETTES) {
          const night = kind === 'shooting-star';
          h.setBackdrop(night ? .9 : .5, false);
          h.life.tick(.1, { day: 30, progress: night ? .9 : .5, pet: 'pet_cat' });
          h.life.vignette(kind, kind === 'flash' ? { count: 5 } : {});
          const mine = h.life.actors().filter(a => a.vignette === kind);
          out[kind] = mine.length;
          for (let i = 0; i < 32; i++) { await new Promise(r => setTimeout(r, 15)); h.life.tick(.1, { day: 30, progress: night ? .9 : .5, pet: 'pet_cat' }); }
          h.life.clear();
        }
        h.life.vignette('unicorn', {});
        out.unknown = h.life.actors().length;
        return { out, sounds: window.__sounds };
      });
      for (const kind of await page.evaluate(() => window.__h.L.VIGNETTES)) assert.ok(played.out[kind] >= 1 && played.out[kind] <= 2, `${kind}: ${played.out[kind]} actors`);
      assert.equal(played.out.unknown, 0);
      for (const cue of ['bell', 'flash', 'squeak', 'meow']) assert.ok(played.sounds.includes(cue), `sound ${cue}: ${played.sounds}`);
    });

    for (const [kind, ctx, wait] of [['bus', { progress: .55 }, 'stop'], ['rat-caught', { progress: .6, pet: 'pet_cat' }, 'pounce'], ['flash', { progress: .45 }, 520], ['shower', { progress: .35 }, 2200], ['child', { progress: .4 }, 'pause'], ['students', { progress: .3 }, 'middle'], ['power', { progress: .82 }, 1500], ['shooting-star', { progress: .92 }, 650]]) {
      await check(`vignette ${kind} on screen`, async () => {
        const ms = await page.evaluate(({ kind, ctx, wait }) => window.__h.stage(kind, ctx, wait), { kind, ctx, wait });
        await page.waitForTimeout(ms);
        const seen = await page.evaluate(kind => window.__h.life.actors().filter(a => a.vignette === kind).length, kind);
        await shot(`vignette-${kind}`);
        assert.ok(seen >= 1, `${kind} still on screen after ${ms} ms`);
      });
    }

    await check('motion off: nothing spawns and nothing animates', async () => {
      const res = await page.evaluate(async () => {
        const h = window.__h;
        h.life.demo();
        const before = h.running().length;
        window.__lowMotion = true;
        h.life.tick(.1, { day: 31, progress: .5 });
        h.life.vignette('rat', {});
        for (let i = 0; i < 20; i++) h.life.tick(.5, { day: 31, progress: .5 + i / 100 });
        await new Promise(r => setTimeout(r, 50));
        const off = { anims: h.animations().length, actors: h.life.actors().length, nodes: h.street.querySelectorAll('.life-actor').length };
        window.__lowMotion = false;
        document.documentElement.classList.add('reduced-motion');
        h.life.demo();
        h.life.tick(.1, { day: 31, progress: .55 });
        const cls = { anims: h.animations().length, actors: h.life.actors().length };
        document.documentElement.classList.remove('reduced-motion');
        return { before, off, cls };
      });
      assert.ok(res.before > 0, 'the demo animates');
      assert.deepEqual(res.off, { anims: 0, actors: 0, nodes: 0 });
      assert.deepEqual(res.cls, { anims: 0, actors: 0 });
    });

    await check('prefers-reduced-motion stops everything too', async () => {
      await page.evaluate(() => window.__h.life.demo());
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const res = await page.evaluate(async () => {
        const h = window.__h;
        h.life.tick(.1, { day: 35, progress: .5 });
        await new Promise(r => setTimeout(r, 50));
        return { anims: h.animations().length, actors: h.life.actors().length };
      });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      assert.deepEqual(res, { anims: 0, actors: 0 });
    });

    await check('the next tone is decoded ahead of the change', async () => {
      const calls = await page.evaluate(async () => {
        const h = window.__h, original = HTMLImageElement.prototype.decode;
        let count = 0;
        HTMLImageElement.prototype.decode = function () { count++; return original.call(this); };
        try {
          h.life.clear();
          h.life.demo();
          for (let i = 0; i < 4; i++) h.life.tick(.1, { day: 36, progress: .6 + i * .002 });
          await new Promise(r => setTimeout(r, 1800));
        } finally { HTMLImageElement.prototype.decode = original; }
        return count;
      });
      assert.ok(calls > 0, `decode() calls before dusk: ${calls}`);
    });

    await check('pause(), dialogs and hidden tabs pause everything; resume() plays on', async () => {
      const res = await page.evaluate(async () => {
        const h = window.__h, frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        h.life.demo();
        await frame();
        const states = () => h.animations().map(a => a.playState);
        h.life.pause(); await frame();
        const paused = states();
        h.life.resume(); await frame();
        const resumed = states();
        const dialog = document.querySelector('#dialog');
        dialog.innerHTML = '<p>Test</p>'; dialog.showModal(); await frame();
        const inDialog = states();
        const t0 = h.life.actors().map(a => a.x).join();
        h.life.tick(.1, { day: 32, progress: .5 }); // the app does not tick while a dialog is open; even if it did, nothing changes
        dialog.close(); await frame();
        const after = states();
        Object.defineProperty(document, 'hidden', { value: true, configurable: true });
        document.dispatchEvent(new Event('visibilitychange')); await frame();
        const hidden = states();
        delete document.hidden;
        document.dispatchEvent(new Event('visibilitychange')); await frame();
        const shown = states();
        return { paused, resumed, inDialog, after, hidden, shown, same: t0 === h.life.actors().map(a => a.x).join() };
      });
      assert.ok(res.paused.length > 0);
      assert.ok(res.paused.every(s => s === 'paused' || s === 'finished'), `paused: ${res.paused}`);
      assert.ok(res.resumed.some(s => s === 'running'));
      assert.ok(res.inDialog.every(s => s === 'paused' || s === 'finished'), `dialog: ${res.inDialog}`);
      assert.ok(res.after.some(s => s === 'running'));
      assert.ok(res.hidden.every(s => s === 'paused' || s === 'finished'), `hidden tab: ${res.hidden}`);
      assert.ok(res.shown.some(s => s === 'running'), 'plays on when the tab shows again');
      assert.ok(res.same, 'ticks are ignored while paused');
    });

    await check('the app rebuilding the street: tick() cleans up quietly', async () => {
      const res = await page.evaluate(() => {
        const h = window.__h;
        h.life.demo();
        const rootEl = h.street.querySelector('.street-life');
        const host = h.street.parentNode, clone = h.street.cloneNode(false);
        h.street.replaceWith(clone);
        h.life.tick(.1, { day: 33, progress: .5 });
        const gone = { rootConnected: rootEl.isConnected, orphans: document.getAnimations().filter(a => a.effect?.target && !a.effect.target.isConnected).length };
        clone.replaceWith(h.street);
        void host;
        return gone;
      });
      assert.equal(res.rootConnected, false);
      assert.equal(res.orphans, 0, 'no animations left on detached nodes');
    });

    await check('destroy() leaves nothing behind', async () => {
      const res = await page.evaluate(() => {
        const h = window.__h;
        h.mount();
        h.life.demo();
        h.life.destroy();
        h.life.tick(.1, { day: 34, progress: .5 });
        h.life.vignette('bus', {});
        return { layers: document.querySelectorAll('.street-life, .life-actor').length, anims: document.getAnimations().filter(a => a.effect?.target?.closest?.('.street-life') || (a.effect?.target && !a.effect.target.isConnected)).length, actors: h.life.actors().length };
      });
      assert.deepEqual(res, { layers: 0, anims: 0, actors: 0 });
    });

    await check('no console errors, real sprites only, cheap measuring', async () => {
      assert.deepEqual(errors, []);
      const st = await page.evaluate(() => { window.__h.mount(); window.__h.life.demo(); return { ...window.__h.life.stats(), real: window.__h.sprite }; });
      stats.measureMs = st.measureMs; stats.fallbacks = st.fallbacks;
      if (st.real) assert.equal(st.fallbacks, 0, 'every sprite comes from src/art/life.js (no placeholder blocks)');
    });
  } finally {
    await context.close();
  }
}

/** Four thin strips just outside the street box. */
async function outsideStrips(page, size) {
  const clips = [
    { x: LEFT - 6, y: TOP - 6, width: size.W + 12, height: 5 },
    { x: LEFT - 6, y: TOP + size.H + 1, width: size.W + 12, height: 5 },
    { x: LEFT - 6, y: TOP, width: 5, height: size.H },
    { x: LEFT + size.W + 1, y: TOP, width: 5, height: size.H },
  ];
  const out = [];
  for (const clip of clips) out.push(await page.screenshot({ clip, animations: 'allow' }));
  return out;
}

/** Builds the fake street and the page-side helpers (window.__h). */
async function installHarness(page, size) {
  await page.evaluate(async ({ W, H, LEFT, TOP }) => {
    const scene = await import('/src/art/scene.js');
    const people = await import('/src/art/people.js');
    const L = await import('/src/life.js');
    let sprite = null;
    try { sprite = (await import('/src/art/life.js')).lifeSprite; } catch {}
    await new Promise((resolve, reject) => { const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/src/life.css'; css.onload = resolve; css.onerror = reject; document.head.append(css); });
    document.querySelector('#app').style.display = 'none';
    const uri = svg => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.includes('xmlns=') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'))}`;
    const guests = [['Chị Lan', 'young-woman', 'Mì kim chi', '42s · 3 🌶', 80], ['Chú Tư', 'uncle', 'Mì bò', '25s · 5 🌶', 45], ['Em Vy', 'student', 'Mì hải sản', '12s · 1 🌶', 15]];
    const cards = guests.map(([name, persona, dish, status, pct], i) => `<button class="customer${i === 1 ? ' selected' : ''}"><span class="patience-ring" style="--patience:${pct}%;--ring-color:${pct > 50 ? '#8fc86f' : pct > 25 ? '#f2c14e' : '#ef6a4f'}"><img src="${uri(people.customerFace({ persona, seed: i + 4, mood: pct > 50 ? 'neutral' : pct > 20 ? 'worried' : 'angry' }))}" alt=""></span><strong>${name}</strong><small>${dish}</small><span class="customer-status">${status}</span><span class="customer-tags"></span><span class="speech" hidden></span></button>`).join('');
    const seat = W > 371 ? '<div class="empty-customer"><small>Bàn trống</small></div>' : '';
    const host = document.createElement('div');
    host.id = 'life-host';
    host.style.cssText = `position:fixed;left:${LEFT}px;top:${TOP}px`;
    host.innerHTML = `<div class="street" style="width:${W}px;height:${H}px"><div class="street-art" id="street-art" aria-hidden="true"><div class="street-layer in"><img alt=""></div></div><div class="street-title"><h1>Tiệm Mì Cay</h1></div><div class="customer-lane" id="customers">${cards}${seat}</div><div class="delivery-strip" id="deliveries"></div><button class="puddle" id="puddle" hidden></button><div class="street-counter"><span>Đã bán <b>12</b> tô</span><span>Combo <b>3</b> 🔥</span><span>245.000 ₫</span></div><div class="day-progress"><i style="width:40%"></i></div><div class="coach" id="coach" hidden><p></p></div></div>`;
    document.body.append(host);
    const street = host.firstElementChild, backdrop = street.querySelector('.street-layer img'), cache = new Map();
    const h = {
      L, street, sprite: !!sprite, life: null,
      setBackdrop(p, rain) {
        const step = Math.round(Math.min(1, p) * 12) / 12, key = `${step}|${!!rain}`;
        if (!cache.has(key)) cache.set(key, uri(scene.streetBackdrop({ progress: step, weather: rain ? 'rain' : 'clear' })));
        if (backdrop.dataset.key !== key) { backdrop.src = cache.get(key); backdrop.dataset.key = key; street.querySelector('#street-art').classList.toggle('rain', !!rain); }
      },
      mount() {
        h.life?.destroy();
        h.life = L.mountLife(street, { sprite: sprite || undefined, lowMotion: () => window.__lowMotion === true, sound: cue => (window.__sounds ||= []).push(cue) });
        return h.life;
      },
      animations: () => document.getAnimations().filter(a => a.effect?.target && street.querySelector('.street-life')?.contains(a.effect.target)),
      running: () => h.animations().filter(a => a.playState === 'running'),
      /** A whole day, fast: the director's clock runs ahead of real time; the rules are checked as it goes. */
      async runDay({ steps, dt, wait, ...ctx }) {
        h.life.clear();
        const out = { maxAmbient: 0, maxRunning: 0, maxTargets: 0, maxActors: 0, families: {}, kinds: {}, problems: [] }, seen = new Set();
        const cap = h.life.stats().view.cap, rootEl = street.querySelector('.street-life'), box = street.getBoundingClientRect();
        for (let i = 0; i <= steps; i++) {
          const progress = i / steps;
          h.setBackdrop(progress, ctx.rain);
          h.life.tick(dt, { ...ctx, progress, busy: .75 });
          const st = h.life.stats(), running = h.running(), targets = new Set(running.map(a => a.effect.target));
          out.measureMs = Math.max(out.measureMs || 0, st.measureMs); out.fallbacks = st.fallbacks;
          out.maxAmbient = Math.max(out.maxAmbient, st.ambient); out.maxActors = Math.max(out.maxActors, st.actors);
          out.maxRunning = Math.max(out.maxRunning, running.length); out.maxTargets = Math.max(out.maxTargets, targets.size);
          if (st.ambient > cap) out.problems.push(`ambient ${st.ambient} > ${cap} at ${progress.toFixed(2)}`);
          if (targets.size > 8 && !out.overflow) out.overflow = { progress: +progress.toFixed(3), targets: [...targets].map(t => `${t.closest('.life-actor')?.className}/${t.className}`), specs: h.life.specs().map(a => `${a.family}:${a.nodes}`), nodes: st.nodes };
          for (const a of h.life.specs()) {
            if (seen.has(a.id)) continue;
            seen.add(a.id);
            out.families[a.family] = (out.families[a.family] || 0) + 1;
            out.kinds[a.kind] = (out.kinds[a.kind] || 0) + 1;
          }
          if (i % 40 === 0) {
            const r = rootEl.getBoundingClientRect();
            if (Math.abs(r.left - box.left) > .5 || Math.abs(r.width - box.width) > .5 || Math.abs(r.height - box.height) > .5) out.problems.push('layer moved');
            for (const node of rootEl.querySelectorAll('*')) if (getComputedStyle(node).pointerEvents !== 'none') { out.problems.push(`pointer-events: ${node.className}`); break; }
          }
          await new Promise(r => setTimeout(r, wait));
        }
        return out;
      },
      /** Real-time ticks at one moment of the day, for screenshots. */
      async realtime(ctx, seconds) {
        h.life.clear();
        h.setBackdrop(ctx.progress, ctx.rain);
        let targets = 0;
        for (let i = 0; i < seconds * 10; i++) {
          h.life.tick(.1, { busy: .75, ...ctx, progress: ctx.progress + i * .1 / 210 });
          targets = Math.max(targets, new Set(h.running().map(a => a.effect.target)).size);
          await new Promise(r => setTimeout(r, 100));
        }
        return { actors: h.life.actors().length, targets, families: h.life.actors().map(a => `${a.family}@${Math.round(a.x)},${Math.round(a.y)}`) };
      },
      /** Starts a vignette and says how long to wait for its telling moment. */
      stage(kind, ctx, wait) {
        h.life.clear();
        const full = { day: 40, busy: .75, ...ctx };
        h.setBackdrop(full.progress, false);
        h.life.tick(.1, full);
        h.life.clear();
        h.life.vignette(kind, {});
        if (typeof wait === 'number') return wait;
        // The telling moment, read from the actor's own keyframes.
        const specs = h.life.specs().filter(x => x.vignette === kind), main = specs[0], path = main?.path;
        const holdAt = p => { for (let i = 0; i < p.kf.length - 1; i++) if (p.kf[i].x === p.kf[i + 1].x && p.kf[i].o > 0) return p.kf[i].o * p.dur; return p.dur / 2; };
        const secs = !main ? 1 : wait === 'stop' ? holdAt(path) + 1.2 : wait === 'pounce' ? (main.meta?.tc ?? 1) + .35 : wait === 'pause' ? holdAt(path) + 1.3 : main.dur * .5;
        return Math.round(secs * 1000);
      },
    };
    window.__h = h;
    h.setBackdrop(.3, false);
    h.mount();
  }, { W: size.W, H: size.H, LEFT, TOP });
}
