import test from 'node:test';
import assert from 'node:assert/strict';
import { shopScene, streetBackdrop, doodleTile, doodleTileDataURI } from '../src/art/scene.js';
import { UPGRADES, DECORATIONS } from '../src/catalog.js';

const bytes = text => Buffer.byteLength(text, 'utf8');
const ids = svg => [...svg.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
const allUpgrades = Object.fromEntries(UPGRADES.map(item => [item.id, true]));
const decorationsOf = type => DECORATIONS.filter(item => item.type === type);
const awnings = decorationsOf('awning').map(item => ({ value: item.value, shadow: item.shadow }));
const SHOP_CLASSES = new Set(['shop-scene', 'steam', 'bob', 'swing', 'twinkle', 'marquee']);
const STREET_CLASSES = new Set(['street-backdrop', 'drift', 'twinkle', 'rain']);

/** A small tag-balance check: every opened element is closed in order. */
function assertWellFormed(svg) {
  const stack = [];
  for (const [, close, name, , selfClosing] of svg.matchAll(/<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g)) {
    if (selfClosing) continue;
    if (close) assert.equal(stack.pop(), name, `unexpected </${name}>`);
    else stack.push(name);
  }
  assert.deepEqual(stack, [], 'unclosed elements');
  assert.equal(svg.replace(/<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g, '').includes('<'), false, 'stray markup');
}

function assertSelfContained(svg) {
  assert.equal(svg.replaceAll('http://www.w3.org/2000/svg', '').includes('http'), false, 'external URL');
  for (const banned of ['<image', '<script', 'xlink:href', '<foreignObject', 'href="http', '<animate', '<set ']) assert.equal(svg.includes(banned), false, banned);
  const defined = new Set(ids(svg));
  assert.equal(defined.size, ids(svg).length, 'duplicate id inside one picture');
  for (const [, ref] of svg.matchAll(/url\(#([^)]+)\)/g)) assert.ok(defined.has(ref), `dangling url(#${ref})`);
}

function assertClasses(svg, allowed) {
  for (const [, list] of svg.matchAll(/\sclass="([^"]*)"/g)) for (const name of list.split(/\s+/)) assert.ok(allowed.has(name), `unexpected class ${name}`);
}

test('shop scene is deterministic for the same options and prefix', () => {
  const options = { awning: awnings[2], decorations: { pet: 'pet_dog', plant: 'plant_leaf', lamp: 'lamp_chime' }, upgrades: { sign: true, led: true, pot2: true }, level: 6, idPrefix: 'same-' };
  assert.equal(shopScene(options), shopScene(options));
  assert.equal(shopScene({ idPrefix: 'p-' }), shopScene({ idPrefix: 'p-' }));
  assert.match(shopScene(), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 600 520"/);
});

test('every decoration choice changes the shop scene', () => {
  const base = shopScene({ idPrefix: 'd-' });
  const seen = new Set([base]);
  for (const type of ['pet', 'plant', 'lamp']) {
    for (const item of decorationsOf(type)) {
      const svg = shopScene({ decorations: { [type]: item.id }, idPrefix: 'd-' });
      assert.notEqual(svg, base, `${item.id} should be visible`);
      assert.equal(seen.has(svg), false, `${item.id} should look different from other choices`);
      seen.add(svg);
      assert.equal(shopScene({ decorations: { [type]: item.value }, idPrefix: 'd-' }), svg, `${item.value} short form`);
    }
  }
});

test('every upgrade changes the shop scene, alone and on top of the others', () => {
  const base = shopScene({ idPrefix: 'u-' });
  for (const item of UPGRADES) {
    assert.notEqual(shopScene({ upgrades: { [item.id]: true }, idPrefix: 'u-' }), base, `${item.id} alone`);
    // Upgrades that another one requires (pot3 needs pot2) are compared without their dependants, as in the game.
    const full = Object.fromEntries(UPGRADES.filter(other => other.requires !== item.id).map(other => [other.id, true]));
    assert.notEqual(shopScene({ upgrades: full, idPrefix: 'u-' }), shopScene({ upgrades: { ...full, [item.id]: false }, idPrefix: 'u-' }), `${item.id} with everything else`);
  }
  assert.equal(shopScene({ upgrades: UPGRADES.map(item => item.id), idPrefix: 'u-' }), shopScene({ upgrades: allUpgrades, idPrefix: 'u-' }), 'array form');
});

test('unknown keys and bad values are ignored', () => {
  const base = shopScene({ idPrefix: 'k-' });
  assert.equal(shopScene({ idPrefix: 'k-', upgrades: { jetpack: true, sign: false }, decorations: { pet: 'pet_dragon', roof: 'gold', lamp: null } }), base);
  assert.equal(shopScene({ idPrefix: 'k-', awning: { value: 'not a colour' } }), base);
  assert.equal(shopScene({ idPrefix: 'k-', level: 'abc' }), base);
  assert.equal(shopScene({ idPrefix: 'k-', decorations: null, upgrades: null }), base);
  const derived = shopScene({ idPrefix: 'k-', awning: { value: '#3FAE92' } });
  assert.ok(derived.includes('#3fae92') && !derived.includes('undefined') && !derived.includes('NaN'), 'a missing shadow is derived from the value');
  assert.doesNotThrow(() => { shopScene(null); streetBackdrop(null); doodleTile(null); doodleTileDataURI(null); });
  assert.equal(shopScene({ idPrefix: 'k-', level: 0 }), shopScene({ idPrefix: 'k-', level: 1 }));
  assert.equal(shopScene({ idPrefix: 'k-', level: 99 }), shopScene({ idPrefix: 'k-', level: 10 }));
});

test('awning colours and level touches are drawn', () => {
  const shots = awnings.map(awning => shopScene({ awning, idPrefix: 'a-' }));
  assert.equal(new Set(shots).size, awnings.length);
  shots.forEach((svg, i) => assert.ok(svg.toLowerCase().includes(awnings[i].value.toLowerCase()), awnings[i].value));
  assert.notEqual(shopScene({ level: 5, idPrefix: 'l-' }), shopScene({ level: 4, idPrefix: 'l-' }), 'sign frame at 5+');
  assert.notEqual(shopScene({ level: 9, upgrades: { sign: true }, idPrefix: 'l-' }), shopScene({ level: 8, upgrades: { sign: true }, idPrefix: 'l-' }), 'crown at 9+');
});

test('street backdrop follows the day and the weather', () => {
  const times = [0, .3, .55, .75, .9, 1];
  const shots = times.map(progress => streetBackdrop({ progress, idPrefix: 's-' }));
  assert.equal(new Set(shots).size, times.length, 'each time of day looks different');
  for (const progress of times) assert.notEqual(streetBackdrop({ progress, weather: 'rain', idPrefix: 's-' }), streetBackdrop({ progress, idPrefix: 's-' }));
  assert.equal(streetBackdrop({ progress: .4, idPrefix: 's-' }), streetBackdrop({ progress: .4, idPrefix: 's-' }), 'deterministic');
  assert.equal(streetBackdrop({ progress: -3, idPrefix: 's-' }), streetBackdrop({ progress: 0, idPrefix: 's-' }));
  assert.equal(streetBackdrop({ progress: 7, idPrefix: 's-' }), streetBackdrop({ progress: 1, idPrefix: 's-' }));
  assert.equal(streetBackdrop({ progress: NaN, idPrefix: 's-' }), streetBackdrop({ progress: 0, idPrefix: 's-' }));
  assert.equal(streetBackdrop({ weather: 'fog', idPrefix: 's-' }), streetBackdrop({ idPrefix: 's-' }), 'unknown weather is clear');
  assert.notEqual(streetBackdrop({ awning: awnings[1], idPrefix: 's-' }), streetBackdrop({ idPrefix: 's-' }), 'our awning edge is drawn');
  assert.match(streetBackdrop(), /viewBox="0 0 400 220"[^>]*preserveAspectRatio="xMidYMid slice"/);
});

test('night sky is very dark blue with lights on; rain adds streaks', () => {
  const night = streetBackdrop({ progress: .95, idPrefix: 'n-' });
  assert.match(night, /stop-color="#(0[a-f0-9]|1[a-f0-9])(1[a-f0-9]|2[a-f0-9])(3[a-f0-9]|4[a-f0-9]|5[a-f0-9])"/, 'dark blue sky stop');
  const twinkles = text => (text.match(/class="twinkle"/g) || []).length;
  assert.ok(twinkles(night) > twinkles(streetBackdrop({ progress: .3, idPrefix: 'n-' })), 'string lights switch on in the evening');
  assert.equal(streetBackdrop({ progress: .3, idPrefix: 'n-' }).includes('class="rain"'), false);
  assert.ok(streetBackdrop({ progress: .3, weather: 'rain', idPrefix: 'n-' }).includes('class="rain"'));
  assert.ok(streetBackdrop({ progress: .3, idPrefix: 'n-' }).includes('class="drift"'), 'clouds drift');
});

test('ids are unique across calls without a prefix', () => {
  const pictures = [shopScene(), shopScene(), streetBackdrop(), streetBackdrop({ weather: 'rain' }), shopScene({ upgrades: allUpgrades })];
  const all = pictures.flatMap(ids);
  assert.ok(all.length > 10);
  assert.equal(new Set(all).size, all.length);
  assert.ok(ids(shopScene({ idPrefix: 'mine-' })).every(id => id.startsWith('mine-')));
  assert.ok(ids(shopScene({ idPrefix: '"><x' })).every(id => /^[\w-]+$/.test(id)), 'prefix is sanitised');
});

test('pictures are self-contained, well formed and use only the agreed animation classes', () => {
  const shops = [shopScene(), shopScene({ upgrades: allUpgrades, level: 10, decorations: { pet: 'pet_cat', plant: 'plant_daisy', lamp: 'lamp_lantern' } }), ...awnings.map(awning => shopScene({ awning, upgrades: allUpgrades }))];
  for (const svg of shops) { assertSelfContained(svg); assertWellFormed(svg); assertClasses(svg, SHOP_CLASSES); }
  for (const progress of [0, .3, .55, .75, .9, 1]) for (const weather of ['clear', 'rain']) {
    const svg = streetBackdrop({ progress, weather });
    assertSelfContained(svg); assertWellFormed(svg); assertClasses(svg, STREET_CLASSES);
  }
  for (const dark of [false, true]) { assertSelfContained(doodleTile({ dark })); assertWellFormed(doodleTile({ dark })); }
});

test('accessibility: decorative by default, labelled on request', () => {
  assert.match(shopScene(), /aria-hidden="true"/);
  const labelled = shopScene({ label: 'Tiệm "Cô Ba" & bạn' });
  assert.match(labelled, /role="img" aria-label="Tiệm &#34;Cô Ba&#34; &#38; bạn"/);
  assert.equal(labelled.includes('aria-hidden'), false);
  assert.match(streetBackdrop({ label: 'Phố' }), /role="img" aria-label="Phố"/);
});

test('size budgets hold in the worst cases', () => {
  let worstShop = 0;
  for (const pet of decorationsOf('pet')) for (const plant of decorationsOf('plant')) for (const lamp of decorationsOf('lamp')) for (const awning of [awnings[0], awnings[3]]) {
    worstShop = Math.max(worstShop, bytes(shopScene({ awning, upgrades: allUpgrades, level: 10, decorations: { pet: pet.id, plant: plant.id, lamp: lamp.id } })));
  }
  assert.ok(worstShop < 60000, `shop scene ${worstShop} bytes`);
  let worstStreet = 0;
  for (let i = 0; i <= 100; i++) for (const weather of ['clear', 'rain']) worstStreet = Math.max(worstStreet, bytes(streetBackdrop({ progress: i / 100, weather })));
  assert.ok(worstStreet < 30000, `street backdrop ${worstStreet} bytes`);
  assert.ok(bytes(doodleTile()) < 3000 && bytes(doodleTile({ dark: true })) < 3000);
});

test('doodle tile: two faint themes and a CSS-safe data URI', () => {
  const light = doodleTile(), dark = doodleTile({ dark: true });
  assert.notEqual(light, dark);
  assert.match(light, /width="160" height="160" viewBox="0 0 160 160"/);
  assert.ok(light.includes('#f3d9cc'));
  for (const theme of [false, true]) {
    const uri = doodleTileDataURI({ dark: theme });
    assert.match(uri, /^url\("data:image\/svg\+xml,.+"\)$/);
    const inner = uri.slice(5, -2);
    assert.equal(inner.includes('"'), false, 'no unescaped double quote');
    assert.equal(inner.includes('#'), false, 'no unescaped hash');
    assert.equal(/[<>\n]/.test(inner), false, 'no raw angle brackets or newlines');
    assert.equal(decodeURIComponent(inner.slice('data:image/svg+xml,'.length)), doodleTile({ dark: theme }).replace(/"/g, "'"));
  }
});

test('module is pure: importing and drawing needs no DOM', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  assert.ok(shopScene().length > 1000 && streetBackdrop().length > 1000 && doodleTile().length > 100);
});
