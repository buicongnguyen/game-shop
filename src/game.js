import { INGREDIENTS, UPGRADES, STAFF, DECORATIONS, LEVELS, INITIAL_INGREDIENT_IDS, DAILY_EVENTS, DAY_DURATION, CLOSING_GRACE, BASE_RENT, BASE_UTILITIES, STARTING_CASH } from './catalog.js';
import { cleanSidequests, marketDiscount, secretBroth } from './sidequests.js';
import { STORIES, DAY_STORIES, storyChoices, storyOutcome } from './situations.js';
import { composeReview, pickCustomer, replyTone, customerAnswer, REVIEW_CAUSES } from './voice.js';
export { INGREDIENTS, UPGRADES, STAFF, DECORATIONS, LEVELS, DAILY_EVENTS, DAY_DURATION, CLOSING_GRACE, STORIES };
// Short messages for the interface (a customer changed their mind, the buyer returned...).
// They are transient, so they never enter the save.
let notices = [];
function notify(text, tone = 'neutral', cue = null) { notices.push({ text, tone, cue }); }
export function takeNotices() { const list = notices; notices = []; return list; }
// Deterministic randomness for things that must not depend on Math.random (story timing, gifts).
function seeded(seed) { let value = seed >>> 0; return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; }; }
// A stable 32-bit hash (FNV-1a), so text chosen for a review never depends on the game's random stream.
function hashText(text) { let hash = 2166136261; for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619); return hash >>> 0; }
export const SAVE_KEY = 'tiem-mi-cay-local-v1';
export const BACKUP_KEY = `${SAVE_KEY}-backup-v1`;
export const STATE_LIMITS = Object.freeze({ money: 1e12, count: 1e9, inventory: 1e6, day: 1e6 });
const items = new Map(INGREDIENTS.map(item => [item.id, item]));
const fail = message => ({ ok: false, message });
const good = (message = '', extra = {}) => ({ ok: true, message, ...extra });
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const int = (n, max = 1e9, min = 0) => Number.isSafeInteger(n) && n >= min && n <= max;
const cash = n => int(n, 1e12, -1e12);
const finite = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
const mapOf = (rows, value) => Object.fromEntries(rows.map(row => [row.id, typeof value === 'function' ? value(row) : value]));
const emptyBowl = () => ({ started: false, broth: null, noodles: null, toppings: [], spice: 0, cost: 0 });
const initialStats = () => ({ served: 0, customers: 0, revenue: 0, expenses: 0, lost: 0, mistakes: 0, waste: 0, tips: 0, perfect: 0, daysPlayed: 0, bestDay: 0, rewards: 0, borrowed: 0, repaid: 0 });
const operating = state => state.activeDay && ['open', 'closing'].includes(state.phase);
const capacity = state => state.upgrades.table ? 4 : 3;
const potCount = state => state.upgrades.pot3 ? 3 : state.upgrades.pot2 ? 2 : 1;
function rng(random) { const n = Number(random()); if (!Number.isFinite(n)) throw Error('Invalid randomness'); return clamp(n, 0, .999999999); }
function pick(random, values) { return values[Math.floor(rng(random) * values.length)]; }
export function formatMoney(value) { return `${new Intl.NumberFormat('vi-VN').format(Number.isFinite(value) ? Math.round(value) : 0)}₫`; }
export function levelInfo(state) { const current = [...LEVELS].reverse().find(level => state.xp >= level.xp) || LEVELS[0], next = LEVELS.find(level => level.level === current.level + 1); return { ...current, nextXp: next?.xp ?? null, progress: next ? clamp((state.xp - current.xp) / (next.xp - current.xp), 0, 1) : 1, currentXp: state.xp }; }
export function availableIngredients(state) { return INGREDIENTS.filter(item => state.unlocked.includes(item.id)); }
export function inventoryCount(state, id) { return items.has(id) ? state.inventory[id] : 0; }
export function dailyOperatingCost(state) { const utilities = BASE_UTILITIES + UPGRADES.filter(item => state.upgrades[item.id]).reduce((sum, item) => sum + item.utilities, 0); const wages = STAFF.reduce((sum, item) => sum + Math.max(state.staff[item.id] ? item.wage : 0, state.activeDay?.wagesDue[item.id] || 0), 0); return { rent: BASE_RENT, utilities, wages, total: BASE_RENT + utilities + wages }; }
function goalsFor(state) { const level = levelInfo(state).level, day = state.day; const choices = [
  { id: `day-${day}-served`, day, name: 'Tiệm đông vui', description: 'Phục vụ những tô mì nóng.', metric: 'served', target: 6 + 2 * level },
  { id: `day-${day}-perfect`, day, name: 'Khách thương mến', description: 'Nhận đánh giá 5 sao.', metric: 'perfect', target: 2 + Math.ceil(level / 2) },
  { id: `day-${day}-ideal`, day, name: 'Vừa chín tới', description: 'Giao mì có độ chín lý tưởng.', metric: 'ideal', target: 5 + level },
];
  if (level >= 3) choices.push({ id: `day-${day}-spicy`, day, name: 'Thử thách cay', description: 'Giao tô mì cay từ cấp 5.', metric: 'spicy', target: 1 + Math.floor(level / 3) });
  if (level >= 2) choices.push({ id: `day-${day}-maxCombo`, day, name: 'Ba lời khen liền nhau', description: 'Đạt chuỗi 3 khách 5 sao.', metric: 'maxCombo', target: 3 });
  if (state.upgrades.delivery) choices.push({ id: `day-${day}-deliveries`, day, name: 'Mì đến tận nhà', description: 'Hoàn thành 2 đơn giao hàng.', metric: 'deliveries', target: 2 });
  choices.push({ id: `day-${day}-noLost`, day, name: 'Khách nào cũng vui', description: 'Phục vụ ít nhất một tô, không để khách bỏ đi.', metric: 'noLost', target: 1 });
  if (day > 1) { let seed = day * 314159 + level; for (let i = choices.length - 1; i > 0; i--) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const j = seed % (i + 1); [choices[i], choices[j]] = [choices[j], choices[i]]; } }
  return choices.slice(0, 3).map(goal => ({ ...goal, progress: 0, rewardMoney: (15 + 5 * level) * 1000, rewardXp: 25 + 5 * level, claimed: false }));
}
export function createGame(name = 'Tiệm Mì Cay', { tutorial = false } = {}) {
  const state = { nextEvent: null, buzzNext: 0, pendingIncome: 0, insolvent: false, tutorialDone: !tutorial, pendingLevelUp: null, morning: [], version: 2, name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 40) : 'Tiệm Mì Cay', day: 1, money: STARTING_CASH, xp: 0, reputation: 4, inventory: mapOf(INGREDIENTS, 0), batches: mapOf(INGREDIENTS, () => []), prices: mapOf(INGREDIENTS, item => item.sellPrice), unlocked: [...INITIAL_INGREDIENT_IDS], upgrades: mapOf(UPGRADES, false), staff: mapOf(STAFF, false), decoration: { owned: ['awning_red'], selected: { awning: 'awning_red', pet: null, plant: null, lamp: null } }, reviews: [], history: [], stats: initialStats(), settings: { sound: true, music: true, motion: true, theme: 'light' }, pendingExpenses: 0, debt: 0, loanInterest: 0, loanInstallment: 0, loansTaken: 0, phase: 'prep', activeDay: null, lastDay: null, nextOrderId: 1, goals: [], legacySave: null, sidequests: {}, receivables: [] };
  state.goals = goalsFor(state); lockEvent(state); return state;
}
function spend(state, amount) { const current = state.activeDay ? state.activeDay.expenses : state.pendingExpenses; if (!int(amount, 1e12) || !cash(state.money - amount) || !int(state.stats.expenses + amount, 1e12) || !int(current + amount, 1e12)) return false; state.money -= amount; state.stats.expenses += amount; if (state.activeDay) state.activeDay.expenses += amount; else state.pendingExpenses += amount; return true; }
// Weekends are calendar days only. Other days roll 35% for an event from a weighted pool:
// rain counts twice, and the spicy challenge joins twice from stage two (level 3).
const NORMAL_EVENT = Object.freeze({ id: 'normal', name: 'Ngày bình yên', description: 'Một ngày bán hàng mới.', traffic: 1, patience: 1, costMultiplier: 1 });
const EVENT_IDS = ['normal', ...DAILY_EVENTS.map(event => event.id)];
function eventFor(day, level, unlocked = INITIAL_INGREDIENT_IDS) {
  if (day % 7 === 0 || day % 7 === 6) return { ...DAILY_EVENTS.find(event => event.id === 'weekend') };
  if (day <= 2 || ((Math.imul(day, 1103515245) + 12345) >>> 0) / 4294967296 >= .35) return { ...NORMAL_EVENT };
  const random = seeded(Math.imul(day, 2654435761) + 97), pool = ['rain', 'rain', 'hot', 'students', 'reviewer', 'sale', 'cold', 'payday', 'festival', ...(level >= 3 ? ['challenge', 'challenge'] : [])];
  const picked = pool[Math.floor(random() * pool.length)], event = { ...DAILY_EVENTS.find(row => row.id === picked) };
  if (event.id === 'sale') { const choices = unlocked.filter(id => ['broth', 'topping'].includes(items.get(id)?.kind)); event.discountedIngredient = choices[Math.floor(random() * choices.length)] || 'kimchi'; }
  return event;
}
// A day's event is fixed when the previous day is settled, so what the morning preview promises is what the day
// brings, even after unlocking an ingredient or levelling up before opening. A stale entry is simply ignored.
function eventById(id, item) { const event = id === 'normal' ? { ...NORMAL_EVENT } : { ...DAILY_EVENTS.find(row => row.id === id) }; if (item) event.discountedIngredient = item; return event; }
function lockEvent(state) { if (state.nextEvent?.day === state.day) return; const event = eventFor(state.day, levelInfo(state).level, state.unlocked); state.nextEvent = { day: state.day, id: event.id, item: event.discountedIngredient ?? null }; }
export function dayEvent(state) { if (state.activeDay) return state.activeDay.event; return state.nextEvent?.day === state.day ? eventById(state.nextEvent.id, state.nextEvent.item) : eventFor(state.day, levelInfo(state).level, state.unlocked); }
function wasteReserve(state) { return INGREDIENTS.reduce((sum, item) => sum + state.batches[item.id].reduce((value, batch) => value + batch.qty * batch.cost, 0), 0) + (state.activeDay ? state.activeDay.bowl.cost + state.activeDay.pots.reduce((sum, pot) => sum + (pot?.cost || 0), 0) + state.activeDay.readyNoodles.reduce((sum, ready) => sum + ready.cost, 0) : 0); }
function unitCost(state, item, rush = false) { const event = dayEvent(state), base = Math.round(item.price * (event.id === 'sale' && event.discountedIngredient === item.id ? .7 : 1) * (1 - marketDiscount(state)) / 10) * 10; return rush ? Math.round(base * 1.5 / 100) * 100 : base; }
function cartQuote(state, cart, rush = false) {
  if (!cart || typeof cart !== 'object' || Array.isArray(cart)) return null;
  const rows = []; let total = 0;
  for (const [id, quantity] of Object.entries(cart)) { const item = items.get(id); if (!item || !int(quantity, 99)) return null; if (!quantity) continue; if (item.unlockLevel > levelInfo(state).level && !state.unlocked.includes(id) || state.inventory[id] + quantity > 1e6) return null; const unlock = state.unlocked.includes(id) ? 0 : item.unlockPrice, cost = unitCost(state, item, rush); total += cost * quantity + unlock; rows.push({ item, quantity, cost }); }
  return { total, rows };
}
export function cartCost(state, cart, options = {}) { return cartQuote(state, cart, options.rush)?.total ?? NaN; }
// Expected visitors: the arrival rate integrated over the spawn window. The first guest comes at 10 s
// and new guests stop 8 s before closing. Students and the reviewer are scheduled extras.
export function forecastCustomers(state) {
  const day = { elapsed: 0, event: dayEvent(state), buzz: state.activeDay?.buzz ?? 0 };
  let expected = day.event.id === 'students' ? 3 : day.event.id === 'reviewer' ? 1 : 0;
  for (let second = 10; second < DAY_DURATION - 8; second++) { day.elapsed = second + .5; expected += traffic(state, true, day) / 10; }
  return Math.max(1, Math.floor(expected));
}
// Stock for the forecast: noodles for every guest, spare bowls, broths split 40% to the first and the rest
// evenly, toppings scaled by customer stage. Round up to fives, then trim fives until tonight's overhead is covered.
export function suggestedCart(state) {
  const level = levelInfo(state).level, stage = level < 3 ? 0 : level < 7 ? 1 : 2, base = Math.ceil(forecastCustomers(state) * (stage === 2 ? 1.6 : 1)) + 2;
  const unlocked = availableIngredients(state), broths = unlocked.filter(item => item.kind === 'broth'), toppings = unlocked.filter(item => item.kind === 'topping');
  const want = { bowls: base + 3, noodles: base };
  broths.forEach((item, index) => { want[item.id] = broths.length === 1 ? base : index === 0 ? base * .4 : base * .6 / (broths.length - 1); });
  for (const item of toppings) want[item.id] = base * [.85, 1.25, 1.4][stage] / toppings.length;
  const cart = {}; for (const [id, target] of Object.entries(want)) cart[id] = Math.min(95, Math.max(0, Math.ceil((target - inventoryCount(state, id)) / 5) * 5));
  const missingBroth = !broths.some(item => inventoryCount(state, item.id)), floor = id => (['bowls', 'noodles'].includes(id) || missingBroth && id === broths[0]?.id) && !inventoryCount(state, id) ? 5 : 0;
  while (cartCost(state, cart) > Math.max(0, state.money - dailyOperatingCost(state).total)) { const id = Object.keys(cart).filter(key => cart[key] > floor(key)).sort((a, b) => cart[b] - cart[a])[0]; if (!id) break; cart[id] = Math.max(floor(id), cart[id] - 5); }
  return cart;
}
export function buyCart(state, cart, { rush = false } = {}) {
  const quote = cartQuote(state, cart, rush); if (!quote || !quote.rows.length) return fail('Chọn số lượng 0–99 và nguyên liệu đúng cấp tiệm.'); if (operating(state) && !rush) return fail('Trong giờ bán, hãy chọn nhập hàng khẩn cấp.'); if (state.money < quote.total) return fail(`Cần ${formatMoney(quote.total)} để nhập hàng.`); if (!rush && state.money - quote.total < openingReserve(state, cart)) return fail(reserveMessage(openingReserve(state, cart))); if (!int(state.stats.waste + wasteReserve(state) + quote.rows.reduce((sum, row) => sum + row.cost * row.quantity, 0), 1e12) || !spend(state, quote.total)) return fail('Đã đạt giới hạn tiền.');
  for (const { item, quantity, cost } of quote.rows) { if (!state.unlocked.includes(item.id)) state.unlocked.push(item.id); const expiresDay = item.expiryDays === null ? null : state.day + item.expiryDays - 1, batches = state.batches[item.id], same = batches.find(batch => batch.expiresDay === expiresDay && batch.cost === cost); if (same) same.qty += quantity; else batches.push({ qty: quantity, expiresDay, cost }); state.inventory[item.id] += quantity; }
  return good(`Đã nhập hàng: ${formatMoney(quote.total)}.`, { cost: quote.total });
}
function consume(state, id) { if (!items.has(id) || state.inventory[id] <= 0) return null; const batch = state.batches[id].find(lot => lot.qty > 0); if (!batch) return null; batch.qty--; state.inventory[id]--; state.batches[id] = state.batches[id].filter(lot => lot.qty > 0); if (!state.inventory[id]) dispatchBuyer(state, id); return batch.cost; }
// The buyer leaves the moment an item runs out: one trip per item, up to four a day, only while open.
function dispatchBuyer(state, id) {
  const day = state.activeDay; if (!day || !state.staff.buyer || state.phase !== 'open' || day.tutorial || day.buyerTrips >= 4 || day.buyerRuns[id] !== undefined) return;
  day.buyerRuns[id] = 12; day.buyerTrips++;
  notify(`Người đi chợ đi mua thêm ${items.get(id).shortName}, khoảng 12 giây nữa về.${day.buyerTrips === 4 ? ' Đây là chuyến cuối hôm nay.' : ''}`);
}
// Cash a purchase must leave behind: five portions of each missing essential (bowls, noodles, a broth).
function openingReserve(state, cart = {}) {
  const has = id => inventoryCount(state, id) + (cart[id] || 0) > 0, broths = availableIngredients(state).filter(item => item.kind === 'broth');
  let reserve = 0; for (const id of ['bowls', 'noodles']) if (!has(id)) reserve += unitCost(state, items.get(id)) * 5;
  if (!broths.some(item => has(item.id)) && broths.length) reserve += unitCost(state, [...broths].sort((a, b) => a.price - b.price)[0]) * 5;
  return reserve;
}
const reserveMessage = reserve => `Cần giữ lại ${formatMoney(reserve)} để còn nhập tô, mì và nước dùng mở cửa.`;
export function setPrice(state, id, delta) { const item = items.get(id); if (!item || item.kind === 'base' || !Number.isInteger(delta) || Math.abs(delta) > 100000 || delta % 1000) return fail('Giá bán thay đổi từng 1.000đ.'); const price = state.prices[id] + delta; if (!int(price, item.sellPrice * 3, 1000)) return fail('Giá đã chạm giới hạn.'); state.prices[id] = price; return good('Đã cập nhật giá bán.', { price }); }
function purchaseAsset(state, rows, collection, id) { const item = rows.find(row => row.id === id); if (!item || collection[id]) return fail('Không hợp lệ hoặc đã sở hữu.'); if (levelInfo(state).level < item.unlockLevel) return fail(`Mở ở cấp ${item.unlockLevel}.`); if (item.requires && !state.upgrades[item.requires]) return fail('Cần mua nâng cấp trước đó.'); if (state.money < item.price) return fail('Chưa đủ tiền.'); if (item.price > 0 && state.money - item.price < openingReserve(state)) return fail(reserveMessage(openingReserve(state))); if (!spend(state, item.price)) return fail('Đã đạt giới hạn tiền.'); collection[id] = true; return good(`Đã chọn ${item.name}.`, { cost: item.price }); }
export function buyUpgrade(state, id) { const result = purchaseAsset(state, UPGRADES, state.upgrades, id); if (result.ok && state.activeDay) while (state.activeDay.pots.length < potCount(state)) state.activeDay.pots.push(null); return result; }
export function hireStaff(state, id) { const result = purchaseAsset(state, STAFF, state.staff, id); if (result.ok && state.activeDay) state.activeDay.wagesDue[id] = STAFF.find(member => member.id === id).wage; return result; }
export function fireStaff(state, id) { if (!STAFF.some(member => member.id === id) || !state.staff[id]) return fail('Nhân viên chưa làm tại tiệm.'); state.staff[id] = false; return good('Đã kết thúc ca làm.'); }
export function buyDecoration(state, id) { const item = DECORATIONS.find(row => row.id === id); if (!item || state.decoration.owned.includes(id)) return fail('Trang trí không hợp lệ hoặc đã sở hữu.'); if (levelInfo(state).level < item.unlockLevel || state.money < item.price) return fail('Chưa đủ cấp hoặc tiền.'); if (item.price > 0 && state.money - item.price < openingReserve(state)) return fail(reserveMessage(openingReserve(state))); if (!spend(state, item.price)) return fail('Đã đạt giới hạn tiền.'); state.decoration.owned.push(id); state.decoration.selected[item.type] = id; return good('Tiệm xinh hơn rồi!', { cost: item.price }); }
export function selectDecoration(state, id) { const item = DECORATIONS.find(row => row.id === id); if (!item || !state.decoration.owned.includes(id)) return fail('Bạn chưa sở hữu trang trí này.'); state.decoration.selected[item.type] = id; return good('Đã đổi trang trí.'); }
function newDay(state) { return { day: state.day, duration: DAY_DURATION, remaining: DAY_DURATION, closingRemaining: CLOSING_GRACE, elapsed: 0, spawnElapsed: 0, nextArrival: 10, appSpawnElapsed: 0, nextAppArrival: 22, studentsSpawned: false, reviewerSpawned: false, chefCooldown: 0, goalRewards: 0, pendingIncident: null, incidentCount: 0, lastIncidentAt: -30, buzz: state.buzzNext || 0, slowUntil: 0, orders: [], pots: Array(potCount(state)).fill(null), readyNoodles: [], bowl: emptyBowl(), selectedOrderId: null, served: 0, revenue: state.pendingIncome || 0, expenses: state.pendingExpenses, lost: 0, customers: 0, mistakes: 0, waste: 0, tips: 0, perfect: 0, ideal: 0, spicy: 0, deliveries: 0, noLost: 0, dineInServed: 0, combo: 0, maxCombo: 0, buyerTrips: 0, buyerRuns: {}, seq: 0, storyTimes: [], storiesSeen: [], dirty: null, inspected: false, noisyId: null, tutorial: false, xpGained: 0, priceLost: 0, recent: [], wagesDue:
 mapOf(STAFF, member => state.staff[member.id] ? member.wage : 0), event: dayEvent(state), goals: state.goals }; }
