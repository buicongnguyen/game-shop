import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/game.js';
import { PLANETS, FUEL_LOADS, flightOutcome } from '../src/planets.js';

// Far app orders (the reference's scooter ride) and interplanetary orders (the starship extension).
const restore = state => g.loadGame({ getItem: () => JSON.stringify(state) });
const constant = value => () => value;
const sequence = (values, fallback = .5) => { let index = 0; return () => index < values.length ? values[index++] : fallback; };
function shop({ day = 10, xp = 950, upgrades = [], begin = constant(.99) } = {}) {
  const state = g.createGame('Tiệm giao xa'); state.day = day; state.xp = xp; state.money = 5000000;
  for (const id of upgrades) state.upgrades[id] = true;
  assert.equal(g.buyCart(state, { bowls: 30, noodles: 30, kimchi: 20, beef: 20, sausage: 20 }).ok, true);
  assert.equal(g.beginDay(state, begin).ok, true); state.activeDay.nextArrival = 999; g.takeNotices();
  return state;
}
function cook(state, order) {
  g.selectOrder(state, order.id);
  assert.equal(g.takeBowl(state).ok, true); assert.equal(g.addBroth(state, order.broth).ok, true);
  for (const id of order.toppings) assert.equal(g.addTopping(state, id).ok, true);
  for (let i = 0; i < order.spice; i++) assert.equal(g.addChili(state).ok, true);
  const index = state.activeDay.pots.findIndex(pot => !pot); assert.equal(g.startPot(state, index).ok, true);
  g.tickDay(state, state.activeDay.pots[index].duration * .64, constant(.5)); assert.equal(g.collectPot(state, index).ok, true);
}

test('a fifth of app orders are far: 25% more patience and at most two a day', () => {
  const state = shop({ upgrades: ['delivery'] });
  g.tickDay(state, 22.1, constant(.1));
  const far = state.activeDay.orders.find(order => order.delivery); assert.ok(far); assert.equal(far.far, true); assert.equal(far.maxPatience, (96 + Math.min(g.levelInfo(state).level - 1, 8) * 5) * 1.25, 'an app order’s patience × 1.25');
  assert.equal(state.activeDay.farOrders, 1); assert.deepEqual(restore(state), state);
  state.activeDay.farOrders = 2; state.activeDay.orders = state.activeDay.orders.filter(order => !order.delivery); state.activeDay.selectedOrderId = null; state.activeDay.appSpawnElapsed = 0; state.activeDay.nextAppArrival = 1;
  g.tickDay(state, 1.2, constant(.1)); assert.equal(state.activeDay.orders.find(order => order.delivery)?.far, false, 'a third far order never comes');
});

test('a far order is ridden or handed to a courier, and settles money and stars exactly once', () => {
  const state = shop({ upgrades: ['delivery'] }); g.tickDay(state, 22.1, constant(.1));
  const order = state.activeDay.orders.find(row => row.far); cook(state, order);
  const reviews = state.reviews.length, served = g.serveBowl(state, constant(.5)); assert.equal(served.ok, true);
  const trip = state.activeDay.pendingIncident; assert.equal(trip.type, 'ride'); assert.deepEqual(trip.options.map(row => row.id), ['ride', 'hire']);
  assert.ok(trip.km >= 2 && trip.km <= 5); assert.equal(state.reviews.length, reviews, 'the review waits for the delivery');
  assert.equal(g.tickDay(state, 5, constant(.5)).paused, true, 'the shop waits while the order is out');
  assert.equal(g.resolveIncident(state, 'ride').ok, false, 'riding happens in the mini-game');
  assert.deepEqual(restore(state), state, 'a reload brings the choice back');
  const money = state.money, ride = g.finishRide(state, { hits: 0 });
  assert.equal(ride.ok, true); assert.equal(state.money, money + 35000, '15,000₫ fee plus a 20,000₫ bonus'); assert.equal(ride.rating, Math.min(5, trip.rating + 1));
  assert.equal(state.reviews.length, reviews + 1); assert.equal(state.reviews.at(-1).id, order.id);
  assert.equal(g.finishRide(state, { hits: 0 }).ok, false, 'a delivery pays once');
});

test('bumpy rides earn less and can cost a star; a hired courier costs 15,000₫ and changes nothing', () => {
  for (const [hits, earned, delta] of [[2, 25000, 0], [3, 15000, -1]]) {
    const state = shop({ upgrades: ['delivery'] }); g.tickDay(state, 22.1, constant(.1)); cook(state, state.activeDay.orders.find(row => row.far)); g.serveBowl(state, constant(.5));
    const rating = state.activeDay.pendingIncident.rating, money = state.money, result = g.finishRide(state, { hits });
    assert.equal(state.money, money + earned); assert.equal(result.rating, Math.max(1, Math.min(5, rating + delta)));
    if (delta < 0) assert.equal(state.reviews.at(-1).cause, 'app-late');
  }
  const state = shop({ upgrades: ['delivery'] }); g.tickDay(state, 22.1, constant(.1)); cook(state, state.activeDay.orders.find(row => row.far)); g.serveBowl(state, constant(.5));
  const rating = state.activeDay.pendingIncident.rating, money = state.money;
  assert.equal(g.resolveIncident(state, 'hire').ok, true); assert.equal(state.money, money - 15000); assert.equal(state.reviews.at(-1).rating, rating);
  assert.equal(g.finishRide(state, { hits: 1 }).ok, false); assert.equal(g.finishRide(shop(), { hits: 0 }).ok, false, 'no trip, nothing to finish');
});

