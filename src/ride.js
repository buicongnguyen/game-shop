// Delivery rides: the far-delivery scooter run (rules measured from the reference game) and the interplanetary
// starship flight (an original extension), both on one deterministic engine.
//
//   createRide(options)            → plain state object (JSON-safe, no DOM)
//   stepRide(state, dt, { move })  → the same state, advanced by dt seconds in sub-steps of at most 0.05 s
//   rideResult(state)              → { finished, hits, ranOut, fuel, progress, time }
//   drawRide(ctx, state, opts)     → paints the 300×400 logical scene, letterboxed into opts.width × opts.height
//   mountRide(canvas, options, cb) → browser controller { left(), right(), stop(), state }
//
// Extras: rideAutopilot(state) suggests a dodge (demos, tests); addObstacle / addCanister place things by hand;
// createRide also takes spawn: false (no random hazards) and reducedMotion. mountRide's optional onEvent(event)
// receives each { type } as it happens, for sounds: move, edge, hit (kind), fuel, low-fuel, empty, gust-warn,
// gust (pushed), comet-warn, belt, finish.
//
// All randomness comes from seeded mulberry32 streams kept in the state: `course` lays out the obstacles by
// distance, `pickup` drops fuel canisters, `gust` drives the Mars dust storms and `fx` only feeds particles, so
// reduced motion (fewer particles) never changes the game. Every picture is drawn here with canvas paths and
// gradients, following docs/ART-STYLE.md; there are no asset files.
import { PLANETS, CANISTER_FUEL } from './planets.js';

const W = 300, H = 400, TAU = Math.PI * 2;
const PLAYER_Y = 330;            // the vehicle's line on the logical canvas
const SPAWN_AHEAD = 340;         // a new obstacle enters at the top edge; world distance d is drawn at y = PLAYER_Y - (d - distance)
const GEN_AHEAD = 640;           // rows are laid out this far ahead so comet warnings can start in time
const MAX_STEP = 0.05;
const COMET_K = 2;               // comets close in twice as fast as the scenery
const COMET_RUN = PLAYER_Y + 40; // screen distance from a comet's entry point to the vehicle line
const LOW_FUEL = 20;
const NEVER = 1e15;              // a finite "never", so the state survives a JSON round trip

export const RIDE = Object.freeze({
  width: W, height: H, playerY: PLAYER_Y, spawnAhead: SPAWN_AHEAD, maxStep: MAX_STEP, lowFuel: LOW_FUEL,
  hit: Object.freeze({ invulnerable: 0.9, slow: 0.8, slowFactor: 0.55 }),
  scooter: Object.freeze({
    lanes: Object.freeze([63, 147, 233]), distance: 4500, speed: 300, firstObstacle: 320, gap: Object.freeze([170, 260]),
    slide: 0.12, rainSlide: 0.25, doubleChance: 0.3, endClear: 160,
    weights: Object.freeze({
      dry: Object.freeze({ pothole: 0.38, puddle: 0.24, cone: 0.38 }),
      rain: Object.freeze({ pothole: 0.25, puddle: 0.52, cone: 0.23 }),
    }),
  }),
  starship: Object.freeze({
    lanes: Object.freeze([42, 96, 150, 204, 258]), speed: 280, firstObstacle: 420, gap: Object.freeze([190, 280]),
    slide: 0.12, iceSlide: 0.3, fuelReserve: 1.15, emergencySpeed: 0.45, canisterEvery: Object.freeze([4, 6]),
    cometWarn: 0.8, gustEvery: 6, gustWarn: 1, gustSlide: 0.28, beltFrom: 0.75, beltGap: 0.62, endClear: 300,
  }),
});

// Collision half-sizes [half width, half height] in logical pixels.
const BOX = Object.freeze({
  pothole: [18, 9], puddle: [22, 10], cone: [9, 9],
  asteroid: [14, 14], bigAsteroid: [31, 28], debris: [13, 11], comet: [10, 10], fuel: [16, 16],
  scooter: [11, 24], starship: [13, 16],
});
const KINDS = Object.freeze({ scooter: ['pothole', 'puddle', 'cone'], starship: ['asteroid', 'debris', 'comet'] });

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ───────────────────────── seeded randomness ─────────────────────────
function mix(seed, salt) {
  let h = (seed ^ Math.imul(salt, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
function next(rng, key) {                    // mulberry32, state kept in rng[key]
  const a = (rng[key] = (rng[key] + 0x6d2b79f5) >>> 0);
  let t = Math.imul(a ^ (a >>> 15), a | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function prng(seed) { const box = { s: seed >>> 0 }; return () => next(box, 's'); }
const toSeed = seed => (Number.isFinite(Number(seed)) ? Math.floor(Math.abs(Number(seed))) : 1) >>> 0;

// ───────────────────────── engine ─────────────────────────
function resolvePlanet(planet) {
  if (typeof planet === 'string') planet = PLANETS.find(row => row.id === planet);
  return planet && Number(planet.duration) > 0 && planet.hazards && planet.colors ? planet : PLANETS[0];
}

export function createRide({ mode = 'scooter', rain = false, planet = null, fuel = 100, seed = 1, spawn = true, reducedMotion = false } = {}) {
  const ship = mode === 'starship';
  const cfg = ship ? RIDE.starship : RIDE.scooter;
  const p = ship ? resolvePlanet(planet) : null;
  const seedU = toSeed(seed);
  const rng = { course: mix(seedU, 1), pickup: mix(seedU, 2), gust: mix(seedU, 3), fx: mix(seedU, 4) };
  const lanes = [...cfg.lanes], lane = (lanes.length - 1) >> 1;
  const total = ship ? p.duration * cfg.speed : cfg.distance;
  const fuel0 = ship ? clamp(Number.isFinite(Number(fuel)) ? Number(fuel) : 100, 0, 100) : null;
  const state = {
    mode: ship ? 'starship' : 'scooter', rain: !ship && !!rain, seed: seedU, planet: p, special: ship ? p.special ?? null : null,
    rng, lanes, lane, x: lanes[lane], slide: null, queue: [],
    total, distance: 0, baseSpeed: cfg.speed, speed: cfg.speed, time: 0, finished: false,
    hits: 0, invuln: 0, slow: 0,
    fuel: fuel0, drain: ship ? 100 / (p.duration * cfg.fuelReserve) : 0, ranOut: ship && fuel0 <= 0, emergency: ship && fuel0 <= 0,
    obstacles: [], pickups: [], nextId: 1,
    spawn: spawn !== false, genD: cfg.firstObstacle + SPAWN_AHEAD, safeLane: lane, rows: 0, lastGap: NEVER,
    canisterIn: NEVER, gust: null, beltStart: NEVER, beltShown: false,
    events: [],
    scene: ship ? null : streetScene(seedU, total),
    fx: { t: 0, reduced: !!reducedMotion, particles: [], popups: [], banner: null, shake: 0, bump: 0, emit: [0, 0, 0, 0] },
  };
  if (ship) {
    const [c0, c1] = cfg.canisterEvery;
    state.canisterIn = c0 + next(rng, 'pickup') * (c1 - c0);
    if (state.special === 'dust') state.gust = { in: cfg.gustEvery, dir: 0, warn: false, count: 0, at: -9, pushed: false };
    if (state.special === 'ring') state.beltStart = total * cfg.beltFrom;
  }
  return state;
}

export function stepRide(state, dt = 0, input = {}) {
  if (!state || !state.events) return state;
  state.events.length = 0;
  if (state.finished) return state;
  const move = Math.sign(Number(input?.move) || 0);
  if (move) queueMove(state, move);
  const span = Math.min(Number(dt), 3600);
  if (!(span > 0)) return state;
  const n = Math.max(1, Math.ceil(span / MAX_STEP - 1e-9)), h = span / n;
  for (let i = 0; i < n && !state.finished; i++) tick(state, h);
  return state;
}

export function rideResult(state) {
  return {
    finished: !!state.finished,
    hits: state.hits,
    ranOut: !!state.ranOut,
    fuel: state.mode === 'starship' ? state.fuel : null,
    progress: clamp(state.distance / state.total, 0, 1),
    time: state.time,
  };
}

// Places one obstacle by hand (tutorials and tests). `d` is the world distance at which it reaches the vehicle.
export function addObstacle(state, { kind, lane = state.lane, d = state.distance + SPAWN_AHEAD, big = false, from = null } = {}) {
  if (!KINDS[state.mode].includes(kind)) throw new RangeError(`unknown ${state.mode} obstacle: ${kind}`);
  const last = state.lanes.length - 1;
  const at = clamp(Math.round(lane), 0, big ? last - 1 : last);
  const o = place(state, { kind, lane: at, d, big: big && kind === 'asteroid' }, () => 0.5);
  if (kind === 'comet' && from !== null) { o.from = clamp(Math.round(from), 0, last); o.fromX = state.lanes[o.from]; }
  return o;
}

// Places one fuel canister by hand (tutorials and tests). Collecting it adds CANISTER_FUEL, capped at 100.
export function addCanister(state, { lane = state.lane, d = state.distance + SPAWN_AHEAD } = {}) {
  if (state.mode !== 'starship') throw new RangeError('fuel canisters exist only in starship mode');
  const at = clamp(Math.round(lane), 0, state.lanes.length - 1);
  const c = { id: state.nextId++, kind: 'fuel', lane: at, x: state.lanes[at], d, hw: BOX.fuel[0], hh: BOX.fuel[1], taken: false, takenT: -1 };
  state.pickups.push(c);
  return c;
}

const slideTime = s => (s.mode === 'scooter' ? (s.rain ? RIDE.scooter.rainSlide : RIDE.scooter.slide) : s.special === 'ice' ? RIDE.starship.iceSlide : RIDE.starship.slide);
const speedOf = s => s.baseSpeed * (s.slow > 0 ? RIDE.hit.slowFactor : 1) * (s.emergency ? RIDE.starship.emergencySpeed : 1);
const cometY = (o, distance) => PLAYER_Y - (o.d - distance) * COMET_K;
const cometX = (o, y) => o.x + (o.fromX - o.x) * (PLAYER_Y - y) / COMET_RUN;

function tick(s, h) {
  const ship = s.mode === 'starship';
  s.speed = speedOf(s);
  const left = s.total - s.distance;
  const dt = s.speed * h >= left ? left / s.speed : h;   // the finish can fall inside a sub-step
  const before = s.distance;
  s.time += dt;
  s.distance = dt < h ? s.total : s.distance + s.speed * dt;
  s.invuln = Math.max(0, s.invuln - dt);
  s.slow = Math.max(0, s.slow - dt);
  if (ship) burnFuel(s, dt);
  moveSlide(s, dt);
  if (s.gust) blowGust(s, dt);
  if (s.spawn) { planRows(s); if (ship) dropCanisters(s, dt); }
  if (ship) warnComets(s);
  if (!s.beltShown && s.distance >= s.beltStart - SPAWN_AHEAD) { s.beltShown = true; s.events.push({ type: 'belt' }); banner(s, 'Vào vành đai mảnh vụn!', 'warn', 2.2); }
  collide(s, before);
  sweep(s);
  if (s.distance >= s.total) { s.distance = s.total; s.finished = true; s.events.push({ type: 'finish', hits: s.hits }); celebrate(s); }
  animate(s, dt);
}

function queueMove(s, dir) {
  const sl = s.slide;
  if (!sl) { startSlide(s, dir, slideTime(s), 'player'); return; }
  if (dir === -sl.dir) {                     // turning back mid-change answers at once
    const back = s.lane + dir;
    if (back < 0 || back >= s.lanes.length) return;
    s.queue.length = 0;
    const to = s.lanes[back], gap = Math.abs(s.lanes[1] - s.lanes[0]);
    s.lane = back;
    s.slide = { from: s.x, to, t: 0, dur: Math.max(0.04, slideTime(s) * Math.abs(to - s.x) / gap), dir, cause: 'player' };
    s.events.push({ type: 'move', dir, cause: 'player' });
    return;
  }
  if (s.queue.length < 2) s.queue.push(dir);
}

function startSlide(s, dir, dur, cause) {
  const target = s.lane + dir;
  if (target < 0 || target >= s.lanes.length) { s.fx.bump = dir; s.events.push({ type: 'edge', dir }); return false; }
  s.lane = target;
  s.slide = { from: s.x, to: s.lanes[target], t: 0, dur, dir, cause };
  s.events.push({ type: 'move', dir, cause });
  return true;
}

function slideEase(s, p) {
  if (s.rain || s.special === 'ice') return 1 - (1 - p) ** 3 + Math.sin(Math.PI * p) * 0.06 * p;  // slippery drift
  return p * p * (3 - 2 * p);
}

function moveSlide(s, dt) {
  const sl = s.slide;
  if (!sl) return;
  sl.t += dt;
  const p = Math.min(1, sl.t / sl.dur);
  s.x = sl.from + (sl.to - sl.from) * slideEase(s, p);
  if (p >= 1) {
    s.x = sl.to; s.slide = null;
    if (s.queue.length) startSlide(s, s.queue.shift(), slideTime(s), 'player');
  }
}

function burnFuel(s, dt) {
  if (s.fuel > 0) {
    const was = s.fuel;
    s.fuel = Math.max(0, s.fuel - s.drain * dt);
    if (was >= LOW_FUEL && s.fuel < LOW_FUEL && s.fuel > 0) { s.events.push({ type: 'low-fuel' }); banner(s, 'Sắp hết nhiên liệu!', 'warn', 1.6); }
    if (s.fuel <= 0) {
      s.fuel = 0; s.ranOut = true;
      s.events.push({ type: 'empty' });
      banner(s, 'Hết nhiên liệu! Chạy động cơ dự phòng', 'bad', 2.4);
    }
  }
  s.emergency = s.fuel <= 0;
}

function blowGust(s, dt) {
  const g = s.gust, cfg = RIDE.starship;
  if (s.distance > s.total - 340) { g.warn = false; return; }   // calm air on the final approach
  g.in -= dt;
  if (!g.warn && g.in <= cfg.gustWarn) {
    g.warn = true;
    const last = s.lanes.length - 1;
    g.dir = s.lane <= 0 ? 1 : s.lane >= last ? -1 : next(s.rng, 'gust') < 0.5 ? -1 : 1;
    s.events.push({ type: 'gust-warn', dir: g.dir });
  }
  if (g.in > 0) return;
  if (!g.dir) g.dir = s.lane <= 0 ? 1 : -1;
  const target = s.lane + g.dir;
  g.warn = false; g.count++; g.at = s.time;
  g.pushed = !s.slide && target >= 0 && target < s.lanes.length;   // never while the pilot is changing lanes
  if (g.pushed) { s.queue.length = 0; startSlide(s, g.dir, cfg.gustSlide, 'gust'); }
  s.events.push({ type: 'gust', dir: g.dir, pushed: g.pushed });
  g.in = cfg.gustEvery - 0.5 + next(s.rng, 'gust');
}

function planRows(s) {
  const cfg = s.mode === 'starship' ? RIDE.starship : RIDE.scooter;
  const last = s.total - cfg.endClear;
  while (s.genD <= s.distance + GEN_AHEAD && s.genD <= last) genRow(s, cfg);
}

function hazardWeights(s, belt) {
  const hz = s.planet.hazards;
  let asteroid = Math.max(0, Number(hz.asteroid) || 0), debris = Math.max(0, Number(hz.debris) || 0), comet = Math.max(0, Number(hz.comet) || 0);
  if (belt) { debris *= 2.5; comet *= 0.6; }
  if (asteroid + debris + comet <= 0) asteroid = 1;
  return { asteroid, debris, comet };
}

function pickKind(weights, u) {
  let total = 0, last = null;
  for (const k in weights) total += weights[k];
  let x = u * total;
  for (const k in weights) { if (weights[k] <= 0) continue; last = k; x -= weights[k]; if (x < 0) return k; }
  return last;
}

// One row of hazards. A guaranteed open lane drifts at most as far as a lane change can reach between two rows,
// so a clean line always exists and no row ever closes every lane.
function genRow(s, cfg) {
  const r = () => next(s.rng, 'course');
  const ship = s.mode === 'starship', L = s.lanes.length, d = s.genD;
  const belt = d >= s.beltStart;
  const tallest = ship ? (belt ? BOX.debris[1] + 3 : BOX.bigAsteroid[1]) : BOX.puddle[1] + 8;
  const reach = (s.lastGap - 2 * (tallest + BOX[s.mode][1])) / (s.baseSpeed * slideTime(s));
  let shift = clamp(Math.floor(reach), 0, L - 1);
  if (belt || s.special === 'ice') shift = Math.min(shift, 1);
  if (s.special === 'dust') shift = Math.min(shift, 2);
  const drift = r();
  if (shift > 0) s.safeLane = clamp(s.safeLane + Math.round((drift * 2 - 1) * shift), 0, L - 1);
  const roll = r();
  let count;
  if (s.rows < 2) count = 1;
  else if (!ship) count = roll < cfg.doubleChance ? 2 : 1;
  else if (belt) count = roll < 0.2 ? 1 : roll < 0.7 ? 2 : 3;
  else count = roll < 0.55 ? 1 : roll < 0.93 ? 2 : 3;
  const open = [];
  for (let i = 0; i < L; i++) if (i !== s.safeLane) open.push(i);
  const weights = ship ? hazardWeights(s, belt) : cfg.weights[s.rain ? 'rain' : 'dry'];
  for (let k = 0; k < count && open.length; k++) {
    const kind = pickKind(weights, r());
    if (kind === 'asteroid' && !belt && r() < 0.35) {      // a big rock across two neighbouring open lanes
      const pairs = open.filter(i => open.includes(i + 1));
      if (pairs.length) {
        const i = pairs[Math.floor(r() * pairs.length)];
        open.splice(open.indexOf(i), 1); open.splice(open.indexOf(i + 1), 1);
        place(s, { kind, lane: i, d, big: true }, r);
        continue;
      }
    }
    const lane = open.splice(Math.floor(r() * open.length), 1)[0];
    place(s, { kind, lane, d: !ship && count > 1 ? d + (r() - 0.5) * 16 : d }, r);
  }
  s.rows++;
  const [g0, g1] = cfg.gap;
  let gap = g0 + r() * (g1 - g0);
  if (ship) gap *= (1 - 0.15 * Math.min(1, d / s.total / 0.75)) * (belt ? cfg.beltGap : 1);
  s.lastGap = gap;
  s.genD += gap;
}

function place(s, { kind, lane, d, big = false }, r) {
  const lanes = big ? [lane, lane + 1] : [lane];
  const x = big ? (s.lanes[lane] + s.lanes[lane + 1]) / 2 : s.lanes[lane];
  const [hw, hh] = BOX[big ? 'bigAsteroid' : kind];
  const o = { id: s.nextId++, kind, lanes, x, d, hw, hh, big, v: Math.floor(r() * 3) % 3, spin: (r() * 2 - 1) * (kind === 'debris' ? 2.8 : 0.9), rot: r() * TAU, hit: false, passed: false, hitT: -1 };
  if (kind === 'comet') {
    const options = [];
    for (const k of [-2, -1, 1, 2]) if (lane + k >= 0 && lane + k < s.lanes.length) options.push(lane + k);
    o.from = options[Math.floor(r() * options.length) % options.length];
    o.fromX = s.lanes[o.from];
    o.warned = false;
  }
  s.obstacles.push(o);
  return o;
}

function dropCanisters(s, dt) {
  s.canisterIn -= dt;
  if (s.canisterIn > 0) return;
  const cfg = RIDE.starship, d = s.distance + SPAWN_AHEAD + 20;
  if (d > s.total - cfg.endClear) { s.canisterIn = NEVER; return; }
  const free = [];
  for (let i = 0; i < s.lanes.length; i++) if (!s.obstacles.some(o => o.lanes.includes(i) && Math.abs(o.d - d) < o.hh + 40)) free.push(i);
  if (!free.length) { s.canisterIn = 0.3; return; }
  addCanister(s, { lane: free[Math.floor(next(s.rng, 'pickup') * free.length)], d });
  const [c0, c1] = cfg.canisterEvery;
  s.canisterIn = c0 + next(s.rng, 'pickup') * (c1 - c0);
}

function warnComets(s) {
  const lead = COMET_RUN / COMET_K + RIDE.starship.cometWarn * s.baseSpeed;
  for (const o of s.obstacles) if (o.kind === 'comet' && !o.warned && o.d - s.distance <= lead) { o.warned = true; s.events.push({ type: 'comet-warn', lane: o.lanes[0] }); }
}

function collide(s, before) {
  const [phw, phh] = BOX[s.mode], px = s.x, py = PLAYER_Y;
  for (const o of s.obstacles) {
    if (o.hit || o.passed) continue;
    const comet = o.kind === 'comet';
    const y0 = comet ? cometY(o, before) : PLAYER_Y - (o.d - before);
    const y1 = comet ? cometY(o, s.distance) : PLAYER_Y - (o.d - s.distance);
    const lo = Math.min(y0, y1), hi = Math.max(y0, y1);   // swept, so nothing tunnels through
    if (hi + o.hh <= py - phh || lo - o.hh >= py + phh) continue;
    const ox = comet ? cometX(o, clamp(py, lo, hi)) : o.x;
    if (Math.abs(ox - px) >= o.hw + phw) continue;
    if (s.invuln > 0) { o.passed = true; continue; }
    strike(s, o);
  }
  for (const c of s.pickups) {
    if (c.taken) continue;
    const y0 = PLAYER_Y - (c.d - before), y1 = PLAYER_Y - (c.d - s.distance);
    if (Math.max(y0, y1) + c.hh <= py - phh || Math.min(y0, y1) - c.hh >= py + phh) continue;
    if (Math.abs(c.x - px) >= c.hw + phw) continue;
    c.taken = true; c.takenT = s.time;
    s.fuel = Math.min(100, s.fuel + CANISTER_FUEL);
    s.emergency = s.fuel <= 0;
    s.events.push({ type: 'fuel', fuel: s.fuel });
    sparkle(s, c.x, PLAYER_Y - 10);
  }
}

function sweep(s) {
  const cut = s.distance - 140;
  let j = 0;
  for (const o of s.obstacles) if (o.kind === 'comet' ? cometY(o, s.distance) < H + 120 : o.d > cut) s.obstacles[j++] = o;
  s.obstacles.length = j;
  j = 0;
  for (const c of s.pickups) if (c.d > cut && !(c.taken && s.time - c.takenT > 0.4)) s.pickups[j++] = c;
  s.pickups.length = j;
}

// ───────────────────────── autopilot (harness, demos and tests) ─────────────────────────
// Suggests the next lane change (-1, 0 or 1). It reads the planned rows, so it is a fair, cheat-free dodger
// rather than a perfect one; it also fetches fuel when the tank is below three quarters.
export function rideAutopilot(state) {
  const s = state;
  if (!s || s.finished || s.queue.length) return 0;
  const L = s.lanes.length, cur = s.lane, look = s.speed * 1.25 + 90;
  const near = new Array(L).fill(Infinity), lure = new Array(L).fill(0);
  for (const o of s.obstacles) {
    if (o.hit || o.passed) continue;
    const ahead = o.d - s.distance;
    if (ahead < -(o.hh + 30) || ahead > look) continue;
    for (const l of o.lanes) if (ahead < near[l]) near[l] = ahead;
  }
  if (s.slide) return s.slide.cause === 'gust' && near[cur] < look * 0.8 ? -s.slide.dir : 0;   // lean back into the wind
  if (s.fuel !== null && s.fuel < 75) for (const c of s.pickups) { const ahead = c.d - s.distance; if (!c.taken && ahead > 30 && ahead < look) lure[c.lane] = 1; }
  if (near[cur] >= look && !lure.some(Boolean)) return 0;
  const lead = s.baseSpeed * slideTime(s);
  let best = cur, bestScore = -Infinity;
  for (let l = 0; l < L; l++) {
    const dir = Math.sign(l - cur), steps = Math.abs(l - cur);
    let ok = true;
    for (let k = 1; k <= steps; k++) { const m = cur + dir * k; if (near[m] < (m === l ? lead * k : lead * k + 50)) ok = false; }
    const score = Math.min(near[l], look + 40) + lure[l] * 160 - steps * 30 + (ok ? 0 : -2000);
    if (score > bestScore) { bestScore = score; best = l; }
  }
  return Math.sign(best - cur);
}

// ───────────────────────── visual effects state (fx stream only) ─────────────────────────
const fr = s => next(s.rng, 'fx');
const POOL = [];                             // dead particles, reused so a ride allocates almost nothing per frame
function puff(s, k, x, y, vx, vy, life, size, c, a = 1, gravity = 0, ground = 0, drag = 0, add = false) {
  const fx = s.fx;
  if (fx.particles.length >= (fx.reduced ? 48 : 180)) return null;
  const p = POOL.pop() || {};
  p.k = k; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.size = size; p.c = c; p.a = a;
  p.g = gravity; p.gr = ground; p.drag = drag; p.add = add; p.rot = 0; p.vr = 0;
  fx.particles.push(p);
  return p;
}
function banner(s, text, tone, dur) { s.fx.banner = { text, tone, age: 0, dur }; }
function popup(s, text, x, y, color) {
  const list = s.fx.popups;
  if (list.length > 3) list.shift();
  list.push({ text, x, y, age: 0, color });
}

const HIT_WORDS = { pothole: 'Ối!', puddle: 'Bõm!', cone: 'Cốp!', asteroid: 'Rầm!', debris: 'Keng!', comet: 'Xoẹt!' };
function strike(s, o) {
  o.hit = true; o.hitT = s.time;
  s.hits++; s.invuln = RIDE.hit.invulnerable; s.slow = RIDE.hit.slow;
  s.events.push({ type: 'hit', kind: o.kind, hits: s.hits });
  const fx = s.fx, x = s.x, y = PLAYER_Y - 16;
  fx.shake = 0.7;
  popup(s, HIT_WORDS[o.kind], x, y - 24, o.kind === 'puddle' ? '#bfe6ff' : '#ffd166');
  const n = fx.reduced ? 5 : 16;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (fr(s) - 0.5) * 2.6, sp = 60 + fr(s) * 140, vx = Math.cos(a) * sp, vy = Math.sin(a) * sp;
    switch (o.kind) {
      case 'puddle': puff(s, 1, x + (fr(s) - 0.5) * 14, y + 8, vx, vy, 0.5, 1.6, fr(s) < 0.5 ? '#9fd4ff' : '#ffffff', 1, 340, 0.6); break;
      case 'pothole': puff(s, fr(s) < 0.5 ? 0 : 2, x + (fr(s) - 0.5) * 12, y + 10, vx * 0.6, vy * 0.6, 0.55, 1.4 + fr(s) * 1.4, fr(s) < 0.5 ? '#6e6875' : '#c9b8a6', 0.85, 260, 0.7); break;
      case 'cone': puff(s, i % 3 ? 0 : 4, x + (fr(s) - 0.5) * 10, y, vx, vy, 0.55, 1.6, i % 2 ? '#f7743a' : '#fff3dc', 1, 300, 0.4); break;
      case 'asteroid': puff(s, i % 2 ? 0 : 1, x, y, vx * 1.2, vy, 0.6, i % 2 ? 2 : 1.4, i % 2 ? '#8c7366' : '#ffb347', 1, 0, 0.5, 0, !(i % 2)); break;
      case 'debris': puff(s, 1, x, y, vx * 1.4, vy * 1.1, 0.45, 1.3, i % 3 ? '#ffe28a' : '#c9d3db', 1, 0, 0.4, 0, true); break;
      default: puff(s, i % 2 ? 4 : 1, x, y, vx * 1.3, vy, 0.6, 1.8, i % 2 ? '#fff0b8' : '#ff8a5c', 1, 0, 0.4, 0, true);
    }
  }
}

function sparkle(s, x, y) {
  popup(s, `+${CANISTER_FUEL}`, x, y - 18, '#b8ff8a');
  const n = s.fx.reduced ? 4 : 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + fr(s) * 0.4, sp = 50 + fr(s) * 60;
    puff(s, 4, x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.55, 2 + fr(s) * 1.5, i % 2 ? '#b8ff8a' : '#ffe066', 1, 0, 0.3, 2.5, true);
  }
}

const CONFETTI = ['#e8402f', '#f7c242', '#fff3dc', '#5fae4e', '#6cc3ef', '#f28ab2'];
function celebrate(s) {
  const n = s.fx.reduced ? 8 : 30;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (fr(s) - 0.5) * 2.4, sp = 90 + fr(s) * 150, rot = fr(s) * TAU, vr = (fr(s) - 0.5) * 18;
    const p = puff(s, 3, s.x, PLAYER_Y - 20, Math.cos(a) * sp, Math.sin(a) * sp, 1.6, 2.4, CONFETTI[i % CONFETTI.length], 1, 120, 0, 1.2);
    if (p) { p.rot = rot; p.vr = vr; }
  }
}

function animate(s, dt) {
  const fx = s.fx;
  fx.t += dt;
  fx.shake = Math.max(0, fx.shake - dt * 1.8);
  fx.bump = Math.abs(fx.bump) < 0.02 ? 0 : fx.bump * Math.pow(0.004, dt);
  const ps = fx.particles, sp = s.speed;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    p.life -= dt;
    if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); if (POOL.length < 400) POOL.push(p); continue; }
    p.vy += p.g * dt;
    if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
    p.x += p.vx * dt; p.y += (p.vy + p.gr * sp) * dt; p.rot += p.vr * dt;
  }
  for (const t of fx.popups) t.age += dt;
  while (fx.popups.length && fx.popups[0].age > 0.9) fx.popups.shift();
  if (fx.banner && (fx.banner.age += dt) > fx.banner.dur) fx.banner = null;
  if (s.finished) return;
  const slowMo = fx.reduced ? 4 : 1, e = fx.emit;
  e[0] += dt; e[1] += dt; e[2] += dt; e[3] += dt;
  if (s.mode === 'scooter') {
    if (e[0] >= 0.09 * slowMo) { e[0] = 0; puff(s, 2, s.x + 10 + fr(s) * 2, PLAYER_Y + 44, 5 + fr(s) * 10, 6, 0.75, 2.4, '#f1e9df', 0.26, 0, 0.78, 1.4); }
    if (s.rain && e[1] >= 0.03 * slowMo) { e[1] = 0; puff(s, 1, s.x + (fr(s) - 0.5) * 8, PLAYER_Y + 47, (fr(s) - 0.5) * 70, 20 + fr(s) * 60, 0.32, 1.1, '#d6ebff', 0.75, 0, 0.9); }
    if (e[2] >= 0.26 * slowMo) { e[2] = 0; puff(s, 2, s.x + (fr(s) - 0.5) * 12, PLAYER_Y + 12, (fr(s) - 0.5) * 8, 10, 0.9, 2.4, '#fff3dc', 0.3, 0, 0.4); }
    return;
  }
  if (e[0] >= 0.035 * slowMo) {
    e[0] = 0;
    for (let sx = -1; sx <= 1; sx += 2) {
      const c = s.emergency ? (fr(s) < 0.5 ? '#9fd8ff' : '#c6a8ff') : fr(s) < 0.5 ? '#ffd166' : '#ff8a3c';
      puff(s, 1, s.x + sx * 6 + (fr(s) - 0.5) * 3, PLAYER_Y + 30, (fr(s) - 0.5) * 26, (s.emergency ? 60 : 120) + fr(s) * 90, 0.26, 1.4, c, 1, 0, 0, 0, true);
    }
  }
  if (s.special === 'ice' && s.slide && e[1] >= 0.022 * slowMo) { e[1] = 0; puff(s, 4, s.x + (fr(s) - 0.5) * 22, PLAYER_Y + (fr(s) - 0.2) * 26, (fr(s) - 0.5) * 24, 30, 0.55, 1.6 + fr(s), '#dff8ff', 1, 0, 0.55, 0, true); }
  if (e[2] >= 0.04 * slowMo) {
    e[2] = 0;
    for (const o of s.obstacles) {
      if (o.kind !== 'comet' || o.hit) continue;
      const y = cometY(o, s.distance);
      if (y < -30 || y > H) continue;
      puff(s, 4, cometX(o, y) + (fr(s) - 0.5) * 8, y - 4, (o.fromX - o.x) * 0.4 + (fr(s) - 0.5) * 20, -40 - fr(s) * 40, 0.5, 1.4 + fr(s), fr(s) < 0.5 ? '#ffe7a8' : '#ff9a6b', 1, 0, 1, 0, true);
    }
  }
  const g = s.gust;
  if (g && (g.warn || s.time - g.at < 0.6) && e[3] >= 0.03 * slowMo) {
    e[3] = 0;
    puff(s, 0, g.dir > 0 ? -4 : W + 4, 60 + fr(s) * (H - 80), g.dir * (240 + fr(s) * 140), (fr(s) - 0.5) * 20, 1.4, 1 + fr(s) * 1.2, s.planet.colors.accent, 0.7);
  }
}

