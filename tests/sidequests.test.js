import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/game.js';
import * as S from '../src/sidequests.js';

const clone = value => JSON.parse(JSON.stringify(value));
function afterDay(day = 2, served = 12) {
  const game = G.createGame(); game.day = day + 1;
  game.lastDay = { day, served, dineInServed: served, cash: game.money };
  return game;
}

test('market has three progressively faster rounds, exact zones and at most 15% daily discount', () => {
  const game = G.createGame(), started = S.beginBargaining(game, () => .5);
  assert.equal(started.ok, true); assert.equal(started.round.speed, .8);
  assert.equal(S.stopBargaining(game, .5).award, .05);
  assert.equal(S.bargainingRound(game).speed, 1.1);
  assert.equal(S.stopBargaining(game, .5).discount, .1);
  assert.equal(S.stopBargaining(game, .5).discount, .15);
  assert.equal(S.marketDiscount(game), .15);
  assert.equal(S.beginBargaining(game).ok, false);
  assert.equal(S.stopBargaining(game, .5).ok, false);
  game.day++; assert.equal(S.marketDiscount(game), 0);
  assert.equal(S.beginBargaining(game, () => .5).ok, true);
});

test('market yellow awards 2%, misses award nothing, quitting preserves earned discount without replay', () => {
  const game = G.createGame(); S.beginBargaining(game, () => .5);
  assert.equal(S.stopBargaining(game, .35).award, .02);
  assert.equal(S.stopBargaining(game, .01).award, 0);
  S.finishBargaining(game);
  assert.equal(S.marketDiscount(game), .02);
  assert.equal(S.beginBargaining(game).ok, false);
  const next = G.createGame(); assert.equal(S.beginBargaining(next, () => NaN).ok, false);
  assert.equal(next.sidequests?.market, undefined);
});

test('market live-round state roundtrips and cannot change during service', () => {
  const game = G.createGame(); S.beginBargaining(game, () => .5); S.stopBargaining(game, .5);
  const cleaned = S.cleanSidequests(clone(game.sidequests), game);
  assert.deepEqual(cleaned, game.sidequests);
  game.phase = 'open'; assert.equal(S.stopBargaining(game, .5).ok, false);
  assert.equal(S.marketDiscount(game), .05);
});

test('secret broth opens day 3 and is stable for a given week and broth', () => {
  const game = G.createGame(); assert.equal(S.startSecretBroth(game, 'kimchi').ok, false);
  game.day = 3; const first = S.startSecretBroth(game, 'kimchi');
  assert.equal(first.ok, true); assert.equal(first.sequence.length, 4);
  assert.equal(new Set(first.sequence).size, 4);
  const another = G.createGame(); another.day = 7;
  assert.deepEqual(S.startSecretBroth(another, 'kimchi').sequence, first.sequence);
  const higher = G.createGame(); higher.day = 3; higher.xp = 900;
  assert.equal(S.startSecretBroth(higher, 'kimchi').sequence.length, 5);
  const highest = G.createGame(); highest.day = 3; highest.xp = 3300;
  assert.equal(S.startSecretBroth(highest, 'kimchi').sequence.length, 6);
});

test('secret recipe succeeds once, expires next day, and cannot be switched midway', () => {
  const game = G.createGame(); game.day = 3;
  const start = S.startSecretBroth(game, 'kimchi');
  game.unlocked.push('tomyum'); assert.equal(S.startSecretBroth(game, 'tomyum').ok, false);
  for (const spice of start.sequence) assert.equal(S.submitSpice(game, spice).correct, true);
  assert.equal(S.secretBroth(game), 'kimchi'); assert.equal(S.startSecretBroth(game, 'kimchi').ok, false);
  assert.equal(S.submitSpice(game, start.sequence[0]).ok, false);
  assert.deepEqual(S.cleanSidequests(clone(game.sidequests), game), game.sidequests);
  game.day++; assert.equal(S.secretBroth(game), null);
  assert.equal(S.startSecretBroth(game, 'tomyum').ok, true);
});

test('secret broth has two consumed attempts even when player abandons', () => {
  const game = G.createGame(); game.day = 3;
  const first = S.startSecretBroth(game, 'kimchi');
  const wrong = S.SPICES.find(spice => spice.id !== first.sequence[0]).id;
  assert.equal(S.submitSpice(game, wrong).correct, false);
  const next = S.startSecretBroth(game, 'kimchi'); assert.equal(next.attempt, 2);
  assert.deepEqual(next.sequence, first.sequence);
  S.abandonSecretBroth(game); assert.equal(S.startSecretBroth(game, 'kimchi').ok, false);
  assert.equal(S.secretBroth(game), null);
});

