export type HostedOpening={id:string;wall:string;kind:'window'|'door';centerMm:number;widthMm:number;heightMm:number;sillMm:number};
export function wallFrames(c:Record<string,unknown>){
 const w=Number(c.buildingWidth??6),d=Number(c.buildingDepth??4),rw=Number(c.recessWidth??0),rd=Number(c.recessDepth??0),x=Number(c.buildingCenterX??0),z=Number(c.buildingCenterZ??0);
 const frame=(id:string,length:number,ox:number,oz:number,angle:number)=>({id,length,origin:[x+ox,z+oz],angle,tangent:[Math.cos(angle),-Math.sin(angle)],system:id==='front'?String(c.frontSystem??'lvl'):'lvl'});
 return [frame('front',w,0,-d/2+.045,0),frame('rear',w-rw,-rw/2,d/2-.045,0),frame('left',d-.18,-w/2+.045,0,Math.PI/2),frame('right',d-rd-.18,w/2-.045,-rd/2,Math.PI/2),...(rw>0?[frame('recess-rear',rw+.09,(w-rw-.09)/2,d/2-rd-.045,0),frame('recess-side',rd-.09,w/2-rw-.045,(d-rd-.09)/2,Math.PI/2)]:[])];
}
export function cleanHostedOpenings(c:Record<string,unknown>):HostedOpening[]{
 const input=c.hostedOpenings??[];if(!Array.isArray(input)||input.length>12)throw new Error('Use at most 12 additional hosted openings');
 const frames=wallFrames(c),ids=new Set<string>();const list=input.map((raw:unknown)=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid hosted opening');const o=raw as HostedOpening;
  if(Object.keys(o).sort().join(',')!=='centerMm,heightMm,id,kind,sillMm,wall,widthMm')throw new Error('Unsupported opening fields');
  if(typeof o.id!=='string'||!/^o-[a-z0-9-]{1,32}$/.test(o.id)||ids.has(o.id))throw new Error('Opening IDs must be unique and start with o-');ids.add(o.id);
  const f=frames.find(f=>f.id===o.wall);if(!f||!['window','door'].includes(o.kind))throw new Error('Opening host or kind is unsupported');
  for(const k of ['centerMm','widthMm','heightMm','sillMm'] as const)if(!Number.isFinite(o[k])||Math.abs(o[k]*1000-Math.round(o[k]*1000))>1e-6)throw new Error('Opening dimensions must be finite millimetres (maximum 0.001 mm precision)');
  if(o.widthMm<600||o.widthMm>2000||o.heightMm<600||o.heightMm>2300||o.sillMm<0||o.sillMm+o.heightMm>2420||(o.kind==='door'&&(o.sillMm!==0||o.heightMm<1980))||(o.kind==='window'&&o.sillMm<300))throw new Error('Opening dimensions exceed the concept recipe');
  if(Math.abs(o.centerMm)+o.widthMm/2>f.length*500-180+1e-6)throw new Error('Keep at least 180 mm at each host wall end');
  return {id:o.id,wall:o.wall,kind:o.kind,centerMm:o.centerMm,widthMm:o.widthMm,heightMm:o.heightMm,sillMm:o.sillMm};
 }).sort((a,b)=>a.id.localeCompare(b.id));
 const base=['door','window'].map(kind=>({id:kind,wall:'front',centerMm:(Number(c[kind+'Center'])-Number(c.buildingCenterX??0))*1000,widthMm:Number(c[kind+'Width'])*1000}));
 const all=[...base,...list];for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){const a=all[i]!,b=all[j]!;if(a.wall===b.wall&&Math.abs(a.centerMm-b.centerMm)-(a.widthMm+b.widthMm)/2<300-1e-6)throw new Error('Keep at least 300 mm between openings on the same host');}
 if(list.length&&c.sizingMode==='tables')throw new Error('Additional openings require concept sizing; manufacturer table scope has not been extended');
 return list;
}
