import test from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../src/voice.js';

// Seeded LCG returning [0, 1). The seed is mixed first so that small seeds start far apart.
function lcg(seed) {
  let state = Math.imul((seed >>> 0) ^ 0x9e3779b9, 2654435761) >>> 0;
  return () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
}
function withoutMathRandom(run) {
  const original = Math.random;
  Math.random = () => { throw new Error('Math.random must not be called when random is given'); };
  try { return run(); } finally { Math.random = original; }
}
const line = segments => segments.map(segment => segment.text).join('');
const CAUSES = ['great', 'ok', 'meh', 'wait', 'noodle', 'pricey', 'wrong', 'cheap', 'secret', 'app-great', 'walkout',
  'app-late', 'stockout', 'price-walk', 'dirty', 'sick', 'kind', 'honest', 'cheat', 'stingy', 'hair', 'noise'];
const SELVES = ['em', 'anh', 'chị', 'cô', 'chú', 'mình', 'tụi mình', 'tôi'];
const STARS = [1, 2, 3, 4, 5];

test('personas are 8 frozen entries with weights, honorifics, a self word and at least 12 names', () => {
  assert.equal(V.PERSONAS.length, 8);
  assert.ok(Object.isFrozen(V.PERSONAS));
  assert.equal(new Set(V.PERSONAS.map(row => row.id)).size, 8);
  for (const row of V.PERSONAS) {
    assert.ok(Object.isFrozen(row) && Object.isFrozen(row.names) && Object.isFrozen(row.honorifics));
    assert.ok(row.weight > 0 && row.honorifics.length > 0 && typeof row.self === 'string' && row.self);
    assert.ok(new Set(row.names).size >= 12, `${row.id} needs 12 distinct names`);
  }
  assert.deepEqual(new Set(V.PERSONAS.map(row => row.self)), new Set(SELVES));
});

test('pickCustomer returns a weighted, valid persona with a natural honorific + name', () => {
  const random = lcg(1), counts = {};
  for (let index = 0; index < 3000; index++) {
    const customer = V.pickCustomer(random), row = V.PERSONAS.find(item => item.id === customer.persona);
    assert.ok(row, customer.persona);
    assert.equal(customer.self, row.self);
    assert.ok(customer.name.length <= 40);
    assert.ok(row.honorifics.some(word => row.names.some(name => customer.name === `${word} ${name}`)), customer.name);
    counts[row.id] = (counts[row.id] || 0) + 1;
  }
  assert.equal(Object.keys(counts).length, 8);
  assert.ok(counts.student > counts.gentleman, 'weight 16 should beat weight 8');
  assert.deepEqual(V.pickCustomer(() => 0).name.split(' ')[0], V.PERSONAS[0].honorifics[0]);
  assert.equal(V.pickCustomer(() => 0.99999).persona, V.PERSONAS.at(-1).id);
});

test('same seed gives the same output and never touches Math.random', () => {
  withoutMathRandom(() => {
    const order = { self: 'chị', broth: 'mì cay kim chi', toppings: ['bò Mỹ', 'xúc xích'], spice: 2 };
    for (const seed of [1, 2, 99]) {
      const run = () => {
        const random = lcg(seed);
        return [V.pickCustomer(random), V.orderLine({ ...order, trait: 'hurried', random }),
          V.composeReview({ cause: 'wait', stars: 2, dish: 'mì cay kim chi', random }),
          V.sassyReply({ cause: 'hair', stars: 1, random }), V.customerAnswer({ tone: 'polite', stars: 5, random })];
      };
      assert.deepEqual(run(), run());
    }
    const lines = new Set(Array.from({ length: 30 }, (_, seed) => line(V.orderLine({ ...order, random: lcg(seed) }))));
    assert.ok(lines.size >= 10, 'different seeds should vary the wording');
  });
});

test('orderLine returns typed, non-empty segments that read as one spoken order', () => {
  for (let seed = 0; seed < 300; seed++) {
    const toppings = [[], ['bò Mỹ'], ['Trứng lòng đào', 'nấm kim châm'], ['bò Mỹ', 'xúc xích', 'chả cá Hàn']][seed % 4];
    const trait = [null, ...V.TRAITS][seed % 6], spice = seed % 8;
    const segments = V.orderLine({ self: SELVES[seed % 8], broth: 'Mì cay mala Tứ Xuyên', toppings, spice, trait, random: lcg(seed) });
    const text = line(segments);
    assert.ok(text.length <= 200, text);
    for (const segment of segments) {
      assert.ok(['plain', 'broth', 'topping', 'spice'].includes(segment.kind));
      assert.ok(typeof segment.text === 'string' && segment.text.length > 0);
    }
    assert.deepEqual(segments.filter(segment => segment.kind === 'broth').map(segment => segment.text), ['mì cay mala Tứ Xuyên']);
    assert.deepEqual(segments.filter(segment => segment.kind === 'topping').map(segment => segment.text), toppings.map(name => name[0].toLowerCase() + name.slice(1)));
    const spiceSegments = segments.filter(segment => segment.kind === 'spice');
    assert.equal(spiceSegments.length, 1);
    if (spice === 0) assert.match(spiceSegments[0].text, /không cay/);
    else assert.match(spiceSegments[0].text, new RegExp(`\\b${spice}\\b`));
    if (!toppings.length) assert.match(text, /không thêm gì/);
    if (trait === 'tourist') assert.match(text, /\b(hello|hi|please|thank|thanks|one|with)\b/i);
    else assert.match(text, / ơi[,!]/, 'a local customer calls the cook');
    assert.doesNotMatch(text, /[{}]|undefined|\s{2}/);
  }
});

