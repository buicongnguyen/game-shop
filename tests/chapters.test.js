import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/game.js';

// Seventh parity pass: startup chapters, seats and rent by chapter, arrivals, the reviewer, insolvency, the forecast,
// the suggested cart and the smaller rule fixes. Each test names the item it covers.
const constant = value => () => value;
const sequence = (values, fallback = .5) => { let index = 0; return () => index < values.length ? values[index++] : fallback; };
const restore = state => g.loadGame({ getItem: () => JSON.stringify(state) });
const XP = { 1: 0, 2: 450, 3: 1500, 4: 4500, 5: 8000 };
// A shop at the given chapter (and the lowest level of its band), stocked, opened on a quiet weekday with no stories.
function shop({ stage = 1, day = 10, upgrades = [], money = 5000000, begin = true, event = null } = {}) {
  const state = g.createGame('Tiệm chương'); state.day = day; state.xp = XP[stage]; state.story = { stage, seen: stage }; state.money = money;
  for (const id of upgrades) state.upgrades[id] = true;
  if (event) state.nextEvent = { day, id: event, item: null };
  assert.equal(g.buyCart(state, { bowls: 40, noodles: 40, kimchi: 30, beef: 30, sausage: 30 }).ok, true);
  if (begin) { assert.equal(g.beginDay(state, constant(.99)).ok, true); g.takeNotices(); }
  return state;
}
function cook(state, dish, progress = .64) {
  assert.equal(g.takeBowl(state).ok, true); assert.equal(g.addBroth(state, dish.broth).ok, true);
  for (const id of dish.toppings) assert.equal(g.addTopping(state, id).ok, true);
  for (let i = 0; i < dish.spice; i++) assert.equal(g.addChili(state).ok, true);
  const index = state.activeDay.pots.findIndex(pot => !pot); assert.equal(g.startPot(state, index).ok, true);
  g.tickDay(state, state.activeDay.pots[index].duration * progress, constant(.5)); assert.equal(g.collectPot(state, index).ok, true);
}
function close(state) { let result = g.finishDay(state); if (result.closing) result = g.finishDay(state); assert.equal(result.finished, true, result.message); return result.summary; }
function holdArrivals(state) { state.activeDay.nextArrival = 999; state.activeDay.nextAppArrival = 999; }

test('1 · chapters follow the level bands; a new shop starts in the home kitchen, an old save at its band', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(g.stageBand), [1, 1, 2, 2, 3, 3, 3, 4, 4, 5]);
  const fresh = g.createGame('Tiệm mới'); assert.deepEqual(fresh.story, { stage: 1, seen: 1 }); assert.equal(g.chapterInfo(fresh).short, 'Bếp nhà');
  fresh.story.stage = 4; assert.equal(g.storyStage(fresh), 1, 'the effective chapter never runs ahead of the level band');
  const old = JSON.parse(JSON.stringify(g.createGame('Tiệm cũ'))); old.xp = 4600; delete old.story;
  assert.deepEqual(restore(old).story, { stage: 4, seen: 4 }, 'a save from before chapters starts at its band, already seen');
  for (const story of [{ stage: 6, seen: 1 }, { stage: 2, seen: 3 }, { stage: 0, seen: 0 }, [], null]) { const bad = JSON.parse(JSON.stringify(fresh)); bad.story = story; assert.equal(restore(bad), null, JSON.stringify(story)); }
  assert.equal(g.CHAPTERS.length, 5); assert.ok(g.CHAPTERS.every(row => row.name && row.short && row.text) && g.CHAPTERS.at(-1).goal === null);
});