// ───────────────────────── street scenery layout (scooter, visual only) ─────────────────────────
// Houses, sidewalk life, trees and lamps on both sides, plus wires, crossings and lane arrows over the road.
function streetScene(seed, total) {
  const r = prng(mix(seed, 9)), sides = [];
  const destFrom = total - 80, destTo = total + 130;
  const inDest = (side, d, pad) => side === 1 && d > destFrom - pad && d < destTo + pad;
  for (let side = 0; side < 2; side++) {
    const houses = [], trees = [], items = [], lamps = [];
    for (let d = -480; d < total + 600;) {
      const len = 44 + r() * 48;
      const house = { d, len, style: Math.floor(r() * 4), color: Math.floor(r() * 7), awning: r() < 0.6 ? Math.floor(r() * 4) : -1, flowers: r() < 0.3, sign: Math.floor(r() * 4) };
      if (!inDest(side, d + len / 2, len / 2)) houses.push(house);
      d += len + (r() < 0.22 ? 8 + r() * 6 : 0);            // an alley now and then
    }
    for (let d = -460 + r() * 60; d < total + 560; d += 46 + r() * 70) {
      const u = r(), v = Math.floor(r() * 4), n = 2 + Math.floor(r() * 2);
      const kind = u < 0.3 ? 'bikes' : u < 0.48 ? 'pots' : u < 0.62 ? 'stools' : u < 0.74 ? 'vendor' : u < 0.84 ? 'stall' : null;
      if (kind && !inDest(side, d, 34)) items.push({ d, kind, v, n });
    }
    for (let d = -440 + r() * 80; d < total + 560; d += 100 + r() * 120) {
      const v = Math.floor(r() * 4), size = 0.85 + r() * 0.3;
      if (inDest(side, d, 40) || items.some(it => it.kind === 'stall' && Math.abs(it.d - d) < 40)) continue;
      trees.push({ d, v, size });
    }
    for (let d = -400 + side * 130; d < total + 540; d += 260) if (!inDest(side, d, 20)) lamps.push({ d });
    sides.push({ houses, trees, items, lamps });
  }
  const wires = [];
  for (let d = 200 + r() * 200; d < total - 150; d += 520 + r() * 260) wires.push({ d, d2: d + (r() - 0.35) * 70, n: 3 + Math.floor(r() * 2) });
  const crossings = [Math.round(total * (0.3 + r() * 0.08)), Math.round(total * (0.64 + r() * 0.08))];
  const arrows = [];
  for (let d = 500 + r() * 300; d < total - 300; d += 620 + r() * 380) { const lane = Math.floor(r() * 3); if (crossings.every(c => Math.abs(c - d) > 120)) arrows.push({ d, lane }); }
  return { sides, wires, crossings, arrows };
}

// ───────────────────────── drawing helpers ─────────────────────────
const INK = '#4a2a22';
const FONT_D = '"Paytone One", "Trebuchet MS", sans-serif';
const FONT_B = '"Mali", "Segoe UI", system-ui, sans-serif';
const F = Object.freeze({
  label: `700 10.5px ${FONT_B}`, count: `400 15px ${FONT_D}`, pct: `400 12px ${FONT_D}`, warn: `400 10.5px ${FONT_D}`, bang: `400 11px ${FONT_D}`,
  hint: `400 13px ${FONT_D}`, banner: `400 13.5px ${FONT_D}`, title: `400 20px ${FONT_D}`, sub: `700 12px ${FONT_B}`, gust: `400 15px ${FONT_D}`, pop: `400 15px ${FONT_D}`,
});
const C = Object.freeze({
  chili: '#e8402f', chiliD: '#b92b22', tomato: '#ef5a3c', orange: '#f59a3a', orangeD: '#c9672a', mustard: '#f7c242', mustardD: '#c99420',
  cream: '#fff3dc', cream2: '#ffe7c2', leaf: '#5fae4e', leafD: '#3f8a3a', mint: '#8fd3a7', sky: '#6cc3ef', skyD: '#2f7fc1', teal: '#2f8f8a',
  plum: '#8a4d9e', pink: '#f28ab2', wood: '#b06a3b', woodD: '#7a4426', woodL: '#d99a5e', metal: '#c9d3db', metalD: '#8e9aa6', skin: '#efc19c',
});

function rr(g, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function circ(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }
function ell(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); }
function fill(g, c) { g.fillStyle = c; g.fill(); }
function ink(g, w = 1.6, c = INK) { g.lineWidth = w; g.strokeStyle = c; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
function curve(g, a, b, c) { g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(b[0], b[1], c[0], c[1]); }
function shine(g, a, b, c, w = 1.6, alpha = 0.55) { curve(g, a, b, c); ink(g, w, `rgba(255,255,255,${alpha})`); }
// Fills a shape in its shade colour, then the base colour shifted toward the top-left light: a flat shade crescent.
function shaded(g, path, base, shade, ox, oy) {
  path(); fill(g, shade);
  g.save(); path(); g.clip(); g.translate(ox, oy); path(); fill(g, base); g.restore();
}
function blobPts(seed, n, rx, ry, jitter) {
  const r = prng(seed), pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (r() - 0.5) * 0.35, k = 1 - jitter + r() * jitter;
    pts.push([Math.cos(a) * rx * k, Math.sin(a) * ry * k]);
  }
  return pts;
}
function blob(g, pts) {
  const n = pts.length;
  g.beginPath();
  g.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
  g.closePath();
}
function rgbOf(hex) { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
function rgba(hex, a) { const [r, g, b] = rgbOf(hex); return `rgba(${r},${g},${b},${a})`; }
function tint(hex, k) { const t = k > 0 ? 255 : 0, a = Math.abs(k); return `rgb(${rgbOf(hex).map(v => Math.round(v + (t - v) * a)).join(',')})`; }
function text(g, str, x, y, font, color, align = 'left', outline = 0) {
  g.font = font; g.textAlign = align; g.textBaseline = 'alphabetic';
  if (outline) { g.lineWidth = outline; g.strokeStyle = INK; g.lineJoin = 'round'; g.strokeText(str, x, y); }
  g.fillStyle = color; g.fillText(str, x, y);
}

// Every picture is painted once per device scale into an offscreen canvas, then blitted: a frame is a road or sky
// plate plus sprites. Boxes are [x0, y0, width, height, optional max scale] around each sprite's origin.
const CACHES = new WeakMap();
function cacheOf(ctx, scale) {
  const owner = ctx.canvas || ctx, sc = Math.round(scale * 100) / 100;
  let c = CACHES.get(owner);
  if (!c || c.scale !== sc) {
    if (c) release(c);
    c = { scale: sc, map: new Map(), verge: null };
    CACHES.set(owner, c);
  }
  return c;
}
function release(c) {                        // phones keep canvas memory until the backing store shrinks
  for (const e of c.map.values()) e.cv.width = e.cv.height = 1;
  if (c.verge) for (const cv of c.verge.map.values()) cv.width = cv.height = 1;
}
function newCanvas(w, h) {
  if (typeof document !== 'undefined' && document.createElement) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h);
}
function entry(cache, key, box, paint, a, b) {
  let e = cache.map.get(key);
  if (!e) {
    const [x0, y0, w, h, cap, opaque] = box, k = cap ? Math.min(cache.scale, cap) : cache.scale;
    const cw = Math.max(1, Math.ceil(w * k)), ch = Math.max(1, Math.ceil(h * k));
    const cv = newCanvas(cw, ch), c = cv.getContext('2d', opaque ? { alpha: false } : undefined);
    c.setTransform(cw / w, 0, 0, ch / h, (-x0 * cw) / w, (-y0 * ch) / h);
    paint(c, a, b);
    e = { cv, x0, y0, w, h };
    cache.map.set(key, e);
  }
  return e;
}
function sprite(g, cache, key, box, paint, dx = 0, dy = 0, sc = 1, a, b) {
  const e = entry(cache, key, box, paint, a, b);
  g.drawImage(e.cv, dx + e.x0 * sc, dy + e.y0 * sc, e.w * sc, e.h * sc);
}
const GLOW_KEYS = {};
function paintGlow(g, color) {
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 32);
  gr.addColorStop(0, rgba(color, 0.95)); gr.addColorStop(0.3, rgba(color, 0.42)); gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr; g.fillRect(-32, -32, 64, 64);
}
function glow(g, cache, color, x, y, r, alpha) {
  if (alpha <= 0.01) return;
  g.globalAlpha = alpha; g.globalCompositeOperation = 'lighter';
  sprite(g, cache, GLOW_KEYS[color] || (GLOW_KEYS[color] = `glow${color}`), BX.glow, paintGlow, x, y, r / 32, color);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}

