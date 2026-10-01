import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import * as G from '../src/game.js';

// Layout guarantees for phones, tablets and PCs. The service screen fits the viewport:
// every cooking control is visible and touchable without scrolling, and only the
// ingredient pantry scrolls, by real finger swipes. Dialogs keep their actions on screen.
const url = process.env.PARITY_URL || process.env.MOBILE_URL || 'http://127.0.0.1:4187';
const output = 'test-results/mobile';
await mkdir(output, { recursive:true });
const browser = await chromium.launch({ headless:true });
const results = [], errors = [];
const touchSizes = [{width:320,height:568},{width:360,height:800},{width:390,height:844},{width:844,height:390},{width:768,height:1024},{width:1024,height:768}];
const desktopSizes = [{width:1280,height:720},{width:1366,height:768},{width:1920,height:1080}];
const cookingControls = ['#customers .customer','#ticket','#take-bowl','[data-action="chili"]','[data-action="discard"]','[data-action="serve"]','[data-action="rush"]','[data-action="finish"]'];
try {
  for (const viewport of touchSizes) {
    await scenario(`service-fits-${viewport.width}x${viewport.height}`, viewport, fixture(true,true), async page => {
      await page.locator('[data-action="continue"]').tap();
      await page.evaluate(() => document.fonts.ready);
      await withEffects(page);
      await noOverflow(page);
      assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), 'The service screen needs no page scrolling');
      for (const selector of [...cookingControls, '[data-action="pot"]']) {
        for (const report of await reachable(page, selector)) assert.ok(report.ok, `${selector} is on screen and touchable: ${JSON.stringify(report)}`);
      }
      for (const selector of ['[data-action="menu"]','[data-action="settings"]','[data-action="pot"]','.tool','[data-action="serve"]','[data-action="chili"]','[data-action="discard"]','.ingredient-button']) {
        const small = await page.locator(selector).evaluateAll(nodes => nodes.filter(node => node.offsetParent).map(node => node.getBoundingClientRect()).filter(box => box.width < 44 || box.height < 44).map(box => `${Math.round(box.width)}x${Math.round(box.height)}`));
        assert.deepEqual(small, [], `${selector} keeps 44px touch targets`);
      }
      const tiny = await page.locator('.ingredient-button strong,.ingredient-button small,.pot-button strong,.pot-button small,.customer-status,.tool,.bowl-meta span').evaluateAll(nodes => nodes.filter(node => node.offsetParent).map(node => parseFloat(getComputedStyle(node).fontSize)).filter(size => size < 10.5));
      assert.deepEqual(tiny, [], 'Kitchen labels stay legible');
      await page.screenshot({path:`${output}/${viewport.width}x${viewport.height}-service.png`});
    });
  }

  for (const viewport of [touchSizes[0], touchSizes[1], touchSizes[3]]) {
    const swipeState = fixture(true); G.takeBowl(swipeState); G.addBroth(swipeState,'kimchi');
    await scenario(`pantry-finger-swipe-${viewport.width}x${viewport.height}`, viewport, swipeState, async (page, client) => {
      await page.locator('[data-action="continue"]').tap();
      const pantry = page.locator('.pantry');
      assert.ok(await pantry.evaluate(node => node.scrollHeight > node.clientHeight + 20), 'All ingredients stay available in a scrolling pantry');
      const box = await pantry.boundingBox(), x = box.x + box.width / 2;
      await swipe(client, {x, y:box.y+box.height-12}, {x, y:box.y+12});
      await page.waitForTimeout(200);
      assert.ok(await pantry.evaluate(node => node.scrollTop) > 20, 'A real finger swipe scrolls the pantry');
      assert.equal(await page.evaluate(() => scrollY), 0, 'The page itself stays still');
      const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), G.SAVE_KEY);
      assert.deepEqual(saved.activeDay.bowl.toppings, [], 'Swiping never adds an ingredient');
      const last = page.locator('[data-action="topping"]').last();
      // Hold the finger still before lifting: a fling pushing against the end of the list stays
      // active without moving, and Chrome then spends the next tap on stopping it, as on a real phone.
      for (let attempt = 0; attempt < 30 && !(await tappable(last)); attempt++) { await swipe(client, {x, y:box.y+box.height-12}, {x, y:box.y+12}, 150); await settle(pantry); }
      assert.ok(await tappable(last), 'Finger swipes reach the last topping');
      await settle(pantry);
      await last.tap();
      const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), G.SAVE_KEY);
      assert.equal(after.activeDay.bowl.toppings.length, 1, 'A deliberate tap on the revealed topping adds it');
    });
  }

  for (const viewport of [touchSizes[0], touchSizes[2], touchSizes[3]]) {
    await scenario(`dialogs-fit-${viewport.width}x${viewport.height}`, viewport, fixture(true,true,true), async page => {
      await page.locator('[data-action="continue"]').tap();
      for (const action of ['rush','help','goals','stockout','finish','settings','menu']) {
        await page.locator(`[data-action="${action}"]`).last().tap();
        await settled(page);
        const box = await page.locator('dialog').boundingBox();
        assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + .5 && box.y + box.height <= viewport.height + .5, `${action} dialog fits the screen`);
        for (const report of await reachable(page, '#dialog .modal-actions button')) assert.ok(report.ok, `${action} dialog action stays on screen: ${JSON.stringify(report)}`);
        // A sold-out order opens a situation: it has no close button and waits for an explicit answer.
        if (action === 'stockout') {
          assert.equal(await page.locator('.modal-close').isVisible(), false, 'A stockout needs an explicit answer');
          await page.locator('[data-action="incident"][data-id="later"]').tap();
          assert.equal(await page.locator('dialog').evaluate(node => node.open), false);
          continue;
        }
        const close = await page.locator('.modal-close').boundingBox();
        assert.ok(close.width >= 44 && close.height >= 44 && close.y >= 0, `${action} close button is finger-sized and visible`);
        if (action === 'rush') {
          assert.ok(await page.locator('.modal-content').evaluate(node => node.scrollHeight > node.clientHeight), 'Long lists scroll inside the dialog body');
          await page.screenshot({path:`${output}/${viewport.width}x${viewport.height}-rush-dialog.png`});
        }
        await page.locator('.modal-close').tap();
        assert.equal(await page.locator('dialog').evaluate(node => node.open), false);
      }
    });
  }

  for (const viewport of [touchSizes[0], touchSizes[2], touchSizes[3]]) {
    await scenario(`prep-fits-${viewport.width}x${viewport.height}`, viewport, prepFixture(), async page => {
      await page.locator('[data-action="continue"]').tap();
      for (const name of ['stock','prices','upgrades','decor','reviews','accounts']) {
        await page.locator(`[data-action="tab"][data-id="${name}"]`).tap();
        await noOverflow(page);
      }
      await page.locator('[data-action="tab"][data-id="stock"]').tap();
      for (const report of await reachable(page, '#open-day')) assert.ok(report.ok, `The open-shop button stays on screen: ${JSON.stringify(report)}`);
      assert.ok(await page.locator('#qty-bowls').evaluate(node => parseFloat(getComputedStyle(node).fontSize)) >= 16, 'Numeric input avoids iOS focus zoom');
      await page.screenshot({path:`${output}/${viewport.width}x${viewport.height}-prep.png`});
    });
  }

  // Short wide windows (a 1366×768 laptop under its browser bars, small tablets): the shop picture and the sign's pills
  // stay clear of the day card, whose event and update pill sit right below them; the left column scrolls instead.
  for (const viewport of [{width:1024,height:600},{width:1366,height:657},{width:900,height:560}]) {
    await scenario(`prep-hero-clear-of-the-day-card-${viewport.width}x${viewport.height}`, viewport, prepFixture(), async page => {
      await page.locator('[data-action="continue"]').click();
      await noOverflow(page);
      const box = await page.evaluate(() => { const bottom = selector => document.querySelector(selector).getBoundingClientRect().bottom; return { picture: bottom('.prep-illustration'), pills: bottom('.sign-row'), card: document.querySelector('.daily-card').getBoundingClientRect().top }; });
      assert.ok(box.picture <= box.card + .5 && box.pills <= box.card + .5, `The hero ends above the day card: ${JSON.stringify(box)}`);
      for (const report of await reachable(page, '#open-day')) assert.ok(report.ok, `The open-shop button stays on screen: ${JSON.stringify(report)}`);
    }, false);
  }

  // Barks run up to 32 characters, far wider than a seat on a small phone: no bubble is cut by the street's edge, and
  // a bubble lying over the next seats never takes the tap meant for their faces.
  await scenario('speech-bubbles-stay-in-the-street-and-let-taps-through-320x568', touchSizes[0], fixture(true,true), async page => {
    await page.locator('[data-action="continue"]').tap();
    await page.evaluate(() => { for (const card of document.querySelectorAll('#customers .customer')) { const speech = card.querySelector('.speech'); speech.textContent = 'Tay nghề này đáng huy chương!'; speech.hidden = false; } });
    await page.waitForTimeout(400);
    const seats = await page.evaluate(() => {
      const street = document.querySelector('.street').getBoundingClientRect(), cards = [...document.querySelectorAll('#customers .customer')];
      return cards.map((card, index) => { const bubble = card.querySelector('.speech').getBoundingClientRect(), ring = card.querySelector('.patience-ring').getBoundingClientRect(), hit = document.elementFromPoint(ring.x + ring.width / 2, Math.max(ring.top + 2, bubble.top + bubble.height / 2))?.closest('.customer'); return { index, inside: bubble.left >= street.left - .5 && bubble.right <= street.right + .5, hit: cards.indexOf(hit) }; });
    });
    assert.equal(seats.length, 4, 'Four guests are seated');
    for (const seat of seats) { assert.ok(seat.inside, `Seat ${seat.index + 1}'s bubble stays inside the street`); assert.equal(seat.hit, seat.index, `A tap on seat ${seat.index + 1}'s face selects that guest, whatever bubble lies over it`); }
  });

  // The love story's last stage has three choices with hint lines: on a landscape phone they sit side by side, so the
  // story's own text still shows above them (three full-width hint buttons had squeezed it out of sight).
  await scenario('love-story-text-shows-above-its-choices-844x390', touchSizes[3], romanceFixture(), async page => {
    await page.locator('[data-action="continue"]').tap();
    await page.waitForTimeout(1400); await settled(page);
    for (const report of await reachable(page, '#dialog .modal-actions button')) assert.ok(report.ok, `Every choice stays on screen: ${JSON.stringify(report)}`);
    const shown = await page.evaluate(() => { const body = document.querySelector('#dialog .modal-content').getBoundingClientRect(), text = document.querySelector('#dialog .modal-content p').getBoundingClientRect(); return Math.min(body.bottom, text.bottom) - Math.max(body.top, text.top); });
    assert.ok(shown >= 40, `At least two lines of the story show without scrolling (${Math.round(shown)} px)`);
  });

  for (const viewport of desktopSizes) {
    await scenario(`desktop-service-${viewport.width}x${viewport.height}`, viewport, fixture(true,true), async page => {
      await page.locator('[data-action="continue"]').click();
      await withEffects(page);
      await noOverflow(page);
      assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), 'The service screen needs no page scrolling');
      for (const selector of [...cookingControls, '[data-action="pot"]']) {
        for (const report of await reachable(page, selector)) assert.ok(report.ok, `${selector} is visible without scrolling: ${JSON.stringify(report)}`);
      }
      if (viewport.height >= 768) for (const report of await reachable(page, '.ingredient-button')) assert.ok(report.ok, `Every ingredient fits on screen: ${JSON.stringify(report)}`);
      await page.screenshot({path:`${output}/${viewport.width}x${viewport.height}-service.png`});
    }, false);
  }

  await scenario('effects-pause-behind-dialogs-and-stop-with-motion-off', touchSizes[2], fixture(true,true), async page => {
    await page.locator('[data-action="continue"]').tap();
    await withEffects(page);
    assert.ok(await layerAnimations(page) > 0, 'The demo starts effects and street life');
    await page.locator('[data-action="settings"]').tap(); await page.waitForTimeout(150);
    assert.equal(await layerAnimations(page, 'running'), 0, 'Nothing in the layers keeps running behind an open dialog');
    await page.locator('#dialog [data-setting="motion"]').uncheck(); await page.locator('.modal-close').tap(); await page.waitForTimeout(150);
    assert.equal(await layerAnimations(page), 0, 'Motion off clears every effect and actor');
  });

  await scenario('phone-inputs-and-modal-targets', touchSizes[0], G.createGame('Tiệm nhập hàng'), async page => {
    await page.locator('[data-action="continue"]').tap();
    const inputSize = await page.locator('#qty-bowls').evaluate(node => parseFloat(getComputedStyle(node).fontSize));
    assert.ok(inputSize >= 16, 'Numeric inventory input avoids iOS focus zoom');
    await page.locator('[data-action="settings"]').tap();
    const close = await page.locator('.modal-close').boundingBox();
    assert.ok(close.width >= 44 && close.height >= 44, 'Modal close is finger-sized');
    const box = await page.locator('dialog').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 320 && box.y >= 0 && box.y + box.height <= 568, 'Settings fits a small phone');
    await page.screenshot({path:`${output}/320-settings.png`});
  });
  assert.deepEqual(errors, [], 'No runtime errors during real touch interaction');
} finally {
  await browser.close();
  await writeFile(`${output}/results.json`, JSON.stringify({results,errors},null,2));
}
const failures = results.filter(result => !result.passed);
console.log(`Mobile layout checks: ${results.length-failures.length}/${results.length} passed.`);
if (failures.length) process.exitCode=1;

