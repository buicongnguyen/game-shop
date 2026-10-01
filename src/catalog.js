/** Independently authored factual configuration for the local noodle-shop game.
 * Values checked against the public reference on 2026-09-30. No reference code or art.
 */
export const DAY_DURATION = 210;
export const CLOSING_GRACE = 60;
export const BASE_RENT = 40000;
export const BASE_UTILITIES = 15000;
export const STARTING_CASH = 400000;

const freezeRows = rows => Object.freeze(rows.map(row => Object.freeze(row)));
const ingredient = (id, name, kind, price, sellPrice, expiryDays, unlockLevel, unlockPrice, icon, shortName = name, color = null) =>
  ({ id, name, kind, price, sellPrice, expiryDays, unlockLevel, unlockPrice, icon, shortName, color });

export const INGREDIENTS = freezeRows([
  ingredient('bowls', 'Tô và đũa', 'base', 1500, 0, null, 1, 0, '🥣', 'Tô'),
  ingredient('noodles', 'Vắt mì', 'base', 3000, 0, 5, 1, 0, '🍜', 'Mì'),
  ingredient('kimchi', 'Mì cay kim chi', 'broth', 6000, 35000, 1, 1, 0, '🥘', 'Kim chi', '#E4572E'),
  ingredient('tomyum', 'Mì cay tomyum', 'broth', 7000, 39000, 1, 3, 250000, '🍲', 'Tomyum', '#EF8A2A'),
  ingredient('blackbean', 'Mì tương đen cay', 'broth', 6000, 38000, 2, 5, 300000, '🥘', 'Tương đen', '#5A3522'),
  ingredient('cheese', 'Mì cay sữa phô mai', 'broth', 8000, 42000, 1, 7, 400000, '🧀', 'Sữa phô mai', '#F2B35A'),
  ingredient('mushroom_broth', 'Mì cay lẩu nấm', 'broth', 6000, 38000, 1, 4, 280000, '🍄', 'Lẩu nấm', '#B98A5A'),
  ingredient('mala', 'Mì cay mala Tứ Xuyên', 'broth', 8000, 44000, 2, 5, 350000, '🌶️', 'Mala', '#A3211A'),
  ingredient('greenpepper', 'Mì bò tiêu xanh', 'broth', 8000, 43000, 1, 6, 380000, '🫑', 'Tiêu xanh', '#86B24E'),
  ingredient('chickenherb', 'Mì gà lá é', 'broth', 8000, 45000, 1, 8, 420000, '🌿', 'Gà lá é', '#DCC25A'),
  ingredient('crab', 'Mì cay riêu cua', 'broth', 9000, 48000, 1, 9, 480000, '🦀', 'Riêu cua', '#E4733D'),
  ingredient('beef', 'Bò Mỹ', 'topping', 9000, 15000, 1, 1, 0, '🥩'),
  ingredient('sausage', 'Xúc xích', 'topping', 3000, 8000, 3, 1, 0, '🌭'),
  ingredient('greens', 'Rau cải', 'topping', 1500, 5000, 1, 1, 30000, '🥬'),
  ingredient('kimchi_topping', 'Kim chi', 'topping', 1500, 5000, 5, 2, 80000, '🌶️'),
  ingredient('egg', 'Trứng lòng đào', 'topping', 2500, 6000, 2, 2, 100000, '🥚', 'Trứng'),
  ingredient('tofu', 'Đậu hũ', 'topping', 2000, 6000, 2, 2, 90000, '◻️'),
  ingredient('mushroom', 'Nấm kim châm', 'topping', 2000, 6000, 2, 3, 100000, '🍄', 'Nấm'),
  ingredient('corn', 'Bắp ngọt', 'topping', 2000, 5000, 3, 3, 110000, '🌽', 'Bắp'),
  ingredient('fishball', 'Cá viên', 'topping', 2500, 7000, 3, 4, 120000, '🍡'),
  ingredient('cheese_slice', 'Phô mai lát', 'topping', 3000, 8000, 5, 5, 150000, '🧀', 'Phô mai'),
  ingredient('quail_egg', 'Trứng cút', 'topping', 3000, 7000, 3, 5, 160000, '🥚'),
  ingredient('ricecake', 'Bánh gạo', 'topping', 2500, 7000, 3, 6, 200000, '🍘'),
  ingredient('seafood', 'Hải sản', 'topping', 10000, 18000, 1, 8, 300000, '🦐'),
  ingredient('crabstick', 'Thanh cua', 'topping', 2500, 7000, 3, 3, 130000, '🦀'),
  ingredient('beefball', 'Bò viên', 'topping', 3000, 8000, 3, 4, 140000, '🧆'),
  ingredient('fishcake', 'Chả cá Hàn', 'topping', 2500, 7000, 3, 5, 150000, '🍥', 'Chả cá'),
  ingredient('seaweed', 'Rong biển', 'topping', 1500, 5000, 5, 4, 120000, '🌿'),
  ingredient('dumpling', 'Sủi cảo', 'topping', 3500, 9000, 3, 5, 180000, '🥟'),
  ingredient('porkbelly', 'Ba chỉ heo', 'topping', 7000, 13000, 1, 6, 220000, '🥓', 'Ba chỉ'),
  ingredient('crispy_chicken', 'Gà giòn', 'topping', 5000, 11000, 2, 7, 250000, '🍗'),
  ingredient('octopus', 'Bạch tuộc', 'topping', 9000, 16000, 1, 9, 320000, '🐙'),
]);
export const INITIAL_INGREDIENT_IDS = Object.freeze(['bowls', 'noodles', 'kimchi', 'beef', 'sausage']);

