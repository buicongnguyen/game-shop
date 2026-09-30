import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { INGREDIENTS, STAFF, UPGRADES, SAVE_KEY, formatMoney } from '../src/game.js';

const port = 4176;
const server = spawn(process.execPath, ['server.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, PORT: String(port) },
  stdio: 'pipe',
});
let browser;

try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Local progression test server did not start.')), 10000);
    server.stdout.once('data', () => { clearTimeout(timeout); resolve(); });
    server.once('error', error => { clearTimeout(timeout); reject(error); });
    server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Local server exited with code ${code}.`)); });
  });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  const dialogs = [];
  const badRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) badRequests.push(response.url()); });
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });

  await page.goto(`http://127.0.0.1:${port}`);
  await page.locator('[data-action="start"]').click();
  await page.locator('#shop-name').fill('Tiệm Kiểm Tra');
  await page.locator('[data-action="create"]').click();
  let expectedMoney = 400000;
  let expectedExpenses = 0;
  assert.equal((await readSave(page)).money, expectedMoney);

  await tab(page, 'staff');
  const cashier = STAFF.find(member => member.id === 'cashier');
  const cashierButton = page.locator('[data-action="hire"][data-id="cashier"]');
  assert.ok((await cashierButton.textContent()).includes(formatMoney(cashier.price)), 'Cashier displays catalog price');
  await cashierButton.click();
  expectedMoney -= cashier.price;
  expectedExpenses += cashier.price;
  assert.equal((await readSave(page)).staff.cashier, true);
  assert.equal(await cashierButton.isDisabled(), true, 'A hired employee cannot be purchased twice');
  await assertAccounts(page, expectedMoney, expectedExpenses);

  await tab(page, 'upgrades');
  for (const id of ['stove', 'seating', 'decor']) {
    const upgrade = UPGRADES.find(item => item.id === id);
    const button = page.locator(`[data-action="upgrade"][data-id="${id}"]`);
    assert.ok((await button.textContent()).includes(formatMoney(upgrade.price)), `${id} displays catalog price`);
    assert.equal(await button.isEnabled(), true);
    await button.click();
    expectedMoney -= upgrade.price;
    expectedExpenses += upgrade.price;
    assert.equal((await readSave(page)).upgrades[id], 1);
    assert.ok((await button.textContent()).includes(formatMoney(upgrade.price * 2)), `${id} displays its next-level price`);
    await assertAccounts(page, expectedMoney, expectedExpenses);
  }
  assert.equal(expectedMoney, 55000);
  assert.equal(await page.locator('[data-action="upgrade"][data-id="stove"]').isDisabled(), true, 'Unaffordable upgrades are disabled');
  await tab(page, 'staff');
  assert.equal(await page.locator('[data-action="hire"][data-id="chef"]').isDisabled(), true, 'Unaffordable hiring is disabled');
  assert.equal(await cashierButton.isDisabled(), true, 'Hired state survives tab changes');

  await page.locator('[data-action="settings"]').click();
  await page.locator('[data-action="setting"][data-key="theme"]').click();
  await page.locator('[data-action="setting"][data-key="motion"]').click();
  const savedBeforeReload = await readSave(page);
  await page.reload();
  await page.locator('[data-action="start"]').click();
  assert.deepEqual(await readSave(page), savedBeforeReload, 'Hiring, upgrades, accounting, and preferences survive reload');
  assert.equal(await page.locator('html').evaluate(element => element.classList.contains('dark')), true);
  assert.equal(await page.locator('html').evaluate(element => element.classList.contains('calm')), true);
  await page.locator('[data-action="settings"]').click();
  assert.equal(await page.locator('[data-action="setting"][data-key="theme"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-action="setting"][data-key="motion"]').getAttribute('aria-pressed'), 'false');

  const downloadReady = page.waitForEvent('download');
  await page.locator('[data-action="export"]').click();
  const download = await downloadReady;
  assert.equal(download.suggestedFilename(), 'tiem-mi-cay-ngay-1.json');
  const stream = await download.createReadStream();
  assert.ok(stream, 'The exported save is readable');
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const exportedBytes = Buffer.concat(chunks);
  const exportedState = JSON.parse(exportedBytes.toString('utf8'));
  assert.deepEqual(exportedState, await readSave(page), 'Export contains the exact current save');

  await page.locator('#dialog [data-action="close"]').click();
  await tab(page, 'stock');
  const noodles = INGREDIENTS.find(item => item.id === 'noodles');
  const noodleButton = page.locator('[data-action="buy"][data-id="noodles"]');
  assert.ok((await noodleButton.textContent()).includes(formatMoney(noodles.price * noodles.pack)));
  await noodleButton.click();
  assert.equal((await readSave(page)).money, exportedState.money - noodles.price * noodles.pack);
  assert.equal((await readSave(page)).inventory.noodles, exportedState.inventory.noodles + noodles.pack);
  await page.locator('[data-action="settings"]').click();
  await chooseImport(page, exportedBytes, 'round-trip.json');
  assert.ok((await page.locator('#dialog').textContent()).includes(exportedState.name));
  await page.locator('#accept-import').click();
  assert.deepEqual(await readSave(page), exportedState, 'Import restores the exported financial and inventory state');

  const hostileSave = structuredClone(exportedState);
  hostileSave.name = '<img src=x onerror=alert(1)>';
  hostileSave.reviews = [{
    id: 'day-1-order-1', day: 1, rating: 5,
    name: '<b data-import-probe>Guest</b>',
    text: '<img src=x onerror=alert(2)>',
  }];
  await page.locator('[data-action="settings"]').click();
  await chooseImport(page, Buffer.from(JSON.stringify(hostileSave)), 'escaped-text.json');
  assert.ok((await page.locator('#dialog').textContent()).includes(hostileSave.name), 'Import preview shows the shop name as literal text');
  assert.equal(await page.locator('#dialog [onerror]').count(), 0, 'Import preview cannot create HTML from the name');
  await page.locator('#accept-import').click();
  assert.equal(await page.locator('.shop-sign h1').textContent(), hostileSave.name);
  assert.equal(await page.locator('.shop-sign h1 img').count(), 0);
  await tab(page, 'reviews');
  assert.equal(await page.locator('.review b').textContent(), hostileSave.reviews[0].name);
  assert.equal(await page.locator('.review p').textContent(), hostileSave.reviews[0].text);
  assert.equal(await page.locator('[data-import-probe], [onerror]').count(), 0, 'Imported review text remains text');
  await page.reload();
  await page.locator('[data-action="start"]').click();
  assert.equal(await page.locator('html').evaluate(element => element.classList.contains('dark')), true, 'Imported dark preference survives reload');
  assert.equal((await readSave(page)).settings.theme, 'dark');
  assert.equal((await readSave(page)).settings.motion, false);
  assert.equal(await page.locator('.shop-sign h1').textContent(), hostileSave.name);
  assert.deepEqual(errors, [], 'No browser exceptions');
  assert.deepEqual(dialogs, [], 'Imported markup does not execute');
  assert.deepEqual(badRequests, [], 'All assets load and imported markup creates no requests');
  console.log('Progression browser test passed: catalog pricing, cashier hiring, three upgrades, affordability, expense persistence, dark/motion reload, exported JSON restoration through the file chooser, and escaped imported names/reviews.');
} finally {
  await browser?.close();
  server.kill();
  if (server.exitCode === null && server.signalCode === null) await new Promise(resolve => server.once('exit', resolve));
}

async function readSave(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
}

async function tab(page, id) {
  await page.locator(`[data-action="tab"][data-tab="${id}"]`).click();
}

async function assertAccounts(page, balance, expenses) {
  const state = await readSave(page);
  assert.equal(state.money, balance);
  assert.equal(state.stats.expenses, expenses);
  assert.equal(state.pendingExpenses, expenses);
  assert.equal(await page.locator('#wallet').textContent(), formatMoney(balance));
}

async function chooseImport(page, buffer, name) {
  const chooserReady = page.waitForEvent('filechooser');
  await page.locator('[data-action="import"]').click();
  const chooser = await chooserReady;
  await chooser.setFiles({ name, mimeType: 'application/json', buffer });
  await page.locator('#accept-import').waitFor({ state: 'visible' });
}
