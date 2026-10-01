// Tiệm Mì Cay: the kitchen and customer effects layer. Sparks when noodles reach the ideal zone, a strainer
// scooping noodles into the bowl, broth drops, toppings dropping in, bowls flying to guests, hearts, departure
// ghosts, captions and the money tween. Original code; the timings follow the reference game's behaviour by number.
//
// How it stays cheap (measured with Chrome traces on a 4x-slowed phone):
// - One persistent fixed layer outside #app: <div id="fx-layer" aria-hidden="true">. The app rebuilds #app
//   wholesale at times, so effects never live inside it. Positions are DOMRect-like boxes that the caller read
//   before its own DOM writes, so spawning an effect never forces a layout.
// - Every node is built once and pooled (32 particles, 6 sprites, 4 ghosts, 4 floats, 2 captions). An effect that
//   finds its pool empty is dropped, never queued. Idle nodes are display:none and carry no will-change.
// - Motion is transform and opacity only, played by element.animate(), so it runs on the compositor: no
//   requestAnimationFrame loop and no script per frame.
// - One clock per effect: every animation of an effect starts at once and lasts as long as the effect, and each
//   part (a particle, the sprite's hop, a ripple) moves inside its own window of that time, held by step keyframes
//   before and after. The compositor then wakes the main thread when the effect starts and ends, not at every
//   particle's own start and finish (8 staggered particles cost 41 style recalcs, the same 8 on one clock 4).
// - Motion off (lowMotion()) spawns nothing. An open <dialog> or a hidden tab pauses every running effect, and it
//   resumes where it stopped.
// - Cosmetic jitter comes from a private seeded PRNG (mulberry32), never Math.random, so the game's random streams
//   (and tests that replace Math.random) stay untouched.
// - Sound: an effect plays at most one cue, only when the caller asks for one ({ cue }), at the moment it belongs
//   to (a landing, a splash). When the effect cannot be shown (motion off, pool empty) the cue plays at once.
//
//   const fx = createFx({ lowMotion, sound: (cue, options) => sfx(cue, options) });
//   fx.scoop(potRect, bowlRect, '#e4572e', { cooked: true, cue: 'splash' });

// Reference timings (ms) and distances (px) copied by number.
export const TIMING = Object.freeze({
  arc: 520, arcHeight: 70,
  scoop: Object.freeze({ drips: 136, land: 512, splash: 640, total: 800 }),
  drop: Object.freeze({ duration: 500, apex: 46 }),
  pour: Object.freeze({ drops: 7, flight: 380, gap: 40 }),
  hearts: Object.freeze({ count: 5, span: 1300, each: 940, gap: 90 }),
  ghost: Object.freeze({ served: 850, angry: 700, leave: 560 }),
  float: 1000, caption: 1400, count: 700, countSteps: 12, flash: 700, ripple: 480, squeeze: 350,
  pop: 200, squash: 150, shake: 300, quake: 400, boing: 280,
});
const POOL_SIZES = Object.freeze({ particles: 32, sprites: 6, ghosts: 4, floats: 4, captions: 2 });
// Exact halves of a parabola as timing functions: quadratic ease-out up to the apex, quadratic ease-in after it.
const RISE = 'cubic-bezier(.3333,.6667,.6667,1)', FALL = 'cubic-bezier(.3333,0,.6667,.3333)';
const OUT = 'cubic-bezier(.2,.8,.3,1)', SPRING = 'cubic-bezier(.3,1.5,.5,1)';
// A sprite's landing: a 160 ms squash, then 120 ms resting before it fades into the target.
const SQUASH_MS = 160, REST_MS = 120;

// ---------------------------------------------------------------------------------------------
// Pure helpers (exported for tests).

/** Small seeded PRNG: returns a function giving floats in [0, 1). */
export function mulberry32(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = value => Math.round(value * 10) / 10;
const r2 = value => Math.round(value * 100) / 100;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const px = (x, y) => `translate(${r1(x)}px,${r1(y)}px)`;

/** Point at time t (0..1) on a throw from `from` to `to` that bulges `height` px above the straight line. */
export function arcPoint(from, to, height, t) {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t - 4 * height * t * (1 - t) };
}

/** The bulge (arcPoint height) that puts the top of the throw `apex` px above the landing point. dy = to.y - from.y. */
export function bulgeForApex(dy, apex) {
  const a = Math.max(0, apex);
  if (a < dy) return Math.max(0, dy / 4); // the start is already higher than the apex: just fall from it
  return (2 * a - dy + 2 * Math.sqrt(a * (a - dy))) / 4;
}

/**
 * The bulge for a throw whose top is `apex` px above the landing point and at least `lift` px above the start, so a
 * strainer leaving a pot above the bowl still rises before it falls.
 */
export function liftTo(from, to, apex, lift = 0) {
  return bulgeForApex(to.y - from.y, Math.max(apex, to.y - from.y + lift));
}

/**
 * Keyframes for a throw drawn by two nested elements: the outer one moves in a straight line at constant speed and
 * the inner one hops with the exact parabola timing, so the sum is the curve of arcPoint() with no corners.
 */
export function arcMotion(from, to, height) {
  return {
    move: [{ offset: 0, transform: px(from.x, from.y) }, { offset: 1, transform: px(to.x, to.y) }],
    hop: [
      { offset: 0, transform: 'translateY(0px)', easing: RISE },
      { offset: .5, transform: `translateY(${r1(-height)}px)`, easing: FALL },
      { offset: 1, transform: 'translateY(0px)' },
    ],
  };
}

/** Single-element keyframes for a throw (small particles), sampled into `steps` straight pieces. */
export function arcKeyframes(from, to, height, steps = 12, extra = () => '') {
  const count = Math.max(2, Math.round(steps)), frames = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count, point = arcPoint(from, to, height, t);
    frames.push({ offset: t, transform: `${px(point.x, point.y)}${extra(t)}` });
  }
  return frames;
}

/**
 * Places a part's keyframes in its window [start, start + length] (ms) of an effect lasting `total` ms. Before the
 * window the part holds its first frame and after it its last one (both invisible when `hide`), with step timing so
 * nothing drifts outside the window.
 */
export function windowed(frames, start, length, total, hide = true) {
  const a = clamp(start / total, 0, 1), b = clamp((start + length) / total, a, 1), n = frames.length;
  const out = frames.map((frame, i) => ({ ...frame, offset: a + (frame.offset ?? (n > 1 ? i / (n - 1) : 0)) * (b - a) }));
  const hold = (frame, offset) => { const { easing, offset: _, ...rest } = frame; return { ...rest, offset, ...(hide ? { opacity: 0 } : {}) }; };
  if (a > 0) out.unshift({ ...hold(frames[0], 0), easing: 'step-end' });
  if (b < 1) { if (hide) out[out.length - 1] = { ...out.at(-1), easing: 'step-start' }; out.push(hold(frames.at(-1), 1)); }
  return out;
}

/** Values a counter shows, at most `steps` (≤ 12) of them, easing out and ending exactly on `to`. */
export function countSteps(from, to, steps = TIMING.countSteps) {
  const n = clamp(Math.floor(Number(steps) || 1), 1, 12);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return [to];
  const values = [];
  for (let i = 1; i <= n; i++) {
    const value = i === n ? to : Math.round(from + (to - from) * (1 - (1 - i / n) ** 3));
    if (value !== values.at(-1)) values.push(value);
  }
  return values;
}

