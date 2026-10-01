/**
 * The living street (Tiệm Mì Cay): a light director that adds small moving life over the street backdrop behind
 * the customers: sparrows on the wires, people on the far kerb, traffic on wide screens, rain beads, birds flying
 * home, the lamp stuttering on, moths, a rooftop cat, a weekend kite, the shop's pet, festival bunting, gusting
 * leaves, and short story vignettes when street events happen.
 *
 * Coordinates are the backdrop's own 400 × 220 street units (src/art/scene.js streetBackdrop, drawn with
 * "xMidYMid slice"). The layer's stage gets the same cover transform, so actors land on the painted wires, roofs,
 * kerb and road at every screen size.
 *
 * Cost model: tick() runs every ~0.1 s and only schedules and despawns; no JS runs per frame. Every moving node is a
 * composited transform/opacity animation: CSS keyframes for endless loops, element.animate() for crossings and
 * one-shots. Sprites are data-URI <img>s with their frames side by side in one strip, swapped by a stepped
 * translate, so a walker costs two animating nodes. Cosmetic randomness is a mulberry32 seeded by the day number.
 */

/* ===================================================================== *
 * Backdrop geometry (keep in step with streetBackdrop in src/art/scene.js)
 * ===================================================================== */

const DAY_SECONDS = 210;
// The three sagging wires: per segment [x0, y0, control x, control y, x2, y2]; the wires sit 0, 5 and 9 units lower.
const WIRE_SEGS = [[-4, 50, 57, 66, 118, 46], [118, 46, 207, 68, 296, 46], [296, 46, 350, 62, 404, 52]];
const WIRES = [0, 5, 9];
const LAMP = { x: 257, y: 100 };          // lamp head 251–263 × 96–101; the painted glow is centred at (257, 102)
const LAMP_POST = { x: 240, y: 132 };     // the post runs x = 240 from y 102 to 174
// Parapet tops of the near shophouses [x0, x1, y]: three floors stand at y 66, two floors at y 88.
const ROOFS = [[-6, 50, 66], [50, 100, 88], [100, 156, 66], [156, 208, 88], [208, 262, 66], [262, 314, 88], [314, 366, 66], [366, 408, 88]];
const KERB_Y = 174.5;                     // far pavement y 170–177
const ROAD_FAR_Y = 184.5, ROAD_NEAR_Y = 193.5; // road y 177–195, lane dashes at 186; traffic keeps right
const OUR_KERB_Y = 205;                   // our pavement y 195–220
const SWITCH_P = 9.5 / 12;                // the 12-step backdrop first shows the lit lamp (p ≥ .8) at this progress
const LAMP_START = .776;                  // the stutter starts about 3 s before that

// What stands in front of the open sky, as [x0, x1, top]: the far skyline's stacked tiers (and their shaded sides),
// the near roofs with their tanks, tile ridges and pot plants, and the two poles with their crossbars.
const FAR_TIERS = [[-8, 26, 66], [-2, 18, 54], [22, 64, 82], [60, 96, 60], [66, 90, 50], [73, 83, 42], [92, 136, 78], [132, 168, 56], [138, 162, 46],
  [164, 210, 80], [206, 246, 50], [212, 240, 40], [220, 232, 32], [242, 286, 72], [282, 320, 54], [288, 314, 44], [316, 358, 78], [354, 390, 58],
  [360, 384, 48], [386, 422, 74]];
const SKY_BLOCKERS = [...FAR_TIERS, ...FAR_TIERS.map(([, x1, top]) => [x1, x1 + 6, top + 3]),
  [-7, 51, 66], [4, 24, 54], [49, 101, 88], [58, 92, 79], [99, 157, 66], [108, 116, 62], [140, 150, 61], [155, 209, 88], [163, 201, 79],
  [207, 263, 66], [218, 238, 54], [261, 315, 88], [313, 367, 66], [321, 359, 57], [365, 409, 88], [376, 396, 76],
  [114, 122, 40], [109, 127, 44], [292, 300, 40], [287, 305, 44]];
