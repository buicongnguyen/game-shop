import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TIMING, ART, KIND_NAMES, mulberry32, arcPoint, arcMotion, arcKeyframes, bulgeForApex, liftTo, windowed, countSteps, ghostPlan, createFx } from '../src/fx.js';

const css = readFileSync(new URL('../src/fx.css', import.meta.url), 'utf8');
// fx.js code only: comments may mention what the code avoids.
const source = readFileSync(new URL('../src/fx.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
// fx.css without comments and with url(...) payloads blanked, so braces and words inside art never count.
const plain = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\("[^"]*"\)/g, 'url()');

// A CSS cubic-bezier timing function, solved for x by bisection (good to ~1e-7).
function bezier(x1, y1, x2, y2) {
  const at = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  return x => { let lo = 0, hi = 1; for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (at(mid, x1, x2) < x) lo = mid; else hi = mid; } return at((lo + hi) / 2, y1, y2); };
}
const easing = text => bezier(...text.match(/cubic-bezier\(([^)]+)\)/)[1].split(',').map(Number));
const translateY = value => Number(value.match(/translateY\((-?[\d.]+)px\)/)[1]);
const translate = value => value.match(/translate\((-?[\d.]+)px,(-?[\d.]+)px\)/).slice(1).map(Number);

// Rules of a stylesheet: [{ selectors, body, media }], nested @media blocks flattened, @keyframes kept apart.
function rules(text) {
  const out = [], keyframes = {};
  const walk = (chunk, media) => {
    let i = 0;
    while (i < chunk.length) {
      const open = chunk.indexOf('{', i); if (open < 0) break;
      const head = chunk.slice(i, open).trim();
      let depth = 1, j = open + 1;
      for (; j < chunk.length && depth; j++) { if (chunk[j] === '{') depth++; else if (chunk[j] === '}') depth--; }
      const inner = chunk.slice(open + 1, j - 1);
      if (head.startsWith('@keyframes')) keyframes[head.split(/\s+/)[1]] = inner;
      else if (head.startsWith('@media')) walk(inner, head);
      else out.push({ selectors: splitSelectors(head), body: inner, media });
      i = j;
    }
  };
  walk(text, null);
  return { list: out, keyframes };
}
// Commas inside :is(...) or :not(...) do not separate selectors.
function splitSelectors(head) {
  const parts = []; let depth = 0, current = '';
  for (const ch of head) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && !depth) { parts.push(current.trim()); current = ''; } else current += ch; }
  return [...parts, current.trim()].filter(Boolean);
}
const { list, keyframes } = rules(plain);

test('TIMING keeps the reference numbers', () => {
  assert.deepEqual({ ...TIMING.scoop }, { drips: 136, land: 512, splash: 640, total: 800 });
  assert.deepEqual({ ...TIMING.drop }, { duration: 500, apex: 46 });
  assert.equal(TIMING.pour.drops, 7);
  assert.equal(TIMING.hearts.count, 5);
  assert.equal(TIMING.hearts.span, (TIMING.hearts.count - 1) * TIMING.hearts.gap + TIMING.hearts.each, 'five staggered hearts span 1.3 s');
  assert.equal(TIMING.hearts.span, 1300);
  assert.deepEqual([TIMING.arc, TIMING.arcHeight], [520, 70]);
  assert.deepEqual([TIMING.pop, TIMING.squash, TIMING.shake, TIMING.quake, TIMING.boing], [200, 150, 300, 400, 280]);
  assert.deepEqual([TIMING.count, TIMING.flash, TIMING.countSteps, TIMING.squeeze], [700, 700, 12, 350]);
  assert.ok(Object.isFrozen(TIMING) && Object.isFrozen(TIMING.scoop));
});

