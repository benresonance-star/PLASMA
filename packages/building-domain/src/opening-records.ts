import {wallFrames,type HostedOpening} from './openings.js';
export const originalDefaults:Record<string,number>={windowCenter:1.2,windowWidth:1.44,windowSill:.9,windowHeight:1.2,doorCenter:-1.62,doorWidth:.96,doorHeight:2.1};
export function openingCatalog(c:Record<string,unknown>):HostedOpening[]{
 if(Array.isArray(c.openingRecords))return c.openingRecords.map(o=>({...o}));
 return [...(['door','window'] as const).map(kind=>({id:kind,wall:'front',kind,centerMm:Math.round((Number(c[kind+'Center']??originalDefaults[kind+'Center'])-Number(c.buildingCenterX??0))*1e6)/1000,widthMm:Number(c[kind+'Width']??originalDefaults[kind+'Width'])*1000,heightMm:Number(c[kind+'Height']??originalDefaults[kind+'Height'])*1000,sillMm:kind==='door'?0:Number(c.windowSill??.9)*1000})),...((c.hostedOpenings??[]) as HostedOpening[]).map(o=>({...o}))];
}
export function cleanOpeningRecords(c:Record<string,unknown>):HostedOpening[]{
 if(c.openingRecords!==undefined&&c.openingRecords!==null&&!Array.isArray(c.openingRecords))throw new Error('Opening records must be an array');
 const list=openingCatalog(c),frames=wallFrames(c),ids=new Set<string>();
 if(list.length>14)throw new Error('Use at most 14 openings');
 for(const o of list){
  if(!o||Object.keys(o).sort().join(',')!=='centerMm,heightMm,id,kind,sillMm,wall,widthMm')throw new Error('Unsupported opening fields');
  if(typeof o.id!=='string'||!(/^(window|door)$/.test(o.id)||/^o-[a-z0-9-]{1,32}$/.test(o.id))||ids.has(o.id))throw new Error('Opening IDs must be unique');ids.add(o.id);
  if(!['window','door'].includes(o.kind)||(['window','door'].includes(o.id)&&o.kind!==o.id))throw new Error('Original opening identity retains its kind');
  const f=frames.find(f=>f.id===o.wall);if(!f)throw new Error('Opening host is unsupported');
  for(const k of ['centerMm','widthMm','heightMm','sillMm'] as const)if(!Number.isFinite(o[k])||Math.abs(o[k]*1000-Math.round(o[k]*1000))>1e-6)throw new Error('Opening dimensions must be finite millimetres (maximum 0.001 mm precision)');
  if(o.widthMm<600||o.widthMm>2000||o.heightMm<600||o.heightMm>2300||o.sillMm<0||o.sillMm+o.heightMm>2420||(o.kind==='door'&&(o.sillMm!==0||o.heightMm<1980))||(o.kind==='window'&&o.sillMm<300))throw new Error('Opening dimensions exceed the concept recipe');
  if(Math.abs(o.centerMm)+o.widthMm/2>f.length*500-180+1e-6)throw new Error('Keep at least 180 mm clearance at each host wall end');
 }
 for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){const a=list[i]!,b=list[j]!;if(a.wall===b.wall&&Math.abs(a.centerMm-b.centerMm)-(a.widthMm+b.widthMm)/2<300-1e-6)throw new Error('Keep at least 300 mm between openings on the same host');}
 if(c.sillJunction&&!list.some(o=>o.id==='window'&&o.wall==='front'))throw new Error('Remove the coordinated front-window detail before rehosting its opening');
 if(c.sizingMode==='tables'&&(list.length!==2||!legacyOpeningLayout(list)))throw new Error('Changed opening layout requires concept sizing; manufacturer table scope has not been extended');
 return list.sort((a,b)=>a.id.localeCompare(b.id));
}
export function legacyOpeningLayout(list:HostedOpening[]){
 const w=list.find(o=>o.id==='window'),d=list.find(o=>o.id==='door');
 return !!w&&!!d&&w.wall==='front'&&d.wall==='front'&&w.centerMm>=-200&&w.centerMm<=1900&&w.heightMm<=1500&&w.sillMm>=600&&w.sillMm<=1200&&d.centerMm>=-2200&&d.centerMm<=-800&&d.widthMm>=720&&d.widthMm<=1200&&d.centerMm+d.widthMm/2+300<=w.centerMm-w.widthMm/2;
}
/** Compatibility projection only. Graph entities and parameters own the records. */
export function projectOpenings(input:Record<string,unknown>,list:HostedOpening[]):Record<string,unknown>{
 const c:Record<string,unknown>={...input,...originalDefaults,hostedOpenings:list.filter(o=>o.id!=='door'&&o.id!=='window')},x=Number(input.buildingCenterX??0);
 c.windowCenter=Number(c.windowCenter)+x;c.doorCenter=Number(c.doorCenter)+x;
 for(const kind of ['window','door'] as const){const o=list.find(o=>o.id===kind);if(o){c[kind+'Center']=Math.round((x+o.centerMm/1000)*1e6)/1e6;c[kind+'Width']=o.widthMm/1000;c[kind+'Height']=o.heightMm/1000;if(kind==='window')c.windowSill=o.sillMm/1000;}}
 if(legacyOpeningLayout(list))delete c.openingRecords;else c.openingRecords=list.map(o=>({...o}));
 return c;
}
export function openingCapabilities(id:string){return {move:true,resize:true,rehost:true,remove:true,changeKind:!['window','door'].includes(id),restriction:null};}
