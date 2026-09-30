import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/game.js';

const restore = state => g.loadGame({ getItem: () => JSON.stringify(state) });
const constant = () => .5;
function opened() { const state = g.createGame('Tiệm kiểm thử'); assert.equal(g.buyCart(state, g.suggestedCart(state)).ok, true); assert.equal(g.beginDay(state).ok, true); return state; }
function orderFor(state, random = constant) { const result = g.createOrder(state, random); assert.equal(result.ok, true, result.message); return result.order; }
function prepare(state, order, progress = .64) {
  assert.equal(g.takeBowl(state).ok, true);
  assert.equal(g.addBroth(state, order.broth).ok, true);
  for (const id of order.toppings) assert.equal(g.addTopping(state, id).ok, true);
  for (let i = 0; i < order.spice; i++) assert.equal(g.addChili(state).ok, true);
  assert.equal(g.startPot(state).ok, true);
  g.tickDay(state, state.activeDay.pots[0].duration * progress, constant);
  assert.equal(g.collectPot(state).ok, true);
}
function close(state) { let result = g.finishDay(state); if (result.closing) result = g.finishDay(state); return result; }
function memory() { const values = new Map(); return { setItem: (key, value) => values.set(key, value), getItem: key => values.get(key) ?? null }; }

test('reference opening starts empty at 400k, default four stars, and an editable cart', () => {
  const state = g.createGame('  Nhà mình  ');
  assert.equal(state.version, 2); assert.equal(state.name, 'Nhà mình'); assert.equal(state.money, 400000); assert.equal(state.reputation, 4);
  assert.ok(Object.values(state.inventory).every(value => value === 0));
  assert.equal(g.beginDay(state).ok, false);
  assert.deepEqual(state.unlocked, ['bowls', 'noodles', 'kimchi', 'beef', 'sausage']);
  const cart = g.suggestedCart(state); assert.equal(g.cartCost(state, cart), 217500);
  assert.equal(g.buyCart(state, cart).ok, true); assert.equal(state.inventory.bowls, 15); assert.equal(state.inventory.kimchi, 15);
  assert.equal(g.beginDay(state).ok, true); assert.equal(state.activeDay.remaining, 210); assert.equal(state.activeDay.event.id, 'normal');
  assert.deepEqual(restore(state), state);
});

test('cart validation, unlock prices, levels and insufficient funds are atomic', () => {
  const state = g.createGame(); const before = JSON.stringify(state);
  for (const cart of [{ noodles: -1 }, { noodles: 100 }, { noodles: .5 }, { noodles: NaN }, { ghost: 1 }, { tomyum: 1 }, { beef: 99 }]) { assert.equal(g.buyCart(state, cart).ok, false); assert.equal(JSON.stringify(state), before); }
  assert.equal(g.cartCost(state, { greens: 1 }), 31500); assert.equal(g.buyCart(state, { greens: 1 }).cost, 31500);
  assert.equal(g.cartCost(state, { greens: 1 }), 1500); assert.ok(state.unlocked.includes('greens'));
  assert.equal(g.setPrice(state, 'kimchi', 1000).ok, true); assert.equal(state.prices.kimchi, 36000); assert.equal(g.setPrice(state, 'kimchi', -35000).ok, true); assert.equal(state.prices.kimchi, 1000);
  assert.equal(g.setPrice(state, 'kimchi', -1000).ok, false);
});

test('assembly consumes FIFO stock immediately; corrections cannot refund ingredients', () => {
  const state = opened(), before = { ...state.inventory };
  assert.equal(g.startPot(state).ok, true); assert.equal(state.inventory.noodles, before.noodles - 1);
  assert.equal(g.takeBowl(state).ok, true); assert.equal(state.inventory.bowls, before.bowls - 1);
  assert.equal(g.addBroth(state, 'kimchi').ok, true); assert.equal(g.addBroth(state, 'kimchi').ok, false);
  assert.equal(g.addTopping(state, 'beef').ok, true); assert.equal(g.addTopping(state, 'beef').ok, false);
  for (let i = 0; i < 7; i++) assert.equal(g.addChili(state).ok, true); assert.equal(g.addChili(state).ok, false);
  assert.equal(g.discardBowl(state).waste, 16500); assert.equal(state.inventory.beef, before.beef - 1);
  assert.equal(g.discardBowl(state).ok, false); assert.equal(state.stats.waste, 16500);
  g.tickDay(state, 5.2, constant); assert.equal(state.activeDay.pots[0], null); assert.equal(state.stats.waste, 19500);
});

