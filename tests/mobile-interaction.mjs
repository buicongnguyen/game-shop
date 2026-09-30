import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import * as G from '../src/game.js';

// Exercise a complete physical press while the running timers paint intermediate frames.
// Instant locator.click() cannot catch a button disappearing between down and up.
const url = process.env.PARITY_URL || 'http://127.0.0.1:4173';
const results = [], errors = [];
const browser = await chromium.launch({headless:true});
await mkdir('test-results', {recursive:true});
try {
  assert.equal((await fetch(url)).status, 200);
  for (const input of ['mouse', 'touch', 'keyboard']) {
    await scenario(`${input}-collect-running-pot`, openFixture({cooking:true}), async page => {
      const before = await saved(page);
      await hold(page, '[data-action="pot"][data-index="0"]', input, 400);
      const after = await saved(page);
      assert.equal(after.activeDay.bowl.noodles, 'cooked', `${input} release must collect noodles across an animated frame`);
      assert.equal(after.activeDay.pots[0], null, 'The pot empties exactly once');
      assert.equal(after.inventory.noodles, before.inventory.noodles, 'Collecting cannot also start another pot');
    }, input);

    await scenario(`${input}-select-waiting-customer`, openFixture(), async page => {
      const target = (await saved(page)).activeDay.orders.filter(order=>!order.delivery)[1];
      await hold(page, `[data-action="order"][data-id="${target.id}"]`, input, 1200);
      assert.equal((await saved(page)).activeDay.selectedOrderId, target.id, `${input} release selects the intended customer while patience counts down`);
    }, input);

    await scenario(`${input}-select-delivery`, openFixture({delivery:true}), async page => {
      const target = (await saved(page)).activeDay.orders.find(order=>order.delivery);
      assert.ok(target, 'Fixture has a genuine delivery order');
      await hold(page, `[data-action="order"][data-id="${target.id}"]`, input, 1200);
      assert.equal((await saved(page)).activeDay.selectedOrderId, target.id, `${input} release selects a delivery while its clock runs`);
    }, input);
  }

  await scenario('touch-start-second-pot-while-first-boils', openFixture({cooking:true,extraPot:true}), async page => {
    const before = await saved(page);
    await hold(page, '[data-action="pot"][data-index="1"]', 'touch', 400);
    const after = await saved(page);
    assert.ok(after.activeDay.pots[0], 'The first pot remains cooking');
    assert.ok(after.activeDay.pots[1], 'The touched empty pot starts');
    assert.equal(after.inventory.noodles, before.inventory.noodles-1, 'A single touch uses exactly one noodle portion');
  }, 'touch');

  for (const input of ['mouse', 'touch']) {
    await scenario(`${input}-cancelled-pot-press`, openFixture({cooking:true}), async page => {
      const pot=page.locator('[data-action="pot"][data-index="0"]');
      await pot.scrollIntoViewIfNeeded();
      const before=await saved(page), box=await pot.boundingBox();assert.ok(box);
      const x=box.x+box.width/2, y=box.y+box.height/2;
      if(input==='touch') {
        const cdp=await page.context().newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
        await page.clock.runFor(400);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
        await cdp.detach();
      } else {
        await page.mouse.move(x,y);await page.mouse.down();await page.clock.runFor(400);
        await page.mouse.move(5,5);await page.mouse.up();
      }
      const cancelled=await saved(page);
      assert.equal(cancelled.activeDay.bowl.noodles, null, 'A cancelled press must not collect noodles');
      assert.ok(cancelled.activeDay.pots[0], 'Cancelled input leaves the cooking pot alone');
      assert.equal(cancelled.inventory.noodles, before.inventory.noodles);
      await pot.click();
      assert.equal((await saved(page)).activeDay.bowl.noodles, 'cooked', 'A normal press works immediately after cancellation');
    }, input);
  }

  for (const cancel of [false, true]) {
    await scenario(`touch-floating-pot-${cancel?'cancel':'collect'}`, openFixture({cooking:true}), async page => {
      await page.setViewportSize({width:390,height:667});
      await page.evaluate(()=>window.scrollTo(0,0));await page.clock.runFor(32);
      const control=page.locator('[data-action="collect-pot"][data-index="0"]');
      assert.equal(await control.isVisible(), true, 'Small phones keep an offscreen cooking pot reachable in the dock');
      const main=await page.locator('#pots').boundingBox();assert.ok(main&&main.y+main.height>667, 'The main pot is below the visible screen');
      const before=await saved(page);
      if(cancel) {
        const box=await control.boundingBox();assert.ok(box);
        const cdp=await page.context().newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2,id:1}]});
        await page.clock.runFor(400);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await cdp.detach();
        const cancelled=await saved(page);assert.equal(cancelled.activeDay.bowl.noodles,null);
        assert.ok(cancelled.activeDay.pots[0],'Cancelling a dock tap cannot collect');
        await control.tap();
      } else await hold(page,'[data-action="collect-pot"][data-index="0"]','touch',400);
      const after=await saved(page);
      assert.equal(after.activeDay.bowl.noodles,'cooked','The dock collects the intended cooking pot');
      assert.equal(after.activeDay.pots[0],null);
      assert.equal(after.inventory.noodles,before.inventory.noodles,'The dock never starts an extra pot');
      assert.equal(await page.locator('#mobile-cook-dock').isVisible(),false,'An empty dock disappears');
    },'touch');
  }

  for(const input of ['mouse','touch','keyboard']) {
    await scenario(`${input}-pot-burns-during-press`,openFixture({cooking:true,almostBurnt:true}),async page=>{
      const before=await saved(page);
      await hold(page,'[data-action="pot"][data-index="0"]',input,800);
      await persistCurrent(page);const after=await saved(page);
      assert.equal(after.activeDay.pots[0],null,'Releasing a collection press after burning must not start another pot');
      assert.equal(after.activeDay.bowl.noodles,null);
      assert.equal(after.inventory.noodles,before.inventory.noodles,'A stale collection press cannot spend new noodles');
      assert.ok(after.activeDay.waste>before.activeDay.waste,'The original pot did reach its burn time');
    },input);
  }

  await scenario('tablet-nested-kitchen-clipping-shows-dock',openFixture({cooking:true}),async page=>{
    await page.setViewportSize({width:1024,height:768});await page.clock.runFor(32);
    const clipped=await page.evaluate(()=>{
      const kitchen=document.querySelector('.kitchen'),pots=document.querySelector('#pots');
      kitchen.scrollTop+=pots.getBoundingClientRect().top-kitchen.getBoundingClientRect().top+20;
      const area=kitchen.getBoundingClientRect(),row=pots.getBoundingClientRect();
      return {canScroll:kitchen.scrollHeight>kitchen.clientHeight,potTop:row.top,potBottom:row.bottom,clipTop:area.top,viewportHeight:innerHeight};
    });
    assert.ok(clipped.canScroll&&clipped.potTop>0&&clipped.potBottom<clipped.viewportHeight&&clipped.potTop<clipped.clipTop,'The pot is inside the window but clipped by the kitchen pane');
    await page.clock.runFor(200);
    assert.equal(await page.locator('#mobile-cook-dock').isVisible(),true,'A clipped pot remains accessible on a touch tablet');
    await hold(page,'[data-action="collect-pot"][data-index="0"]','touch',400);
    assert.equal((await saved(page)).activeDay.bowl.noodles,'cooked','The tablet dock still accepts a held touch');
  },'touch');

  await scenario('keyboard-enter-repeat-does-not-collect-new-pot',openFixture({emptyBowl:true}),async page=>{
    const before=await saved(page),pot=page.locator('[data-action="pot"][data-index="0"]');
    await pot.focus();await page.keyboard.down('Enter');
    assert.ok((await saved(page)).activeDay.pots[0],'The first Enter starts cooking');
    await page.clock.runFor(400);await page.keyboard.down('Enter');
    await persistCurrent(page);const held=await saved(page);
    assert.ok(held.activeDay.pots[0],'Repeating a held Enter cannot collect the newly started pot');
    assert.equal(held.activeDay.bowl.noodles,null);
    assert.equal(held.inventory.noodles,before.inventory.noodles-1);
    await page.keyboard.up('Enter');await page.keyboard.press('Enter');
    assert.equal((await saved(page)).activeDay.bowl.noodles,'raw','A separate deliberate press remains usable');
  },'keyboard');

  await scenario('keyboard-enter-repeat-does-not-restart-collected-pot',openFixture({cooking:true}),async page=>{
    await page.clock.runFor(200);const before=await saved(page),pot=page.locator('[data-action="pot"][data-index="0"]');
    await pot.focus();await page.keyboard.down('Enter');
    assert.equal((await saved(page)).activeDay.bowl.noodles,'cooked','The first Enter collects the cooked portion');
    await page.clock.runFor(400);await page.keyboard.down('Enter');await page.keyboard.up('Enter');
    await persistCurrent(page);const after=await saved(page);
    assert.equal(after.activeDay.pots[0],null,'A repeat cannot restart the emptied pot');
    assert.equal(after.inventory.noodles,before.inventory.noodles,'Holding Enter cannot spend another portion');
  },'keyboard');

  await scenario('touch-chef-replaces-pot-during-press',openFixture({cooking:true,chef:true}),async page=>{
    const before=await saved(page);
    await hold(page,'[data-action="pot"][data-index="0"]','touch',1000);
    await persistCurrent(page);const after=await saved(page);
    assert.equal(after.activeDay.bowl.noodles,null,'A press on the old pot cannot collect the chef basket or a replacement pot');
    assert.equal(after.activeDay.readyNoodles.length,1,'The chef retains the collected noodles');
    assert.ok(after.activeDay.pots[0]&&after.activeDay.pots[0].elapsed<1,'The chef started a new pot');
    assert.equal(after.inventory.noodles,before.inventory.noodles-1,'Only the chef uses a new portion');
  },'touch');

  await scenario('touch-chef-fills-empty-pot-during-press',openFixture({chef:true}),async page=>{
    const before=await saved(page);
    await hold(page,'[data-action="pot"][data-index="0"]','touch',400);
    await persistCurrent(page);const after=await saved(page);
    assert.equal(after.activeDay.bowl.noodles,null,'A start-cooking press must not collect noodles started by the chef');
    assert.ok(after.activeDay.pots[0],'The chef-started pot remains cooking');
    assert.equal(after.inventory.noodles,before.inventory.noodles-1,'Exactly one portion is cooking');
  },'touch');

  for (const input of ['mouse', 'touch', 'keyboard']) {
    await scenario(`${input}-bargain-stop-running-needle`, prepFixture(), async page => {
      await page.locator('[data-action="bargain"]').click();
      const market = (await saved(page)).sidequests.market;
      const targetMs = Math.round(market.centers[0] / .8 * 1000 / 40) * 40;
      await page.clock.runFor(targetMs-240);
      await hold(page, '#market-stop', input, 240);
      const stopped = (await saved(page)).sidequests.market;
      assert.equal(stopped.round, 1, 'One release completes only one bargaining round');
      assert.equal(stopped.discount, .05, 'The stop is scored at release inside the green zone');
      await page.clock.runFor(1200);
      assert.deepEqual((await saved(page)).sidequests.market, stopped, 'Stopped needle cannot award twice');
    }, input);
  }

  await scenario('keyboard-bargain-next-round-keeps-focus', prepFixture(), async page => {
    await page.locator('[data-action="bargain"]').click();
    await page.locator('#market-stop').focus();
    await page.clock.runFor(600);
    await page.keyboard.press('Space');
    assert.equal((await saved(page)).sidequests.market.round, 1);
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#market-stop').evaluate(node=>node===document.activeElement), true, 'Next-round control must keep keyboard focus');
    await page.clock.runFor(400);
    await page.keyboard.press('Space');
    assert.equal((await saved(page)).sidequests.market.round, 2, 'Space remains usable for the next moving needle');
  }, 'keyboard');

  assert.deepEqual(errors, [], 'No browser runtime errors');
} finally {
  await browser.close();
  await writeFile('test-results/mobile-interaction-results.json', JSON.stringify({url, results, errors}, null, 2));
}
const failed=results.filter(result=>!result.passed);
console.log(`Mobile interaction checks: ${results.length-failed.length}/${results.length} passed.`);
if(failed.length) process.exitCode=1;