test('1 · a chapter ends at closing only with its goal met and the next band reached, with a toast and a morning card', () => {
  const state = shop({ stage: 1 }); holdArrivals(state);
  state.history = [{ ...close(shop({ stage: 1 })), served: 30, dineInServed: 0, appOrders: 30 }]; // 30 app orders on an earlier day
  assert.equal(g.chapterGoal(state).done, true);
  let summary = close(state); assert.equal(state.story.stage, 1, 'goal met but level 1 is still in band 1'); assert.equal(summary.appOrders, 0);
  state.xp = 450; g.buyCart(state, { kimchi: 10 }); g.beginDay(state, constant(.99)); holdArrivals(state); g.takeNotices();
  close(state); assert.equal(state.story.stage, 2);
  const note = g.takeNotices().find(row => row.kind === 'chapter'); assert.ok(note && note.stage === 2 && note.cue === 'levelUp' && note.tone === 'good');
  assert.deepEqual(state.morning.filter(row => row.kind === 'chapter'), [{ kind: 'chapter', stage: 2 }]);
  assert.deepEqual(restore(state), state); assert.equal(state.story.seen, 1);
  const bad = JSON.parse(JSON.stringify(state)); bad.morning = [{ kind: 'chapter', stage: 3 }]; assert.equal(restore(bad), null, 'a card for a chapter not reached is refused');
  g.dismissMorning(state); assert.equal(state.story.seen, 2);
  // Chapter 2 needs 1,000,000₫ in the till; chapter 3 thirty reviews averaging 4.3★; chapter 4 5,000,000₫.
  assert.deepEqual(g.chapterGoal(state), { label: g.CHAPTERS[1].goal, value: Math.min(1000000, state.money), target: 1000000, done: state.money >= 1000000 });
  const three = g.createGame('Tiệm ba'); three.story.stage = 3; three.reviews = Array.from({ length: 30 }, (_, i) => ({ id: `day-1-order-${i + 1}`, day: 1, name: 'A', rating: i < 21 ? 5 : 3, stars0: 5, cause: null, text: 'Ngon', thread: [], xp: false })); three.reputation = 4.4;
  assert.equal(g.chapterGoal(three).done, true); three.reputation = 4.2; assert.equal(g.chapterGoal(three).done, false);
  three.story.stage = 4; three.money = 5000000; assert.equal(g.chapterGoal(three).done, true); three.story.stage = 5; assert.equal(g.chapterGoal(three), null);
});

test('2 · 3 · seats and rent by chapter: none in the kitchen, two at the cart, three in the shop, four with the table', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(stage => g.capacity(shop({ stage, begin: false }))), [0, 2, 3, 3, 3]);
  assert.equal(g.capacity(shop({ stage: 1, upgrades: ['table'], begin: false })), 4);
  assert.deepEqual([1, 2, 3].map(stage => g.dailyOperatingCost(shop({ stage, begin: false })).rent), [0, 0, 40000]);
  const kitchen = shop({ stage: 1 }); kitchen.activeDay.nextAppArrival = 999;
  g.tickDay(kitchen, 30, constant(.5)); assert.equal(kitchen.activeDay.orders.length, 0, 'no walk-ins in the home kitchen');
  assert.equal(g.createOrder(kitchen, constant(.5)).ok, false);
  const crowded = JSON.parse(JSON.stringify(kitchen)), guest = { id: 'day-10-order-90', name: 'A', broth: 'kimchi', toppings: [], spice: 0, price: 35000, dishes: [{ broth: 'kimchi', toppings: [], spice: 0, price: 35000 }], patience: 50, maxPatience: 60, bowlsTotal: 1, bowlsServed: 0, mistakes: 0, qualityPenalty: 0, delivery: false };
  crowded.activeDay.orders = [guest]; crowded.activeDay.customers = 1; crowded.stats.customers += 1; crowded.nextOrderId = 91; assert.ok(restore(crowded), 'the tutorial guest may still be seated');
  crowded.activeDay.orders = [guest, { ...guest, id: 'day-10-order-91' }]; crowded.activeDay.customers = 2; crowded.stats.customers += 1; crowded.nextOrderId = 92; assert.equal(restore(crowded), null, 'but no more');
  const summary = close(shop({ stage: 3 })); assert.equal(summary.rent, 40000);
});

test('4 · the home kitchen takes app orders without the app: three at once, gaps × 0.55, the delivery goal offered', () => {
  const state = shop({ stage: 1 }); state.activeDay.nextArrival = 999;
  g.tickDay(state, 10.05, constant(.5)); assert.equal(state.activeDay.orders.filter(order => order.delivery).length, 1, 'the first app order comes at 10 s');
  for (let i = 0; i < 4; i++) { state.activeDay.appSpawnElapsed = state.activeDay.nextAppArrival; g.tickDay(state, .1, constant(.5)); }
  assert.equal(state.activeDay.orders.filter(order => order.delivery).length, 3); assert.deepEqual(restore(state), state);
  const plain = shop({ stage: 2 }); plain.activeDay.nextArrival = 999; g.tickDay(plain, 30, constant(.5)); assert.equal(plain.activeDay.orders.length, 0, 'from the cart on, app orders need the app');
  const goals = []; for (let day = 2; day < 40; day++) { const row = g.createGame('Tiệm mục tiêu'); row.day = day; g.buyCart(row, { kimchi: 5, bowls: 5, noodles: 5 }); g.beginDay(row, constant(.99)); goals.push(...row.goals.map(goal => goal.metric)); }
  assert.ok(goals.includes('deliveries'), 'the delivery goal is offered in the kitchen');
});

