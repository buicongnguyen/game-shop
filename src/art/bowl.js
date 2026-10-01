// Original SVG drawings for the kitchen: the bowl being assembled and the stove-top noodle pot.
// Pure string generators (no DOM access at import or call time). The same arguments, including
// idPrefix, always give the same string. Style: docs/ART-STYLE.md.

const OL = '#4a2a22';

export const TOPPING_IDS = Object.freeze(['beef', 'sausage', 'greens', 'kimchi_topping', 'egg', 'tofu', 'mushroom', 'corn',
  'fishball', 'cheese_slice', 'quail_egg', 'ricecake', 'seafood', 'crabstick', 'beefball', 'fishcake', 'seaweed', 'dumpling',
  'porkbelly', 'crispy_chicken', 'octopus']);

// ------------------------------------------------------------------ helpers
const n = v => {
  const r = Math.round(v * 10) / 10;
  return String(r === 0 ? 0 : r).replace(/^(-?)0\./, '$1.');
};
// Joins numbers with the fewest separators an SVG parser accepts.
const nums = list => {
  let out = '', prev = '';
  for (const v of list) {
    const t = n(v);
    if (out && !(t[0] === '-' || (t[0] === '.' && prev.includes('.')))) out += ' ';
    out += t;
    prev = t;
  }
  return out;
};
// Smooth closed (or open) path through points; [x, y, 1] marks a corner. Relative commands, no rounding drift.
function smooth(pts, closed = true) {
  const len = pts.length;
  const pt = i => closed ? pts[((i % len) + len) % len] : pts[Math.max(0, Math.min(len - 1, i))];
  const tan = i => pt(i)[2] ? [0, 0] : [(pt(i + 1)[0] - pt(i - 1)[0]) / 6, (pt(i + 1)[1] - pt(i - 1)[1]) / 6];
  const q = v => Math.round(v * 10);
  let cx = q(pts[0][0]), cy = q(pts[0][1]);
  let d = `M${nums([cx / 10, cy / 10])}`;
  for (let i = 0; i < (closed ? len : len - 1); i++) {
    const a = pt(i), b = pt(i + 1), ta = tan(i), tb = tan(i + 1);
    const c1 = [q(a[0] + ta[0]) - cx, q(a[1] + ta[1]) - cy], c2 = [q(b[0] - tb[0]) - cx, q(b[1] - tb[1]) - cy], e = [q(b[0]) - cx, q(b[1]) - cy];
    d += (i ? 's' + nums([...c2, ...e].map(v => v / 10)) : 'c' + nums([...c1, ...c2, ...e].map(v => v / 10)));
    cx += e[0]; cy += e[1];
  }
  return d + (closed ? 'z' : '');
}
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const extra = a => a ? ' ' + a : '';
const E = (cx, cy, rx, ry, a) => `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}"${extra(a)}/>`;
const C = (cx, cy, r, a) => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"${extra(a)}/>`;
const P = (d, a) => `<path d="${d}"${extra(a)}/>`;
const S = (w = 1.3) => `stroke="${OL}" stroke-width="${w}"`;
const LINE = (d, color, w, a) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}"${extra(a)}/>`;
// Highlights follow docs/ART-STYLE.md: white at 35-55% opacity.
const HL = (d, w = 1.1, o = .55) => LINE(d, '#fff', w, `opacity="${n(Math.min(o, .55))}"`);
const G = (transform, inner) => `<g transform="${transform}">${inner}</g>`;
const at = (x, y, a = 0, k = 1) => `translate(${n(x)} ${n(y)})${a ? ` rotate(${n(a)})` : ''}${k !== 1 ? ` scale(${n(k)})` : ''}`;
const dots = (list, r, fill) => `<g fill="${fill}">${list.map(([x, y]) => C(x, y, r)).join('')}</g>`;
// Closed outline around an ellipse with alternating bumps: amp > 0 bulges (crispy), frill < 0 dents (leafy).
function bumpy(rx, ry, bumps, amp, seed) {
  const r = rng(seed), pts = [];
  for (let i = 0; i < bumps * 2; i++) {
    const t = i / (bumps * 2) * Math.PI * 2, k = 1 + (i % 2 ? -Math.abs(amp) * .7 : amp > 0 ? amp : 0) * (.6 + r() * .8);
    pts.push([Math.cos(t) * rx * k, Math.sin(t) * ry * k]);
  }
  return smooth(pts);
}
const safeColor = c => typeof c === 'string' && /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20}|(rgb|hsl)a?\([\d\s.,%/a-z-]{1,60}\))$/.test(c.trim()) ? c.trim() : null;
const safePrefix = p => typeof p === 'string' && /^[A-Za-z_][\w-]{0,40}$/.test(p) ? p : null;
let bowlCount = 0, potCount = 0;

