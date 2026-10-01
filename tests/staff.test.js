import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/game.js';

// The kitchen romance between the noodle cook (chef) and the broth cook (broth): days off, walkouts, pay cuts,
// the wedding gift, morning notes, wages and saves.
const restore = state => g.loadGame({ getItem: () => JSON.stringify(state) });
const reload = (state, label = 'the save round-trips') => assert.deepEqual(restore(state), state, label);
const constant = value => () => value;
const sequence = (values, fallback = .5) => { let index = 0; return () => index < values.length ? values[index++] : fallback; };
const COOK = g.STAFF.find(member => member.id === 'chef'), BROTH_COOK = g.STAFF.find(member => member.id === 'broth');
const notes = state => state.morning.filter(note => note.kind !== 'gift');

// A level-7 shop on day 10 (a quiet weekday) with both cooks hired and plenty of cash.
function shop(day = 10) {
  const state = g.createGame('Tiệm tình yêu'); state.day = day; state.xp = 3300; state.money = 5000000;
  assert.equal(g.hireStaff(state, 'chef').ok, true); assert.equal(g.hireStaff(state, 'broth').ok, true);
  return state;
}
// Opens the day with stock, no story windows (.99) and no walk-in guests.
function open(state) {
  const cart = {}; for (const id of ['bowls', 'noodles', 'kimchi', 'beef', 'sausage']) if (state.inventory[id] < 20) cart[id] = 20;
  if (Object.keys(cart).length) assert.equal(g.buyCart(state, cart).ok, true);
  assert.equal(g.beginDay(state, constant(.99)).ok, true); assert.deepEqual(state.activeDay.storyTimes, []);
  state.activeDay.nextArrival = 999; g.takeNotices(); return state;
}
function guest(state) { const result = g.createOrder(state, constant(.3)); assert.equal(result.ok, true, result.message); return result.order; }
function close(state) { let result = g.finishDay(state); if (result.closing) result = g.finishDay(state); assert.equal(result.finished, true, result.message); return result.summary; }
const romanceNow = (state, random = constant(.5)) => { const result = g.forceStory(state, 'romance', random); assert.equal(result.ok, true, result.message); return result.incident; };

test('staff are renamed: original names for every helper', () => {
  assert.deepEqual(g.STAFF.map(member => [member.id, member.name]), [['cashier', 'Chị Quế'], ['chef', 'Bé Ngò'], ['waiter', 'Bé Nghệ'], ['buyer', 'Cô Hồi'], ['broth', 'Anh Sả'], ['topping', 'Bé Tía Tô']]);
  for (const stage of g.ROMANCE) assert.ok(stage.text.includes(COOK.name) && stage.text.includes(BROTH_COOK.name), stage.title);
});

test('the romance needs both cooks at work, waits until day 4, then four days between stages, and skips the tutorial', () => {
  const early = shop(3); assert.equal(g.romanceEligible(early), false, 'never before day 4');
  early.day = 4; assert.equal(g.romanceEligible(early), true);
  g.fireStaff(early, 'broth'); assert.equal(g.romanceEligible(early), false, 'both cooks must be hired');
  const state = shop(10); assert.equal(g.romanceEligible(state), true);
  state.staffAway = { chef: [10, 11], broth: [10, 11] }; assert.equal(g.romanceEligible(state), false, 'and at work today');
  state.staffAway = {}; state.romance = { stage: 1, lastDay: 7, backDay: null, gift: 0 }; assert.equal(g.romanceEligible(state), false, 'three days after a stage is too soon');
  state.romance.lastDay = 6; assert.equal(g.romanceEligible(state), true, 'four days after it');
  state.romance = { stage: 3, lastDay: 1, backDay: null, gift: 0 }; assert.equal(g.romanceEligible(state), false, 'after the wedding it never returns');
  open(state); assert.equal(g.forceStory(state, 'romance').ok, false, 'an ineligible romance cannot be forced');
  const tutorial = g.createGame('Tiệm tập sự', { tutorial: true }); tutorial.xp = 3300; tutorial.staff.chef = tutorial.staff.broth = true;
  assert.equal(g.buyCart(tutorial, g.suggestedCart(tutorial)).ok, true); assert.equal(g.beginDay(tutorial).ok, true);
  assert.equal(g.romanceEligible(tutorial), false); assert.equal(g.forceStory(tutorial, 'romance').ok, false);
  tutorial.day = 4; assert.equal(g.romanceEligible(tutorial), false, 'not while the tutorial runs');
});