test('correct composition accepts raw and soft noodles with lower ratings', () => {
  for (const [progress, expected, rating] of [[.2, 'raw', 4], [.64, 'cooked', 5], [.9, 'soft', 4]]) {
    const state = opened(), order = orderFor(state); prepare(state, order, progress);
    assert.equal(state.activeDay.bowl.noodles, expected);
    const before = { ...state.inventory }, result = g.serveBowl(state, constant);
    assert.equal(result.ok, true); assert.equal(result.rating, rating); assert.ok(result.tip > 0); assert.deepEqual(state.inventory, before, 'Serving does not consume stock a second time');
    assert.equal(state.xp, rating === 5 ? 18 : 14); assert.equal(state.reputation, rating);
    assert.equal(g.serveBowl(state, constant).ok, false); assert.deepEqual(restore(state), state);
  }
});

test('wrong bowl is discarded, wastes stock, and penalizes selected customer patience', () => {
  const state = opened(), order = orderFor(state); prepare(state, order); g.addChili(state);
  const patience = order.patience, cost = state.activeDay.bowl.cost, money = state.money;
  const result = g.serveBowl(state, constant);
  assert.equal(result.ok, false); assert.equal(result.discarded, true); assert.equal(state.activeDay.bowl.started, false);
  assert.equal(state.money, money); assert.equal(state.stats.waste, cost); assert.equal(state.stats.mistakes, 1);
  assert.ok(Math.abs(order.patience - Math.max(.5, patience - order.maxPatience * .3)) < 1e-9);
});

test('serving finds any waiting customer rather than requiring selected order', () => {
  const state = opened(), first = orderFor(state, () => 0), second = orderFor(state, constant);
  assert.notEqual(first.spice, second.spice); g.selectOrder(state, first.id); prepare(state, second);
  assert.equal(g.serveBowl(state, constant).orderId, second.id); assert.ok(state.activeDay.orders.some(order => order.id === first.id));
});

test('early customer formula has 73.92 seconds for one topping and no spice above three', () => {
  const state = opened(), order = orderFor(state); assert.equal(order.toppings.length, 1); assert.equal(order.maxPatience, 73.92); assert.ok(order.spice <= 3); assert.equal(order.bowlsTotal, 1);
  state.staff.waiter = true; const before = order.patience; g.tickDay(state, 1, constant); assert.ok(Math.abs(order.patience - (before - .85)) < 1e-8);
});

test('groups match any unfinished dish, defer tips/reviews/combo, and retain bad-noodle penalty', () => {
  const state = opened(); state.xp = 3300;
  const order = orderFor(state, () => .7); assert.equal(order.bowlsTotal, 2);
  const second = order.dishes[1]; prepare(state, second, .2);
  const firstResult = g.serveBowl(state, constant); assert.equal(firstResult.ok, true); assert.equal(firstResult.tip, 0); assert.equal(state.reviews.length, 0); assert.equal(state.activeDay.combo, 0); assert.equal(order.bowlsServed, 1);
  prepare(state, order); const final = g.serveBowl(state, constant); assert.equal(final.rating, 4); assert.ok(final.tip >= 6000); assert.equal(state.reviews.length, 1); assert.equal(state.activeDay.combo, 0);
});

test('closing grants sixty seconds and then charges all overhead, including negative cash', () => {
  const state = opened(); g.tickDay(state, 201, constant);
  for (const order of [...state.activeDay.orders]) g.resolveStockout(state, order.id, 'cancel');
  const order = orderFor(state); order.patience = order.maxPatience = 500;
  g.tickDay(state, 9, constant); assert.equal(state.phase, 'closing'); assert.equal(state.activeDay.remaining, 0); assert.ok(state.activeDay.closingRemaining > 59.8);
  assert.equal(g.createOrder(state).ok, false); state.money = 0;
  const result = g.tickDay(state, 60, constant); assert.equal(result.finished, true); assert.equal(result.summary.rent, 40000); assert.equal(result.summary.utilities, 15000); assert.equal(state.money, -55000); assert.equal(state.day, 2);
  const after = JSON.stringify(state); assert.equal(g.finishDay(state).alreadyFinished, true); assert.equal(JSON.stringify(state), after);
});