// ------------------------------------------------------- toppings (top-down)
// Each topping is drawn around (0,0), about 30 x 20 units, foreshortened for the 3/4 view.
const ball = (x, y, r, base, shade, inner = '') => C(x, y, r, `fill="${shade}"`) + C(x - r * .17, y - r * .22, r * .8, `fill="${base}"`) + inner + C(x, y, r, `fill="none" ${S(1.3)}`) + E(x - r * .36, y - r * .46, r * .32, r * .19, 'fill="#fff" opacity=".55"');
const sliceD = smooth([[-9.2, -.6], [-6.4, -4.6], [-1, -5.2], [5, -5.4], [9, -2.6], [9, 2], [4.4, 4.8], [-1.4, 4.4], [-7, 4]]);
const coin = (x, y) => E(x, y + 1.5, 5.4, 3.8, `fill="#a8382a" ${S(1.2)}`) + E(x, y, 5.4, 3.8, `fill="#f39a82" ${S(1.2)}`) + E(x + .3, y + .2, 3.7, 2.4, 'fill="#fbb6a1"') + dots([[x - 1.6, y - .6], [x + 1.5, y - 1], [x + .6, y + 1.2]], .55, '#fff0e6');
const kimD = bumpy(6.2, 4.4, 6, -.2, 7);
const STICK = 'M-8-2h15.6a1.2 2 0 0 1 0 4h-15.6a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z';
const DUMP = 'M-7.6 2.2q0-6.8 7.6-7t7.6 7';
const PORK = 'M-7.6-2.5h15.2v5h-15.2z';
const chunkD = [bumpy(5.2, 4.2, 6, .14, 3)];
const TENT = 'M-8 4.4c-2-5.6 2.6-10 8-9.2s7.6 6.2 4 8.4-5.4-.6-3.4-2.6';
const FISHCAKE = (() => {
  const xs = [-12, -6, 0, 6, 12], yt = [-3.6, -.4, -3.6, -.4, -3.6];
  return xs.slice(0, 4).map((x, i) => P(`M${nums([x, yt[i]])}L${nums([xs[i + 1], yt[i + 1]])}v6L${nums([x, yt[i] + 6])}z`, `fill="${i % 2 ? '#d4914a' : '#f6c072'}" ${S(1.2)}`)).join('');
})();
const KERNELS = [[-8, 0], [-5, -3], [-4.4, 2.4], [-1, -.6], [1.4, 3], [2, -3.6], [4.4, .2], [6.4, -2.4], [7.2, 3], [9.4, -.2], [-2, 5], [-7.6, -3.6]];

// A repeated topping is {u: unit drawn at the origin, at: placements [x, y, angle, scale]}, plus extra markup x.
const rep = (u, places, x = '') => ({ u, at: places, x });
const LEAF = (() => {
  const w = 4.4, L = 13;
  const pt = (t, sd, k) => { const q = [sd, -L * t]; if (k) q.push(1); return q; };
  const blade = [pt(.3, 0, 1), pt(.45, -w * .85), pt(.72, -w), pt(.95, -w * .5), pt(1.03, 0), pt(.95, w * .5), pt(.72, w), pt(.45, w * .85)];
  return P(smooth(blade), `fill="#5aae4c" ${S(1.3)}`) + LINE('M-1.8-7.8l-1 3.4', '#3f8a3a', 1.2) + P('M-1.1.4l-.8-7.6h3.8l-.8 7.6z', `fill="#eef8dc" ${S(1.2)}`) + LINE('M0-4.6v-7.6', '#b5e09a', .9);
})();