const ROAD_TILE = 480, CHUNK = 240, VERGE_W = 52, VPAD = 3;
const BX = Object.freeze({
  glow: [-32, -32, 64, 64], road: [0, 0, W, ROAD_TILE, 0, true], sky: [0, 0, W, 480, 0, true], hud: [0, 0, W, 56], scooter: [-26, -44, 52, 92], cone: [-15, -31, 32, 38],
  pothole: [-27, -16, 54, 32], puddle: [-38, -20, 76, 40], pin: [-14, -36, 28, 38], dest: [-16, -64, 40, 128], lamp: [-6, -10, 26, 18],
  lampPool: [-34, -22, 68, 94], farPlanet: [-28, -16, 56, 32],
  beacon: [-10, -13, 20, 22], astS: [-21, -21, 42, 42], astB: [-38, -38, 76, 76], lightS: [-17, -17, 34, 34], lightB: [-34, -34, 68, 68],
  debris: [-22, -22, 44, 44], comet: [-12, -12, 24, 24], tail: [-12, -90, 24, 94], canister: [-12, -17, 24, 34], ship: [-26, -32, 52, 58],
  planet: [-200, -200, 400, 400, 2], planetRing: [-300, -200, 600, 400, 2], station: [-152, -96, 304, 116], beam: [-140, -12, 280, 24],
  belt: [0, 0, W, H], icon: [-12, -12, 24, 24], marker: [-9.5, -9.5, 19, 19], bar: [0, 0, 212, 10], fuelBar: [0, 0, 78, 10],
});
const KEYS = Object.freeze({
  pot: [['pot0', 'pot1', 'pot2'], ['potw0', 'potw1', 'potw2']], pud: [['pud0', 'pud1', 'pud2'], ['pudw0', 'pudw1', 'pudw2']],
  ast: [['asts0', 'asts1', 'asts2'], ['astb0', 'astb1', 'astb2']], deb: ['deb0', 'deb1', 'deb2'],
});
const STATE_KEYS = new WeakMap();            // per-ride sprite names, built once instead of every frame
function keysOf(s) {
  let k = STATE_KEYS.get(s);
  if (!k) {
    const id = s.planet?.id ?? 'street', v = s.seed % 5;
    k = { sky: `sky-${id}-${v}`, hud: `hud-${id}-${s.rain ? 1 : 0}`, belt: `belt-${id}`, planet: `planet-${id}`, station: `station-${id}`, beam: `beam-${id}`, verge: `${s.seed}|${s.rain ? 1 : 0}|${s.total}` };
    STATE_KEYS.set(s, k);
  }
  return k;
}

// ───────────────────────── renderer ─────────────────────────
export function drawRide(ctx, state, { width, height, reducedMotion } = {}) {
  const s = state;
  const cw = width ?? ctx.canvas?.width ?? W, ch = height ?? ctx.canvas?.height ?? H;
  const k = Math.min(cw / W, ch / H);
  if (!(k > 0) || !s) return;
  const ox = (cw - W * k) / 2, oy = (ch - H * k) / 2;
  const m = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
  const base = m ? Math.hypot(m.a, m.b) || 1 : 1;
  const cache = cacheOf(ctx, Math.min(4, k * base));
  const reduced = reducedMotion ?? s.fx.reduced;
  const ship = s.mode === 'starship';
  ctx.save();
  if (ox > 0.01 || oy > 0.01) {
    ctx.fillStyle = ship ? '#070c1f' : '#24140f';
    if (ox > 0.01) { const bw = Math.ceil(ox) + 1; ctx.fillRect(0, 0, bw, ch); ctx.fillRect(cw - bw, 0, bw, ch); }
    if (oy > 0.01) { const bh = Math.ceil(oy) + 1; ctx.fillRect(0, 0, cw, bh); ctx.fillRect(0, ch - bh, cw, bh); }
  }
  ctx.translate(ox, oy); ctx.scale(k, k);
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  ctx.save();
  const shake = reduced ? 0 : s.fx.shake;
  if (shake > 0) ctx.translate(Math.sin(s.fx.t * 91) * shake * 5, Math.cos(s.fx.t * 77) * shake * 3.5);
  if (ship) drawSpace(ctx, s, cache, reduced); else drawStreet(ctx, s, cache, reduced);
  drawParticles(ctx, s);
  ctx.restore();
  if (!ship && s.rain) drawRain(ctx, s, reduced);
  if (ship && s.gust) drawGust(ctx, s, reduced);
  drawPopups(ctx, s);
  drawHud(ctx, s, cache, reduced);
  drawBanners(ctx, s, reduced);
  ctx.restore();
}

function drawParticles(g, s) {
  const ps = s.fx.particles;
  if (!ps.length) return;
  for (let pass = 0; pass < 2; pass++) {
    g.globalCompositeOperation = pass ? 'lighter' : 'source-over';
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.add !== (pass === 1)) continue;
      const life = p.life / p.max;
      g.globalAlpha = Math.min(1, life * 1.8) * p.a;
      if (p.k === 1) {                        // a streak along its motion
        const vy = p.vy + p.gr * s.speed;
        g.strokeStyle = p.c; g.lineWidth = p.size; g.lineCap = 'round';
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.035, p.y - vy * 0.035); g.stroke();
      } else if (p.k === 2) {                 // smoke or steam, growing as it fades
        g.fillStyle = p.c;
        g.beginPath(); g.arc(p.x, p.y, p.size * (1 + (1 - life) * 1.8), 0, TAU); g.fill();
      } else if (p.k === 3) {                 // confetti
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        g.fillStyle = p.c; g.fillRect(-p.size, -p.size * 0.55, p.size * 2, p.size * 1.1);
        g.restore();
      } else if (p.k === 4) {                 // a four-point sparkle
        const r = p.size * (0.6 + life * 0.6);
        g.fillStyle = p.c;
        g.beginPath(); g.moveTo(p.x, p.y - r * 2); g.lineTo(p.x + r * 0.5, p.y - r * 0.5); g.lineTo(p.x + r * 2, p.y); g.lineTo(p.x + r * 0.5, p.y + r * 0.5);
        g.lineTo(p.x, p.y + r * 2); g.lineTo(p.x - r * 0.5, p.y + r * 0.5); g.lineTo(p.x - r * 2, p.y); g.lineTo(p.x - r * 0.5, p.y - r * 0.5); g.closePath(); g.fill();
      } else {
        g.fillStyle = p.c;
        g.beginPath(); g.arc(p.x, p.y, p.size, 0, TAU); g.fill();
      }
    }
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}

function drawPopups(g, s) {
  for (const t of s.fx.popups) {
    g.globalAlpha = clamp(t.age < 0.6 ? 1 : 1 - (t.age - 0.6) / 0.3, 0, 1);
    const font = t.age < 0.12 ? `400 ${(9 + (t.age / 0.12) * 6).toFixed(1)}px ${FONT_D}` : F.pop;
    text(g, t.text, t.x, t.y - t.age * 26, font, t.color, 'center', 3.4);
  }
  g.globalAlpha = 1;
}

// ── street ──
const ROOFS = ['#f7c242', '#f28ab2', '#8fd3a7', '#6cc3ef', '#ef5a3c', '#e39a55', '#b48fd6'];
const AWNINGS = ['#e8402f', '#2f8f8a', '#f59a3a', '#2f7fc1'];
const BIKES = ['#e8402f', '#2f7fc1', '#f4efe6', '#3b3540', '#5fae4e', '#f7c242'];
const SIGNS = ['#e8402f', '#f7c242', '#2f7fc1', '#5fae4e'];

function drawStreet(g, s, cache, reduced) {
  const wet = s.rain ? 1 : 0, y0 = s.distance % ROAD_TILE, key = wet ? 'road-wet' : 'road';
  sprite(g, cache, key, BX.road, paintRoad, 0, y0 - ROAD_TILE, 1, wet);
  if (y0 < H) sprite(g, cache, key, BX.road, paintRoad, 0, y0, 1, wet);
  drawMarkings(g, s);
  if (wet) drawSplashes(g, s, reduced);
  drawVerge(g, s, cache);
  const fy = PLAYER_Y - (s.total - s.distance);
  if (fy > -24 && fy < H + 24) drawFinishLine(g, fy);
  for (const o of s.obstacles) if (o.kind !== 'cone') drawFlat(g, s, o, cache);
  drawDestination(g, s, cache, reduced);
  for (const o of s.obstacles) if (o.kind === 'cone') drawCone(g, s, o, cache);
  drawScooter(g, s, cache, reduced);
  drawLamps(g, s, cache);
  drawWires(g, s);
}

function paintRoad(g, wet) {
  const T = ROAD_TILE, r = prng(wet ? 913 : 377);
  g.fillStyle = wet ? '#2e1c16' : '#5a3826'; g.fillRect(0, 0, W, T);            // alleys between houses
  for (const x0 of [16, 270]) {                // terracotta sidewalk tiles
    g.fillStyle = wet ? '#8a4630' : '#c9673a'; g.fillRect(x0, 0, 14, T);
    g.fillStyle = wet ? '#7a3d29' : '#b65932';
    for (let y = 0; y < T; y += 8) g.fillRect(x0 + ((y / 8) % 2) * 7, y, 7, 8);
    g.fillStyle = wet ? 'rgba(25,12,8,0.5)' : 'rgba(110,50,28,0.6)';
    for (let y = 0; y < T; y += 8) g.fillRect(x0, y, 14, 0.7);
    g.fillRect(x0 + 6.65, 0, 0.7, T);
    if (wet) { g.fillStyle = 'rgba(160,190,240,0.10)'; g.fillRect(x0, 0, 14, T); }
  }
  for (const x of [30, 266]) {                // curbs
    g.fillStyle = wet ? '#8f8a88' : '#ddd3c7'; g.fillRect(x, 0, 4, T);
    g.fillStyle = wet ? 'rgba(15,15,25,0.4)' : 'rgba(95,72,60,0.4)';
    for (let y = 0; y < T; y += 24) g.fillRect(x, y, 4, 0.9);
    g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(x + (x < 150 ? 0 : 3), 0, 1, T);
  }
  g.fillStyle = wet ? '#30323f' : '#58535f'; g.fillRect(34, 0, 232, T);
  g.fillStyle = wet ? 'rgba(8,10,18,0.55)' : 'rgba(30,22,30,0.35)'; g.fillRect(34, 0, 2.5, T); g.fillRect(263.5, 0, 2.5, T);
  g.fillStyle = wet ? 'rgba(0,0,0,0.14)' : 'rgba(28,20,32,0.13)';
  for (const c of RIDE.scooter.lanes) { g.fillRect(c - 19, 0, 9, T); g.fillRect(c + 10, 0, 9, T); }
  for (let i = 0; i < 5; i++) {               // repair patches, kept away from the tile seam
    const x = 42 + r() * 196, y = 30 + r() * (T - 110), w = 18 + r() * 26, h = 14 + r() * 40;
    rr(g, x, y, w, h, 3); fill(g, wet ? 'rgba(70,74,94,0.5)' : 'rgba(110,102,116,0.45)');
    ink(g, 0.7, wet ? 'rgba(8,8,18,0.5)' : 'rgba(40,30,40,0.35)');
  }
  for (let i = 0; i < 7; i++) {               // hairline cracks
    let x = 42 + r() * 216, y = 30 + r() * (T - 90);
    g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 4; j++) { x += (r() - 0.5) * 14; y += 5 + r() * 9; g.lineTo(x, y); }
    ink(g, 0.8, wet ? 'rgba(6,6,14,0.6)' : 'rgba(34,26,36,0.5)');
  }
  for (let i = 0; i < 1000; i++) {            // grit
    const x = 34 + r() * 232, y = r() * T, light = r() < 0.5;
    g.fillStyle = light ? (wet ? 'rgba(170,185,225,0.16)' : 'rgba(255,240,226,0.12)') : 'rgba(16,10,20,0.2)';
    g.fillRect(x, y, r() < 0.25 ? 1.6 : 1, 1);
  }
  if (wet) for (let i = 0; i < 10; i++) {    // wet sheen
    const x = 40 + r() * 216, y = 10 + r() * (T - 140), h = 90 + r() * 40;
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, 'rgba(150,178,235,0)'); gr.addColorStop(0.5, 'rgba(150,178,235,0.11)'); gr.addColorStop(1, 'rgba(150,178,235,0)');
    g.fillStyle = gr; g.fillRect(x, y, 5 + r() * 14, h);
  }
  const paint = wet ? 'rgba(236,232,222,0.8)' : '#fff3dc';
  g.fillStyle = paint; g.fillRect(38, 0, 2.4, T); g.fillRect(259.6, 0, 2.4, T);
  for (const x of [105, 190]) for (let y = 0; y < T; y += 48) { rr(g, x - 2.1, y + 8, 4.2, 26, 1.4); fill(g, paint); }
}

function drawMarkings(g, s) {
  const sc = s.scene, d = s.distance;
  g.fillStyle = s.rain ? 'rgba(236,232,222,0.6)' : 'rgba(255,243,220,0.88)';
  for (const c of sc.crossings) {             // zebra crossings
    const y = PLAYER_Y - (c - d);
    if (y < -30 || y > H + 30) continue;
    for (let x = 44; x < 256; x += 22) g.fillRect(x, y - 15, 12, 30);
  }
  for (const a of sc.arrows) {                // straight-ahead lane arrows
    const y = PLAYER_Y - (a.d - d);
    if (y < -40 || y > H + 40) continue;
    const x = RIDE.scooter.lanes[a.lane];
    g.fillRect(x - 2.2, y - 6, 4.4, 22);
    g.beginPath(); g.moveTo(x, y - 20); g.lineTo(x + 8, y - 6); g.lineTo(x - 8, y - 6); g.closePath(); g.fill();
  }
}

function drawSplashes(g, s, reduced) {
  const t = s.fx.t, n = reduced ? 6 : 16;
  g.strokeStyle = 'rgba(200,222,255,0.5)'; g.lineWidth = 0.9;
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const period = 0.55 + (i % 5) * 0.07, phase = t / period + i * 0.37, cycle = Math.floor(phase), age = phase - cycle;
    const h1 = mix(i * 977 + cycle, 5) / 4294967296, h2 = mix(i * 131 + cycle, 7) / 4294967296;
    const x = 42 + h1 * 216, y = 50 + h2 * 340 + age * period * s.speed, rx = 1.5 + age * 6;
    g.moveTo(x + rx, y); g.ellipse(x, y, rx, rx * 0.45, 0, 0, TAU);
  }
  g.stroke();
}

// The verge is cut into 240-unit chunks, each painted once into its own canvas while it is on screen.
function drawVerge(g, s, cache) {
  if (!s.scene) return;
  const tag = keysOf(s).verge;
  let vc = cache.verge;
  if (!vc || vc.tag !== tag) { if (vc) for (const cv of vc.map.values()) cv.width = cv.height = 1; vc = cache.verge = { tag, map: new Map() }; }
  const lo = s.distance - (H - PLAYER_Y) - 8, hi = s.distance + PLAYER_Y + 8;
  const k0 = Math.floor(lo / CHUNK), k1 = Math.floor(hi / CHUNK);
  for (let side = 0; side < 2; side++) {
    if (side) { g.save(); g.translate(W, 0); g.scale(-1, 1); }
    for (let k = k0; k <= k1; k++) {
      const id = k * 2 + side;
      const cv = vc.map.get(id) || chunk(s, cache, side, k);
      g.drawImage(cv, 0, PLAYER_Y - ((k + 1) * CHUNK - s.distance) - VPAD, VERGE_W, CHUNK + VPAD * 2);
    }
    if (side) g.restore();
  }
  if (vc.map.size > 12) for (const [id, cv] of vc.map) { const k = Math.floor(id / 2); if (k < k0 - 1 || k > k1 + 2) { cv.width = cv.height = 1; vc.map.delete(id); } }
}

function chunk(s, cache, side, k) {
  const cv = paintChunk(s, cache, side, k);
  cache.verge.map.set(k * 2 + side, cv);
  return cv;
}

// A chunk is opaque: the road plate under the verge is baked in first (mirrored for the right side, which is drawn
// mirrored), then houses, sidewalk life and trees.
function paintChunk(s, cache, side, k) {
  const hgt = CHUNK + VPAD * 2, scale = cache.scale, cw = Math.max(1, Math.ceil(VERGE_W * scale)), ch = Math.max(1, Math.ceil(hgt * scale));
  const cv = newCanvas(cw, ch), g = cv.getContext('2d', { alpha: false });
  g.setTransform(cw / VERGE_W, 0, 0, ch / hgt, 0, (VPAD * ch) / hgt);
  const sc = s.scene.sides[side], wet = s.rain, top = (k + 1) * CHUNK, lo = top - CHUNK;
  const road = entry(cache, wet ? 'road-wet' : 'road', BX.road, paintRoad, wet ? 1 : 0);
  const off = (((PLAYER_Y - top) % ROAD_TILE) + ROAD_TILE) % ROAD_TILE;   // road-plate row at this chunk's top
  g.save();
  if (side) { g.translate(W, 0); g.scale(-1, 1); }
  for (const dy of [-off - ROAD_TILE, -off, ROAD_TILE - off]) if (dy < CHUNK + VPAD && dy + ROAD_TILE > -VPAD) g.drawImage(road.cv, 0, dy, W, ROAD_TILE);
  g.restore();
  for (const h of sc.houses) if (h.d + h.len > lo - VPAD && h.d < top + VPAD) paintHouse(g, h, top - (h.d + h.len), wet);
  for (const it of sc.items) if (it.d > lo - 40 && it.d < top + 40) paintItem(g, it, top - it.d, wet);
  for (const t of sc.trees) if (t.d > lo - 30 && t.d < top + 30) { g.save(); g.translate(27, top - t.d); g.scale(t.size, t.size); paintTree(g, t.v, wet); g.restore(); }
  return cv;
}