const equipment = (id, name, description, price, unlockLevel, icon, extra = {}) =>
  ({ id, name, description, price, unlockLevel, utilities: 6000, icon, ...extra });
const accessory = (id, name, description, price, unlockLevel, icon, extra = {}) =>
  equipment(id, name, description, price, unlockLevel, icon, { utilities: 0, ...extra });
export const UPGRADES = freezeRows([
  equipment('sign', 'Biển đèn MÌ CAY', 'Lượng khách tăng 20%.', 300000, 2, '🪧', { trafficBonus: .20 }),
  equipment('fan', 'Quạt hơi nước', 'Thời gian chờ của khách tăng 25%.', 350000, 3, '🌀', { patienceMultiplier: 1.25 }),
  equipment('wifi', 'Wifi miễn phí', 'Thời gian chờ của khách tăng 12%.', 250000, 2, '📶', { patienceMultiplier: 1.12 }),
  equipment('chair', 'Ghế đệm êm', 'Thời gian chờ của khách tăng 12%.', 350000, 4, '🪑', { patienceMultiplier: 1.12 }),
  equipment('tv', 'Tivi ca nhạc', 'Thời gian chờ của khách tăng 10%.', 450000, 6, '📺', { patienceMultiplier: 1.10 }),
  equipment('stove', 'Bếp lửa lớn', 'Một lượt luộc giảm từ 5,2 xuống 4,2 giây.', 400000, 5, '🔥', { cookDuration: 4.2 }),
  equipment('tiktok', 'Quay clip TikTok', 'Lượng khách tăng 25%.', 500000, 6, '🎬', { trafficBonus: .25 }),
  equipment('table', 'Kê thêm bàn', 'Tăng từ 3 lên 4 bàn phục vụ.', 600000, 7, '🪑', { capacity: 4 }),
  equipment('pot2', 'Nồi luộc thứ hai', 'Có thể luộc hai vắt mì song song.', 700000, 4, '🍲', { pots: 2 }),
  equipment('pot3', 'Nồi luộc thứ ba', 'Có thể luộc ba vắt mì song song.', 1000000, 6, '🍲', { pots: 3, requires: 'pot2' }),
  equipment('delivery', 'Lên app giao hàng', 'Nhận đơn giao hàng; phí ứng dụng 20%.', 500000, 5, '🛵', { fee: .20 }),
  accessory('flyer', 'Tờ rơi quanh trường', 'Lượng khách tăng 10%.', 150000, 2, '📃', { trafficBonus: .10 }),
  accessory('tipjar', 'Hũ tip heo đất', 'Tiền tip cơ bản tăng 50%.', 120000, 2, '🐷', { tipMultiplier: 1.5 }),
  accessory('speaker', 'Loa mời khách', 'Lượng khách tăng 12%.', 250000, 3, '🔊', { trafficBonus: .12 }),
  accessory('luckycat', 'Mèo thần tài', 'Khách hài lòng có 25% cơ hội tip thêm 5.000đ mỗi tô.', 450000, 4, '🐱'),
  accessory('menu', 'Menu màu có hình', 'Ngưỡng giá khiến khách chê tăng 20%.', 400000, 4, '📋', { priceTolerance: 1.2 }),
  accessory('gmap', 'Ghim quán trên bản đồ', 'Lượng khách, gồm đơn giao hàng, tăng 15%.', 350000, 5, '📍', { trafficBonus: .15 }),
  accessory('led', 'Bảng LED chạy chữ', 'Từ khoảng 17 giờ, lượng khách tăng 25%.', 400000, 5, '✨', { eveningTrafficBonus: .25 }),
  accessory('bowlset', 'Bộ tô sứ vẽ tay', 'Khách hài lòng tip thêm 3.000đ mỗi tô.', 600000, 6, '🥣'),
  accessory('kol', 'Mời người review ẩm thực', 'Lượng khách tăng 30%.', 1200000, 8, '📸', { trafficBonus: .30 }),
  equipment('spaceport', 'Bến phi thuyền mini', 'Nhận đơn giao mì liên hành tinh: tự lái phi thuyền, canh nhiên liệu, né thiên thạch.', 2500000, 9, '🚀'),
]);