test('same-day broth expires; stock waste is reported without charging its cost twice', () => {
  const state = opened(), cash = state.money, purchaseCost = state.pendingExpenses + state.activeDay.expenses;
  const result = close(state); assert.equal(result.summary.expenses, purchaseCost + 55000); assert.equal(state.money, cash - 55000);
  assert.equal(state.inventory.kimchi, 0); assert.equal(state.inventory.beef, 0); assert.equal(state.inventory.noodles, 15); assert.equal(state.inventory.bowls, 15); assert.equal(state.inventory.sausage, 5); assert.ok(result.summary.spoiled > 0);
  assert.equal(g.buyCart(state, { noodles: 1 }).ok, true); assert.equal(g.buyCart(state, { kimchi: 1 }).ok, true); g.beginDay(state); g.startPot(state); assert.equal(state.batches.noodles[0].qty, 14, 'Older noodle lot is consumed first');
});

test('staff/equipment level gates, cooking duration, and daily wages work', () => {
  const state = g.createGame(); assert.equal(g.hireStaff(state, 'chef').ok, false); assert.equal(g.buyUpgrade(state, 'stove').ok, false);
  state.xp = 8000; state.money = 5000000;
  assert.equal(g.buyUpgrade(state, 'pot3').ok, false); assert.equal(g.buyUpgrade(state, 'pot2').ok, true); assert.equal(g.buyUpgrade(state, 'pot3').ok, true); assert.equal(g.buyUpgrade(state, 'stove').ok, true);
  assert.equal(g.hireStaff(state, 'chef').ok, true); assert.equal(g.hireStaff(state, 'chef').ok, false); g.buyCart(state, g.suggestedCart(state)); g.beginDay(state); assert.equal(state.activeDay.pots.length, 3); g.startPot(state); assert.equal(state.activeDay.pots[0].duration, 4.2);
  g.fireStaff(state, 'chef'); assert.equal(g.dailyOperatingCost(state).wages, 60000, 'Firing mid-shift does not erase earned wages'); const report = close(state).summary; assert.equal(report.wages, 60000); assert.equal(report.utilities, 33000);
});

test('chef auto-collects at ideal timing; a full basket never makes an extra pot immortal', () => {
  const state = opened(); state.staff.chef = true; orderFor(state); g.tickDay(state, 4, constant); assert.ok(state.activeDay.readyNoodles.length > 0);
  g.takeBowl(state); assert.equal(g.collectBasket(state).ok, true); assert.equal(state.activeDay.bowl.noodles, 'cooked');
  state.activeDay.readyNoodles = [{ cost: 3000 }, { cost: 3000 }, { cost: 3000 }]; state.activeDay.pots[0] = null; g.startPot(state); g.tickDay(state, 6, constant);
  assert.equal(state.activeDay.pots[0], null); assert.ok(state.stats.waste >= 3000); assert.deepEqual(restore(state), state);
});

test('last allocated broth is not mistaken for a stockout, and rush restocking charges 1.5x', () => {
  const state = g.createGame(); g.buyCart(state, { bowls: 3, noodles: 3, kimchi: 1, sausage: 2 }); g.beginDay(state); const order = orderFor(state); g.takeBowl(state); g.addBroth(state, order.broth);
  const before = JSON.stringify(order); assert.equal(g.resolveStockout(state, order.id, 'substitute').ok, false); assert.equal(JSON.stringify(order), before);
  assert.equal(g.cartCost(state, { kimchi: 5 }, { rush: true }), 45000); assert.equal(g.buyCart(state, { kimchi: 5 }, { rush: true }).cost, 45000);
});

