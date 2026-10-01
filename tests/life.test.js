import test from 'node:test';
import assert from 'node:assert/strict';
import { stageTransform, visibleWindow, toneAt, planAmbient, buildView, createDirector, countNodes, VIGNETTES, wireY, placeholderSprite } from '../src/life.js';

// Street boxes measured in the real layout (viewport → .street box) and the part of the 400 × 220 drawing they show.
const BOXES = [
  { viewport: '320x568', W: 300, H: 107, y0: 38.8, y1: 181.2, x0: 0, x1: 400 },
  { viewport: '390x844', W: 370, H: 120, y0: 45, y1: 175, x0: 0, x1: 400 },
  { viewport: '844x390', W: 370, H: 133, y0: 38, y1: 182, x0: 0, x1: 400 },
  { viewport: '768x1024', W: 748, H: 204, y0: 55, y1: 165, x0: 0, x1: 400 },
  { viewport: '1024x768', W: 277, H: 314, x0: 103, x1: 297, y0: 0, y1: 220 },
  { viewport: '1366x768', W: 372, H: 334, x0: 77, x1: 323, y0: 0, y1: 220 },
  { viewport: '1920x1080', W: 392, H: 642, x0: 133, x1: 267, y0: 0, y1: 220 },
];
const PHONE = buildView(370, 120), WIDE = buildView(372, 334), TALL = buildView(392, 642);
const day = (n, extra = {}) => p => ({ day: n, progress: p, event: 'normal', ...extra });

/** Runs one director through a whole 210 s day in 0.1 s ticks. */
function runDay(view, ctxAt, { director = createDirector(), steps = 2100, onStep } = {}) {
  const spawned = [];
  let maxAmbient = 0, maxNodes = 0;
  for (let i = 0; i <= steps; i++) {
    const out = director.step(.1, ctxAt(i / steps), view);
    spawned.push(...out.spawn);
    const live = director.live();
    maxAmbient = Math.max(maxAmbient, live.filter(a => a.ambient).length);
    maxNodes = Math.max(maxNodes, director.nodes());
    onStep?.(i / steps, live, out);
  }
  return { spawned, maxAmbient, maxNodes, director };
}
const families = list => new Set(list.map(s => s.family));

test('the stage uses the backdrop cover transform and shows the measured window', () => {
  for (const box of BOXES) {
    const { s, ox, oy } = stageTransform(box.W, box.H), win = visibleWindow(box.W, box.H);
    assert.ok(Math.abs(s - Math.max(box.W / 400, box.H / 220)) < 1e-9, `${box.viewport} scale`);
    assert.ok(Math.abs(400 * s + 2 * ox - box.W) < 1e-6 && Math.abs(220 * s + 2 * oy - box.H) < 1e-6, `${box.viewport} centred`);
    for (const key of ['x0', 'x1', 'y0', 'y1']) assert.ok(Math.abs(win[key] - box[key]) <= 1, `${box.viewport} ${key}: ${win[key].toFixed(1)} vs ${box[key]}`);
  }
});

test('the wires follow the painted curves: tied at the poles, sagging between them', () => {
  for (const k of [0, 5, 9]) {
    assert.ok(Math.abs(wireY(k, 118) - (46 + k)) < 1e-9);
    assert.ok(Math.abs(wireY(k, 296) - (46 + k)) < 1e-9);
    assert.ok(Math.abs(wireY(k, 207) - (57 + k)) < 1e-9, 'lowest point mid-span');
    assert.ok(Math.abs(wireY(k, -4) - (50 + k)) < 1e-9 && Math.abs(wireY(k, 404) - (52 + k)) < 1e-9);
  }
});

test('tone follows the time of day; rain days are rainy until night', () => {
  assert.equal(toneAt(0, false), 'day');
  assert.equal(toneAt(.61, false), 'day');
  assert.equal(toneAt(.62, false), 'dusk');
  assert.equal(toneAt(.78, false), 'dusk');
  assert.equal(toneAt(.79, false), 'night');
  assert.equal(toneAt(1, false), 'night');
  assert.equal(toneAt(.3, true), 'rain');
  assert.equal(toneAt(.7, true), 'rain');
  assert.equal(toneAt(.9, true), 'night');
  assert.equal(toneAt(NaN, false), 'day');
});

