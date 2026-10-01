import test from 'node:test';
import assert from 'node:assert/strict';
import { createRide, stepRide, rideResult, rideAutopilot, addObstacle, addCanister, drawRide, RIDE } from '../src/ride.js';
import { PLANETS, CANISTER_FUEL, planetById } from '../src/planets.js';

const DT = 1 / 60;
const quiet = options => createRide({ ...options, spawn: false });          // no random hazards or canisters
function run(s, seconds, steer = () => 0) {
  const end = s.time + seconds;
  while (s.time < end - 1e-9 && !s.finished) stepRide(s, Math.min(DT, end - s.time), { move: steer(s) });
  return s;
}
function runToEnd(s, steer = () => 0) { let n = 0; while (!s.finished && n++ < 60 * 400) stepRide(s, DT, { move: steer(s) }); return s; }
const gameplay = s => JSON.stringify({ ...s, rng: { ...s.rng, fx: 0 }, fx: undefined, events: undefined });   // fx only feeds particles
function course(options) {                     // every obstacle the ride ever lays out, in order
  const s = createRide(options), seen = new Map();
  let n = 0;
  while (!s.finished && n++ < 60 * 400) { stepRide(s, DT); for (const o of s.obstacles) seen.set(o.id, o); }
  return { s, list: [...seen.values()] };
}
const MODES = [{ mode: 'scooter' }, { mode: 'scooter', rain: true }, ...PLANETS.map(planet => ({ mode: 'starship', planet }))];

test('rideResult has exactly the documented shape in both modes', () => {
  const scooter = rideResult(createRide({ mode: 'scooter' }));
  assert.deepEqual(Object.keys(scooter), ['finished', 'hits', 'ranOut', 'fuel', 'progress', 'time']);
  assert.deepEqual(scooter, { finished: false, hits: 0, ranOut: false, fuel: null, progress: 0, time: 0 });
  const ship = rideResult(createRide({ mode: 'starship', planet: planetById('mars'), fuel: 75 }));
  assert.deepEqual(Object.keys(ship), ['finished', 'hits', 'ranOut', 'fuel', 'progress', 'time']);
  assert.equal(ship.fuel, 75);
  assert.equal(ship.ranOut, false);
  const done = runToEnd(quiet({ mode: 'starship', planet: 'moon' }));
  const result = rideResult(done);
  assert.equal(result.finished, true);
  assert.equal(result.progress, 1);
  assert.ok(Math.abs(result.time - 30) < 1e-6);
});

test('the same seed and inputs give the same ride; the layout ignores frame rate and reduced motion', () => {
  const steer = s => (Math.floor(s.time / 1.3) % 3) - 1;
  for (const options of MODES) {
    const a = run(createRide({ ...options, seed: 42 }), 12, steer), b = run(createRide({ ...options, seed: 42 }), 12, steer);
    assert.equal(JSON.stringify(a), JSON.stringify(b), `${options.planet?.id ?? options.mode} is deterministic`);
    const calm = run(createRide({ ...options, seed: 42, reducedMotion: true }), 12, steer);
    assert.equal(gameplay(calm), gameplay(a), 'fewer particles never change the game');
  }
  const layout = dt => { const s = createRide({ mode: 'starship', planet: 'ring', seed: 9 }), seen = new Map(); while (!s.finished) { stepRide(s, dt); for (const o of s.obstacles) seen.set(o.id, `${o.kind}@${o.d.toFixed(6)}:${o.lanes}`); } return [...seen.values()].join('|'); };
  assert.equal(layout(1 / 60), layout(1 / 24));
  const one = course({ mode: 'scooter', seed: 1 }).list.map(o => `${o.lanes}`).join(), two = course({ mode: 'scooter', seed: 2 }).list.map(o => `${o.lanes}`).join();
  assert.notEqual(one, two, 'another seed lays out another road');
});

test('a big step is the same as many small ones (sub-steps of at most 0.05 s)', () => {
  const a = createRide({ mode: 'starship', planet: 'nebula', seed: 3 }), b = createRide({ mode: 'starship', planet: 'nebula', seed: 3 });
  stepRide(a, 0.5);
  for (let i = 0; i < 10; i++) stepRide(b, 0.05);
  assert.equal(gameplay(a), gameplay(b));
  const before = JSON.stringify(createRide({ mode: 'scooter' }));
  const s = createRide({ mode: 'scooter' });
  for (const bad of [0, -1, NaN, undefined, 'x']) stepRide(s, bad);
  assert.equal(JSON.stringify({ ...s, events: [] }), JSON.stringify({ ...JSON.parse(before), events: [] }));
});