test('4 · 5 · app-arrival gap: × 0.55 in the kitchen; the cart draws 15% more traffic on rain and hot days', () => {
  const gapAt = (stage, event, upgrades = []) => { const state = shop({ stage, event, upgrades: ['delivery', ...upgrades] }); state.xp = 1500; state.activeDay.nextArrival = 999; g.tickDay(state, 10.05, constant(.5)); return state.activeDay.nextAppArrival; };
  // Level 5 for all: only the stored chapter differs, so the ratio is the chapter factor alone.
  for (const event of ['rain', 'hot']) assert.ok(Math.abs(gapAt(2, event) / gapAt(3, event) - 1 / 1.15) < 1e-9, event);
  assert.ok(Math.abs(gapAt(2, 'payday') / gapAt(3, 'payday') - 1) < 1e-9, 'no bonus on other days');
  assert.ok(Math.abs(gapAt(1, 'payday') / gapAt(3, 'payday') - .55) < 1e-9, 'the kitchen orders come 0.55× as far apart');
});

test('6 · E · students only from the cart on; cold days lean hotter from the cart on', () => {
  const kitchen = g.createGame('Tiệm lịch'); const seen = new Set();
  for (let day = 3; day < 400; day++) { kitchen.day = day; seen.add(g.dayEvent(kitchen).id); }
  assert.ok(!seen.has('students') && seen.has('reviewer'));
  const cart = g.createGame('Tiệm lịch'); cart.xp = 450; cart.story.stage = 2; const later = new Set();
  for (let day = 3; day < 400; day++) { cart.day = day; later.add(g.dayEvent(cart).id); }
  assert.ok(later.has('students'));
  const cold = shop({ stage: 2, event: 'cold', upgrades: ['table'] }); holdArrivals(cold);
  const spices = []; for (let i = 0; i < 30; i++) { cold.activeDay.orders = []; cold.activeDay.selectedOrderId = null; const visit = g.createOrder(cold, sequence([.5, .5, .5, .01, .5, .1, (i % 10) / 10])); if (visit.ok) spices.push(visit.order.spice); }
  assert.ok(spices.length && spices.every(spice => spice >= 4), `cold-day floor 4–7: ${spices}`);
  const homeCold = shop({ stage: 1, event: 'cold', upgrades: ['table'] }); holdArrivals(homeCold);
  const low = g.createOrder(homeCold, sequence([.5, .5, .5, .01, .5, .1, .9])); assert.ok(low.ok && low.order.spice <= 3);
});

test('7 · level titles change at levels 1, 3, 5, 8 and 10', () => {
  const titles = g.LEVELS.map(row => row.title); const changes = g.LEVELS.filter((row, i) => i === 0 || row.title !== titles[i - 1]).map(row => row.level);
  assert.deepEqual(changes, [1, 3, 5, 8, 10]);
});

test('8 · 22 · the first walk-in comes at 1 s; the forecast is the flat rate over the day less 5%', () => {
  const state = shop({ stage: 3 }); assert.equal(state.activeDay.nextArrival, 1); assert.equal(state.activeDay.nextAppArrival, 10);
  g.tickDay(state, .95, constant(.5)); assert.equal(state.activeDay.orders.length, 0); g.tickDay(state, .1, constant(.5)); assert.equal(state.activeDay.orders.length, 1);
  const prep = shop({ stage: 3, begin: false }), forecast = g.forecastCustomers(prep);
  g.beginDay(prep, constant(.99)); const early = g.forecastCustomers(prep); prep.activeDay.elapsed = 100; prep.activeDay.remaining = 110;
  assert.equal(g.forecastCustomers(prep), early, 'no time-of-day shape'); assert.equal(forecast, early);
  // One walk-in every 10 / traffic seconds: the forecast inverts the opening gap's mean (jitter .75–1.25 at .5 = 1).
  const day = shop({ stage: 3 }); day.activeDay.event = { ...day.activeDay.event }; g.tickDay(day, 1.05, constant(.5));
  const traffic = 10 / day.activeDay.nextArrival / (day.activeDay.elapsed / 210 < .08 ? .8 : 1);
  assert.equal(g.forecastCustomers(day), Math.max(1, Math.round(210 * traffic / 10 * .95)));
});