test('the spaceport brings an interplanetary order; flights pay by tier minus fuel', () => {
  const state = shop({ xp: 6000, upgrades: ['spaceport'], begin: sequence([.99, .99, .99, .1, .5]) });
  assert.equal(state.activeDay.planetAt, 89.25);
  g.tickDay(state, 90, constant(.5));
  const order = state.activeDay.orders.find(row => row.planet); assert.ok(order); assert.equal(order.planet, 'mars'); assert.equal(order.persona, 'astronaut'); assert.equal(order.delivery, true);
  assert.equal(state.activeDay.planetAt, null); assert.match(g.takeNotices().at(-1).text, /Sao Hỏa/);
  cook(state, order); const money = state.money, served = g.serveBowl(state, constant(.5));
  assert.equal(served.fee, 0, 'no app fee on an interplanetary order'); assert.equal(state.money, money + served.earned);
  const flight = state.activeDay.pendingIncident; assert.equal(flight.type, 'flight'); assert.deepEqual(flight.options.map(row => row.id), ['fly', 'drone']);
  assert.deepEqual(restore(state), state);
  const before = state.money, result = g.finishFlight(state, { fuel: 'full', hits: 0, ranOut: false });
  assert.equal(result.ok, true); assert.equal(result.outcome.tier, 'perfect'); assert.equal(state.money, before - 35000 + 90000 + 27000);
  assert.equal(g.finishFlight(state, { fuel: 'full', hits: 0, ranOut: false }).ok, false);
});

test('flight tiers, the drone, and refused results', () => {
  const mars = PLANETS.find(planet => planet.id === 'mars');
  assert.deepEqual(flightOutcome(mars, { hits: 0, ranOut: false }), { tier: 'perfect', bonus: 27000, stars: 1 });
  assert.deepEqual(flightOutcome(mars, { hits: 2, ranOut: false }), { tier: 'good', bonus: 9000, stars: 0 });
  assert.deepEqual(flightOutcome(mars, { hits: 0, ranOut: true }), { tier: 'rough', bonus: 0, stars: -1 });
  assert.deepEqual(FUEL_LOADS.map(load => load.fuel), [50, 75, 100]);
  const state = shop({ xp: 6000, upgrades: ['spaceport'], begin: sequence([.99, .99, .99, .1, .5]) }); g.tickDay(state, 90, constant(.5));
  cook(state, state.activeDay.orders.find(row => row.planet)); g.serveBowl(state, constant(.5));
  assert.equal(g.finishFlight(state, { fuel: 'tank', hits: 0, ranOut: false }).ok, false); assert.equal(g.finishFlight(state, { fuel: 'half', hits: -1, ranOut: false }).ok, false);
  assert.equal(g.resolveIncident(state, 'fly').ok, false, 'flying happens in the mini-game');
  state.money = 10000; const rating = state.activeDay.pendingIncident.rating;
  assert.equal(g.resolveIncident(state, 'drone').ok, true, 'the drone can always be paid, even into debt'); assert.equal(state.money, -20000); assert.equal(state.reviews.at(-1).rating, rating);
});

test('trip saves are validated, and saves from before the spaceport still load', () => {
  const state = shop({ upgrades: ['delivery'] }); g.tickDay(state, 22.1, constant(.1)); cook(state, state.activeDay.orders.find(row => row.far)); g.serveBowl(state, constant(.5));
  const bad = JSON.parse(JSON.stringify(state)); bad.activeDay.pendingIncident.planet = 'pluto'; assert.equal(restore(bad), null);
  const rated = JSON.parse(JSON.stringify(state)); rated.activeDay.pendingIncident.rating = 9; assert.equal(restore(rated), null);
  const fresh = shop({ upgrades: ['delivery'] }); g.tickDay(fresh, 22.1, constant(.1));
  const both = JSON.parse(JSON.stringify(fresh)); both.activeDay.orders.find(row => row.far).planet = 'moon'; assert.equal(restore(both), null, 'an order is far or interplanetary, never both');
  const odd = JSON.parse(JSON.stringify(fresh)); odd.activeDay.orders.find(row => row.far).persona = 'dragon'; assert.equal(restore(odd), null);
  const old = JSON.parse(JSON.stringify(g.createGame('Tiệm cũ'))); delete old.upgrades.spaceport; delete old.nextEvent;
  const loaded = restore(old); assert.ok(loaded); assert.equal(loaded.upgrades.spaceport, false); assert.equal(loaded.nextEvent.day, 1);
  assert.equal(restore({ ...old, upgrades: { ...old.upgrades, sign: 'yes' } }), null, 'other upgrade keys are still strict');
});

test('owning the spaceport keeps the day’s street stories', () => {
  const state = shop({ xp: 6000, upgrades: ['spaceport'], begin: constant(.1) });
  assert.equal(state.activeDay.storyTimes.length, 3, 'stories are still scheduled'); assert.ok(state.activeDay.planetAt > 0, 'and so is the planet order');
});
