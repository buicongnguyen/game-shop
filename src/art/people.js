/** Tiệm Mì Cay: original character art drawn as SVG strings.
 *
 *   customerFace({ persona, seed, mood, idPrefix, label })  80×80 circular customer portrait
 *   staffFace(id, { mood, idPrefix, label })                80×80 circular staff portrait
 *   mascot(mood, { idPrefix, label })                       240×260 chili-chef mascot, full body
 *
 * A pure module: nothing touches the DOM and nothing is random. The same inputs with the same idPrefix give
 * byte-identical markup; without an idPrefix the generated one includes a module counter, so only the ids differ.
 * Style follows docs/ART-STYLE.md: vivid warm fills, a #4a2a22 outline with round joins, one flat darker shade on
 * the side away from a top-left light, soft white highlights, no external references and no SMIL.
 *
 * Outlines: filled shapes inherit `paint-order="stroke"` with a doubled stroke width, so only the outer half of the
 * stroke shows. Flat shades drawn inside a shape afterwards can then never thin its outline.
 */

const INK = '#4a2a22';
const W = '#fff';

// ---------------------------------------------------------------------------------------------
// Small SVG helpers. Hand-written paths use absolute commands and "x y" pairs, so they can be mirrored.

const r1 = value => Math.round(value * 10) / 10;
const mapPath = (d, fn) => d.replace(/(-?\d*\.?\d+) (-?\d*\.?\d+)/g, (match, x, y) => {
  const [a, b] = fn(+x, +y);
  return `${r1(a)} ${r1(b)}`;
});
const flip = (d, axis = 40) => mapPath(d, (x, y) => [2 * axis - x, y]);
// Stroke widths pass through K, so the two smaller people of a 'pair' portrait keep readable lines.
let K = 1;
const sw = width => ` stroke-width="${r1(width * K)}"`;
const op = value => ` opacity="${String(value).replace(/^0\./, '.')}"`;
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const N = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" stroke="none"${extra}/>`;
const L = (d, color = INK, width = 1.9, extra = '') => `<path d="${d}" fill="none" stroke="${color}"${sw(width)}${extra}/>`;
const hi = (d, width = 2, opacity = .45) => L(d, W, width, op(opacity));
// Round dots as zero-length strokes: one element for any number of dots.
const dots = (points, color, size, extra = '') => L(points.map(([x, y]) => `M${r1(x)} ${r1(y)}h0`).join(''), color, size, extra);
const O = (cx, cy, r, fill, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${extra}/>`;
const ell = (cx, cy, rx, ry = rx) => `M${r1(cx - rx)} ${r1(cy)}a${r1(rx)} ${r1(ry)} 0 1 0 ${r1(2 * rx)} 0a${r1(rx)} ${r1(ry)} 0 1 0 ${r1(-2 * rx)} 0Z`;
const star4 = (cx, cy, r) => {
  const k = r * .2, c = v => r1(v);
  return `M${c(cx)} ${c(cy - r)}Q${c(cx + k)} ${c(cy - k)} ${c(cx + r)} ${c(cy)}Q${c(cx + k)} ${c(cy + k)} ${c(cx)} ${c(cy + r)}`
    + `Q${c(cx - k)} ${c(cy + k)} ${c(cx - r)} ${c(cy)}Q${c(cx - k)} ${c(cy - k)} ${c(cx)} ${c(cy - r)}Z`;
};
// Final pass: rewrite each path with relative or absolute segments, whichever is shorter, and minimal separators.
const ARGS = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
let STEP = 10; // 1 / grid size
const num = value => {
  const text = String(Math.round(value * STEP) / STEP);
  return text === '-0' ? '0' : text.replace(/^(-?)0\./, '$1.');
};
function joinNums(list, prev = null) {
  let text = '';
  for (const item of list) {
    const glue = prev !== null && !(item[0] === '-' || (item[0] === '.' && prev.includes('.')));
    text += (glue ? ' ' : '') + item;
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
    const a = tokens.slice(i, i + count).map(Number);
    i += count;
    if (a.length < count || a.some(Number.isNaN)) return d;
    let abs, outLetter;
    if (lower === 'z') { out += 'z'; lastLetter = 'z'; lastNum = null; x = sx; y = sy; continue; }
    if (lower === 'h') abs = [rel ? x + a[0] : a[0], y];
    else if (lower === 'v') abs = [x, rel ? y + a[0] : a[0]];
    else if (lower === 'a') abs = [a[0], a[1], a[2], a[3], a[4], rel ? x + a[5] : a[5], rel ? y + a[6] : a[6]];
    else abs = a.map((value, k) => (rel ? value + (k % 2 ? y : x) : value));
    abs = abs.map(value => Math.round(value * STEP) / STEP); // keep every point on the grid, so deltas never drift
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
      const up = lower.toUpperCase();
      options = [[up, abs.map(num)], [lower, abs.map((value, k) => num(value - (k % 2 ? y : x)))]];
    }
    const cost = ([l, nums]) => (l === lastLetter && l.toLowerCase() !== 'm' ? 0 : 1) + joinNums(nums, l === lastLetter ? lastNum : null).length;
    const [chosen, nums] = cost(options[0]) <= cost(options[1]) ? options[0] : options[1];
    outLetter = chosen;
    if (outLetter === lastLetter && outLetter.toLowerCase() !== 'm') out += joinNums(nums, lastNum);
    else out += outLetter + joinNums(nums);
    lastLetter = outLetter; lastNum = nums[nums.length - 1];
    [x, y] = end;
    if (lower === 'm') { sx = x; sy = y; }
  }
  return out;
}
const minify = (markup, step = 10) => {
  STEP = step;
  try { return markup.replace(/ d="([^"]+)"/g, (match, d) => ` d="${minifyPath(d)}"`); } finally { STEP = 10; }
};
const escAttr = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const a11y = label => (label ? `role="img" aria-label="${escAttr(label)}"` : 'aria-hidden="true"');

// ---------------------------------------------------------------------------------------------
// Seeds and ids

function hashText(text) {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
// mulberry32: small and fast, enough to spread the choices.
function makeRandom(text) {
  let a = hashText(text);
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pickWith = random => list => list[Math.floor(random() * list.length) % list.length];
let counter = 0;
const cleanId = value => String(value).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^(?=[^A-Za-z_])/, 'p');
function prefixFor(given, parts) {
  if (given !== undefined && given !== null && given !== '') return cleanId(given);
  counter = (counter + 1) % 1e9;
  return cleanId(`${parts.join('-')}-${counter.toString(36)}-`.slice(-60));
}

// ---------------------------------------------------------------------------------------------
// Palette (docs/ART-STYLE.md), each colour paired with its flat shade.

const SKIN = [['#f9d2b4', '#eab08f'], ['#efc19c', '#dba07a'], ['#d9a27a', '#c0835c'], ['#b97d56', '#9c6440'], ['#8d5a3b', '#74462c']];
const LOCAL_SKIN = [0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 4]; // a Vietnamese street, weighted to the lighter half
const HAIR = {
  black: ['#3b2624', '#26171a'], dark: ['#5a3322', '#3d2016'], brown: ['#7e4a2b', '#5a301b'], auburn: ['#a8482a', '#7a2f1a'],
  caramel: ['#c47a3c', '#935426'], blond: ['#f4c75a', '#d0962a'], ginger: ['#e2703a', '#b24c20'],
  grey: ['#b9bdc5', '#8d929c'], white: ['#f4f2ed', '#c9c3b9'],
};
const C = {
  red: ['#e8402f', '#b92b22'], tomato: ['#ef5a3c', '#c23f28'], orange: ['#f59a3a', '#c9672a'], yellow: ['#f7c242', '#c99420'],
  green: ['#5fae4e', '#3f8a3a'], mint: ['#8fd3a7', '#5fae7e'], sky: ['#6cc3ef', '#3f97c9'], blue: ['#2f7fc1', '#22609a'],
  teal: ['#2f8f8a', '#216b67'], plum: ['#8a4d9e', '#683779'], pink: ['#f28ab2', '#d0628c'], wood: ['#b06a3b', '#7a4426'],
  shirt: [W, '#e4dacd'], cream: ['#fff3dc', '#ead3ae'], metal: ['#c9d3db', '#8e9aa6'], ink: ['#4b3a4f', '#33263a'],
};
const CLOTHES = ['red', 'orange', 'yellow', 'green', 'sky', 'blue', 'teal', 'plum', 'pink', 'tomato'];
// Backgrounds: a warm vivid base with a lighter glow from the top-left. Clothes avoid the background's colour family.
const BACKS = { yellow: '#f7c242', orange: '#f59a3a', pink: '#f28ab2', tomato: '#ef5a3c', peach: '#ffb37a', coral: '#ff8c6e' };
const FAMILY = { red: 'tomato', tomato: 'tomato', orange: 'orange', yellow: 'yellow', green: 'mint', mint: 'mint', sky: 'sky', blue: 'sky', teal: 'mint', plum: 'pink', pink: 'pink' };
const NEAR = { peach: 'orange', coral: 'tomato' };

// ---------------------------------------------------------------------------------------------
// The portrait frame. One person fills an 80×80 frame: head centre x 40, eyes at y 38.4, chin at y 56.

const HEAD = 'M20.5 36C20.5 22.5 29 15 40 15C51 15 59.5 22.5 59.5 36C59.5 48.5 51 56 40 56C29 56 20.5 48.5 20.5 36Z';
const HEAD_SHADE = 'M52.5 18.2C57 21.7 59.5 28 59.5 36C59.5 48.5 51 56 40 56C47.5 54.6 54.8 49 55.6 39.5C56.4 30.5 55.6 23.6 52.5 18.2Z';
const BODY = 'M3 98C3 71 15 62.4 31 60.4L49 60.4C65 62.4 77 71 77 98Z';
const BODY_SHADE = 'M61.5 63.4C70 67 75.6 75 76.6 98L63 98C64.4 85 64.2 73 61.5 63.4Z';
const NECK = 'M34.4 48V61.4C37 63.6 43 63.6 45.6 61.4V48Z';
const CREW = 'M32.6 60.4Q40 68.2 47.4 60.4';
const BROW_SHADE = 'M22.4 29.6Q40 24.4 57.6 29.6L57.8 32.6Q40 27.6 22.2 32.6Z';

const PONY_FRONT = 'M19.6 39C16.8 22.5 26.8 11 40.4 11C54 11 63.4 22 60.6 38.5C59.6 32.5 58 28.8 55.6 26.4C49 28 41.6 26.6 36.4 22.2C33.4 26.6 27.4 29.8 23 30.6C21.4 33.2 20.2 36 19.6 39Z';
const PONY_SHADE = 'M53.4 13.6C60.2 18 63 27 60.6 38.5C59.6 32.5 58 28.8 55.6 26.4C56.8 21.6 56 17.2 53.4 13.6Z';
const BANGS_FRONT = 'M19.4 38.5C16.4 21.5 26.4 10.5 40 10.5C53.6 10.5 63.6 21.5 60.6 38.5C59.8 34 58.6 30.6 57 28.6C51.6 29.8 45.6 29.4 41.6 27.2Q38 30 33.4 28.8Q27.6 30.4 23.2 28.4C21.4 31 20.2 34.4 19.4 38.5Z';
const BANGS_SHADE = 'M53.2 13C60.2 17.6 63.2 27 60.6 38.5C59.8 34 58.6 30.6 57 28.6C57.8 22.6 56.2 17 53.2 13Z';

// Hair: front (bangs and cap), its shade, lock lines and highlight; some styles add a back layer behind the head.
const HAIRS = {
  crop: {
    fringe: true,
    front: 'M19 38C16.5 22 26 10.5 40 10.5C54 10.5 63.5 22 61 38C60 32 58.5 28.5 56.5 26.5Q52 29.5 47 27Q42 30.5 36.5 27.5Q31 30 26.5 26.5C23.5 28.5 20.5 32 19 38Z',
    shade: 'M53 12.9C59.8 17.2 63 26.5 61 38C60 32 58.5 28.5 56.5 26.5C57.6 21.6 56.4 16.4 53 12.9Z',
    lines: 'M34.6 14Q32.4 20 33.6 26.8M45.4 13.8Q47 20 45.4 25.8', hi: 'M24.6 19.6Q29.4 13.6 36.6 12.8',
  },
  side: {
    fringe: true,
    front: 'M19 38.5C15.8 21.5 27 10 41 10C55 10 64.2 21 61 38.5C60 32.5 58.5 28.5 55.8 25.5C48.5 28.8 39.5 27.5 32.8 21.8C30.8 27.5 25.5 31 21.4 32.6C20.2 34.4 19.5 36.4 19 38.5Z',
    shade: 'M53.5 12.4C60.5 16.8 64 27 61 38.5C60 32.5 58.5 28.5 55.8 25.5C57 20.6 56.2 15.8 53.5 12.4Z',
    lines: 'M33.4 21.6Q41 16.2 52 16.4M40.6 25.6Q48 21.8 55.4 23', hi: 'M22.4 25.6Q23.6 17.8 30.6 13.6',
  },
  spiky: {
    fringe: true,
    front: 'M19 38C17.8 31 18.2 24.5 20.6 19.2L15.8 13.4L24.8 13.2L26.2 5.8L34 9.8L40 3.6L45.8 9.6L53.6 5.8L55 13.2L64.2 13.6L59.6 19.4C62.2 24.6 62.4 31 61 38C60 32 58.6 28.6 56.6 26.6L52 29L48.6 25.6L44.6 29.4L40.2 25.4L35.6 29.2L32 25.6L27.4 28.8L24.8 26.6C22.4 29.6 20 33.2 19 38Z',
    shade: 'M55 13.2L64.2 13.6L59.6 19.4C62.2 24.6 62.4 31 61 38C60 32 58.6 28.6 56.6 26.6C58 22 57.6 17 55 13.2Z',
    lines: 'M33.4 12.4Q32.6 19 35.2 26.8M45.4 12.4Q47 19 44.6 27', hi: 'M23.8 18.8Q29.4 14 36.4 13.6',
  },
  curtain: {
    fringe: true,
    front: 'M19 38.5C16.5 21.5 26.5 10.5 40 10.5C53.5 10.5 63.5 21.5 61 38.5C60 31.5 57.4 26.8 53.6 24.6C48.2 24.6 43 21.4 40.8 17L39.2 17C37 21.4 31.8 24.6 26.4 24.6C22.6 26.8 20 31.5 19 38.5Z',
    shade: 'M53 12.6C60 17 63.6 27 61 38.5C60 31.5 57.4 26.8 53.6 24.6C56.4 20 55.8 15.6 53 12.6Z',
    lines: 'M36.4 16Q31.4 19 27.6 23.6M43.6 16Q48.6 19 52.4 23.6', hi: 'M24.4 20Q28.6 14 35.4 13',
  },
  bob: {
    fringe: true,
    back: 'M15.6 52C12.6 36 18 11 40 11C62 11 67.4 36 64.4 52C62 56.4 57 56.6 54.4 53.6L25.6 53.6C23 56.6 18 56.4 15.6 52Z',
    front: 'M17.4 50.6C13.4 26 25 10.5 40 10.5C55 10.5 66.6 26 62.6 50.6C61 52.6 58.4 53.4 56.4 52.4C58 46 58.4 38 57.4 30.6Q53.4 31.4 50.8 28.4Q47.2 31.6 43 28.8Q39.2 31.8 35 28.8Q30.6 31.6 27.4 28.6Q24.8 31 22.6 30.6C21.6 38 22 46 23.6 52.4C21.6 53.4 19 52.6 17.4 50.6Z',
    shade: 'M53.5 13.2C61.5 19 65.2 34 62.6 50.6C61 52.6 58.4 53.4 56.4 52.4C58 46 58.4 38 57.4 30.6C58.6 24.5 57 18 53.5 13.2Z',
    lines: 'M31 14.4Q26 22 27 28.4M49 14.4Q54 22 53 28.4', hi: 'M22.4 23Q25.6 15.8 33.4 13', noEars: true,
  },
  long: {
    fringe: true,
    back: 'M16.5 70C12 51 12 31 18 21C23.5 12.5 31 9.5 40 9.5C49 9.5 56.5 12.5 62 21C68 31 68 51 63.5 70Z',
    backShade: 'M54 12.6C61.6 17.6 67.6 30 67 48C66.8 56 65.6 63 63.5 70L57 70C61 53 61 30 54 12.6Z',
    front: 'M18.2 47C14.6 24 26 10.2 40.6 10.6C55 11 65.4 23.6 61.8 47C60.6 39 59.4 33 57.4 28.6C51.4 27.6 44.8 24.2 40.4 18.6C36.8 25 30.4 29.6 24.2 30.8C21.8 35 20 41 18.2 47Z',
    shade: 'M53.8 13.4C61.4 18.4 65 31 61.8 47C60.6 39 59.4 33 57.4 28.6C58.4 23 57 17.6 53.8 13.4Z',
    lines: 'M28.6 26.6Q35 21.6 38 15.4M44 19Q50 15.4 56.6 17.6M17.4 55Q16.4 62 18 68', hi: 'M23.2 21.6Q27.6 14.8 35.4 13', noEars: true,
  },
  pony: {
    back: 'M54.5 19C64 13.5 72.5 19 72 31C71.6 41 66 47 68 57C61.4 53.6 58.8 45 60.8 37C62.4 30.6 61.6 25.4 57.4 22.4Z',
    backShade: 'M66 20.6C71 23 72.4 27 72 31C71.6 41 66 47 68 57C64.6 55.4 63 51.6 63 47.6C66 42 68 32 66 20.6Z',
    tie: [57.4, 20.8], fringe: true, front: PONY_FRONT, shade: PONY_SHADE,
    lines: 'M36.4 22.2Q42.6 16.2 52.6 16M30 25.2Q33.6 20.8 34.6 15', hi: 'M24.6 19Q30.4 13.6 37.6 13.4',
  },
  pigtails: {
    fringe: true,
    back: 'M20.4 41.6C11.4 43 8.6 52 10.6 59.6C11.8 64 15.4 66.4 18.8 64.8C15.8 59.2 16.2 52.6 21.6 48.2Z', mirrorBack: true,
    ties: [[17.4, 46], [62.6, 46]], front: BANGS_FRONT, shade: BANGS_SHADE,
    lines: 'M31.4 14.6Q28.4 21 29.4 28M48.6 14.6Q51.6 21 50.6 28', hi: 'M24.6 18.6Q30.6 13.4 38 13.2',
  },
  bun: {
    bun: [40, 9.8, 8], front: PONY_FRONT, shade: PONY_SHADE,
    lines: 'M36.4 22.2Q42.6 16.2 52.6 16M30 25.2Q33.6 20.8 34.6 15', hi: 'M24.6 19Q30.4 13.6 37.6 13.4',
  },
  topbun: {
    bun: [40, 6.8, 7.4], band: true, fringe: true, front: BANGS_FRONT, shade: BANGS_SHADE,
    lines: 'M31.4 14.6Q28.4 21 29.4 28M48.6 14.6Q51.6 21 50.6 28', hi: 'M24.6 18.6Q30.6 13.4 38 13.2',
  },
  curly: {
    fringe: true,
    front: 'M18.5 40Q12.8 36.6 15.8 30.6Q12.2 24.2 18 19.6Q18.4 12.4 25.6 11.4Q29.4 5.4 36.2 7.6Q40.2 3.8 44.8 7.2Q51 5.2 55 10.8Q62 11.2 62.8 18.6Q68.4 24 64.4 30.4Q67.4 36.4 61.6 40C60.8 34 59 29.6 56.2 27.6Q52.4 30.6 48.2 27.6Q44.2 30.8 40 27.8Q35.8 30.8 31.8 27.6Q27.6 30.6 23.8 27.6C21 29.6 19.2 34 18.5 40Z',
    shade: 'M55 10.8Q62 11.2 62.8 18.6Q68.4 24 64.4 30.4Q67.4 36.4 61.6 40C60.8 34 59 29.6 56.2 27.6C58.6 22 58.2 15.6 55 10.8Z',
    lines: 'M26.5 19q2.6-2.2 4.8.2M39.5 13.4q2.6-2.2 4.8.2M33 21.4q2.6-2.2 4.8.2M46 19.4q2.6-2.2 4.8.2', hi: 'M21.6 22Q24.4 16.4 30.2 14.4',
  },
  buzz: {
    front: 'M20.2 34.5C19.2 21.5 28.4 13.2 40 13.2C51.6 13.2 60.8 21.5 59.8 34.5C58.8 29.4 56.8 26 54 24.2C47 22.4 33 22.4 26 24.2C23.2 26 21.2 29.4 20.2 34.5Z',
    shade: 'M52.4 15.6C58.2 19.6 60.6 26.4 59.8 34.5C58.8 29.4 56.8 26 54 24.2C55 21 54.4 18 52.4 15.6Z',
    hi: 'M27 19.4Q32 15.6 38 15.4',
  },
  bald: { tuft: 'M19.4 41C16.4 35 17 28 21.4 23.6C22.6 28 24 31 26.2 32.6C23.2 34 20.8 37 19.4 41Z' },
  combed: {
    front: 'M19.4 38C16.4 22 26.4 11.2 40 11.2C53.6 11.2 63.6 22 60.6 38C59.6 31.6 57.4 27 53.6 24.4C47 21.4 33 21.4 26.4 24.4C22.6 27 20.4 31.6 19.4 38Z',
    shade: 'M52.6 13.8C59.4 18.2 62.6 27 60.6 38C59.6 31.6 57.4 27 53.6 24.4C55 20.4 54.6 16.8 52.6 13.8Z',
    lines: 'M30 23Q34 16 42 13.6M37.5 22.2Q42.5 16.4 50.5 15.4', hi: 'M24.6 21Q28.6 15.4 35 13.8',
  },
};

// ---------------------------------------------------------------------------------------------
// Faces

const EX = 8.6, EY = 38.4; // eye offset from the centre line, eye height
const EYE_XS = [40 - EX, 40 + EX];

function eyes(mood, p) {
  if (mood === 'happy') {
    return L(EYE_XS.map(cx => `M${r1(cx - 3.4)} ${r1(EY + 1.2)}Q${r1(cx)} ${r1(EY - 4.2)} ${r1(cx + 3.4)} ${r1(EY + 1.2)}`).join(''), INK, 2.3);
  }
  const size = p.age === 'teen' ? 1.12 : p.age === 'old' ? .86 : 1;
  const rx = 2.7 * size, ry = 3.5 * size;
  let out = L(EYE_XS.map(cx => `M${r1(cx)} ${r1(EY - ry + rx)}v${r1(2 * (ry - rx))}`).join(''), '#2e1a19', 2 * rx);
  if (!p.lite) out += dots(EYE_XS.map(cx => [cx, EY + ry * .44]), p.eye || '#8a4a2c', rx * 1.25);
  out += dots(EYE_XS.map(cx => [cx - .9 * size, EY - 1.3 * size]), W, 2.5 * size) + (p.lite ? '' : dots(EYE_XS.map(cx => [cx + .9, EY + 1.5]), W, 1.1));
  if (p.fem) {
    out += L(EYE_XS.map((cx, i) => {
      const s = i ? 1 : -1, outer = cx + s * (rx + .2);
      return `M${r1(cx - s * (rx + .5))} ${r1(EY - 1.5)}Q${r1(cx)} ${r1(EY - ry - 1.6)} ${r1(outer)} ${r1(EY - 1.3)}L${r1(outer + s * 1.6)} ${r1(EY - 3)}`;
    }).join(''), INK, 1.6);
  }
  if (mood === 'angry' && !p.lite) {
    // Upper lids pressed down towards the nose.
    const lid = (cx, s) => [cx + s * 4, cx - s * 4];
    out += N(EYE_XS.map((cx, i) => { const [o, n] = lid(cx, i ? 1 : -1); return `M${r1(o)} ${r1(EY - 6)}L${r1(n)} ${r1(EY - 6)}L${r1(n)} ${r1(EY - .6)}L${r1(o)} ${r1(EY - 3.6)}Z`; }).join(''), p.skin[0]);
    out += L(EYE_XS.map((cx, i) => { const s = i ? 1 : -1, [o, n] = lid(cx, s); return `M${r1(o - s * .5)} ${r1(EY - 3.4)}L${r1(n + s * .6)} ${r1(EY - .9)}`; }).join(''), INK, 1.8);
  }
  if (p.age === 'old') out += L(EYE_XS.map((cx, i) => { const s = i ? 1 : -1, x = cx + s * 5.4; return `M${r1(x)} ${r1(EY - 1)}L${r1(x + s * 1.8)} ${r1(EY - 2)}M${r1(x)} ${r1(EY + 1.2)}L${r1(x + s * 1.8)} ${r1(EY + 1.8)}`; }).join(''), p.skin[1], 1.3);
  return out;
}

function brows(mood, p) {
  const y = EY - 7, cx = EYE_XS[0], x0 = cx - 3.6, x1 = cx + 3.4;
  const d = {
    happy: `M${r1(x0)} ${r1(y)}Q${r1(cx)} ${r1(y - 2)} ${r1(x1)} ${r1(y - .2)}`,
    worried: `M${r1(x0)} ${r1(y + 1.8)}Q${r1(cx + .4)} ${r1(y + .6)} ${r1(x1)} ${r1(y - 1.6)}`,
    angry: `M${r1(x0 - .4)} ${r1(y - .6)}L${r1(x1 + .4)} ${r1(y + 3.2)}`,
  }[mood] || `M${r1(x0)} ${r1(y + .8)}Q${r1(cx)} ${r1(y - .8)} ${r1(x1)} ${r1(y + .4)}`;
  const both = d + flip(d);
  if (p.age === 'old') return L(both, INK, 3.8) + L(both, p.brow || W, 2);
  return L(both, p.brow || INK, 1.9);
}

function mouth(mood, p) {
  const y = p.moustache ? 49.6 : 47.6;
  if (mood === 'happy') {
    const t = y - 1.6;
    return P(`M34.6 ${r1(t)}Q40 ${r1(t + 2)} 45.4 ${r1(t)}Q44.8 ${r1(t + 7.4)} 40 ${r1(t + 7.4)}Q35.2 ${r1(t + 7.4)} 34.6 ${r1(t)}Z`, '#8c2f25', sw(3.4))
      + N(`M36.9 ${r1(t + 5)}Q40 ${r1(t + 3)} 43.1 ${r1(t + 5)}Q40 ${r1(t + 7.6)} 36.9 ${r1(t + 5)}Z`, '#f2788a')
      + N(`M35.7 ${r1(t + .7)}Q40 ${r1(t + 2.4)} 44.3 ${r1(t + .7)}L44 ${r1(t + 2)}Q40 ${r1(t + 3.5)} 36 ${r1(t + 2)}Z`, W);
  }
  if (mood === 'worried') return L(`M35.4 ${r1(y + 1)}Q37 ${r1(y - .6)} 38.6 ${r1(y + 1)}Q40.2 ${r1(y + 2.6)} 41.8 ${r1(y + 1)}Q43.4 ${r1(y - .6)} 45 ${r1(y + 1)}`, INK, 1.8);
  if (mood === 'angry') return L(`M35.4 ${r1(y + 2.6)}Q40 ${r1(y - 2.6)} 44.6 ${r1(y + 2.6)}`, INK, 2.3);
  return L(`M36.2 ${r1(y - .4)}Q40 ${r1(y + 2.8)} 43.8 ${r1(y - .4)}`, p.lips || INK, p.lips ? 2.2 : 1.9);
}

function faceFeatures(mood, p) {
  const deep = p.skinIndex >= 3;
  const angry = mood === 'angry';
  let out = L(angry ? 'M23.8 45h5.2M51 45h5.2' : 'M24.2 45h4.4M51.4 45h4.4', angry ? '#e8402f' : deep ? '#e0546a' : '#f2788a',
    angry ? 5.2 : 4.8, op(angry ? .62 : mood === 'happy' ? .68 : .5));
  if (p.freckles) out += dots([[25.4, 43], [28.4, 41.8], [28.8, 44.6], [54.6, 43], [51.6, 41.8], [51.2, 44.6]], p.skin[1], 1.5);
  if (p.age === 'old') out += L('M30.6 47.4Q31.6 49.8 33.6 50.6M49.4 47.4Q48.4 49.8 46.4 50.6M34 24.8Q40 23.4 46 24.8', p.skin[1], 1.3);
  else if (p.age === 'mid') out += L('M31.4 46.6Q32 48.6 33.6 49.4M48.6 46.6Q48 48.6 46.4 49.4', p.skin[1], 1.2);
  out += eyes(mood, p) + brows(mood, p);
  if (!p.lite) out += L('M39.4 42.6Q40.9 43.4 39.8 44.6', p.skin[1], 1.6);
  if (p.moustache) out += P('M33.6 47.8C35.4 44.6 38.4 44.2 40 46C41.6 44.2 44.6 44.6 46.4 47.8C44 48.6 42 48.2 40 47.2C38 48.2 36 48.6 33.6 47.8Z', p.moustache);
  if (p.beard) out += P('M35.6 53.4Q40 60.6 44.4 53.4Q40 55.6 35.6 53.4Z', p.beard);
  return out + mouth(mood, p);
}

// ---------------------------------------------------------------------------------------------
// Clothes: each draws the shoulders, the neck and a neckline over it.

const COLLAR = 'M33.4 58.4L40 64.8L35.6 69L30 61.6Z';
const collar = fill => P(COLLAR + flip(COLLAR), fill);
const neck = p => P(NECK, p.skin[1]);
const crew = (p, fill = p.skin[1]) => P(CREW, fill);
const vee = p => P('M32.8 60.4L40 70.6L47.2 60.4', p.skin[1]);
const body = (col, shade) => P(BODY, col) + N(BODY_SHADE, shade);

const PRINT = [[14, 72], [26, 82], [57, 77], [66, 90]];

function clothes(p) {
  const [col, shade] = p.top.col || C.shirt;
  switch (p.top.kind) {
    case 'tee':
      return body(col, shade) + neck(p) + crew(p) + (p.top.graphic && !p.lite ? N(star4(52, 73, 4), p.top.graphic) : '');
    case 'hoodie':
      return body(col, shade) + P('M25.8 61.6C27.6 54.6 52.4 54.6 54.2 61.6C51.2 67.4 28.8 67.4 25.8 61.6Z', shade) + neck(p) + crew(p)
        + L('M36.4 64.4L35.6 72.6M43.6 64.4L44.4 72.6', W, 1.5) + dots([[35.6, 73.6], [44.4, 73.6]], W, 2.6);
    case 'shirt':
      return body(col, shade) + neck(p) + vee(p) + collar(p.top.collar || col) + dots([[40, 75], [40, 84]], W, 2.2);
    case 'uniform': {
      const [nc, ns] = p.top.neck, [sc, ss] = p.top.strap;
      let out = body(...C.shirt) + neck(p) + vee(p) + collar(W) + L('M40 64.8V98', INK, 1.4);
      if (p.top.neckwear === 'scarf') {
        out += P('M30.6 60.2Q40 66.4 49.4 60.2L48.4 64.2Q40 69.6 31.6 64.2Z', nc) + P('M38.6 66L33.4 78.6L38 80L40.6 67Z', nc)
          + P('M41.4 66L46.6 78.6L42 80L39.4 67Z', ns) + P('M37.4 63.4L42.6 63.4L41.6 67.4L38.4 67.4Z', nc);
      } else if (p.top.neckwear === 'bow') {
        out += P('M40 66.4L33.4 62.8Q32.2 66.4 33.4 70Z', nc) + P('M40 66.4L46.6 62.8Q47.8 66.4 46.6 70Z', ns) + P(ell(40, 66.4, 2), nc);
      } else {
        out += P('M38.2 64.6L41.8 64.6L42.6 67L41.2 68.2L43 78.4L40 81.4L37 78.4L38.8 68.2L37.4 67Z', nc);
      }
      return out + P('M19.4 63.2Q23.6 61.4 27.6 62.6L25.8 98L20.6 98Q22 78 19.4 63.2Z', sc) + P('M60.6 63.2Q56.4 61.4 52.4 62.6L54.2 98L59.4 98Q58 78 60.6 63.2Z', ss);
    }
    case 'polo':
      return body(col, shade) + neck(p) + vee(p) + P('M33.4 59L40 64.8L35.6 68.2L29.6 61.4ZM46.6 59L40 64.8L44.4 68.2L50.4 61.4Z', shade)
        + P('M38.4 64.8L41.6 64.8L41.6 73.4L38.4 73.4Z', shade) + dots([[40, 67.4], [40, 70.8]], W, 1.8);
    case 'blouse':
      return body(col, shade) + neck(p) + crew(p) + (p.lite ? '' : dots([[14, 76], [22, 68.6], [28, 81], [52, 79], [59, 69], [66, 79], [40, 89], [9, 88], [71, 90], [16, 92]], p.top.dots || W, 3.6, op(.8)))
        + dots([[40, 72], [40, 78]], p.top.button || W, 2.4);
    case 'cardigan':
      return body(col, shade) + P('M31.6 60.4L48.4 60.4L40 79Z', W) + neck(p) + vee(p) + collar(W)
        + L('M31.6 60.6L40 79L48.4 60.6', INK, 1.9) + dots([[42, 83.6], [42.6, 90.6]], p.top.button || W, 2.8);
    case 'hawaii':
      return body(col, shade) + vee(p) + P('M32.8 60.2L40 70.6L36.4 72.2L29.4 62.4ZM47.2 60.2L40 70.6L43.6 72.2L50.6 62.4Z', col)
        + dots(PRINT.flatMap(([x, y]) => [[x, y - 1.8], [x + 1.8, y], [x, y + 1.8], [x - 1.8, y]]), p.top.print || W, 3) + dots(PRINT, C.yellow[0], 2);
    case 'jacket':
      return body(col, shade) + P('M33.2 60.4L46.8 60.4L45.6 98L34.4 98Z', p.top.inner || W) + neck(p) + crew(p)
        + P('M31.2 60.6L35.2 61.6L36.4 98L29.6 98ZM48.8 60.6L44.8 61.6L43.6 98L50.4 98Z', shade);
    case 'vest':
      return body(...C.shirt) + neck(p) + vee(p) + collar(W)
        + P('M3 98C3 76 13 64.8 27.6 61.6L39 79L38.4 98Z', col) + P('M77 98C77 76 67 64.8 52.4 61.6L41 79L41.6 98Z', col)
        + N('M66.4 67.6C71.6 72 75.4 80 76.4 98L66 98C67.6 87 67.8 76 66.4 67.6Z', shade) + dots([[40, 84.6], [40, 91.4]], C.yellow[0], 2.6);
    case 'apron': {
      const [ac, as] = p.top.apron;
      return body(col, shade) + neck(p) + crew(p)
        + L('M30.8 70L27.6 61.4M49.2 70L52.4 61.4', INK, 4.6) + L('M30.8 70L27.6 61.4M49.2 70L52.4 61.4', ac, 2.4)
        + P('M29 69.4Q40 71.4 51 69.4L53 98L27 98Z', ac) + N('M46.4 70.4Q49 70.2 51 69.4L53 98L47.6 98Z', as)
        + (p.top.pocket ? P('M34.4 79L45.6 79L45 86.4Q40 88 35 86.4Z', as) : '');
    }
    case 'suit':
      // Mission patch (an original design): a coloured disc, a gold star and an orbit swoosh.
      return body('#f4f6f8', '#c9d3db') + P('M21.4 70.6L30.4 69.4L31 74L22 75.2Z', p.top.stripe || C.orange[0])
        + P(ell(50, 72, 4.8), p.top.patch || C.blue[0]) + N(star4(50, 71.6, 3.2), C.yellow[0]) + L('M45.8 74Q50 70.6 54.4 71.2', p.top.orbit || C.red[0], 1.2);
    default:
      return body(col, shade) + neck(p) + crew(p);
  }
}

// ---------------------------------------------------------------------------------------------
// Hair, hats and accessories

function hairBack(p) {
  const h = HAIRS[p.style];
  if (!h) return '';
  const [col, shade] = p.hair;
  let out = '';
  if (h.back) {
    out += P(h.back, col) + (h.backShade && !p.lite ? N(h.backShade, shade) : '');
    if (h.mirrorBack) out += P(flip(h.back), shade);
  }
  if (h.bun) {
    const [x, y, r] = h.bun;
    out += P(ell(x, y, r), col) + N(`M${x + 1} ${r1(y - r + .8)}Q${r1(x + r + 1)} ${y} ${x} ${r1(y + r - .6)}Q${r1(x + r - 3)} ${y} ${x + 1} ${r1(y - r + .8)}Z`, shade)
      + (p.lite ? '' : hi(`M${r1(x - r + 2.6)} ${r1(y - 1)}Q${r1(x - r + 3)} ${r1(y - r + 3)} ${r1(x - 1)} ${r1(y - r + 2)}`, 1.6, .4));
    if (h.band) out += P(`M${r1(x - 6.4)} ${r1(y + 4.4)}Q${x} ${r1(y + 7.8)} ${r1(x + 6.4)} ${r1(y + 4.4)}L${r1(x + 6.8)} ${r1(y + 7.6)}Q${x} ${r1(y + 11)} ${r1(x - 6.8)} ${r1(y + 7.6)}Z`, p.accent || C.pink[0]);
  }
  return out;
}

function hairFront(p) {
  const h = HAIRS[p.style];
  const [col, shade] = p.hair;
  if (p.style === 'bald') {
    return P(h.tuft + flip(h.tuft), col) + N(flip(h.tuft), shade, op(.6))
      + N(ell(32.6, 20.4, 4.6, 2.2), W, op(.5) + ' transform="rotate(-24 32.6 20.4)"');
  }
  if (!h) return '';
  const light = p.hair === HAIR.black || p.hair === HAIR.dark ? .32 : .5;
  let out = P(h.front, col) + N(h.shade, shade);
  if (h.lines && !p.lite) out += L(h.lines, shade, 1.3);
  if (h.hi) out += hi(h.hi, 2.2, light);
  if (h.tie) out += P(ell(h.tie[0], h.tie[1], 3.6), p.accent || C.pink[0]);
  if (h.ties) out += P(h.ties.map(([x, y]) => ell(x, y, 2.6)).join(''), p.accent || C.red[0]);
  return out;
}

function ears(p) {
  const [skin, shade] = p.skin;
  return P(ell(20.8, 39.6, 4, 5), skin) + P(ell(59.2, 39.6, 4, 5), shade) + (p.lite ? '' : L('M21.6 37.4Q19.2 38.8 21 42M58.4 37.4Q60.8 38.8 59 42', shade, 1.4));
}

function glasses(g) {
  const ring = g.kind === 'rect'
    ? 'M25.8 34.4H37.2V42.8H25.8ZM42.8 34.4H54.2V42.8H42.8Z'
    : ell(31.4, 38.6, 5.6) + ell(48.6, 38.6, 5.6);
  return P(ring, W, ` fill-opacity=".18" stroke="${g.col}"${sw(g.lite ? 2.2 : 2.8)}`) + L('M37 37.6Q40 36 43 37.6M25.8 37.2L21.4 36.2M54.2 37.2L58.6 36.2', g.col, 1.5)
    + (g.lite ? '' : hi('M27.6 36.6L29.6 34.8M44.8 36.6L46.8 34.8', 1.2, .8));
}

const CAP_CROWN = 'M19.4 31C18.6 17.6 28.2 9.6 40 9.6C51.8 9.6 61.4 17.6 60.6 31Z';
const CAP_SHADE = 'M50.6 11.6C57.6 15 61.2 22 60.6 31L54.8 31C55.6 23.4 54 16.4 50.6 11.6Z';

function hat(p) {
  const h = p.hat;
  if (!h) return '';
  const [col, shade] = h.col || C.red;
  switch (h.kind) {
    case 'cap':
      return P(CAP_CROWN, col) + N(CAP_SHADE, shade) + L('M40 10.4V29', shade, 1.2) + P(ell(40, 10, 1.9), col)
        + N('M35.6 22.6Q40 18.6 44.4 22.6Q40 26.6 35.6 22.6Z', W, op(.85))
        + P('M16.4 31.6C26 27.4 54 27.4 63.6 31.6C65.2 34.4 63 36.6 59.4 35.6C48.4 32.8 31.6 32.8 20.6 35.6C17 36.6 14.8 34.4 16.4 31.6Z', col)
        + N('M20.6 35.6C31.6 32.8 48.4 32.8 59.4 35.6C62 36.4 64 35.6 64.2 33.6C54 31 26 31 15.8 33.6C16 35.6 18 36.4 20.6 35.6Z', shade)
        + hi('M24 18.6Q28.6 13.6 35 12.4', 2, .4);
    case 'backcap':
      return P('M27 14.6C32 6.6 48 6.6 53 14.6C47 11.8 33 11.8 27 14.6Z', shade) + P(CAP_CROWN, col) + N(CAP_SHADE, shade)
        + P('M33.4 31Q33.4 23.8 40 23.8Q46.6 23.8 46.6 31Z', p.hair[0]) + P('M33 28.4L47 28.4L47 31.4L33 31.4Z', shade) + hi('M24 19Q28.6 13.8 35 12.6', 2, .4);
    case 'sunhat':
      return P('M4.6 25.6C4.6 18.6 75.4 18.6 75.4 25.6C75.4 32.4 4.6 32.4 4.6 25.6Z', col)
        + N('M5.4 27.6C12 31 68 31 74.6 27.6C73.6 31.4 62 33.2 40 33.2C18 33.2 6.4 31.4 5.4 27.6Z', shade)
        + P('M23.6 24.6C23 11.6 30.4 6.2 40 6.2C49.6 6.2 57 11.6 56.4 24.6Z', col) + N('M48.6 8C54 10.6 56.8 16.4 56.4 24.6L51.4 24.6C52 17.6 51 12 48.6 8Z', shade)
        + P('M23.4 19.4C33 22.2 47 22.2 56.6 19.4L56.5 24.4C47 27.2 33 27.2 23.5 24.4Z', h.band || C.red[0])
        + hi('M27.4 16.6Q30 9.6 37 8.4', 2, .55);
    case 'fedora':
      return P('M12.4 25C12.4 19.6 67.6 19.6 67.6 25C67.6 29.8 12.4 29.8 12.4 25Z', col) + N('M14 27C22 29.6 58 29.6 66 27C65 29.4 56 30.6 40 30.6C24 30.6 15 29.4 14 27Z', shade)
        + P('M24.2 23.6C23.6 15.6 26.6 8.6 33 8.4Q40 11.6 47 8.4C53.4 8.6 56.4 15.6 55.8 23.6Z', col) + N('M48.4 9C53.4 10.6 56.4 16.6 55.8 23.6L51 23.6C51.6 17.6 50.8 12.6 48.4 9Z', shade)
        + P('M24 18.4C33 20.8 47 20.8 56 18.4L55.9 23.6C47 26 33 26 24.1 23.6Z', h.band || INK) + hi('M28 16Q29.4 11.4 33 10.6', 1.8, .45);
    case 'flatcap':
      return P('M16.4 27.6C14.6 15.4 27 8.4 40 8.4C53 8.4 65.4 15 63.6 26.4C63.4 28.6 61.4 29.8 58.8 29.6L21.2 29.6C18.6 29.6 16.6 29 16.4 27.6Z', col)
        + N('M51.6 10.4C59.6 13.6 64.4 19.4 63.6 26.4C63.4 28.6 61.4 29.8 58.8 29.6L55.6 29.6C58.4 22.6 57 15.4 51.6 10.4Z', shade)
        + L('M24 25.6Q40 18.4 56.6 24.6M40 9.4Q43.6 15 42.6 21', shade, 1.2) + P(ell(40, 8.8, 1.9), col)
        + P('M20.4 28.8C29 33.4 51 33.4 59.6 28.8C58 31.8 51 34.6 40 34.6C29 34.6 22 31.8 20.4 28.8Z', shade) + hi('M22.6 20.6Q27.4 13.4 36 11.6', 2, .4);
    case 'beanie':
      return P('M19.6 31C19 16.4 28.8 8.6 40 8.6C51.2 8.6 61 16.4 60.4 31Z', col) + N('M50.4 11C57 15 60.8 22 60.4 31L54.6 31C55.2 23 53.6 15.6 50.4 11Z', shade)
        + P('M17.4 25.4C30 22.2 50 22.2 62.6 25.4L62.4 32.6C50 29.4 30 29.4 17.6 32.6Z', col) + N('M54 24.2Q58.6 24.6 62.6 25.4L62.4 32.6Q58.4 31.4 54 30.8Z', shade)
        + L('M25 24.6V30.8M32.4 23.6V29.8M40 23.2V29.4M47.6 23.6V29.8M55 24.6V30.8', shade, 1.2)
        + P(ell(40, 8, 5.2), h.pom || C.cream[0]) + hi('M24.4 18.6Q29 12.6 35.6 11.6', 2, .4);
    case 'nonla':
      return P('M2.6 27L40 .8L77.4 27C66 32.6 14 32.6 2.6 27Z', col) + N('M40 .8L77.4 27C71 30 58 31.6 46 31.9Z', shade)
        + L('M14.6 19C30 22 50 22 65.4 19M26.4 10.8C35 12.6 45 12.6 53.6 10.8', shade, 1.2) + hi('M34 7.6L17.6 19.6', 2.2, .55);
    case 'toque':
      return P('M24.6 21C17 19.6 15.8 9 24.4 7C26.4 .4 36.4 -.6 40 4.4C43.8 -.4 53.8 .6 55.6 7C64.2 9 63 19.6 55.4 21Z', W)
        + N('M55.6 7C64.2 9 63 19.6 55.4 21L50 21C55.4 17 57.4 11.4 55.6 7Z', '#e2d8cc') + L('M33.4 8.6Q33 14 35.6 17.6M46.6 8.6Q47 14 44.4 17.6', '#d6cabb', 1.3)
        + P('M23.8 17.6C33 19.8 47 19.8 56.2 17.6L57 26.6C46 29 34 29 23 26.6Z', W) + N('M50 19.2Q53.4 18.6 56.2 17.6L57 26.6Q54 27.4 50.6 27.8Z', '#e2d8cc');
    case 'scarf':
      return P('M16.6 39C13.6 18.4 25.4 8 40 8C54.6 8 66.4 18.4 63.4 39C61.4 31 58.4 25.2 52.6 22.2C45.6 19.6 34.4 19.6 27.4 22.2C21.6 25.2 18.6 31 16.6 39Z', col)
        + N('M53 10.6C61.4 15.6 65.6 26 63.4 39C61.4 31 58.4 25.2 52.6 22.2C55.6 18.6 55.6 14 53 10.6Z', shade)
        + dots([[24, 16], [33, 12], [44, 11.6], [21, 26], [30, 19.6], [40, 17], [50, 17.6], [57, 25], [61, 33], [18.6, 34]], W, 3)
        + P('M55 10.6C58 3 67.4 2.4 67 8.6C66.6 13.4 59.4 13.6 55 10.6Z', col) + P('M55 10.6C55.6 17.6 61.6 21.4 64.4 17.4C63 14.6 59.4 12.4 55 10.6Z', shade) + P(ell(55, 10.6, 3), col);
    case 'bandana':
      return P('M60.6 27.4L69 22.6L66.6 30.4ZM60.2 28.4L67.6 33.4L60.2 33.8Z', shade)
        + P('M19.2 32.4C26 22 54 22 60.8 32.4L61.4 26.4C54 15.4 26 15.4 18.6 26.4Z', col) + N('M52 20.4Q58 22.6 61.4 26.4L60.8 32.4Q57 28 52 26Z', shade)
        + dots([[27, 24.4], [36, 21.8], [45, 21.8], [53.6, 24.4]], W, 2.6);
    default:
      return '';
  }
}

// Locks that peek out under a beanie.
const FRINGE = 'M22.6 31.2C23.4 34.6 26 36 28.6 34.2C30.6 36.4 34 36.2 35.6 33.6C37.4 35.4 40.4 35 41.6 32.6L41.4 30.4L22.8 30.4Z';

function extras(p) {
  let out = '';
  const gear = p.gear || C.ink[0];
  for (const item of p.extras || []) {
    if (item === 'earrings') out += dots([[20.4, 46.8], [59.6, 46.8]], INK, 5.6) + dots([[20.4, 46.8], [59.6, 46.8]], p.earring || C.yellow[0], 3.6);
    else if (item === 'hoops') out += L(ell(20.6, 47.8, 2.6) + ell(59.4, 47.8, 2.6), p.earring || C.yellow[0], 1.5);
    else if (item === 'clip' && !p.hat) out += P('M22.6 25.6L29.4 21.4L30.8 23.6L24 27.8Z', p.accent || C.pink[0], sw(2.8));
    else if (item === 'clip2') out += P('M22.6 25.6L29.4 21.4L30.8 23.6L24 27.8ZM24.6 30.4L31.4 26.2L32.8 28.4L26 32.6Z', p.accent || C.pink[0], sw(2.8));
    else if (item === 'flower' && !p.hat) { const petals = [[24.4, 20.2], [26.9, 22], [25.9, 24.9], [22.9, 24.9], [21.9, 22]]; out += dots(petals, INK, 6.4) + dots(petals, p.accent || C.pink[0], 4.2) + dots([[24.4, 22.6]], C.yellow[0], 3); }
    else if (item === 'headphones') out += L('M27.4 62.4C27.6 70.6 52.4 70.6 52.6 62.4', INK, 3.4) + P(ell(26.4, 63.6, 4.4, 5.2) + ell(53.6, 63.6, 4.4, 5.2), gear) + hi('M24.4 61.6Q25 59.8 26.8 59.4', 1.2, .6);
    else if (item === 'camera') {
      out += L('M22 60.6L46 78', INK, 4.4) + L('M22 60.6L46 78', gear, 2.4)
        + '<rect x="42" y="65.4" width="22" height="15.6" rx="3.4" fill="#3d3a48"/>'
        + P(ell(53.6, 73.6, 5), C.metal[0]) + N(ell(53.6, 73.6, 2.6), '#2a2633') + dots([[52.6, 72.6]], W, 1.6) + dots([[60.4, 69]], C.red[0], 2.2);
    } else if (item === 'sunglasses') out += P('M27.6 17.6h9.6l-.8 4.6q-4 2-8 0zM42.8 17.6h9.6l-.8 4.6q-4 2-8 0z', '#33263a') + L('M37.2 18.4Q40 17.4 42.8 18.4', INK, 1.4) + hi('M30 18.6L31.6 20.2M45.2 18.6L46.8 20.2', 1, .8);
    else if (item === 'pen') out += P('M14.4 31.6L24.2 41.4L22.8 42.8L13 33Z', C.blue[0], sw(2.6)) + P('M24.2 41.4L25.6 44.4L22.8 42.8Z', C.cream[0], sw(2.2));
    else if (item === 'towel') out += P('M50.4 61.4C56.6 58.4 64.6 60.6 69.2 66.4L66.6 98L57.6 98C59 84 56 70 50.4 61.4Z', W) + N('M62.6 63C66 64.4 67.6 65 69.2 66.4L66.6 98L62.8 98C64.6 86 64.4 74 62.6 63Z', '#e2d8cc') + L('M54 63.6C58.6 63 63 64.6 66.6 67.6M58.6 75.4L66.4 76.6', C.red[0], 1.6);
    else if (item === 'basket') out += L('M24.4 60.4L52 98', INK, 5.2) + L('M24.4 60.4L52 98', C.wood[0], 3) + L('M27.6 66.2L29.8 64.6M32 72.2L34.2 70.6M36.4 78.2L38.6 76.6', C.wood[1], 1.1);
    else if (item === 'gloves') {
      const glove = 'M8.6 98L10 80C9.6 74 12.4 70.4 15 70.6C15.6 66.6 19.6 66.4 20.6 69.6C22.4 67.6 25.4 68.6 25.4 71.6C27.6 71 29.4 73 28.6 76L26 98Z';
      out += P(glove + flip(glove), gear) + L('M15 70.6L15.6 78M20.6 69.6L21 77.4' + flip('M15 70.6L15.6 78M20.6 69.6L21 77.4'), INK, 1.2) + hi('M12.4 78Q12.6 74.6 14 73' + flip('M12.4 78Q12.6 74.6 14 73'), 1.4, .6);
    } else if (item === 'greens') {
      out += P('M50.6 98C49 88 51 80 56.4 75.6C57 81.6 58.4 85 61.6 88C64 82 68 78.6 72.6 77.4C71 85 70 92 70.4 98Z', C.green[0]) + L('M57 98L57.4 84M64.6 98L66 86', C.green[1], 1.3)
        + P('M13.6 98L18.4 74.6Q21.6 73.6 23.2 75.4L21 98Z', C.orange[0]) + L('M16.4 82.4L19.4 83M15.4 89.6L18.6 90', C.orange[1], 1.2) + P('M18.6 74.8C16 70.6 16.4 67.4 18.8 66.4C19.6 69.4 21 71.6 23 74.8Z', C.green[0], sw(3));
    }
  }
  return out;
}

const HELMET_SHELL = 'M17 61.6C9.6 54.6 7.6 45.6 7.6 37C7.6 19.6 22.2 5.4 40 5.4C57.8 5.4 72.4 19.6 72.4 37C72.4 45.6 70.4 54.6 63 61.6Z';
function helmet(light = C.red[0]) {
  return P(`${HELMET_SHELL}M40 16.4C27.2 16.4 18.6 25 18.6 37.4C18.6 50 27.8 57.8 40 57.8C52.2 57.8 61.4 50 61.4 37.4C61.4 25 52.8 16.4 40 16.4Z`, '#f4f6f8', ' fill-rule="evenodd"')
    + N('M60.8 13.6C68 19.6 72.4 28 72.4 37C72.4 45.6 70.4 54.6 63 61.6L57.6 61.6C61.6 58.6 64.6 53 66 47C67 40 66.8 33 64.8 27C63.8 22 62.4 17.4 60.8 13.6Z', '#c9d3db')
    + P('M12.4 25.4C15.4 13.4 26.6 6.4 40 6.4C53.4 6.4 64.6 13.4 67.6 25.4C61.4 19.6 52 15.6 40 15.6C28 15.6 18.6 19.6 12.4 25.4Z', C.yellow[0])
    + N('M52.4 8.6C60 11.4 65.6 17.6 67.6 25.4C64 22 59.6 19.2 54.6 17.4C54.4 14.2 53.8 11.2 52.4 8.6Z', C.orange[0])
    + hi('M20.4 16.6Q28 10.6 38 9.8', 2.2, .7)
    + L('M7.6 34.2V40.8M72.4 34.2V40.8', INK, 10.2) + L('M7.6 34.2V40.8M72.4 34.2V40.8', C.metal[0], 6.4)
    + dots([[7.6, 34.6]], light, 2.6) + hi('M14.4 40Q14 46 16.4 51', 2, .8)
    + P('M23 62.6C23 56.4 57 56.4 57 62.6C57 68.4 23 68.4 23 62.6Z', C.metal[0]) + N('M50 57.6C54.6 58.6 57 60.4 57 62.6C57 65.6 52 67.2 47 67.8C50.4 65 51.4 61 50 57.6Z', C.metal[1]);
}

// One person, drawn into the shared 80×80 frame. `side` puts the mood marks on the right (1) or left (-1).
function person(p, mood, side = 1) {
  let out = hairBack(p) + clothes(p);
  if (!HAIRS[p.style]?.noEars && !p.helmet) out += ears(p);
  out += P(HEAD, p.skin[0]) + N(HEAD_SHADE, p.skin[1]) + (HAIRS[p.style]?.fringe && !p.helmet && !p.lite ? N(BROW_SHADE, p.skin[1], op(.8)) : '') + faceFeatures(mood, p) + hairFront(p);
  if (p.glasses) out += glasses({ ...p.glasses, lite: p.lite });
  if (p.hat?.kind === 'beanie') out += P(FRINGE, p.hair[0]);
  out += hat(p);
  if (p.hat?.kind === 'nonla') out += L('M20.6 31Q20.4 50.6 40 58.4Q59.6 50.6 59.4 31', p.hat.strap || C.red[0], 2);
  if (p.helmet) out += helmet(p.light);
  return out + extras(p) + (side ? moodMarks(mood, side, p.helmet) : '');
}

// A single sitter is drawn 7% larger about the face so it reads at 40 px; the mood mark stays unscaled inside the circle.
// The astronaut's helmet already fills the frame, so it stays at full size and shows the stars.
const single = (p, mood) => (p.helmet ? person(p, mood, 0) : `<g transform="matrix(1.07 0 0 1.07 -2.8 -3.1)">${person(p, mood, 0)}</g>`) + moodMarks(mood, 1, p.helmet);

// The pair shares one mark, centred above the two heads.
function pairMark(mood) {
  if (mood === 'happy') return P('M40 17.6C37.6 13.4 32.6 15.2 33.6 19.4C34.4 22.6 38 24.6 40 26.4C42 24.6 45.6 22.6 46.4 19.4C47.4 15.2 42.4 13.4 40 17.6Z', C.red[0], sw(3.2)) + hi('M35.6 18.4Q36 16.6 37.6 16.4', 1.2, .7);
  if (mood === 'worried') return P('M40 12.4Q44.6 18 42.8 21Q40.2 23.2 38.6 20.2Q37.8 17.2 40 12.4Z', '#a6e0f7', sw(3)) + hi('M40 17.4Q39.8 19.2 40.6 20', 1.1, .9);
  if (mood === 'angry') return angerMark(mapPath(ANGER, (x, y) => [x - 24.5, y - 1.6]));
  return '';
}

// The anger mark: four red arcs with a cream halo, so it shows on red and orange backgrounds too.
const ANGER = 'M60 14.6Q62.4 15.2 62.6 12.6M66.4 12.6Q66.6 15.2 69 14.6M69 18.6Q66.6 18 66.4 20.6M62.6 20.6Q62.4 18 60 18.6';
const angerMark = d => L(d, '#fff3dc', 4.4) + L(d, '#e8402f', 2.2);

function moodMarks(mood, side, helmetOn) {
  const at = d => (side < 0 ? flip(d) : d);
  const dx = helmetOn ? 7 : 0;
  if (mood === 'worried') {
    return P(at(mapPath('M58.4 22.4Q63 28 61.2 31Q58.6 33.2 57 30.2Q56.2 27.2 58.4 22.4Z', (x, y) => [x + dx, y])), '#a6e0f7', sw(3))
      + hi(at(mapPath('M58.4 27.4Q58.2 29.2 59 30', (x, y) => [x + dx, y])), 1.1, .9);
  }
  if (mood === 'angry') return angerMark(at(ANGER));
  if (mood === 'happy') return N(at(star4(66, 21, 4.6)) + at(star4(70.6, 30, 2.4)), W, op(.92));
  return '';
}

// ---------------------------------------------------------------------------------------------
// Personas

const PERSONA_IDS = ['student', 'young-man', 'young-woman', 'regular', 'auntie', 'uncle', 'pair', 'gentleman', 'tourist', 'astronaut'];
const MOODS = ['happy', 'neutral', 'worried', 'angry'];
const MASCOT_MOODS = ['happy', 'cheer', 'sad', 'neutral', 'think'];

function baseSpec(random, { fem, age, anySkin = false }) {
  const pick = pickWith(random);
  const skinIndex = anySkin ? Math.floor(random() * SKIN.length) % SKIN.length : pick(LOCAL_SKIN);
  return { skinIndex, skin: SKIN[skinIndex], fem, age, extras: [], pick };
}
const clothFor = (pick, bg, list = CLOTHES) => C[pick(list.filter(name => FAMILY[name] !== (NEAR[bg] || bg)))];

function youngSpec(random, bg, fem) {
  const s = baseSpec(random, { fem, age: 'adult' });
  const { pick } = s;
  if (fem) {
    s.style = pick(['long', 'pony', 'bob', 'topbun', 'long', 'bob']);
    s.hair = HAIR[pick(['black', 'dark', 'brown', 'auburn', 'caramel', 'black'])];
    s.top = { kind: pick(['tee', 'shirt', 'cardigan', 'tee']), col: clothFor(pick, bg), graphic: random() < .5 ? W : null, button: C.yellow[0] };
    s.accent = pick([C.pink[0], C.red[0], C.yellow[0], C.mint[0], C.sky[0]]);
    if (random() < .45) s.extras.push(pick(['clip', 'flower']));
    if (random() < .4) { s.extras.push('earrings'); s.earring = pick([C.yellow[0], C.pink[0], W]); }
    if (random() < .15) s.glasses = { kind: pick(['round', 'rect']), col: pick([INK, C.plum[1], C.red[1]]) };
  } else {
    s.style = pick(['side', 'crop', 'spiky', 'curtain']);
    s.hair = HAIR[pick(['black', 'black', 'dark', 'brown', 'auburn'])];
    s.top = { kind: pick(['tee', 'hoodie', 'shirt', 'jacket']), col: clothFor(pick, bg), graphic: random() < .4 ? C.yellow[0] : null, inner: W };
    if (random() < .2) s.hat = { kind: 'backcap', col: clothFor(pick, bg) };
    if (random() < .22) { s.extras.push('headphones'); s.gear = pick([C.ink[0], C.red[0], C.blue[0]]); }
    if (random() < .25) s.glasses = { kind: pick(['round', 'rect']), col: INK };
  }
  return s;
}

const BUILDERS = {
  student(random, bg) {
    const fem = random() < .5;
    const s = baseSpec(random, { fem, age: 'teen' });
    const { pick } = s;
    s.style = fem ? pick(['pigtails', 'bob', 'pony']) : pick(['crop', 'spiky', 'side']);
    s.hair = HAIR[pick(['black', 'black', 'dark', 'brown'])];
    s.accent = pick([C.red[0], C.pink[0], C.yellow[0], C.sky[0]]);
    const neckwear = pick(['scarf', 'tie', fem ? 'bow' : 'tie']);
    s.top = { kind: 'uniform', neckwear, neck: neckwear === 'scarf' ? C.red : pick([C.blue, C.red, C.teal]), strap: clothFor(pick, bg, ['orange', 'yellow', 'green', 'sky', 'blue', 'plum', 'pink']) };
    if (random() < .35) s.glasses = { kind: pick(['round', 'rect']), col: pick([INK, C.red[1], C.blue[1], C.plum[1]]) };
    return s;
  },
  'young-man': (random, bg) => youngSpec(random, bg, false),
  'young-woman': (random, bg) => youngSpec(random, bg, true),
  regular(random, bg) {
    const fem = random() < .5;
    const s = youngSpec(random, bg, fem);
    const { pick } = s;
    s.top = { kind: random() < .6 ? 'hoodie' : 'tee', col: clothFor(pick, bg), graphic: random() < .5 ? W : null };
    s.hat = random() < .3 ? { kind: 'beanie', col: clothFor(pick, bg), pom: pick([C.cream[0], C.yellow[0], C.pink[0]]) } : null;
    if (s.hat && !['long', 'bob'].includes(s.style)) s.style = fem ? 'long' : 'crop';
    if (!s.extras.includes('headphones') && random() < .2) { s.extras.push('headphones'); s.gear = pick([C.ink[0], C.red[0], C.blue[0]]); }
    return s;
  },
  auntie(random, bg) {
    const s = baseSpec(random, { fem: true, age: 'mid' });
    const { pick } = s;
    s.style = pick(['bun', 'curly', 'bun', 'curly', 'topbun']);
    s.hair = HAIR[pick(['black', 'dark', 'brown', 'auburn'])];
    s.top = { kind: 'blouse', col: clothFor(pick, bg, ['plum', 'pink', 'red', 'green', 'teal', 'orange', 'blue']), dots: pick([W, C.yellow[0], C.cream[0]]) };
    if (random() < .75) { s.extras.push(random() < .5 ? 'earrings' : 'hoops'); s.earring = pick([C.yellow[0], C.yellow[0], C.green[0]]); }
    if (random() < .25) s.glasses = { kind: pick(['round', 'rect']), col: pick([C.plum[1], C.red[1], INK]) };
    if (random() < .6) s.lips = C.red[1];
    return s;
  },
  uncle(random, bg) {
    const s = baseSpec(random, { fem: false, age: 'mid' });
    const { pick } = s;
    s.style = pick(['buzz', 'side', 'crop', 'bald', 'buzz']);
    s.hair = HAIR[pick(['black', 'black', 'dark', 'grey'])];
    if (random() < .65) s.moustache = s.hair[0];
    s.top = { kind: 'polo', col: clothFor(pick, bg) };
    if (random() < .3) s.glasses = { kind: pick(['round', 'rect']), col: INK };
    if (random() < .22 && s.style !== 'bald') s.hat = { kind: 'cap', col: clothFor(pick, bg) };
    return s;
  },
  gentleman(random, bg) {
    const s = baseSpec(random, { fem: false, age: 'old' });
    const { pick } = s;
    s.hair = HAIR[pick(['white', 'grey', 'white'])];
    s.style = pick(['bald', 'combed', 'combed']);
    s.brow = s.hair[0];
    if (random() < .7) s.glasses = { kind: pick(['round', 'round', 'rect']), col: pick([INK, C.wood[1], C.yellow[1]]) };
    if (random() < .55) s.moustache = s.hair[0];
    if (random() < .25) s.beard = s.hair[0];
    s.top = { kind: 'cardigan', col: clothFor(pick, bg, ['red', 'green', 'teal', 'plum', 'blue', 'orange']), button: C.yellow[0] };
    if (random() < .4) {
      s.hat = { kind: pick(['fedora', 'flatcap']), col: pick([C.wood, [C.yellow[1], '#9a6f17'], C.teal, C.plum]), band: INK };
      if (s.style === 'combed') s.style = 'bald';
    }
    return s;
  },
  tourist(random, bg) {
    const fem = random() < .5;
    const s = baseSpec(random, { fem, age: 'adult', anySkin: true });
    const { pick } = s;
    s.hair = HAIR[pick(['blond', 'ginger', 'brown', 'black', 'dark', 'auburn', 'blond'])];
    s.style = fem ? pick(['long', 'bob', 'pony']) : pick(['crop', 'side', 'curtain']);
    s.eye = pick(['#8a4a2c', '#2f7fc1', '#3f8a3a', '#8a4a2c']);
    s.top = { kind: random() < .6 ? 'hawaii' : 'tee', col: clothFor(pick, bg), print: pick([W, C.yellow[0], C.pink[0]]) };
    const hatKind = pick(['sunhat', 'cap', 'sunhat', 'cap', 'none']);
    if (hatKind !== 'none') s.hat = { kind: hatKind, col: hatKind === 'sunhat' ? [C.yellow[0], C.yellow[1]] : clothFor(pick, bg), band: pick([C.red[0], C.teal[0], C.pink[0], C.blue[0]]) };
    if (hatKind === 'none') s.extras.push('sunglasses');
    if (s.hat && s.style === 'pony') s.style = 'long';
    s.extras.push('camera');
    s.gear = pick([C.red[0], C.blue[0], C.teal[0], C.orange[0]]);
    if (s.skinIndex <= 1 && random() < .6) s.freckles = true;
    return s;
  },
  astronaut(random) {
    const fem = random() < .5;
    const s = baseSpec(random, { fem, age: 'adult', anySkin: true });
    const { pick } = s;
    s.hair = HAIR[pick(['black', 'dark', 'brown', 'blond', 'ginger', 'auburn'])];
    s.style = fem ? pick(['bob', 'bob', 'long']) : pick(['crop', 'side', 'curtain']);
    const patch = pick([C.blue, C.red, C.teal, C.plum]);
    s.top = { kind: 'suit', patch: patch[0], orbit: patch === C.red ? C.yellow[0] : C.red[0], stripe: pick([C.orange[0], C.red[0], C.teal[0], C.yellow[0]]) };
    s.eye = pick(['#8a4a2c', '#6b3a22', '#2f7fc1', '#3f8a3a']);
    s.light = pick([C.red[0], '#3fd27a', C.yellow[0]]);
    s.helmet = true;
    return s;
  },
};

const ASTRO_BACK = '#28479a';

function backdrop(color, stars) {
  let out = P('M0 0H80V80H0Z', color) + O(28, 25, 31, W, op(.2));
  if (stars) out += P([[14, 22, 1.6], [64, 14, 1.2], [70, 50, 1.5], [10, 52, 1], [57, 30, .9]].map(([x, y, r]) => star4(x, y, r * 2)).join(''), C.yellow[0]);
  return out;
}

function frame(prefix, back, inner, label, cls) {
  return `<svg viewBox="0 0 80 80" class="${cls}" ${a11y(label)}><defs><clipPath id="${prefix}c"><circle cx="40" cy="40" r="39"/></clipPath></defs>`
    + `<g clip-path="url(#${prefix}c)">${back}<g stroke="${INK}" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round" paint-order="stroke">${inner}</g></g>`
    + `<circle cx="40" cy="40" r="38.9" fill="none" stroke="${INK}" stroke-width="1.9"/></svg>`;
}