test('mulberry32 is a deterministic PRNG in [0, 1) and fx.js never uses Math.random', () => {
  const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
  const run = Array.from({ length: 1000 }, () => a());
  assert.deepEqual(run.slice(0, 20), Array.from({ length: 20 }, () => b()));
  assert.notDeepEqual(run.slice(0, 5), Array.from({ length: 5 }, () => c()));
  assert.ok(run.every(value => value >= 0 && value < 1));
  const mean = run.reduce((sum, value) => sum + value, 0) / run.length;
  assert.ok(Math.abs(mean - .5) < .05, `roughly uniform (${mean})`);
  assert.doesNotMatch(source, /Math\.random/, 'cosmetic jitter must not draw from the game\'s random stream');
});

test('arcPoint, arcKeyframes: a throw starts and ends exactly, bulging by its height at the middle', () => {
  const from = { x: 10, y: 300 }, to = { x: 250, y: 120 };
  assert.deepEqual(arcPoint(from, to, 70, 0), from);
  assert.deepEqual(arcPoint(from, to, 70, 1), to);
  const mid = arcPoint(from, to, 70, .5);
  assert.equal(mid.x, 130); assert.equal(mid.y, 210 - 70);
  const frames = arcKeyframes(from, to, 70, 12);
  assert.equal(frames.length, 13);
  assert.ok(frames.every((frame, i) => frame.offset === i / 12));
  assert.deepEqual(translate(frames[0].transform), [10, 300]);
  assert.deepEqual(translate(frames.at(-1).transform), [250, 120]);
  assert.deepEqual(translate(frames[6].transform), [130, 140]);
  assert.match(arcKeyframes(from, to, 10, 4, t => ` scale(${1 - t / 2})`).at(-1).transform, /scale\(0\.5\)$/);
});

test('arcMotion: the outer line plus the inner hop is exactly the parabola (no corners at the apex)', () => {
  const from = { x: 40, y: 600 }, to = { x: 300, y: 220 }, height = 70, { move, hop } = arcMotion(from, to, height);
  assert.deepEqual(translate(move[0].transform), [40, 600]);
  assert.deepEqual(translate(move[1].transform), [300, 220]);
  assert.equal(translateY(hop[1].transform), -70);
  const rise = easing(hop[0].easing), fall = easing(hop[1].easing);
  for (let t = 0; t <= 1.0001; t += .05) {
    const lineY = from.y + (to.y - from.y) * t;
    const hopY = t <= .5 ? -height * rise(t / .5) : -height * (1 - fall((t - .5) / .5));
    assert.ok(Math.abs(lineY + hopY - arcPoint(from, to, height, t).y) < .02, `t=${t.toFixed(2)}: within 0.02 px`);
  }
});

test('bulgeForApex puts the top of the throw the requested height above the landing point', () => {
  const peak = (dy, h) => { let low = 0; for (let t = 0; t <= 1; t += .0005) low = Math.min(low, dy * t - 4 * h * t * (1 - t)); return low; };
  for (const dy of [-260, -120, -20, 0, 30]) {
    const h = bulgeForApex(dy, 46);
    assert.ok(Math.abs(peak(dy, h) - (dy - 46)) < .05, `dy ${dy}: apex 46 px above the bowl`);
  }
  assert.equal(bulgeForApex(0, 46), 46, 'a level throw bulges by the apex');
  assert.equal(bulgeForApex(120, 46), 30, 'a start already above the apex just falls from it (dy/4)');
  // liftTo: the strainer leaves a pot 60 px above the bowl and still rises 34 px before falling into it.
  const pot = { x: 0, y: 400 }, bowl = { x: 120, y: 460 }, h = liftTo(pot, bowl, 58, 34);
  assert.ok(Math.abs(peak(60, h) - (60 - 94)) < .05, 'apex 34 px above the pot');
  assert.equal(liftTo({ x: 0, y: 700 }, { x: 0, y: 500 }, 46, 16), bulgeForApex(-200, 46), 'from below, the 46 px apex above the bowl rules');
});

