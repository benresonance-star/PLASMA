import {parseSemanticObject,parseParameter,parseRelationship,createSemanticGraph} from '@spds/semantic-core';
import {computeInvalidationSet} from '@spds/dependency-graph';
const stamp='2026-10-13T00:00:00.000Z';
const numericUnits:Record<string,string>={windowCenter:'mm',windowWidth:'mm',windowSill:'mm',windowHeight:'mm',doorCenter:'mm',doorWidth:'mm',doorHeight:'mm',studSpacing:'mm',roofPitch:'deg'};
const env=(id:string,kind:string,semanticType:string)=>({id,kind,semanticType,name:id,createdAt:stamp,updatedAt:stamp,schemaVersion:'1.0.0'});
export function buildFixtureGraph(config:Record<string,unknown>){
 const entities=[['building','Model'],['slab','Entity'],['wall-front','Entity'],['wall-rear','Entity'],['wall-left','Entity'],['wall-right','Entity'],['roof','Entity'],['window','Entity'],['door','Entity']].map(([key,kind])=>parseSemanticObject({...env('entity:build:'+key,kind!,'architecture.'+key),metadata:{coordinateFrame:'WORLD_XY_Z_UP',units:'mm',...(key==='window'||key==='door'?{hostId:'entity:build:wall-front'}:{}),...(key==='slab'?{editableFootprint:false}:{}),...(key==='building'?{fixture:'build-6x4',settings:Object.fromEntries(Object.entries(config).filter(([k])=>!Object.hasOwn(numericUnits,k)))}:{})}}));
 const parameters=Object.entries(numericUnits).map(([key,unit])=>parseParameter({...env('parameter:build:'+key.toLowerCase(),'Parameter','architecture.fixture-parameter'),metadata:{configKey:key},quantity:{value:Number(config[key])*(unit==='mm'?1000:1),unit},role:'design-variable',editableBy:['user','agent'],affects:[key.startsWith('roof')?'entity:build:roof':'entity:build:wall-front']}));
 const relationships=entities.filter(e=>e.id!=='entity:build:building').map(e=>parseRelationship({...env('relationship:build:'+e.id.split(':').at(-1),'Relationship','architecture.membership'),relationType:e.metadata?.hostId?'architecture.hosted-by':'part-of',from:e.id,to:e.metadata?.hostId||'entity:build:building'}));
 createSemanticGraph([...entities,...parameters],relationships);
 return {schemaVersion:'plasma-build-fixture/0.1.0',entities,parameters,relationships,scope:'Fixed 6x4 fixture; parameter editing only. Not a general wall/slab/roof editor.'};
}
export function fixtureConfig(graph:unknown):Record<string,unknown>{const g=graph as ReturnType<typeof buildFixtureGraph>;
 if(g.schemaVersion!=='plasma-build-fixture/0.1.0')throw new Error('Unsupported building graph');
 const entities=g.entities.map(parseSemanticObject),parameters=g.parameters.map(parseParameter),relations=g.relationships.map(parseRelationship);createSemanticGraph([...entities,...parameters],relations);
 const settings=entities.find(e=>e.id==='entity:build:building')?.metadata?.settings;if(!settings||typeof settings!=='object')throw new Error('Missing building settings');
 const config:Record<string,unknown>={...settings};for(const [key,unit] of Object.entries(numericUnits)){const p=parameters.find(p=>p.metadata?.configKey===key);if(!p||p.quantity.unit!==unit)throw new Error('Missing or invalid parameter '+key);config[key]=p.quantity.value/(unit==='mm'?1000:1)}
 const canonical=buildFixtureGraph(config);if(JSON.stringify(canonical)!==JSON.stringify(g))throw new Error('Unsupported graph structure / host edit');return config;
}
export function editHostedWindow(graph:unknown,edit:{widthMm?:number;centerMm?:number}){const config=fixtureConfig(graph);if(edit.widthMm!==undefined)config.windowWidth=edit.widthMm/1000;if(edit.centerMm!==undefined)config.windowCenter=edit.centerMm/1000;return buildFixtureGraph(config)}
export const buildingEdges=[{from:'entity:build:window',to:'generator:build:front-frame'},{from:'entity:build:window',to:'generator:build:front-veneer'},{from:'entity:build:window',to:'generator:build:opening-junction'},...['front-frame','front-veneer','opening-junction'].flatMap(g=>['drawings','bom','checks'].map(c=>({from:'generator:build:'+g,to:'output:build:'+c})))];
export const windowImpact=()=>computeInvalidationSet(buildingEdges,['entity:build:window']);
export const buildToPlasmaPoint=(p:readonly number[])=>[p[0]!*1000,-p[2]!*1000,p[1]!*1000];
export const plasmaToBuildPoint=(p:readonly number[])=>[p[0]!/1000,p[2]!/1000,-p[1]!/1000];
