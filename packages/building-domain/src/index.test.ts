import {parseSemanticId} from '@spds/semantic-core';
import {test,expect} from 'vitest';import {buildFixtureGraph,fixtureConfig,editHostedWindow,editRectangularFootprint,editCornerRecess,footprintBoundary,footprintImpact,moveConnectedWall,wallGeometry,windowImpact,buildToPlasmaPoint,plasmaToBuildPoint} from './index.js';
const config={hostedOpenings:[],recessWidth:0,recessDepth:0,buildingCenterX:0,buildingCenterZ:0,windowAnchor:'center',doorAnchor:'center',buildingWidth:6,buildingDepth:4,windowCenter:1.2,windowWidth:1.44,windowSill:.9,windowHeight:1.2,doorCenter:-1.62,doorWidth:.96,doorHeight:2.1,studSpacing:.6,roofPitch:25,frontSystem:'lvl'};
test('two hosted openings, exact config round trip and parameter edit',()=>{const graph=buildFixtureGraph(config);expect(fixtureConfig(graph)).toEqual(config);expect(graph.relationships.filter(r=>r.relationType==='architecture.hosted-by')).toHaveLength(2);const edited=editHostedWindow(graph,{widthMm:1800,centerMm:1300});expect(fixtureConfig(edited)).toEqual({...config,windowWidth:1.8,windowCenter:1.3});expect(fixtureConfig(graph)).toEqual(config);expect(windowImpact()).toContain('output:build:drawings');expect(plasmaToBuildPoint(buildToPlasmaPoint([1,2,-3]))).toEqual([1,2,-3]);});
test('rejects unsupported host mutation',()=>{const graph=buildFixtureGraph(config);graph.relationships.find(r=>r.from==='entity:build:window')!.to=parseSemanticId('entity:build:roof');expect(()=>fixtureConfig(graph)).toThrow('Unsupported graph structure')});

test('rectangular footprint keeps hosted offsets and invalidates dependent outputs',()=>{const g=buildFixtureGraph(config),edited=editRectangularFootprint(g,{widthMm:6500,depthMm:5000});expect(fixtureConfig(edited)).toEqual({...config,buildingWidth:6.5,buildingDepth:5});expect(fixtureConfig(g)).toEqual(config);expect(footprintImpact()).toContain('output:build:load-paths');expect(()=>editRectangularFootprint(g,{widthMm:4000})).toThrow();expect(()=>editRectangularFootprint(g,{depthMm:NaN})).toThrow();});

test('connected wall move fixes opposite edge and preserves selected opening anchors',()=>{const g=buildFixtureGraph(config);for(const wall of ['front','rear','left','right'] as const){const next=moveConnectedWall(g,{wall,outwardMm:400,windowAnchor:'right',doorAnchor:'left'}),c=fixtureConfig(next);expect(next.relationships.filter(r=>r.relationType==='architecture.corner')).toHaveLength(4);expect(next.entities.find(e=>e.id==='entity:build:wall-'+wall)?.metadata?.geometry).toEqual(wallGeometry(c)[wall]);if(wall==='right'){expect(Number(c.buildingCenterX)-Number(c.buildingWidth)/2).toBe(-3);expect(c.doorCenter).toBe(config.doorCenter);expect(c.windowCenter).toBe(1.6)}expect(g).toEqual(buildFixtureGraph(config));}expect(()=>moveConnectedWall(g,{wall:'front',outwardMm:NaN})).toThrow();expect(()=>moveConnectedWall(g,{wall:'right',outwardMm:1000})).toThrow();});
test('wall geometry and anchor metadata cannot diverge from graph parameters',()=>{const g=buildFixtureGraph(config);g.entities.find(e=>e.id==='entity:build:wall-front')!.metadata!.geometry={heightMm:3000};expect(()=>fixtureConfig(g)).toThrow('Unsupported graph structure');});

