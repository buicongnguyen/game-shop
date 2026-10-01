import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/game.js';
import { NEIGHBOURS, PRANK_KINDS, neighbourById, prankStatus, sendPrank, streetBoard, receivedOn, rollIncoming, recordGift, cleanNeighbours, emptyNeighbours } from '../src/neighbours.js';
import { PERSONAS } from '../src/voice.js';

// Neighbour surprises: six fictional shops on our street play the part of the reference's online players.
const restore = state => g.loadGame({ getItem: () => JSON.stringify(state) });
const reload = (state, label = 'the save round-trips') => assert.deepEqual(restore(state), state, label);
const load = data => g.loadGame({ getItem: () => JSON.stringify(data) });
const constant = value => () => value;
const clone = value => JSON.parse(JSON.stringify(value));

function shop(day = 10) { const state = g.createGame('Tiệm hàng xóm'); state.day = day; state.money = 3000000; return state; }
// Opens with stock, no story windows and no walk-in guests (day 10 is a quiet weekday).
function open(state) {
  const cart = {}; for (const id of ['bowls', 'noodles', 'kimchi', 'beef', 'sausage']) if (state.inventory[id] < 20) cart[id] = 20;
  if (Object.keys(cart).length) assert.equal(g.buyCart(state, cart).ok, true);
  assert.equal(g.beginDay(state, constant(.99)).ok, true); state.activeDay.nextArrival = 999; g.takeNotices(); return state;
}
function close(state) { let result = g.finishDay(state); if (result.closing) result = g.finishDay(state); assert.equal(result.finished, true, result.message); return result.summary; }
const tickTo = (state, time) => g.tickDay(state, Math.max(0, time - state.activeDay.elapsed), constant(.5));
function guest(state) { const result = g.createOrder(state, constant(.3)); assert.equal(result.ok, true, result.message); return result.order; }

