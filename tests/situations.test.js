import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/game.js';

// Situations: street stories, dirty floors, haggling, fickle guests, stockouts, timeouts, insolvency,
// the reserve, goals and level-ups, the tutorial, the buyer, the chef and overnight credit.
const restore = state => g.loadGame({ getItem: () => JSON.stringify(state) });
const constant = value => () => value;
// Returns the listed values in order, then the fallback.
const sequence = (values, fallback = .5) => { let index = 0; return () => index < values.length ? values[index++] : fallback; };
// A stocked shop on a quiet weekday (day 10) with no scheduled stories and, when asked, no new arrivals.
function openOn(day = 10, { tutorial = false, arrivals = true } = {}) {
  const state = g.createGame('Tiệm tình huống', { tutorial }); state.day = day; state.money = 3000000;
  assert.equal(g.buyCart(state, { bowls: 30, noodles: 30, kimchi: 20, beef: 20, sausage: 20 }).ok, true);
  assert.equal(g.beginDay(state, constant(.99)).ok, true);
  assert.deepEqual(state.activeDay.storyTimes, []);
  if (!arrivals) state.activeDay.nextArrival = 999;
  g.takeNotices();
  return state;
}
// Kimchi broth with one beef topping at the given spice level: 50,000đ at default prices.
function guest(state, spice = 1) { const result = g.createOrder(state, sequence([.5, .5, .1, [.1, .3, .6, .9][spice]])); assert.equal(result.ok, true, result.message); return result.order; }
function cook(state, order) {
  assert.equal(g.takeBowl(state).ok, true);
  assert.equal(g.addBroth(state, order.broth).ok, true);
  for (const id of order.toppings) assert.equal(g.addTopping(state, id).ok, true);
  for (let i = 0; i < order.spice; i++) assert.equal(g.addChili(state).ok, true);
  const index = state.activeDay.pots.findIndex(pot => !pot); assert.equal(g.startPot(state, index).ok, true);
  g.tickDay(state, state.activeDay.pots[index].duration * .64, constant(.5));
  assert.equal(g.collectPot(state, index).ok, true);
}
function close(state) { let result = g.finishDay(state); if (result.closing) result = g.finishDay(state); return result; }

test('stories fall in the day windows, wait for the bowl in hand, pause the clock and respect the daily cap', () => {
  const state = g.createGame('Tiệm tình huống'); state.day = 10; state.money = 3000000;
  assert.equal(g.buyCart(state, { bowls: 30, noodles: 30, kimchi: 20, beef: 20, sausage: 20 }).ok, true);
  assert.equal(g.beginDay(state, constant(.1)).ok, true);
  assert.deepEqual(state.activeDay.storyTimes, [28.98, 84, 138.6]);
  assert.equal(g.takeBowl(state).ok, true);
  g.tickDay(state, 30, constant(.5));
  assert.equal(state.activeDay.pendingIncident, null, 'no story while a bowl is in hand');
  assert.ok(state.activeDay.storyTimes[0] > 29);
  assert.equal(g.discardBowl(state).ok, true);
  assert.equal(g.tickDay(state, 3, constant(.5)).paused, true);
  const incident = state.activeDay.pendingIncident; assert.equal(incident.type, 'story'); assert.ok(g.STORIES[incident.story]);
  assert.match(incident.id, /^incident-10-\d+$/);
  const elapsed = state.activeDay.elapsed; assert.equal(g.tickDay(state, 5, constant(.5)).paused, true); assert.equal(state.activeDay.elapsed, elapsed, 'the clock waits for an answer');
  assert.equal(g.serveBowl(state).ok, false); assert.equal(g.finishDay(state).ok, false);
  assert.deepEqual(restore(state), state, 'a pending story survives a reload');
  assert.equal(g.resolveIncident(state, 'not-an-option').ok, false);
  assert.equal(g.resolveIncident(state, incident.options[0].id, constant(.5)).ok, true);
  assert.equal(state.activeDay.pendingIncident, null);
  // Day 4 onwards allows three situations a day; a slot past the cap is dropped, not delayed.
  state.activeDay.incidentCount = 3; state.activeDay.nextArrival = 999; const slots = state.activeDay.storyTimes.length;
  g.tickDay(state, 60, constant(.5));
  assert.equal(state.activeDay.pendingIncident, null); assert.equal(state.activeDay.storyTimes.length, slots - 1);
});

test('day two keeps each story window with 40% odds and day one has none', () => {
  const first = g.createGame('Tiệm tình huống'); g.buyCart(first, g.suggestedCart(first)); g.beginDay(first, constant(.1)); assert.deepEqual(first.activeDay.storyTimes, []);
  const second = g.createGame('Tiệm tình huống'); second.day = 2; g.buyCart(second, g.suggestedCart(second)); g.beginDay(second, constant(.45)); assert.deepEqual(second.activeDay.storyTimes, [], '.45 misses the 40% odds of day two');
  const later = g.createGame('Tiệm tình huống'); later.day = 3; g.buyCart(later, g.suggestedCart(later)); g.beginDay(later, constant(.45)); assert.equal(later.activeDay.storyTimes.length, 3, 'but meets the 60% odds from day three');
});