async function scenario(name, viewport, state, run, touch = true) {
  const context = await browser.newContext({viewport,isMobile:touch,hasTouch:touch,deviceScaleFactor:1});
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  page.on('pageerror',error => errors.push(`${name}: ${error.message}`));
  try {
    await page.addInitScript(({state,key}) => { localStorage.setItem(key, JSON.stringify(state)); localStorage.setItem('tiem-mi-cay-terms-v1', JSON.stringify({version:99,at:0})); Math.random=()=>.5; }, {state,key:G.SAVE_KEY});
    await page.goto(url);
    const client = touch ? await context.newCDPSession(page) : null;
    await run(page,client);
    results.push({name,passed:true});
    console.log(`PASS ${name}`);
  } catch(error) {
    results.push({name,passed:false,error:error.stack});
    await page.screenshot({path:`${output}/failed-${name}.png`}).catch(()=>{});
    console.error(`FAIL ${name}: ${error.message}`);
  } finally { await context.close(); }
}

// Visible inside the viewport and receiving input at its centre, without any scrolling.
async function reachable(page, selector) {
  return page.locator(selector).evaluateAll(nodes => nodes.filter(node => node.offsetParent || getComputedStyle(node).position === 'fixed').map(node => {
    const r = node.getBoundingClientRect(), target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {ok: r.top >= -.5 && r.left >= -.5 && r.bottom <= innerHeight + .5 && r.right <= innerWidth + .5 && node.contains(target), text: node.textContent.trim().slice(0, 30), box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], hit: target?.className?.baseVal ?? target?.className};
  }));
}

