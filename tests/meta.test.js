import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/meta-ui.js';
import * as G from '../src/game.js';

const seeded = seed => { let value = seed >>> 0; return () => (value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296; };
const nonEmpty = value => { assert.equal(typeof value, 'string'); assert.ok(value.trim().length > 0, 'non-empty string'); };
const visible = html => html.replace(/<svg[^]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[#\w]+;/g, ' ');

// A stand-in for the app's <dialog>. openModal records every render and builds just the nodes meta-ui.js
// looks up: the × button, the content area, the agreement box and the data-action buttons of the footer.
function fakeContext() {
  const listeners = [], keyListeners = [];
  const remove = (list, type, fn, capture) => { const index = list.findIndex(row => row.type === type && row.fn === fn && !!row.capture === !!capture); if (index >= 0) list.splice(index, 1); };
  const event = (type, extra) => ({ type, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra });
  let nodes = {};
  const dialog = {
    dataset: {}, open: false, renders: [], focused: null,
    ownerDocument: { addEventListener: (type, fn, capture) => keyListeners.push({ type, fn, capture }), removeEventListener: (type, fn, capture) => remove(keyListeners, type, fn, capture) },
    addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }),
    removeEventListener: (type, fn, capture) => remove(listeners, type, fn, capture),
    querySelector: selector => nodes[selector] ?? null,
    contains: node => Object.values(nodes).includes(node),
    fire(type, extra = {}) { const e = event(type, extra); for (const row of listeners.filter(row => row.type === type)) row.fn(e); return e; },
    key(key) { const e = event('keydown', { key }); for (const row of keyListeners.filter(row => row.type === 'keydown')) row.fn(e); return e; },
    click(action) { const button = nodes[`[data-action="${action}"]`]; assert.ok(button, `${action} is rendered`); return dialog.fire('click', { target: button }); },
    tick(checked = true) { const box = nodes['[data-terms-agree]']; assert.ok(box, 'agreement box is rendered'); box.checked = checked; return dialog.fire('change', { target: box }); },
    get listenerCount() { return listeners.length + keyListeners.length; },
  };
  const ctx = {
    dialog, cues: [],
    sfx: cue => ctx.cues.push(cue),
    mascotSVG: (mood, key) => `<svg class="mascot mascot-${mood}" data-key="${key}"></svg>`,
    openModal(title, body, actions = '', { wide = false } = {}) {
      dialog.renders.push({ title, body, actions, wide });
      nodes = { '.modal-close': { hidden: false, focus() {} }, '.modal-content': { tabIndex: 0, focus() { dialog.focused = 'content'; } } };
      for (const [, tag, action] of actions.matchAll(/(<button[^>]*data-action="([^"]+)"[^>]*>)/g)) {
        const button = { dataset: { action }, disabled: / disabled[ >]/.test(tag), focus() { dialog.focused = action; } };
        button.closest = () => button;
        nodes[`[data-action="${action}"]`] = button;
      }
      if (actions.includes('data-terms-agree')) nodes['[data-terms-agree]'] = { checked: false, matches: selector => selector === '[data-terms-agree]', closest: () => null };
      dialog.open = true;
    },
  };
  return ctx;
}

// ---- Terms

test('terms: version 1 of 01/10/2026 with about ten numbered sections and the project link', () => {
  assert.equal(M.TERMS_VERSION, 1);
  assert.equal(M.TERMS_DATE, '01/10/2026');
  assert.equal(M.TERMS.length, 10, 'the welcome line promises ten points');
  for (const section of M.TERMS) { nonEmpty(section.title); nonEmpty(section.text); }
  const html = M.termsBodyHTML();
  assert.match(html, /mười điều nhỏ/);
  assert.match(html, /^<p class="meta-updated">Cập nhật ngày 01\/10\/2026 · phiên bản 1<\/p>/);
  assert.match(html, /<ol class="meta-terms">/);
  assert.equal((html.match(/<li>/g) || []).length, M.TERMS.length);
  assert.match(html, /<a href="https:\/\/github\.com\/buicongnguyen\/game-shop" target="_blank" rel="noopener noreferrer">github\.com\/<wbr>buicongnguyen\/<wbr>game-shop<\/a>/);
});

test('terms cover every promised point', () => {
  const text = M.TERMS.map(section => `${section.title} ${section.text}`).join(' ');
  for (const point of [/miễn phí/, /mua bán/, /quảng cáo/, /giải thưởng/, /đồ ảo/, /giá trị thật/, /mọi lứa tuổi/, /dưới 16 tuổi/, /bố mẹ/, /3 tiếng/,
    /trình duyệt/, /xuất bản lưu/, /nhập lại/, /Xóa dữ liệu trình duyệt/, /không có tài khoản/, /máy chủ/, /thống kê/, /hàng xóm/, /bảng tin/,
    /không phải người chơi thật/, /Tên tiệm/, /chỉ nằm trên máy này/, /sửa tay/, /tái hiện/, /người hâm mộ/, /mã nguồn, hình vẽ, lời thoại và âm thanh/,
    /không liên kết/, /đồng ý lần nữa/, /GitHub/]) assert.match(text, point);
});

test('termsAccepted compares the stored version with TERMS_VERSION', () => {
  for (const prefs of [undefined, null, {}, { terms: null }, { terms: {} }, { terms: { version: 0 } }, { terms: { version: M.TERMS_VERSION - 1, at: 5 } }]) assert.equal(M.termsAccepted(prefs), false, JSON.stringify(prefs));
  for (const prefs of [{ terms: { version: 1, at: Date.now() } }, { terms: { version: 2 } }]) assert.equal(M.termsAccepted(prefs), true, JSON.stringify(prefs));
});

test('the terms gate locks the dialog until the box is ticked, then hands back the record', () => {
  const ctx = fakeContext(), { dialog } = ctx, accepted = [];
  const release = M.showTermsGate(ctx, { onAccept: record => accepted.push({ record, locked: dialog.dataset.locked, listeners: dialog.listenerCount }) });
  assert.equal(typeof release, 'function');
  const render = dialog.renders.at(-1);
  assert.equal(render.title, 'Điều khoản chơi game');
  assert.equal(render.wide, true);
  assert.equal(render.body, M.termsBodyHTML());
  // The agreement box lives in the pinned footer with the buttons.
  assert.doesNotMatch(render.body, /data-terms-agree/);
  assert.match(render.actions, /^<label class="meta-agree"><input type="checkbox" data-terms-agree><span>Tôi đã đọc và đồng ý với các điều khoản trên<\/span><\/label>/);
  assert.match(render.actions, /<button class="secondary meta-act" data-action="terms-decline">Không đồng ý<\/button>/);
  assert.match(render.actions, /<button class="primary meta-act" data-action="terms-accept" disabled>Vào tiệm →<\/button>$/);
  assert.equal(dialog.querySelector('.modal-close').hidden, true);
  assert.equal(dialog.dataset.locked, 'terms');
  assert.equal(dialog.querySelector('.modal-content').tabIndex, -1);
  assert.equal(dialog.focused, 'content');
  // Escape is refused twice over: the dialog's cancel event and the key itself.
  assert.equal(dialog.fire('cancel').defaultPrevented, true);
  assert.equal(dialog.key('Escape').defaultPrevented, true);
  assert.equal(dialog.key('Enter').defaultPrevented, false);
  // The button only works once the box is ticked.
  dialog.click('terms-accept');
  assert.equal(accepted.length, 0);
  dialog.tick(true);
  assert.equal(dialog.querySelector('[data-action="terms-accept"]').disabled, false);
  dialog.tick(false);
  assert.equal(dialog.querySelector('[data-action="terms-accept"]').disabled, true);
  dialog.tick(true);
  const before = Date.now();
  dialog.click('terms-accept');
  assert.equal(accepted.length, 1);
  assert.deepEqual(Object.keys(accepted[0].record).sort(), ['at', 'version']);
  assert.equal(accepted[0].record.version, M.TERMS_VERSION);
  assert.ok(accepted[0].record.at >= before && accepted[0].record.at <= Date.now());
  // The gate let go before the caller was told, so the caller may close the dialog.
  assert.equal(accepted[0].locked, undefined);
  assert.equal(accepted[0].listeners, 0);
  assert.equal(dialog.key('Escape').defaultPrevented, false);
  assert.deepEqual(ctx.cues, ['tap', 'tap', 'tap', 'success']);
});

test('declining shows the sad mascot card, whose only button brings the terms back', () => {
  const ctx = fakeContext(), { dialog } = ctx;
  M.showTermsGate(ctx, { onAccept: () => assert.fail('nothing was accepted') });
  dialog.click('terms-decline');
  let render = dialog.renders.at(-1);
  assert.equal(render.title, 'Tiệm sẽ chờ bạn');
  assert.match(render.body, /<div class="hero-mascot"><svg class="mascot mascot-sad"/);
  assert.match(render.body, /đồng ý với điều khoản thì mới vào tiệm được/);
  assert.match(render.body, /tiến trình của bạn vẫn nằm yên trên máy này/);
  assert.equal(render.actions, '<button class="primary" data-action="terms-reread">Đọc lại điều khoản</button>');
  assert.equal(dialog.querySelector('.modal-close').hidden, true);
  assert.equal(dialog.dataset.locked, 'terms');
  assert.equal(dialog.focused, 'terms-reread');
  assert.equal(dialog.fire('cancel').defaultPrevented, true);
  dialog.click('terms-reread');
  render = dialog.renders.at(-1);
  assert.equal(render.title, 'Điều khoản chơi game');
  assert.match(render.actions, /data-action="terms-accept" disabled/);
  assert.deepEqual(ctx.cues, ['fail', 'pageTurn']);
});

test('a dialog closed behind the gate opens the gate again; release lets go without closing', () => {
  const ctx = fakeContext(), { dialog } = ctx;
  const release = M.showTermsGate(ctx, {});
  const renders = dialog.renders.length;
  dialog.open = false;
  dialog.fire('close');
  assert.equal(dialog.renders.length, renders + 1);
  assert.equal(dialog.renders.at(-1).title, 'Điều khoản chơi game');
  assert.equal(dialog.dataset.locked, 'terms');
  release();
  assert.equal(dialog.dataset.locked, undefined);
  assert.equal(dialog.listenerCount, 0);
  dialog.fire('close');
  assert.equal(dialog.renders.length, renders + 1);
  // Showing the gate again replaces its listeners rather than doubling them.
  M.showTermsGate(ctx, {});
  const once = dialog.listenerCount;
  M.showTermsGate(ctx, {});
  assert.equal(dialog.listenerCount, once);
});

test('the read-only copy shows when the terms were accepted and goes back to Settings', () => {
  const ctx = fakeContext(), { dialog } = ctx;
  let backs = 0;
  M.showTermsCopy(ctx, { acceptedAt: new Date(2026, 9, 1, 9, 30).getTime(), onBack: () => backs++ });
  let render = dialog.renders.at(-1);
  assert.equal(render.title, 'Điều khoản chơi game');
  assert.match(render.body, /^<p class="meta-accepted">✓ Bạn đã đồng ý ngày 01\/10\/2026<\/p>/);
  assert.ok(render.body.endsWith(M.termsBodyHTML()));
  assert.equal(render.actions, '<button class="secondary" data-action="terms-back">Quay lại Cài đặt</button>');
  assert.equal(dialog.dataset.locked, undefined);
  dialog.click('terms-back');
  assert.equal(backs, 1);
  assert.equal(dialog.listenerCount, 0);
  for (const acceptedAt of [null, undefined, 0, '', 'không phải ngày']) {
    M.showTermsCopy(ctx, { acceptedAt });
    render = dialog.renders.at(-1);
    assert.match(render.body, /^<p class="meta-accepted is-pending">Bạn chưa đồng ý với bản điều khoản này\.<\/p>/);
  }
  dialog.fire('close');
  assert.equal(dialog.listenerCount, 0);
  assert.match(M.termsCopyHTML(new Date(2026, 0, 5)), /ngày 05\/01\/2026/);
  assert.match(M.termsCopyHTML(String(new Date(2026, 0, 5).getTime())), /ngày 05\/01\/2026/);
});

// ---- What's new

test('newsFor lists newer releases first, filters by lastSeen and keeps at most nine items', () => {
  const byVersion = [...M.NEWS].sort((a, b) => b.version - a.version);
  const all = M.newsFor(0);
  assert.ok(all.length > 0 && all.length <= 9);
  assert.equal(all[0].version, M.NEWS_VERSION);
  for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].version >= all[i].version, 'newest release first');
  // Inside a release the items keep their written order.
  assert.deepEqual(all.map(item => item.lead), byVersion.flatMap(entry => entry.items.map(item => item.lead)).slice(0, 9));
  assert.deepEqual(M.newsFor(3).map(item => item.lead), M.NEWS.find(entry => entry.version === 4).items.map(item => item.lead));
  assert.deepEqual(M.newsFor(2).map(item => item.version), byVersion.filter(entry => entry.version > 2).flatMap(entry => entry.items.map(() => entry.version)).slice(0, 9));
  for (const seen of [M.NEWS_VERSION, 99]) assert.deepEqual(M.newsFor(seen), []);
  for (const seen of [undefined, null, 'abc', NaN]) assert.deepEqual(M.newsFor(seen), all);
  assert.deepEqual(M.newsFor('3'), M.newsFor(3));
  assert.equal(M.newsFor(0, 3).length, 3);
  assert.deepEqual(M.newsFor(0, 0), []);
  for (const item of all) { nonEmpty(item.lead); nonEmpty(item.text); }
  // The result is a copy: changing it never changes NEWS.
  all[0].lead = 'đổi';
  assert.notEqual(M.newsFor(0)[0].lead, 'đổi');
});