/** A circular customer portrait (viewBox 0 0 80 80). */
export function customerFace({ persona = 'regular', seed = 0, mood = 'neutral', idPrefix, label } = {}) {
  const kind = PERSONA_IDS.includes(persona) ? persona : 'regular';
  const feel = MOODS.includes(mood) ? mood : 'neutral';
  const seedText = String(seed);
  const random = makeRandom(`${kind}:${seedText}`);
  const prefix = prefixFor(idPrefix, ['face', kind, hashText(seedText).toString(36), feel]);
  const pick = pickWith(random);
  const bgName = kind === 'astronaut' ? 'space' : pick(Object.keys(BACKS));
  const back = backdrop(kind === 'astronaut' ? ASTRO_BACK : BACKS[bgName], kind === 'astronaut');
  let inner;
  if (kind === 'pair') {
    const combo = pick([[false, true], [true, true], [false, false], [true, false], [false, true]]);
    const left = youngSpec(random, bgName, combo[0]), right = youngSpec(random, bgName, combo[1]);
    for (const spec of [left, right]) { spec.hat = null; spec.extras = []; spec.lite = true; }
    if (left.top.col === right.top.col) right.top.col = clothFor(pick, bgName);
    const s = .7;
    K = .86 / s;
    // Each small person snaps to a whole-unit grid (under 0.4 units at this scale) to stay inside the size budget.
    const place = (spec, x, angle) => `<g transform="translate(${r1(x - 40 * s)} ${r1(40 - 36 * s)}) scale(${s}) rotate(${angle} 40 60)"${sw(3.8)}>${minify(person(spec, feel, 0), 1)}</g>`;
    try { inner = place(left, 24.6, -5) + place(right, 55.4, 5); } finally { K = 1; }
    inner += pairMark(feel);
  } else {
    inner = single(BUILDERS[kind](random, bgName), feel);
  }
  return minify(frame(prefix, back, inner, label, `face face-${kind}`));
}

