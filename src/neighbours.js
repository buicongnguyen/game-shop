/** Tiệm Mì Cay: the neighbours on our street and the little surprises shops send each other.
 * The reference sends pranks between real online players. This game has no server, so the other shops are six
 * fictional neighbours, played by the game as characters of the street. Everything here is pure and seeded: a
 * neighbour's mood, their surprises for tomorrow and their takings depend only on the save.
 */
import { LEVELS } from './catalog.js';

const fail = message => ({ ok: false, message });
const good = (message = '', extra = {}) => ({ ok: true, message, ...extra });
const int = (n, max = 1e9, min = 0) => Number.isSafeInteger(n) && n >= min && n <= max;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
// Own hash and generator (FNV-1a and an LCG), so nothing here touches the game's random stream.
function hashText(text) { let hash = 2166136261; for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619); return hash >>> 0; }
function seeded(seed) { let value = seed >>> 0; return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; }; }

// persona: a voice.js PERSONAS id, so the interface can draw the owner with customerFace().
// Board curve: profit on day d is start + slope·(d−1) + curve·(d−1)², plus a small daily wobble. On day 1 three shops
// are ahead of a new player and three behind; the leader makes about 11M₫ by day 30, so steady play reaches the top
// somewhere around days 25–35. Level: 1 + ⌊(d − 1 + lead) / pace⌋, capped at 10.
const neighbour = (id, name, owner, persona, temperament, color, board) => Object.freeze({ id, name, owner, persona, temperament, color, board: Object.freeze(board) });
export const NEIGHBOURS = Object.freeze([
  neighbour('pho', 'Phở Nồi Đồng', 'Ông Khiêm', 'gentleman', 'friendly', '#3FAE92', { start: 1500000, slope: 280000, curve: 1500, lead: 12, pace: 4 }),
  neighbour('trasua', 'Trà sữa Bong Bóng', 'Chị Vy', 'young-woman', 'prankster', '#F27A9B', { start: 800000, slope: 270000, curve: 1100, lead: 8, pace: 4 }),
  neighbour('banhmi', 'Xe bánh mì Cô Tư', 'Cô Tư', 'auntie', 'mixed', '#E9A62C', { start: 300000, slope: 240000, curve: 1300, lead: 4, pace: 5 }),
  neighbour('comtam', 'Cơm tấm Sườn Cháy', 'Anh Khoa', 'young-man', 'prankster', '#E4572E', { start: -60000, slope: 210000, curve: 1700, lead: 2, pace: 5 }),
  neighbour('che', 'Chè Ba Màu Đầu Hẻm', 'Nhã & Lâm', 'pair', 'friendly', '#9C7BD4', { start: -250000, slope: 175000, curve: 1400, lead: 3, pace: 6 }),
  neighbour('oc', 'Ốc Đêm Chú Tám', 'Chú Tám', 'uncle', 'mixed', '#2F7FC1', { start: -450000, slope: 180000, curve: 2200, lead: 0, pace: 6 }),
]);

// Four nuisances and two favours. rat, drunk, sidewalk, tour and celebrity open the street story of the same id;
// haggler seats a guest who will ask for a discount. `verb` completes "Bạn vừa {verb} {neighbour name}." and `past`
// completes "{neighbour name} {past}." `board` is what one costs (or earns) the receiving shop on the street board.
const kind = (id, name, hint, verb, past, isGood, board) => Object.freeze({ id, name, hint, verb, past, good: isGood, board });
export const PRANK_KINDS = Object.freeze([
  kind('rat', 'Thả chuột', 'Một chú chuột lạc vào quán họ đúng giờ đông khách.', 'thả một chú chuột sang', 'thả một chú chuột vào quán bạn', false, -60000),
  kind('drunk', 'Gửi ông khách say', 'Một ông khách quá chén ghé quán họ và nói chuyện oang oang.', 'chỉ đường cho một ông khách say sang', 'chỉ đường cho một ông khách say sang quán bạn', false, -40000),
  kind('sidewalk', 'Báo tổ trật tự', 'Tổ trật tự sẽ ghé nhắc quán họ chuyện kê bàn lấn vỉa hè.', 'báo tổ trật tự ghé', 'báo tổ trật tự tới nhắc quán bạn', false, -100000),
  kind('haggler', 'Gửi khách mặc cả', 'Một vị khách mê mặc cả sẽ ăn xong rồi xin bớt tiền.', 'giới thiệu một vị khách mê mặc cả sang', 'giới thiệu một vị khách mê mặc cả sang quán bạn', false, -30000),
  kind('tour', 'Giới thiệu đoàn du lịch', 'Một đoàn khách du lịch sẽ dừng xe trước quán họ.', 'giới thiệu một đoàn du lịch sang', 'dẫn một đoàn khách du lịch tới quán bạn', true, 80000),
  kind('celebrity', 'Rủ người nổi tiếng', 'Một ca sĩ quen mặt sẽ ghé ăn, kéo theo cả người hâm mộ.', 'rủ một người nổi tiếng ghé', 'rủ một người nổi tiếng ghé quán bạn', true, 120000),
]);
export const PRANKS_PER_DAY = 3;
export const PRANK_QUEUE_MAX = 6;
export const PRANK_RECORDS = 8;
const ADJUST_MAX = 1e9;
// Stories that only happen from a certain day (as in situations.js): nobody sends them before.
const READY_DAY = { sidewalk: 4, celebrity: 5 };
// How often a neighbour sends something on a given night, and how likely it is a favour.
const CHANCE = { prankster: .18, friendly: .16, mixed: .14 }, FAVOUR = { prankster: .2, friendly: .8, mixed: .5 };
const ids = NEIGHBOURS.map(row => row.id), kindIds = PRANK_KINDS.map(row => row.id);

