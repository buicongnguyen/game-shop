import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVE_KEY, DAILY_RENT, DAILY_COST, DAILY_UTILITIES, DAY_DURATION, INGREDIENTS, RECIPES, STATE_LIMITS,
  createGame, saveGame, loadGame, buyStock, buyUpgrade, hireStaff,
  beginDay, createOrder, evaluateBowl, serveOrder, tickDay, finishDay, formatMoney,
} from '../src/game.js';

const bowlFor = order => {
  const recipe = RECIPES.find(item => item.id === order.recipeId);
  return { noodles: true, broth: recipe.broth, toppings: [...recipe.toppings], spice: order.spice, doneness: 'cooked' };
};
const openWithOrder = (state = createGame('Tiệm thử')) => {
  assert.equal(beginDay(state).ok, true);
  const { order } = createOrder(state, () => 0);
  return { state, order, bowl: bowlFor(order) };
};
const memoryStorage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test('a failing injected order generator does not advance IDs or mutate the queue', () => {
  const state=createGame();beginDay(state);const before=structuredClone(state);let calls=0;
  const result=createOrder(state,()=>{if(++calls===2)throw new Error('generator unavailable');return .5;});
  assert.equal(result.ok,false);assert.deepEqual(state,before);
  const next=createOrder(state,()=>0);assert.equal(next.order.id,'day-1-order-1');
});

test('new games are independent and have enough starting ingredients', () => {
  const first = createGame('  Bếp nhà  ');
  const second = createGame();
  assert.equal(first.name, 'Bếp nhà');
  assert.equal(first.money, 400000);
  assert.equal(first.day, 1);
  assert.equal(first.phase, 'prep');
  assert.ok(RECIPES.every(recipe => recipe.toppings.every(id => first.inventory[id] > 0)));
  first.inventory.noodles = 0;
  assert.ok(second.inventory.noodles > 0);
  assert.match(formatMoney(350000), /350\.000/);
});

test('stock buying charges whole packs and rejects unaffordable/invalid changes atomically', () => {
  const state = createGame();
  const ingredient = INGREDIENTS.find(item => item.id === 'beef');
  const original = state.inventory.beef;
  const result = buyStock(state, 'beef', 2);
  assert.equal(result.ok, true);
  assert.equal(result.cost, ingredient.price * ingredient.pack * 2);
  assert.equal(state.inventory.beef, original + 10);
  assert.equal(state.money, 400000 - result.cost);
  const before = JSON.stringify(state);
  for (const quantity of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, 1000]) {
    assert.equal(buyStock(state, 'beef', quantity).ok, false);
    assert.equal(JSON.stringify(state), before);
  }
  assert.equal(buyStock(state, 'missing', 1).ok, false);
});

test('upgrades increase price by level and staff cannot be hired twice', () => {
  const state = createGame();
  state.money = 2000000;
  assert.equal(buyUpgrade(state, 'stove').cost, 90000);
  assert.equal(buyUpgrade(state, 'stove').cost, 180000);
  assert.equal(buyUpgrade(state, 'stove').cost, 270000);
  assert.equal(state.upgrades.stove, 3);
  const money = state.money;
  assert.equal(buyUpgrade(state, 'stove').ok, false);
  assert.equal(state.money, money);
  assert.equal(hireStaff(state, 'waiter').ok, true);
  const afterHire = state.money;
  assert.equal(hireStaff(state, 'waiter').ok, false);
  assert.equal(state.money, afterHire);
  assert.equal(hireStaff(state, 'unknown').ok, false);
  state.money = 0;
  assert.equal(hireStaff(state, 'cashier').ok, false);
});

test('opening and customer capacity honor stock, seating, and waiter patience', () => {
  const empty = createGame();
  empty.inventory.noodles = 0;
  assert.equal(beginDay(empty).ok, false);
  const state = createGame();
  state.money = 1000000;
  buyUpgrade(state, 'seating');
  buyUpgrade(state, 'decor');
  hireStaff(state, 'waiter');
  assert.equal(beginDay(state).ok, true);
  assert.equal(beginDay(state).ok, false);
  for (let index = 0; index < 4; index++) {
    const result = createOrder(state, () => 0.999999);
    assert.equal(result.ok, true);
    assert.equal(result.order.recipeId, 'mushroom');
    assert.equal(result.order.spice, 7);
    assert.equal(result.order.maxPatience, 55);
  }
  assert.equal(createOrder(state).ok, false);
  assert.equal(state.activeDay.customers, 4);
});