const skyBottom = x => SKY_BLOCKERS.reduce((m, [x0, x1, top]) => (x >= x0 && x <= x1 ? Math.min(m, top) : m), 200);
// The awning's string lights hang in three swags (12 → 40 → 12, bulbs 6 below the wire, glowing up to 7.5 round).
const bulbLine = x => { const sw = 400 / 3, t = ((x % sw) + sw) % sw / sw; return 12 + 56 * t * (1 - t) + 13.7; };
let skyMask = '';
/** An alpha mask (data URI) of the open sky: far things (clouds, a shooting star) pass behind roofs, poles and lights. */
function skyMaskURI() {
  if (skyMask) return skyMask;
  const top = [], bottom = [];
  for (let x = -10; x <= 410; x += 2) { const a = bulbLine(x); top.push(`${x} ${r2(a)}`); bottom.unshift(`${x} ${r2(Math.max(a, skyBottom(x)))}`); }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 220" width="400" height="220"><path d="M${top.join('L')}L${bottom.join('L')}Z" fill="#000"/></svg>`;
  return (skyMask = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
}

/** y of wire k (0, 5 or 9) at x. The quadratic segments have their control point mid-way, so x is linear in t. */
export function wireY(k, x) {
  const seg = WIRE_SEGS.find(s => x <= s[4]) || WIRE_SEGS[WIRE_SEGS.length - 1];
  const [x0, y0, , cy, x2, y2] = seg, t = clamp01((x - x0) / (x2 - x0));
  return (1 - t) * (1 - t) * (y0 + k) + 2 * (1 - t) * t * (cy + k) + t * t * (y2 + k);
}

/* ===================================================================== *
 * Small pure helpers
 * ===================================================================== */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clamp01 = v => clamp(v, 0, 1);
const r2 = n => Math.round(n * 100) / 100;
const r4 = n => Math.round(n * 10000) / 10000;

/** Deterministic pseudo-random sequence (mulberry32), the same generator the art modules use. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(...parts) {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    h = Math.imul(h ^ 0x2f, 16777619);
  }
  return h >>> 0;
}
/** Convenience draws over one seeded stream. */
function dice(rng) {
  return {
    f: rng,
    r: (a, b) => a + (b - a) * rng(),
    i: (a, b) => a + Math.floor(rng() * (b - a + 1)),
    pick: list => list[Math.min(list.length - 1, Math.floor(rng() * list.length))],
    chance: p => rng() < p,
    sign: () => (rng() < .5 ? -1 : 1),
    shuffle(list) { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; },
  };
}

/* ===================================================================== *
 * Screen mapping, tone and the view
 * ===================================================================== */

/** The backdrop's cover transform for a W × H box: stage units → box pixels (x·s + ox, y·s + oy). */
export function stageTransform(W, H) {
  const s = Math.max(W / 400, H / 220) || 1;
  return { s, ox: (W - 400 * s) / 2, oy: (H - 220 * s) / 2 };
}

/** The part of the 400 × 220 drawing a W × H box shows, in street units. */
export function visibleWindow(W, H) {
  const { s, ox, oy } = stageTransform(W, H);
  return { x0: -ox / s, x1: (W - ox) / s, y0: -oy / s, y1: (H - oy) / s };
}

/** Sprite tone for the time of day: day < .62 ≤ dusk ≤ .78 < night. Rain days are 'rain' until night falls; after
 * that the dark night tone reads better against the near-black rainy sky. */
export function toneAt(progress, rain) {
  const p = clamp01(Number.isFinite(+progress) ? +progress : 0);
  if (p > .78) return 'night';
  if (rain) return 'rain';
  return p >= .62 ? 'dusk' : 'day';
}

const PET_KIND = { pet_cat: 'cat', pet_dog: 'dog', pet_hamster: 'hamster', cat: 'cat', dog: 'dog', hamster: 'hamster' };
const EVENTS = new Set(['normal', 'weekend', 'rain', 'hot', 'cold', 'students', 'reviewer', 'sale', 'payday', 'festival', 'challenge']);

function normalizeCtx(ctx) {
  const event = EVENTS.has(ctx?.event) ? ctx.event : 'normal';
  return {
    day: Number.isFinite(+ctx?.day) ? Math.max(0, Math.trunc(+ctx.day)) : 0,
    progress: clamp01(Number.isFinite(+ctx?.progress) ? +ctx.progress : 0),
    rain: !!ctx?.rain || event === 'rain',
    event,
    weekend: !!ctx?.weekend || event === 'weekend',
    pet: PET_KIND[ctx?.pet] ? ctx.pet : null,
    closing: !!ctx?.closing,
    busy: clamp01(+ctx?.busy || 0),
  };
}

/* Placeholder sprites: rounded blocks of the right size, used until src/art/life.js is passed in. [w, h, ax, ay] */
const PLACEHOLDER = {
  sparrow: [10, 8, 5, 8], 'flock-bird': [10, 6, 5, 3], pedestrian: [9, 19, 4.5, 19], 'pedestrian-umbrella': [15, 23, 7.5, 23],
  vendor: [20, 19, 10, 19], officer: [9, 20, 4.5, 20], 'child-balloon': [11, 25, 5.5, 25], scooter: [22, 15, 11, 15],
  bicycle: [19, 15, 9.5, 15], tricycle: [28, 19, 14, 19], bus: [74, 36, 37, 36], cat: [15, 11, 7.5, 11], dog: [13, 12, 6.5, 12],
  hamster: [8, 7, 4, 7], rat: [11, 6, 5.5, 6], kite: [13, 17, 6.5, 8.5], moth: [6, 5, 3, 2.5], gecko: [10, 4, 5, 2],
  leaf: [6, 5, 3, 2.5], petal: [5, 4, 2.5, 2], raindrop: [2.5, 4.5, 1.25, .5], splash: [9, 5, 4.5, 5], cloud: [58, 20, 29, 10],
  sparkle: [7, 7, 3.5, 3.5], 'shooting-star': [32, 8, 28, 4], flash: [18, 18, 9, 9], smoke: [13, 11, 6.5, 5.5],
  balloon: [8, 14, 4, 14], 'lamp-glow': [36, 36, 18, 18], bunting: [7, 8, 3.5, 0], 'paper-plane': [9, 5, 4.5, 2.5],
  zz: [7, 7, 3.5, 3.5], heart: [6, 6, 3, 3],
};
const PLACEHOLDER_COLORS = {
  sparrow: '#a0673e', 'flock-bird': '#3d2b3a', pedestrian: '#2f7fc1', 'pedestrian-umbrella': '#e8402f', vendor: '#f7c242',
  officer: '#3f6e4e', 'child-balloon': '#f28ab2', scooter: '#e8402f', bicycle: '#5fae4e', tricycle: '#b06a3b', bus: '#f59a3a',
  cat: '#f59a3a', dog: '#d99a5e', hamster: '#ffd28a', rat: '#7b6f72', kite: '#e8402f', moth: '#fff1c4', gecko: '#8fd3a7',
  leaf: '#c9672a', petal: '#f28ab2', raindrop: '#cfe9ff', splash: '#cfe9ff', cloud: '#ffffff', sparkle: '#fff6c8',
  'shooting-star': '#fff6c8', flash: '#ffffff', smoke: '#9aa0a8', balloon: '#e8402f', 'lamp-glow': '#ffe7a0',
  bunting: '#f7c242', 'paper-plane': '#fff3dc', zz: '#ffffff', heart: '#ef4b3f',
};
const TONE_SHADE = { day: 0, dusk: .18, rain: .25, night: .45 };
function mixHex(a, b, t) {
  const p = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)), q = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return '#' + p.map((v, i) => Math.round(v + (q[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/** A stand-in sprite with the life.js contract: { svg, w, h, ax, ay } in street units. */
export function placeholderSprite(kind, { frame = 0, variant = 0, tone = 'day' } = {}) {
  const [w, h, ax, ay] = PLACEHOLDER[kind] || [8, 8, 4, 8];
  const base = PLACEHOLDER_COLORS[kind] || '#e8402f';
  const glow = kind === 'lamp-glow' || kind === 'flash' || kind === 'sparkle';
  const fill = glow ? base : mixHex(mixHex(base, ['#ffffff', '#2f7fc1', '#5fae4e', '#8a4d9e', '#f7c242', '#e8402f'][variant % 6], .18), '#18244c', TONE_SHADE[tone] ?? 0);
  const rx = r2(Math.min(w, h) / 3), f = frame % 4, dot = r2(w * (.25 + .5 * (f % 2))), lift = f >= 2 ? r2(h * .3) : r2(h * .75);
  const body = glow
    ? `<circle cx="${w / 2}" cy="${h / 2}" r="${r2(Math.min(w, h) / 2 - .5)}" fill="${fill}" opacity=".55"/>`
    : `<rect x=".5" y=".5" width="${r2(w - 1)}" height="${r2(h - 1)}" rx="${rx}" fill="${fill}" stroke="#4a2a22" stroke-width=".7"/><circle cx="${dot}" cy="${lift}" r="${r2(Math.max(.6, Math.min(w, h) / 6))}" fill="#4a2a22"/>`;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`, w, h, ax, ay };
}
const placeholderSize = kind => { const [w, h, ax, ay] = PLACEHOLDER[kind] || [8, 8, 4, 8]; return { w, h, ax, ay }; };

/** Visible fraction of a rectangle: inside the window and not under the lane, title or counter (sampled). */
function makeVis(win, occluders) {
  return (ax0, ax1, ay0, ay1) => {
    const nx = clamp(Math.round((ax1 - ax0) / 3), 3, 14), ny = clamp(Math.round((ay1 - ay0) / 3), 2, 4);
    const near = occluders.filter(o => o.x1 >= ax0 && o.x0 <= ax1 && o.y1 >= ay0 && o.y0 <= ay1);
    let seen = 0;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const x = ax0 + (ax1 - ax0) * (i + .5) / nx, y = ay0 + (ay1 - ay0) * (j + .5) / ny;
      if (x < win.x0 || x > win.x1 || y < win.y0 || y > win.y1) continue;
      let cover = 0;
      for (const o of near) if (x >= o.x0 && x <= o.x1 && y >= o.y0 && y <= o.y1) cover = Math.max(cover, o.w ?? 1);
      seen += 1 - cover;
    }
    return seen / (nx * ny);
  };
}

// Small creatures are drawn bigger on small screens so they stay readable: [minimum on-screen px, maximum boost].
const MIN_PX = {
  sparrow: [13, 1.9], 'flock-bird': [13, 2.4], moth: [7, 1.8], gecko: [10, 1.8], rat: [12, 1.8], leaf: [8, 1.8], petal: [7, 1.8],
  raindrop: [7, 2.2], splash: [10, 1.8], sparkle: [9, 1.8], heart: [9, 1.8], zz: [9, 1.8], 'paper-plane': [12, 1.8],
  hamster: [12, 1.8], kite: [15, 1.6], balloon: [11, 1.6], cat: [22, 1.5], dog: [22, 1.5], flash: [14, 1.6], smoke: [14, 1.6],
  'shooting-star': [22, 1.5], pedestrian: [16, 1.2], 'pedestrian-umbrella': [16, 1.2], vendor: [16, 1.2], officer: [16, 1.2],
  'child-balloon': [16, 1.2], scooter: [18, 1.25], bicycle: [17, 1.25], tricycle: [18, 1.2],
};
function displayScale(kind, s, sizeOf) {
  const rule = MIN_PX[kind];
  if (!rule) return 1;
  const { w, h } = sizeOf(kind), px = Math.max(w, h) * s;
  return px > 0 ? r2(clamp(rule[0] / px, 1, rule[1])) : 1;
}

/** Darkening of the backdrop's lower part (.street-art::after: a #1a0c12 gradient over the bottom 62%, alpha .35 at
 * 60% of it and .5 at the bottom). Actors are baked a little lighter than that (80%) so they stay readable. */
function shadeFor(y, view) {
  if (!view?.H) return 1;
  const f = (y * view.s + view.oy) / view.H;
  const a = f < .38 ? 0 : f < .752 ? .349 * (f - .38) / .372 : .349 + .153 * Math.min(1, (f - .752) / .248);
  return Math.round((1 - .8 * a) * 20) / 20;
}

/**
 * Everything the director needs to know about one screen: the cover transform, the visible window, which painted
 * places (wires, roofs, kerb, road, lamp) are visible enough (≥ 60% not hidden by the lane or the counter), and the
 * budgets. Occluders are rectangles in street units with a weight (1 opaque, < 1 see-through).
 */
export function buildView(W, H, opts = {}) {
  const sizeOf = opts.sizeOf || placeholderSize;
  const { s, ox, oy } = stageTransform(W, H), win = visibleWindow(W, H);
  const occluders = (opts.occluders || []).filter(o => o && o.x1 > o.x0 && o.y1 > o.y0);
  const budget = clamp(Number.isFinite(+opts.budget) ? +opts.budget : 1, .2, 1);
  const small = opts.small ?? (W * H < 70000);
  const vis = makeVis(win, occluders);
  // Bars stacked along the bottom (the progress bar, the counter): the visible street ends where they begin.
  let floorY = win.y1, counterTop = null;
  const bars = occluders.filter(o => (o.w ?? 1) >= .3 && o.x1 - o.x0 >= (win.x1 - win.x0) * .85 && o.y0 > win.y0 + 10).sort((a, b) => b.y1 - a.y1);
  for (const o of bars) if (o.y1 >= floorY - 2) { floorY = Math.min(floorY, o.y0); if ((o.w ?? 1) >= .9) counterTop = Math.min(counterTop ?? Infinity, o.y0); }
  if (Number.isFinite(opts.counterTop)) { counterTop = opts.counterTop; floorY = Math.min(floorY, counterTop); }
  const k = kind => displayScale(kind, s, sizeOf);
  const view = { W, H, s, ox, oy, ...win, small, budget, occluders, vis, counterTop, floorY, empty: !(W > 4 && H > 4) };
  view.cap = Math.max(1, Math.round((small ? 3 : 6) * budget));
  view.nodeCap = small ? 8 : Math.max(10, Math.round(16 * budget));
  view.bands = { sky: 0, wire: 0, roof: 0, kerb: 0, road: 0, lamp: 0, wall: 0, pet: 0, ground: 0 };
  Object.assign(view, { sky: { y: 40, vis: 0 }, perches: [], roofs: [], ground: null, road: { far: 0, near: 0 }, lamp: 0, wall: 0, petSpot: null, freePoints: [] });
  if (view.empty) return view;

  // Sky: the flight line with the clearest band above the roofs (birds, kite, paper plane).
  let sky = { y: clamp(win.y0 + 8, 30, 58), vis: 0 };
  for (let y = Math.max(win.y0 + 6, 30); y <= Math.min(62, floorY - 6); y += 2) {
    const v = vis(win.x0, win.x1, y - 6, y + 6);
    if (v > sky.vis + .02) sky = { y, vis: v };
  }
  view.sky = sky;
  // Perches on the three wires.
  const sp = sizeOf('sparrow'), ks = k('sparrow'), pw = sp.w * ks / 2, ph = sp.h * ks;
  for (let x = Math.max(win.x0 + 8, -2); x <= Math.min(win.x1 - 8, 402); x += 4) for (const kw of WIRES) {
    if (Math.abs(x - 118) < 4 || Math.abs(x - 296) < 4) continue;
    const y = wireY(kw, x), v = vis(x - pw, x + pw, y - ph, y);
    if (v >= .6) view.perches.push({ x, y: r2(y), k: kw, vis: r2(v) });
  }
  // Parapet walks (the rooftop cat).
  const cat = sizeOf('cat'), kc = k('cat');
  for (const [rx0, rx1, y] of ROOFS) {
    const x0 = Math.max(rx0 + 3, win.x0 + 4), x1 = Math.min(rx1 - 3, win.x1 - 4);
    if (x1 - x0 < 20) continue;
    const v = vis(x0, x1, y - cat.h * kc, y);
    if (v >= .5) view.roofs.push({ x0, x1, y, vis: r2(v) });
  }
  // Ground: the far kerb when it shows; otherwise people pass "behind the counter" with only their upper body seen.
  const ped = sizeOf('pedestrian'), kp = k('pedestrian'), feetY = r2(clamp(floorY - .5, 170.5, KERB_Y));
  // A walker reads when its legs and body show (the lower 60%); its head may pass behind the cards' name pills.
  const kerbVis = vis(win.x0, win.x1, feetY - ped.h * kp * .6, feetY);
  if (kerbVis >= .6) view.ground = { mode: 'kerb', y: feetY, k: 1, z: 8, vis: r2(kerbVis) };
  else if (counterTop != null && counterTop > win.y0 + 20 && counterTop <= win.y1 + 1) {
    const kk = 1.3, v = vis(win.x0, win.x1, counterTop - ped.h * kp * kk * .6, counterTop);
    if (v >= .6) view.ground = { mode: 'counter', y: r2(counterTop + ped.h * kp * kk * .38), k: kk, z: 11, vis: r2(v) };
  }
  const veh = sizeOf('scooter'), kv = k('scooter');
  view.road = { far: r2(vis(win.x0, win.x1, ROAD_FAR_Y - veh.h * kv, ROAD_FAR_Y)), near: r2(vis(win.x0, win.x1, ROAD_NEAR_Y - veh.h * kv, ROAD_NEAR_Y)) };
  view.lamp = LAMP.x > win.x0 + 6 && LAMP.x < win.x1 - 6 ? r2(vis(LAMP.x - 9, LAMP.x + 9, LAMP.y - 9, LAMP.y + 9)) : 0;
  const gk = sizeOf('gecko'), gw = Math.max(gk.w, gk.h) * k('gecko') / 2 + 1;
  view.wall = LAMP_POST.x > win.x0 + 4 && LAMP_POST.x < win.x1 - 4 ? r2(vis(LAMP_POST.x - 3, LAMP_POST.x + 3, LAMP_POST.y - gw - 8, LAMP_POST.y + gw + 8)) : 0;
  // The shop's pet: sitting at our kerb on tall wide boxes, else peeking in at the edge of the lane.
  for (const kind of ['cat', 'dog']) {
    const pz = sizeOf(kind), kk = k(kind), w = pz.w * kk, h = pz.h * kk;
    for (const side of [-1, 1]) {
      const x = side < 0 ? win.x0 + w * .5 + 10 : win.x1 - w * .5 - 10;
      if (!view.petSpot && vis(x - w / 2, x + w / 2, OUR_KERB_Y - h, OUR_KERB_Y) >= .9) view.petSpot = { mode: 'sit', x: r2(x), y: OUR_KERB_Y, side };
    }
  }
  if (!view.petSpot) {
    const pz = sizeOf('cat'), kk = k('cat'), w = pz.w * kk, h = pz.h * kk, feet = floorY + h * .22;
    let best = null;
    for (const side of [-1, 1]) for (const inset of [10, 16, 24, 32, 44]) {
      const x = side < 0 ? win.x0 + w / 2 + inset : win.x1 - w / 2 - inset, v = vis(x - w / 2, x + w / 2, feet - h, floorY);
      if (v >= .6 && (!best || v > best.v + .08)) best = { mode: 'peek', x: r2(x), y: r2(feet), side, v: r2(v) };
    }
    view.petSpot = best;
  }
  // Free spots for camera flashes: never over the portraits, names or counter.
  for (let y = win.y0 + 9; y <= floorY - 9; y += 10) for (let x = win.x0 + 10; x <= win.x1 - 10; x += 12) {
    if (vis(x - 8, x + 8, y - 8, y + 8) >= .999) view.freePoints.push({ x: r2(x), y: r2(y) });
  }
  view.bands = {
    sky: r2(sky.vis), wire: view.perches.reduce((m, p) => Math.max(m, p.vis), 0), roof: view.roofs.reduce((m, r) => Math.max(m, r.vis), 0),
    kerb: r2(kerbVis), road: Math.max(view.road.far, view.road.near), lamp: view.lamp, wall: view.wall, pet: view.petSpot ? 1 : 0, ground: view.ground ? 1 : 0,
  };
  return view;
}

/* ===================================================================== *
 * Ambient planning (pure)
 * ===================================================================== */

// Families of ambient life: how dearly each is kept when room is needed, and which may come two at a time.
const FAMILY = {
  sparrow: { prio: 3 }, flock: { prio: 6 }, pedestrian: { prio: 4, many: true }, vehicle: { prio: 4, many: true },
  cloud: { prio: 1 }, kite: { prio: 6 }, roofcat: { prio: 5 }, pet: { prio: 9 }, moths: { prio: 7 }, gecko: { prio: 2 },
  drips: { prio: 8 }, splashes: { prio: 5 }, petals: { prio: 3 }, leaves: { prio: 3 },
};
const flockDue = (ctx, view, done) => !ctx.rain && ctx.progress >= .7 && ctx.progress <= .78 && !done.flock && (view.bands?.sky ?? 1) >= .6;

function ambientCandidates(ctx, view) {
  const p = ctx.progress, dry = !ctx.rain, b = { sky: 1, wire: 1, roof: 1, kerb: 1, road: 1, lamp: 1, wall: 1, pet: 1, ground: 1, ...view.bands };
  const done = view.done || {}, cooling = new Set(view.cooling || []), small = !!view.small, list = [];
  const add = (family, kind, weight) => { if (weight > 0 && !cooling.has(family)) list.push({ family, kind, weight: r4(weight) }); };
  const ground = small ? 1 - .5 * ctx.busy : 1;   // a full lane hides the ground on phones: favour the sky band
  if (dry && p < .8 && b.wire >= .6) add('sparrow', 'sparrow', (p < .35 ? 4 : 2.5) * (small ? 1.6 : 1));
  if (flockDue(ctx, { bands: b }, done)) add('flock', 'flock-bird', 60);
  if (b.ground) add('pedestrian', ctx.rain ? 'pedestrian-umbrella' : 'pedestrian', 3 * ground * (p > .9 ? .55 : 1) * (ctx.closing ? .5 : 1) * (ctx.weekend || ctx.event === 'festival' ? 1.35 : 1));
  if (b.road >= .6) add('vehicle', 'scooter', 2.6 * (p > .9 ? .7 : 1) * (ctx.event === 'payday' ? 1.3 : 1));
  if (dry && !small && b.sky >= .5 && (view.y0 ?? 0) < 28) add('cloud', 'cloud', .7);
  if (ctx.weekend && dry && p >= .15 && p <= .85 && (done.kite || 0) < 2 && b.sky >= .6) add('kite', 'kite', 3);
  if (dry && p >= .45 && p <= .95 && !done.roofcat && b.roof >= .6) add('roofcat', 'cat', 2.2);
  if (ctx.pet && b.pet) add('pet', PET_KIND[ctx.pet], 4);
  if (dry && p >= .82 && b.lamp >= .5) add('moths', 'moth', 6);
  if (p >= .8 && b.wall >= .8) add('gecko', 'gecko', .5);
  if (ctx.event === 'festival') add('petals', 'petal', 2.5);
  if (ctx.event === 'cold') add('leaves', 'leaf', 2.5);
  return list;
}

/**
 * What may spawn next: a deterministic, weighted pick of ambient families for the free slots (pure).
 * view: { cap, small, bands, active: [{ family }], done: { flock, kite, roofcat }, cooling: [family] }; missing bands
 * count as visible. Returns [{ family, kind }], never more than cap − active.
 */
export function planAmbient(seed, ctx, view = {}) {
  const c = normalizeCtx(ctx), active = view.active || [];
  let free = (view.cap ?? 6) - active.filter(a => a.ambient !== false).length;
  if (free <= 0) return [];
  const counts = {};
  for (const a of active) counts[a.family] = (counts[a.family] || 0) + 1;
  const max = family => (FAMILY[family]?.many && !view.small ? 2 : 1);
  let cands = ambientCandidates(c, view).filter(e => (counts[e.family] || 0) < max(e.family));
  const rng = mulberry32(seed), picks = [];
  while (free > 0 && cands.length) {
    const total = cands.reduce((sum, e) => sum + e.weight, 0);
    let roll = rng() * total, i = 0;
    while (i < cands.length - 1 && (roll -= cands[i].weight) > 0) i++;
    const e = cands[i];
    picks.push({ family: e.family, kind: e.kind });
    counts[e.family] = (counts[e.family] || 0) + 1;
    cands = cands.filter(x => (counts[x.family] || 0) < max(x.family));
    free--;
  }
  return picks;
}

/* ===================================================================== *
 * Motion helpers (pure): paths are keyframes { t, x, y, r, a, sx, sy, e } in seconds and street units
 * ===================================================================== */

function pathOf(points, delay = 0, iterations = 1) {
  const dur = Math.max(.001, points[points.length - 1].t);
  let last = 0;
  const kf = points.map(p => {
    const o = clamp(r4(p.t / dur), last, 1);
    last = o;
    return { o, x: r2(p.x), y: r2(p.y), r: r2(p.r || 0), a: p.a ?? 1, sx: r4(p.sx ?? 1), sy: r4(p.sy ?? 1), e: p.e };
  });
  kf[kf.length - 1].o = 1;
  return { kf, dur: r4(dur), delay: r4(delay), iterations };
}
const still = (life, fade = .6, x = 0, y = 0) => pathOf([{ t: 0, x, y, a: 0 }, { t: fade, x, y, a: 1 }, { t: life - fade, x, y, a: 1 }, { t: life, x, y, a: 0 }]);
const fadeIn = (x = 0, y = 0, d = 1) => pathOf([{ t: 0, x, y, a: 0 }, { t: d, x, y, a: 1 }]);
/** Discrete frame changes [[t, frameIndex], …] → a WAAPI-ready track. */
function trackOf(events, dur, delay = 0) {
  const d = Math.max(.001, dur);
  return { kf: events.map(([t, f]) => [clamp01(r4(t / d)), f]), dur: r4(d), delay: r4(delay) };
}
/** Walk keyframes from xa to xb at feet y: linear x with a bob baked in (up on every other half-step). */
function walkPoints(xa, xb, y, speed, step, bob, t0 = 0) {
  const dur = Math.abs(xb - xa) / speed, n = Math.max(1, Math.round(dur / (step / 2))), pts = [];
  for (let i = 0; i <= n; i++) pts.push({ t: t0 + dur * i / n, x: xa + (xb - xa) * i / n, y: y - (i % 2 ? bob : 0) });
  return pts;
}
/** Frames alternating a/b every `every` seconds over [t0, t1). */
function alternate(events, t0, t1, a, b, every) {
  let flip = false;
  for (let t = t0; t < t1 - 1e-6; t += every) { events.push([t, flip ? b : a]); flip = !flip; }
}
/** A flight toward `to` with a turn-rate limit (organic curves), homing harder as it closes in. [[t, x, y], …] */
function steer(from, heading, to, speed, turn, maxT = 8) {
  const dt = 1 / 12, pts = [[0, from.x, from.y]];
  let x = from.x, y = from.y, h = heading, t = 0;
  while (t < maxT) {
    const dist = Math.hypot(to.x - x, to.y - y), stepLen = speed * dt;
    if (dist <= stepLen) { t += dist / speed; pts.push([t, to.x, to.y]); return pts; }
    const want = Math.atan2(to.y - y, to.x - x), diff = Math.atan2(Math.sin(want - h), Math.cos(want - h));
    const rate = turn * (1 + 3 * Math.max(0, 1 - dist / 30));
    h += clamp(diff, -rate * dt, rate * dt);
    x += Math.cos(h) * stepLen; y += Math.sin(h) * stepLen; t += dt;
    pts.push([t, x, y]);
  }
  pts.push([t + Math.hypot(to.x - x, to.y - y) / speed, to.x, to.y]);
  return pts;
}
const framesOf = (kind, list, variant = 0) => list.map(f => [{ kind, frame: f, variant }]);

/* ===================================================================== *
 * The director (pure): decides what lives on the street and when
 * ===================================================================== */

export const VIGNETTES = Object.freeze(['shower', 'bus', 'rat', 'rat-caught', 'flash', 'power', 'smoke', 'patrol', 'child', 'supplier', 'wobble', 'shooting-star', 'students', 'paper-plane', 'buyer-out', 'buyer-back']);

/** Animating DOM nodes an actor costs (wrapper path, part path, frame loop or track, window loop, rotor). */
export function countNodes(spec) {
  let n = spec.path ? 1 : 0;
  for (const p of spec.parts) n += (p.path ? 1 : 0) + (p.loop || p.track ? 1 : 0) + (p.winLoop ? 1 : 0) + (p.rotor ? 1 : 0) + countRect(p);
  return n;
}

/**
 * createDirector({ sizeOf, memory }) → { step(dt, ctx, view), vignette(kind, data, ctx, view), demo(ctx, view), … }.
 * Pure: it returns actor specs to spawn and ids to remove; the DOM layer (mountLife) draws them. `memory` keeps the
 * once-a-day flags (lamp, flock, rooftop cat, kites) across remounts on the same day.
 */
export function createDirector({ sizeOf = placeholderSize, memory = null } = {}) {
  const mem = memory || { day: null, flags: {}, counter: 0 };
  const live = new Map();
  let t = 0, day = null, nextSpawn = 0, spawnedThisView = 0, nextId = 1, cool = {}, lastCtx = normalizeCtx({});

  function startDay(d) {
    day = d;
    if (mem.day !== d) { mem.day = d; mem.flags = {}; mem.counter = 0; }
    nextSpawn = t; spawnedThisView = 0; cool = {};
  }
  const ambientLive = () => [...live.values()].filter(a => a.ambient);
  // Nodes of actors still fading out: the director's own record, or what the DOM reports, whichever is more.
  let lingering = 0, fading = [];
  const nodesLive = () => [...live.values()].reduce((sum, a) => sum + a.nodes, Math.max(lingering, fading.reduce((sum, f) => sum + (f.until > t ? f.nodes : 0), 0)));
  const blank = () => ({ spawn: [], remove: [], sounds: [] });

  function env(rnd, ctx, view) {
    return { rnd, ctx, view, tone: toneAt(ctx.progress, ctx.rain), size: sizeOf, k: kind => displayScale(kind, view.s, sizeOf), shade: y => shadeFor(y, view) };
  }
  function finish(s) {
    s.id = nextId++;
    s.t0 = t - (s.seek || 0);
    s.nodes = countNodes(s);
    s.sounds = (s.sounds || []).map(([at, cue]) => ({ t: at, cue, done: false }));
    return s;
  }
  function add(s, out) {
    live.set(s.id, s);
    out.spawn.push(s);
    for (const snd of s.sounds) if (snd.t <= (s.seek || 0) + 1e-6) { snd.done = true; if (!s.seek) out.sounds.push(snd.cue); }
  }
  function drop(id, out, fade = 0, remember = true) {
    const a = live.get(id);
    if (!a) return;
    live.delete(id);
    if (fade && remember) fading.push({ nodes: a.nodes, until: t + fade + .05 });
    if (a.cool) cool[a.family] = t + a.cool;
    out.remove.push({ id, fade });
  }

  /** One node stays free for the lamp's flicker at dusk: anything still alive by then leaves it room. */
  const reserveFor = (ctx, view, dur = 0) => (!mem.flags.lamp && view.bands.lamp >= .5 && ctx.progress + dur / DAY_SECONDS >= LAMP_START - .01 ? 1 : 0);

  function step(dt, rawCtx, view) {
    const ctx = normalizeCtx(rawCtx), out = blank();
    lingering = view?.lingering || 0;
    fading = fading.filter(f => f.until > t);
    if (ctx.day !== day) { for (const id of [...live.keys()]) drop(id, out); startDay(ctx.day); }
    t += clamp(+dt || 0, 0, 1);
    lastCtx = ctx;
    for (const a of [...live.values()]) {
      if (t >= a.t0 + a.dur + .25) { drop(a.id, out); continue; }
      if (a.until && !a.until(ctx)) { drop(a.id, out, .6); continue; }
      for (const snd of a.sounds) if (!snd.done && t >= a.t0 + snd.t) { snd.done = true; out.sounds.push(snd.cue); }
    }
    if (!view || view.empty) return out;
    const p = ctx.progress;
    // Festival bunting along the top wire (a still decoration, outside the actor budget).
    if (ctx.event === 'festival' && view.bands.wire >= .5 && ![...live.values()].some(a => a.family === 'bunting')) {
      const s = recipes.bunting(env(dice(mulberry32(hash('bunting', day))), ctx, view));
      if (s) add(finish(s), out);
    }
    // Weather on the wires and the road: rain beads and splash crowns (outside the actor budget, inside the node budget).
    if (ctx.rain) for (const [family, band] of [['drips', 'wire'], ['splashes', 'road']]) {
      if (view.bands[band] < .6 || (cool[family] || 0) > t || [...live.values()].some(a => a.family === family)) continue;
      const s = recipes[family](env(dice(mulberry32(hash(family, day, mem.counter))), ctx, view));
      if (s && countNodes(s) + nodesLive() <= view.nodeCap - reserveFor(ctx, view, s.dur)) add(finish(s), out);
      cool[family] = t + 2;
    }
    // The street lamp stutters on once a day, just before the backdrop shows it lit.
    if (!mem.flags.lamp && p >= LAMP_START) {
      mem.flags.lamp = true;
      if (p < SWITCH_P - .002 && view.bands.lamp >= .5) {
        const s = recipes.lamp(env(dice(mulberry32(hash('lamp', day))), ctx, view));
        if (s) add(finish(s), out);
      }
    }
    // Birds flying home at sunset must not miss their window: make room among the less precious life, then wait for it
    // to fade before the flock comes.
    const liveNodes = [...live.values()].reduce((sum, a) => sum + a.nodes, 0), settled = lingering === 0 && !fading.some(f => f.until > t);
    if (flockDue(ctx, view, mem.flags) && settled && (ambientLive().length >= view.cap || liveNodes + 2 > view.nodeCap - reserveFor(ctx, view, 15))) {
      const victim = ambientLive().filter(a => a.prio < FAMILY.flock.prio).sort((a, b) => a.prio - b.prio || a.t0 - b.t0)[0];
      if (victim) { drop(victim.id, out, .5); nextSpawn = t + .6; }
    }
    if (t >= nextSpawn) {
      const active = ambientLive(), rnd = dice(mulberry32(hash('spawn', day, mem.counter)));
      if (active.length < view.cap) {
        const seed = hash('plan', day, mem.counter);
        mem.counter++;
        const plan = planAmbient(seed, ctx, { ...view, active: active.map(a => ({ family: a.family })), done: mem.flags, cooling: Object.keys(cool).filter(f => cool[f] > t) });
        for (const pick of plan) {
          const s = recipes[pick.family]?.(env(rnd, ctx, view), pick.kind);
          if (!s || countNodes(s) + nodesLive() > view.nodeCap - reserveFor(ctx, view, s.dur)) continue;
          add(finish(s), out);
          if (s.flag) mem.flags[s.flag] = s.flag === 'kite' ? (mem.flags.kite || 0) + 1 : true;
          break;
        }
        spawnedThisView++;
      }
      const base = spawnedThisView <= 2 ? rnd.r(.6, 1.4) : view.small ? rnd.r(3, 6) : rnd.r(2, 4.5);
      nextSpawn = t + base * (1 + .8 * ctx.busy) * (ctx.closing ? 1.5 : 1);
    }
    return out;
  }

  /** One-shot story vignettes; up to two vignette actors at once, making room among ambient life if needed. */
  function vignette(kind, data, rawCtx, view) {
    const out = blank(), recipe = vignettes[kind];
    if (!recipe || !view || view.empty) return out;
    const ctx = rawCtx ? normalizeCtx(rawCtx) : lastCtx;
    if (day === null) startDay(ctx.day);
    const rnd = dice(mulberry32(hash('vignette', kind, day, mem.counter++)));
    const specs = (recipe(env(rnd, ctx, view), data || {}) || []).filter(Boolean).slice(0, 2);
    if (!specs.length) return out;
    // A story plays at once: what it pushes aside fades out quickly (0.2 s) rather than holding it back.
    const vig = [...live.values()].filter(a => a.vignette).sort((a, b) => a.t0 - b.t0);
    while (vig.length && vig.length + specs.length > 2) drop(vig.shift().id, out, .2, false);
    const need = specs.reduce((sum, s) => sum + countNodes(s), 0);
    const evictable = [...live.values()].filter(a => a.ambient || a.weather).sort((a, b) => a.prio - b.prio || a.t0 - b.t0);
    while (evictable.length && nodesLive() + need > view.nodeCap) drop(evictable.shift().id, out, .2, false);
    for (const s of specs) add(finish(s), out);
    return out;
  }

  /** A representative still life for layout tests: one of each kind that fits this view, caught mid-motion. */
  function demo(rawCtx, view) {
    const out = blank();
    for (const id of [...live.keys()]) drop(id, out);
    if (!view || view.empty) return out;
    const ctx = normalizeCtx({ ...rawCtx, pet: rawCtx?.pet || 'pet_cat' });
    if (ctx.day !== day) startDay(ctx.day);
    const e = env(dice(mulberry32(hash('demo', ctx.day))), ctx, view), b = view.bands;
    const list = [recipes.sparrow(e), recipes.pedestrian(e, ctx.rain ? 'pedestrian-umbrella' : 'pedestrian'),
      b.road >= .6 && recipes.vehicle(e), !view.small && b.sky >= .5 && recipes.cloud(e), b.sky >= .6 && recipes.kite(e),
      b.pet && recipes.pet(e, PET_KIND[ctx.pet]), b.lamp >= .5 && recipes.moths(e), b.roof >= .6 && recipes.roofcat(e),
      ctx.rain && recipes.drips(e), ctx.event === 'festival' && recipes.bunting(e)];
    for (const s of list) if (s) { s.seek = s.demoSeek ?? (s.dur > 1e4 ? 1.2 : s.dur * .5); add(finish(s), out); }
    return out;
  }

  function actors() {
    const list = [];
    for (const a of live.values()) {
      const at = (path, base) => {
        if (!path) return base;
        const local = (((t - a.t0 - (path.delay || 0)) / path.dur) % 1 + 1) % 1, kf = path.kf;
        const clamped = t - a.t0 - (path.delay || 0) >= path.dur * (path.iterations || 1) ? 1 : t - a.t0 < (path.delay || 0) ? 0 : local;
        let i = 0;
        while (i < kf.length - 2 && kf[i + 1].o < clamped) i++;
        const A = kf[i], B = kf[i + 1] || A, u = clamp01((clamped - A.o) / (B.o - A.o || 1));
        return { x: A.x + (B.x - A.x) * u, y: A.y + (B.y - A.y) * u };
      };
      const root = at(a.path, { x: a.x, y: a.y }), first = a.parts[0], off = first ? at(first.path, { x: first.dx || 0, y: first.dy || 0 }) : { x: 0, y: 0 };
      list.push({ id: a.id, kind: a.kind, family: a.family, vignette: a.vignette || null, ambient: a.ambient, x: r2(root.x + off.x), y: r2(root.y + off.y) });
    }
    return list;
  }

  function clear() { const out = blank(); for (const id of [...live.keys()]) drop(id, out); nextSpawn = t + .3; spawnedThisView = 0; return out; }

  return {
    step, vignette, demo, actors, clear,
    /** The DOM layer reports an actor that finished on its own. */
    remove(id) { const a = live.get(id); if (a) { live.delete(id); if (a.cool) cool[a.family] = t + a.cool; } },
    live: () => [...live.values()],
    nodes: nodesLive,
    get time() { return t; },
    get memory() { return mem; },
  };
}

/* ===================================================================== *
 * Recipes: one actor spec per family, in street units
 * ===================================================================== */

function spec(family, kind, o) {
  return {
    family, kind, ambient: o.ambient ?? !o.vignette, vignette: o.vignette || null, prio: FAMILY[family]?.prio ?? 5, z: o.z ?? 5,
    dur: o.dur, x: o.x ?? 0, y: o.y ?? 0, path: o.path || null, parts: o.parts || [], sounds: o.sounds || [],
    until: o.until || null, cool: o.cool || 0, flag: o.flag || null, demoSeek: o.demoSeek, weather: !!o.weather, sky: !!o.sky,
  };
}
function part(kind, o = {}) {
  return {
    img: o.rect ? null : { frames: o.frames || [[{ kind, frame: 0, variant: o.variant ?? 0 }]], tone: o.tone, shade: o.shade ?? 1 },
    rect: o.rect || null, dx: o.dx || 0, dy: o.dy || 0, k: o.k ?? 1, mirror: !!o.mirror, loop: o.loop || null,
    winLoop: o.winLoop || null, track: o.track || null, path: o.path || null, rotor: o.rotor || null,
  };
}
const countRect = p => (p.rect?.cls === 'life-rain' ? 1 : 0);   // the streak layer's own CSS loop
const enterX = (view, dir, w) => (dir > 0 ? view.x0 - 20 - w : view.x1 + 20 + w);
const exitX = (view, dir, w) => (dir > 0 ? view.x1 + 20 + w : view.x0 - 20 - w);
const midX = view => (view.x0 + view.x1) / 2;
/** Fill in each part's tone (the tone at spawn time). */
function toned(s, tone) { if (s) for (const p of s.parts) if (p.img && !p.img.tone) p.img.tone = tone; return s; }

/** A visible gap near x (for pauses): the column with the clearest view of the band around y. */
function gapNear(view, x, yTop, yBottom, spread = 60) {
  let best = { x, v: -1 };
  for (let dx = -spread; dx <= spread; dx += 4) {
    const cx = clamp(x + dx, view.x0 + 12, view.x1 - 12), v = view.vis(cx - 4, cx + 4, yTop, yBottom) - Math.abs(dx) / spread * .15;
    if (v > best.v) best = { x: cx, v };
  }
  return best.x;
}

/** One sparrow's life: flies in on a steered curve, perches (pecks, hops, turns), flies off. */
function birdLife(e, perch, delay) {
  const { rnd, view } = e, k = e.k('sparrow');
  const side = perch.x < midX(view) ? -1 : 1;
  const start = { x: perch.x + side * rnd.r(40, 80), y: view.y0 - 12 - rnd.r(0, 10) };
  const pts = [], frames = [];
  let facing = side > 0 ? -1 : 1;
  const flight = (list, t0) => {
    let prevX = list[0][1];
    list.forEach(([tt, x, y], i) => {
      if (i % 2 && i !== list.length - 1) return;   // every 1/6 s is plenty for linear interpolation
      if (Math.abs(x - prevX) > .3) facing = x > prevX ? 1 : -1;
      prevX = x;
      pts.push({ t: t0 + tt, x, y, sx: facing * k, sy: k });
    });
  };
  const inPath = steer(start, Math.atan2(perch.y - start.y, perch.x - start.x) + rnd.r(-.35, .35), perch, 52, 5);
  flight(inPath, 0);
  const land = inPath[inPath.length - 1][0];
  alternate(frames, 0, land, 2, 3, .07);
  frames.push([land, 0]);
  // On the wire: pecks, maybe a hop along it and a turn.
  const stay = rnd.r(7, 15), events = [];
  let x = perch.x, busyUntil = land;
  for (let i = rnd.i(1, 3); i > 0; i--) events.push({ at: land + rnd.r(.8, stay - .8), kind: 'peck' });
  if (rnd.chance(.6)) events.push({ at: land + rnd.r(1.5, stay - 1.5), kind: 'hop' });
  if (rnd.chance(.5)) events.push({ at: land + rnd.r(1, stay - 1), kind: 'turn' });
  events.sort((a, b) => a.at - b.at);
  const at = (tt, xx) => pts.push({ t: tt, x: xx, y: wireY(perch.k, xx), sx: facing * k, sy: k });
  for (const ev of events) {
    if (ev.at <= busyUntil + .3) continue;
    at(ev.at, x);
    if (ev.kind === 'peck') {
      frames.push([ev.at, 1], [ev.at + .16, 0]);
      if (rnd.chance(.4)) frames.push([ev.at + .3, 1], [ev.at + .44, 0]);
      busyUntil = ev.at + .5;
    } else if (ev.kind === 'turn') {
      facing = -facing;
      at(ev.at + .06, x);
      busyUntil = ev.at + .1;
    } else {
      const nx = clamp(x + rnd.sign() * rnd.r(3, 6), view.x0 + 6, view.x1 - 6);
      if (Math.abs(nx - x) > .5) facing = nx > x ? 1 : -1;
      pts.push({ t: ev.at + .12, x: (x + nx) / 2, y: (wireY(perch.k, x) + wireY(perch.k, nx)) / 2 - 2.6, sx: facing * k, sy: k });
      x = nx;
      at(ev.at + .24, x);
      frames.push([ev.at, 2], [ev.at + .24, 0]);
      busyUntil = ev.at + .3;
    }
  }
  const leave = land + stay;
  at(leave, x);
  const dirOut = rnd.sign(), target = { x: x + dirOut * rnd.r(60, 110), y: view.y0 - 24 };
  const outPath = steer({ x, y: wireY(perch.k, x) }, -Math.PI / 2 + dirOut * .55, target, 60, 4);
  flight(outPath.slice(1), leave);
  const end = leave + outPath[outPath.length - 1][0];
  pts[pts.length - 1].a = 0;
  alternate(frames, leave, end, 2, 3, .07);
  frames.push([end, 2]);
  return {
    part: part('sparrow', { frames: framesOf('sparrow', [0, 1, 2, 3], rnd.i(0, 5)), path: pathOf(pts, delay), track: trackOf(frames, end, delay), shade: e.shade(perch.y) }),
    end: end + delay, land: land + delay,
  };
}

/** A crossing walker (people, vendor, officer, child): walk frames, bob, optional pause in a visible gap. */
function walker(e, kind, o = {}) {
  const { rnd, view } = e, ground = view.ground;
  if (!ground) return null;
  const size = e.size(kind), k = e.k(kind) * (ground.k || 1), dir = o.dir ?? rnd.sign();
  const pair = !!o.pair, v0 = o.variant ?? rnd.i(0, 5), v1 = (v0 + rnd.i(1, 4)) % 6;
  const frames = o.frames || (pair
    ? [0, 1].map(f => [{ kind, frame: (f + 1) % 2, variant: v1, dx: -9, dy: -1.2 }, { kind, frame: f, variant: v0 }])
    : framesOf(kind, [0, 1], v0));
  const speed = o.speed ?? rnd.r(17, 23), step = o.step ?? .36, bob = (o.bob ?? .7) * k;
  const feet = ground.y + (o.dy ?? rnd.r(-.8, .8));
  const w = size.w * k;
  let xa = enterX(view, dir, w), xb = exitX(view, dir, w + (pair ? 9 * k : 0)), doors = false;
  const xp = o.pause ? gapNear(view, o.pauseX ?? midX(view) + rnd.r(-25, 25), feet - size.h * k, feet) : midX(view);
  // Slow story walkers step out of one shop doorway and into another rather than crossing a whole wide street.
  if (o.span && Math.abs(xb - xa) > o.span) { xa = xp - dir * o.span * .45; xb = xp + dir * o.span * .55; doors = true; }
  let pts, track = null, loop = null;
  if (o.pause) {
    const first = walkPoints(xa, xp, feet, speed, step, bob), t1 = first[first.length - 1].t, hold = o.pause;
    const second = walkPoints(xp, xb, feet, o.speedAfter ?? speed, step, bob, t1 + hold);
    pts = [...first, ...second];
    const end = pts[pts.length - 1].t, ev = [];
    alternate(ev, 0, t1, 0, 1, step);
    ev.push([t1, o.pauseFrame ?? 0]);
    if (o.after) o.after(ev, t1 + hold, end, step); else alternate(ev, t1 + hold, end, 0, 1, step);
    track = trackOf(ev, end);
    o.onPause?.(xp, t1, hold, k, feet);
  } else {
    pts = walkPoints(xa, xb, feet, speed, step, bob);
    loop = { cls: 'life-l-strip2', d: r4(step * 2), dl: r4(-rnd.r(0, step * 2)) };
  }
  if (doors) { const end = pts[pts.length - 1].t; for (const q of pts) q.a = clamp01(Math.min(q.t, end - q.t) / .45); }
  return spec(o.family || 'pedestrian', kind, {
    dur: pts[pts.length - 1].t, z: ground.z ?? 8, path: pathOf(pts), vignette: o.vignette, sounds: o.sounds,
    parts: [part(kind, { frames, k, mirror: dir < 0, loop, track, shade: e.shade(feet - size.h * k * .5) })],
  });
}

/** A crossing vehicle on the road (wide screens) or, for vignettes on phones, along the visible kerb band. */
function vehicle(e, kind, o = {}) {
  const { rnd, view } = e, size = e.size(kind), lanes = [];
  if (view.road.far >= .6) lanes.push({ y: ROAD_FAR_Y, dir: 1, z: 9 });
  if (view.road.near >= .6) lanes.push({ y: ROAD_NEAR_Y, dir: -1, z: 10 });
  let lane = lanes.length ? rnd.pick(lanes) : null;
  if (!lane && o.anyBand) {
    if (view.ground) lane = { y: view.ground.y + (view.ground.mode === 'kerb' ? 1.5 : 0), dir: rnd.sign(), z: view.ground.z ?? 8, k: view.ground.k };
    else lane = { y: view.floorY + size.h * .35, dir: rnd.sign(), z: 8 };
  }
  if (!lane) return null;
  const dir = lane.dir, k = e.k(kind) * (lane.k || 1), w = size.w * k;
  const speed = o.speed ?? { scooter: rnd.r(70, 110), bicycle: rnd.r(30, 40), tricycle: rnd.r(24, 30), bus: rnd.r(38, 46) }[kind] ?? 40;
  const wheel = { scooter: .16, bicycle: .3, tricycle: .34, bus: .26 }[kind] ?? .2;
  const xa = enterX(view, dir, w), xb = exitX(view, dir, w + (o.extent || 0) * k), dur = Math.abs(xb - xa) / speed;
  return spec(o.family || 'vehicle', kind, {
    dur, z: lane.z, vignette: o.vignette, sounds: o.sounds, path: pathOf([{ t: 0, x: xa, y: lane.y }, { t: dur, x: xb, y: lane.y }]),
    parts: [part(kind, { frames: o.frames || framesOf(kind, [0, 1], rnd.i(0, 5)), k, mirror: dir < 0, loop: { cls: 'life-l-strip2', d: wheel, dl: r4(-rnd.r(0, wheel)) }, shade: e.shade(lane.y - size.h * k * .5) })],
  });
}

const recipes = {
  sparrow(e) {
    const { rnd, view } = e;
    const perches = rnd.shuffle(view.perches.filter(p => p.vis >= .9));
    if (!perches.length) return null;
    const want = rnd.i(1, view.small ? 2 : 3), chosen = [];
    for (const p of perches) if (chosen.length < want && chosen.every(c => Math.abs(c.x - p.x) >= (c.k === p.k ? 14 : 9))) chosen.push(p);
    let dur = 0, land = 0;
    const parts = chosen.map((perch, i) => { const b = birdLife(e, perch, i ? rnd.r(.4, 1.6) * i : 0); dur = Math.max(dur, b.end); land = Math.max(land, b.land); return b.part; });
    return toned(spec('sparrow', 'sparrow', { dur, parts, z: 5, demoSeek: land + .8 }), e.tone);
  },

  flock(e) {
    const { rnd, view } = e, k = e.k('flock-bird'), n = view.small ? 4 : rnd.i(5, 7), dir = rnd.chance(.65) ? -1 : 1;
    const members = Array.from({ length: n }, (_, i) => ({ dx: -Math.ceil(i / 2) * 7, dy: (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 2.6 }));
    const frames = [0, 1].map(f => members.map((m, i) => ({ kind: 'flock-bird', frame: (f + i) % 2, variant: i % 3, dx: m.dx, dy: m.dy })));
    const lead = 10 * k, tail = 7 * Math.ceil(n / 2) * k + 10, speed = rnd.r(27, 33), y = view.sky.y;
    const xa = enterX(view, dir, lead), xb = exitX(view, dir, tail), dur = Math.abs(xb - xa) / speed, pts = [];
    for (let tt = 0; tt < dur; tt += .8) pts.push({ t: tt, x: xa + (xb - xa) * tt / dur, y: y + 2.2 * Math.sin(tt * 1.3) });
    pts.push({ t: dur, x: xb, y });
    return toned(spec('flock', 'flock-bird', {
      dur, z: 3, flag: 'flock', path: pathOf(pts),
      parts: [part('flock-bird', { frames, k, mirror: dir < 0, loop: { cls: 'life-l-strip2', d: .34, dl: 0 }, shade: e.shade(y) })],
    }), e.tone);
  },

  pedestrian(e, kind) {
    const { rnd, ctx, view } = e;
    let k = kind === 'pedestrian-umbrella' || ctx.rain ? 'pedestrian-umbrella' : 'pedestrian';
    if (k === 'pedestrian' && ctx.progress < .85 && rnd.chance(.15)) k = 'vendor';
    const pair = k === 'pedestrian' && !view.small && rnd.chance(.3);
    return toned(walker(e, k, k === 'vendor' ? { speed: rnd.r(11, 14), step: .44, bob: .5 } : { pair }), e.tone);
  },

  vehicle(e) {
    const { rnd, ctx } = e, p = ctx.progress, dry = !ctx.rain;
    const table = [['scooter', 3], ['bicycle', dry && p > .08 && p < .85 ? 1.2 : 0], ['tricycle', p < .85 ? .35 : 0], ['bus', p < .9 ? .2 : 0]];
    let roll = rnd.f() * table.reduce((sum, [, w]) => sum + w, 0), kind = 'scooter';
    for (const [name, w] of table) if (w > 0 && (roll -= w) <= 0) { kind = name; break; }
    return toned(vehicle(e, kind), e.tone);
  },

  cloud(e) {
    // Drifts behind the skyline and the awning lights (drawn in the sky mask), with the wind, slower than anything else.
    const { rnd, view } = e, size = e.size('cloud'), y = r2(rnd.r(32, 40)), speed = rnd.r(3, 5);
    const xa = view.x0 - 20 - size.w, xb = view.x1 + 20 + size.w, dur = (xb - xa) / speed;
    return toned(spec('cloud', 'cloud', {
      dur, z: 1, sky: true, path: pathOf([{ t: 0, x: xa, y, a: .95 }, { t: dur, x: xb, y: y + rnd.r(-2, 2), a: .95 }]),
      parts: [part('cloud', { variant: rnd.i(0, 3), shade: e.shade(y) })],
    }), e.tone);
  },

  kite(e) {
    const { rnd, view } = e, size = e.size('kite'), k = e.k('kite');
    // Tied to a roof within view (the roof itself may hide behind the lane), flying in the visible sky band.
    const roofs = ROOFS.map(([x0, x1, y]) => ({ x0: Math.max(x0 + 4, view.x0 + 14), x1: Math.min(x1 - 4, view.x1 - 14), y })).filter(r => r.x1 - r.x0 >= 8);
    if (!roofs.length) return null;
    const roof = rnd.pick(roofs), ax = r2(rnd.r(roof.x0, roof.x1)), ay = roof.y;
    const ky = clamp(view.y0 + size.h * k * .4, 22, 46);
    // In the part's own units (the part is scaled by k about its anchor on the roof).
    const dx = rnd.sign() * rnd.r(8, 16) / k, dy = (ky - ay) / k;
    const string = { raw: `<path d="M0 0Q${r2(dx * .15)} ${r2(dy * .55)} ${r2(dx)} ${r2(dy)}" fill="none" stroke="#4a2a22" stroke-width="${r2(.55 / k)}" stroke-opacity=".85"/>`, box: [Math.min(0, dx) - 1, dy - 1, Math.max(0, dx) + 1, 1] };
    const life = rnd.r(55, 90);
    return toned(spec('kite', 'kite', {
      dur: life, z: 4, x: ax, y: ay, flag: 'kite', cool: 25, until: c => !c.rain,
      path: pathOf([{ t: 0, x: ax, y: ay + 10, a: 0, e: 'ease-out' }, { t: 2.4, x: ax, y: ay, a: 1 }, { t: life - 2, x: ax, y: ay, a: 1 }, { t: life, x: ax, y: ay + 6, a: 0 }]),
      parts: [part('kite', { frames: [[string, { kind: 'kite', frame: 0, variant: rnd.i(0, 3), dx, dy }]], k, winLoop: { cls: 'life-l-sway', d: r4(rnd.r(2.8, 3.8)), dl: r4(-rnd.r(0, 3)) }, shade: e.shade(ky) })],
    }), e.tone);
  },

  roofcat(e) {
    const { rnd, view } = e;
    const roofs = view.roofs.filter(r => r.vis >= .6).sort((a, b) => b.vis - a.vis || a.y - b.y);
    if (!roofs.length) return null;
    const roof = roofs[0], k = e.k('cat'), dir = rnd.sign();
    const xa = dir > 0 ? roof.x0 : roof.x1, xb = dir > 0 ? roof.x1 : roof.x0, xm = r2(xa + (xb - xa) * rnd.r(.4, .6)), y = roof.y;
    const speed = 7, t1 = .5 + Math.abs(xm - xa) / speed, t2 = t1 + rnd.r(4, 7), t3 = t2 + Math.abs(xb - xm) / speed, end = t3 + .5;
    const sx = dir * k;
    const pts = [{ t: 0, x: xa, y, a: 0, sx, sy: k }, { t: .5, x: xa, y, sx, sy: k }, { t: t1, x: xm, y, sx, sy: k }, { t: t2, x: xm, y, sx, sy: k }, { t: t3, x: xb, y, sx, sy: k }, { t: end, x: xb, y, a: 0, sx, sy: k }];
    const ev = [];
    alternate(ev, 0, t1, 0, 1, .22);
    ev.push([t1, 2]);
    alternate(ev, t2, end, 0, 1, .22);
    return toned(spec('roofcat', 'cat', {
      dur: end, z: 4, flag: 'roofcat', demoSeek: t1 + 1,
      parts: [part('cat', { frames: framesOf('cat', [0, 1, 2, 3], rnd.i(1, 5)), path: pathOf(pts), track: trackOf(ev, end), shade: e.shade(y) })],
    }), e.tone);
  },

  pet(e, kind) {
    const { rnd, ctx, view } = e, spot = view.petSpot;
    if (!spot || !kind) return null;
    const size = e.size(kind), k = e.k(kind), w = size.w * k, facing = spot.side < 0 ? 1 : -1;   // look toward the street
    const frames = kind === 'cat' ? framesOf('cat', [2]) : framesOf(kind, [0, 1]);
    const loop = kind === 'dog' ? { cls: 'life-l-strip2', d: .46, dl: 0 } : kind === 'hamster' ? { cls: 'life-l-strip2', d: .6, dl: 0 } : null;
    const parts = [part(kind, { frames, k, dx: spot.x, dy: spot.y, mirror: facing < 0, loop, winLoop: { cls: 'life-l-breathe', d: r4(rnd.r(2.2, 3)), dl: 0 }, shade: e.shade(spot.y - size.h * k * .5) })];
    if (ctx.closing || ctx.progress > .9) parts.push(part('zz', { dx: spot.x + facing * w * .25, dy: spot.y - size.h * k * .95, k: e.k('zz'), winLoop: { cls: 'life-l-zz', d: 3.6, dl: 0 } }));
    if (spot.mode === 'sit') { const life = rnd.r(60, 110); return toned(spec('pet', kind, { dur: life, z: 11, cool: 15, path: still(life), parts }), e.tone); }
    // Peeking: rises from behind the bottom edge (the counter), looks at the street a while, then ducks down again.
    const life = view.small ? rnd.r(18, 28) : rnd.r(24, 36), down = size.h * k * .95;
    const pts = [{ t: 0, x: 0, y: down, e: 'ease-out' }, { t: .8, x: 0, y: 0 }, { t: life - .8, x: 0, y: 0, e: 'ease-in' }, { t: life, x: 0, y: down }];
    return toned(spec('pet', kind, { dur: life, z: 11, cool: view.small ? 26 : 16, path: pathOf(pts), parts, demoSeek: 2 }), e.tone);
  },

  moths(e) {
    const { rnd, view } = e, n = view.small ? 1 : 2, k = e.k('moth');
    const parts = Array.from({ length: n }, (_, i) => part('moth', {
      dx: LAMP.x + rnd.r(-2, 2), dy: LAMP.y + rnd.r(-1, 3), k, frames: framesOf('moth', [0, 1], i),
      loop: { cls: 'life-l-strip2', d: r4(rnd.r(.12, .16)), dl: 0 },
      rotor: { r: r2(rnd.r(7, 13) + i * 3), d: r4(rnd.r(1.5, 2.6)), ccw: i % 2 === 1, ph: r4(rnd.r(0, 2)) },
    }));
    return toned(spec('moths', 'moth', { dur: view.small ? rnd.r(40, 60) : 1e5, z: 7, cool: view.small ? 25 : 0, until: c => c.progress >= .8 && !c.rain, path: fadeIn(), parts }), e.tone);
  },

  gecko(e) {
    const { rnd } = e, k = e.k('gecko'), life = rnd.r(25, 40), x = LAMP_POST.x, y0 = LAMP_POST.y;
    const pts = [{ t: 0, x, y: y0, r: -90, a: 0, sx: k, sy: k }, { t: .8, x, y: y0, r: -90, sx: k, sy: k }];
    let tt = .8, y = y0;
    while (tt < life - 5) {
      tt += rnd.r(3, 6);
      pts.push({ t: tt, x, y, r: -90, sx: k, sy: k, e: 'ease-out' });
      y = clamp(y + rnd.sign() * rnd.r(4, 8), y0 - 12, y0 + 12);
      tt += .22;
      pts.push({ t: tt, x, y, r: -90, sx: k, sy: k });
    }
    pts.push({ t: life - .6, x, y, r: -90, sx: k, sy: k }, { t: life, x, y, r: -90, a: 0, sx: k, sy: k });
    return toned(spec('gecko', 'gecko', { dur: life, z: 6, parts: [part('gecko', { path: pathOf(pts), shade: e.shade(y0) })] }), e.tone);
  },

  drips(e, kind, o = {}) {
    const { rnd, view } = e, k = e.k('raindrop'), n = o.count ?? (view.small ? 2 : 3);
    const spots = rnd.shuffle(view.perches.filter(p => p.vis >= .8)), chosen = [];
    for (const p of spots) if (chosen.length < n && chosen.every(c => Math.abs(c.x - p.x) >= 26)) chosen.push(p);
    if (!chosen.length && !o.drops) return null;
    const parts = chosen.map(p => { const d = r4(rnd.r(2.2, 3.4)); return part('raindrop', { dx: p.x, dy: p.y + e.size('raindrop').ay * k * .8, k, winLoop: { cls: 'life-l-drip', d, dl: r4(-rnd.r(0, d)) }, shade: e.shade(p.y) }); });
    const life = o.dur ?? rnd.r(30, 50);
    for (let i = 0; i < (o.drops || 0); i++) {
      const x = rnd.r(view.x0 + 10, view.x1 - 10), d = rnd.r(.55, .8), top = view.y0 - 6, bottom = view.floorY + 4;
      parts.push(part('raindrop', { k: k * 1.2, path: pathOf([{ t: 0, x, y: top, sx: k * 1.2, sy: k * 1.5 }, { t: d, x: x - 3, y: bottom, sx: k * 1.2, sy: k * 1.5, a: .3 }], -rnd.r(0, d), Math.ceil(life / d) + 1) }));
    }
    return toned(spec('drips', 'raindrop', { dur: life, z: 6, vignette: o.vignette, ambient: false, weather: !o.vignette, path: still(life, .5), parts }), e.tone);
  },

  splashes(e) {
    const { rnd, view } = e, k = e.k('splash'), parts = [], xs = [];
    for (let i = 0; i < 14 && parts.length < 3; i++) {
      const x = rnd.r(view.x0 + 12, view.x1 - 12), y = rnd.r(181, view.counterTop != null ? Math.min(194, view.counterTop - 2) : 194);
      if (xs.some(v => Math.abs(v - x) < 26) || view.vis(x - 5, x + 5, y - 5, y) < .9) continue;
      xs.push(x);
      const d = r4(rnd.r(1.2, 2));
      parts.push(part('splash', { frames: framesOf('splash', [1]), dx: x, dy: y, k, winLoop: { cls: 'life-l-splash', d, dl: r4(-rnd.r(0, d)) }, shade: e.shade(y) }));
    }
    if (!parts.length) return null;
    const life = rnd.r(30, 50);
    return toned(spec('splashes', 'splash', { dur: life, z: 9, ambient: false, weather: true, parts, path: still(life, .5) }), e.tone);
  },

  petals(e) { return fallers(e, 'petals', 'petal', e.view.small ? 2 : 3, false); },
  leaves(e) { return fallers(e, 'leaves', 'leaf', e.view.small ? 2 : 3, true); },

  bunting(e) {
    // The garland sprite is one 180-unit string: hang it from the poles' top wire, one per span within view.
    const { view } = e, size = e.size('bunting'), members = [];
    WIRE_SEGS.forEach(([x0, y0, , , x2, y2], i) => {
      if (x2 < view.x0 - 4 || x0 > view.x1 + 4) return;
      members.push({ kind: 'bunting', frame: 0, variant: i % 2, dx: r2((x0 + x2) / 2), dy: r2((y0 + y2) / 2), sx: r4((x2 - x0) / (size.w - 2)), rot: r2(Math.atan2(y2 - y0, x2 - x0) * 180 / Math.PI) });
    });
    if (!members.length) return null;
    return toned(spec('bunting', 'bunting', { dur: 1e5, z: 2, ambient: false, until: c => c.event === 'festival', path: fadeIn(), parts: [part('bunting', { frames: [members] })] }), e.tone);
  },

  lamp(e) {
    const toSwitch = Math.max(0, (SWITCH_P - e.ctx.progress) * DAY_SECONDS), hold = Math.max(1.2, toSwitch + 1.7), end = hold + 1;
    const blink = [[0, 0], [.08, 1], [.2, .1], [.32, .9], [.42, 0], [.62, .8], [.72, .15], [.86, 1]];
    const pts = blink.map(([tt, a]) => ({ t: tt, x: LAMP.x, y: LAMP.y + 1, a, e: 'steps(1, end)' }));
    pts.push({ t: hold, x: LAMP.x, y: LAMP.y + 1, a: 1 }, { t: end, x: LAMP.x, y: LAMP.y + 1, a: 0 });
    return toned(spec('lamp', 'lamp-glow', { dur: end, z: 6, ambient: false, path: pathOf(pts), parts: [part('lamp-glow')] }), e.tone);
  },
};

/** Petals drifting down, or leaves gusting across, each with a tumble. */
function fallers(e, family, kind, n, gust) {
  const { rnd, view } = e, k = e.k(kind), parts = [];
  let dur = 0;
  for (let i = 0; i < n; i++) {
    const delay = i * rnd.r(.5, 1.2), fall = gust ? rnd.r(2.8, 4.6) : rnd.r(4.5, 7.5);
    const xa = gust ? view.x0 - 8 : rnd.r(view.x0 + 10, view.x1 - 10), ya = gust ? rnd.r(view.y0 + 4, (view.y0 + view.floorY) / 2) : view.y0 - 6;
    const xb = gust ? view.x1 + 8 : xa + rnd.r(-25, 25) + 6, yb = gust ? ya + rnd.r(10, 40) : view.floorY + 4;
    const pts = [], spin = rnd.sign() * rnd.r(50, 110);
    for (let tt = 0; tt < fall; tt += .35) {
      const u = tt / fall;
      pts.push({ t: tt, x: xa + (xb - xa) * u + Math.sin(tt * 2.4 + i) * (gust ? 2 : 6), y: ya + (yb - ya) * u + (gust ? Math.sin(tt * 3.1) * 5 : 0), r: spin * tt, sx: k, sy: k });
    }
    pts.push({ t: fall, x: xb, y: yb, r: spin * fall, sx: k, sy: k, a: 0 });
    dur = Math.max(dur, delay + fall);
    parts.push(part(kind, { variant: rnd.i(0, 3), path: pathOf(pts, delay), shade: e.shade((ya + yb) / 2) }));
  }
  return toned(spec(family, kind, { dur, z: 12, parts }), e.tone);
}

/* ===================================================================== *
 * Vignettes: short street stories for game events
 * ===================================================================== */

const vignettes = {
  shower(e) {
    const { rnd, ctx, view } = e, life = rnd.r(6.5, 8);
    let drips = recipes.drips(e, 'raindrop', { count: view.small ? 2 : 3, dur: life, vignette: 'shower' });
    if (!ctx.rain) {
      // A sudden shower: the same slanting streaks the backdrop draws on rain days, over the street for a few seconds.
      const rect = { x: r2(view.x0 - 40), y: r2(view.y0 - 70), w: r2(view.x1 - view.x0 + 60), h: r2(view.y1 - view.y0 + 80), cls: 'life-rain' };
      const streaks = part('rect', { rect, path: pathOf([{ t: 0, x: 0, y: 0, a: 0 }, { t: .8, x: 0, y: 0, a: .85 }, { t: life - 1.2, x: 0, y: 0, a: .85 }, { t: life, x: 0, y: 0, a: 0 }]) });
      if (drips) drips.parts.unshift(streaks);
      else drips = spec('drips', 'raindrop', { dur: life, z: 6, vignette: 'shower', parts: [streaks] });
    }
    const out = [drips];
    if (view.ground) {
      // A passer-by walks in dry, stops to open an umbrella, and hurries on.
      const v = rnd.i(0, 5), frames = [...framesOf('pedestrian', [0, 1], v), ...framesOf('pedestrian-umbrella', [0, 1], v)];
      out.push(walker(e, 'pedestrian', {
        vignette: 'shower', frames, speed: 21, pause: .45, pauseFrame: 2, pauseX: midX(view) + rnd.r(-40, 40), speedAfter: 27,
        after: (ev, t0, end, step) => alternate(ev, t0, end, 2, 3, step * .85),
      }));
    }
    return out.map(s => toned(s, e.tone));
  },

  bus(e) {
    const { rnd, view } = e, size = e.size('bus');
    let y, z, dir;
    if (view.road.near >= .6) { y = ROAD_NEAR_Y; z = 10; dir = -1; }
    else if (view.road.far >= .6) { y = ROAD_FAR_Y; z = 9; dir = 1; }
    else { y = view.floorY + size.h * .42; z = 8; dir = rnd.sign(); }   // phones: the bus roof slides by behind the lane
    const w = size.w, xa = enterX(view, dir, w), xb = exitX(view, dir, w);
    const room = (view.x1 - view.x0 - w) / 2, xs = midX(view) + (room > 8 ? rnd.r(-room, room) * .5 : 0);
    const tIn = Math.abs(xs - xa) / 42 * 1.5, hold = 2.6, tOut = Math.abs(xb - xs) / 42 * 1.5, end = tIn + hold + tOut;
    const pts = [{ t: 0, x: xa, y, e: 'cubic-bezier(.25,.6,.4,1)' }, { t: tIn, x: xs, y }, { t: tIn + hold, x: xs, y, e: 'cubic-bezier(.6,0,.75,.4)' }, { t: end, x: xb, y }];
    const ev = [];
    alternate(ev, 0, tIn, 0, 1, .14);
    ev.push([tIn, 0]);
    alternate(ev, tIn + hold, end, 0, 1, .14);
    return [toned(spec('vehicle', 'bus', {
      dur: end, z, vignette: 'bus', path: pathOf(pts), sounds: [[tIn + hold - .35, 'honk']],
      parts: [part('bus', { frames: framesOf('bus', [0, 1], rnd.i(0, 3)), mirror: dir < 0, track: trackOf(ev, end), shade: e.shade(y - size.h * .5) })],
    }), e.tone)];
  },

  rat(e) { return [ratRun(e, 'rat')]; },

  'rat-caught'(e) {
    const { rnd, ctx, view } = e, rat = ratRun(e, 'rat-caught', true);
    const { xc, tc, y, dir } = rat.meta, k = e.k('cat'), size = e.size('cat'), w = size.w * k;
    // The cat (the shop's own when it has one) dashes in from ahead of the rat, crouches, then pounces in an arc.
    const from = dir > 0 ? view.x1 + w + 4 : view.x0 - w - 4, cx0 = xc + dir * 26, sx = -dir * k;
    const tCrouch = Math.max(.5, tc - .45), tLand = Math.max(tCrouch + .4, tc), tSit = tLand + 1.7, tEnd = tSit + Math.abs(from - xc) / 60 + .3;
    const pts = [{ t: 0, x: from, y, sx, sy: k }, { t: tCrouch, x: cx0, y, sx, sy: k }, { t: tCrouch + .18, x: cx0, y, sx: sx * 1.05, sy: k * .88 },
      { t: (tCrouch + .18 + tLand) / 2, x: (cx0 + xc) / 2, y: y - 9, sx, sy: k }, { t: tLand, x: xc, y, sx, sy: k }, { t: tSit, x: xc, y, sx, sy: k }, { t: tEnd, x: from, y, sx, sy: k }];
    const ev = [];
    alternate(ev, 0, tCrouch, 0, 1, .16);
    ev.push([tCrouch, 2], [tCrouch + .18, 3], [tLand + .1, 2]);
    alternate(ev, tSit, tEnd, 0, 1, .2);
    const kh = e.k('heart'), top = y - size.h * k;
    const heart = part('heart', { path: pathOf([{ t: 0, x: xc, y: top - 2, a: 0, sx: .2, sy: .2 }, { t: .25, x: xc, y: top - 5, sx: kh, sy: kh }, { t: 1.2, x: xc, y: top - 10, a: 0, sx: kh, sy: kh }], tLand + .2) });
    const cat = spec('pet', 'cat', {
      dur: tEnd, z: rat.z + 1, vignette: 'rat-caught', sounds: [[Math.max(0, tCrouch - .1), 'meow']],
      parts: [part('cat', { frames: framesOf('cat', [0, 1, 2, 3], ctx.pet === 'pet_cat' ? 0 : rnd.i(1, 5)), path: pathOf(pts), track: trackOf(ev, tEnd), shade: e.shade(y - 5) }), heart],
    });
    return [rat, toned(cat, e.tone)];
  },

  flash(e, data) {
    const { rnd, view } = e, k = e.k('flash');
    const n = clamp(Math.round(+data.count || rnd.i(3, 5)), 3, view.small ? 3 : 5), spots = rnd.shuffle([...view.freePoints]), chosen = [];
    for (const p of spots) if (chosen.length < n && chosen.every(c => Math.hypot(c.x - p.x, c.y - p.y) >= 24)) chosen.push(p);
    if (!chosen.length) return [];
    let at = 0, dur = 0;
    const parts = chosen.map(p => {
      const delay = at;
      at += rnd.r(.3, .55); dur = delay + .36;
      return part('flash', { path: pathOf([{ t: 0, x: p.x, y: p.y, a: 0, sx: k * .3, sy: k * .3 }, { t: .06, x: p.x, y: p.y, sx: k * 1.1, sy: k * 1.1 }, { t: .34, x: p.x, y: p.y, a: 0, sx: k * 1.35, sy: k * 1.35 }], delay) });
    });
    return [toned(spec('flash', 'flash', { dur, z: 14, vignette: 'flash', parts, sounds: [[0, 'flash']] }), e.tone)];
  },

  power(e) {
    const { view } = e, rect = { x: r2(view.x0 - 2), y: r2(view.y0 - 2), w: r2(view.x1 - view.x0 + 4), h: r2(view.y1 - view.y0 + 4), color: '#0b1030' };
    const curve = [[0, 0], [.3, .58], [4.2, .58], [4.35, .12], [4.5, .5], [4.62, .06], [4.85, .38], [5.1, 0], [5.6, 0]];
    return [spec('power', 'flash', { dur: 5.6, z: 20, vignette: 'power', parts: [part('rect', { rect, path: pathOf(curve.map(([tt, a]) => ({ t: tt, x: 0, y: 0, a }))) })] })];
  },

  smoke(e) {
    const { rnd, view } = e, k = e.k('smoke'), n = view.small ? 3 : 4, x = view.x1 - rnd.r(12, 30), y = view.floorY + 4, parts = [];
    let dur = 0;
    for (let i = 0; i < n; i++) {
      const delay = i * rnd.r(.45, .75), life = rnd.r(3, 4), drift = -rnd.r(10, 26), rise = Math.min(70, y - view.y0 - 8);
      parts.push(part('smoke', { variant: i, path: pathOf([{ t: 0, x: x + rnd.r(-4, 4), y, a: 0, sx: k * .5, sy: k * .5 }, { t: .5, x: x + drift * .2, y: y - rise * .2, a: .85, sx: k * .8, sy: k * .8 }, { t: life, x: x + drift, y: y - rise, a: 0, sx: k * 1.7, sy: k * 1.7 }], delay) }));
      dur = Math.max(dur, delay + life);
    }
    return [toned(spec('smoke', 'smoke', { dur, z: 13, vignette: 'smoke', parts }), e.tone)];
  },

  patrol(e) { return [toned(walker(e, 'officer', { vignette: 'patrol', speed: 15, step: .42, bob: .5, pause: 1.8, span: 220 }), e.tone)]; },

  child(e) {
    const { view } = e;
    if (!view.ground) return [];
    let balloon = null;
    const size = e.size('child-balloon'), hold = 2.2;
    // The child walks in holding a balloon, stops, lets go (it floats up) and walks on without it.
    const frames = [...framesOf('child-balloon', [0, 1]), ...[0, 1].map(f => [{ kind: 'child-balloon', frame: f, variant: 0, clip: .6 }])];
    const s = walker(e, 'child-balloon', {
      vignette: 'child', frames, speed: 12, step: .3, bob: .6, pause: hold, speedAfter: 13, span: 150,
      after: (ev, t0, end, step) => { ev.push([t0 - hold / 2, 2]); alternate(ev, t0, end, 2, 3, step); },
      onPause: (xp, t1, h, k, feet) => {
        const kb = e.k('balloon'), from = feet - size.h * k * .78, rise = Math.max(30, from - (view.y0 - 16)), release = t1 + h / 2, pts = [{ t: 0, x: xp, y: from, sx: kb, sy: kb, a: 0, e: 'steps(1, end)' }];
        for (let tt = 0; tt <= 6; tt += .5) pts.push({ t: release + tt, x: xp + Math.sin(tt * 1.6) * 3 + tt * 2, y: from - rise * tt / 6, sx: kb, sy: kb, a: tt > 5.4 ? 0 : 1 });
        balloon = spec('child', 'balloon', { dur: release + 6, z: 12, vignette: 'child', parts: [part('balloon', { path: pathOf(pts), shade: e.shade(from) })] });
      },
    });
    if (!s) return [];
    return [toned(s, e.tone), toned(balloon, e.tone)];
  },

  supplier(e) { return [toned(vehicle(e, 'tricycle', { vignette: 'supplier', anyBand: true, speed: 27 }), e.tone)]; },

  wobble(e) {
    const { rnd, view } = e, ground = view.ground;
    if (!ground) return [];
    const kind = 'pedestrian', size = e.size(kind), k = e.k(kind) * (ground.k || 1), dir = rnd.sign(), w = size.w * k;
    let xa = enterX(view, dir, w), xb = exitX(view, dir, w), doors = false;
    if (Math.abs(xb - xa) > 200) { const xm = midX(view) + rnd.r(-30, 30); xa = xm - dir * 90; xb = xm + dir * 110; doors = true; }
    const dur = Math.abs(xb - xa) / 13, feet = ground.y, pts = [];
    for (let tt = 0; tt < dur; tt += .25) pts.push({ t: tt, x: xa + (xb - xa) * tt / dur + dir * 3.5 * Math.sin(tt * 2.1), y: feet - Math.abs(Math.sin(tt * 4.4)) * .8, r: 8 * Math.sin(tt * 1.7), a: doors ? clamp01(Math.min(tt, dur - tt) / .45) : 1 });
    pts.push({ t: dur, x: xb, y: feet, a: doors ? 0 : 1 });
    return [toned(spec('pedestrian', kind, {
      dur, z: ground.z ?? 8, vignette: 'wobble', path: pathOf(pts),
      parts: [part(kind, { frames: framesOf(kind, [0, 1], rnd.i(0, 5)), k, mirror: dir < 0, loop: { cls: 'life-l-strip2', d: .9, dl: 0 }, shade: e.shade(feet - size.h * k * .5) })],
    }), e.tone)];
  },

  'shooting-star'(e) {
    const { rnd, ctx, view } = e;
    if (ctx.progress <= .78 || view.bands.sky < .3) return [];
    const k = e.k('shooting-star'), dir = rnd.sign(), span = Math.min(90, (view.x1 - view.x0) * .55);
    const xa = midX(view) - dir * span / 2 + rnd.r(-15, 15), ya = Math.max(view.y0 + 3, 20), xb = xa + dir * span, yb = ya + span * .22;
    const r = Math.atan2(yb - ya, xb - xa) * 180 / Math.PI, ks = e.k('sparkle');
    const streak = part('shooting-star', { path: pathOf([{ t: 0, x: xa, y: ya, r, a: 0, sx: k, sy: k }, { t: .12, x: xa + (xb - xa) * .14, y: ya + (yb - ya) * .14, r, sx: k, sy: k }, { t: .7, x: xb, y: yb, r, sx: k, sy: k }, { t: .95, x: xb + dir * 6, y: yb + 1.5, r, a: 0, sx: k, sy: k }]) });
    const sparkle = part('sparkle', { path: pathOf([{ t: 0, x: xb, y: yb, a: 0, sx: ks * .3, sy: ks * .3 }, { t: .15, x: xb, y: yb, r: 30, sx: ks * 1.2, sy: ks * 1.2 }, { t: .55, x: xb, y: yb, r: 70, a: 0, sx: ks * .6, sy: ks * .6 }], .62) });
    return [toned(spec('shooting-star', 'shooting-star', { dur: 1.25, z: 3, vignette: 'shooting-star', sky: view.y0 < 30, parts: [streak, sparkle] }), e.tone)];
  },

  students(e) {
    const { rnd } = e;
    const frames = [0, 1].map(f => [0, 1, 2].map(i => ({ kind: 'bicycle', frame: (f + i) % 2, variant: (i * 2 + rnd.i(0, 1)) % 6, dx: -i * 17, dy: [0, -1.4, .8][i] })));
    return [toned(vehicle(e, 'bicycle', { vignette: 'students', anyBand: true, speed: 30, frames, extent: 34, sounds: [[.3, 'bell'], [rnd.r(1.6, 2.6), 'bell']] }), e.tone)];
  },

  'paper-plane'(e) {
    const { rnd, view } = e, k = e.k('paper-plane'), dir = rnd.sign(), y = view.sky.y;
    const xa = dir > 0 ? view.x0 - 10 : view.x1 + 10, xb = dir > 0 ? view.x1 + 12 : view.x0 - 12, dur = Math.abs(xb - xa) / 34, pts = [];
    let prev = null;
    for (let tt = 0; tt <= dur + .2; tt += .2) {
      const u = Math.min(1, tt / dur), x = xa + (xb - xa) * u, yy = y + 14 * (1 - u) * (1 - u) - 6 * u * (1 - u) + 3.5 * Math.sin(tt * 2.2) + 7 * u * u;
      const slope = prev ? Math.atan2(yy - prev.y, Math.abs(x - prev.x) || 1) * 180 / Math.PI : -12;
      pts.push({ t: Math.min(tt, dur), x, y: yy, r: clamp(slope, -30, 30) * dir, sx: dir * k, sy: k });
      prev = { x, y: yy };
      if (u >= 1) break;
    }
    return [toned(spec('paper-plane', 'paper-plane', { dur, z: 12, vignette: 'paper-plane', parts: [part('paper-plane', { path: pathOf(pts), shade: e.shade(y) })] }), e.tone)];
  },

  'buyer-out'(e) { return [buyer(e, true)]; },
  'buyer-back'(e) { return [buyer(e, false)]; },
};

/** The rat dashing along the lowest visible band; with `meta` for the pounce. */
function ratRun(e, vignette, caught = false) {
  const { rnd, view } = e, k = e.k('rat'), size = e.size('rat');
  let y = view.floorY - .5, z = 8;
  if (view.ground?.mode === 'kerb') y = Math.min(KERB_Y + 2, view.floorY - .5);
  else if (view.road.near >= .6) { y = ROAD_NEAR_Y; z = 10; }
  const dir = rnd.sign(), w = size.w * k, xa = enterX(view, dir, w), speed = 85;
  const body = part('rat', { frames: framesOf('rat', [0, 1]), k, mirror: dir < 0, loop: { cls: 'life-l-strip2', d: .1, dl: 0 }, shade: e.shade(y - 3) });
  if (!caught) {
    const xb = exitX(view, dir, w), dur = Math.abs(xb - xa) / speed;
    return toned(spec('rat', 'rat', { dur, z, vignette, sounds: [[0, 'squeak']], path: pathOf([{ t: 0, x: xa, y }, { t: dur, x: xb, y }]), parts: [body] }), e.tone);
  }
  const xc = gapNear(view, midX(view) + dir * rnd.r(0, 20), y - 12, y), tc = Math.abs(xc - xa) / speed;
  const s = toned(spec('rat', 'rat', {
    dur: tc + .3, z, vignette, sounds: [[0, 'squeak']], parts: [body],
    path: pathOf([{ t: 0, x: xa, y }, { t: tc, x: xc, y }, { t: tc + .08, x: xc + dir * 1.5, y, a: 0 }, { t: tc + .3, x: xc + dir * 1.5, y, a: 0 }]),
  }), e.tone);
  s.meta = { xc, tc, y, dir };
  return s;
}

/** The market runner on a scooter with a basket: pulls out and rides off, or rides back and parks at the shop. */
function buyer(e, leaving) {
  const { rnd, view } = e, kind = 'scooter', size = e.size(kind);
  let y = view.floorY + size.h * .3, z = 8, k = e.k(kind);
  if (view.road.near >= .6) { y = ROAD_NEAR_Y; z = 10; }
  else if (view.ground) { y = view.ground.y + (view.ground.mode === 'kerb' ? 1.5 : 0); z = view.ground.z ?? 8; k *= view.ground.k || 1; }
  const way = rnd.sign(), w = size.w * k, xm = gapNear(view, midX(view), y - size.h * k, y), ev = [];
  let pts, end;
  if (leaving) {
    const xb = exitX(view, way, w), t1 = Math.abs(xb - xm) / 60 * 1.6;
    end = .35 + t1;
    pts = [{ t: 0, x: xm, y, a: 0 }, { t: .35, x: xm, y, e: 'cubic-bezier(.5,0,.8,.5)' }, { t: end, x: xb, y }];
    ev.push([0, 0]);
    alternate(ev, .35, end, 0, 1, .12);
  } else {
    const xa = enterX(view, way, w), t1 = Math.abs(xm - xa) / 60 * 1.6;
    end = t1 + .9;
    pts = [{ t: 0, x: xa, y, e: 'cubic-bezier(.2,.6,.4,1)' }, { t: t1, x: xm, y }, { t: t1 + .5, x: xm, y }, { t: end, x: xm, y, a: 0 }];
    alternate(ev, 0, t1, 0, 1, .12);
    ev.push([t1, 0]);
  }
  return toned(spec('vehicle', kind, {
    dur: end, z, vignette: leaving ? 'buyer-out' : 'buyer-back', path: pathOf(pts),
    parts: [part(kind, { frames: framesOf(kind, [0, 1], 1), k, mirror: way < 0, track: trackOf(ev, end), shade: e.shade(y - size.h * k * .5) })],
  }), e.tone);
}

/* ===================================================================== *
 * The DOM layer
 * ===================================================================== */

const MEMORY = { day: null, flags: {}, counter: 0 };   // once-a-day flags survive the app rebuilding its DOM

/** Pulls the root <svg> of a sprite apart (viewBox and inner markup) for nesting several in one strip. */
function parseSvg(svg, w, h) {
  const s = String(svg || '').trim(), open = s.match(/^<svg\b[^>]*>/i);
  if (!open) return { viewBox: `0 0 ${w} ${h}`, inner: s };
  const vb = open[0].match(/\bviewBox\s*=\s*["']([^"']+)["']/i), end = s.lastIndexOf('</svg>');
  return { viewBox: vb ? vb[1] : `0 0 ${w} ${h}`, inner: s.slice(open[0].length, end < 0 ? undefined : end) };
}

/**
 * mountLife(streetEl, { sprite, lowMotion, sound, budget }) → life.
 * Inserts <div class="street-life" aria-hidden="true"><div class="life-stage"></div></div> right after #street-art
 * (and links src/life.css if the page has not). Options: sprite = lifeSprite from src/art/life.js (placeholder blocks
 * without it); lowMotion() → true means no life at all; sound(cue) for 'bell', 'honk', 'flash', 'meow', 'squeak';
 * budget 0.2–1 (default 0.6 on coarse pointers, else 1) scales the actor cap (3 on phone-sized streets, 6 on wide).
 *
 *   life.tick(dt, ctx)       every ~0.1 s of play; ctx = { day, progress 0..1, rain, event, weekend, pet, closing, busy 0..1 }
 *   life.vignette(kind, data) one-shot stories: VIGNETTES; unknown kinds and motion-off are ignored
 *   life.resize() · pause() · resume() · clear() · destroy() · demo() · actors() → [{ kind, x, y }] · stats() · specs()
 * The layer pauses itself while a <dialog> is open or the tab is hidden, and destroys itself on a tick after the app
 * has replaced the street.
 */
export function mountLife(streetEl, { sprite, lowMotion = () => false, sound = () => {}, budget } = {}) {
  if (!streetEl?.ownerDocument) throw new TypeError('mountLife needs the .street element');
  const doc = streetEl.ownerDocument, win = doc.defaultView;
  const media = q => { try { return !!win.matchMedia?.(q).matches; } catch { return false; } };
  const budgetValue = clamp(Number.isFinite(+budget) && budget !== null ? +budget : media('(pointer: coarse)') ? .6 : 1, .2, 1);

  // Sprites: the injected provider, guarded (a missing kind falls back to a placeholder block, never an error).
  const spriteCache = new Map();
  let fallbacks = 0, measureMs = 0;
  function getSprite(kind, frame, variant, tone) {
    const key = `${kind}|${frame}|${variant}|${tone}`;
    let hit = spriteCache.get(key);
    if (!hit) {
      try {
        const res = typeof sprite === 'function' ? sprite(kind, { frame, variant, tone, idPrefix: 'lsp-' }) : null;
        hit = res && typeof res.svg === 'string' && res.w > 0 && res.h > 0 ? { svg: res.svg, w: +res.w, h: +res.h, ax: +res.ax || 0, ay: +res.ay || 0 } : null;
      } catch { hit = null; }
      if (!hit) { if (typeof sprite === 'function') fallbacks++; hit = placeholderSprite(kind, { frame, variant, tone }); }
      hit.parsed = parseSvg(hit.svg, hit.w, hit.h);
      spriteCache.set(key, hit);
      if (spriteCache.size > 240) spriteCache.delete(spriteCache.keys().next().value);
    }
    return hit;
  }
  const sizes = new Map();
  const sizeOf = kind => {
    if (!sizes.has(kind)) { const sp = getSprite(kind, 0, 0, 'day'); sizes.set(kind, { w: sp.w, h: sp.h, ax: sp.ax, ay: sp.ay }); }
    return sizes.get(kind);
  };

  // Strips: a sprite's frames side by side in one data-URI picture, darkened to match the backdrop where needed.
  const stripCache = new Map(), recent = new Map();
  function stripImage(img) {
    const key = JSON.stringify([img.frames, img.tone, img.shade]);
    let hit = stripCache.get(key);
    if (hit) { stripCache.delete(key); stripCache.set(key, hit); return hit; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, clips = 0;
    const grow = (x0, y0, x1, y1) => { minX = Math.min(minX, x0); minY = Math.min(minY, y0); maxX = Math.max(maxX, x1); maxY = Math.max(maxY, y1); };
    const drawn = img.frames.map((members, f) => members.map((m, i) => {
      if (m.raw) { grow(...m.box); return m.raw; }
      const sp = getSprite(m.kind, m.frame || 0, m.variant ?? 0, img.tone || 'day');
      const dx = m.dx || 0, dy = m.dy || 0, x = dx - sp.ax, y = dy - sp.ay, sx = m.sx ?? 1, sy = m.sy ?? 1, rot = m.rot || 0;
      const lean = Math.abs(Math.sin(rot * Math.PI / 180)) * sp.w * sx / 2;
      grow(dx - sp.ax * sx, dy - sp.ay * sy - lean, dx + (sp.w - sp.ax) * sx, dy + (sp.h - sp.ay) * sy + lean);
      // Every nested copy gets its own id prefix: several sprites share this one document.
      const inner = sp.parsed.inner.replaceAll('lsp-', `l${f}m${i}-`);
      let el = `<svg x="${r2(x)}" y="${r2(y)}" width="${r2(sp.w)}" height="${r2(sp.h)}" viewBox="${sp.parsed.viewBox}" preserveAspectRatio="none" overflow="visible">${inner}</svg>`;
      if (m.clip) { const id = `lcl${clips++}`; el = `<clipPath id="${id}"><rect x="${r2(x - 3)}" y="${r2(y + sp.h * (1 - m.clip))}" width="${r2(sp.w + 6)}" height="${r2(sp.h * m.clip + 3)}"/></clipPath><g clip-path="url(#${id})">${el}</g>`; }
      if (sx !== 1 || sy !== 1 || rot) el = `<g transform="translate(${r2(dx)} ${r2(dy)}) rotate(${r2(rot)}) scale(${r4(sx)} ${r4(sy)}) translate(${r2(-dx)} ${r2(-dy)})">${el}</g>`;
      return el;
    }));
    minX -= 1; minY -= 1; maxX += 1; maxY += 1;
    const W = r2(maxX - minX), H = r2(maxY - minY), n = img.frames.length;
    let body = '';
    drawn.forEach((members, f) => { body += `<clipPath id="lfr${f}"><rect x="${r2(f * W)}" y="0" width="${W}" height="${H}"/></clipPath><g clip-path="url(#lfr${f})"><g transform="translate(${r2(f * W - minX)} ${r2(-minY)})">${members.join('')}</g></g>`; });
    const shade = img.shade ?? 1;
    if (shade < .999) body = `<filter id="lsh" filterUnits="userSpaceOnUse" x="0" y="0" width="${r2(n * W)}" height="${H}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${shade} 0 0 0 0 0 ${shade} 0 0 0 0 0 ${shade} 0 0 0 0 0 1 0"/></filter><g filter="url(#lsh)">${body}</g>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(n * W)} ${H}" width="${r2(n * W)}" height="${H}">${body}</svg>`;
    hit = { uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, W, H, ax: r2(-minX), ay: r2(-minY), n };
    stripCache.set(key, hit);
    if (stripCache.size > 120) stripCache.delete(stripCache.keys().next().value);
    const rk = JSON.stringify([img.frames, img.shade]);
    recent.delete(rk); recent.set(rk, img);
    if (recent.size > 16) recent.delete(recent.keys().next().value);
    return hit;
  }

  // Root and stage. The layout-critical rules are also inline, so the street's layout holds even before life.css loads;
  // the stylesheet itself is linked from here when the page has not linked it.
  if (!doc.querySelector('link[href*="life.css"]')) {
    try { const link = doc.createElement('link'); link.rel = 'stylesheet'; link.href = new URL('./life.css', import.meta.url).href; doc.head.append(link); } catch {}
  }
  const root = doc.createElement('div');
  root.className = 'street-life';
  root.setAttribute('aria-hidden', 'true');
  root.style.cssText = 'position:absolute;inset:0;z-index:0;overflow:hidden;border-radius:inherit;pointer-events:none;contain:strict';
  const stage = doc.createElement('div');
  stage.className = 'life-stage';
  stage.style.cssText = 'position:absolute;left:0;top:0;width:400px;height:220px;transform-origin:0 0';
  root.append(stage);
  const art = [...streetEl.children].find(node => node.id === 'street-art');
  if (art) art.after(root); else streetEl.prepend(root);

  const director = createDirector({ sizeOf, memory: MEMORY });
  const refs = new Map(), anims = new Set(), reasons = new Set();
  let view = null, size = { W: -1, H: -1 }, destroyed = false, measureClock = 0, lastTone = null, predecoded = '', ctxNow = normalizeCtx({});
  const quiet = () => { try { return (typeof lowMotion === 'function' && !!lowMotion()) || doc.documentElement.classList.contains('reduced-motion') || media('(prefers-reduced-motion: reduce)'); } catch { return true; } };
  const div = cls => { const node = doc.createElement('div'); node.className = cls; return node; };

  /** Layers that never hide the street: the backdrop, this layer (or another one), aria-hidden overlays. */
  const decorative = node => node === root || node.id === 'street-art' || node.classList.contains('street-life') || node.getAttribute('aria-hidden') === 'true';
  /** The lane, title, counter and other street children, as rectangles in street units (see-through ones weigh less). */
  function occluders(box, T) {
    const list = [];
    const add = (r, w) => {
      if (r.width < 1 || r.height < 1) return;
      list.push({ x0: r2((r.left - box.left - T.ox) / T.s), y0: r2((r.top - box.top - T.oy) / T.s), x1: r2((r.right - box.left - T.ox) / T.s), y1: r2((r.bottom - box.top - T.oy) / T.s), w: r2(w) });
    };
    const collect = (node, depth) => {
      if (node.hidden) return;
      const cs = win.getComputedStyle(node);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return;
      const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/), parts = m ? m[1].split(/[\s,/]+/).filter(Boolean) : [];
      const alpha = cs.backgroundImage !== 'none' ? 1 : parts.length ? (parts.length > 3 ? +parts[3] : 1) : 0;
      const kids = [...node.children];
      if (alpha >= .25 || depth >= 3 || !kids.length) { add(node.getBoundingClientRect(), alpha >= .25 ? alpha : kids.length ? .9 : .6); return; }
      for (const kid of kids) collect(kid, depth + 1);
    };
    for (const child of streetEl.children) if (!decorative(child)) collect(child, 0);
    return list;
  }
  /** What the street's children look like (cards, selection, hidden bits), read without forcing a layout. */
  function signature() {
    let sig = '';
    for (const child of streetEl.children) {
      if (decorative(child)) continue;
      sig += `${child.className}${child.hidden ? '-' : ''}:${child.childElementCount};`;
      if (child.childElementCount <= 8) for (const kid of child.children) sig += `${kid.className}${kid.hidden ? '-' : ''}${kid.getAttribute('aria-label') || ''},`;
    }
    return sig;
  }
  let lastSignature = '';
  function measure() {
    const started = win.performance?.now?.() ?? 0;
    lastSignature = signature();
    const box = streetEl.getBoundingClientRect(), T = stageTransform(box.width, box.height);
    size = { W: box.width, H: box.height };
    stage.style.transform = `translate(${r2(T.ox)}px,${r2(T.oy)}px) scale(${r4(T.s)})`;
    const occ = box.width > 4 && box.height > 4 ? occluders(box, T) : [];
    view = buildView(box.width, box.height, { occluders: occ, budget: budgetValue, sizeOf });
    measureMs = Math.max(measureMs, (win.performance?.now?.() ?? 0) - started);
  }

  function register(a) {
    anims.add(a);
    const forget = () => anims.delete(a);
    a.addEventListener?.('finish', forget);
    a.addEventListener?.('cancel', forget);
    if (reasons.size) a.pause();
    return a;
  }
  function animatePath(el, path) {
    const keyframes = path.kf.map(f => ({ offset: f.o, transform: `translate(${f.x}px,${f.y}px) rotate(${f.r}deg) scale(${f.sx},${f.sy})`, opacity: f.a, easing: f.e || 'linear' }));
    return register(el.animate(keyframes, { duration: path.dur * 1000, delay: (path.delay || 0) * 1000, iterations: path.iterations || 1, fill: 'both' }));
  }
  function animateTrack(img, track, n) {
    const kf = track.kf.map(([o, f]) => ({ offset: o, transform: `translateX(${r4(-f / n * 100)}%)`, easing: 'steps(1, end)' }));
    if (kf[0].offset > 0) kf.unshift({ ...kf[0], offset: 0 });
    if (kf[kf.length - 1].offset < 1) kf.push({ ...kf[kf.length - 1], offset: 1 });
    return register(img.animate(kf, { duration: track.dur * 1000, delay: (track.delay || 0) * 1000, fill: 'both' }));
  }

  function buildPart(p, list, imgs) {
    const pe = div('life-part');
    pe.style.transform = `translate(${r2(p.dx)}px,${r2(p.dy)}px) scale(${p.mirror ? -p.k : p.k},${p.k})`;
    let host = pe;
    if (p.rotor) {
      const rotor = div(`life-rotor life-l-spin${p.rotor.ccw ? ' life-ccw' : ''}`), arm = div('life-arm');
      rotor.style.animationDuration = `${p.rotor.d}s`;
      rotor.style.animationDelay = `${-(p.rotor.ph || 0)}s`;
      arm.style.transform = `translate(${p.rotor.r}px,0)`;
      rotor.append(arm); pe.append(rotor); host = arm;
    }
    if (p.rect) {
      const rect = div(`life-rect${p.rect.cls ? ` ${p.rect.cls}` : ''}`);
      Object.assign(rect.style, { left: `${p.rect.x}px`, top: `${p.rect.y}px`, width: `${p.rect.w}px`, height: `${p.rect.h}px` });
      if (p.rect.color) rect.style.background = p.rect.color;
      host.append(rect);
    }
    if (p.img) {
      const strip = stripImage(p.img), loop = p.loop && strip.n === 2 ? p.loop : null;
      const box = div(`life-win${strip.n > 1 ? ' life-clip' : ''}${p.winLoop ? ` ${p.winLoop.cls}` : ''}`);
      Object.assign(box.style, { left: `${-strip.ax}px`, top: `${-strip.ay}px`, width: `${strip.W}px`, height: `${strip.H}px`, transformOrigin: `${strip.ax}px ${strip.ay}px` });
      if (p.winLoop) { box.style.animationDuration = `${p.winLoop.d}s`; box.style.animationDelay = `${p.winLoop.dl || 0}s`; }
      const img = doc.createElement('img');
      img.className = `life-strip${loop ? ` ${loop.cls}` : ''}`;
      img.alt = ''; img.decoding = 'async'; img.draggable = false; img.src = strip.uri;
      img.style.width = `${r2(strip.n * strip.W)}px`; img.style.height = `${strip.H}px`;
      if (loop) { img.style.animationDuration = `${loop.d}s`; img.style.animationDelay = `${loop.dl || 0}s`; }
      box.append(img); host.append(box);
      if (p.track) list.push(animateTrack(img, p.track, strip.n));
      imgs.push({ part: p, img });
    }
    if (p.path) list.push(animatePath(pe, p.path));
    return pe;
  }

  let sky = null;
  function skyLayer() {
    if (sky?.isConnected) return sky;
    sky = div('life-sky');
    const mask = `url("${skyMaskURI()}")`;
    for (const key of ['maskImage', 'webkitMaskImage']) sky.style[key] = mask;
    stage.prepend(sky);
    return sky;
  }
  function spawn(s) {
    const el = div(`life-actor life-${s.family}`), list = [], imgs = [];
    el.style.zIndex = String(s.z);
    el.style.transform = `translate(${r2(s.x)}px,${r2(s.y)}px)`;
    for (const p of s.parts) el.append(buildPart(p, list, imgs));
    (s.sky ? skyLayer() : stage).append(el);
    if (s.path) list.unshift(animatePath(el, s.path));
    if (s.seek) for (const a of list) a.currentTime = s.seek * 1000;
    const ref = { id: s.id, spec: s, el, anims: list, imgs, nodes: s.nodes || 0 };
    refs.set(s.id, ref);
    // An actor whose animations cover its whole life leaves when they end; long-lived ones leave when the director says.
    const timed = [s.path, ...s.parts.flatMap(p => [p.path, p.track])].filter(Boolean);
    const span = timed.reduce((m, a) => Math.max(m, (a.delay || 0) + a.dur * (a.iterations || 1)), 0);
    if (list.length && s.dur < 1e4 && span >= s.dur - .05) {
      Promise.all(list.map(a => a.finished)).then(() => { if (refs.get(s.id) === ref && !ref.leaving) { director.remove(s.id); drop(ref); } }, () => {});
    }
  }
  function drop(ref) {
    for (const a of ref.anims) { try { a.cancel(); } catch {} anims.delete(a); }
    ref.el.remove();
    refs.delete(ref.id);
  }
  function leave(id, fade) {
    const ref = refs.get(id);
    if (!ref || ref.leaving) return;
    ref.leaving = true;
    if (!fade || reasons.size) { drop(ref); return; }
    let from = 1;
    try { from = +win.getComputedStyle(ref.el).opacity; } catch {}
    const a = register(ref.el.animate([{ opacity: from }, { opacity: 0 }], { duration: fade * 1000, fill: 'forwards' }));
    ref.anims.push(a);
    a.finished.then(() => drop(ref), () => drop(ref));
  }
  function apply(out) {
    for (const r of out.remove) leave(r.id, r.fade);
    for (const s of out.spawn) spawn(s);
    for (const cue of out.sounds) { try { sound(cue); } catch {} }
  }

  function setPaused() {
    const paused = reasons.size > 0;
    root.classList.toggle('life-paused', paused);
    for (const a of anims) { try { if (paused) { if (a.playState === 'running') a.pause(); } else if (a.playState === 'paused') a.play(); } catch {} }
  }
  const dialogCheck = () => {
    if (destroyed) return;
    const open = !!doc.querySelector('dialog[open]');
    if (open !== reasons.has('dialog')) { if (open) reasons.add('dialog'); else reasons.delete('dialog'); setPaused(); }
  };
  const onVisibility = () => { if (destroyed) return; if (doc.hidden) reasons.add('hidden'); else reasons.delete('hidden'); setPaused(); };
  const dialogs = typeof win.MutationObserver === 'function' ? new win.MutationObserver(dialogCheck) : null;
  dialogs?.observe(doc.documentElement, { subtree: true, attributes: true, attributeFilter: ['open'] });
  doc.addEventListener('visibilitychange', onVisibility);
  const resizer = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(() => {
    if (destroyed) return;
    const box = streetEl.getBoundingClientRect();
    if (Math.abs(box.width - size.W) > 2 || Math.abs(box.height - size.H) > 2) { measure(); apply(director.clear()); }
  }) : null;
  resizer?.observe(streetEl);
  measure();
  dialogCheck();
  onVisibility();

  // Work for idle moments, a little at a time (drawing sprites, decoding the next tone's pictures).
  const idleJobs = [];
  let idleBooked = false;
  const idle = fn => (typeof win.requestIdleCallback === 'function' ? win.requestIdleCallback(fn, { timeout: 3000 }) : win.setTimeout(fn, 80));
  function later(job) { idleJobs.push(job); if (!idleBooked) { idleBooked = true; idle(runIdle); } }
  function runIdle(deadline) {
    idleBooked = false;
    while (idleJobs.length && !destroyed) {
      try { idleJobs.shift()(); } catch {}
      if (!deadline?.timeRemaining || deadline.timeRemaining() < 3) break;
    }
    if (idleJobs.length && !destroyed) { idleBooked = true; idle(runIdle); }
  }
  /** Ahead of a tone change, draw and decode the next tone's pictures while the browser is idle. */
  function predecode(ctx) {
    const next = toneAt(Math.min(1, ctx.progress + .025), ctx.rain);
    if (next === toneAt(ctx.progress, ctx.rain) || predecoded === `${ctx.day}|${next}`) return;
    predecoded = `${ctx.day}|${next}`;
    for (const img of [...recent.values()]) later(() => { const pic = new win.Image(); pic.decoding = 'async'; pic.src = stripImage({ ...img, tone: next }).uri; pic.decode?.().catch(() => {}); });
  }
  /** Draws today's likely sprites in idle time, so a spawn never pays for generating them. */
  let warmed = '';
  function warm(ctx) {
    const tone = toneAt(ctx.progress, ctx.rain), key = `${ctx.day}|${tone}|${ctx.pet}|${ctx.event}`, b = view?.bands;
    if (!b || warmed === key) return;
    warmed = key;
    const list = [], want = (kind, frames, variants) => { for (const v of variants) for (const f of frames) list.push([kind, f, v]); };
    if (!ctx.rain && b.wire >= .6) want('sparrow', [0, 1, 2, 3], [0, 1, 2]);
    if (b.ground) want(ctx.rain ? 'pedestrian-umbrella' : 'pedestrian', [0, 1], [0, 1, 2, 3, 4, 5]);
    if (ctx.pet) want(PET_KIND[ctx.pet], PET_KIND[ctx.pet] === 'cat' ? [2] : [0, 1], [0]);
    if (!ctx.rain && b.roof >= .6) want('cat', [0, 1, 2, 3], [1, 2]);
    if (b.road >= .6) want('scooter', [0, 1], [0, 1, 2, 3]);
    if (!ctx.rain && ctx.progress > .6) want('flock-bird', [0, 1], [0, 1, 2]);
    if (ctx.progress > .7 && b.lamp >= .5) { want('lamp-glow', [0], [0]); want('moth', [0, 1], [0, 1]); }
    if (ctx.rain) { want('raindrop', [0], [0]); want('splash', [1], [0]); }
    for (const [kind, f, v] of list) later(() => getSprite(kind, f, v, tone));
  }
  /** Long-lived actors (pet, kite, moths, drips, bunting) change tone with the sky. */
  function retone(tone) {
    for (const ref of refs.values()) {
      if (!(ref.spec.dur > 20) || ref.leaving) continue;
      for (const { part: p, img } of ref.imgs) if (p.img && p.img.tone !== tone) { p.img.tone = tone; img.src = stripImage(p.img).uri; }
    }
  }
  function clearAll() { apply(director.clear()); for (const ref of [...refs.values()]) drop(ref); }

  const life = {
    tick(dt, ctx) {
      if (destroyed) return;
      if (!root.isConnected || !streetEl.isConnected) { life.destroy(); return; }
      if (quiet()) { if (refs.size) clearAll(); return; }
      if (reasons.size) return;
      ctxNow = normalizeCtx(ctx);
      measureClock += clamp(+dt || 0, 0, 1);
      // The lane changes as guests come, go and get picked: re-measure then (and only then; sizes come via ResizeObserver).
      if (!view || (measureClock >= 1 && (measureClock = 0, signature() !== lastSignature))) measure();
      view.lingering = [...refs.values()].reduce((sum, ref) => sum + (ref.leaving ? ref.nodes : 0), 0);
      apply(director.step(dt, ctxNow, view));
      const tone = toneAt(ctxNow.progress, ctxNow.rain);
      if (tone !== lastTone) { if (lastTone) retone(tone); lastTone = tone; }
      predecode(ctxNow);
      warm(ctxNow);
    },
    vignette(kind, data) {
      if (destroyed || !VIGNETTES.includes(kind) || quiet()) return;
      if (!root.isConnected) { life.destroy(); return; }
      if (!view) measure();
      apply(director.vignette(kind, data, ctxNow, view));
    },
    resize() { if (!destroyed) { measure(); apply(director.clear()); } },
    pause() { if (!destroyed) { reasons.add('api'); setPaused(); } },
    resume() { if (!destroyed) { reasons.delete('api'); setPaused(); } },
    clear() { if (!destroyed) clearAll(); },
    destroy() {
      if (destroyed) return;
      clearAll();
      destroyed = true;
      idleJobs.length = 0;
      dialogs?.disconnect();
      resizer?.disconnect();
      doc.removeEventListener('visibilitychange', onVisibility);
      root.remove();
    },
    actors() { return destroyed ? [] : director.actors().map(({ kind, x, y, family, vignette }) => ({ kind, x, y, family, vignette })); },
    demo() { if (destroyed || quiet()) return; measure(); clearAll(); apply(director.demo(ctxNow, view)); },
    /** For tests and tuning: the view summary and current costs. */
    stats() {
      return {
        view: view && { W: view.W, H: view.H, s: view.s, x0: view.x0, x1: view.x1, y0: view.y0, y1: view.y1, small: view.small, cap: view.cap, nodeCap: view.nodeCap, bands: view.bands, ground: view.ground, petSpot: view.petSpot, counterTop: view.counterTop, sky: view.sky, occluders: view.occluders },
        actors: refs.size, ambient: director.live().filter(a => a.ambient).length, nodes: director.nodes(), paused: reasons.size > 0, budget: budgetValue,
        fallbacks, measureMs: r2(measureMs), pictures: stripCache.size,
      };
    },
    /** For tests: the live actor specs (keyframes in street units and seconds). */
    specs() { return destroyed ? [] : director.live(); },
    get root() { return root; },
  };
  return life;
}