// Story windows (fractions of the day) as in the reference: each is kept with 40% odds on day 2, 60% later.
const STORY_WINDOWS = [[.12, .3], [.38, .58], [.64, .84]];
export function beginDay(state, random = seeded(state.day * 7919 + state.stats.customers * 31 + 17)) {
  if (state.phase !== 'prep' || state.activeDay) return fail('Tiệm đang mở rồi.');
  if (state.day >= 999999 || state.stats.daysPlayed >= 1e6) return fail('Đã đạt giới hạn ngày chơi.');
  if (state.insolvent && state.money < minimumRestock(state)) return fail('Két đã cạn: vay vốn hoặc mở tiệm mới để tiếp tục.');
  if (!inventoryCount(state, 'bowls') || !inventoryCount(state, 'noodles') || !availableIngredients(state).some(item => item.kind === 'broth' && inventoryCount(state, item.id))) return fail('Nhập tô, mì và ít nhất một loại nước dùng để mở cửa.');
  if (state.goals[0]?.day !== state.day) state.goals = goalsFor(state);
  const day = newDay(state); state.activeDay = day; state.pendingExpenses = 0; state.pendingIncome = 0; state.buzzNext = 0; state.insolvent = false; state.phase = 'open';
  if (!state.tutorialDone && state.day === 1) startTutorial(state);
  else if (state.day >= 2) { let rolls; try { const keep = state.day === 2 ? .4 : .6; rolls = STORY_WINDOWS.filter(() => rng(random) < keep).map(([from, to]) => Math.round((from + rng(random) * (to - from)) * DAY_DURATION * 100) / 100); } catch { rolls = []; } day.storyTimes = rolls; }
  return good(`Ngày ${state.day}: mở cửa!`, { activeDay: state.activeDay });
}
// A new shop's first customer is scripted: patient, one stocked broth and topping, spice 1.
// The day clock waits until that bowl is served; pots and the chef keep cooking meanwhile.
function startTutorial(state) {
  const day = state.activeDay, stocked = kind => availableIngredients(state).find(item => item.kind === kind && inventoryCount(state, item.id));
  const broth = stocked('broth'), topping = stocked('topping'), dish = { broth: broth.id, toppings: topping ? [topping.id] : [], spice: 1, price: priceFor(state, broth.id, topping ? [topping.id] : []) };
  const order = { id: `day-${state.day}-order-${state.nextOrderId++}`, name: 'Chị Hạnh', ...dish, toppings: [...dish.toppings], dishes: [{ ...dish, toppings: [...dish.toppings] }], patience: 99, maxPatience: 99, bowlsTotal: 1, bowlsServed: 0, mistakes: 0, qualityPenalty: 0, delivery: false, reviewer: false, tea: false, trait: null, changed: false, tourist: false, self: 'chị' };
  day.orders.push(order); day.customers++; state.stats.customers++; day.selectedOrderId = order.id; day.tutorial = true;
}
export function skipTutorial(state) {
  const day = state.activeDay; if (!day?.tutorial) return fail('Không có hướng dẫn đang chạy.');
  day.tutorial = false; state.tutorialDone = true; for (const order of day.orders) { order.maxPatience = 70; order.patience = 70; }
  return good('Đã bỏ qua hướng dẫn. Xem lại cách chơi trong mục Cách nấu.');
}
// The coached first bowl, one step at a time; the first matching step wins. `target` names the control
// to highlight: bowl, discard, broth (id), pot (index), basket, topping (id), chili or serve.
export function coachStep(state) {
  const day = state.activeDay; if (!day?.tutorial) return null;
  const order = getSelectedOrder(state), bowl = day.bowl; if (!order) return null;
  if (!bowl.started) return { target: 'bowl', text: 'Mọi tô mì bắt đầu từ đây: bấm “Lấy tô”.' };
  if (bowl.broth && bowl.broth !== order.broth || bowl.toppings.some(id => !order.toppings.includes(id)) || bowl.spice > order.spice) return { target: 'discard', text: 'Tô này đã lệch phiếu gọi món. Bỏ tô rồi làm lại nhé, lần này sẽ chuẩn!' };
  if (!bowl.broth) return { target: 'broth', id: order.broth, text: `Phiếu ghi ${items.get(order.broth).shortName}: chạm vào nồi nước dùng đó.` };
  if (!bowl.noodles) {
    if (day.readyNoodles.length) return { target: 'basket', text: 'Rổ đã có mì chín sẵn: lấy một vắt cho vào tô.' };
    const index = day.pots.findIndex(Boolean), pot = day.pots[index];
    if (!pot) return { target: 'pot', index: 0, text: 'Chạm vào nồi để thả một vắt mì.' };
    const progress = pot.elapsed / pot.duration;
    return { target: 'pot', index, text: progress < .5 ? 'Mì đang sôi. Chờ kim chạy vào vạch xanh…' : progress <= .78 ? 'Kim vào vạch xanh rồi! Chạm nồi để vớt mì.' : 'Mì sắp nhũn, vớt ngay!' };
  }
  const topping = order.toppings.find(id => !bowl.toppings.includes(id));
  if (topping) return { target: 'topping', id: topping, text: `Thêm ${items.get(topping).shortName} lên mặt tô.` };
  if (bowl.spice < order.spice) return { target: 'chili', text: `Rắc ớt thêm ${order.spice - bowl.spice} lần cho đúng cấp ${order.spice}.` };
  return { target: 'serve', text: 'Tô mì đã khớp phiếu. Bưng ra cho khách thôi!' };
}
function priceFor(state, broth, toppings) { return state.prices[broth] + toppings.reduce((sum, id) => sum + state.prices[id], 0); }
export function getSelectedOrder(state) { return state.activeDay?.orders.find(order => order.id === state.activeDay.selectedOrderId) || state.activeDay?.orders[0] || null; }
function weighted(random, weights) { const value = rng(random); let cumulative = 0; for (let i = 0; i < weights.length; i++) { cumulative += weights[i]; if (value < cumulative) return i; } return weights.length - 1; }
// Guests avoid repeating what the last six orders had: each broth or topping weighs 1 / (1 + 1.5 × its recent
// appearances). One draw per pick, so with no history this is the same as an even pick.
const RECENT_ORDERS = 6;
function pickFresh(state, random, rows) {
  const recent = state.activeDay.recent.flat(), weights = rows.map(row => 1 / (1 + 1.5 * recent.filter(id => id === row.id).length)), total = weights.reduce((sum, weight) => sum + weight, 0);
  let value = rng(random) * total; for (let i = 0; i < rows.length; i++) { value -= weights[i]; if (value < 0) return i; } return rows.length - 1;
}
function makeDish(state, random) { const level = levelInfo(state).level, broths = availableIngredients(state).filter(item => item.kind === 'broth'), broth = broths[pickFresh(state, random, broths)].id, choices = availableIngredients(state).filter(item => item.kind === 'topping'), count = weighted(random, level < 3 ? [.15, .85] : level < 7 ? [.15, .5, .35] : [.1, .35, .35, .2]), toppings = []; while (toppings.length < count && choices.length) toppings.push(choices.splice(pickFresh(state, random, choices), 1)[0].id); let spice = weighted(random, level < 3 ? [.2, .3, .3, .2] : [.07, .12, .17, .18, .15, .12, .1, .09]); if (state.activeDay.event.id === 'hot') spice = Math.min(spice, Math.floor(rng(random) * 3)); if (state.activeDay.event.id === 'challenge' && rng(random) < .45) spice = 7; if (state.activeDay.event.id === 'cold' && rng(random) < .6) spice = Math.max(spice, level < 3 ? 2 + Math.floor(rng(random) * 2) : 4 + Math.floor(rng(random) * 4)); return { broth, toppings, spice, price: priceFor(state, broth, toppings) }; }
const TOURIST_NAMES = ['Emma', 'Lucas', 'Mia', 'Noah', 'Sofia', 'Kenji', 'Mei', 'Hans', 'Chloé', 'Oliver'];
export const TRAITS = Object.freeze(['hurried', 'fickle', 'haggler']);
// A guest who wants something the shop has run out of switches to another stocked item half the time;
// otherwise they walk on. Returns the missing ingredient id, or null when every dish can be made.
function checkArrivalStock(state, dishes, random) {
  for (const dish of dishes) for (const id of [dish.broth, ...dish.toppings]) {
    if (inventoryCount(state, id)) continue;
    const kind = items.get(id).kind, taken = kind === 'broth' ? [dish.broth] : dish.toppings;
    const options = availableIngredients(state).filter(item => item.kind === kind && inventoryCount(state, item.id) && !taken.includes(item.id));
    if (!options.length || rng(random) >= .5) return id;
    const swap = options[Math.floor(rng(random) * options.length)].id;
    if (kind === 'broth') dish.broth = swap; else dish.toppings = dish.toppings.map(item => item === id ? swap : item);
    dish.price = priceFor(state, dish.broth, dish.toppings);
  }
  return null;
}
// Price tiers, as on the price tags. Expensive: a broth above 60,000₫ or a topping above 1.5× its suggested price.
// Severe: anything above twice its suggested price. The photo menu raises both limits by 20%.
const priceTolerance = state => state.upgrades.menu ? 1.2 : 1;
function tooExpensive(state, id) { const item = items.get(id); return item.kind === 'broth' ? state.prices[id] > 60000 * priceTolerance(state) : state.prices[id] > item.sellPrice * 1.5 * priceTolerance(state); }
function severePrice(state, id) { return state.prices[id] > items.get(id).sellPrice * 2 * priceTolerance(state); }
export function priceTag(state, id) { const item = items.get(id); if (!item || item.kind === 'base') return null; return severePrice(state, id) ? 'severe' : tooExpensive(state, id) ? 'expensive' : state.prices[id] < item.sellPrice * .85 ? 'cheap' : null; }
// Price grumbles are shown at most once every 9 seconds of the day; the counter still counts every guest.
const priceNoticeAt = new WeakMap();
function priceNotice(state, text) { const day = state.activeDay, last = priceNoticeAt.get(day); if (last === undefined || day.elapsed - last >= 9 || day.elapsed < last) { priceNoticeAt.set(day, day.elapsed); notify(text, 'bad', 'customerLeave'); } }
// Arrivals, in the reference's order: a free table; a severe price anywhere on the menu turns 80% away (1 in 10 of
// them posts a 1–2★ review); a sold-out dish switches or walks; an expensive dish is refused 40% of the time.
// Students, the reviewer and invited tourists do not check prices. App orders skip silently.
function createOrderFor(state, random, delivery = false, { tourist = false, bypassPrice = tourist, noTrait = false } = {}) {
  const day = state.activeDay; if (state.phase !== 'open' || !day || day.remaining <= (delivery ? 10 : 8)) return fail('Tiệm đã ngừng nhận khách mới.'); if (delivery && !state.upgrades.delivery || day.orders.filter(order => order.delivery === delivery).length >= (delivery ? 2 : capacity(state))) return fail(delivery ? 'Đã đủ hai đơn giao hàng.' : 'Các bàn đã đầy.'); if (state.nextOrderId >= 999999999 || state.stats.customers >= 1e9 || day.customers >= 1e9 || state.stats.lost + day.orders.length >= 1e9) return fail('Đã đạt giới hạn đơn hàng.');
  if (!delivery && !bypassPrice) {
    const severe = availableIngredients(state).filter(item => item.kind !== 'base' && severePrice(state, item.id));
    if (severe.length) {
      let walks, review, stars; try { walks = rng(random) < .8; review = walks && rng(random) < .1; stars = review && rng(random) < .5 ? 1 : 2; } catch { return fail('Không thể tạo đơn hàng.'); }
      if (walks) {
        day.priceLost++; if (review) addReview(state, { id: `day-${state.day}-order-${state.nextOrderId++}`, name: 'Khách qua đường', reviewer: false }, stars, 'price-walk');
        priceNotice(state, `Khách xem thực đơn, chê ${items.get(severe[0].id).shortName} đắt quá nên bỏ đi.`);
        return { ok: false, message: 'Khách chê giá đắt.', priceWalk: true };
      }
    }
  }
  let dishes, name, self = 'mình', trait = null, soldOut = null, walkRoll = 1, walkStars = 2, refused = false;
  try {
    const level = levelInfo(state).level, first = makeDish(state, random), total = delivery ? 1 : level >= 7 ? 1 + weighted(random, [.5, .32, .18]) : level >= 3 && day.event.id === 'weekend' && rng(random) < .3 ? 2 : 1; dishes = [first]; while (dishes.length < total) dishes.push(makeDish(state, random));
    // One draw names the guest: a tourist, or one of the voice module's local personas with how they refer to themselves.
    const nameRoll = rng(random); if (tourist) { name = TOURIST_NAMES[Math.floor(nameRoll * TOURIST_NAMES.length)]; self = 'I'; } else ({ name, self } = pickCustomer(seeded(Math.floor(nameRoll * 4294967296))));
    soldOut = checkArrivalStock(state, dishes, random);
    if (soldOut && !delivery) { walkRoll = rng(random); walkStars = rng(random) < .5 ? 2 : 3; }
    if (!soldOut && !bypassPrice && dishes.some(dish => [dish.broth, ...dish.toppings].some(id => tooExpensive(state, id)))) refused = rng(random) < .4;
    // From day 3, 13% of ordinary dine-in guests are hurried, change their mind about spice, or haggle.
    if (!soldOut && !refused && !delivery && !tourist && !noTrait && state.day >= 3 && !day.tutorial && rng(random) < .13) trait = pick(random, TRAITS);
  } catch { return fail('Không thể tạo đơn hàng.'); }
  if (soldOut) {
    if (delivery) return fail('Đơn giao hàng cần món đã hết.');
    day.customers++; state.stats.customers++; day.lost++; state.stats.lost++;
    if (walkRoll < .35) addReview(state, { id: `day-${state.day}-order-${state.nextOrderId++}`, name, reviewer: false }, walkStars, 'stockout', { self });
    notify(`${name} muốn ăn ${items.get(soldOut).shortName} nhưng tiệm đã hết, đành đi quán khác.`, 'bad', 'customerLeave');
    return { ok: false, message: `Hết ${items.get(soldOut).shortName}.`, walkedAway: true };
  }
  if (refused) {
    if (delivery) return fail('Khách app thấy giá cao nên thôi đặt.');
    day.priceLost++; priceNotice(state, 'Có khách xem giá món mình chọn thấy đắt, đành bỏ đi.');
    return { ok: false, message: 'Khách chê giá đắt.', priceWalk: true };
  }
  let patience = (66 + Math.min(levelInfo(state).level - 1, 8) * 4) * (1 + dishes.reduce((sum, dish) => sum + dish.toppings.length, 0) / dishes.length * .12) * (1 + (dishes.length - 1) * .65); for (const upgrade of UPGRADES) if (state.upgrades[upgrade.id] && upgrade.patienceMultiplier) patience *= upgrade.patienceMultiplier; if (state.decoration.selected.pet) patience *= 1.08; if (trait === 'hurried') patience *= .6; if (delivery) patience = (96 + Math.min(levelInfo(state).level - 1, 8) * 5) * (1 + dishes[0].toppings.length * .12); patience = Math.round(patience * 100) / 100;
  const order = { id: `day-${state.day}-order-${state.nextOrderId++}`, name, ...dishes[0], dishes, patience, maxPatience: patience, bowlsTotal: dishes.length, bowlsServed: 0, mistakes: 0, qualityPenalty: 0, delivery, reviewer: false, tea: false, trait, changed: false, tourist, self }; day.orders.push(order); day.recent = [...day.recent, dishes.flatMap(dish => [dish.broth, ...dish.toppings])].slice(-RECENT_ORDERS); day.customers++; state.stats.customers++; if (!day.selectedOrderId) day.selectedOrderId = order.id; return good(`${name} gọi mì ${items.get(order.broth).shortName}.`, { order });
}
export function createOrder(state, random = Math.random) { return createOrderFor(state, random, false); }
// A dine-in customer below 60% patience can be offered one iced tea: 3,000đ restores 35% of their patience.
export const TEA_COST = 3000;
export function teaEligible(order) { return !!order && !order.delivery && !order.tea && order.patience < order.maxPatience * .6; }
export function offerTea(state, id) {
  if (!operating(state)) return fail('Mở cửa trước nhé.');
  const order = state.activeDay.orders.find(row => row.id === id);
  if (!order || order.delivery) return fail('Chỉ mời trà khách ngồi tại quán.');
  if (order.tea) return fail('Khách đã được mời trà rồi.');
  if (!teaEligible(order)) return fail('Khách vẫn còn kiên nhẫn, chưa cần mời trà.');
  if (state.money < TEA_COST || !spend(state, TEA_COST)) return fail(`Cần ${formatMoney(TEA_COST)} để mời trà.`);
  order.tea = true; order.patience = Math.min(order.maxPatience, Math.round((order.patience + order.maxPatience * .35) * 100) / 100);
  return good(`${order.name} nhận ly trà đá, vui vẻ chờ thêm.`, { cost: TEA_COST });
}
export function selectOrder(state, id) { if (!state.activeDay?.orders.some(order => order.id === id)) return fail('Khách đã rời tiệm.'); state.activeDay.selectedOrderId = id; return good('Đã chọn đơn.'); }
function automateBowl(state) { const order = getSelectedOrder(state), bowl = state.activeDay?.bowl; if (!order || !bowl?.started) return; if (state.staff.broth && !bowl.broth && inventoryCount(state, order.broth)) { bowl.cost += consume(state, order.broth); bowl.broth = order.broth; } if (state.staff.topping && bowl.broth === order.broth && bowl.toppings.every(id => order.toppings.includes(id))) for (const id of order.toppings) if (!bowl.toppings.includes(id) && bowl.toppings.length < 4 && inventoryCount(state, id)) { bowl.cost += consume(state, id); bowl.toppings.push(id); } }
export function takeBowl(state) { if (!operating(state)) return fail('Mở cửa trước nhé.'); const day = state.activeDay; if (day.bowl.started) return fail('Giao món hoặc bỏ tô đang làm trước.'); const cost = consume(state, 'bowls'); if (cost === null) return fail('Hết tô. Nhập hàng khẩn cấp nhé.'); day.bowl = { ...emptyBowl(), started: true, cost }; automateBowl(state); return good('Đã lấy tô.'); }
export function addBroth(state, id) { if (!operating(state) || !state.activeDay.bowl.started) return fail('Lấy tô trước nhé.'); const bowl = state.activeDay.bowl; if (bowl.broth || items.get(id)?.kind !== 'broth') return fail('Nước dùng đã rót không thể thay thế.'); const cost = consume(state, id); if (cost === null) return fail('Hết nước dùng.'); bowl.broth = id; bowl.cost += cost; automateBowl(state); return good('Đã thêm nước dùng.'); }
export function addTopping(state, id) { if (!operating(state) || !state.activeDay.bowl.started) return fail('Lấy tô trước nhé.'); const bowl = state.activeDay.bowl; if (items.get(id)?.kind !== 'topping' || bowl.toppings.includes(id) || bowl.toppings.length >= 4) return fail('Topping không thể bỏ ra hoặc thêm trùng; tối đa 4 món.'); const cost = consume(state, id); if (cost === null) return fail('Topping đã hết.'); bowl.cost += cost; bowl.toppings.push(id); return good('Đã thêm topping.'); }
export function addChili(state) { if (!operating(state) || !state.activeDay.bowl.started) return fail('Lấy tô trước nhé.'); const bowl = state.activeDay.bowl; if (bowl.spice >= 7) return fail('Đã cay cấp 7.'); bowl.spice++; return good(`Cay cấp ${bowl.spice}.`); }
// Pots the chef starts are marked `auto`: the chef only ever collects those.
export function startPot(state, index = 0, auto = false) { if (!operating(state) || !int(index, potCount(state) - 1)) return fail('Nồi chưa sẵn sàng.'); if (state.activeDay.pots[index]) return fail('Nồi đang luộc mì.'); const cost = consume(state, 'noodles'); if (cost === null) return fail('Hết mì.'); state.activeDay.pots[index] = { elapsed: 0, duration: state.upgrades.stove ? 4.2 : 5.2, cost, auto }; return good('Đã bắt đầu luộc mì.'); }
export function collectBasket(state) { if (!operating(state) || !state.activeDay.bowl.started || state.activeDay.bowl.noodles || !state.activeDay.readyNoodles.length) return fail('Cần tô trống và mì chín trong rổ.'); const ready = state.activeDay.readyNoodles.shift(); state.activeDay.bowl.noodles = 'cooked'; state.activeDay.bowl.cost += ready.cost; return good('Đã lấy mì từ rổ phụ bếp.'); }
export function collectPot(state, index = 0) { if (!operating(state) || !int(index, potCount(state) - 1)) return fail('Nồi không hợp lệ.'); const day = state.activeDay, bowl = day.bowl; if (!bowl.started || bowl.noodles) return fail('Cần một tô chưa có mì.'); const pot = day.pots[index]; if (!pot) return fail('Nồi chưa có mì.'); const progress = pot.elapsed / pot.duration; bowl.noodles = progress < .5 ? 'raw' : progress <= .78 ? 'cooked' : 'soft'; bowl.cost += pot.cost; day.pots[index] = null; return good(bowl.noodles === 'cooked' ? 'Mì vừa chín tới!' : 'Mì chưa đạt độ chín lý tưởng.', { doneness: bowl.noodles }); }
function waste(state, amount) { state.activeDay.waste += amount; state.stats.waste += amount; }
export function discardBowl(state) { if (!operating(state) || !state.activeDay.bowl.started) return fail('Chưa có tô để bỏ.'); const amount = state.activeDay.bowl.cost; waste(state, amount); state.activeDay.bowl = emptyBowl(); return good('Đã bỏ tô; nguyên liệu không được hoàn lại.', { waste: amount }); }
// Goals pay out the moment they are completed; "nobody left unserved" resolves at closing.
function updateGoals(state) {
  if (!state.activeDay) return;
  for (const goal of state.goals) { goal.progress = Math.min(goal.target, state.activeDay[goal.metric] || 0); if (!goal.claimed && goal.progress >= goal.target && goal.metric !== 'noLost' && claimGoal(state, goal.id).ok) notify(`🎯 Hoàn thành “${goal.name}”: +${formatMoney(goal.rewardMoney)} · +${goal.rewardXp} XP`, 'good', 'goal'); }
}
// XP goes through one place so level-ups are noticed during service and shown next morning.
function gainXp(state, amount) {
  const before = levelInfo(state).level; state.xp = Math.min(1e9, state.xp + amount);
  if (state.activeDay) state.activeDay.xpGained = Math.min(1e9, state.activeDay.xpGained + amount);
  // Remember the lowest level not yet shown, so a day that jumps two levels shows both unlock cards.
  const after = levelInfo(state); if (after.level > before) { state.pendingLevelUp = Math.min(state.pendingLevelUp ?? before + 1, before + 1); notify(`🎉 Lên cấp ${after.level}: ${after.title}!`, 'good', 'levelUp'); }
}
export function acknowledgeLevelUp(state) { state.pendingLevelUp = null; return good(''); }
export function unlocksAt(level) { const at = rows => rows.filter(item => item.unlockLevel === level); return { ingredients: at(INGREDIENTS), upgrades: at(UPGRADES), staff: at(STAFF), decorations: at(DECORATIONS) }; }
// Reviews name their cause; the voice module writes the words. Each review's text is seeded by its id, so the
// game's random stream is untouched, and recent texts are avoided so the list does not repeat itself.
const REVIEW_LINES = { great: 'Mì nóng ngon, đúng món. Sẽ quay lại!', meh: 'Mì cần chỉn chu hơn về độ chín và thời gian chờ.' };
function reviewText(state, id, cause, stars, detail = {}) {
  try { const text = composeReview({ cause, stars, ...detail, random: seeded(hashText(`${id}|${cause}|${stars}`)), recent: state.reviews.slice(-12).map(review => review.text) }); if (typeof text === 'string' && text.trim() && text.length <= 1000) return text.trim(); } catch {}
  return stars >= 4 ? REVIEW_LINES.great : REVIEW_LINES.meh;
}
function refreshReputation(state) { const recent = state.reviews.slice(-30); state.reputation = recent.length ? Math.round(recent.reduce((sum, review) => sum + review.rating, 0) / recent.length * 100) / 100 : 4; }
// A reviewer writes three separate reviews: the extra copies get ids ending -2 and -3.
function addReview(state, order, rating, cause, detail = {}, copies = order.reviewer ? 3 : 1, first = 0) {
  let review = null;
  for (let copy = first; copy < first + copies; copy++) { const id = copy ? `${order.id}-${copy + 1}` : order.id; review = { id, day: state.day, name: order.name, rating, stars0: rating, cause, text: reviewText(state, id, cause, rating, detail), thread: [], xp: false }; state.reviews.push(review); }
  state.reviews = state.reviews.slice(-100); refreshReputation(state); return review;
}
function addStoryReview(state, stars, cause, name) { addReview(state, { id: `day-${state.day}-order-${state.nextOrderId++}`, name: name || 'Khách qua đường', reviewer: false }, stars, cause); }
// Revisions after an incident: a good outcome can only raise a review, a bad one only lower it.
function reviseRating(state, id, rating) { for (const review of state.reviews) if (review.id === id) review.rating = rating >= 4 ? Math.max(review.rating, rating) : Math.min(review.rating, rating); refreshReputation(state); }
function removeReview(state, id) { state.reviews = state.reviews.filter(review => review.id !== id); refreshReputation(state); }
function dropOrder(state, order) { const day = state.activeDay; day.orders = day.orders.filter(item => item.id !== order.id); if (day.noisyId === order.id) day.noisyId = null; if (day.selectedOrderId === order.id) day.selectedOrderId = day.orders.find(item => !item.delivery)?.id ?? day.orders[0]?.id ?? null; }
// Walkouts leave 1★ (70%) or 2★; an app order that times out gives 1★; a reviewer adds two more 1★.
// Guests still waiting at closing count as lost but write no review.
function loseOrder(state, order, { rating = null, cause = 'walkout' } = {}) {
  state.activeDay.lost++; state.stats.lost++; state.activeDay.combo = 0;
  if (rating) { addReview(state, order, rating, cause, { self: order.self }, 1); if (order.reviewer) addReview(state, order, 1, 'walkout', { self: order.self }, 2, 1); }
  dropOrder(state, order);
}
// Seated dine-in guests only. A penalty never drops a guest below min(current, 4 s), so no situation causes an instant walkout.
function nudgeWaiting(state, seconds) { for (const order of state.activeDay.orders) if (!order.delivery) order.patience = seconds < 0 ? Math.max(Math.min(order.patience, 4), order.patience + seconds) : Math.min(order.maxPatience, order.patience + seconds); }
// ---- Situations: payment incidents, haggling, street stories and stockouts share one pausing dialog.
// Payment incidents and stories share a daily cap (2 on days 1–3, then 3). Outcome rolls are drawn when a
// situation opens, so reloading cannot change the result.
const option = (id, label) => ({ id, label });
export const PAYMENT_INCIDENTS = Object.freeze(['dash', 'money', 'debt', 'hair']);
const situationCap = state => state.day < 4 ? 2 : 3;
const staffActive = state => Object.values(state.staff).some(Boolean);
function nextSituationId(state) { const day = state.activeDay; day.seq = Math.min(99, day.seq + 1); return `incident-${state.day}-${day.seq}`; }
function incidentOptions(incident) {
  const { type } = incident;
  if (type === 'dash') return [option('chase', 'Đuổi theo khách'), ...(incident.hasStaff ? [option('staffChase', 'Nhờ nhân viên đuổi theo')] : []), option('ignore', 'Chấp nhận mất tiền')];
  if (type === 'money') return incident.overpaid ? [option('return', 'Trả lại tiền thừa'), option('keep', 'Giữ tiền thừa')] : [option('remind', 'Nhắc khách trả đủ'), option('ignore', 'Bỏ qua khoản thiếu')];
  if (type === 'debt') return [option('allow', 'Cho khách ghi nợ'), option('decline', 'Từ chối ghi nợ')];
  if (type === 'hair') return [option('refund', 'Hoàn tiền và xin lỗi'), option('topup', 'Làm phần mới · 10.000đ'), option('argue', 'Giải thích với khách')];
  if (type === 'haggle') return [option('concede', `Bớt ${formatMoney(incident.cut)}`), option('hold', 'Giữ nguyên giá'), option('tea', `Mời trà, nói khéo · ${formatMoney(TEA_COST)}`)];
  if (type === 'story') return storyChoices(incident.story, { staff: incident.hasStaff });
  if (type === 'stockout') {
    const item = items.get(incident.item), rows = [];
    if (incident.buyer) rows.push(option('waitBuyer', 'Đợi người đi chợ về'));
    rows.push(option('rush', `Nhập gấp 5 phần ${item.shortName}`));
    if (incident.alternative) rows.push(option('offer', `Mời đổi sang ${items.get(incident.alternative).shortName}`));
    if (item.kind === 'topping') rows.push(option('drop', `Bỏ ${item.shortName}, bớt tiền`));
    rows.push(option('leave', 'Xin lỗi, mời khách về')); if (!incident.buyer) rows.push(option('later', 'Để sau'));
    return rows;
  }
  return [];
}
function queueIncident(state, order, tip, random) {
  const day = state.activeDay;
  if (state.day < 2 || order.delivery || order.reviewer || day.tutorial || day.pendingIncident || day.incidentCount >= situationCap(state) || day.elapsed - day.lastIncidentAt < 30) return null;
  const sample = () => { try { return rng(random); } catch { return .5; } };
  const chance = sample(), type = chance < .05 ? 'dash' : chance < .11 ? 'money' : chance < .14 ? 'debt' : chance < .17 ? 'hair' : null;
  if (!type) return null;
  if (state.staff.cashier && ['dash', 'money'].includes(type)) { day.lastIncidentAt = day.elapsed; notify(type === 'dash' ? `Thu ngân kịp giữ ${order.name} lại thanh toán đủ.` : `Thu ngân phát hiện ${order.name} đưa nhầm tiền và xử lý êm đẹp.`, 'good'); return null; }
  const overpaid = type === 'money' && sample() < .6, bill = order.dishes.reduce((sum, dish) => sum + dish.price, 0) + tip;
  const amount = type === 'money' ? pick(sample, overpaid ? [10000, 20000, 50000] : [5000, 10000]) : bill;
  const incident = { id: nextSituationId(state), type, name: order.name, reviewId: order.id, amount, bill, overpaid, hasStaff: staffActive(state), roll: sample(), collectionRoll: sample(), collectionTip: Math.floor(sample() * 3) * 5000 };
  incident.options = incidentOptions(incident); day.pendingIncident = incident;
  day.incidentCount++; day.lastIncidentAt = day.elapsed;
  return incident;
}
// A haggling guest asks for max(5,000, 15% of the bill) off after eating. It is not capped; within 12 s of
// another situation the owner simply agrees.
function queueHaggle(state, order, tip, random) {
  const day = state.activeDay; if (day.pendingIncident) return null;
  const bill = order.dishes.reduce((sum, dish) => sum + dish.price, 0) + tip, cut = Math.max(5000, Math.round(bill * .15 / 1000) * 1000);
  if (day.elapsed - day.lastIncidentAt < 12) { if (spend(state, cut)) { reviseRating(state, order.id, 5); day.buzz = clamp(day.buzz + .05, -.3, .6); notify(`${order.name} xin bớt ${formatMoney(cut)}, bạn vui vẻ chiều khách.`); } return null; }
  let roll; try { roll = rng(random); } catch { roll = .5; }
  const incident = { id: nextSituationId(state), type: 'haggle', name: order.name, reviewId: order.id, cut, bill, roll };
  incident.options = incidentOptions(incident); day.pendingIncident = incident; day.lastIncidentAt = day.elapsed;
  return incident;
}
function income(state, amount) {
  if (!int(amount, 1e12) || !cash(state.money + amount) || !int(state.stats.revenue + amount, 1e12) || state.activeDay && !int(state.activeDay.revenue + amount, 1e12)) return false;
  state.money += amount; state.stats.revenue += amount; if (state.activeDay) state.activeDay.revenue += amount; return true;
}
function storyEligible(state, id) {
  const day = state.activeDay, seated = day.orders.filter(order => !order.delivery).length, stock = key => inventoryCount(state, key);
  if (id === 'spill' || id === 'drunk') return seated > 0;
  if (id === 'rain') return day.event.id !== 'rain';
  if (id === 'tour') return seated < capacity(state);
  if (id === 'party') return stock('noodles') >= 4 && stock('bowls') >= 4 && availableIngredients(state).some(item => item.kind === 'broth' && stock(item.id) >= 4);
  if (id === 'celebrity') return state.day >= 5;
  if (id === 'sidewalk') return state.day >= 4;
  if (id === 'supplier') return availableIngredients(state).some(item => item.kind === 'topping' && stock(item.id) >= 4);
  return true;
}
// Opens a street story. The cat handles a rat and the waiter handles a spill without asking you.
function openStory(state, random, forced = null) {
  const day = state.activeDay, draw = () => { try { return rng(random); } catch { return .5; } };
  let pool = DAY_STORIES.filter(id => !day.storiesSeen.includes(id) && storyEligible(state, id));
  if (!pool.length && !forced) { day.storiesSeen = []; pool = DAY_STORIES.filter(id => storyEligible(state, id)); }
  const story = forced || pool[Math.floor(draw() * pool.length)] || 'gas';
  const seated = day.orders.filter(order => !order.delivery), target = ['spill', 'drunk', 'rat'].includes(story) && seated.length ? seated[Math.floor(draw() * seated.length)] : null;
  const rolls = [draw(), draw()];
  // The inspection follows from a dirty floor and does not use one of the day's situation slots.
  if (!STORIES[story].free) day.incidentCount = Math.min(6, day.incidentCount + 1); day.lastIncidentAt = day.elapsed; if (!forced && !day.storiesSeen.includes(story)) day.storiesSeen.push(story);
  if (story === 'rat' && state.decoration.selected.pet === 'pet_cat') { day.buzz = clamp(day.buzz + .05, -.3, .6); notify('Mèo của quán vồ ngay chú chuột chạy qua. Khách vỗ tay khen!', 'good'); return null; }
  if (story === 'spill' && state.staff.waiter) { notify(`${target?.name || 'Khách'} làm đổ nước lèo, nhân viên chạy bàn lau sạch ngay.`, 'good'); return null; }
  const broth = story === 'party' ? availableIngredients(state).find(item => item.kind === 'broth' && inventoryCount(state, item.id) >= 4)?.id ?? null : null;
  const toppings = story === 'supplier' ? availableIngredients(state).filter(item => item.kind === 'topping' && inventoryCount(state, item.id) >= 4) : [];
  const topping = toppings.length ? toppings[Math.floor(rolls[1] * toppings.length)].id : null;
  const bulk = broth ? Math.min(6, inventoryCount(state, broth), inventoryCount(state, 'noodles'), inventoryCount(state, 'bowls')) : 0;
  const incident = { id: nextSituationId(state), type: 'story', story, name: target?.name ?? '', targetId: target?.id ?? null, hasStaff: staffActive(state), rolls, broth, topping, bulk };
  incident.options = incidentOptions(incident); day.pendingIncident = incident;
  return incident;
}
// Opens a named story right now; the day's scheduler normally picks one. Used by tests.
export function forceStory(state, id, random = Math.random) { if (!operating(state) || state.activeDay.pendingIncident || state.activeDay.tutorial || !Object.hasOwn(STORIES, id)) return fail('Không thể mở tình huống lúc này.'); const incident = openStory(state, random, id); return good(incident ? '' : 'Tình huống đã tự được xử lý.', { incident }); }
export function storyText(incident) { const story = Object.hasOwn(STORIES, incident?.story ?? '') ? STORIES[incident.story] : null; return story ? story.text({ target: incident.name, bulk: incident.bulk, toppingName: incident.topping ? items.get(incident.topping).shortName : '' }) : ''; }
function resolveStory(state, incident, action, random) {
  const day = state.activeDay, target = day.orders.find(order => order.id === incident.targetId) || null;
  const fx = storyOutcome(incident.story, action, { rolls: incident.rolls, seated: day.orders.filter(order => !order.delivery).length, bulk: incident.bulk });
  if (!fx) return fail('Cách xử lý không hợp lệ.');
  if (fx.money < 0 && !spend(state, -fx.money) || fx.money > 0 && !income(state, fx.money)) return fail('Đã đạt giới hạn tiền.');
  day.pendingIncident = null;
  if (fx.buzz) day.buzz = clamp(day.buzz + fx.buzz, -.3, .6);
  if (fx.buzzNext) state.buzzNext = clamp(state.buzzNext + fx.buzzNext, 0, .5);
  if (fx.waiting) nudgeWaiting(state, fx.waiting);
  if (fx.slow) day.slowUntil = Math.min(320, Math.max(day.slowUntil, day.elapsed + fx.slow));
  if (fx.dirty === true && !day.dirty) day.dirty = { since: day.elapsed, taps: 0 }; else if (fx.dirty === false) day.dirty = null;
  if (fx.review) addStoryReview(state, fx.review.stars, fx.review.cause, target?.name);
  if (target && fx.targetLeaves) { day.lost++; state.stats.lost++; day.combo = 0; dropOrder(state, target); }
  if (target && fx.targetCalm) target.patience = target.maxPatience;
  if (target && fx.noisy) day.noisyId = target.id;
  if (fx.spoil && incident.topping) for (let i = 0; i < fx.spoil; i++) { const cost = consume(state, incident.topping); if (cost === null) break; waste(state, cost); }
  if (fx.bulk && incident.broth) { let made = 0; while (made < fx.bulk && inventoryCount(state, incident.broth) && inventoryCount(state, 'noodles') && inventoryCount(state, 'bowls')) { consume(state, incident.broth); consume(state, 'noodles'); consume(state, 'bowls'); made++; } if (made) income(state, made * state.prices[incident.broth]); }
  // Promised guests only count if they get a table; a full shop (or a guest who leaves at once) says so honestly.
  let arrived = 0; for (let i = 0; i < (fx.arrivals || 0); i++) if (createOrderFor(state, random, false).ok) arrived++;
  for (let i = 0; i < (fx.tourists || 0); i++) if (createOrderFor(state, random, false, { tourist: true }).ok) arrived++;
  if ((fx.arrivals || fx.tourists) && !arrived) return good(capacity(state) <= day.orders.filter(order => !order.delivery).length ? 'Quán đang kín bàn nên chưa ai vào được, nhưng người ta vẫn nhớ tên quán.' : 'Khách ghé xem rồi lại đi, chưa ai ngồi xuống.', { tone: 'neutral' });
  return good(fx.text, { tone: fx.tone });
}
function resolveHaggle(state, incident, action) {
  const day = state.activeDay; let expense = 0, rating = null, message, tone = 'neutral';
  if (action === 'concede') { expense = incident.cut; rating = 5; day.buzz = clamp(day.buzz + .05, -.3, .6); message = `${incident.name} vui vẻ cảm ơn vì được bớt ${formatMoney(incident.cut)}.`; tone = 'good'; }
  else if (action === 'hold') { if (incident.roll < .6) message = `${incident.name} gật gù trả đủ tiền.`; else { rating = 3; message = `${incident.name} hơi phật ý vì không được bớt.`; tone = 'bad'; } }
  else { expense = TEA_COST; if (incident.roll < .8) { message = `Ly trà làm ${incident.name} vui, khách trả đủ tiền.`; tone = 'good'; } else { const half = Math.round(incident.cut / 2 / 1000) * 1000; expense += half; message = `Khách vẫn xin bớt, bạn giảm thêm ${formatMoney(half)}.`; } }
  if (expense && !spend(state, expense)) return fail('Đã đạt giới hạn tiền.');
  if (rating !== null) reviseRating(state, incident.reviewId, rating);
  day.pendingIncident = null; return good(message, { tone, expense });
}
// First ingredient the order still lacks and the shop cannot supply: bowls, noodles (in stock, basket
// or pots), the broth, or a topping not yet in the bowl.
export function missingFor(state, order) {
  const day = state.activeDay; if (!day || !order) return null; const bowl = day.bowl;
  if (!bowl.started && !inventoryCount(state, 'bowls')) return 'bowls';
  if (!bowl.noodles && !inventoryCount(state, 'noodles') && !day.readyNoodles.length && !day.pots.some(Boolean)) return 'noodles';
  if (bowl.broth !== order.broth && !inventoryCount(state, order.broth)) return order.broth;
  return order.toppings.find(id => !bowl.toppings.includes(id) && !inventoryCount(state, id)) ?? null;
}
export function openStockout(state, orderId, random = Math.random) {
  if (!operating(state)) return fail('Tiệm chưa mở.'); const day = state.activeDay; if (day.pendingIncident) return fail('Đang xử lý một tình huống khác.'); if (day.tutorial) return fail('Làm xong tô hướng dẫn trước đã.');
  const order = day.orders.find(row => row.id === orderId) || getSelectedOrder(state); if (!order) return fail('Chưa có đơn đang chờ.');
  const item = missingFor(state, order); if (!item) return fail('Đơn này vẫn đủ nguyên liệu.');
  const kind = items.get(item).kind, used = kind === 'topping' ? order.toppings : [order.broth];
  const alternatives = ['broth', 'topping'].includes(kind) ? availableIngredients(state).filter(row => row.kind === kind && inventoryCount(state, row.id) && !used.includes(row.id)) : [];
  let roll, reviewRoll, altRoll; try { roll = rng(random); reviewRoll = rng(random); altRoll = rng(random); } catch { return fail('Không thể xử lý lúc này.'); }
  const incident = { id: nextSituationId(state), type: 'stockout', name: order.name, orderId: order.id, item, alternative: alternatives.length ? alternatives[Math.floor(altRoll * alternatives.length)].id : null, buyer: day.buyerRuns[item] !== undefined, roll, reviewRoll };
  incident.options = incidentOptions(incident); day.pendingIncident = incident;
  return good('', { incident });
}
function replaceInOrder(state, order, from, to) {
  const dish = order.dishes[order.bowlsServed];
  if (items.get(from).kind === 'broth') dish.broth = to; else dish.toppings = to ? dish.toppings.map(id => id === from ? to : id) : dish.toppings.filter(id => id !== from);
  dish.price = priceFor(state, dish.broth, dish.toppings); Object.assign(order, { broth: dish.broth, toppings: [...dish.toppings], price: dish.price });
}
// An accepted change costs no stars. A refused offer or asking the guest to leave loses them, with a
// 30% chance of a 2–3★ review.
function resolveStockoutChoice(state, incident, action) {
  const day = state.activeDay, order = day.orders.find(row => row.id === incident.orderId), item = items.get(incident.item);
  if (action === 'rush') { const result = buyCart(state, { [incident.item]: 5 }, { rush: true }); if (!result.ok) return result; day.pendingIncident = null; return good(`Đã nhập gấp 5 phần ${item.shortName}.`, { tone: 'good' }); }
  day.pendingIncident = null;
  if (action === 'waitBuyer') return good(`Người đi chợ sẽ về sau khoảng ${Math.ceil(day.buyerRuns[incident.item] ?? 0)} giây.`);
  if (action === 'later') return good('Để xử lý sau.');
  if (!order) return good('Khách đã rời đi.');
  const leave = text => { day.lost++; state.stats.lost++; day.combo = 0; if (incident.reviewRoll < .3) addReview(state, order, incident.reviewRoll < .15 ? 2 : 3, 'stockout', { self: order.self }); dropOrder(state, order); return good(text, { tone: 'bad' }); };
  if (action === 'leave') return leave(`${order.name} thông cảm ra về.`);
  if (action === 'offer') { if (incident.roll >= .75) return leave(`${order.name} không muốn đổi món và rời quán.`); replaceInOrder(state, order, incident.item, incident.alternative); return good(`${order.name} đồng ý đổi sang ${items.get(incident.alternative).shortName}.`, { tone: 'good' }); }
  if (action === 'drop') { replaceInOrder(state, order, incident.item, null); return good(`Đã bỏ ${item.shortName} khỏi món, giá giảm tương ứng.`); }
  return fail('Cách xử lý không hợp lệ.');
}
export function resolveIncident(state, action, random = Math.random) {
  const day = state.activeDay, incident = day?.pendingIncident;
  if (!incident || !incident.options.some(option => option.id === action)) return fail('Cách xử lý không hợp lệ.');
  if (incident.type === 'story') return resolveStory(state, incident, action, random);
  if (incident.type === 'stockout') return resolveStockoutChoice(state, incident, action);
  if (incident.type === 'haggle') return resolveHaggle(state, incident, action);
  let expense = 0, bonus = 0, rating = null, removed = false, message = 'Đã xử lý tình huống.', tone = 'neutral';
  if (incident.type === 'dash') {
    const success = action !== 'ignore' && incident.roll < (action === 'staffChase' ? .85 : .65);
    expense = success ? 0 : incident.bill; removed = !success; tone = success ? 'good' : 'bad';
    message = success ? `Đã giữ ${incident.name} lại, khách ngại ngùng trả đủ tiền.` : action === 'ignore' ? `Bạn cho qua, quán mất ${formatMoney(incident.bill)}.` : `Không đuổi kịp. Quán mất ${formatMoney(incident.bill)}.`;
  } else if (incident.type === 'money') {
    if (incident.overpaid) { if (action === 'return') { rating = 5; tone = 'good'; message = `${incident.name} cảm động vì quán trả lại tiền thừa.`; } else if (incident.roll < .7) { bonus = incident.amount; message = `Giữ được ${formatMoney(incident.amount)} tiền thừa.`; } else { rating = 1; tone = 'bad'; message = `${incident.name} quay lại đòi tiền thừa và rất bực.`; } }
    else if (action === 'ignore') { expense = incident.amount; message = `Bỏ qua khoản thiếu ${formatMoney(incident.amount)}.`; }
    else if (incident.roll < .75) { tone = 'good'; message = `${incident.name} xin lỗi và trả đủ tiền.`; }
    else { expense = incident.amount; rating = 3; tone = 'bad'; message = `${incident.name} ngượng ngùng bỏ đi, quán thiếu ${formatMoney(incident.amount)}.`; }
  } else if (incident.type === 'debt') {
    if (action === 'allow') { expense = incident.bill; message = `Đã ghi nợ ${formatMoney(incident.bill)} cho ${incident.name}. Sáng mai sẽ biết khách có quay lại trả không.`; }
    else if (incident.roll < .5) { tone = 'good'; message = `Bạn của ${incident.name} trả giúp tiền.`; }
    else { expense = incident.bill; rating = 2; tone = 'bad'; message = `${incident.name} bỏ đi, quán mất ${formatMoney(incident.bill)}.`; }
  } else {
    if (action === 'refund') { expense = incident.bill; message = 'Đã hoàn tiền và xin lỗi khách.'; }
    if (action === 'topup') { expense = 10000; if (incident.roll >= .7) { rating = 2; tone = 'bad'; message = 'Khách vẫn chưa hài lòng.'; } else { tone = 'good'; message = 'Tô mới làm khách vui trở lại.'; } }
    if (action === 'argue') { if (incident.roll >= .45) { rating = 1; tone = 'bad'; message = 'Khách giận dữ bỏ đi và chê quán.'; } else { tone = 'good'; message = 'Khách chấp nhận lời giải thích.'; } }
  }
  if (expense && !spend(state, expense) || bonus && !income(state, bonus)) return fail('Đã đạt giới hạn tiền.');
  if (removed) removeReview(state, incident.reviewId); else if (rating !== null) reviseRating(state, incident.reviewId, rating);
  if (incident.type === 'dash' && action === 'chase') nudgeWaiting(state, -6);
  if (incident.type === 'dash' && action === 'staffChase') day.slowUntil = Math.min(320, Math.max(day.slowUntil, day.elapsed + 12));
  if (incident.type === 'money' && incident.overpaid && action === 'return') day.buzz = clamp(day.buzz + .08, -.3, .6);
  if (incident.type === 'hair' && action === 'argue' && rating === 1) day.buzz = clamp(day.buzz - .1, -.3, .6);
  if (incident.type === 'debt' && action === 'allow') state.receivables.push({ id: incident.id, name: incident.name, amount: incident.bill, dueDay: state.day + 1, roll: incident.collectionRoll, tip: incident.collectionTip });
  day.pendingIncident = null;
  return good(message, { expense, bonus, rating, tone });
}
export function serveBowl(state, random = Math.random) {
  if (!operating(state)) return fail('Tiệm chưa mở.'); const day = state.activeDay, bowl = day.bowl; if (day.pendingIncident) return fail('Xử lý tình huống trước nhé.'); if (!bowl.started || !bowl.broth || !bowl.noodles) return fail('Tô cần nước dùng và mì trước khi giao.'); if (!day.orders.length) return fail('Chưa có khách đang đợi.');
  const selected = getSelectedOrder(state), candidates = [selected, ...day.orders.filter(item => item !== selected)];
  const matches = dish => dish.broth === bowl.broth && dish.spice === bowl.spice && dish.toppings.length === bowl.toppings.length && dish.toppings.every(id => bowl.toppings.includes(id));
  const order = candidates.find(item => item.dishes.slice(item.bowlsServed).some(matches));
  if (!order) { if (state.stats.mistakes >= 1e9 || day.mistakes >= 1e9) return fail('Đã đạt giới hạn bản lưu.'); const selected = getSelectedOrder(state); if (selected) { selected.mistakes++; selected.patience = Math.max(.5, selected.patience - selected.maxPatience * .3); } day.mistakes++; state.stats.mistakes++; day.combo = 0; const discarded = discardBowl(state); return { ok: false, message: 'Sai món: khách mất kiên nhẫn, tô mì đã bị bỏ.', discarded: true, waste: discarded.waste }; }
  let roll; try { roll = rng(random); } catch { return fail('Không thể tính lượt phục vụ.'); }
  const matchIndex = order.dishes.findIndex((dish, index) => index >= order.bowlsServed && matches(dish)), dish = order.dishes[matchIndex], quality = bowl.noodles === 'cooked' ? 0 : 1, final = order.bowlsServed + 1 === order.bowlsTotal, tolerance = state.upgrades.menu ? 1.2 : 1;
  const expensive = order.dishes.some(part => [part.broth, ...part.toppings].some(id => tooExpensive(state, id)));
  const priceRatio = order.dishes.reduce((sum, part) => sum + part.price, 0) / order.dishes.reduce((sum, part) => sum + items.get(part.broth).sellPrice + part.toppings.reduce((total, id) => total + items.get(id).sellPrice, 0), 0), used = 1 - order.patience / order.maxPatience;
  let rating = clamp(5 - (used > .5 ? 1 : 0) - (used > .82 ? 1 : 0) - (quality || order.qualityPenalty > 0 ? 1 : 0) - (expensive ? 1 : 0) - Math.min(2, order.mistakes) - (roll < .1 ? 1 : 0), 1, 5); if (!expensive && priceRatio < .88) rating = Math.min(5, rating + 1);
  const secret = secretBroth(state), secretBowls = secret ? order.dishes.filter(part => part.broth === secret).length : 0; if (secretBowls) rating = Math.min(5, rating + 1);
  let tip = !final || order.delivery ? 0 : Math.round(order.patience / order.maxPatience * 4) * 1000 * order.bowlsTotal;
  if (day.event.id === 'challenge' && order.dishes.some(part => part.spice === 7)) tip *= 2;
  if (order.tourist) tip *= 2;
  if (state.upgrades.tipjar) tip = Math.round(tip * 1.5 / 1000) * 1000;
  // The lucky cat has its own 25% chance, independent of the random star penalty.
  if (final && !order.delivery && rating >= 4) { if (state.upgrades.bowlset) tip += 3000 * order.bowlsTotal; if (state.upgrades.luckycat) { let luck = 1; try { luck = rng(random); } catch {} if (luck < .25) tip += 5000 * order.bowlsTotal; } }
  if (final && !order.delivery) tip += 2000 * secretBowls;
  if (day.event.id === 'payday') tip *= 2;
  const fee = order.delivery ? Math.round(dish.price * .2) : 0, earned = dish.price - fee + tip;
  if (!cash(state.money + earned) || !int(state.stats.revenue + earned, 1e12) || !int(day.revenue + earned, 1e12) || !int(state.stats.tips + tip, 1e12) || state.stats.served >= 1e9) return fail('Đã đạt giới hạn bản lưu.');
  state.money += earned; gainXp(state, 10); day.served++; if (!order.delivery) day.dineInServed++; if (dish.spice >= 5) day.spicy++; if (final && order.delivery) day.deliveries++; state.stats.served++; day.revenue += earned; state.stats.revenue += earned; day.tips += tip; state.stats.tips += tip; if (bowl.noodles === 'cooked') day.ideal++;
  if (final) { if (rating === 5) { day.combo++; day.maxCombo = Math.max(day.maxCombo, day.combo); } else day.combo = 0; }
  [order.dishes[order.bowlsServed], order.dishes[matchIndex]] = [order.dishes[matchIndex], order.dishes[order.bowlsServed]];
  order.qualityPenalty += quality; order.bowlsServed++; let review = null;
  if (order.bowlsServed >= order.bowlsTotal) {
    if (rating === 5) { day.perfect++; state.stats.perfect++; }
    gainXp(state, (rating === 5 ? 8 : rating === 4 ? 4 : 0) * (order.reviewer ? 2 : 1));
    // The review names its main reason: a mistake, the noodles, the price, the wait, or simply how good it was.
    const cause = rating >= 4 ? (order.delivery ? 'app-great' : secretBowls ? 'secret' : !expensive && priceRatio < .88 ? 'cheap' : rating === 5 ? 'great' : 'ok') : order.mistakes ? 'wrong' : quality || order.qualityPenalty > 0 ? 'noodle' : expensive ? 'pricey' : used > .5 ? 'wait' : 'meh';
    review = addReview(state, order, rating, cause, { dish: items.get(dish.broth).name, topping: dish.toppings[0] ? items.get(dish.toppings[0]).shortName : '', spice: dish.spice, self: order.self });
    dropOrder(state, order);
  } else Object.assign(order, order.dishes[order.bowlsServed]);
  day.bowl = emptyBowl(); updateGoals(state);
  const incident = final ? (order.trait === 'haggler' && !order.delivery ? queueHaggle(state, order, tip, random) : queueIncident(state, order, tip, random)) : null;
  // Serving the coached first bowl ends the tutorial; the real day starts now.
  let tutorialDone = false; if (day.tutorial) { day.tutorial = false; state.tutorialDone = true; tutorialDone = true; }
  return good(`Giao đúng món! +${formatMoney(earned)}`, { earned, tip, fee, rating, review, orderId: order.id, incident, tutorialDone });
}