export const STAFF = freezeRows([
  { id: 'cashier', name: 'Chị Quế', role: 'Thu ngân', description: 'Ngăn khách ăn quỵt và phát hiện thanh toán nhầm.', price: 0, wage: 50000, unlockLevel: 3, icon: '🧾' },
  { id: 'chef', name: 'Bé Ngò', role: 'Phụ bếp luộc mì', description: 'Tự luộc mì, vớt đúng lúc và để vào rổ mì chín.', price: 0, wage: 60000, unlockLevel: 4, icon: '👩‍🍳' },
  { id: 'waiter', name: 'Bé Nghệ', role: 'Chạy bàn', description: 'Khách mất kiên nhẫn chậm hơn 15%; giúp dọn mì bị đổ.', price: 0, wage: 60000, unlockLevel: 5, icon: '🙋' },
  { id: 'buyer', name: 'Cô Hồi', role: 'Đi chợ', description: 'Mua thêm 5 phần khi hết món, tối đa 4 chuyến mỗi ngày.', price: 0, wage: 70000, unlockLevel: 6, icon: '🧺' },
  { id: 'broth', name: 'Anh Sả', role: 'Phụ bếp nước dùng', description: 'Lấy tô là tự múc nước dùng đúng đơn đang chọn.', price: 0, wage: 80000, unlockLevel: 7, icon: '🥘' },
  { id: 'topping', name: 'Bé Tía Tô', role: 'Phụ bếp topping', description: 'Tự thêm topping khi tô có đúng nước dùng của đơn đang chọn.', price: 0, wage: 90000, unlockLevel: 8, icon: '🥢' },
]);

const decoration = (id, name, type, price, unlockLevel, value, icon, extra = {}) =>
  ({ id, name, type, price, unlockLevel, value, icon, ...extra });