test('the romance joins the street stories with double weight, once a day, within the daily cap', () => {
  const pick = (draw, hired = true) => {
    const state = open(shop(10)); if (!hired) g.fireStaff(state, 'broth');
    const day = state.activeDay; day.storiesSeen = Object.keys(g.STORIES).filter(id => !['gas', 'romance', 'inspection'].includes(id));
    day.storyTimes = [day.elapsed + .05]; g.tickDay(state, .1, constant(draw));
    return state;
  };
  // Unseen and eligible: gas, then romance twice. A .4 draw lands on the second copy; without it, it would be gas.
  const romance = pick(.4); assert.equal(romance.activeDay.pendingIncident?.story, 'romance');
  assert.equal(romance.activeDay.incidentCount, 1); assert.ok(romance.activeDay.storiesSeen.includes('romance'));
  assert.equal(romance.activeDay.storiesSeen.filter(id => id === 'romance').length, 1, 'recorded once');
  assert.equal(pick(.2).activeDay.pendingIncident?.story, 'gas');
  assert.equal(pick(.4, false).activeDay.pendingIncident?.story, 'gas', 'not eligible: not in the pool');
  // A full day of situations drops the slot like any other story.
  const capped = open(shop(10)); capped.activeDay.incidentCount = 3; capped.activeDay.storyTimes = [.05]; g.tickDay(capped, .1, constant(.99));
  assert.equal(capped.activeDay.pendingIncident, null);
});

test('stage choices: hints for the romance, the gift first at the wedding, titles and texts from the stage table', () => {
  assert.deepEqual(g.ROMANCE.map(stage => [stage.days, stage.icon]), [[1, 'heart'], [2, 'tray'], [3, 'rings']]);
  assert.deepEqual(g.ROMANCE.map(stage => stage.choices.map(choice => choice.id)), [['grant', 'refuse'], ['grant', 'refuse'], ['gift', 'grant', 'refuse']]);
  for (const stage of g.ROMANCE) for (const choice of stage.choices) assert.ok(choice.label && choice.hint, `${stage.title}/${choice.id}`);
  const state = open(shop(10)), incident = romanceNow(state);
  assert.equal(incident.type, 'story'); assert.equal(incident.stage, 0); assert.equal(incident.name, ''); assert.equal(incident.targetId, null); assert.equal(incident.from, null);
  assert.deepEqual(incident.options, g.ROMANCE[0].choices.map(({ id, label, hint }) => ({ id, label, hint })));
  assert.equal(g.storyTitle(incident), g.ROMANCE[0].title); assert.equal(g.storyText(incident), g.ROMANCE[0].text);
  assert.equal(g.storyTitle({ story: 'gas' }), g.STORIES.gas.title);
  reload(state, 'a pending romance survives a reload');
  const tampered = JSON.parse(JSON.stringify(state)); tampered.activeDay.pendingIncident.stage = 1;
  assert.equal(g.loadGame({ getItem: () => JSON.stringify(tampered) }), null, 'the stage must be the save’s stage');
  tampered.activeDay.pendingIncident.stage = 0; tampered.romance = { stage: 1, lastDay: 2, backDay: null, gift: 0 };
  assert.equal(g.loadGame({ getItem: () => JSON.stringify(tampered) }), null);
  assert.equal(g.resolveIncident(state, 'gift').ok, false, 'no wedding gift on the first date');
});