function paintHouse(g, h, y, wet) {
  const len = h.len, col = ROOFS[h.color % ROOFS.length];
  const base = wet ? tint(col, -0.3) : col, dark = tint(col, wet ? -0.5 : -0.3), lite = tint(col, wet ? -0.1 : 0.3);
  g.fillStyle = base; g.fillRect(-6, y, 19.5, len);
  if (h.style === 0) {                        // clay tiles with a ridge cap
    g.strokeStyle = dark; g.lineWidth = 1; g.beginPath();
    for (let yy = y + 3; yy < y + len - 1; yy += 4.4) { g.moveTo(-6, yy); for (let x = -6; x < 13.5; x += 3.6) g.quadraticCurveTo(x + 1.8, yy + 2.4, x + 3.6, yy); }
    g.stroke();
    g.fillStyle = lite; g.fillRect(2.5, y, 2.4, len);
    g.fillStyle = dark; g.fillRect(4.9, y, 0.8, len);
  } else if (h.style === 1) {                 // corrugated sheet with a patch
    g.fillStyle = dark; for (let yy = y + 1.5; yy < y + len; yy += 3) g.fillRect(-6, yy, 19.5, 1);
    g.fillStyle = 'rgba(255,255,255,0.28)'; for (let yy = y + 0.6; yy < y + len; yy += 3) g.fillRect(-6, yy, 19.5, 0.6);
    g.fillStyle = 'rgba(122,68,38,0.3)'; g.fillRect(0, y + len * 0.3, 6, 8);
  } else if (h.style === 2) {                 // flat roof: water tank, laundry and a potted plant
    g.fillStyle = wet ? '#8a827c' : '#e2d4c4'; g.fillRect(-6, y, 19.5, len);
    g.fillStyle = wet ? '#6d6560' : '#c8b8a6'; g.fillRect(-6, y, 19.5, 1.6); g.fillRect(-6, y + len - 1.6, 19.5, 1.6); g.fillRect(11.5, y, 2, len);
    const ty = y + len * 0.3;
    circ(g, 4, ty, 5.4); fill(g, wet ? '#a2acb6' : '#dfe6ec'); ink(g, 1.2);
    circ(g, 4, ty, 3.4); ink(g, 0.8, C.metalD);
    circ(g, 2.4, ty - 2, 1.4); fill(g, 'rgba(255,255,255,0.8)');
    const ly = y + len * 0.62, cloth = ['#e8402f', '#6cc3ef', '#f7c242', '#fff3dc'];
    g.beginPath(); g.moveTo(-3.5, ly - 7); g.lineTo(-3.5, ly + 8); ink(g, 0.6, '#5a4a44');
    for (let i = 0; i < 3; i++) { g.fillStyle = wet ? tint(cloth[(h.color + i) % 4], -0.25) : cloth[(h.color + i) % 4]; g.fillRect(-5, ly - 6 + i * 4.6, 3, 3.6); }
    circ(g, 7.5, y + len * 0.8, 3); fill(g, wet ? '#4f8a45' : C.leaf); ink(g, 1); circ(g, 6.7, y + len * 0.8 - 0.8, 1.1); fill(g, C.mint);
  } else {                                    // a tiled rooftop terrace with plants and a chair
    g.fillStyle = dark;
    for (let yy = y, row = 0; yy < y + len; yy += 5, row++) for (let x = -6 + (row % 2) * 5; x < 13.5; x += 10) g.fillRect(x, yy, 5, Math.min(5, y + len - yy));
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(-6, y, 19.5, len);
    for (const [px, py] of [[8, y + 6], [8, y + len - 7]]) { circ(g, px, py, 3.2); fill(g, wet ? '#4f8a45' : C.leaf); ink(g, 1); circ(g, px - 0.8, py - 0.8, 1.1); fill(g, C.mint); }
    rr(g, 0, y + len / 2 - 3, 6, 6, 1.6); fill(g, wet ? '#9a3a30' : C.chili); ink(g, 0.9);
  }
  g.fillStyle = 'rgba(40,16,10,0.4)'; g.fillRect(-6, y + len - 1.4, 19.5, 1.4);
  g.fillStyle = dark; g.fillRect(13.5, y, 3, len);
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(13.5, y, 0.8, len);
  g.beginPath(); g.moveTo(16.5, y); g.lineTo(16.5, y + len); ink(g, 1.3);
  if (h.awning >= 0) {                        // a striped awning over the sidewalk
    const aw = AWNINGS[h.awning], awc = wet ? tint(aw, -0.25) : aw, cream = wet ? '#d6c9b3' : C.cream;
    const ay = y + len * 0.16, al = len * 0.68;
    g.fillStyle = 'rgba(25,12,8,0.26)'; g.fillRect(16.5, ay + 3, 10.5, al);
    for (let i = 0; i * 5 < al; i++) { g.fillStyle = i % 2 ? cream : awc; g.fillRect(16, ay + i * 5, 7, Math.min(5, al - i * 5)); }
    g.beginPath(); g.moveTo(23, ay);
    for (let yy = ay; yy < ay + al - 0.5; yy += 5) g.quadraticCurveTo(26.5, yy + 2.5, 23, Math.min(ay + al, yy + 5));
    g.closePath(); fill(g, awc);
    rr(g, 16, ay, 10.5, al, 1.5); ink(g, 1.2);
  } else {                                    // a shop sign sticking out over the sidewalk
    const sy = y + len * 0.45;
    rr(g, 16, sy - 1.6, 9.5, 3.2, 1); fill(g, wet ? tint(SIGNS[h.sign], -0.25) : SIGNS[h.sign]); ink(g, 0.9);
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(18, sy - 0.5, 5, 1);
  }
  if (h.flowers) {                            // bougainvillea spilling over the edge
    const fy = y + len * 0.74;
    for (let i = 0; i < 8; i++) { circ(g, 10 + (i % 3) * 2.2, fy + (i - 3.5) * 2.4, 2.1); fill(g, wet ? (i % 2 ? '#b8668a' : '#a84676') : i % 2 ? '#f28ab2' : '#e2589a'); }
    circ(g, 11, fy - 2, 1); fill(g, 'rgba(255,255,255,0.6)');
    circ(g, 9, fy + 4, 1.4); fill(g, wet ? '#3d6b37' : C.leaf);
  }
}

function paintItem(g, it, y, wet) {
  switch (it.kind) {
    case 'bikes': for (let i = 0; i < it.n; i++) paintBike(g, 23, y - i * 9.5, BIKES[(it.v + i * 2) % BIKES.length], wet); break;
    case 'pots': paintPots(g, 19.5, y, it.v, wet); break;
    case 'stools': paintStools(g, 23, y, it.v, wet); break;
    case 'vendor': paintVendor(g, 24, y, it.v, wet); break;
    case 'stall': g.save(); g.translate(13, y); paintStall(g, it.v % 2, wet); g.restore(); break;
    default: break;
  }
}

function paintBike(g, x, y, color, wet) {      // parked nose-in, as motorbikes line every sidewalk
  ell(g, x + 2, y + 2, 11, 3.8); fill(g, 'rgba(28,12,8,0.25)');
  rr(g, x - 11.5, y - 1.7, 5, 3.4, 1.6); fill(g, '#2b2730');
  rr(g, x + 6.5, y - 1.7, 5, 3.4, 1.6); fill(g, '#2b2730');
  rr(g, x - 8, y - 3.2, 16, 6.4, 3); fill(g, wet ? tint(color, -0.25) : color); ink(g, 1);
  rr(g, x - 1.5, y - 2.2, 7.5, 4.4, 2); fill(g, '#3b3540');
  g.beginPath(); g.moveTo(x - 7.5, y - 5); g.lineTo(x - 7.5, y + 5); ink(g, 1.5, '#4a4f5a');
  circ(g, x - 8, y - 5.6, 1.1); fill(g, C.metal); circ(g, x - 8, y + 5.6, 1.1); fill(g, C.metal);
  g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(x - 6, y - 2.4, 4, 1);
}

function paintPots(g, x, y, v, wet) {
  for (let i = 0; i < 3; i++) {
    const py = y + (i - 1) * 7.5, r = 3.2 + ((v + i) % 2) * 0.6;
    circ(g, x + 1, py + 1, r + 0.6); fill(g, 'rgba(28,12,8,0.22)');
    circ(g, x, py, r); fill(g, wet ? '#8e4f2c' : C.orangeD); ink(g, 1);
    circ(g, x, py, r - 1); fill(g, wet ? '#355f30' : C.leafD);
    for (let j = 0; j < 4; j++) { const a = j * 1.6 + i; circ(g, x + Math.cos(a) * 1.6, py + Math.sin(a) * 1.6, 1.4); fill(g, wet ? '#4f8a45' : C.leaf); }
    if ((v + i) % 3 === 0) { circ(g, x - 0.8, py - 0.8, 1); fill(g, i % 2 ? C.pink : C.mustard); }
  }
}

function paintStools(g, x, y, v, wet) {       // a low street-food table with plastic stools and two bowls
  const cols = [C.chili, C.skyD, C.chili, C.leaf];
  ell(g, x + 1.5, y + 1.5, 9, 9); fill(g, 'rgba(28,12,8,0.18)');
  rr(g, x - 5, y - 5, 10, 10, 1.8); fill(g, v % 2 ? '#7fcff2' : '#f3efe6'); ink(g, 1);
  circ(g, x - 1.5, y - 1, 2.2); fill(g, C.cream); ink(g, 0.7); circ(g, x - 1.5, y - 1, 1.4); fill(g, C.tomato);
  circ(g, x + 2, y + 1.6, 1.6); fill(g, C.cream); ink(g, 0.6);
  const seats = [[-9, -3], [9, 2], [-2, 9], [3, -9]];
  for (let i = 0; i < 4; i++) { const [dx, dy] = seats[i], c = cols[(v + i) % 4]; rr(g, x + dx - 2.6, y + dy - 2.6, 5.2, 5.2, 1.5); fill(g, wet ? tint(c, -0.25) : c); ink(g, 0.9); }
}

function paintVendor(g, x, y, v, wet) {       // a street vendor in a conical hat with two baskets on a pole
  const fruit = [[C.orange, C.mustard, C.tomato], [C.leaf, C.mint, C.leafD], [C.pink, C.chili, C.mustard], [C.mustard, C.orange, C.leaf]][v % 4];
  ell(g, x + 2, y + 2, 6, 17); fill(g, 'rgba(28,12,8,0.2)');
  for (const dy of [-12.5, 12.5]) {
    circ(g, x, y + dy, 5.6); fill(g, wet ? '#8f6a3a' : '#c4924e'); ink(g, 1.1);
    circ(g, x, y + dy, 4.2); ink(g, 0.6, 'rgba(90,50,20,0.6)');
    for (let i = 0; i < 4; i++) { const a = i * 1.7 + dy; circ(g, x + Math.cos(a) * 2, y + dy + Math.sin(a) * 2, 1.6); fill(g, wet ? tint(fruit[i % 3], -0.2) : fruit[i % 3]); }
  }
  g.beginPath(); g.moveTo(x, y - 12); g.lineTo(x, y + 12); ink(g, 2.4); g.beginPath(); g.moveTo(x, y - 12); g.lineTo(x, y + 12); ink(g, 1.4, '#e0b25e');
  ell(g, x, y, 5.5, 4); fill(g, ['#6cc3ef', '#f28ab2', '#8fd3a7', '#f7c242'][v % 4]); ink(g, 1);
  circ(g, x, y, 5.6); fill(g, wet ? '#cdb98a' : '#f3dfa6'); ink(g, 1.1);
  circ(g, x, y, 3.7); ink(g, 0.6, 'rgba(150,110,60,0.6)');
  circ(g, x, y, 1.8); ink(g, 0.6, 'rgba(150,110,60,0.6)');
  circ(g, x - 0.4, y - 0.4, 0.8); fill(g, '#fffaf0');
  shine(g, [x - 4, y - 1], [x - 3.5, y - 3.5], [x - 1, y - 4.2], 1, 0.6);
}

function paintTree(g, v, wet) {
  const r = prng(511 + v * 7), R = 18;
  ell(g, 5, 6, R * 1.05, R * 0.95); fill(g, 'rgba(28,12,8,0.26)');
  const blobs = [];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + r() * 0.8; blobs.push([Math.cos(a) * R * 0.42, Math.sin(a) * R * 0.42, R * (0.5 + r() * 0.16)]); }
  blobs.push([0, 0, R * 0.62]);
  const union = (dx = 0, dy = 0, k = 1) => { g.beginPath(); for (const [x, y, rad] of blobs) { g.moveTo(x + dx + rad * k, y + dy); g.arc(x + dx, y + dy, rad * k, 0, TAU); } };
  const palette = [[C.leaf, C.leafD, C.mint], ['#4f9a44', '#367a35', '#86c98a'], ['#6dbb52', '#468f3c', '#a8dc8c'], ['#5aa64c', '#3a7f37', '#8fd3a7']][v];
  const [base, shade] = wet ? palette.map(c => tint(c, -0.25)) : palette, hi = palette[2];
  union(); ink(g, 3.2); fill(g, shade);
  g.save(); union(); g.clip(); union(-2.6, -2.8, 0.94); fill(g, base); g.restore();
  for (let i = 0; i < 4; i++) { const [x, y, rad] = blobs[i]; ell(g, x - rad * 0.3, y - rad * 0.35, rad * 0.36, rad * 0.24, -0.6); fill(g, rgba(hi, wet ? 0.45 : 0.75)); }
  if (v === 3) for (let i = 0; i < 16; i++) {  // a flame tree in bloom
    const a = r() * TAU, d = r() * R * 0.8;
    circ(g, Math.cos(a) * d, Math.sin(a) * d, 1.5 + r()); fill(g, r() < 0.6 ? (wet ? '#c4442c' : '#ef5a3c') : (wet ? '#c97d30' : '#f59a3a'));
  }
}

function paintStall(g, v, wet) {
  ell(g, 4, 6, 18, 15); fill(g, 'rgba(28,12,8,0.24)');
  const stools = v ? [C.skyD, C.chili, C.skyD] : [C.chili, C.leaf, C.chili];
  [[-13, 10], [12, 11], [14, -9]].forEach(([x, y], i) => { rr(g, x - 3, y - 3, 6, 6, 1.6); fill(g, wet ? tint(stools[i], -0.25) : stools[i]); ink(g, 1); });
  const a = v ? [C.mustard, C.chili] : [C.chili, C.cream];
  for (let i = 0; i < 8; i++) {
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 15, (i / 8) * TAU, ((i + 1) / 8) * TAU); g.closePath();
    fill(g, wet ? tint(a[i % 2], -0.22) : a[i % 2]);
  }
  g.beginPath(); g.arc(0, 0, 15, Math.PI * 0.1, Math.PI * 0.9); g.arc(0, 0, 8, Math.PI * 0.9, Math.PI * 0.1, true); g.closePath(); fill(g, 'rgba(60,20,10,0.18)');
  for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos((i / 8) * TAU) * 15, Math.sin((i / 8) * TAU) * 15); ink(g, 0.7, 'rgba(74,42,34,0.6)'); }
  circ(g, 0, 0, 15); ink(g, 1.6);
  circ(g, 0, 0, 2.2); fill(g, C.woodD); ink(g, 1);
  shine(g, [-10, -6], [-8, -10], [-4, -12], 1.6, 0.5);
}

function paintLamp(g) {
  ell(g, 7, 6, 8, 2.2); fill(g, 'rgba(28,12,8,0.18)');
  circ(g, 0, 0, 2.8); fill(g, '#5b5f6b'); ink(g, 1.2);
  curve(g, [0, 0], [5, -4], [9, -2.5]); ink(g, 3.4); curve(g, [0, 0], [5, -4], [9, -2.5]); ink(g, 1.8, C.metalD);
  rr(g, 7, -5.5, 9, 6, 2.6); fill(g, '#fff3dc'); ink(g, 1.2);
  rr(g, 8.6, -4, 5.8, 2, 1); fill(g, '#ffe39a');
}

function paintLampPool(g) {
  const gr = g.createRadialGradient(0, 8, 0, 0, 8, 30);
  gr.addColorStop(0, 'rgba(255,207,115,0.42)'); gr.addColorStop(1, 'rgba(255,207,115,0)');
  g.fillStyle = gr; g.fillRect(-34, -22, 68, 60);
  const lg = g.createLinearGradient(0, 6, 0, 70);
  lg.addColorStop(0, 'rgba(255,205,120,0.3)'); lg.addColorStop(1, 'rgba(255,205,120,0)');
  g.fillStyle = lg; g.fillRect(-3.5, 6, 7, 64);
}

function drawLamps(g, s, cache) {
  const lo = s.distance - (H - PLAYER_Y) - 40, hi = s.distance + PLAYER_Y + 40;
  for (let side = 0; side < 2; side++) for (const l of s.scene.sides[side].lamps) {
    if (l.d < lo || l.d > hi) continue;
    const y = PLAYER_Y - (l.d - s.distance);
    g.save();
    if (side) { g.translate(W, 0); g.scale(-1, 1); }
    if (s.rain) { g.globalCompositeOperation = 'lighter'; sprite(g, cache, 'lampPool', BX.lampPool, paintLampPool, 40, y + 2); g.globalCompositeOperation = 'source-over'; }
    sprite(g, cache, 'lamp', BX.lamp, paintLamp, 28, y);
    if (s.rain) glow(g, cache, '#fff2b0', 39.5, y - 2.5, 8, 0.9);
    g.restore();
  }
}

function drawWires(g, s) {                    // power lines strung across the street, with their shadows on the road
  const d = s.distance;
  for (const w of s.scene.wires) {
    const ya = PLAYER_Y - (w.d - d), yb = PLAYER_Y - (w.d2 - d);
    if (Math.max(ya, yb) < -30 || Math.min(ya, yb) > H + 40) continue;
    const mid = (ya + yb) / 2;
    g.strokeStyle = 'rgba(20,10,10,0.14)'; g.lineWidth = 1;
    for (let i = 0; i < w.n; i++) { g.beginPath(); g.moveTo(38, ya + i * 2.2 + 10); g.quadraticCurveTo(150, mid + 22 + i * 5, 266, yb + i * 2.2 + 10); g.stroke(); }
    for (const [x, y] of [[31, ya], [269, yb]]) {
      circ(g, x + 2, y + 2, 3.4); fill(g, 'rgba(28,12,8,0.25)');
      circ(g, x, y, 3.2); fill(g, '#7b7f8a'); ink(g, 1.1);
      g.fillStyle = '#5b5f6b'; g.fillRect(x - 1, y - 7, 2, 14);
      circ(g, x - 0.8, y - 0.8, 1); fill(g, 'rgba(255,255,255,0.6)');
    }
    for (let i = 0; i < w.n; i++) {
      const o = (i - (w.n - 1) / 2) * 2.4;
      g.beginPath(); g.moveTo(31, ya + o); g.quadraticCurveTo(150, mid + 10 + i * 4, 269, yb + o);
      ink(g, 0.9, 'rgba(36,22,22,0.85)');
    }
  }
}

function drawFinishLine(g, y) {
  for (let row = 0; row < 2; row++) for (let i = 0; i < 29; i++) {
    g.fillStyle = (i + row) % 2 ? '#2b2730' : C.cream;
    g.fillRect(34 + i * 8, y - 8 + row * 8, 8, 8);
  }
  g.beginPath(); g.rect(34, y - 8, 232, 16); ink(g, 1.4);
}

function paintPothole(g, v, wet) {
  const outer = blobPts(101 + v * 7, 11, 23, 12.5, 0.2), inner = blobPts(211 + v * 7, 10, 17.5, 8.6, 0.24);
  blob(g, outer); fill(g, wet ? '#4f5263' : '#7d7682');
  const r = prng(41 + v);
  for (let i = 0; i < 9; i++) { const a = r() * TAU; rr(g, Math.cos(a) * 20 - 1.5, Math.sin(a) * 10.5 - 1, 3 + r() * 2, 2 + r(), 0.8); fill(g, wet ? '#5e6274' : '#938b98'); }
  blob(g, outer); ink(g, 1, 'rgba(74,42,34,0.55)');
  blob(g, inner); fill(g, wet ? '#3d4f6b' : '#3b3644');
  g.save(); blob(g, inner); g.clip(); g.translate(-2.2, -3); blob(g, inner); fill(g, wet ? '#1d2436' : '#1e1a24'); g.restore();
  if (wet) { ell(g, -3, -1.5, 9, 2.2, -0.08); fill(g, 'rgba(170,200,255,0.35)'); }
  blob(g, inner); ink(g, 1.6);
  for (let i = 0; i < 4; i++) {
    const a = r() * TAU, x = Math.cos(a) * 18, y = Math.sin(a) * 9;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 5 + (r() - 0.5) * 3, y + Math.sin(a) * 3 + (r() - 0.5) * 2); ink(g, 0.9, wet ? '#151a28' : '#2b2730');
  }
  for (let i = 0; i < 3; i++) { circ(g, (r() - 0.5) * 40, (r() - 0.5) * 20, 1 + r() * 0.8); fill(g, wet ? '#7c8090' : '#aaa2ae'); }
}