test('bowl validation catches incorrect cooking and recipes', () => {
  const { order, bowl } = openWithOrder();
  assert.equal(evaluateBowl(bowl, order).ok, true);
  const invalid = [
    { ...bowl, noodles: false },
    { ...bowl, broth: 'seafood' },
    { ...bowl, toppings: ['beef'] },
    { ...bowl, toppings: [...bowl.toppings, 'egg'] },
    { ...bowl, toppings: [...bowl.toppings, 'beef'] },
    { ...bowl, spice: 7 },
    { ...bowl, doneness: 'raw' },
    { ...bowl, doneness: 'burnt' },
  ];
  for (const candidate of invalid) assert.equal(evaluateBowl(candidate, order).ok, false);
});

test('successful service consumes only its ingredients and pays once using the canonical order', () => {
  const { state, order, bowl } = openWithOrder();
  const oldStock = { ...state.inventory };
  const result = serveOrder(state, { ...order, price: 99999999 }, bowl);
  assert.equal(result.ok, true);
  assert.equal(result.earned, RECIPES[0].price);
  assert.equal(state.money, 400000 + RECIPES[0].price);
  for (const id of ['noodles', 'broth', 'beef', 'greens', 'kimchi']) assert.equal(state.inventory[id], oldStock[id] - 1);
  assert.equal(state.inventory.seafood, oldStock.seafood);
  assert.equal(state.stats.served, 1);
  assert.equal(state.activeDay.served, 1);
  assert.equal(state.reviews.length, 1);
  assert.equal(state.activeDay.orders.length, 0);
  const after = JSON.stringify(state);
  assert.equal(serveOrder(state, order, bowl).ok, false);
  assert.equal(JSON.stringify(state), after);
});

test('failed service never consumes stock or pays cash', () => {
  const { state, order, bowl } = openWithOrder();
  const oldStock = { ...state.inventory };
  const original = JSON.stringify(state);
  assert.equal(serveOrder(state, order, { ...bowl, spice: 6 }).ok, false);
  assert.equal(JSON.stringify(state), original);
  assert.deepEqual(state.inventory, oldStock);
  assert.equal(state.money, 400000);
  assert.equal(state.activeDay.orders.length, 1);
  state.inventory.beef = 0;
  const before = JSON.stringify(state);
  assert.equal(serveOrder(state, order, bowl).ok, false);
  assert.equal(JSON.stringify(state), before);
});

test('all menu recipes can be fulfilled from their own correct bowl', () => {
  for (let index = 0; index < RECIPES.length; index++) {
    const state = createGame();
    beginDay(state);
    const { order } = createOrder(state, () => (index + 0.1) / RECIPES.length);
    assert.equal(order.recipeId, RECIPES[index].id);
    const result = serveOrder(state, order, bowlFor(order));
    assert.equal(result.ok, true);
    assert.equal(result.earned, RECIPES[index].price);
  }
});

test('cashier earns tips and a slow correct bowl receives a four-star review', () => {
  const state = createGame();
  hireStaff(state, 'cashier');
  const { order, bowl } = openWithOrder(state);
  tickDay(state, 26);
  const result = serveOrder(state, order, bowl);
  assert.equal(result.ok, true);
  assert.equal(result.rating, 4);
  assert.equal(result.tip, 5400);
  assert.equal(result.earned, 50400);
  assert.equal(state.stats.totalTips, 5400);
  assert.equal(state.reputation, 4.9);
});

test('expired customers leave exactly once; time does not accept negative or nonfinite values', () => {
  const { state, order, bowl } = openWithOrder();
  const before = JSON.stringify(state);
  for (const delta of [-1, NaN, Infinity]) {
    assert.equal(tickDay(state, delta).ok, false);
    assert.equal(JSON.stringify(state), before);
  }
  const result = tickDay(state, 35);
  assert.equal(result.lostOrders.length, 1);
  assert.equal(state.stats.lost, 1);
  assert.equal(state.activeDay.lost, 1);
  assert.equal(state.activeDay.orders.length, 0);
  assert.equal(serveOrder(state, order, bowl).ok, false);
  tickDay(state, 1);
  assert.equal(state.stats.lost, 1);
});