/**
 * How a departing guest's card leaves. Frames are offsets with x/y in px (x is towards the nearer screen edge for
 * 'served'), opacity and scale. served: hop 8 px in 220 ms, slide sideways 500 ms, fade (850 ms). angry: shake
 * ±5 px for 300 ms, then sink and fade for 400 ms with a grey puff. leave: a soft fade.
 */
export function ghostPlan(intent) {
  if (intent === 'served') {
    const d = TIMING.ghost.served;
    return { intent, duration: d, heartsAt: 110, puffAt: null, frames: [
      { offset: 0, x: 0, y: 0, opacity: 1, scale: 1, easing: RISE },
      { offset: 110 / d, x: 0, y: -8, opacity: 1, scale: 1, easing: FALL },
      { offset: 220 / d, x: 0, y: 0, opacity: 1, scale: 1, easing: 'ease-in' },
      { offset: 720 / d, x: 46, y: 0, opacity: .85, scale: 1, easing: 'linear' },
      { offset: 1, x: 56, y: 0, opacity: 0, scale: 1 },
    ] };
  }
  if (intent === 'angry') {
    const d = TIMING.ghost.angry, shake = [0, -5, 5, -5, 5, -2.5, 0];
    return { intent, duration: d, heartsAt: null, puffAt: 300, frames: [
      ...shake.map((x, i) => ({ offset: (i * 50) / d, x, y: 0, opacity: 1, scale: 1, easing: i === shake.length - 1 ? 'ease-in' : 'linear' })),
      { offset: 1, x: 0, y: 16, opacity: 0, scale: .94 },
    ] };
  }
  const d = TIMING.ghost.leave;
  return { intent: 'leave', duration: d, heartsAt: null, puffAt: null, frames: [
    { offset: 0, x: 0, y: 0, opacity: 1, scale: 1, easing: 'ease-in' },
    { offset: 1, x: 0, y: -6, opacity: 0, scale: .96 },
  ] };
}

// ---------------------------------------------------------------------------------------------
// Built-in sprite art (original SVG, docs/ART-STYLE.md). Pass a key ('tea', 'bowl', 'scoop', 'nest', 'face') as
// arc/drop/toss content to use it.
const svgURI = svg => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const SVG_OPEN = viewBox => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" stroke-linecap="round" stroke-linejoin="round">`;
const NEST = '<path d="M13 19q2-9 14-9.6T41 19q-6 5.6-14 5.6T13 19z" fill="#f7d76a" stroke="#4a2a22" stroke-width="1.5"/>' +
  '<path d="M15.6 17.4q2-2.6 4 0t4 0 4 0 4 0 4 0 4 0M17.6 14.2q2-2.4 4 0t4 0 4 0 4 0 4 0M20 20.6q2-2.2 4 0t4 0 4 0 4 0" fill="none" stroke="#c99420" stroke-width="1.2"/>' +
  '<path d="M17 13.6q3-2.6 7-3" fill="none" stroke="#fff" stroke-width="1.3" opacity=".55"/>';
export const ART = Object.freeze({
  tea: svgURI(`${SVG_OPEN('0 0 32 40')}<ellipse cx="16" cy="37.6" rx="10" ry="1.8" fill="#3a1d16" opacity=".13"/>` +
    '<path d="M21.4 1.6 18.6 24" fill="none" stroke="#4a2a22" stroke-width="3.6"/><path d="M21.4 1.6 18.6 24" fill="none" stroke="#e8402f" stroke-width="2"/>' +
    '<path d="M5 6h22l-2.6 28.4Q24 37 21 37H11q-3 0-3.4-2.6z" fill="#fff3dc" fill-opacity=".6"/>' +
    '<path d="M6.5 13.4h19l-2 20.6q-.3 1.8-2.3 1.8H10.8q-2 0-2.3-1.8z" fill="#d9822b"/><path d="M6.6 13.4h18.8" stroke="#f59a3a" stroke-width="1.6"/>' +
    '<rect x="9" y="15" width="6.4" height="6.4" rx="1.3" fill="#eaf8ff" fill-opacity=".85" stroke="#fff" stroke-width=".8" transform="rotate(-12 12.2 18.2)"/>' +
    '<rect x="16.4" y="17" width="6" height="6" rx="1.3" fill="#eaf8ff" fill-opacity=".8" stroke="#fff" stroke-width=".8" transform="rotate(14 19.4 20)"/>' +
    '<path d="M5 6h22l-2.6 28.4Q24 37 21 37H11q-3 0-3.4-2.6z" fill="none" stroke="#4a2a22" stroke-width="1.7"/>' +
    '<path d="M8.4 9.4 10 31" fill="none" stroke="#fff" stroke-width="1.7" opacity=".55"/></svg>'),
  bowl: svgURI(`${SVG_OPEN('0 0 40 32')}<ellipse cx="20" cy="30" rx="13" ry="1.8" fill="#3a1d16" opacity=".13"/>` +
    '<path d="M14 25.6l1 3.2h10l1-3.2z" fill="#9c2219" stroke="#4a2a22" stroke-width="1.2"/>' +
    '<path d="M3 12q1 15 17 15t17-15z" fill="#e8402f" stroke="#4a2a22" stroke-width="1.6"/>' +
    '<path d="M6.4 17.4q3 6.4 9 8.4" fill="none" stroke="#fff" stroke-width="1.6" opacity=".4"/>' +
    '<ellipse cx="20" cy="12" rx="17" ry="5.6" fill="#fff3dc" stroke="#4a2a22" stroke-width="1.6"/><ellipse cx="20" cy="12.6" rx="14" ry="3.8" fill="#f59a3a"/>' +
    '<path d="M11 12.6q1.5-1.6 3 0t3 0 3 0 3 0 3 0 3 0" fill="none" stroke="#f7d76a" stroke-width="1.5"/></svg>'),
  scoop: svgURI(`${SVG_OPEN('0 0 64 44')}<path d="M42 17 61 4" fill="none" stroke="#4a2a22" stroke-width="5"/><path d="M42 17 61 4" fill="none" stroke="#d99a5e" stroke-width="2.8"/>` +
    '<path d="M44.4 15.4 59 5.4" fill="none" stroke="#fff" stroke-width=".9" opacity=".5"/>' +
    `<g transform="translate(-1 0)">${NEST}</g>` +
    '<path d="M6 19q21 28 42 0" fill="#c9d3db" fill-opacity=".45" stroke="#4a2a22" stroke-width="1.6"/>' +
    '<path d="M13 22.4q14 13 28 0M10 20.6 27 37.6M18 20.6l13 14M26 20.6l10.4 10.6M34 20.6l7 7M44 20.6 27 37.6M36 20.6 22 35M28 20.6 18 31" fill="none" stroke="#8e9aa6" stroke-width=".9"/>' +
    '<ellipse cx="27" cy="19" rx="21.4" ry="3.6" fill="none" stroke="#4a2a22" stroke-width="1.8"/><ellipse cx="27" cy="19" rx="21.4" ry="3.6" fill="none" stroke="#c9d3db" stroke-width=".8"/></svg>'),
  nest: svgURI(`${SVG_OPEN('8 6 38 22')}${NEST}</svg>`),
  face: svgURI(`${SVG_OPEN('0 0 40 40')}<circle cx="20" cy="20" r="19" fill="#ffead6"/><circle cx="20" cy="22" r="12" fill="#f9d2b4" stroke="#4a2a22" stroke-width="1.4"/>` +
    '<path d="M8.4 19q1-10.4 11.6-10.4T31.6 19q-4-5-11.6-5T8.4 19z" fill="#3a2320" stroke="#4a2a22" stroke-width="1.2"/>' +
    '<circle cx="15.6" cy="22" r="1.4" fill="#4a2a22"/><circle cx="24.4" cy="22" r="1.4" fill="#4a2a22"/><path d="M16 26.6q4 3.2 8 0" fill="none" stroke="#4a2a22" stroke-width="1.4"/>' +
    '<circle cx="13" cy="25.6" r="1.8" fill="#f2556b" opacity=".35"/><circle cx="27" cy="25.6" r="1.8" fill="#f2556b" opacity=".35"/></svg>'),
});