test('NEWS describes our own releases 2 to 4', () => {
  assert.deepEqual(M.NEWS.map(entry => entry.version).sort(), [2, 3, 4]);
  assert.equal(M.NEWS_VERSION, 4);
  // The save remembers the last release seen with game.js's NEWS_VERSION; every release it knows needs a card.
  if ('NEWS_VERSION' in G) assert.equal(M.NEWS_VERSION, G.NEWS_VERSION);
  for (const entry of M.NEWS) {
    assert.match(entry.date, /^\d{2}\/\d{2}\/\d{4}$/);
    assert.ok(entry.items.length >= 3);
    for (const item of entry.items) { nonEmpty(item.lead); nonEmpty(item.text); }
  }
  const text = version => M.NEWS.find(entry => entry.version === version).items.map(item => `${item.lead} ${item.text}`).join(' ');
  for (const point of [/chim sẻ/, /người đi bộ/, /xe máy/, /mưa/, /bếp/, /Bé Ngò/, /Anh Sả/, /xin nghỉ/, /hàng xóm/, /bảng tin/, /màn hình chính/, /không có mạng/]) assert.match(text(4), point);
  for (const point of [/vẽ tay/, /sáng sớm tới tối/, /xe máy/, /năm hành tinh/, /nhiên liệu/, /thiên thạch/]) assert.match(text(3), point);
  for (const point of [/tình huống/, /bớt tiền/, /Hết món/, /Đánh giá/, /nhạc nền/]) assert.match(text(2), point);
});

