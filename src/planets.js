// Interplanetary delivery: an original late-game extension of the far-delivery ride. Each planet sets how long the
// flight takes, which space hazards appear, any special condition, what the trip pays, and its colours for drawing.
//
//   duration: seconds of flight at full speed
//   hazards:  relative weights of asteroid, debris and comet obstacles
//   special:  null | 'dust' (gusts nudge the ship sideways) | 'ice' (lane changes drift) | 'ring' (dense debris belt)
//   fee:      what a successful self-flown delivery pays, before the bonus
//   level:    shop level that unlocks the destination
export const PLANETS = Object.freeze([
  Object.freeze({ id: 'moon', name: 'Trạm Trăng Non', blurb: 'Trạm nghiên cứu nhỏ trên mặt trăng gần nhất. Đá vụn lác đác.', duration: 30, hazards: Object.freeze({ asteroid: .75, debris: .25, comet: 0 }), special: null, fee: 60000, level: 9, colors: Object.freeze({ base: '#d9dfe6', shade: '#9aa6b2', accent: '#f7c242' }) }),
  Object.freeze({ id: 'mars', name: 'Sao Hỏa Lẩu Cay', blurb: 'Hành tinh đỏ mê đồ cay. Bão bụi thỉnh thoảng đẩy tàu lệch làn.', duration: 38, hazards: Object.freeze({ asteroid: .55, debris: .2, comet: .25 }), special: 'dust', fee: 90000, level: 9, colors: Object.freeze({ base: '#e0683c', shade: '#a8402a', accent: '#ffd08a' }) }),
  Object.freeze({ id: 'ice', name: 'Băng Tinh Bạc Hà', blurb: 'Thế giới băng mát lạnh. Đổi làn bị trượt, phải căn sớm.', duration: 42, hazards: Object.freeze({ asteroid: .5, debris: .35, comet: .15 }), special: 'ice', fee: 110000, level: 9, colors: Object.freeze({ base: '#8fe3f0', shade: '#3fa7c9', accent: '#ffffff' }) }),
  Object.freeze({ id: 'ring', name: 'Mộc Tinh Vành Khuyên', blurb: 'Hành tinh khí khổng lồ có vành đai. Gần đích là cả một dải mảnh vụn.', duration: 48, hazards: Object.freeze({ asteroid: .3, debris: .55, comet: .15 }), special: 'ring', fee: 140000, level: 10, colors: Object.freeze({ base: '#f2b35e', shade: '#c47a3a', accent: '#f7d9a0' }) }),
  Object.freeze({ id: 'nebula', name: 'Tinh Vân Ớt Đỏ', blurb: 'Đám mây sao rực đỏ xa nhất. Sao chổi lao chéo liên tục.', duration: 55, hazards: Object.freeze({ asteroid: .3, debris: .2, comet: .5 }), special: null, fee: 180000, level: 10, colors: Object.freeze({ base: '#ef4b6f', shade: '#7a2a8a', accent: '#ffb86b' }) }),
]);
export const PLANET_IDS = Object.freeze(PLANETS.map(planet => planet.id));
export const planetById = id => PLANETS.find(planet => planet.id === id) || null;

// Fuel is bought before launch. A full tank lasts the flight with about 15% to spare; smaller loads need the fuel
// canisters collected on the way. Running dry switches to emergency thrusters at 45% speed.
export const FUEL_LOADS = Object.freeze([
  Object.freeze({ id: 'half', label: 'Nửa bình', fuel: 50, cost: 15000 }),
  Object.freeze({ id: 'most', label: 'Ba phần tư', fuel: 75, cost: 25000 }),
  Object.freeze({ id: 'full', label: 'Đầy bình', fuel: 100, cost: 35000 }),
]);
export const CANISTER_FUEL = 20;
export const DRONE_FEE = 30000;
// Flight tiers: perfect (no hits, never ran dry) pays a 30% bonus and lifts the review a star; good (two hits at
// most, never ran dry) pays 10%; anything rougher pays no bonus and costs a star.
export function flightOutcome(planet, { hits, ranOut }) {
  const tier = !ranOut && hits === 0 ? 'perfect' : !ranOut && hits <= 2 ? 'good' : 'rough';
  const bonus = tier === 'perfect' ? Math.round(planet.fee * .3 / 1000) * 1000 : tier === 'good' ? Math.round(planet.fee * .1 / 1000) * 1000 : 0;
  return { tier, bonus, stars: tier === 'perfect' ? 1 : tier === 'good' ? 0 : -1 };
}
