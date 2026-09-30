import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createGame, beginDay, createOrder, RECIPES, SAVE_KEY, formatMoney } from '../src/game.js';

const port=4177;
const url=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port)},stdio:'pipe'});
let browser;
const errors=[];
let scenarios=0;
try {
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Audit test server did not start')),10000);
    server.stdout.once('data',()=>{clearTimeout(timeout);resolve();});
    server.once('error',error=>{clearTimeout(timeout);reject(error);});
    server.once('exit',code=>{clearTimeout(timeout);reject(new Error(`Server exited ${code}`));});
  });
  await mkdir('test-results',{recursive:true});
  browser=await chromium.launch({headless:true});

  // A malformed path must not terminate the server for the next ordinary request.
  const request=await browser.newContext();
  for(const pathname of ['/src/%00/app.js','/assets/%00.svg','/%E0%A4%A']){
    assert.equal((await request.request.get(url+pathname)).status(),400);
    assert.equal((await request.request.get(url)).status(),200);
  }
  assert.equal((await request.request.get(url+'/src/..%2fserver.mjs')).status(),404);
  await request.close();scenarios++;

  // Preferences must work before a save exists, persist across reload, and remain keyboard operable.
  let {context,page}=await freshPage();
  await click(page,'settings');
  const theme=page.locator('[data-action="setting"][data-key="theme"]');
  await theme.focus();await page.keyboard.press('Space');
  assert.equal(await theme.getAttribute('aria-pressed'),'true');
  assert.ok(await theme.evaluate(element=>element===document.activeElement));
  await page.keyboard.press('Escape');
  await page.reload();
  assert.ok(await page.locator('html').evaluate(element=>element.classList.contains('dark')));
  await click(page,'start');await page.locator('#shop-name').fill('Kiểm tra bàn phím');await click(page,'create');
  assert.equal((await readSave(page)).settings.theme,'dark');
  await page.locator('[data-action="tab"][data-tab="prices"]').focus();await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.tab),'prices');
  await page.locator('[data-action="tab"][data-tab="stock"]').click();
  const buy=page.locator('[data-action="buy"][data-id="noodles"]');
  await buy.focus();await page.keyboard.press('Enter');
  assert.ok(await buy.evaluate(element=>element===document.activeElement));
  assert.equal((await readSave(page)).inventory.noodles,17);
  await click(page,'menu');await click(page,'help');await click(page,'help-next');
  const contrast=await page.locator('.help-steps>span').first().evaluate(element=>({fg:getComputedStyle(element).color,bg:getComputedStyle(element).backgroundColor}));
  assert.ok(contrastRatio(contrast.fg,contrast.bg)>=4.5,`Dark tutorial contrast ${JSON.stringify(contrast)}`);
  await page.screenshot({path:'test-results/audit-dark-help.png',animations:'disabled'});
  await context.close();scenarios++;

  // All recipes and maximum spice work through the real assembly controls, including corrected mistakes.
  for(let index=0;index<RECIPES.length;index++){
    const recipe=RECIPES[index];const spice=[0,4,7][index];
    const state=openFixture(index,spice);const initialStock={...state.inventory};
    ({context,page}=await freshPage(state,{width:390,height:844}));
    await click(page,'start');await click(page,'new-bowl');
    await page.locator(`[data-action="broth"][data-id="${recipe.id}"]`).click();
    await click(page,'cook');await page.clock.runFor(1000);await click(page,'cook');
    for(const topping of recipe.toppings) await page.locator(`[data-action="topping"][data-id="${topping}"]`).click();
    await page.locator(`[data-action="spice"][data-value="${spice}"]`).click();
    await click(page,'serve');assert.match(await page.locator('#toast').textContent(),/chưa chín/);
    assert.equal((await readSave(page)).stats.served,0);
    await click(page,'cook');await page.clock.runFor(5200);await click(page,'cook');
    await click(page,'serve');assert.match(await page.locator('#toast').textContent(),/cháy|nhũn/);
    await click(page,'cook');await page.clock.runFor(3400);await click(page,'cook');
    await click(page,'serve');
    const saved=await readSave(page);
    assert.equal(saved.stats.served,1,`${recipe.id}: successful real UI service`);
    assert.equal(saved.money,state.money+recipe.price);
    for(const ingredient of ['noodles','broth',...recipe.toppings]) assert.equal(saved.inventory[ingredient],initialStock[ingredient]-1);
    assert.equal(saved.reviews[0].rating,5);
    await context.close();scenarios++;
  }

  // Exercise the real clock through automatic closure; not just the early-close control.
  ({context,page}=await freshPage(openFixture(0,0)));
  await click(page,'start');await click(page,'menu');
  await page.clock.runFor(60000);
  await page.keyboard.press('Escape');
  await page.clock.runFor(2200);
  assert.ok((await readSave(page)).activeDay.remaining>207,'Modal pause does not consume 60 seconds');
  await page.clock.runFor(209000);
  const ended=await readSave(page);
  assert.equal(ended.day,2);assert.equal(ended.phase,'prep');assert.equal(ended.activeDay,null);
  assert.equal(ended.money,345000);assert.equal(ended.history.length,1);
  assert.equal(ended.lastDay.lost,ended.lastDay.customers);assert.equal(ended.lastDay.served,0);
  await page.clock.runFor(60000);
  assert.deepEqual(await readSave(page),ended,'End-of-day modal cannot settle twice');
  await context.close();scenarios++;

  // Hidden tabs pause both customer patience and noodle cooking.
  ({context,page}=await freshPage(openFixture(0,0)));
  await click(page,'start');await click(page,'new-bowl');await click(page,'cook');
  await page.clock.runFor(1000);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  const hiddenSave=await readSave(page);
  await page.clock.runFor(60000);
  assert.deepEqual(await readSave(page),hiddenSave);
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await page.clock.runFor(2200);await click(page,'cook');
  assert.match(await page.locator('#toast').textContent(),/vừa chín/);
  await context.close();scenarios++;

  // A changed customer list must not steal focus from an existing keyboard selection.
  ({context,page}=await freshPage(openFixture(0,0)));
  await click(page,'start');await page.locator('.customer').first().focus();
  const focusedId=await page.evaluate(()=>document.activeElement.dataset.id);
  await page.clock.runFor(9400);
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.id),focusedId);
  await page.locator('.customer').last().focus();await page.keyboard.press('Enter');
  assert.ok(await page.locator('.customer.selected').evaluate(element=>element===document.activeElement));
  await context.close();scenarios++;

  // Every essential control must be reachable by scrolling, including maximum seating capacity.
  for(const size of [{width:320,height:568},{width:390,height:844},{width:700,height:550},{width:1024,height:600},{width:844,height:390},{width:768,height:1024},{width:1440,height:900}]){
    const state=openFixture(0,0);state.upgrades.seating=3;
    for(let i=1;i<6;i++)createOrder(state,()=>.01);
    ({context,page}=await freshPage(state,size));await click(page,'start');
    assert.equal(await page.locator('.customer').count(),6);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const lastCustomer=page.locator('.customer').last();await lastCustomer.scrollIntoViewIfNeeded();
    assert.ok(await isHitTestable(lastCustomer),`Sixth customer reachable at ${size.width}×${size.height}`);
    await lastCustomer.click();assert.ok(await lastCustomer.evaluate(element=>element.classList.contains('selected')));
    assert.ok(await lastCustomer.evaluate(element=>element===document.activeElement),'Selecting a customer retains focus');
    const serve=page.locator('[data-action="serve"]');await serve.scrollIntoViewIfNeeded();
    assert.ok(await isHitTestable(serve),`Serve reachable at ${size.width}×${size.height}`);
    await serve.click();assert.match(await page.locator('#toast').textContent(),/thiếu mì/);
    const finish=page.locator('[data-action="finish"]');await finish.scrollIntoViewIfNeeded();
    assert.ok(await isHitTestable(finish),`Close day reachable at ${size.width}×${size.height}`);
    await finish.click();assert.match(await page.locator('#dialog-title').textContent(),/Đóng cửa/);
    await page.keyboard.press('Escape');
    await page.screenshot({path:`test-results/audit-play-${size.width}x${size.height}.png`,fullPage:true,animations:'disabled'});
    await context.close();scenarios++;
  }
  assert.deepEqual(errors,[],'No runtime errors in extended audit');
  console.log(`Audit browser suite passed ${scenarios} scenarios: malformed paths, first-run preferences, keyboard focus, dark contrast, all recipes/spices, raw/overcooked retry, modal/hidden pause, automatic settlement, and reachable controls at seven sizes with six customers.`);
} finally {
  await browser?.close();server.kill();
  if(server.exitCode===null&&server.signalCode===null)await new Promise(resolve=>server.once('exit',resolve));
}

async function freshPage(state,viewport={width:1440,height:900}){
  const context=await browser.newContext({viewport});const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.clock.install({time:new Date('2026-09-30T00:00:00Z')});
  await page.clock.pauseAt(new Date('2026-09-30T00:00:01Z'));
  if(state)await page.addInitScript(({key,state})=>{localStorage.setItem(key,JSON.stringify(state));},{key:SAVE_KEY,state});
  await page.goto(url);return {context,page};
}
function openFixture(index,spice){
  const state=createGame('Tiệm kiểm thử');state.settings.sound=false;beginDay(state);
  const randoms=[index/RECIPES.length+.01,.01,spice/8+.001];createOrder(state,()=>randoms.shift());return state;
}
async function click(page,action){await page.locator(`[data-action="${action}"]`).last().click();}
async function readSave(page){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);}
async function isHitTestable(locator){return locator.evaluate(element=>{const r=element.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&element.contains(document.elementFromPoint(x,y));});}
function contrastRatio(fg,bg){
  const luminance=rgb=>rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const a=luminance(fg),b=luminance(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