test('scooter: 4500 units at full speed, about 15 s clean; obstacles enter at 320 then every 170-260 units', () => {
  assert.equal(RIDE.scooter.distance, 18 * 250);
  assert.deepEqual([...RIDE.scooter.lanes], [63, 147, 233]);
  const clean = runToEnd(quiet({ mode: 'scooter' }));
  assert.ok(clean.time >= 14 && clean.time <= 16, `clean run ${clean.time}`);
  assert.ok(Math.abs(clean.time - 4500 / RIDE.scooter.speed) < 1e-6);
  const s = createRide({ mode: 'scooter', seed: 5 });
  while (!s.obstacles.length) stepRide(s, DT);
  const first = s.obstacles[0];
  assert.equal(first.d, RIDE.scooter.firstObstacle + RIDE.spawnAhead);
  const yAt320 = RIDE.playerY - (first.d - 320);
  assert.ok(yAt320 + first.hh >= -1 && yAt320 + first.hh <= 1, 'its lower edge reaches the top of the canvas at distance 320');
  for (const options of [{ mode: 'scooter', seed: 5 }, { mode: 'scooter', rain: true, seed: 8 }]) {
    const rows = [...new Set(course(options).list.map(o => Math.round(o.d)))].sort((a, b) => a - b);
    const merged = rows.filter((d, i) => i === 0 || d - rows[i - 1] > 20);   // two hazards of one row sit within ±8
    for (let i = 1; i < merged.length; i++) { const gap = merged[i] - merged[i - 1]; assert.ok(gap >= 170 - 17 && gap <= 260 + 17, `gap ${gap}`); }
    assert.ok(merged.at(-1) <= 4500 - RIDE.scooter.endClear + 8, 'the last stretch to the house is clear');
  }
  const kinds = new Set(course({ mode: 'scooter', seed: 11 }).list.map(o => o.kind));
  assert.deepEqual([...kinds].sort(), ['cone', 'pothole', 'puddle']);
});

test('the autopilot dodges a whole ride: clean runs last 15 s', () => {
  let cleanRuns = 0;
  for (let seed = 1; seed <= 10; seed++) for (const rain of [false, true]) {
    const s = runToEnd(createRide({ mode: 'scooter', rain, seed }), rideAutopilot);
    if (s.hits === 0) { cleanRuns++; assert.ok(Math.abs(s.time - 15) < 1e-6); }
  }
  assert.ok(cleanRuns >= 18, `${cleanRuns}/20 clean`);
  for (const planet of PLANETS) {
    const s = runToEnd(createRide({ mode: 'starship', planet, seed: 7 }), rideAutopilot);
    assert.ok(s.hits <= 1, `${planet.id}: ${s.hits} hits`);
    assert.equal(s.finished, true);
  }
});

test('a hit counts once per obstacle, grants 0.9 s of blinking safety and 0.8 s at reduced speed', () => {
  const s = quiet({ mode: 'scooter' });
  const cone = addObstacle(s, { kind: 'cone', lane: s.lane, d: 300 });
  addObstacle(s, { kind: 'pothole', lane: 0, d: 300 });                     // the next lane: never touched
  let hitAt = null;
  while (s.distance < 360) { stepRide(s, DT); if (s.hits && hitAt === null) hitAt = s.time; }
  assert.equal(s.hits, 1);
  assert.equal(cone.hit, true);
  const t0 = createRide({ mode: 'scooter', spawn: false });
  addObstacle(t0, { kind: 'puddle', lane: 1, d: 100 });
  let events = [];
  while (!t0.hits) { stepRide(t0, DT); events = t0.events; }
  assert.ok(events.some(e => e.type === 'hit' && e.kind === 'puddle'));
  assert.ok(t0.invuln > 0.85 && t0.invuln <= 0.9, 'invulnerable right after the hit');
  assert.ok(Math.abs(t0.slow - 0.8) < 0.02);
  stepRide(t0, DT);
  assert.equal(t0.speed, RIDE.scooter.speed * RIDE.hit.slowFactor);
  const second = addObstacle(t0, { kind: 'cone', lane: 1, d: t0.distance + 40 });   // reached while still blinking
  run(t0, 0.5);
  assert.equal(t0.hits, 1, 'no second hit while invulnerable');
  assert.equal(second.passed, true);
  run(t0, 0.6);
  assert.equal(t0.invuln, 0);
  assert.equal(t0.speed, RIDE.scooter.speed, 'full speed again after 0.8 s');
  addObstacle(t0, { kind: 'pothole', lane: 1, d: t0.distance + 60 });
  run(t0, 0.5);
  assert.equal(t0.hits, 2, 'safety over, the next obstacle counts');
});

