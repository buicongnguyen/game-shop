import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The kitchen effects layer (src/fx.js + src/fx.css) in a real browser. src/app.js is stubbed out and the service
// screen is rebuilt here from the same art generators and style.css, so these checks do not depend on the game's
// state or on work in progress elsewhere in the app.
//   node tests/fx-browser.mjs           starts its own server on a free port (or reuses FX_URL / PARITY_URL)
//   FX_SHOTS=<dir>                      where screenshots go (default test-results/fx)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = process.env.FX_SHOTS || path.join(root, 'test-results', 'fx');
await mkdir(shots, { recursive: true });
const results = [], errors = [], notes = [];
let server = null, url = process.env.FX_URL || process.env.PARITY_URL;
if (!url) {
  const probe = net.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  server = spawn(process.execPath, ['server.mjs'], { cwd: root, stdio: 'pipe', env: { ...process.env, PORT: String(port) } });
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('The test server did not start.')), 30000); server.stdout.once('data', () => { clearTimeout(timer); resolve(); }); server.once('exit', code => reject(Error(`The test server exited ${code}`))); });
  url = `http://127.0.0.1:${port}`;
}
const browser = await chromium.launch({ headless: true });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

try {
  await scenario('layer-contract-pools-and-taps', { width: 390, height: 844 }, async page => {
    const layer = await page.evaluate(() => {
      const all = document.querySelectorAll('#fx-layer'), node = all[0], style = getComputedStyle(node);
      return { count: all.length, inBody: node.parentElement === document.body, inApp: !!node.closest('#app'), position: style.position, events: style.pointerEvents, z: style.zIndex, contain: style.contain, overflow: style.overflow, aria: node.getAttribute('aria-hidden'), box: [node.offsetWidth, node.offsetHeight], children: node.children.length };
    });
    assert.equal(layer.count, 1, 'one #fx-layer');
    assert.ok(layer.inBody && !layer.inApp, 'the layer lives on <body>, outside #app');
    assert.deepEqual([layer.position, layer.events, layer.z, layer.contain, layer.overflow, layer.aria], ['fixed', 'none', '90', 'strict', 'hidden', 'true']);
    assert.deepEqual(layer.box, [390, 844], 'the layer covers the viewport');
    assert.equal(layer.children, 32 + 6 + 4 + 4 + 4 + 2, 'pools: 32 particles, 6 sprites, 4 ghosts with 4 speech bubbles, 4 floats, 2 captions');
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#fx-layer > *')].filter(node => !node.hidden).length), 0, 'idle pooled nodes are hidden');
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#fx-layer *')].filter(node => getComputedStyle(node).willChange !== 'auto').length), 0, 'no will-change on pooled nodes');

    // Effects over the kitchen controls, then probe the controls underneath while they fly: every probe point must
    // hit exactly what it hit before the effects started.
    const flying = await page.evaluate(async () => {
      const fx = window.__fx, $ = selector => document.querySelector(selector), box = selector => $(selector).getBoundingClientRect();
      const probes = [];
      for (const selector of ['[data-action="pot"]', '.customer', '[data-action="serve"]', '[data-action="chili"]', '#take-bowl', '.broth-button', '.topping-button', '.tool', '.tea-button']) {
        for (const node of document.querySelectorAll(selector)) {
          const r = node.getBoundingClientRect(); if (!r.width || r.bottom < 0 || r.top > innerHeight) continue;
          for (const [fx_, fy] of [[.5, .5], [.25, .3], [.75, .72]]) { const x = r.left + r.width * fx_, y = r.top + r.height * fy, hit = document.elementFromPoint(x, y); if (node.contains(hit)) probes.push({ selector, x, y, node }); }
        }
      }
      const spawned = {
        burst: fx.burst(box('[data-action="pot"]'), { kind: 'spark', count: 6 }),
        puff: fx.burst(box('[data-action="pot"][data-index="1"]'), { kind: 'puff', count: 4 }),
        arc: fx.arc('bowl', box('.assembled-bowl'), box('.customer'), { duration: 900 }),
        scoop: fx.scoop(box('.pot-button .pot-icon'), box('.assembled-bowl'), '#e4572e', { cooked: true }),
        pour: fx.pour(box('.broth-button'), box('.assembled-bowl'), '#e4572e'),
        drop: fx.drop('./assets/ingredients/egg.svg', box('.topping-button .food-icon img'), box('.assembled-bowl')),
        hearts: fx.hearts(box('.customer')),
        float: fx.float(box('[data-action="serve"]'), '+12,5k'),
        caption: fx.caption('Mở cửa!'),
        ghost: fx.ghost($('.customer:nth-child(2)'), 'served', { hearts: true, line: 'Ngon quá!' }),
        toss: fx.toss(box('.assembled-bowl')),
        tea: fx.arc('tea', box('.tea-button'), box('.customer:nth-child(3)'), { height: 40, size: 28, duration: 480 }),
      };
      await new Promise(resolve => setTimeout(resolve, 160));
      const hits = probes.map(({ selector, x, y, node }) => { const hit = document.elementFromPoint(x, y); return { selector, ok: node.contains(hit), layer: !!hit?.closest('#fx-layer') }; });
      const shown = [...document.querySelectorAll('#fx-layer *')].filter(node => node.checkVisibility?.() ?? !node.closest('[hidden]'));
      const contract = [...document.querySelectorAll('#fx-layer *')].filter(node => getComputedStyle(node).pointerEvents !== 'none' || node.hasAttribute('tabindex') || node.matches('a,button,input,select,textarea,[contenteditable]') || ['data-action', 'data-id', 'data-stock', 'data-index'].some(name => node.hasAttribute(name)) || [...node.classList].some(name => !name.startsWith('fx-'))).map(node => node.outerHTML.slice(0, 90));
      return { spawned, hits, live: fx.live(), shown: shown.length, contract, layerAnimations: document.getAnimations().filter(anim => anim.effect?.target?.closest?.('#fx-layer')).length };
    });
    assert.ok(Object.values(flying.spawned).every(Boolean), `every effect spawned: ${JSON.stringify(flying.spawned)}`);
    assert.ok(flying.live >= 10, `effects are running (${flying.live})`);
    assert.ok(flying.shown > 20, 'effect nodes are on screen');
    assert.deepEqual(flying.contract, [], 'effect nodes: pointer-events none, not focusable, no data-* hooks, fx- classes only');
    assert.ok(flying.hits.length > 40 && flying.hits.every(hit => hit.ok && !hit.layer), `taps reach the controls under flying effects: ${JSON.stringify(flying.hits.filter(hit => !hit.ok))}`);
    await page.screenshot({ path: `${shots}/contract-mid-effects.png` });
    await page.waitForFunction(() => window.__fx.live() === 0, null, { timeout: 8000 });
    const after = await page.evaluate(() => ({ free: window.__fx.free(), shown: [...document.querySelectorAll('#fx-layer > *')].filter(node => !node.hidden).length, anims: document.getAnimations().filter(anim => anim.effect?.target?.closest?.('#fx-layer')).length }));
    assert.deepEqual(after, { free: { particles: 32, sprites: 6, ghosts: 4, bubbles: 4, floats: 4, captions: 2 }, shown: 0, anims: 0 }, 'every node is back in its pool and nothing is left animating');
    notes.push(`mid-effect: ${flying.live} effects, ${flying.layerAnimations} layer animations`);
  });

  await scenario('one-shots-sound-and-money', { width: 390, height: 844 }, async page => {
    const shots_ = await page.evaluate(async () => {
      const fx = window.__fx, $ = selector => document.querySelector(selector);
      const nodes = { pop: $('.top-rating'), squash: $('[data-action="discard"]'), shake: $('.customer .patience-ring'), quake: $('.worktop'), boing: $('#combo-count') };
      const ran = { pop: fx.pop(nodes.pop), squash: fx.squash(nodes.squash), shake: fx.shake(nodes.shake), quake: fx.quake(nodes.quake), boing: fx.boing(nodes.boing) };
      const during = Object.fromEntries(Object.entries(nodes).map(([key, node]) => [key, node.getAnimations().filter(anim => !(anim instanceof CSSAnimation)).length]));
      fx.shake(nodes.shake); // a second shake replaces the first instead of stacking
      const stacked = nodes.shake.getAnimations().filter(anim => !(anim instanceof CSSAnimation) && anim.playState !== 'idle').length;
      await new Promise(resolve => setTimeout(resolve, 700));
      const left = Object.fromEntries(Object.entries(nodes).map(([key, node]) => [key, { inline: node.style.transform, scripted: node.getAnimations().filter(anim => !(anim instanceof CSSAnimation)).length }]));
      // The chili bottle loops in CSS (an <svg>: transform only), so its squeeze swaps the sway for the CSS squeeze
      // instead of stacking a second transform animation on it; a quick second squeeze alternates the class.
      const bottle = $('.chili-bottle'), names = () => bottle.getAnimations().filter(anim => anim.playState === 'running').map(anim => anim.animationName || 'script');
      const swaying = names();
      fx.squash(bottle, { x: 1.14, y: .82, duration: 350 });
      const squeezing = [names(), bottle.getAttribute('class')];
      fx.squash(bottle);
      const again = [names(), bottle.getAttribute('class')];
      await new Promise(resolve => setTimeout(resolve, 520));
      const back = [names(), bottle.getAttribute('class')];
      return { ran, during, stacked, left, live: fx.live(), bottle: { swaying, squeezing, again, back } };
    });
    assert.deepEqual(shots_.bottle, { swaying: ['fx-sway'], squeezing: [['fx-squeeze'], 'chili-bottle fx-squeeze'], again: [['fx-squeeze-b'], 'chili-bottle fx-squeeze-b'], back: [['fx-sway'], 'chili-bottle'] }, 'the chili squeeze replaces the sway, restarts on a quick second tap, and the sway returns');
    assert.ok(Object.values(shots_.ran).every(Boolean), 'every one-shot ran');
    assert.ok(Object.values(shots_.during).every(count => count === 1), 'one animation per one-shot');
    assert.equal(shots_.stacked, 1, 'a repeated shake replaces the running one');
    for (const [key, value] of Object.entries(shots_.left)) assert.deepEqual(value, { inline: '', scripted: 0 }, `${key} leaves no inline transform or animation behind`);
    assert.equal(shots_.live, 0);

    // Sounds: none unless asked; one per effect, at the moment it belongs to.
    const sound = await page.evaluate(async () => {
      const fx = window.__fx, $ = selector => document.querySelector(selector), box = selector => $(selector).getBoundingClientRect();
      window.__cues.length = 0;
      fx.burst(box('[data-action="pot"]'), { kind: 'spark' }); fx.hearts(box('.customer')); fx.pour(box('.broth-button'), box('.assembled-bowl'), '#e4572e');
      const silent = window.__cues.length;
      fx.burst(box('[data-action="pot"]'), { kind: 'spark', count: 12, cue: 'pop' });
      const atOnce = window.__cues.map(([cue]) => cue).join();
      fx.scoop(box('.pot-button .pot-icon'), box('.assembled-bowl'), '#e4572e', { cue: 'splash' });
      const beforeLanding = window.__cues.filter(([cue]) => cue === 'splash').length;
      await new Promise(resolve => setTimeout(resolve, 900));
      const afterLanding = window.__cues.filter(([cue]) => cue === 'splash').length;
      window.__low = true; fx.drop('nest', box('.topping-button'), box('.assembled-bowl'), { cue: 'plop' }); window.__low = false;
      await new Promise(resolve => setTimeout(resolve, 900));
      return { silent, atOnce, beforeLanding, afterLanding, all: window.__cues.map(([cue]) => cue) };
    });
    assert.equal(sound.silent, 0, 'effects are silent unless given a cue');
    assert.equal(sound.atOnce, 'pop', 'a burst of 12 plays its cue once');
    assert.equal(sound.beforeLanding, 0, 'the splash waits for the noodles to land');
    assert.equal(sound.afterLanding, 1, 'and plays exactly once');
    assert.deepEqual(sound.all, ['pop', 'splash', 'plop'], 'with motion off the cue still plays, once');

    // Money tween: at most 12 writes, replaced by a newer tween, ending exactly on the formatted value; flash class.
    const money = await page.evaluate(async () => {
      const fx = window.__fx, node = document.querySelector('[data-value="money"]'), wallet = document.querySelector('.wallet');
      const format = value => `${(value / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}k`;
      const writes = []; const watch = new MutationObserver(() => writes.push(node.textContent)); watch.observe(node, { childList: true, characterData: true, subtree: true });
      fx.countTo(node, 116500, 151500, format, { flag: wallet });
      const up = wallet.classList.contains('fx-up'), counting = fx.counting(node);
      await new Promise(resolve => setTimeout(resolve, 1000));
      const first = { text: node.textContent, writes: writes.length };
      fx.countTo(node, 151500, 140000, format, { flag: wallet });
      const down = wallet.classList.contains('fx-down') && !wallet.classList.contains('fx-up');
      await new Promise(resolve => setTimeout(resolve, 250));
      fx.countTo(node, 140000, 98000, format, { flag: wallet }); // same direction: the flash restarts
      await new Promise(resolve => setTimeout(resolve, 1000));
      watch.disconnect();
      return { up, counting, first, down, text: node.textContent, expected: [format(151500), format(98000)], cleared: !wallet.classList.contains('fx-up') && !wallet.classList.contains('fx-down'), live: fx.live() };
    });
    assert.ok(money.up && money.counting, 'counting up flags fx-up');
    assert.equal(money.first.text, money.expected[0], 'the first tween ends exactly on format(to)');
    assert.ok(money.first.writes >= 2 && money.first.writes <= 12, `at most 12 writes (${money.first.writes})`);
    assert.ok(money.down, 'a later tween downwards swaps the flash to fx-down');
    assert.equal(money.text, money.expected[1], 'the replacing tween ends exactly on format(to)');
    assert.ok(money.cleared, 'the flash class is removed after 0.7 s');
    assert.equal(money.live, 0);
  });

  await scenario('dialog-and-hidden-tab-pause', { width: 390, height: 844 }, async page => {
    await page.evaluate(() => {
      const fx = window.__fx, $ = selector => document.querySelector(selector), box = selector => $(selector).getBoundingClientRect();
      fx.arc('tea', box('.tea-button'), box('.customer'), { duration: 1400 });
      fx.hearts(box('.customer:nth-child(3)'));
      fx.caption('Đóng cửa', { tone: 'neutral', duration: 1800 });
      fx.shake($('.worktop'));
      $('#dialog').innerHTML = '<p style="padding:24px">Tiệm đang tạm nghỉ</p>';
      $('#dialog').showModal();
    });
    await wait(80);
    const paused = await page.evaluate(() => {
      const anims = document.getAnimations(), mine = anims.filter(anim => !(anim instanceof CSSAnimation) && !(anim instanceof CSSTransition));
      const css = anims.filter(anim => anim instanceof CSSAnimation && anim.effect?.target?.closest?.('.play'));
      return { live: window.__fx.live(), scripted: mine.map(anim => anim.playState), css: css.map(anim => anim.playState), cssCount: css.length, flagged: document.documentElement.classList.contains('fx-paused') };
    });
    assert.ok(paused.flagged, 'fx.js marks html.fx-paused while the dialog is open (fx.css pauses every CSS loop from it)');
    assert.ok(paused.scripted.length >= 8 && paused.scripted.every(state => state === 'paused'), `WAAPI effects pause behind the dialog: ${paused.scripted}`);
    assert.ok(paused.cssCount >= 8 && paused.css.every(state => state === 'paused'), `CSS loops under .play pause too (${paused.cssCount})`);
    await page.screenshot({ path: `${shots}/dialog-paused.png` });
    await wait(1600);
    assert.equal(await page.evaluate(() => window.__fx.live()), paused.live, 'paused effects do not finish behind the dialog');
    await page.evaluate(() => document.querySelector('#dialog').close());
    await wait(80);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('fx-paused')), false, 'and clears it when the dialog closes');
    const resumed = await page.evaluate(() => ({ scripted: document.getAnimations().filter(anim => !(anim instanceof CSSAnimation) && !(anim instanceof CSSTransition)).map(anim => anim.playState), css: document.getAnimations().filter(anim => anim instanceof CSSAnimation && anim.effect?.target?.closest?.('.play')).map(anim => anim.playState) }));
    assert.ok(resumed.scripted.every(state => state === 'running' || state === 'finished') && resumed.css.every(state => state === 'running' || state === 'finished'), 'closing the dialog resumes everything');
    await page.waitForFunction(() => window.__fx.live() === 0, null, { timeout: 8000 });

    // A hidden tab pauses too (document.hidden + visibilitychange).
    const hidden = await page.evaluate(async () => {
      const fx = window.__fx, box = selector => document.querySelector(selector).getBoundingClientRect();
      fx.hearts(box('.customer'));
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      const states = document.getAnimations().filter(anim => anim.effect?.target?.closest?.('#fx-layer')).map(anim => anim.playState);
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
      const back = document.getAnimations().filter(anim => anim.effect?.target?.closest?.('#fx-layer')).map(anim => anim.playState);
      return { states, back };
    });
    assert.ok(hidden.states.length && hidden.states.every(state => state === 'paused'), 'a hidden tab pauses effects');
    assert.ok(hidden.back.every(state => state === 'running'), 'and they resume when it is visible again');

    // pause()/resume() by hand, and a tween caught by a pause jumps to its final value.
    const manual = await page.evaluate(async () => {
      const fx = window.__fx, node = document.querySelector('[data-value="money"]');
      fx.countTo(node, 1000, 9000, value => `${value}đ`);
      fx.pause();
      const text = node.textContent, states = document.getAnimations().filter(anim => anim.effect?.target?.closest?.('#fx-layer')).map(anim => anim.playState);
      fx.resume();
      return { text, states, counting: fx.counting(node) };
    });
    assert.equal(manual.text, '9000đ', 'a pause finishes the money tween at once');
    assert.ok(manual.states.every(state => state === 'paused') && !manual.counting);
  });

  await scenario('motion-off-spawns-nothing', { width: 390, height: 844 }, async page => {
    const off = await page.evaluate(async () => {
      window.__low = true;
      const fx = window.__fx, $ = selector => document.querySelector(selector), box = selector => $(selector).getBoundingClientRect();
      window.__cues.length = 0;
      let landed = 0;
      const returned = [
        fx.burst(box('[data-action="pot"]')), fx.arc('bowl', box('.assembled-bowl'), box('.customer'), { onLand: () => landed++ }), fx.scoop(box('.pot-icon'), box('.assembled-bowl'), '#e4572e'),
        fx.pour(box('.broth-button'), box('.assembled-bowl'), '#e4572e'), fx.drop('nest', box('.topping-button'), box('.assembled-bowl')), fx.splash(box('.assembled-bowl'), '#e4572e'),
        fx.ripple(box('.assembled-bowl'), '#e4572e'), fx.float(box('.wallet'), '+1'), fx.hearts(box('.customer')), fx.ghost($('.customer'), 'angry'), fx.toss(box('.assembled-bowl')),
        fx.pop($('.top-rating')), fx.squash($('.chili-bottle')), fx.shake($('.worktop')), fx.quake($('.worktop')), fx.boing($('#combo-count')), fx.caption('Mở cửa!'),
      ];
      const node = $('[data-value="money"]'); fx.countTo(node, 1, 5, value => `${value}k`);
      await new Promise(resolve => setTimeout(resolve, 30));
      return { returned, landed, text: node.textContent, demo: fx.demo(), live: fx.live(), shown: [...document.querySelectorAll('#fx-layer > *')].filter(item => !item.hidden).length, layerAnims: document.getAnimations().filter(anim => anim.effect?.target?.closest?.('#fx-layer')).length, scripted: document.getAnimations().filter(anim => !(anim instanceof CSSAnimation) && !(anim instanceof CSSTransition)).length };
    });
    assert.ok(off.returned.every(value => value === false), 'every effect declines with motion off');
    assert.deepEqual([off.landed, off.text, off.demo, off.live, off.shown, off.layerAnims, off.scripted], [1, '5k', 0, 0, 0, 0, 0], 'nothing spawns; onLand still runs and the wallet shows the final value');

    // The in-game motion setting (html.reduced-motion) switches every fx.css loop off, and stops effects mid-flight.
    const css = await page.evaluate(async () => {
      window.__low = false;
      const fx = window.__fx, box = selector => document.querySelector(selector).getBoundingClientRect();
      const loopsOn = document.getAnimations().filter(anim => anim instanceof CSSAnimation).length;
      fx.hearts(box('.customer')); fx.arc('bowl', box('.assembled-bowl'), box('.customer'), { duration: 2000 });
      const before = fx.live();
      window.__low = true; document.documentElement.classList.add('reduced-motion');
      await new Promise(resolve => setTimeout(resolve, 50));
      return { loopsOn, before, after: fx.live(), loopsOff: document.getAnimations().filter(anim => anim instanceof CSSAnimation).length };
    });
    assert.ok(css.loopsOn >= 10 && css.before >= 2, 'loops run and effects fly with motion on');
    assert.deepEqual([css.after, css.loopsOff], [0, 0], 'turning motion off clears running effects and stops every loop');
  });

  await scenario('system-reduced-motion', { width: 390, height: 844 }, async page => {
    const loops = await page.evaluate(() => document.getAnimations().filter(anim => anim instanceof CSSAnimation).map(anim => anim.animationName));
    assert.deepEqual(loops, [], `prefers-reduced-motion: reduce leaves no CSS loop running (${loops})`);
    await page.screenshot({ path: `${shots}/reduced-motion-static.png` });
  }, { reducedMotion: 'reduce' });

  // The busy service screen: how many animations run at once, and screenshots to judge the look.
  await scenario('busy-screen-animation-budget', { width: 390, height: 844 }, async page => {
    const count = await page.evaluate(() => {
      const running = document.getAnimations().filter(anim => anim.playState === 'running'), by = {};
      for (const anim of running) { const name = anim.animationName || 'script'; by[name] = (by[name] || 0) + 1; }
      return { total: running.length, by };
    });
    notes.push(`busy 390x844 screen: ${count.total} CSS animations running (${Object.entries(count.by).map(([name, n]) => `${name} ${n}`).join(', ')})`);
    assert.ok(count.total <= 30, `a busy screen keeps the running animations small (${count.total})`);
    await page.screenshot({ path: `${shots}/busy-390.png` });
    const clip = async (selector, name, pad = 8) => { const b = await page.locator(selector).first().boundingBox(); if (b) await page.screenshot({ path: `${shots}/${name}.png`, clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad - 18), width: Math.min(390 - Math.max(0, b.x - pad), b.width + pad * 2), height: b.height + pad * 2 + 18 } }); };
    await clip('#pots', 'close-pots'); await clip('#customers', 'close-customers'); await clip('.bench', 'close-bench'); await clip('.serve-row', 'close-serve'); await clip('.street-counter', 'close-counter'); await clip('#puddle', 'close-puddle', 24);
    const busy = await page.evaluate(() => window.__fx.demo());
    assert.ok(busy >= 14, `fx.demo() shows its first wave (${busy})`);
    for (const t of [130, 330, 620]) { await wait(t === 130 ? 130 : t === 330 ? 200 : 290); await page.screenshot({ path: `${shots}/demo-${t}ms.png` }); }
    await wait(450); await page.screenshot({ path: `${shots}/demo-wave2.png` });
    await wait(600); await page.screenshot({ path: `${shots}/demo-wave3.png` });
    const peak = await page.evaluate(() => document.getAnimations().filter(anim => anim.playState === 'running').length);
    notes.push(`during fx.demo(): ${peak} animations at the third wave`);
    await page.waitForFunction(() => window.__fx.live() === 0, null, { timeout: 8000 });
  });

  // Layout: fx.css adds no in-flow size anywhere and effects never make the page scroll or block a tap.
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    await scenario(`layout-neutral-${viewport.width}x${viewport.height}`, viewport, async page => {
      const shift = await page.evaluate(() => {
        const still = document.createElement('style'); still.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}'; document.head.append(still);
        // #combo-count itself turns inline-block (so fx.boing can scale it); everything else must not move.
        const link = document.querySelector('link[href$="fx.css"]'), boxes = () => [...document.querySelectorAll('#app *:not(#combo-count)')].map(node => { const r = node.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
        const withFx = boxes(); link.disabled = true; const without = boxes(); link.disabled = false; still.remove();
        let worst = 0; withFx.forEach((box, i) => box.forEach((value, k) => { worst = Math.max(worst, Math.abs(value - without[i][k])); }));
        return { worst, count: withFx.length };
      });
      assert.ok(shift.count > 150 && shift.worst < .01, `fx.css moves nothing in #app (worst ${shift.worst}px over ${shift.count} boxes)`);
      const during = await page.evaluate(async () => {
        // Scroll sizes of the same screen with every animation stopped are the reference: loops and effects must not
        // change them (the stand-in screen may itself overflow a little on the smallest phones).
        const scroller = document.scrollingElement, still = document.createElement('style');
        const inner = [...document.querySelectorAll('#app *')].filter(node => /auto|scroll/.test(getComputedStyle(node).overflowX + getComputedStyle(node).overflowY));
        const panels = () => inner.map(node => node.scrollWidth - node.clientWidth + node.scrollLeft);
        still.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}'; document.head.append(still);
        const base = { w: scroller.scrollWidth, h: scroller.scrollHeight, panels: panels() };
        still.remove();
        const wide = () => panels().map((value, i) => value - base.panels[i]).filter(Boolean);
        const loops = [];
        for (let i = 0; i < 12; i++) { loops.push({ w: scroller.scrollWidth - base.w, h: scroller.scrollHeight - base.h, wide: wide() }); await new Promise(resolve => setTimeout(resolve, 60)); }
        const shown = window.__fx.demo();
        const checks = [];
        for (const delay of [140, 420, 900]) {
          await new Promise(resolve => setTimeout(resolve, delay === 140 ? 140 : delay === 420 ? 280 : 480));
          const blocked = [...document.querySelectorAll('#app button')].filter(node => { const r = node.getBoundingClientRect(); if (!r.width || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return false; const hit = document.elementFromPoint(Math.min(innerWidth - 1, r.left + r.width / 2), Math.min(innerHeight - 1, r.top + r.height / 2)); return hit?.closest('#fx-layer'); }).length;
          checks.push({ scrollW: scroller.scrollWidth - base.w, scrollH: scroller.scrollHeight - base.h, x: scrollX, y: scrollY, blocked, wide: wide() });
        }
        return { shown, checks, loops, overflow: { w: base.w - innerWidth, h: base.h - innerHeight } };
      });
      assert.ok(during.shown > 0, 'the demo runs');
      for (const loop of during.loops) assert.deepEqual(loop, { w: 0, h: 0, wide: [] }, 'the CSS loops never make the page or a panel scroll');
      for (const check of during.checks) assert.deepEqual(check, { scrollW: 0, scrollH: 0, x: 0, y: 0, blocked: 0, wide: [] }, 'effects add no scroll size, never scroll the page or a panel and never block a control');
      if (during.overflow.w > 0 || during.overflow.h > 0) notes.push(`${viewport.width}x${viewport.height}: the stand-in service screen itself overflows by ${JSON.stringify(during.overflow)} (not caused by fx)`);
      if (viewport.width === 1280) await page.screenshot({ path: `${shots}/demo-1280.png` });
    }, { touch: viewport.width < 900, extras: viewport.height >= 800 });
  }
  assert.deepEqual(errors, [], 'no console errors');
} finally {
  await browser.close();
  server?.kill();
  await writeFile(path.join(shots, 'results.json'), JSON.stringify({ results, errors, notes }, null, 2));
}
for (const note of notes) console.log(`note: ${note}`);
const failures = results.filter(result => !result.passed);
console.log(`fx browser checks: ${results.length - failures.length}/${results.length} passed.`);
if (failures.length || errors.length) process.exitCode = 1;