test('story choices apply money, slow stoves and patience once', () => {
  const state = openOn(10, { arrivals: false }), order = guest(state);
  assert.equal(g.forceStory(state, 'gas', constant(.5)).ok, true);
  assert.equal(g.forceStory(state, 'power').ok, false, 'one situation at a time');
  const money = state.money; assert.equal(g.resolveIncident(state, 'refill').ok, true); assert.equal(state.money, money - 60000);
  assert.equal(g.resolveIncident(state, 'refill').ok, false, 'a settled story cannot be paid twice');
  g.forceStory(state, 'gas'); g.resolveIncident(state, 'backup');
  assert.equal(state.activeDay.slowUntil, state.activeDay.elapsed + 40);
  assert.equal(g.startPot(state, 0).ok, true); g.tickDay(state, 1, constant(.5));
  assert.ok(Math.abs(state.activeDay.pots[0].elapsed - .65) < 1e-6, 'pots cook at 65% speed on the backup burner');
  g.forceStory(state, 'power'); const before = order.patience; g.resolveIncident(state, 'endure');
  assert.equal(order.patience, before - 10);
  order.patience = 3; g.forceStory(state, 'power'); g.resolveIncident(state, 'endure');
  assert.equal(order.patience, 3, 'a penalty never causes an instant walkout');
  g.forceStory(state, 'power'); g.resolveIncident(state, 'water'); assert.equal(order.patience, 11, 'iced water buys eight seconds');
});

test('a spill left on the floor slows guests until three mops; a lingering mess brings an inspection', () => {
  const state = openOn(10, { arrivals: false }), order = guest(state);
  const spill = g.forceStory(state, 'spill', constant(.5)).incident;
  assert.equal(spill.name, order.name); assert.ok(!spill.options.some(option => option.id === 'staff'), 'no helpers, no staff option');
  assert.equal(g.resolveIncident(state, 'later').ok, true);
  assert.deepEqual(state.activeDay.dirty, { since: state.activeDay.elapsed, taps: 0 });
  const before = order.patience; g.tickDay(state, 1, constant(.5));
  assert.ok(Math.abs(before - order.patience - 1.15) < 1e-6, 'a dirty floor drains patience 15% faster');
  assert.equal(g.mopFloor(state).taps, 1); assert.equal(g.mopFloor(state).taps, 2);
  const clean = g.mopFloor(state); assert.equal(clean.clean, true); assert.equal(state.activeDay.dirty, null);
  assert.equal(g.mopFloor(state).ok, false, 'a clean floor needs no mop');
  g.forceStory(state, 'pipe'); g.resolveIncident(state, 'later'); order.patience = order.maxPatience = 500;
  g.tickDay(state, 36, constant(.5));
  const inspection = state.activeDay.pendingIncident; assert.equal(inspection?.story, 'inspection'); assert.equal(state.activeDay.inspected, true);
  const money = state.money; g.resolveIncident(state, 'pay'); assert.equal(state.money, money - 80000); assert.equal(state.activeDay.dirty, null);
  g.forceStory(state, 'pipe'); g.resolveIncident(state, 'later'); g.tickDay(state, 40, constant(.5));
  assert.equal(state.activeDay.pendingIncident, null, 'one inspection a day');
  const reviews = state.reviews.length; order.patience = 1; g.tickDay(state, 2, constant(.9)); close(state);
  assert.ok(state.reviews.slice(reviews).some(review => review.rating === 2 && review.name === 'Khách qua đường'), 'closing on a dirty floor costs a 2★ review');
});

test('a noisy guest drains other tables faster; sending a guest home loses them without a review', () => {
  const state = openOn(10, { arrivals: false }), loud = guest(state), quiet = guest(state);
  g.forceStory(state, 'drunk', sequence([0])); const drunk = state.activeDay.pendingIncident;
  assert.equal(drunk.targetId, loud.id); g.resolveIncident(state, 'ignore'); assert.equal(state.activeDay.noisyId, loud.id);
  const [a, b] = [loud.patience, quiet.patience]; g.tickDay(state, 1, constant(.5));
  assert.ok(Math.abs(a - loud.patience - 1) < 1e-6 && Math.abs(b - quiet.patience - 1.3) < 1e-6);
  g.forceStory(state, 'drunk', sequence([0])); const reviews = state.reviews.length, lost = state.activeDay.lost;
  g.resolveIncident(state, 'sendhome');
  assert.ok(!state.activeDay.orders.includes(loud)); assert.equal(state.activeDay.noisyId, null);
  assert.equal(state.activeDay.lost, lost + 1); assert.equal(state.reviews.length, reviews);
});

test('tourists, an office takeaway and a spoiled topping change the kitchen', () => {
  const state = openOn(10, { arrivals: false });
  g.forceStory(state, 'tour'); g.resolveIncident(state, 'host', constant(.5));
  assert.equal(state.activeDay.orders.length, 3); assert.ok(state.activeDay.orders.every(order => order.tourist && order.self === 'I' && !order.trait));
  state.activeDay.orders = []; state.activeDay.selectedOrderId = null;
  const bowls = state.inventory.bowls, money = state.money;
  const party = g.forceStory(state, 'party').incident; assert.equal(party.bulk, 6); assert.equal(party.broth, 'kimchi');
  g.resolveIncident(state, 'full');
  assert.equal(state.inventory.bowls, bowls - 6); assert.equal(state.money, money + 6 * state.prices.kimchi);
  const supplier = g.forceStory(state, 'supplier', sequence([.5, 0])).incident, stock = state.inventory[supplier.topping], waste = state.activeDay.waste;
  g.resolveIncident(state, 'discard'); assert.equal(state.inventory[supplier.topping], stock - 3); assert.ok(state.activeDay.waste > waste);
});