test('budgets: 3 ambient actors on phone-sized boxes, 6 on wide ones, scaled by the device budget', () => {
  assert.equal(PHONE.cap, 3); assert.equal(PHONE.nodeCap, 8);
  assert.equal(WIDE.cap, 6); assert.equal(TALL.cap, 6);
  assert.equal(buildView(370, 120, { budget: .6 }).cap, 2);
  assert.equal(buildView(372, 334, { budget: .6 }).cap, 4);
  assert.equal(buildView(300, 107).cap, 3);
  for (const view of [PHONE, WIDE]) {
    for (let seed = 0; seed < 300; seed++) {
      const plan = planAmbient(seed, { day: 2, progress: (seed % 100) / 100, weekend: seed % 2 === 0, pet: 'pet_cat' }, view);
      assert.ok(plan.length <= view.cap, 'never more than the free slots');
      const busy = planAmbient(seed, { day: 2, progress: .4 }, { ...view, active: Array.from({ length: view.cap }, () => ({ family: 'sparrow' })) });
      assert.deepEqual(busy, [], 'nothing spawns when the cap is reached');
    }
  }
});

test('planAmbient is deterministic and varies with the seed', () => {
  const ctx = { day: 4, progress: .5, weekend: true, pet: 'pet_dog' };
  const a = planAmbient(123, ctx, WIDE), b = planAmbient(123, ctx, WIDE);
  assert.deepEqual(a, b);
  const seen = new Set(Array.from({ length: 40 }, (_, seed) => JSON.stringify(planAmbient(seed, ctx, WIDE))));
  assert.ok(seen.size > 5, 'different seeds give different picks');
  const director = () => runDay(WIDE, day(9, { pet: 'pet_cat' })).spawned.map(s => [s.family, s.kind, s.dur.toFixed(3), JSON.stringify(s.path?.kf?.[0] || s.parts[0]?.path?.kf?.[0])]);
  assert.deepEqual(director(), director(), 'a day looks the same every time');
});

test('rain: no birds, kites or flocks; people carry umbrellas; beads drip from the wires', () => {
  for (let seed = 0; seed < 400; seed++) {
    const p = (seed % 100) / 100;
    const rainy = planAmbient(seed, { day: 5, progress: p, rain: true, event: 'rain', weekend: true }, WIDE);
    for (const pick of rainy) assert.ok(!['sparrow', 'flock', 'kite', 'cloud'].includes(pick.family), `no ${pick.family} in rain`);
    for (const pick of rainy.filter(x => x.family === 'pedestrian')) assert.equal(pick.kind, 'pedestrian-umbrella');
    for (const pick of planAmbient(seed, { day: 5, progress: p }, WIDE).filter(x => x.family === 'pedestrian')) assert.equal(pick.kind, 'pedestrian');
  }
  const { spawned } = runDay(WIDE, day(6, { rain: true, event: 'rain' }));
  const fam = families(spawned);
  for (const f of ['sparrow', 'flock', 'kite']) assert.ok(!fam.has(f), `no ${f} on a rain day`);
  assert.ok(fam.has('drips'), 'rain beads on the wires');
  assert.ok(spawned.filter(s => s.family === 'pedestrian').every(s => s.kind === 'pedestrian-umbrella'), 'umbrellas only');
  assert.ok(spawned.some(s => s.kind === 'pedestrian-umbrella'));
});

test('kites fly on weekends only, at most twice a day', () => {
  for (let seed = 0; seed < 300; seed++) {
    assert.ok(!planAmbient(seed, { day: 3, progress: .5 }, WIDE).some(x => x.family === 'kite'), 'no kite on a weekday');
  }
  assert.ok(Array.from({ length: 300 }, (_, seed) => planAmbient(seed, { day: 6, progress: .5, weekend: true, event: 'weekend' }, WIDE)).some(plan => plan.some(x => x.family === 'kite')));
  const weekend = runDay(WIDE, day(6, { weekend: true, event: 'weekend' })).spawned.filter(s => s.family === 'kite');
  assert.ok(weekend.length >= 1 && weekend.length <= 2, `weekend kites: ${weekend.length}`);
  assert.equal(runDay(WIDE, day(8)).spawned.filter(s => s.family === 'kite').length, 0);
});