test('windowed places a part in its slice of a shared clock and holds it invisibly outside', () => {
  const frames = [{ offset: 0, transform: 'translate(0px,0px)', opacity: 1, easing: 'ease-out' }, { offset: 1, transform: 'translate(9px,9px)', opacity: 0 }];
  const out = windowed(frames, 200, 300, 1000);
  assert.deepEqual(out.map(frame => frame.offset), [0, .2, .5, 1]);
  assert.deepEqual(out.map(frame => frame.opacity), [0, 1, 0, 0]);
  assert.deepEqual([out[0].easing, out[1].easing, out[2].easing, out[3].easing], ['step-end', 'ease-out', 'step-start', undefined]);
  assert.deepEqual([out[0].transform, out[3].transform], ['translate(0px,0px)', 'translate(9px,9px)']);
  const moving = windowed([{ transform: 'a' }, { transform: 'b' }, { transform: 'c' }], 0, 500, 1000, false);
  assert.deepEqual(moving, [{ transform: 'a', offset: 0 }, { transform: 'b', offset: .25 }, { transform: 'c', offset: .5 }, { transform: 'c', offset: 1 }], 'movers hold their last frame, visibly');
  assert.deepEqual(windowed(frames, 0, 1000, 1000), frames.map((frame, i) => ({ ...frame, offset: i })), 'a part filling the clock is unchanged');
  for (const [start, length] of [[0, 380], [240, 380], [900, 480], [640, 520]]) {
    const offsets = windowed(frames, start, length, 1160).map(frame => frame.offset);
    assert.ok(offsets.every((value, i) => value >= 0 && value <= 1 && (!i || value >= offsets[i - 1])), `offsets stay ordered in [0, 1]: ${offsets}`);
  }
});

test('countSteps: at most 12 values, easing out, ending exactly on the target', () => {
  const up = countSteps(116500, 151500);
  assert.ok(up.length <= 12 && up.length >= 2);
  assert.equal(up.at(-1), 151500);
  assert.ok(up.every((value, i) => !i || value > up[i - 1]), 'monotonic up');
  assert.ok(up[0] - 116500 > up.at(-1) - up.at(-2), 'eases out: big first step, small last step');
  const down = countSteps(98000, 40000, 5);
  assert.equal(down.length, 5); assert.equal(down.at(-1), 40000); assert.ok(down.every((value, i) => !i || value < down[i - 1]));
  assert.deepEqual(countSteps(5, 5), [5]);
  assert.deepEqual(countSteps(0, 3), [1, 2, 3], 'repeated values collapse');
  assert.deepEqual(countSteps(Number.NaN, 7), [7]);
  assert.equal(countSteps(0, 1e6, 99).length, 12, 'never more than 12 steps');
});

test('ghostPlan copies the reference departures', () => {
  const served = ghostPlan('served'), angry = ghostPlan('angry'), leave = ghostPlan('leave');
  assert.equal(served.duration, 850);
  const at = (plan, ms) => plan.frames.find(frame => Math.abs(frame.offset * plan.duration - ms) < .5);
  assert.equal(at(served, 110).y, -8, 'served: a hop of 8 px…');
  assert.equal(at(served, 220).y, 0, '…landing at 220 ms');
  assert.ok(at(served, 720).x > 40, '…then a sideways slide for 500 ms');
  assert.equal(served.heartsAt, 110);
  assert.equal(angry.duration, 700);
  const shake = angry.frames.filter(frame => frame.offset * angry.duration <= 300.5);
  assert.deepEqual(shake.map(frame => frame.x), [0, -5, 5, -5, 5, -2.5, 0], 'angry: ±5 px shake within 300 ms');
  assert.equal(angry.puffAt, 300);
  assert.ok(angry.frames.at(-1).y > 10, 'then it sinks');
  assert.equal(ghostPlan('anything').intent, 'leave');
  for (const plan of [served, angry, leave]) {
    const offsets = plan.frames.map(frame => frame.offset);
    assert.ok(offsets[0] === 0 && offsets.at(-1) === 1 && offsets.every((value, i) => !i || value >= offsets[i - 1]));
    assert.equal(plan.frames.at(-1).opacity, 0, `${plan.intent} fades out`);
  }
});