test('bounded L graph has closed boundary, six walls and supported roof',()=>{const g=buildFixtureGraph(config);const l=editCornerRecess(g,{widthMm:1800,depthMm:1200}),c=fixtureConfig(l),b=footprintBoundary(c);expect(b).toHaveLength(6);b.forEach((e,i)=>expect(e.end).toEqual(b[(i+1)%b.length]!.start));expect(l.entities.filter(e=>e.id.startsWith('entity:build:wall-'))).toHaveLength(6);expect(l.relationships.filter(r=>r.relationType==='architecture.corner')).toHaveLength(6);expect(c.roofArrangement).toBe('level-joists');expect(()=>moveConnectedWall(l,{wall:'rear',outwardMm:100})).toThrow('recess');expect(()=>editCornerRecess(g,{widthMm:3000,depthMm:1200})).toThrow();expect(()=>editCornerRecess(g,{widthMm:1800,depthMm:0})).toThrow();const bad=structuredClone(l);bad.entities.find(e=>e.id==='entity:build:wall-recess-rear')!.metadata!.geometry={};expect(()=>fixtureConfig(bad)).toThrow();expect(fixtureConfig(editHostedWindow(l,{centerMm:1300})).windowCenter).toBe(1.3);expect(fixtureConfig(g)).toEqual(config);});

test('wall-local opening parameters own identity, host and dimensions',async()=>{const {editWallOpening,wallFrames}=await import('./index.js');const base=buildFixtureGraph(config);for(const f of wallFrames(config)){const opening={id:'o-one',wall:f.id,kind:'window' as const,centerMm:f.id==='front'?-330:0,widthMm:600,heightMm:900,sillMm:900};const g=editWallOpening(base,{operation:'upsert',opening});expect(fixtureConfig(g).hostedOpenings).toEqual([opening]);expect(g.parameters.filter(p=>p.metadata?.openingId==='o-one')).toHaveLength(4);expect(g.relationships.find(r=>r.from==='entity:build:o-one')?.to).toBe('entity:build:wall-'+f.id);const moved=editWallOpening(g,{operation:'upsert',opening:{...opening,wall:'rear',centerMm:100}});expect(fixtureConfig(moved).hostedOpenings).toEqual([{...opening,wall:'rear',centerMm:100}]);expect(fixtureConfig(editWallOpening(moved,{operation:'remove',id:'o-one'}))).toEqual(config);const bad=structuredClone(g);bad.relationships.find(r=>r.from==='entity:build:o-one')!.to=parseSemanticId('entity:build:roof');expect(()=>fixtureConfig(bad)).toThrow();}expect(fixtureConfig(base)).toEqual(config);});
test('opening constraints reject invalid hosts, overlaps, dimensions and disappearing recess hosts',async()=>{const {editWallOpening}=await import('./index.js');const g=buildFixtureGraph(config),o={id:'o-one',wall:'rear',kind:'window' as const,centerMm:0,widthMm:600,heightMm:900,sillMm:900};for(const patch of [{wall:'roof'},{centerMm:2900},{widthMm:NaN},{widthMm:599},{heightMm:2400},{kind:'door',sillMm:900},{id:'bad-id'}])expect(()=>editWallOpening(g,{operation:'upsert',opening:{...o,...patch} as typeof o})).toThrow();const first=editWallOpening(g,{operation:'upsert',opening:o});expect(()=>editWallOpening(first,{operation:'upsert',opening:{...o,id:'o-two',centerMm:700}})).toThrow('300');const l=editCornerRecess(g,{widthMm:1800,depthMm:1200});const hosted=editWallOpening(l,{operation:'upsert',opening:{...o,wall:'recess-side'}});expect(()=>editCornerRecess(hosted,{widthMm:0,depthMm:0})).toThrow('host');});
test('v0.4 graph is validated before migration to opening-capable graph',async()=>{const old=await import('./legacy-recess.js');const {hostedOpenings,...prior}=config;const g=old.buildFixtureGraph(prior);expect(fixtureConfig(g)).toEqual(config);const bad=structuredClone(g);bad.entities.find(e=>e.id==='entity:build:wall-front')!.metadata!.geometry={};expect(()=>fixtureConfig(bad)).toThrow();});