test('the flock flies home once, at sunset (progress .70–.78), on dry days only', () => {
  for (let seed = 0; seed < 200; seed++) {
    const p = seed / 200;
    const plan = planAmbient(seed, { day: 2, progress: p }, WIDE);
    if (plan.some(x => x.family === 'flock')) assert.ok(p >= .7 && p <= .78, `flock at ${p}`);
    assert.ok(!planAmbient(seed, { day: 2, progress: .74 }, { ...WIDE, done: { flock: true } }).some(x => x.family === 'flock'), 'once a day');
  }
  for (const view of [PHONE, WIDE, TALL]) {
    const flocks = [];
    runDay(view, day(12), { onStep: (p, live, out) => { for (const s of out.spawn) if (s.family === 'flock') flocks.push(p); } });
    assert.equal(flocks.length, 1, 'exactly one flock');
    assert.ok(flocks[0] >= .7 && flocks[0] <= .78, `flock at ${flocks[0]}`);
  }
  assert.equal(runDay(WIDE, day(13, { rain: true, event: 'rain' })).spawned.filter(s => s.family === 'flock').length, 0);
});

test('the lamp stutters on once a day, just before the backdrop lights it, and not again after a remount', () => {
  for (const view of [PHONE, WIDE, TALL]) {
    const times = [];
    runDay(view, day(20), { onStep: (p, live, out) => { for (const s of out.spawn) if (s.family === 'lamp') times.push(p); } });
    assert.equal(times.length, 1);
    assert.ok(times[0] >= .776 && times[0] < 9.5 / 12, `stutter at ${times[0]}`);
  }
  const memory = { day: null, flags: {}, counter: 0 };
  const first = createDirector({ memory }), second = createDirector({ memory });
  let lamps = 0;
  for (let i = 1640; i <= 1680; i++) lamps += first.step(.1, { day: 21, progress: i / 2100 }, WIDE).spawn.filter(s => s.family === 'lamp').length;
  for (let i = 1640; i <= 1680; i++) lamps += second.step(.1, { day: 21, progress: i / 2100 }, WIDE).spawn.filter(s => s.family === 'lamp').length;
  assert.equal(lamps, 1, 'the same day keeps its flags across remounts');
  const late = createDirector();
  assert.equal(late.step(.1, { day: 22, progress: .9 }, WIDE).spawn.filter(s => s.family === 'lamp').length, 0, 'no stutter once the lamp is already lit');
});

test('ambient life never exceeds its budget, and phones stay within 8 animating nodes', () => {
  for (const [view, ctx] of [[PHONE, day(30, { pet: 'pet_dog' })], [buildView(370, 120, { budget: .6 }), day(31, { weekend: true, event: 'weekend', pet: 'pet_cat' })], [WIDE, day(32, { pet: 'pet_hamster' })], [TALL, day(33, { event: 'festival' })], [WIDE, day(34, { rain: true, event: 'rain' })], [PHONE, day(35, { event: 'cold' })]]) {
    const { maxAmbient, maxNodes } = runDay(view, ctx);
    assert.ok(maxAmbient <= view.cap, `ambient ${maxAmbient} ≤ ${view.cap}`);
    assert.ok(maxNodes <= view.nodeCap, `nodes ${maxNodes} ≤ ${view.nodeCap} (the lamp's flicker has a reserved node)`);
    if (view.small) assert.ok(maxNodes <= 8, `phone nodes ${maxNodes}`);
  }
});

test('the street has life all day: a dry weekday shows sparrows, people and the shop pet', () => {
  const phone = families(runDay(PHONE, day(40, { pet: 'pet_cat' })).spawned);
  for (const f of ['sparrow', 'pedestrian', 'pet', 'lamp', 'flock', 'moths', 'roofcat']) assert.ok(phone.has(f), `phone has ${f}`);
  assert.ok(!phone.has('vehicle'), 'no traffic where the road is hidden');
  const wide = families(runDay(WIDE, day(41)).spawned);
  for (const f of ['sparrow', 'pedestrian', 'vehicle', 'cloud', 'flock', 'moths']) assert.ok(wide.has(f), `wide has ${f}`);
  const festival = families(runDay(WIDE, day(42, { event: 'festival' })).spawned);
  assert.ok(festival.has('bunting') && festival.has('petals'), 'festival bunting and petals');
  const cold = families(runDay(WIDE, day(43, { event: 'cold' })).spawned);
  assert.ok(cold.has('leaves'), 'leaves gust on cold days');
});

