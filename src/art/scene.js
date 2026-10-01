/** Original scene art for Tiệm Mì Cay, drawn as SVG strings (see docs/ART-STYLE.md).
 * Pure module: no DOM access, no external references. Every id is prefixed per call.
 * Animated parts carry these classes (keyframes live in src/style.css):
 *   shop:     steam, bob, swing, twinkle, marquee
 *   backdrop: drift, twinkle, rain
 */

const INK = '#4a2a22';
const CREAM = '#fff3dc';
const WOOD = '#b06a3b', WOOD_D = '#7a4426', WOOD_L = '#d99a5e';
const RED = '#e8402f', RED_D = '#b92b22';
const YEL = '#f7c242', YEL_D = '#c99420';
const GREEN = '#5fae4e', GREEN_D = '#3f8a3a';
const BLUE = '#2f7fc1', SKY = '#6cc3ef';
const SHADOW = '#3a1d16';

let serial = 0;
/** Ids are `${prefix}name`. A given prefix is sanitised to [A-Za-z0-9_-]; otherwise a fresh one is made per call. */
function prefixFor(kind, given) {
  const clean = given == null ? '' : String(given).replace(/[^\w-]/g, '');
  return clean || `${kind}${(++serial).toString(36)}-`;
}
const esc = text => String(text).replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
const r1 = n => Math.round(n * 10) / 10;
const at = (x, y, body) => `<g transform="translate(${x} ${y})">${body}</g>`;
const shade = (cx, cy, rx, ry = rx * .22) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${r1(ry)}" fill="${SHADOW}" opacity=".13" stroke="none"/>`;
const delay = s => s ? ` style="animation-delay:${s}s"` : '';
const anim = (cls, body, d = 0) => `<g class="${cls}"${delay(d)}>${body}</g>`;

function svgRoot(viewBox, body, { label, cls, extra = '' }) {
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" class="${cls}" ${a11y}${extra}>${body}</svg>`;
}