// Particle recipes. dist: launch distance (px), up: 0 = any direction .. 1 = a narrow cone straight up, fall: px added
// downwards by the end (negative rises), s: scale at start / 30% / end, life: shortest and longest life (ms). Bursts
// are 6-14 particles that live 0.2-0.5 s, except hearts and smoke, which linger.
const KINDS = Object.freeze({
  spark: { n: 6, life: [240, 420], dist: [22, 44], up: .2, fall: 0, s: [.5, 1.2, .25], spin: 140 },
  star: { n: 8, life: [320, 500], dist: [20, 46], up: .45, fall: 10, s: [.4, 1.1, .3], spin: 160 },
  heart: { n: 6, life: [640, 900], dist: [8, 20], up: 1, fall: -40, s: [.4, 1, .8], spin: 30 },
  drop: { n: 8, life: [300, 460], dist: [14, 28], up: .75, fall: 46, s: [1, 1.05, .8], spin: 0, color: '#6cc3ef' },
  chili: { n: 6, life: [300, 460], dist: [14, 30], up: .75, fall: 50, s: [1, 1.1, .8], spin: 0, color: '#e8402f' },
  puff: { n: 6, life: [420, 560], dist: [10, 22], up: .9, fall: -18, s: [.5, 1.1, 1.5], spin: 0 },
  smoke: { n: 8, life: [700, 980], dist: [8, 18], up: 1, fall: -42, s: [.6, 1.2, 1.9], spin: 20 },
  bubble: { n: 6, life: [380, 600], dist: [6, 14], up: 1, fall: -26, s: [.6, 1, 1.3], spin: 0 },
});
export const KIND_NAMES = Object.freeze(Object.keys(KINDS));

// A DOMRect-like box (or an element, which costs a layout read) normalised; null when unusable or unrendered.
function toBox(rect) {
  if (!rect) return null;
  const r = typeof rect.getBoundingClientRect === 'function' ? rect.getBoundingClientRect() : rect;
  const left = Number(r.left ?? r.x), top = Number(r.top ?? r.y), width = Number(r.width ?? 0), height = Number(r.height ?? 0);
  if (![left, top, width, height].every(Number.isFinite)) return null;
  if (!left && !top && !width && !height) return null; // display:none reports an all-zero box
  return { left, top, width, height, x: left + width / 2, y: top + height / 2 };
}
// Where things land in a bowl: the broth surface sits a little above the middle of the bowl picture.
const surfaceOf = box => ({ x: box.x, y: box.top + box.height * .45 });

// ---------------------------------------------------------------------------------------------

/**
 * Create the effects layer. Safe to call where there is no DOM or no element.animate (every method is then a no-op,
 * except countTo, which still writes the final value, and arc, which still calls onLand).
 * @param {{ lowMotion?: () => boolean, sound?: (cue: string, options: { pitch: number }) => void, dialog?: HTMLDialogElement|null }} [options]
 */