test('orderLine spice 0, plain bowls, traits and very long orders', () => {
  const base = { self: 'em', broth: 'mì cay kim chi', toppings: ['bò Mỹ'], spice: 0 };
  for (const spice of [0, -3, Number.NaN, undefined]) {
    const segments = V.orderLine({ ...base, spice, random: lcg(4) });
    assert.match(segments.find(segment => segment.kind === 'spice').text, /^không cay/);
  }
  const plain = V.orderLine({ ...base, toppings: [], random: lcg(5) });
  assert.equal(plain.filter(segment => segment.kind === 'topping').length, 0);
  assert.match(line(plain), /không thêm gì/);
  const patterns = { hurried: /gấp|nhanh|lẹ/i, patient: /từ từ|không gấp|thong thả/i, haggler: /bớt|rẻ|khuyến mãi|làm tròn/i, fickle: /thôi/i };
  for (let seed = 0; seed < 40; seed++) {
    const plainLine = line(V.orderLine({ ...base, random: lcg(seed) }));
    for (const [trait, pattern] of Object.entries(patterns)) {
      const withTrait = line(V.orderLine({ ...base, trait, random: lcg(seed) }));
      assert.match(withTrait, pattern, `${trait}: ${withTrait}`);
      if (trait !== 'fickle') assert.ok(withTrait.startsWith(plainLine) && withTrait.length > plainLine.length, withTrait);
      else assert.notEqual(withTrait, plainLine);
    }
  }
  const many = Array.from({ length: 14 }, (_, index) => `topping số ${index + 1} thật dài`);
  for (const trait of [null, ...V.TRAITS]) {
    const segments = V.orderLine({ self: 'tụi mình', broth: 'mì cay riêu cua đặc biệt của quán', toppings: many, spice: 7, trait, random: lcg(8) });
    assert.ok(line(segments).length <= 200 && segments.every(segment => segment.text.length > 0));
    assert.equal(segments.filter(segment => segment.kind === 'spice').length, 1);
  }
});

test('every review cause gives a non-empty review of at most 180 characters for 1–5 stars', () => {
  assert.deepEqual([...V.REVIEW_CAUSES].sort(), [...CAUSES].sort());
  for (const cause of CAUSES) for (const stars of STARS) {
    const seen = new Set();
    for (let seed = 0; seed < 40; seed++) {
      const full = seed % 2 === 0;
      const review = V.composeReview({ cause, stars, random: lcg(seed), self: SELVES[seed % 8],
        ...(full ? { dish: 'Mì cay mala Tứ Xuyên', topping: 'trứng lòng đào', spice: 7 } : {}) });
      assert.ok(review.length > 0 && review.length <= 180, `${cause}/${stars}: ${review}`);
      assert.doesNotMatch(review, /[{}]|undefined|\s{2}/);
      for (const [, count] of review.matchAll(/(\d) sao/g)) assert.equal(Number(count), stars, `${cause}/${stars}: ${review}`);
      seen.add(review);
    }
    assert.ok(seen.size >= 6, `${cause}/${stars} should vary`);
  }
});

test('review placeholders are filled naturally and skipped when empty', () => {
  const filled = new Set(), empty = new Set();
  for (let seed = 0; seed < 400; seed++) {
    for (const cause of ['great', 'wrong', 'sick', 'stockout', 'secret']) {
      filled.add(V.composeReview({ cause, stars: seed % 5 + 1, dish: 'mì cay kim chi', topping: 'Bò Mỹ', spice: 3, self: 'chị', random: lcg(seed) }));
      empty.add(V.composeReview({ cause, stars: seed % 5 + 1, random: lcg(seed) }));
    }
  }
  const all = [...filled].join('\n');
  for (const piece of ['mì cay kim chi', 'Mì cay kim chi', 'bò Mỹ', 'cấp 3', 'chị', 'Chị']) assert.ok(all.includes(piece), piece);
  for (const review of [...filled, ...empty]) assert.doesNotMatch(review, /[{}]/);
  for (const review of empty) {
    assert.doesNotMatch(review, /cấp \d|bò Mỹ|kim chi/);
    assert.doesNotMatch(review, /\s{2}|\s[,.!?]/);
  }
});