test('without a DOM, createFx returns the same API doing nothing visible', async () => {
  const fx = createFx();
  for (const name of ['burst', 'arc', 'scoop', 'pour', 'drop', 'splash', 'ripple', 'float', 'hearts', 'ghost', 'toss', 'pop', 'squash', 'shake', 'quake', 'boing', 'countTo', 'caption', 'pause', 'resume', 'clear', 'live', 'destroy', 'demo']) assert.equal(typeof fx[name], 'function', name);
  assert.equal(fx.burst({ left: 1, top: 1, width: 2, height: 2 }), false);
  assert.equal(fx.live(), 0);
  assert.equal(fx.demo(), 0);
  const node = { textContent: '1k' };
  fx.countTo(node, 1000, 5000, value => `${value / 1000}k`);
  assert.equal(node.textContent, '5k', 'the wallet still shows the final value');
  let landed = 0; fx.arc('bowl', {}, {}, { onLand: () => landed++ });
  await Promise.resolve();
  assert.equal(landed, 1, 'onLand still runs');
  assert.deepEqual(Object.keys(ART).sort(), ['bowl', 'face', 'nest', 'scoop', 'tea']);
  for (const uri of Object.values(ART)) { assert.match(uri, /^data:image\/svg\+xml/); assert.ok(uri.length < 4000, 'small sprite art'); assert.ok(decodeURIComponent(uri).includes('#4a2a22'), 'outlined in the house brown'); }
  assert.deepEqual([...KIND_NAMES].sort(), ['bubble', 'chili', 'drop', 'heart', 'puff', 'smoke', 'spark', 'star']);
});