export function createFx({ lowMotion = () => false, sound = () => {}, dialog } = {}) {
  const doc = globalThis.document;
  if (!doc?.body || typeof globalThis.Element?.prototype?.animate !== 'function') return inertFx();
  if (dialog === undefined) dialog = doc.querySelector('#dialog');

  let dead = false, manualPause = false, paused = false, demoTimers = [];
  const random = mulberry32(0x5eed);
  const live = new Set(), counts = new Map(), flags = new Map(), classShots = new Map(), shots = new WeakMap(), kinds = new WeakMap();

  // ---- the layer and its pools, built once
  doc.getElementById('fx-layer')?.remove();
  const layer = doc.createElement('div');
  layer.id = 'fx-layer';
  layer.setAttribute('aria-hidden', 'true');
  doc.body.append(layer);
  const make = (tag, className, parent = layer) => { const node = doc.createElement(tag); node.className = className; parent.append(node); return node; };
  const hiddenNode = (tag, className) => { const node = make(tag, className); node.hidden = true; return node; };
  function pool(size, build) {
    const free = Array.from({ length: size }, build);
    return { take: () => free.pop() || null, give: item => { (item.root || item).hidden = true; free.push(item); }, get free() { return free.length; } };
  }
  // Paint order follows build order: sprites, then ghosts, then particles (hearts and puffs over a leaving guest,
  // splashes over a landing bowl), then the guests' speech bubbles, floats and captions on top.
  const sprites = pool(POOL_SIZES.sprites, () => {
    const root = hiddenNode('div', 'fx-sprite'), hop = make('div', 'fx-hop', root), body = make('div', 'fx-body', hop);
    const img = make('img', 'fx-img', body), text = make('span', 'fx-text', body);
    img.alt = ''; img.draggable = false; img.decoding = 'async';
    return { root, hop, body, img, text };
  });
  const ghosts = pool(POOL_SIZES.ghosts, () => {
    const root = hiddenNode('div', 'fx-ghost'), motion = make('div', 'fx-gm', root), ring = make('span', 'fx-gring', motion);
    const img = make('img', 'fx-gface', ring), name = make('b', 'fx-gname', motion);
    img.alt = ''; img.draggable = false;
    return { root, motion, ring, img, name };
  });
  const particles = pool(POOL_SIZES.particles, () => hiddenNode('i', 'fx-p'));
  const lines = pool(POOL_SIZES.ghosts, () => hiddenNode('span', 'fx-gline'));
  const floats = pool(POOL_SIZES.floats, () => hiddenNode('span', 'fx-float'));
  const captions = pool(POOL_SIZES.captions, () => hiddenNode('div', 'fx-caption'));

  // ---- bookkeeping: an effect is a record of animations on one clock (`total` ms); its nodes go back to their pools
  // when the last animation ends
  const motionOK = () => { if (dead) return false; try { return !lowMotion(); } catch { return true; } };
  function say(cue, pitch = 0) { if (!cue || dead) return; try { sound(cue, { pitch }); } catch { /* sound must never break effects */ } }
  function begin(total) { const record = { total: Math.max(1, total), anims: [], left: 0, release: [], done: false }; live.add(record); return record; }
  function play(record, element, frames, timing, onEnd) {
    const anim = element.animate(frames, timing);
    record.anims.push(anim); record.left++;
    anim.onfinish = () => { if (onEnd) { try { onEnd(); } catch { /* a callback must not leak nodes */ } } if (--record.left <= 0) end(record); };
    if (paused) anim.pause();
    return anim;
  }
  // A part on the effect's clock: its keyframes sit in [start, start + length] of record.total.
  const part = (record, element, frames, start, length, hide = true) => play(record, element, windowed(frames, start, length, record.total, hide), { duration: record.total });
  function end(record) {
    if (record.done) return;
    record.done = true; live.delete(record);
    for (const anim of record.anims) { anim.onfinish = null; anim.cancel(); }
    for (const release of record.release) { try { release(); } catch { /* ignore */ } }
  }
  // Effects that showed nothing are closed at once; returns whether anything is on screen.
  function settle(record) { if (!record.anims.length) { end(record); return false; } return true; }
  function ensureLayer() { if (!layer.isConnected) doc.body.append(layer); }
  // A skipped effect still keeps its promises: the cue plays and onLand runs (after the current call returns).
  function skip(cue, onLand) { say(cue); if (onLand) queueMicrotask(() => { try { onLand(); } catch { /* ignore */ } }); return false; }
  const rand = (low, high) => low + (high - low) * random();
  const offscreen = box => box.left + box.width < -80 || box.top + box.height < -80 || box.left > innerWidth + 80 || box.top > innerHeight + 80;

  function grab(record, kind, color) {
    const node = particles.take(); if (!node) return null;
    if (kinds.get(node) !== kind) { node.className = `fx-p fx-k-${kind}`; kinds.set(node, kind); }
    if (color) node.style.setProperty('--c', color); else if (node.style.length) node.style.removeProperty('--c');
    node.hidden = false;
    record.release.push(() => particles.give(node));
    return node;
  }
  // Frames of a particle launched from (x, y) along `angle` for `dist` px, eased out, plus `fall` px of gravity.
  function flightFrames(x, y, angle, dist, fall, [s0, s1, s2], spin, fade = .6) {
    const dx = Math.cos(angle) * dist, dy = Math.sin(angle) * dist, frames = [];
    for (const t of [0, .2, .45, .7, 1]) {
      const e = 1 - (1 - t) ** 2, s = t < .3 ? s0 + (s1 - s0) * (t / .3) : s1 + (s2 - s1) * ((t - .3) / .7);
      frames.push({ offset: t, transform: `${px(x + dx * e, y + dy * e + fall * t * t)} rotate(${r1(spin * t)}deg) scale(${r2(s)})`, opacity: t <= fade ? 1 : r2(1 - (t - fade) / (1 - fade)) });
    }
    return frames;
  }
  // `count` particles of `kind` from around (x, y), starting at `start` ms of the record's clock and living at most
  // `life` ms each. Returns how many were shown (fewer when the pool runs low).
  function spray(record, kind, x, y, { count, colors, spread, life, start = 0, jitter = 0, dir = -Math.PI / 2, cone, scale = 1 } = {}) {
    const spec = KINDS[kind] || KINDS.spark, longest = life ?? spec.life[1], shortest = longest * (spec.life[0] / spec.life[1]);
    const n = clamp(Math.round(count ?? spec.n), 1, 16), palette = colors?.length ? colors : spec.color ? [spec.color] : [null];
    const width = cone ?? Math.PI * 2 * (1 - spec.up * .82);
    let shown = 0;
    for (let i = 0; i < n; i++) {
      const node = grab(record, kind, palette[i % palette.length]); if (!node) break;
      shown++;
      const angle = dir + (random() - .5) * width, dist = (spread ?? spec.dist[1]) * scale * rand(spec.dist[0] / spec.dist[1], 1);
      const frames = flightFrames(x + rand(-jitter, jitter), y + rand(-jitter, jitter) * .6, angle, dist, spec.fall * scale, spec.s, spec.spin * (random() - .5) * 2);
      part(record, node, frames, start, rand(shortest, longest));
    }
    return shown;
  }
  // An expanding ring on the broth surface, starting at `start` ms of the record's clock (480 ms).
  function ring(record, box, color, start = 0, reach = .62) {
    const node = grab(record, 'ring', color || '#fff3dc'); if (!node) return 0;
    const point = surfaceOf(box), k = clamp((box.width * reach) / 40, .5, 4);
    part(record, node, [
      { transform: `${px(point.x, point.y)} scale(${r2(k * .3)})`, opacity: .95, easing: OUT },
      { transform: `${px(point.x, point.y)} scale(${r2(k)})`, opacity: 0 },
    ], start, TIMING.ripple);
    return 1;
  }
  function setContent(sprite, content) {
    const value = typeof content === 'string' ? (Object.hasOwn(ART, content) ? ART[content] : content).trim() : '';
    if (!value) return false;
    const image = /^(data:image\/|blob:|https?:|\.{0,2}\/)/.test(value) || /\.(svg|png|webp|jpe?g|gif)([?#].*)?$/i.test(value);
    sprite.img.hidden = !image; sprite.text.hidden = image;
    if (image) { if (sprite.img.getAttribute('src') !== value) sprite.img.src = value; }
    else if (value.startsWith('<')) sprite.text.innerHTML = value; // caller-made markup (an emoji span, a mini picture)
    else sprite.text.textContent = value;
    return true;
  }
  // How long a thrown sprite stays on screen: the flight, then a squash and a short rest unless it fades out flying.
  const spriteLength = (duration, fadeOut, squashOnLand) => duration + (squashOnLand && !fadeOut ? SQUASH_MS + REST_MS : 0);
  // Fly one pooled sprite along a throw on the record's clock. The outer element only gets its own clock when
  // something must happen at the landing (a callback or a cue). Returns false when no sprite could be shown.
  function throwSprite(record, content, from, to, { duration, height, size = 40, spin = 0, fadeOut = false, squashOnLand = true, endScale = 1, onLand, landCue }) {
    const sprite = sprites.take(); if (!sprite) return false;
    if (!setContent(sprite, content)) { sprites.give(sprite); return false; }
    record.release.push(() => sprites.give(sprite));
    const length = spriteLength(duration, fadeOut, squashOnLand), landAt = duration / length, s = size / 48, e = s * endScale;
    const motion = arcMotion(from, to, height);
    sprite.root.hidden = false;
    if (onLand || landCue) play(record, sprite.root, motion.move, { duration, fill: 'forwards' }, () => { say(landCue); if (onLand) onLand(); });
    else part(record, sprite.root, motion.move, 0, duration, false);
    part(record, sprite.hop, motion.hop, 0, duration, false);
    const spinTo = `rotate(${r1(spin)}deg)`, body = [
      { offset: 0, transform: `scale(${r2(s)}) rotate(0deg)`, opacity: 0 },
      { offset: Math.min(.06, landAt / 3), transform: `scale(${r2(s)}) rotate(${r1(spin * .06)}deg)`, opacity: 1 },
    ];
    if (fadeOut || !squashOnLand) body.push({ offset: landAt * .55, opacity: 1 }, { offset: 1, transform: `scale(${r2(e)}) ${spinTo}`, opacity: fadeOut ? 0 : 1 });
    else {
      body.push({ offset: landAt, transform: `scale(${r2(e)}) ${spinTo}`, opacity: 1, easing: 'ease-out' });
      // Squash about the bottom edge: scale(1.15, .75), with the drop of the top edge taken back by translateY.
      body.push({ offset: (duration + SQUASH_MS * .4) / length, transform: `translateY(${r1(24 * e * .25)}px) scale(${r2(e * 1.15)},${r2(e * .75)}) ${spinTo}`, opacity: 1, easing: SPRING });
      body.push({ offset: (duration + SQUASH_MS) / length, transform: `scale(${r2(e)}) ${spinTo}`, opacity: 1 });
      body.push({ offset: 1, transform: `scale(${r2(e)}) ${spinTo}`, opacity: 0 });
    }
    part(record, sprite.body, body, 0, length);
    return true;
  }

  // ---- particles
  function burst(rect, options = {}) {
    const { kind = 'spark', cue = null, delay = 0, duration } = options;
    const box = toBox(rect);
    if (!motionOK() || !box || offscreen(box) || !(kind in KINDS)) return skip(cue);
    ensureLayer();
    const life = duration ?? KINDS[kind].life[1], record = begin(delay + life);
    spray(record, kind, box.x, box.y, { ...options, life, start: delay, jitter: Math.min(box.width, box.height) * .18 });
    if (!settle(record)) return skip(cue);
    say(cue);
    return true;
  }
  function ripple(rect, color, { cue = null, delay = 0 } = {}) {
    const box = toBox(rect);
    if (!motionOK() || !box || offscreen(box)) return skip(cue);
    ensureLayer();
    const record = begin(delay + 130 + TIMING.ripple);
    ring(record, box, color, delay); ring(record, box, color, delay + 130, .82);
    if (!settle(record)) return skip(cue);
    say(cue);
    return true;
  }
  // Droplets jump out of the broth surface in its colour, with a ring (starting at `start` ms, 520 ms long).
  const SPLASH_MS = 520;
  function splashInto(record, box, color, start) {
    const point = surfaceOf(box), scale = clamp(box.width / 80, .8, 1.7);
    spray(record, 'drop', point.x, point.y, { count: 6, colors: [color || '#f3d9a4'], start, life: SPLASH_MS, cone: Math.PI * .7, scale, jitter: box.width * .12 });
    ring(record, box, color, start);
  }
  function splash(rect, color, { cue = null, delay = 0 } = {}) {
    const box = toBox(rect);
    if (!motionOK() || !box || offscreen(box)) return skip(cue);
    ensureLayer();
    const record = begin(delay + SPLASH_MS);
    splashInto(record, box, color, delay);
    if (!settle(record)) return skip(cue);
    say(cue);
    return true;
  }

  // ---- throws
  function arc(content, from, to, options = {}) {
    const { duration = TIMING.arc, height = TIMING.arcHeight, apex = null, size = 40, spin = 0, fadeOut = false, squashOnLand = true, onLand = null, cue = null, cueAt = 'land', endScale = 1 } = options;
    const a = toBox(from), b = toBox(to);
    if (!motionOK() || !a || !b || !content || (offscreen(a) && offscreen(b))) return skip(cue, onLand);
    ensureLayer();
    const record = begin(spriteLength(duration, fadeOut, squashOnLand));
    if (!throwSprite(record, content, a, b, { duration, height: apex === null ? Math.max(0, height) : bulgeForApex(b.y - a.y, apex), size, spin, fadeOut, squashOnLand, endScale, onLand, landCue: cueAt === 'land' ? cue : null })) { end(record); return skip(cue, onLand); }
    if (cueAt !== 'land') say(cue);
    return true;
  }
  // Strainer lift, drips back into the pot at 136 ms, the noodle nest lands at 512 ms, broth splash at 640 ms.
  function scoop(potRect, bowlRect, brothColor, { cooked = false, cue = null, target = null, label = 'Vừa chín!' } = {}) {
    const pot = toBox(potRect), bowl = toBox(bowlRect), T = TIMING.scoop;
    if (!motionOK() || !pot || !bowl) return skip(cue);
    ensureLayer();
    const from = { x: pot.x, y: pot.top + pot.height * .3 }, to = surfaceOf(bowl), height = liftTo(from, to, 58, 34);
    const record = begin(T.splash + SPLASH_MS);
    if (!throwSprite(record, 'scoop', from, to, { duration: T.land, height, size: clamp(bowl.width * .62, 40, 64), endScale: .9, landCue: cue })) { end(record); return skip(cue); }
    const at = arcPoint(from, to, height, T.drips / T.land);
    spray(record, 'drop', at.x - 6, at.y + 10, { count: 3, colors: ['#cfe6ee'], start: T.drips, life: 300, dir: Math.PI / 2, cone: .5, spread: 8 });
    splashInto(record, bowl, brothColor, T.splash);
    if (target?.isConnected && typeof target.animate === 'function') {
      part(record, target, [{ transform: 'none' }, { transform: 'scale(1.06,.88)', offset: .35 }, { transform: 'scale(.98,1.03)', offset: .7 }, { transform: 'none' }], T.splash, 300, false);
    }
    if (cooked && label) float(bowl, label, { tone: 'good', delay: T.land });
    return true;
  }
  // Broth: seven droplets in the broth colour fly into the bowl, then a ripple.
  function pour(fromRect, bowlRect, color, { cue = null } = {}) {
    const a = toBox(fromRect), bowl = toBox(bowlRect), P = TIMING.pour;
    if (!motionOK() || !a || !bowl) return skip(cue);
    ensureLayer();
    const landing = P.flight + (P.drops - 1) * P.gap, record = begin(landing + TIMING.ripple), to = surfaceOf(bowl), height = liftTo(a, to, 36, 12);
    let shown = 0;
    for (let i = 0; i < P.drops; i++) {
      const node = grab(record, 'drop', color || '#e4572e'); if (!node) break;
      const start = { x: a.x + rand(-6, 6), y: a.y + rand(-4, 4) }, land = { x: to.x + rand(-.2, .2) * bowl.width, y: to.y + rand(-.05, .06) * bowl.height };
      const frames = arcKeyframes(start, land, height, 10, t => ` scale(${r2(1.2 - .4 * t)})`).map((frame, k, all) => ({ ...frame, opacity: k === all.length - 1 ? .2 : 1 }));
      // The first droplet keeps its own clock when it carries the cue, so the drip sounds as it lands.
      if (i === 0 && cue) play(record, node, frames, { duration: P.flight }, () => say(cue));
      else part(record, node, frames, i * P.gap, P.flight);
      shown++;
    }
    ring(record, bowl, color, shown ? P.flight + (shown - 1) * P.gap : 0);
    if (!settle(record)) return skip(cue);
    if (!shown) say(cue);
    return true;
  }
  // Topping: the tile's icon arcs over and drops into the bowl (0.5 s, the top of the throw ~46 px above the bowl).
  function drop(content, tileRect, bowlRect, { cue = null } = {}) {
    const tile = toBox(tileRect), bowl = toBox(bowlRect), D = TIMING.drop;
    if (!motionOK() || !tile || !bowl) return skip(cue);
    ensureLayer();
    const to = surfaceOf(bowl), record = begin(D.duration + TIMING.ripple);
    const landed = !!content && throwSprite(record, content, tile, to, { duration: D.duration, height: liftTo(tile, to, D.apex, 16), size: clamp(tile.width || 36, 24, 46), endScale: .72, landCue: cue });
    ring(record, bowl, '#fff3dc', landed ? D.duration : 0);
    if (!settle(record)) return skip(cue);
    if (!landed) say(cue);
    return true;
  }
  // A discarded bowl is tossed away: it turns, falls and fades.
  function toss(rect, { towards = 'down', content = 'bowl', cue = null } = {}) {
    const box = toBox(rect);
    if (!motionOK() || !box) return skip(cue);
    ensureLayer();
    const side = towards === 'left' ? -1 : towards === 'right' ? 1 : (box.x < innerWidth / 2 ? 1 : -1);
    const to = towards === 'down' ? { x: box.x + side * 34, y: box.y + 130 } : { x: box.x + side * 150, y: box.y + 70 };
    const record = begin(560);
    if (!throwSprite(record, content, box, to, { duration: 560, height: 34, size: clamp(box.width * .7, 34, 72), spin: side * 210, fadeOut: true, endScale: .6 })) { end(record); return skip(cue); }
    say(cue);
    return true;
  }

  // ---- labels
  function float(rect, text, { tone = 'good', delay = 0, cue = null } = {}) {
    const box = toBox(rect);
    if (!motionOK() || !box || text == null || text === '') return skip(cue);
    const node = floats.take(); if (!node) return skip(cue);
    ensureLayer();
    node.className = `fx-float fx-tone-${tone}`;
    node.textContent = String(text);
    node.hidden = false;
    // A label rises 48 px; one anchored in the top bar (the rating, the wallet) starts below its anchor and rises
    // into it, so it never leaves the screen.
    const base = box.top < 72 ? box.top + box.height + 46 : box.top;
    const at = (y, scale) => `${px(box.x, base + y)} translate(-50%,-100%) scale(${scale})`;
    const record = begin(delay + TIMING.float);
    record.release.push(() => floats.give(node));
    part(record, node, [
      { offset: 0, transform: at(0, .5), opacity: 0 },
      { offset: .06, transform: at(-2, 1.2), opacity: 1 },
      { offset: .12, transform: at(-4, 1), opacity: 1, easing: 'ease-out' },
      { offset: .7, transform: at(-34, 1), opacity: 1, easing: 'ease-in' },
      { offset: 1, transform: at(-48, 1), opacity: 0 },
    ], delay, TIMING.float);
    say(cue);
    return true;
  }
  function caption(text, { tone = 'good', duration = TIMING.caption, cue = null } = {}) {
    if (!motionOK() || text == null || text === '') return skip(cue);
    const node = captions.take(); if (!node) return skip(cue);
    ensureLayer();
    node.className = `fx-caption fx-tone-${tone}`;
    node.textContent = String(text);
    node.hidden = false;
    const x = innerWidth / 2, y = innerHeight * .4, at = (dy, scale) => `${px(x, y + dy)} translate(-50%,-50%) rotate(-8deg) scale(${scale})`;
    const stamp = Math.min(.14, 190 / duration);
    const record = begin(duration);
    record.release.push(() => captions.give(node));
    play(record, node, [
      { offset: 0, transform: at(0, 2.2), opacity: 0, easing: 'cubic-bezier(.5,0,.8,.5)' },
      { offset: stamp, transform: at(0, 1), opacity: 1, easing: 'ease-out' },
      { offset: stamp * 1.5, transform: at(0, 1.06), opacity: 1, easing: 'ease-in-out' },
      { offset: stamp * 2.1, transform: at(0, 1), opacity: 1 },
      { offset: .8, transform: at(0, 1), opacity: 1, easing: 'ease-in' },
      { offset: 1, transform: at(-12, 1), opacity: 0 },
    ], { duration });
    say(cue);
    return true;
  }
  // Five hearts rise over 1.3 s, staggered by 90 ms, swaying gently (from `start` ms of the record's clock). They
  // take turns on either side of the face, so a speech bubble above it stays readable.
  const heartsLength = n => (clamp(Math.round(n), 1, 8) - 1) * TIMING.hearts.gap + TIMING.hearts.each;
  function heartsAt(record, box, count, start = 0) {
    const H = TIMING.hearts, n = clamp(Math.round(count), 1, 8), half = Math.max(12, box.width / 2);
    for (let i = 0; i < n; i++) {
      const node = grab(record, 'heart'); if (!node) break;
      const side = i % 2 ? 1 : -1, x0 = box.x + side * half * rand(.95, 1.4), y0 = box.top + Math.min(box.height * .35, 26), rise = rand(56, 74), sway = rand(4, 7), phase = rand(0, Math.PI * 2), frames = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6, s = t < .2 ? .4 + 3 * t : 1 - .15 * (t - .2);
        frames.push({ offset: t, transform: `${px(x0 + sway * Math.sin(phase + t * Math.PI * 2.4), y0 - rise * (1 - (1 - t) ** 1.6))} rotate(${r1(sway * Math.sin(phase + t * 7) * 1.5)}deg) scale(${r2(s)})`, opacity: t === 0 ? 0 : t <= .6 ? 1 : r2(1 - (t - .6) / .4) });
      }
      part(record, node, frames, start + i * H.gap, H.each);
    }
  }
  function hearts(rect, n = TIMING.hearts.count, { cue = null, delay = 0 } = {}) {
    const box = toBox(rect);
    if (!motionOK() || !box || offscreen(box)) return skip(cue);
    ensureLayer();
    const record = begin(delay + heartsLength(n));
    heartsAt(record, box, n, delay);
    if (!settle(record)) return skip(cue);
    say(cue);
    return true;
  }

  // ---- departure ghost: a pooled copy of a guest card that leaves while the app removes the real card
  const LINE_MS = 1100, SMOKE_MS = 980;
  function ghostFrom({ rect, ring: ringBox = null, face = '', name = '', ringColor = '', intent = 'leave', line = '', hearts: love = false, cue = null }) {
    const box = toBox(rect);
    if (!motionOK() || !box || offscreen(box)) return skip(cue);
    const ghost = ghosts.take(); if (!ghost) return skip(cue);
    ensureLayer();
    const plan = ghostPlan(intent), dir = box.x < innerWidth / 2 ? -1 : 1;
    const ringAt = toBox(ringBox) || (face ? { left: box.x - Math.min(23, box.width / 2), top: box.top + 4, width: Math.min(46, box.width), height: Math.min(46, box.width) } : null);
    Object.assign(ghost.root.style, { width: `${r1(box.width)}px`, height: `${r1(box.height)}px`, transform: px(box.left, box.top) });
    ghost.ring.hidden = !ringAt;
    if (ringAt) {
      Object.assign(ghost.ring.style, { left: `${r1(ringAt.left - box.left)}px`, top: `${r1(ringAt.top - box.top)}px`, width: `${r1(ringAt.width)}px`, height: `${r1(ringAt.height)}px` });
      if (ringColor) ghost.ring.style.setProperty('--ring', ringColor); else ghost.ring.style.removeProperty('--ring');
      if (face && ghost.img.getAttribute('src') !== face) ghost.img.src = face;
      ghost.img.hidden = !face;
    }
    ghost.name.textContent = name;
    ghost.name.style.top = ringAt ? `${r1(ringAt.top - box.top + ringAt.height + 2)}px` : `${r1(box.height / 2 - 9)}px`;
    ghost.root.classList.toggle('fx-pill', !ringAt);
    ghost.root.hidden = false;
    // The speech bubble is its own node above the particles, so hearts pass behind it, not over its words.
    const bubble = line ? lines.take() : null;
    const showHearts = love && plan.heartsAt !== null;
    const record = begin(Math.max(plan.duration, bubble ? LINE_MS : 0, showHearts ? plan.heartsAt + heartsLength(TIMING.hearts.count) : 0, plan.puffAt !== null ? plan.puffAt + SMOKE_MS : 0));
    record.release.push(() => ghosts.give(ghost));
    part(record, ghost.motion, plan.frames.map(({ offset, x, y, opacity, scale, easing }) => ({ offset, transform: `translate(${r1(intent === 'served' ? x * dir : x)}px,${y}px) scale(${scale})`, opacity, ...(easing ? { easing } : {}) })), 0, plan.duration);
    if (bubble) {
      bubble.textContent = String(line);
      bubble.hidden = false;
      record.release.push(() => lines.give(bubble));
      // Centred over the guest but kept on screen (an outer seat on a 320 px phone cut it off): the width is estimated
      // from the text (11.5 px bold, under 6.6 px a letter, plus padding), so the bubble still needs no layout read.
      const half = Math.min(innerWidth / 2, String(line).length * 3.3 + 8), bx = clamp(box.x, half + 4, Math.max(half + 4, innerWidth - half - 4));
      const at = (dy, scale) => `${px(bx, (ringAt ? ringAt.top : box.top) - 4 + dy)} translate(-50%,-100%) scale(${scale})`;
      part(record, bubble, [
        { offset: 0, transform: at(0, .6), opacity: 0, easing: SPRING },
        { offset: .15, transform: at(0, 1), opacity: 1 },
        { offset: .78, transform: at(0, 1), opacity: 1 },
        { offset: 1, transform: at(-6, 1), opacity: 0 },
      ], 0, LINE_MS);
    }
    const center = toBox(ringAt || box);
    if (showHearts) heartsAt(record, center, TIMING.hearts.count, plan.heartsAt);
    // An angry guest fumes: the grey puff blows off the top of the head, leaving the angry face readable.
    if (plan.puffAt !== null) spray(record, 'smoke', center.x, center.top + center.height * .12, { count: 5, start: plan.puffAt, life: SMOKE_MS, jitter: center.width * .22, scale: .8 });
    say(cue);
    return true;
  }
  function ghost(cardNode, intent = 'leave', { line = '', hearts: love = false, face = '', cue = null } = {}) {
    if (!motionOK() || !cardNode?.isConnected) return skip(cue);
    const ringNode = cardNode.querySelector('.patience-ring'), img = ringNode?.querySelector('img');
    const name = (cardNode.querySelector('strong, .delivery-summary')?.textContent || '').trim().slice(0, 28);
    return ghostFrom({ rect: cardNode.getBoundingClientRect(), ring: ringNode?.getBoundingClientRect() || null, face: face || img?.getAttribute('src') || '', name, ringColor: ringNode?.style.getPropertyValue('--ring-color') || '', intent, line, hearts: love, cue });
  }

  // ---- one-shots on the app's own nodes (WAAPI, never leaving an inline transform behind)
  function shot(node, frames, duration, easing, cue) {
    if (!motionOK() || !node?.isConnected || typeof node.animate !== 'function') return skip(cue);
    const prior = shots.get(node);
    if (prior && !prior.done) end(prior);
    const record = begin(duration);
    shots.set(node, record);
    play(record, node, frames, { duration, easing });
    say(cue);
    return true;
  }
  const pop = (node, { cue = null } = {}) => shot(node, [{ transform: 'scale(0)' }, { transform: 'scale(1.15)', offset: .6 }, { transform: 'scale(1)' }], TIMING.pop, 'ease-out', cue);
  // An SVG node that already loops in CSS (the chili bottle's sway) can only animate transform once at a time on the
  // compositor, and a paused loop comes back on the main thread. Such a node gets the CSS squeeze instead: the
  // .fx-squeeze/.fx-squeeze-b classes swap its loop for the reference squeeze (1.14/0.82 in 0.35 s), alternating so
  // a quick second squeeze restarts without a forced layout.
  const loopsInCss = node => { try { return node instanceof SVGElement && node.getAnimations().some(anim => anim instanceof CSSAnimation && anim.effect?.getTiming().iterations === Infinity); } catch { return false; } };
  function cssSqueeze(node, cue) {
    const prior = classShots.get(node), name = prior?.name === 'fx-squeeze' ? 'fx-squeeze-b' : 'fx-squeeze';
    if (prior) { clearTimeout(prior.timer); node.classList.remove(prior.name); }
    node.classList.add(name);
    classShots.set(node, { name, timer: setTimeout(() => { node.classList.remove(name); classShots.delete(node); }, TIMING.squeeze + 50) });
    say(cue);
    return true;
  }
  function squash(node, { amount = .75, x, y, duration = TIMING.squash, cue = null } = {}) {
    if (motionOK() && node?.isConnected && (classShots.has(node) || loopsInCss(node))) return cssSqueeze(node, cue);
    const sy = y ?? amount, sx = x ?? 1 / Math.sqrt(sy);
    return shot(node, [{ transform: `scale(${r2(sx)},${r2(sy)})` }, { transform: 'scale(1)' }], duration, SPRING, cue);
  }
  const shake = (node, { cue = null } = {}) => shot(node, [0, -5, 5, -5, 5, -2.5, 0].map(x => ({ transform: `translateX(${x}px)` })), TIMING.shake, 'linear', cue);
  function quake(node, { cue = null } = {}) {
    const frames = [{ transform: 'translate(0px,0px)' }];
    for (let i = 1; i < 8; i++) { const k = 1 - i / 9; frames.push({ transform: `translate(${r1((random() * 2 - 1) * 3 * k)}px,${r1((random() * 2 - 1) * 2 * k)}px)` }); }
    frames.push({ transform: 'translate(0px,0px)' });
    return shot(node, frames, TIMING.quake, 'linear', cue);
  }
  const boing = (node, { cue = null } = {}) => shot(node, [{ transform: 'scale(.92)' }, { transform: 'scale(1.06)', offset: .45 }, { transform: 'scale(1)' }], TIMING.boing, 'ease-out', cue);

  // ---- the wallet tween: at most 12 timed steps (no animation frames), always ending exactly on format(to)
  function flag(element, name, ms) {
    if (!element?.classList) return;
    const other = name === 'fx-up' ? 'fx-down' : 'fx-up', old = flags.get(element);
    if (old) { clearTimeout(old.timer); cancelAnimationFrame(old.frame); }
    element.classList.remove(other);
    const state = { timer: 0, frame: 0 };
    flags.set(element, state);
    const add = () => { element.classList.add(name); state.timer = setTimeout(() => { element.classList.remove(name); flags.delete(element); }, ms); };
    // Restarting the same flash needs one style pass without the class; two frames give it without a forced layout.
    if (element.classList.contains(name)) { element.classList.remove(name); state.frame = requestAnimationFrame(() => { state.frame = requestAnimationFrame(add); }); }
    else add();
  }
  function unflag(element) {
    const state = flags.get(element); if (!state) return;
    clearTimeout(state.timer); cancelAnimationFrame(state.frame);
    element.classList.remove('fx-up', 'fx-down'); flags.delete(element);
  }
  function finishCount(node) {
    const state = counts.get(node); if (!state) return;
    clearTimeout(state.timer); counts.delete(node); state.write(state.to);
  }
  function countTo(node, from, to, format = String, { duration = TIMING.count, flag: flagged = node } = {}) {
    if (!node) return false;
    const write = value => { let text; try { text = String(format(value)); } catch { text = String(value); } if (node.textContent !== text) node.textContent = text; };
    if (counts.has(node)) { clearTimeout(counts.get(node).timer); counts.delete(node); }
    if (!motionOK() || paused || !Number.isFinite(from) || !Number.isFinite(to) || from === to) { write(to); return false; }
    const values = countSteps(from, to), gap = Math.max(16, duration / values.length);
    const state = { timer: 0, to, write };
    counts.set(node, state);
    let index = 0;
    const step = () => {
      if (counts.get(node) !== state) return;
      write(values[index++]);
      if (index < values.length) state.timer = setTimeout(step, gap); else counts.delete(node);
    };
    state.timer = setTimeout(step, gap);
    flag(flagged, to > from ? 'fx-up' : 'fx-down', TIMING.flash);
    return true;
  }

  // ---- pause, resume, clear
  function syncPause() {
    if (dead) return;
    const want = manualPause || !!dialog?.open || !!doc.hidden;
    if (want === paused) return;
    paused = want;
    // fx.css pauses every CSS animation in the app under html.fx-paused (a class: a :has() rule would cost a whole
    // restyle of the app on DOM changes).
    doc.documentElement.classList.toggle('fx-paused', want);
    for (const record of live) for (const anim of record.anims) {
      if (want) { if (anim.playState === 'running') anim.pause(); } else if (anim.playState === 'paused') anim.play();
    }
    // A number frozen halfway would be wrong behind the dialog: tweens jump to their end instead.
    if (want) for (const node of [...counts.keys()]) finishCount(node);
  }
  function clear() {
    demoTimers.forEach(clearTimeout); demoTimers = [];
    for (const record of [...live]) end(record);
    for (const node of [...counts.keys()]) finishCount(node);
    for (const element of [...flags.keys()]) unflag(element);
    for (const [node, state] of classShots) { clearTimeout(state.timer); node.classList.remove(state.name); }
    classShots.clear();
  }
  const dialogWatch = typeof MutationObserver === 'function' ? new MutationObserver(syncPause) : null;
  if (dialog) dialogWatch?.observe(dialog, { attributes: true, attributeFilter: ['open'] });
  // Motion switched off mid-effect (the in-game setting toggles html.reduced-motion): stop everything at once.
  const motionWatch = typeof MutationObserver === 'function' ? new MutationObserver(() => { if (!motionOK()) clear(); }) : null;
  motionWatch?.observe(doc.documentElement, { attributes: true, attributeFilter: ['class'] });
  const media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const onMedia = () => { if (!motionOK()) clear(); };
  media?.addEventListener?.('change', onMedia);
  doc.addEventListener('visibilitychange', syncPause);
  syncPause();

  // ---- demo: one of each effect at fixed spots (layout and tap tests). The particle pool holds 32, so the effects
  // come in three waves (0, 600 and 1200 ms); the return value counts the effects shown by the first wave.
  function demo() {
    if (!motionOK()) return 0;
    const W = innerWidth, H = innerHeight, at = (fx, fy, w = 64, h = 48) => ({ left: W * fx - w / 2, top: H * fy - h / 2, width: w, height: h });
    const bowl = at(.5, .56, 90, 68);
    const waves = [
      () => [
        ...KIND_NAMES.map((kind, i) => burst(at(.12 + (i % 4) * .25, i < 4 ? .12 : .24), { kind, count: 2 })),
        arc('bowl', at(.15, .82), at(.85, .3), { size: 44 }),
        arc('tea', at(.85, .82), at(.2, .34), { size: 28, height: 40 }),
        drop('nest', at(.6, .9, 36, 36), bowl),
        ripple(at(.7, .46), '#6cc3ef'),
        float(at(.5, .36), '+10 XP'),
        toss(at(.75, .62, 72, 54)),
        ghostFrom({ rect: at(.86, .16, 74, 92), ring: at(.86, .12, 46, 46), face: ART.face, name: 'Khách', intent: 'served', line: 'Ngon quá!' }),
        caption('Mở cửa!'),
      ],
      () => [scoop(at(.18, .66, 40, 36), bowl, '#e4572e', { cooked: true }), pour(at(.82, .9), bowl, '#f3b14a'), hearts(at(.5, .7), 3)],
      () => [splash(at(.3, .46), '#f59a3a'), ghostFrom({ rect: at(.14, .16, 74, 92), ring: at(.14, .12, 46, 46), face: ART.face, name: 'Khách', intent: 'angry' })],
    ];
    demoTimers.forEach(clearTimeout);
    demoTimers = [setTimeout(waves[1], 600), setTimeout(waves[2], 1200)];
    return waves[0]().filter(Boolean).length;
  }

  function destroy() {
    if (dead) return;
    clear();
    dead = true;
    doc.documentElement.classList.remove('fx-paused');
    dialogWatch?.disconnect(); motionWatch?.disconnect();
    media?.removeEventListener?.('change', onMedia);
    doc.removeEventListener('visibilitychange', syncPause);
    layer.remove();
  }

  return Object.freeze({
    burst, arc, scoop, pour, drop, splash, ripple, float, hearts, ghost, toss, pop, squash, shake, quake, boing, countTo, caption,
    pause() { manualPause = true; syncPause(); },
    resume() { manualPause = false; syncPause(); },
    clear,
    live: () => live.size + counts.size,
    counting: node => counts.has(node),
    free: () => ({ particles: particles.free, sprites: sprites.free, ghosts: ghosts.free, bubbles: lines.free, floats: floats.free, captions: captions.free }),
    destroy,
    demo,
    art: ART,
  });
}

// Without a DOM (Node tests) or element.animate (very old browsers): the same API, doing nothing visible.
function inertFx() {
  const no = () => false;
  return Object.freeze({
    burst: no, arc: (content, from, to, options) => { if (options?.onLand) queueMicrotask(options.onLand); return false; }, scoop: no, pour: no, drop: no, splash: no, ripple: no,
    float: no, hearts: no, ghost: no, toss: no, pop: no, squash: no, shake: no, quake: no, boing: no, caption: no,
    countTo(node, from, to, format = String) { if (node) node.textContent = String(format(to)); return false; },
    pause() {}, resume() {}, clear() {}, live: () => 0, counting: no, free: () => ({ particles: 0, sprites: 0, ghosts: 0, bubbles: 0, floats: 0, captions: 0 }), destroy() {}, demo: () => 0, art: ART,
  });
}
