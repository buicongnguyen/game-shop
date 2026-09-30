import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const port=4175;
const server=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port)},stdio:'pipe'});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(new Error(`Server exited: ${code}`)));});
await mkdir('test-results',{recursive:true});
let browser;
try {
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
  const page=await context.newPage();
  const errors=[],badRequests=[],externalRequests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)badRequests.push(response.url());});
  page.on('request',request=>{if(!request.url().startsWith(`http://127.0.0.1:${port}`)&&!request.url().startsWith('blob:'))externalRequests.push(request.url());});
  await page.addInitScript(()=>{Math.random=()=>.01;});
  await page.goto(`http://127.0.0.1:${port}`);
  assert.equal((await page.request.get(`http://127.0.0.1:${port}/src/..%2fserver.mjs`)).status(),404,'Static server rejects traversal');
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:'test-results/welcome-desktop.png',fullPage:true});
  await page.locator('[data-action="start"]').click();
  await page.locator('#shop-name').fill('Tiệm Mì Nhà Mình');
  await page.locator('[data-action="create"]').click();
  assert.match(await page.locator('.shop-sign h1').textContent(),/Tiệm Mì Nhà Mình/);
  await page.locator('[data-action="buy"][data-id="noodles"]').click();
  assert.equal((await readSave(page)).inventory.noodles,17);
  assert.equal((await readSave(page)).money,385000);
  for(const tab of ['prices','upgrades','staff','reviews','accounts','stock']){
    await page.locator(`[data-action="tab"][data-tab="${tab}"]`).click();
    assert.ok(await page.locator('.tab-panel').isVisible());
  }
  await page.screenshot({path:'test-results/prep-desktop.png',fullPage:true});
  assert.ok(await page.locator('[data-action="open-day"]').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight),'Desktop opening button stays in view');
  await page.locator('[data-action="open-day"]').click();
  await page.locator('.customer').first().focus();
  await page.waitForTimeout(500);
  assert.ok(await page.locator('.customer').first().evaluate(e=>e===document.activeElement),'Customer retains keyboard focus across ticks');
  await page.locator('[data-action="serve"]').click();
  assert.match(await page.locator('#toast').textContent(),/thiếu mì/);
  await page.locator('[data-action="new-bowl"]').click();
  await page.locator('[data-action="broth"][data-id="beef"]').click();
  await page.locator('[data-action="cook"]').click();
  await page.waitForFunction(()=>document.querySelector('#cook-label')?.textContent==='Vớt mì ngay!');
  await page.locator('[data-action="cook"]').click();
  for(const id of ['beef','greens','kimchi'])await page.locator(`[data-action="topping"][data-id="${id}"]`).click();
  await page.locator('[data-action="spice"][data-value="0"]').click();
  await page.screenshot({path:'test-results/kitchen-desktop.png',fullPage:true});
  await page.locator('[data-action="serve"]').click();
  assert.equal((await readSave(page)).stats.served,1);
  assert.equal((await readSave(page)).inventory.noodles,16);
  assert.equal((await readSave(page)).money,430000);
  await page.locator('[data-action="menu"]').click();
  const paused=(await readSave(page)).activeDay.remaining;
  await page.waitForTimeout(1100);
  assert.equal((await readSave(page)).activeDay.remaining,paused,'Dialog pauses the day');
  await page.locator('[data-action="close"]').last().click();
  await page.locator('[data-action="finish"]').click();
  await page.locator('[data-action="confirm-finish"]').click();
  assert.match(await page.locator('#dialog-title').textContent(),/Khép lại/);
  assert.equal((await readSave(page)).day,2);
  assert.equal((await readSave(page)).money,375000);
  assert.equal((await readSave(page)).history[0].expenses,70000);
  await page.screenshot({path:'test-results/day-report.png',fullPage:true});
  await page.locator('[data-action="close"]').last().click();
  await page.locator('[data-action="settings"]').click();
  await page.locator('[data-action="setting"][data-key="motion"]').click();
  await page.locator('[data-action="setting"][data-key="theme"]').click();
  await page.reload();
  await page.locator('[data-action="start"]').click();
  assert.match(await page.locator('.top-left b').textContent(),/Ngày 2/);
  assert.equal(await page.locator('html').getAttribute('class'),'calm dark');
  await page.locator('[data-action="settings"]').click();
  await page.locator('[data-action="setting"][data-key="theme"]').click();
  await page.locator('[data-action="close"]').click();
  for(const size of [{width:390,height:844},{width:320,height:680},{width:844,height:390}]){
    await page.setViewportSize(size);
    await page.locator('[data-action="tab"][data-tab="stock"]').click();
    await noHorizontalOverflow(page);
    await page.screenshot({path:`test-results/prep-${size.width}.png`,fullPage:true});
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-action="open-day"]').click();
  await noHorizontalOverflow(page);
  await page.screenshot({path:'test-results/kitchen-mobile.png',fullPage:true});
  const appStateBefore=await readSave(page);
  await page.reload();
  await page.locator('[data-action="start"]').click();
  assert.ok(await page.locator('.kitchen').isVisible(),'Active day survives reload');
  assert.equal((await readSave(page)).day,appStateBefore.day);
  assert.deepEqual(errors,[],'No browser exceptions');
  assert.deepEqual(badRequests,[],'All assets load');
  assert.deepEqual(externalRequests,[],'Local game has no third-party runtime requests');
  const blockedStorage=await context.newPage();
  await blockedStorage.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError')}}));
  await blockedStorage.goto(`http://127.0.0.1:${port}`);
  assert.ok(await blockedStorage.locator('[data-action="start"]').isVisible(),'Blocked storage does not blank startup');
  await blockedStorage.close();
  console.log('Browser smoke passed: onboarding, stock, all tabs, correct/incorrect service, settlement, modal pause, settings, persistence, active-day restore, desktop/mobile/landscape, and offline assets.');
} finally {
  await browser?.close();
  server.kill();
}
async function readSave(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('tiem-mi-cay-local-v1')));}
async function noHorizontalOverflow(page){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`No horizontal overflow at ${(await page.viewportSize()).width}px`);}