async function scenario(name, fixture, run, input) {
  const context=await browser.newContext({viewport: input==='mouse'?{width:1440,height:900}:{width:390,height:844}, isMobile:input==='touch', hasTouch:input==='touch'});
  const page=await context.newPage();
  page.setDefaultTimeout(6000);
  page.on('pageerror', error=>errors.push(`${name}: ${error.message}`));
  try {
    await page.clock.install({time:new Date('2026-09-30T00:00:00Z')});
    await page.clock.pauseAt(new Date('2026-09-30T00:00:01Z'));
    await page.addInitScript(({fixture,key})=>{Math.random=()=>.5;localStorage.setItem(key,JSON.stringify(fixture));localStorage.setItem('tiem-mi-cay-preferences-v1',JSON.stringify({sound:false,motion:false,theme:'light'}));}, {fixture,key:G.SAVE_KEY});
    await page.goto(url);await page.evaluate(()=>document.fonts.ready);
    await page.locator('[data-action="continue"]').click();
    await run(page);
    results.push({name,passed:true});console.log(`PASS ${name}`);
  } catch(error) {
    results.push({name,passed:false,error:error.stack});console.error(`FAIL ${name}: ${error.message}`);
    await page.screenshot({path:`test-results/mobile-failed-${name}.png`,fullPage:true,animations:'disabled'}).catch(()=>{});
  } finally { await context.close(); }
}