/* ---------- colour helpers ---------- */
function rgbOf(hex) {
  let h = String(hex || '').trim().replace('#', '');
  if (h.length === 3) h = h.replace(/./g, c => c + c);
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
const hexOf = rgb => '#' + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
function mix(a, b, t) {
  const p = rgbOf(a), q = rgbOf(b);
  return hexOf(p.map((v, i) => v + (q[i] - v) * t));
}
function hueOf(hex) {
  const [r, g, b] = rgbOf(hex).map(v => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
const safeColor = (value, fallback) => rgbOf(value) ? hexOf(rgbOf(value)) : fallback;
/** A valid awning value keeps its own (or a derived) shadow; anything else falls back to the red default pair. */
function awningColors(awning) {
  if (!rgbOf(awning?.value)) return { value: '#ef4b3f', shadow: '#c23328' };
  const value = hexOf(rgbOf(awning.value));
  return { value, shadow: safeColor(awning.shadow, mix(value, '#3a1d16', .25)) };
}
/** Deterministic pseudo-random sequence (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* =====================================================================
 * Shop scene — viewBox 0 0 600 520, transparent background.
 * ===================================================================== */

const STEAM = 'fill="none" stroke="#fff" stroke-width="4.5" opacity=".8"';
const steamCurls = (paths, d = 0) => anim('steam', `<path d="${paths}" ${STEAM}/>`, d);

function shopDefs(P, wall) {
  return `<defs>
<linearGradient id="${P}metal" x2="1"><stop offset="0" stop-color="#f7fafc"/><stop offset=".45" stop-color="#cfd8df"/><stop offset="1" stop-color="#8e9aa6"/></linearGradient>
<linearGradient id="${P}broth" y2="1"><stop offset="0" stop-color="#ff7a3d"/><stop offset="1" stop-color="#d8321f"/></linearGradient>
<linearGradient id="${P}glass" x2=".6" y2="1"><stop offset="0" stop-color="#dff5ff"/><stop offset="1" stop-color="#6cc3ef"/></linearGradient>
<linearGradient id="${P}in" y2="1"><stop offset="0" stop-color="#4a2117"/><stop offset=".55" stop-color="#7a3b25"/><stop offset="1" stop-color="#94502f"/></linearGradient>
<radialGradient id="${P}glow"><stop offset="0" stop-color="#ffe9a0" stop-opacity=".9"/><stop offset="1" stop-color="#ffb84a" stop-opacity="0"/></radialGradient>
<pattern id="${P}tile" x="0" y="404" width="18" height="18" patternUnits="userSpaceOnUse"><rect width="18" height="18" fill="#fff1d6"/><path d="M0 0h5a5 5 0 0 1-5 5zM18 0v5a5 5 0 0 1-5-5zM0 18v-5a5 5 0 0 1 5 5zM18 18h-5a5 5 0 0 1 5-5z" fill="${wall.tile}"/><path d="M9 3.5Q11 9 9 14.5Q7 9 9 3.5zM3.5 9Q9 7 14.5 9Q9 11 3.5 9z" fill="#e8402f"/><circle cx="9" cy="9" r="1.6" fill="${YEL}"/><path d="M0 .4H18M.4 0V18" stroke="#d9a27a" stroke-width=".8"/></pattern>
<clipPath id="${P}led"><rect x="60" y="203" width="480" height="10" rx="4"/></clipPath>
</defs>`;
}

/* ----- ground & building ----- */
function sidewalk() {
  const lines = [];
  const vp = x => 300 + (x - 300) * .965;
  for (let x = 46; x < 580; x += 44) lines.push(`M${r1(vp(x))} 440L${x} 474`);
  const alt = [];
  for (let i = 0, x = 24; x < 560; x += 44, i++) {
    if (i % 2) alt.push(`M${r1(vp(x))} 440H${r1(vp(x + 44))}L${r1(vp(x + 44) + .3)} 456H${r1(vp(x) + .3)}Z`);
    else alt.push(`M${r1(vp(x) - .5)} 456H${r1(vp(x + 44) - .5)}L${x + 44} 474H${x}Z`);
  }
  return `${shade(300, 492, 294, 20)}
<path d="M22 440H578L594 474H6Z" fill="#e59a6a"/>
<path d="${alt.join('')}" fill="#efb083" stroke="none"/>
<path d="M14 456H586${lines.join('')}" stroke="#c87a52" stroke-width="2" fill="none"/>
<path d="M22 440H578L594 474H6Z" fill="none"/>
<path d="M6 474H594V483Q594 490 587 490H13Q6 490 6 483Z" fill="#c5b3a3"/>
<path d="M10 484H590" stroke="#a8968a" stroke-width="3" opacity=".6"/>
<path d="M30 473q-1-6-5-8M30 473q1-7 6-9M30 473v-6M566 473q-1-5-4-7M566 473q2-6 6-7" stroke="${GREEN_D}" stroke-width="2.2" fill="none"/>`;
}

function building(P, wall, upgrades) {
  const vents = x => `<g transform="translate(${x} 101)"><rect width="44" height="21" rx="2" fill="${wall.shade}"/><path d="M4 4h16v13H4zM24 4h16v13H24z" fill="${wall.base}" stroke-width="2"/><path d="M12 4v13M4 10.5h16M32 4v13M24 10.5h16" stroke-width="2"/></g>`;
  return `<path d="M52 96H548V440H52Z" fill="${wall.base}"/>
<path d="M536 100H548V440H536Z" fill="${wall.shade}" stroke="none"/>
<path d="M54 186H546V214H54Z" fill="${wall.shade}" opacity=".55" stroke="none"/>
${vents(78)}${vents(478)}
<path d="M42 80H558V98H42Z" fill="${wall.shade}"/>
<path d="M47 85H553" stroke="${wall.light}" stroke-width="3"/>
<path d="M48 98V103M64 98V103M80 98V103M96 98V103M504 98V103M520 98V103M536 98V103M552 98V103" stroke-width="2.5"/>
<path d="M52 404H548V440H52Z" fill="url(#${P}tile)"/>
<path d="M50 404H550" stroke-width="3"/>
<path d="M541 102V440" stroke="${wall.shade}" stroke-width="7"/><path d="M538 102V440M544 102V440" stroke-width="2"/>
<g stroke-width="2"><path d="M541 150h-5M541 250h-5M541 350h-5"/></g>
${upgrades.tv ? '' : `<circle cx="456" cy="244" r="15" fill="${CREAM}"/><circle cx="456" cy="244" r="11" fill="#fffaf0" stroke-width="1.5"/><path d="M456 237V244L461 247" stroke-width="2.5"/><path d="M456 233v1.5M467 244h-1.5M456 255v-1.5M445 244h1.5" stroke-width="2"/><path d="M445 236a13 13 0 0 1 7-5" stroke="#fff" stroke-width="2.5" opacity=".7"/>`}
<rect x="508" y="296" width="22" height="13" rx="6" fill="${BLUE}"/><path d="M513 302.5h4M520 302.5h5" stroke="#fff" stroke-width="2"/>
<path d="M352 332q6-5 14-2q5 6-2 11q-9 2-12-9z" fill="${wall.shade}" opacity=".45" stroke="none"/><path d="M357 333l4 4l-1 4" stroke="${wall.shade}" stroke-width="1.5" fill="none"/>
<path d="M500 352q8-4 16 0q3 7-5 10q-10 0-11-10z" fill="${wall.shade}" opacity=".4" stroke="none"/>
<path d="M366 382h2M380 372h2M494 248h2M430 362h0" stroke="${wall.light}" stroke-width="2.5"/>
<g transform="translate(116 80)"><path d="M-9 -4Q-8 -12 0 -12Q7 -12 8 -6L14 -9L10 -2Q8 0 0 0H-6Z" fill="#b97d56" stroke-width="2"/><path d="M-5 -3Q0 -8 6 -4Q2 0 -5 -3Z" fill="#fff3dc" stroke="none"/><path d="M-9 -9L-14 -8L-9 -6" fill="${YEL}" stroke-width="1.4"/><circle cx="-4" cy="-8.5" r="1.3" fill="${INK}" stroke="none"/><path d="M-2 0v3M2 0v3" stroke-width="1.5"/><path d="M2 -9q3-1 5 1" stroke="#8d5a3b" stroke-width="1.5" fill="none"/></g>`;
}

/* ----- signs on the roof ----- */
function plankSign(level) {
  const gold = level >= 5;
  return `<path d="M228 82V72M372 82V72" stroke-width="6"/>
<rect x="190" y="24" width="220" height="52" rx="11" fill="${WOOD}"/>
<path d="M196 70H404" stroke="${WOOD_D}" stroke-width="4" opacity=".6"/>
<rect x="199" y="31" width="202" height="36" rx="7" fill="${CREAM}" stroke-width="2.5"/>
<path d="M203 61H397" stroke="#f1d9b0" stroke-width="6" opacity=".8"/>
${bowlIcon(300, 62, 1.15, RED)}
${chiliIcon(248, 50, -25, 1.1)}${chiliIcon(352, 50, 205, 1.1)}
<path d="M210 44q4-4 8 0t8 0M374 44q4-4 8 0t8 0M212 54h12M376 54h12" stroke="${RED_D}" stroke-width="2.5" fill="none"/>
<circle cx="196" cy="30" r="2" fill="${YEL}" stroke-width="1.2"/><circle cx="404" cy="30" r="2" fill="${YEL}" stroke-width="1.2"/>
${gold ? `<path d="M190 38V35q0-11 11-11h4M410 38V35q0-11-11-11h-4M190 62v3q0 11 11 11h4M410 62v3q0 11-11 11h-4" stroke="${YEL}" stroke-width="4.5"/>` : ''}`;
}

function bowlIcon(cx, base, s, fill, steam = true, steamColor = INK) {
  return at(cx, base, `<g transform="scale(${s})"><path d="M-17 -12H17Q15 2 0 2Q-15 2 -17 -12Z" fill="${fill}" stroke-width="2.5"/><path d="M-20 -12H20" stroke-width="3"/>${steam ? `<path d="M-6 -16q-3-4 0-8M0 -17q-3-4 0-8M6 -16q-3-4 0-8" fill="none" stroke="${steamColor}" stroke-width="2"/>` : ''}</g>`);
}

function chiliIcon(cx, cy, rot, s = 1) {
  return `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${s})"><path d="M-12 0Q-2 -7 10 -3Q14 -1 11 2Q0 6 -12 0Z" fill="${RED}" stroke-width="2"/><path d="M10 -3Q14 -7 16 -6" stroke="${GREEN_D}" stroke-width="2.5" fill="none"/>${s >= .8 ? '<path d="M-6 -2Q0 -4 5 -3" stroke="#fff" stroke-width="1.5" opacity=".6" fill="none"/>' : ''}</g>`;
}

function litSign(P, awning, level) {
  const gold = level >= 5;
  const frame = gold ? YEL : awning.value, frameShade = gold ? YEL_D : awning.shadow;
  const bulbs = [[], []];
  let i = 0;
  const push = (x, y) => bulbs[i++ % 2].push(`M${r1(x)} ${r1(y)}h0`);
  for (let x = 156; x <= 444; x += 16) push(x, 24);
  for (let y = 36; y <= 60; y += 12) push(452, y);
  for (let x = 444; x >= 156; x -= 16) push(x, 72);
  for (let y = 60; y >= 36; y -= 12) push(148, y);
  const bulbPath = (d, dl) => anim('twinkle', `<path d="${d}" stroke="${INK}" stroke-width="9"/><path d="${d}" stroke="#fff3a6" stroke-width="5.5"/>`, dl);
  return `<ellipse cx="300" cy="48" rx="196" ry="56" fill="url(#${P}glow)" stroke="none" opacity=".75"/>
<rect x="138" y="14" width="324" height="68" rx="14" fill="${frame}"/>
<path d="M146 77H454" stroke="${frameShade}" stroke-width="5" opacity=".9"/>
<rect x="160" y="32" width="280" height="32" rx="8" fill="#3a2236" stroke-width="2.5"/>
<rect x="164" y="36" width="272" height="24" rx="5" fill="none" stroke="${gold ? awning.value : YEL}" stroke-width="1.5" opacity=".7"/>
${bowlIcon(300, 61, 1.15, CREAM, true, CREAM)}
${chiliIcon(234, 48, -20, 1.25)}${chiliIcon(366, 48, 200, 1.25)}
<path d="M186 40l2 5 5 .5-4 3 1.5 5-4.5-3-4.5 3 1.5-5-4-3 5-.5zM414 40l2 5 5 .5-4 3 1.5 5-4.5-3-4.5 3 1.5-5-4-3 5-.5z" fill="${YEL}" stroke-width="1.5"/>
${bulbPath(bulbs[0].join(''), 0)}${bulbPath(bulbs[1].join(''), -.6)}
${level >= 9 ? `<path d="M283 16L279 3L291 10L300 1L309 10L321 3L317 16Z" fill="${YEL}" stroke-width="2.5"/><circle cx="300" cy="10" r="2.5" fill="${RED}" stroke-width="1.5"/>` : ''}`;
}

function spaceport() {
  return at(494, 82, `<path d="M-30 0V-8H30V0" fill="#8e9aa6"/><path d="M-26 -8L-30 0M26 -8L30 0" stroke-width="2.5"/>
<path d="M-30 -8H30V-14H-30Z" fill="#c9d3db"/><path d="M-24 -14l5 6M-12 -14l5 6M0 -14l5 6M12 -14l5 6" stroke="#f7c242" stroke-width="3"/>
<path d="M-11 -14Q-15 -20 -18 -16L-14 -32Q-11 -26 -11 -22ZM11 -14Q15 -20 18 -16L14 -32Q11 -26 11 -22Z" fill="${RED}" stroke-width="2.5"/>
<path d="M-11 -16V-46Q-11 -66 0 -76Q11 -66 11 -46V-16Z" fill="#fffaf0" stroke-width="2.5"/>
<path d="M4 -70Q11 -60 11 -46V-16H5V-46Q5 -60 0 -72Z" fill="#dcd2c2" stroke="none"/>
<path d="M-7 -62Q0 -66 7 -62Q4 -71 0 -76Q-4 -71 -7 -62Z" fill="${RED}" stroke-width="2.5"/>
<circle cx="0" cy="-44" r="5.5" fill="${SKY}" stroke-width="2.5"/><path d="M-2.5 -46a3 3 0 0 1 3-2" stroke="#fff" stroke-width="1.5"/>
<path d="M-1 -16V-30" stroke="${RED}" stroke-width="2"/>
<path d="M22 -14V-34" stroke-width="2.5"/>${anim('twinkle', `<circle cx="22" cy="-36" r="4" fill="#ff5a4a" stroke-width="2"/>`, -.3)}`);
}

/* ----- interior, shelf, string of tags ----- */
function interior(P, level, upgrades) {
  const planks = [];
  for (let x = 90; x < 330; x += 26) planks.push(`M${x} 186V314`);
  let shelf = `<path d="M64 186H330V314H64Z" fill="url(#${P}in)" stroke="none"/>
<path d="${planks.join('')}" stroke="#3d1a12" stroke-width="2" opacity=".35"/>
<ellipse cx="200" cy="268" rx="150" ry="62" fill="url(#${P}glow)" opacity=".38" stroke="none"/>
<path d="M78 262l10 12h-10zM316 262l-10 12h10z" fill="${WOOD_D}" stroke-width="2"/>`;
  // jar of pickled chilies
  shelf += at(88, 256, `<rect x="-11" y="-26" width="22" height="26" rx="5" fill="#cfeaf2" opacity=".9"/><path d="M-7 -6q2-6 5-2t5-3q2 4 4 0V-3H-7Z" fill="${RED}" stroke-width="1.5"/><path d="M-6 -15q3-3 5 0M1 -12q3-3 5 0" stroke="${RED}" stroke-width="2.5"/><rect x="-12" y="-31" width="24" height="7" rx="2" fill="${RED}"/><path d="M-6 -21v12" stroke="#fff" stroke-width="2" opacity=".8"/>`);
  // jar of dry noodles
  shelf += at(116, 256, `<rect x="-11" y="-24" width="22" height="24" rx="5" fill="#cfeaf2" opacity=".9"/><path d="M-7 -5q3-4 6 0t6 0M-7 -11q3-4 6 0t6 0M-7 -17q3-4 6 0t6 0" stroke="${YEL_D}" stroke-width="2.5" fill="none"/><rect x="-12" y="-29" width="24" height="6" rx="2" fill="${WOOD_L}"/><path d="M-6 -20v12" stroke="#fff" stroke-width="2" opacity=".8"/>`);
  // stack of bowls
  shelf += at(152, 256, `<path d="M-17 -6Q-15 0 -8 0H8Q15 0 17 -6Z" fill="#fffaf0"/><path d="M-19 -6Q-17 -12 -10 -12H10Q17 -12 19 -6Z" fill="#fffaf0"/><path d="M-19 -12Q-17 -18 -10 -18H10Q17 -18 19 -12Z" fill="#fffaf0"/><path d="M-19 -18Q-17 -24 -10 -24H10Q17 -24 19 -18Z" fill="#fffaf0"/><path d="M-17 -9H17M-18 -15H18M-18 -21H18" stroke="${BLUE}" stroke-width="2"/>`);
  if (level >= 3) shelf += at(186, 256, `<path d="M-10 -2Q-14 -14 -6 -18H6Q14 -14 10 -2Q8 0 0 0Q-8 0 -10 -2Z" fill="#3fae92"/><path d="M10 -12Q18 -14 18 -20" stroke-width="3" fill="none"/><path d="M-11 -12Q-17 -10 -14 -4" stroke-width="2.5" fill="none"/><rect x="-6" y="-22" width="12" height="4" rx="2" fill="#3fae92"/><circle cx="0" cy="-24" r="2.5" fill="${YEL}" stroke-width="1.5"/><path d="M-5 -13q2-2 4-1" stroke="#fff" stroke-width="2" opacity=".6"/>`);
  if (level >= 6) shelf += at(212, 256, `<rect x="-9" y="-20" width="18" height="20" rx="4" fill="#cfeaf2" opacity=".9"/><circle cx="-3" cy="-6" r="3" fill="#fff6e0" stroke-width="1.5"/><circle cx="3" cy="-9" r="3" fill="#fff6e0" stroke-width="1.5"/><circle cx="-1" cy="-13" r="3" fill="#fff6e0" stroke-width="1.5"/><rect x="-10" y="-24" width="20" height="5" rx="2" fill="${GREEN}"/>`);
  if (upgrades.bowlset) shelf += bowlset();
  shelf += at(308, 256, `<path d="M-15 -12Q-16 0 -8 0H8Q16 0 15 -12Z" fill="#d99a5e" stroke-width="2.2"/><path d="M-12 -7h24M-10 -3h20" stroke="#b06a3b" stroke-width="1.5"/><path d="M-12 -12Q-14 -22 -6 -20Q-2 -26 3 -19Q10 -24 12 -12Z" fill="${GREEN}" stroke-width="2"/><circle cx="-4" cy="-14" r="4" fill="#a8d94f" stroke-width="1.6"/><circle cx="6" cy="-14" r="3.6" fill="#a8d94f" stroke-width="1.6"/><path d="M-4 -14h0M6 -14h0" stroke="#e6f5b0" stroke-width="2"/>`);
  shelf += `<path d="M68 256H326V263H68Z" fill="${WOOD_L}"/><path d="M70 260H324" stroke="#e8b47c" stroke-width="2" opacity=".9"/>`;
  return shelf;
}

function bowlset() {
  const bowl = (x, rot, a, b) => `<g transform="translate(${x} 256) rotate(${rot})"><path d="M-11 0L-7 -6M11 0L7 -6" stroke-width="2.5"/><ellipse cx="0" cy="-17" rx="14" ry="13" fill="#fffaf0"/><ellipse cx="0" cy="-17" rx="10" ry="9" fill="${a}" stroke-width="2"/><path d="M-5 -17q2.5-5 5 0t5 0" stroke="${b}" stroke-width="2.5" fill="none"/><circle cx="0" cy="-17" r="2.2" fill="${b}" stroke="none"/><path d="M-8 -26a12 12 0 0 1 6-3" stroke="#fff" stroke-width="2" opacity=".8"/></g>`;
  return `${bowl(232, -4, '#cfe6f7', BLUE)}${bowl(258, 2, '#ffe0c9', RED)}${bowl(284, 5, '#dff1d2', GREEN_D)}`;
}

function tagString() {
  const p0 = [66, 204], c = [197, 226], p1 = [328, 204];
  const pt = t => [(1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0], (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]];
  const colors = [CREAM, '#ffd36b', '#8fd3a7', '#ffb38a', '#a8dcf5', CREAM];
  let tags = '';
  for (let i = 0; i < 11; i++) {
    const t = .07 + i * .086, [x, y] = pt(t), rot = ((i * 37) % 17) - 8;
    tags += `<g transform="translate(${r1(x)} ${r1(y)}) rotate(${rot})"><path d="M0 0V3M-5 3H5V17L3 19H-5Z" fill="${colors[i % colors.length]}" stroke-width="1.8"/><path d="M-3 9h5M-3 13h3" stroke="#c9672a" stroke-width="1.5"/></g>`;
  }
  return `<path d="M${p0}Q${c} ${p1}" fill="none" stroke-width="1.8"/>${tags}`;
}

/* ----- counter and everything on it ----- */
function counterFront(P) {
  return `<path d="M58 334H336V440H58Z" fill="url(#${P}tile)"/>
<path d="M58 334H336V344H58Z" fill="#3a1d16" opacity=".18" stroke="none"/>
<path d="M58 186V334M336 186V334" stroke="${WOOD_D}" stroke-width="9"/><path d="M53 186V334M63 186V334M331 186V334M341 186V334" stroke-width="2.5"/>
<path d="M60 310H334L340 324H54Z" fill="#e9b07a"/>
<path d="M66 314H328" stroke="#f8d3a6" stroke-width="2.5"/>
<path d="M52 324H342V334Q342 338 338 338H56Q52 338 52 334Z" fill="${WOOD}"/>
<path d="M58 328H336" stroke="${WOOD_L}" stroke-width="2"/>`;
}

function potShape(P, w, h, contents) {
  const hw = w / 2;
  return `<path d="M${-hw - 7} ${-h + 9}h7M${hw} ${-h + 9}h7" stroke-width="5"/>
<path d="M${-hw} ${-h}V-6Q${-hw} 0 ${-hw + 6} 0H${hw - 6}Q${hw} 0 ${hw} -6V${-h}Z" fill="url(#${P}metal)"/>
<path d="M${-hw + 1} ${-h + 14}H${hw - 1}" stroke="#8e9aa6" stroke-width="2"/>
<path d="M${-hw + 6} ${-h + 18}V-8" stroke="#fff" stroke-width="3" opacity=".75"/>
<ellipse cx="0" cy="${-h}" rx="${hw}" ry="${r1(w * .13)}" fill="#dde4ea"/>
<ellipse cx="0" cy="${-h + .5}" rx="${hw - 4}" ry="${r1(w * .09)}" fill="${contents}" stroke-width="2"/>
<path d="M${-hw + 9} ${-h}q3-3 6 0t6 0t6 0" stroke="${YEL_D}" stroke-width="2" fill="none"/>`;
}

function pots(P, upgrades) {
  const extra = upgrades.pot3 ? 2 : upgrades.pot2 ? 1 : 0;
  let out = '';
  // main pot on its burner
  if (upgrades.stove) {
    out += at(92, 320, `<ellipse cx="0" cy="-30" rx="50" ry="30" fill="url(#${P}glow)" stroke="none"/>
<path d="M-32 0L-26 -16H26L32 0" fill="#3b3540"/><path d="M-22 0V-16M22 0V-16" stroke="#5c5563" stroke-width="2"/><path d="M-34 0H34" stroke-width="4"/><circle cx="0" cy="-8" r="5" fill="${RED}" stroke-width="2"/>
<path d="M-28 -18Q-44 -32 -38 -58Q-32 -44 -27 -42Q-30 -54 -24 -64Q-20 -48 -14 -40H14Q20 -48 24 -64Q30 -54 27 -42Q32 -44 38 -58Q44 -32 28 -18Z" fill="#ff8a2a" stroke-width="2.5"/>
<path d="M-26 -20Q-36 -32 -32 -48Q-28 -38 -22 -36Q-24 -46 -20 -52Q-16 -40 -12 -34H12Q16 -40 20 -52Q24 -46 22 -36Q28 -38 32 -48Q36 -32 26 -20Z" fill="#ffd23f" stroke="none"/>
${at(0, -22, potShape(P, 50, 40, '#fff2dc'))}
<path d="M-26 -17Q-26 -28 -20 -34Q-18 -26 -13 -24Q-12 -32 -6 -38Q-4 -28 0 -25Q4 -28 6 -38Q12 -32 13 -24Q18 -26 20 -34Q26 -28 26 -17Z" fill="#ff8a2a" stroke-width="2.2"/>
<path d="M-20 -17Q-20 -24 -16 -27Q-14 -21 -9 -20Q-8 -26 -4 -30Q-2 -22 0 -21Q2 -22 4 -30Q8 -26 9 -20Q14 -21 16 -27Q20 -24 20 -17Z" fill="#ffe27a" stroke="none"/>
<path d="M-27 -17H27" stroke="#2f7fc1" stroke-width="6"/><path d="M-26 -17H26" stroke="#8fd8ff" stroke-width="3"/>`);
    out += steamCurls('M80 234q-6-8 0-15t0-15M92 228q-6-8 0-15t0-15M104 234q-6-8 0-15t0-15', -.2);
  } else {
    out += at(92, 320, `<rect x="-28" y="-16" width="56" height="16" rx="4" fill="#e9eef2"/><rect x="-22" y="-11" width="28" height="7" rx="2" fill="#4b4f5c" stroke-width="2"/><circle cx="16" cy="-8" r="4" fill="${RED}" stroke-width="2"/>
<path d="M-18 -16V-21M18 -16V-21" stroke-width="3"/><path d="M-8 -17q2-5 4 0q2-5 4 0q2-5 4 0" fill="#4fb3ff" stroke-width="1.5"/>
${at(0, -20, potShape(P, 50, 40, '#fff2dc'))}`);
    out += steamCurls('M82 238q-6-8 0-15t0-15M96 232q-6-8 0-15t0-15', -.2);
  }
  if (extra >= 1) {
    out += at(142, 320, `<rect x="-22" y="-8" width="44" height="8" rx="3" fill="#4b4f5c"/><path d="M-12 -8V-11M12 -8V-11" stroke-width="2.5"/>${at(0, -11, potShape(P, 40, 34, '#ffb87a'))}`);
    out += steamCurls('M136 254q-5-7 0-13t0-13M148 250q-5-7 0-13t0-13', -.9);
  }
  if (extra >= 2) {
    out += at(188, 320, `<rect x="-22" y="-8" width="44" height="8" rx="3" fill="#4b4f5c"/><path d="M-12 -8V-11M12 -8V-11" stroke-width="2.5"/>${at(0, -11, potShape(P, 40, 32, '#f3d58a'))}
<path d="M-20 -46Q0 -56 20 -44L18 -40Q0 -50 -18 -42Z" fill="#dde4ea" stroke-width="2.5"/><circle cx="0" cy="-51" r="3" fill="${INK}" stroke="none"/>`);
    out += steamCurls('M182 252q-5-7 0-13t0-13M194 256q-5-7 0-13t0-13', -1.4);
  }
  return out;
}

function heroBowl(P) {
  return at(176, 338, `${shade(0, 0, 40, 4)}
<path d="M-14 0H14L11 -6H-11Z" fill="#e8dcc8"/>
<path d="M-44 -38C-42 -15 -25 -5 -14 -5H14C25 -5 42 -15 44 -38Z" fill="#fffaf0"/>
<path d="M30 -10C38 -17 42 -26 43 -36L36 -36C35 -26 31 -16 22 -8Z" fill="#ecdfcb" stroke="none"/>
<path d="M-41 -27C-20 -19 20 -19 41 -27" stroke="${BLUE}" stroke-width="4" fill="none"/>
<path d="M-32 -20l3 3 3-3M-16 -17l3 3 3-3M0 -16l3 3 3-3M16 -17l3 3 3-3" stroke="${BLUE}" stroke-width="1.8" fill="none"/>
<path d="M-36 -32C-34 -24 -29 -18 -23 -14" stroke="#fff" stroke-width="3" opacity=".9"/>
<ellipse cx="0" cy="-38" rx="44" ry="12" fill="#fffaf0"/>
<ellipse cx="0" cy="-37" rx="38" ry="8.5" fill="url(#${P}broth)" stroke-width="2"/>
<path d="M-28 -47L52 -63" stroke-width="7"/><path d="M-28 -47L52 -63" stroke="${WOOD_L}" stroke-width="3.5"/>
<path d="M-25 -52L54 -68" stroke-width="7"/><path d="M-25 -52L54 -68" stroke="#e8b07a" stroke-width="3.5"/>
<path d="M-31 -39C-28 -51 -15 -57 0 -57C15 -57 28 -51 31 -39Q0 -31 -31 -39Z" fill="#ffd77a" stroke-width="2.5"/>
<path d="M-25 -43q4-5 8 0t8 0t8 0t8 0t8 0M-17 -49q4-5 8 0t8 0t8 0t8 0" stroke="${YEL_D}" stroke-width="2" fill="none"/>
<path d="M-8 -55Q-14 -68 -6 -72Q0 -64 -3 -54ZM-2 -55Q2 -70 11 -68Q10 -59 2 -53Z" fill="${GREEN}" stroke-width="2"/><path d="M-6 -57l0-9M2 -57l5-7" stroke="${GREEN_D}" stroke-width="1.5"/>
<g transform="rotate(-18 -20 -46)"><ellipse cx="-20" cy="-46" rx="13" ry="7" fill="#d65a45" stroke-width="2.2"/><path d="M-29 -47q5-3 9 0t8-1M-27 -43q5-2 10 0" stroke="#ffd0c2" stroke-width="1.8" fill="none"/></g>
<g transform="rotate(8 -14 -40)"><ellipse cx="-14" cy="-40" rx="12" ry="6.5" fill="#e06a52" stroke-width="2.2"/><path d="M-22 -41q5-3 9 0t7-1" stroke="#ffd0c2" stroke-width="1.8" fill="none"/></g>
<path d="M8 -45Q8 -61 21 -60Q32 -56 30 -43Q19 -38 8 -45Z" fill="#fffaf0" stroke-width="2.2"/><circle cx="19" cy="-50" r="6.5" fill="#ffa21f" stroke-width="2"/><circle cx="17" cy="-52" r="2" fill="#fff" stroke="none" opacity=".85"/>
<ellipse cx="2" cy="-40" rx="8" ry="5.5" fill="#fffaf0" stroke-width="2"/><path d="M2 -40q3-1 2-3t-4 0t1 5t7-2" stroke="#f28ab2" stroke-width="1.8" fill="none"/>
<circle cx="30" cy="-39" r="3.6" fill="${RED}" stroke-width="1.6"/><circle cx="30" cy="-39" r="1.4" fill="#ffd2a0" stroke="none"/><circle cx="-31" cy="-38" r="3.4" fill="${RED}" stroke-width="1.6"/><circle cx="-31" cy="-38" r="1.3" fill="#ffd2a0" stroke="none"/><circle cx="14" cy="-38" r="3" fill="${RED}" stroke-width="1.5"/><circle cx="14" cy="-38" r="1.1" fill="#ffd2a0" stroke="none"/>
<circle cx="-6" cy="-47" r="1.9" fill="#8fd3a7" stroke-width="1.2"/><circle cx="24" cy="-42" r="1.9" fill="#8fd3a7" stroke-width="1.2"/><circle cx="-24" cy="-38" r="1.9" fill="#8fd3a7" stroke-width="1.2"/>`)
  + steamCurls('M160 260q-7-9 0-17t0-17', 0) + steamCurls('M176 254q-7-9 0-17t0-17', -.7) + steamCurls('M192 260q-7-9 0-17t0-17', -1.3);
}

function caddy() {
  return at(298, 322, `${shade(0, 2, 36, 4)}
<path d="M-33 -18h14V-2h-14z" fill="${WOOD_L}"/><path d="M-33 -12h14" stroke="${WOOD_D}" stroke-width="1.5"/>
<path d="M-31 -18L-34 -40M-28 -18L-28 -42M-25 -18L-22 -41M-22 -18L-18 -38" stroke-width="4.5"/>
<path d="M-31 -18L-34 -40M-28 -18L-28 -42M-25 -18L-22 -41M-22 -18L-18 -38" stroke="#e8b07a" stroke-width="2"/>
<path d="M-24 -20Q-30 -32 -26 -36Q-20 -34 -22 -20Z" fill="#fffaf0" stroke-width="1.8"/>
<path d="M-16 -2V-24Q-16 -28 -12 -28H-4Q0 -28 0 -24V-2Z" fill="${RED}"/><path d="M-14 -28V-32H-2V-28Z" fill="#fffaf0" stroke-width="2"/><path d="M-8 -32L-8 -38" stroke-width="3"/><path d="M-14 -18H-2V-10H-14Z" fill="${CREAM}" stroke-width="1.5"/><path d="M-12 -14q2-2 4 0" stroke="${RED}" stroke-width="1.5"/><path d="M-13 -24v4" stroke="#fff" stroke-width="2" opacity=".7"/>
<path d="M3 -2V-22Q3 -26 6 -27V-34H10V-27Q13 -26 13 -22V-2Z" fill="#5a2e1e"/><path d="M5 -34V-38H11V-34Z" fill="${RED}" stroke-width="2"/><path d="M5.5 -20v6" stroke="#fff" stroke-width="1.8" opacity=".55"/>
<path d="M16 -2V-20Q16 -24 19 -25V-31H23V-25Q26 -24 26 -20V-2Z" fill="#e3922f"/><path d="M18 -31V-35H24V-31Z" fill="#fffaf0" stroke-width="2"/><path d="M17 -16H25V-9H17Z" fill="${CREAM}" stroke-width="1.5"/><path d="M18.5 -21v3" stroke="#fff" stroke-width="1.8" opacity=".6"/>
<path d="M-36 0H36L33 -5H-33Z" fill="${WOOD}"/>`);
}

function rag() {
  return `<path d="M104 326H130L132 358L127 355L123 360L118 355L113 360L108 355L104 358Z" fill="${SKY}"/>
<path d="M110 327V357M118 327V357M126 327V356M104 334H131M104 342H131M104 350H132" stroke="#fff" stroke-width="2" opacity=".85"/>
<path d="M104 326H130L132 358L127 355L123 360L118 355L113 360L108 355L104 358Z" fill="none" stroke-width="2"/>`;
}

/* ----- door zone ----- */
function menuBoard() {
  const row = (y, icon) => `${icon}<path d="M368 ${y}q3-3 6 0t6 0t6 0t6 0" stroke="${CREAM}" stroke-width="1.8" fill="none"/><path d="M398 ${y}h1M402 ${y}h1M406 ${y}h1" stroke="${YEL}" stroke-width="2.5"/>`;
  const miniBowl = (x, y, c) => `<path d="M${x - 4} ${y - 2}h8q-1 4-4 4t-4-4z" fill="${c}" stroke="none"/>`;
  return `<path d="M378 214L352 228M378 214L404 228" stroke-width="1.8"/><circle cx="378" cy="213" r="2.5" fill="${YEL}" stroke-width="1.5"/>
<g transform="rotate(-2 378 270)"><rect x="346" y="226" width="64" height="88" rx="6" fill="${WOOD}"/><rect x="352" y="232" width="52" height="76" rx="3" fill="#2f5446" stroke-width="2"/>
<path d="M357 236L399 236" stroke="#fff" stroke-width="2" opacity=".12"/>
${miniBowl(372, 244, '#ff8a6b')}<path d="M370 240q-1-3 0-5M374 240q-1-3 0-5" stroke="${CREAM}" stroke-width="1.2" fill="none"/>${chiliIcon(388, 243, -15, .55)}
<path d="M360 250H398" stroke="${CREAM}" stroke-width="1.2" stroke-dasharray="2 3" opacity=".7"/>
${row(260, miniBowl(362, 261, '#ff8a6b'))}${row(272, miniBowl(362, 273, YEL))}${row(284, miniBowl(362, 285, '#8fd3a7'))}${row(296, chiliIcon(362, 296, 0, .38))}
<path d="M396 303l1.5 3 3 .3-2.4 2 .8 3-2.9-1.7-2.9 1.7.8-3-2.4-2 3-.3z" fill="${YEL}" stroke="none"/></g>`;
}

function door(P, upgrades) {
  return `<path d="M420 440V288H492V440" fill="${WOOD_D}"/>
<path d="M428 440V296H484V440Z" fill="${WOOD}"/>
<path d="M442 296V440M456 352V440M470 296V440" stroke="#93552f" stroke-width="2" opacity=".7"/>
<path d="M480 300V436" stroke="#8a4c29" stroke-width="4" opacity=".5"/>
<circle cx="456" cy="328" r="18" fill="${WOOD_L}"/><circle cx="456" cy="328" r="13" fill="url(#${P}glass)" stroke-width="2.5"/>
<path d="M447 324a10 10 0 0 1 8-8M449 330l8-8" stroke="#fff" stroke-width="2.5" opacity=".85"/>
<rect x="434" y="358" width="44" height="34" rx="4" fill="#c27a45" stroke-width="2.5"/><rect x="434" y="398" width="44" height="34" rx="4" fill="#c27a45" stroke-width="2.5"/>
<path d="M437 361h38M437 401h38" stroke="#dc9a62" stroke-width="2"/>
<circle cx="474" cy="380" r="4.5" fill="${YEL}" stroke-width="2"/>
<path d="M412 440H500L502 450H410Z" fill="#cdbcab"/><path d="M414 444H498" stroke="#e6d8c8" stroke-width="2"/>
${upgrades.wifi ? `<g transform="translate(466 343) rotate(10)"><rect x="-9" y="-9" width="18" height="18" rx="5" fill="#fff" stroke-width="2"/><path d="M-5 -1a7 7 0 0 1 10 0M-3 2a4 4 0 0 1 6 0" stroke="${BLUE}" stroke-width="2" fill="none"/><circle cx="0" cy="5" r="1.5" fill="${BLUE}" stroke="none"/></g>` : ''}`;
}

/* ----- awning ----- */
function awningShape(a) {
  const n = 14, tl = 60, tr = 540, fl = 26, fr = 574, ty = 122, fy = 172, by = 186;
  const xt = i => r1(tl + (tr - tl) * i / n), xf = i => r1(fl + (fr - fl) * i / n);
  const fills = ['', ''];
  let edge = `M${fl} ${fy}V${by}`, lining = '';
  for (let i = 0; i < n; i++) {
    const m = r1((xf(i) + xf(i + 1)) / 2);
    fills[i % 2] += `M${xt(i)} ${ty}H${xt(i + 1)}L${xf(i + 1)} ${fy}V${by}Q${m} ${by + 22} ${xf(i)} ${by}Z`;
    edge += `Q${m} ${by + 22} ${xf(i + 1)} ${by}`;
    lining += `M${r1(xf(i) + 3)} ${by + 2}Q${m} ${by + 17} ${r1(xf(i + 1) - 3)} ${by + 2}`;
  }
  return `<path d="M${tl - 6} ${ty - 4}H${tr + 6}V${ty + 2}H${tl - 6}Z" fill="#8e9aa6" stroke-width="2.5"/>
<path d="${fills[0]}" fill="${a.value}" stroke="none"/><path d="${fills[1]}" fill="${CREAM}" stroke="none"/>
<path d="M${xt(0)} ${ty + 3}H${xt(n)}M${fl} ${fy + 4}H${fr}" stroke="#3a1d16" stroke-width="5" opacity=".13"/>
<path d="${lining}" stroke="${a.shadow}" stroke-width="3" fill="none" opacity=".55"/>
<path d="M${tl} ${ty}L${fl} ${fy}H${fr}L${tr} ${ty}Z${edge}V${fy}" fill="none" stroke-width="3.5"/>
<path d="M${xt(1)} ${ty + 8}L${r1(xf(1) - 2)} ${fy - 6}M${xt(5)} ${ty + 8}L${r1(xf(5) - 2)} ${fy - 6}M${xt(9)} ${ty + 8}L${r1(xf(9) - 2)} ${fy - 6}M${xt(13)} ${ty + 8}L${r1(xf(13) - 2)} ${fy - 6}" stroke="#fff" stroke-width="2.5" opacity=".35"/>`;
}

function ledStrip(P) {
  const colors = ['#ff5a4a', '#ffd23f', '#5fe08a', '#4fc3ff'];
  const groups = colors.map(() => []);
  for (let i = 0, x = 64; x <= 590; x += 9, i++) groups[i % 4].push(`M${x} 208h0`);
  return `<rect x="56" y="199" width="488" height="18" rx="7" fill="#2b1d2e"/>
<g clip-path="url(#${P}led)">${anim('marquee', groups.map((g, i) => `<path d="${g.join('')}" stroke="${colors[i]}" stroke-width="5.5"/>`).join(''))}</g>
<path d="M62 202H538" stroke="#fff" stroke-width="1.5" opacity=".15"/>`;
}

/* ----- hanging decorations ----- */
function lantern(x, y, d) {
  return at(x, y, anim('swing', `<path d="M0 0V12" stroke-width="2"/>
<rect x="-8" y="12" width="16" height="6" rx="2" fill="${YEL}" stroke-width="2.2"/>
<path d="M-16 34C-16 22 -9 18 0 18C9 18 16 22 16 34C16 46 9 50 0 50C-9 50 -16 46 -16 34Z" fill="${RED}" stroke-width="2.5"/>
<path d="M-7 19.5C-11 26 -11 42 -7 48.5M7 19.5C11 26 11 42 7 48.5M0 18V50" stroke="${RED_D}" stroke-width="2"/>
<path d="M-11 26C-13 30 -13 35 -12 39" stroke="#fff" stroke-width="2.5" opacity=".5"/>
<rect x="-8" y="50" width="16" height="6" rx="2" fill="${YEL}" stroke-width="2.2"/>
<path d="M0 56V60M-3 60H3L4 74H-4Z" stroke-width="1.8" fill="${RED}"/><path d="M-1.5 63V72M1.5 63V72" stroke="${RED_D}" stroke-width="1"/>`, d));
}

function chime(P, x, y) {
  return at(x, y, anim('swing', `<path d="M0 0V10" stroke-width="2"/>
<path d="M-12 18Q-12 10 0 10Q12 10 12 18Z" fill="${WOOD}" stroke-width="2.2"/>
<path d="M-8 18V22M-3 18V22M3 18V22M8 18V22" stroke-width="1.2"/>
<rect x="-10" y="22" width="4" height="22" rx="2" fill="url(#${P}metal)" stroke-width="1.6"/><rect x="-5" y="22" width="4" height="30" rx="2" fill="url(#${P}metal)" stroke-width="1.6"/>
<rect x="1" y="22" width="4" height="26" rx="2" fill="url(#${P}metal)" stroke-width="1.6"/><rect x="6" y="22" width="4" height="18" rx="2" fill="url(#${P}metal)" stroke-width="1.6"/>
<path d="M0 18V60" stroke-width="1.2"/><circle cx="0" cy="40" r="3" fill="${YEL}" stroke-width="1.5"/>
<path d="M-6 60H6L7 82L0 78L-7 82Z" fill="${CREAM}" stroke-width="1.8"/><path d="M-3 68q3-3 6 0q-3 3-6 0zM3 68l2-2v4z" fill="#ef5a3c" stroke="none"/>`, -.4));
}

/* ----- counter accessories ----- */
function luckyCat() {
  return at(234, 320, `${shade(0, 0, 20, 3.5)}
<rect x="-19" y="-6" width="38" height="6" rx="3" fill="${RED}" stroke-width="2.2"/>
<path d="M-15 -6Q-18 -26 -12 -32H12Q18 -26 15 -6Z" fill="#fffaf0" stroke-width="2.5"/>
<path d="M9 -30Q15 -24 14 -6H8Q10 -20 6 -30Z" fill="#ecdfcb" stroke="none"/>
<ellipse cx="0" cy="-12" rx="7" ry="5" fill="${YEL}" stroke-width="2"/><path d="M-4 -12h8" stroke="${YEL_D}" stroke-width="1.5"/>
<path d="M-15 -45L-14 -60L-6 -52ZM15 -45L14 -60L6 -52Z" fill="#fffaf0" stroke-width="2.2"/><path d="M-12 -51l-1-5 3 3zM12 -51l1-5-3 3z" fill="#f28ab2" stroke="none"/>
<ellipse cx="0" cy="-42" rx="16" ry="13" fill="#fffaf0" stroke-width="2.5"/>
<path d="M-8 -43q2.5 2 5 0M3 -43q2.5 2 5 0" stroke-width="1.8" fill="none"/><path d="M-1.5 -38h3l-1.5 1.5z" fill="#f28ab2" stroke-width="1"/>
<path d="M-12 -38h-6M-12 -36l-5 2M12 -38h6M12 -36l5 2" stroke-width="1.2"/>
<circle cx="-9" cy="-37" r="2.2" fill="#f28ab2" opacity=".6" stroke="none"/><circle cx="9" cy="-37" r="2.2" fill="#f28ab2" opacity=".6" stroke="none"/>
<path d="M-13 -30Q0 -26 13 -30" stroke="${RED}" stroke-width="3.5"/><circle cx="0" cy="-27" r="3" fill="${YEL}" stroke-width="1.6"/>
${anim('bob', `<path d="M-14 -24Q-24 -34 -21 -46Q-17 -50 -13 -46Q-14 -36 -9 -28Z" fill="#fffaf0" stroke-width="2.2"/><path d="M-20 -46l1.5 3M-17 -47l.5 3" stroke-width="1.2"/>`)}`);
}

function piggyBank() {
  return at(254, 336, `${shade(0, 0, 22, 4)}
<path d="M-12 -2V2M-4 -1V2M6 -1V2M13 -2V2" stroke-width="5"/><path d="M-12 -2V2M-4 -1V2M6 -1V2M13 -2V2" stroke="#e86f9d" stroke-width="2.5"/>
<path d="M22 -16q8-2 6 -8q-3 -3-5 1" stroke-width="2" fill="none"/>
<ellipse cx="0" cy="-15" rx="21" ry="14" fill="#f28ab2" stroke-width="2.5"/>
<path d="M8 -4Q18 -8 20 -16Q22 -6 12 -2Z" fill="#d9628f" stroke="none"/>
<path d="M-10 -27L-7 -36L0 -29Z" fill="#f28ab2" stroke-width="2"/>
<ellipse cx="-20" cy="-14" rx="5" ry="6" fill="#f7a8c8" stroke-width="2"/><path d="M-21 -16v3M-19 -16v3" stroke-width="1.5"/>
<path d="M-12 -19q2 2 4 0" stroke-width="1.8" fill="none"/>
<circle cx="4" cy="-13" r="4" fill="#fff" stroke="none" opacity=".9"/><circle cx="4" cy="-13" r="1.6" fill="${YEL}" stroke="none"/>
<path d="M-4 -28H6" stroke-width="3"/>
<path d="M-2 -29V-37A4 4 0 0 1 6 -37V-29" fill="${YEL}" stroke-width="2"/>
<path d="M-12 -22a14 10 0 0 1 8 -5" stroke="#fff" stroke-width="2.5" opacity=".6"/>
<ellipse cx="26" cy="-2" rx="5" ry="2.2" fill="${YEL}" stroke-width="1.6"/><ellipse cx="29" cy="-6" rx="5" ry="2.2" fill="${YEL}" stroke-width="1.6"/>`);
}

function flyerStack() {
  return at(314, 338, `${shade(0, 0, 18, 3)}
<path d="M-17 0L-15 -4H17L15 0Z" fill="#ffd36b" stroke-width="2"/><path d="M-16 -4L-14 -8H18L16 -4Z" fill="#8fd3a7" stroke-width="2"/><path d="M-18 -8L-15 -12H16L14 -8Z" fill="${CREAM}" stroke-width="2"/>
<path d="M-15 -12L-18 -24H14L16 -12Z" fill="#fffaf0" stroke-width="2"/><path d="M-14 -20H10" stroke="${RED}" stroke-width="2.5"/><path d="M-12 -16h6M-3 -16h9" stroke="#c9672a" stroke-width="1.5"/>`);
}

/* ----- pets ----- */
function hamster() {
  return at(80, 338, `${shade(0, 0, 18, 3)}
<path d="M-16 -2Q-20 -22 -6 -28Q8 -32 15 -20Q20 -8 14 -2Z" fill="#f0a24a" stroke-width="2.5"/>
<path d="M-12 -4Q-12 -16 0 -16Q12 -16 12 -4Z" fill="#fff3dc" stroke="none"/>
<circle cx="-10" cy="-27" r="4.5" fill="#f0a24a" stroke-width="2"/><circle cx="7" cy="-30" r="4.5" fill="#f0a24a" stroke-width="2"/><circle cx="-10" cy="-27" r="2" fill="#f7a8c8" stroke="none"/><circle cx="7" cy="-30" r="2" fill="#f7a8c8" stroke="none"/>
<circle cx="-6" cy="-19" r="2" fill="${INK}" stroke="none"/><circle cx="5" cy="-20" r="2" fill="${INK}" stroke="none"/><circle cx="-5.4" cy="-19.7" r=".7" fill="#fff" stroke="none"/><circle cx="5.6" cy="-20.7" r=".7" fill="#fff" stroke="none"/>
<circle cx="-11" cy="-14" r="3.5" fill="#f7a8c8" opacity=".7" stroke="none"/><circle cx="10" cy="-15" r="3.5" fill="#f7a8c8" opacity=".7" stroke="none"/>
<path d="M-1.2 -17h2.4l-1.2 1.4z" fill="#e86f9d" stroke-width="1"/><path d="M-2.6 -14.6q1.3 1.4 2.6 0q1.3 1.4 2.6 0" stroke-width="1.3" fill="none"/>
<g transform="rotate(25 0 -7)"><ellipse cx="0" cy="-7" rx="2.8" ry="4.6" fill="#5a3a2e" stroke-width="1.4"/><path d="M0 -10.5v7" stroke="#fff3dc" stroke-width="1.2"/></g>
<circle cx="-4" cy="-6" r="2.4" fill="#fff3dc" stroke-width="1.4"/><circle cx="4" cy="-7" r="2.4" fill="#fff3dc" stroke-width="1.4"/>
<path d="M-10 -1h5M5 -1h5" stroke="#f7a8c8" stroke-width="3"/>`);
}

function sleepyCat() {
  return `<g transform="translate(450 440) scale(-1 1)">${shade(0, 0, 40, 5)}
<path d="M-34 -4Q-40 -24 -14 -28Q14 -32 30 -20Q40 -10 32 -2Q0 2 -34 -4Z" fill="#f2a14a" stroke-width="2.5"/>
<path d="M-6 -27Q-4 -20 -8 -14M6 -28Q8 -20 4 -14M18 -25Q18 -18 14 -12M28 -19Q26 -13 22 -9" stroke="#c9672a" stroke-width="3"/>
<path d="M30 -6Q44 -6 40 4Q30 8 6 2" stroke-width="2.5" fill="#f2a14a"/><path d="M33 -3l2 6M38 -3l-1 7" stroke="#c9672a" stroke-width="2.5"/>
<path d="M-44 -6Q-48 -22 -34 -26Q-20 -28 -18 -14Q-18 -2 -30 -2Q-40 -2 -44 -6Z" fill="#f2a14a" stroke-width="2.5"/>
<path d="M-42 -20L-44 -32L-34 -25ZM-24 -24L-20 -34L-17 -22Z" fill="#f2a14a" stroke-width="2.2"/><path d="M-41 -25l-1-4 3 2zM-21 -26l1.5-4 1 4z" fill="#f7a8c8" stroke="none"/>
<path d="M-38 -12q3 2 6 0M-28 -12q3 2 6 0" stroke-width="1.8" fill="none"/><path d="M-31 -8h2l-1 1.4z" fill="#e86f9d" stroke-width="1"/>
<path d="M-40 -9h-6M-40 -7l-5 2M-20 -9h6M-20 -7l5 2" stroke-width="1.1"/>
<path d="M-36 -2Q-30 -6 -22 -2" fill="#fff3dc" stroke-width="2"/>
<path d="M-36 -20L-34 -18M-30 -22v3" stroke="#c9672a" stroke-width="2"/></g>
${anim('bob', `<path d="M470 400h6l-6 7h6M482 388h8l-8 9h8" stroke-width="2.2" fill="none"/>`)}`;
}

function shibaDog() {
  return at(380, 448, `${shade(0, 0, 30, 5)}
<path d="M18 -18Q34 -24 30 -40Q24 -48 16 -40Q24 -36 18 -28" fill="#e8954a" stroke-width="2.5"/><path d="M22 -38Q26 -36 24 -30" stroke="#fff3dc" stroke-width="3"/>
<path d="M-20 0Q-26 -26 -14 -40H14Q26 -26 20 0Z" fill="#e8954a" stroke-width="2.5"/>
<path d="M-10 0Q-12 -24 0 -30Q12 -24 10 0Z" fill="#fff3dc" stroke="none"/>
<path d="M-12 0V-14M12 0V-14" stroke-width="2.5"/><path d="M-17 0Q-16 -6 -10 -6Q-6 -4 -6 0ZM17 0Q16 -6 10 -6Q6 -4 6 0Z" fill="#fff3dc" stroke-width="2.2"/>
<path d="M-24 -58L-22 -78L-8 -66ZM24 -58L22 -78L8 -66Z" fill="#e8954a" stroke-width="2.5"/><path d="M-20 -63l-1-9 7 6zM20 -63l1-9-7 6z" fill="#fff3dc" stroke="none"/>
<path d="M-26 -50Q-26 -68 0 -68Q26 -68 26 -50Q26 -34 0 -34Q-26 -34 -26 -50Z" fill="#e8954a" stroke-width="2.5"/>
<path d="M-18 -42Q-20 -50 -10 -50Q-4 -48 0 -44Q4 -48 10 -50Q20 -50 18 -42Q12 -35 0 -35Q-12 -35 -18 -42Z" fill="#fff3dc" stroke="none"/>
<path d="M-14 -54l3-2M11 -56l3 2" stroke="#fff3dc" stroke-width="3"/>
<circle cx="-10" cy="-50" r="2.6" fill="${INK}" stroke="none"/><circle cx="10" cy="-50" r="2.6" fill="${INK}" stroke="none"/><circle cx="-9.2" cy="-51" r=".9" fill="#fff" stroke="none"/><circle cx="10.8" cy="-51" r=".9" fill="#fff" stroke="none"/>
<path d="M-3 -45h6l-3 3z" fill="${INK}" stroke-width="1.5"/><path d="M0 -42v2M-5 -40q2.5 2.5 5 0q2.5 2.5 5 0" stroke-width="1.8" fill="none"/><path d="M-1.8 -39.5v3q1.8 2 3.6 0v-3" fill="#f28ab2" stroke-width="1.2"/>
<circle cx="-15" cy="-43" r="3" fill="#f28ab2" opacity=".5" stroke="none"/><circle cx="15" cy="-43" r="3" fill="#f28ab2" opacity=".5" stroke="none"/>
<path d="M-15 -34Q0 -29 15 -34" stroke="${RED}" stroke-width="4"/><circle cx="0" cy="-30" r="3.5" fill="${YEL}" stroke-width="1.8"/>`);
}

/* ----- plants ----- */
function plantPot(fill, rim) {
  return `${shade(0, 0, 22, 4)}<path d="M-16 -26H16L12 0H-12Z" fill="${fill}" stroke-width="2.5"/><rect x="-19" y="-32" width="38" height="8" rx="3" fill="${rim}" stroke-width="2.5"/><path d="M-10 -20l-1 14" stroke="#fff" stroke-width="2.5" opacity=".45"/>`;
}

function cactus() {
  return at(32, 448, `${plantPot('#d96c3f', '#ef8a55')}<path d="M-9 -14h4M-1 -14h4M7 -14h3" stroke="#fff3dc" stroke-width="2.5"/>
<path d="M-8 -32V-84Q-8 -94 2 -94Q12 -94 12 -84V-32Z" fill="${GREEN}" stroke-width="2.5"/>
<path d="M12 -52H18Q24 -52 24 -60V-70Q24 -76 19 -76Q14 -76 14 -70V-62H12" fill="${GREEN}" stroke-width="2.5"/>
<path d="M-8 -60H-14Q-20 -60 -20 -66V-74Q-20 -80 -15 -80Q-10 -80 -10 -74V-68H-8" fill="${GREEN}" stroke-width="2.5"/>
<path d="M2 -88V-36M7 -84V-36" stroke="${GREEN_D}" stroke-width="2"/><path d="M-4 -86V-40" stroke="#a8e08a" stroke-width="2.5"/>
<path d="M-4 -70l-3-1M-4 -54l-3-1M9 -76l3-1M9 -62l3-1M9 -46l3-1M-4 -44l-3-1" stroke-width="1.5"/>
<path d="M2 -94Q-4 -102 2 -104Q8 -102 2 -94ZM2 -94Q-6 -98 -6 -92M2 -94Q10 -98 10 -92" fill="#f28ab2" stroke-width="2"/><circle cx="2" cy="-96" r="2" fill="${YEL}" stroke="none"/>
<path d="M12 -32Q12 -46 20 -46Q28 -46 28 -36Q28 -32 26 -32Z" fill="#7cc35f" stroke-width="2.2"/><path d="M20 -44V-34" stroke="${GREEN_D}" stroke-width="1.5"/>`);
}

function pothos() {
  const leaf = (x, y, rot, c = GREEN) => `<path transform="translate(${x} ${y}) rotate(${rot})" d="M0 0C-7 -3 -9 -10 -5 -13C-2 -15 0 -12 0 -10C0 -12 2 -15 5 -13C9 -10 7 -3 0 0Z" fill="${c}" stroke-width="1.8"/>`;
  return at(32, 448, `${shade(0, 0, 24, 4)}<path d="M-16 0L-12 -30M16 0L12 -30M0 0V-30" stroke="${WOOD_D}" stroke-width="5"/><path d="M-16 0L-12 -30M16 0L12 -30M0 0V-30" stroke="${WOOD_L}" stroke-width="2"/><path d="M-14 -16H14" stroke="${WOOD_D}" stroke-width="3"/>
<path d="M-15 -60H15L12 -34H-12Z" fill="#fff3dc" stroke-width="2.5"/><rect x="-18" y="-66" width="36" height="8" rx="3" fill="#f2c6a0" stroke-width="2.5"/><path d="M-11 -48h22" stroke="${BLUE}" stroke-width="3"/><path d="M-9 -54l-1 14" stroke="#fff" stroke-width="2" opacity=".6"/>
<path d="M-14 -64Q-26 -50 -22 -20M14 -64Q26 -46 22 -12M-4 -66Q-10 -48 -8 -40" stroke="${GREEN_D}" stroke-width="2" fill="none"/>
${leaf(-22, -18, 170)}${leaf(-24, -32, 200, '#8ccf5c')}${leaf(-20, -48, 150)}${leaf(22, -10, 190, '#8ccf5c')}${leaf(24, -26, 160)}${leaf(20, -44, 210)}
${leaf(-12, -66, -30)}${leaf(0, -70, 5, '#8ccf5c')}${leaf(12, -66, 30)}${leaf(-6, -60, -60, '#8ccf5c')}${leaf(7, -60, 60)}`);
}

function daisyPot() {
  const petals = Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4, c = Math.cos(a), sn = Math.sin(a); return `M${r1(c * 3)} ${r1(sn * 3)}L${r1(c * 8.5)} ${r1(sn * 8.5)}`; }).join('');
  const flower = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="${petals}" stroke-width="7.6"/><path d="${petals}" stroke="#fffaf0" stroke-width="4.6"/><circle r="4" fill="${YEL}" stroke-width="1.6"/></g>`;
  return at(32, 448, `${plantPot(BLUE, '#4f9fe0')}<path d="M-12 -14q4-4 8 0t8 0t8 0" stroke="#fff" stroke-width="2" fill="none" opacity=".8"/>
<path d="M-8 -32Q-14 -48 -14 -58M0 -32V-66M8 -32Q14 -46 16 -54" stroke="${GREEN_D}" stroke-width="2.5" fill="none"/>
<path d="M-6 -32Q-20 -36 -20 -46Q-10 -44 -6 -32ZM6 -32Q20 -36 22 -44Q10 -44 6 -32ZM0 -40Q-8 -50 -4 -56Q4 -50 0 -40Z" fill="${GREEN}" stroke-width="2"/>
${flower(-14, -60, 1)}${flower(0, -70, 1.1)}${flower(16, -56, .95)}`);
}

/* ----- sidewalk furniture & upgrades ----- */
function stool(x, y, fill, dark, cushion) {
  return at(x, y, `${shade(0, 0, 22, 3.5)}
<path d="M-17 -26H17L22 0H14L11 -10Q0 -16 -11 -10L-14 0H-22Z" fill="${fill}" stroke-width="2.5"/>
<path d="M9 -24.6H15.8L19.8 -1.4H15.2L12.6 -9Z" fill="${dark}" stroke="none"/>
<rect x="-7" y="-21" width="14" height="4" rx="2" fill="${dark}" stroke-width="1.5"/>
<rect x="-21" y="-32" width="42" height="7" rx="3.5" fill="${fill}" stroke-width="2.5"/><path d="M-16 -29H6" stroke="#fff" stroke-width="2" opacity=".5"/>
${cushion ? `<path d="M-21 -32Q-22 -42 0 -42Q22 -42 21 -32Q0 -28 -21 -32Z" fill="${cushion}" stroke-width="2.5"/><path d="M-14 -38Q-6 -40 2 -40" stroke="#fff" stroke-width="2" opacity=".6"/><circle cx="0" cy="-35" r="1.8" fill="${INK}" stroke="none"/>` : ''}`);
}

function stoolRow(upgrades) {
  const c = upgrades.chair;
  return stool(148, 448, RED, RED_D, c && '#f7c242') + stool(206, 448, BLUE, '#235f94', c && '#f28ab2') + stool(264, 448, RED, RED_D, c && '#8fd3a7');
}

function tableSet(P, upgrades) {
  const c = upgrades.chair;
  return stool(110, 476, BLUE, '#235f94', c && '#ffb38a') + at(178, 476, `${shade(0, 0, 50, 5)}
<path d="M-36 -2L-30 -34M36 -2L30 -34M-20 -2L-18 -34M20 -2L18 -34" stroke-width="5"/><path d="M-36 -2L-30 -34M36 -2L30 -34" stroke="#8e9aa6" stroke-width="2.5"/>
<path d="M-28 -18H28" stroke-width="3"/>
<rect x="-46" y="-42" width="92" height="9" rx="4" fill="#c9d3db" stroke-width="2.5"/><path d="M-40 -39H40" stroke="#fff" stroke-width="2" opacity=".8"/>
${at(-12, -42, `<path d="M-14 -12C-13 -4 -8 0 -4 0H4C8 0 13 -4 14 -12Z" fill="#fffaf0" stroke-width="2.2"/><ellipse cx="0" cy="-12" rx="14" ry="4" fill="url(#${P}broth)" stroke-width="2"/><path d="M-12 -7q6 3 24 0" stroke="${BLUE}" stroke-width="2" fill="none"/><path d="M-6 -16L16 -10M-5 -19L17 -13" stroke-width="2"/>`)}
${at(18, -42, `<path d="M-7 -20H7L5.5 0H-5.5Z" fill="#f2b45a" opacity=".95" stroke-width="2.2"/><path d="M-5 -14h4v4h-4zM1 -8h4v4h-4z" fill="#fff" stroke-width="1" opacity=".85"/><path d="M-6.5 -20H6.5" stroke="#fff" stroke-width="2" opacity=".7"/>`)}`)
  + steamCurls('M162 412q-4-5 0-9t0-9M170 410q-4-5 0-9t0-9', -.5) + stool(246, 476, RED, RED_D, c && '#f7c242');
}

function fan() {
  return at(528, 450, `${shade(0, 0, 24, 4)}
<ellipse cx="0" cy="-3" rx="22" ry="5" fill="#e9eef2" stroke-width="2.5"/>
<rect x="-14" y="-28" width="28" height="24" rx="6" fill="#bfe3f4" stroke-width="2.5"/><path d="M-11 -14H11" stroke="${SKY}" stroke-width="7" opacity=".8"/><path d="M-9 -24v8" stroke="#fff" stroke-width="2.5" opacity=".8"/>
<rect x="-4" y="-80" width="8" height="52" rx="3" fill="#e9eef2" stroke-width="2.5"/>
<rect x="-10" y="-96" width="20" height="18" rx="6" fill="#3fae92" stroke-width="2.5"/>
<circle cx="0" cy="-112" r="26" fill="#e9f7f2" stroke-width="3"/>
<path d="M0 -112Q-4 -128 6 -134Q10 -122 0 -112ZM0 -112Q16 -114 20 -102Q8 -98 0 -112ZM0 -112Q-12 -104 -20 -112Q-14 -124 0 -112Z" fill="#6cc3ef" stroke-width="2"/>
<circle cx="0" cy="-112" r="5" fill="#3fae92" stroke-width="2"/>
<path d="M-26 -112H26M0 -138V-86M-18 -130L18 -94M18 -130L-18 -94" stroke="#8e9aa6" stroke-width="1.2" opacity=".8"/>
<circle cx="0" cy="-112" r="26" fill="none" stroke-width="3"/><path d="M-18 -126a22 22 0 0 1 12-8" stroke="#fff" stroke-width="2.5" opacity=".8"/>`)
  + anim('steam', `<path d="M498 326q-5-4-10 0t-10 0M500 338q-5-4-10 0t-10 0M498 350q-5-4-9 0" fill="none" stroke="#fff" stroke-width="3.5" opacity=".9"/><path d="M498 326q-5-4-10 0t-10 0M500 338q-5-4-10 0t-10 0M498 350q-5-4-9 0" fill="none" stroke="${SKY}" stroke-width="1.2" opacity=".6"/>`, -.3);
}

function tiktokTripod(P) {
  return at(40, 476, `${shade(0, 0, 26, 4)}
<path d="M0 -96L-22 0M0 -96L22 0M0 -96L2 0" stroke-width="4"/><path d="M0 -96L-22 0M0 -96L22 0M0 -96L2 0" stroke="#4b4f5c" stroke-width="1.8"/>
<path d="M0 -96V-151" stroke-width="5"/><path d="M0 -96V-151" stroke="#8e9aa6" stroke-width="2"/>
<circle cx="0" cy="-172" r="27" fill="url(#${P}glow)" stroke="none"/>
<circle cx="0" cy="-172" r="21" fill="none" stroke-width="9"/><circle cx="0" cy="-172" r="21" fill="none" stroke="#fffbe8" stroke-width="5.5"/>
<rect x="-8" y="-186" width="16" height="28" rx="3.5" fill="#3b3540" stroke-width="2.2"/><rect x="-5.5" y="-183" width="11" height="21" rx="2" fill="#f28ab2" stroke="none"/>
<path d="M0 -168c-3-2-5-4-5-6.5a2.6 2.6 0 0 1 5-1a2.6 2.6 0 0 1 5 1c0 2.5-2 4.5-5 6.5z" fill="#fff" stroke="none"/><circle cx="3" cy="-180" r="1.6" fill="${RED}" stroke="none"/>`)
  + anim('bob', `<path d="M12 288c-3-2-5-4-5-6.5a2.6 2.6 0 0 1 5-1a2.6 2.6 0 0 1 5 1c0 2.5-2 4.5-5 6.5zM20 274c-2-1.5-3.5-3-3.5-4.6a1.8 1.8 0 0 1 3.5-.7a1.8 1.8 0 0 1 3.5.7c0 1.6-1.5 3.1-3.5 4.6z" fill="${RED}" stroke-width="1.5"/>`, -.8);
}

function kolRig(P) {
  return at(404, 476, `${shade(0, 0, 30, 4.5)}
<path d="M0 -106L-26 0M0 -106L26 0M0 -106L0 0" stroke-width="5"/><path d="M0 -106L-26 0M0 -106L26 0M0 -106L0 0" stroke="#3b3540" stroke-width="2.5"/>
<path d="M-13 -50H13" stroke-width="3"/>
<path d="M0 -106V-170" stroke-width="5"/><path d="M0 -106V-170" stroke="#8e9aa6" stroke-width="2"/>
<circle cx="0" cy="-170" r="32" fill="url(#${P}glow)" stroke="none"/>
<circle cx="0" cy="-170" r="25" fill="none" stroke-width="10"/><circle cx="0" cy="-170" r="25" fill="none" stroke="#fffbe8" stroke-width="6.5"/>
<path d="M-22 -106H22L18 -114H-18Z" fill="#3b3540" stroke-width="2.5"/>
<rect x="-20" y="-138" width="40" height="26" rx="5" fill="#3d3f4a" stroke-width="2.5"/><rect x="-6" y="-144" width="14" height="7" rx="2" fill="#3d3f4a" stroke-width="2"/>
<circle cx="-8" cy="-125" r="11" fill="#262630" stroke-width="2.5"/><circle cx="-8" cy="-125" r="6.5" fill="#4a6fa8" stroke-width="2"/><path d="M-12 -128a5 5 0 0 1 4-3" stroke="#fff" stroke-width="1.8" opacity=".85"/>
<rect x="8" y="-134" width="7" height="4" rx="1" fill="${YEL}" stroke-width="1.2"/>
${anim('twinkle', `<circle cx="13" cy="-120" r="3" fill="#ff4a3a" stroke-width="1.5"/>`, -.2)}`);
}

function menuStand() {
  const photo = (x, y, c) => `<rect x="${x}" y="${y}" width="17" height="14" rx="3" fill="#fff6e6" stroke-width="1.6"/><path d="M${x + 3} ${y + 8}h11q-1 4-5.5 4t-5.5-4z" fill="${c}" stroke-width="1.2"/><path d="M${x + 6} ${y + 6}q-1-2 0-3M${x + 10} ${y + 6}q-1-2 0-3" stroke-width="1" fill="none"/>`;
  return at(302, 476, `${shade(0, 0, 26, 4)}
<path d="M-18 0L-10 -70M18 0L10 -70" stroke="${WOOD_D}" stroke-width="6"/><path d="M-18 0L-10 -70M18 0L10 -70" stroke="${WOOD_L}" stroke-width="2.5"/>
<rect x="-24" y="-78" width="48" height="58" rx="5" fill="${WOOD}" stroke-width="2.5"/>
<rect x="-20" y="-74" width="40" height="50" rx="3" fill="${CREAM}" stroke-width="2"/>
<rect x="-20" y="-74" width="40" height="9" rx="3" fill="${RED}" stroke-width="2"/><path d="M-12 -69.5h24" stroke="#fff" stroke-width="2" stroke-dasharray="3 3"/>
${photo(-18, -62, '#ef5a3c')}${photo(1, -62, '#f2b35a')}${photo(-18, -44, '#a3211a')}${photo(1, -44, '#86b24e')}
<path d="M-17 -27h12M3 -27h12" stroke="#c9672a" stroke-width="1.5"/>
<path d="M14 -80l2 4.2 4.6.6-3.3 3.1.8 4.6-4.1-2.2-4.1 2.2.8-4.6-3.3-3.1 4.6-.6z" fill="${YEL}" stroke-width="1.6"/>`);
}

function scooter() {
  return `<g transform="translate(546 478) scale(-.92 .92)">${shade(0, 0, 50, 5)}
<circle cx="-36" cy="-14" r="13" fill="#3b3540" stroke-width="2.5"/><circle cx="-36" cy="-14" r="5.5" fill="#c9d3db" stroke-width="2"/>
<circle cx="32" cy="-14" r="13" fill="#3b3540" stroke-width="2.5"/><circle cx="32" cy="-14" r="5.5" fill="#c9d3db" stroke-width="2"/>
<path d="M-16 -2L-12 6" stroke-width="3"/>
<path d="M-28 -28L-40 -60" stroke-width="5"/><path d="M-28 -28L-40 -60" stroke="#8e9aa6" stroke-width="2"/>
<path d="M-48 -62H-34" stroke-width="5"/><path d="M-36 -62l-6-10" stroke-width="2.5"/><ellipse cx="-43" cy="-75" rx="5" ry="4" fill="#c9e9f7" stroke-width="2"/>
<path d="M-50 -14Q-52 -34 -40 -46L-30 -42Q-38 -30 -36 -20Z" fill="#2f9fe0" stroke-width="2.5"/>
<circle cx="-44" cy="-42" r="5" fill="#ffe27a" stroke-width="2"/>
<path d="M-34 -14Q-30 -24 -14 -24H8Q10 -40 30 -40Q48 -40 50 -22Q50 -14 44 -14Z" fill="#2f9fe0" stroke-width="2.5"/>
<path d="M14 -36Q30 -42 44 -32" stroke="#fff" stroke-width="2.5" opacity=".5" fill="none"/>
<path d="M4 -42Q4 -48 12 -48H36Q42 -48 42 -42Z" fill="#5a3a2e" stroke-width="2.5"/>
<path d="M-22 -24H8" stroke="#235f94" stroke-width="3"/>
<path d="M30 -48V-56H54V-48" stroke-width="3" fill="none"/>
<rect x="22" y="-92" width="40" height="36" rx="5" fill="${RED}" stroke-width="2.5"/><path d="M54 -90V-58" stroke="${RED_D}" stroke-width="6" opacity=".9"/><rect x="22" y="-92" width="40" height="36" rx="5" fill="none" stroke-width="2.5"/>
<path d="M22 -84H62" stroke-width="2"/>
${bowlIcon(40, -63, .55, CREAM, false)}<path d="M28 -78h-4M30 -74h-6" stroke="${CREAM}" stroke-width="2"/></g>`;
}

function cooler() {
  return at(574, 448, `${shade(0, 0, 20, 3.5)}<rect x="-17" y="-24" width="34" height="24" rx="4" fill="${BLUE}"/><path d="M8 -22V-2" stroke="#235f94" stroke-width="7"/><rect x="-17" y="-24" width="34" height="24" rx="4" fill="none"/>
<rect x="-19" y="-31" width="38" height="9" rx="3" fill="#fffaf0"/><path d="M-7 -31v-4h14v4" fill="none" stroke-width="2.5"/><path d="M-12 -18h8" stroke="#fff" stroke-width="2.5" opacity=".6"/>
<path d="M-13 -31V-40Q-13 -43 -11 -44V-48H-7V-44Q-5 -43 -5 -40V-31" fill="#f59a3a" stroke-width="2"/><path d="M-11 -48h4" stroke="${RED}" stroke-width="2.5"/>`);
}

function speaker() {
  return at(522, 216, `<path d="M18 2V18" stroke-width="3"/><path d="M14 2H22" stroke-width="3"/>
<rect x="-12" y="8" width="30" height="34" rx="6" fill="#ef5a3c" stroke-width="2.5"/><path d="M12 10V40" stroke="#c9472a" stroke-width="5"/><rect x="-12" y="8" width="30" height="34" rx="6" fill="none" stroke-width="2.5"/>
<circle cx="3" cy="30" r="8" fill="#3b3540" stroke-width="2.2"/><circle cx="3" cy="30" r="3" fill="#8e9aa6" stroke-width="1.5"/><circle cx="3" cy="15" r="3" fill="#3b3540" stroke-width="1.5"/>
${anim('twinkle', `<path d="M-18 22q-4 8 0 16M-25 18q-7 12 0 24" stroke-width="2.5" fill="none"/>`, -.4)}`);
}

function tv() {
  return at(456, 214, `<path d="M0 0V8M-8 0H8" stroke-width="3"/>
<rect x="-32" y="8" width="64" height="42" rx="5" fill="#3b3540" stroke-width="2.5"/>
<rect x="-27" y="12" width="54" height="32" rx="2" fill="#24307a" stroke="none"/>
<path d="M-20 12L-6 40H-16ZM20 12L6 40H16Z" fill="#ffe27a" opacity=".55" stroke="none"/>
<path d="M-27 39H27V44H-27Z" fill="#ef5a3c" stroke="none"/><path d="M-27 39H27" stroke="#ffd23f" stroke-width="1.5"/>
<path d="M-3 39L-4 31Q0 27 4 31L3 39Z" fill="#e8402f" stroke="none"/><circle cx="0" cy="25" r="3.6" fill="#f9d2b4" stroke="none"/><path d="M-3.6 24Q0 19 3.6 24Q2 21 -3.6 24Z" fill="#4a2a22" stroke="none"/><path d="M3 30L6 26" stroke="#fff" stroke-width="1.3"/><circle cx="6.5" cy="25.5" r="1.4" fill="#c9d3db" stroke="none"/>
<path d="M-24 39V34M-21 39V30M-18 39V33M18 39V32M21 39V29M24 39V34" stroke="#8fd3a7" stroke-width="2"/>
<path d="M-14 22v-6l5-1.5v6M12 20v-5" stroke="#fff" stroke-width="1.5" fill="none"/><circle cx="-15" cy="22" r="1.7" fill="#fff" stroke="none"/><circle cx="-10" cy="20.5" r="1.7" fill="#fff" stroke="none"/><circle cx="11" cy="20" r="1.7" fill="#fff" stroke="none"/>
<path d="M-24 15L-19 15" stroke="#fff" stroke-width="2" opacity=".5"/>
<path d="M-6 50L-10 54M6 50L10 54" stroke-width="2.5"/>
${anim('twinkle', `<path d="M-27 12H27V44H-27Z" fill="#fff" stroke="none" opacity=".12"/>`, -.5)}`);
}

function gmapSticker() {
  return `<g transform="translate(521 275) rotate(-6)"><rect x="-15" y="-15" width="30" height="30" rx="6" fill="#fff" stroke-width="2.2"/>
<rect x="-12" y="-12" width="24" height="24" rx="4" fill="#bfe6b0" stroke="none"/><path d="M-12 4L12 -6M-4 -12L2 12" stroke="#fff" stroke-width="3"/><path d="M-12 9Q0 6 12 10" stroke="${SKY}" stroke-width="3"/>
<path d="M0 6Q-9 -3 -9 -8A9 9 0 0 1 9 -8Q9 -3 0 6Z" fill="${RED}" stroke-width="2"/><circle cx="0" cy="-8" r="3.2" fill="#fff" stroke-width="1.5"/>
<path d="M15 9L9 15" stroke-width="1.5"/></g>`;
}

function tapedFlyer() {
  return `<g transform="translate(456 380) rotate(4)"><rect x="-17" y="-20" width="34" height="42" rx="2" fill="#fffaf0" stroke-width="2"/>
<rect x="-17" y="-20" width="34" height="9" fill="${RED}" stroke-width="2"/>${bowlIcon(0, 6, .55, '#ef5a3c')}<path d="M-11 12h22M-11 16h14" stroke="#c9672a" stroke-width="1.6"/>
<path d="M-21 -22l9 4M12 -18l9-4" stroke="#fff7c2" stroke-width="5" opacity=".85"/></g>`;
}

/* ----- assembly ----- */
// Optional layers carry data-layer so tests and tools can tell which purchases the picture shows.
const tag = (name, svg) => `<g data-layer="${name}">${svg}</g>`;
const PET_IDS = { pet_cat: 'cat', cat: 'cat', pet_dog: 'dog', dog: 'dog', pet_hamster: 'hamster', hamster: 'hamster' };
const PLANT_IDS = { plant_cactus: 'cactus', cactus: 'cactus', plant_leaf: 'leaf', leaf: 'leaf', plant_daisy: 'daisy', daisy: 'daisy' };
const LAMP_IDS = { lamp_lantern: 'lantern', lantern: 'lantern', lamp_chime: 'chime', chime: 'chime' };
const SHOP_UPGRADE_IDS = Object.freeze(['sign', 'fan', 'wifi', 'chair', 'tv', 'stove', 'tiktok', 'table', 'pot2', 'pot3', 'delivery', 'flyer', 'tipjar', 'speaker', 'luckycat', 'menu', 'gmap', 'led', 'bowlset', 'kol', 'spaceport']);

function ownedUpgrades(upgrades) {
  if (Array.isArray(upgrades)) return Object.fromEntries(upgrades.filter(id => SHOP_UPGRADE_IDS.includes(id)).map(id => [id, true]));
  const out = {};
  if (upgrades && typeof upgrades === 'object') for (const id of SHOP_UPGRADE_IDS) out[id] = !!upgrades[id];
  return out;
}

function wallPalette(awning) {
  const h = hueOf(awning.value);
  // Golden "Hội An" ochre suits most awnings; a warm teal wall keeps yellow/orange awnings readable.
  return h >= 22 && h <= 62
    ? { base: '#3aa59c', shade: '#2a827b', light: '#7fd6c9', tile: '#2f7fc1' }
    : { base: '#f6b845', shade: '#d9932c', light: '#ffd97a', tile: '#2f8f8a' };
}

export function shopScene(options) {
  const { awning = { value: '#EF4B3F', shadow: '#C23328' }, decorations = {}, upgrades = {}, level = 1, idPrefix, label } = options || {};
  const P = prefixFor('shop', idPrefix);
  const a = awningColors(awning);
  const wall = wallPalette(a);
  const u = ownedUpgrades(upgrades);
  const lv = Math.max(1, Math.min(10, Math.round(Number(level)) || 1));
  const deco = decorations && typeof decorations === 'object' ? decorations : {};
  const pet = PET_IDS[deco.pet], plant = PLANT_IDS[deco.plant], lamp = LAMP_IDS[deco.lamp];

  const parts = [
    shopDefs(P, wall),
    `<g stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">`,
    sidewalk(),
    building(P, wall, u),
    u.sign ? tag('sign', litSign(P, a, lv)) : plankSign(lv),
    u.spaceport ? tag('spaceport', spaceport()) : '',
    interior(P, lv, u),
    tagString(),
    counterFront(P),
    pots(P, u),
    u.luckycat ? tag('luckycat', luckyCat()) : '',
    caddy(),
    heroBowl(P),
    u.tipjar ? tag('tipjar', piggyBank()) : '',
    u.flyer ? tag('flyer', flyerStack()) : '',
    pet === 'hamster' ? tag('pet-hamster', hamster()) : '',
    rag(),
    menuBoard(),
    door(P, u),
    u.flyer ? tag('flyer-wall', tapedFlyer()) : '',
    u.gmap ? tag('gmap', gmapSticker()) : '',
    u.tv ? tag('tv', tv()) : '',
    u.speaker ? tag('speaker', speaker()) : '',
    u.led ? tag('led', ledStrip(P)) : '',
    awningShape(a),
    lamp === 'lantern' ? tag('lamp-lantern', lantern(44, 190, 0) + lantern(556, 190, -.9)) : '',
    lamp === 'chime' ? tag('lamp-chime', chime(P, 414, 192)) : '',
    plant === 'cactus' ? tag('plant-cactus', cactus()) : plant === 'leaf' ? tag('plant-leaf', pothos()) : plant === 'daisy' ? tag('plant-daisy', daisyPot()) : '',
    u.fan ? tag('fan', fan()) : '',
    stoolRow(u),
    pet === 'dog' ? tag('pet-dog', shibaDog()) : '',
    pet === 'cat' ? tag('pet-cat', sleepyCat()) : '',
    cooler(),
    u.tiktok ? tag('tiktok', tiktokTripod(P)) : '',
    u.table ? tag('table', tableSet(P, u)) : '',
    u.menu ? tag('menu', menuStand()) : '',
    u.kol ? tag('kol', kolRig(P)) : '',
    u.delivery ? tag('delivery', scooter()) : '',
    '</g>',
  ];
  return svgRoot('0 0 600 520', parts.join(''), { label, cls: 'shop-scene' });
}