test('six fictional neighbours and six kinds of surprise, all original', () => {
  assert.equal(NEIGHBOURS.length, 6); assert.equal(new Set(NEIGHBOURS.map(row => row.id)).size, 6);
  for (const row of NEIGHBOURS) {
    assert.ok(row.name.length <= 26 && row.owner && /^#[0-9A-F]{6}$/i.test(row.color), row.name);
    assert.ok(PERSONAS.some(persona => persona.id === row.persona), row.persona); assert.ok(['prankster', 'friendly', 'mixed'].includes(row.temperament));
    assert.equal(neighbourById(row.id), row); assert.equal(g.neighbourById(row.id), row);
  }
  for (const temperament of ['prankster', 'friendly', 'mixed']) assert.equal(NEIGHBOURS.filter(row => row.temperament === temperament).length, 2);
  for (const odd of ['nobody', '__proto__', 'constructor', null, 7]) assert.equal(neighbourById(odd), null);
  assert.deepEqual(PRANK_KINDS.map(kind => kind.id), ['rat', 'drunk', 'sidewalk', 'haggler', 'tour', 'celebrity']);
  assert.deepEqual(PRANK_KINDS.filter(kind => kind.good).map(kind => kind.id), ['tour', 'celebrity']);
  for (const kind of PRANK_KINDS) { assert.ok(kind.name && kind.hint && kind.verb && kind.past, kind.id); if (kind.id !== 'haggler') assert.ok(g.STORIES[kind.id], kind.id); }
});

test('sending: three a day, one per neighbour, only before opening, from day 2 once the tutorial is done', () => {
  const first = shop(1); assert.equal(prankStatus(first).unlocked, false); assert.equal(sendPrank(first, 'pho', 'tour').ok, false);
  const learner = g.createGame('Tiệm tập sự', { tutorial: true }); learner.day = 2; assert.equal(prankStatus(learner).unlocked, false);
  const state = shop(2); assert.deepEqual(prankStatus(state), { unlocked: true, left: 3, sentTo: [], returnList: [] });
  const sent = sendPrank(state, 'pho', 'tour'); assert.equal(sent.ok, true); assert.equal(sent.good, true); assert.equal(sent.name, 'Phở Nồi Đồng');
  assert.equal(sent.message, `Bạn vừa ${PRANK_KINDS[4].verb} Phở Nồi Đồng.`);
  assert.equal(sendPrank(state, 'pho', 'rat').ok, false, 'one per neighbour a day');
  assert.equal(sendPrank(state, 'nobody', 'rat').ok, false); assert.equal(sendPrank(state, 'oc', 'fireworks').ok, false);
  assert.equal(sendPrank(state, 'oc', 'rat').good, false); assert.equal(sendPrank(state, 'che', 'haggler').ok, true);
  assert.deepEqual(prankStatus(state), { unlocked: true, left: 0, sentTo: ['pho', 'oc', 'che'], returnList: [] });
  assert.equal(sendPrank(state, 'banhmi', 'tour').ok, false, 'three a day');
  assert.deepEqual(state.neighbours.sent.map(entry => [entry.to, entry.kind, entry.day]), [['che', 'haggler', 2], ['oc', 'rat', 2], ['pho', 'tour', 2]], 'newest first');
  assert.deepEqual(state.neighbours.relation, { pho: 1, oc: -1, che: -1 });
  assert.deepEqual(state.neighbours.adjust, { pho: 80000, oc: -60000, che: -30000 });
  reload(state);
  open(state); assert.equal(sendPrank(state, 'banhmi', 'tour').ok, false, 'not during service'); close(state);
  assert.equal(state.day, 3); assert.equal(prankStatus(state).left, 3, 'a new day, a new quota'); assert.deepEqual(prankStatus(state).sentTo, []);
  reload(state);
  // Several mornings in a row (an empty shop, so moving the day by hand leaves no stale stock).
  const street = shop(3);
  for (let day = 3; day <= 7; day++) { street.day = day; assert.equal(sendPrank(street, 'trasua', 'sidewalk').ok, true); }
  assert.equal(street.neighbours.relation.trasua, -3, 'relations stay within ±3'); assert.equal(street.neighbours.adjust.trasua, -500000);
  for (let day = 8; day <= 12; day++) { street.day = day; sendPrank(street, 'comtam', 'celebrity'); }
  assert.equal(street.neighbours.sent.length, 8, 'eight records at most'); assert.equal(street.neighbours.relation.comtam, 3);
  reload(street);
});

test('the street board ranks lifetime profit; a new shop starts mid-pack and the leader is catchable around day 30', () => {
  const state = shop(1), board = streetBoard(state);
  assert.equal(board.length, 7); assert.deepEqual(board.map(row => row.rank), [1, 2, 3, 4, 5, 6, 7]);
  assert.ok(board.every((row, index) => !index || board[index - 1].profit >= row.profit), 'best first');
  const you = board.find(row => row.you); assert.deepEqual([you.id, you.name, you.profit, you.rank, you.level], ['player', 'Tiệm hàng xóm', 0, 4, 1]);
  assert.equal(board.filter(row => row.you).length, 1); assert.deepEqual(streetBoard(state), board, 'deterministic');
  assert.ok(board.filter(row => !row.you).every(row => row.level >= 1 && row.level <= 10));
  state.day = 60; assert.ok(streetBoard(state).filter(row => !row.you).every(row => row.level === 10), 'neighbours grow to level 10');
  state.day = 30; const leader = Math.max(...streetBoard(state).filter(row => !row.you).map(row => row.profit));
  assert.ok(leader > 8e6 && leader < 14e6, `leader at day 30: ${leader}`);
  state.stats.revenue = leader + 1000000; assert.equal(streetBoard(state).find(row => row.you).rank, 1);
  state.stats.revenue = leader / 2; assert.ok(streetBoard(state).find(row => row.you).rank > 1);
  state.day = 2; const before = streetBoard(state).find(row => row.id === 'banhmi').profit;
  sendPrank(state, 'banhmi', 'sidewalk'); assert.equal(streetBoard(state).find(row => row.id === 'banhmi').profit, before - 100000, 'a nuisance costs them');
  const oc = streetBoard(state).find(row => row.id === 'oc').profit; sendPrank(state, 'oc', 'celebrity');
  assert.equal(streetBoard(state).find(row => row.id === 'oc').profit, oc + 120000, 'a favour helps them');
  assert.equal(g.streetBoard(state).length, 7);
});

test('tomorrow’s surprises are rolled at night: seeded, reload-safe, about one a day, in character', () => {
  const state = open(shop(10)), twin = restore(state);
  close(state); close(twin); assert.deepEqual(twin.neighbours.incoming, state.neighbours.incoming, 'same save, same rolls');
  reload(state);
  // Rolls only, many nights: totals and the balance of nuisances and favours per temperament.
  const box = shop(10); let total = 0; const by = { prankster: [0, 0], friendly: [0, 0], mixed: [0, 0] };
  for (let day = 10; day < 410; day++) {
    box.day = day; box.stats.customers = day * 7; box.neighbours.incoming = []; rollIncoming(box);
    const again = clone(box.neighbours.incoming); box.neighbours.incoming = []; rollIncoming(box); assert.deepEqual(box.neighbours.incoming, again);
    total += again.length;
    for (const entry of again) by[neighbourById(entry.from).temperament][PRANK_KINDS.find(kind => kind.id === entry.kind).good ? 1 : 0]++;
  }
  assert.ok(total / 400 >= .6 && total / 400 <= 1.2, `average ${total / 400} a day`);
  assert.ok(by.prankster[0] > by.prankster[1] * 2, 'pranksters mostly send nuisances'); assert.ok(by.friendly[1] > by.friendly[0] * 2, 'friendly shops mostly favours');
  // Whoever got something from you today usually answers tomorrow, in kind.
  const pen = shop(10); let answers = 0, inKind = 0;
  for (let day = 10; day < 110; day++) {
    pen.day = day; pen.stats.customers = day; pen.neighbours.incoming = []; pen.neighbours.sentDay = 0; sendPrank(pen, 'pho', 'rat');
    rollIncoming(pen); const reply = pen.neighbours.incoming.find(entry => entry.from === 'pho');
    if (reply) { answers++; if (!PRANK_KINDS.find(kind => kind.id === reply.kind).good) inKind++; }
  }
  assert.ok(answers >= 55, `answered ${answers} of 100`); assert.ok(inKind >= answers * .7, 'mostly in kind, even from a friendly shop');
  // Nobody sends the sidewalk patrol or a celebrity before those stories can happen.
  const young = shop(1); for (let i = 0; i < 300; i++) { young.stats.customers = i; young.neighbours.incoming = []; rollIncoming(young); assert.ok(young.neighbours.incoming.every(entry => !['sidewalk', 'celebrity'].includes(entry.kind))); }
  // One per neighbour waiting at most, six in all.
  const full = shop(10); full.neighbours.incoming = NEIGHBOURS.map(row => ({ from: row.id, kind: 'tour' })); rollIncoming(full); assert.equal(full.neighbours.incoming.length, 6);
});

test('scheduling: up to three a day near 18/42/66% of the day plus 0–12 s; the rest wait', () => {
  const state = shop(10); state.neighbours.incoming = [{ from: 'pho', kind: 'tour' }, { from: 'oc', kind: 'rat' }, { from: 'che', kind: 'haggler' }, { from: 'trasua', kind: 'drunk' }];
  const twin = restore(state); open(state); open(twin);
  const queue = state.activeDay.prankQueue; assert.equal(queue.length, 3); assert.deepEqual(twin.activeDay.prankQueue, queue, 'the jitter is seeded');
  for (const [index, base] of [37.8, 88.2, 138.6].entries()) { assert.ok(queue[index].at >= base && queue[index].at < base + 12, `${queue[index].at}`); assert.equal(queue[index].tries, 0); }
  assert.deepEqual(queue.map(entry => [entry.from, entry.kind]), [['pho', 'tour'], ['oc', 'rat'], ['che', 'haggler']]);
  assert.deepEqual(state.neighbours.incoming, [{ from: 'trasua', kind: 'drunk' }], 'the fourth waits for another day');
  reload(state);
  const first = shop(1); first.neighbours.incoming = [{ from: 'pho', kind: 'tour' }]; open(first);
  assert.deepEqual(first.activeDay.prankQueue, []); assert.equal(first.neighbours.incoming.length, 1, 'nothing on day one');
  const challenge = g.createGame('Thử thách'); challenge.money = 3000000; open(challenge); assert.deepEqual(challenge.activeDay.prankQueue, [], 'a fresh game has nothing queued');
});

test('a surprise arrives as a street story tagged with its sender, waits for the bowl in hand, and skips the cap', () => {
  const state = shop(10); state.neighbours.incoming = [{ from: 'trasua', kind: 'rat' }]; open(state);
  const at = state.activeDay.prankQueue[0].at; state.activeDay.incidentCount = 3;
  assert.equal(g.takeBowl(state).ok, true); tickTo(state, at + 1);
  assert.equal(state.activeDay.pendingIncident, null, 'not while a bowl is in hand'); assert.equal(state.activeDay.prankQueue.length, 1);
  g.discardBowl(state); const result = g.tickDay(state, .2, constant(.5)); assert.equal(result.paused, true);
  const incident = state.activeDay.pendingIncident; assert.equal(incident.story, 'rat'); assert.equal(incident.from, 'trasua');
  assert.equal(state.activeDay.incidentCount, 4, 'counts toward the day, past the cap'); assert.deepEqual(state.activeDay.prankQueue, []);
  assert.deepEqual(state.neighbours.received, [{ from: 'trasua', kind: 'rat', day: 10 }]);
  reload(state, 'a neighbour’s story survives a reload');
  const tampered = clone(state); tampered.activeDay.pendingIncident.from = 'nobody'; assert.equal(load(tampered), null, 'the sender must be a neighbour');
  tampered.activeDay.pendingIncident.from = null; assert.ok(load(tampered));
  const old = clone(state); delete old.activeDay.pendingIncident.from; assert.equal(load(old).activeDay.pendingIncident.from, null);
  assert.equal(g.resolveIncident(state, 'trap').ok, true);
});

test('the shop cat catches a neighbour’s rat, and it still counts as received', () => {
  const state = shop(10); state.decoration.owned.push('pet_cat'); state.decoration.selected.pet = 'pet_cat';
  state.neighbours.incoming = [{ from: 'comtam', kind: 'rat' }]; open(state); tickTo(state, state.activeDay.prankQueue[0].at + .2);
  assert.equal(state.activeDay.pendingIncident, null); const note = g.takeNotices().find(row => row.kind === 'catRat');
  assert.ok(note && note.from === 'comtam' && note.tone === 'good', 'a catRat notice names the sender');
  assert.deepEqual(state.neighbours.received, [{ from: 'comtam', kind: 'rat', day: 10 }]);
});

test('a haggler surprise seats a guest who will haggle, whatever the prices, with a notice naming the sender', () => {
  const state = shop(10); state.neighbours.incoming = [{ from: 'che', kind: 'haggler' }]; open(state); state.prices.kimchi = 71000;
  tickTo(state, state.activeDay.prankQueue[0].at + .2);
  const order = state.activeDay.orders.at(-1); assert.ok(order); assert.equal(order.trait, 'haggler'); assert.equal(state.activeDay.priceLost, 0);
  const note = g.takeNotices().find(row => row.kind === 'prank'); assert.deepEqual([note.from, note.prank, note.cue, note.orderId], ['che', 'haggler', 'customerArrive', order.id]);
  assert.match(note.text, /Chè Ba Màu Đầu Hẻm/); assert.equal(state.activeDay.incidentCount, 1);
  assert.deepEqual(state.neighbours.received, [{ from: 'che', kind: 'haggler', day: 10 }]); reload(state);
});

test('a surprise that cannot happen yet tries again every 5 s, six attempts in all, then is dropped silently', () => {
  const state = shop(10); state.neighbours.incoming = [{ from: 'oc', kind: 'drunk' }]; open(state);
  const at = state.activeDay.prankQueue[0].at; tickTo(state, at + .05);
  let entry = state.activeDay.prankQueue[0]; assert.equal(entry.tries, 1, 'nobody seated to bother'); assert.ok(Math.abs(entry.at - (state.activeDay.elapsed + 5)) < .2);
  reload(state);
  for (let attempt = 2; attempt <= 5; attempt++) { tickTo(state, entry.at + .05); entry = state.activeDay.prankQueue[0]; assert.equal(entry.tries, attempt); }
  g.takeNotices(); tickTo(state, entry.at + .05);
  assert.deepEqual(state.activeDay.prankQueue, [], 'dropped after the sixth attempt'); assert.deepEqual(state.neighbours.received, []);
  assert.equal(g.takeNotices().length, 0, 'silently'); assert.equal(state.activeDay.pendingIncident, null);
  // A tour needs a free table: with every table taken it waits, and comes once one frees up.
  const busy = shop(10); busy.neighbours.incoming = [{ from: 'pho', kind: 'tour' }]; open(busy);
  for (let i = 0; i < 3; i++) guest(busy).patience = 900;
  tickTo(busy, busy.activeDay.prankQueue[0].at + .05); assert.equal(busy.activeDay.prankQueue[0].tries, 1);
  busy.activeDay.orders = []; busy.activeDay.selectedOrderId = null; tickTo(busy, busy.activeDay.prankQueue[0].at + .05);
  assert.equal(busy.activeDay.pendingIncident?.story, 'tour'); assert.equal(busy.activeDay.pendingIncident.from, 'pho');
});

test('unfired surprises (and the last 5 s) wait for another day; at most six wait', () => {
  const state = shop(10); state.neighbours.incoming = NEIGHBOURS.map(row => ({ from: row.id, kind: 'rat' }));
  open(state); assert.equal(state.activeDay.prankQueue.length, 3); assert.equal(state.neighbours.incoming.length, 3);
  state.activeDay.prankQueue.forEach((entry, index) => { entry.at = 206 + index; });
  tickTo(state, 209.9); assert.equal(state.activeDay.pendingIncident, null, 'nothing in the last 5 s'); assert.equal(state.activeDay.prankQueue.length, 3);
  reload(state); close(state);
  assert.equal(state.neighbours.incoming.length, 6, 'all six still waiting, nothing new rolled');
  assert.deepEqual(state.neighbours.incoming.slice(0, 3).map(entry => entry.from), NEIGHBOURS.slice(0, 3).map(row => row.id), 'unfired ones first');
  assert.ok(state.neighbours.incoming.every(entry => Object.keys(entry).join() === 'from,kind'));
  reload(state);
});

test('the morning card lists yesterday’s surprises; the record keeps one entry per sender, newest first', () => {
  const state = shop(10); state.neighbours.incoming = [{ from: 'trasua', kind: 'rat' }, { from: 'pho', kind: 'celebrity' }]; open(state);
  for (const entry of [...state.activeDay.prankQueue]) { tickTo(state, entry.at + .05); if (state.activeDay.pendingIncident) g.resolveIncident(state, state.activeDay.pendingIncident.options[0].id, constant(.5)); }
  assert.deepEqual(receivedOn(state, 10).map(entry => entry.from), ['pho', 'trasua']);
  close(state); assert.ok(state.morning.some(note => note.kind === 'neighbourGifts' && note.day === 10)); reload(state);
  assert.deepEqual(g.receivedOn(state, 10), [{ from: 'pho', kind: 'celebrity', day: 10 }, { from: 'trasua', kind: 'rat', day: 10 }]);
  assert.deepEqual(prankStatus(state).returnList, receivedOn(state, 10));
  const tampered = clone(state); tampered.morning = [{ kind: 'neighbourGifts', day: 11 }]; assert.equal(load(tampered), null, 'only a past day');
  // The record: one entry per sender, newest first, eight at most.
  const box = shop(10); recordGift(box, { from: 'oc', kind: 'rat' }); recordGift(box, { from: 'che', kind: 'tour' }); box.day = 11; recordGift(box, { from: 'oc', kind: 'drunk' });
  assert.deepEqual(box.neighbours.received, [{ from: 'oc', kind: 'drunk', day: 11 }, { from: 'che', kind: 'tour', day: 10 }]);
  for (const row of NEIGHBOURS) recordGift(box, { from: row.id, kind: 'tour' });
  assert.equal(box.neighbours.received.length, 6); assert.equal(prankStatus(box).returnList.length, 4);
  const quiet = open(shop(10)); close(quiet); assert.ok(!quiet.morning.some(note => note.kind === 'neighbourGifts'), 'no surprises, no card');
});

test('saves: neighbour records and the day’s queue are validated; old saves start empty', () => {
  const state = shop(2); sendPrank(state, 'pho', 'tour'); sendPrank(state, 'oc', 'rat'); state.neighbours.incoming = [{ from: 'che', kind: 'haggler' }]; reload(state);
  assert.deepEqual(cleanNeighbours(undefined, state), emptyNeighbours()); assert.deepEqual(cleanNeighbours(clone(state.neighbours), state), state.neighbours);
  const bad = [
    box => { box.sentToday = ['nobody']; }, box => { box.sentToday = ['pho', 'pho']; }, box => { box.sentDay = 99; },
    box => { box.sent.push({ to: 'pho', kind: 'fireworks', day: 2 }); }, box => { box.sent[0].day = 5; },
    box => { box.received = [{ from: 'pho', kind: 'rat', day: 1 }, { from: 'pho', kind: 'tour', day: 2 }]; },
    box => { box.incoming = Array.from({ length: 7 }, () => ({ from: 'pho', kind: 'rat' })); },
    box => { box.relation = { pho: 4 }; }, box => { box.relation = { nobody: 1 }; }, box => { box.adjust = { pho: 1.5 }; }, box => { box.adjust = []; },
    box => { box.relation = JSON.parse('{"__proto__": 1}'); },
  ];
  for (const [index, tamper] of bad.entries()) { const data = clone(state); tamper(data.neighbours); assert.equal(load(data), null, `tampered neighbours ${index}`); }
  const old = clone(state); delete old.neighbours; assert.deepEqual(load(old).neighbours, emptyNeighbours());
  open(state); reload(state);
  for (const tamper of [day => { day.prankQueue[0].tries = 6; }, day => { day.prankQueue[0].kind = 'party'; }, day => { day.prankQueue[0].from = 'x'; }, day => { day.prankQueue.push(...Array(3).fill(day.prankQueue[0])); }]) {
    const data = clone(state); tamper(data.activeDay); assert.equal(load(data), null);
  }
  const before = clone(state); delete before.activeDay.prankQueue; assert.deepEqual(load(before).activeDay.prankQueue, []);
});

test('a neighbour’s takings adjustment stays within what a save accepts, however long the street plays', () => {
  const state = shop(5); state.neighbours.adjust = { comtam: 1e9 - 50000, trasua: -1e9 + 10000 };
  assert.equal(sendPrank(state, 'comtam', 'celebrity').ok, true); assert.equal(state.neighbours.adjust.comtam, 1e9);
  assert.equal(sendPrank(state, 'trasua', 'sidewalk').ok, true); assert.equal(state.neighbours.adjust.trasua, -1e9);
  reload(state, 'a save at the limits loads');
  assert.equal(streetBoard(state).find(row => row.id === 'comtam').profit - streetBoard(shop(5)).find(row => row.id === 'comtam').profit, 1e9);
});