function paintPuddle(g, v, wet) {
  const pts = blobPts(301 + v * 13, 12, 28, 12.5, 0.18);
  g.save(); g.scale(1.2, 1.3); blob(g, pts); fill(g, wet ? 'rgba(6,8,16,0.3)' : 'rgba(28,22,36,0.22)'); g.restore();   // darker wet ring
  for (const [x, y, rx] of [[30, -6, 3], [-31, 5, 2.4], [24, 9, 1.8]]) { ell(g, x, y, rx, rx * 0.55); fill(g, wet ? '#4e78b0' : '#6aaee2'); }
  const gr = g.createLinearGradient(0, -13, 0, 13);
  if (wet) { gr.addColorStop(0, '#7aa8d8'); gr.addColorStop(0.55, '#4677b4'); gr.addColorStop(1, '#2f5a96'); }
  else { gr.addColorStop(0, '#a2d8f6'); gr.addColorStop(0.55, '#5aa2dc'); gr.addColorStop(1, '#3b78bf'); }
  blob(g, pts); g.fillStyle = gr; g.fill();
  g.save(); blob(g, pts); g.clip();
  g.translate(2, 2.4); blob(g, pts); ink(g, 3, 'rgba(30,70,140,0.35)');
  g.restore();
  g.save(); blob(g, pts); g.clip();          // a cloud reflected in the water
  for (const [x, y, rad] of [[-9, -3, 4.6], [-4, -5, 5.4], [1, -3, 4.2], [-6, -1, 4]]) { circ(g, x, y, rad); fill(g, wet ? 'rgba(220,230,250,0.22)' : 'rgba(255,255,255,0.4)'); }
  g.restore();
  shine(g, [-19, 2], [-17, -4], [-9, -7], 1.6, 0.8);
  shine(g, [8, -6], [12, -7], [16, -5.5], 1.2, 0.65);
  shine(g, [10, 5], [14, 5.5], [17, 4], 1, 0.4);
  blob(g, pts); ink(g, 1.3);
}

function drawFlat(g, s, o, cache) {
  const y = PLAYER_Y - (o.d - s.distance);
  if (y < -30 || y > H + 30) return;
  const wet = s.rain ? 1 : 0;
  g.save();
  g.translate(o.x, y);
  g.rotate((o.rot - Math.PI) * 0.06);
  if (o.kind === 'pothole') sprite(g, cache, KEYS.pot[wet][o.v], BX.pothole, paintPothole, 0, 0, 1.1, o.v, s.rain);
  else {
    sprite(g, cache, KEYS.pud[wet][o.v], BX.puddle, paintPuddle, 0, 0, 1, o.v, s.rain);
    if (s.rain) {                             // rain ripples
      const t = s.fx.t;
      g.lineWidth = 0.9;
      for (let i = 0; i < 2; i++) {
        const ph = (t * 1.4 + i * 0.5 + o.id * 0.31) % 1, rx = 2 + ph * 9;
        g.strokeStyle = `rgba(255,255,255,${(0.7 * (1 - ph)).toFixed(2)})`;
        ell(g, ((o.id * 37 + i * 29) % 30) - 15, ((o.id * 13 + i * 7) % 10) - 5, rx, rx * 0.42); g.stroke();
      }
    }
    if (o.hit && s.time - o.hitT < 0.6) {     // the splash ring
      const k = (s.time - o.hitT) / 0.6;
      ell(g, 0, 0, 20 + k * 22, 9 + k * 9); ink(g, 2 * (1 - k) + 0.3, `rgba(220,240,255,${(0.8 * (1 - k)).toFixed(2)})`);
    }
  }
  g.restore();
}

function paintCone(g) {
  ell(g, 4, 2.5, 13.5, 5); fill(g, 'rgba(28,12,8,0.32)');
  g.beginPath(); g.moveTo(-11.5, 0.5); g.lineTo(-8.5, -4.5); g.lineTo(8.5, -4.5); g.lineTo(11.5, 0.5); g.lineTo(11.5, 3); g.lineTo(-11.5, 3); g.closePath();
  fill(g, '#3b3540'); ink(g, 1.4);
  g.beginPath(); g.moveTo(-11.5, 0.5); g.lineTo(11.5, 0.5); ink(g, 0.8, 'rgba(255,255,255,0.25)');
  const body = () => { g.beginPath(); g.moveTo(-8.6, -3.2); g.lineTo(-2.7, -25.5); g.quadraticCurveTo(0, -28, 2.7, -25.5); g.lineTo(8.6, -3.2); g.quadraticCurveTo(0, -1.4, -8.6, -3.2); g.closePath(); };
  shaded(g, body, '#f7743a', '#cf4f28', -3.2, 0);
  g.save(); body(); g.clip();
  g.fillStyle = C.cream; g.fillRect(-10, -12, 20, 3.8); g.fillRect(-10, -19.6, 20, 3);
  g.fillStyle = 'rgba(200,160,120,0.6)'; g.fillRect(3, -12, 7, 3.8); g.fillRect(2, -19.6, 7, 3);
  g.restore();
  body(); ink(g, 1.6);
  g.beginPath(); g.moveTo(-5, -6); g.lineTo(-1.9, -22); ink(g, 1.6, 'rgba(255,255,255,0.5)');
}

function drawCone(g, s, o, cache) {
  const y = PLAYER_Y - (o.d - s.distance);
  if (y < -40 || y > H + 30) return;
  g.save();
  if (o.hit) {                                 // knocked flying, then gone
    const k = Math.min(1, (s.time - o.hitT) / 0.5), side = o.x < s.x ? -1 : o.x > s.x ? 1 : o.id % 2 ? 1 : -1;
    g.translate(o.x + side * k * 34, y - Math.sin(k * Math.PI) * 18);
    g.rotate(side * k * 2.2);
    g.globalAlpha = 1 - Math.max(0, (k - 0.6) / 0.4);
  } else g.translate(o.x, y + 8);
  sprite(g, cache, 'cone', BX.cone, paintCone, 0, 0, 1.08);
  g.restore();
}

function paintScooter(g) {
  ell(g, 3, 7, 19, 34); fill(g, 'rgba(28,12,8,0.3)');
  rr(g, -4.6, -40, 9.2, 15, 4.2); fill(g, '#2b2730'); ink(g, 1.4);
  rr(g, -1.4, -38, 2, 9, 1); fill(g, 'rgba(255,255,255,0.22)');
  rr(g, -4.4, 31, 8.8, 11.5, 4); fill(g, '#2b2730'); ink(g, 1.4);
  const cowl = () => { g.beginPath(); g.moveTo(-10.5, -12); g.bezierCurveTo(-11.5, -24, -7, -33, 0, -33.5); g.bezierCurveTo(7, -33, 11.5, -24, 10.5, -12); g.quadraticCurveTo(0, -9, -10.5, -12); g.closePath(); };
  shaded(g, cowl, C.sky, C.skyD, -2.6, -1.2); cowl(); ink(g);
  shine(g, [-6.5, -15], [-7.6, -25], [-2.5, -30], 1.8, 0.6);
  for (const sx of [-1, 1]) { rr(g, sx > 0 ? 11 : -18, 7, 7, 24, 3.2); fill(g, sx > 0 ? C.skyD : C.sky); ink(g, 1.4); }
  for (const sx of [-1, 1]) { ell(g, sx * 9.8, -12.5, 4.2, 5.2); fill(g, sx < 0 ? '#3e4f86' : '#2f3d6b'); ink(g, 1.3); }
  for (const sx of [-1, 1]) {
    g.beginPath(); g.moveTo(sx * 11, -20.5); g.lineTo(sx * 14.5, -27); ink(g, 1.5);
    ell(g, sx * 15.2, -28.6, 3.5, 2.5); fill(g, C.metal); ink(g, 1.2);
    ell(g, sx * 14.4, -29.2, 1.4, 0.8); fill(g, 'rgba(255,255,255,0.8)');
  }
  curve(g, [-17.5, -18.5], [0, -23], [17.5, -18.5]); ink(g, 3.8); curve(g, [-17.5, -18.5], [0, -23], [17.5, -18.5]); ink(g, 2, C.metalD);
  rr(g, -4.6, -26, 9.2, 5.6, 2.4); fill(g, C.cream); ink(g, 1.2);
  circ(g, 0, -23.2, 1.5); fill(g, C.skyD);
  for (const sx of [-1, 1]) {
    curve(g, [sx * 8.5, -4], [sx * 15.5, -10], [sx * 15.6, -18.5]); ink(g, 6.8);
    curve(g, [sx * 8.5, -4], [sx * 15.5, -10], [sx * 15.6, -18.5]); ink(g, 4.4, sx < 0 ? C.mustard : '#e2ab2c');
    circ(g, sx * 15.6, -19.4, 2.6); fill(g, C.skin); ink(g, 1.1);
  }
  const torso = () => rr(g, -11.5, -9.5, 23, 20, 8.5);
  shaded(g, torso, C.mustard, C.mustardD, -2.4, -1.4);
  g.save(); torso(); g.clip(); g.fillStyle = 'rgba(255,243,220,0.95)'; g.fillRect(-12, 1.8, 24, 2.6); g.fillStyle = C.chili; g.fillRect(-12, -10, 24, 2.4); g.restore();
  torso(); ink(g);
  const helm = () => circ(g, 0, -7.5, 8.8);
  shaded(g, helm, C.chili, C.chiliD, -2.2, -2.2);
  g.save(); helm(); g.clip(); rr(g, -2.2, -18, 4.4, 22, 2); fill(g, C.cream); g.restore();
  g.beginPath(); g.arc(0, -7.5, 8.8, -Math.PI * 0.86, -Math.PI * 0.14); ink(g, 2.8, '#2b2730');
  helm(); ink(g, 1.7);
  ell(g, -3.6, -11.4, 2.8, 1.6, -0.6); fill(g, 'rgba(255,255,255,0.6)');
  const lid = () => rr(g, -15.5, 4.5, 31, 12, 3);
  shaded(g, lid, '#f36a54', '#d44a37', -2, -1); lid(); ink(g);
  curve(g, [-12, 7.5], [0, 6.5], [12, 7.5]); ink(g, 1.2, 'rgba(255,255,255,0.45)');
  const face = () => rr(g, -15.5, 14.5, 31, 18.5, 3);
  shaded(g, face, C.chili, C.chiliD, -3.4, 0); face(); ink(g);
  g.fillStyle = 'rgba(255,243,220,0.9)'; g.fillRect(-14.5, 29.2, 29, 1.8);
  circ(g, 0, 22.8, 6.4); fill(g, C.cream); ink(g, 1.1);
  g.beginPath(); g.moveTo(-4.4, 22.6); g.lineTo(4.4, 22.6); g.quadraticCurveTo(4, 27.2, 0, 27.2); g.quadraticCurveTo(-4, 27.2, -4.4, 22.6); g.closePath(); fill(g, C.tomato); ink(g, 0.9);
  g.beginPath(); g.moveTo(0.8, 22.2); g.lineTo(4.2, 17.8); g.moveTo(2.2, 22.2); g.lineTo(5.2, 18.6); ink(g, 0.9, C.woodD);
  curve(g, [-2.2, 21.2], [-3.2, 19.6], [-1.8, 18]); ink(g, 0.8, C.chiliD);
  curve(g, [-0.2, 21], [-1.2, 19.2], [0.2, 17.6]); ink(g, 0.8, C.chiliD);
  rr(g, -6.8, 31.5, 13.6, 6, 3); fill(g, C.sky); ink(g, 1.2);
  rr(g, -5, 32.4, 10, 2.8, 1.3); fill(g, '#ff5a3c'); ink(g, 0.9);
  rr(g, -3.6, 35.6, 7.2, 3.4, 0.8); fill(g, C.cream); ink(g, 0.8);
  g.fillStyle = INK; g.fillRect(-2.4, 36.8, 1.6, 0.9); g.fillRect(-0.2, 36.8, 2.6, 0.9);
  rr(g, 10, 30, 3, 8, 1.4); fill(g, C.metalD); ink(g, 1);
}

const SCOOTER_SCALE = 1.12;
function drawScooter(g, s, cache, reduced) {
  const t = s.fx.t;
  let lean = 0;
  if (s.slide) { const p = Math.min(1, s.slide.t / s.slide.dur); lean = s.slide.dir * Math.sin(p * Math.PI) * (s.rain ? 0.26 : 0.2); }
  const jolt = s.invuln > 0.55 && !reduced ? Math.sin(t * 55) * 0.09 * ((s.invuln - 0.55) / 0.35) : 0;
  const blink = s.invuln > 0 && !s.finished && (reduced || Math.floor(s.invuln * 12) % 2 === 0);
  g.save();
  g.translate(s.x + (reduced ? 0 : s.fx.bump * 5 * Math.sin(t * 40)), PLAYER_Y + (reduced || s.finished ? 0 : Math.sin(t * 21) * 0.6));
  g.rotate(lean + jolt);
  if (blink) g.globalAlpha = reduced ? 0.6 : 0.35;
  sprite(g, cache, 'scooter', BX.scooter, paintScooter, 0, 0, SCOOTER_SCALE);
  g.globalAlpha = 1;
  if (s.slow > 0 || s.finished) glow(g, cache, '#ff4a3a', 0, 34 * SCOOTER_SCALE, 13, s.finished ? 0.5 : 0.85);
  g.restore();
}

function paintPin(g) {
  const pin = () => { g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-3, -6, -12, -12, -12, -21); g.arc(0, -21, 12, Math.PI, 0); g.bezierCurveTo(12, -12, 3, -6, 0, 0); g.closePath(); };
  shaded(g, pin, C.chili, C.chiliD, -3, -2); pin(); ink(g, 1.9);
  circ(g, 0, -21, 5.2); fill(g, C.cream); ink(g, 1.3);
  g.beginPath(); g.moveTo(-3, -21.5); g.lineTo(3, -21.5); g.quadraticCurveTo(2.8, -18, 0, -18); g.quadraticCurveTo(-2.8, -18, -3, -21.5); g.closePath(); fill(g, C.tomato);
  shine(g, [-8, -20], [-7.5, -27], [-3, -29.5], 1.8, 0.6);
}

function paintDest(g) {                       // the customer's house: origin where the gate meets the house front
  g.fillStyle = '#2f8f8a'; g.fillRect(0, -62, 24, 124);
  g.strokeStyle = '#1f6b67'; g.lineWidth = 1; g.beginPath();
  for (let y = -58; y < 60; y += 4.4) { g.moveTo(0, y); for (let x = 0; x < 24; x += 3.6) g.quadraticCurveTo(x + 1.8, y + 2.4, x + 3.6, y); }
  g.stroke();
  g.fillStyle = '#56b3ad'; g.fillRect(9, -62, 2.4, 124);
  g.fillStyle = '#1f6b67'; g.fillRect(-2.5, -62, 3, 124);
  g.beginPath(); g.moveTo(-2.5, -62); g.lineTo(-2.5, 62); ink(g, 1.4);
  g.fillStyle = 'rgba(28,12,8,0.25)'; g.fillRect(-13, -20, 10.5, 42);
  for (const y of [-18, 18]) { rr(g, -13, y - 3.6, 7.2, 7.2, 1.6); fill(g, C.cream); ink(g, 1.2); rr(g, -12.4, y - 4.6, 6, 2.4, 1); fill(g, C.chili); }
  g.beginPath(); g.moveTo(-9.4, -14.4); g.lineTo(-3, -7); ink(g, 2.8); g.beginPath(); g.moveTo(-9.4, -14.4); g.lineTo(-3, -7); ink(g, 1.4, C.chiliD);
  g.beginPath(); g.moveTo(-9.4, 14.4); g.lineTo(-3, 7); ink(g, 2.8); g.beginPath(); g.moveTo(-9.4, 14.4); g.lineTo(-3, 7); ink(g, 1.4, C.chiliD);
  rr(g, -12, -5, 6.5, 10, 1.6); fill(g, C.mustard); ink(g, 1);
  g.fillStyle = C.chili; g.fillRect(-11, -2.4, 4.5, 1.2); g.fillRect(-11, 1.2, 4.5, 1.2);
  for (const [x, y] of [[-8, -27], [-8, 27]]) { circ(g, x, y, 4); fill(g, C.leafD); ink(g, 1.1); for (let i = 0; i < 5; i++) { circ(g, x + Math.cos(i * 1.3) * 2, y + Math.sin(i * 1.3) * 2, 0.9); fill(g, C.orange); } }
  circ(g, 4, -40, 4.2); fill(g, C.chili); ink(g, 1.1); g.fillStyle = C.mustard; g.fillRect(3, -45, 2, 1.6); g.fillRect(3, -36, 2, 1.6);
  circ(g, 4, 40, 4.2); fill(g, C.chili); ink(g, 1.1); g.fillStyle = C.mustard; g.fillRect(3, 35, 2, 1.6); g.fillRect(3, 44, 2, 1.6);
}

function drawCustomer(g, x, y, t, reduced) {
  ell(g, x + 1.5, y + 8, 6.5, 2.5); fill(g, 'rgba(28,12,8,0.3)');
  rr(g, x - 4.8, y - 4, 9.6, 12, 4.2); fill(g, C.pink); ink(g, 1.2);
  const wave = reduced ? 0.2 : Math.sin(t * 9) * 0.45;
  g.save(); g.translate(x - 3.8, y - 1.6); g.rotate(-2.2 + wave);
  g.beginPath(); g.moveTo(0, 0); g.lineTo(9, 0); ink(g, 3.8); g.beginPath(); g.moveTo(0, 0); g.lineTo(9, 0); ink(g, 2.2, C.pink);
  circ(g, 9.6, 0, 2); fill(g, C.skin); ink(g, 1);
  g.restore();
  circ(g, x, y - 8.5, 4.8); fill(g, C.skin); ink(g, 1.2);
  g.beginPath(); g.arc(x, y - 9, 4.9, Math.PI * 1.02, Math.PI * 2.02); g.lineTo(x + 3, y - 10); g.quadraticCurveTo(x, y - 9.5, x - 4.6, y - 8.6); g.closePath(); fill(g, '#3a2420');
  circ(g, x + 2.8, y - 13.6, 2.3); fill(g, '#3a2420'); ink(g, 0.9);
  circ(g, x - 1.8, y - 8, 0.7); fill(g, INK); circ(g, x + 1.2, y - 8, 0.7); fill(g, INK);
  curve(g, [x - 1.4, y - 6.4], [x - 0.3, y - 5.4], [x + 0.9, y - 6.4]); ink(g, 0.8);
  circ(g, x - 3.1, y - 6.6, 0.9); fill(g, 'rgba(242,138,178,0.7)');
}

function drawDestination(g, s, cache, reduced) {
  const y = PLAYER_Y - (s.total - s.distance);
  if (y < -110 || y > H + 70) return;
  const t = s.fx.t;
  sprite(g, cache, 'dest', BX.dest, paintDest, 284, y);
  drawCustomer(g, 275, y + 2, t, reduced);
  const bob = reduced ? 0 : Math.sin(t * 4.2) * 3, ring = reduced ? 0.5 : (t * 1.2) % 1;
  ell(g, 252, y + 2, 7 + ring * 12, 3 + ring * 5); ink(g, 2, `rgba(232,64,47,${(0.75 * (1 - ring)).toFixed(2)})`);
  ell(g, 252, y + 2, 6, 2.6); fill(g, 'rgba(28,12,8,0.3)');
  sprite(g, cache, 'pin', BX.pin, paintPin, 252, y - 8 + bob);
}

function drawRain(g, s, reduced) {
  const t = s.fx.t, n = reduced ? 28 : 74;
  g.strokeStyle = 'rgba(205,224,255,0.5)'; g.lineWidth = 1.1; g.lineCap = 'round';
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const sp = 560 + ((i * 37) % 220), y = ((i * 131.3 + t * sp) % 470) - 40;
    const x = ((i * 73.7) % 330) - 10 - y * 0.16;
    g.moveTo(x, y); g.lineTo(x - 3.6, y + 15);
  }
  g.stroke();
}

// ── space ──
const STAR_COLORS = ['#ffffff', '#fff3dc', '#cfe8ff', '#ffe0f0', '#fff0b8'];

