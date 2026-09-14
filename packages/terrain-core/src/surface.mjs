import { TerrainError, validateTerrain, terrainRequestKey } from "./index.mjs";

const error = (message) => { throw new TerrainError("INVALID_REALIZATION", message); };
const o = (a,b,c) => (BigInt(b.x)-BigInt(a.x))*(BigInt(c.y)-BigInt(a.y))-(BigInt(b.y)-BigInt(a.y))*(BigInt(c.x)-BigInt(a.x));
const on = (a,b,p) => o(a,b,p)===0n && p.x>=Math.min(a.x,b.x)&&p.x<=Math.max(a.x,b.x)&&p.y>=Math.min(a.y,b.y)&&p.y<=Math.max(a.y,b.y);
const opp = (a,b) => a<0n&&b>0n || a>0n&&b<0n;
const cross = (a,b,c,d) => opp(o(a,b,c),o(a,b,d))&&opp(o(c,d,a),o(c,d,b));
const edgeKey = (a,b) => a<b?a+":"+b:b+":"+a;
const inTriangle = (p,a,b,c) => o(a,b,p)>=0n&&o(b,c,p)>=0n&&o(c,a,p)>=0n;
const area = (ring,v) => ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+BigInt(v[a].x)*BigInt(v[b].y)-BigInt(v[a].y)*BigInt(v[b].x);},0n);
function edges(triangles) {
  const result=new Map();
  triangles.forEach((t,i)=>t.forEach((a,k)=>{
    const b=t[(k+1)%3],key=edgeKey(a,b);
    if(!result.has(key))result.set(key,[]);
    result.get(key).push({a,b,triangle:i});
  }));
  return result;
}
function earClip(input,v) {
  const ring=[...input],result=[];
  if(area(ring,v)<0n)ring.reverse();
  while(ring.length>3) {
    let cut=false;
    for(let i=0;i<ring.length;i++){
      const a=ring[(i+ring.length-1)%ring.length],b=ring[i],c=ring[(i+1)%ring.length];
      if(o(v[a],v[b],v[c])<=0n)continue;
      if(ring.some(p=>p!==a&&p!==b&&p!==c&&inTriangle(v[p],v[a],v[b],v[c])))continue;
      result.push([a,b,c]);ring.splice(i,1);cut=true;break;
    }
    if(!cut)error("No valid ear; unsupported or invalid polygon cavity.");
  }
  if(ring.length!==3||o(v[ring[0]],v[ring[1]],v[ring[2]])<=0n)error("Degenerate cavity.");
  result.push(ring);return result;
}
function insertPoint(tris,p,v) {
  const hits=[];
  for(let i=0;i<tris.length;i++){const [a,b,c]=tris[i];if(inTriangle(v[p],v[a],v[b],v[c]))hits.push(i);}
  if(hits.length<1||hits.length>2)error("Point location is not manifold.");
  const removed=new Set(hits),added=[];
  for(const i of hits)for(let k=0;k<3;k++){
    const a=tris[i][k],b=tris[i][(k+1)%3];
    if(o(v[a],v[b],v[p])>0n)added.push([a,b,p]);
  }
  return tris.filter((_,i)=>!removed.has(i)).concat(added);
}
// Recover a constraint by flipping crossed internal edges in convex quadrilaterals.
// Defer non-convex edges and requeue replacement diagonals that still cross.
// The fixed work cap turns non-convergence into an explicit failure.
function recoverConstraint(tris,u,w,v) {
  let map=edges(tris);
  const target=edgeKey(u,w);
  if(map.has(target))return tris;
  const queue=[...map.entries()].filter(([,list])=>cross(v[u],v[w],v[list[0].a],v[list[0].b])).map(([key])=>key);
  let cursor=0,stalled=0;
  while(!map.has(target)) {
    if(cursor>=20000||cursor>=queue.length)error("Constraint recovery exceeded its bounded work budget.");
    const key=queue[cursor++],list=map.get(key);
    if(!list||list.length!==2){stalled=0;continue;}
    const {a,b}=list[0],left=list[0].triangle,right=list[1].triangle;
    const c=tris[left].find(p=>p!==a&&p!==b),d=tris[right].find(p=>p!==a&&p!==b);
    if(!cross(v[a],v[b],v[c],v[d])){
      queue.push(key);stalled++;
      if(stalled>=queue.length-cursor)error("No flippable constraint edge.");
      continue;
    }
    const ccw=(a,b,c)=>o(v[a],v[b],v[c])>0n?[a,b,c]:[a,c,b];
    tris[left]=ccw(c,d,a);tris[right]=ccw(d,c,b);
    map=edges(tris);stalled=0;
    if(cross(v[u],v[w],v[c],v[d]))queue.push(edgeKey(c,d));
  }
  return tris;
}
function canonical(t) {
  return {...t,points:[...t.points].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),
    features:[...t.features].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)};
}
function constraints(t,index) {
  return t.features.flatMap(f=>f.pointIds.slice(0,f.kind==="boundary"?undefined:-1).map((id,i)=>({
    featureId:f.id,segmentIndex:i,kind:f.kind,a:index.get(id),b:index.get(f.pointIds[(i+1)%f.pointIds.length])
  })));
}
function pin(t) {return terrainRequestKey(canonical(t));}
function pointInRing(p,ring) {
  let winding=0;
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length];
    if(on(a,b,p))return true;
    if(a.y<=p.y&&b.y>p.y&&o(a,b,p)>0n)winding++;
    if(a.y>p.y&&b.y<=p.y&&o(a,b,p)<0n)winding--;
  }
  return winding!==0;
}
export function validateTerrainSurface(source,surface) {
  validateTerrain(source);
  const t=canonical(source),v=t.points,index=new Map(v.map((p,i)=>[p.id,i]));
  const boundary=t.features.find(f=>f.kind==="boundary");
  if(!boundary)error("A realized surface requires a boundary.");
  if(surface?.schema!=="plasma-terrain-surface/1"||surface.sourceKey!==pin(t)||
     surface.terrainId!==t.id||surface.terrainRevision!==t.revision||
     surface.frameId!==t.frameId||surface.datum!==t.datum||surface.units!=="mm"||
     surface.evaluator!=="terrain-flip/1")
    error("Surface provenance or source revision mismatch.");
  if(terrainRequestKey(surface.vertices)!==terrainRequestKey(v.map(p=>({id:p.id,x:p.x,y:p.y,z:p.z}))))
    error("Surface vertices must preserve every control and its elevation.");
  const tris=surface.triangles;
  if(!Array.isArray(tris)||!tris.length||tris.length>2*v.length)error("Triangle count exceeds bounded domain.");
  let sum=0n;const used=new Set(),unique=new Set();
  const ring=boundary.pointIds.map(id=>index.get(id));
  const scaledRing=ring.map(i=>({x:v[i].x*3,y:v[i].y*3}));
  for(const tri of tris){
    if(!Array.isArray(tri)||tri.length!==3||new Set(tri).size!==3||tri.some(i=>!Number.isInteger(i)||i<0||i>=v.length))error("Invalid triangle indices.");
    const [a,b,c]=tri.map(i=>v[i]),signed=o(a,b,c);
    if(signed<=0n)error("Triangles must have positive orientation and area.");
    sum+=signed;tri.forEach(i=>used.add(i));
    const key=[...tri].sort((a,b)=>a-b).join(":");if(unique.has(key))error("Duplicate triangle.");unique.add(key);
    if(!pointInRing({x:a.x+b.x+c.x,y:a.y+b.y+c.y},scaledRing))error("Triangle is outside boundary.");
  }
  const domainArea=area(ring,v);
  if(sum!==(domainArea<0n?-domainArea:domainArea)||used.size!==v.length)error("Coverage or control completeness failed.");
  const map=edges(tris),required=constraints(t,index);
  if(terrainRequestKey(surface.constraints)!==terrainRequestKey(required))error("Constraint lineage mismatch.");
  const boundaryEdges=new Set(required.filter(c=>c.kind==="boundary").map(c=>edgeKey(c.a,c.b)));
  for(const c of required)if(!map.has(edgeKey(c.a,c.b)))error("A required boundary or breakline edge is missing.");
  for(const [key,list] of map){
    if(list.length!==(boundaryEdges.has(key)?1:2))error("Incorrect boundary/interior edge incidence.");
    if(list.length===2&&list[0].a!==list[1].b)error("Inconsistent adjacent triangle orientation.");
  }
  const es=[...map.values()].map(list=>list[0]);
  for(let i=0;i<es.length;i++)for(let j=i+1;j<es.length;j++){
    const {a,b}=es[i],{a:c,b:d}=es[j];
    if(cross(v[a],v[b],v[c],v[d]))error("Mesh edges cross.");
    for(const [p,x,y] of [[a,c,d],[b,c,d],[c,a,b],[d,a,b]])
      if(p!==x&&p!==y&&on(v[x],v[y],v[p]))error("Mesh contains an unsplit touch or overlap.");
  }
  // Connectivity is independent of total area and incidence.
  const reached=new Set([0]),queue=[0],neighbors=Array.from({length:tris.length},()=>[]);
  for(const list of map.values())if(list.length===2){const a=list[0].triangle,b=list[1].triangle;neighbors[a].push(b);neighbors[b].push(a);}
  for(let i=0;i<queue.length;i++)for(const n of neighbors[queue[i]])if(!reached.has(n)){reached.add(n);queue.push(n);}
  if(reached.size!==tris.length)error("Disconnected surface.");
  return {status:"valid",triangleCount:tris.length,controlCount:v.length,twiceAreaMm2:sum.toString(),
    checks:["source","orientation","coverage","incidence","constraints","lineage","no-crossings","connectivity"]};
}
export function evaluateTerrainSurface(source) {
  validateTerrain(source);
  const t=canonical(source),v=t.points,index=new Map(v.map((p,i)=>[p.id,i]));
  const boundary=t.features.find(f=>f.kind==="boundary");
  if(!boundary)throw new TerrainError("OUTSIDE_COVERAGE","Surface evaluation requires an explicit boundary.");
  const ring=boundary.pointIds.map(id=>index.get(id)),boundarySet=new Set(ring);
  let triangles=earClip(ring,v);
  for(let p=0;p<v.length;p++)if(!boundarySet.has(p))triangles=insertPoint(triangles,p,v);
  const required=constraints(t,index);
  for(const c of required.filter(c=>c.kind==="breakline"))triangles=recoverConstraint(triangles,c.a,c.b,v);
  triangles=triangles.map(t=>{const i=t.indexOf(Math.min(...t));return [...t.slice(i),...t.slice(0,i)];})
    .sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);
  const surface={schema:"plasma-terrain-surface/1",terrainId:t.id,terrainRevision:t.revision,
    sourceKey:pin(t),frameId:t.frameId,datum:t.datum,units:"mm",evaluator:"terrain-flip/1",
    vertices:v.map(p=>({id:p.id,x:p.x,y:p.y,z:p.z})),triangles,constraints:required};
  return {...surface,validation:validateTerrainSurface(t,surface)};
}
