import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import * as G from '../src/game.js';

const url=process.env.PARITY_URL||'http://127.0.0.1:4175';
const results=[],errors=[],badRequests=[],externalRequests=[];
const browser=await chromium.launch({headless:true});
await mkdir('test-results',{recursive:true});
try {
  assert.equal((await fetch(url)).status,200,`Start the local server at ${url} before running this suite.`);

  await scenario('fresh-shop-cart-prices-and-goals',async page=>{
    await click(page,'new-game');await page.locator('#shop-name').fill('Tiệm kiểm tra mới');await click(page,'create');
    const initial=await save(page);assert.equal(initial.version,2);assert.equal(initial.money,400000);
    assert.ok(Object.values(initial.inventory).every(qty=>qty===0),'A new shop starts with an empty stockroom');
    const suggestion=G.suggestedCart(initial);
    for(const [id,qty] of Object.entries(suggestion))assert.equal(Number(await page.locator(`#qty-${id}`).inputValue()),qty);
    await click(page,'clear-cart');assert.equal(await page.locator('#qty-bowls').inputValue(),'0');
    await page.locator('[data-action="quantity"][data-id="bowls"][data-delta="1"]').click();assert.equal(await page.locator('#qty-bowls').inputValue(),'1');
    await page.locator('#qty-bowls').fill('150');assert.equal(await page.locator('#qty-bowls').inputValue(),'99');
    await page.locator('#qty-bowls').fill('-3');assert.equal(await page.locator('#qty-bowls').inputValue(),'0');
    await click(page,'suggest-cart');await click(page,'buy-cart');
    const stocked=await save(page);assert.equal(stocked.money,initial.money-G.cartCost(initial,suggestion));
    for(const [id,qty] of Object.entries(suggestion))assert.equal(stocked.inventory[id],qty);
    const pricesTab=page.locator('[data-action="tab"][data-id="prices"]');await pricesTab.focus();await page.keyboard.press('Enter');
    assert.ok(await pricesTab.evaluate(node=>node===document.activeElement),'Tab retains keyboard focus after rendering');
    const oldPrice=stocked.prices.kimchi,pricePlus=page.locator('[data-action="price"][data-id="kimchi"][data-delta="1000"]');
    await pricePlus.focus();await page.keyboard.press('Enter');
    assert.ok(await pricePlus.evaluate(node=>node===document.activeElement),'The same price + button retains keyboard focus');
    assert.equal((await save(page)).prices.kimchi,oldPrice+1000);
    await tab(page,'stock');assert.equal(await page.locator('.goals-board .goal-line').count(),3,'The day goals are listed in the stock tab');
    await click(page,'goals');assert.equal(await page.locator('.goal-card').count(),3);await close(page);
    await page.screenshot({path:'test-results/parity-fresh-prep.png',fullPage:true,animations:'disabled'});
  });

  await scenario('first-bowl-tutorial-then-real-arrival-assembly-and-settlement',async page=>{
    await click(page,'new-game');await click(page,'create');await click(page,'open-day');
    // A new shop is coached through one scripted bowl; the day clock waits until it is served.
    const coached=await save(page);assert.equal(coached.phase,'open');assert.equal(coached.activeDay.tutorial,true);
    assert.equal(await page.locator('.customer').count(),1);assert.equal(await page.locator('#coach').isVisible(),true);
    assert.equal(await page.locator('#take-bowl').evaluate(node=>node.classList.contains('coach-target')),true,'The coach outlines the bowl stack first');
    await page.clock.runFor(8000);assert.equal((await save(page)).activeDay.remaining,210,'The clock waits for the first bowl');
    await assemble(page,coached.activeDay.orders[0]);assert.equal(await page.locator('[data-action="serve"]').evaluate(node=>node.classList.contains('coach-target')),true);
    await click(page,'serve');assert.match(await page.locator('#dialog-title').textContent(),/Tô mì đầu tiên/);await close(page);
    const handover=await save(page);assert.equal(handover.tutorialDone,true);assert.equal(handover.activeDay.tutorial,false);assert.equal(handover.activeDay.served,1);
    assert.equal(await page.locator('#coach').isVisible(),false);assert.equal(await page.locator('.customer').count(),0);
    const regions=await page.locator('.cook-gauge').first().evaluate(gauge=>{const whole=gauge.getBoundingClientRect();return [...gauge.querySelectorAll('i')].map(region=>{const r=region.getBoundingClientRect();return {width:r.width/whole.width,left:(r.left-whole.left)/whole.width}})});
    assert.equal(regions.length,3);for(const [index,expected] of [.5,.28,.22].entries())assert.ok(Math.abs(regions[index].width-expected)<.015,`Cooking zone ${index} must occupy ${expected*100}% of the gauge`);
    assert.ok(Math.abs(regions[1].left-.5)<.015,'The green target starts at50%');
    await page.clock.runFor(9900);assert.equal(await page.locator('.customer').count(),0,'First customer does not spawn immediately');
    await page.clock.runFor(2300);assert.equal(await page.locator('.customer').count(),1,'The first customer arrives after ten seconds');
    const before=await save(page),order=before.activeDay.orders[0];assert.ok(order);
    await assemble(page,order);
    const assembled=await save(page);assert.equal(assembled.activeDay.bowl.noodles,'cooked');
    for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
      await page.setViewportSize(viewport);await page.evaluate(()=>{window.scrollTo(0,0);document.querySelectorAll('.kitchen,.customer-side,#app').forEach(element=>{element.scrollTop=0;});});
      const spiceBadge=await page.locator('.bowl-spice').boundingBox();assert.ok(spiceBadge&&spiceBadge.height<36,`Spice badge stays compact at ${viewport.width}px`);
      await page.screenshot({path:`test-results/parity-ready-bowl-${viewport.width}.png`,fullPage:true,animations:'disabled'});
    }
    await page.setViewportSize({width:1440,height:900});
    await click(page,'serve');const served=await save(page);
    assert.equal(served.stats.served,2);assert.equal(served.activeDay.served,2);assert.equal(served.reviews.length,2);
    assert.ok(served.money>before.money);assert.equal(served.inventory.bowls,before.inventory.bowls-1);assert.equal(served.inventory.noodles,before.inventory.noodles-1);
    assert.equal(served.activeDay.bowl.started,false);
    await page.screenshot({path:'test-results/parity-service-desktop.png',fullPage:true,animations:'disabled'});
    await click(page,'finish');assert.equal((await save(page)).phase,'open','Closing early asks for confirmation first');
    await click(page,'force-finish');const ended=await save(page);
    assert.equal(ended.day,2);assert.equal(ended.phase,'prep');assert.equal(ended.history.length,1);
    assert.equal(ended.lastDay.served,2,"The coached first bowl counts toward day one");assert.equal(ended.money,served.money-G.dailyOperatingCost(served).total);
  });

  await scenario('wrong-order-discard-and-closing-grace',async page=>{
    await click(page,'continue');const initial=await save(page),order=initial.activeDay.orders[0];
    await assemble(page,order,{wrongSpice:true});await click(page,'serve');
    const wrong=await save(page);assert.equal(wrong.stats.served,0);assert.equal(wrong.stats.mistakes,1);assert.equal(wrong.activeDay.bowl.started,false);assert.ok(wrong.stats.waste>0);
    assert.equal(wrong.activeDay.orders[0].mistakes,1);assert.equal(wrong.inventory.bowls,initial.inventory.bowls-1);
    await click(page,'bowl');await item(page,'broth',order.broth);await item(page,'topping','beef');
    const beforeDiscard=await save(page);await click(page,'discard');await click(page,'confirm-discard');const discarded=await save(page);
    assert.equal(discarded.inventory.beef,beforeDiscard.inventory.beef);assert.equal(discarded.inventory.bowls,beforeDiscard.inventory.bowls);
    assert.equal(discarded.stats.waste,beforeDiscard.stats.waste+beforeDiscard.activeDay.bowl.cost);
    await click(page,'finish');await click(page,'force-finish');assert.equal((await save(page)).phase,'closing');
    await page.clock.runFor(61000);const ended=await save(page);assert.equal(ended.phase,'prep');assert.equal(ended.day,2);assert.equal(ended.lastDay.lost,1);
  },{fixture:openFixture()});

  await scenario('settings-hidden-pause-and-inflight-save-reload',async page=>{
    await click(page,'continue');await click(page,'bowl');await item(page,'broth','kimchi');await click(page,'pot');await page.clock.runFor(1000);
    const lightPaper=await page.locator('html').evaluate(e=>getComputedStyle(e).getPropertyValue('--paper'));
    await click(page,'settings');await page.locator('[data-setting="dark"]').check();
    assert.notEqual(await page.locator('html').evaluate(e=>getComputedStyle(e).getPropertyValue('--paper')),lightPaper,'Dark theme changes rendered colors');
    const modalSave=await save(page);await page.clock.runFor(30000);assert.deepEqual(await save(page),modalSave,'Settings pauses the game and active pot');
    await close(page);
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
    const hiddenSave=await save(page);await page.clock.runFor(30000);assert.deepEqual(await save(page),hiddenSave);
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
    assert.equal(await page.locator('dialog').evaluate(d=>d.open),true,'Returning to the visible tab asks to resume');await close(page);
    await page.reload();await click(page,'continue');const restored=await save(page);
    assert.deepEqual(restored.activeDay.bowl,hiddenSave.activeDay.bowl);assert.deepEqual(restored.activeDay.pots,hiddenSave.activeDay.pots);
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    assert.equal(restored.inventory.bowls,hiddenSave.inventory.bowls);assert.equal(restored.inventory.noodles,hiddenSave.inventory.noodles);
    await page.clock.runFor(2100);await click(page,'pot');assert.equal((await save(page)).activeDay.bowl.noodles,'cooked');
  },{fixture:openFixture()});

  await scenario('advanced-catalog-staff-decor-and-reviews',async page=>{
    await click(page,'continue');assert.equal(await page.locator('.stock-row').count(),G.INGREDIENTS.length);
    for(const id of G.INGREDIENTS.map(i=>i.id)){const image=page.locator(`.stock-row img[src$="/assets/ingredients/${id}.svg"]`);await image.scrollIntoViewIfNeeded();await image.evaluate(i=>i.decode());assert.equal(await image.evaluate(i=>i.complete&&i.naturalWidth>0),true,`Ingredient art ${id}`);}
    await tab(page,'upgrades');await item(page,'upgrade-tab','staff');assert.equal(await page.locator('.staff-card').count(),G.STAFF.length);
    await item(page,'hire','chef');assert.equal((await save(page)).staff.chef,true);
    await item(page,'fire','chef');await item(page,'confirm-fire','chef');assert.equal((await save(page)).staff.chef,false);
    await tab(page,'decor');await item(page,'decor','awning_purple');assert.equal((await save(page)).decoration.selected.awning,'awning_purple');
    assert.match(await page.locator('.prep-illustration .shop-scene').innerHTML(),/#9C7BD4/i,'The shop scene draws the chosen awning colour');
    await item(page,'decor','pet_cat');assert.equal(await page.locator('.prep-illustration .shop-scene [data-layer="pet-cat"]').count(),1,'The bought cat appears in the shop scene');
    await tab(page,'reviews');await item(page,'review-filter','5');assert.equal(await page.locator('.review').count(),1);
    await click(page,'reply');await page.locator('#review-reply').fill('<b>Cảm ơn bạn!</b>');await click(page,'save-reply');
    assert.equal(await page.locator('.owner-reply b').count(),0,'Reply markup stays literal');assert.match(await page.locator('.owner-reply').textContent(),/<b>Cảm ơn bạn!<\/b>/);
    await tab(page,'stock');await click(page,'clear-cart');await click(page,'open-day');
    assert.equal(await page.locator('[data-action="broth"]').count(),G.INGREDIENTS.filter(i=>i.kind==='broth').length);
    assert.equal(await page.locator('[data-action="topping"]').count(),G.INGREDIENTS.filter(i=>i.kind==='topping').length);
    assert.equal(await page.locator('[data-action="pot"]').count(),3);
    await click(page,'bowl');await item(page,'broth','mala');await page.locator('[data-action="pot"][data-index="0"]').click();await page.locator('[data-action="pot"][data-index="1"]').click();await page.locator('[data-action="pot"][data-index="2"]').click();
    assert.equal((await save(page)).activeDay.pots.filter(Boolean).length,3);
  },{fixture:advancedFixture()});

  await scenario('export-import-preserves-state-and-escapes-name',async page=>{
    await click(page,'continue');const original=await save(page);await click(page,'menu');
    const pending=page.waitForEvent('download');await click(page,'export');const download=await pending;
    const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);const bytes=Buffer.concat(chunks);
    assert.deepEqual(JSON.parse(bytes),original,'Export contains the current save');
    await click(page,'rename');await page.locator('#rename-input').fill('Temporary replacement');await click(page,'save-name');
    assert.equal((await save(page)).name,'Temporary replacement');await click(page,'menu');
    const chooserEvent=page.waitForEvent('filechooser');await click(page,'import');const chooser=await chooserEvent;
    const imported={...original,name:'<img src=x onerror=alert(1)>'};await chooser.setFiles({name:'roundtrip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});
    await page.locator('#confirm-import').waitFor();assert.equal(await page.locator('#dialog [onerror]').count(),0);
    await page.locator('#confirm-import').click();assert.deepEqual(await save(page),imported);
    assert.equal(await page.locator('.shop-sign h1').textContent(),imported.name);assert.equal(await page.locator('.shop-sign h1 img').count(),0);
    await page.reload();await click(page,'continue');assert.deepEqual(await save(page),imported,'Imported data survives reload');
  },{fixture:advancedFixture()});

  let seededOrder;
  for(const attempt of [1,2])await scenario(`daily-challenge-preserves-main-and-seed-${attempt}`,async page=>{
    await click(page,'continue');const main=await save(page);await tab(page,'accounts');await click(page,'records');await click(page,'challenge');
    assert.deepEqual(await save(page),main,'Starting a challenge does not overwrite the main shop');
    await page.clock.runFor(12200);assert.ok(await page.locator('.customer').count()>0);
    const orderText=await page.locator('#ticket').textContent();if(attempt===1)seededOrder=orderText;else assert.equal(orderText,seededOrder,'Same date and initial challenge seed create the same first order');
    assert.deepEqual(await save(page),main,'Challenge ticking/autosave leaves the main save intact');
    const challengeOrder=await orderFromUI(page);await assemble(page,challengeOrder);await click(page,'serve');
    const rating=Number(await page.locator('[data-value="reputation"]').textContent());
    assert.deepEqual(await save(page),main,'Challenge ingredient consumption and service leave the main save intact');
    await click(page,'finish');await click(page,'force-finish');
    assert.deepEqual(await save(page),main,'Ending the challenge restores all main-shop state');
    assert.match(await page.locator('#dialog-title').textContent(),/thử thách hoàn thành/);
    const records=await page.evaluate(()=>JSON.parse(localStorage.getItem('tiem-mi-cay-records-v2')));assert.equal(records.length,1);assert.equal(records[0].date,'2026-09-30');assert.equal(records[0].name,main.name);
    assert.equal(records[0].score,100+(rating===5?50:0),'Challenge score includes the perfect-order bonus after settlement');
  },{fixture:advancedFixture()});

  await scenario('bargaining-color-zones-discount-and-once-per-day',async page=>{
    await click(page,'continue');const before=await save(page),cart=G.suggestedCart(before),quoteBefore=G.cartCost(before,cart);
    await click(page,'bargain');
    const green=await page.locator('.bargain-green').evaluate(e=>{const p=e.parentElement.getBoundingClientRect(),r=e.getBoundingClientRect();return {width:r.width/p.width,left:(r.left-p.left)/p.width}});
    assert.ok(Math.abs(green.width-.16)<.015&&green.left>.3,'Bargaining green target occupies a real visible band');
    for(let round=0;round<3;round++){
      const state=await save(page),center=state.sidequests.market.centers[round],speed=[.8,1.1,1.45][round];
      await page.clock.runFor(Math.round(center/speed*1000/40)*40);await page.locator('#market-stop').click();
      assert.equal((await save(page)).sidequests.market.discount,(round+1)*5/100,'Stopping within green earns5%');
      await page.locator('#market-stop').click();
    }
    await close(page);const after=await save(page);assert.equal(after.sidequests.market.done,true);assert.equal(after.sidequests.market.discount,.15);
    const quoteAfter=G.cartCost(after,cart);assert.ok(quoteAfter<quoteBefore);assert.ok((await page.locator('#cart-summary').textContent()).includes(G.formatMoney(quoteAfter)),'Discount updates the actual preparation cart quote');
    await click(page,'bargain');assert.equal(await page.locator('dialog').evaluate(d=>d.open),false);assert.deepEqual((await save(page)).sidequests.market,after.sidequests.market,'Bargaining cannot be replayed today');
    await page.clock.runFor(10000);assert.deepEqual(await save(page),after,'The mini-game timer is disposed after closing');
  },{fixture:dayThreeFixture(false)});

  await scenario('secret-broth-memory-persistence-and-service-bonus',async page=>{
    await click(page,'continue');const inventory={...(await save(page)).inventory};await click(page,'secret');await page.locator('[data-broth-choice="kimchi"]').click();
    const sequence=(await save(page)).sidequests.secret.sequence;assert.equal(await page.locator('[data-spice-choice]').first().isDisabled(),true);
    await page.clock.runFor(Math.ceil((sequence.length+1)*820+100));assert.equal(await page.locator('[data-spice-choice]').first().isEnabled(),true);
    for(const spice of sequence)await page.locator(`[data-spice-choice="${spice}"]`).click();
    const success=await save(page);assert.equal(success.sidequests.secret.success,true);assert.deepEqual(success.inventory,inventory,'Learning a recipe does not fabricate or consume ingredients');
    await close(page);await page.reload();await click(page,'continue');assert.equal((await save(page)).sidequests.secret.success,true);
    await click(page,'secret');assert.equal(await page.locator('dialog').evaluate(d=>d.open),false,'A learned recipe cannot be replayed today');
    await click(page,'open-day');await page.clock.runFor(12200);const order=(await save(page)).activeDay.orders[0];await assemble(page,order,{cookMs:1000});
    const assembled=await save(page),withoutSecret=structuredClone(assembled);delete withoutSecret.sidequests.secret;
    const baseline=G.serveBowl(withoutSecret,()=>.5);assert.ok(baseline.ok);await click(page,'serve');const served=await save(page);
    assert.equal(served.money,withoutSecret.money+2000,'Secret broth adds2000đ to the matching dine-in order');assert.equal(served.reviews.at(-1).rating,Math.min(5,baseline.rating+1),'Secret broth improves the review by one star');
  },{fixture:dayThreeFixture(true)});

  await scenario('washing-keyboard-recovery-once-and-cleanup',async page=>{
    await click(page,'continue');const before=await save(page);assert.equal(before.lastDay.day,2);assert.equal(before.lastDay.dineInServed,3);
    await click(page,'wash');const wash=(await save(page)).sidequests.washing;assert.equal(wash.frames,3);await page.locator('#scrub-bowl').focus();
    for(let i=0;i<wash.frames*8;i++)await page.keyboard.press('Space');
    const washed=await save(page);assert.equal(washed.sidequests.washing.done,true);assert.equal(washed.sidequests.washing.recovered,3);assert.equal(washed.inventory.bowls,before.inventory.bowls+3);
    await close(page);await click(page,'wash');assert.equal(await page.locator('dialog').evaluate(d=>d.open),false);assert.equal((await save(page)).inventory.bowls,washed.inventory.bowls,'Clean bowls cannot be awarded twice');
    await page.clock.runFor(20000);assert.equal((await save(page)).inventory.bowls,washed.inventory.bowls,'Closed washing timer cannot recover another batch');
  },{fixture:washingFixture()});

  await scenario('incident-modal-pause-reload-and-resolve-once',async page=>{
    await click(page,'continue');const before=await save(page),pending=before.activeDay.pendingIncident;
    assert.equal(await page.locator('dialog').evaluate(d=>d.open),true);assert.equal(await page.locator('dialog').getAttribute('data-incident'),pending.id);
    assert.equal(await page.locator('.modal-close').isVisible(),false,'Incident requires an explicit response');
    await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').evaluate(d=>d.open),true,'Escape cannot discard an unresolved incident');
    await page.clock.runFor(40000);assert.deepEqual(await save(page),before,'Incident pauses patience, cooking, and closing clocks');
    await page.reload();await click(page,'continue');assert.equal(await page.locator('dialog').getAttribute('data-incident'),pending.id);assert.deepEqual(await save(page),before,'Reload restores the exact unresolved incident');
    assert.equal(await page.locator('[data-action="incident"][data-id="ignore"]').isDisabled(),true,'Choices lock briefly so a tap meant for the kitchen cannot answer');await page.clock.runFor(1100);
    const button=await page.locator('[data-action="incident"][data-id="ignore"]').elementHandle();await button.evaluate(node=>{node.click();node.click();});
    const resolved=await save(page);assert.equal(resolved.activeDay.pendingIncident,null);assert.equal(resolved.money,before.money-pending.bill);assert.equal(resolved.stats.expenses,before.stats.expenses+pending.bill);
    assert.equal(await page.locator('dialog').evaluate(d=>d.open),false);await page.clock.runFor(2200);assert.ok((await save(page)).activeDay.remaining<before.activeDay.remaining,'Service resumes after resolution');
    await click(page,'finish');await click(page,'force-finish');assert.equal((await save(page)).phase,'closing');await page.clock.runFor(61000);
    const ended=await save(page);assert.equal(ended.phase,'prep');assert.equal(ended.day,3);assert.equal(ended.history.length,1);assert.equal(ended.lastDay.lost,1);
  },{fixture:incidentFixture(false)});

  await scenario('far-delivery-ride-settles-once',async page=>{
    await click(page,'continue');const before=await save(page);assert.equal(await page.locator('#dialog-title').textContent(),'Đơn giao xa');
    await page.clock.runFor(1100);await page.locator('[data-action="incident"][data-id="ride"]').click();
    assert.equal(await page.locator('#trip-canvas').isVisible(),true,'The scooter ride opens in the dialog');
    for(let second=0;second<40&&!(await page.locator('#dialog .modal-actions [data-action="close-modal"]').count());second++)await page.clock.runFor(1000);
    const after=await save(page);assert.equal(after.activeDay.pendingIncident,null);assert.ok(after.money>=before.money+15000,'Riding pays at least the courier fee');assert.equal(after.reviews.length,before.reviews.length+1,'The review is written once the order arrives');
    await close(page);assert.equal(await page.locator('dialog').evaluate(d=>d.open),false);
  },{fixture:tripFixture('ride')});

  await scenario('starship-flight-fuel-back-and-settlement',async page=>{
    await click(page,'continue');const before=await save(page),planet=G.PLANETS.find(row=>row.id===before.activeDay.pendingIncident.planet);assert.match(await page.locator('#dialog-title').textContent(),/Đơn tới/);
    await page.clock.runFor(1100);await page.locator('[data-action="incident"][data-id="fly"]').click();
    assert.equal(await page.locator('[data-action="launch"]').count(),3,'Three fuel loads');await page.locator('[data-action="trip-back"]').click();
    await page.clock.runFor(1100);assert.equal(await page.locator('[data-action="incident"][data-id="drone"]').count(),1,'Going back offers the drone again');
    await page.locator('[data-action="incident"][data-id="fly"]').click();await page.locator('[data-action="launch"][data-id="full"]').click();
    assert.equal(await page.locator('#trip-canvas').isVisible(),true,'The starship flight opens in the dialog');
    for(let second=0;second<120&&!(await page.locator('#dialog .modal-actions [data-action="close-modal"]').count());second++)await page.clock.runFor(1000);
    const after=await save(page);assert.equal(after.activeDay.pendingIncident,null);
    assert.ok(after.money>=before.money-35000+planet.fee&&after.money<=before.money-35000+Math.round(planet.fee*1.3),'Fee plus bonus, minus the full tank');
    await close(page);
  },{fixture:tripFixture('flight')});

  await scenario('incident-on-final-closing-order-does-not-stall',async page=>{
    await click(page,'continue');const before=await save(page);assert.equal(before.phase,'closing');assert.equal(before.activeDay.orders.length,0);
    await page.clock.runFor(65000);assert.deepEqual(await save(page),before,'Closing waits while the decision remains pending');
    await item(page,'incident','ignore');await page.clock.runFor(1000);const ended=await save(page);
    assert.equal(ended.phase,'prep');assert.equal(ended.day,3);assert.equal(ended.history.length,1);assert.equal(ended.lastDay.served,1);
    await page.clock.runFor(5000);assert.deepEqual(await save(page),ended,'Settlement is not repeated after the incident');
  },{fixture:incidentFixture(true)});

  for(const size of [{width:375,height:812},{width:390,height:844},{width:1440,height:900},{width:1024,height:600},{width:844,height:390}]){
    await scenario(`responsive-${size.width}x${size.height}`,async page=>{
      await click(page,'continue');
      for(const name of ['stock','prices','upgrades','decor','reviews','accounts']){await tab(page,name);await noOverflow(page,`prep ${name}`);}
      await tab(page,'stock');await click(page,'clear-cart');await click(page,'open-day');await noOverflow(page,'full kitchen');
      await page.locator('[data-action="topping"]').last().scrollIntoViewIfNeeded();assert.ok(await hitTest(page.locator('[data-action="topping"]').last()),'Last topping reachable');
      await page.locator('[data-action="finish"]').scrollIntoViewIfNeeded();assert.ok(await hitTest(page.locator('[data-action="finish"]')),'Closing control reachable');
      await page.screenshot({path:`test-results/parity-${size.width}x${size.height}.png`,fullPage:true,animations:'disabled'});
    },{fixture:advancedFixture(),viewport:size});
  }
  assert.deepEqual(errors,[],'No browser runtime errors');assert.deepEqual(badRequests,[],'No missing assets');assert.deepEqual(externalRequests,[],'Everything loads locally');
}finally{
  await browser.close();await writeFile('test-results/parity-browser-results.json',JSON.stringify({results,errors,badRequests,externalRequests},null,2));
}
const failures=results.filter(r=>!r.passed);console.log(`Parity browser checks: ${results.length-failures.length}/${results.length} passed.`);for(const failure of failures)console.error(`${failure.name}: ${failure.error}`);if(failures.length)process.exitCode=1;

async function scenario(name,run,{fixture,viewport={width:1440,height:900}}={}){
  const context=await browser.newContext({viewport,acceptDownloads:true});const page=await context.newPage();page.setDefaultTimeout(8000);
  page.on('pageerror',e=>errors.push(`${name}: ${e.message}`));page.on('response',r=>{if(r.status()>=400)badRequests.push(`${name}: ${r.status()} ${r.url()}`)});page.on('request',r=>{if(!r.url().startsWith(url)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))externalRequests.push(r.url())});
  try{
    await page.clock.install({time:new Date('2026-09-30T00:00:00Z')});await page.clock.pauseAt(new Date('2026-09-30T00:00:01Z'));
    await page.addInitScript(({fixture,key})=>{Math.random=()=>.5;if(!sessionStorage.getItem('parity-initialized')){if(fixture)localStorage.setItem(key,JSON.stringify(fixture));localStorage.setItem('tiem-mi-cay-preferences-v1',JSON.stringify({sound:false,motion:false,theme:'light'}));sessionStorage.setItem('parity-initialized','true')}},{fixture,key:G.SAVE_KEY});
    await page.goto(url);await page.evaluate(()=>document.fonts.ready);await run(page);results.push({name,passed:true});console.log(`PASS ${name}`);
  }catch(error){results.push({name,passed:false,error:error.stack});await page.screenshot({path:`test-results/parity-failed-${name}.png`,fullPage:true,animations:'disabled'}).catch(()=>{});console.error(`FAIL ${name}: ${error.message}`)}finally{await context.close();}
}
async function click(page,action){await page.locator(`[data-action="${action}"]`).last().click();}
async function item(page,action,id){await page.locator(`[data-action="${action}"][data-id="${id}"]`).click();}
async function tab(page,id){await item(page,'tab',id);}
async function close(page){await page.locator('#dialog [data-action="close-modal"]').last().click();}
async function save(page){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)),G.SAVE_KEY);}
async function assemble(page,order,{wrongSpice=false,cookMs=3000}={}){await click(page,'bowl');await item(page,'broth',order.broth);for(const topping of order.toppings)await item(page,'topping',topping);for(let i=0;i<(wrongSpice?(order.spice+1)%8:order.spice);i++)await click(page,'chili');await click(page,'pot');await page.clock.runFor(cookMs);await click(page,'pot');}
async function orderFromUI(page){const name=await page.locator('#ticket .ticket-main h2').textContent(),broth=G.INGREDIENTS.find(i=>i.name===name)?.id;assert.ok(broth);const toppings=await page.locator('#ticket .order-toppings img').evaluateAll(images=>images.map(i=>i.getAttribute('src').split('/').at(-1).replace('.svg','')));return {broth,toppings,spice:Number(await page.locator('#ticket .spice-stamp strong').textContent())};}
async function noOverflow(page,where){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${where} has horizontal overflow`);}
async function hitTest(locator){return locator.evaluate(element=>{const r=element.getBoundingClientRect();return element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})}
function stock(state,quantity=15){assert.ok(G.buyCart(state,Object.fromEntries(state.unlocked.map(id=>[id,quantity]))).ok);return state;}
function openFixture(){const state=stock(G.createGame('Tiệm kiểm tra ca bán'));state.settings.sound=false;state.settings.motion=false;assert.ok(G.beginDay(state).ok);assert.ok(G.createOrder(state,()=>.5).ok);assert.ok(G.loadGame({getItem:()=>JSON.stringify(state)}));return state;}
function advancedFixture(){const state=G.createGame('Tiệm đủ món');state.xp=8000;state.money=100000000;state.settings.sound=false;state.settings.motion=false;state.unlocked=G.INGREDIENTS.map(i=>i.id);stock(state,15);for(const id of ['pot2','pot3'])assert.ok(G.buyUpgrade(state,id).ok);state.reviews=[{id:'day-1-order-101',day:1,name:'Mai',rating:5,stars0:5,cause:'great',text:'Mì ngon!',thread:[],xp:false},{id:'day-1-order-102',day:1,name:'An',rating:3,stars0:3,cause:'wait',text:'Mong phục vụ nhanh hơn.',thread:[],xp:false}];state.reputation=4;assert.ok(G.loadGame({getItem:()=>JSON.stringify(state)}));return state;}
function dayThreeFixture(withStock){const state=G.createGame('Tiệm ngày ba');state.day=3;state.money=1000000;state.settings.sound=false;state.settings.motion=false;if(withStock)stock(state);assert.ok(G.loadGame({getItem:()=>JSON.stringify(state)}));return state;}
function washingFixture(){const state=G.createGame('Tiệm rửa tô');state.day=2;state.money=1000000;state.settings.sound=false;state.settings.motion=false;stock(state);assert.ok(G.beginDay(state).ok);for(let i=0;i<3;i++){const {order}=G.createOrder(state,()=>.5);assert.ok(order);G.takeBowl(state);G.addBroth(state,order.broth);for(const id of order.toppings)G.addTopping(state,id);for(let n=0;n<order.spice;n++)G.addChili(state);G.startPot(state);G.tickDay(state,3.1,()=>.5);G.collectPot(state);assert.ok(G.serveBowl(state,()=>.5).ok)}assert.equal(G.finishDay(state).finished,true);assert.ok(G.loadGame({getItem:()=>JSON.stringify(state)}));return state;}
function tripFixture(kind){const flight=kind==='flight',state=G.createGame('Tiệm giao xa');state.day=10;state.money=5000000;state.xp=flight?6000:950;state.settings.sound=false;state.settings.motion=false;state.upgrades[flight?'spaceport':'delivery']=true;assert.ok(G.buyCart(state,{bowls:30,noodles:30,kimchi:20,beef:20,sausage:20}).ok);const rolls=flight?[.99,.99,.99,.1,.5]:[.99,.99,.99];let roll=0;assert.ok(G.beginDay(state,()=>roll<rolls.length?rolls[roll++]:.99).ok);state.activeDay.nextArrival=999;G.tickDay(state,flight?90:22.1,()=>flight?.5:.1);const order=state.activeDay.orders.find(row=>flight?row.planet:row.far);assert.ok(order);G.selectOrder(state,order.id);G.takeBowl(state);G.addBroth(state,order.broth);for(const id of order.toppings)G.addTopping(state,id);for(let n=0;n<order.spice;n++)G.addChili(state);G.startPot(state);G.tickDay(state,3.3,()=>.5);G.collectPot(state);assert.ok(G.serveBowl(state,()=>.5).ok);assert.equal(state.activeDay.pendingIncident.type,flight?'flight':'ride');assert.ok(G.loadGame({getItem:()=>JSON.stringify(state)}));return state;}
function incidentFixture(closing){const state=G.createGame('Tiệm xử lý tình huống');state.day=2;state.money=1000000;state.settings.sound=false;state.settings.motion=false;stock(state);assert.ok(G.beginDay(state).ok);const {order}=G.createOrder(state,()=>.5);if(!closing)assert.ok(G.createOrder(state,()=>.5).ok);G.takeBowl(state);G.addBroth(state,order.broth);for(const id of order.toppings)G.addTopping(state,id);for(let n=0;n<order.spice;n++)G.addChili(state);G.startPot(state);G.tickDay(state,3.1,()=>.5);G.collectPot(state);G.startPot(state);if(closing)assert.equal(G.finishDay(state).closing,true);const draws=[.5,.02,.9,.4,.2],result=G.serveBowl(state,()=>draws.shift()??.5);assert.equal(result.incident?.type,'dash');assert.ok(G.loadGame({getItem:()=>JSON.stringify(state)}));return state;}