/* =====================================================================
 * Street backdrop — viewBox 0 0 400 220, shown with preserveAspectRatio="xMidYMid slice".
 * Layers: our awning edge + string lights (top), sky, sun/moon, clouds, a far
 * skyline with setbacks, a row of shophouses, poles and wires, the road and a
 * dark, calm pavement band at the bottom where customer names sit.
 * ===================================================================== */

const clamp01 = n => Math.max(0, Math.min(1, n));
// progress, sky top, upper sky, warm band, horizon, light (1 day → .3 night), warm tint.
// Four stops keep blue→gold blends passing through light haze instead of grey or mauve.
const SKY_STOPS = [
  [0, '#7fc4ef', '#a9dbf5', '#d6eef6', '#ffdca6', .96, .16],
  [.3, '#2f9be6', '#55b4ec', '#8fd0f3', '#c4ebfb', 1, 0],
  [.45, '#3a9de4', '#62b6ea', '#acdaf1', '#ffe6b0', .98, .12],
  [.55, '#4a9adf', '#8cc0e8', '#ffe7b0', '#ffcf6e', .95, .32],
  [.75, '#3d62b0', '#a9b8d8', '#ffc46a', '#ff9443', .74, .7],
  [.8, '#1f3570', '#4a5f98', '#e09050', '#ffb05a', .55, .45],
  [.86, '#0e1a3a', '#122148', '#16264f', '#1b2a55', .3, .08],
  [1, '#0b1532', '#0f1c40', '#14234b', '#1b2a55', .28, .04],
];
const FAR_STOPS = [[0, '#a9c8e4', '#86a9cb'], [.3, '#9cc2e6', '#779fc9'], [.55, '#dbc29e', '#bc9f7e'], [.75, '#7088b0', '#5a7199'], [.86, '#23315f', '#18234a'], [1, '#1e2b57', '#152047']];
const SUN_STOPS = [[0, '#ffe7a0'], [.3, '#fff6c8'], [.55, '#ffd25a'], [.75, '#ff9a3c'], [1, '#ff8a3c']];
// progress, x, y, radius of the sun along its arc (it sinks behind the roofs after sunset)
const SUN_PATH = [[0, 44, 64, 12], [.3, 168, 26, 12], [.55, 282, 32, 13], [.75, 334, 50, 16], [.82, 350, 72, 17], [.87, 358, 100, 17]];

