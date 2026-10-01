import assert from 'node:assert/strict';
import * as g from '../src/game.js';

// Deterministic 100-day player: real engine arrivals/timers, progressively buys
// the catalog, hires helpers, restocks, assembles and serves through public APIs.
// It also lives through the kitchen romance (refusing, granting, then the wedding gift)
// and trades surprises with the neighbours on most mornings.
const state = g.createGame('Tiệm trăm ngày');
let seed = 63219, checks = 0, actions = 0; const situations = {};
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const chapters = [], reports = [], romance = { grant: 0, gift: 0, walkout: 0, cut: 0 }, pranks = { sent: 0, received: 0, notices: 0 };
const NOTE_KINDS = ['debtPaid', 'debtLost', 'gift', 'staffAway', 'staffBack', 'neighbourGifts', 'chapter'];
const WAGE = Object.fromEntries(g.STAFF.map(member => [member.id, member.wage]));
function verify() {
  checks++;
  assert.equal(state.money, 400000 + state.stats.revenue + state.stats.rewards + state.stats.borrowed - state.stats.expenses - state.stats.repaid, `cash ledger at day ${state.day}`);
  assert.ok(Number.isSafeInteger(state.money));
  for (const item of g.INGREDIENTS) {
    assert.ok(Number.isSafeInteger(state.inventory[item.id]) && state.inventory[item.id] >= 0);
    assert.equal(state.inventory[item.id], state.batches[item.id].reduce((sum, batch) => sum + batch.qty, 0), `batch conservation ${item.id}`);
    assert.ok(state.batches[item.id].every(batch => batch.qty > 0 && (batch.expiresDay === null || batch.expiresDay >= state.day)));
  }
  if (state.activeDay) {
    const day = state.activeDay;
    assert.ok(day.lost + day.orders.length <= day.customers + day.soldOutWalks);
    assert.ok(day.orders.every(order => order.bowlsServed < order.bowlsTotal && order.patience > 0));
    assert.equal(new Set(day.orders.map(order => order.id)).size, day.orders.length);
    assert.ok(day.pots.every(pot => pot === null || pot.elapsed <= pot.duration));
    // The neighbours' queue: at most three, in time order, never more than six attempts.
    assert.ok(day.prankQueue.length <= 3 && day.prankQueue.every((entry, index) => entry.tries < 6 && (!index || day.prankQueue[index - 1].at <= entry.at)));
    // Away cooks do no work: no new chef pots, no ladled broth.
    if (state.staff.chef && !g.isStaffActive(state, 'chef')) assert.ok(day.pots.every(pot => !pot?.auto), `chef away on day ${state.day} but boiling`);
  }
  assert.ok(state.neighbours.incoming.length <= 6 && state.neighbours.received.length <= 8);
  const restored = g.loadGame({ getItem: () => JSON.stringify(state) });
  assert.ok(restored, `session is loadable at day ${state.day}, ${state.phase}, elapsed ${state.activeDay?.elapsed}`);
  assert.deepEqual(restored, state, `complete session round-trip at day ${state.day}`);
}
// The night's report and the morning it leaves behind.
function checkNight(summary, awayAtOpen) {
  assert.equal(summary.wages, summary.wageLines.reduce((sum, line) => sum + line.amount, 0), `wage lines add up on day ${summary.day}`);
  assert.ok(summary.expenses >= summary.rent + summary.utilities + summary.wages);
  for (const line of summary.wageLines) {
    assert.ok(line.amount > 0 && line.amount <= WAGE[line.id] && line.cut === line.amount < WAGE[line.id], `${line.id} on day ${summary.day}`);
    if (!['chef', 'broth'].includes(line.id)) assert.equal(line.amount, WAGE[line.id], 'only the cooks are ever cut');
    else if (line.cut) assert.equal(line.amount, WAGE[line.id] / 2);
  }
  if (awayAtOpen) assert.ok(!summary.wageLines.some(line => ['chef', 'broth'].includes(line.id)), `cooks away all of day ${summary.day} are not paid`);
  for (const note of state.morning) {
    assert.ok(NOTE_KINDS.includes(note.kind), note.kind);
    if (note.kind === 'staffAway') assert.ok(note.until >= state.day && !g.isStaffActive(state, 'chef') && !g.isStaffActive(state, 'broth'));
    if (note.kind === 'staffBack') assert.ok(state.romance.backDay === state.day && g.isStaffActive(state, 'chef') && g.isStaffActive(state, 'broth'));
    if (note.kind === 'chapter') { assert.equal(note.stage, state.story.stage); chapters.push([state.day, note.stage]); }
    if (note.kind === 'neighbourGifts') { assert.equal(note.day, state.day - 1); assert.ok(g.receivedOn(state, note.day).length > 0); }
  }
  pranks.received += g.receivedOn(state, state.day - 1).length;
}
function tick(seconds) {
  const result = g.tickDay(state, seconds, random);
  assert.equal(result.ok, true, result.message);
  if (result.finished) reports.push(result.summary);
  pranks.notices += g.takeNotices().filter(note => note.kind === 'prank').length;
  verify(); return result;
}
function restock(ids) {
  const cart = {};
  for (const id of ids) if (state.inventory[id] < 1) cart[id] = 5;
  if (Object.keys(cart).length) {
    let result = g.buyCart(state, cart, { rush: true });
    if (!result.ok && state.loansTaken < 2) { g.takeLoan(state); result = g.buyCart(state, cart, { rush: true }); }
    assert.equal(result.ok, true, result.message);
  }
}
const neededStock = order => restock(['bowls', 'noodles', order.broth, ...order.toppings]);
// Most mornings: answer whoever sent something lately (in kind), then go round the street.
function sendSurprises(day) {
  const status = g.prankStatus(state); if (!status.unlocked || day % 4 === 1) return;
  const wanted = 1 + day % 3, plan = [...status.returnList.map(entry => [entry.from, entry.kind]), ...g.NEIGHBOURS.map((_, index) => [g.NEIGHBOURS[(day + index) % 6].id, g.PRANK_KINDS[(day + index) % 6].id])];
  for (const [id, kind] of plan) {
    if (g.prankStatus(state).left <= 3 - wanted) break;
    if (g.prankStatus(state).sentTo.includes(id)) continue;
    const result = g.sendPrank(state, id, kind); assert.equal(result.ok, true, result.message); pranks.sent++;
  }
}
for (let day = 1; day <= 100; day++) {
  assert.equal(state.day, day);
  if (state.money < 100000 && state.loansTaken < 2) g.takeLoan(state);
  const eligible = g.INGREDIENTS.filter(item => !state.unlocked.includes(item.id) && item.unlockLevel <= g.levelInfo(state).level).sort((a, b) => a.unlockPrice - b.unlockPrice)[0];
  if (eligible && state.money > eligible.unlockPrice + 500000) assert.equal(g.buyCart(state, { [eligible.id]: 5 }).ok, true);
  const upgrade = g.UPGRADES.find(item => !state.upgrades[item.id] && item.unlockLevel <= g.levelInfo(state).level && (!item.requires || state.upgrades[item.requires]));
  if (upgrade && state.money > upgrade.price + 700000) assert.equal(g.buyUpgrade(state, upgrade.id).ok, true);
  const employee = g.STAFF.find(item => !state.staff[item.id] && item.unlockLevel <= g.levelInfo(state).level);
  if (employee && state.money > 1500000) assert.equal(g.hireStaff(state, employee.id).ok, true);
  const decoration = g.DECORATIONS.find(item => !state.decoration.owned.includes(item.id) && item.unlockLevel <= g.levelInfo(state).level);
  if (decoration && state.money > decoration.price + 2000000) assert.equal(g.buyDecoration(state, decoration.id).ok, true);
  sendSurprises(day); verify();
  const cart = g.suggestedCart(state);
  if (Object.values(cart).some(Boolean)) assert.equal(g.buyCart(state, cart).ok, true);
  const awayAtOpen = state.staff.chef && state.staff.broth && !g.isStaffActive(state, 'chef') && !g.isStaffActive(state, 'broth');
  assert.equal(g.beginDay(state).ok, true); verify();
  let iterations = 0;
  while (state.activeDay) {
    assert.ok(iterations++ < 1500, `day ${day} must make progress`);
    if (state.activeDay.pendingIncident) {
      // Payment incidents keep fixed answers; stories and haggles rotate through every choice so all outcomes run.
      // The romance refuses the first stage, grants the second and gives the wedding gift at the third.
      const incident = state.activeDay.pendingIncident, rotate = incident.options[(state.day + Number(incident.id.split('-').at(-1))) % incident.options.length].id;
      const action = incident.type === 'dash' ? 'chase' : incident.type === 'money' ? incident.overpaid ? 'return' : 'remind' : incident.type === 'debt' ? 'allow' : incident.type === 'hair' ? 'topup' : incident.story === 'romance' ? ['refuse', 'grant', 'gift'][incident.stage] : rotate;
      // Trips alternate between doing the delivery (with a varying number of hits) and paying someone else.
      const turn = state.day + Number(incident.id.split('-').at(-1));
      const result = incident.type === 'ride' ? (turn % 3 ? g.finishRide(state, { hits: turn % 4 }) : g.resolveIncident(state, 'hire'))
        : incident.type === 'flight' ? (turn % 3 ? g.finishFlight(state, { fuel: ['half', 'most', 'full'][turn % 3], hits: turn % 4, ranOut: turn % 5 === 0 }) : g.resolveIncident(state, 'drone'))
        : g.resolveIncident(state, action, random); assert.equal(result.ok, true, `${incident.type}/${incident.story ?? ''} → ${action}: ${result.message}`); situations[incident.type === 'story' ? incident.story : incident.type] = (situations[incident.type === 'story' ? incident.story : incident.type] || 0) + 1;
      if (incident.story === 'romance') romance[result.outcome]++;
      if (incident.from) situations.fromNeighbours = (situations.fromNeighbours || 0) + 1;
      verify(); continue;
    }
    if (!state.activeDay.orders.length) { tick(.5); continue; }
    const order = [...state.activeDay.orders].sort((a, b) => a.patience - b.patience)[0];
    g.selectOrder(state, order.id); neededStock(order);
    if (state.activeDay.bowl.started) g.discardBowl(state);
    assert.equal(g.takeBowl(state).ok, true);
    if (!state.activeDay.bowl.broth) assert.equal(g.addBroth(state, order.broth).ok, true);
    for (const id of order.toppings) if (!state.activeDay.bowl.toppings.includes(id)) assert.equal(g.addTopping(state, id).ok, true);
    for (let spice = 0; spice < order.spice; spice++) assert.equal(g.addChili(state).ok, true);
    // Noodles: from the basket, or the first boiling pot (a walkout leaves the cook's pots to you), or a new pot.
    for (let attempt = 0; state.activeDay && !state.activeDay.bowl.noodles; attempt++) {
      assert.ok(attempt < 4, `noodles for day ${day}`);
      if (state.activeDay.readyNoodles.length) { assert.equal(g.collectBasket(state).ok, true); break; }
      let index = state.activeDay.pots.findIndex(Boolean);
      if (index < 0) { index = 0; restock(['noodles']); assert.equal(g.startPot(state, index).ok, true); }
      const pot = state.activeDay.pots[index]; tick(Math.max(.01, pot.duration * .64 - pot.elapsed));
      if (!state.activeDay) break;
      if (state.activeDay.readyNoodles.length) assert.equal(g.collectBasket(state).ok, true);
      else if (state.activeDay.pots[index]) assert.equal(g.collectPot(state, index).ok, true);
    }
    if (!state.activeDay) break;
    if (state.activeDay.orders.some(waiting => waiting.id === order.id)) assert.equal(g.serveBowl(state, random).ok, true);
    else g.discardBowl(state);
    actions++; verify(); tick(.3);
  }
  checkNight(reports.at(-1), awayAtOpen);
  const snapshot = JSON.stringify(state); assert.equal(g.finishDay(state).alreadyFinished, true); assert.equal(JSON.stringify(state), snapshot);
}
assert.equal(reports.length, 100);
assert.equal(state.stats.daysPlayed, 100);
// Income settled overnight after the last day (a repaid debt, a windfall) belongs to a day that was never played.
for (const key of ['served', 'revenue', 'lost', 'customers']) assert.equal(state.stats[key], reports.reduce((sum, report) => sum + report[key], 0) + (key === 'revenue' ? state.pendingIncome : 0), `100-day ${key} conservation`);
assert.equal(g.levelInfo(state).level, 10);
assert.ok(state.stats.served > 1000);
assert.ok(Object.values(state.staff).every(Boolean), 'All six helpers were exercised');
assert.equal(state.romance?.stage, 3, 'the kitchen romance ran to the wedding');
assert.equal(romance.grant + romance.gift + romance.walkout + romance.cut, 3); assert.equal(romance.gift, 1); assert.equal(romance.grant, 1);
assert.ok(reports.some(report => report.wageLines.some(line => line.cut)) || romance.walkout === 1, 'a pay cut or a walkout happened');
assert.ok(pranks.sent > 50 && pranks.received > 20 && situations.fromNeighbours > 10, `neighbours traded surprises: ${JSON.stringify(pranks)}`);
console.log(JSON.stringify({ seed: 63219, days: 100, chapters, stage: state.story.stage, repeats: reports.filter(report => report.repeat).length, checks, actions, situations, romance, pranks, priceLost: reports.reduce((sum, report) => sum + report.priceLost, 0), pendingIncome: state.pendingIncome, bowls: state.stats.served, customers: state.stats.customers, lost: state.stats.lost, money: state.money, xp: state.xp, level: g.levelInfo(state).level, unlocked: state.unlocked.length, staff: Object.keys(state.staff).filter(id => state.staff[id]), result: 'cash/batches/persistence/timers/wages/romance/neighbours/100-day settlement invariants passed' }));
