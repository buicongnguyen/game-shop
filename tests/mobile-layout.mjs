import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import * as G from '../src/game.js';

// These checks use real touch gestures and real clocks. scrollIntoView() would
// hide overflow:hidden bugs because it can scroll a container that fingers cannot.
const url = process.env.PARITY_URL || process.env.MOBILE_URL || 'http://127.0.0.1:4187';
const output = 'test-results/mobile';
await mkdir(output, { recursive:true });
const browser = await chromium.launch({ headless:true });
const results = [], errors = [];
const sizes = [{width:320,height:568},{width:360,height:800},{width:390,height:844},{width:844,height:390}];
try {
  for (const viewport of sizes) {
    await scenario(`touch-layout-${viewport.width}x${viewport.height}`, viewport, fixture(true), async (page, client) => {
      await page.locator('[data-action="continue"]').tap();
      await page.evaluate(() => document.fonts.ready);
      await noOverflow(page);
      for (const selector of ['[data-action="menu"]','[data-action="settings"]']) {
        const box = await page.locator(selector).boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44, `${selector} must be a 44px touch target`);
      }
      const guidance = await page.locator('.station-title small').evaluate(node => parseFloat(getComputedStyle(node).fontSize));
      assert.ok(guidance >= 11, 'Timing instruction remains readable');
      const labels = await page.locator('.ingredient-button strong,.ingredient-button small').evaluateAll(nodes => nodes.map(node => parseFloat(getComputedStyle(node).fontSize)));
      assert.ok(labels.every(size => size >= 11), 'Ingredient names and stock counts stay legible');
      if (viewport.width <= 650) {
        assert.ok(await page.locator('.seasoning small').evaluate(node => parseFloat(getComputedStyle(node).fontSize)) >= 11, 'Irreversible spice instruction remains readable');
        for (const selector of ['#customers .customer','#pots .pot-button']) {
          const tops = await page.locator(selector).evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().top));
          assert.ok(tops.length >= 3 && Math.max(...tops) - Math.min(...tops) < 2, `${selector} stays on one row`);
        }
      }
      await page.screenshot({path:`${output}/${viewport.width}-top.png`});
      await revealBySwipe(page, client, '[data-action="serve"]');
      const serve = await page.locator('[data-action="serve"]').boundingBox();
      assert.ok(serve.y >= 0 && serve.y + serve.height <= viewport.height, 'Finger swipes reach the entire Serve button');
      assert.ok(await page.evaluate(() => scrollY > 0), 'Natural document scrolling moves the page');
      assert.equal(await page.locator('#app').evaluate(node => node.scrollTop), 0, 'No invisible programmatic #app scroll is needed');
      await page.screenshot({path:`${output}/${viewport.width}-serve.png`});
      if (viewport.width <= 650) {
        await revealBySwipe(page, client, '.topping-row');
        const palette = page.locator('.topping-row');
        const before = await palette.evaluate(node => node.scrollLeft);
        const box = await palette.boundingBox();
        await swipe(client, {x:box.x+box.width-16,y:Math.min(viewport.height-30,box.y+box.height/2)}, {x:box.x+16,y:Math.min(viewport.height-30,box.y+box.height/2)});
        await page.waitForTimeout(100);
        assert.ok(await palette.evaluate(node => node.scrollLeft) > before + 20, 'Topping palette responds to a real horizontal finger swipe');
        await noOverflow(page);
      }
    });
  }

  await scenario('small-phone-cooking-dock', sizes[0], fixture(false, true), async page => {
    await page.locator('[data-action="continue"]').tap();
    const dock = page.locator('#mobile-cook-dock');
    await dock.waitFor({state:'visible'});
    const box = await dock.boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height <= 569, 'Dock stays inside the phone viewport');
    assert.ok(box.height <= 150, 'Dock leaves the game visible');
    assert.ok((await dock.locator('.dock-order').textContent()).trim().length > 0, 'Selected order remains visible while cooking');
    const collect = dock.locator('[data-action="collect-pot"]:visible').first();
    const target = await collect.boundingBox();
    assert.ok(target.width >= 44 && target.height >= 44, 'Floating pot remains a usable touch target');
    await page.screenshot({path:`${output}/320-cooking-dock.png`});
    await collect.tap();
    await dock.waitFor({state:'hidden'});
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), G.SAVE_KEY);
    assert.ok(saved.activeDay.bowl.noodles, 'Floating pot collects the noodles through a touch tap');
    assert.equal(saved.activeDay.pots.filter(Boolean).length, 0);
  });

  const threePots=fixture(true,true);
  G.startPot(threePots,1);G.startPot(threePots,2);
  await scenario('three-pot-dock-resizes-after-collection', sizes[0], threePots, async page => {
    await page.locator('[data-action="continue"]').tap();
    const dock=page.locator('#mobile-cook-dock');
    await dock.waitFor({state:'visible'});
    const targets=dock.locator('.dock-pot:visible');
    assert.equal(await targets.count(),3);
    const boxes=await targets.evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {y:r.y,width:r.width,height:r.height}}));
    assert.ok(Math.max(...boxes.map(box=>box.y))-Math.min(...boxes.map(box=>box.y))<2,'All3timers share one row');
    assert.ok(boxes.every(box=>box.width>=44&&box.height>=44));
    await page.screenshot({path:`${output}/320-three-pot-dock.png`});
    await targets.first().tap();
    assert.equal(await targets.count(),2,'Collected slot leaves no invisible column');
    assert.ok((await targets.first().boundingBox()).width>boxes[0].width+20,'Remaining active pots use the available width');
  });

  const swipeState=fixture(true);G.takeBowl(swipeState);G.addBroth(swipeState,'kimchi');
  await scenario('ingredient-swipe-does-not-add-a-topping',sizes[1],swipeState,async(page,client)=>{
    await page.locator('[data-action="continue"]').tap();
    await revealBySwipe(page,client,'.topping-row');
    const row=page.locator('.topping-row'),box=await row.boundingBox();
    await swipe(client,{x:box.x+box.width-14,y:box.y+35},{x:box.x+14,y:box.y+35});
    await page.waitForTimeout(200);
    assert.ok(await row.evaluate(node=>node.scrollLeft)>20);
    const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),G.SAVE_KEY);
    assert.deepEqual(saved.activeDay.bowl.toppings,[],'Finger drag scrolls the palette without buying/adding ingredients');
  });

  const tabletState=fixture(true,true);
  G.tickDay(tabletState,3,()=>.5);G.collectPot(tabletState);G.startPot(tabletState);
  await scenario('tablet-nested-scroll-keeps-hot-pots-reachable',{width:1024,height:768},tabletState,async(page,client)=>{
    await page.locator('[data-action="continue"]').tap();
    const dock=page.locator('#mobile-cook-dock');
    const bounds=()=>page.evaluate(()=>{
      const pots=document.querySelector('#pots').getBoundingClientRect(),kitchen=document.querySelector('.kitchen').getBoundingClientRect();
      return {potTop:pots.top,potBottom:pots.bottom,kitchenTop:kitchen.top,kitchenBottom:kitchen.bottom,scroll:document.querySelector('.kitchen').scrollTop,windowScroll:scrollY};
    });
    assert.ok((await bounds()).potBottom>(await bounds()).kitchenBottom,'The initial pot is clipped by the nested kitchen pane');
    await dock.waitFor({state:'visible'});
    // Finger coordinates stay inside the kitchen. The document itself never moves.
    const pan=async()=>{await swipe(client,{x:980,y:500},{x:980,y:220});await page.waitForTimeout(80);};
    await pan();
    let position=await bounds();
    assert.ok(position.scroll>100&&position.windowScroll===0,'Touch gesture scrolls the kitchen rather than the document');
    assert.ok(position.potTop>=position.kitchenTop&&position.potBottom<=position.kitchenBottom,'The main pot now fits inside its pane');
    await dock.waitFor({state:'hidden'});
    await pan();
    position=await bounds();
    assert.ok(position.potTop>=0&&position.potBottom<768,'Pot coordinates still lie inside the browser viewport');
    assert.ok(position.potTop<position.kitchenTop,'But the pane clips the pot from above');
    await dock.waitFor({state:'visible'});
    await page.screenshot({path:`${output}/1024-clipped-pot-dock.png`});
    await pan();
    const serve=page.locator('[data-action="serve"]'),serveBox=await serve.boundingBox(),dockBox=await dock.boundingBox();
    position=await bounds();
    assert.ok(serveBox.y>=position.kitchenTop&&serveBox.y+serveBox.height<=position.kitchenBottom,'Kitchen bottom remains reachable while pots run');
    assert.ok(serveBox.y+serveBox.height<dockBox.y,'Dock does not cover the Serve button');
    assert.equal(await serve.isEnabled(),true,'The ready bowl can be served without hiding the active-pot dock');
    assert.ok(await serve.evaluate(node=>{const r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'Serve receives touch hit testing');
    assert.ok(await page.locator('.play').evaluate(node=>node.classList.contains('has-hot-pots')),'Checks completed while the real pot clock was still running');
    await page.screenshot({path:`${output}/1024-hot-pots-serve.png`});
  });

  await scenario('phone-inputs-and-modal-targets', sizes[0], G.createGame('Tiệm nhập hàng'), async page => {
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

async function scenario(name, viewport, state, run) {
  const context = await browser.newContext({viewport,isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  page.on('pageerror',error => errors.push(`${name}: ${error.message}`));
  try {
    await page.addInitScript(({state,key}) => { localStorage.setItem(key, JSON.stringify(state)); Math.random=()=>.5; }, {state,key:G.SAVE_KEY});
    await page.goto(url);
    const client = await context.newCDPSession(page);
    await run(page,client);
    results.push({name,passed:true});
    console.log(`PASS ${name}`);
  } catch(error) {
    results.push({name,passed:false,error:error.stack});
    await page.screenshot({path:`${output}/failed-${name}.png`}).catch(()=>{});
    console.error(`FAIL ${name}: ${error.message}`);
  } finally { await context.close(); }
}

async function noOverflow(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal page overflow');
}

async function swipe(client, from, to) {
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[from]});
  for (let step=1;step<=8;step++) {
    await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*step/8,y:from.y+(to.y-from.y)*step/8}]});
    await new Promise(resolve => setTimeout(resolve,25));
  }
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}