test('fx.js keeps to the motion rules: no frame loop, no intervals', () => {
  assert.doesNotMatch(source, /setInterval\(/);
  const frames = source.match(/requestAnimationFrame\(/g) || [];
  assert.equal(frames.length, 2, 'only the double frame that restarts a flash class');
  assert.doesNotMatch(source, /willChange|will-change/);
  assert.doesNotMatch(source, /\.animate\([^)]*\b(?:left|top|width|height|margin|boxShadow)\b/);
});

test('fx.css: balanced braces and a layer that never takes taps', () => {
  assert.equal((plain.match(/{/g) || []).length, (plain.match(/}/g) || []).length);
  let depth = 0; for (const ch of plain) { depth += ch === '{' ? 1 : ch === '}' ? -1 : 0; assert.ok(depth >= 0); }
  const layer = list.find(rule => rule.selectors.includes('#fx-layer'));
  for (const declaration of ['position:fixed', 'inset:0', 'z-index:90', 'pointer-events:none', 'contain:strict', 'overflow:hidden']) assert.ok(layer.body.includes(declaration), declaration);
  // Every node class fx.js builds is named in a pointer-events:none rule.
  const built = [...new Set([...readFileSync(new URL('../src/fx.js', import.meta.url), 'utf8').matchAll(/(?:hiddenNode|make)\('\w+', '(fx-[\w-]+)'/g)].map(match => match[1]))];
  assert.ok(built.length >= 12);
  for (const name of built) assert.ok(list.some(rule => rule.selectors.includes(`.${name}`) && rule.body.includes('pointer-events:none')), `.${name} ignores taps`);
  for (const rule of list.filter(rule => /content:/.test(rule.body))) assert.ok(rule.body.includes('pointer-events:none'), `${rule.selectors[0]} decoration ignores taps`);
  assert.doesNotMatch(plain, /will-change/);
});

test('fx.css: every animation is guarded for reduced motion and every keyframes block is used', () => {
  const animated = list.filter(rule => /(^|;)\s*animation(-name)?\s*:/.test(rule.body));
  assert.ok(animated.length > 15);
  const used = new Set();
  for (const rule of animated) {
    assert.equal(rule.media, '@media (prefers-reduced-motion:no-preference)', `${rule.selectors[0]} sits in the no-preference block`);
    for (const selector of rule.selectors) assert.ok(selector.startsWith(':root:not(.reduced-motion) '), `${selector} honours the in-game motion setting`);
    for (const [, value] of rule.body.matchAll(/animation(?:-name)?\s*:\s*([^;]+)/g)) for (const name of value.match(/(?<![\w-])fx-[\w-]+/g) || []) used.add(name);
  }
  assert.ok(used.size >= 20);
  for (const name of used) assert.ok(keyframes[name], `@keyframes ${name} exists`);
  for (const name of Object.keys(keyframes)) assert.ok(used.has(name), `@keyframes ${name} is used`);
  for (const name of Object.keys(keyframes)) assert.ok(name.startsWith('fx-'), `${name} is fx- prefixed`);
});

test('fx.css: keyframes animate only compositor properties, and SVG targets only transform', () => {
  for (const [name, body] of Object.entries(keyframes)) {
    const properties = [...body.matchAll(/([a-z-]+)\s*:/g)].map(match => match[1]);
    for (const property of properties) assert.ok(['transform', 'translate', 'rotate', 'scale', 'opacity'].includes(property), `${name} animates ${property}`);
    assert.doesNotMatch(body, /box-shadow|width|height|left|top|margin|color|background|filter/, name);
  }
  // Chrome does not composite translate/rotate/scale on SVG elements (trace: compositeFailed), so loops on the pot,
  // its flame, the bowl's steam and the chili bottle must animate transform.
  const svgTargets = /(\.pot-art|\.pot-flame|\.bowl-steam|\.chili-bottle|\.steam)(\.[\w-]+)*$/;
  for (const rule of list.filter(rule => /animation\s*:/.test(rule.body) && rule.selectors.some(selector => svgTargets.test(selector)))) {
    for (const name of rule.body.match(/(?<![\w-])fx-[\w-]+/g)) assert.doesNotMatch(keyframes[name], /(^|[{;])\s*(translate|rotate|scale)\s*:/, `${name} on ${rule.selectors[0]} uses transform`);
  }
});

test('fx.css: new class names are fx- prefixed and an open dialog pauses every CSS animation', () => {
  const app = new Set(['pot-button', 'boiling', 'stage-raw', 'stage-ideal', 'stage-soft', 'stage-danger', 'pot-art', 'pot-flame', 'pot-icon', 'assembled-bowl', 'has-broth', 'bowl-steam', 'serve', 'chili-button', 'chili-bottle', 'customer', 'patience-ring', 'urgent', 'wallet', 'top-rating', 'tea-button', 'top-clock', 'warn', 'coach-target', 'play', 'reduced-motion']);
  const classes = new Set(list.flatMap(rule => rule.selectors.flatMap(selector => [...selector.matchAll(/\.([\w-]+)/g)].map(match => match[1]))));
  for (const name of classes) assert.ok(name.startsWith('fx-') || app.has(name), `.${name} is either the app's own hook or fx- prefixed`);
  const attributes = new Set(list.flatMap(rule => rule.selectors.flatMap(selector => [...selector.matchAll(/\[([\w-]+)/g)].map(match => match[1]))));
  for (const name of attributes) assert.ok(name.startsWith('data-fx-') || name === 'open' || name === 'hidden', `[${name}] is fx- prefixed`);
  const pause = list.filter(rule => rule.body.trim() === 'animation-play-state:paused');
  const selectors = pause.flatMap(rule => rule.selectors);
  for (const suffix of ['*', '*::before', '*::after']) assert.ok(selectors.some(selector => selector.startsWith('.fx-paused ') && selector.includes('#fx-layer') && selector.includes('#app') && selector.includes('.play') && selector.endsWith(` ${suffix}`)), `pause covers ${suffix}`);
  assert.match(readFileSync(new URL('../src/fx.js', import.meta.url), 'utf8'), /classList\.toggle\('fx-paused', want\)/, 'fx.js sets the pause class');
});

test('fx.css: no selector the browser must test against the whole page on every style pass', () => {
  assert.doesNotMatch(plain, /:has\(/, 'no :has(): it restyles all of #app whenever the game changes its DOM');
  for (const rule of list) for (const selector of rule.selectors) {
    const last = selector.split(/\s+|>/).filter(Boolean).at(-1).replace(/::?(before|after)$/, '');
    // A trailing universal selector is allowed only behind the .fx-paused class, which the ancestor filter rejects.
    if (last === '*') assert.ok(selector.startsWith('.fx-paused '), `${selector} ends in a universal selector`);
  }
});