const MINI = {
  egg: G('rotate(-12)', E(0, 0, 12.6, 8.2, `fill="#e6c79e" ${S(1.5)}`) + E(-.9, -1.4, 11.2, 6.7, 'fill="#fffaf1"') + E(1.2, -.9, 6.4, 4.9, `fill="#ffbe3a" ${S(1)}`) +
    E(1.7, -.4, 4.2, 3.2, 'fill="#f2761f"') + E(-.5, -2.6, 1.8, 1, 'fill="#fff" opacity=".55"') + HL('M-9.6-2.4q2-3.4 6.4-4')),
  beef: rep(P(sliceD, `fill="#dc3a45" ${S(1.3)}`) + LINE('M-7 2.8q4 2.2 9 1.4t5.6-2', '#a3253a', 1.2) + LINE('M-8-1.4q2-3 5.4-3.4', '#fff2ee', 1.7) +
    LINE('M-3 0q1.4-1 3-.4M2.4-2.4q1.6.6 3 0M-1 2.2q1.6-.8 3 0M4.4.8q1 .6 2.4 0', '#ffd9d8', .9), [[-6, -1.6, -20], [5.4, -2.2, 14], [0, 3, -4]]),
  sausage: rep(coin(0, 0), [[0, -2.6], [-7.6, 1], [7.4, 1.6]]),
  greens: rep(LEAF, [[0, 6, 4], [-1, 5, -68], [1, 5, 74]]),
  kimchi_topping: rep(P(kimD, `fill="#ea532e" ${S(1.2)}`) + LINE('M-4.4 2.4q3.4-3.6 8.6-3.2', '#ffd6a2', 2.4) + dots([[-1.6, -1.8], [3, 1.6], [-3.6, .6]], .55, '#9e2015'),
    [[5, -2.6, 20, .9], [-6, 0, -10], [4.4, 3.4, -30, .95]], dots([[-2, -3.6], [8.6, 1], [-8, 3.6]], .7, '#fff3d6')),
  tofu: rep(P('M-4-1.2h8v4.8h-8z', `fill="#f2d7ae" ${S(1.2)}`) + P('M4-1.2l1.6-3v4.8l-1.6 3z', `fill="#e0bd8a" ${S(1.2)}`) + P('M-4-1.2l1.6-3h8l-1.6 3z', `fill="#fffcf4" ${S(1.2)}`),
    [[2, -3, 8], [-6.6, 1, -6], [6, 3.4, -3]]),
  mushroom: (() => {
    const tips = [[11, -6.4], [12.8, -2.8], [13.2, 1], [12.6, 4.6], [10.6, 7.6]];
    const d = tips.map(([x, y]) => `M-9.6 1.6Q0 ${n(y * .4)} ${n(x)} ${n(y)}`).join('');
    return LINE(d, OL, 2.8) + LINE(d, '#fffaf0', 1.5) + `<g fill="#fff0d2" ${S(1)}>${tips.map(([x, y]) => E(x + .6, y, 2.1, 1.7)).join('')}</g>` +
      E(-10.6, 1.6, 3, 2.6, `fill="#d6a46a" ${S(1.1)}`) + LINE('M-6.2-1.4l.8 6.2', OL, 3.4) + LINE('M-6.2-1.4l.8 6.2', '#f0823a', 1.8);
  })(),
  corn: `<g fill="#fbcb3e" ${S(.9)}>${KERNELS.map(([x, y]) => E(x, y, 1.8, 1.5)).join('')}</g>` + dots(KERNELS.map(([x, y]) => [x - .6, y - .5]), .45, '#fff6b8'),
  fishball: rep(ball(0, 0, 4.8, '#ffe3b2', '#e7ac62', dots([[1.6, 1.4], [-1.4, 2]], .45, '#e9ae68')), [[0, -2.2], [-7.4, 1.4], [7.4, 1.8]]),
  cheese_slice: P(smooth([[-12.4, -.6, 1], [-1, -7.6, 1], [11.8, -.4, 1], [9.4, 2.4], [9, 6.2], [6.8, 4], [1, 7.6, 1], [-3.2, 5.6], [-4.8, 8.8], [-6.8, 4.6]]), `fill="#ffd23f" ${S(1.3)}`) +
    LINE('M-10.6.4l11.4 6.6 10.4-6', '#f2aa28', 1.4) + HL('M-9.6-1.2l8.2-4.8', 1.2) + dots([[1, -1], [-4, 1]], .8, '#f6b62e'),
  quail_egg: rep(E(0, 0, 4.6, 3.4, `fill="#e3d2bc" ${S(1.2)}`) + E(-.5, -.6, 3.9, 2.6, 'fill="#fffcf6"') + E(-1.6, -1.3, 1.2, .6, 'fill="#fff"'), [[-7, 1.6, -10], [7.4, 1.9, 14]],
    G(at(.6, -2.4, 8), E(0, 0, 4.6, 3.4, `fill="#e3d2bc" ${S(1.2)}`) + E(-.4, -.5, 4, 2.7, 'fill="#fffcf6"') + C(.2, -.3, 2, `fill="#ffc23a" ${S(.7)}`) + C(.4, 0, 1.1, 'fill="#f59a26"'))),
  ricecake: rep(P('M-5-2.3h10a1.3 2.3 0 0 1 0 4.6h-10a1.3 2.3 0 0 1 0-4.6z', `fill="#fffaf1" ${S(1.2)}`) + LINE('M-5 1.3h9', '#e6cfae', 1) + E(5, 0, 1.3, 2.3, `fill="#f4e8d6" ${S(.9)}`),
    [[-4.6, -2.8, -18], [5.6, -3, -24], [-3, 2.6, -14], [6.6, 2.4, -22]], dots([[1, 0], [-8, 0]], .7, '#d9a066')),
  seafood: E(8, 1.6, 4.8, 3.2, `fill="#e3a3b6" ${S(1.1)}`) + P('M3.2.4a4.8 3 0 1 0 9.6 0a4.8 3 0 1 0-9.6 0zM6 .2a2 1.2 0 1 1 4 0a2 1.2 0 1 1-4 0z', `fill="#fff6f2" fill-rule="evenodd" ${S(1.1)}`) +
    P(smooth([[2.4, -5.8], [-2.4, -6.8], [-7.4, -4.6], [-9.4, 0], [-7.6, 4.6], [-3, 6.2], [1.4, 5.2], [1, 2.4], [-2.6, 3], [-5.2, 1.4], [-5.6, -1.4], [-3, -3.4], [1.4, -3]]), `fill="#ff8a55" ${S(1.2)}`) +
    P(smooth([[1, 3.2], [4.8, 2.2], [6.4, 5.4], [3.4, 7]]), `fill="#f0533a" ${S(1.1)}`) + LINE('M-6.6-3.2l2.2 1.8M-8.2.6l2.8.2M-6.2 4.4l2-1.8M-2.4 5.4l.6-2.4', '#ffd2b5', 1) + HL('M-6-4.2q2-1.6 5-1.8', .9),
  crabstick: rep(P(STICK, 'fill="#fff9f0"') + P('M-9-2.1h16.8v2.1h-16.8z', 'fill="#ee4a33"') + LINE('M-6-1.2h4M1-1.3h4', '#ff9b84', .8) + P(STICK, `fill="none" ${S(1.1)}`) + E(7.6, 0, 1.2, 2, `fill="#fff4ea" ${S(.8)}`),
    [[-1.4, -3.8, -16], [.6, .4, -16], [2.6, 4.6, -16]], LINE('M10.6 6.4l2.4.4M10.4 7.8l2 1.2', '#fff4ea', 1)),
  beefball: rep(ball(0, 0, 4.9, '#a8643c', '#70401f', dots([[1.4, 1], [-1.6, 1.8]], .45, '#5a2e1a') + C(2, -1.6, .4, 'fill="#d6a07a"')), [[0, -2.2], [-7.6, 1.4], [7.6, 1.8]]),
  fishcake: G('rotate(-8)', FISHCAKE + dots([[-9, 0], [-2, 1.4], [4, -1], [9.6, 1]], .5, '#c47f36') + HL('M-11-1.6l4.6 2.8M1-1.6l4.6 2.8', .9, .7)),
  seaweed: G('rotate(-6)', P('M-8.6-7l12-2.4 1.4 13.6-12 2.2z', `fill="#1e3f2a" ${S(1.3)}`) + P('M-5.4-9.6l12.4-1.8 1 13.8-12.2 1.8z', `fill="#2c5a38" ${S(1.3)}`) +
    LINE('M-3-6q2-1 4 0M0-1q2-1 4 0M-2 3q2-1 4 0', '#4c8150', .9) + LINE('M-5-9l12-1.8', '#5f9a62', 1.2) + dots([[1, -4], [3.6, 1.4]], .7, '#fff3d6')),
  dumpling: rep(P(DUMP + 'q-3.4 2.6-7.6 2.6t-7.6-2.6z', `fill="#e9cca4" ${S(1.2)}`) + P('M-6.6 1.4q0-5.6 6.4-5.8t6.6 5.8q-3 1.6-6.6 1.6t-6.4-1.6z', 'fill="#fff6e8"') +
    E(.4, .6, 3.4, 1.4, 'fill="#f6c9ae" opacity=".55"') + LINE('M-5.6-1.6q.9-1.8 1.9-.4t1.9-.9 1.9-.9 1.9-.9 1.9 0', '#d4b083', .9) + P(DUMP, `fill="none" ${S(1.2)}`), [[-6, .2, -10], [6.4, 1.2, 12]]),
  porkbelly: rep(P(PORK, 'fill="#e8786a"') + LINE('M-7.6-.6h15.2', '#fff3ea', 1.5) + LINE('M-7.6 1.3h15.2', '#fff3ea', .9) + P('M-7.6-2.5h15.2v1.4h-15.2z', 'fill="#d9822b"') +
    LINE('M-5-2.2l-.8 1M-1-2.2l-.8 1M3-2.2l-.8 1', '#7a3a22', .8) + P(PORK, `fill="none" ${S(1.2)}`), [[-1.6, -4.4, -10], [.4, .6, -6], [2.4, 5.4, -12]]),
  crispy_chicken: rep(P(chunkD[0], `fill="#efa23e" ${S(1.2)}`) + LINE('M3.6-1.4q.4 3.6-3.4 4.4', '#b8691f', 1.6) + dots([[-1.8, -1.4], [1, -2.2]], .8, '#ffd47a') + dots([[2, 1.4], [-1.2, 1.6]], .5, '#a8581a'),
    [[1, -2.4, 0], [-7, 1.4, 120, .92], [7.6, 2, 240, .96]]),
  octopus: rep(LINE(TENT, OL, 5) + LINE(TENT, '#d23f5a', 3.2) + LINE('M-7.2 3.2c-1.6-4.6 2.4-8.2 7-7.6', '#ff8aa0', 1) + dots([[-5.6, 3], [-6.4, -.6], [-4.4, -3.4], [-1, -4.6]], .75, '#fff3ec'),
    [[-4.6, 0], [5.4, 1, 0, -1]]),
};
function drawTopping(id, slot, p) {
  const m = MINI[id];
  if (typeof m === 'string') return m;
  const uid = `${p}t${slot}`;
  return `<defs><g id="${uid}">${m.u}</g></defs>` + m.at.map(([x, y, a = 0, k = 1]) =>
    `<use href="#${uid}" transform="${k < 0 ? `translate(${n(x)} ${n(y)}) scale(-1 1)` : at(x, y, a, k)}"/>`).join('') + m.x;
}

