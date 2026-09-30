import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const base = process.env.WALL_PREVIEW_URL ?? 'http://127.0.0.1:5173';
const screenshots = process.env.WALL_SCREENSHOTS ?? '/tmp/plasma-wall-smoke';
await mkdir(screenshots, { recursive: true });
async function accepted() {
  const scope = await page.evaluate(() => JSON.parse(localStorage.getItem('plasma-wall-scope')));
  const r = await page.request.get(
    `${base}/api/walls?modelId=${encodeURIComponent(scope.modelId)}&branchId=${encodeURIComponent(scope.branchId)}`,
  );
  assert.equal(r.status(), 200);
  return { scope, ...(await r.json()) };
}
async function accept() {
  await page.getByRole('button', { name: 'Accept feature', exact: true }).click();
  await page.locator('.wall-review').waitFor({ state: 'detached' });
}
try {
  await page.goto(`${base}/?stage=walls`);
  await page.getByRole('heading', { name: 'Construction intent, kept editable.' }).waitFor();
  assert.equal(await page.locator('vite-error-overlay').count(), 0);
  await page.getByRole('button', { name: 'New study', exact: true }).click();
  await page.getByRole('button', { name: '+ Straight wall', exact: true }).click();
  await page.locator('.wall-review').waitFor();
  assert.equal((await accepted()).walls.length, 0, 'Preview cannot mutate accepted state');
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await page.locator('.wall-review').waitFor({ state: 'detached' });
  assert.equal((await accepted()).walls.length, 0);
  await page.getByRole('button', { name: '+ Straight wall', exact: true }).click();
  await accept();
  const first = (await accepted()).walls[0];
  for (const [name, value] of [
    ['Last segment length', '4500'],
    ['Height', '3000'],
    ['Core thickness', '180'],
    ['Base elevation', '200'],
    ['Lateral offset', '100'],
  ]) {
    await page.getByRole('spinbutton', { name, exact: true }).fill(value);
  }
  await page.getByRole('button', { name: 'Preview parameters', exact: true }).click();
  await page.locator('.wall-review').waitFor();
  assert.equal((await accepted()).walls[0].heightMm, 2700);
  await accept();
  let result = await accepted();
  assert.equal(result.walls[0].id, first.id);
  assert.equal(result.walls[0].heightMm, 3000);
  assert.equal(result.outputs[0].quantities[0].netVolumeM3, 2.43);
  await page.getByLabel('Placement', { exact: true }).selectOption('start');
  await page.getByRole('button', { name: 'Preview opening', exact: true }).click();
  await accept();
  const hosted = (await accepted()).walls[0].openings[0];
  assert.equal(hosted.placement.distanceMm, 600);
  assert.equal(
    await page.locator('svg[aria-label="Wall elevation with hosted opening"] rect').count(),
    2,
  );
  await page.getByRole('button', { name: 'Reverse path', exact: true }).click();
  await accept();
  result = await accepted();
  assert.equal(result.walls[0].openings[0].id, hosted.id);
  assert.equal(result.walls[0].openings[0].placement.anchor, 'end');
  await page.getByRole('spinbutton', { name: 'Opening width', exact: true }).fill('9000');
  const headBeforeInvalid = result.headHash;
  await page.getByRole('button', { name: 'Preview opening edit', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.equal((await accepted()).headHash, headBeforeInvalid);
  await page.getByRole('spinbutton', { name: 'Opening width', exact: true }).fill('1200');
  await page.getByRole('spinbutton', { name: 'Height', exact: true }).fill('3200');
  await page.getByRole('button', { name: 'Preview parameters', exact: true }).click();
  await page.locator('.wall-review').waitFor();
  const current = await accepted();
  const previewResponse = await page.request.post(`${base}/api/walls/preview`, {
    data: {
      modelId: current.scope.modelId,
      branchId: current.scope.branchId,
      expectedHeadHash: current.headHash,
      operation: { type: 'SetWallParameters', wallId: first.id, parameters: { heightMm: 3400 } },
    },
  });
  assert.equal(previewResponse.status(), 200);
  const competing = await previewResponse.json();
  const c = await page.request.post(
    `${base}/api/walls/previews/${encodeURIComponent(competing.transactionId)}/commit`,
    { data: { modelId: current.scope.modelId, branchId: current.scope.branchId } },
  );
  assert.equal(c.status(), 200);
  await page.getByRole('button', { name: 'Accept feature', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(
    (await accepted()).walls[0].heightMm,
    3400,
    'Late candidate must not overwrite current head',
  );
  await page.getByRole('button', { name: 'Reload accepted state', exact: true }).click();
  await page.locator('.wall-review').waitFor({ state: 'detached' });
  await page.reload();
  await page.getByRole('spinbutton', { name: 'Height', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('spinbutton', { name: 'Height', exact: true }).inputValue(),
    '3400',
  );
  assert.equal((await accepted()).walls[0].openings[0].id, hosted.id);
  await page.screenshot({ path: `${screenshots}/wall-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '+ Polyline wall', exact: true }).click();
  await page.locator('.wall-review').waitFor();
  assert.equal(
    await page.getByRole('button', { name: 'Accept feature', exact: true }).isVisible(),
    true,
  );
  await accept();
  result = await accepted();
  assert.equal(result.walls.length, 2);
  assert.ok(
    result.outputs
      .find((o) => o.wallId !== first.id)
      .unresolved.some((x) => x.includes('junction allocation unresolved')),
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    'Mobile has no horizontal page overflow',
  );
  await page
    .getByRole('spinbutton', { name: 'Core thickness', exact: true })
    .scrollIntoViewIfNeeded();
  await page.getByRole('spinbutton', { name: 'Core thickness', exact: true }).fill('160');
  await page.evaluate(() => scrollTo(0, 0));
  await page.mouse.wheel(0, 500);
  await page.waitForFunction(() => scrollY > 0);
  await page.getByRole('button', { name: 'Preview parameters', exact: true }).click();
  await accept();
  await page.screenshot({ path: `${screenshots}/wall-mobile.png`, fullPage: true });
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log(
    'Wall browser smoke passed: preview isolation, discard, atomic accept, parameter edits, hosted identity, reversal, invalid opening, stale-head rejection, normal-origin reload, mobile polyline editing.',
  );
} finally {
  await browser.close();
}