test('11 · a quick haggle within 12 s of another situation pays the discount only: no star, no buzz', () => {
  const state = shop({ stage: 3 }); holdArrivals(state); state.day = 10;
  const order = g.createOrder(state, constant(.3)).order; order.trait = 'haggler'; cook(state, order);
  state.activeDay.lastIncidentAt = state.activeDay.elapsed - 3; const buzz = state.activeDay.buzz; g.takeNotices();
  const result = g.serveBowl(state, constant(.5)); assert.equal(result.incident, null);
  const note = g.takeNotices().find(row => row.kind === 'haggleQuick'); assert.ok(note && note.name === order.name && note.cut >= 5000);
  assert.equal(state.reviews.at(-1).rating, result.rating, 'the review keeps its stars'); assert.equal(state.activeDay.buzz, buzz);
});

test('12 · 13 · cheap and secret stars go on before the clamp; the cheap ratio is the mean of the bowls', () => {
  const low = shop({ stage: 3 }); holdArrivals(low); assert.equal(g.setPrice(low, 'kimchi', -10000).ok, true);
  const order = g.createOrder(low, constant(.5)).order; Object.assign(order, { toppings: [], spice: 0, price: 25000 }); order.dishes = [{ broth: 'kimchi', toppings: [], spice: 0, price: 25000 }];
  cook(low, order, .2); order.mistakes = 2; order.patience = order.maxPatience * .1;
  assert.equal(g.serveBowl(low, constant(.5)).rating, 1, 'raw 0 (two mistakes, long wait, raw noodles) + cheap = 1, not clamp-then-add 2');
  const pair = shop({ stage: 3 }); holdArrivals(pair); g.setPrice(pair, 'kimchi', -10000); g.setPrice(pair, 'beef', 7000); g.setPrice(pair, 'sausage', 4000);
  const group = g.createOrder(pair, constant(.5)).order, dishes = [{ broth: 'kimchi', toppings: [], spice: 0, price: 25000 }, { broth: 'kimchi', toppings: ['beef', 'sausage'], spice: 0, price: 59000 }];
  Object.assign(group, { ...dishes[0], toppings: [], dishes, bowlsTotal: 2, bowlsServed: 0 }); group.patience = group.maxPatience = 500;
  // Bowl ratios 25/35 and 59/58: the mean 0.866 is cheap, the pooled 84/93 = 0.903 would not be.
  cook(pair, dishes[0]); g.serveBowl(pair, constant(.5)); cook(pair, dishes[1]); const served = g.serveBowl(pair, constant(.5));
  assert.equal(served.review.cause, 'cheap');
});

test('15 · a sold-out dish swaps by the fresh-pick weights over what is in stock', () => {
  const state = shop({ stage: 3, upgrades: ['table'], begin: false }); assert.equal(g.buyCart(state, { greens: 10 }).ok, true);
  assert.equal(g.beginDay(state, constant(.99)).ok, true); holdArrivals(state);
  state.inventory.beef = 0; state.batches.beef = []; state.activeDay.recent = Array(6).fill(['kimchi', 'sausage']);
  // Draws: broth, topping count, topping (.1 → beef), spice, name, switch (.1 < .5), swap (.3).
  const visit = g.createOrder(state, sequence([.5, .5, .1, .5, .5, .1, .3]));
  assert.ok(visit.ok); assert.deepEqual(visit.order.toppings, ['greens'], 'sausage, in all six recent orders, weighs 1/10: an even pick would take it at .3');
});

