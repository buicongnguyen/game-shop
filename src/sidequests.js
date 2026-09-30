import { INGREDIENTS, LEVELS } from './catalog.js';

// Independently authored optional mini-games. Their state is part of a local save.
export const SPICES = Object.freeze([
  { id: 'lemongrass', name: 'Sả', icon: '🌾' }, { id: 'chili', name: 'Ớt', icon: '🌶️' },
  { id: 'garlic', name: 'Tỏi', icon: '🧄' }, { id: 'ginger', name: 'Gừng', icon: '🫚' },
  { id: 'anise', name: 'Hoa hồi', icon: '✴️' }, { id: 'cinnamon', name: 'Quế', icon: '🪵' },
  { id: 'limeleaf', name: 'Lá chanh', icon: '🍃' }, { id: 'shallot', name: 'Hành tím', icon: '🧅' },
]);
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const fail = message => ({ ok: false, message });
const good = (extra = {}) => ({ ok: true, ...extra });
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const stateFor = game => game.sidequests ||= {};
const inPrep = game => game.phase === 'prep' && !game.activeDay;
const brothExists = id => INGREDIENTS.some(item => item.id === id && item.kind === 'broth');
const levelOf = game => [...LEVELS].reverse().find(level => game.xp >= level.xp)?.level || 1;
const currentMarket = game => game.sidequests?.market?.day === game.day ? game.sidequests.market : null;
const currentSecret = game => game.sidequests?.secret?.day === game.day ? game.sidequests.secret : null;

export function marketDiscount(game) { return currentMarket(game)?.discount || 0; }
export function bargainingRound(game) {
  const market = currentMarket(game); if (!market || market.done || market.round >= 3) return null;
  const width = [.16, .13, .10][market.round], center = market.centers[market.round];
  return { index: market.round, speed: [.8, 1.1, 1.45][market.round], greenStart: center - width / 2, greenEnd: center + width / 2, yellowStart: center - width / 2 - .1, yellowEnd: center + width / 2 + .1 };
}
export function beginBargaining(game, random = Math.random) {
  if (!inPrep(game)) return fail('Trả giá trước giờ mở cửa nhé.');
  const existing = currentMarket(game);
  if (existing) return existing.done ? fail('Hôm nay đã chốt giá. Mai ghé chợ tiếp nhé.') : good({ round: bargainingRound(game), discount: existing.discount });
  let centers;
  try { centers = Array.from({ length: 3 }, () => { const number = Number(random()); if (!finite(number, 0, 1)) throw Error(); return .22 + number * .56; }); }
  catch { return fail('Không thể bắt đầu lượt trả giá.'); }
  stateFor(game).market = { day: game.day, round: 0, discount: 0, centers, done: false };
  return good({ round: bargainingRound(game), discount: 0 });
}
export function stopBargaining(game, position) {
  const market = currentMarket(game), round = bargainingRound(game);
  if (!inPrep(game) || !round || !finite(position, 0, 1)) return fail('Lượt trả giá không còn sẵn sàng.');
  const award = position >= round.greenStart && position <= round.greenEnd ? .05 : position >= round.yellowStart && position <= round.yellowEnd ? .02 : 0;
  market.discount = Math.min(.15, Math.round((market.discount + award) * 100) / 100);
  market.round++; market.done = market.round >= 3;
  return good({ award, discount: market.discount, done: market.done, round: bargainingRound(game) });
}
export function finishBargaining(game) {
  const market = currentMarket(game); if (!market) return fail('Chưa bắt đầu trả giá.');
  market.done = true; return good({ discount: market.discount, done: true });
}

function weeklyRecipe(game, broth) {
  const word = `${Math.floor((game.day - 1) / 7) + 1}:${broth}`;
  let seed = 2166136261;
  for (const char of word) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const sequence = SPICES.map(spice => spice.id);
  for (let index = sequence.length - 1; index > 0; index--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const chosen = Math.floor(seed / 4294967296 * (index + 1));
    [sequence[index], sequence[chosen]] = [sequence[chosen], sequence[index]];
  }
  const level = levelOf(game); return sequence.slice(0, level >= 7 ? 6 : level >= 4 ? 5 : 4);
}
export function secretBroth(game) {
  const secret = currentSecret(game); return secret?.success && game.unlocked.includes(secret.broth) ? secret.broth : null;
}
export function startSecretBroth(game, broth) {
  if (!inPrep(game) || game.day < 3) return fail('Công thức bí truyền mở từ ngày 3, trước giờ bán.');
  if (!brothExists(broth) || !game.unlocked.includes(broth)) return fail('Chọn một nước dùng đã mở.');
  const old = currentSecret(game);
  if (old?.success || old?.attempts >= 2) return fail('Hôm nay đã dùng hết lượt nấu bí truyền.');
  if (old && old.broth !== broth) return fail('Hôm nay hãy thử lại nồi nước dùng đã chọn.');
  const secret = { day: game.day, broth, attempts: (old?.attempts || 0) + 1, success: false, sequence: old?.sequence || weeklyRecipe(game, broth), index: 0, status: 'playing' };
  stateFor(game).secret = secret;
  return good({ sequence: [...secret.sequence], attempt: secret.attempts });
}
export function submitSpice(game, id) {
  const secret = currentSecret(game);
  if (!inPrep(game) || !secret || secret.status !== 'playing' || !SPICES.some(spice => spice.id === id)) return fail('Lượt nấu đã kết thúc.');
  const correct = secret.sequence[secret.index] === id;
  if (!correct) secret.status = 'failed';
  else { secret.index++; if (secret.index === secret.sequence.length) { secret.success = true; secret.status = 'complete'; } }
  return good({ correct, done: secret.status !== 'playing', success: secret.success, index: secret.index });
}
export function abandonSecretBroth(game) {
  const secret = currentSecret(game); if (!secret || secret.status !== 'playing') return fail('Không có lượt nấu đang chờ.');
  secret.status = 'failed'; return good({ done: true, success: false });
}