// One opaque plate holds everything slow: deep blue banding, the nebula in the planet's colours, dust lanes and the
// far stars. It tiles every SKY_TILE units and scrolls at a twentieth of the flight speed.
const SKY_TILE = 480;
function wrapBlob(g, x, y, rad, color, a) {
  for (const oy of [-SKY_TILE, 0, SKY_TILE]) {
    if (y + oy + rad < 0 || y + oy - rad > SKY_TILE) continue;
    const gr = g.createRadialGradient(x, y + oy, 0, x, y + oy, rad);
    gr.addColorStop(0, rgba(color, a)); gr.addColorStop(0.55, rgba(color, a * 0.4)); gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr; g.fillRect(x - rad, y + oy - rad, rad * 2, rad * 2);
  }
}
function paintSky(g, p, seed) {
  const r = prng(mix(seed, 31)), c = p.colors, cols = [c.base, c.shade, c.accent, c.base];
  // The soft layers are painted at low resolution and blown up once: smooth gradients lose nothing, and the plate
  // costs a fraction of the time on a slow phone.
  const q = 0.6, soft = newCanvas(Math.ceil(W * q), Math.ceil(SKY_TILE * q)), s = soft.getContext('2d', { alpha: false });
  s.setTransform(q, 0, 0, q, 0, 0);
  s.fillStyle = '#0e1a3a'; s.fillRect(0, 0, W, SKY_TILE);
  for (let i = 0; i < 5; i++) wrapBlob(s, r() * W, r() * SKY_TILE, 150 + r() * 120, i % 2 ? '#1b2a55' : '#070d26', 0.75);
  const strong = p.id === 'nebula' ? 1.35 : 1;
  for (let i = 0; i < 7; i++) wrapBlob(s, r() * W, r() * SKY_TILE, 70 + r() * 110, cols[i % 4], (0.15 + r() * 0.14) * strong);
  for (let i = 0; i < 3; i++) {
    const y = r() * SKY_TILE, x = r() * W, w = 16 + r() * 18;
    for (const oy of [-SKY_TILE, 0, SKY_TILE]) { s.beginPath(); s.moveTo(x - 120, y + oy); s.bezierCurveTo(x - 40, y + oy - 40, x + 40, y + oy + 40, x + 120, y + oy - 10); ink(s, w, 'rgba(6,10,30,0.12)'); }
  }
  g.drawImage(soft, 0, 0, W, SKY_TILE);
  soft.width = soft.height = 1;
  for (let i = 0; i < 95; i++) {
    const x = r() * W, y = r() * SKY_TILE, size = 0.6 + r() * 0.7, a = 0.3 + r() * 0.45;
    g.globalAlpha = a; g.fillStyle = STAR_COLORS[Math.floor(r() * STAR_COLORS.length)];
    g.fillRect(x, y, size, size);
    if (y < 2) g.fillRect(x, y + SKY_TILE, size, size);
  }
  g.globalAlpha = 1;
}

const MID_STARS = new Map();
function midStars(seed) {
  let list = MID_STARS.get(seed);
  if (!list) {
    const r = prng(mix(seed, 12));
    list = Array.from({ length: 46 }, () => [r() * W, r() * H, 0.9 + r() * 1.3, STAR_COLORS[Math.floor(r() * STAR_COLORS.length)], 0.55 + r() * 0.4]);
    if (MID_STARS.size > 16) MID_STARS.clear();
    MID_STARS.set(seed, list);
  }
  return list;
}

function paintFarPlanet(g) {
  ell(g, 0, 0, 25, 6, -0.3); ink(g, 2.2, 'rgba(143,211,167,0.35)');
  const body = () => circ(g, 0, 0, 13);
  shaded(g, body, '#2f8f8a', '#1f5f68', -3, -3);
  g.save(); body(); g.clip(); g.fillStyle = 'rgba(143,211,167,0.35)'; g.fillRect(-14, -5, 28, 2.4); g.fillRect(-14, 2, 28, 1.6); g.restore();
  body(); ink(g, 1.4, 'rgba(10,16,40,0.8)');
  g.beginPath(); g.ellipse(0, 0, 25, 6, -0.3, 0, Math.PI); ink(g, 2.2, 'rgba(143,211,167,0.55)');
}

function paintBeacon(g) {
  rr(g, -5, -7, 10, 14, 4); fill(g, '#46518a'); ink(g, 1.3, '#11163a');
  rr(g, -3.5, -5.5, 3, 11, 1.5); fill(g, 'rgba(255,255,255,0.28)');
  g.beginPath(); g.moveTo(0, -7); g.lineTo(0, -12); ink(g, 1.2, '#8e9aa6');
  rr(g, -9.5, -2, 4.5, 4, 1); fill(g, '#2f7fc1'); ink(g, 0.8, '#11163a'); rr(g, 5, -2, 4.5, 4, 1); fill(g, '#2f7fc1'); ink(g, 0.8, '#11163a');
}

function paintAsteroid(g, R, v) {
  const big = R > 20, pts = blobPts(400 + v * 37 + (big ? 900 : 0), big ? 14 : 11, R, R * 0.93, 0.22);
  const body = () => blob(g, pts);
  const gr = g.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.15, 0, 0, R * 1.05);
  gr.addColorStop(0, '#b8a08e'); gr.addColorStop(0.6, '#8c7366'); gr.addColorStop(1, '#5e4943');
  body(); g.fillStyle = gr; g.fill();
  g.save(); body(); g.clip();
  const r = prng(77 + v * 13 + (big ? 5 : 0));
  for (let i = 0, n = big ? 6 : 3; i < n; i++) {
    const a = r() * TAU, dd = r() * R * 0.6, cr = R * (0.12 + r() * 0.15), x = Math.cos(a) * dd, y = Math.sin(a) * dd;
    ell(g, x, y, cr, cr * 0.82); fill(g, '#6a5650');
    ell(g, x - cr * 0.15, y - cr * 0.18, cr * 0.78, cr * 0.6); fill(g, '#56443f');
    g.beginPath(); g.ellipse(x, y, cr, cr * 0.82, 0, 0.05 * Math.PI, 0.95 * Math.PI); ink(g, 1.1, 'rgba(232,206,186,0.8)');
  }
  for (let i = 0, n = big ? 28 : 11; i < n; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,236,215,0.28)' : 'rgba(45,28,28,0.32)'; g.fillRect((r() - 0.5) * 2 * R, (r() - 0.5) * 2 * R, 1.3, 1.3); }
  g.restore();
  body(); ink(g, big ? 2.4 : 1.9);
}

function paintRockLight(g, R) {                 // fixed top-left light laid over a spinning rock
  const r1 = R * 0.74;
  let gr = g.createRadialGradient(-R * 0.35, -R * 0.4, 0, -R * 0.35, -R * 0.4, r1);
  gr.addColorStop(0, 'rgba(255,238,215,0.34)'); gr.addColorStop(1, 'rgba(255,238,215,0)');
  circ(g, 0, 0, r1); g.fillStyle = gr; g.fill();
  gr = g.createRadialGradient(R * 0.42, R * 0.46, 0, R * 0.42, R * 0.46, r1 * 1.1);
  gr.addColorStop(0, 'rgba(30,14,30,0.45)'); gr.addColorStop(1, 'rgba(30,14,30,0)');
  circ(g, 0, 0, r1); g.fillStyle = gr; g.fill();
}

function paintDebris(g, v) {
  if (v === 0) {                              // a snapped solar wing
    g.beginPath(); g.moveTo(-17, 1); g.lineTo(-4, 0); ink(g, 4.2); g.beginPath(); g.moveTo(-17, 1); g.lineTo(-4, 0); ink(g, 2.2, C.metalD);
    circ(g, -17, 1, 2.8); fill(g, C.metal); ink(g, 1.2);
    const panel = () => { g.beginPath(); g.moveTo(-5, -9); g.lineTo(17, -9); g.lineTo(17, 3); g.lineTo(12, 9); g.lineTo(-5, 9); g.closePath(); };
    panel(); fill(g, C.metal);
    g.save(); panel(); g.clip();
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { rr(g, -3.6 + i * 5.2, -7.6 + j * 5.3, 4.4, 4.5, 0.8); fill(g, (i + j) % 2 ? '#2f7fc1' : '#2867ad'); }
    g.beginPath(); g.moveTo(-6, 6); g.lineTo(5, -10); g.lineTo(10, -10); g.lineTo(-1, 6); g.closePath(); fill(g, 'rgba(170,225,255,0.4)');
    g.restore();
    panel(); ink(g, 1.6);
    curve(g, [12, 9], [17, 13], [12, 16]); ink(g, 1.3, C.orange);
  } else if (v === 1) {                       // a girder chunk with a hazard stripe
    const beam = () => { g.beginPath(); g.moveTo(-17, -6.5); g.lineTo(12, -6.5); g.lineTo(17, -2); g.lineTo(13, 1); g.lineTo(17, 5.5); g.lineTo(-15, 6.5); g.lineTo(-17, 2); g.closePath(); };
    shaded(g, beam, '#bcc6d0', '#7f8b97', -2, -2);
    g.save(); beam(); g.clip();
    for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(-19 + i * 4, -8); g.lineTo(-16 + i * 4, -8); g.lineTo(-20 + i * 4, 8); g.lineTo(-23 + i * 4, 8); g.closePath(); fill(g, i % 2 ? '#3a3440' : C.mustard); }
    g.restore();
    for (const x of [-3, 5]) { circ(g, x, 0, 2.4); fill(g, '#2e3346'); ink(g, 0.9); }
    for (const x of [-7, 1, 9]) { circ(g, x, -4, 0.9); fill(g, '#ffffff'); circ(g, x, 4, 0.9); fill(g, '#5f6a77'); }
    beam(); ink(g, 1.6);
  } else {                                    // a little dish antenna
    g.beginPath(); g.moveTo(0, 3); g.lineTo(-6, 14); g.moveTo(0, 3); g.lineTo(6, 14); ink(g, 3); g.beginPath(); g.moveTo(0, 3); g.lineTo(-6, 14); g.moveTo(0, 3); g.lineTo(6, 14); ink(g, 1.5, C.metalD);
    const dish = () => ell(g, 0, -2, 14, 9);
    shaded(g, dish, '#fff3dc', '#d4c3a6', -2.5, -2);
    ell(g, 0, -2, 9, 5.5); ink(g, 1, 'rgba(74,42,34,0.35)');
    dish(); ink(g, 1.7);
    g.beginPath(); g.moveTo(0, -2); g.lineTo(0, -12); ink(g, 1.8);
    circ(g, 0, -13, 2.4); fill(g, C.chili); ink(g, 1);
    shine(g, [-10, -3], [-9, -8], [-4, -9.5], 1.6, 0.7);
  }
}

function paintCometCore(g) {
  const pts = blobPts(888, 9, 8.2, 7.6, 0.18);
  const gr = g.createRadialGradient(-2.5, -2.5, 0.5, 0, 0, 9);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, '#fff0b8'); gr.addColorStop(1, '#ffad42');
  blob(g, pts); g.fillStyle = gr; g.fill(); ink(g, 1.5);
  ell(g, -2.6, -3, 2.4, 1.4, -0.6); fill(g, 'rgba(255,255,255,0.85)');
  circ(g, 2.4, 2, 1.4); fill(g, 'rgba(201,103,42,0.45)');
}

function paintCometTail(g) {                    // the head sits at the origin and the tail streams toward -y
  const gr = g.createLinearGradient(0, 0, 0, -88);
  gr.addColorStop(0, 'rgba(255,236,170,0.95)'); gr.addColorStop(0.3, 'rgba(255,150,90,0.6)'); gr.addColorStop(1, 'rgba(255,80,140,0)');
  g.beginPath(); g.moveTo(9, 0); g.quadraticCurveTo(9, -30, 0, -88); g.quadraticCurveTo(-9, -30, -9, 0); g.closePath();
  g.fillStyle = gr; g.fill();
  const core = g.createLinearGradient(0, 0, 0, -54);
  core.addColorStop(0, 'rgba(255,255,230,0.5)'); core.addColorStop(1, 'rgba(255,255,230,0)');
  g.beginPath(); g.moveTo(4, 0); g.lineTo(0, -54); g.lineTo(-4, 0); g.closePath(); g.fillStyle = core; g.fill();
}

function paintCanister(g) {
  const body = () => rr(g, -7.5, -10, 15, 21, 5);
  shaded(g, body, '#86e86f', '#3f9a3a', -3, 0); body(); ink(g, 1.6);
  rr(g, -5, -14.5, 10, 5.5, 2); fill(g, C.mustard); ink(g, 1.3);
  rr(g, -7.5, -3.2, 15, 7.4, 1.4); fill(g, C.cream); ink(g, 1);
  g.beginPath(); g.moveTo(1.2, -2.4); g.lineTo(-2.4, 1); g.lineTo(0, 1); g.lineTo(-1.2, 3.6); g.lineTo(2.6, -0.2); g.lineTo(0.2, -0.2); g.closePath(); fill(g, C.chili);
  rr(g, -5.6, -8, 2.2, 15, 1.1); fill(g, 'rgba(255,255,255,0.55)');
}

function paintShip(g) {
  for (const sx of [-1, 1]) {
    const fin = () => { g.beginPath(); g.moveTo(sx * 8, -3); g.quadraticCurveTo(sx * 20, 5, sx * 22.5, 20); g.quadraticCurveTo(sx * 15, 20.5, sx * 8, 15); g.closePath(); };
    fin(); fill(g, sx < 0 ? C.chili : '#d63a2b');
    g.save(); fin(); g.clip(); g.beginPath(); g.moveTo(sx * 6, 11); g.lineTo(sx * 26, 15); g.lineTo(sx * 26, 26); g.lineTo(sx * 6, 26); g.closePath(); fill(g, C.chiliD); g.restore();
    fin(); ink(g, 1.7);
    circ(g, sx * 21.4, 19, 2.3); fill(g, C.cream); ink(g, 1);
  }
  for (const sx of [-1, 1]) { rr(g, sx * 6 - 3.6, 13, 7.2, 9, 2.6); fill(g, C.metalD); ink(g, 1.3); rr(g, sx * 6 - 2.2, 19.4, 4.4, 2.2, 1); fill(g, '#3d4250'); }
  const hull = () => { g.beginPath(); g.moveTo(0, -28); g.bezierCurveTo(9, -27, 13.6, -13, 13.2, 1); g.bezierCurveTo(12.8, 12, 8, 18, 0, 18); g.bezierCurveTo(-8, 18, -12.8, 12, -13.2, 1); g.bezierCurveTo(-13.6, -13, -9, -27, 0, -28); g.closePath(); };
  shaded(g, hull, '#fbf4e8', '#d8c5ad', -3, -1);
  g.save(); hull(); g.clip();
  g.beginPath(); g.moveTo(-15, -17); g.quadraticCurveTo(0, -21.5, 15, -17); g.lineTo(15, -31); g.lineTo(-15, -31); g.closePath(); fill(g, C.chili);
  g.beginPath(); g.moveTo(5, -31); g.lineTo(15, -31); g.lineTo(15, 20); g.lineTo(9, 20); g.quadraticCurveTo(12, 0, 5, -31); g.closePath(); fill(g, 'rgba(120,60,40,0.16)');
  g.restore();
  hull(); ink(g, 1.8);
  shine(g, [-8.5, -6], [-9.5, -17], [-4, -24], 1.8, 0.7);
  for (const [x, y] of [[-9, 3], [9, 3], [-7, 12], [7, 12]]) { circ(g, x, y, 0.8); fill(g, 'rgba(74,42,34,0.55)'); }
  const cock = () => ell(g, 0, -9, 7.2, 8.8);
  const cg = g.createLinearGradient(-6, -17, 6, -1);
  cg.addColorStop(0, '#d6f3ff'); cg.addColorStop(0.45, '#6cc3ef'); cg.addColorStop(1, '#2f7fc1');
  cock(); g.fillStyle = cg; g.fill();
  circ(g, 0, -7.6, 3.8); fill(g, C.cream); ink(g, 1);
  g.beginPath(); g.arc(0, -7.6, 3.8, -Math.PI * 0.95, -Math.PI * 0.05); ink(g, 1.8, C.chili);
  cock(); ink(g, 1.5);
  shine(g, [-4.6, -10], [-4.8, -14.5], [-1.5, -16.2], 1.6, 0.85);
  circ(g, 0, 9, 6.8); fill(g, C.cream); ink(g, 1.4);
  circ(g, 0, 9, 5.1); fill(g, '#ef5a3c');
  g.save(); circ(g, 0, 9, 5.1); g.clip();
  g.strokeStyle = C.mustard; g.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-5, 7 + i * 2); g.bezierCurveTo(-2, 5 + i * 2, 1, 9 + i * 2, 5, 7 + i * 2); g.stroke(); }
  g.restore();
  ell(g, 2, 7.4, 2.3, 1.7); fill(g, '#ffffff'); circ(g, 2.2, 7.4, 0.95); fill(g, '#f7a21b');
  circ(g, -2.4, 10.4, 0.8); fill(g, C.leaf); circ(g, -0.6, 11.6, 0.7); fill(g, C.leaf);
  circ(g, 0, 9, 5.1); ink(g, 0.9, C.chiliD);
  g.beginPath(); g.arc(0, 9, 6.8, Math.PI * 1.1, Math.PI * 1.55); ink(g, 1.4, 'rgba(255,255,255,0.75)');
}

function paintPlanet(g, p) {
  const c = p.colors, id = p.id, R = 150;
  const halo = g.createRadialGradient(0, 0, R * 0.92, 0, 0, R * 1.32);
  halo.addColorStop(0, rgba(c.accent, 0.38)); halo.addColorStop(1, rgba(c.accent, 0));
  circ(g, 0, 0, R * 1.32); g.fillStyle = halo; g.fill();
  if (id === 'ring') planetRing(g, R, c, false);
  const body = () => circ(g, 0, 0, R);
  const gr = g.createRadialGradient(-R * 0.4, -R * 0.45, R * 0.05, 0, 0, R);
  gr.addColorStop(0, tint(c.base, 0.3)); gr.addColorStop(0.62, c.base); gr.addColorStop(1, c.shade);
  body(); g.fillStyle = gr; g.fill();
  g.save(); body(); g.clip();
  const r = prng(901 + id.length * 17);
  if (id === 'moon') {
    for (let i = 0; i < 14; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * R * 0.9, cr = R * (0.04 + r() * 0.1), x = Math.cos(a) * d, y = Math.sin(a) * d;
      ell(g, x, y, cr, cr * 0.85); fill(g, rgba(c.shade, 0.7));
      ell(g, x - cr * 0.18, y - cr * 0.2, cr * 0.75, cr * 0.6); fill(g, rgba('#6f7c88', 0.55));
      g.beginPath(); g.ellipse(x, y, cr, cr * 0.85, 0, 0.05 * Math.PI, 0.95 * Math.PI); ink(g, Math.max(1, R * 0.012), 'rgba(255,255,255,0.6)');
    }
    for (let i = 0; i < 7; i++) { circ(g, -R * 0.15 + i * R * 0.05, R * 0.6 + (i % 2) * R * 0.03, R * 0.014); fill(g, c.accent); }
    ell(g, -R * 0.0, R * 0.58, R * 0.08, R * 0.045); fill(g, rgba(c.accent, 0.5));
  } else if (id === 'mars') {
    for (let i = 0; i < 6; i++) { ell(g, (r() - 0.5) * R * 1.4, (r() - 0.5) * R * 1.4, R * (0.12 + r() * 0.2), R * (0.06 + r() * 0.1), r() * 3); fill(g, rgba(c.shade, 0.45)); }
    for (let i = 0; i < 7; i++) {
      const y = -R * 0.8 + i * R * 0.27, w = R * (0.5 + r() * 0.6), x = (r() - 0.5) * R * 0.6;
      g.beginPath(); g.moveTo(x - w, y); g.bezierCurveTo(x - w * 0.3, y - R * 0.14, x + w * 0.3, y + R * 0.14, x + w, y - R * 0.04);
      ink(g, R * (0.03 + r() * 0.04), rgba(c.accent, 0.35 + r() * 0.25));
    }
    ell(g, -R * 0.1, -R * 0.94, R * 0.38, R * 0.14); fill(g, 'rgba(255,243,220,0.85)');
  } else if (id === 'ice') {
    blob(g, blobPts(61, 12, R * 0.85, R * 0.32, 0.25).map(([x, y]) => [x, y - R * 0.82])); fill(g, 'rgba(255,255,255,0.92)');
    blob(g, blobPts(62, 12, R * 0.7, R * 0.26, 0.25).map(([x, y]) => [x, y + R * 0.86])); fill(g, 'rgba(255,255,255,0.85)');
    for (let i = 0; i < 9; i++) {
      let x = (r() - 0.5) * R * 1.4, y = (r() - 0.5) * R * 1.1;
      g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 4; j++) { x += (r() - 0.5) * R * 0.3; y += (r() - 0.5) * R * 0.2; g.lineTo(x, y); }
      ink(g, Math.max(1, R * 0.012), 'rgba(255,255,255,0.55)');
    }
    for (let i = 0; i < 10; i++) { const x = (r() - 0.5) * R * 1.5, y = (r() - 0.5) * R * 1.2; circ(g, x, y, R * 0.012 + 0.6); fill(g, '#ffffff'); }
  } else if (id === 'ring') {
    for (let i = 0; i < 9; i++) { const y = -R + i * R * 0.24 + r() * R * 0.05; g.fillStyle = i % 2 ? rgba(c.shade, 0.45) : rgba(c.accent, 0.5); g.fillRect(-R, y, R * 2, R * (0.06 + r() * 0.08)); }
    ell(g, R * 0.3, R * 0.45, R * 0.16, R * 0.09); fill(g, rgba('#b85a2a', 0.7)); ell(g, R * 0.28, R * 0.43, R * 0.08, R * 0.04); fill(g, rgba('#ffe7c2', 0.5));
  } else {
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      const x = (r() - 0.5) * R * 1.4, y = (r() - 0.5) * R * 1.4, rad = R * (0.25 + r() * 0.35), col = i % 3 ? c.accent : c.base;
      const cg = g.createRadialGradient(x, y, 0, x, y, rad);
      cg.addColorStop(0, rgba(col, 0.42)); cg.addColorStop(1, rgba(col, 0));
      g.fillStyle = cg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 5; i++) { const y = -R * 0.6 + i * R * 0.3; g.beginPath(); g.moveTo(-R, y); g.bezierCurveTo(-R * 0.3, y - R * 0.2, R * 0.3, y + R * 0.2, R, y); ink(g, R * 0.035, 'rgba(255,255,255,0.18)'); }
  }
  g.beginPath(); g.arc(0, 0, R + 2, 0, TAU); g.arc(-R * 0.2, -R * 0.24, R * 0.99, 0, TAU); g.fillStyle = rgba(c.shade, 0.5); g.fill('evenodd');
  g.restore();
  ell(g, -R * 0.42, -R * 0.5, R * 0.2, R * 0.1, -0.7); fill(g, 'rgba(255,255,255,0.35)');
  body(); ink(g, Math.max(2, R * 0.016));
  if (id === 'ring') planetRing(g, R, c, true);
}

