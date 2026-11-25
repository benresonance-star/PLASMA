// Bounded straight-edged, planar, opaque fixture. Not a production silhouette solver.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadOcjs } from '../services/geometry-occt/dist/occt-js.js';
import { parseVectorScene, renderVectorSvg, DEFAULT_VECTOR_STYLE } from '../packages/representation-core/dist/index.js';
const oc=await loadOcjs();
const shapes=[], faces=[];
function prism(poly,z,h){
  const maker=new oc.BRepBuilderAPI_MakePolygon_1();
  for(const [x,y] of poly) maker.Add_1(new oc.gp_Pnt_3(x,y,z));
  maker.Close();
  const face=new oc.BRepBuilderAPI_MakeFace_15(maker.Wire(),true).Face();
  shapes.push(new oc.BRepPrimAPI_MakePrism_1(face,new oc.gp_Vec_4(0,0,h),true,true).Shape());
  const a=poly.map(([x,y])=>[x,y,z]),b=poly.map(([x,y])=>[x,y,z+h]);
  faces.push(a,b);
  for(let i=0;i<a.length;i++){const j=(i+1)%a.length;faces.push([a[i],a[j],b[j],b[i]]);}
}
function box(x,y,z,w,d,h){prism([[x,y],[x+w,y],[x+w,y+d],[x,y+d]],z,h);}
prism([[0,0],[45,0],[45,4],[4,4],[4,36],[45,36],[45,40],[0,40]],0,180);
box(45,0,0,4,40,180);box(49,17,15,95,6,150);box(4,5,65,37,30,20);
const algo=new oc.HLRBRep_Algo_1(),handle=new oc.Handle_HLRBRep_Algo_2(algo);
const axes=new oc.gp_Ax2_2(new oc.gp_Pnt_3(0,0,0),new oc.gp_Dir_4(1,1,1),new oc.gp_Dir_4(1,-1,0));
for(const shape of shapes)algo.Add_2(shape,0);
algo.Projector_1(new oc.HLRAlgo_Projector_2(axes));algo.Update();algo.Hide_1();
const result=new oc.HLRBRep_HLRToShape(handle);
function lines(compound) {
  const edges=[];
  if(compound.IsNull()) return edges;
  const ex = new oc.TopExp_Explorer_2(compound,oc.TopAbs_ShapeEnum.TopAbs_EDGE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  while(ex.More()) {
    const edge = oc.TopoDS.Edge_1(ex.Current());
    const c = new oc.BRepAdaptor_Curve_2(edge);
    assert.equal(c.GetType(),oc.GeomAbs_CurveType.GeomAbs_Line);
    const p = c.Value(c.FirstParameter()), q = c.Value(c.LastParameter());
    assert.ok(Math.abs(p.Z()) < 1e-7 && Math.abs(q.Z()) < 1e-7,'HLR output must already be planar');
    const line = [[p.X(),-p.Y()],[q.X(),-q.Y()]];
    assert.ok(line.flat().every(Number.isFinite));
    edges.push(line);
    p.delete(); q.delete(); c.delete(); edge.delete(); ex.Next();
  }
  ex.delete();
  return edges;
}

const visible=lines(result.VCompound_1()),hidden=lines(result.HCompound_1());
assert.equal(visible.length,30);assert.equal(hidden.length,33);
const project=([x,y,z])=>[(x-y)/Math.sqrt(2),(2*z-x-y)/Math.sqrt(6)];
const polygons=faces.map(f=>f.map(project));
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1],cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const length=([a,b])=>Math.hypot(...sub(b,a));
const segments=polygons.flatMap(p=>p.map((a,i)=>[a,p[(i+1)%p.length]]));
function inside(p,polygon){
  let hit=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;
  }
  return hit;
}
const covered=p=>polygons.some(poly=>inside(p,poly));
function split(line){
  const [a,b]=line,d=sub(b,a),denom=dot(d,d),ts=[0,1];
  if(denom<1e-16)return [];
  const add=t=>{if(t>1e-9&&t<1-1e-9)ts.push(t);};
  for(const [c,e] of [...segments,...visible]){
    const f=sub(e,c),q=sub(c,a),det=cross(d,f);
    if(Math.abs(det)>1e-9){
      const t=cross(q,f)/det,u=cross(q,d)/det;
      if(u>=-1e-9&&u<=1+1e-9)add(t);
    }else if(Math.abs(cross(q,d))<1e-7){
      add(dot(q,d)/denom);add(dot(sub(e,a),d)/denom);
    }
  }
  ts.sort((x,y)=>x-y);
  const unique=ts.filter((t,i)=>i===0||t-ts[i-1]>1e-9);
  const p=t=>[a[0]+t*d[0],a[1]+t*d[1]];
  return unique.slice(1).map((t,i)=>[p(unique[i]),p(t)]).filter(e=>length(e)>1e-7);
}
const key=e=>e.map(p=>p.map(x=>Math.round(x*1e7)).join(',')).sort().join('|');
const boundary=new Map();
// Fixture-only two-sided occupancy test. No use on curves, thin features or
// arbitrary scene tolerances without additional robust geometry engineering.
for(const e of visible.flatMap(split)){
  const [a,b]=e,d=sub(b,a),l=length(e),m=[(a[0]+b[0])/2,(a[1]+b[1])/2],n=[-d[1]/l,d[0]/l];
  const side=k=>covered([m[0]+k*n[0]*1e-6,m[1]+k*n[1]*1e-6]);
  if(side(1)!==side(-1))boundary.set(key(e),e);
}
const silhouette=[...boundary.values()];
const total=silhouette.reduce((a,e)=>a+length(e),0);
assert.ok(Math.abs(total-568.2816203256974)<1e-5,'Independent OCCT/Python planar union boundary length mismatch: '+total);
const all=visible.flat(),xs=all.map(p=>p[0]),ys=all.map(p=>p[1]);
const frame={x:Math.min(...xs)-10,y:Math.min(...ys)-15,width:Math.max(...xs)-Math.min(...xs)+20,height:Math.max(...ys)-Math.min(...ys)+25,scaleDenominator:1};
const primitives=[...hidden.map(e=>['hidden',e]),...visible.map(e=>['component',e]),...silhouette.map(e=>['silhouette',e])].map(([role,e],i)=>({id:'diagnostic:'+i,role,kind:'line',start:e[0],end:e[1],source:{semanticOwner:'fixture:facade',representationId:'unbound-hlr'}}));
const scene=parseVectorScene({schemaVersion:1,viewId:'facade-hlr-proof',projection:'axonometric',pins:{buildingRevision:'unbound',documentIntentRevision:'unbound',viewDefinitionVersion:'proof',representationGrammarVersion:'proof',producerVersion:'proof'},evidence:{kind:'fixture',description:'Native HLR with fixture-defined planar faces; not for issue; no topology anchors.'},frame,primitives});
function preview(style){
  return renderVectorSvg(scene,style).replace('<svg ','<svg data-publication="blocked" ').replace('</svg>','<text x="'+(frame.x+3)+'" y="'+(frame.y+6)+'" font-size="2.5" fill="#555">NATIVE FACADE FIXTURE - NOT FOR ISSUE</text></svg>');
}
await mkdir('hlr-evidence',{recursive:true});
await writeFile('hlr-evidence/facade-visible.svg',preview(DEFAULT_VECTOR_STYLE));
await writeFile('hlr-evidence/facade-hidden.svg',preview({...DEFAULT_VECTOR_STYLE,hiddenVisible:true,pens:{...DEFAULT_VECTOR_STYLE.pens,hidden:{stroke:'#77909e',paperWidthMm:.17}},hiddenLine:{patternPaperMm:[2.5,1.25],opacity:.65,cap:'butt'}}));
await writeFile('hlr-evidence/facade-evidence.json',JSON.stringify({visible,hidden,silhouette,total,scene},null,2));
console.log('Four-solid facade: 30 visible, 33 hidden; non-convex silhouette length '+total+' mm PASS');
