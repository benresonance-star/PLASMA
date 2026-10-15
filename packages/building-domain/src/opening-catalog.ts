import type {HostedOpening} from './openings.js';

/** A single editing projection; values remain owned by graph parameters. */
export function openingCatalog(c:Record<string,unknown>):HostedOpening[]{
 const originals=(['door','window'] as const).map(kind=>({
  id:kind,wall:'front',kind,
  centerMm:Math.round((Number(c[kind+'Center'])-Number(c.buildingCenterX??0))*1e6)/1000,
  widthMm:Number(c[kind+'Width'])*1000,heightMm:Number(c[kind+'Height'])*1000,
  sillMm:kind==='door'?0:Number(c.windowSill)*1000
 }));
 return [...originals,...((c.hostedOpenings??[]) as HostedOpening[]).map(o=>({...o}))];
}
export function openingCapabilities(id:string){
 const original=id==='door'||id==='window';
 return {move:true,resize:true,rehost:!original,remove:!original,changeKind:!original,
  restriction:original?'Original opening: front-wall move and resize supported. Rehost, removal and kind changes await coordinated detail and drawing migration.':null};
}
export function applyOriginalOpening(c:Record<string,unknown>,o:HostedOpening):Record<string,unknown>{
 const kind=o.id;if(kind!=='door'&&kind!=='window')throw new Error('Original opening not found');
 if(Object.keys(o).sort().join(',')!=='centerMm,heightMm,id,kind,sillMm,wall,widthMm')throw new Error('Unsupported opening fields');
 if(o.wall!=='front'||o.kind!==kind)throw new Error('Original opening rehost and kind changes require coordinated detail migration');
 for(const key of ['centerMm','widthMm','heightMm','sillMm'] as const)if(!Number.isFinite(o[key])||Math.abs(o[key]*1000-Math.round(o[key]*1000))>1e-6)throw new Error('Opening dimensions must be finite millimetres (maximum 0.001 mm precision)');
 if(kind==='door'&&o.sillMm!==0)throw new Error('Door sill must be zero');
 return {...c,[kind+'Center']:Math.round((o.centerMm/1000+Number(c.buildingCenterX??0))*1e6)/1e6,[kind+'Width']:o.widthMm/1000,[kind+'Height']:o.heightMm/1000,...(kind==='window'?{windowSill:o.sillMm/1000}:{})};
}
