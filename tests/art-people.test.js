import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { customerFace, staffFace, mascot, CUSTOMER_PERSONAS, FACE_MOODS, STAFF_FACES, MASCOT_MOOD_IDS } from '../src/art/people.js';
import { STAFF } from '../src/catalog.js';

const PERSONAS = ['student', 'young-man', 'young-woman', 'regular', 'auntie', 'uncle', 'pair', 'gentleman', 'tourist', 'astronaut'];
const MOODS = ['happy', 'neutral', 'worried', 'angry'];
const STAFF_IDS = ['cashier', 'chef', 'waiter', 'buyer', 'broth', 'topping', 'market'];
const MASCOT_MOODS = ['happy', 'cheer', 'sad', 'neutral', 'think'];
const PORTRAIT_BUDGET = 5 * 1024; // docs/ART-STYLE.md: a portrait string under 5 KB
const MASCOT_BUDGET = 12 * 1024;
const SEEDS = [...Array.from({ length: 60 }, (_, i) => i), 1427, 99999, -3, 2.5, 'Lan', 'khách-7', '', 'Vy & Tùng'];
const bytes = text => Buffer.byteLength(text, 'utf8');
const idsOf = svg => [...svg.matchAll(/ id="([^"]+)"/g)].map(match => match[1]);
const withoutIds = svg => svg.replace(/ id="[^"]+"/g, ' id=""').replace(/url\(#[^)]+\)/g, 'url(#)');