test('the shop cat catches a rat and a waiter mops a spill without a dialog', () => {
  const state = openOn(10, { arrivals: false }); guest(state);
  state.decoration.owned.push('pet_cat'); state.decoration.selected.pet = 'pet_cat';
  const rat = g.forceStory(state, 'rat'); assert.equal(rat.incident, null); assert.equal(state.activeDay.pendingIncident, null);
  assert.match(g.takeNotices()[0].text, /Mèo/);
  state.staff.waiter = true; assert.equal(g.forceStory(state, 'spill').incident, null); assert.equal(state.activeDay.dirty, null);
});

test('a haggling guest asks for 15% after eating; conceding lifts the review and a recent situation means no dialog', () => {
  const state = openOn(10, { arrivals: false }), order = guest(state); order.trait = 'haggler';
  cook(state, order); const served = g.serveBowl(state, constant(.5)); assert.equal(served.ok, true);
  const haggle = state.activeDay.pendingIncident; assert.equal(haggle.type, 'haggle');
  assert.equal(haggle.cut, Math.max(5000, Math.round(haggle.bill * .15 / 1000) * 1000));
  assert.deepEqual(haggle.options.map(option => option.id), ['concede', 'hold', 'tea']);
  const money = state.money; g.resolveIncident(state, 'concede'); assert.equal(state.money, money - haggle.cut);
  assert.equal(state.reviews.at(-1).rating, 5);
  const second = guest(state); second.trait = 'haggler'; cook(state, second); state.activeDay.lastIncidentAt = state.activeDay.elapsed;
  const cash = state.money, result = g.serveBowl(state, constant(.5));
  assert.equal(state.activeDay.pendingIncident, null, 'within 12 s of another situation the owner simply agrees');
  assert.equal(state.money, cash + result.earned - Math.max(5000, Math.round((second.price + result.tip) * .15 / 1000) * 1000));
  assert.ok(g.takeNotices().some(note => /xin bớt/.test(note.text)));
});

test('holding the price can cost a star; tea usually keeps it', () => {
  const state = openOn(10, { arrivals: false }), order = guest(state); order.trait = 'haggler';
  cook(state, order); g.serveBowl(state, sequence([.5, .9]));
  assert.equal(state.activeDay.pendingIncident.roll, .9); g.resolveIncident(state, 'hold'); assert.equal(state.reviews.at(-1).rating, 3);
  const next = guest(state); next.trait = 'haggler'; state.activeDay.lastIncidentAt = -30; cook(state, next); g.serveBowl(state, constant(.5));
  const money = state.money; g.resolveIncident(state, 'tea'); assert.equal(state.money, money - g.TEA_COST);
});

test('a fickle guest changes their spice level once, below 70% patience', () => {
  const state = openOn(10, { arrivals: false }), order = guest(state, 1); order.trait = 'fickle';
  g.tickDay(state, order.maxPatience * .29, constant(.9)); assert.equal(order.changed, false);
  g.tickDay(state, order.maxPatience * .02, constant(.9));
  assert.equal(order.changed, true); assert.equal(order.spice, 3); assert.equal(order.dishes[0].spice, 3);
  assert.match(g.takeNotices().at(-1).text, /đổi ý/);
  g.tickDay(state, 5, constant(.1)); assert.equal(order.spice, 3, 'only once');
  assert.deepEqual(restore(state), state);
});

test('arriving guests switch to a stocked topping or walk away when their dish is sold out', () => {
  const state = openOn(10, { arrivals: false }); state.inventory.beef = 0; state.batches.beef = [];
  const switched = g.createOrder(state, sequence([.5, .5, .1, .5, .5, .1, .5, .9]));
  assert.equal(switched.ok, true); assert.deepEqual(switched.order.toppings, ['sausage']); assert.equal(switched.order.price, 43000);
  const customers = state.activeDay.customers, reviews = state.reviews.length;
  const walked = g.createOrder(state, sequence([.5, .5, .1, .5, .5, .9, .1, .1]));
  assert.equal(walked.ok, false); assert.equal(walked.walkedAway, true);
  assert.equal(state.activeDay.customers, customers + 1); assert.equal(state.activeDay.lost, 1);
  assert.equal(state.reviews.length, reviews + 1); assert.equal(state.reviews.at(-1).rating, 2);
  assert.equal(g.takeNotices().at(-1).cue, 'customerLeave');
  g.createOrder(state, sequence([.5, .5, .1, .5, .5, .9, .9])); assert.equal(state.reviews.length, reviews + 1, 'most walk-aways leave no review');
});

