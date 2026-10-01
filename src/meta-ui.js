// Meta screens around the game: the terms-of-play gate, the what's-new card, install help and the mascot's tips.
// Every screen renders into the app's one <dialog> through ctx.openModal (fixed header, scrolling .modal-content,
// pinned .modal-actions) and wires, then removes, its own listeners, like the mini-games in minigames-ui.js.
// All wording is original Vietnamese written for this project. New classes use the meta- prefix; their styles are
// in META_CSS at the end of this file.
import { esc } from './ui.js';
import { formatMoney, TEA_COST, RIDE_FEE, STAFF, UPGRADES } from './game.js';
import { mascot } from './art/people.js';

export const TERMS_VERSION = 1, TERMS_DATE = '01/10/2026';
export const PROJECT_URL = 'https://github.com/buicongnguyen/game-shop';
const TERMS_TITLE = 'Điều khoản chơi game', DECLINE_TITLE = 'Tiệm sẽ chờ bạn';
const freezeRows = rows => Object.freeze(rows.map(row => Object.freeze(row)));

// ---- Shared plumbing

// Each screen keeps one set of listeners per dialog; showing it again, or finishing it, removes the old set.
const wired = new WeakMap();
function listen(dialog, key, entries) {
  off(dialog, key);
  const live = entries.filter(([target]) => target?.addEventListener);
  for (const [target, type, handler, capture = false] of live) target.addEventListener(type, handler, capture);
  if (!wired.has(dialog)) wired.set(dialog, new Map());
  wired.get(dialog).set(key, () => { for (const [target, type, handler, capture = false] of live) target.removeEventListener(type, handler, capture); });
}
function off(dialog, key) { const map = wired.get(dialog), remove = map?.get(key); if (remove) { map.delete(key); remove(); } }
const actionOf = (dialog, event) => { const button = event.target?.closest?.('[data-action]'); return button && !button.disabled && dialog.contains(button) ? button : null; };
const mascotArt = (ctx, mood, key) => ctx.mascotSVG ? ctx.mascotSVG(mood, key) : mascot(mood, { idPrefix: `meta-${key}-` });

// ---- 1. Terms of play: a versioned gate before entering the shop, and a read-only copy for Settings.