async function revealBySwipe(page, client, selector) {
  const viewport = page.viewportSize();
  for (let attempt=0;attempt<14;attempt++) {
    const box = await page.locator(selector).boundingBox();
    if (box.y >= 12 && box.y + box.height <= viewport.height - 12) return;
    const x = viewport.width - 7; // margin, outside horizontally scrolling ingredient palettes
    const distance = Math.min(viewport.height*.65, Math.max(70, box.y < 12 ? 12-box.y : box.y+box.height-viewport.height+20));
    const bottom = viewport.height-25;
    const from = box.y < 12 ? {x,y:25} : {x,y:bottom};
    const to = box.y < 12 ? {x,y:Math.min(bottom,25+distance)} : {x,y:Math.max(25,bottom-distance)};
    await swipe(client,from,to);
    await page.waitForTimeout(120);
  }
  assert.fail(`Real finger swipes could not reveal ${selector}`);
}

function fixture(advanced=false,cooking=false) {
  const state=G.createGame('Tiệm Mobile');
  state.settings.sound=false;
  state.money=advanced?100000000:1000000;
  if(advanced){state.xp=8000;state.unlocked=G.INGREDIENTS.map(item=>item.id);}
  assert.ok(G.buyCart(state,Object.fromEntries(state.unlocked.map(id=>[id,15]))).ok);
  if(advanced)for(const id of ['pot2','pot3','table','delivery'])assert.ok(G.buyUpgrade(state,id).ok);
  assert.ok(G.beginDay(state).ok);
  for(let index=0;index<(advanced?4:1);index++)assert.ok(G.createOrder(state,()=>.5).ok);
  if(cooking){G.takeBowl(state);G.addBroth(state,'kimchi');G.startPot(state);}
  return state;
}
