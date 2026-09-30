import { INGREDIENTS, UPGRADES, STAFF, DECORATIONS, LEVELS, INITIAL_INGREDIENT_IDS, DAILY_EVENTS, DAY_DURATION, CLOSING_GRACE, BASE_RENT, BASE_UTILITIES, STARTING_CASH } from './catalog.js';
import { cleanSidequests, marketDiscount, secretBroth } from './sidequests.js';
export { INGREDIENTS, UPGRADES, STAFF, DECORATIONS, LEVELS, DAILY_EVENTS, DAY_DURATION, CLOSING_GRACE };
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
const names = ['Mai', 'Minh', 'Linh', 'An', 'Vy', 'Bảo', 'Ngọc', 'Tuấn', 'Thảo', 'Huy'];
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
export function createGame(name = 'Tiệm Mì Cay') {
  const state = { version: 2, name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 40) : 'Tiệm Mì Cay', day: 1, money: STARTING_CASH, xp: 0, reputation: 4, inventory: mapOf(INGREDIENTS, 0), batches: mapOf(INGREDIENTS, () => []), prices: mapOf(INGREDIENTS, item => item.sellPrice), unlocked: [...INITIAL_INGREDIENT_IDS], upgrades: mapOf(UPGRADES, false), staff: mapOf(STAFF, false), decoration: { owned: ['awning_red'], selected: { awning: 'awning_red', pet: null, plant: null, lamp: null } }, reviews: [], history: [], stats: initialStats(), settings: { sound: true, motion: true, theme: 'light' }, pendingExpenses: 0, debt: 0, loanInterest: 0, loanInstallment: 0, loansTaken: 0, phase: 'prep', activeDay: null, lastDay: null, nextOrderId: 1, goals: [], legacySave: null, sidequests: {}, receivables: [] };
  state.goals = goalsFor(state); return state;
}
function spend(state, amount) { const current = state.activeDay ? state.activeDay.expenses : state.pendingExpenses; if (!int(amount, 1e12) || !cash(state.money - amount) || !int(state.stats.expenses + amount, 1e12) || !int(current + amount, 1e12)) return false; state.money -= amount; state.stats.expenses += amount; if (state.activeDay) state.activeDay.expenses += amount; else state.pendingExpenses += amount; return true; }
// Weekends are calendar days only, and the spicy challenge joins the pool from stage two (level 3).
function eventFor(day, level) { const normal = { id: 'normal', name: 'Ngày bình yên', description: 'Một ngày bán hàng mới.', traffic: 1, patience: 1, costMultiplier: 1 }; if (day % 7 === 0 || day % 7 === 6) return { ...DAILY_EVENTS.find(event => event.id === 'weekend') }; if (day <= 2 || ((Math.imul(day, 1103515245) + 12345) >>> 0) / 4294967296 >= .35) return normal; const pool = DAILY_EVENTS.filter(event => event.id !== 'weekend' && (event.id !== 'challenge' || level >= 3)), event = { ...pool[(day * 7) % pool.length] }; if (event.id === 'sale') event.discountedIngredient = ['kimchi', 'beef', 'sausage'][day % 3]; return event; }
export function dayEvent(state) { return state.activeDay?.event || eventFor(state.day, levelInfo(state).level); }
function wasteReserve(state) { return INGREDIENTS.reduce((sum, item) => sum + state.batches[item.id].reduce((value, batch) => value + batch.qty * batch.cost, 0), 0) + (state.activeDay ? state.activeDay.bowl.cost + state.activeDay.pots.reduce((sum, pot) => sum + (pot?.cost || 0), 0) + state.activeDay.readyNoodles.reduce((sum, ready) => sum + ready.cost, 0) : 0); }
function unitCost(state, item, rush = false) { const event = dayEvent(state), base = Math.round(item.price * (event.id === 'sale' && event.discountedIngredient === item.id ? .7 : 1) * (1 - marketDiscount(state)) / 10) * 10; return rush ? Math.round(base * 1.5 / 100) * 100 : base; }
function cartQuote(state, cart, rush = false) {
  if (!cart || typeof cart !== 'object' || Array.isArray(cart)) return null;
  const rows = []; let total = 0;
  for (const [id, quantity] of Object.entries(cart)) { const item = items.get(id); if (!item || !int(quantity, 99)) return null; if (!quantity) continue; if (item.unlockLevel > levelInfo(state).level && !state.unlocked.includes(id) || state.inventory[id] + quantity > 1e6) return null; const unlock = state.unlocked.includes(id) ? 0 : item.unlockPrice, cost = unitCost(state, item, rush); total += cost * quantity + unlock; rows.push({ item, quantity, cost }); }
  return { total, rows };
}
export function cartCost(state, cart, options = {}) { return cartQuote(state, cart, options.rush)?.total ?? NaN; }
export function suggestedCart(state) { const cart = {}, unlocked = availableIngredients(state), broths = unlocked.filter(item => item.kind === 'broth'); for (const id of ['bowls', 'noodles']) cart[id] = Math.max(0, Math.ceil((15 - inventoryCount(state, id)) / 5) * 5); for (const item of broths) cart[item.id] = Math.max(0, Math.ceil((Math.ceil(15 / broths.length) - inventoryCount(state, item.id)) / 5) * 5); for (const item of unlocked.filter(item => item.kind === 'topping')) cart[item.id] = Math.max(0, Math.ceil((5 - inventoryCount(state, item.id)) / 5) * 5); while (cartCost(state, cart) > Math.max(0, state.money)) { const id = Object.keys(cart).filter(key => cart[key] > 0).sort((a, b) => cart[b] - cart[a])[0]; if (!id) break; cart[id]--; } return cart; }
export function buyCart(state, cart, { rush = false } = {}) {
  const quote = cartQuote(state, cart, rush); if (!quote || !quote.rows.length) return fail('Chọn số lượng 0–99 và nguyên liệu đúng cấp tiệm.'); if (operating(state) && !rush) return fail('Trong giờ bán, hãy chọn nhập hàng khẩn cấp.'); if (state.money < quote.total) return fail(`Cần ${formatMoney(quote.total)} để nhập hàng.`); if (!int(state.stats.waste + wasteReserve(state) + quote.rows.reduce((sum, row) => sum + row.cost * row.quantity, 0), 1e12) || !spend(state, quote.total)) return fail('Đã đạt giới hạn tiền.');
  for (const { item, quantity, cost } of quote.rows) { if (!state.unlocked.includes(item.id)) state.unlocked.push(item.id); const expiresDay = item.expiryDays === null ? null : state.day + item.expiryDays - 1, batches = state.batches[item.id], same = batches.find(batch => batch.expiresDay === expiresDay && batch.cost === cost); if (same) same.qty += quantity; else batches.push({ qty: quantity, expiresDay, cost }); state.inventory[item.id] += quantity; }
  return good(`Đã nhập hàng: ${formatMoney(quote.total)}.`, { cost: quote.total });
}
function consume(state, id) { if (!items.has(id) || state.inventory[id] <= 0) return null; const batch = state.batches[id].find(lot => lot.qty > 0); if (!batch) return null; batch.qty--; state.inventory[id]--; state.batches[id] = state.batches[id].filter(lot => lot.qty > 0); return batch.cost; }
export function setPrice(state, id, delta) { const item = items.get(id); if (!item || item.kind === 'base' || !Number.isInteger(delta) || Math.abs(delta) > 100000 || delta % 1000) return fail('Giá bán thay đổi từng 1.000đ.'); const price = state.prices[id] + delta; if (!int(price, item.sellPrice * 3, 1000)) return fail('Giá đã chạm giới hạn.'); state.prices[id] = price; return good('Đã cập nhật giá bán.', { price }); }
function purchaseAsset(state, rows, collection, id) { const item = rows.find(row => row.id === id); if (!item || collection[id]) return fail('Không hợp lệ hoặc đã sở hữu.'); if (levelInfo(state).level < item.unlockLevel) return fail(`Mở ở cấp ${item.unlockLevel}.`); if (item.requires && !state.upgrades[item.requires]) return fail('Cần mua nâng cấp trước đó.'); if (state.money < item.price) return fail('Chưa đủ tiền.'); if (!spend(state, item.price)) return fail('Đã đạt giới hạn tiền.'); collection[id] = true; return good(`Đã chọn ${item.name}.`, { cost: item.price }); }
export function buyUpgrade(state, id) { const result = purchaseAsset(state, UPGRADES, state.upgrades, id); if (result.ok && state.activeDay) while (state.activeDay.pots.length < potCount(state)) state.activeDay.pots.push(null); return result; }
export function hireStaff(state, id) { const result = purchaseAsset(state, STAFF, state.staff, id); if (result.ok && state.activeDay) state.activeDay.wagesDue[id] = STAFF.find(member => member.id === id).wage; return result; }
export function fireStaff(state, id) { if (!STAFF.some(member => member.id === id) || !state.staff[id]) return fail('Nhân viên chưa làm tại tiệm.'); state.staff[id] = false; return good('Đã kết thúc ca làm.'); }
export function buyDecoration(state, id) { const item = DECORATIONS.find(row => row.id === id); if (!item || state.decoration.owned.includes(id)) return fail('Trang trí không hợp lệ hoặc đã sở hữu.'); if (levelInfo(state).level < item.unlockLevel || state.money < item.price) return fail('Chưa đủ cấp hoặc tiền.'); if (!spend(state, item.price)) return fail('Đã đạt giới hạn tiền.'); state.decoration.owned.push(id); state.decoration.selected[item.type] = id; return good('Tiệm xinh hơn rồi!', { cost: item.price }); }
export function selectDecoration(state, id) { const item = DECORATIONS.find(row => row.id === id); if (!item || !state.decoration.owned.includes(id)) return fail('Bạn chưa sở hữu trang trí này.'); state.decoration.selected[item.type] = id; return good('Đã đổi trang trí.'); }
function newDay(state) { return { day: state.day, duration: DAY_DURATION, remaining: DAY_DURATION, closingRemaining: CLOSING_GRACE, elapsed: 0, spawnElapsed: 0, nextArrival: 10, appSpawnElapsed: 0, nextAppArrival: 22, studentsSpawned: false, reviewerSpawned: false, chefCooldown: 0, goalRewards: 0, pendingIncident: null, incidentCount: 0, lastIncidentAt: -30, buzz: 0, slowUntil: 0, orders: [], pots: Array(potCount(state)).fill(null), readyNoodles: [], bowl: emptyBowl(), selectedOrderId: null, served: 0, revenue: 0, expenses: state.pendingExpenses, lost: 0, customers: 0, mistakes: 0, waste: 0, tips: 0, perfect: 0, ideal: 0, spicy: 0, deliveries: 0, noLost: 0, dineInServed: 0, combo: 0, maxCombo: 0, buyerTrips: 0, buyerPending: null, wagesDue: mapOf(STAFF, member => state.staff[member.id] ? member.wage : 0), event: eventFor(state.day, levelInfo(state).level), goals: state.goals }; }
export function beginDay(state) { if (state.phase !== 'prep' || state.activeDay) return fail('Tiệm đang mở rồi.'); if (state.day >= 999999 || state.stats.daysPlayed >= 1e6) return fail('Đã đạt giới hạn ngày chơi.'); if (!inventoryCount(state, 'bowls') || !inventoryCount(state, 'noodles') || !availableIngredients(state).some(item => item.kind === 'broth' && inventoryCount(state, item.id))) return fail('Nhập tô, mì và ít nhất một loại nước dùng để mở cửa.'); if (state.goals[0]?.day !== state.day) state.goals = goalsFor(state); state.activeDay = newDay(state); state.pendingExpenses = 0; state.phase = 'open'; return good(`Ngày ${state.day}: mở cửa!`, { activeDay: state.activeDay }); }
function priceFor(state, broth, toppings) { return state.prices[broth] + toppings.reduce((sum, id) => sum + state.prices[id], 0); }
export function getSelectedOrder(state) { return state.activeDay?.orders.find(order => order.id === state.activeDay.selectedOrderId) || state.activeDay?.orders[0] || null; }
function weighted(random, weights) { const value = rng(random); let cumulative = 0; for (let i = 0; i < weights.length; i++) { cumulative += weights[i]; if (value < cumulative) return i; } return weights.length - 1; }
function makeDish(state, random) { const level = levelInfo(state).level, broth = pick(random, availableIngredients(state).filter(item => item.kind === 'broth')).id, choices = availableIngredients(state).filter(item => item.kind === 'topping'), count = weighted(random, level < 3 ? [.15, .85] : level < 7 ? [.15, .5, .35] : [.1, .35, .35, .2]), toppings = []; while (toppings.length < count && choices.length) toppings.push(choices.splice(Math.floor(rng(random) * choices.length), 1)[0].id); let spice = weighted(random, level < 3 ? [.2, .3, .3, .2] : [.07, .12, .17, .18, .15, .12, .1, .09]); if (state.activeDay.event.id === 'hot') spice = Math.min(spice, Math.floor(rng(random) * 3)); if (state.activeDay.event.id === 'challenge' && rng(random) < .45) spice = 7; if (state.activeDay.event.id === 'cold' && level >= 3 && rng(random) < .6) spice = Math.min(7, spice + 2); return { broth, toppings, spice, price: priceFor(state, broth, toppings) }; }
function createOrderFor(state, random, delivery = false) {
  const day = state.activeDay; if (state.phase !== 'open' || !day || day.remaining <= (delivery ? 10 : 8)) return fail('Tiệm đã ngừng nhận khách mới.'); if (delivery && !state.upgrades.delivery || day.orders.filter(order => order.delivery === delivery).length >= (delivery ? 2 : capacity(state))) return fail(delivery ? 'Đã đủ hai đơn giao hàng.' : 'Các bàn đã đầy.'); if (state.nextOrderId >= 999999999 || state.stats.customers >= 1e9 || day.customers >= 1e9 || state.stats.lost + day.orders.length >= 1e9) return fail('Đã đạt giới hạn đơn hàng.');
  let dishes, name; try { const level = levelInfo(state).level, first = makeDish(state, random), total = delivery ? 1 : level >= 7 ? 1 + weighted(random, [.5, .32, .18]) : level >= 3 && day.event.id === 'weekend' && rng(random) < .3 ? 2 : 1; dishes = [first]; while (dishes.length < total) dishes.push(makeDish(state, random)); name = pick(random, names); } catch { return fail('Không thể tạo đơn hàng.'); }
  let patience = (66 + Math.min(levelInfo(state).level - 1, 8) * 4) * (1 + dishes.reduce((sum, dish) => sum + dish.toppings.length, 0) / dishes.length * .12) * (1 + (dishes.length - 1) * .65); for (const upgrade of UPGRADES) if (state.upgrades[upgrade.id] && upgrade.patienceMultiplier) patience *= upgrade.patienceMultiplier; if (state.decoration.selected.pet) patience *= 1.08; if (delivery) patience = (96 + Math.min(levelInfo(state).level - 1, 8) * 5) * (1 + dishes[0].toppings.length * .12); patience = Math.round(patience * 100) / 100;
  const order = { id: `day-${state.day}-order-${state.nextOrderId++}`, name, ...dishes[0], dishes, patience, maxPatience: patience, bowlsTotal: dishes.length, bowlsServed: 0, mistakes: 0, qualityPenalty: 0, delivery, reviewer: false }; day.orders.push(order); day.customers++; state.stats.customers++; if (!day.selectedOrderId) day.selectedOrderId = order.id; return good(`${name} gọi mì ${items.get(order.broth).shortName}.`, { order });
}
export function createOrder(state, random = Math.random) { return createOrderFor(state, random, false); }
export function selectOrder(state, id) { if (!state.activeDay?.orders.some(order => order.id === id)) return fail('Khách đã rời tiệm.'); state.activeDay.selectedOrderId = id; return good('Đã chọn đơn.'); }
function automateBowl(state) { const order = getSelectedOrder(state), bowl = state.activeDay?.bowl; if (!order || !bowl?.started) return; if (state.staff.broth && !bowl.broth && inventoryCount(state, order.broth)) { bowl.cost += consume(state, order.broth); bowl.broth = order.broth; } if (state.staff.topping && bowl.broth === order.broth && bowl.toppings.every(id => order.toppings.includes(id))) for (const id of order.toppings) if (!bowl.toppings.includes(id) && bowl.toppings.length < 4 && inventoryCount(state, id)) { bowl.cost += consume(state, id); bowl.toppings.push(id); } }
export function takeBowl(state) { if (!operating(state)) return fail('Mở cửa trước nhé.'); const day = state.activeDay; if (day.bowl.started) return fail('Giao món hoặc bỏ tô đang làm trước.'); const cost = consume(state, 'bowls'); if (cost === null) return fail('Hết tô. Nhập hàng khẩn cấp nhé.'); day.bowl = { ...emptyBowl(), started: true, cost }; automateBowl(state); return good('Đã lấy tô.'); }
export function addBroth(state, id) { if (!operating(state) || !state.activeDay.bowl.started) return fail('Lấy tô trước nhé.'); const bowl = state.activeDay.bowl; if (bowl.broth || items.get(id)?.kind !== 'broth') return fail('Nước dùng đã rót không thể thay thế.'); const cost = consume(state, id); if (cost === null) return fail('Hết nước dùng.'); bowl.broth = id; bowl.cost += cost; automateBowl(state); return good('Đã thêm nước dùng.'); }
export function addTopping(state, id) { if (!operating(state) || !state.activeDay.bowl.started) return fail('Lấy tô trước nhé.'); const bowl = state.activeDay.bowl; if (items.get(id)?.kind !== 'topping' || bowl.toppings.includes(id) || bowl.toppings.length >= 4) return fail('Topping không thể bỏ ra hoặc thêm trùng; tối đa 4 món.'); const cost = consume(state, id); if (cost === null) return fail('Topping đã hết.'); bowl.cost += cost; bowl.toppings.push(id); return good('Đã thêm topping.'); }
export function addChili(state) { if (!operating(state) || !state.activeDay.bowl.started) return fail('Lấy tô trước nhé.'); const bowl = state.activeDay.bowl; if (bowl.spice >= 7) return fail('Đã cay cấp 7.'); bowl.spice++; return good(`Cay cấp ${bowl.spice}.`); }
export function startPot(state, index = 0) { if (!operating(state) || !int(index, potCount(state) - 1)) return fail('Nồi chưa sẵn sàng.'); if (state.activeDay.pots[index]) return fail('Nồi đang luộc mì.'); const cost = consume(state, 'noodles'); if (cost === null) return fail('Hết mì.'); state.activeDay.pots[index] = { elapsed: 0, duration: state.upgrades.stove ? 4.2 : 5.2, cost }; return good('Đã bắt đầu luộc mì.'); }
export function collectBasket(state) { if (!operating(state) || !state.activeDay.bowl.started || state.activeDay.bowl.noodles || !state.activeDay.readyNoodles.length) return fail('Cần tô trống và mì chín trong rổ.'); const ready = state.activeDay.readyNoodles.shift(); state.activeDay.bowl.noodles = 'cooked'; state.activeDay.bowl.cost += ready.cost; return good('Đã lấy mì từ rổ phụ bếp.'); }
export function collectPot(state, index = 0) { if (!operating(state) || !int(index, potCount(state) - 1)) return fail('Nồi không hợp lệ.'); const day = state.activeDay, bowl = day.bowl; if (!bowl.started || bowl.noodles) return fail('Cần một tô chưa có mì.'); if (day.readyNoodles.length) return collectBasket(state); const pot = day.pots[index]; if (!pot) return fail('Nồi chưa có mì.'); const progress = pot.elapsed / pot.duration; bowl.noodles = progress < .5 ? 'raw' : progress <= .78 ? 'cooked' : 'soft'; bowl.cost += pot.cost; day.pots[index] = null; return good(bowl.noodles === 'cooked' ? 'Mì vừa chín tới!' : 'Mì chưa đạt độ chín lý tưởng.', { doneness: bowl.noodles }); }
function waste(state, amount) { state.activeDay.waste += amount; state.stats.waste += amount; }
export function discardBowl(state) { if (!operating(state) || !state.activeDay.bowl.started) return fail('Chưa có tô để bỏ.'); const amount = state.activeDay.bowl.cost; waste(state, amount); state.activeDay.bowl = emptyBowl(); return good('Đã bỏ tô; nguyên liệu không được hoàn lại.', { waste: amount }); }
function updateGoals(state) { if (state.activeDay) for (const goal of state.goals) goal.progress = Math.min(goal.target, state.activeDay[goal.metric] || 0); }
function addReview(state, order, rating, text) { const review = { id: order.id, day: state.day, name: order.name, rating, text, reply: '' }; for (let count = 0; count < (order.reviewer ? 3 : 1); count++) state.reviews.push({ ...review }); state.reviews = state.reviews.slice(-100); state.reputation = Math.round(state.reviews.slice(-30).reduce((sum, item) => sum + item.rating, 0) / Math.min(30, state.reviews.length) * 100) / 100; return review; }
function dropOrder(state, order) { state.activeDay.orders = state.activeDay.orders.filter(item => item.id !== order.id); if (state.activeDay.selectedOrderId === order.id) state.activeDay.selectedOrderId = state.activeDay.orders[0]?.id ?? null; }
function loseOrder(state, order, reason = 'Đợi lâu quá nên mình đành rời tiệm.') { state.activeDay.lost++; state.stats.lost++; state.activeDay.combo = 0; addReview(state, order, 2, reason); dropOrder(state, order); }
function incidentOptions(type, overpaid, hasStaff) {
  const option = (id, label) => ({ id, label });
  if (type === 'dash') return [option('chase', 'Đuổi theo khách'), ...(hasStaff ? [option('staffChase', 'Nhờ nhân viên đuổi theo')] : []), option('ignore', 'Chấp nhận mất tiền')];
  if (type === 'money') return overpaid ? [option('return', 'Trả lại tiền thừa'), option('keep', 'Giữ tiền thừa')] : [option('remind', 'Nhắc khách trả đủ'), option('ignore', 'Bỏ qua khoản thiếu')];
  if (type === 'debt') return [option('allow', 'Cho khách ghi nợ'), option('decline', 'Từ chối ghi nợ')];
  return [option('refund', 'Hoàn tiền và xin lỗi'), option('topup', 'Làm phần mới · 10.000đ'), option('argue', 'Giải thích với khách')];
}
function queueIncident(state, order, tip, random) {
  const day = state.activeDay;
  if (state.day < 2 || order.delivery || order.reviewer || day.pendingIncident || day.incidentCount >= (state.day < 4 ? 2 : 3) || day.elapsed - day.lastIncidentAt < 30) return null;
  const sample = () => { try { return rng(random); } catch { return .5; } };
  const chance = sample(), type = chance < .05 ? 'dash' : chance < .11 ? 'money' : chance < .14 ? 'debt' : chance < .17 ? 'hair' : null;
  if (!type || state.staff.cashier && ['dash', 'money'].includes(type)) return null;
  const overpaid = type === 'money' && sample() < .6, bill = order.dishes.reduce((sum, dish) => sum + dish.price, 0) + tip;
  const amount = type === 'money' ? pick(sample, overpaid ? [10000, 20000, 50000] : [5000, 10000]) : bill;
  const hasStaff = Object.values(state.staff).some(Boolean);
  day.pendingIncident = { id: `incident-${state.day}-${day.incidentCount + 1}`, type, name: order.name, reviewId: order.id, amount, bill, overpaid, hasStaff, roll: sample(), collectionRoll: sample(), collectionTip: Math.floor(sample() * 3) * 5000, options: incidentOptions(type, overpaid, hasStaff) };
  day.incidentCount++; day.lastIncidentAt = day.elapsed;
  return day.pendingIncident;
}
function income(state, amount) {
  if (!int(amount, 1e12) || !cash(state.money + amount) || !int(state.stats.revenue + amount, 1e12) || state.activeDay && !int(state.activeDay.revenue + amount, 1e12)) return false;
  state.money += amount; state.stats.revenue += amount; if (state.activeDay) state.activeDay.revenue += amount; return true;
}
function reviseRating(state, id, rating) { for (const review of state.reviews) if (review.id === id) review.rating = rating; const recent = state.reviews.slice(-30); state.reputation = recent.length ? Math.round(recent.reduce((sum, review) => sum + review.rating, 0) / recent.length * 100) / 100 : 4; }
export function resolveIncident(state, action) {
  const day = state.activeDay, incident = day?.pendingIncident;
  if (!incident || !incident.options.some(option => option.id === action)) return fail('Cách xử lý không hợp lệ.');
  let expense = 0, bonus = 0, rating = null, message = 'Đã xử lý tình huống.';
  if (incident.type === 'dash') {
    const success = action !== 'ignore' && incident.roll < (action === 'staffChase' ? .85 : .65);
    expense = success ? 0 : incident.bill; message = success ? 'Đã nhắc khách thanh toán đủ.' : 'Khách đã đi mất; tiệm ghi nhận khoản thất thoát.';
  } else if (incident.type === 'money') {
    if (incident.overpaid) { if (action === 'return') rating = 5; else if (incident.roll < .7) bonus = incident.amount; else rating = 1; }
    else if (action === 'ignore' || incident.roll >= .75) { expense = incident.amount; if (action === 'remind') rating = 3; }
  } else if (incident.type === 'debt') {
    if (action === 'allow' || incident.roll >= .5) expense = incident.bill;
    if (action === 'decline' && expense) rating = 2;
  } else {
    if (action === 'refund') expense = incident.bill;
    if (action === 'topup') { expense = 10000; if (incident.roll >= .7) rating = 2; }
    if (action === 'argue' && incident.roll >= .45) rating = 1;
  }
  if (expense && !spend(state, expense) || bonus && !income(state, bonus)) return fail('Đã đạt giới hạn tiền.');
  if (rating !== null) reviseRating(state, incident.reviewId, rating);
  if (incident.type === 'dash' && action === 'chase') for (const order of [...day.orders]) { order.patience = Math.max(0, order.patience - 6); if (!order.patience) loseOrder(state, order); }
  if (incident.type === 'dash' && action === 'staffChase') day.slowUntil = day.elapsed + 12;
  if (incident.type === 'money' && incident.overpaid && action === 'return') day.buzz = clamp(day.buzz + .08, -.3, .6);
  if (incident.type === 'hair' && action === 'argue' && rating === 1) day.buzz = clamp(day.buzz - .1, -.3, .6);
  if (incident.type === 'debt' && action === 'allow') state.receivables.push({ id: incident.id, name: incident.name, amount: incident.bill, dueDay: state.day + 1, roll: incident.collectionRoll, tip: incident.collectionTip });
  day.pendingIncident = null;
  return good(message, { expense, bonus, rating });
}
export function serveBowl(state, random = Math.random) {
  if (!operating(state)) return fail('Tiệm chưa mở.'); const day = state.activeDay, bowl = day.bowl; if (day.pendingIncident) return fail('Xử lý tình huống trước nhé.'); if (!bowl.started || !bowl.broth || !bowl.noodles) return fail('Tô cần nước dùng và mì trước khi giao.'); if (!day.orders.length) return fail('Chưa có khách đang đợi.');
  const selected = getSelectedOrder(state), candidates = [selected, ...day.orders.filter(item => item !== selected)];
  const matches = dish => dish.broth === bowl.broth && dish.spice === bowl.spice && dish.toppings.length === bowl.toppings.length && dish.toppings.every(id => bowl.toppings.includes(id));
  const order = candidates.find(item => item.dishes.slice(item.bowlsServed).some(matches));
  if (!order) { if (state.stats.mistakes >= 1e9 || day.mistakes >= 1e9) return fail('Đã đạt giới hạn bản lưu.'); const selected = getSelectedOrder(state); if (selected) { selected.mistakes++; selected.patience = Math.max(.5, selected.patience - selected.maxPatience * .3); } day.mistakes++; state.stats.mistakes++; day.combo = 0; const discarded = discardBowl(state); return { ok: false, message: 'Sai món: khách mất kiên nhẫn, tô mì đã bị bỏ.', discarded: true, waste: discarded.waste }; }
  let roll; try { roll = rng(random); } catch { return fail('Không thể tính lượt phục vụ.'); }
  const matchIndex = order.dishes.findIndex((dish, index) => index >= order.bowlsServed && matches(dish)), dish = order.dishes[matchIndex], quality = bowl.noodles === 'cooked' ? 0 : 1, final = order.bowlsServed + 1 === order.bowlsTotal, tolerance = state.upgrades.menu ? 1.2 : 1;
  const expensive = order.dishes.some(part => state.prices[part.broth] > 60000 * tolerance || part.toppings.some(id => state.prices[id] > items.get(id).sellPrice * 1.5 * tolerance));
  const priceRatio = order.dishes.reduce((sum, part) => sum + part.price, 0) / order.dishes.reduce((sum, part) => sum + items.get(part.broth).sellPrice + part.toppings.reduce((total, id) => total + items.get(id).sellPrice, 0), 0), used = 1 - order.patience / order.maxPatience;
  let rating = clamp(5 - (used > .5 ? 1 : 0) - (used > .82 ? 1 : 0) - (quality || order.qualityPenalty > 0 ? 1 : 0) - (expensive ? 1 : 0) - Math.min(2, order.mistakes) - (roll < .1 ? 1 : 0), 1, 5); if (!expensive && priceRatio < .88) rating = Math.min(5, rating + 1);
  const secret = secretBroth(state), secretBowls = secret ? order.dishes.filter(part => part.broth === secret).length : 0; if (secretBowls) rating = Math.min(5, rating + 1);
  let tip = !final || order.delivery ? 0 : Math.round(order.patience / order.maxPatience * 4) * 1000 * order.bowlsTotal;
  if (day.event.id === 'challenge' && order.dishes.some(part => part.spice === 7)) tip *= 2;
  if (state.upgrades.tipjar) tip = Math.round(tip * 1.5 / 1000) * 1000;
  if (final && !order.delivery && rating >= 4) { if (state.upgrades.bowlset) tip += 3000 * order.bowlsTotal; if (state.upgrades.luckycat && roll < .25) tip += 5000 * order.bowlsTotal; }
  if (final && !order.delivery) tip += 2000 * secretBowls;
  if (day.event.id === 'payday') tip *= 2;
  const fee = order.delivery ? Math.round(dish.price * .2) : 0, earned = dish.price - fee + tip;
  if (!cash(state.money + earned) || !int(state.stats.revenue + earned, 1e12) || !int(day.revenue + earned, 1e12) || !int(state.stats.tips + tip, 1e12) || state.stats.served >= 1e9) return fail('Đã đạt giới hạn bản lưu.');
  state.money += earned; state.xp = Math.min(1e9, state.xp + 10); day.served++; if (!order.delivery) day.dineInServed++; if (dish.spice >= 5) day.spicy++; if (final && order.delivery) day.deliveries++; state.stats.served++; day.revenue += earned; state.stats.revenue += earned; day.tips += tip; state.stats.tips += tip; if (bowl.noodles === 'cooked') day.ideal++;
  if (final) { if (rating === 5) { day.combo++; day.maxCombo = Math.max(day.maxCombo, day.combo); } else day.combo = 0; }
  [order.dishes[order.bowlsServed], order.dishes[matchIndex]] = [order.dishes[matchIndex], order.dishes[order.bowlsServed]];
  order.qualityPenalty += quality; order.bowlsServed++; let review = null;
  if (order.bowlsServed >= order.bowlsTotal) { if (rating === 5) { day.perfect++; state.stats.perfect++; } state.xp = Math.min(1e9, state.xp + (rating === 5 ? 8 : rating === 4 ? 4 : 0) * (order.reviewer ? 2 : 1)); review = addReview(state, order, rating, rating >= 4 ? 'Mì nóng ngon, đúng món. Sẽ quay lại!' : 'Mì cần chỉn chu hơn về độ chín và thời gian chờ.'); dropOrder(state, order); } else Object.assign(order, order.dishes[order.bowlsServed]);
  day.bowl = emptyBowl(); updateGoals(state); const incident = final ? queueIncident(state, order, tip, random) : null;
  return good(`Giao đúng món! +${formatMoney(earned)}`, { earned, tip, fee, rating, review, orderId: order.id, incident });
}