export function claimGoal(state, id) {
  const goal = state.goals.find(item => item.id === id);
  if (!goal || goal.claimed || goal.progress < goal.target) return fail('Mục tiêu chưa hoàn thành hoặc đã nhận.');
  if (!cash(state.money + goal.rewardMoney) || !int(state.stats.rewards + goal.rewardMoney, 1e12)) return fail('Đã đạt giới hạn tiền.');
  goal.claimed = true; state.money += goal.rewardMoney; state.stats.rewards += goal.rewardMoney; gainXp(state, goal.rewardXp); if (state.activeDay) state.activeDay.goalRewards = (state.activeDay.goalRewards || 0) + goal.rewardMoney;
  return good(`Hoàn thành mục tiêu! +${formatMoney(goal.rewardMoney)}`, { rewardMoney: goal.rewardMoney, rewardXp: goal.rewardXp });
}
function minimumRestock(state) { const broth = availableIngredients(state).filter(item => item.kind === 'broth').sort((a, b) => a.price - b.price)[0]; return ['bowls', 'noodles', broth.id].reduce((sum, id) => sum + (inventoryCount(state, id) ? 0 : items.get(id).price * 5), 0); }
export function takeLoan(state) {
  if (state.loansTaken >= 2) return fail('Đã dùng hai khoản vay. Bạn có thể xuất bản lưu và mở tiệm mới.');
  const principal = Math.min(1000000, Math.max(state.loansTaken ? 400000 : 300000, Math.ceil((minimumRestock(state) + 150000 - state.money) / 50000) * 50000));
  const interest = Math.round(principal * .1);
  if (!cash(state.money + principal) || !int(state.debt + principal + interest, 1e12) || !int(state.stats.borrowed + principal, 1e12) || !int(state.loanInterest + interest, 1e12)) return fail('Đã đạt giới hạn tiền.');
  state.money += principal; state.stats.borrowed += principal; state.debt += principal + interest; state.loanInterest += interest; state.loansTaken++; state.loanInstallment = Math.ceil(state.debt / 6 / 1000) * 1000;
  state.insolvent = state.money < minimumRestock(state);
  return good(`Đã vay ${formatMoney(principal)}. Lãi 10%, trả trong 6 đêm.`, { principal, interest, installment: state.loanInstallment });
}
export function repayLoan(state, amount) {
  if (!int(amount, 1e12, 1) || amount > state.debt || amount > Math.max(0, state.money)) return fail('Số tiền trả nợ không hợp lệ.');
  const interest = Math.min(state.loanInterest, Math.round(state.loanInterest * amount / state.debt)), principal = amount - interest;
  const expenseBase = state.activeDay ? state.activeDay.expenses : state.pendingExpenses;
  if (!int(state.stats.expenses + interest, 1e12) || !int(expenseBase + interest, 1e12) || !int(state.stats.repaid + principal, 1e12) || !cash(state.money - amount)) return fail('Đã đạt giới hạn tiền.');
  state.money -= principal; spend(state, interest); state.debt -= amount; state.loanInterest -= interest; state.stats.repaid += principal; if (!state.debt) state.loanInstallment = 0;
  return good(`Đã trả nợ ${formatMoney(amount)}.`, { amount, principal, interest });
}
// Owner replies: within two days of the review, at most two messages of 120 characters, each answered by the
// guest. A rude reply costs a star; otherwise a review under 4★ rises one star 60% of the time after a polite
// reply (25% after a neutral one), never above its first rating + 2. The first polite reply to a 4–5★ review earns 2 XP.
export const REPLY_LIMIT = 120;
export function canReply(state, review) { return !!review && state.day - review.day <= 2 && review.thread.filter(entry => entry.from === 'owner').length < 2; }
export function replyReview(state, id, text, random = Math.random) {
  const review = state.reviews.find(item => item.id === id), message = typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : '';
  if (!review) return fail('Không tìm thấy đánh giá này.');
  if (!message || message.length > REPLY_LIMIT) return fail(`Viết lời hồi đáp từ 1–${REPLY_LIMIT} ký tự.`);
  if (state.day - review.day > 2) return fail('Chỉ trả lời được đánh giá trong hai ngày gần nhất.');
  if (!canReply(state, review)) return fail('Mỗi đánh giá chỉ trả lời tối đa hai lần.');
  let roll, answer; try { roll = rng(random); answer = seeded(Math.floor(rng(random) * 4294967296)); } catch { return fail('Không thể gửi lúc này.'); }
  const tone = replyTone(message), before = review.rating;
  if (tone === 'rude') review.rating = Math.max(1, review.rating - 1);
  else if (review.rating < 4 && roll < (tone === 'polite' ? .6 : .25)) review.rating = Math.min(5, review.stars0 + 2, review.rating + 1);
  let xp = 0; if (tone === 'polite' && before >= 4 && !review.xp) { review.xp = true; xp = 2; gainXp(state, 2); }
  review.thread.push({ from: 'owner', text: message }, { from: 'guest', text: customerAnswer({ tone, stars: review.rating, random: answer }) });
  refreshReputation(state);
  const change = review.rating - before;
  return good(change > 0 ? `${review.name} nâng lên ${review.rating}★ sau lời hồi đáp.` : change < 0 ? `${review.name} phật ý, hạ xuống ${review.rating}★.` : 'Đã gửi lời hồi đáp.', { replyTone: tone, before, rating: review.rating, xp, tone: change > 0 ? 'good' : change < 0 ? 'bad' : 'neutral' });
}
// Three quick taps clean a dirty floor.
export function mopFloor(state) {
  const day = state.activeDay; if (!operating(state) || !day.dirty) return fail('Sàn đang sạch.');
  if (day.pendingIncident) return fail('Xử lý tình huống trước nhé.');
  day.dirty.taps++; if (day.dirty.taps < 3) return good(`Lau thêm ${3 - day.dirty.taps} lần nữa.`, { taps: day.dirty.taps });
  day.dirty = null; return good('Sàn quán sạch bóng trở lại!', { tone: 'good', clean: true });
}
// Cash has run dry: while insolvent the shop cannot open until a loan or a new shop.
export function solvency(state) { const needed = minimumRestock(state); return { insolvent: state.money < needed, needed, loansLeft: 2 - state.loansTaken }; }
// A fresh start keeps the shop name and settings; the tutorial is not repeated.
export function newShopFrom(state) { const next = createGame(state.name); next.settings = { ...state.settings }; return next; }
function traffic(state, includeTime = true, day = state.activeDay) {
  const rep = (.6 + (state.reputation - 1) / 4 * .8) * (state.reputation < 4 ? .65 : 1);
  let bonus = Math.min(state.day, 30) * .015 + Math.min(.2, Math.max(0, state.decoration.owned.length - 1) * .02);
  for (const upgrade of UPGRADES) if (state.upgrades[upgrade.id]) bonus += (upgrade.trafficBonus || 0) + (day.elapsed > DAY_DURATION * .55 ? upgrade.eveningTrafficBonus || 0 : 0);
  const broths = availableIngredients(state).filter(item => item.kind === 'broth'), ratio = clamp(broths.reduce((sum, item) => sum + state.prices[item.id] / item.sellPrice, 0) / broths.length / (state.upgrades.menu ? 1.2 : 1), .85, 1.6);
  const fraction = day.elapsed / DAY_DURATION, time = fraction < .08 ? .8 : fraction < .28 ? 1.45 : fraction < .5 ? .6 : fraction < .78 ? 1.4 : .8;
  return Math.max(.1, rep * (1 + bonus) * Math.min(1, .65 + state.day * .1) * day.event.traffic * clamp(1 + day.buzz, .7, 1.6) * (day.dirty ? .75 : 1) / ratio ** 2 * (includeTime ? time : 1));
}
// The chef keeps up to min(3, bowls still owed) portions cooking or ready, and collects only its own pots.
function chefWork(state, dt) {
  const day = state.activeDay;
  day.chefCooldown = Math.max(0, day.chefCooldown - dt);
  if (!state.staff.chef) return;
  const needed = Math.min(3, Math.max(0, day.orders.reduce((sum, order) => sum + order.bowlsTotal - order.bowlsServed, 0) - (day.bowl.noodles ? 1 : 0)));
  for (let i = 0; i < day.pots.length; i++) {
    const pot = day.pots[i];
    if (pot?.auto && pot.elapsed >= pot.duration * .64 && day.readyNoodles.length < 3) { day.readyNoodles.push({ cost: pot.cost }); day.pots[i] = null; }
    if (day.chefCooldown <= 0 && !day.pots[i] && day.readyNoodles.length + day.pots.filter(Boolean).length < needed && inventoryCount(state, 'noodles')) { startPot(state, i, true); day.chefCooldown = .8; }
  }
}
function buyerWork(state, dt) {
  const day = state.activeDay;
  for (const [id, remaining] of Object.entries(day.buyerRuns)) {
    if (remaining - dt > 0) { day.buyerRuns[id] = remaining - dt; continue; }
    delete day.buyerRuns[id];
    const item = items.get(id), unit = unitCost(state, item), total = unit * 5;
    if (state.money >= total && int(state.stats.waste + wasteReserve(state) + total, 1e12) && spend(state, total)) { state.batches[id].push({ qty: 5, expiresDay: item.expiryDays === null ? null : state.day + item.expiryDays - 1, cost: unit }); state.inventory[id] += 5; notify(`Người đi chợ đã về với 5 phần ${item.shortName}.`, 'good', 'coin'); }
    else notify(`Không đủ tiền mua ${item.shortName}, người đi chợ về tay không.`, 'bad');
  }
}
function automation(state, dt) { chefWork(state, dt); automateBowl(state); buyerWork(state, dt); }
function tickPots(state, dt) {
  const day = state.activeDay;
  for (let i = 0; i < day.pots.length; i++) { const pot = day.pots[i]; if (!pot) continue; pot.elapsed += dt * (day.elapsed < day.slowUntil ? .65 : 1); if (pot.elapsed + 1e-9 >= pot.duration) { waste(state, pot.cost); day.pots[i] = null; notify(`Mì ở nồi ${i + 1} luộc quá lâu, nhũn hết phải bỏ.`, 'bad', 'potBurn'); } }
}
// A fickle guest changes their spice level once, the first time patience drops below 70%.
function changeSpice(state, order, random) {
  order.changed = true; const top = levelInfo(state).level < 3 ? 3 : 7; let spice = Math.floor(random() * top); if (spice >= order.spice) spice++;
  order.spice = Math.min(top, spice); order.dishes[order.bowlsServed].spice = order.spice;
  notify(`${order.name} đổi ý: giờ muốn cay cấp ${order.spice}!`);
}
function bookMorning(state, amount) { if (!int(amount, 1e12) || !cash(state.money + amount) || !int(state.stats.revenue + amount, 1e12) || !int(state.pendingIncome + amount, 1e12)) return false; state.money += amount; state.stats.revenue += amount; state.pendingIncome += amount; return true; }
export function dismissMorning(state) { state.morning = []; return good(''); }
function settle(state) {
  const day = state.activeDay;
  if (!day) return state.lastDay ? good('Ngày đã tổng kết.', { alreadyFinished: true, summary: state.lastDay }) : fail('Chưa có ngày để tổng kết.');
  if (day.pendingIncident) return fail('Xử lý tình huống trước khi chốt sổ.');
  const costs = dailyOperatingCost(state);
  if (!cash(state.money - costs.total) || !int(state.stats.expenses + costs.total, 1e12) || !int(day.expenses + costs.total, 1e12) || state.day >= 999999) return fail('Đã đạt giới hạn bản lưu.');
  for (const order of [...day.orders]) loseOrder(state, order);
  if (day.bowl.started) discardBowl(state);
  for (const pot of day.pots) if (pot) waste(state, pot.cost);
  for (const ready of day.readyNoodles) waste(state, ready.cost);
  if (day.dirty) addStoryReview(state, 2, 'dirty');
  let spoiled = 0;
  for (const item of INGREDIENTS) { const expired = state.batches[item.id].filter(batch => batch.expiresDay !== null && batch.expiresDay <= state.day); for (const batch of expired) { spoiled += batch.qty * batch.cost; state.inventory[item.id] -= batch.qty; } state.batches[item.id] = state.batches[item.id].filter(batch => batch.expiresDay === null || batch.expiresDay > state.day); }
  waste(state, spoiled); spend(state, costs.total); day.noLost = day.lost === 0 && day.served > 0 ? 1 : 0; updateGoals(state);
  for (const goal of state.goals) if (!goal.claimed && goal.progress >= goal.target) claimGoal(state, goal.id);
  const goalRewards = day.goalRewards || 0;
  const repayment = Math.min(state.debt, state.loanInstallment, Math.max(0, state.money)), payment = repayment ? repayLoan(state, repayment) : { principal: 0, interest: 0 };
  // Credit is settled overnight and shown as morning notes; the money counts toward tomorrow.
  const morning = []; let debtRecovered = 0;
  for (const receivable of state.receivables) if (receivable.dueDay <= state.day + 1) {
    if (receivable.roll < .75) { const amount = receivable.amount + receivable.tip; if (bookMorning(state, amount)) { debtRecovered += amount; morning.push({ kind: 'debtPaid', name: receivable.name, amount }); } }
    else morning.push({ kind: 'debtLost', name: receivable.name, amount: receivable.amount });
  }
  state.receivables = state.receivables.filter(receivable => receivable.dueDay > state.day + 1);
  // From day 3, a solvent night has a 12% chance of a small windfall (a neighbour's thanks, a lucky ticket...).
  const luck = seeded(Math.imul(state.day, 104729) + state.stats.served * 7 + state.stats.customers);
  if (state.day >= 3 && state.money >= 0 && luck() < .12) { const variant = Math.floor(luck() * 3), amount = variant < 2 ? 50000 + Math.floor(luck() * 11) * 5000 : 20000 + Math.floor(luck() * 5) * 5000; if (bookMorning(state, amount)) morning.push({ kind: 'gift', variant, amount }); }
  const summary = { day: state.day, served: day.served, dineInServed: day.dineInServed, perfect: day.perfect, customers: day.customers, lost: day.lost, priceLost: day.priceLost, revenue: day.revenue, expenses: day.expenses, profit: day.revenue + goalRewards - day.expenses, tips: day.tips, waste: day.waste, spoiled, mistakes: day.mistakes, maxCombo: day.maxCombo, rent: costs.rent, utilities: costs.utilities, wages: costs.wages, goalRewards, repayment, principalPaid: payment.principal, interestPaid: payment.interest, debtRecovered, debt: state.debt, cash: state.money, reputation: state.reputation, xpGained: day.xpGained, goalsDone: state.goals.filter(goal => goal.claimed).length };
  state.history.push(summary); state.history = state.history.slice(-100); state.lastDay = summary; state.stats.daysPlayed++; state.stats.bestDay = Math.max(state.stats.bestDay, day.revenue); state.day++; state.phase = 'prep'; state.activeDay = null; state.goals = goalsFor(state); lockEvent(state);
  state.morning = morning; state.insolvent = state.money < minimumRestock(state);
  return good('Đã chốt sổ. Chuẩn bị một ngày mới nhé!', { finished: true, summary, insolvent: state.insolvent });
}
export function finishDay(state) { if (!state.activeDay) return settle(state); if (state.activeDay.pendingIncident) return fail('Xử lý tình huống trước khi đóng cửa.'); if (state.activeDay.tutorial) skipTutorial(state); if (state.phase === 'open' && state.activeDay.orders.length) { state.phase = 'closing'; state.activeDay.remaining = 0; state.activeDay.closingRemaining = 60; return good('Ngừng nhận khách; còn 60 giây hoàn thành đơn.', { closing: true, finished: false }); } return settle(state); }
export function tickDay(state, seconds, random = Math.random) {
  if (!operating(state)) return fail('Tiệm đang nghỉ.'); if (!finite(seconds, 0, 3600) || typeof random !== 'function') return fail('Thời gian không hợp lệ.');
  if (state.activeDay.pendingIncident) return good('Đang chờ xử lý tình huống.', { paused: true, finished: false });
  const safeRandom = () => { try { return rng(random); } catch { return .5; } };
  let left = seconds; const lostOrders = [], paused = () => good('', { finished: false, paused: true, lostOrders });
  while (left > 1e-9 && state.activeDay) {
    const day = state.activeDay;
    // During the coached first bowl only the pots and the chef move; the day clock waits.
    if (day.tutorial) { const dt = Math.min(.1, left); left -= dt; tickPots(state, dt); chefWork(state, dt); continue; }
    // Split a tick at closing time so no fraction is lost between the two clocks.
    if (state.phase === 'open' && day.remaining <= 1e-8) { state.phase = 'closing'; day.remaining = 0; }
    if (state.phase === 'closing' && (!day.orders.length || day.closingRemaining <= 1e-8)) return { ...settle(state), lostOrders };
    const dt = Math.min(.1, left, state.phase === 'open' ? day.remaining : day.closingRemaining); left -= dt;
    day.elapsed += dt;
    if (state.phase === 'open') day.remaining = Math.max(0, day.remaining - dt); else day.closingRemaining = Math.max(0, day.closingRemaining - dt);
    tickPots(state, dt);
    // Patience drains faster on a dirty floor and next to a noisy guest; the waiter slows it down.
    for (const order of [...day.orders]) {
      const dineIn = !order.delivery, drain = (state.staff.waiter ? .85 : 1) * (dineIn && day.dirty ? 1.15 : 1) * (dineIn && day.noisyId && day.noisyId !== order.id ? 1.3 : 1);
      order.patience = Math.max(0, order.patience - dt * drain);
      if (order.trait === 'fickle' && !order.changed && order.patience > 1e-8 && order.patience < order.maxPatience * .7) changeSpice(state, order, safeRandom);
      if (order.patience <= 1e-8) { lostOrders.push(order); loseOrder(state, order, { rating: order.delivery ? 1 : safeRandom() < .3 ? 2 : 1, cause: order.delivery ? 'app-late' : 'walkout' }); }
    }
    automation(state, dt);
    if (state.phase === 'open') {
      day.spawnElapsed += dt;
      if (day.remaining > 8 && day.spawnElapsed >= (day.nextArrival ?? 10)) { createOrder(state, safeRandom); day.spawnElapsed = 0; day.nextArrival = 10 / traffic(state) * (.75 + safeRandom() * .5); }
      day.appSpawnElapsed += dt;
      if (state.upgrades.delivery && day.remaining > 10 && day.appSpawnElapsed >= day.nextAppArrival) { createOrderFor(state, safeRandom, true); day.appSpawnElapsed = 0; day.nextAppArrival = 22 / traffic(state, false) * (day.event.id === 'rain' ? .5 : 1) * (.7 + safeRandom() * .6); }
      if (day.event.id === 'students' && !day.studentsSpawned && day.elapsed >= DAY_DURATION * .45) { for (let i = 0; i < 3; i++) createOrderFor(state, safeRandom, false, { bypassPrice: true }); day.studentsSpawned = true; notify('Một nhóm học sinh tan học ghé quán!', 'neutral', 'customerArrive'); }
      if (day.event.id === 'reviewer' && !day.reviewerSpawned && day.elapsed >= DAY_DURATION * .35) { const visit = createOrderFor(state, safeRandom, false, { bypassPrice: true, noTrait: true }); if (visit.ok || visit.walkedAway) day.reviewerSpawned = true; if (visit.ok) { visit.order.reviewer = true; visit.order.name = 'Reviewer ẩm thực'; notify('Một reviewer ẩm thực vừa ngồi xuống: đánh giá được tính gấp ba!', 'good', 'chime'); } }
      // Street stories wait while a bowl is in hand; a slot beyond the daily cap is dropped.
      if (day.storyTimes.length && day.elapsed >= day.storyTimes[0]) {
        if (day.bowl.started) { day.storyTimes[0] = Math.min(280, day.elapsed + 2); day.storyTimes.sort((a, b) => a - b); }
        else { day.storyTimes.shift(); if (day.incidentCount < situationCap(state) && openStory(state, safeRandom)) return paused(); }
      }
      if (day.remaining <= 1e-8) { state.phase = 'closing'; day.remaining = 0; }
    }
    // An inspection follows 35 s of dirty floor, once a day and outside the cap.
    if (day.dirty && !day.inspected && !day.bowl.started && day.elapsed - day.dirty.since > 35) { day.inspected = true; if (openStory(state, safeRandom, 'inspection')) return paused(); }
    if (state.phase === 'closing' && (!day.orders.length || day.closingRemaining <= 1e-8)) return { ...settle(state), lostOrders };
  }
  return good('', { finished: false, closing: state.phase === 'closing', lostOrders });
}