test('a sold-out order can be rushed, swapped, trimmed, waited on or sent away', () => {
  const state = openOn(10, { arrivals: false }), order = guest(state); state.inventory.beef = 0; state.batches.beef = [];
  assert.equal(g.missingFor(state, order), 'beef');
  assert.equal(g.openStockout(state, order.id, sequence([.5, .5, 0])).ok, true);
  const incident = state.activeDay.pendingIncident;
  assert.deepEqual(incident.options.map(option => option.id), ['rush', 'offer', 'drop', 'leave', 'later']);
  assert.equal(incident.alternative, 'sausage');
  g.resolveIncident(state, 'offer'); assert.deepEqual(order.toppings, ['sausage']); assert.equal(order.price, 43000);
  state.inventory.beef = 5; state.batches.beef = [{ qty: 5, expiresDay: 10, cost: 9000 }];
  const trim = guest(state); state.inventory.beef = 0; state.batches.beef = [];
  g.openStockout(state, trim.id, constant(.5)); g.resolveIncident(state, 'drop');
  assert.deepEqual(trim.toppings, []); assert.equal(trim.price, 35000);
  const money = state.money; g.openStockout(state, order.id, constant(.5));
  assert.equal(g.openStockout(state, order.id).ok, false, 'one dialog at a time');
  g.resolveIncident(state, 'later'); assert.equal(g.missingFor(state, order), null, 'the swapped order is now cookable');
  state.inventory.sausage = 0; state.batches.sausage = [];
  g.openStockout(state, order.id, sequence([.5, .5, 0])); g.resolveIncident(state, 'rush');
  assert.equal(state.inventory.sausage, 5); assert.ok(state.money < money);
  state.inventory.sausage = 0; state.batches.sausage = []; const lost = state.activeDay.lost;
  g.openStockout(state, order.id, sequence([.9, .1])); g.resolveIncident(state, 'leave');
  assert.equal(state.activeDay.lost, lost + 1); assert.ok(!state.activeDay.orders.includes(order));
  assert.equal(state.reviews.at(-1).rating, 2, 'a 10% review roll leaves 2★');
});

test('with the buyer out shopping, a stockout offers to wait instead of leaving it for later', () => {
  const state = openOn(10, { arrivals: false }); state.staff.buyer = true;
  const order = guest(state); state.inventory.beef = 1; state.batches.beef = [{ qty: 1, expiresDay: 10, cost: 9000 }];
  assert.equal(g.takeBowl(state).ok, true); assert.equal(g.addBroth(state, 'kimchi').ok, true); assert.equal(g.discardBowl(state).ok, true);
  const other = guest(state); assert.equal(g.takeBowl(state).ok, true); assert.equal(g.addBroth(state, 'kimchi').ok, true); assert.equal(g.addTopping(state, 'beef').ok, true);
  assert.equal(state.activeDay.buyerRuns.beef, 12); assert.equal(state.activeDay.buyerTrips, 1);
  assert.match(g.takeNotices().at(-1).text, /Người đi chợ/);
  g.discardBowl(state); g.openStockout(state, order.id, constant(.5));
  const options = state.activeDay.pendingIncident.options.map(option => option.id);
  assert.ok(options.includes('waitBuyer') && !options.includes('later'));
  g.resolveIncident(state, 'waitBuyer');
  const money = state.money; g.tickDay(state, 12.05, constant(.5));
  assert.equal(state.inventory.beef, 5); assert.equal(state.money, money - 5 * 9000); assert.equal(state.activeDay.buyerRuns.beef, undefined);
  assert.equal(g.missingFor(state, other), null);
});

test('the buyer makes at most four trips a day and never goes out during closing', () => {
  const state = openOn(10, { arrivals: false }); state.staff.buyer = true;
  for (const id of ['beef', 'sausage']) { state.inventory[id] = 0; state.batches[id] = []; }
  state.activeDay.buyerTrips = 4; state.inventory.bowls = 1; state.batches.bowls = [{ qty: 1, expiresDay: null, cost: 1500 }];
  assert.equal(g.takeBowl(state).ok, true); assert.deepEqual(state.activeDay.buyerRuns, {});
  g.discardBowl(state); state.activeDay.buyerTrips = 0; state.phase = 'closing'; state.inventory.bowls = 1; state.batches.bowls = [{ qty: 1, expiresDay: null, cost: 1500 }];
  g.takeBowl(state); assert.deepEqual(state.activeDay.buyerRuns, {});
});

test('the chef only collects the pots it started itself', () => {
  const state = openOn(10, { arrivals: false }); state.staff.chef = true; guest(state);
  assert.equal(g.startPot(state, 0).ok, true); state.activeDay.chefCooldown = 0;
  g.tickDay(state, state.activeDay.pots[0].duration * .7, constant(.5));
  assert.ok(state.activeDay.pots[0] && !state.activeDay.pots[0].auto, 'the player’s own pot stays put');
  assert.equal(state.activeDay.readyNoodles.length, 0);
  assert.equal(g.takeBowl(state).ok, true); assert.equal(g.collectPot(state, 0).ok, true);
  g.tickDay(state, .2, constant(.5)); assert.equal(state.activeDay.pots[0]?.auto, undefined, 'the served guest needs no more noodles');
});

test('walkouts leave one or two stars, a late app order one, and guests left at closing none', () => {
  const state = openOn(10, { arrivals: false }), first = guest(state); first.patience = .05;
  let reviews = state.reviews.length; g.tickDay(state, .2, constant(.5));
  assert.equal(state.reviews.length, reviews + 1); assert.equal(state.reviews.at(-1).rating, 1);
  const second = guest(state); second.patience = .05; reviews = state.reviews.length; g.tickDay(state, .2, constant(.2));
  assert.equal(state.reviews.at(-1).rating, 2, '30% of walkouts leave two stars');
  const critic = guest(state); critic.reviewer = true; critic.patience = .05; reviews = state.reviews.length; g.tickDay(state, .2, constant(.5));
  assert.equal(state.reviews.length, reviews + 3, 'a reviewer walkout counts three times');
  guest(state); reviews = state.reviews.length; const lost = state.activeDay.lost;
  assert.equal(g.finishDay(state).closing, true); const result = g.finishDay(state);
  assert.equal(result.finished, true); assert.equal(state.reviews.length, reviews, 'closing time writes no review'); assert.equal(result.summary.lost, lost + 1);
});