test('granting leave: both cooks away from tomorrow, unpaid while away, automation stops and resumes on the return day', () => {
  const state = open(shop(10)); romanceNow(state);
  const money = state.money, reviews = state.reviews.length, xp = state.xp, buzz = state.activeDay.buzz;
  const result = g.resolveIncident(state, 'grant'); assert.equal(result.ok, true); assert.equal(result.outcome, 'grant'); assert.equal(result.tone, 'neutral');
  assert.deepEqual(state.staffAway, { chef: [11, 11], broth: [11, 11] }); assert.deepEqual(state.romance, { stage: 1, lastDay: 10, backDay: 12, gift: 0 });
  assert.equal(state.money, money); assert.equal(state.reviews.length, reviews); assert.equal(state.xp, xp); assert.equal(state.activeDay.buzz, buzz, 'no reviews, buzz or XP');
  assert.equal(g.isStaffActive(state, 'chef'), true, 'still at work today'); assert.equal(g.isStaffActive(state, 'chef', 11), false);
  assert.equal(g.staffAwayUntil(state, 'chef'), 11); assert.equal(g.wageFor(state, 'chef'), COOK.wage); assert.equal(g.wageFor(state, 'broth', 11), 0);
  assert.equal(g.dailyOperatingCost(state).wages, COOK.wage + BROTH_COOK.wage); reload(state);
  let summary = close(state);
  assert.deepEqual(summary.wageLines, [{ id: 'chef', name: COOK.name, amount: COOK.wage, cut: false }, { id: 'broth', name: BROTH_COOK.name, amount: BROTH_COOK.wage, cut: false }]);
  assert.equal(summary.wages, COOK.wage + BROTH_COOK.wage); assert.equal(summary.profit, summary.revenue + summary.goalRewards - summary.expenses);
  // Day 11: both away.
  assert.deepEqual(notes(state), [{ kind: 'staffAway', until: 11 }]); reload(state);
  assert.equal(g.isStaffActive(state, 'chef'), false); assert.equal(g.dailyOperatingCost(state).wages, 0, 'tonight’s preview leaves them out');
  open(state); assert.equal(state.activeDay.wagesDue.chef, 0); assert.equal(state.activeDay.wagesDue.broth, 0);
  guest(state); g.tickDay(state, 3, constant(.5));
  assert.ok(state.activeDay.pots.every(pot => pot === null) && !state.activeDay.readyNoodles.length, 'nobody boils noodles');
  assert.equal(g.takeBowl(state).ok, true); assert.equal(state.activeDay.bowl.broth, null, 'nobody ladles the broth'); reload(state);
  assert.equal(g.romanceEligible(state), false);
  summary = close(state); assert.deepEqual(summary.wageLines, []); assert.equal(summary.wages, 0);
  // Day 12: back at work.
  assert.deepEqual(notes(state), [{ kind: 'staffBack', gift: false }]); assert.deepEqual(state.staffAway, {}, 'an ended window is dropped overnight');
  assert.equal(g.staffAwayUntil(state, 'chef'), null); reload(state);
  open(state); assert.equal(state.activeDay.wagesDue.chef, COOK.wage);
  guest(state); g.tickDay(state, 1, constant(.5)); assert.ok(state.activeDay.pots.some(pot => pot?.auto), 'the cook is boiling again');
  assert.equal(g.takeBowl(state).ok, true); assert.equal(state.activeDay.bowl.broth, 'kimchi', 'and the broth cook ladles');
  close(state); assert.deepEqual(notes(state), [], 'staffBack shows once');
});

test('a walkout empties the kitchen today: chef pots become yours, the basket stays, and nobody is paid', () => {
  const state = open(shop(10)); guest(state); g.tickDay(state, 4, constant(.5));
  assert.ok(state.activeDay.readyNoodles.length >= 1, 'the cook filled the basket');
  state.activeDay.readyNoodles = state.activeDay.readyNoodles.slice(0, 1); state.activeDay.pots[0] = { elapsed: 1, duration: 5.2, cost: 3000, auto: true };
  romanceNow(state, sequence([.1, .2]));
  const result = g.resolveIncident(state, 'refuse'); assert.equal(result.outcome, 'walkout'); assert.equal(result.tone, 'bad');
  assert.deepEqual(state.staffAway, { chef: [10, 12], broth: [10, 12] }); assert.deepEqual(state.romance, { stage: 1, lastDay: 10, backDay: 13, gift: 0 });
  assert.equal(state.activeDay.pots[0].auto, false); assert.equal(state.activeDay.wagesDue.chef, 0); assert.equal(state.activeDay.wagesDue.broth, 0);
  assert.equal(g.dailyOperatingCost(state).wages, 0); reload(state);
  g.tickDay(state, 3, constant(.5)); assert.ok(state.activeDay.pots[0], 'the cook no longer collects her pot');
  assert.equal(g.takeBowl(state).ok, true); assert.equal(state.activeDay.bowl.broth, null);
  assert.equal(g.collectBasket(state).ok, true, 'noodles already in the basket are still yours to use');
  assert.equal(close(state).wages, 0);
  for (const day of [11, 12]) { assert.equal(state.day, day); assert.deepEqual(notes(state), [{ kind: 'staffAway', until: 12 }], `away on day ${day}`); reload(state); open(state); assert.equal(close(state).wages, 0); }
  assert.deepEqual(notes(state), [{ kind: 'staffBack', gift: false }]); assert.equal(g.isStaffActive(state, 'chef'), true);
  // A longer walkout: three more days.
  const longer = open(shop(10)); romanceNow(longer, sequence([.1, .7])); g.resolveIncident(longer, 'refuse');
  assert.deepEqual(longer.staffAway.chef, [10, 13]); assert.equal(longer.romance.backDay, 14);
});