test('a slow overlap still counts once, and comets cannot tunnel through a large step', () => {
  const s = quiet({ mode: 'starship', planet: 'mars' });
  const rock = addObstacle(s, { kind: 'asteroid', lane: 1, big: true, d: 200 });   // spans lanes 1 and 2
  assert.deepEqual(rock.lanes, [1, 2]);
  while (s.distance < 260) stepRide(s, 0.004);
  assert.equal(s.hits, 1);
  const c = quiet({ mode: 'starship', planet: 'nebula' });
  const comet = addObstacle(c, { kind: 'comet', lane: c.lane, from: c.lane - 1, d: 260 });
  stepRide(c, 1.2);                                                         // 24 sub-steps in one call
  assert.equal(comet.hit, true);
  assert.equal(c.hits, 1);
});

test('lane changes: one lane per input, smooth slides, rain is slippery (0.25 s instead of 0.12 s)', () => {
  const dry = quiet({ mode: 'scooter' }), wet = quiet({ mode: 'scooter', rain: true });
  for (const s of [dry, wet]) stepRide(s, 0, { move: 1 });
  run(dry, 0.13); run(wet, 0.13);
  assert.equal(dry.x, RIDE.scooter.lanes[2]);
  assert.equal(dry.slide, null);
  assert.ok(wet.slide && wet.x > RIDE.scooter.lanes[1] && wet.x < RIDE.scooter.lanes[2], 'still sliding on the wet road');
  run(wet, 0.13);
  assert.equal(wet.x, RIDE.scooter.lanes[2]);
  const edge = quiet({ mode: 'scooter' });
  stepRide(edge, DT, { move: -1 }); run(edge, 0.2);
  stepRide(edge, DT, { move: -1 });
  assert.equal(edge.lane, 0);
  assert.ok(edge.events.some(e => e.type === 'edge'));
  const two = quiet({ mode: 'starship', planet: 'moon' });
  stepRide(two, DT, { move: 1 }); stepRide(two, DT, { move: 1 });            // the second press waits in the queue
  run(two, 0.4);
  assert.equal(two.lane, 4);
  assert.equal(two.x, RIDE.starship.lanes[4]);
  const back = quiet({ mode: 'scooter' });
  stepRide(back, 0.05, { move: 1 }); stepRide(back, DT, { move: -1 });       // turning back mid-change
  run(back, 0.2);
  assert.equal(back.x, RIDE.scooter.lanes[1]);
});

test('starship: fuel drains so a full tank lasts 1.15 x the flight; running dry sets ranOut and 0.45 speed', () => {
  const mars = planetById('mars');
  const s = quiet({ mode: 'starship', planet: mars, fuel: 100 });
  run(s, 10);
  assert.ok(Math.abs(s.fuel - (100 - (10 * 100) / (mars.duration * 1.15))) < 1e-9);
  assert.equal(s.total, mars.duration * RIDE.starship.speed);
  const moon = planetById('moon');
  const tank = quiet({ mode: 'starship', planet: moon, fuel: 100 });
  tank.total = 1e9;                                                          // keep flying past the planet
  run(tank, moon.duration * 1.15 - 0.1);
  assert.ok(tank.fuel > 0 && !tank.ranOut);
  run(tank, 0.2);
  assert.equal(tank.fuel, 0);
  assert.equal(tank.ranOut, true);
  stepRide(tank, DT);
  assert.equal(tank.speed, RIDE.starship.speed * 0.45);
  const dry = runToEnd(quiet({ mode: 'starship', planet: moon, fuel: 20 }));
  assert.equal(dry.ranOut, true);
  assert.ok(dry.time > moon.duration + 5, `emergency thrusters make the flight longer (${dry.time.toFixed(1)} s)`);
  assert.equal(rideResult(createRide({ mode: 'starship', planet: moon, fuel: 0 })).ranOut, true);
});