export function washingInfo(game) { return game.sidequests?.washing || null; }
export function startWashing(game, summary = game.lastDay) {
  if (!inPrep(game) || !summary || summary.day !== game.day - 1 || summary.day !== game.lastDay?.day || summary.day < 2 || summary.cash < 0) return fail('Rửa tô sau một ngày bán có đủ tiền đóng tiệm.');
  const total = summary.dineInServed ?? summary.served;
  if (!integer(total, 3, 1000000)) return fail('Cần ít nhất 3 tô phục vụ tại quán để rửa.');
  const existing = washingInfo(game);
  if (existing?.day === summary.day) return existing.done ? fail('Đã cất tô sạch của ngày này rồi.') : good({ total: existing.total, frames: existing.frames });
  stateFor(game).washing = { day: summary.day, total, frames: Math.min(10, total), completed: 0, progress: 0, elapsed: 0, recovered: 0, done: false };
  return good({ total, frames: Math.min(10, total) });
}
export function scrubWashing(game, amount = 1) {
  const washing = washingInfo(game);
  if (!inPrep(game) || !washing || washing.done || washing.day !== game.day - 1 || !finite(amount, .01, 8)) return fail('Không có tô đang rửa.');
  washing.progress = Math.min(8, washing.progress + amount);
  if (washing.progress >= 8) { washing.completed++; washing.progress = 0; }
  if (washing.completed >= washing.frames) return finishWashing(game);
  return good({ completed: washing.completed, recovered: Math.round(washing.total * washing.completed / washing.frames), done: false });
}
export function tickWashing(game, seconds) {
  const washing = washingInfo(game);
  if (!inPrep(game) || !washing || washing.done || washing.day !== game.day - 1 || !finite(seconds, 0, 60)) return fail('Thời gian rửa tô không hợp lệ.');
  washing.elapsed = Math.min(15, washing.elapsed + seconds);
  return washing.elapsed >= 15 ? finishWashing(game) : good({ remaining: 15 - washing.elapsed, done: false });
}
export function finishWashing(game) {
  const washing = washingInfo(game);
  if (!inPrep(game) || !washing || washing.day !== game.day - 1) return fail('Không có chồng tô đang chờ.');
  if (washing.done) return good({ completed: washing.completed, recovered: washing.recovered, done: true, alreadyFinished: true });
  const recovered = Math.min(1000000 - game.inventory.bowls, Math.round(washing.total * washing.completed / washing.frames));
  if (!integer(recovered, 0, 1000000)) return fail('Kho tô đã đạt giới hạn.');
  if (recovered) {
    const batch = game.batches.bowls.find(row => row.cost === 0 && row.expiresDay === null);
    if (batch) batch.qty += recovered; else game.batches.bowls.push({ qty: recovered, expiresDay: null, cost: 0 });
    game.inventory.bowls += recovered;
  }
  washing.done = true; washing.recovered = recovered;
  return good({ completed: washing.completed, recovered, done: true });
}

// Missing optional data is compatible with pre-mini-game saves; invalid data fails closed.
export function cleanSidequests(source, game) {
  if (source == null) return {};
  if (typeof source !== 'object' || Array.isArray(source)) return null;
  const result = {};
  if (source.market != null) {
    const row = source.market;
    if (!integer(row.day, 1, game.day) || !integer(row.round, 0, 3) || !finite(row.discount, 0, .15) || Math.abs(row.discount * 100 - Math.round(row.discount * 100)) > 1e-7 || typeof row.done !== 'boolean' || (!row.done && row.round === 3) || !Array.isArray(row.centers) || row.centers.length !== 3 || !row.centers.every(center => finite(center, .22, .78))) return null;
    result.market = { day: row.day, round: row.round, discount: row.discount, centers: [...row.centers], done: row.done };
  }
  if (source.secret != null) {
    const row = source.secret;
    if (!integer(row.day, 3, game.day) || !brothExists(row.broth) || !game.unlocked.includes(row.broth) || !integer(row.attempts, 1, 2) || typeof row.success !== 'boolean' || !Array.isArray(row.sequence) || !integer(row.sequence.length, 4, 6) || new Set(row.sequence).size !== row.sequence.length || !row.sequence.every(id => SPICES.some(spice => spice.id === id)) || !integer(row.index, 0, row.sequence.length) || !['playing', 'failed', 'complete'].includes(row.status) || row.success !== (row.status === 'complete') || row.success !== (row.index === row.sequence.length)) return null;
    result.secret = { day: row.day, broth: row.broth, attempts: row.attempts, success: row.success, sequence: [...row.sequence], index: row.index, status: row.status };
  }
  if (source.washing != null) {
    const row = source.washing;
    if (!integer(row.day, 2, game.day - 1) || !integer(row.total, 3, 1000000) || row.frames !== Math.min(10, row.total) || !integer(row.completed, 0, row.frames) || !finite(row.progress, 0, 8) || !finite(row.elapsed, 0, 15) || !integer(row.recovered, 0, row.total) || typeof row.done !== 'boolean' || (!row.done && (row.recovered !== 0 || row.completed === row.frames || row.elapsed === 15))) return null;
    result.washing = { day: row.day, total: row.total, frames: row.frames, completed: row.completed, progress: row.progress, elapsed: row.elapsed, recovered: row.recovered, done: row.done };
  }
  return result;
}