test('a dry till blocks opening until a loan, and after two loans only a fresh shop remains', () => {
  const state = openOn(10, { arrivals: false }); state.inventory.bowls = 0; state.batches.bowls = []; state.money = 20000;
  const result = close(state); assert.equal(result.finished, true); assert.equal(result.insolvent, true); assert.equal(state.insolvent, true);
  assert.equal(g.solvency(state).insolvent, true); assert.equal(g.beginDay(state).ok, false);
  assert.equal(g.takeLoan(state).ok, true); assert.equal(state.insolvent, false); assert.equal(g.solvency(state).insolvent, false);
  assert.equal(g.buyCart(state, { bowls: 10, kimchi: 10 }).ok, true, 'broth spoils overnight, so it is bought again'); assert.equal(g.beginDay(state).ok, true);
  const broke = g.createGame('Tiệm cạn két'); broke.loansTaken = 2; broke.money = -10000; broke.insolvent = true;
  assert.equal(g.takeLoan(broke).ok, false); assert.equal(g.solvency(broke).loansLeft, 0);
  broke.settings.theme = 'dark'; const fresh = g.newShopFrom(broke);
  assert.equal(fresh.name, 'Tiệm cạn két'); assert.equal(fresh.money, 400000); assert.equal(fresh.settings.theme, 'dark'); assert.equal(fresh.tutorialDone, true); assert.equal(fresh.insolvent, false);
});

test('purchases leave enough for five bowls, noodles and broth when those are missing', () => {
  const state = g.createGame('Tiệm dè dặt'); state.xp = 150;
  const reserve = g.cartCost(state, { bowls: 5, noodles: 5, kimchi: 5 });
  state.money = reserve + 50000;
  const decoration = g.buyDecoration(state, 'awning_pink'); assert.equal(decoration.ok, false); assert.match(decoration.message, /Cần giữ lại/);
  assert.equal(g.buyCart(state, { beef: 5 }).ok, true, 'a small cart is fine');
  assert.equal(g.buyCart(state, { beef: 6 }).ok, false, 'but not one that eats the reserve');
  assert.equal(g.buyCart(state, { bowls: 5, noodles: 5, kimchi: 5 }).ok, true, 'buying the essentials themselves is always allowed');
});

test('goals pay out at once and a level-up waits for the morning card', () => {
  const state = openOn(1, { arrivals: false }); state.xp = 145; state.goals[0].target = 1;
  const order = guest(state); cook(state, order); assert.equal(g.serveBowl(state, constant(.5)).ok, true);
  const notes = g.takeNotices();
  assert.ok(notes.some(note => note.cue === 'goal')); assert.ok(notes.some(note => note.cue === 'levelUp'));
  assert.equal(state.goals[0].claimed, true); assert.equal(state.pendingLevelUp, 2);
  assert.deepEqual(restore(state), state);
  assert.deepEqual(g.unlocksAt(2).decorations.map(item => item.id).includes('awning_pink'), true);
  g.acknowledgeLevelUp(state); assert.equal(state.pendingLevelUp, null);
});

test('a new shop is coached through one scripted bowl while the clock waits', () => {
  const state = g.createGame('Tiệm tập sự', { tutorial: true }); assert.equal(g.buyCart(state, g.suggestedCart(state)).ok, true); assert.equal(g.beginDay(state).ok, true);
  const day = state.activeDay, [order] = day.orders; assert.equal(day.tutorial, true);
  assert.equal(order.name, 'Chị Hạnh'); assert.equal(order.spice, 1); assert.equal(order.patience, 99); assert.equal(day.selectedOrderId, order.id);
  g.tickDay(state, 30, constant(.5)); assert.equal(day.remaining, 210); assert.equal(day.orders.length, 1); assert.equal(order.patience, 99);
  assert.equal(g.coachStep(state).target, 'bowl'); g.takeBowl(state);
  assert.deepEqual([g.coachStep(state).target, g.coachStep(state).id], ['broth', order.broth]); g.addBroth(state, order.broth);
  g.addChili(state); g.addChili(state); assert.equal(g.coachStep(state).target, 'discard', 'too much chili: start over');
  g.discardBowl(state); g.takeBowl(state); g.addBroth(state, order.broth);
  assert.deepEqual([g.coachStep(state).target, g.coachStep(state).index], ['pot', 0]); g.startPot(state, 0);
  assert.match(g.coachStep(state).text, /Chờ/); g.tickDay(state, 3, constant(.5)); assert.match(g.coachStep(state).text, /vớt/);
  assert.deepEqual(restore(state), state, 'the tutorial survives a reload');
  g.collectPot(state, 0);
  for (const id of order.toppings) { assert.deepEqual([g.coachStep(state).target, g.coachStep(state).id], ['topping', id]); g.addTopping(state, id); }
  assert.equal(g.coachStep(state).target, 'chili'); g.addChili(state);
  assert.equal(g.coachStep(state).target, 'serve');
  const served = g.serveBowl(state, constant(.5)); assert.equal(served.tutorialDone, true); assert.equal(state.tutorialDone, true);
  assert.equal(g.coachStep(state), null); g.tickDay(state, 1, constant(.5)); assert.ok(Math.abs(day.remaining - 209) < 1e-9);
});