test('17 · 18 · a night below zero repeats the day number until a loan; the minimum restock uses today’s prices and any broth', () => {
  const state = shop({ stage: 3 }); holdArrivals(state); state.money = 1000;
  const first = close(state); assert.equal(first.repeat, true); assert.equal(state.day, 10); assert.ok(state.money < 0); assert.equal(state.insolvent, true);
  assert.equal(state.morning.some(note => note.kind === 'gift'), false, 'no windfall on a repeated night');
  assert.equal(g.beginDay(state).ok, false); assert.equal(g.takeLoan(state).ok, true); assert.ok(state.money >= 0); assert.equal(state.insolvent, false);
  assert.equal(g.buyCart(state, { kimchi: 5, beef: 5 }).ok, true, 'tonight’s broth expired'); assert.equal(g.beginDay(state, constant(.99)).ok, true); assert.equal(state.activeDay.day, 10, 'the same day number opens again'); assert.deepEqual(restore(state), state);
  holdArrivals(state); const second = close(state); assert.equal(second.repeat, false); assert.equal(state.day, 11);
  const empty = g.createGame('Tiệm trống'); assert.equal(g.solvency(empty).needed, 5 * (1500 + 3000 + 6000));
  empty.inventory.tomyum = 1; empty.batches.tomyum = [{ qty: 1, expiresDay: 1, cost: 7000 }]; empty.unlocked.push('tomyum');
  assert.equal(g.solvency(empty).needed, 5 * (1500 + 3000), 'any broth in stock is enough');
  empty.nextEvent = { day: 1, id: 'sale', item: 'kimchi' }; empty.inventory.tomyum = 0; empty.batches.tomyum = [];
  assert.equal(g.solvency(empty).needed, 5 * (1500 + 3000 + 4200), 'today’s sale price counts');
});

test('19 · windfalls from the night after day 2, in fixed amounts per story', () => {
  const amounts = { 0: [50000, 80000, 100000], 1: [50000, 100000], 2: [20000, 30000, 40000] }, seen = [];
  for (let day = 1; day < 260; day++) {
    const state = shop({ stage: 3, day, begin: false }); state.nextEvent = { day, id: 'normal', item: null };
    for (let i = 0; i < day % 5; i++) state.stats.served++;
    g.beginDay(state, constant(.99)); holdArrivals(state); close(state);
    for (const note of state.morning.filter(row => row.kind === 'gift')) { assert.ok(day >= 2, `no windfall after day ${day}`); assert.ok(amounts[note.variant].includes(note.amount), JSON.stringify(note)); seen.push(note.amount); }
  }
  assert.ok(seen.length > 5, `windfalls happen: ${seen.length}`);
});

test('20 · 21 · reviews keep 400 and history 120; the summary averages every review written that day', () => {
  const state = shop({ stage: 3 }); holdArrivals(state); close(state);
  const review = state.reviews[0] ?? { id: 'day-10-order-1', day: 10, name: 'A', rating: 4, stars0: 4, cause: null, text: 'Ngon', thread: [], xp: false };
  state.reviews = Array.from({ length: 450 }, (_, i) => ({ ...review, id: `day-10-order-${i + 1}`, thread: [] }));
  state.history = Array.from({ length: 130 }, () => ({ ...state.lastDay }));
  const loaded = restore(state); assert.equal(loaded.reviews.length, 400); assert.equal(loaded.history.length, 120);
  const day = shop({ stage: 3, event: 'reviewer' }); day.activeDay.nextAppArrival = 999; day.activeDay.nextArrival = 999;
  g.tickDay(day, 74.1, constant(.5)); const critic = day.activeDay.orders.find(order => order.reviewer); assert.ok(critic);
  cook(day, critic); g.serveBowl(day, constant(.5)); const summary = close(day);
  const written = day.reviews.filter(row => row.day === 10); assert.equal(written.length, 3);
  assert.equal(summary.stars, Math.round(written.reduce((sum, row) => sum + row.rating, 0) / 3 * 100) / 100);
});

test('23 · the suggested cart replaces what expires tonight and trims the costliest line first, within tonight’s costs', () => {
  const state = shop({ stage: 3, begin: false }), before = g.suggestedCart(state);
  state.batches.kimchi.push({ qty: 10, expiresDay: state.day, cost: 6000 }); state.inventory.kimchi += 10;
  const after = g.suggestedCart(state); assert.equal(after.kimchi, before.kimchi, '10 more in stock, but all 10 expire tonight');
  assert.ok(Object.values(after).every(qty => qty <= 99));
  const tight = g.createGame('Tiệm ít vốn'); tight.money = 150000; const cart = g.suggestedCart(tight), costs = g.dailyOperatingCost(tight);
  assert.ok(g.cartCost(tight, cart) <= tight.money - costs.total); assert.equal(costs.rent, 0, 'no rent in the home kitchen budget');
  assert.ok(cart.bowls >= 5 && cart.noodles >= 5 && cart.kimchi >= 5, JSON.stringify(cart));
});