function planetRing(g, R, c, front) {
  const a0 = front ? 0 : Math.PI, a1 = front ? Math.PI : TAU, tilt = -0.2;
  for (const [rx, ry, w, col] of [[1.78, 0.44, 0.11, c.accent], [1.56, 0.385, 0.07, c.shade], [1.4, 0.345, 0.05, tint(c.accent, 0.2)]]) {
    g.beginPath(); g.ellipse(0, 0, R * rx, R * ry, tilt, a0, a1);
    g.lineCap = 'butt'; g.lineWidth = R * w + 3; g.strokeStyle = INK; g.stroke();
    g.lineWidth = R * w; g.strokeStyle = col; g.stroke();
  }
  g.lineCap = 'round';
}

function paintPlanetIcon(g, p) {
  const c = p.colors;
  if (p.id === 'ring') { ell(g, 0, 0, 10.5, 3.2, -0.25); ink(g, 3.6); ell(g, 0, 0, 10.5, 3.2, -0.25); ink(g, 1.8, c.accent); }
  const body = () => circ(g, 0, 0, 7);
  shaded(g, body, c.base, c.shade, -2, -2);
  if (p.id === 'moon') { circ(g, 2, 1, 1.5); fill(g, c.shade); circ(g, -2, 3, 1); fill(g, c.shade); }
  if (p.id === 'ice') { g.save(); body(); g.clip(); ell(g, 0, -6.5, 6, 2.4); fill(g, '#ffffff'); g.restore(); }
  if (p.id === 'mars') { curve(g, [-5, -1], [0, -3], [5, 0]); ink(g, 1.1, c.accent); }
  if (p.id === 'nebula') { circ(g, -2, -1, 2.4); fill(g, rgba(c.accent, 0.7)); }
  body(); ink(g, 1.4);
  if (p.id === 'ring') { g.beginPath(); g.ellipse(0, 0, 10.5, 3.2, -0.25, 0, Math.PI); ink(g, 3.6); g.beginPath(); g.ellipse(0, 0, 10.5, 3.2, -0.25, 0, Math.PI); ink(g, 1.8, c.accent); }
  ell(g, -2.6, -3, 1.8, 1, -0.6); fill(g, 'rgba(255,255,255,0.6)');
}

function paintStation(g, p) {                    // the docking gate: two pylons and an arch with a noodle-bowl sign
  const c = p.colors;
  for (const sx of [-1, 1]) {
    const x = sx * 139;
    rr(g, x - 9, -66, 18, 80, 7);
    const pg = g.createLinearGradient(x - 9, 0, x + 9, 0);
    pg.addColorStop(0, '#f4efe6'); pg.addColorStop(0.55, '#c9d3db'); pg.addColorStop(1, '#8e9aa6');
    g.fillStyle = pg; g.fill(); ink(g, 1.8);
    for (let k = 0; k < 4; k++) { rr(g, x - 6, -56 + k * 17, 12, 5, 2); fill(g, k % 2 ? '#3b4470' : c.accent); ink(g, 0.9); }
    rr(g, x - 11, 8, 22, 8, 3); fill(g, '#3b4470'); ink(g, 1.4);
  }
  rr(g, -150, -78, 300, 15, 7);
  const bg = g.createLinearGradient(0, -78, 0, -63);
  bg.addColorStop(0, '#5a6aa8'); bg.addColorStop(1, '#2c3566');
  g.fillStyle = bg; g.fill(); ink(g, 1.8);
  g.fillStyle = rgba(c.accent, 0.85); g.fillRect(-146, -66.5, 292, 2);
  for (let k = -5; k <= 5; k++) { if (Math.abs(k) < 2) continue; circ(g, k * 24, -71, 1.8); fill(g, '#fff0b8'); }
  circ(g, 0, -72, 15); fill(g, C.cream); ink(g, 2);
  circ(g, 0, -72, 11.5); fill(g, c.base); ink(g, 1);
  g.beginPath(); g.moveTo(-7, -73); g.lineTo(7, -73); g.quadraticCurveTo(6.5, -65, 0, -65); g.quadraticCurveTo(-6.5, -65, -7, -73); g.closePath(); fill(g, C.chili); ink(g, 1.2);
  g.beginPath(); g.moveTo(-6, -73); g.lineTo(6, -73); ink(g, 1.4, C.cream);
  g.beginPath(); g.moveTo(1.5, -74); g.lineTo(6, -81); g.moveTo(3.5, -74); g.lineTo(7.5, -80); ink(g, 1.1, C.woodD);
  for (const x of [-3, 0.5]) { curve(g, [x, -75.5], [x - 1.6, -78], [x + 0.4, -80.5]); ink(g, 1, '#ffffff'); }
}

function paintBeam(g, p) {
  const gr = g.createLinearGradient(0, -12, 0, 12);
  gr.addColorStop(0, rgba(p.colors.accent, 0)); gr.addColorStop(0.5, 'rgba(127,232,255,0.55)'); gr.addColorStop(1, rgba(p.colors.accent, 0));
  g.fillStyle = gr; g.fillRect(-136, -12, 272, 24);
}

function paintBelt(g, p) {
  const r = prng(4242), c = p.colors;
  const band = g.createLinearGradient(0, 0, W, 0);
  band.addColorStop(0, rgba(c.accent, 0)); band.addColorStop(0.5, rgba(c.accent, 0.07)); band.addColorStop(1, rgba(c.accent, 0));
  g.fillStyle = band; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 140; i++) {
    const x = r() * W, y = r() * H, sz = 0.6 + r() * 2.2, col = r() < 0.5 ? c.shade : c.accent, a = 0.35 + r() * 0.4, rot = r() * 3;
    g.fillStyle = rgba(col, a);
    for (const oy of [-H, 0, H]) { if (y + oy < -4 || y + oy > H + 4) continue; g.beginPath(); g.ellipse(x, y + oy, sz, sz * 0.7, rot, 0, TAU); g.fill(); }
  }
}

function paintBar(g) {
  rr(g, 0, 0, 212, 10, 5);
  const gr = g.createLinearGradient(0, 0, 212, 0);
  gr.addColorStop(0, C.chili); gr.addColorStop(0.55, C.orange); gr.addColorStop(1, C.mustard);
  g.fillStyle = gr; g.fill();
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(4, 1.6, 204, 2);
}
function paintFuelBar(g) {
  rr(g, 0, 0, 78, 10, 5);
  const gr = g.createLinearGradient(0, 0, 78, 0);
  gr.addColorStop(0, '#5fd16a'); gr.addColorStop(1, '#c8f06a');
  g.fillStyle = gr; g.fill();
  g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(4, 1.6, 70, 2);
}

const NEAR_STARS = new Map();
function nearStars(seed) {
  let list = NEAR_STARS.get(seed);
  if (!list) {
    const r = prng(mix(seed, 77));
    list = Array.from({ length: 22 }, () => [r() * W, r() * 440, 0.7 + r() * 0.9, STAR_COLORS[Math.floor(r() * STAR_COLORS.length)]]);
    if (NEAR_STARS.size > 16) NEAR_STARS.clear();
    NEAR_STARS.set(seed, list);
  }
  return list;
}

const LANE_GUIDES = [69, 123, 177, 231];
const BEACONS = [[10, '#ff5a5a'], [290, '#6dff9a']];
function drawSpace(g, s, cache, reduced) {
  const p = s.planet, d = s.distance, t = s.fx.t, keys = keysOf(s), v = s.seed % 5;
  const ny = (d * 0.05) % SKY_TILE;
  sprite(g, cache, keys.sky, BX.sky, paintSky, 0, ny - SKY_TILE, 1, p, v);
  if (ny < H) sprite(g, cache, keys.sky, BX.sky, paintSky, 0, ny, 1, p, v);
  const my = d * 0.18;
  for (const [x, sy, size, col, a] of midStars(v)) {
    const y = (sy + my) % H;
    g.globalAlpha = a; g.fillStyle = col;
    if (size < 1.5) g.fillRect(x, y, size, size);
    else { g.fillRect(x - size * 0.5, y - size * 0.5, size, size); g.fillRect(x - size * 1.5, y - 0.3, size * 3, 0.6); g.fillRect(x - 0.3, y - size * 1.5, 0.6, size * 3); }
  }
  g.globalAlpha = 1;
  g.globalAlpha = 0.5;
  sprite(g, cache, 'farplanet', BX.farPlanet, paintFarPlanet, s.seed % 2 ? 268 : 32, ((d * 0.025 + 140) % 760) - 120, 0.75);
  g.globalAlpha = 1;
  if (s.beltStart < NEVER) {
    const k = clamp((d - (s.beltStart - SPAWN_AHEAD - 260)) / 320, 0, 1);
    if (k > 0) {
      g.globalAlpha = k;
      const by = (d * 0.5) % H;
      sprite(g, cache, keys.belt, BX.belt, paintBelt, 0, by - H, 1, p);
      sprite(g, cache, keys.belt, BX.belt, paintBelt, 0, by, 1, p);
      g.globalAlpha = 1;
    }
  }
  const a = clamp((d / s.total - 0.62) / 0.38, 0, 1);
  if (a > 0) {                                // the destination grows over the last stretch
    const e = a * a * (3 - 2 * a), R = 16 + e * 134, cy = 96 - e * 46;
    sprite(g, cache, keys.planet, p.id === 'ring' ? BX.planetRing : BX.planet, paintPlanet, 150, cy, R / 150, p);
  }
  const speedK = s.speed / s.baseSpeed;
  g.globalAlpha = 0.6; g.lineCap = 'round';
  for (const [x, sy, w, col] of nearStars(s.seed)) {
    const y = ((sy + d * 0.62) % 440) - 20, len = reduced ? 1.2 : 1.2 + speedK * 3.6 * w;
    g.strokeStyle = col; g.lineWidth = w + 0.3;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - len); g.stroke();
  }
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(160,190,255,0.16)';
  for (const x of LANE_GUIDES) for (let y = (d % 40) - 40; y < H; y += 40) g.fillRect(x - 0.9, y, 1.8, 7);
  const bk = Math.floor((d - 120) / 320);
  for (let k = bk; k < bk + 3; k++) {
    const y = PLAYER_Y - (k * 320 + 160 - d);
    if (y < -20 || y > H + 20) continue;
    const on = reduced ? 0.7 : Math.sin(t * 6 + k) > 0 ? 1 : 0.25;
    for (const [x, col] of BEACONS) { sprite(g, cache, 'beacon', BX.beacon, paintBeacon, x, y); glow(g, cache, col, x, y - 12, 7, 0.9 * on); }
  }
  const sy = PLAYER_Y - (s.total - d);
  if (sy > -40 && sy < H + 100) sprite(g, cache, keys.station, BX.station, paintStation, 150, sy, 1, p);
  for (const c of s.pickups) drawCanister(g, s, c, cache, reduced);
  for (const o of s.obstacles) if (o.kind !== 'comet') drawSpaceRock(g, s, o, cache);
  for (const o of s.obstacles) if (o.kind === 'comet') drawComet(g, s, o, cache, reduced);
  drawShip(g, s, cache, reduced);
  if (sy > -40 && sy < H + 40) {
    g.globalCompositeOperation = 'lighter';
    sprite(g, cache, keys.beam, BX.beam, paintBeam, 150, sy, 1, p);
    g.globalCompositeOperation = 'source-over';
    g.setLineDash([10, 8]); g.lineDashOffset = reduced ? 0 : -t * 60;
    g.beginPath(); g.moveTo(16, sy); g.lineTo(284, sy); ink(g, 2.4, 'rgba(220,250,255,0.9)');
    g.setLineDash([]);
  }
}

function drawCanister(g, s, c, cache, reduced) {
  const y = PLAYER_Y - (c.d - s.distance);
  if (y < -30 || y > H + 30) return;
  const t = s.fx.t, k = c.taken ? Math.min(1, (s.time - c.takenT) / 0.35) : 0;
  const pulse = reduced ? 0.8 : 0.7 + Math.sin(t * 6 + c.id) * 0.3;
  glow(g, cache, '#9dff6a', c.x, y, 30 * (1 + k), 0.6 * pulse * (1 - k));
  g.save();
  g.translate(c.x, y + (reduced ? 0 : Math.sin(t * 3 + c.id) * 2) - k * 18);
  g.rotate(reduced ? 0 : Math.sin(t * 2 + c.id) * 0.18);
  g.globalAlpha = 1 - k;
  sprite(g, cache, 'canister', BX.canister, paintCanister, 0, 0, 1.18 + k * 0.4);
  g.restore();
}

function drawSpaceRock(g, s, o, cache) {
  const y = PLAYER_Y - (o.d - s.distance), rock = o.kind === 'asteroid';
  const R = o.big ? 34 : rock ? 17 : 20;
  if (y < -R - 10 || y > H + R + 10) return;
  const k = o.hit ? Math.min(1, (s.time - o.hitT) / 0.3) : 0;
  if (k >= 1) return;
  g.save();
  g.translate(o.x, y);
  if (k) { g.globalAlpha = 1 - k; g.scale(1 + k * 0.35, 1 + k * 0.35); }
  g.save();
  g.rotate(o.rot + o.spin * s.fx.t);
  if (rock) sprite(g, cache, KEYS.ast[o.big ? 1 : 0][o.v], o.big ? BX.astB : BX.astS, paintAsteroid, 0, 0, 1, R, o.v);
  else sprite(g, cache, KEYS.deb[o.v], BX.debris, paintDebris, 0, 0, 1, o.v);
  g.restore();
  if (rock) sprite(g, cache, o.big ? 'astLB' : 'astLs', o.big ? BX.lightB : BX.lightS, paintRockLight, 0, 0, 1, R);
  g.restore();
}

function drawComet(g, s, o, cache, reduced) {
  const rel = o.d - s.distance, entry = COMET_RUN / COMET_K, lead = entry + RIDE.starship.cometWarn * s.baseSpeed;
  const t = s.fx.t;
  if (rel > entry && rel <= lead) {           // telegraph: a marker at the top edge and the dashed path
    const k = (lead - rel) / (lead - entry), blink = reduced ? 1 : 0.6 + 0.4 * Math.sin(t * 20);
    g.setLineDash([5, 7]); g.lineDashOffset = reduced ? 0 : -t * 50;
    g.beginPath(); g.moveTo(o.fromX, 60); g.lineTo(o.x, PLAYER_Y); ink(g, 2, `rgba(255,130,90,${((0.2 + 0.25 * k) * blink).toFixed(2)})`);
    g.setLineDash([]);
    const y = 64;
    glow(g, cache, '#ff6a3c', o.fromX, y, 16, 0.45 * blink);
    g.beginPath(); g.moveTo(o.fromX, y - 9); g.lineTo(o.fromX + 9, y + 7); g.lineTo(o.fromX - 9, y + 7); g.closePath();
    fill(g, blink > 0.8 ? '#ffb03c' : '#ff7a3c'); ink(g, 1.6);
    text(g, '!', o.fromX, y + 5.5, F.bang, C.cream, 'center');
    return;
  }
  const y = cometY(o, s.distance);
  if (y < -60 || y > H + 70 || (o.hit && s.time - o.hitT > 0.25)) return;
  const x = cometX(o, y), slope = (o.x - o.fromX) / COMET_RUN;
  g.save();
  g.translate(x, y); g.rotate(Math.atan2(-slope, 1));
  g.globalCompositeOperation = 'lighter';
  sprite(g, cache, 'tail', BX.tail, paintCometTail);
  g.globalCompositeOperation = 'source-over';
  g.restore();
  glow(g, cache, '#ffb44a', x, y, 22, 0.75);
  g.save(); g.translate(x, y); g.rotate(t * 3 + o.id);
  sprite(g, cache, 'comet', BX.comet, paintCometCore);
  g.restore();
}

function drawShip(g, s, cache, reduced) {
  const t = s.fx.t;
  let lean = 0;
  if (s.slide) { const p = Math.min(1, s.slide.t / s.slide.dur); lean = s.slide.dir * Math.sin(p * Math.PI) * (s.special === 'ice' ? 0.36 : 0.25); }
  const blink = s.invuln > 0 && !s.finished && (reduced || Math.floor(s.invuln * 12) % 2 === 0);
  g.save();
  g.translate(s.x + (reduced ? 0 : s.fx.bump * 5 * Math.sin(t * 40)), PLAYER_Y + (reduced ? 0 : Math.sin(t * 4.5) * 1.3));
  g.rotate(lean);
  const alpha = blink ? (reduced ? 0.6 : 0.35) : 1;
  for (let sx = -1; sx <= 1; sx += 2) {
    const x = sx * 6, y = 21.5;
    const flick = reduced ? 0.5 : 0.5 + Math.sin(t * 47 + sx) * 0.25 + Math.sin(t * 31 + sx * 2) * 0.2;
    if (s.emergency && !reduced && (t * 9 + sx * 0.3) % 1 > 0.7) continue;   // sputtering backup thrusters
    const len = s.emergency ? 6 + flick * 5 : 14 + flick * 8 + (s.slow > 0 ? -3 : 2);
    glow(g, cache, s.emergency ? '#7ab8ff' : '#ff9a3c', x, y + len * 0.45, len * 0.9, 0.6 * alpha);
    g.globalAlpha = alpha;
    g.beginPath(); g.moveTo(x - 3.4, y); g.quadraticCurveTo(x - 3.8, y + len * 0.55, x, y + len); g.quadraticCurveTo(x + 3.8, y + len * 0.55, x + 3.4, y); g.closePath(); fill(g, s.emergency ? '#8fd0ff' : '#ff7a2f');
    g.beginPath(); g.moveTo(x - 2, y); g.quadraticCurveTo(x - 2.2, y + len * 0.4, x, y + len * 0.7); g.quadraticCurveTo(x + 2.2, y + len * 0.4, x + 2, y); g.closePath(); fill(g, s.emergency ? '#c6a8ff' : '#ffc23a');
    g.beginPath(); g.moveTo(x - 1, y); g.quadraticCurveTo(x, y + len * 0.4, x + 1, y); g.closePath(); fill(g, '#fff6d0');
  }
  g.globalAlpha = alpha;
  sprite(g, cache, 'ship', BX.ship, paintShip);
  g.globalAlpha = 1;
  const on = reduced ? 1 : Math.sin(t * 5) > -0.2 ? 1 : 0.2;
  glow(g, cache, '#ff5050', -21.4, 19, 6, 0.9 * on * alpha);
  glow(g, cache, '#5dff8f', 21.4, 19, 6, 0.9 * on * alpha);
  g.restore();
}

