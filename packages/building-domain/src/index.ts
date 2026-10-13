import {parseParameter,parseSemanticObject,parseRelationship,createSemanticGraph} from '@spds/semantic-core';
import {buildFixtureGraph as priorGraph,fixtureConfig as priorConfig} from './legacy-fixture.js';
export {buildingEdges,windowImpact,footprintEdges,footprintImpact,buildToPlasmaPoint,plasmaToBuildPoint} from './legacy-fixture.js';
const defaults={buildingCenterX:0,buildingCenterZ:0,doorAnchor:'center',windowAnchor:'center'};
export type WallSide='front'|'rear'|'left'|'right';
export type OpeningAnchor='left'|'center'|'right';
const sides:WallSide[]=['front','rear','left','right'];
const round=(v:number)=>Math.round(v*1e6)/1e6;
export function wallGeometry(c:Record<string,unknown>){
 const x=Number(c.buildingCenterX??0),z=Number(c.buildingCenterZ??0),w=Number(c.buildingWidth??6),d=Number(c.buildingDepth??4),left=x-w/2,right=x+w/2,front=z-d/2,rear=z+d/2;
 const point=(x:number,z:number)=>[round(x*1000),round(-z*1000),150];
 return Object.fromEntries(sides.map(side=>[side,{startMm:point(side==='right'?right:left,side==='rear'?rear:front),endMm:point(side==='left'?left:right,side==='front'?front:rear),heightMm:2700,thicknessMm:side==='front'&&c.frontSystem==='steel'?93.5:90,reference:'Nominal 90 mm outside framing set-out; steel track projects 1.75 mm either side',assemblyType:side==='front'?c.frontSystem:'lvl',editable:['normal-offset'],heightThicknessPolicy:'Fixed by current framing recipe'}]));
}
export function buildFixtureGraph(input:Record<string,unknown>){
 const c={...defaults,buildingWidth:6,buildingDepth:4,...input};
 for(const k of ['buildingCenterX','buildingCenterZ'] as const)if(typeof c[k]!=='number'||!Number.isFinite(c[k])||Math.abs(c[k])>10)throw new Error('Building centre must be within ±10 m');
 for(const k of ['windowAnchor','doorAnchor'] as const)if(!['left','center','right'].includes(c[k]))throw new Error('Unsupported opening anchor');
 const g=priorGraph(c),geometry=wallGeometry(c);
 const settings=g.entities.find(e=>e.id==='entity:build:building')!.metadata!.settings as Record<string,unknown>;
 delete settings.buildingCenterX;delete settings.buildingCenterZ;
 const template=g.parameters.find(p=>p.metadata?.configKey==='buildingWidth')!;
 for(const k of ['buildingCenterX','buildingCenterZ'] as const)g.parameters.push(parseParameter({...template,id:'parameter:build:'+k.toLowerCase(),name:'parameter:build:'+k.toLowerCase(),metadata:{configKey:k},quantity:{value:c[k]*1000,unit:'mm'}}));
 for(const e of g.entities){const key=e.id.split(':').at(-1)!;
  if(key.startsWith('wall-'))e.metadata={...e.metadata,geometry:geometry[key.slice(5)]};
  if(key==='window'||key==='door'){const anchor=c[(key+'Anchor') as keyof typeof c] as string,position=Number(c[(key+'Center') as keyof typeof c]),ref=c.buildingCenterX+(anchor==='left'?-1:anchor==='right'?1:0)*c.buildingWidth/2;e.metadata={...e.metadata,hosting:{anchor,offsetMm:round((position-ref)*1000),measurement:'Opening centre from host reference'}};}
  if(key==='slab')e.metadata={...e.metadata,boundaryFrom:['entity:build:wall-front','entity:build:wall-right','entity:build:wall-rear','entity:build:wall-left'],edgeProjectionMm:220};
  if(key==='roof')e.metadata={...e.metadata,supportedTopology:'rectangle',supports:['entity:build:wall-front','entity:build:wall-rear']};
 }
 const rel=g.relationships[0]!;
 for(const [a,b] of [['front','left'],['front','right'],['rear','left'],['rear','right']])g.relationships.push(parseRelationship({...rel,id:'relationship:build:corner-'+a+'-'+b,name:'Corner '+a+' / '+b,semanticType:'architecture.corner',relationType:'architecture.corner',from:'entity:build:wall-'+a,to:'entity:build:wall-'+b,metadata:{geometry:'Orthogonal butt return',fixings:'unresolved',capacity:'unverified'}}));
 createSemanticGraph([...g.entities,...g.parameters],g.relationships);
 return {...g,schemaVersion:'plasma-build-fixture/0.3.0',scope:'Connected rectangular wall moves; fixed recipe heights/thicknesses; anchored front openings. No arbitrary wall topology or structural approval.'};
}
export function fixtureConfig(graph:unknown):Record<string,unknown>{
 const g=graph as ReturnType<typeof buildFixtureGraph>;
 if(g.schemaVersion!=='plasma-build-fixture/0.3.0')return {...defaults,...priorConfig(graph)};
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
 const before=fixtureConfig(graph),after={...before},delta=edit.outwardMm/1000,axis=edit.wall==='left'||edit.wall==='right'?'X':'Z',dimension=axis==='X'?'buildingWidth':'buildingDepth',sign=edit.wall==='left'||edit.wall==='front'?-1:1;
 after[dimension]=round(Number(before[dimension])+delta);after['buildingCenter'+axis]=round(Number(before['buildingCenter'+axis])+sign*delta/2);
 if(edit.windowAnchor!==undefined)after.windowAnchor=edit.windowAnchor;if(edit.doorAnchor!==undefined)after.doorAnchor=edit.doorAnchor;
 return rehost(before,after);
}
export function editRectangularFootprint(graph:unknown,edit:{widthMm?:number;depthMm?:number}){const before=fixtureConfig(graph),after={...before};if(edit.widthMm!==undefined)after.buildingWidth=edit.widthMm/1000;if(edit.depthMm!==undefined)after.buildingDepth=edit.depthMm/1000;return rehost(before,after)}
export function editHostedWindow(graph:unknown,edit:{widthMm?:number;centerMm?:number}){const c=fixtureConfig(graph);if(edit.widthMm!==undefined)c.windowWidth=edit.widthMm/1000;if(edit.centerMm!==undefined)c.windowCenter=edit.centerMm/1000;return buildFixtureGraph(c)}