test('day completion totals expenses, advances once, and is idempotent', () => {
  const { state, order, bowl } = openWithOrder();
  serveOrder(state, order, bowl);
  const purchase = buyStock(state, 'greens', 1);
  createOrder(state, () => 0);
  const beforeMoney = state.money;
  const result = tickDay(state, DAY_DURATION + 1000);
  assert.equal(result.finished, true);
  assert.equal(result.summary.served, 1);
  assert.equal(result.summary.lost, 1);
  assert.equal(result.summary.customers, 2);
  assert.equal(result.summary.expenses, purchase.cost + DAILY_COST);
  assert.equal(result.summary.profit, 45000 - purchase.cost - DAILY_COST);
  assert.equal(result.summary.rent, DAILY_RENT);
  assert.equal(result.summary.utilities, DAILY_UTILITIES);
  assert.equal(state.money, beforeMoney - DAILY_COST);
  assert.equal(state.day, 2);
  assert.equal(state.phase, 'prep');
  assert.equal(state.activeDay, null);
  assert.equal(state.history.length, 1);
  const after = JSON.stringify(state);
  assert.equal(finishDay(state).alreadyFinished, true);
  assert.equal(JSON.stringify(state), after);
  assert.equal(beginDay(state).ok, true);
  assert.equal(state.activeDay.day, 2);
});

test('closing early counts waiting customers and rent never produces a negative balance', () => {
  const { state } = openWithOrder();
  state.money = 5000;
  const result = finishDay(state);
  assert.equal(result.summary.rent, 5000);
  assert.equal(result.summary.unpaidRent, 35000);
  assert.equal(result.summary.unpaidUtilities, DAILY_UTILITIES);
  assert.equal(result.summary.lost, 1);
  assert.equal(state.money, 0);
});

test('saves round-trip open days and reject corrupted or unavailable storage', () => {
  const { state } = openWithOrder();
  tickDay(state, 5.5);
  const storage = memoryStorage();
  assert.equal(saveGame(state, storage).ok, true);
  const restored = loadGame(storage);
  assert.deepEqual(restored, state);
  restored.inventory.noodles = 0;
  assert.ok(state.inventory.noodles > 0);
  storage.setItem(SAVE_KEY, '{broken json');
  assert.equal(loadGame(storage), null);
  storage.setItem(SAVE_KEY, JSON.stringify({ ...state, money: -1 }));
  assert.equal(loadGame(storage), null);
  storage.setItem(SAVE_KEY, JSON.stringify({ ...state, version: 999 }));
  assert.equal(loadGame(storage), null);
  storage.setItem(SAVE_KEY, JSON.stringify({ ...state, activeDay: { ...state.activeDay, orders: [{ ...state.activeDay.orders[0], price: 999999 }] } }));
  assert.equal(loadGame(storage), null);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
  assert.equal(loadGame(blocked), null);
  assert.equal(saveGame(state, blocked).ok, false);
});

test('motion and theme settings persist with safe defaults for invalid preferences', () => {
  const state = createGame();
  state.settings.motion = false;
  state.settings.theme = 'dark';
  const storage = memoryStorage();
  saveGame(state, storage);
  assert.deepEqual(loadGame(storage).settings, state.settings);
  state.settings.theme = 'javascript:alert(1)';
  state.settings.motion = 'false';
  state.settings.unexpected = { html: '<script>' };
  saveGame(state, storage);
  const settings = loadGame(storage).settings;
  assert.equal(settings.theme, 'light');
  assert.equal(settings.motion, true);
  assert.equal('unexpected' in settings, false);
});

test('prep purchases and investments are carried into one day without double counting', () => {
  const state = createGame();
  const stock = buyStock(state, 'noodles');
  const upgrade = buyUpgrade(state, 'stove');
  const staff = hireStaff(state, 'waiter');
  const prepTotal = stock.cost + upgrade.cost + staff.cost;
  assert.equal(state.pendingExpenses, prepTotal);
  assert.equal(state.stats.expenses, prepTotal);
  const storage = memoryStorage();
  saveGame(state, storage);
  assert.equal(loadGame(storage).pendingExpenses, prepTotal);
  beginDay(state);
  assert.equal(state.activeDay.expenses, prepTotal);
  assert.equal(state.pendingExpenses, 0);
  assert.equal(state.stats.expenses, prepTotal);
  const duringDay = buyStock(state, 'greens');
  const first = finishDay(state).summary;
  assert.equal(first.expenses, prepTotal + duringDay.cost + DAILY_COST);
  assert.equal(first.profit, -first.expenses);
  assert.equal(state.stats.expenses, first.expenses);
  const nextPurchase = buyStock(state, 'noodles');
  beginDay(state);
  assert.equal(state.activeDay.expenses, nextPurchase.cost);
  assert.equal(state.pendingExpenses, 0);
  assert.equal(finishDay(state).summary.expenses, nextPurchase.cost + DAILY_COST);
});