test('skipping or closing during the tutorial hands over to a normal day', () => {
  const skipped = g.createGame('Tiệm tập sự', { tutorial: true }); g.buyCart(skipped, g.suggestedCart(skipped)); g.beginDay(skipped);
  assert.equal(g.skipTutorial(skipped).ok, true); assert.equal(skipped.tutorialDone, true); assert.equal(skipped.activeDay.orders[0].patience, 70);
  g.tickDay(skipped, 1, constant(.5)); assert.ok(Math.abs(skipped.activeDay.remaining - 209) < 1e-9); assert.equal(g.skipTutorial(skipped).ok, false);
  const closed = g.createGame('Tiệm tập sự', { tutorial: true }); g.buyCart(closed, g.suggestedCart(closed)); g.beginDay(closed);
  assert.equal(g.finishDay(closed).closing, true); assert.equal(closed.tutorialDone, true);
  closed.activeDay.orders[0].patience = .05; const result = g.tickDay(closed, 1, constant(.5)); assert.equal(result.finished, true);
  const plain = g.createGame('Tiệm quen'); g.buyCart(plain, g.suggestedCart(plain)); g.beginDay(plain); assert.equal(plain.activeDay.tutorial, false); assert.equal(plain.activeDay.orders.length, 0);
});

test('credit comes back (or not) as morning notes, and the money counts toward the next day', () => {
  const state = openOn(10, { arrivals: false });
  state.receivables.push({ id: 'incident-10-1', name: 'Minh', amount: 50000, dueDay: 11, roll: .1, tip: 5000 }, { id: 'incident-10-2', name: 'Vy', amount: 43000, dueDay: 11, roll: .9, tip: 0 });
  const money = state.money, costs = g.dailyOperatingCost(state).total; close(state);
  assert.deepEqual(state.morning.filter(note => note.kind !== 'gift'), [{ kind: 'debtPaid', name: 'Minh', amount: 55000 }, { kind: 'debtLost', name: 'Vy', amount: 43000 }]);
  assert.equal(state.pendingIncome, 55000 + (state.morning.find(note => note.kind === 'gift')?.amount || 0));
  assert.ok(state.money <= money - costs + state.pendingIncome); assert.deepEqual(state.receivables, []);
  assert.deepEqual(restore(state), state, 'morning notes are saved until read');
  const income = state.pendingIncome; g.dismissMorning(state); assert.deepEqual(state.morning, []);
  g.buyCart(state, { kimchi: 5 }); assert.equal(g.beginDay(state, constant(.99)).ok, true); assert.equal(state.activeDay.revenue, income); assert.equal(state.pendingIncome, 0);
});

test('saves reject tampered situations', () => {
  const state = openOn(10, { arrivals: false }); guest(state); g.forceStory(state, 'drunk', sequence([0]));
  const save = JSON.parse(JSON.stringify(state));
  assert.ok(restore(state));
  save.activeDay.pendingIncident.story = 'alien'; assert.equal(g.loadGame({ getItem: () => JSON.stringify(save) }), null);
  const bad = JSON.parse(JSON.stringify(state)); bad.activeDay.pendingIncident.options.push({ id: 'free-money', label: 'x' });
  assert.deepEqual(g.loadGame({ getItem: () => JSON.stringify(bad) }).activeDay.pendingIncident.options, state.activeDay.pendingIncident.options, 'choices are rebuilt, never trusted');
  for (const story of ['constructor', 'toString', '__proto__']) { const odd = JSON.parse(JSON.stringify(state)); odd.activeDay.pendingIncident.story = story; assert.equal(g.loadGame({ getItem: () => JSON.stringify(odd) }), null, story); }
  assert.equal(g.forceStory(state, 'constructor').ok, false);
  const dirty = JSON.parse(JSON.stringify(state)); dirty.activeDay.dirty = { since: 5, taps: 9 }; assert.equal(g.loadGame({ getItem: () => JSON.stringify(dirty) }), null);
});

test('owner replies follow the tone rules: two messages, two days, a capped rise and a one-time XP bonus', () => {
  const state = openOn(10, { arrivals: false }), order = guest(state); order.patience = .05; g.tickDay(state, .2, constant(.5));
  const review = state.reviews.at(-1); assert.equal(review.rating, 1); assert.equal(review.stars0, 1); assert.equal(review.cause, 'walkout'); assert.ok(review.text.length > 10);
  assert.equal(g.canReply(state, review), true);
  assert.equal(g.replyReview(state, review.id, 'x'.repeat(121)).ok, false, '120 characters at most');
  const polite = g.replyReview(state, review.id, 'Dạ quán xin lỗi vì để bạn chờ lâu, lần sau quán sẽ nhanh hơn ạ.', constant(.1));
  assert.equal(polite.replyTone, 'polite'); assert.equal(review.rating, 2); assert.deepEqual(review.thread.map(entry => entry.from), ['owner', 'guest']);
  const rude = g.replyReview(state, review.id, 'Chờ không nổi thì đi chỗ khác, quán đông lắm.', constant(.1));
  assert.equal(rude.replyTone, 'rude'); assert.equal(rude.tone, 'bad'); assert.equal(review.rating, 1);
  assert.equal(g.replyReview(state, review.id, 'Dạ quán cảm ơn ạ.').ok, false, 'two owner messages per review');
  assert.deepEqual(restore(state), state);
  const happy = { ...review, id: 'day-9-order-1', day: 9, rating: 4, stars0: 4, thread: [], xp: false }; state.reviews.push(happy);
  const xp = state.xp; g.replyReview(state, happy.id, 'Dạ cảm ơn bạn nhiều, hẹn gặp lại ạ!', constant(.9)); assert.equal(state.xp, xp + 2); assert.equal(happy.rating, 4, 'a 4★ review does not rise');
  g.replyReview(state, happy.id, 'Dạ quán cảm ơn lần nữa ạ.', constant(.9)); assert.equal(state.xp, xp + 2, 'the bonus is paid once');
  const old = { ...review, id: 'day-7-order-2', day: 7, rating: 2, stars0: 2, thread: [], xp: false }; state.reviews.push(old);
  assert.equal(g.canReply(state, old), false); assert.equal(g.replyReview(state, old.id, 'Dạ xin lỗi ạ.').ok, false, 'older than two days');
  const low = { ...review, id: 'day-10-order-9', rating: 1, stars0: 1, thread: [], xp: false }; state.reviews.push(low);
  g.replyReview(state, low.id, 'Dạ quán xin lỗi ạ.', constant(.1)); g.replyReview(state, low.id, 'Dạ mong bạn ghé lại ạ.', constant(.1));
  assert.equal(low.rating, 3, 'two polite replies lift at most two stars');
});