function drawGust(g, s, reduced) {
  const gu = s.gust, t = s.fx.t, cfg = RIDE.starship;
  const warn = gu.warn ? 1 - gu.in / cfg.gustWarn : 0, since = s.time - gu.at;
  const blow = since >= 0 && since < 0.6 ? 1 - since / 0.6 : 0, k = Math.max(warn * 0.85, blow);
  if (k <= 0 || s.finished) return;
  const dir = gu.dir || 1, col = s.planet.colors.accent;
  g.fillStyle = rgba(s.planet.colors.base, (0.1 * k).toFixed(3)); g.fillRect(0, 50, W, H - 50);
  const n = reduced ? 8 : 22;
  g.strokeStyle = rgba(col, (0.55 * k).toFixed(3)); g.lineWidth = 1.6; g.lineCap = 'round';
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const y = 62 + ((i * 97.3) % (H - 72)), sp = 260 + ((i * 53) % 150);
    let x = ((t * sp + i * 71.7) % 390) - 45;
    if (dir < 0) x = W - x;
    const len = 18 + ((i * 31) % 30);
    g.moveTo(x, y); g.lineTo(x - dir * len, y + 1.5);
  }
  g.stroke();
  if (gu.warn) {
    const pulse = reduced ? 1 : 0.65 + 0.35 * Math.sin(t * 14), ex = dir > 0 ? 14 : W - 14;
    for (let i = 0; i < 3; i++) {
      const cx = ex + dir * i * 9, cy = 200;
      g.beginPath(); g.moveTo(cx - dir * 4, cy - 9); g.lineTo(cx + dir * 4, cy); g.lineTo(cx - dir * 4, cy + 9);
      ink(g, 4.4, rgba('#2a1a3a', (0.6 * pulse).toFixed(2)));
      ink(g, 2.6, rgba(col, ((0.5 + i * 0.2) * pulse).toFixed(2)));
    }
    g.globalAlpha = Math.min(1, warn * 3);
    text(g, dir > 0 ? 'Gió bụi! →' : '← Gió bụi!', 150, 78, F.gust, '#ffd08a', 'center', 3.4);
    g.globalAlpha = 1;
  }
}

// ── HUD and messages ──
function paintBowlIcon(g) {
  for (const x of [-3, 1.5]) { curve(g, [x, -3], [x - 2.4, -6.5], [x + 0.4, -9.5]); ink(g, 1.3, 'rgba(255,255,255,0.8)'); }
  g.beginPath(); g.moveTo(-8.5, -2); g.lineTo(8.5, -2); g.quadraticCurveTo(8, 7.5, 0, 7.5); g.quadraticCurveTo(-8, 7.5, -8.5, -2); g.closePath();
  fill(g, C.chili); ink(g, 1.4);
  ell(g, 0, -2, 8.5, 2.2); fill(g, C.mustard); ink(g, 1.1);
  g.beginPath(); g.moveTo(3, -3.5); g.lineTo(9, -9); g.moveTo(5, -3); g.lineTo(10, -7.5); ink(g, 1.2, C.woodL);
}

function paintHouseIcon(g) {
  rr(g, -6.5, -2, 13, 10, 1.5); fill(g, C.cream); ink(g, 1.3);
  rr(g, -2, 2.5, 4, 5.5, 1); fill(g, C.wood); ink(g, 1);
  g.beginPath(); g.moveTo(-9, -1); g.lineTo(0, -9); g.lineTo(9, -1); g.closePath(); fill(g, C.chili); ink(g, 1.4);
  rr(g, 3.5, 0.5, 2.5, 2.5, 0.5); fill(g, C.sky);
}

function paintHitIcon(g) {
  g.beginPath();
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU - Math.PI / 2, r = i % 2 ? 4.2 : 8; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.closePath(); fill(g, C.tomato); ink(g, 1.3);
  circ(g, 0, 0, 3); fill(g, C.mustard);
}

function paintMarker(g, ship) {
  circ(g, 0, 0, 7.5); fill(g, C.cream); ink(g, 1.6);
  if (ship) {
    g.beginPath(); g.moveTo(0, -5); g.quadraticCurveTo(3.6, -1, 2.6, 4); g.lineTo(-2.6, 4); g.quadraticCurveTo(-3.6, -1, 0, -5); g.closePath(); fill(g, C.chili); ink(g, 0.9);
    circ(g, 0, -0.8, 1.3); fill(g, C.sky);
  } else {
    rr(g, -3.6, -1, 7.2, 5.4, 1.2); fill(g, C.chili); ink(g, 0.9);
    circ(g, 0, -3, 2.4); fill(g, C.mustard); ink(g, 0.9);
  }
}

function paintRainIcon(g) {
  circ(g, -4, 0, 4.2); fill(g, '#cfd8e8'); circ(g, 1.5, -2, 5); fill(g, '#e6edf7'); circ(g, 6, 0.5, 3.6); fill(g, '#cfd8e8');
  g.fillStyle = '#9fd4ff'; for (const dx of [-3, 1.5, 6]) g.fillRect(dx, 5, 1.2, 3.4);
}

const HUD_COUNTS = Array.from({ length: 100 }, (_, i) => String(i));
const PCT = Array.from({ length: 101 }, (_, i) => `${i}%`);
function paintHudBase(g, s) {
  const ship = s.mode === 'starship';
  rr(g, 5, 5, 290, 46, 13); fill(g, ship ? 'rgba(6,10,32,0.7)' : 'rgba(40,20,16,0.68)'); ink(g, 1.4, 'rgba(255,243,220,0.28)');
  rr(g, 42, 12, 212, 10, 5); fill(g, 'rgba(255,243,220,0.16)');
  g.save(); g.translate(24, 18); paintBowlIcon(g); g.restore();
  g.save(); g.translate(276, 17); if (ship) paintPlanetIcon(g, s.planet); else paintHouseIcon(g); g.restore();
  if (ship) { g.save(); g.translate(164, 38); g.scale(0.58, 0.58); paintCanister(g); g.restore(); }
  else if (s.rain) { g.save(); g.translate(212, 36); paintRainIcon(g); g.restore(); }
}

function drawHud(g, s, cache, reduced) {
  const ship = s.mode === 'starship', prog = clamp(s.distance / s.total, 0, 1);
  sprite(g, cache, keysOf(s).hud, BX.hud, paintHudBase, 0, 0, 1, s);
  const bx = 42, bw = 212, by = 12, bh = 10;
  if (prog > 0.004) {
    g.save(); rr(g, bx, by, Math.max(bh, bw * prog), bh, 5); g.clip();
    sprite(g, cache, 'bar', BX.bar, paintBar, bx, by);
    g.restore();
  }
  g.fillStyle = 'rgba(255,243,220,0.4)';
  for (let q = 1; q < 4; q++) g.fillRect(bx + (bw * q) / 4 - 0.6, by + 2.5, 1.2, bh - 5);
  rr(g, bx, by, bw, bh, 5); ink(g, 1.4);
  sprite(g, cache, ship ? 'mk-ship' : 'mk-scooter', BX.marker, paintMarker, bx + bw * prog, by + bh / 2, 1, ship);
  const hurt = s.invuln > 0 && !reduced ? 1 + Math.sin(s.invuln * 20) * 0.12 : 1;
  sprite(g, cache, 'ico-hit', BX.icon, paintHitIcon, 22, 37.5, hurt);
  text(g, 'Va chạm', 35, 41.5, F.label, 'rgba(255,243,220,0.85)');
  text(g, HUD_COUNTS[s.hits] ?? String(s.hits), 82, 42.5, F.count, s.hits ? '#ffb199' : C.cream);
  if (ship) drawFuel(g, s, cache, reduced);
  else if (s.rain) text(g, 'Đường trơn', 288, 41.5, F.label, '#bfe6ff', 'right');
}

function drawFuel(g, s, cache, reduced) {
  const f = s.fuel, low = f < LOW_FUEL, empty = f <= 0, t = s.fx.t;
  const flash = low && (reduced ? true : Math.sin(t * 11) > 0);
  const x = 176, y = 32.5, w = 78, h = 10;
  rr(g, x, y, w, h, 5); fill(g, 'rgba(255,243,220,0.14)');
  if (f > 0) {
    if (low) { rr(g, x, y, Math.max(h, (w * f) / 100), h, 5); fill(g, flash ? '#ff5a3c' : '#a8322a'); }
    else { g.save(); rr(g, x, y, Math.max(h, (w * f) / 100), h, 5); g.clip(); sprite(g, cache, 'fuelbar', BX.fuelBar, paintFuelBar, x, y); g.restore(); }
  }
  rr(g, x, y, w, h, 5); ink(g, 1.4, low && flash && !reduced ? '#ffd166' : INK);
  if (empty) text(g, 'DỰ PHÒNG', x + w / 2, y + 9, F.warn, flash ? '#ffd166' : '#ff8a5c', 'center', 3);
  text(g, PCT[clamp(Math.ceil(f), 0, 100)], 290, y + 9.5, F.pct, low ? '#ffb199' : C.cream, 'right');
}

function pill(g, cx, cy, str, font, size, tone, alpha) {
  g.globalAlpha = alpha;
  g.font = font;
  const w = g.measureText(str).width + 28, h = size + 16;
  rr(g, cx - w / 2, cy - h / 2, w, h, h / 2);
  fill(g, tone === 'bad' ? 'rgba(150,32,28,0.88)' : tone === 'warn' ? 'rgba(150,80,10,0.88)' : 'rgba(40,20,16,0.78)');
  ink(g, 1.6, 'rgba(255,243,220,0.55)');
  text(g, str, cx, cy + size * 0.36, font, C.cream, 'center', 3);
  g.globalAlpha = 1;
  return w;
}

function drawBanners(g, s, reduced) {
  if (!s.finished && s.time < 3.2) {
    const a = s.time < 2.4 ? 1 : 1 - (s.time - 2.4) / 0.8, y = 206;
    const w = pill(g, 150, y, 'Chạm trái / phải để đổi làn', F.hint, 13, 'info', a);
    const nudge = reduced ? 0 : Math.sin(s.time * 6) * 2;
    g.globalAlpha = a;
    for (let dir = -1; dir <= 1; dir += 2) {
      const x = 150 + dir * (w / 2 + 14 + nudge);
      g.beginPath(); g.moveTo(x + dir * 7, y); g.lineTo(x - dir * 5, y - 8); g.lineTo(x - dir * 5, y + 8); g.closePath(); fill(g, C.mustard); ink(g, 1.6);
    }
    g.globalAlpha = 1;
  }
  const b = s.fx.banner;
  if (b && !s.finished) {
    const a = b.age < 0.15 ? b.age / 0.15 : b.age > b.dur - 0.4 ? (b.dur - b.age) / 0.4 : 1;
    pill(g, 150, 98, b.text, F.banner, 13.5, b.tone, clamp(a, 0, 1));
  }
  if (s.finished) {
    const ship = s.mode === 'starship';
    rr(g, 34, 128, 232, 84, 18); fill(g, 'rgba(40,20,16,0.86)'); ink(g, 2, 'rgba(255,243,220,0.6)');
    text(g, ship ? 'Cập bến thành công!' : 'Đã giao tới nơi!', 150, 162, F.title, C.mustard, 'center', 3.6);
    const sub = s.hits === 0 ? 'Không va chạm nào. Tuyệt vời!' : `Va chạm ${s.hits} lần`;
    text(g, ship && s.ranOut ? `${sub} · từng cạn nhiên liệu` : sub, 150, 188, F.sub, C.cream, 'center');
  }
}

// ───────────────────────── prewarm (idle time) ─────────────────────────
// Every picture a ride needs later (the destination planet, the docking gate, rocks, comets...) and the next verge
// chunks are painted during idle time, so a first appearance never costs a frame in the middle of a ride.
function warmJobs(s) {
  const k = keysOf(s);
  if (k.jobs) return k.jobs;
  const glowJob = color => [GLOW_KEYS[color] || (GLOW_KEYS[color] = `glow${color}`), BX.glow, paintGlow, color];
  const jobs = [];
  if (s.mode === 'scooter') {
    const wet = s.rain ? 1 : 0;
    jobs.push(['cone', BX.cone, paintCone], ['dest', BX.dest, paintDest], ['pin', BX.pin, paintPin], ['lamp', BX.lamp, paintLamp], glowJob('#ff4a3a'));
    for (let v = 0; v < 3; v++) jobs.push([KEYS.pot[wet][v], BX.pothole, paintPothole, v, s.rain], [KEYS.pud[wet][v], BX.puddle, paintPuddle, v, s.rain]);
    if (s.rain) jobs.push(['lampPool', BX.lampPool, paintLampPool], glowJob('#fff2b0'));
  } else {
    const p = s.planet;
    jobs.push(['canister', BX.canister, paintCanister], ['comet', BX.comet, paintCometCore], ['tail', BX.tail, paintCometTail], ['beacon', BX.beacon, paintBeacon], ['farplanet', BX.farPlanet, paintFarPlanet]);
    for (let v = 0; v < 3; v++) jobs.push([KEYS.ast[0][v], BX.astS, paintAsteroid, 17, v], [KEYS.ast[1][v], BX.astB, paintAsteroid, 34, v], [KEYS.deb[v], BX.debris, paintDebris, v]);
    jobs.push(['astLs', BX.lightS, paintRockLight, 17], ['astLB', BX.lightB, paintRockLight, 34]);
    for (const c of ['#9dff6a', '#ffb44a', '#ff6a3c', '#ff9a3c', '#7ab8ff', '#ff5050', '#5dff8f', '#ff5a5a', '#6dff9a']) jobs.push(glowJob(c));
    jobs.push(['fuelbar', BX.fuelBar, paintFuelBar], [k.planet, p.id === 'ring' ? BX.planetRing : BX.planet, paintPlanet, p], [k.station, BX.station, paintStation, p], [k.beam, BX.beam, paintBeam, p]);
    if (s.beltStart < NEVER) jobs.push([k.belt, BX.belt, paintBelt, p]);
  }
  jobs.push(['bar', BX.bar, paintBar], ['mk-ship', BX.marker, paintMarker, true], ['mk-scooter', BX.marker, paintMarker, false], ['ico-hit', BX.icon, paintHitIcon]);
  return (k.jobs = jobs);
}
function warmRide(ctx, s) {                      // paints one missing picture; false when nothing is left to do now
  const cache = CACHES.get(ctx.canvas || ctx);
  if (!cache) return false;
  for (const [key, box, paint, a, b] of warmJobs(s)) if (!cache.map.has(key)) { entry(cache, key, box, paint, a, b); return true; }
  if (s.scene && cache.verge && cache.verge.tag === keysOf(s).verge) {
    const k1 = Math.floor((s.distance + PLAYER_Y + 8) / CHUNK);
    for (let k = k1 + 1; k <= k1 + 2; k++) for (let side = 0; side < 2; side++) if (!cache.verge.map.has(k * 2 + side)) { chunk(s, cache, side, k); return true; }
  }
  return false;
}

// ───────────────────────── browser controller ─────────────────────────
export function mountRide(canvas, options = {}, { onFinish, onUpdate, onEvent } = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('mountRide needs a <canvas> element');
  const reduced = !!options.reducedMotion;
  const state = createRide({ ...options, reducedMotion: reduced });
  const ctx = canvas.getContext('2d', { alpha: false });   // the scene always covers the canvas
  const doc = canvas.ownerDocument || globalThis.document, win = doc.defaultView || globalThis;
  const report = error => { try { (win.reportError || console.error)(error); } catch { /* nothing left to do */ } };
  const moves = [];
  let raf = 0, last = null, stopped = false, done = false, lastUpdate = -Infinity, idleId = 0, drawFailed = false;
  let dprCap = 2, frames = 0, slowFrames = 0;   // slow devices step the backing store down from 2x to 1.5x, then 1x
  const idle = win.requestIdleCallback ? fn => win.requestIdleCallback(fn, { timeout: 400 }) : fn => win.setTimeout(fn, 48);
  const unidle = win.cancelIdleCallback ? id => win.cancelIdleCallback(id) : id => win.clearTimeout(id);
  const touch = canvas.style.touchAction;
  canvas.style.touchAction = 'none';
  if (canvas.width === 300 && canvas.height === 150) { canvas.width = W; canvas.height = H; }   // keep an auto height at 3:4

  function fit() {
    const rect = canvas.getBoundingClientRect();
    const cssW = rect.width > 0 ? rect.width : W, cssH = rect.height > 0 ? rect.height : H;
    const dpr = clamp(win.devicePixelRatio || 1, 1, dprCap);
    let w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
    const big = Math.max(w, h);
    if (big > 2048) { w = Math.round((w * 2048) / big); h = Math.round((h * 2048) / big); }
    if (Math.abs(canvas.width - w) > 1 || Math.abs(canvas.height - h) > 1) { canvas.width = w; canvas.height = h; }
  }
  function paint() {                              // a drawing failure is reported once; the ride itself keeps going
    try {
      fit();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawRide(ctx, state, { width: canvas.width, height: canvas.height, reducedMotion: reduced });
    } catch (error) { if (!drawFailed) { drawFailed = true; report(error); } }
  }
  function push(dir) { if (!stopped && !state.finished && moves.length < 4) moves.push(dir); }
  function onKey(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target?.isContentEditable) return;
    const k = event.key, code = event.code;
    const dir = k === 'ArrowLeft' || code === 'KeyA' || k === 'a' || k === 'A' ? -1 : k === 'ArrowRight' || code === 'KeyD' || k === 'd' || k === 'D' ? 1 : 0;
    if (!dir) return;
    event.preventDefault();
    if (!event.repeat) push(dir);
  }
  function onPointer(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    push(event.clientX - rect.left < rect.width / 2 ? -1 : 1);
    event.preventDefault();
  }
  function onVisibility() {
    if (stopped) return;
    if (doc.hidden) { if (raf) win.cancelAnimationFrame(raf); raf = 0; last = null; }
    else if (!raf) { last = null; raf = win.requestAnimationFrame(frame); }
  }
  function frame(now) {
    raf = 0;
    if (stopped) return;
    if (!canvas.isConnected) { stop(); return; }
    if (doc.hidden) { last = null; return; }
    const dt = last === null ? 0 : clamp((now - last) / 1000, 0, 0.1);   // no giant step after a stall
    if (last !== null && ++frames >= 90) { if (slowFrames > 50 && dprCap > 1) dprCap = Math.max(1, dprCap - 0.5); frames = slowFrames = 0; }
    else if (last !== null && now - last > 24) slowFrames++;
    last = now;
    if (!idleId) idleId = idle(warm);
    try { stepRide(state, dt, { move: moves.shift() || 0 }); } catch (error) { report(error); finish(); return; }   // settle rather than hang
    if (onEvent) for (const event of state.events) { try { onEvent(event); } catch (error) { report(error); } }
    paint();
    if (state.finished) { finish(); return; }
    if (onUpdate && now - lastUpdate >= 100) { lastUpdate = now; try { onUpdate(rideResult(state)); } catch (error) { report(error); } }
    raf = win.requestAnimationFrame(frame);
  }
  function warm(deadline) {
    idleId = 0;
    if (stopped || doc.hidden) return;
    if (!deadline || deadline.didTimeout || deadline.timeRemaining() > 3) { try { if (warmRide(ctx, state)) idleId = idle(warm); } catch (error) { report(error); } }
    else idleId = idle(warm);
  }
  function stop() {
    if (stopped) return;
    stopped = true;
    if (raf) win.cancelAnimationFrame(raf);
    if (idleId) unidle(idleId);
    raf = 0; idleId = 0;
    win.removeEventListener('keydown', onKey);
    canvas.removeEventListener('pointerdown', onPointer);
    doc.removeEventListener('visibilitychange', onVisibility);
    canvas.style.touchAction = touch;
    const cache = CACHES.get(canvas);              // the last frame stays on screen; free the sprite canvases now
    if (cache) { release(cache); CACHES.delete(canvas); }
  }
  function finish() {
    if (done) return;
    done = true;
    const result = rideResult(state);
    stop();
    if (onFinish) { try { onFinish(result); } catch (error) { report(error); } }
  }
  win.addEventListener('keydown', onKey);
  canvas.addEventListener('pointerdown', onPointer);
  doc.addEventListener('visibilitychange', onVisibility);
  paint();
  if (!doc.hidden) raf = win.requestAnimationFrame(frame);
  return { left: () => push(-1), right: () => push(1), stop, state };
}