test('actors are placed on painted places inside the visible window', () => {
  const view = WIDE, d = createDirector(), seen = new Set();
  for (let i = 0; i <= 2100; i++) {
    d.step(.1, { day: 50, progress: i / 2100, pet: 'pet_cat', weekend: true }, view);
    for (const s of d.live()) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      if (s.family === 'pedestrian') assert.ok(Math.abs(s.path.kf[0].y - 174.5) < 1.5, 'people walk on the far kerb');
      if (s.family === 'vehicle') assert.ok([184.5, 193.5].includes(s.path.kf[0].y), 'traffic keeps to its lane');
      if (s.family === 'sparrow') for (const p of s.parts) {
        const perched = p.path.kf.filter((f, j, all) => j > 0 && all[j - 1].x === f.x && all[j - 1].y === f.y);
        assert.ok(perched.length, 'a sparrow sits still for a while');
        for (const f of perched) assert.ok([0, 5, 9].some(k => Math.abs(wireY(k, f.x) - f.y) < .05), 'perched on a wire');
      }
      if (s.family === 'lamp') assert.equal(s.path.kf[0].x, 257);
    }
  }
});

test('the vignette catalogue is complete and each one plays where it can', () => {
  assert.deepEqual([...VIGNETTES], ['shower', 'bus', 'rat', 'rat-caught', 'flash', 'power', 'smoke', 'patrol', 'child', 'supplier', 'wobble', 'shooting-star', 'students', 'paper-plane', 'buyer-out', 'buyer-back']);
  for (const view of [PHONE, WIDE, TALL, buildView(300, 107), buildView(370, 133)]) {
    for (const kind of VIGNETTES) {
      const d = createDirector();
      d.step(.1, { day: 60, progress: .5 }, view);
      const out = d.vignette(kind, {}, { day: 60, progress: kind === 'shooting-star' ? .9 : .5 }, view);
      assert.ok(out.spawn.length >= 1 && out.spawn.length <= 2, `${kind} at ${view.W}x${view.H}: ${out.spawn.length}`);
      for (const s of out.spawn) {
        assert.equal(s.vignette, kind);
        assert.equal(s.ambient, false);
        assert.ok(Number.isFinite(s.dur) && s.dur > 0 && s.dur < 40, `${kind} lasts ${s.dur}`);
        assert.equal(s.nodes, countNodes(s));
      }
      assert.ok(d.nodes() <= view.nodeCap + 6, `${kind} nodes ${d.nodes()}`);
    }
  }
  const d = createDirector();
  d.step(.1, { day: 61, progress: .4 }, WIDE);
  assert.equal(d.vignette('shooting-star', {}, { day: 61, progress: .4 }, WIDE).spawn.length, 0, 'no shooting star by day');
  assert.equal(d.vignette('unicorn', {}, { day: 61, progress: .4 }, WIDE).spawn.length, 0, 'unknown kinds are ignored');
  const sounds = kind => { const x = createDirector(); x.step(.1, { day: 62, progress: .5 }, WIDE); const out = x.vignette(kind, {}, { day: 62, progress: .5 }, WIDE); const later = []; for (let i = 0; i < 300; i++) later.push(...x.step(.1, { day: 62, progress: .5 }, WIDE).sounds); return [...out.sounds, ...later]; };
  assert.deepEqual(sounds('students'), ['bell', 'bell']);
  assert.deepEqual(sounds('bus'), ['honk']);
  assert.deepEqual(sounds('flash'), ['flash']);
  assert.deepEqual(sounds('rat'), ['squeak']);
  assert.deepEqual(sounds('rat-caught'), ['squeak', 'meow']);
});

