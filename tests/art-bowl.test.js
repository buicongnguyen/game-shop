import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { bowlArt, noodlePot, TOPPING_IDS } from '../src/art/bowl.js';
import { INGREDIENTS } from '../src/catalog.js';

const bytes = text => Buffer.byteLength(text, 'utf8');
const ids = svg => [...svg.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
const stripIds = svg => svg.replace(/(id="|url\(#|href="#)[^")]+/g, '$1');
const BROTHS = INGREDIENTS.filter(item => item.kind === 'broth');
const TOPPINGS = INGREDIENTS.filter(item => item.kind === 'topping').map(item => item.id);
const ICON_IDS = INGREDIENTS.map(item => item.id);
const ICON_DIR = new URL('../public/assets/ingredients/', import.meta.url);
const POT_CLASSES = ['pot-art', 'steam', 'pot-flame', 'pot-handle', 'pot-body', 'pot-rim', 'pot-water', 'pot-noodles'];

/** Every opened element is closed in order and no stray markup remains. */
function assertWellFormed(svg) {
  const tag = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
  const stack = [];
  for (const [, close, name, , selfClosing] of svg.matchAll(tag)) {
    if (selfClosing) continue;
    if (close) assert.equal(stack.pop(), name, `unexpected </${name}>`);
    else stack.push(name);
  }
  assert.deepEqual(stack, [], 'unclosed elements');
  assert.equal(svg.replace(tag, '').includes('<'), false, 'stray markup');
}

/** No external references, no duplicate ids, and every url(#)/href(#) points inside the picture. */
function assertSelfContained(svg, { allowNamespace = false } = {}) {
  const body = allowNamespace ? svg.replace('xmlns="http://www.w3.org/2000/svg"', '') : svg;
  for (const banned of ['http', '<image', 'xlink:href', '<script', '<foreignObject', '<animate', '<set ']) assert.equal(body.includes(banned), false, banned);
  const defined = ids(svg);
  assert.equal(new Set(defined).size, defined.length, 'duplicate id inside one picture');
  for (const [, ref] of svg.matchAll(/(?:url\(#|href="#)([^")]+)/g)) assert.ok(defined.includes(ref), `dangling reference #${ref}`);
}

test('topping ids match the catalog toppings', () => {
  assert.ok(Object.isFrozen(TOPPING_IDS));
  assert.deepEqual([...TOPPING_IDS].sort(), [...TOPPINGS].sort());
});

test('bowlArt is deterministic for the same options and prefix', () => {
  const options = { brothColor: '#E4572E', noodles: 'cooked', toppings: ['egg', 'beef', 'corn', 'octopus'], spice: 5, idPrefix: 'same-' };
  assert.equal(bowlArt(options), bowlArt(options));
  assert.equal(bowlArt({ idPrefix: 'e-' }), bowlArt({ idPrefix: 'e-' }));
  // without a prefix only the generated ids differ
  assert.equal(stripIds(bowlArt({ brothColor: '#5A3522', noodles: 'soft', toppings: ['tofu'] })), stripIds(bowlArt({ brothColor: '#5A3522', noodles: 'soft', toppings: ['tofu'] })));
});

test('bowlArt draws a 160x120 picture that is well formed and self-contained in every state', () => {
  const states = [{}, { noodles: 'raw' }, { spice: 4 }];
  for (const broth of BROTHS) for (const noodles of [null, 'raw', 'cooked', 'soft']) states.push({ brothColor: broth.color, noodles, spice: 7 });
  for (let i = 0; i < TOPPINGS.length; i += 4) states.push({ brothColor: '#E4733D', noodles: 'cooked', toppings: TOPPINGS.slice(i, i + 4), spice: i % 8 });
  states.forEach((options, i) => {
    const svg = bowlArt({ ...options, idPrefix: `s${i}-` });
    assert.match(svg, /^<svg class="bowl-art" viewBox="0 0 160 120"/);
    assertWellFormed(svg);
    assertSelfContained(svg);
  });
});

test('broth, noodle doneness and every topping change the bowl', () => {
  const base = { brothColor: '#E4572E', noodles: 'cooked', idPrefix: 'v-' };
  const empty = bowlArt({ idPrefix: 'v-' });
  assert.notEqual(bowlArt({ brothColor: '#E4572E', idPrefix: 'v-' }), empty);
  assert.ok(bowlArt({ brothColor: '#E4572E', idPrefix: 'v-' }).includes('#E4572E'), 'broth uses the catalog colour');
  const doneness = ['raw', 'cooked', 'soft'].map(noodles => bowlArt({ ...base, noodles }));
  assert.equal(new Set([bowlArt({ brothColor: '#E4572E', idPrefix: 'v-' }), ...doneness]).size, 4);
  const plain = bowlArt(base);
  const seen = new Set([plain]);
  for (const id of TOPPING_IDS) {
    const svg = bowlArt({ ...base, toppings: [id] });
    assert.notEqual(svg, plain, `${id} is drawn`);
    assert.ok(!seen.has(svg), `${id} looks different from the other toppings`);
    seen.add(svg);
  }
});

test('unknown toppings are skipped and at most four are drawn', () => {
  const base = { brothColor: '#F2B35A', noodles: 'cooked', idPrefix: 'u-' };
  assert.equal(bowlArt({ ...base, toppings: ['pineapple', 'egg', 42, null] }), bowlArt({ ...base, toppings: ['egg'] }));
  assert.equal(bowlArt({ ...base, toppings: ['egg', 'beef', 'corn', 'tofu', 'octopus'] }), bowlArt({ ...base, toppings: ['egg', 'beef', 'corn', 'tofu'] }));
  assert.equal(bowlArt({ ...base, noodles: 'mushy' }), bowlArt({ ...base, noodles: null }));
  assert.equal(bowlArt({ ...base, brothColor: '"><script>' }).includes('<script'), false, 'unsafe colours are refused');
});

test('every spice level adds more chili', () => {
  const levels = [0, 1, 2, 3, 4, 5, 6, 7].map(spice => bowlArt({ brothColor: '#DCC25A', noodles: 'cooked', toppings: ['egg'], spice, idPrefix: 'h-' }));
  assert.equal(new Set(levels).size, 8);
  for (let i = 1; i < levels.length; i++) assert.ok(bytes(levels[i]) > bytes(levels[i - 1]), `spice ${i} draws more than ${i - 1}`);
  assert.equal(bowlArt({ spice: -3, idPrefix: 'h-' }), bowlArt({ spice: 0, idPrefix: 'h-' }));
  assert.equal(bowlArt({ spice: 99, idPrefix: 'h-' }), bowlArt({ spice: 7, idPrefix: 'h-' }));
  // chili still shows on an empty bowl or on noodles without broth
  assert.notEqual(bowlArt({ noodles: 'raw', spice: 6, idPrefix: 'h-' }), bowlArt({ noodles: 'raw', idPrefix: 'h-' }));
});

test('ids stay unique across pictures on one page', () => {
  const page = [bowlArt({ brothColor: '#A3211A', noodles: 'cooked', toppings: ['beef', 'egg'], spice: 7 }), bowlArt({ brothColor: '#A3211A', noodles: 'cooked', toppings: ['beef', 'egg'], spice: 7 }),
    noodlePot(), noodlePot(), bowlArt({ brothColor: '#86B24E', noodles: 'soft', toppings: ['tofu'], idPrefix: 'a-' }), noodlePot({ idPrefix: 'b-' })].join('');
  const all = ids(page);
  assert.ok(all.length > 10);
  assert.equal(new Set(all).size, all.length, 'no id repeats across calls');
});

test('size budgets: bowl under 14 KB at full load, pot small', () => {
  const plain = bowlArt({ brothColor: '#E4572E', noodles: 'cooked', idPrefix: 'bowl99-' });
  const heaviest = [...TOPPING_IDS].sort((a, b) => bytes(bowlArt({ brothColor: '#E4572E', noodles: 'cooked', toppings: [b], idPrefix: 'bowl99-' })) - bytes(bowlArt({ brothColor: '#E4572E', noodles: 'cooked', toppings: [a], idPrefix: 'bowl99-' })));
  for (const noodles of ['raw', 'cooked', 'soft']) {
    const full = bowlArt({ brothColor: '#E4572E', noodles, toppings: heaviest.slice(0, 4), spice: 7, idPrefix: 'bowl99-' });
    assert.ok(bytes(full) < 14 * 1024, `full ${noodles} bowl is ${bytes(full)} bytes`);
  }
  assert.ok(bytes(plain) < 8 * 1024);
  assert.ok(bytes(noodlePot({ idPrefix: 'pot99-' })) < 4 * 1024);
});

test('noodlePot keeps the class structure the game styles', () => {
  const svg = noodlePot({ idPrefix: 'k-' });
  assert.equal(svg, noodlePot({ idPrefix: 'k-' }), 'deterministic');
  assert.match(svg, /^<svg class="pot-art" viewBox="0 0 64 56"/);
  assertWellFormed(svg);
  assertSelfContained(svg);
  for (const name of POT_CLASSES) assert.ok(new RegExp(`class="${name}"`).test(svg), `.${name} present`);
  const steam = svg.match(/<g class="steam"[^>]*>(.*?)<\/g>/);
  assert.ok(steam, 'steam group');
  assert.equal((steam[1].match(/<path /g) || []).length, 3, 'three steam curls');
  assert.match(svg, /<g class="pot-flame">/);
  assert.ok(svg.indexOf('class="pot-flame"') < svg.indexOf('class="pot-body"'), 'flame sits under the pot');
  // each styled part is its own element with a default paint the game CSS can override
  assert.match(svg, /<ellipse class="pot-water"[^>]* fill="#[0-9a-f]{6}"/);
  assert.match(svg, /<path class="pot-noodles"[^>]* fill="none" stroke="#[0-9a-f]{6}"/);
  assert.match(svg, /<path class="pot-handle"[^>]* fill="none" stroke="#[0-9a-f]{6}"/);
  assert.equal(svg.includes('style='), false, 'no inline style blocks CSS overrides');
});

test('the 32 ingredient icons exist, are 128-unit SVGs under 6 KB and self-contained', () => {
  assert.equal(ICON_IDS.length, 32);
  const seen = new Map();
  for (const id of ICON_IDS) {
    const file = new URL(`${id}.svg`, ICON_DIR);
    assert.ok(existsSync(file), `${id}.svg exists`);
    const svg = readFileSync(file, 'utf8');
    assert.ok(svg.startsWith('<svg'), `${id}.svg starts with <svg`);
    assert.match(svg, /viewBox="0 0 128 128"/, `${id}.svg viewBox`);
    assert.ok(bytes(svg) < 6 * 1024, `${id}.svg is ${bytes(svg)} bytes`);
    assertWellFormed(svg);
    assertSelfContained(svg, { allowNamespace: true });
    for (const name of ids(svg)) {
      assert.ok(!seen.has(name), `id ${name} in ${id}.svg also used in ${seen.get(name)}.svg`);
      seen.set(name, id);
    }
  }
});