export function claimGoal(state, id) {
  const goal = state.goals.find(item => item.id === id);
  if (!goal || goal.claimed || goal.progress < goal.target) return fail('Mục tiêu chưa hoàn thành hoặc đã nhận.');
  if (!cash(state.money + goal.rewardMoney) || !int(state.stats.rewards + goal.rewardMoney, 1e12)) return fail('Đã đạt giới hạn tiền.');
  goal.claimed = true; state.money += goal.rewardMoney; state.stats.rewards += goal.rewardMoney; state.xp = Math.min(1e9, state.xp + goal.rewardXp); if (state.activeDay) state.activeDay.goalRewards = (state.activeDay.goalRewards || 0) + goal.rewardMoney;
  return good(`Hoàn thành mục tiêu! +${formatMoney(goal.rewardMoney)}`, { rewardMoney: goal.rewardMoney, rewardXp: goal.rewardXp });
}
function minimumRestock(state) { const broth = availableIngredients(state).filter(item => item.kind === 'broth').sort((a, b) => a.price - b.price)[0]; return ['bowls', 'noodles', broth.id].reduce((sum, id) => sum + (inventoryCount(state, id) ? 0 : items.get(id).price * 5), 0); }
export function takeLoan(state) {
  if (state.loansTaken >= 2) return fail('Đã dùng hai khoản vay. Bạn có thể xuất bản lưu và mở tiệm mới.');
  const principal = Math.min(1000000, Math.max(state.loansTaken ? 400000 : 300000, Math.ceil((minimumRestock(state) + 150000 - state.money) / 50000) * 50000));
  const interest = Math.round(principal * .1);
  if (!cash(state.money + principal) || !int(state.debt + principal + interest, 1e12) || !int(state.stats.borrowed + principal, 1e12) || !int(state.loanInterest + interest, 1e12)) return fail('Đã đạt giới hạn tiền.');
  state.money += principal; state.stats.borrowed += principal; state.debt += principal + interest; state.loanInterest += interest; state.loansTaken++; state.loanInstallment = Math.ceil(state.debt / 6 / 1000) * 1000;
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
export function replyReview(state, id, text) { const review = state.reviews.find(item => item.id === id); if (!review || typeof text !== 'string' || !text.trim() || text.length > 300) return fail('Viết lời hồi đáp từ 1–300 ký tự.'); review.reply = text.trim(); return good('Đã lưu lời hồi đáp tại máy này.'); }
export function resolveStockout(state, orderId, action) {
  const order = state.activeDay?.orders.find(item => item.id === orderId); if (!order) return fail('Không tìm thấy khách.');
  const bowl = state.activeDay.bowl;
  const available = id => inventoryCount(state, id) > 0 || id === 'bowls' && bowl.started || id === 'noodles' && (bowl.noodles || state.activeDay.pots.some(Boolean) || state.activeDay.readyNoodles.length) || id === bowl.broth || bowl.toppings.includes(id);
  if (action === 'wait') return good('Khách tiếp tục đợi.');
  if (action === 'cancel' || action === 'leave') { loseOrder(state, order, 'Tiệm chưa đủ nguyên liệu cho món mình gọi.'); return good('Đã xin lỗi và tiễn khách.'); }
  if (action === 'rush') { const cart = {}; for (const id of ['bowls', 'noodles', order.broth, ...order.toppings]) if (!available(id)) cart[id] = 5; return buyCart(state, cart, { rush: true }); }
  if (!['substitute', 'remove'].includes(action)) return fail('Cách xử lý không hợp lệ.');
  let broth = order.broth, toppings = [...order.toppings];
  if (!available(broth)) { const alternate = availableIngredients(state).find(item => item.kind === 'broth' && inventoryCount(state, item.id)); if (!alternate) return fail('Chưa có nước dùng thay thế.'); broth = alternate.id; }
  const alternatives = availableIngredients(state).filter(item => item.kind === 'topping' && inventoryCount(state, item.id) && !toppings.includes(item.id));
  toppings = toppings.flatMap(id => available(id) ? [id] : action === 'substitute' && alternatives.length ? [alternatives.shift().id] : []);
  if (broth === order.broth && toppings.join(',') === order.toppings.join(',')) return fail('Đơn này chưa cần thay thế.');
  Object.assign(order, { broth, toppings, price: priceFor(state, broth, toppings) }); order.dishes[order.bowlsServed] = { broth, toppings: [...toppings], spice: order.spice, price: order.price }; order.qualityPenalty += .25;
  return good('Khách đồng ý đổi nguyên liệu; giá món đã cập nhật.');
}
function traffic(state, includeTime = true) {
  const day = state.activeDay, rep = (.6 + (state.reputation - 1) / 4 * .8) * (state.reputation < 4 ? .65 : 1);
  let bonus = Math.min(state.day, 30) * .015 + Math.min(.2, Math.max(0, state.decoration.owned.length - 1) * .02);
  for (const upgrade of UPGRADES) if (state.upgrades[upgrade.id]) bonus += (upgrade.trafficBonus || 0) + (day.elapsed > DAY_DURATION * .55 ? upgrade.eveningTrafficBonus || 0 : 0);
  const broths = availableIngredients(state).filter(item => item.kind === 'broth'), ratio = clamp(broths.reduce((sum, item) => sum + state.prices[item.id] / item.sellPrice, 0) / broths.length / (state.upgrades.menu ? 1.2 : 1), .85, 1.6);
  const fraction = day.elapsed / DAY_DURATION, time = fraction < .08 ? .8 : fraction < .28 ? 1.45 : fraction < .5 ? .6 : fraction < .78 ? 1.4 : .8;
  return Math.max(.1, rep * (1 + bonus) * Math.min(1, .65 + state.day * .1) * day.event.traffic * clamp(1 + day.buzz, .7, 1.6) / ratio ** 2 * (includeTime ? time : 1));
}
function automation(state, dt) {
  const day = state.activeDay;
  day.chefCooldown = Math.max(0, day.chefCooldown - dt);
  if (state.staff.chef) {
    const needed = Math.min(3, Math.max(0, day.orders.reduce((sum, order) => sum + order.bowlsTotal - order.bowlsServed, 0) - (day.bowl.noodles ? 1 : 0)));
    for (let i = 0; i < day.pots.length; i++) {
      const pot = day.pots[i];
      if (pot && pot.elapsed >= pot.duration * .64 && day.readyNoodles.length < 3) { day.readyNoodles.push({ cost: pot.cost }); day.pots[i] = null; }
      if (day.chefCooldown <= 0 && !day.pots[i] && day.readyNoodles.length + day.pots.filter(Boolean).length < needed && inventoryCount(state, 'noodles')) { startPot(state, i); day.chefCooldown = .8; }
    }
  }
  automateBowl(state);
  if (state.staff.buyer && day.buyerTrips < 4 && !day.buyerPending) {
    const order = getSelectedOrder(state), missing = order && ['bowls', 'noodles', order.broth, ...order.toppings].find(id => !inventoryCount(state, id));
    if (missing) day.buyerPending = { id: missing, remaining: 12 };
  }
  if (day.buyerPending) {
    day.buyerPending.remaining -= dt;
    if (day.buyerPending.remaining <= 0) {
      const id = day.buyerPending.id, quote = cartQuote(state, { [id]: 5 });
      if (quote && state.money >= quote.total && int(state.stats.waste + wasteReserve(state) + quote.total, 1e12) && spend(state, quote.total)) { const item = items.get(id), cost = unitCost(state, item); state.batches[id].push({ qty: 5, expiresDay: item.expiryDays === null ? null : state.day + item.expiryDays - 1, cost }); state.inventory[id] += 5; }
      day.buyerTrips++; day.buyerPending = null;
    }
  }
}
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
  let spoiled = 0;
  for (const item of INGREDIENTS) { const expired = state.batches[item.id].filter(batch => batch.expiresDay !== null && batch.expiresDay <= state.day); for (const batch of expired) { spoiled += batch.qty * batch.cost; state.inventory[item.id] -= batch.qty; } state.batches[item.id] = state.batches[item.id].filter(batch => batch.expiresDay === null || batch.expiresDay > state.day); }
  waste(state, spoiled); spend(state, costs.total); day.noLost = day.lost === 0 && day.served > 0 ? 1 : 0; updateGoals(state);
  for (const goal of state.goals) if (!goal.claimed && goal.progress >= goal.target) claimGoal(state, goal.id);
  const goalRewards = day.goalRewards || 0;
  let debtRecovered = 0; for (const receivable of state.receivables) if (receivable.dueDay <= state.day + 1 && receivable.roll < .75) { const amount = receivable.amount + receivable.tip; if (income(state, amount)) debtRecovered += amount; } state.receivables = state.receivables.filter(receivable => receivable.dueDay > state.day + 1);
  const repayment = Math.min(state.debt, state.loanInstallment, Math.max(0, state.money)), payment = repayment ? repayLoan(state, repayment) : { principal: 0, interest: 0 };
  const summary = { day: state.day, served: day.served, dineInServed: day.dineInServed, perfect: day.perfect, customers: day.customers, lost: day.lost, revenue: day.revenue, expenses: day.expenses, profit: day.revenue + goalRewards - day.expenses, tips: day.tips, waste: day.waste, spoiled, mistakes: day.mistakes, maxCombo: day.maxCombo, rent: costs.rent, utilities: costs.utilities, wages: costs.wages, goalRewards, repayment, principalPaid: payment.principal, interestPaid: payment.interest, debtRecovered, debt: state.debt, cash: state.money, reputation: state.reputation };
  state.history.push(summary); state.history = state.history.slice(-100); state.lastDay = summary; state.stats.daysPlayed++; state.stats.bestDay = Math.max(state.stats.bestDay, day.revenue); state.day++; state.phase = 'prep'; state.activeDay = null; state.goals = goalsFor(state);
  return good('Đã chốt sổ. Chuẩn bị một ngày mới nhé!', { finished: true, summary });
}
export function finishDay(state) { if (!state.activeDay) return settle(state); if (state.activeDay.pendingIncident) return fail('Xử lý tình huống trước khi đóng cửa.'); if (state.phase === 'open' && state.activeDay.orders.length) { state.phase = 'closing'; state.activeDay.remaining = 0; state.activeDay.closingRemaining = 60; return good('Ngừng nhận khách; còn 60 giây hoàn thành đơn.', { closing: true, finished: false }); } return settle(state); }
export function tickDay(state, seconds, random = Math.random) {
  if (!operating(state)) return fail('Tiệm đang nghỉ.'); if (!finite(seconds, 0, 3600) || typeof random !== 'function') return fail('Thời gian không hợp lệ.');
  if (state.activeDay.pendingIncident) return good('Đang chờ xử lý tình huống.', { paused: true, finished: false });
  const safeRandom = () => { try { return rng(random); } catch { return .5; } };
  let left = seconds; const lostOrders = [];
  while (left > 1e-9 && state.activeDay) {
    const day = state.activeDay;
    // Split a tick at closing time so no fraction is lost between the two clocks.
    if (state.phase === 'open' && day.remaining <= 1e-8) { state.phase = 'closing'; day.remaining = 0; }
    if (state.phase === 'closing' && (!day.orders.length || day.closingRemaining <= 1e-8)) return { ...settle(state), lostOrders };
    const dt = Math.min(.1, left, state.phase === 'open' ? day.remaining : day.closingRemaining); left -= dt;
    day.elapsed += dt;
    if (state.phase === 'open') day.remaining = Math.max(0, day.remaining - dt); else day.closingRemaining = Math.max(0, day.closingRemaining - dt);
    for (let i = 0; i < day.pots.length; i++) { const pot = day.pots[i]; if (pot) { pot.elapsed += dt * (day.elapsed < day.slowUntil ? .65 : 1); if (pot.elapsed + 1e-9 >= pot.duration) { waste(state, pot.cost); day.pots[i] = null; } } }
    for (const order of [...day.orders]) { order.patience = Math.max(0, order.patience - dt * (state.staff.waiter ? .85 : 1)); if (order.patience <= 1e-8) { lostOrders.push(order); loseOrder(state, order); } }
    automation(state, dt);
    if (state.phase === 'open') {
      day.spawnElapsed += dt;
      if (day.remaining > 8 && day.spawnElapsed >= (day.nextArrival ?? 10)) { createOrder(state, safeRandom); day.spawnElapsed = 0; day.nextArrival = 10 / traffic(state) * (.75 + safeRandom() * .5); }
      day.appSpawnElapsed += dt;
      if (state.upgrades.delivery && day.remaining > 10 && day.appSpawnElapsed >= day.nextAppArrival) { createOrderFor(state, safeRandom, true); day.appSpawnElapsed = 0; day.nextAppArrival = 22 / traffic(state, false) * (day.event.id === 'rain' ? .5 : 1) * (.7 + safeRandom() * .6); }
      if (day.event.id === 'students' && !day.studentsSpawned && day.elapsed >= DAY_DURATION * .45) { for (let i = 0; i < 3; i++) createOrder(state, safeRandom); day.studentsSpawned = true; }
      if (day.event.id === 'reviewer' && !day.reviewerSpawned && day.elapsed >= DAY_DURATION * .35) { const visit = createOrder(state, safeRandom); if (visit.ok) { visit.order.reviewer = true; visit.order.name = 'Reviewer ẩm thực'; day.reviewerSpawned = true; } }
      if (day.remaining <= 1e-8) { state.phase = 'closing'; day.remaining = 0; }
    }
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
function cleanReview(review) { if (!review || !orderIdValid(review.id) || !int(review.day, 1e6, 1) || !int(review.rating, 5, 1) || typeof review.name !== 'string' || review.name.length > 80 || typeof review.text !== 'string' || review.text.length > 1000 || typeof (review.reply ?? '') !== 'string' || (review.reply || '').length > 300) return null; return { ...copy(review, ['id', 'day', 'name', 'rating', 'text']), reply: review.reply || '' }; }
const summaryNumbers = ['day', 'served', 'customers', 'lost', 'revenue', 'expenses', 'tips', 'waste', 'spoiled', 'mistakes', 'maxCombo', 'rent', 'utilities', 'wages', 'goalRewards', 'repayment', 'principalPaid', 'interestPaid', 'debt'];
function cleanSummary(summary) { if (!summary) return null; summary = { perfect: 0, dineInServed: summary.served, debtRecovered: 0, ...summary }; if (!summaryNumbers.every(key => int(summary[key], key === 'day' ? 1e6 : 1e12)) || !cash(summary.profit) || !cash(summary.cash) || summary.profit !== summary.revenue + summary.goalRewards - summary.expenses || !finite(summary.reputation, 1, 5) || !int(summary.perfect, 1e9) || !int(summary.dineInServed, summary.served) || !int(summary.debtRecovered, 1e12)) return null; return copy(summary, [...summaryNumbers, 'perfect', 'dineInServed', 'debtRecovered', 'profit', 'cash', 'reputation']); }
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
  if (!int(day.incidentCount, 3) || !finite(day.lastIncidentAt, -30, 271) || !finite(day.buzz, -.3, .6) || !finite(day.slowUntil, 0, 283)) return null;
  if (source.pendingIncident != null) {
    const row = source.pendingIncident;
    if (!row || !['dash', 'money', 'debt', 'hair'].includes(row.type) || typeof row.id !== 'string' || !new RegExp(`^incident-${state.day}-[1-3]$`).test(row.id) || typeof row.name !== 'string' || row.name.length > 80 || !orderIdValid(row.reviewId) || !state.reviews.some(review => review.id === row.reviewId) || !int(row.amount, 2000000) || !int(row.bill, 2000000) || typeof row.overpaid !== 'boolean' || typeof row.hasStaff !== 'boolean' || !finite(row.roll, 0, 1) || !finite(row.collectionRoll, 0, 1) || ![0, 5000, 10000].includes(row.collectionTip)) return null;
    day.pendingIncident = { ...copy(row, ['id', 'type', 'name', 'reviewId', 'amount', 'bill', 'overpaid', 'hasStaff', 'roll', 'collectionRoll', 'collectionTip']), options: incidentOptions(row.type, row.overpaid, row.hasStaff) };
  }
  if (source.nextArrival !== undefined) { if (!finite(source.nextArrival, .1, 1000)) return null; day.nextArrival = source.nextArrival; }
  if (!source.event || !['normal', ...DAILY_EVENTS.map(event => event.id)].includes(source.event.id)) return null;
  day.event = source.event.id === 'normal' ? { id: 'normal', name: 'Ngày bình yên', description: 'Một ngày bán hàng mới.', traffic: 1, patience: 1, costMultiplier: 1 } : { ...DAILY_EVENTS.find(event => event.id === source.event.id) };
  if (source.event.discountedIngredient !== undefined) { if (!items.has(source.event.discountedIngredient)) return null; day.event.discountedIngredient = source.event.discountedIngredient; }
  day.orders = [];
  for (const order of source.orders) {
    if (!orderIdValid(order?.id) || !order.id.startsWith(`day-${state.day}-`) || !validDish(order) || typeof order.name !== 'string' || order.name.length > 80 || !finite(order.patience, .000000001, 2000) || !finite(order.maxPatience, order.patience, 2000) || !int(order.bowlsTotal, 3, 1) || !int(order.bowlsServed, order.bowlsTotal - 1) || !int(order.mistakes, 1e6) || !finite(order.qualityPenalty, 0, 100) || typeof order.delivery !== 'boolean' || !Array.isArray(order.dishes) || order.dishes.length !== order.bowlsTotal || !order.dishes.every(validDish)) return null;
    const current = order.dishes[order.bowlsServed]; if (current.broth !== order.broth || current.spice !== order.spice || current.price !== order.price || current.toppings.join(',') !== order.toppings.join(',')) return null;
    if (order.reviewer !== undefined && typeof order.reviewer !== 'boolean' || order.delivery && order.bowlsTotal !== 1) return null;
    day.orders.push({ ...copy(order, ['id', 'name', 'broth', 'spice', 'price', 'patience', 'maxPatience', 'bowlsTotal', 'bowlsServed', 'mistakes', 'qualityPenalty', 'delivery']), reviewer: order.reviewer ?? false, toppings: [...order.toppings], dishes: order.dishes.map(dish => ({ ...copy(dish, ['broth', 'spice', 'price']), toppings: [...dish.toppings] })) });
  }
  if (source.selectedOrderId !== null && !day.orders.some(order => order.id === source.selectedOrderId)) return null; day.selectedOrderId = source.selectedOrderId;
  const bowl = source.bowl;
  if (!bowl || typeof bowl.started !== 'boolean' || !(bowl.broth === null || items.get(bowl.broth)?.kind === 'broth') || ![null, 'raw', 'cooked', 'soft'].includes(bowl.noodles) || !Array.isArray(bowl.toppings) || bowl.toppings.length > 4 || new Set(bowl.toppings).size !== bowl.toppings.length || !bowl.toppings.every(id => items.get(id)?.kind === 'topping') || !int(bowl.spice, 7) || !int(bowl.cost, 1000000)) return null;
  if (!bowl.started && (bowl.broth || bowl.noodles || bowl.toppings.length || bowl.spice || bowl.cost)) return null;
  day.bowl = { ...copy(bowl, ['started', 'broth', 'noodles', 'spice', 'cost']), toppings: [...bowl.toppings] };
  if (!Array.isArray(source.pots) || source.pots.length !== potCount(state)) return null;
  day.pots = []; for (const pot of source.pots) { if (pot === null) { day.pots.push(null); continue; } if (!pot || ![4.2, 5.2].includes(pot.duration) || !finite(pot.elapsed, 0, pot.duration + 1e-8) || !int(pot.cost, 100000)) return null; day.pots.push(copy(pot, ['elapsed', 'duration', 'cost'])); }
  if (!Array.isArray(source.readyNoodles) || source.readyNoodles.length > 3 || !source.readyNoodles.every(ready => ready && int(ready.cost, 100000))) return null; day.readyNoodles = source.readyNoodles.map(ready => ({ cost: ready.cost }));
  for (const member of STAFF) { if (!int(source.wagesDue?.[member.id], member.wage)) return null; day.wagesDue[member.id] = source.wagesDue[member.id]; }
  if (source.buyerPending !== null) { if (!source.buyerPending || !items.has(source.buyerPending.id) || !finite(source.buyerPending.remaining, 0, 12)) return null; day.buyerPending = copy(source.buyerPending, ['id', 'remaining']); }
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
    if (!Array.isArray(data.unlocked) || data.unlocked.length > INGREDIENTS.length || new Set(data.unlocked).size !== data.unlocked.length || !data.unlocked.every(id => items.has(id)) || !INITIAL_INGREDIENT_IDS.every(id => data.unlocked.includes(id))) return null; state.unlocked = [...data.unlocked];
    state.sidequests = cleanSidequests(data.sidequests, state); if (state.sidequests === null) return null;
    if (data.receivables !== undefined) { if (!Array.isArray(data.receivables) || data.receivables.length > 100) return null; state.receivables = []; for (const row of data.receivables) { if (!row || typeof row.id !== 'string' || !/^incident-[1-9]\d{0,5}-[1-3]$/.test(row.id) || typeof row.name !== 'string' || row.name.length > 80 || !int(row.amount, 2000000, 1) || !int(row.dueDay, state.day + 1, 1) || !finite(row.roll, 0, 1) || ![0, 5000, 10000].includes(row.tip)) return null; state.receivables.push(copy(row, ['id', 'name', 'amount', 'dueDay', 'roll', 'tip'])); } }
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
    for (const key of ['sound', 'motion']) if (typeof data.settings?.[key] === 'boolean') state.settings[key] = data.settings[key]; if (['light', 'dark'].includes(data.settings?.theme)) state.settings.theme = data.settings.theme;
    state.goals = cleanGoals(data.goals); if (!state.goals) return null;
    state.reviews = Array.isArray(data.reviews) ? data.reviews.map(cleanReview).filter(Boolean).slice(-100) : []; state.history = Array.isArray(data.history) ? data.history.map(cleanSummary).filter(Boolean).slice(-100) : []; state.lastDay = cleanSummary(data.lastDay);
    if (state.phase === 'prep') { if (data.activeDay !== null) return null; } else { if (state.pendingExpenses !== 0) return null; state.activeDay = cleanActive(data.activeDay, state); if (!state.activeDay) return null; if (state.phase === 'closing' && state.activeDay.remaining !== 0) return null; const maximum = Math.max(0, ...state.activeDay.orders.map(order => Number(order.id.split('-order-')[1]))); state.nextOrderId = Math.max(state.nextOrderId, maximum + 1); if (state.nextOrderId >= 1e9) return null; }
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
  for (const key of ['sound', 'motion']) if (typeof data.settings?.[key] === 'boolean') state.settings[key] = data.settings[key]; if (['light', 'dark'].includes(data.settings?.theme)) state.settings.theme = data.settings.theme;
  state.reviews = Array.isArray(data.reviews) ? data.reviews.map(review => cleanReview({ ...review, reply: '' })).filter(Boolean).slice(-100) : [];
  state.history = Array.isArray(data.history) ? data.history.map(summary => cleanSummary({ ...summary, tips: 0, waste: 0, spoiled: 0, mistakes: 0, maxCombo: 0, wages: 0, goalRewards: 0, repayment: 0, principalPaid: 0, interestPaid: 0, debt: 0, cash: state.money })).filter(Boolean).slice(-100) : []; state.lastDay = state.history.at(-1) || null;
  state.goals = goalsFor(state);
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