// ------------------------------------------------------------------ noodles
// Coiled wavy strands for a nest of radius rx x ry, centred on (0,0).
function coil(rx, ry, rings, wave, seed) {
  const r = rng(seed);
  return rings.map(([k, start, span, lift]) => {
    const steps = Math.max(5, Math.round(span / 27)), pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = (start + span * i / steps) * Math.PI / 180, w = 1 + wave * (i % 2 ? 1 : -1) * (.6 + r() * .6);
      pts.push([Math.cos(t) * rx * k * w, Math.sin(t) * ry * k * w - lift]);
    }
    return smooth(pts, false);
  }).join('');
}
function blob(rx, ry, count, wob, seed) {
  const r = rng(seed), pts = [];
  for (let i = 0; i < count; i++) { const t = i / count * Math.PI * 2, k = 1 + (r() - .5) * wob; pts.push([Math.cos(t) * rx * k, Math.sin(t) * ry * k]); }
  return smooth(pts);
}
const NEST = blob(29.5, 12.4, 14, .12, 21);
const SOFT_NEST = blob(31.5, 10.4, 11, .22, 5);
const COOKED = coil(29.5, 12.4, [[.9, 200, 300, 0], [.76, 30, 290, .6], [.62, 250, 280, 1.2], [.48, 80, 300, 1.8], [.34, 170, 260, 2.3], [.2, 0, 330, 2.6]], .08, 3);
// Overcooked: limp strands lying in sagging rows, some broken in two.
const SOFT = (() => {
  const r = rng(17);
  let d = '';
  for (let y = -7.4; y <= 7.6; y += 3.4) {
    const half = 31.5 * Math.sqrt(Math.max(0, 1 - (y / 10.4) ** 2)) - 2, cut = r() < .5 ? (r() - .5) * half : null;
    const spans = cut === null ? [[-half, half]] : [[-half, cut - 1.6], [cut + 1.6, half]];
    for (const [a, b] of spans) {
      const steps = Math.max(2, Math.round((b - a) / 4)), pts = [];
      for (let k = 0; k <= steps; k++) { const u = k / steps; pts.push([a + (b - a) * u, y + 1.6 * Math.sin(u * Math.PI) + (k % 2 ? .7 : -.5)]); }
      d += smooth(pts, false);
    }
  }
  return d;
})();
const COOKED_TAILS = 'M26.6 3.6q3 1.4 2.6 4t2.8 3.4M-25.8 5.8q-3.4 1-2.4 3.6';
const SOFT_TAILS = 'M27 4.6q2.6 3 0 5.4t1 5M-27 5q-2 3.4.6 5.6t-1.6 4.4M6 9.6q1 4 4 4.6';
const RAW = 'M-24-4.6L22-7.6M-25-1L23-3.6M-23 2.6L24 .4M-21 6L21 4.2M-17-8.4L19-9M-24 1L18 7.6M-20-6.6L24 2M-22 5L14-9.4M-12 8.4L26-4M-26 3.4L4-10';