test('goals pay once; finished days automatically claim earned rewards', () => {
  const state = opened(), goal = state.goals[0]; state.activeDay.served = goal.target; state.stats.served = goal.target; goal.progress = goal.target;
  const cash = state.money; assert.equal(g.claimGoal(state, goal.id).ok, true); assert.equal(state.money, cash + 20000); assert.equal(g.claimGoal(state, goal.id).ok, false);
  state.activeDay.ideal = state.goals[2].target; const report = close(state).summary; assert.equal(report.goalRewards, 40000); assert.equal(state.stats.rewards, 40000); assert.ok(state.goals.every(goal => goal.day === 2 && !goal.claimed));
});

test('loans use 10% interest and six installments; repayment separates interest from principal', () => {
  const state = g.createGame(); const loan = g.takeLoan(state); assert.equal(loan.principal, 300000); assert.equal(state.debt, 330000); assert.equal(state.loanInstallment, 55000);
  const result = g.repayLoan(state, 55000); assert.equal(result.principal, 50000); assert.equal(result.interest, 5000); assert.equal(state.loanInterest, 25000); assert.equal(state.debt, 275000); assert.equal(state.stats.expenses, 5000); assert.equal(state.stats.repaid, 50000);
  assert.equal(g.takeLoan(state).ok, true); assert.equal(g.takeLoan(state).ok, false); assert.deepEqual(restore(state), state);
});

test('live bowl, pot, group, settings and validated text survive saves', () => {
  const state = opened(); orderFor(state); g.takeBowl(state); g.addBroth(state, 'kimchi'); g.startPot(state); g.tickDay(state, 1.1, constant); state.settings.theme = 'dark'; state.settings.motion = false;
  const storage = memory(); assert.equal(g.saveGame(state, storage).ok, true); assert.deepEqual(g.loadGame(storage), state);
  const broken = structuredClone(state); broken.activeDay.pots[0].elapsed = 900; assert.equal(restore(broken), null);
  for (const key of ['money', 'day', 'nextOrderId', 'xp']) { const malformed = structuredClone(state); malformed[key] = Number.MAX_SAFE_INTEGER; assert.equal(restore(malformed), null); }
  const duplicate = structuredClone(state); duplicate.activeDay.orders.push(structuredClone(duplicate.activeDay.orders[0])); assert.equal(restore(duplicate), null);
  const unknown = JSON.parse(JSON.stringify(state).replace('"inventory":{', '"inventory":{"__proto__":{"polluted":true},')); assert.ok(restore(unknown)); assert.equal(Object.prototype.polluted, undefined);
});

test('v1 migrates cash, progress and active orders, preserves backup, and rejects duplicates', () => {
  const old = { version: 1, name: 'Tiệm cũ', money: 123456, day: 4, reputation: 4.3, inventory: { noodles: 8, broth: 5, beef: 3, seafood: 2, mushroom: 5, greens: 7, egg: 2, kimchi: 1 }, upgrades: { stove: 1, seating: 1, decor: 0 }, staff: { chef: false, waiter: false, cashier: true }, stats: { served: 20, revenue: 800000, expenses: 700000, lost: 2, daysPlayed: 3, bestDay: 300000 }, settings: { sound: false, motion: false, theme: 'dark' }, pendingExpenses: 10000, reviews: [], history: [], phase: 'open', nextOrderId: 4, activeDay: { remaining: 80, served: 1, revenue: 45000, expenses: 5000, lost: 0, customers: 2, orders: [{ id: 'day-4-order-3', name: 'Mai', recipeId: 'beef', spice: 2, price: 45000, patience: 20, maxPatience: 35 }] } };
  const migrated = restore(old); assert.ok(migrated); assert.equal(migrated.version, 2); assert.equal(migrated.money, old.money); assert.equal(migrated.stats.served, 20); assert.equal(migrated.inventory.kimchi, 5); assert.equal(migrated.inventory.kimchi_topping, 1); assert.equal(migrated.inventory.bowls, 8); assert.equal(migrated.activeDay.orders[0].broth, 'kimchi'); assert.equal(migrated.activeDay.bowl.started, false); assert.deepEqual(restore(migrated), migrated);
  const storage = memory(); g.saveGame(migrated, storage); assert.deepEqual(JSON.parse(storage.getItem(g.BACKUP_KEY)), old);
  old.activeDay.orders.push(structuredClone(old.activeDay.orders[0])); assert.equal(restore(old), null);
});