export function saveGame(state, storage) {
  try { const target = storage ?? globalThis.localStorage; if (!target?.setItem) return fail('Trình duyệt không cho phép lưu.'); if (state.legacySave && !target.getItem?.(BACKUP_KEY)) target.setItem(BACKUP_KEY, state.legacySave); target.setItem(SAVE_KEY, JSON.stringify(state)); return good('Đã lưu tiệm.'); } catch { return fail('Không thể lưu; hãy xuất bản lưu để giữ tiến trình.'); }
}
const copy = (value, fields) => Object.fromEntries(fields.map(key => [key, value[key]]));
const orderIdValid = id => typeof id === 'string' && /^day-[1-9]\d{0,5}-order-[1-9]\d{0,8}$/.test(id);
function validDish(dish) { return dish && items.get(dish.broth)?.kind === 'broth' && Array.isArray(dish.toppings) && dish.toppings.length <= 4 && new Set(dish.toppings).size === dish.toppings.length && dish.toppings.every(id => items.get(id)?.kind === 'topping') && int(dish.spice, 7) && int(dish.price, 500000, 1000); }
// Older saves kept one free-text reply; it becomes the first owner message of the thread.
function cleanReview(review) {
  if (!review || typeof review.id !== 'string' || !/^day-[1-9]\d{0,5}-order-[1-9]\d{0,8}(?:-[23])?$/.test(review.id) || !int(review.day, 1e6, 1) || !int(review.rating, 5, 1) || typeof review.name !== 'string' || review.name.length > 80 || typeof review.text !== 'string' || review.text.length > 1000 || typeof (review.reply ?? '') !== 'string' || (review.reply || '').length > 300) return null;
  const legacy = review.reply?.trim() ? [{ from: 'owner', text: review.reply.trim() }] : [];
  const thread = review.thread === undefined ? legacy : Array.isArray(review.thread) && review.thread.length <= 4 && review.thread.every(entry => entry && ['owner', 'guest'].includes(entry.from) && typeof entry.text === 'string' && entry.text.length <= 300) ? review.thread.map(entry => copy(entry, ['from', 'text'])) : null;
  const cause = review.cause ?? null, stars0 = review.stars0 ?? review.rating, xp = review.xp ?? false;
  if (!thread || !(cause === null || REVIEW_CAUSES.includes(cause)) || !int(stars0, 5, 1) || typeof xp !== 'boolean') return null;
  return { ...copy(review, ['id', 'day', 'name', 'rating']), stars0, cause, text: review.text, thread, xp };
}

