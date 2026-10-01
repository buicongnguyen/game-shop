// Original home-screen icon: a steaming bowl of spicy red noodles lifted with chopsticks, with a
// little chili, on a chili-red to plum background. Pure string generator (no DOM access), so
// tools/icons.mjs can render it to PNG and the same arguments always give the same string.
// Style: docs/ART-STYLE.md (outline #4a2a22, vivid warm fills, flat shade on the lower right).
//
//   appIcon()                    rounded background with transparent corners ("any" icons)
//   appIcon({ maskable: true })  full-bleed background, art inside the central 80% safe circle
//   appIcon({ fullBleed: true }) full-bleed background at the "any" art size (apple-touch-icon)

const OL = '#4a2a22';
const CREAM = '#fff3dc';
const PLUM = '#5a2334';
const VIEW = 512;
// Halo rings behind the bowl, from plum toward chili red (#e8402f), largest first. Flat colours
// only: Chromium dithers SVG gradients, and that noise would triple the size of the PNG files.
const HALO = [[236, '#7a2633'], [186, '#9e2c31'], [134, '#c7362f']];
// Chopsticks as [tip, end] in the 512-unit drawing; the upper one is drawn in front.
const STICKS = [[[262, 158], [414, 74]], [[286, 172], [436, 92]]];
// The art's smallest enclosing circle in the 512-unit drawing, outline included. tools/icons.mjs
// measures it from the rendered pixels and prints the value to use after any change to the art.
// The maskable variant scales this circle into the W3C safe zone (radius 40% of the icon).
export const ART_CIRCLE = Object.freeze({ cx: 276, cy: 260, r: 250 });
export const SAFE_RADIUS = 0.4;

const n = v => String(Math.round(v * 10) / 10);
const pt = ([x, y]) => `${n(x)} ${n(y)}`;
const S = (w = 12) => `stroke="${OL}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const LINE = (d, color, w, extra = '') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra ? ' ' + extra : ''}/>`;
const HL = (d, w = 7, o = 0.5) => LINE(d, '#fff', w, `opacity="${o}"`);

// A wavy strand from (x, y0) down to (x, y1): alternating cubic bulges of amplitude `a`.
function strand(x, y0, y1, a, waves) {
  const step = (y1 - y0) / waves;
  let d = `M${pt([x, y0])}`;
  for (let i = 0; i < waves; i++) {
    const s = (i % 2 ? -1 : 1) * a, ya = y0 + step * i;
    d += `C${pt([x + s, ya + step * 0.3])} ${pt([x + s, ya + step * 0.7])} ${pt([x, ya + step])}`;
  }
  return d;
}

// A tapered chopstick from tip T to end E with half-widths wt (tip) and we (end), round ends.
function stick(T, E, wt = 7, we = 12) {
  const dx = E[0] - T[0], dy = E[1] - T[1], len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
  const off = (P, w, s) => [P[0] + nx * w * s, P[1] + ny * w * s];
  return `M${pt(off(T, wt, 1))}L${pt(off(E, we, 1))}A${n(we)} ${n(we)} 0 0 0 ${pt(off(E, we, -1))}L${pt(off(T, wt, -1))}A${n(wt)} ${n(wt)} 0 0 0 ${pt(off(T, wt, 1))}Z`;
}
// A point a fraction t of the way from A to B, pushed sideways by `side` units.
function along(A, B, t, side = 0) {
  const dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy);
  return [A[0] + dx * t - dy / len * side, A[1] + dy * t + dx / len * side];
}

function chopstick(id, i) {
  const [T, E] = STICKS[i], band0 = along(T, E, 0.76), band1 = along(T, E, 0.9);
  return `<g>
<path d="${stick(T, E)}" fill="#d99a5e"/>
<path d="M${pt(along(T, E, 0.02, -4))}L${pt(along(T, E, 0.98, -8))}" stroke="#b06a3b" stroke-width="7" stroke-linecap="round" fill="none" clip-path="url(#${id}stick${i})"/>
<path d="M${pt(band0)}L${pt(band1)}" stroke="#e8402f" stroke-width="22" fill="none" clip-path="url(#${id}stick${i})"/>
${HL(`M${pt(along(T, E, 0.1, 3))}L${pt(along(T, E, 0.68, 5))}`, 4, 0.55)}
<path d="${stick(T, E)}" fill="none" ${S(9)}/>
</g>`;
}