test('a pay cut halves both cooks’ wages today and tomorrow only', () => {
  const state = open(shop(10)); romanceNow(state, sequence([.9, .1]));
  const result = g.resolveIncident(state, 'refuse'); assert.equal(result.outcome, 'cut'); assert.equal(result.tone, 'neutral');
  assert.deepEqual(state.wageCut, { ids: ['chef', 'broth'], rate: .5, until: 11 }); assert.deepEqual(state.staffAway, {});
  assert.deepEqual(state.romance, { stage: 1, lastDay: 10, backDay: null, gift: 0 });
  assert.equal(state.activeDay.wagesDue.chef, 30000); assert.equal(state.activeDay.wagesDue.broth, 40000);
  assert.equal(g.wageFor(state, 'chef'), 30000); assert.equal(g.wageFor(state, 'chef', 12), COOK.wage); assert.equal(g.isStaffActive(state, 'chef'), true);
  reload(state);
  const half = [{ id: 'chef', name: COOK.name, amount: 30000, cut: true }, { id: 'broth', name: BROTH_COOK.name, amount: 40000, cut: true }];
  let summary = close(state); assert.deepEqual(summary.wageLines, half); assert.equal(summary.wages, 70000);
  assert.deepEqual(notes(state), [], 'nobody is away');
  open(state); assert.equal(state.activeDay.wagesDue.chef, 30000); reload(state);
  summary = close(state); assert.deepEqual(summary.wageLines, half); assert.equal(state.wageCut, null, 'the cut ends with tomorrow');
  open(state); summary = close(state); assert.deepEqual(summary.wageLines.map(line => [line.amount, line.cut]), [[COOK.wage, false], [BROTH_COOK.wage, false]]);
});

test('the wedding: a 200,000đ gift, three days off, and wedding candy that lifts the return day’s buzz (capped)', () => {
  const state = shop(10); state.romance = { stage: 2, lastDay: 5, backDay: null, gift: 0 }; open(state);
  const incident = romanceNow(state); assert.equal(incident.stage, 2); assert.deepEqual(incident.options.map(option => option.id), ['gift', 'grant', 'refuse']);
  state.money = 100000; const expenses = state.stats.expenses;
  const result = g.resolveIncident(state, 'gift'); assert.equal(result.outcome, 'gift'); assert.equal(result.tone, 'good');
  assert.equal(state.money, -100000, 'the gift may take the till below zero'); assert.equal(state.stats.expenses, expenses + g.ROMANCE_GIFT);
  assert.deepEqual(state.staffAway, { chef: [11, 13], broth: [11, 13] }); assert.deepEqual(state.romance, { stage: 3, lastDay: 10, backDay: 14, gift: 1 });
  reload(state); state.money = 5000000; close(state);
  for (const day of [11, 12, 13]) { assert.equal(state.day, day); assert.deepEqual(notes(state), [{ kind: 'staffAway', until: 13 }]); open(state); if (day === 13) state.buzzNext = .4; close(state); }
  assert.deepEqual(notes(state), [{ kind: 'staffBack', gift: true }]); assert.equal(state.buzzNext, .5, '+.2 buzz, capped at .5'); assert.equal(state.romance.gift, 0);
  reload(state); open(state); assert.equal(state.activeDay.buzz, .5);
  assert.equal(g.romanceEligible(state), false, 'married: the story is over');
  // Without the cap: a plain +.2.
  const plain = shop(10); plain.romance = { stage: 2, lastDay: 5, backDay: null, gift: 0 }; open(plain); romanceNow(plain); g.resolveIncident(plain, 'gift');
  for (let i = 0; i < 3; i++) { close(plain); open(plain); }
  close(plain); assert.equal(plain.buzzNext, .2);
});