test('imported records only retain validated known fields and reject malformed day clocks', () => {
  const { state, order, bowl } = openWithOrder();
  serveOrder(state, order, bowl);
  finishDay(state);
  beginDay(state);
  createOrder(state, () => 0);
  state.history[0].unsafe = '<script>';
  state.reviews[0].unsafe = '<script>';
  state.activeDay.unsafe = '<script>';
  state.activeDay.orders[0].unsafe = '<script>';
  const restore = value => loadGame({ getItem: () => JSON.stringify(value) });
  const clean = restore(state);
  assert.equal('unsafe' in clean.history[0], false);
  assert.equal('unsafe' in clean.lastDay, false);
  assert.equal('unsafe' in clean.reviews[0], false);
  assert.equal('unsafe' in clean.activeDay, false);
  assert.equal('unsafe' in clean.activeDay.orders[0], false);
  assert.equal(restore({ ...state, activeDay: { ...state.activeDay, duration: undefined } }), null);
  assert.equal(restore({ ...state, activeDay: { ...state.activeDay, duration: '210' } }), null);
  assert.equal(restore({ ...state, activeDay: { ...state.activeDay, orders: [{ ...state.activeDay.orders[0], id: '" onclick="evil()' }] } }), null);
  const malformed = structuredClone(state);
  malformed.history[0].profit = '<img src=x>';
  malformed.lastDay.profit = '<img src=x>';
  malformed.reviews[0].day = '<img src=x>';
  const filtered = restore(malformed);
  assert.deepEqual(filtered.history, []);
  assert.equal(filtered.lastDay, null);
  assert.deepEqual(filtered.reviews, []);
  assert.equal(restore({ ...state, pendingExpenses: -1 }), null);
  assert.equal(restore({ ...state, pendingExpenses: 5000 }), null);
});

test('insolvent opening gives a recovery route while an affordable restock can reopen', () => {
  const state = createGame();
  state.inventory.noodles = 0;
  state.money = 14999;
  const before = JSON.stringify(state);
  const insufficient = beginDay(state);
  assert.equal(insufficient.ok, false);
  assert.equal(insufficient.recoverySuggested, true);
  assert.equal(insufficient.minimumRestockCost, 15000);
  assert.match(insufficient.message, /Cài đặt/);
  assert.equal(JSON.stringify(state), before);
  state.money = 15000;
  assert.equal(beginDay(state).recoverySuggested, false);
  assert.equal(buyStock(state, 'noodles').ok, true);
  assert.equal(beginDay(state).ok, true);
});

test('imports reject extreme money, dates, IDs, inventories, and cumulative statistics', () => {
  const restore = state => loadGame({ getItem: () => JSON.stringify(state) });
  for (const key of ['money', 'pendingExpenses', 'day', 'nextOrderId']) {
    const state = createGame();
    state[key] = Number.MAX_SAFE_INTEGER;
    assert.equal(restore(state), null, `${key} cannot reach the unsafe-arithmetic boundary`);
  }
  for (const [key, limit] of Object.entries(STATE_LIMITS)) assert.ok(Number.isSafeInteger(limit), key);
  const inventory = createGame();
  inventory.inventory.noodles = STATE_LIMITS.inventory + 1;
  assert.equal(restore(inventory), null);
  for (const key of ['served', 'revenue', 'expenses', 'lost', 'daysPlayed', 'totalTips', 'bestDay']) {
    const state = createGame();
    state.stats[key] = Number.MAX_SAFE_INTEGER;
    assert.equal(restore(state), null, `oversized stats.${key} is rejected, not reset silently`);
  }
});

test('boundary monetary actions fail atomically and keep saves reloadable', () => {
  const restore = state => loadGame({ getItem: () => JSON.stringify(state) });
  for (const counter of ['money', 'revenue', 'totalTips', 'served']) {
    let state = createGame();
    state.staff.cashier = true;
    if (counter === 'money') state.money = STATE_LIMITS.money;
    else state.stats[counter] = counter === 'served' ? STATE_LIMITS.count : STATE_LIMITS.money;
    state = restore(state);
    const { order, bowl } = openWithOrder(state);
    const before = JSON.stringify(state);
    assert.equal(serveOrder(state, order, bowl).ok, false, `${counter} cannot exceed its limit`);
    assert.equal(JSON.stringify(state), before);
    assert.deepEqual(restore(state), state);
  }
  for (const counter of ['expenses', 'pendingExpenses', 'inventory']) {
    const state = createGame();
    if (counter === 'expenses') state.stats.expenses = STATE_LIMITS.money;
    if (counter === 'pendingExpenses') state.pendingExpenses = STATE_LIMITS.money;
    if (counter === 'inventory') state.inventory.noodles = STATE_LIMITS.inventory - 4;
    const before = JSON.stringify(state);
    assert.equal(buyStock(state, 'noodles').ok, false);
    assert.equal(JSON.stringify(state), before);
    assert.deepEqual(restore(state), state);
    if (counter !== 'inventory') {
      assert.equal(buyUpgrade(state, 'stove').ok, false);
      assert.equal(hireStaff(state, 'cashier').ok, false);
      assert.equal(JSON.stringify(state), before);
    }
  }
});