// ---------------------------------------------------------------------------------------------
// Staff: fixed designs, one per STAFF id in src/catalog.js plus the market seller.

const STAFF_SPECS = {
  // Chị Mận, the cashier: plum vest, pen behind her ear.
  cashier: { skinIndex: 1, fem: true, age: 'adult', style: 'pony', hair: HAIR.dark, accent: C.plum[0], top: { kind: 'vest', col: C.plum }, extras: ['pen', 'earrings'], earring: C.yellow[0], back: BACKS.pink },
  // Bé Na, the noodle cook: chef's toque and a green apron.
  chef: { skinIndex: 0, fem: true, age: 'teen', style: 'bob', hair: HAIR.black, top: { kind: 'apron', col: C.orange, apron: C.green, pocket: true }, hat: { kind: 'toque' }, extras: [], back: BACKS.yellow },
  // Bé Mít, the waiter: spiky hair, red bow tie, jackfruit-yellow straps.
  waiter: { skinIndex: 2, fem: false, age: 'teen', style: 'spiky', hair: HAIR.dark, top: { kind: 'uniform', neckwear: 'bow', neck: C.red, strap: C.yellow }, extras: [], back: BACKS.coral },
  // Cô Chôm, the market-goer: nón lá with a pink strap, rambutan-red blouse, basket strap.
  buyer: { skinIndex: 2, fem: true, age: 'mid', style: 'bun', hair: HAIR.black, top: { kind: 'blouse', col: C.red, dots: C.yellow[0] }, hat: { kind: 'nonla', col: ['#f6d27a', '#d6a748'], strap: C.pink[0] }, extras: ['basket'], back: BACKS.peach },
  // Anh Hấu, the broth cook: watermelon colours, bandana, towel on his shoulder.
  broth: { skinIndex: 3, fem: false, age: 'adult', style: 'crop', hair: HAIR.black, top: { kind: 'tee', col: C.green }, hat: { kind: 'bandana', col: C.red }, extras: ['towel'], back: BACKS.orange },
  // Bé Ổi, the topping helper: guava pink and green, hair clips, gloves up and ready.
  topping: { skinIndex: 1, fem: true, age: 'teen', style: 'pigtails', hair: HAIR.brown, accent: C.mint[0], top: { kind: 'apron', col: C.pink, apron: C.mint }, extras: ['clip2', 'gloves'], gear: C.sky[0], back: BACKS.pink },
  // The vegetable seller of the bargaining mini-game: headscarf, hoops, greens and a carrot.
  market: { skinIndex: 3, fem: true, age: 'mid', style: 'bun', hair: HAIR.black, top: { kind: 'blouse', col: C.teal, dots: C.yellow[0] }, hat: { kind: 'scarf', col: C.orange }, extras: ['hoops', 'greens'], earring: C.yellow[0], lips: C.red[1], back: BACKS.yellow },
  generic: { skinIndex: 1, fem: false, age: 'adult', style: 'crop', hair: HAIR.dark, top: { kind: 'apron', col: C.sky, apron: C.red, pocket: true }, hat: { kind: 'cap', col: C.red }, extras: [], back: BACKS.yellow },
};