test('fuel canisters add 20 (capped at 100), spawn every 4-6 s, and ranOut stays true after refuelling', () => {
  assert.equal(CANISTER_FUEL, 20);
  const s = quiet({ mode: 'starship', planet: 'moon', fuel: 50 });
  addCanister(s, { lane: s.lane, d: 150 });
  let before = null;
  while (!s.pickups[0].taken) { before = s.fuel; stepRide(s, DT); }
  assert.ok(Math.abs(s.fuel - (before - s.drain * DT + CANISTER_FUEL)) < 1e-6);
  assert.ok(s.events.some(e => e.type === 'fuel'));
  const full = quiet({ mode: 'starship', planet: 'moon', fuel: 95 });
  const top = addCanister(full, { lane: full.lane, d: 60 });
  while (!top.taken) stepRide(full, DT);
  assert.equal(full.fuel, 100, 'capped at a full tank');
  const empty = quiet({ mode: 'starship', planet: 'moon', fuel: 1 });
  run(empty, 0.5);
  assert.equal(empty.ranOut, true);
  addCanister(empty, { lane: empty.lane, d: empty.distance + 30 });
  run(empty, 0.5);
  assert.ok(empty.fuel > 15 && empty.emergency === false && empty.ranOut === true);
  stepRide(empty, DT);
  assert.equal(empty.speed, RIDE.starship.speed);
  const spawned = createRide({ mode: 'starship', planet: 'nebula', seed: 4 }), times = [];
  let seen = 0;
  while (!spawned.finished) { stepRide(spawned, DT); if (spawned.nextId > seen) { for (const c of spawned.pickups) if (!times.some(t => t.id === c.id)) times.push({ id: c.id, t: spawned.time }); seen = spawned.nextId; } }
  assert.ok(times.length >= 6);
  for (let i = 1; i < times.length; i++) { const gap = times[i].t - times[i - 1].t; assert.ok(gap >= 4 - 1e-6 && gap <= 6 + 1.5, `canister gap ${gap.toFixed(2)}`); }
});

test('dust (Mars): a warned gust about every 6 s nudges one lane, never off-screen and never mid-change', () => {
  const s = quiet({ mode: 'starship', planet: 'mars' }), log = [];
  let n = 0;
  while (!s.finished && n++ < 60 * 60) {
    stepRide(s, DT);
    for (const e of s.events) if (e.type === 'gust' || e.type === 'gust-warn') log.push({ ...e, t: s.time, lane: s.lane });
    assert.ok(s.lane >= 0 && s.lane < 5 && s.x >= RIDE.starship.lanes[0] - 0.5 && s.x <= RIDE.starship.lanes[4] + 4);
  }
  const gusts = log.filter(e => e.type === 'gust');
  assert.ok(gusts.length >= 4, `${gusts.length} gusts`);
  for (let i = 0; i < gusts.length; i++) {
    const warn = log.filter(e => e.type === 'gust-warn' && e.t < gusts[i].t).at(-1);
    assert.ok(warn && Math.abs(gusts[i].t - warn.t - 1) < 0.05, 'a one-second warning comes first');
    assert.equal(warn.dir, gusts[i].dir);
    if (i) { const gap = gusts[i].t - gusts[i - 1].t; assert.ok(gap >= 5.5 - 1e-6 && gap <= 6.5 + 1e-6); }
  }
  assert.ok(gusts.some(e => e.pushed));
  const edge = quiet({ mode: 'starship', planet: 'mars' });
  stepRide(edge, DT, { move: -1 }); run(edge, 0.2); stepRide(edge, DT, { move: -1 }); run(edge, 0.2);
  assert.equal(edge.lane, 0);
  run(edge, 5.5);
  assert.equal(edge.gust.dir, 1, 'at the edge the wind can only push inward');
  const busy = quiet({ mode: 'starship', planet: 'mars' });
  run(busy, 5.95);
  stepRide(busy, DT, { move: 1 });                                          // changing lanes as the gust hits
  const lane = busy.lane;
  run(busy, 0.1);
  const gust = busy.gust;
  assert.equal(gust.count, 1);
  assert.equal(gust.pushed, false);
  assert.equal(busy.lane, lane);
});

