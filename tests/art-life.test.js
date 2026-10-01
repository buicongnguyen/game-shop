import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lifeSprite, romanceMedallion, prankIcon, LIFE_KINDS, PRANK_ICON_KINDS, LIFE_SPRITE_INFO } from '../src/art/life.js';

const KINDS = ['sparrow', 'flock-bird', 'pedestrian', 'pedestrian-umbrella', 'vendor', 'officer', 'child-balloon', 'scooter', 'bicycle', 'tricycle', 'bus',
  'cat', 'dog', 'hamster', 'rat', 'kite', 'moth', 'gecko', 'leaf', 'petal', 'raindrop', 'splash', 'cloud', 'sparkle', 'shooting-star', 'flash', 'smoke',
  'balloon', 'lamp-glow', 'bunting', 'paper-plane', 'zz', 'heart'];
const FRAMES = { sparrow: 4, 'flock-bird': 2, pedestrian: 2, 'pedestrian-umbrella': 2, vendor: 2, officer: 2, 'child-balloon': 2, scooter: 2, bicycle: 2, tricycle: 2, bus: 2, cat: 4, dog: 2, hamster: 2, rat: 2, moth: 2, splash: 2 };
const MIN_VARIANTS = { sparrow: 3, pedestrian: 6, 'pedestrian-umbrella': 6, scooter: 3, cat: 3, kite: 3, leaf: 3, cloud: 3, smoke: 2, balloon: 3 };
const ICONS = ['rat', 'drunk', 'sidewalk', 'haggler', 'tour', 'celebrity'];
const TONES = ['day', 'dusk', 'night', 'rain'];
// Size budgets per returned svg (bytes). Umbrella walkers count as pedestrians.
const BUDGET = kind => ({ pedestrian: 3000, 'pedestrian-umbrella': 3000, officer: 3000, vendor: 3000, bus: 4000, tricycle: 4000, bunting: 4000 }[kind] || 2500);
const bytes = text => Buffer.byteLength(text, 'utf8');
const idsOf = svg => [...svg.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
const each = fn => { for (const kind of KINDS) { const info = LIFE_SPRITE_INFO[kind]; for (let frame = 0; frame < info.frames; frame++) for (let variant = 0; variant < info.variants; variant++) for (const tone of TONES) fn(kind, frame, variant, tone); } };

/** Structure shared by every picture: balanced tags, nothing external or animated, ids unique and references resolved. */
function checkSvg(svg, viewBox) {
  assert.equal(typeof svg, 'string');
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" '), 'starts with an svg root carrying xmlns');
  assert.ok(svg.endsWith('</svg>'), 'ends with </svg>');
  const root = svg.match(/^<svg[^>]*>/)[0];
  assert.ok(root.includes(` viewBox="${viewBox}"`), `viewBox ${viewBox}`);
  assert.ok(!/\s(width|height)="/.test(root), 'the caller sizes the picture: no width/height on the root');
  assert.ok(root.includes('aria-hidden="true"'), 'decorative');
  const stack = [];
  for (const tag of svg.match(/<[^>]*>/g)) {
    assert.match(tag, /^<\/?[a-zA-Z]+(\s+[a-zA-Z-]+="[^"<>]*")*\s*\/?>$/, `well-formed tag ${tag.slice(0, 80)}`);
    const [, close, name] = tag.match(/^<(\/?)([a-zA-Z]+)/);
    if (close) assert.equal(stack.pop(), name, `closes </${name}>`);
    else if (!tag.endsWith('/>')) stack.push(name);
  }
  assert.deepEqual(stack, [], 'every element is closed');
  assert.equal(svg.replace(/<[^>]*>/g, ''), '', 'no stray text between tags');
  assert.equal(svg.replaceAll('http://www.w3.org/2000/svg', '').includes('http'), false, 'no external URL');
  for (const bad of ['href', '<script', '<image', '<foreignObject', '<text', '<animate', '<set', '<style', 'javascript:', 'NaN', 'undefined', 'Infinity', '<use']) {
    assert.ok(!svg.includes(bad), `contains no ${bad}`);
  }
  assert.ok(!/\son[a-z]+=/i.test(svg), 'no event-handler attributes');
  assert.ok(!/url\((?!#)/.test(svg), 'only local url(#id) references');
  for (const [, d] of svg.matchAll(/ d="([^"]*)"/g)) assert.match(d, /^[MmLlHhVvCcSsQqTtAaZz0-9.\s,-]+$/, 'path data holds only commands and numbers');
  const ids = idsOf(svg);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique inside the picture');
  for (const id of ids) assert.match(id, /^[A-Za-z_][A-Za-z0-9_-]*$/, `valid id ${id}`);
  for (const [, ref] of svg.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.includes(ref), `url(#${ref}) points at an id in the same picture`);
  return ids;
}

test('exports the documented API with frozen lists', () => {
  assert.deepEqual([...LIFE_KINDS], KINDS);
  assert.deepEqual([...PRANK_ICON_KINDS], ICONS);
  assert.ok(Object.isFrozen(LIFE_KINDS) && Object.isFrozen(PRANK_ICON_KINDS) && Object.isFrozen(LIFE_SPRITE_INFO));
  for (const kind of KINDS) {
    const info = LIFE_SPRITE_INFO[kind];
    assert.ok(Object.isFrozen(info), `${kind} info is frozen`);
    assert.equal(info.frames, FRAMES[kind] || 1, `${kind} frame count`);
    assert.ok(info.variants >= (MIN_VARIANTS[kind] || 1), `${kind} has at least ${MIN_VARIANTS[kind] || 1} variants`);
  }
});

test('every kind, frame, variant and tone renders a valid sprite within its budget', () => {
  const worst = {};
  each((kind, frame, variant, tone) => {
    const sprite = lifeSprite(kind, { frame, variant, tone });
    const info = LIFE_SPRITE_INFO[kind];
    assert.deepEqual(Object.keys(sprite).sort(), ['ax', 'ay', 'h', 'svg', 'w']);
    assert.deepEqual([sprite.w, sprite.h, sprite.ax, sprite.ay], [info.w, info.h, info.ax, info.ay], `${kind}: frames share size and anchor`);
    checkSvg(sprite.svg, `0 0 ${sprite.w} ${sprite.h}`);
    const size = bytes(sprite.svg);
    assert.ok(size <= BUDGET(kind), `${kind} f${frame} v${variant} ${tone}: ${size} bytes > ${BUDGET(kind)}`);
    worst[kind] = Math.max(worst[kind] || 0, size);
  });
  assert.ok(worst.pedestrian > 1500 && worst.bus > 2500, 'the bigger sprites carry real detail');
});

test('sizes are believable against the 400×220 street and anchors sit inside the box', () => {
  for (const kind of KINDS) {
    const { w, h, ax, ay } = LIFE_SPRITE_INFO[kind];
    assert.ok(w > 0 && h > 0 && w <= 200 && h <= 40, `${kind} ${w}×${h}`);
    assert.ok(ax >= 0 && ax <= w && ay >= 0 && ay <= h, `${kind} anchor (${ax}, ${ay}) inside ${w}×${h}`);
  }
  const { pedestrian, scooter, bus } = LIFE_SPRITE_INFO;
  assert.ok(pedestrian.h >= 24 && pedestrian.h <= 30, 'a walker is about 24-28 units tall');
  assert.ok(scooter.w >= 24 && scooter.w <= 32, 'a scooter is about 28 units long');
  assert.ok(bus.w >= 70 && bus.w <= 86);
  for (const kind of ['pedestrian', 'pedestrian-umbrella', 'vendor', 'officer', 'child-balloon', 'scooter', 'bicycle', 'tricycle', 'bus', 'cat', 'dog', 'hamster', 'rat']) {
    const { h, ay } = LIFE_SPRITE_INFO[kind];
    assert.ok(h - ay <= 1.2, `${kind} stands on its anchor (feet or wheels at the bottom)`);
  }
});

test('the same arguments give the same string, without Math.random', () => {
  const random = Math.random;
  Math.random = () => { throw new Error('Math.random must not be used'); };
  try {
    for (const kind of KINDS) for (const tone of TONES) {
      assert.equal(lifeSprite(kind, { tone, variant: 1 }).svg, lifeSprite(kind, { tone, variant: 1 }).svg, `${kind} ${tone}`);
    }
    assert.equal(lifeSprite('lamp-glow', { tone: 'night' }).svg, lifeSprite('lamp-glow', { tone: 'night' }).svg, 'no hidden counter without an idPrefix');
    for (const stage of [0, 1, 2]) assert.equal(romanceMedallion(stage, { idPrefix: 'r-' }), romanceMedallion(stage, { idPrefix: 'r-' }));
    for (const kind of ICONS) assert.equal(prankIcon(kind), prankIcon(kind));
  } finally {
    Math.random = random;
  }
  assert.deepEqual(lifeSprite('cat'), lifeSprite('cat', { frame: 0, variant: 0, tone: 'day' }), 'defaults');
});

test('variants wrap, frames and variants look different, tones relight the picture', () => {
  for (const kind of KINDS) {
    const { variants, frames } = LIFE_SPRITE_INFO[kind];
    const base = lifeSprite(kind, { variant: 1 }).svg;
    assert.equal(lifeSprite(kind, { variant: 1 + variants }).svg, base, `${kind}: variant wraps`);
    assert.equal(lifeSprite(kind, { variant: 1 - variants * 3 }).svg, base, `${kind}: negative variant wraps`);
    assert.equal(lifeSprite(kind, { variant: 'x' }).svg, lifeSprite(kind).svg, `${kind}: a non-number variant is variant 0`);
    if (variants > 1) assert.equal(new Set(Array.from({ length: variants }, (_, v) => lifeSprite(kind, { variant: v }).svg)).size, variants, `${kind}: every variant differs`);
    if (frames > 1) assert.equal(new Set(Array.from({ length: frames }, (_, f) => lifeSprite(kind, { frame: f }).svg)).size, frames, `${kind}: every frame differs`);
    const looks = new Set(TONES.map(tone => lifeSprite(kind, { tone }).svg));
    assert.equal(looks.size, 4, `${kind}: four tones look different`);
    assert.equal(lifeSprite(kind, { tone: 'fog' }).svg, lifeSprite(kind).svg, `${kind}: unknown tone is day`);
  }
});

test('night keeps vivid accents and lights; rain brings umbrellas and ponchos', () => {
  const night = lifeSprite('scooter', { tone: 'night' }).svg;
  assert.ok(night.includes('#ffe07a') && night.includes('#ff5a4a'), 'headlight beam and tail light at night');
  assert.ok(!lifeSprite('scooter').svg.includes('#ffe07a'), 'no beam by day');
  assert.ok(lifeSprite('scooter', { tone: 'rain' }).svg.includes('fill-opacity=".9"'), 'a poncho in the rain');
  assert.ok(lifeSprite('bus', { tone: 'night' }).svg.includes('#ffd36b'), 'lit bus windows');
  assert.ok(lifeSprite('cat', { variant: 1, tone: 'night' }).svg.includes('#d8ea5a'), 'a black cat keeps glowing eyes');
  assert.ok(lifeSprite('pedestrian', { variant: 1, tone: 'night' }).svg.includes('#bde6ff'), 'a glowing phone screen');
  const umbrellas = new Set(Array.from({ length: 6 }, (_, v) => lifeSprite('pedestrian-umbrella', { variant: v, tone: 'rain' }).svg.match(/fill="(#[0-9a-f]{6})"/g).join()));
  assert.equal(umbrellas.size, 6);
  const red = lifeSprite('scooter', { tone: 'night' }).svg;
  assert.ok(/#[89a-f][0-9a-f][0-5][0-9a-f][0-5][0-9a-f]/.test(red), 'the red helmet stays reddish at night');
  const clouds = TONES.map(tone => lifeSprite('cloud', { tone }).svg.match(/fill="(#[0-9a-f]{6})"/)[1]);
  assert.deepEqual(clouds, ['#ffffff', '#ffd3b4', '#3a4d82', '#9aa6b5'], 'white, peach, slate and grey clouds');
});

test('unknown kinds and frames throw', () => {
  assert.throws(() => lifeSprite('dragon'), /unknown kind/);
  assert.throws(() => lifeSprite(), /unknown kind/);
  assert.throws(() => lifeSprite('toString'), /unknown kind/);
  assert.throws(() => lifeSprite('cat', { frame: 4 }), /no frame/);
  assert.throws(() => lifeSprite('cat', { frame: -1 }), /no frame/);
  assert.throws(() => lifeSprite('cat', { frame: 1.5 }), /no frame/);
  assert.throws(() => lifeSprite('cat', { frame: '1' }), /no frame/);
  assert.throws(() => lifeSprite('heart', { frame: 1 }), /no frame/);
  assert.throws(() => prankIcon('ghost'), /unknown kind/);
  assert.throws(() => prankIcon(), /unknown kind/);
});

test('ids: only gradients carry them, prefixed and sanitised', () => {
  for (const kind of KINDS.filter(k => k !== 'lamp-glow')) assert.deepEqual(idsOf(lifeSprite(kind, { idPrefix: 'p-' }).svg), [], `${kind} has no ids`);
  const glow = lifeSprite('lamp-glow', { idPrefix: 'street-7-', tone: 'night' }).svg;
  const ids = checkSvg(glow, '0 0 40 40');
  assert.ok(ids.length >= 1 && ids.every(id => id.startsWith('street-7-')));
  assert.ok(glow.includes('<radialGradient'));
  const odd = checkSvg(lifeSprite('lamp-glow', { idPrefix: '9 a"b<c>&d' }).svg, '0 0 40 40');
  assert.ok(odd.every(id => /^[A-Za-z_][\w-]*$/.test(id)), 'prefix is sanitised');
  assert.notDeepEqual(idsOf(lifeSprite('lamp-glow', { tone: 'day' }).svg), idsOf(lifeSprite('lamp-glow', { tone: 'night' }).svg), 'different looks never share a default id');
});

test('the romance medallion shows both cooks and the stage badge', () => {
  const stages = [0, 1, 2].map(stage => romanceMedallion(stage, { idPrefix: `rm-${stage}-` }));
  stages.forEach((svg, stage) => {
    const ids = checkSvg(svg, '0 0 80 80');
    assert.ok(bytes(svg) <= 12 * 1024, `stage ${stage}: ${bytes(svg)} bytes`);
    assert.ok(ids.length >= 2 && ids.every(id => id.startsWith(`rm-${stage}-`)), 'face clip paths take the prefix');
    assert.ok(ids.some(id => id.includes('chef')) && ids.some(id => id.includes('broth')), 'the noodle cook and the broth cook');
    assert.ok(svg.includes('#ffd6e4') && svg.includes('#f28ab2') && svg.includes('#e8628f'), 'pale pink medallion with a double pink ring');
    assert.ok(svg.includes(`romance-stage-${stage}`));
  });
  assert.equal(new Set(stages.map(svg => svg.replace(/rm-\d-/g, ''))).size, 3, 'three different badges');
  assert.ok(stages[0].includes('#e8402f'), 'a red heart');
  assert.ok(stages[1].includes('#7a2418') && stages[1].includes('#5fae4e'), 'a lacquered tray with a betel leaf');
  assert.ok(stages[2].includes('#f7c242') && stages[2].includes('#f28ab2'), 'gold rings and a pink star');
  assert.equal(romanceMedallion(-4, { idPrefix: 'c-' }), romanceMedallion(0, { idPrefix: 'c-' }), 'stages clamp low');
  assert.equal(romanceMedallion(9, { idPrefix: 'c-' }), romanceMedallion(2, { idPrefix: 'c-' }), 'stages clamp high');
  assert.equal(romanceMedallion('1', { idPrefix: 'c-' }), romanceMedallion(1, { idPrefix: 'c-' }));
  checkSvg(romanceMedallion(1, { idPrefix: '"><script>' }), '0 0 80 80');
  assert.equal(romanceMedallion(1), romanceMedallion(1), 'deterministic without a prefix');
});

test('prank and favour icons render within budget and look different', () => {
  const all = ICONS.map(kind => prankIcon(kind, { idPrefix: 'x-' }));
  all.forEach((svg, i) => {
    checkSvg(svg, '0 0 64 64');
    assert.ok(bytes(svg) <= 4096, `${ICONS[i]}: ${bytes(svg)} bytes`);
    assert.ok(bytes(svg) > 800, `${ICONS[i]} is drawn in detail`);
    assert.ok(svg.includes('#4a2a22'), 'warm brown outline');
    assert.ok(svg.includes(`prank-${ICONS[i]}`));
  });
  assert.equal(new Set(all).size, ICONS.length);
});

test('the module is pure: no DOM, timers, randomness or animation elements', () => {
  const source = readFileSync(new URL('../src/art/life.js', import.meta.url), 'utf8');
  for (const word of [/\bdocument\b/, /\bwindow\b/, /Math\.random/, /Date\.now/, /performance\./, /setTimeout|setInterval/, /<animate/, /<text/]) {
    assert.ok(!word.test(source), `source avoids ${word}`);
  }
  assert.equal(typeof globalThis.document, 'undefined');
});