test('letting a cook go during the leave: no morning notes and the candy buzz is lost; rehiring keeps them away until it ends', () => {
  const state = shop(10); state.romance = { stage: 2, lastDay: 5, backDay: null, gift: 0 }; open(state); romanceNow(state); g.resolveIncident(state, 'gift');
  close(state); assert.deepEqual(notes(state), [{ kind: 'staffAway', until: 13 }]);
  assert.equal(g.fireStaff(state, 'chef').ok, true); assert.deepEqual(state.staffAway.chef, [11, 13], 'firing keeps the window');
  open(state); close(state); assert.deepEqual(notes(state), [], 'no note once a cook has been let go');
  assert.equal(g.hireStaff(state, 'chef').ok, true); assert.equal(g.isStaffActive(state, 'chef'), false, 'rehired inside the window: still away');
  open(state); assert.equal(state.activeDay.wagesDue.chef, 0); assert.equal(g.fireStaff(state, 'chef').ok, true); assert.equal(g.hireStaff(state, 'chef').ok, true);
  assert.equal(state.activeDay.wagesDue.chef, 0, 'hired mid-day while away: nothing owed'); reload(state);
  g.fireStaff(state, 'broth'); close(state); assert.deepEqual(notes(state), []);
  open(state); close(state); assert.equal(state.day, 14); assert.deepEqual(notes(state), [], 'no staffBack either');
  assert.equal(state.buzzNext, 0, 'the candy buzz is lost'); assert.equal(state.romance.gift, 0);
});

test('firing mid-day still pays the day, and rehiring never lowers what is owed', () => {
  const state = open(shop(10)); g.fireStaff(state, 'chef');
  assert.equal(g.dailyOperatingCost(state).wages, COOK.wage + BROTH_COOK.wage, 'a fired member is paid for the day');
  assert.equal(g.hireStaff(state, 'chef').ok, true); assert.equal(state.activeDay.wagesDue.chef, COOK.wage);
  romanceNow(state, sequence([.9, .1])); g.resolveIncident(state, 'refuse'); assert.equal(state.activeDay.wagesDue.chef, 30000);
  g.fireStaff(state, 'chef'); assert.equal(g.dailyOperatingCost(state).wages, 30000 + 40000, 'fired under the cut: the cut wage is still paid');
  g.hireStaff(state, 'chef'); assert.equal(state.activeDay.wagesDue.chef, 30000); reload(state);
  const summary = close(state); assert.deepEqual(summary.wageLines.map(line => [line.id, line.amount, line.cut]), [['chef', 30000, true], ['broth', 40000, true]]);
});

test('saves: romance, away windows and cuts are validated, old saves get the defaults', () => {
  const state = open(shop(10)); romanceNow(state, sequence([.9, .1])); g.resolveIncident(state, 'refuse'); reload(state);
  const save = () => JSON.parse(JSON.stringify(state)), load = data => g.loadGame({ getItem: () => JSON.stringify(data) });
  const old = save(); delete old.romance; delete old.staffAway; delete old.wageCut; delete old.lastNews; delete old.neighbours;
  const loaded = load(old); assert.ok(loaded); assert.equal(loaded.romance, null); assert.deepEqual(loaded.staffAway, {}); assert.equal(loaded.wageCut, null); assert.equal(loaded.lastNews, 0);
  const bad = [
    data => { data.romance = { stage: 4, lastDay: 10, backDay: null, gift: 0 }; },
    data => { data.romance = { stage: 1, lastDay: 11, backDay: null, gift: 0 }; },
    data => { data.romance = { stage: 1, lastDay: 10, backDay: 20, gift: 0 }; },
    data => { data.romance = { stage: 1, lastDay: 10, backDay: null, gift: 2 }; },
    data => { data.staffAway = { waiter: [10, 11] }; },
    data => { data.staffAway = { chef: [12, 11] }; },
    data => { data.staffAway = { chef: [10, 20] }; },
    data => { data.staffAway = []; },
    data => { data.wageCut = { ids: ['cashier'], rate: .5, until: 11 }; },
    data => { data.wageCut = { ids: ['chef', 'chef'], rate: .5, until: 11 }; },
    data => { data.wageCut = { ids: ['chef'], rate: 2, until: 11 }; },
    data => { data.morning = [{ kind: 'staffAway', until: 2 }]; },
    data => { data.morning = [{ kind: 'staffBack', gift: 1 }]; },
    data => { data.morning = [{ kind: 'party' }]; },
  ];
  for (const [index, tamper] of bad.entries()) { const data = save(); tamper(data); assert.equal(load(data), null, `tampered save ${index}`); }
  const summary = close(state); reload(state);
  const lines = save(); lines.lastDay.wageLines[0].amount += 1000; assert.equal(load(lines).lastDay, null, 'wage lines must add up to the wages');
  const oldSummary = save(); delete oldSummary.lastDay.wageLines; assert.deepEqual(load(oldSummary).lastDay.wageLines, [], 'older summaries have none');
  assert.equal(summary.wageLines.length, 2);
});