test('ice: lane changes drift over 0.3 s', () => {
  const ice = quiet({ mode: 'starship', planet: 'ice' }), moon = quiet({ mode: 'starship', planet: 'moon' });
  for (const s of [ice, moon]) stepRide(s, 0, { move: -1 });
  run(ice, 0.2); run(moon, 0.13);
  assert.equal(moon.x, RIDE.starship.lanes[1]);
  assert.ok(ice.slide && ice.x > RIDE.starship.lanes[1], 'the iced ship is still drifting');
  run(ice, 0.11);
  assert.equal(ice.x, RIDE.starship.lanes[1]);
});

test('ring: the last quarter is a denser debris belt', () => {
  let before = 0, after = 0, debrisBefore = 0, debrisAfter = 0, lenBefore = 0, lenAfter = 0;
  for (const seed of [1, 2, 3]) {
    const { s, list } = course({ mode: 'starship', planet: 'ring', seed });
    const belt = s.total * RIDE.starship.beltFrom, first = RIDE.starship.firstObstacle + RIDE.spawnAhead, last = s.total - RIDE.starship.endClear;
    lenBefore += belt - first; lenAfter += last - belt;
    for (const o of list) if (o.d < belt) { before++; if (o.kind === 'debris') debrisBefore++; } else { after++; if (o.kind === 'debris') debrisAfter++; }
  }
  assert.ok(after / lenAfter > 1.8 * (before / lenBefore), `belt density ${(after / lenAfter).toFixed(4)} vs ${(before / lenBefore).toFixed(4)}`);
  assert.ok(debrisAfter / after > debrisBefore / before + 0.15, 'mostly debris in the belt');
  const moon = course({ mode: 'starship', planet: 'moon', seed: 1 });
  assert.ok(moon.list.every(o => o.kind !== 'comet'), 'the moon run has no comets (weight 0)');
});

test('no height ever has every lane blocked', () => {
  for (const options of MODES) for (const seed of [1, 2, 3, 4]) {
    const { s, list } = course({ ...options, seed });
    const L = s.lanes.length;
    for (const o of list) for (const y of [o.d - o.hh, o.d, o.d + o.hh]) {
      const blocked = new Set();
      for (const p of list) if (Math.abs(p.d - y) <= p.hh) for (const l of p.lanes) blocked.add(l);
      assert.ok(blocked.size < L, `${options.planet?.id ?? options.mode}#${seed}: all ${L} lanes blocked at ${y}`);
    }
  }
});

test('finishing stops the clock, addObstacle validates kinds, and drawRide paints every mode without errors', () => {
  const s = runToEnd(quiet({ mode: 'scooter' }));
  const time = s.time;
  stepRide(s, 1, { move: 1 });
  assert.equal(s.time, time);
  assert.equal(s.lane, 1);
  assert.throws(() => addObstacle(s, { kind: 'asteroid' }), RangeError);
  assert.throws(() => addCanister(s, {}), RangeError);
  // A recording 2D context stands in for the browser so every drawing path runs in Node.
  let calls = 0, bad = 0;
  const gradient = { addColorStop() {} };
  const makeCtx = canvas => new Proxy({ canvas, getTransform: () => ({ a: 1, b: 0 }), measureText: () => ({ width: 60 }), createLinearGradient: () => gradient, createRadialGradient: () => gradient }, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => { calls++; if (key === 'drawImage' || key === 'fillRect') for (const a of args.slice(1)) if (typeof a === 'number' && !Number.isFinite(a)) bad++; };
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return makeCtx(this); } };
  try {
    for (const options of MODES) for (const fuel of [100, 3]) {
      const ride = createRide({ ...options, fuel, seed: 2 });
      const ctx = makeCtx({ width: 645, height: 860 });
      for (const until of [0.2, 0.5, 0.8, 1]) {
        while (ride.distance / ride.total < until && !ride.finished) stepRide(ride, DT, { move: Math.floor(ride.time) % 2 ? rideAutopilot(ride) : 0 });
        drawRide(ctx, ride, { width: 645, height: 860 });
        drawRide(ctx, ride, { width: 700, height: 700, reducedMotion: true });
      }
    }
  } finally { delete globalThis.OffscreenCanvas; }
  assert.ok(calls > 1000);
  assert.equal(bad, 0, 'no NaN reached the canvas');
});