function art(id) {
  // Parallel wavy noodles hanging from the chopsticks into the broth.
  const strands = [282, 296, 310, 324].map(x => strand(x, 166, 286, 6, 4));
  return `
<ellipse cx="258" cy="452" rx="138" ry="16" fill="#2a0b12" opacity=".38"/>
${LINE('M144 238C120 210 168 186 144 156C122 128 166 104 146 76', CREAM, 18, 'opacity=".9"')}
${LINE('M204 226C184 204 224 182 204 154C186 130 222 112 206 94', CREAM, 16, 'opacity=".8"')}
<path d="M190 422L198 450Q200 458 209 458H303Q312 458 314 450L322 422Z" fill="#f0c48c" ${S(11)}/>
<path d="M72 262C74 368 150 446 256 446C362 446 438 368 440 262Z" fill="${CREAM}"/>
<g clip-path="url(#${id}body)">
<path d="M48 300Q256 402 464 300L464 336Q256 438 48 336Z" fill="#e8402f"/>
${[120, 188, 256, 324, 392].map(x => { const t = (x - 48) / 416, y = 318 + 204 * t * (1 - t); return `<circle cx="${n(x)}" cy="${n(y)}" r="6.5" fill="${CREAM}"/>`; }).join('')}
<path d="M440 262C438 368 362 446 256 446C344 436 400 372 404 262Z" fill="#7a2a12" opacity=".17"/>
${HL('M104 314C116 362 146 396 180 414', 9, 0.5)}
</g>
<path d="M72 262C74 368 150 446 256 446C362 446 438 368 440 262" fill="none" ${S(12)}/>
<ellipse cx="256" cy="262" rx="184" ry="50" fill="${CREAM}" ${S(12)}/>
<ellipse cx="256" cy="264" rx="166" ry="39" fill="#efbf86"/>
<ellipse cx="256" cy="270" rx="162" ry="33" fill="#e8402f"/>
<g clip-path="url(#${id}soup)">
<ellipse cx="226" cy="262" rx="120" ry="22" fill="#f2643a"/>
<path d="M96 276C150 300 340 308 420 280L420 310L96 310Z" fill="#b92b22" opacity=".55"/>
${LINE('M150 290C180 276 200 300 232 286S286 296 318 284S374 294 404 280', OL, 18)}
${LINE('M150 290C180 276 200 300 232 286S286 296 318 284S374 294 404 280', '#f7c242', 9)}
${LINE('M216 262C242 252 262 270 292 260S344 266 376 254', OL, 16)}
${LINE('M216 262C242 252 262 270 292 260S344 266 376 254', '#f7c242', 8)}
<ellipse cx="350" cy="292" rx="9" ry="4.5" fill="#ffc34d" opacity=".9"/>
<ellipse cx="244" cy="300" rx="7" ry="3.5" fill="#ffc34d" opacity=".9"/>
<ellipse cx="394" cy="268" rx="6" ry="3" fill="#ffc34d" opacity=".85"/>
</g>
<ellipse cx="256" cy="270" rx="162" ry="33" fill="none" ${S(6)}/>
<g transform="translate(160 268) rotate(-10)">
<ellipse cx="0" cy="0" rx="42" ry="25" fill="#fffaf0" ${S(8)}/>
<ellipse cx="5" cy="-1" rx="20" ry="13.5" fill="#f59a3a" stroke="#c9672a" stroke-width="4"/>
${HL('M-28 -8C-22 -15 -12 -18 -4 -18', 5, 0.7)}
<ellipse cx="0" cy="-5" rx="6" ry="3.5" fill="#fff" opacity=".55"/>
</g>
${[[226, 246], [214, 292], [378, 248], [412, 282]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7.5" fill="#8fd36a" stroke="#3f8a3a" stroke-width="4"/>`).join('')}
${chopstick(id, 1)}
${strands.map(d => LINE(d, OL, 22)).join('')}
${strands.map(d => LINE(d, '#f7c242', 12)).join('')}
${HL(strand(279, 172, 280, 6, 4), 3.5, 0.55)}
${LINE('M270 288Q303 300 338 288', '#ffd36a', 5, 'opacity=".85"')}
${chopstick(id, 0)}
<g>
<path d="M398 338C428 324 462 344 456 380C450 420 412 452 360 462C348 464 344 454 352 448C386 428 402 402 398 374C396 358 388 346 398 338Z" fill="#e8402f" ${S(11)}/>
<path d="M452 378C450 414 418 446 370 458C404 436 424 408 426 378Z" fill="#7a2a12" opacity=".2"/>
${HL('M410 352C426 352 436 362 434 380', 6, 0.55)}
<path d="M392 346C398 326 428 320 446 336C440 348 424 350 412 358C404 356 396 352 392 346Z" fill="#5fae4e" ${S(9)}/>
${LINE('M420 332C420 316 428 304 444 298', OL, 18)}
${LINE('M420 332C420 316 428 304 444 298', '#3f8a3a', 9)}
</g>`;
}

export function appIcon({ maskable = false, fullBleed = maskable, size = VIEW, idPrefix } = {}) {
  const id = idPrefix || `app-icon-${maskable ? 'm' : fullBleed ? 'f' : 'a'}-`;
  const scale = Math.round((SAFE_RADIUS * VIEW / ART_CIRCLE.r) * 1000) / 1000;
  const place = maskable ? ` transform="translate(${VIEW / 2} ${VIEW / 2}) scale(${scale}) translate(${-ART_CIRCLE.cx} ${-ART_CIRCLE.cy})"` : '';
  // A "sunrise" of halo rings centred on the bowl, clipped to the rounded card unless full-bleed.
  const rings = `<g${fullBleed ? place : ` clip-path="url(#${id}card)"`}>${HALO.map(([r, fill]) => `<circle cx="256" cy="262" r="${r}" fill="${fill}"/>`).join('')}</g>`;
  const card = fullBleed ? `<rect width="${VIEW}" height="${VIEW}" fill="${PLUM}"/>` : `<rect x="16" y="16" width="480" height="480" rx="108" fill="${PLUM}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}" width="${size}" height="${size}" role="img" aria-label="Tiệm Mì Cay">
<defs>
<clipPath id="${id}card"><rect x="16" y="16" width="480" height="480" rx="108"/></clipPath>
<clipPath id="${id}body"><path d="M72 262C74 368 150 446 256 446C362 446 438 368 440 262Z"/></clipPath>
<clipPath id="${id}soup"><ellipse cx="256" cy="270" rx="159" ry="30"/></clipPath>
${STICKS.map(([T, E], i) => `<clipPath id="${id}stick${i}"><path d="${stick(T, E)}"/></clipPath>`).join('\n')}
</defs>
<g data-part="background">${card}${rings}</g>
<g data-part="art"${place}>${art(id)}</g>
</svg>`;
}