test('last supported day and order ID never wrap or create duplicate orders', () => {
  const restore = state => loadGame({ getItem: () => JSON.stringify(state) });
  let state = createGame();
  state.day = STATE_LIMITS.day - 1;
  state.nextOrderId = STATE_LIMITS.count - 1;
  state = restore(state);
  assert.equal(beginDay(state).ok, true);
  const first = createOrder(state, () => 0);
  assert.equal(first.ok, true);
  assert.equal(state.nextOrderId, STATE_LIMITS.count);
  const before = JSON.stringify(state);
  assert.equal(createOrder(state, () => 0).ok, false);
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(restore(state), state);
  assert.equal(serveOrder(state, first.order, bowlFor(first.order)).ok, true);
  assert.equal(finishDay(state).ok, true);
  assert.equal(state.day, STATE_LIMITS.day);
  assert.deepEqual(restore(state), state);
  const ended = JSON.stringify(state);
  assert.equal(beginDay(state).ok, false);
  assert.equal(JSON.stringify(state), ended);
});

test('imports enforce seating capacity and reconstruct missing IDs from reviews', () => {
  const restore = state => loadGame({ getItem: () => JSON.stringify(state) });
  const { state, order, bowl } = openWithOrder();
  serveOrder(state, order, bowl);
  delete state.nextOrderId;
  const resumed = restore(state);
  assert.equal(createOrder(resumed, () => 0).order.id, 'day-1-order-2');
  const crowded = createGame();
  crowded.upgrades.seating = 3;
  beginDay(crowded);
  for (let index = 0; index < 6; index++) createOrder(crowded, () => 0);
  assert.ok(restore(crowded));
  crowded.upgrades.seating = 0;
  assert.equal(restore(crowded), null, 'Imported orders cannot exceed the actual seating capacity');
  crowded.upgrades.seating = 3;
  crowded.activeDay.orders[0].id = `day-1-order-${Number.MAX_SAFE_INTEGER}`;
  assert.equal(restore(crowded), null);
});

test('active imports and purchases preserve enough numeric headroom to settle', () => {
  const restore = state => loadGame({ getItem: () => JSON.stringify(state) });
  const { state } = openWithOrder();
  state.stats.expenses = STATE_LIMITS.money;
  assert.equal(restore(state), null, 'An active day must still be able to pay its closing costs');
  state.stats.expenses = STATE_LIMITS.money - DAILY_COST;
  let resumed = restore(state);
  assert.ok(resumed);
  const before = JSON.stringify(resumed);
  assert.equal(buyStock(resumed, 'greens').ok, false, 'Purchase cannot consume reserved settlement headroom');
  assert.equal(JSON.stringify(resumed), before);
  assert.equal(tickDay(resumed, DAY_DURATION).finished, true);
  assert.equal(resumed.stats.expenses, STATE_LIMITS.money);
  assert.deepEqual(restore(resumed), resumed);
  const losses = openWithOrder().state;
  losses.stats.lost = STATE_LIMITS.count;
  assert.equal(restore(losses), null, 'All waiting customers must fit the lost-customer counter');
  losses.stats.lost = STATE_LIMITS.count - 1;
  resumed = restore(losses);
  assert.ok(resumed);
  assert.equal(tickDay(resumed, 35).ok, true);
  assert.equal(resumed.stats.lost, STATE_LIMITS.count);
  assert.equal(createOrder(resumed, () => 0).ok, false);
  assert.equal(finishDay(resumed).ok, true);
  assert.deepEqual(restore(resumed), resumed);
});

test('prototype-shaped JSON fields are ignored without altering object prototypes', () => {
  const raw = JSON.stringify(createGame()).replace('"inventory":{', '"inventory":{"__proto__":{"polluted":true},');
  const restored = loadGame({ getItem: () => raw });
  assert.ok(restored);
  assert.equal(Object.hasOwn(restored.inventory, '__proto__'), false);
  assert.equal(Object.prototype.polluted, undefined);
});