function noodleNest(state, p) {
  if (state === 'raw') {
    return `<g fill="none">${LINE(RAW, '#9c7b3c', 3.4)}${LINE(RAW, '#f7ebbf', 2)}${LINE(RAW, '#fffbe6', .6, 'transform="translate(0 -.5)"')}</g>`;
  }
  const soft = state === 'soft';
  const nest = soft ? SOFT_NEST : NEST, tails = soft ? SOFT_TAILS : COOKED_TAILS;
  const [edge, body, fillCol] = soft ? ['#85521a', '#dda24a', '#a46a22'] : ['#a8641a', '#f9c443', '#d99a1e'];
  return `<defs><clipPath id="${p}nz"><path d="${nest}"/></clipPath><path id="${p}ns" d="${soft ? SOFT : COOKED}"/></defs>` +
    LINE(tails, edge, soft ? 3.8 : 3.4) + LINE(tails, body, soft ? 2.4 : 2) +
    P(nest, `fill="${fillCol}"`) +
    `<g clip-path="url(#${p}nz)" fill="none"><use href="#${p}ns" stroke="${edge}" stroke-width="${soft ? 3.9 : 3.4}"/><use href="#${p}ns" stroke="${body}" stroke-width="${soft ? 2.6 : 2.1}"/>` +
    (soft ? '' : `<use href="#${p}ns" stroke="#fff4b8" stroke-width=".7" y="-.7"/>`) + '</g>' +
    (soft ? '' : HL('M-15-6.4q12-5 27-1.4', 1.6, .55)) + P(nest, `fill="none" ${S(1.5)}`);
}

