/** Tiệm Mì Cay: the living street. Original tiny sprites for people, vehicles, animals, weather and story bits that
 * move across the street backdrop (src/art/scene.js), plus two pictures for story dialogs.
 *
 *   lifeSprite(kind, { frame, variant, tone, idPrefix }) → { svg, w, h, ax, ay }
 *   romanceMedallion(stage, { idPrefix })                → svg string, viewBox 0 0 80 80 (stage 0 heart, 1 betrothal tray, 2 rings)
 *   prankIcon(kind, { idPrefix })                         → svg string, viewBox 0 0 64 64
 *   LIFE_KINDS, PRANK_ICON_KINDS                          → frozen id lists
 *   LIFE_SPRITE_INFO                                      → frozen { kind: { w, h, ax, ay, frames, variants } }
 *
 * Units are street units: the backdrop is 400×220 and the caller scales each sprite by the backdrop's factor, so on a
 * 390 px phone one unit is about 0.93 px. Shapes are chunky on purpose. Directional sprites face right (the caller
 * mirrors them). (ax, ay) is the feet or wheel contact point; for flyers and particles it is the body centre (the head
 * for the shooting star, the middle of the hanging line for the bunting). All frames of a kind share w, h, ax and ay.
 *
 * Tones follow the backdrop's light: dusk warms and pinks, night cools and darkens but keeps vivid accents (helmets,
 * umbrellas, lamps, headlights, glowing cat eyes), rain greys everything a little. Colours written in UPPER-case hex
 * are lights: they skip the tone pass.
 *
 * A pure module: no DOM, no randomness, no timers; the same arguments give the same string. Style follows
 * docs/ART-STYLE.md: a #4a2a22 outline with round joins (painted under the fills, so the visible line is half the
 * stroke width), flat shades away from a top-left light, small white highlights, no SMIL, no external references.
 * Only lamp-glow and the romance medallion carry ids. They use the given idPrefix, or a fixed prefix derived from the
 * arguments, so identical pictures share identical definitions; give each instance on a page its own idPrefix.
 */
import { staffFace } from './people.js';

const INK = '#4a2a22';
const SHADOW = '#3a1d16';
const EYE = '#2e1a19';
const BLUSH = '#f2867a';
const W = '#ffffff';
const NO = ' stroke="none"';

// ---------------------------------------------------------------------------------------------
// Helpers

const r1 = n => Math.round(n * 10) / 10;
const rgbOf = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const hexOf = rgb => '#' + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const p = rgbOf(a), q = rgbOf(b); return hexOf(p.map((v, i) => v + (q[i] - v) * t)); };
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const pl = pts => 'M' + pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L');
const op = o => ` opacity="${String(o).replace(/^0\./, '.')}"`;