/** A circular staff portrait (viewBox 0 0 80 80): cashier, chef, waiter, buyer, broth, topping, market. */
export function staffFace(id, { mood = 'happy', idPrefix, label } = {}) {
  const key = Object.hasOwn(STAFF_SPECS, id) && id !== 'generic' ? id : 'generic';
  const feel = MOODS.includes(mood) ? mood : 'happy';
  const base = STAFF_SPECS[key];
  const spec = { ...base, skin: SKIN[base.skinIndex], extras: [...base.extras] };
  const prefix = prefixFor(idPrefix, ['staff', key, feel]);
  return minify(frame(prefix, backdrop(spec.back, false), single(spec, feel), label, `face staff-${key}`));
}

// ---------------------------------------------------------------------------------------------
// The mascot: a chili-pepper chef in a 240×260 frame. Outline 5.5 units (2.3% of the width), drawn as an
// 11-unit stroke under the fill.

const RED = '#e8402f', RED_SHADE = '#b92b22', GREEN = '#5fae4e', GREEN_SHADE = '#3f8a3a', HAT_SHADE = '#e4d9cb';
const M_BODY = 'M120 70C156 68 179 94 179 128C179 158 170 180 162 194C176 202 198 196 214 176C214 202 190 226 152 222C137 228 106 228 92 216C74 201 63 172 63 130C63 94 84 72 120 70Z';
const M_BODY_SHADE = 'M152 78C171 90 179 108 179 128C179 158 170 180 162 194C176 202 198 196 214 176C214 202 190 226 152 222C164 204 168 180 170 156C172 126 168 98 152 78Z';
const M_APRON = 'M95 158L147 158C149 176 156 192 166 202C154 214 138 218 121 218C104 218 88 214 76 202C86 192 93 176 95 158Z';