test('unified catalog preserves graph ownership and original parameter identity',async()=>{
 const {openingCatalog,editOpening,openingCapabilities}=await import('./index.js');
 const shifted={...config,buildingCenterX:.2,windowCenter:1.4,doorCenter:-1.42};
 const graph=buildFixtureGraph(shifted),before=structuredClone(graph),catalog=openingCatalog(fixtureConfig(graph));
 expect(catalog.map(o=>o.id)).toEqual(['door','window']);expect(catalog[1]!.centerMm).toBe(1200);
 for(const o of catalog)expect(editOpening(graph,{operation:'upsert',opening:o})).toEqual(graph);
 const changed=editOpening(graph,{operation:'upsert',opening:{...catalog[1]!,widthMm:1500,centerMm:1250}});
 expect(fixtureConfig(changed).windowCenter).toBe(1.45);expect(fixtureConfig(changed).windowWidth).toBe(1.5);
 expect(changed.entities.map(e=>e.id)).toEqual(graph.entities.map(e=>e.id));expect(changed.parameters.map(e=>e.id)).toEqual(graph.parameters.map(e=>e.id));expect(graph).toEqual(before);
 expect(openingCapabilities('window').rehost).toBe(true);expect(openingCapabilities('o-one').rehost).toBe(true);
 for(const edit of [{operation:'upsert',opening:{...catalog[0],sillMm:100}},{operation:'upsert',opening:{...catalog[1],widthMm:NaN}}])expect(()=>editOpening(graph,edit as Parameters<typeof editOpening>[1])).toThrow();
 catalog[0]!.widthMm=1;expect(fixtureConfig(graph)).toEqual(shifted);
});

 test('original records migrate, rehost and remove without duplicated authority',async()=>{
 const {editOpening,openingCatalog}=await import('./index.js'),old=await import('./legacy-hosted.js');
 const prior=old.buildFixtureGraph(config),g=buildFixtureGraph(fixtureConfig(prior));
 expect(g.schemaVersion).toBe('plasma-build-fixture/0.6.0');
 for(const id of ['door','window'])expect(g.parameters.filter(p=>p.metadata?.openingId===id)).toHaveLength(4);
 for(const p of prior.parameters)expect(g.parameters.some(n=>n.id===p.id)).toBe(true);
 const window=openingCatalog(config).find(o=>o.id==='window')!;
 const moved=editOpening(g,{operation:'upsert',opening:{...window,wall:'rear',centerMm:0}});
 expect(openingCatalog(fixtureConfig(moved)).find(o=>o.id==='window')?.wall).toBe('rear');
 expect(buildFixtureGraph(fixtureConfig(moved))).toEqual(moved);
 const removed=editOpening(moved,{operation:'remove',id:'window'});
 expect(openingCatalog(fixtureConfig(removed)).map(o=>o.id)).toEqual(['door']);
 expect(removed.entities.some(e=>e.id==='entity:build:window')).toBe(false);
 expect(()=>editHostedWindow(removed,{widthMm:1200})).toThrow('absent');
 expect(()=>buildFixtureGraph({...fixtureConfig(moved),sizingMode:'tables'})).toThrow('concept');
 const bad=structuredClone(prior);bad.relationships[0]!.name='tampered';expect(()=>fixtureConfig(bad)).toThrow();
 });

test('wall recipe commands preserve opening records and canonical wall geometry',async()=>{
 const {editWallSystem,wallFrames,editOpening,openingCatalog}=await import('./index.js');const g=buildFixtureGraph(config);
 for(const wall of ['front','rear','left','right'])for(const system of ['pine','steel']){const next=editWallSystem(g,{wall,system}),c=fixtureConfig(next);expect(wallFrames(c).find(f=>f.id===wall)?.system).toBe(system);expect(next.entities.find(e=>e.id==='entity:build:wall-'+wall)?.metadata?.geometry).toEqual(wallGeometry(c)[wall]);expect(openingCatalog(c)).toEqual(openingCatalog(config));expect(fixtureConfig(editWallSystem(next,{wall,system:'lvl'}))).toEqual(config);}
 const l=editCornerRecess(g,{widthMm:1800,depthMm:1200}),steel=editWallSystem(l,{wall:'recess-side',system:'steel'});expect(()=>editCornerRecess(steel,{widthMm:0,depthMm:0})).toThrow('host');
 expect(()=>editWallSystem(g,{wall:'roof',system:'steel'})).toThrow();expect(()=>editWallSystem(g,{wall:'rear',system:'concrete'})).toThrow();
 expect(()=>buildFixtureGraph({...config,wallSystems:{rear:'steel'},sizingMode:'tables'})).toThrow('concept');
 const modified=structuredClone(editWallSystem(g,{wall:'rear',system:'steel'}));modified.entities.find(e=>e.id==='entity:build:wall-rear')!.metadata!.geometry={};expect(()=>fixtureConfig(modified)).toThrow();
});