test('a reviewer writes three separate reviews and older single replies load as a thread', () => {
  const state = openOn(10, { arrivals: false }), critic = guest(state); critic.reviewer = true;
  cook(state, critic); g.serveBowl(state, constant(.5));
  const copies = state.reviews.filter(review => review.id.startsWith(critic.id));
  assert.deepEqual(copies.map(review => review.id), [critic.id, `${critic.id}-2`, `${critic.id}-3`]);
  assert.equal(new Set(copies.map(review => review.text)).size, 3, 'three different texts');
  const legacy = JSON.parse(JSON.stringify(state)); for (const review of legacy.reviews) { delete review.thread; delete review.stars0; delete review.cause; delete review.xp; review.reply = 'Cảm ơn bạn!'; }
  const loaded = g.loadGame({ getItem: () => JSON.stringify(legacy) });
  assert.deepEqual(loaded.reviews[0].thread, [{ from: 'owner', text: 'Cảm ơn bạn!' }]); assert.equal(loaded.reviews[0].stars0, loaded.reviews[0].rating); assert.equal(loaded.reviews[0].cause, null);
});

test('price tags, and guests who walk away from severe or expensive prices', () => {
  const state = openOn(10, { arrivals: false });
  assert.equal(g.priceTag(state, 'kimchi'), null); state.prices.kimchi = 29000; assert.equal(g.priceTag(state, 'kimchi'), 'cheap');
  state.prices.kimchi = 61000; assert.equal(g.priceTag(state, 'kimchi'), 'expensive'); state.prices.kimchi = 71000; assert.equal(g.priceTag(state, 'kimchi'), 'severe');
  state.prices.kimchi = 80000; state.upgrades.menu = true; assert.equal(g.priceTag(state, 'kimchi'), 'expensive', 'the photo menu raises every limit by 20%');
  state.upgrades.menu = false; assert.equal(g.priceTag(state, 'kimchi'), 'severe'); state.prices.kimchi = 71000;
  assert.equal(g.priceTag(state, 'bowls'), null, 'bowls and noodles have no menu price');
  const reviews = state.reviews.length, customers = state.activeDay.customers;
  const walked = g.createOrder(state, sequence([.5, .05, .3]));
  assert.equal(walked.priceWalk, true); assert.equal(state.activeDay.priceLost, 1); assert.equal(state.activeDay.customers, customers, 'a passer-by never took a table');
  assert.equal(state.reviews.length, reviews + 1); assert.equal(state.reviews.at(-1).rating, 1); assert.equal(state.reviews.at(-1).cause, 'price-walk');
  assert.equal(g.createOrder(state, sequence([.5, .5])).priceWalk, true); assert.equal(state.reviews.length, reviews + 1, 'nine in ten leave no review');
  assert.equal(g.takeNotices().filter(note => note.cue === 'customerLeave').length, 1, 'grumbles are shown at most once per 9 s');
  assert.equal(g.createOrder(state, sequence([.9, .5, .5, .1, .5, .5, .5, .5])).ok, true, 'one in five comes in anyway');
  state.prices.kimchi = 61000;
  assert.equal(g.createOrder(state, sequence([.5, .5, .1, .5, .5, .3])).priceWalk, true, 'an expensive dish is refused 40% of the time');
  assert.equal(state.activeDay.priceLost, 3); assert.deepEqual(restore(state), state);
  let result = g.finishDay(state); if (result.closing) { state.activeDay.orders = []; result = g.tickDay(state, 1, constant(.5)); }
  assert.equal(state.lastDay.priceLost, 3); assert.equal(state.lastDay.lost, 0, 'price walk-aways are counted apart from lost guests');
});

test('students and the reviewer ignore prices', () => {
  const state = openOn(4, { arrivals: false }); assert.equal(state.activeDay.event.id, 'students');
  state.prices.kimchi = 71000; g.tickDay(state, 95, constant(.5));
  assert.equal(state.activeDay.orders.length, 3); assert.equal(state.activeDay.priceLost, 0);
  const review = openOn(8, { arrivals: false }); assert.equal(review.activeDay.event.id, 'reviewer');
  review.prices.kimchi = 71000; g.tickDay(review, 74, constant(.5));
  assert.ok(review.activeDay.orders.some(order => order.reviewer && order.trait === null)); assert.equal(review.activeDay.priceLost, 0);
});