test('v1 saves taken mid-day with a waiting first customer still migrate', () => {
  const old = { version: 1, name: 'Tiệm mới', money: 200000, day: 1, reputation: 4, inventory: { noodles: 5, broth: 5, beef: 5, seafood: 0, mushroom: 0, greens: 0, egg: 0, kimchi: 0 }, upgrades: {}, staff: {}, stats: { served: 0, revenue: 0, expenses: 0, lost: 0, daysPlayed: 0, bestDay: 0 }, settings: {}, pendingExpenses: 0, reviews: [], history: [], phase: 'open', nextOrderId: 2, activeDay: { remaining: 190, served: 0, revenue: 0, expenses: 0, lost: 0, customers: 1, orders: [{ id: 'day-1-order-1', name: 'An', recipeId: 'beef', spice: 1, price: 40000, patience: 30, maxPatience: 35 }] } };
  const migrated = restore(old); assert.ok(migrated, 'A waiting customer counts as a visitor');
  assert.equal(migrated.stats.customers, 1); assert.equal(migrated.activeDay.orders.length, 1); assert.deepEqual(restore(migrated), migrated);
});

test('topping helper only completes a bowl that still matches the selected order', () => {
  const state = g.createGame('Tiệm phụ bếp'); state.xp = 8000; state.money = 5000000; state.unlocked = g.INGREDIENTS.map(item => item.id);
  assert.equal(g.buyCart(state, Object.fromEntries(state.unlocked.map(id => [id, 10]))).ok, true);
  assert.equal(g.hireStaff(state, 'topping').ok, true); assert.equal(g.beginDay(state).ok, true);
  const first = orderFor(state), second = orderFor(state);
  for (const [order, topping] of [[first, 'beef'], [second, 'sausage']]) { order.broth = 'kimchi'; order.toppings = [topping]; order.dishes = [{ broth: 'kimchi', toppings: [topping], spice: order.spice, price: order.price }]; }
  g.selectOrder(state, first.id); assert.equal(g.takeBowl(state).ok, true); assert.equal(g.addBroth(state, 'kimchi').ok, true);
  g.tickDay(state, .1, constant); assert.deepEqual(state.activeDay.bowl.toppings, ['beef'], 'The helper completes the selected order');
  const sausage = state.inventory.sausage; g.selectOrder(state, second.id); g.tickDay(state, .1, constant);
  assert.deepEqual(state.activeDay.bowl.toppings, ['beef'], 'Selecting another customer must not add their toppings to this bowl');
  assert.equal(state.inventory.sausage, sausage, 'No stock is spent on a bowl nobody ordered');
});

test('weekday events never label a weekend and the spice challenge starts at stage two', () => {
  const state = g.createGame('Tiệm lịch'), events = level => { state.xp = level === 1 ? 0 : 8000; return Array.from({ length: 200 }, (_, i) => { state.day = i + 3; return [state.day, g.dayEvent(state).id]; }); };
  for (const [day, id] of events(1)) { assert.notEqual(id, 'challenge', `Level 1 day ${day}`); if (day % 7 !== 0 && day % 7 !== 6) assert.notEqual(id, 'weekend', `Weekday ${day}`); }
  assert.ok(events(10).some(([, id]) => id === 'challenge'), 'Challenge days appear from stage two');
});

test('random callback failure does not consume an order ID or mutate game state', () => {
  const state = opened(), before = JSON.stringify(state); let calls = 0;
  const result = g.createOrder(state, () => { if (++calls === 2) throw Error('rng'); return .5; }); assert.equal(result.ok, false); assert.equal(JSON.stringify(state), before);
});

const sequence = numbers => { let index = 0; return () => numbers[index++] ?? .5; };
function incidentDay() { const state = g.createGame(); state.day = 2; g.buyCart(state, g.suggestedCart(state)); g.beginDay(state); const order = orderFor(state); prepare(state, order); return state; }