// --------------------------------------------------------------------- chili
const R = rng(42);
const FLAKES = Array.from({ length: 21 }, () => {
  const a = R() * Math.PI * 2, d = Math.sqrt(R()), x = 80 + Math.cos(a) * d * 50, y = 55 + Math.sin(a) * d * 14.5, t = R() * Math.PI;
  const v = ([u, w]) => [u * Math.cos(t) - w * Math.sin(t), u * Math.sin(t) + w * Math.cos(t)];
  const [a1, a2] = [v([3.6, -.5]), v([-1.2, 2.2])];
  return `M${nums([x - Math.cos(t) * 1.8, y - Math.sin(t) * 1.8])}l${nums([...a1, ...a2])}z`;
});
const RINGS = [[66, 50], [97, 60.6], [83, 46.4], [57.6, 62.4], [104.4, 49.6]];
const DROPS = [[40, 52], [119, 56], [52, 65], [108, 65], [33, 58], [127, 50], [70, 68.4]];
const SWIRLS = ['M28 57q12-7 26-3t12 3', 'M102 67q12 2 24-5', 'M54 43q16-4 34 0'];
const TINT = [0, .05, .1, .16, .24, .33, .43, .56];
const RING_COUNT = [0, 0, 1, 1, 2, 3, 4, 5];
const SWIRL_COUNT = [0, 0, 1, 1, 2, 2, 3, 3];
const OIL_RING = [0, 0, 0, 1.6, 2.6, 3.6, 4.6, 5.8];

// ---------------------------------------------------------------------- bowl
/**
 * The bowl being assembled, seen at a 3/4 angle from above.
 * @param {{brothColor?: string|null, noodles?: 'raw'|'cooked'|'soft'|null, toppings?: string[], spice?: number, idPrefix?: string}} [options]
 * @returns {string} SVG markup, viewBox "0 0 160 120".
 */