const ML = (d, color, width, extra = '') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}"${extra}/>`;
const tube = (d, color, width) => ML(d, INK, width + 11) + ML(d, color, width);
function glove(x, y, angle = 0) {
  return `<g transform="rotate(${angle} ${x} ${y})">${P(ell(x + 10, y - 3, 5.4, 7), W)}${P(ell(x, y, 13, 12.4), W)}`
    + `${N(`M${x + 6} ${y - 10}C${x + 14} ${y - 6} ${x + 14} ${y + 6} ${x + 4} ${y + 11.6}C${x + 9} ${y + 4} ${x + 9} ${y - 4} ${x + 6} ${y - 10}Z`, HAT_SHADE)}`
    + `${ML(`M${x - 5} ${y - 11}Q${x - 4.4} ${y - 6} ${x - 2.4} ${y - 3.6}M${x + 1.6} ${y - 12}Q${x + 2} ${y - 7} ${x + 3.4} ${y - 4.6}`, INK, 3)}</g>`;
}

function mascotFace(mood) {
  const eyeX = [100, 142];
  let out = N(ell(84, 142, 11, 6.5) + ell(158, 142, 11, 6.5), '#ffa48f', op(.9)) + ML('M79 139h0M153 139h0', W, 3.6, op(.8));
  if (mood === 'cheer') {
    out += ML('M89 124Q100 108 111 124M131 124Q142 108 153 124', INK, 6.5);
  } else {
    const dx = mood === 'think' ? 3 : 0, dy = mood === 'think' ? -3 : mood === 'sad' ? 2 : 0;
    out += N(eyeX.map(x => ell(x + dx, 122 + dy, 9.6, 12)).join(''), '#2e1a19')
      + N(eyeX.map(x => ell(x + dx, 127 + dy, 6.4, 5.4)).join(''), '#7a3a2a')
      + ML(eyeX.map(x => `M${x + dx - 3.4} ${116 + dy}h0`).join(''), W, 8.4) + ML(eyeX.map(x => `M${x + dx + 3.6} ${128.6 + dy}h0`).join(''), W, 3.6);
  }
  if (mood === 'sad') out += N('M88 106H113V115L88 121ZM154 106H129V115L154 121Z', RED) + ML('M89 120.6L112.4 114.6M153 120.6L129.6 114.6', INK, 4.4);
  const brow = {
    happy: 'M90 101Q99 95 108 99M134 99Q143 95 152 101',
    cheer: 'M89 100Q99 93 109 98M133 98Q143 93 153 100',
    sad: 'M90 104Q100 103 108 96M134 96Q142 103 152 104',
    neutral: 'M91 102Q100 98 108 101M134 101Q142 98 151 102',
    think: 'M92 103Q101 101 110 103M135 96Q144 90 153 95',
  }[mood];
  out += ML(brow, INK, 5);
  if (mood === 'happy' || mood === 'cheer') {
    const big = mood === 'cheer' ? 1.25 : 1;
    const top = 138, half = 15 * big, depth = 19 * big;
    out += P(`M${121 - half} ${top}Q121 ${top + 7} ${121 + half} ${top}Q${121 + half - 2} ${top + depth} 121 ${top + depth}Q${121 - half + 2} ${top + depth} ${121 - half} ${top}Z`, '#7a1f1a', ' stroke-width="9"')
      + N(`M${121 - half * .6} ${top + depth * .74}Q121 ${top + depth * .46} ${121 + half * .6} ${top + depth * .74}Q121 ${top + depth * 1.04} ${121 - half * .6} ${top + depth * .74}Z`, '#ff8a7a')
      + N(`M${121 - half + 2.6} ${top + 1.6}Q121 ${top + 6.4} ${121 + half - 2.6} ${top + 1.6}L${121 + half - 3.4} ${top + 5}Q121 ${top + 10} ${121 - half + 3.4} ${top + 5}Z`, W);
  } else if (mood === 'sad') {
    out += ML('M109 153Q121 141 133 153', INK, 5.5)
      + P('M90 134Q83 146 86 151Q90 156 95 151Q97 145 90 134Z', '#8fd8f6', ' stroke-width="6"') + ML('M88.4 146Q88 149 89.6 150.4', W, 2.4, op(.9));
  } else if (mood === 'think') {
    out += ML('M112 146Q123 149 133 143', INK, 5);
  } else {
    out += ML('M107 141Q121 153 135 141', INK, 5.5);
  }
  return out;
}