test('vignettes keep to two actors and make room on phones', () => {
  const d = createDirector();
  for (let i = 0; i < 400; i++) d.step(.1, { day: 70, progress: .3 + i / 4000, pet: 'pet_cat' }, PHONE);
  for (const kind of ['shower', 'rat-caught', 'flash', 'bus', 'students']) {
    d.vignette(kind, {}, { day: 70, progress: .45, pet: 'pet_cat' }, PHONE);
    assert.ok(d.live().filter(a => a.vignette).length <= 2, `${kind}: at most two vignette actors`);
    assert.ok(d.nodes() <= PHONE.nodeCap, `${kind}: ${d.nodes()} nodes`);
  }
});

test('flashes never land on portraits, names or the counter', () => {
  const lane = [{ x0: 20, y0: 60, x1: 120, y1: 160 }, { x0: 150, y0: 60, x1: 250, y1: 160 }, { x0: 280, y0: 60, x1: 380, y1: 160 }];
  const view = buildView(748, 204, { occluders: lane });
  const d = createDirector();
  d.step(.1, { day: 80, progress: .5 }, view);
  const out = d.vignette('flash', { count: 5 }, { day: 80, progress: .5 }, view);
  for (const p of out.spawn[0].parts) {
    const { x, y } = p.path.kf[0];
    assert.ok(!lane.some(o => x >= o.x0 - 2 && x <= o.x1 + 2 && y >= o.y0 - 2 && y <= o.y1 + 2), `flash at ${x},${y}`);
  }
});

test('the placeholder sprites keep the life.js contract', () => {
  for (const kind of ['sparrow', 'pedestrian', 'scooter', 'cat', 'bus', 'lamp-glow', 'bunting']) {
    const sp = placeholderSprite(kind, { frame: 1, variant: 2, tone: 'night' });
    assert.match(sp.svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 [\d.]+ [\d.]+"/);
    assert.ok(sp.w > 0 && sp.h > 0 && sp.ax >= 0 && sp.ax <= sp.w && sp.ay >= 0 && sp.ay <= sp.h);
  }
});

test('with the real sprite sizes (src/art/life.js) the rules hold and every frame asked for exists', async t => {
  let info;
  try { info = (await import('../src/art/life.js')).LIFE_SPRITE_INFO; } catch { t.skip('src/art/life.js is not there yet'); return; }
  const sizeOf = kind => info[kind];
  const used = new Map();
  const note = s => { for (const p of s.parts) for (const frame of p.img?.frames || []) for (const m of frame) if (m.kind) used.set(`${m.kind}|${m.frame || 0}`, m); };
  for (const [W, H] of [[300, 107], [370, 120], [370, 133], [748, 204], [277, 314], [372, 334], [392, 642]]) {
    const view = buildView(W, H, { sizeOf, budget: W * H < 70000 ? .6 : 1 });
    for (const ctx of [day(90, { pet: 'pet_cat', weekend: true, event: 'weekend' }), day(91, { rain: true, event: 'rain', pet: 'pet_dog' }), day(92, { event: 'festival', pet: 'pet_hamster' }), day(93, { event: 'cold' })]) {
      const { maxAmbient, maxNodes, spawned } = runDay(view, ctx, { director: createDirector({ sizeOf }) });
      assert.ok(maxAmbient <= view.cap, `${W}x${H}: ambient ${maxAmbient}`);
      assert.ok(maxNodes <= view.nodeCap, `${W}x${H}: nodes ${maxNodes}`);
      spawned.forEach(note);
    }
    for (const kind of VIGNETTES) {
      const d = createDirector({ sizeOf });
      d.step(.1, { day: 94, progress: .5, pet: 'pet_cat' }, view);
      d.vignette(kind, {}, { day: 94, progress: kind === 'shooting-star' ? .9 : .5, pet: 'pet_cat' }, view).spawn.forEach(note);
    }
    const d = createDirector({ sizeOf });
    d.demo({ day: 95, progress: .5, event: 'festival', rain: false }, view).spawn.forEach(note);
  }
  for (const [key, m] of used) {
    assert.ok(info[m.kind], `${m.kind} is a sprite kind`);
    assert.ok((m.frame || 0) < info[m.kind].frames, `${key}: ${m.kind} has ${info[m.kind].frames} frames`);
  }
  assert.ok(used.size > 30, `${used.size} sprite frames in use`);
});