export const DECORATIONS = freezeRows([
  decoration('awning_red', 'Đỏ ớt', 'awning', 0, 1, '#EF4B3F', '🔴', { shadow: '#C23328' }),
  decoration('awning_pink', 'Hồng dâu', 'awning', 80000, 2, '#F27A9B', '🌸', { shadow: '#C95273' }),
  decoration('awning_mint', 'Xanh bạc hà', 'awning', 80000, 3, '#3FAE92', '🌿', { shadow: '#2A8069' }),
  decoration('awning_yellow', 'Vàng trứng', 'awning', 80000, 4, '#E9A62C', '🌻', { shadow: '#B97E12' }),
  decoration('awning_purple', 'Tím khoai môn', 'awning', 80000, 6, '#9C7BD4', '💜', { shadow: '#7457A8' }),
  decoration('pet_cat', 'Mèo mướp Mochi', 'pet', 250000, 6, 'cat', '🐈'),
  decoration('pet_dog', 'Cún shiba Bơ', 'pet', 300000, 8, 'dog', '🐕'),
  decoration('pet_hamster', 'Hamster Đậu', 'pet', 180000, 4, 'hamster', '🐹'),
  decoration('plant_cactus', 'Chậu xương rồng', 'plant', 60000, 2, 'cactus', '🌵'),
  decoration('plant_leaf', 'Cây trầu bà', 'plant', 90000, 4, 'leaf', '🪴'),
  decoration('plant_daisy', 'Chậu hoa cúc', 'plant', 70000, 3, 'daisy', '🌼'),
  decoration('lamp_lantern', 'Đèn lồng đỏ', 'lamp', 120000, 3, 'lantern', '🏮'),
  decoration('lamp_chime', 'Chuông gió', 'lamp', 90000, 5, 'chime', '🎐'),
]);

export const LEVELS = freezeRows([
  { level: 1, xp: 0, title: 'Xe đẩy vỉa hè' },
  { level: 2, xp: 150, title: 'Xe đẩy vỉa hè' },
  { level: 3, xp: 450, title: 'Quán cóc' },
  { level: 4, xp: 900, title: 'Quán cóc' },
  { level: 5, xp: 1500, title: 'Tiệm nhỏ' },
  { level: 6, xp: 2300, title: 'Tiệm nhỏ' },
  { level: 7, xp: 3300, title: 'Tiệm nổi tiếng' },
  { level: 8, xp: 4500, title: 'Tiệm nổi tiếng' },
  { level: 9, xp: 6000, title: 'Vua mì cay' },
  { level: 10, xp: 8000, title: 'Vua mì cay' },
]);

const event = (id, name, description, traffic, extra = {}) =>
  ({ id, name, description, traffic, patience: 1, costMultiplier: 1, ...extra });
export const DAILY_EVENTS = freezeRows([
  event('rain', 'Trời mưa', 'Khách tăng 35%; đơn giao hàng đến nhanh gấp đôi.', 1.35, { deliveryRate: 2, icon: '🌧️' }),
  event('hot', 'Nắng nóng', 'Khách giảm 20% và thường chọn ít cay.', .8, { icon: '☀️' }),
  event('weekend', 'Cuối tuần', 'Khách tăng 25%; dễ gặp nhóm khách.', 1.25, { icon: '🎉' }),
  event('challenge', 'Thử thách cấp 7', 'Khách tăng 15%; món cấp 7 có tip cơ bản gấp đôi.', 1.15, { icon: '🌶️' }),
  event('students', 'Học sinh tan học', 'Một nhóm học sinh xuất hiện vào giữa ngày.', 1, { icon: '🎒' }),
  event('reviewer', 'Reviewer ghé quán', 'Một khách đặc biệt có đánh giá được tính ba lần.', 1, { icon: '📸' }),
  event('sale', 'Chợ đầu mối giảm giá', 'Một nguyên liệu được chọn có giá nhập giảm 30%.', 1, { costMultiplier: .7, costScope: 'selectedIngredient', icon: '🏷️' }),
  event('cold', 'Gió mùa về', 'Khách tăng 30% và thích món cay hơn.', 1.3, { icon: '🍃' }),
  event('payday', 'Ngày lãnh lương', 'Khách tăng 10%; tiền tip gấp đôi.', 1.1, { tipMultiplier: 2, icon: '💰' }),
  event('festival', 'Lễ hội ẩm thực', 'Lượng khách tăng 45%.', 1.45, { icon: '🎊' }),
]);