async function hold(page, selector, input, duration) {
  const control=page.locator(selector);
  await scrollControlIntoView(control);
  // Native scroll delivery uses the browser clock, while the app's scheduled
  // animation frame uses the mocked clock. Advance that frame only after delivery.
  await page.clock.runFor(32);
  assert.equal(await control.isEnabled(), true, 'The tested control is enabled');
  if(input==='keyboard') {
    await control.focus();await page.keyboard.down('Space');await page.clock.runFor(duration);await page.keyboard.up('Space');return;
  }
  const box=await control.boundingBox();assert.ok(box);
  const x=box.x+box.width/2, y=box.y+box.height/2;
  const hit=await control.evaluate((node,{x,y})=>{
    const target=document.elementFromPoint(x,y),pots=document.querySelector('#pots'),dock=document.querySelector('#mobile-cook-dock');
    const bounds=element=>element?.getBoundingClientRect().toJSON(),clipping=[];
    for(let parent=pots?.parentElement;parent&&parent!==document.body;parent=parent.parentElement) {
      const overflowY=getComputedStyle(parent).overflowY;
      if(/^(auto|scroll|hidden|clip)$/.test(overflowY))clipping.push({tag:parent.tagName,className:parent.className,overflowY,bounds:bounds(parent),clientHeight:parent.clientHeight,scrollTop:parent.scrollTop});
    }
    return {correct:node.contains(target),target:target?.outerHTML.slice(0,250),targetAction:target?.closest('[data-action]')?.dataset.action,scrollY,innerHeight,box:{x,y},control:bounds(node),pots:bounds(pots),dock:{hidden:dock?.hidden,bounds:bounds(dock)},viewport:visualViewport?{offsetTop:visualViewport.offsetTop,height:visualViewport.height,width:visualViewport.width}:null,clipping};
  },{x,y});
  assert.equal(hit.correct, true, `The control receives input at its visible center: ${JSON.stringify(hit)}`);
  if(input==='touch') {
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
    await page.clock.runFor(duration);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await cdp.detach();
  } else {
    await page.mouse.move(x,y);await page.mouse.down();await page.clock.runFor(duration);await page.mouse.up();
  }
}
async function scrollControlIntoView(control) {
  const observation=await control.evaluateHandle(node=>{
    const parents=[];for(let parent=node.parentElement;parent;parent=parent.parentElement)parents.push(parent);
    const read=()=>[...parents.map(parent=>[parent.scrollLeft,parent.scrollTop]),[scrollX,scrollY]];
    const state={before:JSON.stringify(read()),read,observed:false};
    state.onScroll=()=>{state.observed=true;};document.addEventListener('scroll',state.onScroll,true);
    return state;
  });
  try {
    await control.scrollIntoViewIfNeeded();
    const moved=await observation.evaluate(state=>state.before!==JSON.stringify(state.read()));
    if(moved) {
      const deadline=Date.now()+1000;
      while(!await observation.evaluate(state=>state.observed)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,16));
      assert.equal(await observation.evaluate(state=>state.observed),true,'Browser delivered the native scroll event before advancing the mocked animation frame');
    }
  } finally {
    await observation.evaluate(state=>document.removeEventListener('scroll',state.onScroll,true));await observation.dispose();
  }
}
async function saved(page) { return page.evaluate(key=>JSON.parse(localStorage.getItem(key)),G.SAVE_KEY); }
async function persistCurrent(page) { await page.evaluate(()=>window.dispatchEvent(new Event('pagehide'))); }
function prepFixture() {const state=G.createGame('Tiệm thử thao tác');state.day=3;state.money=1000000;state.settings.sound=false;state.settings.motion=false;return state;}
function openFixture({cooking=false,extraPot=false,delivery=false,chef=false,almostBurnt=false,emptyBowl=false}={}) {
  const state=prepFixture();
  if(extraPot||delivery||chef) state.xp=8000;
  state.money=100000000;
  assert.ok(G.buyCart(state,{bowls:30,noodles:30,kimchi:30,beef:30,sausage:30}).ok);
  if(extraPot) assert.ok(G.buyUpgrade(state,'pot2').ok);
  if(delivery) assert.ok(G.buyUpgrade(state,'delivery').ok);
  if(chef) assert.ok(G.hireStaff(state,'chef').ok);
  assert.ok(G.beginDay(state).ok);
  assert.ok(G.createOrder(state,()=>.4).ok);assert.ok(G.createOrder(state,()=>.6).ok);
  if(delivery) G.tickDay(state,22.1,()=>.5);
  if(cooking||chef||emptyBowl) assert.ok(G.takeBowl(state).ok);
  if(cooking) {assert.ok(G.startPot(state).ok);G.tickDay(state,almostBurnt?4.7:2.5,()=>.5);}
  assert.ok(G.loadGame({getItem:()=>JSON.stringify(state)}),'Fixture passes the production save validator');
  return state;
}