test('guests steer away from what the last six orders had', () => {
  const state = openOn(10, { arrivals: false }), arrive = random => g.createOrder(state, random).order;
  assert.deepEqual(arrive(sequence([.5, .5, .3])).toppings, ['beef']);
  assert.deepEqual(arrive(sequence([.5, .5, .3])).toppings, ['sausage'], 'the same draw now lands on the topping nobody just had');
  assert.deepEqual(state.activeDay.recent, [['kimchi', 'beef'], ['kimchi', 'sausage']]);
  for (let i = 0; i < 8; i++) { state.activeDay.orders = []; state.activeDay.selectedOrderId = null; arrive(constant(.5)); }
  assert.equal(state.activeDay.recent.length, 6); assert.deepEqual(restore(state), state);
  const tampered = JSON.parse(JSON.stringify(state)); tampered.activeDay.recent.push(['kimchi']); assert.equal(g.loadGame({ getItem: () => JSON.stringify(tampered) }), null);
});

test('review fixes: the reviewer keeps full patience, two level-ups both queue, and the inspection is free', () => {
  const review = openOn(8, { arrivals: false }); g.tickDay(review, 74, constant(.05));
  const critic = review.activeDay.orders.find(order => order.reviewer); assert.ok(critic); assert.equal(critic.trait, null); assert.equal(critic.maxPatience, 66, 'a reviewer is never a hurried guest');
  const state = openOn(1, { arrivals: false }); state.xp = 140; state.goals[0].target = 1; state.goals[0].rewardXp = 400;
  const order = guest(state); cook(state, order); g.serveBowl(state, constant(.5));
  assert.equal(g.levelInfo(state).level, 3); assert.equal(state.pendingLevelUp, 2, 'the first level not yet shown is kept, so both cards appear');
  const floor = openOn(10, { arrivals: false }); guest(floor).patience = 500; g.forceStory(floor, 'pipe'); g.resolveIncident(floor, 'later');
  assert.equal(floor.activeDay.incidentCount, 1); g.tickDay(floor, 36, constant(.5));
  assert.equal(floor.activeDay.pendingIncident?.story, 'inspection'); assert.equal(floor.activeDay.incidentCount, 1, 'the inspection does not use a daily slot');
});

test('review fixes: the previewed event is kept, promised guests need a table, and odd saves are refused', () => {
  const state = openOn(10, { arrivals: false }); close(state);
  assert.equal(state.nextEvent.day, 11, 'closing a day fixes the next day’s event');
  state.nextEvent = { day: 11, id: 'sale', item: 'sausage' }; const preview = g.dayEvent(state);
  state.unlocked.push('greens'); state.xp = 5000; assert.deepEqual(g.dayEvent(state), preview, 'unlocking or levelling up in the morning keeps the preview');
  assert.deepEqual(restore(state), state); g.buyCart(state, { kimchi: 5 }); g.beginDay(state, constant(.99));
  assert.equal(state.activeDay.event.id, 'sale'); assert.equal(state.activeDay.event.discountedIngredient, 'sausage');
  const full = openOn(10, { arrivals: false }); for (let i = 0; i < 3; i++) guest(full);
  const customers = full.activeDay.customers; g.forceStory(full, 'rain'); const shelter = g.resolveIncident(full, 'shelter', constant(.5));
  assert.match(shelter.message, /kín bàn/); assert.equal(full.activeDay.customers, customers);
  const saved = JSON.parse(JSON.stringify(state)); saved.morning = [{ kind: 'gift', amount: 50000 }]; assert.equal(g.loadGame({ getItem: () => JSON.stringify(saved) }), null, 'a gift note needs its variant');
  saved.morning = [{ kind: 'debtPaid', amount: 50000 }]; assert.equal(g.loadGame({ getItem: () => JSON.stringify(saved) }), null, 'a debt note needs a name');
  const noisy = openOn(10, { arrivals: false }); guest(noisy); const loud = JSON.parse(JSON.stringify(noisy)); loud.activeDay.noisyId = 'day-10-order-77'; assert.equal(g.loadGame({ getItem: () => JSON.stringify(loud) }), null);
  const shop = openOn(10, { arrivals: false }), wanted = guest(shop); shop.inventory.beef = 0; shop.batches.beef = []; g.openStockout(shop, wanted.id, sequence([.5, .5, 0]));
  const odd = JSON.parse(JSON.stringify(shop)); odd.activeDay.pendingIncident.alternative = 'kimchi'; assert.equal(g.loadGame({ getItem: () => JSON.stringify(odd) }), null, 'a swap must be the same kind of ingredient');
  const tutorial = g.createGame('Tiệm tập sự', { tutorial: true }); g.buyCart(tutorial, g.suggestedCart(tutorial)); g.beginDay(tutorial); assert.equal(g.forceStory(tutorial, 'drunk').ok, false);
});

test('review fixes: a reviewer sent away writes all three reviews, and reply XP follows the current stars', () => {
  const state = openOn(10, { arrivals: false }), critic = guest(state); critic.reviewer = true; state.inventory.beef = 0; state.batches.beef = [];
  g.openStockout(state, critic.id, sequence([.5, .1, 0])); g.resolveIncident(state, 'leave');
  assert.equal(state.reviews.filter(review => review.id.startsWith(critic.id)).length, 3);
  const review = state.reviews.at(-1); review.rating = 1; review.stars0 = 5; const xp = state.xp;
  g.replyReview(state, review.id, 'Dạ quán xin lỗi ạ.', constant(.9)); assert.equal(state.xp, xp, 'a review already lowered to 1★ earns no thank-you XP');
});