function stopAt(stops, p) {
  let i = 0;
  while (i < stops.length - 2 && p > stops[i + 1][0]) i++;
  const a = stops[i], b = stops[i + 1], t = clamp01((p - a[0]) / (b[0] - a[0]));
  return a.slice(1).map((v, k) => typeof v === 'number' ? v + (b[k + 1] - v) * t : mix(v, b[k + 1], t));
}

/** Collects path data per paint style so the whole street costs few elements. */
function painter() {
  const map = new Map();
  return {
    add(style, d) { map.set(style, (map.get(style) || '') + d); },
    flush() { const out = [...map].map(([style, d]) => `<path ${style} d="${d}"/>`).join(''); map.clear(); return out; },
  };
}
const rectD = (x, y, w, h) => `M${r1(x)} ${r1(y)}h${r1(w)}v${r1(h)}h${r1(-w)}z`;

const NEAR = [
  { x0: -6, x1: 50, floors: 3, color: '#f2b544', shutter: '#2f8f8a', awn: ['#5fae4e', CREAM], sign: '#e8402f', icon: 'cup', roof: 'tank', balcony: 1, ac: 2 },
  { x0: 50, x1: 100, floors: 2, color: '#3aa59c', shutter: '#f7c242', awn: ['#f59a3a'], sign: CREAM, icon: 'flower', roof: 'tile', win: 'arch' },
  { x0: 100, x1: 156, floors: 3, color: '#ef7a5a', shutter: '#2f7fc1', awn: ['#2f7fc1', CREAM], sign: '#f7c242', icon: 'bread', roof: 'flat', balcony: 2, laundry: 1 },
  { x0: 156, x1: 208, floors: 2, color: '#5fb6e6', shutter: '#e8402f', awn: ['#e8402f', CREAM], sign: '#fffaf0', icon: 'phone', roof: 'tile', win: 'door' },
  { x0: 208, x1: 262, floors: 3, color: '#7cc9a0', shutter: '#b06a3b', awn: ['#f7c242'], sign: '#3f8a3a', icon: 'tea', roof: 'tank', vsign: '#e8402f', ac: 1 },
  { x0: 262, x1: 314, floors: 2, color: '#f59a3a', shutter: '#2f8f8a', awn: ['#2f8f8a', CREAM], sign: '#2f7fc1', icon: 'shirt', roof: 'flat', balcony: 1, win: 'arch' },
  { x0: 314, x1: 366, floors: 3, color: '#f28ab2', shutter: '#5fae4e', awn: ['#8fd3a7', CREAM], sign: '#e8402f', icon: 'melon', roof: 'tile', balcony: 2, ac: 0 },
  { x0: 366, x1: 408, floors: 2, color: '#f2b544', shutter: '#e8402f', awn: ['#e8402f'], sign: '#fffaf0', icon: 'cup', roof: 'tank', win: 'door' },
];
const nearTop = h => 136 - h.floors * 22;
const nearTopAt = x => { const h = NEAR.find(n => x >= n.x0 && x < n.x1); return h ? nearTop(h) - 6 : 170; };
// Far skyline: each building is a list of stacked tiers [x0, x1, top] (setbacks), plus an optional mast.
const FAR = [
  { tiers: [[-8, 26, 66], [-2, 18, 54]], mast: [8, 54, 42] },
  { tiers: [[22, 64, 82]], tank: [34, 82] },
  { tiers: [[60, 96, 60], [66, 90, 50], [73, 83, 42]], mast: [78, 42, 30] },
  { tiers: [[92, 136, 78]] },
  { tiers: [[132, 168, 56], [138, 162, 46]] },
  { tiers: [[164, 210, 80]], tank: [190, 80] },
  { tiers: [[206, 246, 50], [212, 240, 40], [220, 232, 32]], mast: [226, 32, 20] },
  { tiers: [[242, 286, 72]] },
  { tiers: [[282, 320, 54], [288, 314, 44]], mast: [301, 44, 34] },
  { tiers: [[316, 358, 78]] },
  { tiers: [[354, 390, 58], [360, 384, 48]] },
  { tiers: [[386, 422, 74]] },
];

