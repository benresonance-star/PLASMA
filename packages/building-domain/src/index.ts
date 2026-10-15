import {buildFixtureGraph as legacyGraph,fixtureConfig as legacyConfig,footprintBoundary,wallGeometry as legacyWallGeometry} from './legacy-hosted.js';
import {wallSystem,cleanWallSystems} from './wall-systems.js';
export {wallSystem,cleanWallSystems} from './wall-systems.js';
import {wallFrames,type HostedOpening} from './openings.js';
import {cleanOpeningRecords,openingCatalog,projectOpenings,originalDefaults} from './opening-records.js';
import {parseParameter,parseSemanticObject,parseRelationship,createSemanticGraph} from '@spds/semantic-core';
export {footprintBoundary};
export function wallGeometry(c:Record<string,unknown>){return Object.fromEntries(Object.entries(legacyWallGeometry(c)).map(([id,g])=>[id,{...g,assemblyType:wallSystem(c,id),thicknessMm:wallSystem(c,id)==='steel'?93.5:90}]))}
export {wallFrames,type HostedOpening} from './openings.js';
export {openingCatalog,openingCapabilities,projectOpenings,cleanOpeningRecords} from './opening-records.js';
export {buildingEdges,windowImpact,footprintEdges,footprintImpact,buildToPlasmaPoint,plasmaToBuildPoint} from './legacy-fixture.js';
export type WallSide='front'|'rear'|'left'|'right';
export type OpeningAnchor='left'|'center'|'right';
const original=(id:string)=>id==='window'||id==='door';
const parameterId=(id:string,key:string)=>'parameter:build:'+(original(id)?id+({centerMm:'center',widthMm:'width',heightMm:'height',sillMm:'sill'} as Record<string,string>)[key]:id+'-'+key.toLowerCase());
export function cleanHostedOpenings(c:Record<string,unknown>){return cleanOpeningRecords(c).filter(o=>!original(o.id));}
export function buildFixtureGraph(input:Record<string,unknown>){
 const c={recessWidth:0,recessDepth:0,buildingCenterX:0,buildingCenterZ:0,windowAnchor:'center',doorAnchor:'center',buildingWidth:6,buildingDepth:4,...input};
 const systems=cleanWallSystems(c);if(Object.keys(systems).length)(c as Record<string,unknown>).wallSystems=systems;else delete (c as Record<string,unknown>).wallSystems;
 const records=cleanOpeningRecords(c),base:Record<string,unknown>={...c,...originalDefaults,windowCenter:Number(c.buildingCenterX)+1.2,doorCenter:Number(c.buildingCenterX)-1.62,hostedOpenings:[]};delete base.openingRecords;
 const g=legacyGraph(base),template=g.entities.find(e=>e.id==='entity:build:window')!,parameter=g.parameters[0]!,relation=g.relationships[0]!;
 const settings=g.entities.find(e=>e.id==='entity:build:building')!.metadata!.settings as Record<string,unknown>;delete settings.openingRecords;
 g.entities=g.entities.filter(e=>!original(e.id.split(':').at(-1)!));
 g.parameters=g.parameters.filter(p=>!/^window|^door/.test(String(p.metadata?.configKey)));
 g.relationships=g.relationships.filter(r=>!original(r.from.split(':').at(-1)!));
 // Original IDs are retained; all openings now share the same record and parameter binding shape.
 for(const o of [...records].sort((a,b)=>(a.id==='window'?-2:a.id==='door'?-1:0)-(b.id==='window'?-2:b.id==='door'?-1:0)||a.id.localeCompare(b.id))){
  const id='entity:build:'+o.id,hostId='entity:build:wall-'+o.wall;
  g.entities.push(parseSemanticObject({...template,id,name:o.id,semanticType:'architecture.hosted-opening',metadata:{coordinateFrame:'HOST_U_Y',units:'mm',hostId,openingId:o.id,openingKind:o.kind,anchor:original(o.id)?c[(o.id+'Anchor') as keyof typeof c]:'center',positionReference:'Host framing centre; positive u follows wall frame tangent',detailStatus:o.id==='window'&&o.wall==='front'?'Front window detail available; capacity and fabrication unresolved':'Framing and veneer only; product, flashing, supports and fixings unresolved'}}));
  for(const key of ['centerMm','widthMm','heightMm','sillMm'] as const)g.parameters.push(parseParameter({...parameter,id:parameterId(o.id,key),name:o.id+' '+key,metadata:{openingId:o.id,openingKey:key},quantity:{value:o[key],unit:'mm'},affects:[id,hostId]}));
  g.relationships.push(parseRelationship({...relation,id:'relationship:build:'+(original(o.id)?o.id:'host-'+o.id),name:o.id+' host',relationType:'architecture.hosted-by',from:id,to:hostId}));
 }
 for(const e of g.entities.filter(e=>e.id.startsWith('entity:build:wall-'))){const system=wallSystem(c,e.id.slice('entity:build:wall-'.length));e.metadata!.geometry={...(e.metadata!.geometry as Record<string,unknown>),assemblyType:system,thicknessMm:system==='steel'?93.5:90};}
 createSemanticGraph([...g.entities,...g.parameters],g.relationships);
 return {...g,schemaVersion:'plasma-build-fixture/0.6.0',scope:'Unified graph-owned wall openings on rectangle or bounded L; concept framing only. Front window detail is host-restricted; no structural approval.'};
}
export function fixtureConfig(graph:unknown):Record<string,unknown>{
 const g=graph as ReturnType<typeof buildFixtureGraph>;
 if(g.schemaVersion!=='plasma-build-fixture/0.6.0')return legacyConfig(graph);
 const entities=g.entities.map(parseSemanticObject),parameters=g.parameters.map(parseParameter),relationships=g.relationships.map(parseRelationship);createSemanticGraph([...entities,...parameters],relationships);
 const settings=entities.find(e=>e.id==='entity:build:building')?.metadata?.settings;if(!settings||typeof settings!=='object')throw new Error('Missing building settings');
 const c:Record<string,unknown>={...settings};
 for(const p of parameters.filter(p=>!p.metadata?.openingId)){const key=p.metadata?.configKey;if(typeof key!=='string')throw new Error('Missing parameter key');const unit=key==='roofPitch'?'deg':'mm';if(p.quantity.unit!==unit)throw new Error('Invalid parameter unit');c[key]=p.quantity.value/(unit==='mm'?1000:1);}
 const records=entities.filter(e=>e.semanticType==='architecture.hosted-opening').map(e=>{const m=e.metadata!,o:Record<string,unknown>={id:m.openingId,kind:m.openingKind,wall:String(m.hostId).replace('entity:build:wall-','')};for(const key of ['centerMm','widthMm','heightMm','sillMm']){const p=parameters.find(p=>p.metadata?.openingId===m.openingId&&p.metadata?.openingKey===key);if(!p||p.quantity.unit!=='mm')throw new Error('Missing opening parameter');o[key]=p.quantity.value;}return o as HostedOpening;}).sort((a,b)=>a.id.localeCompare(b.id));
 const result=projectOpenings(c,records);if(JSON.stringify(buildFixtureGraph(result))!==JSON.stringify(g))throw new Error('Unsupported graph structure / host edit');return result;
}
export function editOpening(graph:unknown,edit:{operation:'upsert';opening:HostedOpening}|{operation:'remove';id:string}){
 const c=fixtureConfig(graph),list=openingCatalog(c);let next:HostedOpening[];
 if(edit.operation==='remove'){if(!list.some(o=>o.id===edit.id))throw new Error('Hosted opening not found');next=list.filter(o=>o.id!==edit.id);if(edit.id==='window')c.sillJunction=null;}
 else if(edit.operation==='upsert')next=[...list.filter(o=>o.id!==edit.opening.id),edit.opening];
 else throw new Error('Unsupported opening command');
 return buildFixtureGraph({...c,openingRecords:next});
}
export const editWallOpening=editOpening;
export function editHostedWindow(graph:unknown,edit:{widthMm?:number;centerMm?:number}){
 const c=fixtureConfig(graph),o=openingCatalog(c).find(o=>o.id==='window');if(!o||o.wall!=='front')throw new Error('Use the hosted opening editor; original window is absent or no longer on the front wall');
 return editOpening(graph,{operation:'upsert',opening:{...o,...(edit.widthMm!==undefined?{widthMm:edit.widthMm}:{}),...(edit.centerMm!==undefined?{centerMm:edit.centerMm-Number(c.buildingCenterX)*1000}:{})}});
}
function reshape(before:Record<string,unknown>,after:Record<string,unknown>){
 const a=wallFrames(before),b=wallFrames(after),records=openingCatalog(before).map(o=>{const anchor=original(o.id)?after[o.id+'Anchor']:'center',sign=anchor==='left'?-1:anchor==='right'?1:0,old=a.find(f=>f.id===o.wall),next=b.find(f=>f.id===o.wall);return {...o,centerMm:Math.round((o.centerMm+(next&&old?sign*(next.length-old.length)*500:0))*1000)/1000};});
 return buildFixtureGraph({...after,openingRecords:records});
}
export function moveConnectedWall(graph:unknown,edit:{wall:WallSide;outwardMm:number;windowAnchor?:OpeningAnchor;doorAnchor?:OpeningAnchor}){
 if(!['front','rear','left','right'].includes(edit.wall)||!Number.isFinite(edit.outwardMm)||Math.abs(edit.outwardMm)>2000)throw new Error('Unsupported wall move; normal offset must be within ±2000 mm');
 const before=fixtureConfig(graph);if(Number(before.recessWidth)>0)throw new Error('Use corner recess controls for an L footprint');const after={...before},delta=edit.outwardMm/1000,axis=edit.wall==='left'||edit.wall==='right'?'X':'Z',dimension=axis==='X'?'buildingWidth':'buildingDepth',sign=edit.wall==='left'||edit.wall==='front'?-1:1;
 after[dimension]=Math.round((Number(before[dimension])+delta)*1e6)/1e6;after['buildingCenter'+axis]=Math.round((Number(before['buildingCenter'+axis])+sign*delta/2)*1e6)/1e6;if(edit.windowAnchor!==undefined)after.windowAnchor=edit.windowAnchor;if(edit.doorAnchor!==undefined)after.doorAnchor=edit.doorAnchor;
 return reshape(before,after);
}
export function editRectangularFootprint(graph:unknown,edit:{widthMm?:number;depthMm?:number}){const before=fixtureConfig(graph);if(Number(before.recessWidth)>0)throw new Error('Use corner recess controls for an L footprint');const after={...before};if(edit.widthMm!==undefined)after.buildingWidth=edit.widthMm/1000;if(edit.depthMm!==undefined)after.buildingDepth=edit.depthMm/1000;return reshape(before,after)}
export function editCornerRecess(graph:unknown,edit:{widthMm:number;depthMm:number}){const before=fixtureConfig(graph),c:Record<string,unknown>={...before,recessWidth:edit.widthMm/1000,recessDepth:edit.depthMm/1000};if(c.recessWidth===0&&c.recessDepth===0){c.roofArrangement='unresolved';c.roofArrangementRef='';}else{c.roofArrangement='level-joists';c.roofArrangementRef='Bounded L footprint: level joists on front/rear/recess walls; drainage, deck, connections and capacity unresolved';}return reshape(before,c)}

export function editWallSystem(graph:unknown,edit:{wall:string;system:string}){
 const c=fixtureConfig(graph);if(!wallFrames(c).some(f=>f.id===edit.wall)||!['lvl','pine','steel'].includes(edit.system))throw new Error('Unsupported wall or framing system');
 if(edit.wall==='front')c.frontSystem=edit.system;else c.wallSystems={...(c.wallSystems as Record<string,string>??{}),[edit.wall]:edit.system};
 return buildFixtureGraph(c);
}