// Filled and outlined (the outline comes from the root group), filled without outline, a plain line, a tube (a line
// with its own outline), circles, ellipses and round dots (zero-length strokes).
const P = (d, fill, x = '') => `<path d="${d}" fill="${fill}"${x}/>`;
const F = (d, fill, x = '') => `<path d="${d}" fill="${fill}"${NO}${x}/>`;
const S = (d, color, w, x = '') => `<path d="${d}" stroke="${color}" stroke-width="${w}"${x}/>`;
const T = (d, color, w, o = 1.1) => `<path d="${d}" stroke-width="${r1(w + o)}"/>` + S(d, color, w);
const C = (cx, cy, r, fill, x = '') => `<circle${cx ? ` cx="${cx}"` : ''}${cy ? ` cy="${cy}"` : ''} r="${r}" fill="${fill}"${x}/>`;
const E = (cx, cy, rx, ry, fill, x = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${x}/>`;
const D = (pts, color, size, x = '') => S(pts.map(([x0, y0]) => `M${r1(x0)} ${r1(y0)}h0`).join(''), color, size, x);
const G = (tf, body) => (tf ? `<g transform="${tf}">${body}</g>` : body);
const at = (x, y, body) => G(`translate(${r1(x)} ${r1(y)})`, body);
const lift = (dy, body) => (dy ? G(`translate(0 ${dy})`, body) : body);
const ground = (cx, cy, rx, ry = .6) => E(cx, cy, rx, ry, SHADOW, `${NO} opacity=".13"`);
const hi = (d, w = .6, o = .5) => S(d, W, w, op(o));
const ring = (cx, cy, r) => `M${r1(cx - r)} ${r1(cy)}a${r} ${r} 0 1 0 ${r1(2 * r)} 0a${r} ${r} 0 1 0 ${r1(-2 * r)} 0`;
const star4 = (cx, cy, r, k = .22) => {
  const q = r * k, c = r1;
  return `M${c(cx)} ${c(cy - r)}Q${c(cx + q)} ${c(cy - q)} ${c(cx + r)} ${c(cy)}Q${c(cx + q)} ${c(cy + q)} ${c(cx)} ${c(cy + r)}Q${c(cx - q)} ${c(cy + q)} ${c(cx - r)} ${c(cy)}Q${c(cx - q)} ${c(cy - q)} ${c(cx)} ${c(cy - r)}Z`;
};
const burst = (cx, cy, r0, r1_, n, turn = 0) => 'M' + Array.from({ length: n * 2 }, (_, i) => {
  const a = (i / (n * 2) + turn) * Math.PI * 2, r = i % 2 ? r1_ : r0;
  return `${r1(cx + Math.sin(a) * r)} ${r1(cy - Math.cos(a) * r)}`;
}).join('L') + 'Z';

// Final pass over path data: each segment is written relative or absolute, whichever is shorter, with minimal
// separators (the same idea as src/art/people.js). Coordinates stay on a 0.1 grid, so deltas never drift.
const ARGS = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
const num = value => { const text = String(Math.round(value * 10) / 10); return text === '-0' ? '0' : text.replace(/^(-?)0\./, '$1.'); };
function joinNums(list, prev = null) {
  let text = '';
  for (const item of list) {
    text += (prev !== null && !(item[0] === '-' || (item[0] === '.' && prev.includes('.'))) ? ' ' : '') + item;
    prev = item;
  }
  return text;
}
function minifyPath(d) {
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)/g) || [];
  let i = 0, x = 0, y = 0, sx = 0, sy = 0, out = '', lastLetter = '', lastNum = null, letter = '';
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) letter = tokens[i++];
    else if (letter === 'M') letter = 'L';
    else if (letter === 'm') letter = 'l';
    const lower = letter.toLowerCase(), rel = letter === lower, count = ARGS[lower];
    if (count === undefined) return d;
    if (lower === 'z') { out += 'z'; lastLetter = 'z'; lastNum = null; x = sx; y = sy; continue; }
    const a = tokens.slice(i, i + count).map(Number);
    i += count;
    if (a.length < count || a.some(Number.isNaN)) return d;
    let abs;
    if (lower === 'h') abs = [rel ? x + a[0] : a[0], y];
    else if (lower === 'v') abs = [x, rel ? y + a[0] : a[0]];
    else if (lower === 'a') abs = [a[0], a[1], a[2], a[3], a[4], rel ? x + a[5] : a[5], rel ? y + a[6] : a[6]];
    else abs = a.map((value, k) => (rel ? value + (k % 2 ? y : x) : value));
    abs = abs.map(value => Math.round(value * 10) / 10);
    const end = lower === 'a' ? abs.slice(5) : abs.slice(-2);
    let options;
    if (lower === 'a') {
      const head = abs.slice(0, 5).map(num);
      options = [['A', [...head, num(end[0]), num(end[1])]], ['a', [...head, num(end[0] - x), num(end[1] - y)]]];
    } else if (lower === 'l' || lower === 'h' || lower === 'v') {
      const dx = end[0] - x, dy = end[1] - y;
      options = Math.abs(dy) < .05 ? [['H', [num(end[0])]], ['h', [num(dx)]]]
        : Math.abs(dx) < .05 ? [['V', [num(end[1])]], ['v', [num(dy)]]]
          : [['L', [num(end[0]), num(end[1])]], ['l', [num(dx), num(dy)]]];
    } else {
      options = [[lower.toUpperCase(), abs.map(num)], [lower, abs.map((value, k) => num(value - (k % 2 ? y : x)))]];
    }
    const cost = ([l, nums]) => (l === lastLetter && l.toLowerCase() !== 'm' ? 0 : 1) + joinNums(nums, l === lastLetter ? lastNum : null).length;
    const [chosen, nums] = cost(options[0]) <= cost(options[1]) ? options[0] : options[1];
    if (chosen === lastLetter && chosen.toLowerCase() !== 'm') out += joinNums(nums, lastNum);
    else out += chosen + joinNums(nums);
    lastLetter = chosen; lastNum = nums[nums.length - 1];
    [x, y] = end;
    if (lower === 'm') { sx = x; sy = y; }
  }
  return out;
}
const minify = markup => markup.replace(/ d="([^"]+)"/g, (m, d) => ` d="${minifyPath(d)}"`).replace(/="(-?)0\./g, '="$1.');

const cleanId = value => String(value).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^(?=[^A-Za-z_])/, 'p');
const wrap = (value, n) => { const i = Math.trunc(Number(value)); return Number.isFinite(i) ? ((i % n) + n) % n : 0; };

// ---------------------------------------------------------------------------------------------
// Tones: the same picture under the street's four lights. Saturated colours keep more of themselves, so vivid accents
// survive the night; UPPER-case colours are lights and are left alone (then lower-cased).

const TONES = ['day', 'dusk', 'night', 'rain'];
function toneColor(hex, tone) {
  const rgb = rgbOf(hex), max = Math.max(...rgb), sat = max ? (max - Math.min(...rgb)) / max : 0;
  if (tone === 'dusk') return mix(mix(hex, '#ff9256', .13), '#46285c', .17 - .07 * sat);
  if (tone === 'night') return mix(hex, '#262450', .46 - .22 * sat);
  if (tone === 'rain') return mix(mix(hex, '#71849a', .3 - .14 * sat), '#1b2552', .07);
  return hex;
}
const toned = (markup, tone) => markup.replace(/(fill|stroke|stop-color)="#([0-9a-fA-F]{6})"/g, (m, attr, hex) =>
  `${attr}="${/[A-F]/.test(hex) ? '#' + hex.toLowerCase() : toneColor('#' + hex, tone)}"`);

// ---------------------------------------------------------------------------------------------
// Palette (docs/ART-STYLE.md), each colour with its flat shade.

const SKIN = [['#f9d2b4', '#e3b08f'], ['#efc19c', '#d6a07a'], ['#d9a27a', '#bd835c'], ['#b97d56', '#9c6440'], ['#8d5a3b', '#74462c']];
const HAIR = { black: '#3b2624', dark: '#5a3322', brown: '#7e4a2b', white: '#efebe6' };
const CL = {
  red: ['#e8402f', '#b92b22'], tomato: ['#ef5a3c', '#c23f28'], orange: ['#f59a3a', '#c9672a'], yellow: ['#f7c242', '#c99420'],
  green: ['#5fae4e', '#3f8a3a'], mint: ['#8fd3a7', '#5fae7e'], sky: ['#6cc3ef', '#3f97c9'], blue: ['#2f7fc1', '#22609a'],
  teal: ['#2f8f8a', '#216b67'], plum: ['#8a4d9e', '#683779'], pink: ['#f28ab2', '#d0628c'], wood: ['#b06a3b', '#7a4426'],
  white: [W, '#e4dacd'], cream: ['#fff3dc', '#ead3ae'], navy: ['#2f4380', '#22315f'], denim: ['#3f79b8', '#2d5d93'],
  slate: ['#5d6680', '#474e66'], khaki: ['#7f9c3c', '#5f7a2a'], black: ['#3b3036', '#2a2228'], brown: ['#8a5a3b', '#6a4129'],
  metal: ['#c9d3db', '#8e9aa6'], rose: ['#d9577a', '#b23e5e'],
};
const TYRE = '#3b3540', METAL = '#c9d3db', METAL_D = '#8e9aa6', LEAF = '#5fae4e', LEAF_D = '#3f8a3a';

// ---------------------------------------------------------------------------------------------
// The walker: one person seen from the side, facing right, in a 12×26 box with the feet on y 25. Legs and arms are
// outlined tubes; the upper body bobs up in the passing frame.

const ADULT = {
  bob: -.4, legW: 1.9, armW: 1.45, head: [6.6, 5.2], ground: 4.2,
  legs: [
    [[[5.3, 16.6], [4.4, 20.6], [3.5, 24.2]], [[6.9, 16.6], [7.8, 20.6], [8.7, 24.2]]],
    [[[5.6, 16.2], [5.6, 20.2], [4.9, 23.8]], [[6.4, 16.2], [6.8, 20.3], [6.7, 24.2]]],
  ],
  swing: [
    [[[6.2, 10.6], [7.2, 13.2], [8.2, 15.4]], [[6.4, 10.6], [5.6, 13.2], [4.8, 15.6]]],
    [[[6.2, 10.6], [6, 13.3], [5.8, 15.8]], [[6.4, 10.6], [6.3, 13.3], [6.6, 15.8]]],
  ],
  torso: 'M4.3 10.9Q4.5 9.5 6 9.4H7.1Q8.7 9.6 8.7 11.4L8.5 16.6H4.2Z',
  shade: 'M7.7 9.7Q8.7 10.1 8.7 11.4L8.5 16.6H7.5Z',
  hips: 'M4.3 15H8.5L8.6 17.2H4.2Z',
};
const KID = {
  bob: -.3, legW: 1.7, armW: 1.3, head: [6.4, 11.4], ground: 3.4,
  legs: [
    [[[5.4, 19.8], [4.7, 22.2], [4, 24.3]], [[6.8, 19.8], [7.5, 22.2], [8.1, 24.3]]],
    [[[5.6, 19.5], [5.5, 22], [5, 24]], [[6.4, 19.5], [6.7, 22], [6.6, 24.3]]],
  ],
  swing: [
    [[[6, 15.6], [6.9, 17.4], [7.6, 18.9]], [[6.3, 15.6], [5.6, 17.4], [5, 18.9]]],
    [[[6, 15.6], [5.9, 17.4], [5.8, 19]], [[6.3, 15.6], [6.3, 17.4], [6.5, 19]]],
  ],
  torso: 'M4.5 15.9Q4.7 14.8 5.9 14.7H7Q8.3 14.9 8.3 16.3L8.2 19.9H4.4Z',
  shade: 'M7.5 14.9Q8.3 15.2 8.3 16.3L8.2 19.9H7.3Z',
  hips: 'M4.5 18.6H8.2L8.3 20.4H4.4Z',
};

// Hair and hats in head-local units: the head is a circle of radius 3 at (0, 0), the face on the right.
const HAIRS = {
  short: 'M2.9-.8Q2.6-3.4 0-3.4Q-3.3-3.3-3.1.7Q-2.7 2.2-1.7 1.7L-1.4-.3Q.9-1.1 2.9-.8Z',
  long: 'M3-.5Q2.7-3.5-.1-3.5Q-3.4-3.4-3.3.8L-2.4 2.2Q-1.7.2-.9-.6Q1.2-1 3-.5Z',
  bun: 'M2.9-.7Q2.6-3.4 0-3.4Q-3.3-3.3-3.1.9Q-2.5 1.8-1.7 1.3L-1.3-.4Q.9-1.1 2.9-.7Z',
  fringe: 'M-3.1.6Q-3.2-1.6-1.6-2.6L-.8.4Q-1.6 2-3.1.6Z',
};
const BACK_HAIR = {
  long: 'M-1.2-2.6Q-3.6-2.4-3.5 1L-3.3 7Q-2.3 7.8-1.3 7L-.4.6Z',
  bun: ring(-2.6, -2.5, 1.4),
  pony: 'M-2.4-1.8Q-5.2-1.6-4.7 2.8Q-3.6 1.6-2.5.4Z',
  pigtails: 'M-2.7.2Q-4.6.6-4.3 3.1Q-3.3 2.8-2.5 1.6Z',
};
function face({ skin, hair, hairC, back, hat = '', eye = [1.6, .3], extra = '' }) {
  return (back ? P(BACK_HAIR[back], hairC) : '') + C(0, 0, 3, skin) + (hair ? P(HAIRS[hair], hairC) : '')
    + D([eye], EYE, 1) + D([[eye[0] - .4, eye[1] + 1.3]], BLUSH, 1.2, op(.55)) + hat + extra;
}
const HATS = {
  pith: (c, s) => P('M-3.5-1Q-3.3-4.7 0-4.8Q3.3-4.7 3.5-1Z', c) + P('M-4.3-1.1H4Q3.9-.3 3.2-.3H-3.5Q-4.3-.3-4.3-1.1Z', s) + hi('M-2.2-2.6Q-1.4-3.9.2-4.1'),
  capBack: (c, s) => P('M-3.2-.3Q-3.1-3.6 0-3.6Q3.1-3.5 3.2-.3Z', c) + P('M-2.4-1H-4.6Q-4.6-.2-3.8-.2H-2.6Z', s) + hi('M-1.8-2Q-1-3.1.4-3.1'),
  officer: (c, s) => P('M-3.2-.7Q-3.5-3.4-.8-3.9H2Q3.6-3.5 3.3-.7Z', c) + F('M-3.1-1.7H3.3V-.8H-3.1Z', s) + P('M2.4-1H4.6Q4.5-.2 3.6-.2H2.4Z', '#3b3036') + D([[.9, -2.6]], '#f7c242', 1.1),
  nonla: () => P('M-5-.9L0-5.2L5-.9Q0 .3-5-.9Z', '#f6d27a') + F('M0-5.2L5-.9Q2.6-.3 1.2-.4Z', '#d6a748') + S('M-1.4-.3Q0 3.2 1.9 2.1', '#e8628f', .4),
};

function limb([s, e, h], skin, sleeve, kind, w) {
  let out = T(pl([s, e, h]), skin, w);
  if (kind === 'long') out += S(pl([s, e, lerp(e, h, .45)]), sleeve, w);
  else if (kind === 'short') out += S(pl([s, lerp(s, e, .6)]), sleeve, w);
  return out;
}

function walker(o, f) {
  const K = o.kid ? KID : ADULT, b = f ? K.bob : 0;
  const [bl, fl] = (o.legs || K.legs)[f], [ba, fa] = (o.arms || K.swing)[f];
  const [skin, skinS] = o.skin, [top, topS] = o.top, [bot, botS] = o.bottom;
  const leg = (pts, dark) => {
    const [hip, knee, foot] = pts, c = dark ? botS : bot;
    let s = T(pl(pts), o.bare ? (dark ? skinS : skin) : c, K.legW);
    if (o.shorts) s += T(pl([hip, lerp(hip, knee, .8)]), c, K.legW + .25);
    if (o.socks) s += S(pl([lerp(knee, foot, .55), foot]), dark ? '#e4dacd' : W, K.legW);
    return s + T(`M${r1(foot[0] - .3)} ${r1(foot[1] + .2)}h1.5`, dark ? mix(o.shoe, '#000000', .15) : o.shoe, 1.2);
  };
  let out = ground(6, 25.1, K.ground);
  out += lift(b, (o.behind || '') + limb(ba, skinS, topS, o.sleeve, K.armW));
  out += leg(bl, true);
  if (!o.skirt) out += lift(b, P(K.hips, bot));
  out += leg(fl, false);
  const [hx, hy] = o.headAt || K.head;
  out += lift(b, P(o.torso || K.torso, top) + F(o.shade || K.shade, topS) + (o.over || '')
    + G(`translate(${hx} ${hy})${o.tilt ? ` rotate(${o.tilt})` : ''}`, o.face) + (o.preArm || '')
    + limb(fa, skin, top, o.sleeve, K.armW) + (o.hold || ''));
  return out;
}

// The six street people, two colourways each (variants 0-5, then 6-11 in the second colourway).
const PEOPLE = 6;
const UMBRELLAS = [CL.red, CL.yellow, CL.sky, CL.green, CL.pink, CL.plum];
const SKIN_OF = [[0, 1], [1, 3], [2, 3], [1, 2], [0, 2], [1, 4]];
const UMBRELLA_POSE = [[6.4, 10.6], [8, 12.8], [8.5, 10.9]];
const poseArms = (front, back = ADULT.swing) => [[back[0][0], front], [back[1][0], front]];

function person(v, umbrella, tone = 'day') {
  const type = v % PEOPLE, alt = Math.floor(v / PEOPLE) % 2, skin = SKIN[SKIN_OF[type][alt]];
  const o = { skin, shoe: '#3b2b2b', sleeve: 'long' };
  if (type === 0) { // schoolgirl in a white áo dài with a backpack
    const pack = alt ? CL.sky : CL.pink;
    Object.assign(o, {
      top: CL.white, bottom: CL.white, shoe: '#7a4a36',
      torso: 'M4.4 10.9Q4.6 9.5 6 9.4H7Q8.6 9.6 8.6 11.4Q8.5 13.6 8.2 15.8H4.6Q4.2 13.2 4.4 10.9Z',
      shade: 'M7.6 9.7Q8.6 10.1 8.6 11.4Q8.5 13.6 8.2 15.8H7.4Z',
      behind: P('M4.8 15.2L4.1 15.8L1.8 21.3L4.5 21.8L5.6 16Z', '#f3ede6'),
      over: P('M2.4 10.9Q2.4 10 3.3 10H4.6V15H3.3Q2.4 15 2.4 14.1Z', pack[0]) + F('M2.4 13H4.6V15H3.3Q2.4 15 2.4 14.1Z', pack[1])
        + P('M8.2 15.2L6.6 15.6L7 21.9L9.7 21.4Z', W) + S('M4.4 10.4Q6.6 10 7.6 12.2', pack[1], .6),
      face: face({ skin: skin[0], hair: 'long', hairC: HAIR.black, back: 'long' }),
    });
  } else if (type === 1) { // office worker reading a phone
    const night = tone === 'night';
    Object.assign(o, {
      top: alt ? CL.white : CL.sky, bottom: alt ? CL.slate : CL.navy, shoe: '#2e2428', tilt: 12,
      over: alt ? S('M7.9 10.2V13', '#e8402f', .7) : '',
      face: face({ skin: skin[0], hair: 'short', hairC: HAIR.black, eye: [1.6, .7] }),
    });
    if (!umbrella) {
      o.arms = poseArms([[6.4, 10.6], [7.6, 13.6], [9.2, 11.6]]);
      o.hold = P('M8.9 9.6H10.1V11.9H8.9Z', '#3b3036', ' stroke-width="1"') + F('M9.1 9.8H9.9V11.3H9.1Z', night ? '#BDE6FF' : '#8fd0f3')
        + (night ? C(9.5, 10.5, 1.8, '#9FDCFF', `${NO}${op(.3)}`) : '') + D([[9.2, 11.7]], skin[0], 1.4);
    }
  } else if (type === 2) { // auntie with a market basket, in a printed pyjama set
    const set = alt ? CL.orange : CL.pink;
    Object.assign(o, {
      top: set, bottom: set, sleeve: 'short', shoe: '#b06a3b',
      over: D([[5.3, 11.4], [7.5, 12.4], [5.6, 14.2], [7.8, 15.2], [5, 16.6]], '#fff3dc', .8),
      face: face({ skin: skin[0], hair: 'bun', hairC: HAIR.black, back: 'bun' }),
    });
    if (!umbrella) {
      o.arms = poseArms([[6.4, 10.6], [7.3, 13.6], [9.4, 13.5]]);
      o.preArm = P('M6.8 14.6H11L10.4 17.8Q8.9 18.4 7.4 17.8Z', '#d99a5e') + S('M7.1 15.8H10.7M7.3 16.9H10.5', '#b06a3b', .45)
        + P('M7.2 14.6Q7.3 12.9 8.5 13.6Q9.2 12.4 10.3 13.4Q11 13.8 10.8 14.6Z', LEAF, ' stroke-width="1"') + D([[8.2, 14]], '#e8402f', 1.1)
        + S('M7.4 14.4Q8.9 11.8 10.5 14.4', '#7a4426', .55);
    }
  } else if (type === 3) { // grandpa with a cane and a pith helmet
    Object.assign(o, {
      top: alt ? CL.yellow : CL.white, bottom: CL.brown, sleeve: 'short', shoe: '#4a3328', headAt: [7.1, 6.3],
      torso: 'M4.4 11.2Q4.8 9.9 6.3 9.9H7.4Q9 10.3 8.8 12.2L8.4 16.6H4.2Z', shade: 'M8 10.2Q9 10.6 8.8 12.2L8.4 16.6H7.4Z',
      legs: [
        [[[5.4, 16.6], [4.8, 20.6], [4.1, 24.2]], [[6.8, 16.6], [7.4, 20.6], [8, 24.2]]],
        [[[5.6, 16.3], [5.7, 20.3], [5.2, 23.8]], [[6.4, 16.3], [6.6, 20.4], [6.6, 24.2]]],
      ],
      face: face({ skin: skin[0], hair: 'fringe', hairC: HAIR.white, hat: alt ? '' : HATS.pith('#7f9a45', '#5f7a30') })
        + (alt ? P('M2.6-.9Q2.2-3.3 0-3.3Q-3-3.2-3 .5Q-2.4 1.6-1.6 1.2L-1.2-.4Q.8-1.2 2.6-.9Z', HAIR.white) : ''),
    });
    if (!umbrella) {
      o.arms = poseArms([[6.6, 11], [7.8, 13.8], [9.2, 15.2]]);
      o.hold = T('M9.3 15L10 24.6M9.3 15Q9.1 14 8.3 14.4', '#7a4426', .8);
    }
  } else if (type === 4) { // pupil in uniform with a red scarf
    const pack = alt ? CL.yellow : CL.blue;
    Object.assign(o, {
      kid: true, top: CL.white, bottom: CL.navy, bare: true, shorts: !alt, skirt: !!alt, socks: true, shoe: '#2e2428', sleeve: 'short',
      torso: alt ? 'M4.5 15.9Q4.7 14.8 5.9 14.7H7Q8.3 14.9 8.3 16.3L8.2 18.4H4.4Z' : undefined,
      over: (alt ? P('M4.4 18.1H8.2L9 21.2Q6.3 21.9 3.6 21.2Z', CL.navy[0]) : '')
        + P('M2.6 15.8Q2.6 14.8 3.6 14.8H4.8V19.6H3.6Q2.6 19.6 2.6 18.6Z', pack[0]) + F('M2.6 17.6H4.8V19.6H3.6Q2.6 19.6 2.6 18.6Z', pack[1])
        + P('M6 14.9L8.2 15.1L7.2 16.9Z', '#e8402f', ' stroke-width="1"'),
      face: face({ skin: skin[0], hair: 'short', hairC: HAIR.black, back: alt ? 'pigtails' : undefined }),
    });
  } else { // student with a bubble-tea cup
    Object.assign(o, {
      top: alt ? CL.teal : CL.yellow, bottom: CL.denim, sleeve: 'short', shoe: W,
      face: alt ? face({ skin: skin[0], hair: 'long', hairC: HAIR.dark, back: 'pony' })
        : face({ skin: skin[0], hair: 'short', hairC: HAIR.dark, hat: HATS.capBack('#e8402f', '#b92b22') }),
    });
    if (!umbrella) {
      o.arms = poseArms([[6.4, 10.6], [7, 13.8], [8.8, 12.8]]);
      o.hold = S('M9.8 9.9L10.5 8.1', '#e8402f', .55) + P('M8.6 10.2H10.6L10.3 13.6H8.9Z', '#dfa173', ' stroke-width="1"')
        + F('M8.7 10.9H10.5L10.4 11.6H8.8Z', '#f3d2ae') + D([[9.2, 13], [9.9, 13.1]], '#3b2626', .7)
        + P('M8.4 10.3Q9.6 9.3 10.8 10.3Z', W, ' stroke-width="1"') + D([[8.8, 12.8]], skin[0], 1.4);
    }
  }
  if (umbrella) { // the front hand holds an umbrella over the head (a kid holds it lower)
    const [c, sh] = UMBRELLAS[(v + Math.floor(v / PEOPLE)) % UMBRELLAS.length];
    o.arms = poseArms(o.kid ? [[6.3, 15.6], [7.6, 16.6], [8, 14.8]] : UMBRELLA_POSE, o.kid ? KID.swing : ADULT.swing);
    const [hx, hy] = o.kid ? [8, 14.8] : [8.5, 10.9], dy = o.kid ? 4 : 0, y = n => r1(n + dy);
    o.preArm = T(`M6 ${y(-4.4)}L${r1(hx + .1)} ${r1(hy + 1.4)}`, '#5a3a2e', .55) + T(`M${r1(hx + .1)} ${r1(hy + 1.2)}Q${r1(hx + .4)} ${r1(hy + 2.6)} ${r1(hx - .5)} ${r1(hy + 2.7)}`, '#5a3a2e', .55)
      + P(`M-1 ${y(2.2)}Q-.6 ${y(-3.4)} 6 ${y(-4)}Q12.6 ${y(-3.4)} 13 ${y(2.2)}Q11.3 ${y(1.2)} 9.5 ${y(2.2)}Q7.8 ${y(1.2)} 6 ${y(2.2)}Q4.3 ${y(1.2)} 2.5 ${y(2.2)}Q.8 ${y(1.2)}-1 ${y(2.2)}Z`, c)
      + F(`M6 ${y(-4)}L2.5 ${y(2.2)}Q4.3 ${y(1.2)} 6 ${y(2.2)}ZM6 ${y(-4)}L13 ${y(2.2)}Q11.3 ${y(1.2)} 9.5 ${y(2.2)}Z`, sh)
      + S(`M6 ${y(-4)}L2.5 ${y(2.2)}M6 ${y(-4)}V${y(2.2)}M6 ${y(-4)}L9.5 ${y(2.2)}`, sh, .45)
      + hi(`M.4 ${y(-.4)}Q1.6 ${y(-2.8)} 4.4 ${y(-3.5)}`, .7, .55) + S(`M6 ${y(-4.2)}V${y(-4.9)}`, INK, .7);
    o.hold = '';
  }
  return o;
}

// ---------------------------------------------------------------------------------------------
// Sprite kinds. draw(frame, variant, tone, idPrefix) returns the inner markup in the kind's own box.

const KINDS = {};
function kind(id, spec, draw) { KINDS[id] = { ow: 1.5, variants: 1, ...spec, draw }; }

// ----- birds -----
const SPARROWS = [
  { body: '#b0703e', shade: '#8a5230', belly: '#f2dcc0', cap: '#7a4426', bib: '#4a3328', cheek: '#fff3dc' },
  { body: '#d9772f', shade: '#a85420', belly: '#ffe0a8', cap: '#a8482a', bib: '#6a2f1a', cheek: '#fff3dc' },
  { body: '#6f8fb8', shade: '#4f6f98', belly: '#ffc79a', cap: '#4a6488', bib: '#34405a', cheek: '#fff3dc' },
];
kind('sparrow', { w: 9, h: 7.5, ax: 4.5, ay: 7.1, frames: 4, variants: 3, ow: 1.1, shift: [.5, .5] }, (f, v) => {
  const c = SPARROWS[v], beak = '#4a3a32';
  if (f === 1) { // pecking at the ground
    return S('M3.4 5.4L3.3 6.5M4.4 5.5L4.5 6.5', '#7a4426', .5) + P('M2.2 3.4L.4 1.6L.7 3.9Z', c.shade)
      + P('M1.6 3.5Q2.2 2 4.2 2.4Q6 2.8 6.1 4.6Q5.5 6 3.8 5.7Q1.8 5.2 1.6 3.5Z', c.body) + F('M3.2 5.5Q5 6 5.8 4.6L6 5.1Q5.2 6 3.8 5.9Z', c.belly)
      + P('M2.4 3.4Q3.6 2.7 5 3.5Q4.2 4.8 2.6 4.6Z', c.shade) + C(6.2, 4.6, 1.4, c.body) + F('M5 4.2Q5.6 3.1 7.2 3.7L6.6 4.2Z', c.cap)
      + P('M7.3 4.6L7.9 5.6L6.9 5.3Z', beak, ' stroke-width=".6"') + D([[6.6, 4.3]], EYE, .7) + D([[6, 5.2]], c.cheek, .8);
  }
  const wings = f === 2 ? P('M3.2 3.3L2.2.4L5 2.7Z', c.shade) : f === 3 ? P('M3.2 3.9L2.4 6.4L5 4.3Z', c.shade) : '';
  const legs = f === 0 ? S('M3.6 5.7L3.4 6.5M4.5 5.7L4.6 6.5', '#7a4426', .5) : '';
  return legs + P('M2.1 4.4L.4 3.4L.8 5.3Z', c.shade) + P('M1.8 4.2Q1.8 2.5 4 2.4Q5.9 2.5 6.1 4.3Q5.8 5.9 4 5.9Q1.9 5.8 1.8 4.2Z', c.body)
    + F('M3 5.4Q4.9 5.8 5.8 4.6L6 4.9Q5.4 6 4 6Q3.4 5.9 3 5.4Z', c.belly)
    + (f === 0 ? P('M2.4 3.7Q3.6 2.9 5 3.7Q4.2 5 2.6 4.8Z', c.shade) : '') + C(5.7, 2.7, 1.5, c.body) + F('M4.4 2.2Q5.2.9 6.9 1.9L6.2 2.4Z', c.cap)
    + D([[6.3, 2.5]], EYE, .7) + D([[5.6, 3.4]], c.cheek, .9) + F('M6.6 3.6Q6.4 4.4 5.8 4.4L6.4 3.4Z', c.bib)
    + P('M7.1 2.4L8 2.8L7.1 3.2Z', beak, ' stroke-width=".6"') + wings;
});
kind('flock-bird', { w: 6, h: 3, ax: 3, ay: 1.5, frames: 2 }, f =>
  S(f ? 'M.5 2Q1.8 1.1 3 1.7Q4.2 1.1 5.5 2' : 'M.5 .7Q1.8 .9 3 2.1Q4.2 .9 5.5 .7', '#3b2a3c', .8) + D([[3, f ? 1.8 : 2]], '#3b2a3c', 1.1));

// ----- people -----
kind('pedestrian', { w: 12, h: 26, ax: 6, ay: 25, frames: 2, variants: PEOPLE * 2 }, (f, v, tone) => walker(person(v, false, tone), f));
kind('pedestrian-umbrella', { w: 16, h: 32, ax: 8, ay: 31, frames: 2, variants: PEOPLE * 2 }, (f, v) =>
  at(2, 6, walker(person(v, true), f)));

const VENDOR_GOODS = [
  // mangoes and leaves
  (x) => P(`M${x} 18.3Q${x + .4} 16.4 ${x + 2.2} 16.6Q${x + 3.6} 15.6 ${x + 5} 17Q${x + 5.6} 17.6 ${x + 5.4} 18.3Z`, LEAF, ' stroke-width="1"')
    + E(x + 1.8, 17.4, 1.3, .9, '#f7c242', ' stroke-width="1"') + E(x + 3.7, 17.2, 1.2, .9, '#f59a3a', ' stroke-width="1"'),
  // flowers
  (x) => P(`M${x} 18.3Q${x + .2} 16.6 ${x + 2} 16.8Q${x + 3.4} 15.8 ${x + 5.2} 17.2L${x + 5.4} 18.3Z`, LEAF, ' stroke-width="1"')
    + D([[x + 1.4, 16.8], [x + 3.9, 16.4]], '#f28ab2', 1.9) + D([[x + 2.7, 15.8]], '#f7c242', 1.8),
  // boiled corn
  (x) => P(`M${x + .4} 18.3L${x + 1.6} 15.6Q${x + 2.4} 15.4 ${x + 2.6} 16.2L${x + 2.2} 18.3Z`, '#f7c242', ' stroke-width="1"')
    + P(`M${x + 2.4} 18.3L${x + 3.4} 15.4Q${x + 4.4} 15.4 ${x + 4.4} 16.4L${x + 4.4} 18.3Z`, '#f7c242', ' stroke-width="1"')
    + F(`M${x + .2} 18.3Q${x + .6} 16.8 ${x + 1.8} 17.4L${x + 2.6} 18.3ZM${x + 3.6} 18.3Q${x + 4.4} 16.6 ${x + 5.4} 17L${x + 5.4} 18.3Z`, LEAF),
];
const VENDOR_TOPS = [CL.plum, CL.teal, CL.rose];
kind('vendor', { w: 24, h: 27.5, ax: 12, ay: 26.5, frames: 2, variants: 3 }, (f, v) => {
  const swing = f ? -.4 : .4, b = f ? -.4 : 0, goods = VENDOR_GOODS[v];
  const basket = x => S(`M${x + .4} 18.4L${x + 2.6} 11.4L${x + 4.8} 18.4`, '#7a4426', .4) + goods(x)
    + P(`M${x - .2} 18.2H${x + 5.6}L${x + 5} 21.2Q${x + 2.7} 22 ${x + .4} 21.2Z`, '#d99a5e');
  const o = {
    skin: SKIN[[2, 3, 1][v]], top: VENDOR_TOPS[v], bottom: CL.black, sleeve: 'long', shoe: '#7a4426',
    face: face({ skin: SKIN[[2, 3, 1][v]][0], hair: 'bun', hairC: HAIR.black, hat: HATS.nonla() }),
    arms: poseArms([[6.4, 10.6], [7.6, 12.6], [9, 10.6]]),
    preArm: T('M-3.8 11.6Q6 9 15.8 11.6', '#b06a3b', .9),
  };
  return at(6, 1.5, lift(b, basket(-4.6 - swing)) + walker(o, f) + lift(b, basket(11 + swing)));
});
kind('officer', { w: 12, h: 26, ax: 6, ay: 25, frames: 2, variants: 2 }, (f, v) => {
  const skin = SKIN[v ? 1 : 2];
  const fa = ADULT.swing[f][1];
  return walker({
    skin, top: CL.khaki, bottom: CL.khaki, sleeve: 'long', shoe: '#2e2428',
    over: S('M4.3 15.3H8.5', '#3b3036', .8) + S('M8.6 7.2Q8.4 9.6 7.4 10.8', '#e8402f', .4),
    face: face({ skin: skin[0], hair: v ? 'bun' : 'short', hairC: HAIR.black, back: v ? 'bun' : undefined, hat: HATS.officer(CL.khaki[0], CL.khaki[1]), extra: T('M2.5 1.1H3.6', METAL, .7, 1) + C(4.1, 1.5, .8, METAL, ' stroke-width="1"') }),
    hold: S(pl([lerp(fa[0], fa[1], .25), lerp(fa[0], fa[1], .55)]), '#e8402f', 1.5),
  }, f);
});
const KID_LOOKS = [
  { top: CL.yellow, dress: true, skin: SKIN[0], hair: 'pigtails' },
  { top: CL.red, dress: false, skin: SKIN[2], stripes: true },
  { top: CL.pink, dress: true, skin: SKIN[1], hair: 'pony' },
];
kind('child-balloon', { w: 10, h: 30, ax: 5, ay: 29.3, frames: 2, variants: 3 }, (f, v) => {
  const k = KID_LOOKS[v], b = f ? KID.bob : 0, s = f ? .4 : -.4;
  const o = {
    kid: true, skin: k.skin, top: k.top, bottom: k.dress ? k.top : CL.denim, bare: true, shorts: !k.dress, skirt: k.dress, shoe: '#e8402f', sleeve: 'short',
    torso: k.dress ? 'M4.5 15.9Q4.7 14.8 5.9 14.7H7Q8.3 14.9 8.3 16.3L9.1 21.2Q6.3 22 3.5 21.2Z' : undefined,
    shade: k.dress ? 'M7.5 14.9Q8.3 15.2 8.3 16.3L9.1 21.2Q8.2 21.5 7.4 21.6Z' : undefined,
    over: k.stripes ? S('M4.6 16.6H8.2M4.5 18.2H8.2', W, .6) : '',
    arms: [[KID.swing[0][0], [[6.3, 15.6], [8, 15.2], [9.2, 13.6]]], [KID.swing[1][0], [[6.3, 15.6], [8, 15.2], [9.2, 13.6]]]],
    face: face({ skin: k.skin[0], hair: 'short', hairC: HAIR.black, back: k.hair }),
  };
  const string = S(`M${r1(5.9 + s)} 9.5Q${r1(6.4 - s)} 14 8.4 ${r1(17.8 + b)}`, '#6b5b55', .4);
  const balloon = P(`M${r1(5.9 + s)} 1.3C${r1(8.1 + s)} 1.3 ${r1(8.8 + s)} 3.1 ${r1(8.8 + s)} 4.8C${r1(8.8 + s)} 7 ${r1(7.2 + s)} 8.6 ${r1(5.9 + s)} 8.6C${r1(4.6 + s)} 8.6 ${r1(3 + s)} 7 ${r1(3 + s)} 4.8C${r1(3 + s)} 3.1 ${r1(3.7 + s)} 1.3 ${r1(5.9 + s)} 1.3Z`, '#e8402f')
    + F(`M${r1(7.6 + s)} 2.6Q${r1(8.8 + s)} 4.6 ${r1(7.8 + s)} 6.8Q${r1(7 + s)} 8 ${r1(5.9 + s)} 8.4Q${r1(8 + s)} 6 ${r1(7.6 + s)} 2.6Z`, '#b92b22')
    + P(`M${r1(5.9 + s)} 8.6L${r1(5.3 + s)} 9.6H${r1(6.5 + s)}Z`, '#b92b22', ' stroke-width="1"') + hi(`M${r1(4.2 + s)} 4Q${r1(4.4 + s)} 2.6 ${r1(5.6 + s)} 2.3`, .8, .6);
  return string + balloon + at(-.8, 4.2, walker(o, f));
});

// ----- vehicles -----
// Wheels: tyres and hubs with one shared spin mark that turns a quarter between the two frames.
const wheels = (xs, y, r, f) => xs.map(x => C(x, y, r, TYRE) + C(x, y, r1(r * .42), METAL, NO)).join('')
  + S(xs.map(x => `M${r1(x - r * .25)} ${r1(y + (f ? r : -r) * .25)}l${r1(r * .5)} ${r1((f ? -r : r) * .5)}`).join(''), METAL_D, .45);
// Spoked wheels: a thin outlined tyre, two spokes that turn between frames and a hub.
const spoked = (xs, y, r, f) => xs.map(x => C(x, y, r, 'none', ' stroke-width="2.2"') + C(x, y, r, 'none', ` stroke="${TYRE}" stroke-width="1.1"`)).join('')
  + S(xs.map(x => {
    const [a, b] = f ? [.8, .3] : [.3, .8];
    return `M${r1(x - r * a)} ${r1(y - r * b)}L${r1(x + r * a)} ${r1(y + r * b)}M${r1(x + r * b)} ${r1(y - r * a)}L${r1(x - r * b)} ${r1(y + r * a)}`;
  }).join(''), METAL_D, .35) + F(xs.map(x => ring(x, y, .7)).join(''), METAL_D);
// A rider's head (radius 2.2, facing right) under a half-face helmet.
const HELMET = 'M-2.5 1.2Q-3-2.8 0-2.9Q2.8-2.8 2.8-.6L3.4-.3H1Q-.4-.2-1 1.4Z';
const riderHead = (skin, helmet, extra = '', shine = true) => C(0, 0, 2.2, skin) + D([[1.3, .5]], EYE, .8) + extra + P(HELMET, helmet)
  + (shine ? hi('M-1.8-1.4Q-1.2-2.3-.2-2.4', .6, .6) : '');

const SCOOTERS = [
  { body: CL.sky, helmet: '#e8402f', top: CL.white, bottom: '#3f79b8', skin: SKIN[1], poncho: '#4fb3f0' },
  { body: CL.cream, helmet: '#f59a3a', top: CL.teal, bottom: '#3b3036', skin: SKIN[2], poncho: '#f7c242', box: true },
  { body: CL.red, helmet: '#f7c242', top: CL.blue, bottom: '#5d6680', skin: SKIN[3], poncho: '#f27ab0', pass: { helmet: '#f28ab2', top: '#8a4d9e', bottom: '#3f79b8', skin: SKIN[0] } },
  { body: CL.teal, helmet: '#f28ab2', top: CL.tomato, bottom: '#ef5a3c', skin: SKIN[1], poncho: '#5fc46a', mask: true },
];
// A step-through scooter seen from the left, riders in half-face helmets; ponchos in the rain, a headlight beam at night.
kind('scooter', { w: 28, h: 20, ax: 14, ay: 19.2, frames: 2, variants: SCOOTERS.length }, (f, v, tone) => {
  const s = SCOOTERS[v], p = s.pass, night = tone === 'night', rain = tone === 'rain', [bc, bs] = s.body;
  let body = (s.box ? P('M1.2 3.6H7.8V10.2H1.2Z', '#e8402f') + S('M1.2 5.2H7.8', INK, .5) + F('M2.9 7H6.1Q5.9 8.8 4.5 8.8Q3.1 8.8 2.9 7Z', '#fff3dc') : '')
    + P('M2.4 15.4Q1.6 11.4 5 10.8H12.4Q13.8 11 13.6 12.6L13.4 13.8H17.8L17.4 15.2Z', bc)
    + P('M16.6 15.2Q16.6 10.6 19.2 6.4H21Q21.2 10 23.4 11.6Q25 12.8 25 15H21.4Q20.6 13.4 19 15.2Z', bc)
    + F('M2.5 14H16.8V15.2H2.6ZM21.6 11.2Q24.6 13 24.8 15H22.6Q22.4 13 21.6 11.2Z', bs)
    + P('M4.4 10.9Q4.6 9.4 6.6 9.4H11.6Q12.8 9.6 12.6 10.9Z', '#4b3838') + E(23.1, 10.3, .8, .6, night || rain ? '#FFF1B0' : '#fff6d0', ' stroke-width="1"')
    + (night ? C(2.4, 12.3, 1.2, '#FF5A4A', `${NO}${op(.75)}`) : E(2.3, 12.3, .5, .7, '#e8402f', ' stroke-width="1"'));
  if (p && !rain) body += P('M5.6 10.6Q5.4 7 7.2 6.4H8.6Q9.6 6.8 9.6 8.4L9.2 10.6Z', p.top) + T('M7 10.2L10.2 10.8L10 13.4', p.bottom, 1.8);
  if (p) body += at(8.4, 4.2, P('M-1.6 1Q-3.4 2.4-3.3 4.8Q-2.4 4.6-1.8 3.2Z', HAIR.black) + riderHead(p.skin[0], p.helmet, '', false));
  body += rain
    ? P(p ? 'M10.6 4.6Q6.6 4.4 5 11.2L15.6 11.8L19.8 7.6Q16.8 5.8 13.4 5.2Z' : 'M10.6 4.8Q8.4 6 8 11.4L15.8 12L19.8 7.6Q16.8 5.8 13.4 5.2Z', s.poncho, ' fill-opacity=".9"')
      + hi(p ? 'M7.4 9.4Q8 6.6 10 5.6M13 9.6L16.6 8' : 'M9.4 9.6Q9.6 7 10.8 6M13 9.6L16.6 8', .6, .55)
    : P('M8.8 10.6Q8.6 6.8 10.8 6H12.4Q13.8 6.4 13.6 8.2L12.8 10.6Z', s.top[0]) + T('M10.4 10.2L14.6 10.6L15.2 13.6', s.bottom, 1.9) + T('M12.4 6.8L15.4 8L18.6 6.4', s.top[0], 1.4);
  body += D([[18.6, 6.4]], s.skin[0], 1.4) + S('M20.2 6.4L18.6 6.1', INK, 1.2)
    + at(12.8, 4, riderHead(s.skin[0], s.helmet, s.mask ? F('M.4.6Q2.2.4 2.2 1.2Q1.6 2.2.4 1.9Z', '#8fd0f3') : '', !night));
  if (night) body += F('M23.8 9.6L28 7.9V12.6L23.8 11Z', '#FFE07A', op(.45)) + C(23.3, 10.3, 2, '#FFE27A', `${NO}${op(.4)}`);
  return ground(14, 19.3, 11.6) + wheels([6.4, 22.4], 16.6, 2.6, f) + lift(f ? -.3 : 0, body);
});

// A student cycling: a schoolgirl in a white áo dài with flowers in the basket, or a pupil with a red scarf.
const BIKES = [{ frame: '#2fa59c', skin: SKIN[0], girl: true }, { frame: '#e8402f', skin: SKIN[2], girl: false }];
kind('bicycle', { w: 22, h: 21.8, ax: 11, ay: 21, frames: 2, variants: 2, shift: [0, .4] }, (f, v) => {
  const k = BIKES[v], skin = k.skin, cloth = k.girl ? CL.white : CL.navy;
  const near = f ? [[9.4, 10.2], [12.3, 13], [9.1, 15.8]] : [[9.4, 10.2], [12, 13.2], [12.1, 17.4]];
  const far = f ? [[9.2, 10.2], [12, 13.2], [12.1, 17.4]] : [[9.2, 10.2], [12.3, 13], [9.1, 15.8]];
  let out = ground(11, 20.6, 9.4) + spoked([4.6, 17.4], 16.8, 3.3, f);
  if (k.girl) out += P(f ? 'M8.6 10.4L2.8 13.6L4.4 14.6L9 11.6Z' : 'M8.6 10.4L2.4 12.6L3.6 14.2L9 11.6Z', '#f3ede6');
  out += T(pl(far), cloth[1], 1.7);
  out += T('M4.6 16.8L10.6 16.6L9.2 10.8M4.6 16.8L9.6 12.4M10.6 16.6Q12.6 15.6 15.2 10.8L17.4 16.8M15.2 10.8L15 8.8L13.8 8.6', k.frame, .9)
    + P('M7.9 10.3Q8.6 9.6 10.1 9.8L10.3 10.6H8.1Z', '#3b3036', ' stroke-width="1"') + P('M15.6 8.4H19.6L19 11.4H16.2Z', '#d99a5e')
    + (k.girl ? D([[16.6, 8.2], [18.4, 8]], '#f28ab2', 1.5) + D([[17.5, 7.6]], '#f7c242', 1.4) : F('M16 8.4H18.8V7.4H16Z', '#2f7fc1'));
  out += S(`M10.6 16.6L${near[2][0]} ${near[2][1]}`, METAL_D, .6) + P('M7.8 10.6Q7.6 6.4 9.6 5.4H10.6Q12 5.8 11.8 7.6L11.2 10.6Z', W);
  out += T(pl(near), cloth[0], 1.7) + D([near[2], far[2]], '#3b2b2b', 1.3);
  out += k.girl ? P(f ? 'M10.4 9.6L13.2 11.4L12.6 12.4L10 11.2Z' : 'M10.4 9.6L13.6 11.6L13 12.6L10 11.2Z', W) : P('M9.8 5.6L11.8 5.8L10.8 7.4Z', '#e8402f', ' stroke-width="1"');
  out += at(10.6, 3, (k.girl ? P('M-.6-2Q-3.2-1.8-3.4 1.2L-5.2 3.6Q-3 4-1.6 2.6L-.6.6Z', HAIR.black) : '')
    + C(0, 0, 2.1, skin[0]) + P(k.girl ? 'M2.1-.4Q1.9-2.5-.1-2.5Q-2.4-2.4-2.3.6L-1.6 1.6Q-1.2.2-.6-.4Q.9-.7 2.1-.4Z' : 'M2-.6Q1.8-2.4 0-2.4Q-2.3-2.3-2.2.5Q-1.9 1.5-1.2 1.2L-1-.2Q.6-.8 2-.6Z', HAIR.black)
    + D([[1.2, .3]], EYE, .8) + D([[.9, 1.2]], BLUSH, 1, op(.55)));
  return out + T('M10.2 6.2L12.2 8.4L14 8.6', W, 1.3) + D([[14, 8.6]], skin[0], 1.3);
});

kind('tricycle', { w: 31, h: 21, ax: 15.5, ay: 20.2, frames: 2, variants: 1, shift: [0, .5] }, f => {
  const skin = SKIN[3];
  const near = f ? [[6.8, 9.6], [9.8, 11.4], [8.2, 14.2]] : [[6.8, 9.6], [9.4, 12.4], [9.4, 16.4]];
  const far = f ? [[6.6, 9.6], [9.4, 12.4], [9.4, 16.4]] : [[6.6, 9.6], [9.8, 11.4], [8.2, 14.2]];
  let out = ground(15, 19.7, 13.4) + spoked([5.4, 22.4], 16.4, 2.8, f);
  out += T(pl(far), '#2a2228', 1.6) + T(`M${far[2][0] - .6} ${far[2][1]}h1.3`, '#3b2b2b', 1);
  out += T('M5.4 16.4L8.8 15.4L12.2 13.4M8.8 15.4L7 9.8M5.4 16.4L7.4 11.4M12 12.8L11.2 7.8L9.8 7.8M22.4 16.4L22.4 14', '#2f7fc1', .9)
    + P('M5.9 9.6Q6.5 9 8 9.2L8.2 10H6.1Z', '#3b3036', ' stroke-width="1"')
    + P('M11.8 12.4H29.4V14.4H11.8Z', '#b06a3b') + S('M12 13.4H29.2', '#7a4426', .45);
  out += P('M12.6 7.6Q12.8 5.4 14.6 6.2Q15.6 4.6 17 5.8Q18.8 5.6 18.8 7.6Z', LEAF) + S('M14.2 6.6L14.8 7.6M16.4 6L16.8 7.4', LEAF_D, .45)
    + P('M12.8 7.4H18.8V12.4H12.8Z', '#2f7fc1') + S('M13.6 9.2H18M13.6 10.8H18', '#22609a', .6)
    + C(20.6, 8, 1.2, '#f59a3a', ' stroke-width="1"') + C(22.5, 7.5, 1.3, '#f59a3a', ' stroke-width="1"') + C(24.1, 8.1, 1.1, '#f59a3a', ' stroke-width="1"')
    + S('M22.4 6.2L22.6 5.4', LEAF_D, .5) + P('M19.2 8.4H25.2V12.4H19.2Z', '#e8402f') + S('M20 10.4H24.4', '#b92b22', .6)
    + P('M25.6 9.8Q25.6 8.8 26.6 8.8H28.4Q29.2 9 29.2 9.8V12.4H25.6Z', '#d99a5e') + D([[26.6, 8.6], [28.1, 8.4], [27.3, 7.6]], '#e8402f', 1.5)
    + hi('M13.6 8.2H15', .6, .5);
  out += P('M5.6 10Q5.4 6.2 7.4 5.4H8.6Q9.8 5.8 9.6 7.6L9 10Z', '#ef5a3c') + F('M8.8 5.5Q9.8 5.9 9.6 7.6L9 10H8.4Z', '#c23f28');
  out += T(pl(near), '#3b3036', 1.6) + T(`M${near[2][0] - .6} ${near[2][1]}h1.3`, '#3b2b2b', 1);
  out += at(8.2, 3.8, C(0, 0, 2, skin[0]) + D([[1.2, .5]], EYE, .8) + D([[.8, 1.3]], BLUSH, 1, op(.55))
    + P('M-4.2-.6L0-3.4L4.2-.6Q0 .4-4.2-.6Z', '#f6d27a') + F('M0-3.4L4.2-.6Q2.2-.1 1-.2Z', '#d6a748') + S('M-.9-.2Q0 2.6 1.6 1.8', '#e8628f', .35));
  out += T('M8.6 6.4L10.2 8.6L10.4 7.8', '#ef5a3c', 1.3) + D([[10.2, 7.8]], skin[0], 1.3);
  return out;
});

const BUSES = [{ body: CL.yellow, stripe: '#e8402f', swoosh: '#2f8f8a' }, { body: CL.tomato, stripe: '#fff3dc', swoosh: '#f7c242' }];
const PASSENGERS = [[11.4, 10.6, 0, 0], [20.1, 10.2, 1, 1], [28.8, 10.8, 2, 2], [37.4, 10.4, 3, 0], [46, 10.7, 4, 1], [54.6, 10.3, 1, 2]];
kind('bus', { w: 78, h: 32, ax: 39, ay: 31.2, frames: 2, variants: 2 }, (f, v, tone) => {
  const k = BUSES[v], night = tone === 'night', [bc, bs] = k.body;
  const glass = night ? '#FFD36B' : '#bfe6f7';
  const bodyPath = 'M3.4 25.6V7.4Q3.4 4.2 6.6 4.2H65Q70.4 4.2 72.6 8.4L75.6 15.6Q76.6 17.8 76.6 20.4V25.6Q76.6 27.4 75 27.4H66.4A5.4 5.4 0 0 0 55.6 27.4H22.4A5.4 5.4 0 0 0 11.6 27.4H5Q3.4 27.4 3.4 25.6Z';
  let win = '', heads = ['', '', '', '', ''], hair = '', shirts = ['', '', ''];
  for (const [x, y, s, c] of PASSENGERS) {
    win += `M${r1(x - 3.4)} 8.4Q${r1(x - 3.4)} 7.4 ${r1(x - 2.4)} 7.4H${r1(x + 2.4)}Q${r1(x + 3.4)} 7.4 ${r1(x + 3.4)} 8.4V14.8H${r1(x - 3.4)}Z`;
    heads[s] += ring(x, y, 1.6);
    hair += `M${r1(x - 1.7)} ${r1(y - .2)}Q${r1(x - 1.6)} ${r1(y - 1.9)} ${r1(x)} ${r1(y - 1.9)}Q${r1(x + 1.4)} ${r1(y - 1.8)} ${r1(x + 1.6)} ${r1(y - .7)}Z`;
    shirts[c] += `M${r1(x - 2.4)} 14.8V${r1(y + 3.2)}Q${r1(x - 2.4)} ${r1(y + 1.8)} ${r1(x - 1)} ${r1(y + 1.8)}H${r1(x + 1)}Q${r1(x + 2.4)} ${r1(y + 1.8)} ${r1(x + 2.4)} ${r1(y + 3.2)}V14.8Z`;
  }
  let body = S('M66 4.2V.8', INK, .6) + P('M66 .8L60.6 1.9L66 3.1Z', '#e8402f', ' stroke-width="1"') + F('M66 2.1L62.4 1.9L66 1.2Z', '#f7c242')
    + P('M30 4.4V2.8Q30 2.2 30.6 2.2H44.4Q45 2.2 45 2.8V4.4Z', '#e3e9ee', ' stroke-width="1.2"')
    + P(bodyPath, bc) + F('M3.4 22.4H76.6V25.6Q76.6 27.4 75 27.4H66.4A5.4 5.4 0 0 0 55.6 27.4H22.4A5.4 5.4 0 0 0 11.6 27.4H5Q3.4 27.4 3.4 25.6Z', bs)
    + F('M3.4 17.2H76.2L76.5 19.6H3.4Z', k.stripe) + S('M7 21Q13 19.6 19 21T31 21T43 21', k.swoosh, 1.1)
    + P(win, glass, ' stroke-width="1.2"') + P('M65.2 7.2H70.6Q71.6 7.2 72.2 8.4L74.8 14.8H65.2Z', glass, ' stroke-width="1.2"');
  const skins = [SKIN[0][0], SKIN[1][0], SKIN[2][0], SKIN[3][0], SKIN[4][0]], tees = ['#e8402f', '#2f7fc1', '#5fae4e'];
  body += shirts.map((d, i) => d && F(d, tees[i])).join('') + heads.map((d, i) => d && F(d, skins[i])).join('') + F(hair, HAIR.black)
    + F(ring(68.2, 10.8, 1.5), SKIN[2][0]) + F('M66.6 10.6Q66.6 9.2 68.2 9.1Q69.6 9.2 69.8 10.2Z', HAIR.black) + S('M69.6 13.8L72.2 12.6', INK, .6);
  if (!night) body += hi('M9.2 13L12 8.6M17.8 13L20.6 8.6M66.6 13.6L69.4 8.4', .8, .55);
  body += E(75.4, 22.4, .9, .8, night ? '#FFF1B0' : '#fff6d0', ' stroke-width="1"') + P('M3.4 20.6H4.8V23.2H3.4Z', night ? '#FF5A4A' : '#e8402f', ' stroke-width="1"')
    + T('M72.6 26.4H76.8M3.2 26.4H6.2', METAL_D, .9) + S('M74.6 8.8L76.8 7.6', INK, .6) + hi('M7.4 5.8H60', .9, .45);
  if (night) body += C(75.6, 22.4, 2.2, '#FFE27A', `${NO}${op(.4)}`) + C(4, 21.9, 1.6, '#FF6A4A', `${NO}${op(.35)}`);
  return ground(39, 31.3, 36, .7) + wheels([17, 61], 27.8, 3.4, f) + lift(f ? -.3 : 0, body);
});

// ----- animals -----
const CATS = [
  { body: '#f2a14a', shade: '#d9822f', cream: '#fff3dc', ear: '#f7a8c8', mark: '#c9672a', eye: EYE },
  { body: '#3d3442', shade: '#2b2430', cream: '#fff3dc', ear: '#d77a9a', mark: null, eye: '#D8EA5A', sheen: '#6a5c72' },
  { body: '#fff1d4', shade: '#ead6b4', cream: '#fff1d4', ear: '#eab398', mark: null, eye: EYE, patch: ['#e9a862', '#ab8373'], collar: true },
];
const catHead = (c, x, y, flat = false) => at(x, y,
  P(flat ? 'M-1.6-1.2L-2.6-2.6L-.4-2Z' : 'M-1.8-1.4L-1.6-3.6L-.2-2.2Z', c.body, ' stroke-width="1.1"') + P(flat ? 'M.6-2.1L2.2-2.8L1.8-1Z' : 'M.4-2.2L1.8-3.6L2.2-1.2Z', c.body, ' stroke-width="1.1"')
  + C(0, 0, 2.3, c.body) + (flat ? '' : F('M-1.5-1.8L-1.4-3L-.6-2.2ZM.8-2.2L1.6-3L1.8-1.7Z', c.ear))
  + (c.patch ? F('M-2.2-.4Q-2.4-2.3-.4-2.3Q.4-1.2-.2.2Q-1.2.6-2.2-.4Z', c.patch[1]) : '')
  + (c.mark ? S('M-.6-2.1L-.4-1.2M.4-2.2L.4-1.3', c.mark, .45) : '')
  + E(1.3, .9, 1.1, .8, c.cream, NO) + D([[2.3, .5]], '#e86f9d', .7) + D([[1.1, -.4]], c.eye, .85) + D([[.4, 1.2]], BLUSH, .9, op(.5)));
kind('cat', { w: 16, h: 12, ax: 8, ay: 11.2, frames: 4, variants: 3, ow: 1.3, shift: [0, .6] }, (f, v) => {
  const c = CATS[v], legs = (d, col) => T(d, col, 1.3, 1);
  if (f === 2) { // sitting
    return ground(7.8, 10.5, 3.6) + T('M5.4 9.8Q2.8 10.2 2.6 8Q2.6 6.8 3.4 6.2', c.body, 1.2, 1)
      + P('M6 10.2Q4.4 10.2 4.6 7.6Q5 4.6 8.2 4.4Q10.6 4.6 10.8 7.4Q11 10.2 9.4 10.2Z', c.body) + F('M9.6 5.4Q10.8 6.4 10.8 7.6Q11 10.2 9.4 10.2H8.6Q10 8 9.6 5.4Z', c.shade)
      + (c.patch ? F('M5 7.4Q5.4 5.2 7.4 5Q7.8 6.8 6.4 8.4Q5.4 8.6 5 7.4Z', c.patch[0]) : '') + (c.mark ? S('M5.4 6.6L6.4 7M5.2 8L6.2 8.2', c.mark, .5) : '')
      + legs('M8.6 7.6V10.1M9.8 7.6V10.1', c.cream === c.body ? c.body : c.cream) + (c.sheen ? hi('M5.6 6.6Q6.2 5.2 7.6 4.9', .5, .4) : '')
      + (c.collar ? S('M7.8 5.3Q9.4 6.1 10.9 5.4', '#cf5547', .7) + D([[9.4, 6.2]], '#f4c459', .9) : '') + catHead(c, 9.6, 3.6);
  }
  if (f === 3) { // pouncing, mid-air
    return ground(8, 10.5, 4.6, .45) + T('M3.8 4.8Q1.9 3.8 1.3 2.3', c.body, 1.2, 1) + legs('M5.2 6.4L1.8 8.2M10.8 6.6L14 7.8', c.shade)
      + P('M3.4 5.2Q3.6 3.4 6 3.4H10Q12.2 3.6 12 5.6Q11.6 7.2 9.8 7.2H5.4Q3.4 7.2 3.4 5.2Z', c.body) + F('M5.4 7.2H9.8Q11.4 7.2 11.9 5.8Q10.6 6.6 5.6 6.6Z', c.shade)
      + (c.patch ? F('M5.4 3.5H8.2Q8.2 5.2 6.4 5.6Q4.8 5.4 5.4 3.5Z', c.patch[0]) : '') + (c.mark ? S('M6.4 3.6L6.2 4.6M8 3.6L7.8 4.6M9.6 3.6L9.4 4.4', c.mark, .5) : '')
      + legs('M5.8 6.8L2.4 8.8M11.2 6.8L14.6 8.6', c.cream === c.body ? c.body : c.cream) + catHead(c, 12.8, 3.6, true);
  }
  const s = f ? -1 : 1, bob = f ? -.2 : 0;
  return ground(8, 10.5, 5) + lift(bob, T(f ? 'M3.8 5.6Q1.4 5.4 1.4 2.6Q1.6 1 2.8 1.2' : 'M3.8 5.6Q1.2 5 1.6 2.2Q2 .9 3.2 1.3', c.body, 1.2, 1))
    + legs(`M5.2 7.4L${5.2 + s} 10.1M10.6 7.4L${10.6 - s} 10.1`, c.shade)
    + lift(bob, P('M3.6 6.6Q3.4 4 6.4 4H10.2Q12.2 4.2 12.2 6.4Q12 8.2 10.4 8.2H5.4Q3.8 8.2 3.6 6.6Z', c.body)
      + F('M5.4 8.2H10.4Q11.8 8.2 12.1 6.8Q10.6 7.6 5.6 7.6Z', c.shade)
      + (c.patch ? F('M5.2 4.1H8.6Q8.6 6 6.6 6.4Q4.6 6.2 5.2 4.1Z', c.patch[0]) + F('M9.6 4.1H11Q11.6 5.2 10.6 5.8Q9.4 5.4 9.6 4.1Z', c.patch[1]) : '')
      + (c.mark ? S('M6.4 4.2L6.2 5.2M8 4.1L7.8 5.2M9.6 4.2L9.4 5.1', c.mark, .55) : '') + (c.sheen ? hi('M5 5Q6 4.3 8 4.4', .5, .4) : ''))
    + legs(`M5.8 7.6L${5.8 - s} 10.1M11 7.6L${11 + s} 10.1`, c.cream === c.body ? c.body : c.cream)
    + lift(bob, (c.collar ? S('M11.4 5.4Q12.4 6.6 13.6 6.4', '#cf5547', .7) + D([[12.6, 6.6]], '#f4c459', .9) : '') + catHead(c, 12.8, 4.2));
});
kind('dog', { w: 15, h: 13, ax: 7.5, ay: 12.4, frames: 2, variants: 1, ow: 1.3 }, f => {
  const body = '#e8a25c', shade = '#c98242', cream = '#fff1d9';
  const tail = f ? 'M4.8 8.4Q1.4 8.6 1.4 5.6Q1.6 3.8 3.4 4.2Q3.8 5.6 3 6.2' : 'M4.6 8.2Q2 7.6 2.4 5Q2.8 3.4 4.6 3.8Q4.8 5.2 4 5.8';
  return ground(7.4, 12.5, 4.8) + T(tail, body, 1.4, 1)
    + P('M3.6 12.2Q2.8 8.4 5.6 6.6L8.6 5.4Q10.6 5.6 10.4 8.4L10.2 12.2Z', body) + F('M8.4 6.2Q10.4 6.6 10.2 9L10 12.2H8.4Q8.8 9 8.4 6.2Z', cream)
    + P('M3.4 12.2Q3.2 9 5.6 8.8Q7.6 9 7.4 12.2Z', body) + F('M5.6 12.2Q7.2 11.8 7.4 10.4Q7.5 11.4 7.4 12.2Z', shade)
    + T('M6.4 12h1.2', cream, 1, 1) + T('M9.2 9V11.9M10.2 9V11.9', cream, 1.1, 1)
    + S('M8.8 6.8Q10 7.6 11.4 6.8', '#3f8f7a', .9) + D([[10.2, 7.6]], '#f4c459', .9)
    + at(10.2, 4.4, P('M-1.8-1.2L-1.6-3.8L.2-2.4Z', body, ' stroke-width="1.1"') + P('M.6-2.4L2.4-3.6L2.4-1Z', body, ' stroke-width="1.1"')
      + C(0, 0, 2.5, body) + F('M-1.4-1.6L-1.3-3L-.2-2.2ZM1-2.2L2-3L2-1.6Z', '#f3c7a4')
      + P('M1.2.4Q3.6 0 3.6 1.2Q3.2 2.4 1.4 2.2Q.6 1.4 1.2.4Z', cream, ' stroke-width="1"') + F('M-1.6 1.6Q-.6 2.6 1.4 2.2Q-.4 1.2-1.6 1.6Z', cream)
      + D([[3.4, .7]], EYE, 1) + D([[.9, -.6]], EYE, .9) + D([[.6, -1.4], [1.6, -1.2]], cream, .6) + D([[.3, .8]], BLUSH, .9, op(.5))
      + (f ? P('M2.2 2.1Q2.4 3.4 3 3.2Q3.4 2.8 3 2Z', '#f28ab2', ' stroke-width="1"') : ''));
});
kind('hamster', { w: 8, h: 6.2, ax: 4, ay: 5.8, frames: 2, ow: 1, shift: [0, .2] }, f => {
  const dx = f ? .3 : 0, dy = f ? -.3 : 0;
  return ground(4, 5.65, 3, .35) + D(f ? [[2.4, 5.4], [5.8, 5.3]] : [[3, 5.4], [5.2, 5.4]], '#f7a8b8', .9)
    + at(dx, dy, P('M1 4.4Q.8 1.6 3.6 1.4Q6.6 1.4 7 3.8Q7.2 5.4 5.6 5.4H2.2Q1 5.4 1 4.4Z', '#f2b47c') + F('M4.4 5.4Q6.4 5.2 6.6 3.8Q7 5.2 5.6 5.4Z', '#d99560')
      + F('M3.4 5.3Q4 3.6 5.8 3.8Q6.6 4.6 6 5.3Z', '#fff4e3') + C(4.4, 1.5, .8, '#f2b47c', ' stroke-width="1"') + D([[4.4, 1.6]], '#f7c9b8', .7)
      + D([[5.9, 2.8]], EYE, .8) + D([[7, 3.4]], '#e86f9d', .6) + D([[5.6, 3.8]], '#f2a08b', .8, op(.7)));
});
kind('rat', { w: 10.4, h: 5.5, ax: 5.2, ay: 5, frames: 2, ow: 1, shift: [0, .4] }, f => {
  const body = f ? 'M2.4 3.4Q2.6.6 5.4.8Q7.6 1 8.6 2.4L9.6 3Q9.2 3.6 8.2 3.6L3.2 3.9Q2.4 3.9 2.4 3.4Z' : 'M2.2 3.2Q2.4 1.2 5.4 1.2Q7.4 1.2 8.6 2.5L9.6 3Q9.2 3.6 8.2 3.6L3 3.9Q2.2 3.8 2.2 3.2Z';
  return ground(5.4, 4.65, 3.6, .3) + S(f ? 'M2.6 3.3Q.6 3.8.5 2' : 'M2.4 3.3Q.8 3.4.5 1.6', '#d99a9a', .5)
    + D(f ? [[4.6, 4.3], [6.4, 4.3]] : [[3, 4.3], [8.2, 4.2]], '#e8a0a8', .8)
    + P(body, '#8c7b70') + F('M3.6 3.8Q5.6 3 8.2 3.5Q6 3.9 3.6 3.8Z', '#c9b8aa') + C(6.8, f ? 1 : 1.3, .8, '#8c7b70', ' stroke-width="1"')
    + D([[6.8, f ? 1.1 : 1.4]], '#e8a0a8', .6) + D([[7.9, f ? 2 : 2.2]], EYE, .6) + D([[9.5, 3]], '#e86f9d', .5);
});

// ----- sky and air -----
const KITES = [['#e8402f', '#f7c242'], ['#2f7fc1', '#fff3dc'], ['#5fae4e', '#f59a3a']];
kind('kite', { w: 14, h: 18, ax: 7, ay: 5.2, frames: 1, variants: 3, ow: 1.2 }, (f, v) => {
  const [a, b] = KITES[v];
  return S('M7 12.4Q8.4 13.6 7 14.8T6.6 17.4', INK, .45) + P('M6.2 14.2L7.8 13.4L7.6 15L6.4 14.4Z', b, ' stroke-width="1"') + P('M5.8 16.4L7.4 15.9L7.2 17.4Z', a, ' stroke-width="1"')
    + P('M7 .8L13 5.2L7 12.4L1 5.2Z', a) + F('M7 .8L13 5.2H7ZM7 5.2V12.4L1 5.2Z', b) + S('M7 .8V12.4M1 5.2H13', mix(INK, a, .3), .4)
    + hi('M3.2 4.4L6.2 2.2', .6, .6);
});
kind('moth', { w: 3.6, h: 3.6, ax: 1.8, ay: 1.8, frames: 2, ow: 1, shift: [.3, .3] }, f =>
  P(f ? 'M1.5 1.4L.9.3Q.5 1.4 1.1 2.2ZM1.5 1.4L2.1.3Q2.5 1.4 1.9 2.2Z' : 'M1.5 1.5L.3.7Q0 1.8.8 2.5ZM1.5 1.5L2.7.7Q3 1.8 2.2 2.5Z', '#FFF0C8') + S('M1.5 1V2.4', '#8a6a52', .45));
kind('gecko', { w: 11, h: 4, ax: 5.5, ay: 2, frames: 1, ow: 1 }, () =>
  T('M4.6 1.7L4 1M4.6 2.3L4 3M8 1.6L8.6 1M8 2.4L8.6 3', '#e7c7a2', .6, 1) + D([[3.8, .9], [3.8, 3.1], [8.8, .9], [8.8, 3.1]], '#c9a07c', .9)
  + P('M3.4 2Q2 1.4.6 2.4Q2 2.7 3.4 2.5Z', '#e7c7a2', ' stroke-width="1"') + P('M3 2Q4.6 1 7.4 1.3L9.4 1.5Q10.6 2 9.4 2.5L7.4 2.7Q4.6 3 3 2Z', '#e7c7a2')
  + D([[5, 2], [6.4, 1.8], [7.4, 2.2]], '#b98d6a', .55) + D([[9.6, 1.6], [9.6, 2.4]], EYE, .5));
const LEAVES = [[LEAF, LEAF_D, '#a4dc8a'], ['#f7c242', '#c99420', '#ffe7a0'], ['#b06a3b', '#7a4426', '#d99a5e']];
kind('leaf', { w: 5, h: 4, ax: 2.5, ay: 2, frames: 1, variants: 3, ow: 1 }, (f, v) => {
  const [c, s, l] = LEAVES[v];
  return P('M.5 3.4Q.7.7 4.5.5Q4.2 3.3.5 3.4Z', c) + F('M.5 3.4Q4 3.4 4.5.5Q3.8 2.8.5 3.4Z', s) + S('M.6 3.3L3.4 1.4', l, .4);
});
kind('petal', { w: 3.4, h: 3.4, ax: 1.7, ay: 1.7, frames: 1, ow: 1, shift: [.2, .2] }, () =>
  P('M1.5.4Q2.8 1 2.6 2.3Q1.5 2.8.4 2.3Q.2 1 1.5.4Z', '#e0338f') + S('M1.5 1V2.2', '#f78cc4', .35));
kind('raindrop', { w: 1.4, h: 4, ax: .7, ay: 2, frames: 1, ow: 0 }, () =>
  `<path d="M.7.2Q1.25 2 1.2 2.9A.5.5 0 0 1 .2 2.9Q.15 2 .7.2Z" fill="#DCEEFA" stroke="#9EC3E0" stroke-width=".25"${op(.9)}/>` + D([[.55, 2.6]], W, .3));
// A crown splash: the ring and droplets catch the light of the hour (cool at night, warm at dusk).
const SPLASH_TONES = { day: '#EAF4FC', dusk: '#FFE8DA', night: '#D2E2FF', rain: '#DCEBF7' };
kind('splash', { w: 7, h: 3.4, ax: 3.5, ay: 2.6, frames: 2, ow: 0 }, (f, v, tone) => {
  const c = SPLASH_TONES[tone];
  return f ? E(3.5, 2.5, 3, .45, 'none', ` stroke="${c}" stroke-width=".5" opacity=".85"`) + D([[.6, 1.5], [6.4, 1.5], [2.2, .7], [4.8, .7]], c, .6, op(.9))
    : E(3.5, 2.5, 1.8, .4, 'none', ` stroke="${c}" stroke-width=".5" opacity=".85"`) + S('M2 2.1L1.4 1M3.5 1.9V.7M5 2.1L5.6 1', c, .45, op(.9)) + D([[1.3, .6], [3.5, .3], [5.7, .6]], c, .6, op(.9));
});

const CLOUD_TONES = {
  day: ['#FFFFFF', '#D8ECFA'], dusk: ['#FFD3B4', '#F4A0A6'], night: ['#3A4D82', '#2A3A66'], rain: ['#9AA6B5', '#7F8CA0'],
};
const CLOUDS = [
  ['M4 17A6 6 0 0 1 9.4 9.2A9 9 0 0 1 24.4 4.6A11 11 0 0 1 42.6 5.4A8 8 0 0 1 52.8 10.6A5.6 5.6 0 0 1 56.4 17Z', 'M6 17Q30 12.4 54.4 17Z', 'M12 8.8Q15 5.6 20 5.4'],
  ['M2.6 17.2A5 5 0 0 1 7.4 11A7 7 0 0 1 18.6 8.2A10 10 0 0 1 36 7.6A7.6 7.6 0 0 1 49 9.6A6.6 6.6 0 0 1 57.4 17.2Z', 'M4.6 17.2Q30 13 55.4 17.2Z', 'M10 10.4Q13 7.8 17 8'],
  ['M8 17.6A7 7 0 0 1 13 8.4A10 10 0 0 1 29.4 2.6A9.6 9.6 0 0 1 45 7.4A7.4 7.4 0 0 1 52.6 17.6Z', 'M10 17.6Q30 12.6 50.6 17.6Z', 'M16 7.6Q19.6 3.8 25 3.6'],
];
kind('cloud', { w: 60, h: 22, ax: 30, ay: 11, frames: 1, variants: 3, ow: 0, shift: [0, 1.2] }, (f, v, tone) => {
  const [base, shade] = CLOUD_TONES[tone], [d, sh, h] = CLOUDS[v];
  const line = mix(shade.toLowerCase(), INK, tone === 'night' ? .2 : .35).toUpperCase();
  return P(d, base, ` stroke="${line}" stroke-width="1.5"`) + F(sh, shade) + (tone === 'day' || tone === 'dusk' ? S(h, '#FFFFFF', 1.2, op(.7)) : '');
});
kind('sparkle', { w: 5.2, h: 5.2, ax: 2.6, ay: 2.6, frames: 1, ow: 1, shift: [.1, .1] }, () => P(star4(2.5, 2.5, 2.1, .2), '#FFE066') + D([[2.5, 2.5]], '#FFFDF0', .9));
// A shooting star: a bright head and a tail that fades in three steps; strongest at night.
kind('shooting-star', { w: 44, h: 7, ax: 41.2, ay: 4.9, frames: 1, ow: 0 }, (f, v, tone) => {
  const body = F('M1 .9L41.2 3.8V6Z', '#FFF3C4', op(.2)) + F('M14 2.2L41.2 3.6V6.1Z', '#FFF3C4', op(.3)) + F('M28 3.2L41.2 3.5V6.2Z', '#FFF6D6', op(.5))
    + C(41.2, 4.9, 1.9, '#FFE27A', `${NO}${op(.55)}`) + P(star4(41.2, 4.9, 1.9, .25), '#FFFFFF', ' stroke="#E9C46A" stroke-width=".4"');
  const strength = { day: .55, dusk: .8, night: 1, rain: .45 }[tone];
  return strength < 1 ? `<g${op(strength)}>${body}</g>` : body;
});
kind('flash', { w: 18, h: 18, ax: 9, ay: 9, frames: 1, ow: 1.2 }, () =>
  P(burst(9, 9, 8.4, 4, 8), '#FFE066') + F(burst(9, 9, 5.6, 2.6, 8, 1 / 16), '#FFFBEA') + C(9, 9, 2.2, '#FFFFFF', NO));
const SMOKES = [
  'M2.4 9.6A2.6 2.6 0 0 1 3.4 4.8A3.4 3.4 0 0 1 9.6 3.8A2.8 2.8 0 0 1 12.2 8.6A2 2 0 0 1 10.6 10.6H3.6A1.6 1.6 0 0 1 2.4 9.6Z',
  'M1.8 9.4A2.2 2.2 0 0 1 3 5.6A2.8 2.8 0 0 1 7.4 3.4A3.2 3.2 0 0 1 12.4 6.6A2 2 0 0 1 12 10.4H3.2A1.5 1.5 0 0 1 1.8 9.4Z',
];
kind('smoke', { w: 14.4, h: 12, ax: 7.2, ay: 6, frames: 1, variants: 2, ow: 0 }, (f, v) =>
  P(SMOKES[v], v ? '#cfc8c6' : '#e9e4e2', ` stroke="#9d908c" stroke-width=".9"${op(.92)}`) + F(v ? 'M3 10.4Q7 8.6 12 10.4Z' : 'M3.6 10.6Q7.4 8.8 10.8 10.6Z', v ? '#b3aaa8' : '#cdc5c2', op(.9))
  + hi(v ? 'M3.4 6.4Q4.6 4.6 6.6 4.4' : 'M4 5.6Q5.4 4.2 7.6 4.2', .7, .6));
const BALLOONS = [CL.red, CL.yellow, CL.sky];
kind('balloon', { w: 8, h: 12, ax: 4, ay: 4.6, frames: 1, variants: 3, ow: 1.2 }, (f, v) => {
  const [c, s] = BALLOONS[v];
  return S('M4 9.6Q3.4 10.6 4.2 11.6', '#6b5b55', .4) + P('M4 .6C6.4.6 7.3 2.6 7.3 4.4C7.3 6.8 5.4 8.6 4 8.6C2.6 8.6.7 6.8.7 4.4C.7 2.6 1.6.6 4 .6Z', c)
    + F('M5.8 1.8Q7.4 3.8 6.4 6.2Q5.6 7.8 4 8.4Q6.6 5.6 5.8 1.8Z', s) + P('M4 8.6L3.4 9.6H4.6Z', s, ' stroke-width="1"') + hi('M2.2 4Q2.3 2.4 3.6 1.9', .8, .65);
});
kind('lamp-glow', { w: 40, h: 40, ax: 20, ay: 20, frames: 1, ow: 0 }, (f, v, tone, id) => {
  const strength = { day: .45, dusk: .75, night: 1, rain: .8 }[tone];
  return `<defs><radialGradient id="${id}g"><stop offset="0" stop-color="#FFE7A0" stop-opacity=".85"/><stop offset=".45" stop-color="#FFC861" stop-opacity=".35"/><stop offset="1" stop-color="#FFB84A" stop-opacity="0"/></radialGradient></defs>`
    + `<circle cx="20" cy="20" r="20" fill="url(#${id}g)"${NO}${strength < 1 ? op(strength) : ''}/>`;
});
const FLAGS = ['#e8402f', '#f7c242', '#5fae4e', '#2f7fc1', '#f28ab2', '#f59a3a'];
kind('bunting', { w: 180, h: 14, ax: 90, ay: 1.2, frames: 1, variants: 2, ow: 1 }, (f, v) => {
  const n = 19, by = new Map();
  for (let i = 0; i < n; i++) {
    const t = (i + .5) / n, x = 1 + 178 * t, y = 1.2 + 2 * t * (1 - t) * 8.4, k = (i + v * 3) % FLAGS.length; // on the sagging line
    const slope = (1 - 2 * t) * 8.4 * 2 / 178, dx = 2.9, dy = slope * dx;
    by.set(k, (by.get(k) || '') + `M${r1(x - dx)} ${r1(y - dy)}L${r1(x + dx)} ${r1(y + dy)}L${r1(x + .3)} ${r1(y + 6.6)}Z`);
  }
  return S('M1 1.2Q90 9.6 179 1.2', INK, .6) + [...by].map(([k, d]) => P(d, FLAGS[k])).join('');
});
kind('paper-plane', { w: 9.2, h: 5, ax: 4.6, ay: 2.5, frames: 1, ow: 1 }, () =>
  P('M.5.6L8.6 2L3 2.4Z', W) + P('M3 2.4L8.6 2L2.2 4.4Z', '#d8e2ea') + S('M3 2.4L8.6 2', '#b8c4ce', .35));
kind('zz', { w: 7.6, h: 7.6, ax: 3.8, ay: 3.8, frames: 1, ow: 0, shift: [.2, .3] }, () => {
  const d = 'M.8 3.6H3.6L.8 6.3H3.6M4.4.8H6.2L4.4 2.6H6.2';
  return S(d, '#FFF3DC', 2) + S(d, INK, .9);
});
kind('heart', { w: 6.2, h: 6, ax: 3.1, ay: 3, frames: 1, ow: 1.2, shift: [.1, 0] }, () =>
  P('M3 5.4C1.3 4.3.5 3.1.5 2.1A1.3 1.3 0 0 1 3 1.5A1.3 1.3 0 0 1 5.5 2.1C5.5 3.1 4.7 4.3 3 5.4Z', '#E8402F')
  + F('M4.6 1.6Q5.6 2.4 5 3.4Q4.2 4.5 3 5.2Q4.6 3.6 4.6 1.6Z', '#B92B22') + D([[1.6, 2.2]], '#FFFFFF', .7, op(.75)));

export const LIFE_KINDS = Object.freeze(Object.keys(KINDS));
export const LIFE_SPRITE_INFO = Object.freeze(Object.fromEntries(Object.entries(KINDS).map(([id, k]) =>
  [id, Object.freeze({ w: k.w, h: k.h, ax: k.ax, ay: k.ay, frames: k.frames, variants: k.variants })])));

/** One frame of a living-street sprite. Throws on an unknown kind or frame; variants wrap; unknown tones are 'day'. */
export function lifeSprite(kind, options) {
  const { frame = 0, variant = 0, tone = 'day', idPrefix } = options || {};
  const k = Object.hasOwn(KINDS, kind) ? KINDS[kind] : null;
  if (!k) throw new Error(`lifeSprite: unknown kind "${kind}"`);
  if (!Number.isInteger(frame) || frame < 0 || frame >= k.frames) throw new Error(`lifeSprite: ${kind} has no frame ${frame}`);
  const t = TONES.includes(tone) ? tone : 'day', v = wrap(variant, k.variants);
  const prefix = idPrefix != null && idPrefix !== '' ? cleanId(idPrefix) : `life-${kind}-${t}-${v}-`;
  const root = k.ow ? `<g fill="none" stroke="${INK}" stroke-width="${k.ow}" stroke-linecap="round" stroke-linejoin="round" paint-order="stroke">` : '<g fill="none" stroke-linecap="round" stroke-linejoin="round">';
  const art = k.draw(frame, v, t, prefix), body = k.shift ? G(`translate(${k.shift[0]} ${k.shift[1]})`, art) : art;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${k.w} ${k.h}" aria-hidden="true">${root}${body}</g></svg>`;
  return { svg: minify(toned(svg, t)), w: k.w, h: k.h, ax: k.ax, ay: k.ay };
}