function streetEnv(progress, rain) {
  const p = clamp01(Number.isFinite(+progress) ? +progress : 0);
  let [top, up, mid, hor, light, warm] = stopAt(SKY_STOPS, p);
  let [farF, farS] = stopAt(FAR_STOPS, p);
  const night = clamp01((p - .76) / .1);
  if (rain) {
    const grey = night > .5 ? '#232c44' : '#7d8b9d', k = night > .5 ? .35 : .55;
    top = mix(top, grey, k); up = mix(up, grey, k); mid = mix(mid, grey, k); hor = mix(hor, grey, k * .9);
    farF = mix(farF, grey, .35); farS = mix(farS, grey, .35);
    light *= .9; warm *= .4;
  }
  return { p, rain, top, up, mid, hor, light, warm, night, farF, farS, lit: clamp01((p - .66) / .2), lightsOn: p >= .8 };
}

/** Daytime colour → colour at this time of day (warm light, night darkening, rain dulling). */
function tone(c, env, depth = 1) {
  let out = mix(c, '#ff9a4a', env.warm * .2);
  out = mix(out, '#18244c', Math.min(.8, (1 - env.light) * 1.1) * depth);
  return env.rain ? mix(out, '#6f8196', env.night > .5 ? .12 : .3) : out;
}