const summaryNumbers = ['day', 'served', 'customers', 'lost', 'revenue', 'expenses', 'tips', 'waste', 'spoiled', 'mistakes', 'maxCombo', 'rent', 'utilities', 'wages', 'goalRewards', 'repayment', 'principalPaid', 'interestPaid', 'debt'];
function cleanSummary(summary) { if (!summary) return null; summary = { perfect: 0, dineInServed: summary.served, debtRecovered: 0, xpGained: 0, goalsDone: 0, priceLost: 0, ...summary }; if (!summaryNumbers.every(key => int(summary[key], key === 'day' ? 1e6 : 1e12)) || !cash(summary.profit) || !cash(summary.cash) || summary.profit !== summary.revenue + summary.goalRewards - summary.expenses || !finite(summary.reputation, 1, 5) || !int(summary.perfect, 1e9) || !int(summary.dineInServed, summary.served) || !int(summary.debtRecovered, 1e12) || !int(summary.xpGained, 1e9) || !int(summary.goalsDone, 3) || !int(summary.priceLost, 1e9)) return null; return copy(summary, [...summaryNumbers, 'perfect', 'dineInServed', 'debtRecovered', 'profit', 'cash', 'reputation', 'xpGained', 'goalsDone', 'priceLost']); }
function cleanGoals(goals) {
  if (!Array.isArray(goals) || goals.length !== 3 || new Set(goals.map(goal => goal?.id)).size !== 3) return null;
  const result = [];
  for (const goal of goals) { if (!goal || !int(goal.day, 1e6, 1) || !['served', 'perfect', 'ideal', 'spicy', 'maxCombo', 'deliveries', 'noLost'].includes(goal.metric) || goal.id !== `day-${goal.day}-${goal.metric}` || !int(goal.target, 1e6, 1) || !int(goal.progress, goal.target) || !int(goal.rewardMoney, 100000) || !int(goal.rewardXp, 1000) || typeof goal.claimed !== 'boolean' || typeof goal.name !== 'string' || goal.name.length > 100 || typeof goal.description !== 'string' || goal.description.length > 300) return null; result.push(copy(goal, ['id', 'day', 'name', 'description', 'metric', 'target', 'progress', 'rewardMoney', 'rewardXp', 'claimed'])); }
  return result;
}
function cleanActive(source, state) {
  if (!source || source.day !== state.day || source.duration !== 210 || !finite(source.remaining, 0, 210) || !finite(source.closingRemaining, 0, 60) || !finite(source.elapsed, 0, 271) || !finite(source.spawnElapsed, 0, 1000)) return null;
  if (state.phase === 'open' && Math.abs(source.elapsed - (210 - source.remaining)) > 1e-5 || state.phase === 'closing' && (source.elapsed > 270 - source.closingRemaining + 1e-5 || source.elapsed < 60 - source.closingRemaining - 1e-5)) return null;
  if (!Array.isArray(source.orders) || source.orders.length > capacity(state) + 2 || source.orders.filter(order => order?.delivery === true).length > (state.upgrades.delivery ? 2 : 0) || source.orders.filter(order => order?.delivery === false).length > capacity(state) || new Set(source.orders.map(order => order?.id)).size !== source.orders.length) return null;
  const countKeys = ['served', 'lost', 'customers', 'mistakes', 'perfect', 'ideal', 'combo', 'maxCombo', 'buyerTrips'], moneyKeys = ['revenue', 'expenses', 'waste', 'tips'];
  if (!countKeys.every(key => int(source[key], 1e9)) || !moneyKeys.every(key => int(source[key], 1e12)) || source.lost + source.orders.length > source.customers || source.buyerTrips > 4) return null;
  if (!['served', 'lost', 'customers', 'mistakes', 'perfect', 'revenue', 'expenses', 'waste', 'tips'].every(key => source[key] <= state.stats[key]) || state.stats.lost + source.orders.length > 1e9 || state.day >= 999999 || state.stats.daysPlayed >= 1e6) return null;
  const day = newDay(state); Object.assign(day, copy(source, ['day', 'remaining', 'closingRemaining', 'elapsed', 'spawnElapsed', ...countKeys, ...moneyKeys]));
  for (const key of ['dineInServed', 'spicy', 'deliveries', 'noLost']) { day[key] = source[key] ?? (key === 'dineInServed' ? source.served : 0); if (!int(day[key], 1e9)) return null; }
  day.goalRewards = source.goalRewards ?? 0; if (!int(day.goalRewards, 1e6)) return null;
  day.chefCooldown = source.chefCooldown ?? 0; if (!finite(day.chefCooldown, 0, .8)) return null;
  day.appSpawnElapsed = source.appSpawnElapsed ?? 0; day.nextAppArrival = source.nextAppArrival ?? 22; day.studentsSpawned = source.studentsSpawned ?? false; day.reviewerSpawned = source.reviewerSpawned ?? false;
  if (!finite(day.appSpawnElapsed, 0, 271) || !finite(day.nextAppArrival, .1, 1000) || typeof day.studentsSpawned !== 'boolean' || typeof day.reviewerSpawned !== 'boolean') return null;
  day.incidentCount = source.incidentCount ?? 0; day.lastIncidentAt = source.lastIncidentAt ?? -30; day.buzz = source.buzz ?? 0; day.slowUntil = source.slowUntil ?? 0;
  if (!int(day.incidentCount, 6) || !finite(day.lastIncidentAt, -30, 271) || !finite(day.buzz, -.3, .6) || !finite(day.slowUntil, 0, 320)) return null;
  day.seq = source.seq ?? day.incidentCount; day.storyTimes = source.storyTimes ?? []; day.storiesSeen = source.storiesSeen ?? []; day.dirty = source.dirty ?? null; day.inspected = source.inspected ?? false; day.noisyId = source.noisyId ?? null; day.tutorial = source.tutorial ?? false; day.xpGained = source.xpGained ?? 0; day.priceLost = source.priceLost ?? 0; day.recent = source.recent ?? [];
  if (!int(day.priceLost, 1e9) || !Array.isArray(day.recent) || day.recent.length > RECENT_ORDERS || !day.recent.every(row => Array.isArray(row) && row.length <= 15 && row.every(id => ['broth', 'topping'].includes(items.get(id)?.kind)))) return null;
  day.recent = day.recent.map(row => [...row]);
  if (!int(day.seq, 99) || !Array.isArray(day.storyTimes) || day.storyTimes.length > 3 || !day.storyTimes.every(time => finite(time, 0, 280)) || !Array.isArray(day.storiesSeen) || day.storiesSeen.length > DAY_STORIES.length || new Set(day.storiesSeen).size !== day.storiesSeen.length || !day.storiesSeen.every(id => DAY_STORIES.includes(id)) || !(day.dirty === null || day.dirty && finite(day.dirty.since, 0, 280) && int(day.dirty.taps, 2)) || typeof day.inspected !== 'boolean' || !(day.noisyId === null || orderIdValid(day.noisyId)) || typeof day.tutorial !== 'boolean' || !int(day.xpGained, 1e9)) return null;
  day.storyTimes = [...day.storyTimes]; day.storiesSeen = [...day.storiesSeen]; if (day.dirty) day.dirty = copy(day.dirty, ['since', 'taps']);
  if (source.pendingIncident != null) {
    const row = source.pendingIncident; let incident;
    if (!row || typeof row.id !== 'string' || !new RegExp(`^incident-${state.day}-[1-9]\\d?$`).test(row.id) || typeof row.name !== 'string' || row.name.length > 80) return null;
    if (PAYMENT_INCIDENTS.includes(row.type)) { if (!orderIdValid(row.reviewId) || !state.reviews.some(review => review.id === row.reviewId) || !int(row.amount, 2000000) || !int(row.bill, 2000000) || typeof row.overpaid !== 'boolean' || typeof row.hasStaff !== 'boolean' || !finite(row.roll, 0, 1) || !finite(row.collectionRoll, 0, 1) || ![0, 5000, 10000].includes(row.collectionTip)) return null; incident = copy(row, ['id', 'type', 'name', 'reviewId', 'amount', 'bill', 'overpaid', 'hasStaff', 'roll', 'collectionRoll', 'collectionTip']); }
    else if (row.type === 'haggle') { if (!orderIdValid(row.reviewId) || !state.reviews.some(review => review.id === row.reviewId) || !int(row.cut, 2000000, 1000) || !int(row.bill, 2000000) || !finite(row.roll, 0, 1)) return null; incident = copy(row, ['id', 'type', 'name', 'reviewId', 'cut', 'bill', 'roll']); }
    else if (row.type === 'story') { if (!Object.hasOwn(STORIES, row.story) || !(row.targetId === null || orderIdValid(row.targetId)) || typeof row.hasStaff !== 'boolean' || !Array.isArray(row.rolls) || row.rolls.length !== 2 || !row.rolls.every(roll => finite(roll, 0, 1)) || !(row.broth === null || items.get(row.broth)?.kind === 'broth') || !(row.topping === null || items.get(row.topping)?.kind === 'topping') || !int(row.bulk, 6)) return null; incident = { ...copy(row, ['id', 'type', 'story', 'name', 'targetId', 'hasStaff', 'broth', 'topping', 'bulk']), rolls: [...row.rolls] }; }
    else if (row.type === 'stockout') { if (!orderIdValid(row.orderId) || !items.has(row.item) || !(row.alternative === null || row.alternative !== row.item && ['broth', 'topping'].includes(items.get(row.item).kind) && items.get(row.alternative)?.kind === items.get(row.item).kind) || typeof row.buyer !== 'boolean' || !finite(row.roll, 0, 1) || !finite(row.reviewRoll, 0, 1)) return null; incident = copy(row, ['id', 'type', 'name', 'orderId', 'item', 'alternative', 'buyer', 'roll', 'reviewRoll']); }
    else return null;
    incident.options = incidentOptions(incident); if (!incident.options.length) return null; day.pendingIncident = incident;
  }
  if (source.nextArrival !== undefined) { if (!finite(source.nextArrival, .1, 1000)) return null; day.nextArrival = source.nextArrival; }
  if (!source.event || !['normal', ...DAILY_EVENTS.map(event => event.id)].includes(source.event.id)) return null;
  day.event = source.event.id === 'normal' ? { id: 'normal', name: 'Ngày bình yên', description: 'Một ngày bán hàng mới.', traffic: 1, patience: 1, costMultiplier: 1 } : { ...DAILY_EVENTS.find(event => event.id === source.event.id) };
  if (source.event.discountedIngredient !== undefined) { if (!items.has(source.event.discountedIngredient)) return null; day.event.discountedIngredient = source.event.discountedIngredient; }
  day.orders = [];
  for (const order of source.orders) {
    if (!orderIdValid(order?.id) || !order.id.startsWith(`day-${state.day}-`) || !validDish(order) || typeof order.name !== 'string' || order.name.length > 80 || !finite(order.patience, .000000001, 2000) || !finite(order.maxPatience, order.patience, 2000) || !int(order.bowlsTotal, 3, 1) || !int(order.bowlsServed, order.bowlsTotal - 1) || !int(order.mistakes, 1e6) || !finite(order.qualityPenalty, 0, 100) || typeof order.delivery !== 'boolean' || !Array.isArray(order.dishes) || order.dishes.length !== order.bowlsTotal || !order.dishes.every(validDish)) return null;
    const current = order.dishes[order.bowlsServed]; if (current.broth !== order.broth || current.spice !== order.spice || current.price !== order.price || current.toppings.join(',') !== order.toppings.join(',')) return null;
    if (order.reviewer !== undefined && typeof order.reviewer !== 'boolean' || order.tea !== undefined && typeof order.tea !== 'boolean' || order.delivery && order.bowlsTotal !== 1) return null;
    if (order.trait != null && !TRAITS.includes(order.trait) || order.changed !== undefined && typeof order.changed !== 'boolean' || order.tourist !== undefined && typeof order.tourist !== 'boolean' || order.self !== undefined && (typeof order.self !== 'string' || order.self.length > 12)) return null;
    day.orders.push({ ...copy(order, ['id', 'name', 'broth', 'spice', 'price', 'patience', 'maxPatience', 'bowlsTotal', 'bowlsServed', 'mistakes', 'qualityPenalty', 'delivery']), reviewer: order.reviewer ?? false, tea: order.tea ?? false, trait: order.trait ?? null, changed: order.changed ?? false, tourist: order.tourist ?? false, self: order.self ?? 'mình', toppings: [...order.toppings], dishes: order.dishes.map(dish => ({ ...copy(dish, ['broth', 'spice', 'price']), toppings: [...dish.toppings] })) });
  }
  if (source.selectedOrderId !== null && !day.orders.some(order => order.id === source.selectedOrderId)) return null; day.selectedOrderId = source.selectedOrderId;
  if (day.noisyId !== null && !day.orders.some(order => order.id === day.noisyId && !order.delivery)) return null;
  const bowl = source.bowl;
  if (!bowl || typeof bowl.started !== 'boolean' || !(bowl.broth === null || items.get(bowl.broth)?.kind === 'broth') || ![null, 'raw', 'cooked', 'soft'].includes(bowl.noodles) || !Array.isArray(bowl.toppings) || bowl.toppings.length > 4 || new Set(bowl.toppings).size !== bowl.toppings.length || !bowl.toppings.every(id => items.get(id)?.kind === 'topping') || !int(bowl.spice, 7) || !int(bowl.cost, 1000000)) return null;
  if (!bowl.started && (bowl.broth || bowl.noodles || bowl.toppings.length || bowl.spice || bowl.cost)) return null;
  day.bowl = { ...copy(bowl, ['started', 'broth', 'noodles', 'spice', 'cost']), toppings: [...bowl.toppings] };
  if (!Array.isArray(source.pots) || source.pots.length !== potCount(state)) return null;
  day.pots = []; for (const pot of source.pots) { if (pot === null) { day.pots.push(null); continue; } if (!pot || ![4.2, 5.2].includes(pot.duration) || !finite(pot.elapsed, 0, pot.duration + 1e-8) || !int(pot.cost, 100000) || pot.auto !== undefined && typeof pot.auto !== 'boolean') return null; day.pots.push({ ...copy(pot, ['elapsed', 'duration', 'cost']), auto: pot.auto === true }); }
  if (!Array.isArray(source.readyNoodles) || source.readyNoodles.length > 3 || !source.readyNoodles.every(ready => ready && int(ready.cost, 100000))) return null; day.readyNoodles = source.readyNoodles.map(ready => ({ cost: ready.cost }));
  for (const member of STAFF) { if (!int(source.wagesDue?.[member.id], member.wage)) return null; day.wagesDue[member.id] = source.wagesDue[member.id]; }
  // Buyer trips: one per item. Older saves held a single `buyerPending` trip.
  if (source.buyerPending != null) { if (!items.has(source.buyerPending.id) || !finite(source.buyerPending.remaining, 0, 12)) return null; day.buyerRuns[source.buyerPending.id] = source.buyerPending.remaining; }
  if (source.buyerRuns !== undefined) { if (!source.buyerRuns || typeof source.buyerRuns !== 'object' || Array.isArray(source.buyerRuns)) return null; const runs = Object.entries(source.buyerRuns); if (runs.length > 4 || !runs.every(([id, remaining]) => items.has(id) && finite(remaining, 0, 12))) return null; for (const [id, remaining] of runs) day.buyerRuns[id] = remaining; }
  return day;
}
export function loadGame(storage) {
  try {
    const source = storage ?? globalThis.localStorage, raw = source?.getItem?.(SAVE_KEY); if (typeof raw !== 'string' || raw.length > 2000000) return null;
    const data = JSON.parse(raw); if (data?.version === 1) return migrateV1(data, raw);
    if (!data || data.version !== 2 || typeof data.name !== 'string' || !cash(data.money) || !int(data.day, 999999, 1) || !int(data.xp) || !finite(data.reputation, 1, 5) || !['prep', 'open', 'closing'].includes(data.phase)) return null;
    const state = createGame(data.name); for (const key of ['money', 'day', 'xp', 'reputation', 'phase']) state[key] = data[key];
    for (const key of ['pendingExpenses', 'debt', 'loanInstallment']) { if (!int(data[key], 1e12)) return null; state[key] = data[key]; }
    state.loanInterest = data.loanInterest ?? 0; if (!int(state.loanInterest, state.debt)) return null;
    if (!int(data.loansTaken, 2) || !int(data.nextOrderId, 999999999, 1)) return null; state.loansTaken = data.loansTaken; state.nextOrderId = data.nextOrderId;
    state.buzzNext = data.buzzNext ?? 0; state.pendingIncome = data.pendingIncome ?? 0; state.insolvent = data.insolvent ?? false; state.tutorialDone = data.tutorialDone ?? true; state.pendingLevelUp = data.pendingLevelUp ?? null;
    if (!finite(state.buzzNext, 0, .5) || !int(state.pendingIncome, 1e12) || typeof state.insolvent !== 'boolean' || typeof state.tutorialDone !== 'boolean' || !(state.pendingLevelUp === null || int(state.pendingLevelUp, LEVELS.length, 2))) return null;
    // A gift note needs its variant; debt notes need the debtor's name.
    if (data.morning !== undefined) { if (!Array.isArray(data.morning) || data.morning.length > 12) return null; state.morning = []; for (const note of data.morning) { const gift = note?.kind === 'gift'; if (!note || !['debtPaid', 'debtLost', 'gift'].includes(note.kind) || !int(note.amount, 2000000, 1) || (gift ? !int(note.variant, 2) || note.name !== undefined : typeof note.name !== 'string' || !note.name || note.name.length > 80 || note.variant !== undefined)) return null; state.morning.push(copy(note, ['kind', 'amount', gift ? 'variant' : 'name'])); } }
    if (!Array.isArray(data.unlocked) || data.unlocked.length > INGREDIENTS.length || new Set(data.unlocked).size !== data.unlocked.length || !data.unlocked.every(id => items.has(id)) || !INITIAL_INGREDIENT_IDS.every(id => data.unlocked.includes(id))) return null; state.unlocked = [...data.unlocked];
    state.sidequests = cleanSidequests(data.sidequests, state); if (state.sidequests === null) return null;
    const next = data.nextEvent; if (next != null && (typeof next !== 'object' || !int(next.day, 1e6, 1) || !EVENT_IDS.includes(next.id) || !(next.item === null || next.id === 'sale' && ['broth', 'topping'].includes(items.get(next.item)?.kind)))) return null;
    state.nextEvent = next ? copy(next, ['day', 'id', 'item']) : null; if (!state.nextEvent) lockEvent(state);
    if (data.receivables !== undefined) { if (!Array.isArray(data.receivables) || data.receivables.length > 100) return null; state.receivables = []; for (const row of data.receivables) { if (!row || typeof row.id !== 'string' || !/^incident-[1-9]\d{0,5}-[1-9]\d?$/.test(row.id) || typeof row.name !== 'string' || row.name.length > 80 || !int(row.amount, 2000000, 1) || !int(row.dueDay, state.day + 1, 1) || !finite(row.roll, 0, 1) || ![0, 5000, 10000].includes(row.tip)) return null; state.receivables.push(copy(row, ['id', 'name', 'amount', 'dueDay', 'roll', 'tip'])); } }
    for (const item of INGREDIENTS) {
      if (!int(data.inventory?.[item.id], 1e6) || !Array.isArray(data.batches?.[item.id]) || data.batches[item.id].length > 1000 || !int(data.prices?.[item.id], item.sellPrice * 3, item.kind === 'base' ? 0 : 1000)) return null;
      const batches = []; for (const batch of data.batches[item.id]) { if (!batch || !int(batch.qty, 1e6, 1) || !int(batch.cost, 100000) || !(batch.expiresDay === null && item.expiryDays === null || int(batch.expiresDay, Math.min(1e6, state.day + 10), state.day))) return null; batches.push(copy(batch, ['qty', 'expiresDay', 'cost'])); }
      if (batches.reduce((sum, batch) => sum + batch.qty, 0) !== data.inventory[item.id]) return null; state.batches[item.id] = batches; state.inventory[item.id] = data.inventory[item.id]; state.prices[item.id] = data.prices[item.id];
    }
    for (const [rows, key] of [[UPGRADES, 'upgrades'], [STAFF, 'staff']]) for (const item of rows) { if (typeof data[key]?.[item.id] !== 'boolean') return null; state[key][item.id] = data[key][item.id]; }
    if (state.upgrades.pot3 && !state.upgrades.pot2) return null;
    for (const key of Object.keys(state.stats)) { if (!int(data.stats?.[key], ['served', 'customers', 'lost', 'mistakes', 'perfect', 'daysPlayed'].includes(key) ? 1e9 : 1e12)) return null; state.stats[key] = data.stats[key]; }
    if (!data.decoration || !Array.isArray(data.decoration.owned) || !data.decoration.owned.every(id => DECORATIONS.some(item => item.id === id)) || new Set(data.decoration.owned).size !== data.decoration.owned.length) return null;
    state.decoration.owned = [...data.decoration.owned]; for (const type of ['awning', 'pet', 'plant', 'lamp']) { const id = data.decoration.selected?.[type]; if (id !== null && (!state.decoration.owned.includes(id) || !DECORATIONS.some(item => item.id === id && item.type === type))) return null; state.decoration.selected[type] = id; }
    for (const key of ['sound', 'music', 'motion']) if (typeof data.settings?.[key] === 'boolean') state.settings[key] = data.settings[key]; if (['light', 'dark'].includes(data.settings?.theme)) state.settings.theme = data.settings.theme;
    state.goals = cleanGoals(data.goals); if (!state.goals) return null;
    state.reviews = Array.isArray(data.reviews) ? data.reviews.map(cleanReview).filter(Boolean).slice(-100) : []; state.history = Array.isArray(data.history) ? data.history.map(cleanSummary).filter(Boolean).slice(-100) : []; state.lastDay = cleanSummary(data.lastDay);
    if (state.phase === 'prep') { if (data.activeDay !== null) return null; } else { if (state.pendingExpenses !== 0 || state.pendingIncome !== 0) return null; state.activeDay = cleanActive(data.activeDay, state); if (!state.activeDay) return null; if (state.phase === 'closing' && state.activeDay.remaining !== 0) return null; const maximum = Math.max(0, ...state.activeDay.orders.map(order => Number(order.id.split('-order-')[1]))); state.nextOrderId = Math.max(state.nextOrderId, maximum + 1); if (state.nextOrderId >= 1e9) return null; }
    if (typeof data.legacySave === 'string' && data.legacySave.length <= 1000000) state.legacySave = data.legacySave;
    if (!int(state.stats.waste + wasteReserve(state), 1e12)) return null;
    return state;
  } catch { return null; }
}
function migrateV1(data, raw) {
  if (!cash(data.money) || !int(data.day, 999998, 1) || typeof data.name !== 'string' || !['prep', 'open'].includes(data.phase)) return null;
  const state = createGame(data.name), mapping = { noodles: 'noodles', broth: 'kimchi', beef: 'beef', seafood: 'seafood', mushroom: 'mushroom', greens: 'greens', egg: 'egg', kimchi: 'kimchi_topping' };
  state.money = data.money; state.day = data.day; state.legacySave = raw.length <= 1000000 ? raw : null; state.xp = Math.min(1e9, (int(data.stats?.served) ? data.stats.served : 0) * 18); state.reputation = finite(data.reputation, 1, 5) ? data.reputation : 4;
  for (const [old, id] of Object.entries(mapping)) { const qty = data.inventory?.[old]; if (!int(qty, 1e6)) return null; if (qty) { const item = items.get(id); state.inventory[id] = qty; state.batches[id] = [{ qty, cost: item.price, expiresDay: item.expiryDays === null ? null : state.day + item.expiryDays - 1 }]; if (!state.unlocked.includes(id)) state.unlocked.push(id); } }
  state.inventory.bowls = state.inventory.noodles; if (state.inventory.bowls) state.batches.bowls = [{ qty: state.inventory.bowls, cost: 0, expiresDay: null }];
  for (const key of Object.keys(state.stats)) if (int(data.stats?.[key], 1e12)) state.stats[key] = data.stats[key]; state.stats.tips = int(data.stats?.totalTips, 1e12) ? data.stats.totalTips : 0;
  state.stats.customers = Math.max(state.stats.customers, state.stats.served + state.stats.lost);
  state.upgrades.stove = !!data.upgrades?.stove; state.upgrades.table = !!data.upgrades?.seating; state.upgrades.fan = !!data.upgrades?.decor;
  for (const id of ['cashier', 'chef', 'waiter']) state.staff[id] = data.staff?.[id] === true;
  state.pendingExpenses = int(data.pendingExpenses, 1e12) ? data.pendingExpenses : 0; state.nextOrderId = int(data.nextOrderId, 999999998, 1) ? data.nextOrderId : 1;
  for (const key of ['sound', 'music', 'motion']) if (typeof data.settings?.[key] === 'boolean') state.settings[key] = data.settings[key]; if (['light', 'dark'].includes(data.settings?.theme)) state.settings.theme = data.settings.theme;
  state.reviews = Array.isArray(data.reviews) ? data.reviews.map(review => cleanReview({ ...review, reply: '' })).filter(Boolean).slice(-100) : [];
  state.history = Array.isArray(data.history) ? data.history.map(summary => cleanSummary({ ...summary, tips: 0, waste: 0, spoiled: 0, mistakes: 0, maxCombo: 0, wages: 0, goalRewards: 0, repayment: 0, principalPaid: 0, interestPaid: 0, debt: 0, cash: state.money })).filter(Boolean).slice(-100) : []; state.lastDay = state.history.at(-1) || null;
  state.goals = goalsFor(state); state.nextEvent = null; lockEvent(state);
  if (data.phase === 'open') {

    if (!data.activeDay || !finite(data.activeDay.remaining, 0, 210) || !Array.isArray(data.activeDay.orders) || data.activeDay.orders.length > 6) return null;
    const day = newDay(state); day.remaining = data.activeDay.remaining; day.elapsed = 210 - day.remaining;
    for (const key of ['served', 'revenue', 'expenses', 'lost', 'customers']) { if (!int(data.activeDay[key], 1e12)) return null; day[key] = data.activeDay[key]; }
    for (const old of data.activeDay.orders) {
      const recipe = { beef: ['kimchi', ['beef', 'greens', 'kimchi_topping']], seafood: ['tomyum', ['seafood', 'greens', 'mushroom']], mushroom: ['mushroom_broth', ['mushroom', 'greens', 'egg']] }[old.recipeId];
      if (!recipe || !orderIdValid(old.id) || typeof old.name !== 'string' || !finite(old.patience, .000001, 2000) || !finite(old.maxPatience, old.patience, 2000) || !int(old.spice, 7) || !int(old.price, 500000, 1000)) return null;
      const dish = { broth: recipe[0], toppings: recipe[1], spice: old.spice, price: old.price }; for (const id of [dish.broth, ...dish.toppings]) if (!state.unlocked.includes(id)) state.unlocked.push(id);
      day.orders.push({ ...dish, id: old.id, name: old.name.slice(0, 80), dishes: [{ ...dish, toppings: [...dish.toppings] }], patience: old.patience, maxPatience: old.maxPatience, bowlsTotal: 1, bowlsServed: 0, mistakes: 0, qualityPenalty: 0, delivery: false });
    }
    // Old saves allowed six tables. Keep excess paid progress in the backup;
    // convert overflow visitors to departures so the new capacity stays valid.
    while (day.orders.length > capacity(state)) { day.orders.pop(); day.lost++; state.stats.lost++; }
    // Version 1 counted only finished visitors; waiting customers must be included or the validator rejects the save.
    state.stats.customers = Math.max(state.stats.customers, day.customers, state.stats.served + state.stats.lost + day.orders.length);
    day.selectedOrderId = day.orders[0]?.id ?? null; state.activeDay = day; state.pendingExpenses = 0; state.phase = day.remaining > 0 ? 'open' : 'closing'; state.nextOrderId = Math.max(state.nextOrderId, 1 + Math.max(0, ...day.orders.map(order => Number(order.id.split('-order-')[1]))));
  }
  return loadGame({ getItem: () => JSON.stringify(state) });
}