test('composeReview rerolls to avoid recent texts', () => {
  for (const cause of CAUSES) for (const stars of STARS) {
    const first = V.composeReview({ cause, stars, random: lcg(21) });
    const again = V.composeReview({ cause, stars, random: lcg(21), recent: [first] });
    assert.notEqual(again, first, `${cause}/${stars}`);
    const recent = Array.from({ length: 4 }, (_, seed) => V.composeReview({ cause, stars, random: lcg(seed) }));
    const fresh = V.composeReview({ cause, stars, random: lcg(77), recent });
    assert.ok(!recent.includes(fresh), `${cause}/${stars}: ${fresh}`);
  }
  // With every option already used it still answers.
  assert.ok(V.composeReview({ cause: 'ok', stars: 3, random: () => 0, recent: [V.composeReview({ cause: 'ok', stars: 3, random: () => 0 })] }).length > 0);
});

test('replyTone is accent-insensitive and rude beats polite', () => {
  const cases = [
    ['Cảm ơn bạn đã ghé quán!', 'polite'], ['cam on ban nhieu nha', 'polite'], ['XIN LỖI vì để bạn chờ', 'polite'],
    ['Dạ, quán ghi nhận ạ.', 'polite'], ['da quan xin loi a', 'polite'], ['Mong bạn quay lại', 'polite'],
    ['Rất vui được phục vụ', 'polite'], ['Lần sau ghé nữa nha', 'polite'], ['lan sau ghe nua nha', 'polite'],
    ['Đồ ngu!', 'rude'], ['do ngu', 'rude'], ['Không thích thì đi chỗ khác.', 'rude'], ['khong thich thi di cho khac', 'rude'],
    ['Im đi, nói xạo quá.', 'rude'], ['Cảm ơn nhưng bạn nói xạo quá', 'rude'], ['Cam on, nhung ban noi xao', 'rude'],
    ['Dạ, mặc kệ bạn.', 'rude'], ['Mì hôm nay hết sớm.', 'neutral'], ['Thêm trứng cút đi bạn', 'neutral'],
    ['Sợi mì mỏng quá', 'neutral'], ['Ngủ ngon nha', 'neutral'], ['Đã sửa lại bảng giá.', 'neutral'], ['', 'neutral'],
  ];
  for (const [text, tone] of cases) assert.equal(V.replyTone(text), tone, text);
  assert.equal(V.replyTone('Cảm ơn'.normalize('NFD')), 'polite');
});

test('replySuggestions gives 3 distinct polite replies: fixes for 1–3 stars, thanks for 4–5', () => {
  for (const cause of [...CAUSES, 'unknown']) for (const stars of STARS) {
    for (const name of ['', 'Chị Mỹ Linh', 'Hai bạn Vy & Tùng', 'Tên khách rất rất dài '.repeat(4)]) {
      const replies = V.replySuggestions({ cause, stars, name });
      assert.equal(replies.length, 3);
      assert.equal(new Set(replies).size, 3);
      for (const reply of replies) {
        assert.ok(reply.length > 0 && reply.length <= 120, reply);
        assert.equal(V.replyTone(reply), 'polite', reply);
        assert.doesNotMatch(reply, /[{}]/);
        if (stars >= 4) assert.match(reply, /cảm ơn|rất vui/i);
      }
      if (stars <= 3) assert.ok(replies.some(reply => /xin lỗi/i.test(reply)), `${cause}/${stars}`);
    }
  }
  assert.notDeepEqual(V.replySuggestions({ cause: 'wait', stars: 2 }), V.replySuggestions({ cause: 'hair', stars: 2 }));
  assert.ok(V.replySuggestions({ cause: 'wait', stars: 1, name: 'Chị Mỹ Linh' }).some(reply => reply.includes('chị Mỹ Linh')));
  assert.ok(V.replySuggestions({ cause: 'great', stars: 5, name: 'Em Gia Huy' }).some(reply => reply.includes('em Gia Huy')));
});

test('sassyReply is short and never classified as polite', () => {
  for (const cause of [...CAUSES, 'unknown']) for (const stars of STARS) for (let seed = 0; seed < 30; seed++) {
    const reply = V.sassyReply({ cause, stars, random: lcg(seed) });
    assert.ok(reply.length > 0 && reply.length <= 120, reply);
    assert.ok(['rude', 'neutral'].includes(V.replyTone(reply)), reply);
  }
});

test('customerAnswer is grateful after polite replies, cold after rude ones, neutral otherwise', () => {
  for (const stars of STARS) for (let seed = 0; seed < 30; seed++) {
    const polite = V.customerAnswer({ tone: 'polite', stars, random: lcg(seed) });
    const rude = V.customerAnswer({ tone: 'rude', stars, random: lcg(seed) });
    const neutral = V.customerAnswer({ tone: 'neutral', stars, random: lcg(seed) });
    for (const answer of [polite, rude, neutral]) assert.ok(answer.length > 0 && answer.length <= 120, answer);
    assert.equal(V.replyTone(polite), 'polite', polite);
    assert.match(polite, /cảm ơn/i);
    assert.notEqual(V.replyTone(rude), 'polite', rude);
    assert.equal(V.replyTone(neutral), 'neutral', neutral);
    assert.notEqual(rude, polite);
  }
});