export function neighbourById(id) { return typeof id === 'string' ? NEIGHBOURS.find(row => row.id === id) ?? null : null; }
export function prankKind(id) { return typeof id === 'string' ? PRANK_KINDS.find(row => row.id === id) ?? null : null; }
export function emptyNeighbours() { return { sentDay: 0, sentToday: [], sent: [], received: [], incoming: [], relation: {}, adjust: {} }; }
const boxOf = state => state.neighbours ?? emptyNeighbours();
const sentTodayOf = state => { const box = boxOf(state); return box.sentDay === state.day ? box.sentToday : []; };
const unlocked = state => !!state.tutorialDone && state.day >= 2;

/** What the prep screen needs: whether sending is open, sends left today, who got one today, and the four most recent
 * senders (newest first) for the "return the favour" buttons. */
export function prankStatus(state) {
  const sentTo = [...sentTodayOf(state)];
  return { unlocked: unlocked(state), left: Math.max(0, PRANKS_PER_DAY - sentTo.length), sentTo, returnList: boxOf(state).received.slice(0, 4).map(entry => ({ ...entry })) };
}

/** Sends a surprise to a neighbour before opening: three a day, one per neighbour, free. A favour warms the
 * relationship and lifts their takings; a nuisance does the opposite. */
export function sendPrank(state, neighbourId, kindId) {
  const target = neighbourById(neighbourId), prank = prankKind(kindId);
  if (state.phase !== 'prep' || state.activeDay) return fail('Chỉ gửi quà cho hàng xóm lúc chuẩn bị, trước giờ mở cửa.');
  if (!unlocked(state)) return fail('Mở khóa sau ngày bán hàng đầu tiên.');
  if (!target || !prank) return fail('Hàng xóm hoặc món quà không hợp lệ.');
  const box = state.neighbours ||= emptyNeighbours(), sentTo = sentTodayOf(state);
  if (sentTo.length >= PRANKS_PER_DAY) return fail(`Hôm nay bạn đã gửi đủ ${PRANKS_PER_DAY} món quà rồi.`);
  if (sentTo.includes(target.id)) return fail(`Hôm nay bạn đã gửi quà cho ${target.name} rồi.`);
  if (box.sentDay !== state.day) { box.sentDay = state.day; box.sentToday = []; }
  box.sentToday.push(target.id);
  box.sent = [{ to: target.id, kind: prank.id, day: state.day }, ...box.sent].slice(0, PRANK_RECORDS);
  box.relation[target.id] = clamp((box.relation[target.id] || 0) + (prank.good ? 1 : -1), -3, 3);
  // Kept within what a save accepts (±1e9), however many years of surprises pile up.
  box.adjust[target.id] = clamp((box.adjust[target.id] || 0) + prank.board, -ADJUST_MAX, ADJUST_MAX);
  return good(`Bạn vừa ${prank.verb} ${target.name}.`, { good: prank.good, name: target.name });
}

const levelOf = xp => [...LEVELS].reverse().find(level => xp >= level.xp)?.level || 1;
function boardProfit(row, day) {
  const d = Math.max(0, day - 1), { start, slope, curve } = row.board, wobble = (hashText(`${row.id}|${day}`) % 1001 / 1000 - .5) * 60000;
  return Math.round((start + slope * d + curve * d * d + wobble) / 1000) * 1000;
}
/** The street's leaderboard by lifetime profit, best first: the player (id 'player', the shop's name, you: true)
 * against the six neighbours. Ties keep the player ahead, then the neighbours' order. */
