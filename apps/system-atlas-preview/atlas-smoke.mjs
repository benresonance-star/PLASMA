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
  assert((await page.locator('.workspace-tab').count())===5,'Five primary workspaces must replace crowded tab strip');
  assert((await page.locator('.index-details .view-tab').count())===9,'Nine original deep-dive views must remain discoverable');
  assert((await page.locator('.overview-graph [data-overview-id]').count())===10,'Whole-system canvas must show all ten canonical components');
  const beforeLens=await page.locator('[data-overview-id="authority"]').boundingBox();
  await page.click('[data-lens="authority"]');
  assert((await page.locator('[data-lens="authority"]').getAttribute('aria-pressed'))==='true','Authority lens did not activate');
  assert((await page.locator('.overview-graph [data-overview-id]').count())===10,'Lenses must not hide any system');
  const afterLens=await page.locator('[data-overview-id="authority"]').boundingBox();
  assert(beforeLens && afterLens && Math.abs(beforeLens.x-afterLens.x)<2 && Math.abs(beforeLens.y-afterLens.y)<2,
    'Changing architectural lens must not move the canonical map');
  assert((await page.locator('.overview-graph .slot.deemphasized').count())>0,'Lens should visually emphasize boundaries without removing them');
  await page.click('[data-scenario-step="4"]');
  assert((await page.locator('.trace-explanation').textContent()).includes('documentation'),'Illustrative wall-edit trace is missing downstream meaning');
  assert((await page.locator('.slot-documentation.deemphasized').count())===0,'Wall trace should highlight documentation');
  await page.click('[data-scenario-reset]');
  await page.click('[data-lens="architecture"]');
  assert((await page.locator('.overview-graph .slot.deemphasized').count())===0,'Restoring architecture lens must show all components with equal emphasis');
  const boundary=page.locator('.rel-hit[data-atlas-id="rel-interaction-authority"]');
  assert((await page.locator('.rel-hit').count())===10,'Every declared architecture boundary must be inspectable on the map');
  await boundary.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>location.hash==='#overview/relationship/rel-interaction-authority');
  await page.waitForFunction(()=>document.querySelector('#inspector')?.textContent?.includes('Failure behavior'));
  assert((await page.locator('#inspector').textContent()).includes('proposal-only'),'Boundary must explain authority semantics');
  await page.goto(base+'#overview',{waitUntil:'networkidle'});
  await page.click('.workspace-tab[data-workspace="library"]');
  await page.waitForFunction(()=>location.hash==='#references');
  await page.goto(base+'#overview',{waitUntil:'networkidle'});


  await page.click('.workspace-tab[data-workspace="library"]');
  await page.waitForSelector('.reference-card-grid',{state:'visible'});
  assert((await page.locator('.reference-card[data-atlas-type="referenceSystem"]').count())===10,'Every Plasma system should have a reference card');
  assert((await page.locator('.reference-card[data-atlas-type="referenceTechnology"]').count())===16,'All initial technologies should have reference cards');
  await page.click('.reference-card[data-atlas-type="referenceTechnology"][data-atlas-id="opencascade"]');
  await page.waitForFunction(()=>location.hash==='#references/technology/opencascade');
  await page.waitForFunction(()=>document.querySelector('#inspector')?.textContent?.includes('Strengths'));
  const refInspector=(await page.locator('#inspector').textContent())||'';
  for(const section of ['What it is','Why we use it','Strengths','Weaknesses','Competitors','Relationships','Repository source evidence']){
    assert(refInspector.includes(section),'Reference inspector missing section: '+section);
  }
  assert(refInspector.includes('Parasolid'),'OCCT card should compare competing CAD kernels');
  await page.goto(base+'#components/geometry',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelector('#inspector')?.textContent?.includes('System reference card'));
  assert((await page.locator('#inspector [data-atlas-type="referenceTechnology"][data-atlas-id="opencascade"]').count())===1,
    'Geometry component should reverse-link to OpenCascade card');
  await page.click('#inspector [data-atlas-type="referenceSystem"][data-atlas-id="geometry"]');
  await page.waitForFunction(()=>location.hash==='#references/system/geometry');
  await page.waitForFunction(()=>document.querySelector('#inspector')?.textContent?.includes('Weaknesses'));
  assert(((await page.locator('#inspector').textContent())||'').includes('Topology'),'System reference must explain risks');
  await page.goto(base+'#overview',{waitUntil:'networkidle'});

  await page.click('.workspace-tab[data-workspace="council"]');
  await page.waitForSelector('.council-role-grid',{state:'visible'});
  assert((await page.locator('.council-role-card').count())===7,'Council must show seven proposed specialist roles');
  assert((await page.locator('.council-step').count())===5,'Wall example must show five review steps');
  assert((await page.locator('.council-stage').innerText()).includes('No agent runs recorded'),'Council must not imply agents have executed');
  await page.click('.council-role-card[data-atlas-id="systems"]');
  await page.waitForFunction(()=>location.hash==='#council/role/systems');
  await page.waitForFunction(()=>document.querySelector('#inspector')?.textContent?.includes('Review only'));
  assert((await page.locator('#inspector').textContent()).includes('Review only'),'Council role authority must be explicit');
  await page.click('.council-step[data-atlas-id="wall-edit-architecture:challenge"]');
  await page.waitForFunction(()=>location.hash.includes('#council/stage/'));
  await page.waitForFunction(()=>document.querySelector('#inspector')?.textContent?.includes('not_run'));
  assert((await page.locator('#inspector').textContent()).includes('not_run'),'Decision step must state that no review ran');
  await page.goto(base+'#overview/component/authority',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelector('#inspector')?.textContent?.includes('Architecture Council reviewers'));
  assert((await page.locator('#inspector').textContent()).includes('Architecture Council reviewers'),'Component inspector must expose Council assignments');
  await page.click('#inspector [data-atlas-type="councilDecision"]');
  await page.waitForFunction(()=>location.hash.startsWith('#council/decision/'));
  await page.waitForFunction(()=>document.querySelector('#inspector')?.textContent?.includes('unassessed'));
  assert((await page.locator('#inspector').textContent()).includes('unassessed'),'Decision inspector must show unassessed alternatives');
  const councilResponse=await page.request.get(base+'council.json');
  assert(councilResponse.ok(),'Generated Council catalogue must be served');
  await page.goto(base+'#overview',{waitUntil:'networkidle'});

  const views=[
    ['references','.reference-card-grid'],
    ['integration','.integration-matrix'],
    ['languages','.domain-language-grid'],
    ['transactions','.transaction-flow'],
    ['components','.catalogue-grid'],
    ['contracts','.contract-list'],
    ['slices','.slice-catalogue'],
    ['evidence','.evidence-list']
  ];
  for(const [view,selector] of views){
    await page.goto(base+`#${view}`,{waitUntil:'networkidle'});
    await page.waitForSelector(selector,{state:'visible'});
    assert((await locationHash(page))===`#${view}`,`Unexpected hash after opening ${view}`);
  }

  await page.click('.workspace-tab[data-workspace="assure"]');
  await page.waitForSelector('.integration-matrix',{state:'visible'});
  assert((await page.locator('.repository-evidence-summary').count())===1,'Repository evidence status summary is missing');
  const repositorySummary=(await page.locator('.repository-evidence-summary').textContent())||'';
  assert(repositorySummary.includes('Current Plasma implementation status'),'Repository evidence status heading is missing');
  assert(repositorySummary.includes('offline'),'Local smoke test should clearly report repository evidence as offline rather than inventing live status');
  assert((await page.locator('.evidence-semantics').count())===1,'Integration view is missing explicit evidence semantics');
  const semanticsText=(await page.locator('.evidence-semantics').textContent())||'';
  assert(semanticsText.includes('Required evidence'),'Evidence semantics must explain required evidence');
  assert(semanticsText.includes('Supporting evidence'),'Evidence semantics must explain supporting evidence');
  assert(semanticsText.includes('does not change the relationship'),'Evidence semantics must state that supporting evidence is non-gating');
  const failedCardStyle=await page.locator('.repository-status-card.failed').evaluate(el=>{
    const style=getComputedStyle(el);
    const probe=document.createElement('span');
    probe.style.color='var(--red)';
    probe.style.backgroundColor='var(--red-soft)';
    document.body.appendChild(probe);
    const probeStyle=getComputedStyle(probe);
    const result={
      borderColor:style.borderTopColor,
      backgroundColor:style.backgroundColor,
      red:probeStyle.color,
      redSoft:probeStyle.backgroundColor
    };
    probe.remove();
    return result;
  });
  assert(failedCardStyle.borderColor===failedCardStyle.red,'Failed repository evidence card border must use the red status token');
  assert(failedCardStyle.backgroundColor===failedCardStyle.redSoft,'Failed repository evidence card background must use the red-soft status token');
  assert((await page.locator('.matrix-slice-head[data-atlas-id="window-door-system"]').count())===1,'Window/door slice missing from integration matrix');
  const headerStyle=await page.locator('.matrix-slice-head[data-atlas-id="window-door-system"]').evaluate(el=>({
    transform:getComputedStyle(el).transform,
    writingMode:getComputedStyle(el).writingMode
  }));
  assert(headerStyle.transform==='none','Integration matrix header must not be rotated');
  assert(headerStyle.writingMode==='vertical-rl','Integration matrix header should remain vertical top-to-bottom');
  assert((await page.locator('.maturity-card[data-atlas-id="planning"]').count())===1,'Planning language is not a first-class maturity node');
  const windowGeometryCell=page.locator('.matrix-cell[data-atlas-type="integrationLink"][title*="Window + door"][title*="Geometry"]').first();
  assert(await windowGeometryCell.isVisible(),'Window/door → Geometry evidence-linked cell is missing');
  assert((await windowGeometryCell.innerText()).includes('0/2'),'Window/door → Geometry should show derived 0/2 required evidence');
  await windowGeometryCell.click();
  await page.waitForFunction(()=>location.hash.startsWith('#integration/link/'));
  await page.waitForFunction(()=>document.querySelector('#inspector')?.textContent?.includes('Required evidence'));
  const linkInspector=(await page.locator('#inspector').textContent())||'';
  assert(linkInspector.includes('Window integration: resize hosted window'),'Integration relationship inspector is missing slice evidence');
  assert(linkInspector.includes('Geometry candidate isolation'),'Integration relationship inspector is missing geometry boundary evidence');
  assert(linkInspector.includes('Supporting evidence'),'Integration relationship inspector is missing supporting evidence section');
  assert(linkInspector.includes('Stable identity continuity'),'Window/Door → Geometry should show stable identity as supporting evidence');
  assert(linkInspector.includes('Validation pipeline coverage'),'Window/Door → Geometry should show validation as supporting evidence');
  assert(linkInspector.includes('Corroborates semantic/topological continuity'),'Supporting evidence must explain why it applies to the selected relationship');
  assert(linkInspector.includes('Supporting evidence is independently corroborates')===false,'Supporting evidence copy contains malformed wording');
  assert(linkInspector.includes('does not change the relationship'),'Inspector must state that supporting evidence is non-gating');
  assert(linkInspector.includes('Unlinked · 0/2'),'Integration relationship inspector did not derive unlinked 0/2 coverage');
  await page.click('.matrix-row-head[data-atlas-id="geometry"]');
  await page.waitForFunction(()=>location.hash.includes('integration/component/geometry'));
  await page.waitForFunction(()=>document.querySelector('#inspector')?.textContent?.includes('Geometry Resolver'));
  assert((await page.locator('#inspector').textContent()||'').includes('Geometry Resolver'),'Geometry capability inspector did not render');

  await page.goto(base+'#evidence/ev-transaction-rollback',{waitUntil:'networkidle'});
  const failedEvidenceStyle=await page.locator('.evidence-card').first().evaluate(el=>{
    el.classList.add('evidence-failed');
    const style=getComputedStyle(el);
    const probe=document.createElement('span');
    probe.style.color='var(--red)';
    probe.style.backgroundColor='var(--red-soft)';
    document.body.appendChild(probe);
    const probeStyle=getComputedStyle(probe);
    const result={borderColor:style.borderTopColor,backgroundColor:style.backgroundColor,red:probeStyle.color,redSoft:probeStyle.backgroundColor};
    probe.remove();
    return result;
  });
  assert(failedEvidenceStyle.borderColor===failedEvidenceStyle.red,'Failed Evidence card border must use the red status token');
  assert(failedEvidenceStyle.backgroundColor===failedEvidenceStyle.redSoft,'Failed Evidence card background must use the red-soft status token');
  await page.waitForFunction(()=>Boolean(window.__PLASMA_ATLAS__));
  await page.waitForFunction(()=>document.querySelector('#inspector')?.textContent?.includes('Repository binding'));
  const repositoryInspector=(await page.locator('#inspector').textContent())||'';
  assert(repositoryInspector.includes('repo-ev-transaction-rollback'),'Evidence inspector is missing repository binding id');
  assert(repositoryInspector.includes('TEST.TXN.ROLLBACK.001'),'Evidence inspector is missing stable repository test identifier');
  assert(repositoryInspector.includes('atlas-evidence'),'Evidence inspector is missing CI workflow binding');

  await page.goto(base+'#evidence/ev-slice-window-resize',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__PLASMA_ATLAS__));
  await page.waitForFunction(()=>document.querySelector('#inspector')?.textContent?.includes('Used by Integration relationships'));
  const evidenceInspector=(await page.locator('#inspector').textContent())||'';
  assert(evidenceInspector.includes('Window + door system')&&evidenceInspector.includes('Geometry Resolver'),'Evidence reverse navigation does not expose Window/Door → Geometry');
  const reverseLink=page.locator('#inspector [data-atlas-type="integrationLink"]').filter({hasText:'Geometry Resolver'}).first();
  assert(await reverseLink.isVisible(),'Reverse Integration relationship button is missing');
  await reverseLink.click();
  await page.waitForFunction(()=>location.hash.startsWith('#integration/link/'));
  await page.waitForFunction(()=>document.querySelector('#inspector')?.textContent?.includes('Required evidence'));

  await page.goto(base+'#slices',{waitUntil:'networkidle'});
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

  await page.click('.workspace-tab[data-workspace="map"]');
  await page.waitForSelector('.overview-graph',{state:'visible'});
  await page.click('[data-overview-id="authority"]');
  await page.waitForFunction(()=>location.hash.includes('overview/component/authority'));
  await page.waitForFunction(()=>document.querySelector('#inspector')?.textContent?.includes('World + Authority Plane'));
  assert((await page.locator('#inspector').innerText()).includes('World + Authority Plane'),'Inspector did not resolve Authority');
  assert((await page.locator('#inspector').textContent()).includes('Why this system exists'),'Component details should include its rationale without navigating away');
  assert((await page.locator('#inspector [data-atlas-type="referenceSystem"]').count())>=1,'Full system reference must remain accessible');

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

  await page.goto(base+'#slices/wall-assembly',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelector('#inspector')?.textContent?.includes('PLS-WALL-01'));
  await page.click('#inspector [data-atlas-type="contract"][data-atlas-id="parametric-wall"]');
  await page.waitForFunction(()=>location.hash==='#contracts/parametric-wall');
  await page.waitForSelector('#inspector .wall-requirements>div');
  assert(await page.locator('#inspector .wall-requirements>div').count()===12,'Wall contract must expose all 12 parametric requirements');
  assert(await page.locator('#inspector .wall-gates>div').count()===8,'Wall contract must expose all eight acceptance gates');
  assert((await page.locator('#inspector').innerText()).includes('implementation unproven'),'Wall specification must not claim implemented behaviour');
  const contractResponse=await page.request.get(base+'wall-contract.json');
  assert(contractResponse.ok(),'Published wall contract file is unavailable');
  const wallContract=await contractResponse.json();
  assert(wallContract.contract_id==='PLS-WALL-01'&&wallContract.implemented==='planned','Wall source must retain planned implementation status');
  const specificationResponse=await page.request.get(base+'plasma-spec.html');
  assert(specificationResponse.ok()&&(await specificationResponse.text()).includes('Specification v0.4.29'),'Linked specification baseline is unavailable or outdated');
  await page.goto(base+'#contracts/differential-contract',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelector('#inspector')?.textContent?.includes('PLS-DIFF-01'));
  const differentialInspector=await page.locator('#inspector').innerText();
  assert(differentialInspector.includes('DEFERRED'),'DifferentialContract must remain visibly deferred');
  assert(differentialInspector.includes('NON_AUTHORITATIVE_DERIVED'),'DifferentialContract authority class missing');
  assert(await page.locator('#inspector .differential-gates>div').count()===12,'DifferentialContract must expose all 12 activation gates');
  assert(differentialInspector.includes('DecisionContract'),'DifferentialContract relationship to DecisionContract missing');
  const differentialResponse=await page.request.get(base+'differential-contract.json');
  assert(differentialResponse.ok(),'Published DifferentialContract source is unavailable');
  const differentialContract=await differentialResponse.json();
  assert(differentialContract.contract_id==='PLS-DIFF-01'&&differentialContract.implementation_status==='NOT_STARTED','DifferentialContract source must remain deferred and not started');

  await page.goto(base+'#evidence/ev-wall-at-01',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelector('#inspector')?.textContent?.includes('WALL-AT-01'));
  assert((await page.locator('#inspector').innerText()).includes('No executable CI binding yet'),'New wall gate must remain explicitly unproven');

  await page.setViewportSize({width:390,height:844});
  await page.goto(base+'#overview',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__PLASMA_ATLAS__));
  assert(await visible('#viewHost'),'Main viewport is not visible on mobile');
  assert((await page.locator('.workspace-tab').count())===5,'Mobile must retain the five principal destinations');
  const mobileZoom=await page.evaluate(()=>window.__PLASMA_ATLAS__.state.sheetZoom);
  assert(mobileZoom>=.95,'Mobile architecture map should pan without shrinking readable text automatically');
  await page.click('#navToggle');
  assert(await visible('.left-panel'),'Mobile Index drawer did not open');
  await page.click('#navToggle');

  await page.goto(base+'#contracts/parametric-wall',{waitUntil:'networkidle'});
  await page.click('#inspectorToggle');
  assert(await visible('.right-panel'),'Wall contract inspector must open on mobile');
  assert(await page.locator('#inspector .wall-requirements>div').count()===12,'Mobile inspector lost parametric wall requirements');

  assert(pageErrors.length===0,`Browser emitted page errors:\n${pageErrors.join('\n')}`);
  console.log('Atlas browser smoke test passed.');
}finally{
  await browser.close();
}

async function locationHash(page){
  return await page.evaluate(()=>location.hash);
}