test('washing requires a closed eligible day and recovers only dine-in bowls', () => {
  assert.equal(S.startWashing(afterDay(1)).ok, false);
  assert.equal(S.startWashing(afterDay(2, 2)).ok, false);
  const game = afterDay(2, 25); game.lastDay.dineInServed = 12;
  assert.equal(S.startWashing(game).total, 12);
  assert.equal(S.washingInfo(game).frames, 10);
  assert.equal(S.scrubWashing(game, 8).recovered, 1);
  assert.equal(S.scrubWashing(game, 8).recovered, 2);
  assert.equal(game.inventory.bowls, 0);
  const end = S.finishWashing(game);
  assert.equal(end.recovered, 2); assert.equal(game.inventory.bowls, 2);
  assert.equal(game.batches.bowls[0].cost, 0);
  S.finishWashing(game); assert.equal(game.inventory.bowls, 2);
  assert.equal(S.startWashing(game).ok, false);
});

test('washing timeout completes once and untouched bowls earn no recovery', () => {
  const game = afterDay(); S.startWashing(game);
  S.scrubWashing(game, 8); S.scrubWashing(game, 8); S.scrubWashing(game, 8);
  assert.equal(S.tickWashing(game, 14).done, false);
  assert.equal(S.tickWashing(game, 1).recovered, 4);
  assert.equal(game.inventory.bowls, 4);
  assert.equal(S.tickWashing(game, 1).ok, false);
  const untouched = afterDay(); S.startWashing(untouched);
  assert.equal(S.tickWashing(untouched, 15).recovered, 0);
});

test('washing all graphic bowls recovers the actual full stack and merges free inventory safely', () => {
  const game = afterDay(2, 27); game.inventory.bowls = 5; game.batches.bowls = [{ qty: 5, cost: 0, expiresDay: null }];
  S.startWashing(game);
  for (let index = 0; index < 10; index++) S.scrubWashing(game, 8);
  assert.equal(game.inventory.bowls, 32); assert.equal(game.batches.bowls.length, 1);
  assert.equal(S.washingInfo(game).recovered, 27);
  assert.equal(game.stats.expenses, 0);
  assert.deepEqual(S.cleanSidequests(clone(game.sidequests), game), game.sidequests);
});

test('optional state migration is tolerant of absent fields and rejects malformed mini-game data', () => {
  const game = afterDay(); assert.deepEqual(S.cleanSidequests(undefined, game), {});
  assert.equal(S.cleanSidequests([], game), null);
  S.beginBargaining(game, () => .5); let bad = clone(game.sidequests); bad.market.discount = .2;
  assert.equal(S.cleanSidequests(bad, game), null);
  S.startSecretBroth(game, 'kimchi'); bad = clone(game.sidequests); bad.secret.sequence.push(bad.secret.sequence[0]);
  assert.equal(S.cleanSidequests(bad, game), null);
  S.startWashing(game); bad = clone(game.sidequests); bad.washing.recovered = 2;
  assert.equal(S.cleanSidequests(bad, game), null);
});

test('engine save roundtrip retains market, secret recipe, and recovered bowl batches', () => {
  const game = G.createGame(); game.day = 2;
  assert.equal(G.buyCart(game, { bowls: 10, noodles: 10, kimchi: 10, beef: 10, sausage: 10 }).ok, true);
  assert.equal(G.beginDay(game).ok, true);
  for (let customer = 0; customer < 3; customer++) {
    const order = G.createOrder(game, () => .5).order;
    assert.equal(G.takeBowl(game).ok, true); assert.equal(G.addBroth(game, order.broth).ok, true);
    for (const topping of order.toppings) assert.equal(G.addTopping(game, topping).ok, true);
    for (let spice = 0; spice < order.spice; spice++) G.addChili(game);
    G.startPot(game); G.tickDay(game, 3.3, () => .5); G.collectPot(game);
    assert.equal(G.serveBowl(game, () => .5).ok, true);
  }
  let end = G.finishDay(game); if (end.closing) end = G.finishDay(game);
  assert.equal(end.finished, true); assert.equal(game.lastDay.dineInServed, 3);
  S.startWashing(game); S.scrubWashing(game, 8);
  S.beginBargaining(game, () => .5); S.stopBargaining(game, .5);
  const secret = S.startSecretBroth(game, 'kimchi'); S.submitSpice(game, secret.sequence[0]);
  const loaded = G.loadGame({ getItem: () => JSON.stringify(game) });
  assert.ok(loaded); assert.deepEqual(loaded.sidequests, game.sidequests);
  const before = loaded.inventory.bowls; assert.equal(S.finishWashing(loaded).recovered, 1);
  assert.equal(loaded.inventory.bowls, before + 1);
  assert.ok(G.loadGame({ getItem: () => JSON.stringify(loaded) }));
});