const TERMS_INTRO = 'Chào bạn! Trước khi nhóm bếp, mời bạn đọc qua mười điều nhỏ dưới đây. Tóm gọn lại: đây là trò chơi miễn phí, chạy ngay trên máy của bạn và không gửi gì đi đâu cả.';
export const TERMS = freezeRows([
  { title: 'Miễn phí trọn vẹn', text: 'Tiệm Mì Cay là trò chơi miễn phí. Trong game không có mua bán, không có quảng cáo, không có quà tặng hay giải thưởng thật.' },
  { title: 'Tiền trong game chỉ để chơi', text: 'Tiền, nguyên liệu, nâng cấp và đồ trang trí trong tiệm đều là đồ ảo. Chúng không có giá trị thật và không đổi được ra tiền hay món đồ nào ngoài đời.' },
  { title: 'Mọi lứa tuổi đều chơi được', text: 'Trò chơi hợp với mọi lứa tuổi. Nếu bạn dưới 16 tuổi, hãy chơi khi bố mẹ hoặc người giám hộ đã đồng ý. Nhớ nghỉ mắt, vươn vai; chơi chừng 3 tiếng trong ngày rồi thì để mai mở tiệm tiếp nhé.' },
  { title: 'Tiệm được lưu trên trình duyệt này', text: 'Tiến trình chỉ được lưu trong trình duyệt bạn đang dùng. Vào menu ☰ để xuất bản lưu ra tệp, hoặc nhập lại khi đổi máy. Xóa dữ liệu trình duyệt sẽ xóa luôn tiệm, nên thỉnh thoảng hãy cất một bản dự phòng.' },
  { title: 'Không dữ liệu nào rời khỏi máy', text: 'Trò chơi không có tài khoản, không có máy chủ, không có công cụ thống kê hay theo dõi. Không thông tin nào của bạn được gửi đi đâu cả.' },
  { title: 'Hàng xóm là nhân vật trong game', text: 'Những người hàng xóm, lời nhắn của họ và bảng tin khu phố đều do trò chơi tạo ra. Họ không phải người chơi thật, và cũng không ai khác nhìn thấy tiệm của bạn.' },
  { title: 'Tên tiệm là của riêng bạn', text: 'Tên tiệm bạn đặt chỉ nằm trên máy này và không được chia sẻ với ai. Cứ chọn một cái tên thật vui, không cần dùng tên thật hay thông tin cá nhân.' },
  { title: 'Chơi đẹp', text: 'Bản lưu là của bạn, muốn chơi theo cách nào cũng được. Có điều, bản lưu bị sửa tay có thể sẽ không mở được nữa.' },
  { title: 'Một bản tái hiện độc lập', text: 'Tiệm Mì Cay là bản tái hiện do người hâm mộ tự làm, với mã nguồn, hình vẽ, lời thoại và âm thanh hoàn toàn mới. Dự án không liên kết, cũng không được tài trợ hay bảo trợ bởi những người làm ra trò chơi đã truyền cảm hứng cho nó.' },
  { title: 'Thay đổi và liên hệ', text: 'Khi điều khoản thay đổi, trò chơi sẽ hiện lại trang này và xin bạn đồng ý lần nữa trước khi vào tiệm. Góp ý hay báo lỗi, mời bạn ghé trang GitHub của dự án:', link: { href: PROJECT_URL, label: PROJECT_URL.replace(/^https?:\/\//, '') } },
]);

export function termsAccepted(prefs) { return !!prefs?.terms && Number(prefs.terms.version) >= TERMS_VERSION; }

// The terms text: a small "updated" line, a short welcome and the numbered sections (numbers are drawn by CSS).
export function termsBodyHTML(sections = TERMS) {
  // A long address may only wrap after its slashes.
  const link = item => item && /^https?:\/\//.test(item.href) ? ` <a href="${esc(item.href)}" target="_blank" rel="noopener noreferrer">${esc(item.label).split('/').join('/<wbr>')}</a>` : '';
  return `<p class="meta-updated">Cập nhật ngày ${esc(TERMS_DATE)} · phiên bản ${TERMS_VERSION}</p><p>${esc(TERMS_INTRO)}</p>`
    + `<ol class="meta-terms">${sections.map(section => `<li><h3>${esc(section.title)}</h3><p>${esc(section.text)}${link(section.link)}</p></li>`).join('')}</ol>`;
}
// The pinned footer: the agreement box sits with the buttons, so it never scrolls away on a small phone.
function gateActionsHTML() {
  return '<label class="meta-agree"><input type="checkbox" data-terms-agree><span>Tôi đã đọc và đồng ý với các điều khoản trên</span></label>'
    + '<button class="secondary meta-act" data-action="terms-decline">Không đồng ý</button>'
    + '<button class="primary meta-act" data-action="terms-accept" disabled>Vào tiệm →</button>';
}
function declineHTML(art) {
  return `<div class="summary-hero"><div class="hero-mascot">${art}</div><h3>Tiếc quá…</h3></div><p>Bạn cần đồng ý với điều khoản thì mới vào tiệm được.</p><p>Đừng lo: tiến trình của bạn vẫn nằm yên trên máy này, không mất đi đâu cả.</p><p class="muted">Khi nào sẵn sàng, hãy đọc lại và đánh dấu đồng ý nhé.</p>`;
}
function acceptedDate(value) {
  if (value === null || value === undefined || value === '' || value === 0 || value === false) return '';
  const date = value instanceof Date ? value : new Date(typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
}
export function termsCopyHTML(acceptedAt, sections = TERMS) {
  const date = acceptedDate(acceptedAt);
  return (date ? `<p class="meta-accepted">✓ Bạn đã đồng ý ngày ${esc(date)}</p>` : '<p class="meta-accepted is-pending">Bạn chưa đồng ý với bản điều khoản này.</p>') + termsBodyHTML(sections);
}

// The gate has no × and ignores Escape. The box enables "Vào tiệm"; declining shows the sad mascot, whose only
// button brings the terms back. onAccept({ version, at }) runs after the gate has let go of the dialog, so the
// caller can close it and continue. Returns a release function that drops the gate without closing the dialog.
export function showTermsGate(ctx, { onAccept } = {}) {
  const { dialog } = ctx; let view = 'gate', done = false;
  function render() {
    dialog.dataset.locked = 'terms';
    if (view === 'gate') ctx.openModal(TERMS_TITLE, termsBodyHTML(), gateActionsHTML(), { wide: true });
    else ctx.openModal(DECLINE_TITLE, declineHTML(mascotArt(ctx, 'sad', 'terms')), '<button class="primary" data-action="terms-reread">Đọc lại điều khoản</button>');
    const close = dialog.querySelector('.modal-close'); if (close) close.hidden = true;
    // Start keyboard users in the text (arrow keys scroll it); on the sad card, on its only button.
    const content = dialog.querySelector('.modal-content'); if (content && view === 'gate') content.tabIndex = -1;
    (view === 'gate' ? content : dialog.querySelector('[data-action="terms-reread"]'))?.focus?.({ preventScroll: true });
  }
  function finish() { if (done) return; done = true; off(dialog, 'terms'); delete dialog.dataset.locked; }
  const onClick = event => {
    const button = actionOf(dialog, event), action = button?.dataset.action;
    if (action === 'terms-accept') {
      if (!dialog.querySelector('[data-terms-agree]')?.checked) return;
      finish(); ctx.sfx?.('success'); onAccept?.({ version: TERMS_VERSION, at: Date.now() });
    } else if (action === 'terms-decline') { view = 'declined'; render(); ctx.sfx?.('fail'); }
    else if (action === 'terms-reread') { view = 'gate'; render(); ctx.sfx?.('pageTurn'); }
  };
  const onChange = event => {
    if (!event.target?.matches?.('[data-terms-agree]')) return;
    const enter = dialog.querySelector('[data-action="terms-accept"]'); if (enter) enter.disabled = !event.target.checked;
    ctx.sfx?.('tap');
  };
  listen(dialog, 'terms', [
    [dialog, 'click', onClick],
    [dialog, 'change', onChange],
    [dialog, 'cancel', event => event.preventDefault()],
    // Chrome lets a second Escape in a row close a dialog even when 'cancel' is prevented, so stop the key itself,
    // and if the dialog is closed anyway, open the gate again.
    [dialog.ownerDocument ?? globalThis.document, 'keydown', event => { if (event.key === 'Escape') event.preventDefault(); }, true],
    [dialog, 'close', () => { if (!done) render(); }],
  ]);
  render();
  return finish;
}

// Settings' read-only copy: when (or whether) the terms were accepted, and a way back.
export function showTermsCopy(ctx, { acceptedAt, onBack } = {}) {
  const { dialog } = ctx;
  ctx.openModal(TERMS_TITLE, termsCopyHTML(acceptedAt), '<button class="secondary" data-action="terms-back">Quay lại Cài đặt</button>', { wide: true });
  listen(dialog, 'terms-copy', [
    [dialog, 'click', event => { if (actionOf(dialog, event)?.dataset.action !== 'terms-back') return; off(dialog, 'terms-copy'); onBack?.(); }],
    [dialog, 'close', () => off(dialog, 'terms-copy')],
  ]);
}

// ---- 2. What's new: one card per release for returning players, newest release first.

const chefLevel = STAFF.find(item => item.id === 'chef')?.unlockLevel ?? 4;
const portLevel = UPGRADES.find(item => item.id === 'spaceport')?.unlockLevel ?? 9;
export const NEWS = Object.freeze([
  { version: 4, date: '01/10/2026', items: freezeRows([
    { lead: 'Khu phố có hồn', text: 'chim sẻ ghé mái hiên, người đi bộ, xe máy chạy ngang, nắng mưa đổi thay ngay trước cửa tiệm.' },
    { lead: 'Gian bếp rộn ràng', text: 'thêm nhiều chi tiết nhỏ sống động quanh nồi mì và quầy bếp.' },
    { lead: 'Chuyện tình trong bếp', text: 'Bé Ngò luộc mì và Anh Sả nấu nước dùng có câu chuyện riêng, kể cả những hôm xin nghỉ.' },
    { lead: 'Hàng xóm dễ thương', text: 'những người hàng xóm trong game thỉnh thoảng gửi bất ngờ sang tiệm, kèm một bảng tin khu phố.' },
    { lead: 'Cài lên màn hình chính', text: 'mở tiệm toàn màn hình chỉ bằng một chạm và chơi được cả khi không có mạng.' },
  ]) },
  { version: 3, date: '01/10/2026', items: freezeRows([
    { lead: 'Món nào cũng có hình', text: 'mọi đồ vật, khách và nhân viên đều được vẽ tay mới hoàn toàn.' },
    { lead: 'Con phố theo giờ', text: 'phố sau lưng khách đổi từ sáng sớm tới tối mịt, trời mưa thì phố cũng mưa.' },
    { lead: 'Tự chạy xe giao xa', text: 'đơn ở xa thì lên xe máy, né ổ gà và vũng nước để giao tận tay.' },
    { lead: 'Phi thuyền giao mì', text: `từ cấp ${portLevel}, bay tới năm hành tinh, canh nhiên liệu và né thiên thạch dọc đường.` },
  ]) },
  { version: 2, date: '01/10/2026', items: freezeRows([
    { lead: 'Chuyện đầu phố', text: 'những tình huống bất ngờ: bình ga cạn, đoàn du khách ghé, đoàn kiểm tra tới bất chợt…' },
    { lead: 'Khách mặc cả', text: 'có khách ăn xong xin bớt tiền; chiều khách, giữ giá hay mời trà là tùy bạn.' },
    { lead: 'Hết món không lo', text: 'nhập gấp, mời khách đổi món hoặc bỏ bớt topping khi nguyên liệu cạn.' },
    { lead: 'Đánh giá và hồi âm', text: 'khách để lại lời nhận xét; trả lời khéo có khi được nâng sao.' },
    { lead: 'Âm thanh tự tổng hợp', text: 'tiếng bếp và nhạc nền được tạo ngay trong trình duyệt.' },
  ]) },
].map(entry => Object.freeze(entry)));
export const NEWS_VERSION = Math.max(...NEWS.map(entry => entry.version));

// Items of every release newer than lastSeen, newest release first, at most `limit` of them.
export function newsFor(lastSeen = 0, limit = 9) {
  const seen = Number.isFinite(Number(lastSeen)) ? Number(lastSeen) : 0;
  return [...NEWS].filter(entry => entry.version > seen).sort((a, b) => b.version - a.version)
    .flatMap(entry => entry.items.map(item => ({ version: entry.version, lead: item.lead, text: item.text }))).slice(0, Math.max(0, limit));
}
export function newsHTML(items, { mascotSVG = '', date = '' } = {}) {
  return `<div class="summary-hero"><div class="hero-mascot meta-bob">${mascotSVG}</div><h3 class="meta-balance">Tin nóng hổi, vừa thổi vừa xem!</h3>${date ? `<p>Bản cập nhật ngày ${esc(date)}</p>` : ''}</div>`
    + `<ul class="meta-news">${items.map(item => `<li><strong>${esc(item.lead)}:</strong> ${esc(item.text)}</li>`).join('')}</ul>`;
}
// The card closes with the app's own close-modal action, so the morning chain carries on afterwards.
// Returns false (and opens nothing) when there is nothing new, so only queue it when newsFor(lastSeen) has items.
export function showNews(ctx, lastSeen = 0) {
  const items = newsFor(lastSeen); if (!items.length) return false;
  const date = NEWS.find(entry => entry.version === items[0].version)?.date || '';
  ctx.openModal('Có gì mới ở tiệm?', newsHTML(items, { mascotSVG: mascotArt(ctx, 'happy', 'news'), date }), '<button class="primary" data-action="close-modal">Tuyệt quá, tiếp tục →</button>');
  return true;
}

// ---- 3. Install help: two step rows with drawn icon tiles (docs/ART-STYLE.md), the player's platform first.

const OUTLINE = '#4a2a22';
const tile = inner => `<svg class="meta-tile" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="10" fill="#fff3dc"/><path d="M38 21v7a10 10 0 0 1-10 10h-7c9-1.5 15.5-8 17-17z" fill="#ffe1ad"/><rect x="2" y="2" width="36" height="36" rx="10" fill="none" stroke="${OUTLINE}" stroke-width="2"/><path d="M6.5 12q.8-4.6 5.5-5.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".8"/>${inner}</svg>`;
const SHARE_PATH = 'M15.5 17H13a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V19a2 2 0 0 0-2-2h-2.5M20 24V8.5M15.5 13 20 8.5l4.5 4.5';
const SHARE_TILE = tile(`<g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${SHARE_PATH}" stroke="${OUTLINE}" stroke-width="5"/><path d="${SHARE_PATH}" stroke="#4aa9e8" stroke-width="2.4"/></g>`);
const MENU_TILE = tile(`<g fill="#e8402f" stroke="${OUTLINE}" stroke-width="1.8">${[11, 20, 29].map(y => `<circle cx="20" cy="${y}" r="3.8"/>`).join('')}</g><g fill="#fff" opacity=".6">${[11, 20, 29].map(y => `<circle cx="18.7" cy="${y - 1.3}" r="1.2"/>`).join('')}</g>`);
const SHARE_GLYPH = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H16M12 14V3M8.5 6.5 12 3l3.5 3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const INSTALL_ROWS = {
  ios: { tile: SHARE_TILE, title: 'iPhone, iPad · Safari', steps: 'Chạm <b>Chia sẻ</b> → <b>Thêm vào Màn hình chính</b> → <b>Thêm</b>. Trên iOS mới, nút Chia sẻ nằm trong menu <b>⋯</b>.' },
  android: { tile: MENU_TILE, title: 'Android · Chrome', steps: 'Chạm menu <b>⋮</b> → <b>Cài đặt ứng dụng</b> (hoặc <b>Thêm vào màn hình chính</b>) → <b>Cài đặt</b>.' },
};
const osOf = platform => /ios|ipad|iphone/i.test(String(platform ?? '')) ? 'ios' : /android/i.test(String(platform ?? '')) ? 'android' : 'other';
// Once installed, the steps are only for other devices, so no row is marked as this one.
export function installHTML({ platform = 'other', standalone = false } = {}) {
  const os = osOf(platform), order = os === 'android' ? ['android', 'ios'] : ['ios', 'android'], mine = standalone ? '' : os;
  const lead = standalone
    ? '<p class="meta-note">Tiệm đã nằm trên màn hình chính của máy này rồi! Muốn cài trên máy khác, làm theo các bước dưới đây.</p>'
    : '<p>Mở tiệm chỉ bằng một chạm: chơi toàn màn hình, không còn thanh địa chỉ, và vẫn nấu mì được cả khi mất mạng.</p>';
  const rows = order.map(id => { const row = INSTALL_ROWS[id]; return `<li class="meta-step${id === mine ? ' is-current' : ''}">${row.tile}<div><h3>${row.title}${id === mine ? '<span class="meta-chip">Máy của bạn</span>' : ''}</h3><p>${row.steps}</p></div></li>`; }).join('');
  return `${lead}<ol class="meta-steps">${rows}</ol>${os === 'other' ? '<p class="muted">Trên máy tính, Chrome và Edge có nút cài đặt ngay trên thanh địa chỉ.</p>' : ''}`;
}
// 'Cài ngay' appears only when the browser has offered an install prompt. It calls onPrompt() right inside the tap
// (browsers only show their prompt during a user gesture) and stays disabled unless onPrompt fails.
export function showInstall(ctx, { canPrompt = false, onPrompt, platform = 'other', standalone = false } = {}) {
  const { dialog } = ctx, offer = !!canPrompt && !standalone && typeof onPrompt === 'function';
  ctx.openModal('Đặt tiệm lên màn hình chính', installHTML({ platform, standalone }), offer
    ? '<button class="secondary meta-act" data-action="close-modal">Đã hiểu</button><button class="primary meta-act" data-action="meta-install">Cài ngay</button>'
    : '<button class="primary" data-action="close-modal">Đã hiểu</button>');
  if (!offer) { off(dialog, 'install'); return; }
  const onClick = event => {
    const button = actionOf(dialog, event); if (button?.dataset.action !== 'meta-install') return;
    button.disabled = true;
    const retry = () => { button.disabled = false; };
    try { Promise.resolve(onPrompt()).catch(retry); } catch { retry(); }
  };
  listen(dialog, 'install', [[dialog, 'click', onClick], [dialog, 'close', () => off(dialog, 'install')]]);
}
// A short paragraph for Settings on iPhone and iPad, where browsers never offer an install prompt.
export function iosTipHTML() {
  return `<p class="muted meta-ios-tip">Chơi trên iPhone, iPad? Mở trò chơi bằng Safari, chạm ${SHARE_GLYPH}<b>Chia sẻ</b> → <b>Thêm vào Màn hình chính</b> để chơi toàn màn hình như một ứng dụng.</p>`;
}

// ---- 4. The mascot's tips: one short line as a toast; when a situation applies, it is the topic 60% of the time.

export const TIPS = Object.freeze([
  'Kho lúc nào cũng cần đủ tô và mì: thiếu một thứ là chưa nấu được tô nào.',
  'Vớt mì khi kim nằm trong vùng xanh, sợi mì sẽ dai vừa tới.',
  `Từ cấp ${chefLevel}, thuê phụ bếp luộc mì là có người canh nồi giúp bạn.`,
  `Khách sốt ruột? Mời ly trà đá ${formatMoney(TEA_COST)}, khách sẽ vui vẻ chờ thêm.`,
  'Sàn ướt thì lau liền tay: để lâu khách ngại ghé, còn dễ gặp đoàn kiểm tra.',
  'Đánh giá chỉ trả lời được trong hai ngày; lời lẽ dịu dàng có khi đổi được thêm sao.',
  'Khách xin bớt tiền? Chiều khách, giữ giá hay mời trà nói khéo, cách nào cũng có cái giá riêng.',
  `Đơn giao xa: tự chạy xe né ổ gà để nhận thưởng, hoặc thuê ship ${formatMoney(RIDE_FEE)} cho nhàn.`,
  `Lên cấp ${portLevel} là xây được bến phi thuyền mini, đón đơn từ năm hành tinh.`,
  'Để ý nhãn giá: “hơi cao” dễ bị chê, còn “quá tay” thì khách đi ngang chẳng buồn ghé.',
  'Hết món giữa ca? Chạm vào món đã hết để nhập gấp 5 phần, đắt hơn chút nhưng giữ được khách.',
  'Hoàn thành nhiệm vụ trong ngày là có thưởng liền tay.',
  'Hàng xóm thỉnh thoảng gửi bất ngờ sang tiệm, nhớ ngó bảng tin khu phố nhé.',
  'Thỉnh thoảng vào menu ☰ xuất bản lưu, phòng khi đổi máy hay lỡ xóa dữ liệu.',
  'Mỗi lần thêm ớt là lên một cấp cay; nhìn kỹ số ớt trên phiếu trước khi rắc.',
  'Sáng nào cũng ghé chợ trả giá với cô Sáu, khéo tay là bớt tới 15% tiền hàng.',
  'Từ ngày 3 có nồi nước dùng bí truyền: nhớ đúng thứ tự gia vị là có món đặc biệt cả ngày.',
  'Nước dùng và bò phải dùng trong ngày; mì để được 5 ngày, còn tô thì không bao giờ hỏng.',
]);
export const CONTEXT_TIP_SHARE = .6;
const count = value => { const number = Number(value); return Number.isFinite(number) && number >= 1 ? Math.floor(number) : 0; };
// Lines about the shop's situation right now; staffAwayTomorrow may be true or the names of who is off.
export function contextTips({ unansweredLow = 0, debt = 0, expiringTonight = 0, staffAwayTomorrow = false } = {}) {
  const tips = [], low = count(unansweredLow), expiring = count(expiringTonight), owed = Number(debt);
  if (low) tips.push(`Có ${low} đánh giá thấp đang chờ bạn hồi âm. Một lời xin lỗi nhẹ nhàng có khi đổi lại được thêm sao đấy!`);
  if (Number.isFinite(owed) && owed > 0) tips.push(`Tiệm còn nợ ${formatMoney(owed)}. Cứ bán đều tay, mỗi lần chốt ngày có tiền là nợ vơi bớt. Cố lên nhé!`);
  if (expiring) tips.push(`Tối nay ${expiring} phần nguyên liệu sẽ hết hạn. Hôm nay nhập vừa tay thôi, kẻo phí.`);
  if (staffAwayTomorrow) tips.push(`Ngày mai ${typeof staffAwayTomorrow === 'string' && staffAwayTomorrow.trim() ? staffAwayTomorrow.trim() : 'các phụ bếp'} xin nghỉ một hôm, bạn tự tay đứng bếp nhé. Nhập hàng vừa sức thôi!`);
  return tips;
}
// One draw decides context or general (only when a context applies), one draw picks the line. `previous` (the
// last line shown) is skipped when its group has another line, so tapping the mascot always says something new.
export function pickTip({ unansweredLow = 0, debt = 0, expiringTonight = 0, staffAwayTomorrow = false, random = Math.random, previous } = {}) {
  const draw = () => { const value = Number(random()); return Number.isFinite(value) ? Math.min(Math.max(value, 0), .999999) : 0; };
  const context = contextTips({ unansweredLow, debt, expiringTonight, staffAwayTomorrow });
  const pool = context.length && draw() < CONTEXT_TIP_SHARE ? context : TIPS;
  let index = Math.floor(draw() * pool.length);
  if (pool.length > 1 && pool[index] === previous) index = (index + 1) % pool.length;
  return pool[index];
}

// ---- Styles for the integrator to paste into src/style.css.
export const META_CSS = `
/* Meta screens (src/meta-ui.js): terms gate, what's new, install help */
.modal-content>.meta-updated{margin:0 0 6px;font-size:12px;font-weight:700;color:var(--muted)}
.meta-terms{display:grid;gap:12px;margin:12px 0 4px;padding:0;list-style:none;counter-reset:meta-term}
.meta-terms>li{counter-increment:meta-term}
.meta-terms h3{display:flex;align-items:center;gap:8px;font-size:14.5px}
.meta-terms h3::before{content:counter(meta-term);display:grid;place-items:center;flex:none;width:24px;height:24px;border-radius:50%;background:var(--coral);color:#fff;font:13px/1 var(--display)}
.meta-terms p{margin:3px 0 0 32px;font-size:13.5px;line-height:1.6;color:var(--ink-2)}
.meta-terms a{color:var(--coral-dark);font-weight:700;overflow-wrap:anywhere}
.dark .meta-terms a{color:#ffa99b}
dialog[data-locked] .modal-content:focus{outline:none}
.modal-actions>.meta-agree{flex:3 1 220px;display:flex;align-items:center;gap:10px;min-height:44px;font-size:13.5px;font-weight:700;line-height:1.35;cursor:pointer}
.meta-agree input{appearance:none;-webkit-appearance:none;display:grid;place-items:center;flex:none;width:26px;height:26px;min-height:0;margin:0;padding:0;border:2px solid var(--line-strong);border-radius:8px;background:var(--paper);cursor:pointer}
.meta-agree input::after{content:'';width:7px;height:13px;margin-top:-3px;border:solid #fff;border-width:0 3px 3px 0;transform:rotate(45deg) scale(0);transition:transform .12s}
.meta-agree input:checked{border-color:var(--green-dark);background:var(--green)}
.meta-agree input:checked::after{transform:rotate(45deg) scale(1)}
.modal-actions>.meta-act{flex:1 1 auto;padding-left:12px;padding-right:12px}
.modal-actions>.meta-act.primary{flex-grow:2}
.modal-content>.meta-accepted{margin:0 0 10px;padding:8px 12px;border:1px solid var(--mint-line);border-radius:12px;background:var(--mint);color:var(--ink);font-size:13px;font-weight:700}
.modal-content>.meta-accepted.is-pending{border-color:var(--warn-line);background:var(--warn-bg);color:var(--warn-ink)}
.meta-bob{animation:meta-bob 1.7s ease-in-out infinite alternate}
@keyframes meta-bob{from{transform:translateY(2px)}to{transform:translateY(-5px)}}
.meta-balance{text-wrap:balance}
.meta-news{display:grid;gap:7px;margin:10px 0 2px;padding:0;list-style:none}
.meta-news li{position:relative;padding:8px 12px 8px 30px;border-radius:12px;background:var(--tint);font-size:13.5px;line-height:1.5;color:var(--ink-2)}
.meta-news li::before{content:'';position:absolute;left:12px;top:14px;width:8px;height:8px;border-radius:50%;background:var(--coral)}
.meta-news strong{color:var(--ink)}
.meta-steps{display:grid;gap:10px;margin:12px 0 4px;padding:0;list-style:none}
.meta-step{display:grid;grid-template-columns:40px minmax(0,1fr);align-items:start;gap:12px;padding:10px 12px;border:1px solid var(--line);border-radius:14px;background:var(--tint)}
.meta-step.is-current{border-color:var(--warn-line);background:var(--warn-bg)}
.meta-tile{width:40px;height:40px}
.meta-step h3{font-size:14px}
.meta-step p{margin:3px 0 0;font-size:13px;line-height:1.55;color:var(--ink-2)}
.meta-chip{display:inline-block;margin-left:6px;padding:1px 8px;border-radius:999px;background:var(--coral);color:#fff;font-size:11px;font-weight:700;vertical-align:1px;white-space:nowrap}
.modal-content>.meta-note{padding:10px 12px;border:1px solid var(--mint-line);border-radius:12px;background:var(--mint);color:var(--ink)}
.meta-ios-tip svg{display:inline-block;width:16px;height:16px;margin:0 2px;vertical-align:-3px}
`;