// The centre of a pantry tile is inside the pantry's visible area and receives input.
async function tappable(locator) {
  return locator.evaluate(node => {
    const area = node.closest('.pantry').getBoundingClientRect(), r = node.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
    return y > area.top && y < area.bottom && node.contains(document.elementFromPoint(x, y));
  });
}

// Momentum scrolling can pause between frames on a busy machine, so require three steady reads.
async function settle(scroller) {
  let previous = -1, steady = 0;
  for (let check = 0; check < 40 && steady < 3; check++) {
    const top = await scroller.evaluate(node => node.scrollTop);
    steady = top === previous ? steady + 1 : 0;
    previous = top; await new Promise(resolve => setTimeout(resolve, 120));
  }
}

// Dialogs pop in for 0.2 s; sizes are measured once the opening animation has finished (a loaded machine stretches it).
async function settled(page) { await page.waitForFunction(() => !document.getAnimations().some(animation => animation.effect?.target?.closest?.('#dialog')), null, { timeout: 2000 }).catch(() => {}); }
// Effects and street actors on screen (through the app's test hook); their layers must never take a tap.
async function withEffects(page) {
  await page.evaluate(() => window.__tiemFx?.demo()); await page.waitForTimeout(160);
  const events = await page.evaluate(() => ['#fx-layer', '.street-life'].map(selector => { const node = document.querySelector(selector); return node ? getComputedStyle(node).pointerEvents : 'missing'; }));
  assert.deepEqual(events, ['none', 'none'], 'Both effect layers exist and let taps through');
}
async function layerAnimations(page, state) {
  return page.evaluate(state => document.getAnimations().filter(animation => animation.effect?.target?.closest?.('#fx-layer, .street-life') && (!state || animation.playState === state)).length, state);
}