function mascotArt(mood) {
  const jump = mood === 'cheer' ? -14 : 0;
  const hatTurn = { happy: -6, cheer: -6, sad: 9, neutral: -3, think: 5 }[mood];
  const arms = {
    happy: [['M74 158Q56 172 54 194', 54, 198, 0], ['M170 154Q196 140 200 106', 201, 98, -20]],
    cheer: [['M74 152Q50 132 46 102', 45, 94, 20], ['M168 152Q192 132 196 102', 197, 94, -20]],
    sad: [['M76 162Q68 184 72 204', 73, 208, 10], ['M166 162Q174 184 170 204', 169, 208, -10]],
    neutral: [['M74 158Q56 172 54 194', 54, 198, 0], ['M168 158Q186 172 188 194', 188, 198, 0]],
    think: [['M74 158Q52 172 64 190', 66, 192, 30], ['M168 160C194 166 196 192 160 164', 154, 158, -50]],
  }[mood];
  const legs = mood === 'cheer'
    ? [['M106 206Q98 220 88 224', 84, 228, -16], ['M136 206Q144 220 154 224', 158, 228, 16]]
    : [['M106 210L102 236', 98, 242, mood === 'sad' ? 10 : 0], ['M136 210L140 236', 144, 242, mood === 'sad' ? -10 : 0]];
  const shoe = ([, x, y, angle]) => `<g transform="rotate(${angle} ${x} ${y})">${P(`M${x - 15} ${y + 3}C${x - 15} ${y - 8} ${x + 15} ${y - 8} ${x + 15} ${y + 3}C${x + 15} ${y + 8} ${x - 15} ${y + 8} ${x - 15} ${y + 3}Z`, C.wood[1])}${ML(`M${x - 8} ${y - 2}Q${x - 2} ${y - 5} ${x + 4} ${y - 4}`, W, 3, op(.45))}</g>`;

  let out = N(ell(121, 248, jump ? 48 : 66, jump ? 6.5 : 9), '#3a1d16', op(jump ? .09 : .13));
  // The figure is drawn at 94% about its feet, leaving headroom for the cheer jump.
  out += `<g transform="matrix(.94 0 0 .94 7.3 ${15 + jump})">`;
  out += legs.map(([d]) => tube(d, RED_SHADE, 13)).join('') + legs.map(shoe).join('');
  // Body, highlight, apron with its straps, pocket and waist bow.
  out += P(M_BODY, RED) + N(M_BODY_SHADE, RED_SHADE) + ML('M80 116C80 102 87 90 98 83', W, 8, op(.45)) + ML('M78 130h0', W, 8, op(.45));
  out += tube('M96 162Q80 160 70 152M146 162Q162 160 172 152', W, 5);
  out += P(M_APRON, W) + N('M140 158L147 158C149 176 156 192 166 202C160 208 152 212 144 214C148 196 146 176 140 158Z', HAT_SHADE)
    + P('M95 158L147 158L147.6 166L94.4 166Z', C.yellow[0])
    + P('M105 182L137 182L135.4 200Q121 204 106.6 200Z', C.yellow[0], ' stroke-width="8"')
    + ML('M109 186H133', C.yellow[1], 2, ' stroke-dasharray="3.5 3"') + P('M110 189Q121 199 132 189Z', RED, ' stroke-width="6"') + ML('M116.6 184.6Q114.6 181 116.8 177.6M125.4 184.6Q123.4 181 125.6 177.6', RED, 3)
    + ML('M98 168Q121 171 144 168', HAT_SHADE, 3);
  // The calyx: a leafy collar under the hat; it wilts when the mascot is sad.
  out += mood === 'sad'
    ? P('M80 76Q66 84 68 108Q76 98 84 98Q90 92 102 94Q112 90 121 96Q130 90 140 94Q152 92 158 98Q166 98 174 108Q176 84 162 76Z', GREEN) + N('M146 76L162 76Q176 84 174 108Q166 98 158 98Q156 86 146 76Z', GREEN_SHADE)
    : P('M80 76Q62 82 62 100Q74 92 84 95Q91 85 104 90Q112 80 121 88Q130 80 138 90Q151 85 158 95Q168 92 180 100Q180 82 162 76Z', GREEN)
      + N('M146 76L162 76Q180 82 180 100Q168 92 158 95Q157 84 146 76Z', GREEN_SHADE) + ML('M72 92Q76 86 84 84M100 86Q104 83 110 83', '#a4dc8a', 3.5, op(.9));
  // The chef's hat.
  out += `<g transform="rotate(${hatTurn} 121 74)">`
    + P('M88 56C66 54 64 26 86 24C90 8 114 4 122 18C130 4 154 8 158 24C180 26 178 54 154 56Z', W)
    + N('M158 24C180 26 178 54 154 56L146 56C160 48 164 36 158 24Z', HAT_SHADE)
    + ML('M108 30Q105 41 110 50M136 30Q139 41 134 50', HAT_SHADE, 3.5)
    + P('M86 52C108 58 134 58 156 52L158 76C134 82 108 82 84 76Z', W) + N('M146 56Q152 54.6 156 52L158 76Q152 78.6 147 79.6Z', HAT_SHADE)
    + ML('M78 38Q80 30 88 28', W, 5, op(.9)) + '</g>';
  out += mascotFace(mood);
  out += arms.map(([d]) => tube(d, RED, 13)).join('') + arms.map(([, x, y, angle]) => glove(x, y, angle)).join('');
  if (mood === 'happy') out += ML('M220 82Q228 92 226 104M212 70Q222 72 229 80', INK, 4.5) + P(star4(30, 84, 9), C.yellow[0], ' stroke-width="6"');
  if (mood === 'cheer') {
    out += P(star4(30, 44, 13) + star4(212, 40, 11) + star4(22, 150, 8) + star4(220, 150, 9), C.yellow[0], ' stroke-width="6"')
      + ML('M58 30h0M186 76h0M200 120h0M40 118h0', C.pink[0], 9);
  }
  if (mood === 'think') {
    out += P(ell(180, 84, 4.5) + ell(192, 68, 7), W, ' stroke-width="7"')
      + P('M186 50C178 46 180 32 192 32C194 20 212 18 216 28C230 26 234 44 224 50C228 60 212 66 206 58C198 64 184 60 186 50Z', W, ' stroke-width="8"')
      + ML('M199 38Q199 31 206 31Q213 31 213 37Q213 41 207 43.5L207 47', INK, 5) + ML('M207 54h0', INK, 6);
  }
  return out + '</g>';
}

/** The shop mascot (viewBox 0 0 240 260): happy, cheer, sad, neutral, think. */
export function mascot(mood = 'happy', { idPrefix, label } = {}) {
  const feel = MASCOT_MOODS.includes(mood) ? mood : 'happy';
  const prefix = prefixFor(idPrefix, ['mascot', feel]);
  return minify(`<svg viewBox="0 0 240 260" class="mascot mascot-${feel}" ${a11y(label)}><g id="${prefix}m" stroke="${INK}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" paint-order="stroke">${mascotArt(feel)}</g></svg>`);
}

export const CUSTOMER_PERSONAS = Object.freeze([...PERSONA_IDS]);
export const FACE_MOODS = Object.freeze([...MOODS]);
export const STAFF_FACES = Object.freeze(Object.keys(STAFF_SPECS).filter(key => key !== 'generic'));
export const MASCOT_MOOD_IDS = Object.freeze([...MASCOT_MOODS]);
