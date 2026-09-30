import assert from 'node:assert/strict';
import * as game from '../src/game.js';

// This is the exact seeded 500-day scenario used in the original audit probe.
// It runs entirely in memory and makes no browser, filesystem, or network writes.
const state = game.createGame('Long-run probe');
const initialMoney = state.money;
const expectedInventory = { ...state.inventory };
let expectedMoney = initialMoney;
let generatedCustomers = 0;
let invariantChecks = 0;
let seed = 63219;
let serializedSave;
const storage = {
  setItem(key, value) { assert.equal(key, game.SAVE_KEY); serializedSave = value; },
  getItem(key) { assert.equal(key, game.SAVE_KEY); return serializedSave; },
};
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

function verify() {
  const label = `day ${state.day}, check ${++invariantChecks}`;
  assert.ok(Number.isSafeInteger(state.money) && state.money >= 0, `${label}: cash is nonnegative and exact`);
  assert.equal(state.money, expectedMoney, `${label}: cash matches the transaction ledger`);
  assert.equal(state.money, initialMoney + state.stats.revenue - state.stats.expenses, `${label}: lifetime cash conservation`);
  assert.ok(Object.values(state.inventory).every(value => Number.isSafeInteger(value) && value >= 0), `${label}: stock stays nonnegative`);
  assert.deepEqual(state.inventory, expectedInventory, `${label}: purchases minus served portions equal stock`);
  const waiting = state.activeDay?.orders.length ?? 0;
  assert.equal(generatedCustomers, state.stats.served + state.stats.lost + waiting, `${label}: lifetime customer conservation`);
  if (state.activeDay) {
    assert.equal(state.activeDay.customers, state.activeDay.served + state.activeDay.lost + waiting, `${label}: daily customer conservation`);
  }
  assert.equal(game.saveGame(state, storage).ok, true, `${label}: save succeeds`);
  assert.deepEqual(game.loadGame(storage), state, `${label}: save/load round-trip is lossless`);
}

function purchase(id, quantity = 1) {
  const result = game.buyStock(state, id, quantity);
  assert.equal(result.ok, true, `Restocking ${id} succeeds on day ${state.day}`);
  expectedMoney -= result.cost;
  expectedInventory[id] += result.added;
  verify();
}

function tick(seconds) {
  const result = game.tickDay(state, seconds);
  assert.equal(result.ok, true);
  if (result.finished) expectedMoney -= result.summary.rent + result.summary.utilities;
  verify();
}

for (let day = 0; day < 500; day++) {
  for (const ingredient of game.INGREDIENTS) {
    const missing = Math.max(0, 16 - state.inventory[ingredient.id]);
    if (missing) purchase(ingredient.id, Math.ceil(missing / ingredient.pack));
  }
  if (day === 5) {
    for (const member of game.STAFF) {
      const result = game.hireStaff(state, member.id);
      assert.equal(result.ok, true);
      expectedMoney -= result.cost;
      verify();
    }
  }
  if (day === 10) {
    for (const upgrade of game.UPGRADES) {
      for (let level = 0; level < upgrade.max; level++) {
        const result = game.buyUpgrade(state, upgrade.id);
        assert.equal(result.ok, true);
        expectedMoney -= result.cost;
        verify();
      }
    }
  }

  assert.equal(game.beginDay(state).ok, true);
  verify();
  for (let turn = 0; turn < 18 && state.activeDay; turn++) {
    const result = game.createOrder(state, random);
    assert.equal(result.ok, true);
    generatedCustomers++;
    verify();
    const order = result.order;
    const recipe = game.RECIPES.find(item => item.id === order.recipeId);
    if (turn % 8 === 0) {
      tick(order.patience);
    } else {
      const required = ['noodles', 'broth', ...recipe.toppings];
      for (const id of required) if (state.inventory[id] === 0) purchase(id);
      const served = game.serveOrder(state, order, {
        noodles: true, broth: recipe.broth, toppings: [...recipe.toppings],
        spice: order.spice, doneness: 'cooked',
      });
      assert.equal(served.ok, true);
      expectedMoney += served.earned;
      for (const id of required) expectedInventory[id]--;
      verify();
      tick(3.2);
    }
  }

  const finished = game.finishDay(state);
  assert.equal(finished.ok, true);
  if (!finished.alreadyFinished) expectedMoney -= finished.summary.rent + finished.summary.utilities;
  verify();
  const snapshot = JSON.stringify(state);
  assert.equal(game.finishDay(state).alreadyFinished, true);
  assert.equal(JSON.stringify(state), snapshot, `Day ${day + 1}: repeated settlement changes nothing`);
}

assert.equal(state.day, 501);
assert.equal(state.stats.daysPlayed, 500);
assert.equal(state.stats.served, 7010);
assert.equal(state.stats.lost, 1500);
assert.equal(state.money, 229381680);
assert.equal(state.history.length, 100);
assert.equal(state.reviews.length, 50);
console.log(`Simulation passed: seed 63219; 500 days; 7,010 served; 1,500 lost; 229,381,680₫; ${invariantChecks} cash/stock/customer/persistence checks; 500 idempotent-settlement checks.`);