function cloudD(cx, cy, s) {
  const k = n => r1(n * s);
  return `M${r1(cx - 30 * s)} ${r1(cy + 8 * s)}a${k(10)} ${k(10)} 0 0 1 ${k(6)}-${k(15)}a${k(14)} ${k(14)} 0 0 1 ${k(25)}-${k(8)}a${k(12)} ${k(12)} 0 0 1 ${k(21)} ${k(5)}a${k(9)} ${k(9)} 0 0 1 ${k(8)} ${k(18)}z`;
}

function streetSky(P, env) {
  const { p } = env;
  let out = `<defs><linearGradient id="${P}sky" y2="1"><stop offset="0" stop-color="${env.top}"/><stop offset=".3" stop-color="${env.up}"/><stop offset=".62" stop-color="${env.mid}"/><stop offset="1" stop-color="${env.hor}"/></linearGradient>
<radialGradient id="${P}sun"><stop offset=".35" stop-color="#fff6d0" stop-opacity=".9"/><stop offset="1" stop-color="#ffe9a0" stop-opacity="0"/></radialGradient>
<radialGradient id="${P}lamp"><stop offset="0" stop-color="#ffe7a0" stop-opacity=".85"/><stop offset="1" stop-color="#ffb84a" stop-opacity="0"/></radialGradient>
<pattern id="${P}rain" width="60" height="120" patternUnits="userSpaceOnUse"><path d="M7 4l-3 12M31 10l-2.5 10M52 2l-3 13M19 34l-3 12M44 40l-2 9M9 62l-3 13M35 66l-3 11M55 78l-2.5 10M23 92l-3 13M47 100l-2 8M5 104l-2 9" stroke="#e4eef8" stroke-width="1.3" stroke-linecap="round" opacity=".6"/></pattern></defs>
<rect width="400" height="200" fill="url(#${P}sky)"/>`;
  // stars
  if (env.night > 0 && !env.rain) {
    const rand = rng(11);
    let dots = '', sparks = '';
    for (let i = 0; i < 26; i++) {
      const x = r1(rand() * 400), y = r1(18 + rand() * 70);
      if (i % 5 === 0) sparks += `M${x} ${r1(y - 3)}l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z`;
      else dots += `M${x} ${y}h0`;
    }
    out += `<g opacity="${r1(env.night)}"><path d="${dots}" stroke="#fff6d0" stroke-width="1.8" stroke-linecap="round"/>${anim('twinkle', `<path d="${sparks}" fill="#fff6d0"/>`)}</g>`;
  }
  // sun
  if (p < .87) {
    let [x, y, r] = stopAt(SUN_PATH, p);
    x = r1(x); y = r1(y); r = r1(r);
    const [sc] = stopAt(SUN_STOPS, p);
    out += `<circle cx="${x}" cy="${y}" r="${r * 2.6}" fill="url(#${P}sun)" opacity="${env.rain ? .35 : .9}"/><circle cx="${x}" cy="${y}" r="${r}" fill="${sc}" stroke="${mix(sc, '#c9672a', .45)}" stroke-width="1.6"${env.rain ? ' opacity=".55"' : ''}/>`;
  }
  // moon
  if (p >= .78) {
    const k = clamp01((p - .78) / .22), x = r1(78 + 96 * k), y = r1(66 - 30 * k), o = r1(clamp01((p - .78) / .05) * (env.rain ? .5 : 1));
    out += `<g opacity="${o}"><circle cx="${x}" cy="${y}" r="26" fill="url(#${P}sun)" opacity=".35"/><path d="M${r1(x + 4)} ${r1(y - 11)}A11 11 0 1 0 ${r1(x + 4)} ${r1(y + 11)}A8.5 11 0 1 1 ${r1(x + 4)} ${r1(y - 11)}Z" fill="#fff1c4" stroke="#e9c97a" stroke-width="1.4"/><circle cx="${r1(x - 4)}" cy="${r1(y + 3)}" r="1.6" fill="#ecd496"/><circle cx="${r1(x - 6)}" cy="${r1(y - 4)}" r="1.1" fill="#ecd496"/></g>`;
  }
  // clouds
  const cBase = env.rain ? (env.night > .5 ? '#323d5c' : '#9aa6b5') : env.night > .5 ? '#33467a' : mix(mix('#ffffff', '#ffd9a8', clamp01(env.warm * 1.2)), '#2a3a6a', (1 - env.light) * .5);
  const cShade = env.rain ? (env.night > .5 ? '#252e48' : '#7f8ca0') : env.night > .5 ? '#26365f' : mix(mix('#d8ecfa', '#f3a86a', clamp01(env.warm * 1.2)), '#2a3a6a', (1 - env.light) * .5);
  const cLine = mix(cShade, INK, env.night > .5 ? .2 : .35);
  const clouds = env.rain
    ? [[40, 30, 1.25, 0], [130, 22, 1.4, -2], [230, 30, 1.3, -4], [320, 20, 1.45, -1], [400, 34, 1.2, -3]]
    : [[64, 34, .95, 0], [224, 24, 1.15, -3], [150, 58, .72, -6]];
  const drift = p * 24;
  for (const [cx, cy, s, d] of clouds) {
    const x = cx + drift - 10;
    out += anim('drift', `<path d="${cloudD(x, cy, s)}" fill="${cBase}" stroke="${cLine}" stroke-width="1.5"/><path d="M${r1(x - 24 * s)} ${r1(cy + 8 * s)}q${r1(26 * s)} ${r1(-7 * s)} ${r1(52 * s)} 0z" fill="${cShade}"/>`, d);
  }
  return out;
}