// Structural checks shared by every picture.
function checkSvg(svg, viewBox) {
  assert.equal(typeof svg, 'string');
  assert.ok(svg.startsWith('<svg '), 'starts with <svg');
  assert.ok(svg.endsWith('</svg>'), 'ends with </svg>');
  assert.ok(svg.includes(` viewBox="${viewBox}"`), `has viewBox ${viewBox}`);
  assert.equal((svg.match(/"/g) || []).length % 2, 0, 'balanced quotes');
  const stack = [];
  for (const tag of svg.match(/<[^>]*>/g)) {
    assert.match(tag, /^<\/?[a-zA-Z]+(\s+[a-zA-Z-]+="[^"<>]*")*\s*\/?>$/, `well-formed tag ${tag.slice(0, 80)}`);
    const [, close, name] = tag.match(/^<(\/?)([a-zA-Z]+)/);
    if (close) assert.equal(stack.pop(), name, `closes </${name}>`);
    else if (!tag.endsWith('/>')) stack.push(name);
  }
  assert.deepEqual(stack, [], 'every element is closed');
  assert.equal(svg.replace(/<[^>]*>/g, ''), '', 'no stray text between tags');
  for (const bad of ['http', 'href=', 'xlink:href', '<script', '<image', '<foreignObject', '<animate', '<set', '<style', 'javascript:', 'NaN', 'undefined', 'Infinity']) {
    assert.ok(!svg.includes(bad), `contains no ${bad}`);
  }
  for (const [, d] of svg.matchAll(/ d="([^"]*)"/g)) assert.match(d, /^[MmLlHhVvCcSsQqTtAaZz0-9.\s,-]+$/, 'path data holds only commands and numbers');
  const ids = idsOf(svg);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique inside the picture');
  for (const id of ids) assert.match(id, /^[A-Za-z_][A-Za-z0-9_-]*$/, `valid id ${id}`);
  for (const [, ref] of svg.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.includes(ref), `url(#${ref}) points at an id in the same picture`);
  assert.ok(svg.includes('#4a2a22'), 'drawn with the warm brown outline');
  return ids;
}

test('exports the documented API and id lists', () => {
  assert.equal(typeof customerFace, 'function');
  assert.equal(typeof staffFace, 'function');
  assert.equal(typeof mascot, 'function');
  assert.deepEqual([...CUSTOMER_PERSONAS], PERSONAS);
  assert.deepEqual([...FACE_MOODS], MOODS);
  assert.deepEqual([...STAFF_FACES], STAFF_IDS);
  assert.deepEqual([...MASCOT_MOOD_IDS], MASCOT_MOODS);
  assert.ok(Object.isFrozen(CUSTOMER_PERSONAS) && Object.isFrozen(STAFF_FACES));
});

test('every persona, mood and seed renders a valid portrait within the size budget', () => {
  let largest = 0;
  for (const persona of PERSONAS) {
    for (const mood of MOODS) {
      for (const seed of SEEDS) {
        const svg = customerFace({ persona, seed, mood, idPrefix: `t-${persona}-` });
        checkSvg(svg, '0 0 80 80');
        assert.ok(svg.includes(`class="face face-${persona}"`), `${persona} class`);
        assert.ok(svg.includes('aria-hidden="true"'), 'decorative by default');
        assert.ok(bytes(svg) < PORTRAIT_BUDGET, `${persona}/${mood}/${seed}: ${bytes(svg)} bytes`);
        largest = Math.max(largest, bytes(svg));
      }
    }
  }
  assert.ok(largest > 2000, 'portraits carry real detail');
});

test('portraits stay within budget across many seeds', () => {
  for (const persona of PERSONAS) {
    for (let seed = 0; seed < 600; seed += 1) {
      const svg = customerFace({ persona, seed, mood: seed % 2 ? 'angry' : 'happy', idPrefix: 'face-123-' });
      assert.ok(bytes(svg) < PORTRAIT_BUDGET, `${persona}/${seed}: ${bytes(svg)} bytes`);
    }
  }
});

test('the same inputs give byte-identical markup and never call Math.random', () => {
  const random = Math.random;
  Math.random = () => { throw new Error('Math.random must not be used'); };
  try {
    for (const persona of PERSONAS) {
      for (const mood of MOODS) {
        const a = customerFace({ persona, seed: 7, mood, idPrefix: 'same-' });
        const b = customerFace({ persona, seed: 7, mood, idPrefix: 'same-' });
        assert.equal(a, b, `${persona}/${mood}`);
        assert.equal(customerFace({ persona, seed: 'Lan', mood, idPrefix: 'p' }), customerFace({ persona, seed: 'Lan', mood, idPrefix: 'p' }));
      }
    }
    for (const id of STAFF_IDS) assert.equal(staffFace(id, { mood: 'worried', idPrefix: 's-' }), staffFace(id, { mood: 'worried', idPrefix: 's-' }));
    for (const mood of MASCOT_MOODS) assert.equal(mascot(mood, { idPrefix: 'm-' }), mascot(mood, { idPrefix: 'm-' }));
  } finally {
    Math.random = random;
  }
  // Numbers and their string forms are the same seed.
  assert.equal(customerFace({ persona: 'auntie', seed: 12, idPrefix: 'x-' }), customerFace({ persona: 'auntie', seed: '12', idPrefix: 'x-' }));
});

test('without an idPrefix only the generated ids differ, and they never collide across calls', () => {
  const seen = new Set();
  const take = svg => {
    for (const id of checkSvg(svg, svg.includes('0 0 240 260') ? '0 0 240 260' : '0 0 80 80')) {
      assert.ok(!seen.has(id), `id ${id} reused across calls`);
      seen.add(id);
    }
    return svg;
  };
  for (let round = 0; round < 3; round += 1) {
    for (const persona of PERSONAS) for (const mood of MOODS) take(customerFace({ persona, seed: 5, mood }));
    for (const id of [...STAFF_IDS, 'nobody']) take(staffFace(id));
    for (const mood of MASCOT_MOODS) take(mascot(mood));
  }
  const a = take(customerFace({ persona: 'tourist', seed: 3, mood: 'happy' }));
  const b = take(customerFace({ persona: 'tourist', seed: 3, mood: 'happy' }));
  assert.notEqual(a, b);
  assert.equal(withoutIds(a), withoutIds(b));
  assert.ok(seen.size > 100);
});

test('different seeds usually look different', () => {
  for (const persona of PERSONAS) {
    const looks = new Set();
    for (let seed = 0; seed < 40; seed += 1) looks.add(customerFace({ persona, seed, mood: 'neutral', idPrefix: 'v-' }));
    assert.ok(looks.size >= 36, `${persona}: only ${looks.size} distinct looks in 40 seeds`);
  }
  // Skin tones and backgrounds both vary.
  const skins = new Set(), backs = new Set();
  for (let seed = 0; seed < 60; seed += 1) {
    const svg = customerFace({ persona: 'tourist', seed, idPrefix: 'v-' });
    backs.add(svg.match(/<path d="M0 0H80V80H0[zZ]" fill="(#[0-9a-f]+)"/)[1]);
    for (const tone of ['#f9d2b4', '#efc19c', '#d9a27a', '#b97d56', '#8d5a3b']) if (svg.includes(`fill="${tone}"`)) skins.add(tone);
  }
  assert.equal(skins.size, 5, 'all five skin tones appear');
  assert.ok(backs.size >= 5, 'several background colours appear');
  assert.ok(![...backs].includes('#fff') && ![...backs].includes('#ffffff'), 'backgrounds are never white');
});

test('moods are distinct and carry their marks', () => {
  for (const persona of PERSONAS) {
    for (const seed of [1, 2, 3]) {
      const faces = MOODS.map(mood => customerFace({ persona, seed, mood, idPrefix: 'm-' }));
      assert.equal(new Set(faces).size, 4, `${persona}/${seed}: four different moods`);
      const [happy, neutral, worried, angry] = faces;
      assert.ok(worried.includes('#a6e0f7'), `${persona}: worried has a sweat drop`);
      assert.ok(angry.includes('stroke="#fff3dc"'), `${persona}: angry has an anger mark`);
      assert.ok(!neutral.includes('#a6e0f7') && !neutral.includes('stroke="#fff3dc"'), `${persona}: neutral is calm`);
      if (persona !== 'pair') assert.ok(happy.includes('fill="#8c2f25"'), `${persona}: happy has an open smile`);
      else assert.ok(happy.includes(' d="M40 17.6'), 'a happy pair shares a heart');
    }
  }
});

test('the pair portrait draws two people side by side', () => {
  for (const seed of [0, 1, 2, 3, 4]) {
    const svg = customerFace({ persona: 'pair', seed, idPrefix: 'pair-' });
    assert.equal((svg.match(/scale\(0?\.7\)/g) || []).length, 2, 'two scaled people');
  }
});

test('unknown persona and mood fall back to regular and neutral', () => {
  assert.equal(customerFace({ persona: 'dragon', seed: 4, idPrefix: 'f-' }), customerFace({ persona: 'regular', seed: 4, idPrefix: 'f-' }));
  assert.equal(customerFace({ persona: 'student', seed: 4, mood: 'sleepy', idPrefix: 'f-' }), customerFace({ persona: 'student', seed: 4, mood: 'neutral', idPrefix: 'f-' }));
  checkSvg(customerFace(), '0 0 80 80');
  checkSvg(customerFace({ seed: { odd: true } }), '0 0 80 80');
  assert.ok(customerFace({ persona: 'regular', seed: 4, idPrefix: 'f-' }).includes('class="face face-regular"'));
});

test('astronauts wear a helmet with a raised visor, a suit collar and a mission patch', () => {
  for (const seed of [1, 2, 3, 4]) {
    const svg = customerFace({ persona: 'astronaut', seed, idPrefix: 'a-' });
    assert.ok(svg.includes('fill-rule="evenodd"'), 'helmet shell with a face window');
    assert.ok(svg.includes('fill="#f7c242"'), 'gold visor');
    assert.ok(['#2f7fc1', '#e8402f', '#2f8f8a', '#8a4d9e'].some(colour => svg.includes(`fill="${colour}"`)), 'coloured mission patch');
    assert.ok(svg.includes('fill="#c9d3db"'), 'metal suit collar');
  }
});

test('every staff id from the catalog has its own face', () => {
  assert.deepEqual(STAFF.map(row => row.id), STAFF_IDS.filter(id => id !== 'market'));
  for (const id of STAFF_IDS) {
    for (const mood of MOODS) {
      const svg = staffFace(id, { mood, idPrefix: `staff-${id}-` });
      checkSvg(svg, '0 0 80 80');
      assert.ok(svg.includes(`class="face staff-${id}"`));
      assert.ok(bytes(svg) < PORTRAIT_BUDGET, `${id}/${mood}: ${bytes(svg)} bytes`);
    }
    assert.equal(new Set(MOODS.map(mood => staffFace(id, { mood, idPrefix: 'z-' }))).size, 4, `${id}: four moods`);
  }
  const looks = new Set(STAFF_IDS.map(id => withoutIds(staffFace(id, { idPrefix: 'z-' })).replace(/staff-[a-z]+/, '')));
  assert.equal(looks.size, STAFF_IDS.length, 'seven different designs');
  // Unknown ids get one generic staff face; the default mood is happy.
  const generic = staffFace('nobody', { idPrefix: 'g-' });
  checkSvg(generic, '0 0 80 80');
  assert.ok(generic.includes('class="face staff-generic"'));
  assert.equal(generic, staffFace('generic', { idPrefix: 'g-' }));
  assert.equal(generic, staffFace(undefined, { idPrefix: 'g-' }));
  assert.equal(staffFace('chef', { idPrefix: 'g-' }), staffFace('chef', { mood: 'happy', idPrefix: 'g-' }));
  assert.equal(staffFace('chef', { mood: 'grumpy', idPrefix: 'g-' }), staffFace('chef', { mood: 'happy', idPrefix: 'g-' }));
  checkSvg(staffFace('waiter'), '0 0 80 80');
});

test('the mascot renders every mood within its budget', () => {
  const all = MASCOT_MOODS.map(mood => mascot(mood, { idPrefix: 'mascot-' }));
  all.forEach((svg, i) => {
    checkSvg(svg, '0 0 240 260');
    assert.ok(svg.includes(`class="mascot mascot-${MASCOT_MOODS[i]}"`));
    assert.ok(bytes(svg) < MASCOT_BUDGET, `${MASCOT_MOODS[i]}: ${bytes(svg)} bytes`);
    assert.ok(bytes(svg) > 3000, 'the mascot is drawn in detail');
    assert.ok(svg.includes('fill="#3a1d16"'), 'ground shadow');
    assert.ok(svg.includes('fill="#e8402f"') && svg.includes('fill="#5fae4e"'), 'red chili body with a green calyx');
  });
  assert.equal(new Set(all).size, MASCOT_MOODS.length, 'five different poses');
  assert.equal(withoutIds(mascot()), withoutIds(mascot('happy')), 'happy is the default');
  assert.equal(mascot('dance', { idPrefix: 'q-' }), mascot('happy', { idPrefix: 'q-' }));
});

test('idPrefix is sanitised into valid, attribute-safe ids', () => {
  const svg = customerFace({ persona: 'uncle', seed: 1, idPrefix: '9 a"b<c>&d' });
  const ids = checkSvg(svg, '0 0 80 80');
  assert.ok(ids.length >= 1);
  for (const id of ids) assert.match(id, /^[A-Za-z_][A-Za-z0-9_-]*$/);
  checkSvg(staffFace('cashier', { idPrefix: '"><script>' }), '0 0 80 80');
  checkSvg(mascot('think', { idPrefix: 'x y' }), '0 0 240 260');
});

test('a label makes the picture meaningful, with the text escaped', () => {
  const svg = customerFace({ persona: 'auntie', seed: 2, label: 'Cô "Lụa" <3 & bạn' });
  checkSvg(svg, '0 0 80 80');
  assert.ok(svg.includes('role="img" aria-label="Cô &quot;Lụa&quot; &lt;3 &amp; bạn"'));
  assert.ok(!svg.includes('aria-hidden'));
  assert.ok(staffFace('chef', { label: 'Bé Na' }).includes('role="img" aria-label="Bé Na"'));
  assert.ok(mascot('cheer', { label: 'Ớt' }).includes('aria-label="Ớt"'));
  assert.ok(mascot('cheer').includes('aria-hidden="true"'));
});

test('the module is pure: no DOM, timers, randomness or animation elements', () => {
  const source = readFileSync(new URL('../src/art/people.js', import.meta.url), 'utf8');
  for (const word of [/\bdocument\b/, /\bwindow\b/, /Math\.random/, /Date\.now/, /performance\./, /setTimeout|setInterval/, /<animate/]) {
    assert.ok(!word.test(source), `source avoids ${word}`);
  }
});