test('showNews shows the bobbing happy mascot, the items and a close-modal button', () => {
  const ctx = fakeContext(), { dialog } = ctx;
  assert.equal(M.showNews(ctx, M.NEWS_VERSION), false);
  assert.equal(dialog.renders.length, 0);
  assert.equal(M.showNews(ctx, 3), true);
  const render = dialog.renders.at(-1);
  assert.equal(render.title, 'Có gì mới ở tiệm?');
  assert.match(render.body, /^<div class="summary-hero"><div class="hero-mascot meta-bob"><svg class="mascot mascot-happy"/);
  assert.match(render.body, /<h3 class="meta-balance">Tin nóng hổi, vừa thổi vừa xem!<\/h3><p>Bản cập nhật ngày 01\/10\/2026<\/p>/);
  assert.equal((render.body.match(/<li>/g) || []).length, M.newsFor(3).length);
  assert.match(render.body, /<li><strong>Chuyện tình trong bếp:<\/strong> Bé Ngò/);
  assert.equal(render.actions, '<button class="primary" data-action="close-modal">Tuyệt quá, tiếp tục →</button>');
  assert.equal(dialog.listenerCount, 0);
  assert.deepEqual(ctx.cues, [], 'the morning chain plays its own sound');
});

// ---- Install help

test('install help puts the player\'s platform first and draws two outlined icon tiles', () => {
  const ios = M.installHTML({ platform: 'ios' }), android = M.installHTML({ platform: 'android' });
  assert.ok(ios.indexOf('iPhone, iPad · Safari') < ios.indexOf('Android · Chrome'));
  assert.ok(android.indexOf('Android · Chrome') < android.indexOf('iPhone, iPad · Safari'));
  for (const html of [ios, android]) {
    assert.equal((html.match(/Máy của bạn/g) || []).length, 1);
    assert.equal((html.match(/is-current/g) || []).length, 1);
    assert.match(html, /^<p>Mở tiệm chỉ bằng một chạm: chơi toàn màn hình, không còn thanh địa chỉ/);
  }
  assert.match(ios, /<li class="meta-step is-current"><svg[^]*?iPhone, iPad · Safari<span class="meta-chip">Máy của bạn<\/span>/);
  assert.match(ios, /Chạm <b>Chia sẻ<\/b> → <b>Thêm vào Màn hình chính<\/b> → <b>Thêm<\/b>/);
  assert.match(android, /Chạm menu <b>⋮<\/b> → <b>Cài đặt ứng dụng<\/b>/);
  for (const platform of ['iOS', 'iPadOS', 'iphone']) assert.ok(M.installHTML({ platform }).startsWith(ios.slice(0, 40)) && /is-current"><svg[^]*?iPhone/.test(M.installHTML({ platform })), platform);
  const desktop = M.installHTML({ platform: 'desktop' });
  assert.doesNotMatch(desktop, /Máy của bạn|is-current/);
  assert.match(desktop, /Chrome và Edge có nút cài đặt ngay trên thanh địa chỉ/);
  const home = M.installHTML({ platform: 'ios', standalone: true });
  assert.match(home, /^<p class="meta-note">Tiệm đã nằm trên màn hình chính của máy này rồi!/);
  assert.doesNotMatch(home, /Máy của bạn|is-current/);
  const tiles = ios.match(/<svg class="meta-tile"[^]*?<\/svg>/g);
  assert.equal(tiles.length, 2);
  for (const svg of tiles) {
    assert.match(svg, /viewBox="0 0 40 40" width="40" height="40" aria-hidden="true"/);
    assert.match(svg, /stroke="#4a2a22"/);
    assert.doesNotMatch(svg, / id="|url\(|<image|<text|href=|<animate/);
  }
  assert.match(tiles[0], /M20 24V8\.5/, 'the share tile has an up arrow');
  assert.equal((tiles[1].match(/<circle/g) || []).length, 6, 'three dots, each with a highlight');
});

test('showInstall offers Cài ngay only with an install prompt and calls onPrompt once', () => {
  const ctx = fakeContext(), { dialog } = ctx;
  let prompts = 0;
  M.showInstall(ctx, { canPrompt: false, platform: 'ios', standalone: false, onPrompt: () => prompts++ });
  let render = dialog.renders.at(-1);
  assert.equal(render.title, 'Đặt tiệm lên màn hình chính');
  assert.equal(render.actions, '<button class="primary" data-action="close-modal">Đã hiểu</button>');
  assert.equal(dialog.listenerCount, 0);
  M.showInstall(ctx, { canPrompt: true, platform: 'android', onPrompt: () => prompts++ });
  render = dialog.renders.at(-1);
  assert.equal(render.actions, '<button class="secondary meta-act" data-action="close-modal">Đã hiểu</button><button class="primary meta-act" data-action="meta-install">Cài ngay</button>');
  dialog.click('meta-install');
  dialog.click('meta-install');
  assert.equal(prompts, 1);
  assert.equal(dialog.querySelector('[data-action="meta-install"]').disabled, true);
  M.showInstall(ctx, { canPrompt: true, platform: 'ios', standalone: true, onPrompt: () => prompts++ });
  assert.doesNotMatch(dialog.renders.at(-1).actions, /meta-install/);
  assert.equal(dialog.listenerCount, 0);
  M.showInstall(ctx, { canPrompt: true, platform: 'ios' });
  assert.doesNotMatch(dialog.renders.at(-1).actions, /meta-install/, 'no prompt function, no button');
});

test('Cài ngay can be tapped again when the prompt fails', async () => {
  const ctx = fakeContext(), { dialog } = ctx;
  M.showInstall(ctx, { canPrompt: true, platform: 'android', onPrompt: () => { throw new Error('không có lời mời'); } });
  dialog.click('meta-install');
  assert.equal(dialog.querySelector('[data-action="meta-install"]').disabled, false);
  M.showInstall(ctx, { canPrompt: true, platform: 'android', onPrompt: async () => { throw new Error('bị từ chối'); } });
  dialog.click('meta-install');
  assert.equal(dialog.querySelector('[data-action="meta-install"]').disabled, true);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(dialog.querySelector('[data-action="meta-install"]').disabled, false);
  let calls = 0;
  M.showInstall(ctx, { canPrompt: true, platform: 'android', onPrompt: async () => { calls++; return 'accepted'; } });
  dialog.click('meta-install');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls, 1);
  assert.equal(dialog.querySelector('[data-action="meta-install"]').disabled, true);
});

test('the iPhone tip for Settings is one short paragraph about Safari and the home screen', () => {
  const html = M.iosTipHTML();
  assert.match(html, /^<p class="muted meta-ios-tip">[^]*<\/p>$/);
  assert.equal((html.match(/<p[\s>]/g) || []).length, 1);
  for (const point of [/iPhone, iPad/, /Safari/, /<b>Chia sẻ<\/b>/, /<b>Thêm vào Màn hình chính<\/b>/, /toàn màn hình/]) assert.match(html, point);
  assert.match(html, /<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">/);
});

// ---- Mascot tips

test('TIPS: at least 14 short, distinct lines about this game', () => {
  assert.ok(M.TIPS.length >= 14, `${M.TIPS.length} tips`);
  assert.equal(new Set(M.TIPS).size, M.TIPS.length);
  for (const tip of M.TIPS) { nonEmpty(tip); assert.equal(tip, tip.trim()); assert.ok(tip.length <= 120, tip); }
  const all = M.TIPS.join(' ');
  for (const topic of [/tô và mì/, /vùng xanh/, /phụ bếp luộc mì/, /trà đá/, /Sàn ướt/, /hai ngày/, /bớt tiền/, /giao xa/, /phi thuyền/, /nhãn giá/, /nhập gấp/, /nhiệm vụ/, /Hàng xóm/, /xuất bản lưu/]) assert.match(all, topic);
  // Numbers come from the game's own catalogue, so the tips stay true.
  assert.ok(M.TIPS.some(tip => tip.includes(`Từ cấp ${G.STAFF.find(row => row.id === 'chef').unlockLevel},`)));
  assert.ok(M.TIPS.some(tip => tip.includes(`Lên cấp ${G.UPGRADES.find(row => row.id === 'spaceport').unlockLevel} `)));
  assert.ok(M.TIPS.some(tip => tip.includes(G.formatMoney(G.TEA_COST))));
  assert.ok(M.TIPS.some(tip => tip.includes(G.formatMoney(G.RIDE_FEE))));
});

test('context tips name the numbers: low reviews, the debt in đồng, portions expiring, cooks away', () => {
  const [reviews] = M.contextTips({ unansweredLow: 3 });
  assert.match(reviews, /^Có 3 đánh giá thấp đang chờ bạn hồi âm\. Một lời xin lỗi nhẹ nhàng/);
  const [debt] = M.contextTips({ debt: 1234567 });
  assert.ok(debt.startsWith(`Tiệm còn nợ ${G.formatMoney(1234567)}.`), debt);
  assert.match(debt, /Cố lên nhé!$/);
  assert.match(M.contextTips({ expiringTonight: 7 })[0], /^Tối nay 7 phần nguyên liệu sẽ hết hạn\./);
  assert.match(M.contextTips({ staffAwayTomorrow: true })[0], /^Ngày mai các phụ bếp xin nghỉ một hôm/);
  assert.match(M.contextTips({ staffAwayTomorrow: ' Bé Ngò và Anh Sả ' })[0], /^Ngày mai Bé Ngò và Anh Sả xin nghỉ một hôm/);
  assert.equal(M.contextTips({ unansweredLow: 1, debt: 1, expiringTonight: 1, staffAwayTomorrow: true }).length, 4);
  for (const context of [undefined, {}, { unansweredLow: -2, debt: NaN, expiringTonight: .4, staffAwayTomorrow: '' }, { debt: -5 }, { unansweredLow: '0', debt: '0' }]) assert.deepEqual(M.contextTips(context), [], JSON.stringify(context));
});

test('pickTip is about the situation 60% of the time when one applies, and never otherwise', () => {
  assert.equal(M.CONTEXT_TIP_SHARE, .6);
  const draws = 6000;
  const cases = [{ unansweredLow: 2 }, { debt: 250000 }, { expiringTonight: 4 }, { staffAwayTomorrow: true }, { unansweredLow: 1, debt: 90000, expiringTonight: 3, staffAwayTomorrow: 'Bé Ngò' }];
  for (const [index, context] of cases.entries()) {
    const random = seeded(1000 + index), situational = new Set(M.contextTips(context)), said = new Set();
    let hits = 0;
    for (let i = 0; i < draws; i++) {
      const tip = M.pickTip({ ...context, random }); said.add(tip);
      if (situational.has(tip)) hits++; else assert.ok(M.TIPS.includes(tip), tip);
    }
    assert.ok(Math.abs(hits / draws - .6) < .03, `${JSON.stringify(context)}: ${hits / draws}`);
    assert.equal(said.size, situational.size + M.TIPS.length, 'every line can come up');
  }
  const random = seeded(7);
  for (let i = 0; i < 2000; i++) assert.ok(M.TIPS.includes(M.pickTip({ random })));
  for (let i = 0; i < 500; i++) assert.ok(M.TIPS.includes(M.pickTip({ unansweredLow: 0, debt: 0, expiringTonight: 0, staffAwayTomorrow: false, random })));
  // Same seed, same lines.
  const first = seeded(42), second = seeded(42);
  for (let i = 0; i < 50; i++) assert.equal(M.pickTip({ debt: 5000, random: first }), M.pickTip({ debt: 5000, random: second }));
});

test('pickTip copes with odd random values and does not repeat the previous line', () => {
  for (const value of [0, .999999, 1, -1, NaN, Infinity]) assert.ok(M.TIPS.includes(M.pickTip({ random: () => value })), String(value));
  assert.equal(M.pickTip({ random: () => 0 }), M.TIPS[0]);
  assert.equal(M.pickTip({ random: () => 0, previous: M.TIPS[0] }), M.TIPS[1]);
  assert.equal(M.pickTip({ random: () => .99, previous: M.TIPS.at(-1) }), M.TIPS[0]);
  // A lone situational line is still said after itself, so the 60% share holds.
  const only = M.contextTips({ debt: 5000 })[0];
  assert.equal(M.pickTip({ debt: 5000, random: () => 0, previous: only }), only);
});

// ---- Safety and wording

test('HTML builders escape the values they are given', () => {
  const evil = '<img src=x onerror="alert(1)">&\'';
  const terms = M.termsBodyHTML([{ title: evil, text: evil, link: { href: 'javascript:alert(1)', label: evil } }, { title: 'Liên hệ', text: 'Ghé', link: { href: 'https://example.org/"><script>', label: '<b>trang</b>' } }]);
  assert.doesNotMatch(terms, /<img|<script|javascript:|<b>/);
  assert.match(terms, /<h3>&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;&amp;&#39;<\/h3>/);
  assert.match(terms, /href="https:\/\/example\.org\/&quot;&gt;&lt;script&gt;"/);
  const news = M.newsHTML([{ lead: evil, text: evil }], { date: evil, mascotSVG: '<svg class="mascot"></svg>' });
  assert.doesNotMatch(news.replace('<svg class="mascot"></svg>', ''), /<img|<svg/);
  assert.match(news, /<li><strong>&lt;img src=x/);
  const copy = M.termsCopyHTML(evil, [{ title: evil, text: evil }]);
  assert.doesNotMatch(copy, /<img/);
  assert.match(copy, /chưa đồng ý/);
  for (const platform of [evil, { toString: () => evil }]) assert.doesNotMatch(M.installHTML({ platform }), /<img|onerror/);
});

test('every string is filled in and no English placeholder text is left', () => {
  const ctx = fakeContext(), { dialog } = ctx;
  M.showTermsGate(ctx, {}); dialog.click('terms-decline'); dialog.click('terms-reread');
  M.showTermsCopy(ctx, { acceptedAt: Date.now() }); M.showTermsCopy(ctx, {});
  M.showNews(ctx, 0);
  for (const [platform, canPrompt, standalone] of [['ios', false, false], ['android', true, false], ['desktop', true, false], ['ios', true, true]]) M.showInstall(ctx, { platform, canPrompt, standalone, onPrompt() {} });
  const strings = [
    ...dialog.renders.flatMap(render => [render.title, visible(render.body), visible(render.actions)]),
    ...M.TERMS.flatMap(section => [section.title, section.text]),
    ...M.NEWS.flatMap(entry => [entry.date, ...entry.items.flatMap(item => [item.lead, item.text])]),
    ...M.TIPS, ...M.contextTips({ unansweredLow: 2, debt: 120000, expiringTonight: 3, staffAwayTomorrow: true }),
    visible(M.iosTipHTML()),
  ];
  const english = /\b(lorem|ipsum|todo|tbd|fixme|xxx|placeholder|undefined|null|nan|true|false|object|the|and|your|you|click|tap|button|title|text|here|update|version|accept|decline|agree|install|share|settings|news|tips?)\b/i;
  for (const value of strings) {
    nonEmpty(value);
    assert.doesNotMatch(value, english, value);
    assert.doesNotMatch(value, /\$\{|\[object/, value);
  }
  // Buttons speak Vietnamese and use known actions only: the app's close-modal, or our own prefixes.
  const actions = dialog.renders.map(render => render.actions).join('');
  for (const [, action] of actions.matchAll(/data-action="([^"]+)"/g)) assert.match(action, /^(close-modal|terms-[a-z]+|meta-[a-z]+)$/);
  for (const label of ['Không đồng ý', 'Vào tiệm →', 'Đọc lại điều khoản', 'Quay lại Cài đặt', 'Tuyệt quá, tiếp tục →', 'Đã hiểu', 'Cài ngay']) assert.ok(actions.includes(`>${label}</button>`), label);
});

test('META_CSS styles every meta- class the screens use and adds no other classes', () => {
  const ctx = fakeContext();
  M.showTermsGate(ctx, {});
  M.showInstall(ctx, { canPrompt: true, platform: 'android', onPrompt() {} });
  const html = [M.termsBodyHTML(), M.termsCopyHTML(Date.now()), M.termsCopyHTML(null), M.newsHTML(M.newsFor(0), { date: '01/10/2026' }), M.installHTML({ platform: 'ios' }),
    M.installHTML({ platform: 'android', standalone: true }), M.installHTML({ platform: 'desktop' }), M.iosTipHTML(), ...ctx.dialog.renders.map(render => render.actions)].join('');
  const used = new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap(match => match[1].split(/\s+/)).filter(name => name.startsWith('meta-')));
  assert.ok(used.size >= 10);
  for (const name of used) assert.match(M.META_CSS, new RegExp(`\\.${name}(?![\\w-])`), name);
  const defined = new Set([...M.META_CSS.replace(/\/\*[^]*?\*\//g, '').matchAll(/\.([a-z][\w-]*)/g)].map(match => match[1]));
  for (const name of defined) assert.ok(name.startsWith('meta-') || ['modal-actions', 'modal-content', 'primary', 'dark', 'is-current', 'is-pending'].includes(name), name);
  assert.equal((M.META_CSS.match(/{/g) || []).length, (M.META_CSS.match(/}/g) || []).length);
  assert.match(M.META_CSS, /\.meta-terms h3::before\{content:counter\(meta-term\)/);
});