export function bowlArt({ brothColor = null, noodles = null, toppings = [], spice = 0, idPrefix } = {}) {
  const p = safePrefix(idPrefix) || `bowl${++bowlCount}-`;
  const broth = safeColor(brothColor);
  const heat = Math.max(0, Math.min(7, Math.round(Number(spice) || 0)));
  const noodle = ['raw', 'cooked', 'soft'].includes(noodles) ? noodles : null;
  const tops = (Array.isArray(toppings) ? toppings : []).filter(id => Object.prototype.hasOwnProperty.call(MINI, id)).slice(0, 4);
  const BODY = 'M10 50C12 76 36 100 80 100S148 76 150 50A70 25 0 0 1 10 50Z';

  let s = `<svg class="bowl-art" viewBox="0 0 160 120" aria-hidden="true" focusable="false" stroke-linecap="round" stroke-linejoin="round">` +
    `<defs><linearGradient id="${p}bd" x2="1"><stop offset="0" stop-color="#ff7a5c"/><stop offset=".42" stop-color="#ea4632"/><stop offset=".43" stop-color="#d63a2a"/><stop offset="1" stop-color="#b52a20"/></linearGradient>` +
    `<linearGradient id="${p}in" x2="0" y2="1"><stop offset="0" stop-color="#e9cfa8"/><stop offset=".45" stop-color="#fbebd2"/><stop offset="1" stop-color="#fff8ea"/></linearGradient>` +
    `<clipPath id="${p}cl"><ellipse cx="80" cy="51.5" rx="63" ry="21"/></clipPath><clipPath id="${p}cb"><path d="${BODY}"/></clipPath>` +
    (broth ? `<linearGradient id="${p}bg" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".14"/></linearGradient>` : '') +
    (heat > 1 ? `<g id="${p}cr">${C(0, 0, 3.2, `fill="#e8402f" ${S(1.1)}`)}${C(0, 0, 1.8, 'fill="#ffb38f"')}${dots([[-.6, .3], [.7, -.4]], .45, '#fff6e0')}${HL('M-2.4-1q1-1.6 2.6-1.8', .8)}</g>` : '') +
    '</defs>' + E(80, 111, 54, 6.5, 'fill="#3a1d16" opacity=".13"');

  // steam rises from hot broth
  if (broth) {
    const st = 'M62 22c-5-4 3-7 0-11s4-7 1-10M96 20c-4-4 3-6 0-10';
    s += `<g class="bowl-steam" fill="none">${LINE(st, OL, 5, 'opacity=".12"')}${LINE(st, '#fff', 3.2, 'opacity=".9"')}</g>`;
  }
  // foot, body, painted band and gloss
  s += P('M56 96l3.4 9.6h41.2L104 96z', `fill="#9c2219" ${S(3)}`) + P(BODY, `fill="url(#${p}bd)" ${S(3.4)}`) +
    `<g clip-path="url(#${p}cb)" fill="none"><path d="M13 61A67 26.6 0 0 0 147 61" stroke="#fff3dc" stroke-width="7"/><path d="M13 61A67 26.6 0 0 0 147 61" stroke="#e8402f" stroke-width="2.6" stroke-dasharray="0 7.4"/>` +
    `<path d="M13 56.4A67 26.6 0 0 0 147 56.4M13 65.6A67 26.6 0 0 0 147 65.6" stroke="#9c2219" stroke-width="1.2"/><path d="M22 72q8 16 26 23" stroke="#fff" stroke-width="4" opacity=".4"/></g>` +
    E(80, 50, 70, 25, `fill="#fff3dc" ${S(3.4)}`) + E(80, 51.5, 63, 21, `fill="url(#${p}in)" stroke="#c9a57e" stroke-width="1.2"`) +
    HL('M22 41q22-15 60-16.6', 2.6, .9) + HL('M131 37q8 4 11 8', 1.6, .7);

  s += `<g clip-path="url(#${p}cl)">`;
  if (broth) {
    s += E(80, 55, 60, 19.4, `fill="${broth}"`) + E(80, 55, 60, 19.4, `fill="url(#${p}bg)"`) + P('M20 55A60 19.4 0 0 1 140 55A60 15.4 0 0 0 20 55Z', 'fill="#000" opacity=".16"');
    if (heat) {
      const sw = SWIRLS.slice(0, SWIRL_COUNT[heat]).join('');
      s += E(80, 55, 60, 19.4, `fill="#d8321f" opacity="${TINT[heat]}"`) + (OIL_RING[heat] ? E(80, 55.4, 59, 18.8, `fill="none" stroke="#d42e1c" stroke-width="${OIL_RING[heat]}" opacity=".75"`) : '') + (sw ? LINE(sw, '#e8402f', 2.4, 'opacity=".85"') + LINE(sw, '#ff9a5a', .8, 'transform="translate(0 -.8)"') : '') +
        P(DROPS.slice(0, heat).map(([x, y]) => `M${nums([x - 2.6, y])}a2.6 1.3 0 1 0 5.2 0a2.6 1.3 0 1 0-5.2 0z`).join(''), 'fill="#e8402f" stroke="#ff9a4a" stroke-width=".8"') +
        LINE(DROPS.slice(0, heat).map(([x, y]) => `M${nums([x - 1.4, y - .5])}h1`).join(''), '#fff', .8, 'opacity=".55"');
    }
    s += HL('M34 50q16-7 40-8', 2.6, .55) + E(112, 47, 4, 1.2, 'fill="#fff" opacity=".4"') + E(46, 63, 2.2, 1, 'fill="#fff" opacity=".35"') + E(118, 62, 1.6, .8, 'fill="#fff" opacity=".35"');
  } else {
    // empty bowl floor with a painted ring
    s += E(80, 60, 30, 8.6, 'fill="#f2dcbb"') + E(80, 60, 17, 4.6, 'fill="none" stroke="#e8402f" stroke-width="1.4"') + C(80, 60, 1.4, 'fill="#e8402f"');
  }
  if (noodle) s += G(at(80, broth ? 57.5 : 59.5), noodleNest(noodle, p));
  const SLOTS = [[114, 55], [46, 55], [99, 43], [61, 43]];
  tops.map((id, i) => [id, SLOTS[i], i]).sort((a, b) => a[1][1] - b[1][1])
    .forEach(([id, [x, y], slot]) => { s += E(x + 1, y + 5.4, 15, 4.2, 'fill="#000" opacity=".12"') + G(at(x, y, 0, 1.18), drawTopping(id, slot, p)); });
  if (heat) {
    s += P(FLAKES.slice(0, heat * 3).join(''), 'fill="#a81e14"');
    s += RINGS.slice(0, RING_COUNT[heat]).map(([x, y]) => `<use href="#${p}cr" x="${x}" y="${y}"/>`).join('');
  }
  // front lip drawn last so the contents sit inside the bowl
  return s + '</g>' + LINE('M17 51.5A63 21 0 0 0 143 51.5', '#c9a57e', 1.2) + P('M10 50A70 25 0 0 0 150 50', `fill="none" ${S(3.4)}`) + HL('M36 70q20 6 44 6', 1.4, .6) + '</svg>';
}