export function streetBoard(state) {
  const box = boxOf(state), day = state.day, stats = state.stats;
  const rows = [{ id: 'player', name: state.name, level: levelOf(state.xp), profit: stats.revenue + stats.rewards - stats.expenses, you: true },
    ...NEIGHBOURS.map(row => ({ id: row.id, name: row.name, level: clamp(1 + Math.floor((day - 1 + row.board.lead) / row.board.pace), 1, 10), profit: boardProfit(row, day) + (box.adjust[row.id] || 0), you: false }))];
  return rows.map((row, index) => ({ row, index })).sort((a, b) => b.row.profit - a.row.profit || a.index - b.index).map(({ row }, index) => ({ ...row, rank: index + 1 }));
}

/** Surprises that reached the shop on a given day (the morning card lists yesterday's). */
export function receivedOn(state, day) { return boxOf(state).received.filter(entry => entry.day === day).map(entry => ({ ...entry })); }

// ---- Engine hooks (called by game.js).

/** A surprise met during service goes to the front of the record: one entry per sender, newest first. */
export function recordGift(state, { from, kind: kindId }) {
  const box = state.neighbours ||= emptyNeighbours();
  box.received = [{ from, kind: kindId, day: state.day }, ...box.received.filter(entry => entry.from !== from)].slice(0, PRANK_RECORDS);
}

/** Tonight's rolls for tomorrow (call before the day number moves on): each neighbour without a surprise already
 * waiting may send one. Pranksters mostly send nuisances and friendly shops favours; a warm relationship tips the
 * balance toward favours. Whoever got something from you today usually answers in kind. About one a day in total.
 * Seeded by the day, the neighbour and the shop's counters, so a reload rolls the same. */
export function rollIncoming(state) {
  const box = state.neighbours ||= emptyNeighbours(), tomorrow = state.day + 1;
  const waiting = new Set(box.incoming.map(entry => entry.from));
  for (const row of NEIGHBOURS) {
    if (box.incoming.length >= PRANK_QUEUE_MAX || waiting.has(row.id)) continue;
    const random = seeded(hashText(`gift|${state.day}|${row.id}|${state.stats.customers}|${state.stats.served}`));
    const answer = box.sentDay === state.day ? box.sent.find(entry => entry.to === row.id && entry.day === state.day) : null;
    if (random() >= (answer ? .7 : CHANCE[row.temperament])) continue;
    const favour = answer ? (random() < .85) === prankKind(answer.kind).good : random() < clamp(FAVOUR[row.temperament] + (box.relation[row.id] || 0) * .1, .05, .95);
    const choices = PRANK_KINDS.filter(item => item.good === favour && tomorrow >= (READY_DAY[item.id] || 1));
    box.incoming.push({ from: row.id, kind: choices[Math.floor(random() * choices.length)].id });
  }
}

/** Unfired surprises go back to the front of the waiting list, which keeps at most six. */
export function returnIncoming(state, entries) {
  const box = state.neighbours ||= emptyNeighbours();
  box.incoming = [...entries.map(({ from, kind: kindId }) => ({ from, kind: kindId })), ...box.incoming].slice(0, PRANK_QUEUE_MAX);
}

const validEntry = (entry, key, day) => plain(entry) && ids.includes(entry[key]) && kindIds.includes(entry.kind) && (day === undefined || int(entry.day, day, 1));
const cleanCounts = (source, min, max) => { if (!plain(source)) return null; const rows = Object.entries(source); if (!rows.every(([id, value]) => ids.includes(id) && int(value, max, min))) return null; return Object.fromEntries(rows); };
/** Save validation: missing → empty; anything malformed → null (the save is refused). */
export function cleanNeighbours(source, state) {
  if (source === undefined) return emptyNeighbours();
  if (!plain(source) || !int(source.sentDay, state.day)) return null;
  const { sentToday, sent, received, incoming } = source;
  if (!Array.isArray(sentToday) || sentToday.length > PRANKS_PER_DAY || new Set(sentToday).size !== sentToday.length || !sentToday.every(id => ids.includes(id))) return null;
  if (!Array.isArray(sent) || sent.length > PRANK_RECORDS || !sent.every(entry => validEntry(entry, 'to', state.day))) return null;
  if (!Array.isArray(received) || received.length > PRANK_RECORDS || !received.every(entry => validEntry(entry, 'from', state.day)) || new Set(received.map(entry => entry.from)).size !== received.length) return null;
  if (!Array.isArray(incoming) || incoming.length > PRANK_QUEUE_MAX || !incoming.every(entry => validEntry(entry, 'from'))) return null;
  const relation = cleanCounts(source.relation, -3, 3), adjust = cleanCounts(source.adjust, -ADJUST_MAX, ADJUST_MAX);
  if (!relation || !adjust) return null;
  return { sentDay: source.sentDay, sentToday: [...sentToday], sent: sent.map(entry => ({ to: entry.to, kind: entry.kind, day: entry.day })), received: received.map(entry => ({ from: entry.from, kind: entry.kind, day: entry.day })), incoming: incoming.map(entry => ({ from: entry.from, kind: entry.kind })), relation, adjust };
}