function streetFar(env) {
  const pen = painter();
  const front = `fill="${env.farF}" stroke="${mix(env.farS, INK, .45)}" stroke-width="1.1"`, side = `fill="${env.farS}"`;
  const lit = `stroke="${mix('#ffd36b', '#fff1b8', .3)}" stroke-width="3.5"`, dark = `stroke="${env.night > .5 ? mix(env.farF, '#3a4a7a', .5) : mix(env.farF, '#ffffff', .35)}" stroke-width="3.5"`;
  const rand = rng(5);
  for (const b of FAR) {
    for (const [x0, x1, top] of b.tiers) {
      pen.add(side, `M${x1} ${top}l6 3V150H${x1}z`);
      pen.add(front, rectD(x0, top, x1 - x0, 150 - top));
      for (let y = top + 4; y < 146; y += 7) for (let x = x0 + 3; x + 3 <= x1 - 2; x += 6) {
        const on = rand();
        if (y + 3 > nearTopAt(x)) continue;
        if (env.night > .2 && on < env.lit * .62) pen.add(lit, `M${x} ${r1(y + 1.8)}h3`);
        else if (on > .45) pen.add(dark, `M${x} ${r1(y + 1.8)}h3`);
      }
    }
    if (b.mast) { const [x, y0, y1] = b.mast; pen.add(`stroke="${mix(env.farS, INK, .4)}" stroke-width="1.4" fill="none"`, `M${x} ${y0}V${y1}M${x - 3} ${y1 + 5}h6`); }
    if (b.tank) { const [x, y] = b.tank; pen.add(side, `M${x - 6} ${y}v-3h2v-6h8v6h2v3z`); }
  }
  let out = pen.flush();
  if (env.night > 0) out += anim('twinkle', FAR.filter(b => b.mast).map(b => `<circle cx="${b.mast[0]}" cy="${b.mast[2]}" r="1.8" fill="#ff5a4a" opacity="${r1(env.night)}"/>`).join(''), -.7);
  return out;
}

const SIGN_ICONS = {
  cup: 'M-3 -2h5v3.5q0 1.5-1.5 1.5h-2q-1.5 0-1.5-1.5zM2 -1h1.5a1 1 0 0 1 0 2.5H2M-1.5 -4q-1-1.2 0-2.4',
  flower: 'M0 -1.2a1.2 1.2 0 1 1 0 2.4a1.2 1.2 0 1 1 0-2.4M0 -4v1.4M0 4v-1.4M-4 0h1.4M4 0h-1.4M-2.8 -2.8l1 1M2.8 2.8l-1-1M2.8 -2.8l-1 1M-2.8 2.8l1-1',
  bread: 'M-5 2q-1-4 5-4.5q6 .5 5 4.5q-5 1.5-10 0zM-2.5 -1l-1 2M0 -1.6l-1 2.4M2.5 -1l-1 2',
  phone: 'M-2.5 -4h5v8h-5zM-1 2.6h2',
  tea: 'M-4 3q0-7 8-7q0 7-8 7zM-4 3l4-4',
  shirt: 'M-2 -4l-3.5 2 1.5 2.5 1.5-1V4h5V-0.5l1.5 1 1.5-2.5L2 -4q-2 1.5-4 0z',
  melon: 'M-5 -1h10a5 5 0 0 1-10 0zM-2 1h0M1 1.6h0M3 0.6h0',
};

function streetNear(env) {
  const pen = painter(), detail = painter();
  const ol = `stroke="${mix(INK, '#0b1024', env.night * .6)}"`;
  const glassDay = mix('#cdeaf7', '#ffffff', .2), litWin = '#ffd36b', darkWin = tone('#3d4f7a', env, .6);
  const rand = rng(23);
  for (const h of NEAR) {
    const top = nearTop(h), w = h.x1 - h.x0, face = tone(h.color, env);
    pen.add(`fill="${face}" ${ol} stroke-width="1.6"`, rectD(h.x0, top, w, 170 - top));
    detail.add(`fill="${tone(mix(h.color, INK, .18), env)}"`, rectD(h.x1 - 4, top + 2, 4, 168 - top));
    detail.add(`fill="${tone(mix(h.color, '#ffffff', .3), env)}" ${ol} stroke-width="1.3"`, rectD(h.x0 - 1, top - 4, w + 2, 5));
    if (h.roof === 'tile') detail.add(`fill="${tone('#d9643a', env)}" ${ol} stroke-width="1.3"`, `M${h.x0 + 1} ${top - 4}l7-9h${w - 16}l7 9z`);
    if (h.roof === 'tank') detail.add(`fill="${tone('#dfe6ec', env)}" ${ol} stroke-width="1.2"`, `M${h.x0 + 10} ${top - 4}v-3h2v-9h16v9h2v3z`);
    if (h.roof === 'flat') detail.add(`fill="${tone('#5fae4e', env)}" ${ol} stroke-width="1.1"`, `M${h.x0 + 8} ${top - 4}a4 4 0 0 1 8 0zM${h.x1 - 16} ${top - 4}a5 5 0 0 1 10 0z`);
    // upper floors: two shuttered windows each
    for (let f = 0; f < h.floors; f++) {
      const fy = 136 - (f + 1) * 22;
      const cols = w >= 50 ? [h.x0 + w * .3 - 6, h.x0 + w * .7 - 6] : [h.x0 + w / 2 - 6];
      for (const x of cols) {
        const on = env.night > .2 && rand() < env.lit * .66;
        const glass = `fill="${env.night > .5 ? (on ? litWin : darkWin) : on ? mix(glassDay, litWin, env.lit) : glassDay}" ${ol} stroke-width="1.1"`;
        const frame = `fill="${tone(h.shutter, env)}" ${ol} stroke-width="1"`;
        if (h.win === 'arch') {
          detail.add(frame, `M${r1(x - 2)} ${fy + 19}v-9a8 8 0 0 1 16 0v9z`);
          detail.add(glass, `M${r1(x + 1)} ${fy + 18}v-8a5 5 0 0 1 10 0v8z`);
          detail.add(`fill="none" ${ol} stroke-width=".9"`, `M${r1(x + 6)} ${fy + 6}v12M${r1(x + 1)} ${fy + 12}h10`);
        } else if (h.win === 'door') {
          detail.add(glass, rectD(x, fy + 3, 12, 17));
          detail.add(`fill="none" ${ol} stroke-width=".9"`, `M${r1(x + 6)} ${fy + 3}v17`);
          detail.add(frame, rectD(x - 2, fy + 13, 16, 2) + rectD(x - 2, fy + 19, 16, 2));
          detail.add(`fill="none" ${ol} stroke-width=".9"`, `M${r1(x + 1)} ${fy + 15}v4M${r1(x + 5)} ${fy + 15}v4M${r1(x + 9)} ${fy + 15}v4`);
        } else {
          detail.add(glass, rectD(x, fy + 5, 12, 12));
          detail.add(frame, rectD(x - 4, fy + 5, 4, 12) + rectD(x + 12, fy + 5, 4, 12));
        }
        if (env.night <= .5) detail.add(`stroke="#fff" stroke-width="1.2" opacity=".7" fill="none"`, `M${r1(x + 2)} ${fy + 15}l4-6`);
      }
      if (h.ac === f) detail.add(`fill="${tone('#e3e9ee', env)}" ${ol} stroke-width="1"`, `${rectD(h.x1 - 15, fy + 13, 10, 7)}M${h.x1 - 8} ${fy + 16.5}a2 2 0 1 1 0 .1z`);
      if (h.laundry === f) {
        detail.add(`fill="none" ${ol} stroke-width=".8"`, `M${h.x0 + 4} ${fy + 3}q${(h.x1 - h.x0) / 2 - 4} 3 ${h.x1 - h.x0 - 8} 0`);
        detail.add(`fill="${tone('#fff3dc', env)}" ${ol} stroke-width=".8"`, rectD(h.x0 + 9, fy + 4, 5, 6) + rectD(h.x1 - 16, fy + 4, 5, 6));
        detail.add(`fill="${tone('#f28ab2', env)}" ${ol} stroke-width=".8"`, rectD(h.x0 + 18, fy + 5, 6, 5));
      }
      if (h.balcony === f + 1) {
        detail.add(`fill="none" ${ol} stroke-width="1.1"`, `M${h.x0 + 3} ${fy + 22}h${w - 6}M${h.x0 + 3} ${fy + 15}h${w - 6}` + Array.from({ length: Math.floor((w - 6) / 5) + 1 }, (_, i) => `M${h.x0 + 3 + i * 5} ${fy + 15}v7`).join(''));
        detail.add(`fill="${tone('#5fae4e', env)}" ${ol} stroke-width="1"`, `M${h.x0 + 6} ${fy + 15}a3.5 3.5 0 0 1 7 0zM${h.x1 - 13} ${fy + 15}a3.5 3.5 0 0 1 7 0z`);
      }
    }
  }
  for (const h of NEAR) if (h.vsign) detail.add(`fill="${env.night > .3 ? mix(h.vsign, '#ffffff', .1) : tone(h.vsign, env)}" ${ol} stroke-width="1.1"`, rectD(h.x0 + 2, 96, 7, 34));
  let out = pen.flush() + detail.flush();
  for (const h of NEAR) if (h.vsign) out += `<path d="M${h.x0 + 5.5} 101h0M${h.x0 + 5.5} 108h0M${h.x0 + 5.5} 115h0M${h.x0 + 5.5} 122h0" stroke="#fff3dc" stroke-width="3" stroke-linecap="round"/>`;
  // ground floor: sign, awning, shop opening
  const glow = env.night > .3;
  for (const h of NEAR) {
    const w = h.x1 - h.x0, cx = h.x0 + w / 2;
    const signFill = glow ? mix(h.sign, '#ffffff', .15) : tone(h.sign, env);
    out += `<path d="${rectD(h.x0 + 6, 160, w - 12, 10)}" fill="${glow ? mix('#ffcf6b', '#ff9a4a', rand() * .4) : tone('#5a3428', env)}" ${ol} stroke-width="1.2"/>`;
    out += `<path d="M${h.x0 + 10} 165h${w - 20}M${h.x0 + 12} 165v-3h5v3M${h.x1 - 18} 165v-4h6v4" fill="none" stroke="${glow ? '#d98a3a' : tone('#8a5a3c', env)}" stroke-width="1.4"/>`;
    if (glow) out += `<ellipse cx="${r1(cx)}" cy="174" rx="${r1(w / 2)}" ry="3" fill="#ffcf6b" opacity="${r1(.25 * env.night)}"/>`;
    const a0 = tone(h.awn[0], env), a1 = h.awn[1] ? tone(h.awn[1], env) : null;
    let stripes = '';
    if (a1) for (let x = h.x0 + 2, i = 0; x < h.x1 - 2; x += 6, i++) if (i % 2) stripes += `M${x} 150h${Math.min(6, h.x1 - 2 - x)}l1 9h-${Math.min(6, h.x1 - 2 - x)}z`;
    out += `<path d="M${h.x0 + 2} 150H${h.x1 - 2}l2 9H${h.x0}z" fill="${a0}" ${ol} stroke-width="1.3"/>${stripes ? `<path d="${stripes}" fill="${a1}"/>` : ''}<path d="M${h.x0} 159H${h.x1}" ${ol} stroke-width="1.3"/>`;
    out += `<path d="${rectD(h.x0 + 7, 139, w - 14, 9)}" fill="${signFill}" ${ol} stroke-width="1.2"/><g transform="translate(${r1(cx)} 143.5)"><path d="${SIGN_ICONS[h.icon]}" fill="none" stroke="${h.sign === CREAM || h.sign === '#fffaf0' ? INK : '#fff'}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></g>`;
    if (glow) out += `<rect x="${h.x0 + 4}" y="137" width="${w - 8}" height="13" rx="3" fill="${h.sign}" opacity="${r1(.18 * env.night)}"/>`;
  }
  return out;
}