test('payment incidents pause timers, persist, and resolve financial changes once', () => {
  const state = incidentDay(); const result = g.serveBowl(state, sequence([.5, .01, .8, .2, .3]));
  assert.equal(result.incident.type, 'dash'); const saved = JSON.stringify(state);
  assert.equal(g.tickDay(state, 15).paused, true); assert.equal(JSON.stringify(state), saved); assert.equal(g.finishDay(state).ok, false); assert.deepEqual(restore(state), state);
  const before = state.money, expense = state.stats.expenses, amount = result.incident.bill;
  assert.equal(g.resolveIncident(state, 'ignore').ok, true); assert.equal(state.money, before - amount); assert.equal(state.stats.expenses, expense + amount); assert.equal(state.activeDay.pendingIncident, null);
  const after = JSON.stringify(state); assert.equal(g.resolveIncident(state, 'ignore').ok, false); assert.equal(JSON.stringify(state), after);
});

test('cashier prevents payment incidents, while overpayment and hair outcomes update the ledger', () => {
  const cashier = incidentDay(); cashier.staff.cashier = true; const clean = g.serveBowl(cashier, sequence([.5, .01])); assert.equal(clean.incident, null); assert.equal(cashier.activeDay.incidentCount, 0);
  const money = incidentDay(); const extra = g.serveBowl(money, sequence([.5, .07, .2, .5, .1, .2, .2])); assert.equal(extra.incident.type, 'money'); assert.equal(extra.incident.overpaid, true); assert.equal(extra.incident.amount, 20000); const before = money.money; assert.equal(g.resolveIncident(money, 'keep').bonus, 20000); assert.equal(money.money, before + 20000);
  const hair = incidentDay(); const complaint = g.serveBowl(hair, sequence([.5, .15, .9, .2, .2])); assert.equal(complaint.incident.type, 'hair'); assert.equal(g.resolveIncident(hair, 'topup').expense, 10000); assert.equal(hair.reviews.at(-1).rating, 2); assert.deepEqual(restore(hair), hair);
});

test('customer credit is collected once next morning and cash identity remains exact', () => {
  const state = incidentDay(); const result = g.serveBowl(state, sequence([.5, .12, .4, .2, .8])); assert.equal(result.incident.type, 'debt');
  const bill = result.incident.bill; assert.equal(g.resolveIncident(state, 'allow').ok, true); assert.equal(state.receivables.length, 1); assert.deepEqual(restore(state), state);
  const report = close(state).summary; assert.equal(report.debtRecovered, bill + 10000); assert.equal(state.receivables.length, 0); assert.equal(state.money, 400000 + state.stats.revenue + state.stats.rewards + state.stats.borrowed - state.stats.expenses - state.stats.repaid); assert.deepEqual(restore(state), state);
  const after = JSON.stringify(state); g.finishDay(state); assert.equal(JSON.stringify(state), after);
});

test('loan and repayment numeric boundaries never partially mutate the ledger', () => {
  const borrowed = g.createGame(); borrowed.stats.borrowed = 1e12; assert.ok(restore(borrowed)); const first = JSON.stringify(borrowed); assert.equal(g.takeLoan(borrowed).ok, false); assert.equal(JSON.stringify(borrowed), first);
  const repayment = g.createGame(); g.takeLoan(repayment); repayment.pendingExpenses = 1e12; const second = JSON.stringify(repayment); assert.equal(g.repayLoan(repayment, 55000).ok, false); assert.equal(JSON.stringify(repayment), second);
  const ids = opened(); ids.nextOrderId = 999999999; const third = JSON.stringify(ids); assert.equal(g.createOrder(ids, constant).ok, false); assert.equal(JSON.stringify(ids), third);
  const last = g.createGame(); last.day = 999999; const fourth = JSON.stringify(last); assert.equal(g.beginDay(last).ok, false); assert.equal(JSON.stringify(last), fourth);
});

