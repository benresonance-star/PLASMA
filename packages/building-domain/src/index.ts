import {fixtureConfig as rectangleConfig} from './legacy-rectangle.js';
import {parseParameter,parseSemanticObject,parseRelationship,createSemanticGraph} from '@spds/semantic-core';
import {buildFixtureGraph as priorGraph,fixtureConfig as priorConfig} from './legacy-fixture.js';
export {buildingEdges,windowImpact,footprintEdges,footprintImpact,buildToPlasmaPoint,plasmaToBuildPoint} from './legacy-fixture.js';
const defaults={recessWidth:0,recessDepth:0,buildingCenterX:0,buildingCenterZ:0,doorAnchor:'center',windowAnchor:'center'};
export type WallSide='front'|'rear'|'left'|'right';
export type OpeningAnchor='left'|'center'|'right';
const sides:WallSide[]=['front','rear','left','right'];
const round=(v:number)=>Math.round(v*1e6)/1e6;
export function footprintBoundary(c:Record<string,unknown>){
 const x=Number(c.buildingCenterX??0),z=Number(c.buildingCenterZ??0),w=Number(c.buildingWidth??6),d=Number(c.buildingDepth??4),rw=Number(c.recessWidth??0),rd=Number(c.recessDepth??0),l=x-w/2,r=x+w/2,f=z-d/2,b=z+d/2;
 const vertices=rw>0?[[l,f],[r,f],[r,b-rd],[r-rw,b-rd],[r-rw,b],[l,b]]:[[l,f],[r,f],[r,b],[l,b]];
 const names=rw>0?['front','right','recess-rear','recess-side','rear','left']:['front','right','rear','left'];
 return names.map((id,i)=>({id,start:vertices[i]!,end:vertices[(i+1)%vertices.length]!}));
}
export function wallGeometry(c:Record<string,unknown>){
 return Object.fromEntries(footprintBoundary(c).map(e=>[e.id,{startMm:[round(e.start[0]!*1000),round(-e.start[1]!*1000),150],endMm:[round(e.end[0]!*1000),round(-e.end[1]!*1000),150],heightMm:2700,thicknessMm:e.id==='front'&&c.frontSystem==='steel'?93.5:90,reference:'Nominal outside framing boundary',assemblyType:e.id==='front'?c.frontSystem:'lvl',editable:Number(c.recessWidth)>0?['corner-recess']:['normal-offset'],heightThicknessPolicy:'Fixed by current framing recipe'}]));
}
export function buildFixtureGraph(input:Record<string,unknown>){
 const c={...defaults,buildingWidth:6,buildingDepth:4,...input};
 for(const k of ['buildingCenterX','buildingCenterZ'] as const)if(typeof c[k]!=='number'||!Number.isFinite(c[k])||Math.abs(c[k])>10)throw new Error('Building centre must be within ±10 m');
 for(const k of ['windowAnchor','doorAnchor'] as const)if(!['left','center','right'].includes(c[k]))throw new Error('Unsupported opening anchor');
 const rw=Number(c.recessWidth),rd=Number(c.recessDepth),isL=rw>0||rd>0;
 if(!Number.isFinite(rw)||!Number.isFinite(rd)||(isL&&(rw<.8||rw>2.5||rd<.8||rd>2||Number(c.buildingWidth)-rw<2.5||Number(c.buildingDepth)-rd<2))||(!isL&&(rw!==0||rd!==0)))throw new Error('Corner recess requires width 800–2500 mm, depth 800–2000 mm and remaining wings at least 2500 / 2000 mm');
 if(isL&&c['roofArrangement' as keyof typeof c]!=='level-joists')throw new Error('L footprint requires the level-joists arrangement');
 const g=priorGraph(c),geometry=wallGeometry(c),boundary=footprintBoundary(c);
 if(isL){const template=g.entities.find(e=>e.id==='entity:build:wall-rear')!;for(const side of ['recess-rear','recess-side'])g.entities.push(parseSemanticObject({...template,id:'entity:build:wall-'+side,name:side+' wall'}));}
 const settings=g.entities.find(e=>e.id==='entity:build:building')!.metadata!.settings as Record<string,unknown>;
 delete settings.buildingCenterX;delete settings.buildingCenterZ;delete settings.recessWidth;delete settings.recessDepth;
 const template=g.parameters.find(p=>p.metadata?.configKey==='buildingWidth')!;
 for(const k of ['buildingCenterX','buildingCenterZ','recessWidth','recessDepth'] as const)g.parameters.push(parseParameter({...template,id:'parameter:build:'+k.toLowerCase(),name:'parameter:build:'+k.toLowerCase(),metadata:{configKey:k},quantity:{value:c[k]*1000,unit:'mm'}}));
 for(const e of g.entities){const key=e.id.split(':').at(-1)!;
  if(key.startsWith('wall-'))e.metadata={...e.metadata,geometry:geometry[key.slice(5)]};
  if(key==='window'||key==='door'){const anchor=c[(key+'Anchor') as keyof typeof c] as string,position=Number(c[(key+'Center') as keyof typeof c]),ref=c.buildingCenterX+(anchor==='left'?-1:anchor==='right'?1:0)*c.buildingWidth/2;e.metadata={...e.metadata,hosting:{anchor,offsetMm:round((position-ref)*1000),measurement:'Opening centre from host reference'}};}
  if(key==='slab')e.metadata={...e.metadata,boundaryFrom:boundary.map(e=>'entity:build:wall-'+e.id),boundaryMm:boundary.map(e=>[round(e.start[0]!*1000),round(-e.start[1]!*1000)]),edgeProjectionMm:220};
  if(key==='roof')e.metadata={...e.metadata,supportedTopology:isL?'rear-right-recess':'rectangle',supports:isL?['entity:build:wall-front','entity:build:wall-rear','entity:build:wall-recess-rear']:['entity:build:wall-front','entity:build:wall-rear'],drainage:isL?'Unresolved; level framing only':'Unverified'};
 }
 const rel=g.relationships[0]!;
 for(const [a,b] of (isL?[['front','left'],['front','right'],['right','recess-rear'],['recess-rear','recess-side'],['recess-side','rear'],['rear','left']]:[['front','left'],['front','right'],['rear','left'],['rear','right']]))g.relationships.push(parseRelationship({...rel,id:'relationship:build:corner-'+a+'-'+b,name:'Corner '+a+' / '+b,semanticType:'architecture.corner',relationType:'architecture.corner',from:'entity:build:wall-'+a,to:'entity:build:wall-'+b,metadata:{geometry:'Orthogonal butt return',fixings:'unresolved',capacity:'unverified'}}));
 if(isL){const contains=g.relationships.find(r=>r.from==='entity:build:wall-rear'&&r.relationType==='part-of')!;for(const side of ['recess-rear','recess-side'])g.relationships.push(parseRelationship({...contains,id:'relationship:build:contains-'+side,from:'entity:build:wall-'+side}));}
 createSemanticGraph([...g.entities,...g.parameters],g.relationships);
 return {...g,schemaVersion:'plasma-build-fixture/0.4.0',scope:'Rectangle or bounded rear-right recess; anchored front openings; concept framing. No arbitrary topology or structural approval.'};
}
export function fixtureConfig(graph:unknown):Record<string,unknown>{
 const g=graph as ReturnType<typeof buildFixtureGraph>;
 if(g.schemaVersion!=='plasma-build-fixture/0.4.0')return {...defaults,...rectangleConfig(graph)};
 const entities=g.entities.map(parseSemanticObject),parameters=g.parameters.map(parseParameter),relationships=g.relationships.map(parseRelationship);createSemanticGraph([...entities,...parameters],relationships);
 const settings=entities.find(e=>e.id==='entity:build:building')?.metadata?.settings;
 if(!settings||typeof settings!=='object')throw new Error('Missing building settings');
 const c:Record<string,unknown>={...settings};
 for(const p of parameters){const key=p.metadata?.configKey;if(typeof key!=='string')throw new Error('Missing parameter key');const unit=key==='roofPitch'?'deg':'mm';if(p.quantity.unit!==unit)throw new Error('Invalid parameter unit');c[key]=p.quantity.value/(unit==='mm'?1000:1);}
 if(JSON.stringify(buildFixtureGraph(c))!==JSON.stringify(g))throw new Error('Unsupported graph structure / host edit');return c;
}
function rehost(before:Record<string,unknown>,after:Record<string,unknown>){
 const oldX=Number(before.buildingCenterX),newX=Number(after.buildingCenterX),oldW=Number(before.buildingWidth),newW=Number(after.buildingWidth);
 for(const name of ['window','door']){const anchor=after[name+'Anchor'],sign=anchor==='left'?-1:anchor==='right'?1:0;after[name+'Center']=round(Number(before[name+'Center'])+newX-oldX+sign*(newW-oldW)/2);}
 const half=Number(after.buildingWidth)/2;
 for(const name of ['window','door'])if(Number(after[name+'Center'])-Number(after[name+'Width'])/2<newX-half+.18-1e-9||Number(after[name+'Center'])+Number(after[name+'Width'])/2>newX+half-.18+1e-9)throw new Error('Footprint leaves insufficient hosted-opening end clearance');
 if(Number(after.doorCenter)+Number(after.doorWidth)/2+.30>Number(after.windowCenter)-Number(after.windowWidth)/2+1e-9)throw new Error('Hosted openings need 300 mm separation');
 return buildFixtureGraph(after);
}
export function moveConnectedWall(graph:unknown,edit:{wall:WallSide;outwardMm:number;windowAnchor?:OpeningAnchor;doorAnchor?:OpeningAnchor}){
 if(!sides.includes(edit.wall)||!Number.isFinite(edit.outwardMm)||Math.abs(edit.outwardMm)>2000)throw new Error('Unsupported wall move; normal offset must be within ±2000 mm');
 const before=fixtureConfig(graph);if(Number(before.recessWidth)>0)throw new Error('Use corner recess controls for an L footprint');const after={...before},delta=edit.outwardMm/1000,axis=edit.wall==='left'||edit.wall==='right'?'X':'Z',dimension=axis==='X'?'buildingWidth':'buildingDepth',sign=edit.wall==='left'||edit.wall==='front'?-1:1;
 after[dimension]=round(Number(before[dimension])+delta);after['buildingCenter'+axis]=round(Number(before['buildingCenter'+axis])+sign*delta/2);
 if(edit.windowAnchor!==undefined)after.windowAnchor=edit.windowAnchor;if(edit.doorAnchor!==undefined)after.doorAnchor=edit.doorAnchor;
 return rehost(before,after);
}
export function editRectangularFootprint(graph:unknown,edit:{widthMm?:number;depthMm?:number}){const before=fixtureConfig(graph);if(Number(before.recessWidth)>0)throw new Error('Use corner recess controls for an L footprint');const after={...before};if(edit.widthMm!==undefined)after.buildingWidth=edit.widthMm/1000;if(edit.depthMm!==undefined)after.buildingDepth=edit.depthMm/1000;return rehost(before,after)}
export function editHostedWindow(graph:unknown,edit:{widthMm?:number;centerMm?:number}){const c=fixtureConfig(graph);if(edit.widthMm!==undefined)c.windowWidth=edit.widthMm/1000;if(edit.centerMm!==undefined)c.windowCenter=edit.centerMm/1000;return buildFixtureGraph(c)}

export function editCornerRecess(graph:unknown,edit:{widthMm:number;depthMm:number}){const c=fixtureConfig(graph);c.recessWidth=edit.widthMm/1000;c.recessDepth=edit.depthMm/1000;if(c.recessWidth===0&&c.recessDepth===0){c.roofArrangement='unresolved';c.roofArrangementRef='';}else {c.roofArrangement='level-joists';c.roofArrangementRef='Bounded L footprint: level joists on front/rear/recess walls; drainage, deck, connections and capacity unresolved';}return buildFixtureGraph(c)}