async function scenario(name, viewport, run, { touch = true, reducedMotion = 'no-preference', extras = true } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: touch, hasTouch: touch, reducedMotion });
  // The game itself stays out: these checks drive the effects layer directly.
  await context.route(/\/src\/app\.js(\?.*)?$/, route => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: '// stubbed by tests/fx-browser.mjs\n' }));
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${name}: ${message.text()}`); });
  try {
    await page.goto(url.endsWith('/') ? url : `${url}/`);
    await page.evaluate(buildServiceScreen, { extras });
    await run(page);
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, passed: false, error: error.stack });
    await page.screenshot({ path: `${shots}/failed-${name}.png` }).catch(() => {});
    console.error(`FAIL ${name}: ${error.message}`);
  } finally { await context.close(); }
}

// Runs in the page: fx.css after style.css, a busy service screen with the game's own markup and art (three boiling
// pots, four guests at different patience, a hot bowl ready to serve, a puddle), then the effects layer.
async function buildServiceScreen({ extras = true } = {}) {
  if (!document.querySelector('link[href$="fx.css"]')) {
    const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: './src/fx.css' });
    document.head.append(link);
    await new Promise((resolve, reject) => { link.onload = resolve; link.onerror = () => reject(Error('fx.css did not load')); });
  }
  const [{ noodlePot, bowlArt }, { customerFace }, { streetBackdrop }] = await Promise.all([import(new URL('./src/art/bowl.js', document.baseURI).href), import(new URL('./src/art/people.js', document.baseURI).href), import(new URL('./src/art/scene.js', document.baseURI).href)]);
  const uri = svg => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.includes('xmlns=') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'))}`;
  const picture = (svg, cls = '') => `<img${cls ? ` class="${cls}"` : ''} src="${uri(svg)}" alt="" decoding="async" draggable="false">`;
  const icon = id => `<img src="./assets/ingredients/${id}.svg" alt="" decoding="async">`;
  const guests = [[.9, 'young-woman', 'Chị Mai'], [.42, 'student', 'Em Tú'], [.15, 'uncle', 'Chú Ba'], [.7, 'auntie', 'Cô Lan']];
  const color = r => r > .5 ? '#8fc86f' : r > .25 ? '#f2c14e' : '#ef6a4f', mood = r => r > .5 ? 'neutral' : r > .2 ? 'worried' : 'angry';
  const customers = guests.map(([r, persona, name], i) => `<button class="customer${i === 0 ? ' selected' : ''}${r < .2 ? ' urgent' : ''}" data-action="order" data-id="o${i}" data-persona="${persona}" style="--fx-delay:${-i * 700}ms"${r > .3 && r <= .5 ? ' data-fx-sweat' : ''} aria-label="Đơn của ${name}" aria-pressed="${i === 0}"><span class="patience-ring" style="--patience:${r * 100}%;--ring-color:${color(r)}" data-mood="${mood(r)}">${picture(customerFace({ persona, seed: i + 7, mood: mood(r) }))}</span><strong>${name}</strong><small>Mì kim chi</small><span class="customer-status">${Math.ceil(r * 70)}s · 3 🌶</span><span class="customer-tags" aria-hidden="true">${i === 1 ? '⚡' : ''}</span><span class="speech" hidden></span></button>`).join('');
  const stages = ['raw', 'ideal', 'danger'], marks = { raw: 24, ideal: 64, danger: 95 };
  const pots = stages.map((stage, i) => `<button class="pot-button boiling stage-${stage}" data-action="pot" data-index="${i}" data-stage="${stage}" aria-label="Nồi ${i + 1}"><span class="pot-icon">${noodlePot({ idPrefix: `pot${i}-` })}<em class="pot-no" aria-hidden="true">${i + 1}</em></span><strong>Vớt · ${(5.2 - marks[stage] / 20).toFixed(1)}s</strong><small>${{ raw: 'Còn sống', ideal: 'Vừa chín', danger: 'Sắp cháy!' }[stage]}</small><span class="cook-gauge"><i></i><i></i><i></i><b style="left:${marks[stage]}%"></b></span></button>`).join('');
  const chili = '<svg class="chili-bottle" viewBox="0 0 40 56" aria-hidden="true"><path d="M17 3h6l2 9H15Z" fill="#fff3dc" stroke="#4a2a22" stroke-width="2" stroke-linejoin="round"/><rect x="13" y="11" width="14" height="6" rx="2" fill="#f7c242" stroke="#4a2a22" stroke-width="2"/><path d="M11 18h18c3 0 5 3 5 7v20c0 5-4 8-9 8H15c-5 0-9-3-9-8V25c0-4 2-7 5-7Z" fill="#e8402f" stroke="#4a2a22" stroke-width="2.4"/><rect x="10" y="28" width="20" height="14" rx="3" fill="#fff3dc" stroke="#4a2a22" stroke-width="1.6"/><path d="M14 38c4 2 9-1 10-6l2-2" fill="none" stroke="#b92b22" stroke-width="3.2" stroke-linecap="round"/></svg>';
  const broths = ['kimchi', 'mala', 'tomyum', 'cheese-broth'], toppings = ['beef', 'egg', 'sausage', 'tofu', 'mushroom', 'corn', 'fishball', 'seaweed', 'kimchi_topping', 'greens'];
  const tile = (kind, id, name) => `<button class="ingredient-button ${kind}-button" data-action="${kind}" data-id="${id}"><span class="food-icon">${icon(id)}</span><strong>${name}</strong><small data-stock="${id}">Còn 15</small></button>`;
  document.querySelector('#app').innerHTML = `<header class="topbar"><div class="top-left"><button class="icon-button" data-action="menu" aria-label="Menu">☰</button><span class="brand-small">🌶️ Tiệm Mì Cay</span><span class="day-label">Ngày 5</span><span class="top-clock" aria-label="Thời gian còn lại">⏱ <b id="day-clock">2:31</b></span></div><div class="top-right"><span class="top-rating">★ <b data-value="reputation">4.6</b></span><span class="wallet" title="116.500đ">🪙 <b data-value="money">116,5k</b></span><button class="icon-button" data-action="settings" aria-label="Cài đặt">⚙</button></div></header>` +
    `<main class="play"><section class="front" aria-label="Khách và phiếu gọi món"><div class="street"><div class="street-art" id="street-art" aria-hidden="true"><div class="street-layer in">${picture(streetBackdrop({ progress: .4, weather: 'clear' }))}</div></div><div class="street-title"><h1>Tiệm Mì Cay</h1></div><div class="customer-lane" id="customers">${customers}</div><div class="delivery-strip" id="deliveries">${extras ? '<button class="delivery-order" data-action="order" data-id="d1"><span class="delivery-summary">🛵 Anh Khoa · 52s </span><small>Phí app 20%</small></button>' : ''}</div><button class="puddle" id="puddle" data-action="mop"${extras ? '' : ' hidden'}>💧 Sàn trơn · lau 1/3</button><div class="street-counter"><span>Đã bán <b id="served-count">12</b> tô</span><span>Combo <b id="combo-count" class="fx-hot">4</b> 🔥</span><span id="day-revenue">412.000đ</span></div><div class="day-progress"><i id="day-progress-bar" style="width:40%"></i></div></div>` +
    `<div class="day-event">Ngày thường · Khách tới đều</div><div id="closing-notice" class="closing-notice"></div><div class="order-ticket"><div id="ticket"><div class="ticket-heading"><span>PHIẾU GỌI MÓN</span><strong>Chị Mai</strong></div><p class="order-line">“Cho chị tô <b class="say-broth">kim chi</b> thêm <b class="say-topping">bò</b>, cay <b class="say-spice">5</b> nha!”</p><div class="ticket-main"><span class="ticket-bowl" aria-hidden="true">${picture(bowlArt({ brothColor: '#e4572e', noodles: 'cooked', toppings: ['beef', 'egg'], spice: 5, idPrefix: 'ticket-' }))}</span><div><h2>Kim chi</h2><p>42.000đ</p></div><button class="tea-button" data-action="tea" data-id="o0">🍵 Mời trà <small>3k</small></button><span class="spice-stamp done">CẤP<strong>5</strong>🌶</span></div><div class="order-toppings"><span class="done">${icon('beef')} Bò</span><span class="done">${icon('egg')} Trứng</span></div><div class="ticket-patience"><span style="width:90%"></span></div><small class="patience-copy">Khách chờ thêm 63 giây</small></div></div>` +
    `<div class="service-actions"><button class="tool" data-action="rush"><span aria-hidden="true">🧺</span>Nhập gấp</button><button class="tool" data-action="stockout"><span aria-hidden="true">🚫</span>Hết món</button><button class="tool" data-action="goals"><span aria-hidden="true">🎯</span>Mục tiêu</button><button class="tool" data-action="help"><span aria-hidden="true">❔</span>Cách nấu</button><button class="tool" data-action="finish"><span aria-hidden="true">🏁</span>Chốt ngày</button></div></section>` +
    `<section class="station" aria-label="Bếp"><div class="kitchen-heading"><h2>Góc bếp nhỏ</h2></div><div class="station-title pots-title"><span>02</span>LUỘC & VỚT MÌ<small>Vớt ở vùng xanh · 50–78%</small><small id="noodle-stock">Kho mì 12</small></div><div class="cooking-row" id="pots" style="--pot-count:3">${pots}</div><div class="bench"><div class="worktop" id="bowl-display"><div class="assembled-bowl has-broth fx-hot" role="img" aria-label="Tô kim chi, có mì, bò, trứng, cay 5">${bowlArt({ brothColor: '#e4572e', noodles: 'cooked', toppings: ['beef', 'egg'], spice: 5, idPrefix: 'live-bowl-' })}<span class="bowl-spice">5 🌶</span></div><div class="bowl-meta"><strong>Kim chi</strong><span>Mì vừa chín ✓ · 2/4 topping</span><small>Cay 5 · đã dùng 21.000đ</small></div></div><button class="basket-button" data-action="basket" id="basket-button" hidden><span aria-hidden="true">🧺</span> <span class="basket-label">Lấy mì</span> (<b id="basket-count">0</b>)</button></div><div class="seasoning"><strong>🌶 Thêm ớt</strong><small>Mỗi lần +1 cấp · không thể giảm</small></div><div class="serve-row"><button class="discard" data-action="discard">Bỏ tô</button><button class="chili-button" data-action="chili" aria-label="Thêm ớt">${chili}<span class="chili-label">+1 ớt</span><b id="chili-level">5/5</b></button><button class="primary serve fx-ready" data-action="serve">Giao món <span>→</span></button></div></section>` +
    `<section class="pantry" aria-label="Nguyên liệu"><div class="station-title"><span>01</span>TÔ & NƯỚC DÙNG</div><div class="broth-row"><button class="ingredient-button new-bowl" id="take-bowl" data-action="bowl" disabled><span class="food-icon">${icon('bowls')}</span><strong>Lấy tô</strong><small data-stock="bowls">Còn 15</small></button>${broths.map(id => tile('broth', id, id)).join('')}</div><div class="station-title"><span>03</span>TOPPING</div><div class="topping-row">${toppings.map(id => tile('topping', id, id)).join('')}</div></section></main>`;
  await Promise.all([...document.images].map(img => img.decode().catch(() => {})));
  await document.fonts.ready;
  const { createFx } = await import(new URL('./src/fx.js', document.baseURI).href);
  window.__cues = []; window.__low = false;
  window.__fx = createFx({ lowMotion: () => window.__low === true, sound: (cue, options) => window.__cues.push([cue, options?.pitch ?? 0]) });
}
