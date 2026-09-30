// Street situations: original text, mechanics measured from the reference game's rules.
// Each choice returns declarative effects that game.js applies; rolls are drawn when the
// situation opens so a reload cannot change the outcome.
//
// Effect vocabulary (all optional):
//   money: ±đồng (negative is an expense, positive is other income)
//   buzz: today's word-of-mouth change; buzzNext: tomorrow's (capped at .5)
//   waiting: ±seconds for seated dine-in customers (penalties never drop below 4 s)
//   slow: seconds of slowed stove;  dirty: true to dirty the floor, false to clean it
//   arrivals: extra dine-in guests now;  tourists: extra tourist guests (double tip)
//   review: { stars, cause } left by a bystander;  targetReview: { stars, cause } by the bound customer
//   targetLeaves: the bound customer leaves without a review;  targetCalm: refill their patience
//   noisy: the bound customer becomes noisy;  spoil: portions of the bound topping thrown out
//   bulk: bowls of an office takeaway (uses broth, noodles and bowls, pays the broth price)
//   text: the outcome message;  tone: 'good' | 'bad' | 'neutral'

const pick = (roll, values) => values[Math.min(values.length - 1, Math.floor(roll * values.length))];

export const STORIES = Object.freeze({
  influencer: {
    art: '📱', title: 'Bạn KOL ghé quán',
    text: () => 'Một bạn làm video ẩm thực muốn ăn miễn phí, đổi lại sẽ quay clip giới thiệu quán.',
    choices: [
      { id: 'treat', label: 'Mời ăn · 40.000đ', effect: ({ rolls }) => rolls[0] < .65
        ? { money: -40000, buzz: .1, buzzNext: .25, text: 'Clip lên xu hướng! Hôm nay và ngày mai quán sẽ đông hơn.', tone: 'good' }
        : { money: -40000, text: 'Bạn ấy ăn ngon miệng, nhưng clip chẳng mấy ai xem.', tone: 'neutral' } },
      { id: 'decline', label: 'Lịch sự từ chối', effect: ({ rolls }) => rolls[0] < .75
        ? { arrivals: 1, text: 'Bạn ấy vui vẻ gọi một tô và trả tiền như mọi người.', tone: 'neutral' }
        : { review: { stars: 2, cause: 'stingy' }, text: 'Bạn ấy phật ý, để lại một đánh giá kém.', tone: 'bad' } },
    ],
  },
  gas: {
    art: '🔥', title: 'Hết ga giữa giờ',
    text: () => 'Bếp chính phụt tắt: bình ga đã cạn đúng lúc quán đang đông.',
    choices: [
      { id: 'refill', label: 'Gọi đổi ga gấp · 60.000đ', effect: () => ({ money: -60000, text: 'Bình ga mới tới trong vài phút, bếp đỏ lửa trở lại.', tone: 'good' }) },
      { id: 'backup', label: 'Dùng bếp phụ nhỏ', effect: () => ({ slow: 40, text: 'Bếp phụ yếu lửa: mì sẽ chín chậm hơn trong một lúc.', tone: 'neutral' }) },
    ],
  },
  power: {
    art: '💡', title: 'Cúp điện',
    text: () => 'Điện tắt phụt, quạt ngừng quay, trong quán nóng hầm hập.',
    choices: [
      { id: 'generator', label: 'Thuê máy phát · 70.000đ', effect: () => ({ money: -70000, text: 'Máy phát nổ giòn, quán sáng đèn trở lại.', tone: 'good' }) },
      { id: 'water', label: 'Mời nước đá · 5.000đ mỗi bàn', effect: ({ seated }) => ({ money: -5000 * seated, waiting: 8, text: 'Ly nước đá mát lạnh giúp khách kiên nhẫn hơn.', tone: 'good' }) },
      { id: 'endure', label: 'Cố chịu một chút', effect: () => ({ waiting: -10, text: 'Khách quạt lấy quạt để, ai cũng sốt ruột hơn.', tone: 'bad' }) },
    ],
  },
  lostchild: {
    art: '🧒', title: 'Bé đi lạc',
    text: () => 'Một bé đứng khóc trước quán, hình như lạc mẹ trong lúc đi chợ.',
    choices: [
      { id: 'search', label: 'Cùng đi tìm mẹ bé', effect: ({ rolls }) => rolls[0] < .7
        ? { waiting: -8, buzz: .1, money: rolls[1] < .5 ? 50000 : 100000, text: 'Mẹ bé tìm được con, rối rít cảm ơn và gửi quán một phong bao.', tone: 'good' }
        : { waiting: -8, buzz: .1, text: 'Hai mẹ con gặp lại nhau, cả xóm khen quán tốt bụng.', tone: 'good' } },
      { id: 'care', label: 'Cho bé ngồi chờ, mời ly sữa · 10.000đ', effect: () => ({ money: -10000, buzz: .08, text: 'Bé ngoan ngoãn ngồi chờ đến khi mẹ quay lại.', tone: 'good' }) },
      { id: 'ignore', label: 'Không để ý', effect: () => ({ buzz: -.1, text: 'Người qua đường xì xào vì quán làm ngơ.', tone: 'bad' }) },
    ],
  },
  rat: {
    art: '🐀', title: 'Chuột chạy qua quán',
    text: () => 'Một chú chuột lao vụt qua gầm bàn, vài khách giật mình.',
    choices: [
      { id: 'chase', label: 'Rượt đuổi ngay', effect: ({ rolls }) => rolls[0] < .3
        ? { waiting: -5, review: { stars: 2, cause: 'dirty' }, text: 'Đuổi được chuột nhưng một khách đã chê quán mất vệ sinh.', tone: 'bad' }
        : { waiting: -5, text: 'Chuột bị đuổi ra khỏi quán, mọi người lại ăn tiếp.', tone: 'neutral' } },
      { id: 'trap', label: 'Đặt bẫy cẩn thận · 25.000đ', effect: () => ({ money: -25000, text: 'Bẫy đã đặt gọn gàng, quán yên tâm bán tiếp.', tone: 'good' }) },
      { id: 'pretend', label: 'Làm như không thấy', effect: ({ rolls }) => rolls[0] < .6
        ? { review: { stars: 1, cause: 'dirty' }, buzz: -.1, text: 'Một khách thấy chuột và để lại một sao.', tone: 'bad' }
        : { text: 'May mà không ai để ý.', tone: 'neutral' } },
    ],
  },
  fire: {
    art: '🍳', title: 'Chảo dầu bốc lửa',
    text: () => 'Chảo phi tỏi bùng lửa cao, cả bếp khét lẹt.',
    choices: [
      { id: 'lid', label: 'Đậy vung dập lửa', effect: () => ({ slow: 8, text: 'Đậy vung đúng bài, lửa tắt ngay. Bếp chỉ chậm một chút.', tone: 'good' }) },
      { id: 'extinguisher', label: 'Dùng bình chữa cháy · 40.000đ', effect: () => ({ money: -40000, text: 'Lửa tắt hẳn, tốn thêm tiền nạp lại bình.', tone: 'neutral' }) },
      { id: 'water', label: 'Tạt nước', effect: () => ({ money: -60000, waiting: -8, text: 'Dầu văng tung tóe, phải dọn dẹp và thay đồ nghề.', tone: 'bad' }) },
    ],
  },
  pipe: {
    art: '🚰', title: 'Vỡ ống nước',
    text: () => 'Ống nước sau bếp bị bể, nước tràn ra lối đi.',
    choices: [
      { id: 'plumber', label: 'Gọi thợ · 80.000đ', effect: () => ({ money: -80000, text: 'Thợ đến sửa gọn gàng, sàn khô ráo.', tone: 'good' }) },
      { id: 'diy', label: 'Tự sửa tạm', effect: ({ rolls }) => rolls[0] < .4
        ? { slow: 20, dirty: true, text: 'Sửa được nhưng sàn vẫn còn đọng nước.', tone: 'bad' }
        : { slow: 20, text: 'Tự sửa ổn, chỉ mất chút thời gian.', tone: 'neutral' } },
      { id: 'later', label: 'Để tối sửa', effect: () => ({ dirty: true, text: 'Nước lênh láng khắp sàn quán.', tone: 'bad' }) },
    ],
  },
  spill: {
    art: '🥣', title: 'Đổ tô nước lèo',
    text: ({ target }) => `${target || 'Một khách'} lỡ tay làm đổ tô nước lèo xuống sàn.`,
    choices: [
      { id: 'mop', label: 'Lau ngay', effect: () => ({ waiting: -5, text: 'Sàn sạch bóng, nhưng khách phải đợi thêm chút.', tone: 'neutral' }) },
      { id: 'staff', label: 'Nhờ nhân viên lau', needsStaff: true, effect: () => ({ slow: 15, text: 'Nhân viên đi lau sàn nên bếp chậm lại một lúc.', tone: 'neutral' }) },
      { id: 'later', label: 'Để lát lau', effect: () => ({ dirty: true, text: 'Sàn trơn và bẩn: khách ngại vào quán hơn.', tone: 'bad' }) },
    ],
  },
  drunk: {
    art: '🍺', title: 'Khách quá chén',
    text: ({ target }) => `${target || 'Một khách'} có vẻ đã say, nói to làm phiền bàn bên.`,
    choices: [
      { id: 'sendhome', label: 'Mời khách về nghỉ', effect: () => ({ targetLeaves: true, text: 'Khách được đưa về an toàn, quán yên tĩnh trở lại.', tone: 'neutral' }) },
      { id: 'ginger', label: 'Mời trà gừng · 5.000đ', effect: ({ rolls }) => rolls[0] < .6
        ? { money: -5000, targetCalm: true, text: 'Ly trà gừng giúp khách tỉnh táo, ngồi chờ ngoan ngoãn.', tone: 'good' }
        : { money: -5000, noisy: true, text: 'Khách vẫn ồn ào, các bàn khác bắt đầu khó chịu.', tone: 'bad' } },
      { id: 'ignore', label: 'Kệ khách', effect: () => ({ noisy: true, text: 'Tiếng ồn khiến các bàn khác sốt ruột hơn.', tone: 'bad' }) },
    ],
  },
  rain: {
    art: '🌧️', title: 'Mưa rào bất chợt',
    text: () => 'Trời đổ mưa to, người đi đường chạy tìm chỗ trú.',
    choices: [
      { id: 'shelter', label: 'Mời vào trú mưa', effect: () => ({ arrivals: 2, buzz: .1, text: 'Vài người trú mưa ngửi thấy mùi mì và gọi luôn một tô.', tone: 'good' }) },
      { id: 'tarp', label: 'Căng bạt che · 30.000đ', effect: () => ({ money: -30000, buzz: .25, text: 'Mái bạt che kín, quán thành điểm trú mưa ấm cúng.', tone: 'good' }) },
      { id: 'ignore', label: 'Kéo cửa lại', effect: () => ({ buzz: -.15, text: 'Người ta đi quán khác trú mưa.', tone: 'bad' }) },
    ],
  },
  tour: {
    art: '🚌', title: 'Xe du lịch dừng chân',
    text: () => 'Một đoàn khách du lịch dừng xe, hướng dẫn viên hỏi quán còn chỗ không.',
    choices: [
      { id: 'host', label: 'Mời cả đoàn vào', effect: () => ({ tourists: 3, text: 'Khách du lịch vào quán, tip gấp đôi nếu vừa miệng!', tone: 'good' }) },
      { id: 'later', label: 'Hẹn đoàn quay lại', effect: () => ({ buzz: .15, text: 'Hướng dẫn viên ghi lại tên quán cho những đoàn sau.', tone: 'good' }) },
      { id: 'decline', label: 'Quán hết chỗ rồi', effect: () => ({ text: 'Xe du lịch chạy tiếp.', tone: 'neutral' }) },
    ],
  },
  party: {
    art: '🏢', title: 'Văn phòng đặt mang về',
    text: ({ bulk }) => `Một văn phòng gần đó muốn đặt ${bulk} tô mang về cho cả phòng.`,
    choices: [
      { id: 'full', label: 'Nhận đủ đơn', effect: ({ bulk }) => ({ bulk, slow: 15, text: `Làm xong ${bulk} tô mang về, bếp bận rộn một lúc.`, tone: 'good' }) },
      { id: 'half', label: 'Nhận một nửa', effect: ({ bulk }) => ({ bulk: Math.max(2, Math.floor(bulk / 2)), slow: 8, text: 'Nhận vừa sức, bếp vẫn kịp phục vụ khách ngồi.', tone: 'neutral' }) },
      { id: 'decline', label: 'Từ chối khéo', effect: () => ({ text: 'Văn phòng đặt quán khác lần này.', tone: 'neutral' }) },
    ],
  },
  celebrity: {
    art: '🌟', title: 'Người nổi tiếng ghé ăn',
    text: () => 'Một ca sĩ quen mặt ghé quán, người hâm mộ kéo đến chật vỉa hè.',
    choices: [
      { id: 'photo', label: 'Xin chụp ảnh treo quán', effect: ({ rolls }) => rolls[0] < .7
        ? { buzzNext: .3, text: 'Tấm ảnh được chia sẻ khắp nơi, mai quán sẽ đông khách.', tone: 'good' }
        : { text: 'Ảnh hơi mờ, không ai để ý mấy.', tone: 'neutral' } },
      { id: 'eat', label: 'Để khách ăn yên tĩnh', effect: () => ({ arrivals: 1, buzz: .1, text: 'Một fan theo chân vào quán gọi mì.', tone: 'good' }) },
      { id: 'special', label: 'Làm tô đặc biệt · 50.000đ', effect: ({ rolls }) => rolls[0] < .6
        ? { money: -50000, buzz: .15, buzzNext: .4, text: 'Tô đặc biệt được khen hết lời trên mạng!', tone: 'good' }
        : { money: -50000, text: 'Khách ăn vui vẻ nhưng không đăng gì lên mạng.', tone: 'neutral' } },
    ],
  },
  sidewalk: {
    art: '📋', title: 'Nhắc nhở lấn vỉa hè',
    text: () => 'Tổ trật tự nhắc quán kê bàn ghế lấn ra vỉa hè.',
    choices: [
      { id: 'tidy', label: 'Dọn gọn ngay', effect: () => ({ waiting: -6, text: 'Bàn ghế đã gọn, khách đợi thêm một chút.', tone: 'neutral' }) },
      { id: 'fine', label: 'Nộp phạt · 100.000đ', effect: () => ({ money: -100000, text: 'Quán nộp phạt và rút kinh nghiệm.', tone: 'bad' }) },
      { id: 'plead', label: 'Xin bỏ qua lần này', effect: ({ rolls }) => rolls[0] < .5
        ? { money: -150000, text: 'Không được châm chước: phạt nặng hơn.', tone: 'bad' }
        : { text: 'Tổ trật tự nhắc nhở rồi đi tiếp.', tone: 'good' } },
    ],
  },
  supplier: {
    art: '🧺', title: 'Nguyên liệu kém tươi',
    text: ({ toppingName }) => `Lô ${toppingName || 'topping'} hôm nay có vẻ không còn tươi.`,
    choices: [
      { id: 'discard', label: 'Bỏ phần kém tươi', effect: ({ rolls }) => ({ spoil: 3 + Math.floor(rolls[1] * 3), text: 'Đã bỏ những phần không đạt, khách ăn yên tâm.', tone: 'neutral' }) },
      { id: 'use', label: 'Vẫn dùng tiếp', effect: ({ rolls }) => rolls[0] < .5
        ? { review: { stars: 1, cause: 'sick' }, buzz: -.15, text: 'Một khách đau bụng và để lại một sao.', tone: 'bad' }
        : { text: 'May quá, không ai phàn nàn.', tone: 'neutral' } },
    ],
  },
  inspection: {
    art: '🧑‍⚕️', title: 'Kiểm tra vệ sinh',
    text: () => 'Đoàn kiểm tra vệ sinh ghé bất ngờ, đúng lúc sàn quán còn bẩn.',
    free: true,
    choices: [
      { id: 'clean', label: 'Lau sàn và mời kiểm tra', effect: ({ rolls }) => rolls[0] < .45
        ? { dirty: false, waiting: -5, money: -120000, text: 'Vẫn bị phạt vì sàn bẩn quá lâu.', tone: 'bad' }
        : { dirty: false, waiting: -5, text: 'Sàn sạch kịp lúc, đoàn kiểm tra hài lòng.', tone: 'good' } },
      { id: 'pay', label: 'Nộp phạt · 80.000đ', effect: () => ({ dirty: false, money: -80000, text: 'Quán nộp phạt và lau sàn ngay.', tone: 'bad' }) },
    ],
  },
});

export const STORY_IDS = Object.freeze(Object.keys(STORIES));
// Stories that happen by themselves through the day. The inspection comes only from a dirty floor.
export const DAY_STORIES = Object.freeze(STORY_IDS.filter(id => id !== 'inspection'));

// Own keys only: a saved id such as "constructor" must never resolve to an inherited property.
const storyById = id => typeof id === 'string' && Object.hasOwn(STORIES, id) ? STORIES[id] : null;
export function storyChoices(storyId, { staff = false } = {}) {
  const story = storyById(storyId);
  return story ? story.choices.filter(choice => !choice.needsStaff || staff).map(({ id, label }) => ({ id, label })) : [];
}
export function storyOutcome(storyId, choiceId, context) {
  const choice = storyById(storyId)?.choices.find(row => row.id === choiceId);
  return choice ? choice.effect(context) : null;
}
export { pick as pickByRoll };