function streetFront(P, env) {
  const ink = mix(INK, '#0b1024', env.night * .6);
  let out = '';
  // tree on the left
  const leaf = tone('#5fae4e', env), leafD = tone('#3f8a3a', env);
  out += `<path d="M18 172V128M18 146l-8-8M18 140l7-7" stroke="${ink}" stroke-width="6" stroke-linecap="round"/><path d="M18 172V128M18 146l-8-8M18 140l7-7" stroke="${tone('#8d5a3b', env)}" stroke-width="3" stroke-linecap="round"/>
<path d="M-12 128a16 16 0 0 1 10-26a18 18 0 0 1 30-6a15 15 0 0 1 22 14a12 12 0 0 1-6 22q-12 6-22 0q-14 6-34-4z" fill="${leaf}" stroke="${ink}" stroke-width="1.6"/>
<path d="M-6 128q10 4 22-2q12 6 26 0q-8 8-22 4q-14 6-26-2zM6 108a8 8 0 0 1 12-6M30 106a7 7 0 0 1 10 2" fill="${leafD}" stroke="none"/>`;
  // utility poles and sagging wires
  const pole = tone('#6b5b55', env);
  for (const x of [118, 296]) out += `<path d="M${x} 174V40M${x - 9} 46h18M${x - 7} 54h14" stroke="${ink}" stroke-width="4.5" stroke-linecap="round"/><path d="M${x} 174V40" stroke="${pole}" stroke-width="2"/>`;
  let wires = '';
  for (const k of [0, 5, 9]) wires += `M-4 ${50 + k}Q57 ${66 + k} 118 ${46 + k}Q207 ${68 + k} 296 ${46 + k}Q350 ${62 + k} 404 ${52 + k}`;
  out += `<path d="${wires}M112 62c-7 2-5 9 1 7s6-7 0-9-9 4-3 9" fill="none" stroke="${mix(ink, '#000', .1)}" stroke-width="1.1"/>`;
  // street lamp
  const lampOn = env.lightsOn;
  out += `<path d="M240 174V102q0-6 8-6h6" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/><path d="M240 174V102q0-6 8-6h6" fill="none" stroke="${tone('#4b5d6e', env)}" stroke-width="1.8"/><path d="M251 96h12l-2 5h-8z" fill="${lampOn ? '#ffe9a0' : tone('#c9d3db', env)}" stroke="${ink}" stroke-width="1.2"/>`;
  if (lampOn) out += `<circle cx="257" cy="102" r="30" fill="url(#${P}lamp)"/><ellipse cx="257" cy="184" rx="34" ry="5" fill="#ffd36b" opacity=".22"/>`;
  // opposite sidewalk, road, our pavement
  out += `<path d="M0 170h400v7H0z" fill="${tone('#d6c0aa', env)}"/><path d="M0 176.5h400" stroke="${mix(tone('#8e7a6a', env), ink, .3)}" stroke-width="1.5"/>
<path d="M0 177h400v18H0z" fill="${tone('#55505c', env, .8)}"/><path d="M8 186h18M50 186h18M92 186h18M134 186h18M176 186h18M218 186h18M260 186h18M302 186h18M344 186h18M386 186h18" stroke="${env.night > .5 ? '#5d6488' : '#d9d2c8'}" stroke-width="1.6" opacity=".55"/>
<path d="M0 195h400v25H0z" fill="${env.night > .5 ? mix('#2b2333', '#6a4a3f', (1 - env.night) * .5) : tone('#6a4a3f', env, .9)}"/><path d="M0 195.5h400" stroke="${tone('#a07a62', env)}" stroke-width="2"/>
<path d="M0 207.5h400M30 196v11M90 196v11M150 196v11M210 196v11M270 196v11M330 196v11M390 196v11M60 208v12M120 208v12M180 208v12M240 208v12M300 208v12M360 208v12" stroke="#000" stroke-width="1" opacity=".13"/>`;
  // parked scooters on the far kerb
  for (const [x, c] of [[150, '#e8402f'], [334, '#2f7fc1']]) {
    const col = tone(c, env);
    out += `<g transform="translate(${x} 174)"><circle cx="-8" cy="-3" r="3.4" fill="${tone('#3b3540', env)}" stroke="${ink}" stroke-width="1"/><circle cx="9" cy="-3" r="3.4" fill="${tone('#3b3540', env)}" stroke="${ink}" stroke-width="1"/><path d="M-11 -4q0-6 5-8l2 1q-3 3-2 7zM-4 -5h7q1-6 7-6q4 0 4 5v1H-4z" fill="${col}" stroke="${ink}" stroke-width="1.1"/><path d="M1 -12h7" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/><path d="M-6 -12l-2-4" stroke="${ink}" stroke-width="1.2"/></g>`;
  }
  if (env.rain) {
    const sheen = env.night > .5 ? '#ffd36b' : mix(env.mid, '#ffffff', .3);
    out += `<g fill="${mix(env.mid, '#ffffff', .25)}" opacity=".45"><ellipse cx="74" cy="209" rx="34" ry="4"/><ellipse cx="248" cy="213" rx="42" ry="4.5"/><ellipse cx="360" cy="204" rx="22" ry="3"/></g>
<path d="M58 209h20M232 213h26M354 204h10M30 188v5M84 189v4M170 188v6M262 188v5M330 189v4" stroke="${sheen}" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>
<g fill="none" stroke="#e4eef8" stroke-width=".9" opacity=".7"><ellipse cx="90" cy="209" rx="5" ry="1.4"/><ellipse cx="236" cy="213" rx="6" ry="1.6"/><ellipse cx="364" cy="204" rx="4" ry="1.2"/></g>
${anim('rain', `<rect x="0" y="-244" width="464" height="468" fill="url(#${P}rain)"/>`)}`;
  }
  return out;
}

function streetTop(env, a) {
  const shadeK = env.night * .3;
  const v = mix(a.value, '#18244c', shadeK), c = mix(CREAM, '#18244c', shadeK), lining = mix(a.shadow, '#18244c', shadeK);
  const n = 12, sw = 400 / n;
  let stripes = '', edge = 'M0 0V8', lin = '';
  for (let i = 0; i < n; i++) {
    const x = r1(i * sw), x2 = r1((i + 1) * sw), m = r1(x + sw / 2);
    stripes += `<path d="M${x} 0H${x2}V8Q${m} 22 ${x} 8Z" fill="${i % 2 ? c : v}"/>`;
    edge += `Q${m} 22 ${x2} 8`;
    lin += `M${r1(x + 3)} 9.5Q${m} 19 ${r1(x2 - 3)} 9.5`;
  }
  let out = `${stripes}<path d="${lin}" fill="none" stroke="${lining}" stroke-width="2" opacity=".6"/><path d="${edge}V0" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/><path d="M0 3.5h400" stroke="#3a1d16" stroke-width="3" opacity=".12"/>`;
  // string lights in three swags hanging from scallop joins
  const swags = [[0, 133.3], [133.3, 266.7], [266.7, 400]], colors = ['#ffd23f', '#ff7a45', '#5fe08a', '#4fc3ff', '#ff5a5a'];
  let wire = '', sockets = '';
  const bulbs = [[], []];
  let k = 0;
  for (const [x0, x1] of swags) {
    const cx = (x0 + x1) / 2, y0 = 12, cy = 40;
    wire += `M${r1(x0)} ${y0}Q${r1(cx)} ${cy} ${r1(x1)} ${y0}`;
    for (let i = 1; i < 9; i++) {
      const t = i / 9, x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1, y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y0;
      sockets += rectD(x - 1.3, y, 2.6, 3);
      bulbs[k % 2].push([r1(x), r1(y + 6.2), colors[k % colors.length]]);
      k++;
    }
  }
  const ink = mix(INK, '#0b1024', env.night * .5);
  out += `<path d="${wire}" fill="none" stroke="${ink}" stroke-width="1.3"/><path d="${sockets}" fill="${ink}"/>`;
  const dots = list => list.map(([x, y]) => `M${x} ${y}h0`).join('');
  if (env.lightsOn) {
    bulbs.forEach((list, gi) => {
      let body = `<path d="${dots(list)}" stroke="${ink}" stroke-width="8.6"/>`;
      for (const c of colors) {
        const d = dots(list.filter(b => b[2] === c));
        if (d) body = `<path d="${d}" stroke="${c}" stroke-width="15" opacity=".3"/>` + body + `<path d="${d}" stroke="${mix(c, '#ffffff', .25)}" stroke-width="6.6"/>`;
      }
      out += anim('twinkle', `<g stroke-linecap="round">${body}</g>`, gi ? -.8 : 0);
    });
  } else {
    const d = dots(bulbs.flat());
    out += `<g stroke-linecap="round"><path d="${d}" stroke="${ink}" stroke-width="8.6"/><path d="${d}" stroke="#fff6e0" stroke-width="6.6"/></g>`;
  }
  return out;
}

export function streetBackdrop(options) {
  const { progress = 0, weather = 'clear', awning = { value: '#EF4B3F', shadow: '#C23328' }, idPrefix, label } = options || {};
  const P = prefixFor('street', idPrefix);
  const env = streetEnv(progress, weather === 'rain');
  const body = streetSky(P, env) + streetFar(env) + streetNear(env) + streetFront(P, env) + streetTop(env, awningColors(awning));
  return svgRoot('0 0 400 220', body, { label, cls: 'street-backdrop', extra: ' preserveAspectRatio="xMidYMid slice"' });
}

/* =====================================================================
 * Doodle tile — a sparse, faint, seamless page background.
 * ===================================================================== */

const DOODLES = {
  bowl: 'M-11 -2h22q-2 10-11 10t-11-10zM-13 -2h26M-5 -6q-2-3 0-6M1 -6q-2-3 0-6M7 -6q-2-3 0-6',
  chopsticks: 'M-11 9L9 -11M-7 11L13 -7',
  chili: 'M-11 5q9-2 14-10q3-3 6 0q-2 11-17 13q-4 0-3-3zM9 -5q1-5 5-5',
  star: 'M0 -9l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6-4.5-4.1 6-.7z',
  heart: 'M0 7c-6-4-9-7-9-11a4.5 4.5 0 0 1 9-2a4.5 4.5 0 0 1 9 2c0 4-3 7-9 11z',
  moon: 'M3 -9a9 9 0 1 0 6 13a7 7 0 1 1-6-13z',
  swirl: 'M0 0a2 2 0 0 1 4 0a4 4 0 0 1-8 0a6 6 0 0 1 12 0',
  plus: 'M-5 0h10M0 -5v10',
};
const DOODLE_LAYOUT = [['bowl', 34, 32, -10], ['chopsticks', 116, 28, 8], ['chili', 78, 82, -24], ['star', 138, 92, 12], ['heart', 26, 116, -14], ['moon', 104, 136, 18], ['swirl', 58, 140, 0], ['plus', 76, 18, 0], ['plus', 140, 146, 45]];

export function doodleTile(options) {
  const dark = !!options?.dark;
  const color = dark ? '#45313a' : '#f3d9cc';
  const shapes = DOODLE_LAYOUT.map(([name, x, y, rot]) => `<path transform="translate(${x} ${y}) rotate(${rot})" d="${DOODLES[name]}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><g fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${shapes}<path d="M12 64h0M150 54h0M96 104h0M44 76h0" stroke-width="3.2"/></g></svg>`;
}

export function doodleTileDataURI(options) {
  const dark = !!options?.dark;
  const svg = doodleTile({ dark }).replace(/"/g, "'").replace(/[\r\n%#()<>?[\\\]^`{|}]/g, ch => '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
  return `url("data:image/svg+xml,${svg}")`;
}