test('delivery has an independent two-order queue, singles, clock, cutoff, and application fee', () => {
  const state = opened(); state.xp = 8000; state.upgrades.delivery = true;
  for (let i = 0; i < 3; i++) orderFor(state);
  g.tickDay(state, 22.1, constant);
  assert.equal(state.activeDay.orders.filter(order => !order.delivery).length, 3);
  assert.equal(state.activeDay.orders.filter(order => order.delivery).length, 1);
  state.activeDay.appSpawnElapsed = state.activeDay.nextAppArrival; g.tickDay(state, .1, constant);
  const deliveries = state.activeDay.orders.filter(order => order.delivery); assert.equal(deliveries.length, 2); assert.ok(deliveries.every(order => order.bowlsTotal === 1));
  assert.equal(g.createOrder(state, constant).ok, false);
  const ordinary = state.activeDay.orders.find(order => !order.delivery); g.resolveStockout(state, ordinary.id, 'cancel'); assert.equal(g.createOrder(state, constant).ok, true, 'Full delivery queue does not occupy the freed dine-in table');
  const delivery = deliveries[0]; g.selectOrder(state, delivery.id); prepare(state, delivery);
  const sold = g.serveBowl(state, constant); assert.equal(sold.orderId, delivery.id); assert.equal(sold.tip, 0); assert.equal(sold.fee, Math.round(delivery.price * .2));
  state.activeDay.remaining = 10; state.activeDay.elapsed = 200; state.activeDay.appSpawnElapsed = state.activeDay.nextAppArrival;
  const before = state.activeDay.orders.filter(order => order.delivery).length; g.tickDay(state, .1, constant); assert.equal(state.activeDay.orders.filter(order => order.delivery).length, before); assert.deepEqual(restore(state), state);
});

test('rain applies its traffic factor and halves the independent app-arrival gap', () => {
  function appGap(rain) { const state = opened(); state.upgrades.delivery = true; if (rain) state.activeDay.event = { ...g.DAILY_EVENTS.find(event => event.id === 'rain') }; for (let i = 0; i < 3; i++) orderFor(state); g.tickDay(state, 22.1, constant); return state.activeDay.nextAppArrival; }
  assert.ok(Math.abs(appGap(true) / appGap(false) - 1 / (2 * 1.35)) < 1e-9);
});

test('students trigger three visitor attempts and reviewer ratings count three times', () => {
  const students = opened(); students.activeDay.event = { ...g.DAILY_EVENTS.find(event => event.id === 'students') }; students.activeDay.nextArrival = 1000;
  g.tickDay(students, 95, constant); assert.equal(students.activeDay.studentsSpawned, true); assert.equal(students.activeDay.customers, 3); g.tickDay(students, 1, constant); assert.equal(students.activeDay.customers, 3); assert.deepEqual(restore(students), students);
  const reviewer = opened(); reviewer.activeDay.event = { ...g.DAILY_EVENTS.find(event => event.id === 'reviewer') }; reviewer.activeDay.nextArrival = 1000;
  g.tickDay(reviewer, 73.6, constant); const order = reviewer.activeDay.orders.find(order => order.reviewer); assert.ok(order); prepare(reviewer, order); g.serveBowl(reviewer, constant);
  assert.equal(reviewer.reviews.length, 3); assert.equal(reviewer.xp, 26); assert.equal(reviewer.activeDay.perfect, 1); assert.deepEqual(restore(reviewer), reviewer);
});

test('unreachable timer/counter imports are rejected before they can create unloadable saves', () => {
  const state = opened(), elapsed = structuredClone(state); elapsed.activeDay.elapsed = 271; assert.equal(restore(elapsed), null);
  const customers = structuredClone(state); customers.activeDay.customers = 1e9; assert.equal(restore(customers), null);
  state.activeDay.customers = 1e9; const before = JSON.stringify(state); assert.equal(g.createOrder(state, constant).ok, false); assert.equal(JSON.stringify(state), before);
});

test('fractional ticks split exactly at the closing boundary and remain reloadable', () => {
  const state = opened(); orderFor(state);
  state.activeDay.remaining = .004; state.activeDay.elapsed = 209.996;
  g.tickDay(state, .3, constant);
  assert.equal(state.phase, 'closing');
  assert.ok(Math.abs(state.activeDay.elapsed - 210.296) < 1e-8);
  assert.ok(Math.abs(state.activeDay.closingRemaining - 59.704) < 1e-8);
  assert.deepEqual(restore(state), state);
});

test('reviewer visits are exempt from random payment incidents', () => {
  const state = incidentDay(); state.activeDay.orders[0].reviewer = true;
  const result = g.serveBowl(state, sequence([.5, .01]));
  assert.equal(result.incident, null); assert.equal(state.activeDay.incidentCount, 0);
});