// ----------------------------------------------------------------- noodle pot
/**
 * Stove-top noodle pot. Class names are the game's styling hooks:
 * .pot-art (root), .steam (3 curls), .pot-flame, .pot-handle, .pot-body, .pot-rim, .pot-water, .pot-noodles.
 * @param {{idPrefix?: string}} [options]
 * @returns {string} SVG markup, viewBox "0 0 64 56".
 */
export function noodlePot({ idPrefix } = {}) {
  const p = safePrefix(idPrefix) || `pot${++potCount}-`;
  // A flame tongue: base centred on x at the burner, tip leaning by `lean`.
  const tongue = (x, w, h, lean) => {
    const b = 52.2, l = x - w / 2, r = x + w / 2, tx = x + lean;
    return `M${nums([l, b])}C${nums([l, b - h * .45, tx - w * .3, b - h * .7, tx, b - h])}C${nums([tx + w * .2, b - h * .6, r, b - h * .4, r, b])}Z`;
  };
  const FL = [[12.4, -1.6, 1], [20.4, -.8, .82], [28.2, -.3, .78], [35.8, .3, .78], [43.6, .8, .82], [51.6, 1.6, 1]];
  const outer = FL.map(([x, lean, k]) => tongue(x, 6.8 * k, 11.6 * k, lean)).join('');
  const inner = FL.map(([x, lean, k]) => tongue(x + lean * .2, 3.4 * k, 6.6 * k, lean * .6)).join('');
  return `<svg class="pot-art" viewBox="0 0 64 56" aria-hidden="true" focusable="false" stroke-linecap="round" stroke-linejoin="round">` +
    `<defs><linearGradient id="${p}m" x2="1"><stop offset="0" stop-color="#f5f8fa"/><stop offset=".32" stop-color="#d9e0e5"/><stop offset=".58" stop-color="#c3cdd5"/><stop offset=".59" stop-color="#a4b0bb"/><stop offset="1" stop-color="#86929f"/></linearGradient></defs>` +
    `<g class="steam" fill="none" stroke="#d9c6b8" stroke-width="2.4"><path d="M22 15.4c-4-4.4 3.4-7.4 0-12.4"/><path d="M32 13.8c-4-4.4 3.4-7.4 0-12.4"/><path d="M42 15.4c-4-4.4 3.4-7.4 0-12.4"/></g>` +
    // the burner stays visible; the flame only shows while boiling (game CSS)
    E(32, 52.4, 21.4, 2.8, `fill="#5d4a46" ${S(1.6)}`) + E(32, 52, 17, 1.6, 'fill="#3a2a28"') +
    LINE('M17.4 51.6v-5.4M46.6 51.6v-5.4M32 52.4v-5.6', '#3a2a28', 2.2) +
    `<g class="pot-flame"><path d="${outer}" fill="#3f8fe8" ${S(1.2)}/><path d="${inner}" fill="#ffc94a"/></g>` +
    `<path class="pot-handle" d="M10.6 26.4H7.4Q4.4 26.4 4.4 29.4T7.4 32.4H11M53.4 26.4h3.2q3 0 3 3t-3 3H53" fill="none" stroke="#5a3a2e" stroke-width="3.2"/>` +
    `<path class="pot-body" d="M9 22L10.4 39.4Q11.2 45.8 18 46H46Q52.8 45.8 53.6 39.4L55 22Z" fill="url(#${p}m)" stroke="${OL}" stroke-width="1.8"/>` +
    LINE('M10.3 32.6A21.7 5.6 0 0 0 53.7 32.6', '#7d8996', 1.1) + LINE('M10.5 34.4A21.5 5.5 0 0 0 53.5 34.4', '#fff', .9, 'opacity=".55"') + HL('M15 34.6v6.6', 2.4, .75) + HL('M18.6 36.8v5', 1, .6) +
    `<ellipse class="pot-rim" cx="32" cy="22" rx="23" ry="6.4" fill="#eef2f5" stroke="${OL}" stroke-width="1.8"/>` + E(32, 22.6, 20, 4.8, 'fill="#7f8b97"') +
    `<ellipse class="pot-water" cx="32" cy="23.5" rx="19" ry="3.8" fill="#a9dcf3"/>` + P('M13 23.5A19 3.8 0 0 1 51 23.5A19 2.6 0 0 0 13 23.5Z', 'fill="#000" opacity=".14"') +
    `<path class="pot-noodles" d="M17.4 22.6q1.9-2.2 3.8 0t3.8 0 3.8 0 3.8 0 3.8 0 3.8 0 3.8 0M19.6 25.8q1.8-2 3.6 0t3.6 0 3.6 0 3.6 0 3.6 0 3.6 0" fill="none" stroke="#f7c242" stroke-width="2.2"/>` +
    HL('M14.6 19.4q6-3.6 14-4', 1.3, .9) + '</svg>';
}
