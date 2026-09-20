import { chromium } from 'playwright';

const base=process.env.ATLAS_URL||'http://127.0.0.1:4173/';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const pageErrors=[];
page.on('pageerror',error=>pageErrors.push(String(error)));

const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const visible=async selector=>await page.locator(selector).first().isVisible();

try{
  await page.goto(base+'#overview',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__PLASMA_ATLAS__));

  assert(await visible('.overview-graph'),'Overview graph is not visible');
  assert(await visible('[data-overview-id="authority"]'),'Authority component is not visible');
  assert((await page.locator('.view-tab').count())===8,'Expected eight functional top-level views');

  const views=[
    ['integration','.integration-matrix'],
    ['languages','.domain-language-grid'],
    ['transactions','.transaction-flow'],
    ['components','.catalogue-grid'],
    ['contracts','.contract-list'],
    ['slices','.slice-catalogue'],
    ['evidence','.evidence-list']
  ];
  for(const [view,selector] of views){
    await page.click(`.view-tab[data-view="${view}"]`);
    await page.waitForSelector(selector,{state:'visible'});
    assert((await locationHash(page))===`#${view}`,`Unexpected hash after opening ${view}`);
  }

  await page.click('.view-tab[data-view="integration"]');
  await page.waitForSelector('.integration-matrix',{state:'visible'});
  assert((await page.locator('.matrix-slice-head[data-atlas-id="window-door-system"]').count())===1,'Window/door slice missing from integration matrix');
  assert((await page.locator('.maturity-card[data-atlas-id="planning"]').count())===1,'Planning language is not a first-class maturity node');
  await page.click('.matrix-row-head[data-atlas-id="geometry"]');
  await page.waitForFunction(()=>location.hash.includes('integration/component/geometry'));
  await page.waitForFunction(()=>document.querySelector('#inspector')?.textContent?.includes('Geometry Resolver'));
  const integrationInspectorText=(await page.locator('#inspector').textContent())||'';
  assert(integrationInspectorText.includes('Integration graph'),'Reverse integration graph is missing from inspector');
  assert(integrationInspectorText.includes('Window + door system'),'Geometry reverse navigation does not expose the window/door slice');

  await page.click('.view-tab[data-view="slices"]');
  await page.waitForSelector('.slice-catalogue',{state:'visible'});
  assert((await page.locator('[data-atlas-id="townhouse-system"]').count())===1,'Townhouse system slice is missing');
  assert((await page.locator('[data-atlas-id="apartment-system"]').count())===1,'Apartment system slice is missing');
  assert((await page.locator('[data-atlas-id="window-door-system"]').count())===1,'Window and door system slice is missing');
  assert((await page.locator('[data-atlas-id="clothing-fabrication"]').count())===1,'Clothing fabrication slice is missing');
  assert((await page.locator('[data-atlas-id="botanical-growth"]').count())===1,'Botanical growth slice is missing');
  await page.click('[data-atlas-id="window-door-system"]');
  await page.waitForFunction(()=>location.hash.includes('slices/window-door-system'));
  await page.waitForFunction(()=>document.querySelector('#inspector')?.textContent?.includes('Window integration: resize hosted window'));
  assert(((await page.locator('#inspector').textContent())||'').includes('Integration evidence'),'Slice-specific integration evidence is not linked in inspector');

  await page.click('[data-atlas-id="clothing-fabrication"]');
  await page.waitForFunction(()=>location.hash.includes('slices/clothing-fabrication'));
  await page.waitForFunction(()=>document.querySelector('#inspector')?.textContent?.includes('Stress points'));
  await page.waitForFunction(()=>document.querySelector('#inspector')?.textContent?.includes('Success criteria'));
  assert((await page.locator('#inspector h4').filter({hasText:'Success criteria'}).count())===1,'Expanded slice detail did not render in inspector');

  await page.click('.view-tab[data-view="overview"]');
  await page.waitForSelector('.overview-graph',{state:'visible'});
  await page.click('[data-overview-id="authority"]');
  await page.waitForFunction(()=>location.hash.includes('overview/component/authority'));
  await page.waitForFunction(()=>document.querySelector('#inspector')?.textContent?.includes('World + Authority Plane'));
  assert((await page.locator('#inspector').innerText()).includes('World + Authority Plane'),'Inspector did not resolve Authority');

  await page.fill('#atlasSearch','submit transaction');
  await page.waitForSelector('#searchResults.open .search-result',{state:'visible'});
  assert((await page.locator('#searchResults .search-result').count())>0,'Search returned no results');
  await page.fill('#atlasSearch','');
  await page.fill('#atlasSearch','window fabrication');
  await page.waitForSelector('#searchResults.open .search-result',{state:'visible'});
  assert((await page.locator('#searchResults').innerText()).includes('Window + door')||(await page.locator('#searchResults').innerText()).includes('Fabrication'),'Integration-aware search did not surface connected graph terms');
  await page.fill('#atlasSearch','');
  await page.keyboard.press('Escape');

  const hashBefore=await locationHash(page);
  await page.click('#helpLauncher');
  await page.click('[data-overview-id="authority"]');
  await page.waitForSelector('#helpPanel.open',{state:'visible'});
  assert((await page.locator('#helpTitle').innerText()).includes('World + Authority Plane'),'Context help did not use Atlas data');
  assert((await page.locator('#helpStatus').innerText()).includes('Voice off'),'Voice should be opt-in');
  assert((await locationHash(page))===hashBefore,'Help mode should intercept selection rather than navigate');
  await page.click('#helpLauncher');

  await page.setViewportSize({width:390,height:844});
  await page.goto(base+'#overview',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__PLASMA_ATLAS__));
  assert(await visible('#viewHost'),'Main viewport is not visible on mobile');
  await page.click('#navToggle');
  assert(await visible('.left-panel'),'Mobile Index drawer did not open');
  await page.click('#navToggle');

  assert(pageErrors.length===0,`Browser emitted page errors:\n${pageErrors.join('\n')}`);
  console.log('Atlas browser smoke test passed.');
}finally{
  await browser.close();
}

async function locationHash(page){
  return await page.evaluate(()=>location.hash);
}
