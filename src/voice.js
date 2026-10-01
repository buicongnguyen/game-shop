/** Tiệm Mì Cay: original Vietnamese voice lines for customers and the shop owner.
 * Plain ES module with no imports. Every function that varies its wording takes an optional
 * `random` function returning [0, 1); pass a seeded one for deterministic output. Math.random is
 * only used when `random` is omitted.
 */

const unit = value => (Number.isFinite(value) && value >= 0 ? Math.min(value, 0.9999999999) : 0);
const roll = random => unit(Number(random()));
const pick = (random, list) => list[Math.floor(roll(random) * list.length)];
const cap = text => (text ? text[0].toUpperCase() + text.slice(1) : '');
// Lower-case the first letter of a display name used mid-sentence ('Bò Mỹ' -> 'bò Mỹ'), but keep
// acronyms and names that are not capitalised words ('KFC', 'mì cay').
const soften = text => (/^\p{Lu}\p{Ll}/u.test(text) ? text[0].toLowerCase() + text.slice(1) : text);
const clean = value => (typeof value === 'string' ? value.normalize('NFC').replace(/\s+/g, ' ').trim() : '');
const tidy = value => value.replace(/\s+/g, ' ').replace(/\s+([,.!?…])/g, '$1').trim();
const fill = (template, values) => template.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
const clip = (value, max) => {
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1), space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?…]+$/, '')}…`;
};
const clampStars = stars => {
  const value = Math.round(Number(stars));
  return Number.isFinite(value) ? Math.min(5, Math.max(1, value)) : 3;
};
const band = stars => (stars <= 2 ? 'L' : stars === 3 ? 'M' : 'H');
const freezeList = list => Object.freeze([...list]);

// ---------------------------------------------------------------------------------------------
// Customers

const persona = (id, weight, honorifics, self, names) =>
  Object.freeze({ id, weight, honorifics: freezeList(honorifics), self, names: freezeList(names) });

export const PERSONAS = Object.freeze([
  persona('student', 16, ['Em'], 'em', ['Gia Huy', 'Bảo Ngọc', 'Minh Khoa', 'Tú Anh', 'Khánh Vy', 'Đức Trí', 'Nhật Hạ', 'Quang Vinh', 'Thanh Trúc', 'Hoàng Nam', 'Diệu Linh', 'Phúc An', 'Kim Ngân', 'Tuấn Kiệt']),
  persona('young-man', 13, ['Anh'], 'anh', ['Quốc Bảo', 'Minh Tuấn', 'Hải Đăng', 'Trung Kiên', 'Đình Phong', 'Thành Đạt', 'Văn Toàn', 'Hữu Nghĩa', 'Công Minh', 'Tấn Lộc', 'Duy Khánh', 'Việt Hoàng', 'Nhật Minh', 'Thiện Nhân']),
  persona('young-woman', 13, ['Chị'], 'chị', ['Mỹ Linh', 'Thu Trang', 'Ngọc Hân', 'Phương Thảo', 'Hồng Nhung', 'Thanh Hương', 'Bích Ngọc', 'Minh Châu', 'Lan Anh', 'Quỳnh Như', 'Thùy Dung', 'Hải Yến', 'Kiều Oanh', 'Ngọc Diệp']),
  persona('regular', 14, ['Bạn'], 'mình', ['Thảo', 'Khang', 'Nhi', 'Phát', 'Uyên', 'Tâm', 'Duy', 'Hiền', 'Long', 'Trâm', 'Sơn', 'Giang', 'Vân', 'Hưng']),
  persona('auntie', 10, ['Cô'], 'cô', ['Hạnh', 'Lụa', 'Tư', 'Sáu', 'Nguyệt', 'Thoa', 'Loan', 'Xuân', 'Bảy', 'Huệ', 'Liên', 'Hoa', 'Dung', 'Thắm']),
  persona('uncle', 10, ['Chú'], 'chú', ['Tám', 'Hai', 'Năm', 'Thành', 'Phúc', 'Lực', 'Tài', 'Khải', 'Bình', 'Đông', 'Hùng', 'Quý', 'Mười', 'Thịnh']),
  persona('pair', 12, ['Hai bạn', 'Cặp đôi'], 'tụi mình', ['Vy & Tùng', 'Nam & Hà', 'Tín & Ngân', 'Khôi & My', 'Lâm & Nhã', 'Phong & Thư', 'Hậu & Quyên', 'Đạt & Hằng', 'Kha & Tiên', 'Lộc & Vân', 'Tâm & Bình', 'Sang & Nguyên', 'Trí & Hoa', 'Bin & Bông']),
  persona('gentleman', 8, ['Ông'], 'tôi', ['Khiêm', 'Quang', 'Trọng', 'Thái', 'Vĩnh', 'Nghị', 'Tường', 'Cẩn', 'Hiếu', 'Đạo', 'Bửu', 'Kỳ', 'Triều', 'Luân']),
]);

const HONORIFICS = [...new Set(PERSONAS.flatMap(row => row.honorifics).concat(['Bé', 'Bà', 'Thầy']))]
  .sort((a, b) => b.length - a.length);

export function pickCustomer(random = Math.random) {
  const total = PERSONAS.reduce((sum, row) => sum + row.weight, 0);
  let target = roll(random) * total, chosen = PERSONAS[PERSONAS.length - 1];
  for (const row of PERSONAS) {
    if (target < row.weight) { chosen = row; break; }
    target -= row.weight;
  }
  const name = `${pick(random, chosen.honorifics)} ${pick(random, chosen.names)}`;
  return { persona: chosen.id, name: clip(name, 40), self: chosen.self };
}

// ---------------------------------------------------------------------------------------------
// Orders

export const TRAITS = Object.freeze(['hurried', 'patient', 'haggler', 'tourist', 'fickle']);

const TO_YOUNGER = ['em ơi', 'em ơi', 'quán ơi', 'chủ quán ơi'];
const TO_CHILD = ['con ơi', 'cháu ơi', 'quán ơi'];
const TO_PEER = ['bạn ơi', 'quán ơi', 'chủ quán ơi'];
// How a customer calls the cook, keyed by the word they use for themselves.
const ADDRESS = {
  'em': ['anh chị ơi', 'quán ơi', 'chủ quán ơi'], 'tụi em': ['anh chị ơi', 'quán ơi'],
  'anh': TO_YOUNGER, 'chị': TO_YOUNGER, 'cô': TO_CHILD, 'chú': TO_CHILD, 'bà': TO_CHILD, 'ông': TO_CHILD,
  'mình': TO_PEER, 'tụi mình': TO_PEER, 'tôi': ['chủ quán ơi', 'quán ơi', 'bạn ơi'], 'con': ['cô chú ơi', 'quán ơi'],
};
const OPENINGS = [
  '{Addr}, cho {self} một tô ', '{Addr}, {self} lấy một tô ', '{Addr}, cho {self} xin một tô ',
  '{Addr}! {Self} gọi một tô ', '{Addr}, làm giúp {self} một tô ', '{Addr}, lên cho {self} một tô ',
  '{Addr}, {self} chốt đơn một tô ', '{Addr}, {self} thèm quá, cho một tô ', '{Addr}, như mọi khi: một tô ',
  '{Addr}, hôm nay {self} ăn một tô ',
];
const CLOSINGS = [
  ' nha!', ' nhé!', ' nhen!', ' nha, {self} cảm ơn!', ' nhé, bụng đang biểu tình rồi!',
  ' nha, nấu ngon ngon giùm cái!', ' là chuẩn bài luôn!', '. Vậy thôi, cảm ơn nha!',
  ' nha, trông cả vào tay nghề của quán đó!', ' nhé, hôm nay phải ăn cho đã!',
];
const TOPPING_LEADS = [' thêm ', ' có thêm ', ' bỏ thêm ', ' kèm '];
const PLAIN_BOWL = [' không thêm gì hết', ' để trơn, không thêm gì', ' không thêm gì, ăn vị gốc thôi', ' nguyên bản, không thêm gì'];
const SPICY = ['cay cấp {n}', 'cấp {n}', 'cay level {n}'];
const MILD = ['không cay', 'không cay xíu nào'];
const TAILS = {
  hurried: [' {Self} đang gấp, lẹ lẹ giùm nha!', ' Nhanh giúp {self} nhé, sắp vào ca rồi!', ' {Self} chỉ có mười lăm phút nghỉ trưa, làm nhanh giùm nha!', ' Nhanh tay chút nha, xe còn đậu ngoài lề!'],
  patient: [' Cứ từ từ, {self} không vội đâu.', ' Không gấp đâu, {self} ngồi hóng gió chờ được.', ' Quán cứ thong thả, nấu kỹ là được.', ' {Self} rảnh cả buổi, cứ nấu từ từ cho ngon.'],
  haggler: [' Mà bớt chút đỉnh cho {self} được không?', ' Khách ruột mà, tính rẻ rẻ giùm nha!', ' Có khuyến mãi gì không, nói {self} nghe với?', ' Cuối tháng rồi, làm tròn xuống giùm {self} nha!'],
  fickle: [' À khoan… thôi, giữ vậy đi!', ' Hay đổi món ta? Thôi, cứ vậy đi.', ' Ủa mà… thôi, chốt vậy, không đổi nữa!', ' Để {self} nghĩ lại chút… à thôi, như trên nha.'],
};
const FICKLE_START = ['Ừm… ', 'Để coi… ', 'Hừm, '];
const TOURIST_OPEN = ['Hello! Cho tôi one bowl ', 'Xin chào! One ', 'Hi quán! Tôi muốn một tô ', 'Hello, excuse me! Một tô '];
const TOURIST_CLOSE = ['. Cảm ơn, thank you!', '. Thank you nhiều nha!', '. Cảm ơn! I am so hungry!', '. Thanks, cảm ơn quán!'];
const ORDER_MAX = 200;

const seg = (value, kind = 'plain') => ({ text: value, kind });
const joined = parts => parts.map(part => part.text).join('');
function toppingParts(tops, lead, last) {
  const parts = [seg(lead)];
  tops.forEach((name, index) => {
    if (index) parts.push(seg(index === tops.length - 1 ? last : ', '));
    parts.push(seg(name, 'topping'));
  });
  return parts;
}
function mergePlain(parts) {
  const out = [];
  for (const part of parts) {
    if (!part.text) continue;
    const previous = out[out.length - 1];
    if (previous && previous.kind === 'plain' && part.kind === 'plain') previous.text += part.text;
    else out.push({ text: part.text, kind: part.kind });
  }
  if (out[0]?.kind === 'plain') out[0].text = out[0].text.trimStart();
  if (out.at(-1)?.kind === 'plain') out.at(-1).text = out.at(-1).text.trimEnd();
  return out;
}

export function orderLine({ self = 'mình', broth = '', toppings = [], spice = 0, trait = null, random = Math.random } = {}) {
  const who = clip(clean(self) || 'mình', 20), dish = soften(clean(broth)) || 'mì cay';
  const tops = (Array.isArray(toppings) ? toppings : []).map(item => soften(clean(item))).filter(Boolean);
  const level = Math.min(99, Math.max(0, Math.round(Number(spice)) || 0));
  // Every choice is drawn up front, so the shorter fallbacks for long orders stay deterministic.
  const draws = Array.from({ length: 8 }, () => roll(random));
  const choose = (list, index) => list[Math.floor(draws[index] * list.length)];
  const address = choose(ADDRESS[who.toLowerCase()] || ['quán ơi'], 0);
  const values = { self: who, Self: cap(who), addr: address, Addr: cap(address) };
  const spiceText = level ? choose(SPICY, 4).replace('{n}', level) : choose(MILD, 4);
  const candidates = [];
  if (trait === 'tourist') {
    const tail = level === 0 ? ', no spicy please' : level <= 3 ? ' please' : ', very hot, okay!';
    const body = [seg(dish, 'broth'), ...(tops.length ? toppingParts(tops, ' with ', ' and ') : [seg(', no topping, không thêm gì')]),
      seg(', '), seg(level ? `cay cấp ${level}` : 'không cay', 'spice'), seg(tail)];
    candidates.push([seg(choose(TOURIST_OPEN, 1)), ...body, seg(choose(TOURIST_CLOSE, 5))], [seg('Hello! One '), ...body, seg('. Thank you!')]);
  } else {
    let opening = fill(choose(OPENINGS, 1), values);
    if (trait === 'fickle') opening = choose(FICKLE_START, 7) + opening[0].toLowerCase() + opening.slice(1);
    const tails = TAILS[trait] ? TAILS[trait].map(line => fill(line, values)) : [''];
    const tail = choose(tails, 6), shortTail = tails.reduce((a, b) => (b.length < a.length ? b : a));
    const body = [seg(dish, 'broth'), ...(tops.length ? toppingParts(tops, choose(TOPPING_LEADS, 2), choose([' và ', ' với '], 3)) : [seg(choose(PLAIN_BOWL, 2))]),
      seg(', '), seg(spiceText, 'spice')];
    candidates.push([seg(opening), ...body, seg(fill(choose(CLOSINGS, 5), values)), seg(tail)],
      [seg(opening), ...body, seg(' nha!'), seg(tail)], [seg(opening), ...body, seg(' nha!'), seg(shortTail)]);
  }
  // Pathological input only (many toppings or a very long dish name): keep as much as fits.
  const lead = `${values.Addr}, cho ${who} một tô `;
  for (let count = tops.length; count >= 0; count--) {
    const shown = tops.slice(0, count), extra = count < tops.length ? (count ? ' và vài món nữa' : ' kèm vài topping') : '';
    candidates.push([seg(lead), seg(dish, 'broth'), ...(shown.length ? toppingParts(shown, ' thêm ', ' và ') : tops.length ? [] : [seg(' không thêm gì')]),
      seg(extra), seg(', '), seg(spiceText, 'spice'), seg('!')]);
  }
  candidates.push([seg(lead), seg(clip(dish, 100), 'broth'), seg(tops.length ? ' kèm vài topping' : ''), seg(', '), seg(spiceText, 'spice'), seg('!')]);
  for (const parts of candidates) {
    const merged = mergePlain(parts);
    if (joined(merged).length <= ORDER_MAX) return merged;
  }
  return mergePlain(candidates.at(-1));
}

// ---------------------------------------------------------------------------------------------
// Reviews
//
// Variants are written as 'X|text' where X is the star band the tone fits:
// L = 1–2, M = 3, H = 4–5, N = 1–3, P = 3–5, A = 1–5.
// A review is either a whole sentence or a cause-specific first half plus a second half whose
// tone matches the stars. Placeholders: {dish} {Dish} {topping} {Topping} {spice} {self} {Self}
// {stars}. A variant that needs an empty value (no dish, no topping, spice 0) is skipped.

const BANDS = { L: [1, 2], M: [3, 3], H: [4, 5], N: [1, 3], P: [3, 5], A: [1, 5] };
const coded = list => Object.freeze(list.map(raw => {
  const [min, max] = BANDS[raw[0]];
  return Object.freeze({ min, max, text: raw.slice(2) });
}));

// Second halves after a pleasant first half.
const THEN_GOOD = coded([
  'L|, nhưng tổng thể vẫn chưa làm {self} hài lòng. {stars} sao.', 'L|. Tiếc là mấy thứ khác chưa ổn lắm.',
  'L|, nhưng nói thật là chưa đủ để {self} quay lại.', 'L|. Được mỗi điểm đó thôi.',
  'M|, tổng thể thì tạm ổn. 3 sao.', 'M|. Không có gì để chê nhiều, mà cũng chưa có gì quá đặc sắc.',
  'M|, nếu ra món nhanh hơn chút là thêm sao liền.', 'M|. Ổn áp trong tầm giá.',
  'H|, mê luôn! {stars} sao không cần suy nghĩ.', 'H|. Chắc chắn sẽ rủ bạn bè quay lại.',
  'H|, đúng kiểu quán ruột của {self} rồi.', 'H|. Ủng hộ quán dài dài nha!', 'H|, ăn xong muốn khen liền.',
]);
// Second halves after a complaint.
const THEN_BAD = coded([
  'L|, bực mình ghê. {stars} sao thôi.', 'L|. Thất vọng thiệt sự.', 'L|, chắc {self} tạm biệt quán luôn quá.',
  'L|. Quán xem lại gấp nha, vậy là không ổn.', 'L|, tiền mất mà bụng vẫn buồn.',
  'M|, nhưng mì ăn cũng tạm được. 3 sao.', 'M|. Không tệ, mà cũng chưa làm {self} mê được.',
  'M|, trừ điểm vụ này, còn lại ổn.', 'M|. Cho quán thêm một cơ hội nữa.',
  'H|, nhưng bù lại mì ngon nên {self} bỏ qua.', 'H|, may mà quán xử lý dễ thương nên vẫn chấm cao.',
  'H|. Dù vậy mì vẫn ngon, vẫn {stars} sao nha.', 'H|, thôi thì ăn ngon là được, sẽ quay lại.',
]);
// Second halves for customers who left without eating.
const THEN_LEFT = coded([
  'L|, bụng đói meo mà còn bực. {stars} sao.', 'L|. Chắc {self} không quay lại đâu.', 'L|, đi về tay trắng luôn.',
  'M|. Để hôm khác thử lại xem sao.', 'M|, quán nhìn cũng được mà tiếc ghê. 3 sao.',
  'H|, nhưng quán sạch sẽ, nhân viên dễ thương nên vẫn chấm cao.', 'H|. Hẹn quán hôm khác, nhìn mấy tô bàn bên thèm lắm.',
]);

const cause = (then, whole, first) => Object.freeze({ then, whole: coded(whole), first: freezeList(first) });

const REVIEWS = {
  great: cause(THEN_GOOD, [
    'H|Mì dai, nước dùng đậm, {topping} ngập tô. Quán ruột mới của {self} đây rồi!',
    'H|Ăn tới muỗng nước cuối cùng luôn, {self} hứa tuần sau quay lại!',
    'H|{Dish} chuẩn vị, cay {spice} mà ăn xong vẫn muốn gọi thêm tô nữa.',
    'M|Mì ngon đó, chỉ là {self} kỳ vọng hơi cao. 3 sao, lần tới thử món khác.',
    'L|Công nhận mì ngon, mà hôm nay không hiểu sao {self} ăn không thấy vui.',
  ], ['Nước dùng đậm đà, sợi mì dai vừa tới', '{Dish} lên đúng chuẩn, nóng hổi thơm lừng', 'Tô mì đầy đặn, {topping} tươi rói', 'Chủ quán nấu nhanh mà khéo']),
  ok: cause(THEN_GOOD, [
    'M|Ổn áp, no bụng, giá được. Không có gì để phàn nàn nhiều.',
    'M|Mì ăn được, nước dùng hơi nhạt chút xíu. Tạm 3 sao.',
    'H|Không quá xuất sắc nhưng ăn vui miệng, {self} sẽ ghé lại.',
    'L|Bình thường thôi, ăn xong {self} quên luôn mùi vị.',
  ], ['Mì ăn được, phục vụ cũng nhanh', '{Dish} vừa miệng, không có gì đặc biệt', 'Quán nhỏ mà gọn gàng']),
  meh: cause(THEN_BAD, [
    'L|Nước dùng nhạt như nước lã, {self} phải tự nêm thêm.',
    'M|Không dở, nhưng cũng không để lại ấn tượng gì. Tạm được.',
    'L|{Dish} thiếu lửa, ăn được nửa tô là {self} buông đũa.',
    'H|Hôm nay hơi nhạt, nhưng mấy lần trước ngon nên {self} vẫn tin quán.',
  ], ['Nước dùng hơi nhạt, mì hơi nhão', '{Dish} ăn chưa tới', 'Vị hôm nay không được như lần trước']),
  wait: cause(THEN_BAD, [
    'L|Ngồi đợi tới mọc rễ mới có mì. Đói quá hóa bực luôn.',
    'L|Hai mươi phút cho một tô mì, {self} lướt hết cả bảng tin rồi.',
    'M|Đợi hơi lâu, nhưng mì nóng hổi nên cũng bù được phần nào.',
    'H|Đông khách nên chờ hơi lâu, mà ăn rồi mới thấy đáng đồng tiền.',
  ], ['Đợi gần hai mươi phút mới có mì', 'Quán đông mà có mỗi một nồi luộc, chờ mòn mỏi', '{Self} gọi xong ngồi đếm từng chiếc xe chạy qua']),
  noodle: cause(THEN_BAD, [
    'L|Sợi mì bở tới mức gắp lên là đứt, như ăn cháo mì.',
    'L|Mì còn sống, nhai sựt sựt như nhai dây thun.',
    'M|Nước dùng ngon mà sợi mì luộc chưa tới, tiếc ghê.',
    'H|Mì hơi mềm quá chút, còn lại nước dùng ngon nên vẫn chấm cao.',
  ], ['Sợi mì hôm nay lúc thì sống lúc thì nhũn', 'Mì luộc quá tay, nhão hết cả', '{Dish} ngon mà mì chưa chín tới']),
  pricey: cause(THEN_BAD, [
    'L|Một tô {dish} mà giá như đi nhà hàng, ví {self} khóc thét.',
    'L|Ăn xong nhìn hóa đơn mà hết cay luôn.',
    'M|Mì ngon nhưng giá hơi chát, chắc {self} để dành dịp đặc biệt mới ghé.',
    'H|Giá hơi cao so với mặt bằng, nhưng chất lượng xứng đáng.',
  ], ['Giá hơi chát so với một tô mì cay', 'Thêm có mỗi {topping} mà tiền nhảy vọt', 'Tính tiền xong {self} phải kiểm tra lại số dư tài khoản']),
  wrong: cause(THEN_BAD, [
    'L|Gọi {dish} mà ra món khác, {self} ngơ ngác luôn.',
    'L|{Self} gọi thêm {topping} mà lục tung cả tô không thấy đâu.',
    'M|Lên nhầm món, nhưng quán đổi lại nhanh nên {self} bỏ qua một nửa.',
    'H|Có nhầm chút xíu mà quán sửa liền, thái độ dễ thương quá.',
    'L|Dặn một đằng, bưng ra một nẻo, ăn mà chẳng biết đang ăn món gì.',
  ], ['Lên sai món {self} gọi', 'Bưng ra một tô chẳng giống gì món đã gọi', 'Gọi {dish} mà ra một tô hoàn toàn khác', 'Dặn cay {spice} mà ra mức cay khác hẳn']),
  cheap: cause(THEN_GOOD, [
    'H|Tô mì đầy ắp mà giá sinh viên, {self} ăn mà thấy thương cái ví của quán.',
    'H|Rẻ mà ngon, tìm đâu ra nữa. Hội bạn của {self} sắp kéo tới hết.',
    'M|Giá rẻ thật, chất lượng thì tầm trung. Ăn nhanh cho no thì ok.',
    'L|Rẻ thì rẻ thật, mà rẻ quá {self} lại hơi lo về nguyên liệu.',
  ], ['Giá mềm mà tô mì đầy đặn', 'Ăn no căng bụng mà trả chưa tới năm chục', '{Dish} giá hạt dẻ', 'Thêm {topping} mà tiền vẫn nhẹ nhàng']),
  secret: cause(THEN_GOOD, [
    'H|Nước dùng bí truyền hôm nay đỉnh thật, {self} uống sạch không chừa giọt nào.',
    'H|Không biết quán bỏ gì vào nồi mà thơm dữ vậy. Công thức gia truyền hả trời?',
    'M|Nghe nói có nước dùng bí mật, thử rồi thấy lạ miệng mà chưa mê lắm.',
    'L|Nước dùng bí truyền gì đâu, {self} ăn không thấy khác gì.',
  ], ['Nước dùng bí truyền thơm nức mũi', 'Húp một muỗng nước dùng là biết có bí quyết', '{Dish} hôm nay có vị gì rất lạ mà cuốn', 'Cay {spice} mà vẫn thấy rõ vị ngọt của nước dùng']),
  'app-great': cause(THEN_GOOD, [
    'H|Đặt qua app mà tới nơi mì vẫn nóng, nước dùng gói kỹ không rớt giọt nào.',
    'H|Giao nhanh tới mức {self} chưa kịp dọn bàn. Mì vẫn dai, mười điểm!',
    'M|Giao nhanh, gói ổn, mì hơi nở chút nhưng chấp nhận được.',
    'L|Giao đúng giờ đó, mà mì tới nơi nở hết, không như ăn tại quán.',
  ], ['Đặt app mà mì tới nơi vẫn nóng hổi', 'Shipper giao nhanh, hộp gói kỹ', 'Nước dùng để riêng nên mì không bị nở']),
  walkout: cause(THEN_LEFT, [
    'L|Ngồi chờ mãi không tới lượt, {self} đành về với cái bụng rỗng.',
    'L|Đói quá bỏ về, ghé tiệm bên cạnh ăn đỡ.',
    'M|Chưa kịp ăn đã phải đi vì trễ giờ, hôm khác thử lại xem sao.',
    'H|Hôm nay phải về sớm chưa kịp ăn, nhưng quán dễ thương nên hẹn dịp khác.',
  ], ['Chờ hoài không thấy mì, {self} đành bỏ về', 'Ngồi chờ tới nguội cả hy vọng', 'Đợi mãi chưa tới lượt nên {self} đi trước']),
  'app-late': cause(THEN_BAD, [
    'L|Đặt app mà mì tới nơi nguội ngắt, sợi mì nở thành bánh canh.',
    'L|App báo giao hai mươi phút, {self} đợi gần một tiếng.',
    'M|Giao trễ, nhưng hâm lại vẫn ăn được. Tạm chấp nhận.',
    'H|Giao hơi trễ, bù lại mì vẫn ngon, gói cẩn thận.',
  ], ['Đơn app giao trễ gần một tiếng', 'Mì tới nơi thì đã nguội và nở', 'Ngồi canh app mà mãi chưa thấy ai nhận món']),
  stockout: cause(THEN_BAD, [
    'L|Tới nơi thì hết {topping}, {self} đổi món mà vẫn tiếc.',
    'L|Mới giữa buổi đã hết nguyên liệu, quán bán kiểu gì vậy trời.',
    'M|Hết món {self} thích nên ăn tạm món khác, cũng được.',
    'H|Hết {topping} nhưng quán gợi ý món thay thế ngon không kém.',
  ], ['Quán hết {topping} đúng lúc {self} thèm nhất', 'Tới nơi thì bảng báo hết món', 'Mới chiều mà nhiều món đã hết sạch']),
  'price-walk': cause(THEN_LEFT, [
    'L|Nhìn bảng giá xong {self} lặng lẽ quay xe.',
    'L|Giá cao hơn quán quen của {self} cả chục nghìn, thôi xin kiếu.',
    'M|Định ăn mà giá hơi cao, khi nào có khuyến mãi {self} ghé.',
    'H|Giá hơi cao nên hôm nay chưa ăn, mà quán nhìn sạch đẹp, sẽ quay lại.',
  ], ['Vừa đọc menu xong là {self} quay xe', 'Giá cao hơn {self} nghĩ nhiều', 'Một tô mì mà giá ngang bữa lẩu']),
  dirty: cause(THEN_BAD, [
    'L|Bàn còn dính dầu mỡ, đũa muỗng lấy ra thấy ngại.',
    'L|Sàn nhà trơn trượt, thùng rác đầy tràn. Ăn mà mất cả ngon.',
    'M|Mì ổn mà bàn ghế hơi bẩn, quán lau dọn kỹ hơn chút nha.',
    'H|Mì ngon, chỉ có góc bàn hơi bừa. Dọn thêm chút là hoàn hảo.',
  ], ['Bàn ăn còn dính nước dùng của khách trước', 'Tô đũa nhìn chưa được sạch lắm', 'Góc quán hơi bừa bộn']),
  sick: cause(THEN_BAD, [
    'L|Ăn xong về đau bụng cả tối, không biết nguyên liệu có còn tươi không.',
    'L|Tối đó {self} làm bạn với nhà vệ sinh luôn. Quán kiểm tra lại đồ ăn giùm.',
    'M|Ăn xong hơi đau bụng, chắc tại {self} ham cay {spice}, mà quán cũng xem lại nguyên liệu nha.',
    'H|Về hơi tức bụng chút, chắc do {self} ăn nhanh quá. Mì vẫn ngon.',
  ], ['Về nhà {self} đau bụng cả buổi', 'Ăn xong bụng dạ biểu tình', 'Có miếng {topping} ăn thấy không được tươi']),
  kind: cause(THEN_GOOD, [
    'H|Quên ví mà quán vẫn cho ăn trước trả sau, tử tế quá trời.',
    'H|Thấy {self} cay đỏ mặt, chủ quán mang ra ly trà đá miễn phí. Dễ thương xỉu!',
    'M|Chủ quán dễ thương, mì thì bình thường. Ủng hộ vì cái tình.',
    'L|Chủ quán thì dễ thương đó, mà món ăn chưa hợp với {self} lắm.',
  ], ['Chủ quán hỏi han nhẹ nhàng, còn cho {self} ghi nợ', 'Quán tặng thêm ly trà đá mát lạnh', 'Chủ quán nhớ luôn khẩu vị của {self}']),
  honest: cause(THEN_GOOD, [
    'H|{Self} đưa dư tiền mà quán chạy theo trả lại. Giờ hiếm ai thật thà vậy lắm.',
    'H|Lỡ chuyển khoản dư, quán nhắn trả lại liền. Uy tín!',
    'M|Quán thật thà trả tiền thừa, mì thì ở mức ổn.',
    'L|Được cái quán thật thà, còn mì hôm nay thì chưa ổn.',
  ], ['Quán thối lại đủ từng đồng tiền dư', '{Self} đưa nhầm tờ tiền lớn mà quán nhắc liền', 'Chủ quán thẳng thắn, tính tiền rõ ràng']),
  cheat: cause(THEN_BAD, [
    'L|{Self} đưa dư tiền mà quán im re, về tới nhà mới phát hiện.',
    'L|Hóa đơn tự nhiên dư thêm một món {self} không hề gọi.',
    'M|Tính tiền lộn, nhắc thì quán mới sửa. Mì thì ổn.',
    'H|Tính tiền nhầm chút, nhắc là quán sửa liền nên thôi bỏ qua.',
  ], ['Tính tiền dư mà quán không nói gì', '{Self} đưa dư tiền mà không thấy thối lại', 'Hóa đơn có thêm món lạ hoắc']),
  stingy: cause(THEN_BAD, [
    'L|Gọi thêm {topping} mà đếm được đúng ba miếng. Keo ghê!',
    'L|Xin thêm chút nước dùng cũng tính tiền, hơi kỹ quá rồi đó.',
    'M|Topping hơi ít so với giá, mì thì được.',
    'H|Topping hơi khiêm tốn, nhưng mì ngon nên {self} tha thứ.',
  ], ['Topping bỏ vào tô đếm trên đầu ngón tay', 'Xin thêm ớt cũng bị tính tiền', 'Phần {topping} mỏng như tờ giấy']),
  hair: cause(THEN_BAD, [
    'L|Đang ăn ngon lành thì gắp trúng sợi tóc, hết muốn ăn luôn.',
    'L|Tô mì có thêm topping tóc miễn phí, {self} xin kiếu.',
    'M|Có sợi tóc trong tô, quán đổi tô mới nhanh nên {self} cho 3 sao.',
    'H|Lỡ có sợi tóc nhưng quán xin lỗi và đổi tô mới liền, xử lý có tâm.',
  ], ['Gắp lên thấy nguyên sợi tóc', 'Trong tô {dish} có sợi tóc', 'Đang húp nước dùng thì vướng sợi tóc']),
  noise: cause(THEN_BAD, [
    'L|Loa mở to quá, ngồi cùng bàn mà phải hét mới nghe được nhau.',
    'L|Ồn như cái chợ, ăn tô mì mà ù cả tai.',
    'M|Hơi ồn, nhưng mì ổn. Ăn nhanh rồi về thì được.',
    'H|Quán hơi ồn nhưng vui, đúng chất ăn vặt vỉa hè.',
  ], ['Quán ồn ào quá trời', 'Nhạc mở to tới mức cả bàn không nghe được nhau nói gì', 'Bàn bên cạnh nói chuyện như cãi nhau']),
};

export const REVIEW_CAUSES = Object.freeze(Object.keys(REVIEWS));
const REVIEW_MAX = 180;
const usable = (template, values) => [...template.matchAll(/\{(\w+)\}/g)].every(([, key]) => values[key]);

export function composeReview({ cause, stars, dish = '', topping = '', spice = 0, self = 'mình', random = Math.random, recent = [] } = {}) {
  const rating = clampStars(stars);
  const entry = REVIEWS[cause] || REVIEWS[rating >= 4 ? 'great' : rating === 3 ? 'ok' : 'meh'];
  const who = clip(clean(self) || 'mình', 20), meal = clip(soften(clean(dish)), 32), extra = clip(soften(clean(topping)), 32);
  const level = Math.min(99, Math.max(0, Math.round(Number(spice)) || 0));
  const values = {
    dish: meal, Dish: cap(meal), topping: extra, Topping: cap(extra), spice: level ? `cấp ${level}` : '',
    self: who, Self: cap(who), stars: String(rating),
  };
  const fits = row => rating >= row.min && rating <= row.max && usable(row.text, values);
  const wholes = entry.whole.filter(fits).map(row => row.text);
  const firsts = entry.first.filter(line => usable(line, values));
  const thens = entry.then.filter(fits).map(row => row.text);
  const pairs = firsts.length * thens.length;
  const avoid = new Set(Array.isArray(recent) ? recent : []);
  let firstFit = '', line = '';
  for (let attempt = 0; attempt <= 30; attempt++) { // one pick plus up to 30 rerolls
    let raw;
    if (wholes.length && (!pairs || roll(random) < 0.45)) raw = pick(random, wholes);
    else {
      const index = Math.floor(roll(random) * pairs);
      raw = firsts[Math.floor(index / thens.length)] + thens[index % thens.length];
    }
    line = tidy(fill(raw, values));
    if (line.length > REVIEW_MAX) continue;
    if (!firstFit) firstFit = line;
    if (!avoid.has(line)) return line;
  }
  return firstFit || clip(line, REVIEW_MAX);
}

// ---------------------------------------------------------------------------------------------
// Reply tone

// Accent-insensitive form: NFD, combining marks removed, đ -> d, lower case, words separated by one space.
const fold = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const phrases = list => Object.freeze([...new Set(list.map(fold))]);
// Whole-phrase matches only. Short words that collide with food words once accents are removed
// (ngủ/ngu, trứng cút, đồ hầm, bột) are deliberately left out or used inside longer phrases.
const RUDE = phrases([
  'đồ ngu', 'ngu ngốc', 'óc chó', 'điên khùng', 'bị khùng', 'bị điên', 'đồ điên', 'dở hơi', 'vô duyên', 'mất dạy',
  'mặt dày', 'hỗn láo', 'láo toét', 'bố láo', 'nói xạo', 'ba xạo', 'xạo ke', 'nói xàm', 'bớt xàm', 'xàm xí',
  'nói nhảm', 'tào lao', 'bớt làm màu', 'mặc kệ', 'kệ xác', 'không thích thì', 'đi chỗ khác', 'đừng quay lại',
  'khỏi quay lại', 'thì đừng ăn', 'đừng ăn nữa', 'ráng chịu', 'tự chịu', 'liên quan gì', 'biết gì mà', 'im đi',
  'im mồm', 'câm miệng', 'cút ngay', 'cút xéo', 'biến đi', 'thiếu hiểu biết', 'ảo tưởng', 'chả thèm quan tâm',
  'không thèm quan tâm', 'khó ưa', 'đồ keo', 'stupid', 'idiot', 'shut up', 'whatever',
]);
const POLITE = phrases([
  'cảm ơn', 'cám ơn', 'cảm tạ', 'xin lỗi', 'thành thật', 'dạ vâng', 'vâng ạ', 'rất vui', 'lần sau', 'hẹn gặp lại',
  'trân trọng', 'chân thành', 'rất tiếc', 'thông cảm', 'bỏ qua cho', 'quý khách', 'ghi nhận', 'khắc phục',
  'rút kinh nghiệm', 'rất mong', 'chúc bạn', 'chúc anh', 'chúc chị', 'chúc em', 'chúc cô', 'chúc chú',
  'chúc ngon miệng', 'kính chúc', 'thank', 'thanks', 'thank you', 'sorry', 'please',
]);

export function replyTone(text) {
  const raw = String(text ?? '').normalize('NFC').toLowerCase(), folded = ` ${fold(raw)} `;
  const has = list => list.some(phrase => folded.includes(` ${phrase} `));
  if (has(RUDE)) return 'rude';
  // 'dạ' and 'mong' are single words; unaccented 'da' only counts where a sentence starts, because
  // mid-sentence it is usually 'đã' or 'đá' typed without accents.
  const words = raw.split(/[^\p{L}\p{N}]+/u);
  const starts = raw.split(/[.!?…\n]+/).map(part => part.match(/[\p{L}\p{N}]+/u)?.[0]);
  if (has(POLITE) || words.includes('dạ') || words.includes('mong') || starts.includes('da')) return 'polite';
  return 'neutral';
}

// ---------------------------------------------------------------------------------------------
// Owner reply suggestions

const REPLY_MAX = 120;
// Apologies with a concrete fix, used for 1–3 stars.
const APOLOGIES = {
  great: ['Dạ cảm ơn {you}! Quán sẽ nêm lại nước dùng cho tròn vị hơn, mong lần tới làm {them} hài lòng trọn vẹn ạ.', 'Xin lỗi vì chưa làm {you} ưng hết. Tuần này quán ra thêm topping mới, mời {them} ghé nếm thử nha.', 'Dạ quán ghi nhận ạ. Bếp sẽ canh lửa kỹ hơn cho từng tô, mong {you} cho quán thêm cơ hội.'],
  ok: ['Dạ cảm ơn {you} góp ý. Quán đang chỉnh lại nước dùng cho đậm vị hơn ạ.', 'Xin lỗi vì tô mì chưa đủ ấn tượng. Lần tới quán tặng {you} thêm một phần topping để thử nha.', 'Dạ quán ghi nhận. Bếp sẽ nêm nếm lại và nấu kỹ hơn, mong {you} ghé lại ạ.'],
  meh: ['Dạ quán xin lỗi vì món chưa ngon. Bếp đã nấu lại nồi nước dùng mới, mời {you} ghé thử lại ạ.', 'Xin lỗi {you} nhiều. Quán sẽ nếm kỹ từng nồi trước khi bán, không để vị nhạt nữa ạ.', 'Dạ cảm ơn {you} đã thẳng thắn. Lần tới {them} ghé, quán tặng thêm phần trứng để chuộc lỗi nha.'],
  wait: ['Dạ quán xin lỗi vì để {you} chờ lâu. Quán đã thêm một nồi luộc để ra mì nhanh hơn ạ.', 'Xin lỗi {you} nhiều. Giờ cao điểm quán sẽ có thêm người phụ, không để khách đợi lâu nữa ạ.', 'Dạ quán ghi nhận. Lần tới {you} ghé, quán ưu tiên làm trước và tặng ly trà đá nha.'],
  noodle: ['Dạ quán xin lỗi vì sợi mì chưa chuẩn. Bếp đã canh giờ luộc bằng đồng hồ, không đoán nữa ạ.', 'Xin lỗi {you}, quán sẽ thử từng mẻ mì trước khi ra tô để sợi luôn dai vừa ạ.', 'Dạ cảm ơn {you} góp ý. Từ nay mì chưa đạt là quán nấu lại tô mới liền ạ.'],
  pricey: ['Dạ quán xin lỗi vì giá chưa hợp với {you}. Quán vừa có combo trưa tiết kiệm hơn ạ.', 'Cảm ơn {you} góp ý. Quán sẽ xem lại bảng giá và thêm tô nhỏ giá mềm hơn ạ.', 'Dạ quán ghi nhận. Lần tới {you} ghé, quán tặng thêm topping để bữa ăn đáng tiền hơn nha.'],
  wrong: ['Dạ quán xin lỗi vì lên nhầm món. Từ nay quán đọc lại đơn với khách trước khi nấu ạ.', 'Xin lỗi {you} nhiều. Quán đã dán phiếu ghi món lên từng tô để không nhầm nữa ạ.', 'Dạ quán ghi nhận. Lần tới {you} ghé, tô đầu tiên quán mời, coi như chuộc lỗi nha.'],
  cheap: ['Dạ cảm ơn {you}. Quán sẽ giữ giá mềm mà nâng chất lượng nguyên liệu lên ạ.', 'Xin lỗi vì chưa làm {you} yên tâm. Quán sẽ ghi rõ nguồn nguyên liệu trên menu ạ.', 'Dạ quán ghi nhận. Giá vẫn vậy nhưng phần ăn sẽ chỉn chu hơn, mong {you} ghé lại ạ.'],
  secret: ['Dạ cảm ơn {you} đã thử nước dùng bí truyền. Quán sẽ chỉnh lại cho vị rõ hơn ạ.', 'Xin lỗi vì công thức chưa hợp khẩu vị {you}. Tuần sau quán ra mẻ mới, mời {them} nếm thử nha.', 'Dạ quán ghi nhận ạ. Quán sẽ nêm nước dùng đậm hơn mà vẫn giữ bí quyết riêng.'],
  'app-great': ['Dạ cảm ơn {you} đã đặt qua app. Quán sẽ để mì riêng với nước dùng cho mì khỏi nở ạ.', 'Xin lỗi vì món giao chưa ngon như ăn tại quán. Quán đã đổi sang hộp giữ nhiệt ạ.', 'Dạ quán ghi nhận. Đơn app sẽ có thêm gói ớt riêng và được giao ngay khi nấu xong ạ.'],
  walkout: ['Dạ quán xin lỗi vì để {you} phải về khi chưa kịp ăn. Quán đã thêm bàn và thêm nồi luộc ạ.', 'Xin lỗi {you} nhiều. Giờ quán phát số thứ tự và báo thời gian chờ ngay khi gọi món ạ.', 'Dạ quán ghi nhận. Lần tới {you} ghé, quán mời tô đầu tiên để chuộc lỗi nha.'],
  'app-late': ['Dạ quán xin lỗi vì đơn giao trễ. Quán đã ưu tiên làm đơn app ngay khi nhận ạ.', 'Xin lỗi {you} nhiều. Quán sẽ gói mì và nước dùng riêng để tới nơi vẫn ngon ạ.', 'Dạ quán ghi nhận. Đơn sau của {you} quán miễn phí giao hàng để chuộc lỗi nha.'],
  stockout: ['Dạ quán xin lỗi vì hết món. Từ nay quán nhập thêm hàng mỗi sáng cho đủ cả ngày ạ.', 'Xin lỗi {you} nhiều. Quán sẽ ghi món sắp hết lên bảng để {them} chọn trước ạ.', 'Dạ quán ghi nhận. Quán đã nhờ người đi chợ thêm chuyến chiều để không hết hàng nữa ạ.'],
  'price-walk': ['Dạ quán xin lỗi vì giá chưa hợp. Quán vừa thêm tô nhỏ giá mềm, mong {you} ghé thử ạ.', 'Cảm ơn {you} góp ý. Buổi trưa quán sẽ có giá ưu đãi cho sinh viên và dân văn phòng ạ.', 'Dạ quán ghi nhận. Quán sẽ để bảng giá rõ ngoài cửa cho {you} dễ cân nhắc ạ.'],
  dirty: ['Dạ quán xin lỗi vì bàn ghế chưa sạch. Quán đã phân người lau bàn ngay sau mỗi lượt khách ạ.', 'Xin lỗi {you} nhiều. Tô đũa giờ được tráng nước sôi trước khi dọn ra ạ.', 'Dạ quán ghi nhận. Mỗi tối quán tổng vệ sinh và thay khăn lau mới ạ.'],
  sick: ['Dạ quán rất tiếc và xin lỗi {you}. Quán đã kiểm tra toàn bộ nguyên liệu và bỏ phần sắp hết hạn ạ.', 'Xin lỗi {you} nhiều. Từ nay quán chỉ dùng nguyên liệu nhập trong ngày và bảo quản lạnh kỹ hơn ạ.', 'Dạ quán mong {you} mau khỏe. Quán xin hoàn tiền tô mì và siết lại khâu vệ sinh bếp ạ.'],
  kind: ['Dạ cảm ơn {you} thương quán. Quán sẽ nấu ngon hơn cho xứng với tình cảm của {them} ạ.', 'Xin lỗi vì món ăn chưa hợp khẩu vị. Quán sẽ hỏi kỹ khẩu vị khách trước khi nấu ạ.', 'Dạ quán ghi nhận. Lần tới {you} ghé, quán tư vấn món hợp ý hơn nha.'],
  honest: ['Dạ cảm ơn {you}. Thật thà là chuyện nên làm, quán sẽ nâng chất lượng món ăn nữa ạ.', 'Xin lỗi vì mì chưa ngon. Bếp sẽ nêm nếm lại và canh giờ luộc kỹ hơn ạ.', 'Dạ quán ghi nhận góp ý. Lần tới {you} ghé, quán mời thêm phần topping nha.'],
  cheat: ['Dạ quán thành thật xin lỗi {you}. Quán đã kiểm tra lại và xin hoàn đủ phần tiền dư ạ.', 'Xin lỗi {you} nhiều. Từ nay quán in hóa đơn và đọc lại số tiền trước khi thu ạ.', 'Dạ quán ghi nhận. Quán đã dặn nhân viên đếm tiền thối trước mặt khách ạ.'],
  stingy: ['Dạ quán xin lỗi vì phần ăn chưa đầy đặn. Quán đã tăng lượng topping mỗi tô ạ.', 'Xin lỗi {you}. Từ nay ớt và nước dùng thêm quán đều tặng miễn phí ạ.', 'Dạ quán ghi nhận. Lần tới {you} ghé, quán tặng thêm một phần topping để bù nha.'],
  hair: ['Dạ quán thành thật xin lỗi {you}. Bếp giờ bắt buộc đội nón và buộc tóc khi nấu ạ.', 'Xin lỗi {you} nhiều. Quán đã thêm khâu kiểm tra từng tô trước khi mang ra ạ.', 'Dạ quán ghi nhận. Lần tới {you} ghé, quán mời một tô để chuộc lỗi nha.'],
  noise: ['Dạ quán xin lỗi vì ồn quá. Quán đã vặn nhỏ loa và kê bàn thưa ra ạ.', 'Xin lỗi {you}. Quán sẽ chừa một góc yên tĩnh cho ai muốn ăn thong thả ạ.', 'Dạ quán ghi nhận. Giờ cao điểm quán sẽ tắt nhạc để khách nói chuyện dễ hơn ạ.'],
};
// Warm thanks, used for 4–5 stars.
const THANKS = [
  'Dạ quán cảm ơn {you} nhiều! Hẹn gặp lại {them} ở tô mì tiếp theo nha.', 'Cảm ơn {you} đã ủng hộ! Cả bếp đọc xong vui cả ngày luôn ạ.',
  'Dạ cảm ơn {you}! Lần sau ghé nhớ nhắc quán tặng thêm trứng nha.', 'Rất vui vì {you} thích món của quán. Chúc {them} một ngày thật cay mà thật vui!',
  'Cảm ơn {you} đã dành thời gian đánh giá. Quán sẽ giữ vững phong độ ạ!', 'Dạ quán cảm ơn lời khen của {you}. Mong sớm được nấu cho {them} tô tiếp theo ạ.',
];
const THANKS_FOR = {
  great: 'Dạ cảm ơn {you}! Được khen nước dùng là cả bếp vui nhất rồi ạ.',
  ok: 'Cảm ơn {you} đã chấm điểm cao. Quán sẽ nêm nếm kỹ hơn để lần sau còn ngon hơn ạ.',
  cheap: 'Cảm ơn {you}! Quán sẽ cố giữ giá mềm để {them} ghé thường xuyên ạ.',
  secret: 'Cảm ơn {you} đã mê nước dùng bí truyền. Bí quyết thì quán xin giữ kín nha!',
  'app-great': 'Cảm ơn {you} đã đặt app! Quán sẽ tiếp tục gói kỹ để mì tới tay vẫn nóng ạ.',
  kind: 'Dạ cảm ơn {you}. Khách vui là quán vui, lần sau ghé nhớ ngồi lại trò chuyện nha!',
  honest: 'Cảm ơn {you} đã tin quán. Tiền của khách thì quán trả lại là đương nhiên ạ.',
  wait: 'Cảm ơn {you} đã kiên nhẫn chờ. Quán đang thêm nồi để lần sau nhanh hơn ạ.',
};
const THANKS_UNDERSTANDING = 'Cảm ơn {you} đã thông cảm mà vẫn chấm điểm cao. Quán sẽ làm tốt hơn nữa ạ.';
const COMPLAINTS = new Set(Object.keys(REVIEWS).filter(key => REVIEWS[key].then !== THEN_GOOD));

const hash = value => {
  let h = 2166136261;
  for (const char of value) h = Math.imul(h ^ char.codePointAt(0), 16777619);
  return h >>> 0;
};
// {you} is the full name for the first mention ('Chị Mỹ Linh' -> 'chị Mỹ Linh' mid-sentence; plain
// given names keep their capital) and {them} the short form for later mentions ('chị', 'hai bạn').
function addressee(name) {
  const value = clean(name);
  if (!value) return { you: 'bạn', them: 'bạn' };
  const word = HONORIFICS.find(item => value === item || value.startsWith(`${item} `));
  if (!word) return { you: value, them: 'bạn' };
  return { you: value[0].toLowerCase() + value.slice(1), them: word === 'Cặp đôi' ? 'hai bạn' : word.toLowerCase() };
}
function personal(template, who) {
  const line = fill(template, who);
  return line.length <= REPLY_MAX ? line : clip(fill(template, { you: 'bạn', them: 'bạn' }), REPLY_MAX);
}

export function replySuggestions({ cause, stars, name = '' } = {}) {
  const rating = clampStars(stars), who = addressee(name), you = who.you;
  const key = APOLOGIES[cause] ? cause : rating >= 4 ? 'great' : rating === 3 ? 'ok' : 'meh';
  let pool = APOLOGIES[key];
  if (rating >= 4) {
    const offset = hash(`${key}|${rating}|${you}`) % THANKS.length;
    pool = [THANKS_FOR[key], COMPLAINTS.has(key) ? THANKS_UNDERSTANDING : null,
      ...THANKS.map((_, index) => THANKS[(offset + index) % THANKS.length])].filter(Boolean);
  }
  const out = [];
  for (const template of pool) {
    const reply = personal(template, who);
    if (!out.includes(reply)) out.push(reply);
    if (out.length === 3) break;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Cheeky owner replies and the customer's follow-up

// Cheeky, never insulting, and free of polite markers so replyTone() reads them as rude or neutral.
const SASSY = {
  great: ['Ngon vậy là bình thường thôi, quán quen rồi.', 'Biết mà, tay nghề này đâu phải dạng vừa.'],
  ok: ['Tạm được là còn nương tay đó nha.', 'Ổn thôi hả? Mai quán nấu cho hết hồn luôn.'],
  meh: ['Nhạt thì thêm ớt, tiệm mì cay mà.', 'Vị quán vậy đó, ai hợp thì mê.'],
  wait: ['Mì ngon thì phải đợi, người đẹp cũng vậy thôi.', 'Đợi chút cho bụng đói, ăn mới thấy ngon.'],
  noodle: ['Sợi mì cũng có ngày tâm trạng mà.', 'Mì mềm dễ nhai, đỡ mỏi hàm đó.'],
  pricey: ['Bò Mỹ chứ đâu phải bò hàng xóm, giá vậy là thương lắm rồi.', 'Ngon thì có giá chứ, nguyên liệu đâu có rơi từ trên trời xuống.'],
  wrong: ['Nhầm món là để khám phá vị mới đó.', 'Coi như quán tặng trải nghiệm bất ngờ.'],
  cheap: ['Rẻ vậy mà còn khen, quán phải tăng giá ngay mới được.', 'Rẻ là do quán thương, đừng kể ai nghe nha.'],
  secret: ['Bí truyền thì hỏi gì cũng không khai đâu.', 'Công thức nằm trong đầu chủ quán, khỏi dò.'],
  'app-great': ['Shipper nhà quán chạy nhanh hơn deadline của bạn.', 'Hộp gói kỹ vậy, ship lên sao Hỏa còn nóng.'],
  walkout: ['Đi sớm thì tự thiệt, mì ngon vẫn nằm đây.', 'Không đợi được thì thôi, bàn trống là có người ngồi liền.'],
  'app-late': ['Trễ là do kẹt xe, mì đâu có lỗi.', 'Ngon thì đáng chờ, mì tới là được rồi.'],
  stockout: ['Hết món là do đắt khách, ghé sớm đi.', 'Món ngon đâu có đợi ai, tới sớm mới có.'],
  'price-walk': ['Chưa ăn mà đã chê, uổng cả tô mì ngon.', 'Giá vậy là chuẩn chất lượng rồi, ai tiếc thì ráng chịu.'],
  dirty: ['Quán vừa lau xong, chắc bạn tới hơi sớm.', 'Bàn có chút dầu cho đúng chất quán mì vỉa hè.'],
  sick: ['Ăn cấp cao cho đã rồi đổ tại mì, oan cho quán quá.', 'Bụng yếu thì gọi cấp 1 thôi, đừng ham.'],
  kind: ['Quán dễ thương sẵn rồi, khỏi khen cũng biết.', 'Ghi nợ cho vui, nhớ quay lại trả đó nha.'],
  honest: ['Tiền của ai người đó giữ, quán không ham.', 'Thật thà là mặc định rồi, khỏi khen.'],
  cheat: ['Tính nhầm chút xíu mà làm như chuyện lớn.', 'Tiền lẻ thôi mà, chắc bạn nhớ nhầm rồi.'],
  stingy: ['Topping ít cho thanh đạm, tốt cho sức khỏe.', 'Muốn nhiều thì gọi thêm, quán bán mà.'],
  hair: ['Chắc sợi tóc cũng mê mì quán quá nên nhảy vào luôn.', 'Topping độc quyền đó, không phải ai cũng có.'],
  noise: ['Quán vui thì ồn chút, muốn yên tĩnh thì ghé thư viện.', 'Ồn mới đúng chất mì cay vỉa hè.'],
};
const SASSY_LOW = ['Quán vẫn đông khách như thường nha.', 'Khẩu vị mỗi người mỗi khác, quán nấu kiểu quán.', 'Nói vậy chứ mai chắc lại ghé thôi.', 'Chê thì chê, tô mì vẫn hết sạch.'];
const SASSY_HIGH = ['Biết mà, ăn một lần là ghiền.', 'Khen nữa là quán tăng giá đó.', 'Chấm cao vậy chắc bạn có mắt nhìn.', 'Để quán in đánh giá này dán lên tường.'];

export function sassyReply({ cause, stars, random = Math.random } = {}) {
  const rating = clampStars(stars);
  return pick(random, [...(SASSY[cause] || []), ...(rating >= 4 ? SASSY_HIGH : SASSY_LOW)]);
}

// Grateful after a polite reply, cold (but not insulting) after a rude one, neutral otherwise.
const ANSWERS = {
  polite: {
    L: ['Cảm ơn quán đã trả lời đàng hoàng, mình sẽ cho quán thêm một cơ hội.', 'Thấy quán nhận lỗi vậy mình cũng nguôi rồi, cảm ơn nha.', 'Ok, cảm ơn quán. Hy vọng lần sau ngon hơn.'],
    M: ['Cảm ơn quán nha, lần sau mình ghé thử món khác.', 'Quán trả lời dễ thương ghê, cảm ơn nhiều!'],
    H: ['Dạ cảm ơn quán, mê mì ở đây thật sự!', 'Quán dễ thương quá, nhất định quay lại! Cảm ơn nha.', 'Cảm ơn quán, tuần sau mình rủ cả nhóm tới.'],
  },
  rude: {
    L: ['Trả lời vậy thì mình hiểu rồi.', 'Thái độ vậy chắc khỏi ghé nữa.', 'Đọc xong còn mất vui hơn.'],
    M: ['Ừ, vậy thôi.', 'Mình góp ý thật lòng thôi mà.'],
    H: ['Khen mà cũng bị cà khịa, lạ ghê.', 'Ờ… tự nhiên hết muốn khen.'],
  },
  neutral: {
    L: ['Ừm, để xem hôm khác thế nào.', 'Mình đọc rồi nha.'],
    M: ['Ok quán.', 'Ờ, chắc hôm đó quán đông.'],
    H: ['Ok, vẫn thích mì quán.', 'Hì, đã đọc.'],
  },
};

export function customerAnswer({ tone, stars, random = Math.random } = {}) {
  const lines = ANSWERS[tone === 'polite' || tone === 'rude' ? tone : 'neutral'];
  return pick(random, lines[band(clampStars(stars))]);
}

// ---------------------------------------------------------------------------------------------
// Barks: one short line a guest says out loud (a speech bubble) at a moment of the visit.
//   greet: sitting down · hurry: patience turning red · thanks / thanksGreat: served (5★ for the latter)
//   angry: walking out · wrong: served the wrong dish · tea: thanks for the iced tea · spicy: a bowl of spice 6+
// Students talk casually, aunties warmly, uncles gruff and funny; tourists in simple English and astronauts in
// space talk. Placeholders: {self} {Self} (how the guest calls themselves) and {spice}.

export const BARK_KINDS = Object.freeze(['greet', 'hurry', 'thanks', 'thanksGreat', 'angry', 'wrong', 'tea', 'spicy']);
const BARK_MAX = 32;
const BARK_SELF = { student: 'em', 'young-man': 'anh', 'young-woman': 'chị', regular: 'mình', auntie: 'cô', uncle: 'chú', pair: 'tụi mình', gentleman: 'tôi', tourist: 'I', astronaut: 'tôi' };
const BARKS = {
  default: {
    greet: ['Cho {self} một tô nha!', 'Quán ơi, còn bàn không?', 'Thơm quá, vào ăn thôi!', 'Hôm nay phải ăn mì cay!'],
    hurry: ['Lâu quá vậy quán ơi…', 'Mì của {self} đâu rồi?', 'Sắp đói xỉu rồi nè!', 'Nhanh giùm {self} với!'],
    thanks: ['Cảm ơn quán nha!', 'Ngon đó, cảm ơn nhé!', 'No căng rồi, cảm ơn!'],
    thanksGreat: ['Ngon xuất sắc luôn!', 'Mai {self} quay lại nữa!', 'Mười điểm không có nhưng!', 'Đúng vị, mê thật sự!'],
    angry: ['Thôi, {self} đi quán khác!', 'Đợi hoài, về thôi!', 'Chờ mệt quá rồi đó!'],
    wrong: ['Ơ, {self} đâu gọi món này?', 'Hình như nhầm món rồi!', 'Sai món rồi quán ơi!'],
    tea: ['Trà đá mát ghê, cảm ơn!', 'Ly trà cứu {self} rồi!', 'Cảm ơn ly trà nha!'],
    spicy: ['Cay cấp {spice}, xé lưỡi luôn!', 'Cay mà ghiền quá trời!', 'Nước đâu, cay quá!'],
  },
  student: {
    greet: ['Quán ơi, cho em một tô!', 'Tan học rồi, ăn mì thôi!', 'Em tới rồi nè quán ơi!'],
    hurry: ['Em sắp trễ học thêm rồi!', 'Nhanh xíu nha anh chị ơi!', 'Bụng em kêu ọt ọt rồi…'],
    thanks: ['Ngon nha, cảm ơn quán!', 'Dzui ghê, cảm ơn nhaa!', 'Ăn xong có sức học bài!'],
    thanksGreat: ['Đỉnh nóc kịch trần luôn!', 'Ngon xỉu, mai em rủ bạn!', 'Mười điểm cho quán nha!'],
    angry: ['Thôi em đi uống trà sữa!', 'Chờ lâu quá, em về đây!', 'Hết giờ ra chơi rồi…'],
    wrong: ['Ủa, em đâu gọi món này?', 'Nhầm món rồi anh chị ơi!'],
    tea: ['Trà đá free, quán xịn ghê!', 'Cảm ơn ly trà nhaa!'],
    spicy: ['Cay cấp {spice}, khóc luôn á!', 'Cay mà cuốn dữ trời!'],
  },
  'young-man': {
    greet: ['Cho anh một tô nha em!', 'Tan ca rồi, làm tô mì!'],
    hurry: ['Anh sắp vào ca rồi em ơi!', 'Lẹ giùm anh nha em!'],
    thanks: ['Ngon nha, cảm ơn em!', 'Ổn áp, cảm ơn quán!'],
    thanksGreat: ['Quá đã, anh ghé hoài!', 'Đúng vị luôn, mười điểm!'],
    angry: ['Thôi anh đi, đợi lâu quá!', 'Hết giờ nghỉ trưa rồi…'],
    wrong: ['Em ơi, anh gọi món khác!', 'Ơ, nhầm món rồi em!'],
    tea: ['Trà mát, cảm ơn em nha!'],
    spicy: ['Cay cấp {spice}, quá chất!', 'Cay mà phê quá em ơi!'],
  },
  'young-woman': {
    greet: ['Cho chị một tô nha em!', 'Ui thơm quá, vô ăn thôi!'],
    hurry: ['Chị gấp lắm rồi em ơi!', 'Sắp tới giờ họp rồi nè…'],
    thanks: ['Cảm ơn em, ngon lắm!', 'Vừa miệng ghê, cảm ơn!'],
    thanksGreat: ['Ngon xỉu, chị review liền!', 'Mê quá, mai chị quay lại!'],
    angry: ['Thôi chị về, lâu quá!', 'Chờ nãy giờ mỏi cổ luôn!'],
    wrong: ['Ủa em, chị đâu gọi món này?', 'Nhầm món rồi em ơi!'],
    tea: ['Cảm ơn em, mát ghê!', 'Ly trà xinh xỉu luôn!'],
    spicy: ['Cay muốn xỉu luôn á!', 'Cay cấp {spice}, phê ghê!'],
  },
  auntie: {
    greet: ['Cô ăn một tô nghen con!', 'Thơm quá, cho cô một tô!', 'Con ơi, còn chỗ cho cô hông?'],
    hurry: ['Từ từ cũng được nghen con…', 'Cô hơi đói rồi nghen!', 'Mì của cô sắp có chưa con?'],
    thanks: ['Ngon lắm, cảm ơn con nghen!', 'Con nấu khéo ghê!', 'Cô cảm ơn con nhiều nha!'],
    thanksGreat: ['Ngon như mẹ nấu vậy đó!', 'Cô sẽ dắt cả xóm tới!', 'Trời ơi, ngon dữ thần!'],
    angry: ['Thôi cô về nấu cơm vậy…', 'Cô chờ không nổi nữa rồi.'],
    wrong: ['Con ơi, cô gọi món khác mà!', 'Hình như con lộn món rồi!'],
    tea: ['Cảm ơn con, trà mát ghê!', 'Con dễ thương quá trời!'],
    spicy: ['Cay vầy cô chịu sao nổi!', 'Cay cấp {spice} mà ngon ghê!'],
  },
  uncle: {
    greet: ['Một tô, cay cho đã nghe!', 'Chú tới rồi, nấu lẹ đi!', 'Đói như hồi còn đi lính!'],
    hurry: ['Mì đi đường vòng hả con?', 'Chú già thêm một tuổi rồi!', 'Lẹ lẹ cái coi, đói rồi!'],
    thanks: ['Được đó, khá lắm con!', 'Ừ, ngon. Chú cảm ơn!', 'Ăn được, ăn được!'],
    thanksGreat: ['Hảo hạng! Chú ghé hoài!', 'Ngon hơn bà xã nấu nha!', 'Tay nghề này đáng huy chương!'],
    angry: ['Thôi, chú đi nhậu luôn!', 'Đợi tới Tết chắc? Về!'],
    wrong: ['Ê, chú đâu có gọi món này!', 'Lộn món rồi con ơi!'],
    tea: ['Trà đá hả? Được lắm!', 'Ly trà này chú ghi nhận!'],
    spicy: ['Cay vậy mới đáng đồng tiền!', 'Cấp {spice}? Chuyện nhỏ với chú!'],
  },
  pair: {
    greet: ['Hai đứa tụi mình ăn nha!', 'Hẹn hò bằng mì cay nè!'],
    hurry: ['Tụi mình đói meo rồi nè!', 'Ngồi đếm xe nãy giờ á!'],
    thanks: ['Tụi mình cảm ơn quán nha!', 'Ngon, hai đứa ưng lắm!'],
    thanksGreat: ['Quán ruột của hai đứa đây!', 'Ngon tới mức quên cãi nhau!'],
    angry: ['Thôi, tụi mình đi chỗ khác!', 'Hẹn hò mà đói thế này…'],
    wrong: ['Ơ, tụi mình gọi món khác mà!'],
    tea: ['Trà mát, tụi mình cảm ơn!'],
    spicy: ['Cay tới mức nắm tay luôn!', 'Cay cấp {spice}, hai đứa đỏ mặt!'],
  },
  gentleman: {
    greet: ['Cho tôi một tô, cảm ơn.', 'Chào quán, tôi dùng mì.'],
    hurry: ['Tôi chờ hơi lâu rồi đấy.', 'Quán còn nhớ tô của tôi chứ?'],
    thanks: ['Vừa vặn. Cảm ơn quán.', 'Khá lắm, cảm ơn cháu.'],
    thanksGreat: ['Tuyệt hảo. Tôi sẽ quay lại.', 'Đúng vị xưa. Rất khen!'],
    angry: ['Tôi xin phép về trước.', 'Thật đáng thất vọng.'],
    wrong: ['Hình như nhầm món của tôi.', 'Cháu ơi, tôi gọi món khác.'],
    tea: ['Chu đáo lắm, cảm ơn cháu.'],
    spicy: ['Cay thế này, tôi trẻ lại!', 'Cấp {spice}… tôi còn chịu được.'],
  },
  tourist: {
    greet: ['Hello! One bowl, please!', 'Hi! It smells so good!', 'Xin chào! Noodles please!'],
    hurry: ['Is my bowl coming?', 'So hungry… please!', 'Still waiting, my friend!'],
    thanks: ['Thank you, delicious!', 'Cảm ơn! Very good!', 'Yummy, thank you!'],
    thanksGreat: ['Wow! Best noodles ever!', 'Amazing! 10 out of 10!', 'Perfect! I come back!'],
    angry: ['Sorry, too long. Bye!', 'Too slow, I go now!'],
    wrong: ['Hmm, not my order?', 'Oops, wrong bowl!'],
    tea: ['Iced tea? So kind, thanks!', 'Cảm ơn! Nice tea!'],
    spicy: ['Spicy! Water please!', 'Level {spice}?! So hot!', 'Hot hot hot! Love it!'],
  },
  astronaut: {
    greet: ['Tàu đã cập bến, một tô!', 'Xin phép hạ cánh ăn mì!'],
    hurry: ['Oxy sắp cạn rồi quán ơi!', 'Tô mì còn ở quỹ đạo à?'],
    thanks: ['Nhận hàng thành công!', 'Ngon hơn đồ ăn đóng tuýp!'],
    thanksGreat: ['Ngon vượt dải Ngân Hà!', 'Năm sao, đúng nghĩa đen!'],
    angry: ['Hủy nhiệm vụ, quay về!', 'Hết kiên nhẫn, cất cánh!'],
    wrong: ['Sai tọa độ món rồi!', 'Món này lạc quỹ đạo rồi!'],
    tea: ['Trà đá không trọng lực!', 'Nạp năng lượng thành công!'],
    spicy: ['Cay như lõi mặt trời!', 'Cấp {spice}! Động cơ đỏ lửa!'],
  },
};

/** A short spoken line (at most 32 characters) for a moment of the visit; '' for an unknown kind.
 * One draw from `random` picks the line, so a seeded `random` always gives the same bark. */
export function bark(kind, { persona = 'regular', self, name, spice, random = Math.random } = {}) {
  if (!BARK_KINDS.includes(kind)) return '';
  const lines = (Object.hasOwn(BARKS, persona) ? BARKS[persona] : BARKS.default)[kind] || BARKS.default[kind];
  // Own keys only: a persona such as 'constructor' must not pick up an inherited property.
  const who = clip(clean(self) || (Object.hasOwn(BARK_SELF, persona) ? BARK_SELF[persona] : '') || 'mình', 12), level = Math.round(Number(spice));
  const values = { self: who, Self: cap(who), spice: Number.isFinite(level) && level > 0 ? String(Math.min(level, 99)) : '' };
  const filled = lines.map(line => usable(line, values) ? tidy(fill(line, values)).normalize('NFC') : '');
  const start = Math.floor(roll(random) * lines.length);
  for (let step = 0; step < lines.length; step++) {
    const line = filled[(start + step) % lines.length];
    if (line && line.length <= BARK_MAX) return line;
  }
  // A very long self word: fall back to the generic lines without placeholders.
  return BARKS.default[kind].find(line => !line.includes('{') && line.length <= BARK_MAX) || '';
}