// ---------------------------------------------------------------------------------------------
// The romance medallion: the noodle cook and the broth cook under a badge that marks how far their story has come.

const embedFace = (id, prefix, x, y, size) => {
  const inner = staffFace(id, { idPrefix: prefix }).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  return `<g transform="translate(${x} ${y}) scale(${r1(size / 80 * 1000) / 1000})">${inner}</g>`;
};
const BADGES = [
  // a red heart
  () => P('M40 23.4C34.2 19.8 31.2 16.4 31.2 13.2A4.4 4.4 0 0 1 40 11.4A4.4 4.4 0 0 1 48.8 13.2C48.8 16.4 45.8 19.8 40 23.4Z', '#e8402f')
    + F('M45.6 9.6Q49.2 10.8 48.6 14.4Q47.6 18.4 40.6 23Q46.2 17.6 45.6 9.6Z', '#b92b22') + S('M33.8 12.6Q34.4 10.6 36.4 10.4', W, 1.4, op(.6)),
  // a lacquered betrothal tray (mâm quả): red cloth over the gifts, a round box, betel leaf and areca nut
  () => P('M30.6 22.6Q31 26.4 40 26.4Q49 26.4 49.4 22.6Z', '#7a2418') + E(40, 22.6, 9.6, 1.8, '#a8321f', ' stroke-width="1.4"') + S('M31.4 23.4Q40 25.2 48.6 23.4', '#f7c242', .9)
    + P('M32.8 22.8Q32.4 13.8 40 12.8Q47.6 13.8 47.2 22.8Q40 24 32.8 22.8Z', '#e8402f') + F('M42.6 13.4Q47.6 15.4 47.2 22.8Q45.6 23.2 44 23.3Q45 17.6 42.6 13.4Z', '#b92b22')
    + S('M33.2 20.4Q40 19 46.8 20.4', '#f7c242', 1.1) + S(ring(40, 16.6, 1.9), '#f7c242', .8) + D([[40, 11.8]], '#f7c242', 2.6)
    + P('M44.8 19.4H50.2V23.2Q47.5 24.6 44.8 23.2Z', '#c9372a', ' stroke-width="1.4"') + E(47.5, 19.4, 2.7, 1, '#f7c242', ' stroke-width="1.2"')
    + P('M30 23.6Q28.4 19.8 31.4 17.8Q34.4 19.6 33.6 22.8Q32 24 30 23.6Z', LEAF, ' stroke-width="1.4"') + S('M30.4 23.2Q31.4 20.4 31.4 18.4', '#a4dc8a', .5)
    + E(35.6, 22.6, 1.5, 1.9, '#a8d84e', ' stroke-width="1.2"') + S('M35.6 20.7V20', LEAF_D, .7) + hi('M35.2 15.8Q36.2 14 38.2 13.6', 1, .5),
  // two interlocked gold rings and a tiny pink star
  () => {
    const a = 'M30.6 16.2a5.6 5.6 0 1 0 11.2 0a5.6 5.6 0 1 0-11.2 0', b = 'M38.2 16.2a5.6 5.6 0 1 0 11.2 0a5.6 5.6 0 1 0-11.2 0';
    return S(a, INK, 4) + S(a, '#f7c242', 2.2) + S(b, INK, 4) + S(b, '#f7c242', 2.2)
      + S('M41.5 14.4A5.6 5.6 0 0 0 40 11.4', INK, 4) + S('M41.7 14.6A5.6 5.6 0 0 0 40.2 11.6', '#f7c242', 2.2)
      + P('M43.8 8.2L45.2 9.8L43.8 11.2L42.4 9.8Z', '#fff3dc', ' stroke-width="1.2"') + hi('M32.4 14Q33.2 11.6 35.6 11', .9, .6)
      + P(star4(50.4, 8, 2.6, .25), '#f28ab2', ' stroke-width="1.2"');
  },
];
/** The romance medallion (viewBox 0 0 80 80): stage 0 a heart, 1 a betrothal tray, 2 wedding rings. */
export function romanceMedallion(stage, options) {
  const { idPrefix } = options || {};
  const s = Math.max(0, Math.min(2, Math.trunc(Number(stage)) || 0));
  const prefix = idPrefix != null && idPrefix !== '' ? cleanId(idPrefix) : `romance-${s}-`;
  const dots = [];
  for (let i = 0; i < 12; i++) { const a = (i + .5) / 12 * Math.PI * 2; dots.push([40 + Math.sin(a) * 35.6, 40 - Math.cos(a) * 35.6]); }
  const body = C(40, 40, 38.2, '#ffd6e4') + C(30, 28, 26, W, `${NO}${op(.3)}`)
    + C(40, 40, 37, 'none', ' stroke="#f28ab2" stroke-width="2.4"') + C(40, 40, 33.6, 'none', ' stroke="#e8628f" stroke-width="1.1"')
    + D(dots, '#fff3dc', 1.2) + C(40, 40, 38.6, 'none', ' stroke-width="1.6"')
    + embedFace('broth', `${prefix}broth-`, 33.5, 31, 42) + embedFace('chef', `${prefix}chef-`, 4.5, 31, 42)
    + C(40, 16.4, 11.6, '#fff3dc', ' stroke-width="1.6"') + C(40, 16.4, 9.8, 'none', ' stroke="#f28ab2" stroke-width=".9"')
    + G('translate(0 .6)', BADGES[s]());
  return minify(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" class="romance-medallion romance-stage-${s}" aria-hidden="true"><g fill="none" stroke="${INK}" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`);
}

// ---------------------------------------------------------------------------------------------
// Prank and favour icons for story dialogs (viewBox 0 0 64 64): a round coloured sticker with the object on it.

const ICONS = {
  rat: () => ['#8fd3a7', '#5fae7e',
    T('M42 49Q54 51 52.4 41Q51 34 56.4 32', '#e8a0a8', 1.8, 2.6)
    + P('M20 52.4Q17.4 38 32 37.4Q46.6 38 44 52.4Z', '#8c7b70') + F('M38.4 38.6Q46.4 41.4 44 52.4H38.6Q42.4 45 38.4 38.6Z', '#6e5f56')
    + F('M25 52.4Q26 44.6 32 44.6Q38 44.6 39 52.4Z', '#c9b8aa') + E(25, 52.8, 3.8, 1.9, '#f2a0a8') + E(39.4, 52.8, 3.8, 1.9, '#f2a0a8')
    + P('M24.8 46.4Q31.6 52.8 40.4 44.8Q41.6 48 37.8 50.4Q31.2 54 24.8 46.4Z', '#e8402f', ' stroke-width="3"') + S('M40.2 44.8Q41.8 42.2 44.2 42.8', LEAF_D, 1.8)
    + C(29.2, 47, 2, '#f2a0a8', ' stroke-width="2.4"') + C(36.2, 46.4, 2, '#f2a0a8', ' stroke-width="2.4"') + hi('M27.4 48.6Q30 50.4 33 50.4', 1.2, .55)
    + C(19, 20.4, 7.4, '#8c7b70') + C(45, 20.4, 7.4, '#8c7b70') + C(19, 20.4, 4, '#f2a0a8', NO) + C(45, 20.4, 4, '#f2a0a8', NO)
    + P('M15 31Q14.4 18.6 32 18.2Q49.6 18.6 49 31Q48.4 41.2 32 41.2Q15.6 41.2 15 31Z', '#8c7b70') + F('M41 19.8Q49.4 23 49 31Q48.6 38.6 40 40.6Q45.4 32 41 19.8Z', '#6e5f56')
    + S('M22.4 28.6Q25 25.8 27.6 28.6', INK, 2.2) + C(38.4, 27.6, 2.7, EYE, NO) + C(39.3, 26.6, 1, W, NO)
    + C(32.2, 33.6, 2.3, '#e86f9d', ' stroke-width="1.8"') + S('M26.4 35.8Q32.2 40.4 38 35.8', INK, 1.8) + P('M30.4 37.8H34V40.8H30.4Z', W, ' stroke-width="1.4"')
    + S('M23.4 33.6L15.6 31.8M23.4 35.6L16.2 37.6M41 33.6L48.6 31.8M41 35.6L48 37.6', INK, 1.1) + C(23.4, 34, 2.6, BLUSH, `${NO}${op(.6)}`) + C(41.2, 33.8, 2.4, BLUSH, `${NO}${op(.6)}`)
    + hi('M19.6 29.6Q21.4 23.8 27.4 22.6', 1.6, .5)],
  drunk: () => ['#f7c242', '#c99420',
    P('M16 36Q15 20 31 18Q47 17 48 33Q49 48 32 49Q17 50 16 36Z', SKIN[1][0]) + F('M42 21Q49 27 48 35Q47 46 36 48.6Q44 40 42 21Z', SKIN[1][1])
    + G('rotate(-16 32 18)', P('M17 20Q18 8 32 8Q46 8 47 20Z', '#7f9a45') + P('M12 20.6H52Q51.6 24 48 24H16Q12.4 24 12 20.6Z', '#5f7a30') + hi('M22 15Q24 11 29 10.4', 1.6, .5))
    + S('M21 32Q24 29 27 32M34.4 31Q37.4 28 40.4 31', INK, 2.2) + C(24, 38, 3.6, '#ef5a3c', `${NO}${op(.55)}`) + C(41, 37, 3.6, '#ef5a3c', `${NO}${op(.55)}`)
    + C(32.6, 36.6, 3, '#ef5a3c', ' stroke-width="1.6"') + S('M27 43Q31 46 36.6 42.6', INK, 2)
    + C(50, 20, 4.2, '#dff3ff', ' stroke-width="1.6"') + C(55, 11, 2.8, '#dff3ff', ' stroke-width="1.4"') + C(47.6, 9.6, 1.8, '#dff3ff', ' stroke-width="1.2"')
    + hi('M48.4 18.6Q49 17.4 50.4 17.2', 1.1, .8) + S('M10.6 44Q8.4 41 11 39Q13.6 38.6 13 41.4', INK, 1.6)],
  sidewalk: () => ['#6cc3ef', '#3f97c9',
    P('M12 50H36L34 46H14Z', '#3b3036') + P('M18.6 14Q24 11 29.4 14L34 46H14Z', '#f59a3a') + F('M26 13Q29 13.6 29.4 14L34 46H29Q28 28 26 13Z', '#c9672a')
    + F('M17.2 24H30.8L31.6 30H16.4ZM15.6 36H32.4L33.2 41H14.8Z', '#fff3dc') + hi('M19.6 18L17.6 40', 1.6, .5)
    + T('M37 42.4Q30.6 50.6 38.4 55', '#e8402f', 1.6, 2.4)
    + P('M53.6 29.4H42.4A7.2 7.2 0 1 0 49.4 35.6H53.6Z', METAL) + F('M36 39.4A7.2 7.2 0 0 0 49.2 37.4Q43 43.2 36 39.4Z', METAL_D)
    + F('M44.4 29.4H48.4V31.6H44.4Z', '#3b3036') + C(37.2, 41.6, 1.7, METAL, ' stroke-width="2.4"') + hi('M37.4 33.6Q38.6 30.6 41.6 30.2', 1.4, .75)
    + T('M56.4 27.2L58.4 25M57 32.4H59.8M56.4 37.4L58.4 39.6', W, 1.4, 2.2)],
  haggler: () => ['#ef5a3c', '#c23f28',
    S('M24 18Q18 10 26 8', INK, 1.4) + P('M18 26L30 14H50Q52 14 52 16V44Q52 46 50 46H30L18 34Q16 30 18 26Z', '#f7c242') + F('M45 14H50Q52 14 52 16V44Q52 46 50 46H45Z', '#c99420')
    + C(27, 30, 3, '#ef5a3c', ' stroke-width="1.6"') + T('M33 30H46', '#e8402f', 4.4, 2.6) + hi('M22 26L30 18', 1.6, .55)
    + C(48, 49.6, 7.6, '#fff3dc', ' stroke-width="2.4"') + P('M48 55.4L42.8 49.6H45.8V44.2H50.2V49.6H53.2Z', '#e8402f', ' stroke-width="2"')],
  tour: () => ['#2f8f8a', '#216b67',
    T('M24 54V10', '#7a4426', 1.8, 2.4) + D([[24, 9]], '#f7c242', 4.6) + P('M25 12H48L43 19.5L48 27H25Z', '#f7c242') + F('M25 21.6H46.4L48 24.2V27H25Z', '#c99420')
    + C(34, 19.4, 4, '#e8402f', ' stroke-width="2.4"') + C(34, 19.4, 1.5, '#fff3dc', NO) + hi('M27.4 14.4H38', 1.4, .6)
    + P('M30 54V40Q30 36 34 36H52Q55 36 56 40L58 46V54Z', '#ef5a3c') + F('M30 49H58V54H30Z', '#c23f28')
    + P('M33 39.6H38.4V44.6H33ZM41 39.6H46.4V44.6H41ZM49 39.6H53.6L55.2 44.6H49Z', '#bfe6f7', ' stroke-width="2"')
    + S('M30 47H58', '#fff3dc', 1.6) + C(36, 54.4, 3, TYRE, ' stroke-width="2.4"') + C(52, 54.4, 3, TYRE, ' stroke-width="2.4"')],
  celebrity: () => ['#8a4d9e', '#683779',
    T('M30 36L22 52', '#3b3036', 3.6, 2.6) + P('M27.6 33.4L35 37.2L33.4 40.4L26 36.6Z', '#f7c242', ' stroke-width="1.8"')
    + C(36, 25, 10, METAL) + F('M41 17Q46.4 21.6 45.6 27.4Q44.4 33.4 38 34.8Q43.6 28.4 41 17Z', METAL_D)
    + S('M28.4 19.4L42.6 33.6M31 16.6L45 30.6M26.6 23.2L39 35.4M27.6 30.2L43.4 18.4M30.8 33.8L45.2 22.4M28 26.4L40 16.6', '#8e9aa6', .9)
    + hi('M29 21Q30.6 16.8 35 16', 2, .7) + P(star4(16, 18, 6, .22), '#f7c242', ' stroke-width="1.6"') + P(star4(50, 44, 5, .22), '#f7c242', ' stroke-width="1.6"')
    + P(star4(50, 12, 3.4, .25), '#f28ab2', ' stroke-width="1.3"') + D([[14, 36], [44, 52], [56, 26]], '#fff3dc', 2.6)],
};
export const PRANK_ICON_KINDS = Object.freeze(Object.keys(ICONS));

/** A 64×64 dialog icon: rat, drunk, sidewalk, haggler (nuisances), tour, celebrity (favours). Throws on unknown kinds. */
export function prankIcon(kind, options) {
  if (!Object.hasOwn(ICONS, kind)) throw new Error(`prankIcon: unknown kind "${kind}"`);
  void options; // the icons carry no ids, so an idPrefix option changes nothing
  const [back, backS, art] = ICONS[kind]();
  const sticker = C(32, 32, 28.6, back) + F('M50 12A28.6 28.6 0 0 1 32 60.6A28.6 28.6 0 0 0 50 12Z', backS) + C(24, 22, 16, W, `${NO}${op(.18)}`)
    + C(32, 32, 28.6, 'none', ' stroke-width="2.4"');
  return minify(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="prank-icon prank-${kind}" aria-hidden="true"><g fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" paint-order="stroke">${sticker}${art}</g></svg>`);
}