async function noOverflow(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal page overflow');
}

async function swipe(client, from, to, pauseBeforeLift=0) {
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[from]});
  for (let step=1;step<=8;step++) {
    await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*step/8,y:from.y+(to.y-from.y)*step/8}]});
    await new Promise(resolve => setTimeout(resolve,25));
  }
  if(pauseBeforeLift)await new Promise(resolve=>setTimeout(resolve,pauseBeforeLift));
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}

function romanceFixture() {
  const state=G.createGame('Tiệm chuyện tình');
  state.day=20;state.xp=6200;state.money=5000000;state.settings.sound=false;state.unlocked=G.INGREDIENTS.map(item=>item.id);
  assert.ok(G.buyCart(state,Object.fromEntries(state.unlocked.map(id=>[id,15]))).ok);
  for(const id of ['chef','broth'])assert.ok(G.hireStaff(state,id).ok);
  state.romance={stage:2,lastDay:10,backDay:12,gift:0};
  assert.ok(G.beginDay(state,()=>.99).ok);assert.ok(G.forceStory(state,'romance',()=>.3).incident,'The love story opens at its last stage');
  return state;
}

function prepFixture() {
  const state=G.createGame('Tiệm chuẩn bị');
  state.settings.sound=false;state.money=100000000;state.xp=8000;state.unlocked=G.INGREDIENTS.map(item=>item.id);
  return state;
}

function fixture(advanced=false,cooking=false,soldOut=false) {
  const state=G.createGame('Tiệm Mobile');
  state.settings.sound=false;
  state.money=advanced?100000000:1000000;
  if(advanced){state.xp=8000;state.unlocked=G.INGREDIENTS.map(item=>item.id);}
  assert.ok(G.buyCart(state,Object.fromEntries(state.unlocked.map(id=>[id,15]))).ok);
  if(advanced)for(const id of ['pot2','pot3','table','delivery'])assert.ok(G.buyUpgrade(state,id).ok);
  assert.ok(G.beginDay(state).ok);
  for(let index=0;index<(advanced?4:1);index++)assert.ok(G.createOrder(state,()=>.5).ok);
  if(cooking){G.takeBowl(state);G.addBroth(state,'kimchi');G.startPot(state);}
  if(soldOut){const id=G.getSelectedOrder(state).toppings[0];assert.ok(id);state.inventory[id]=0;state.batches[id]=[];}
  return state;
}
