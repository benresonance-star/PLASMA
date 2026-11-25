// Isolated binding proof: no production route, topology persistence or publication claim.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadOcjs } from '../services/geometry-occt/dist/occt-js.js';
import { parseVectorScene, renderVectorSvg, DEFAULT_VECTOR_STYLE } from '../packages/representation-core/dist/index.js';

const oc = await loadOcjs();
// This short-lived process owns all WASM allocations. Do not copy its lifecycle
// into the long-running geometry service before explicit handle-lifetime tests.
const shape = new oc.BRepPrimAPI_MakeBox_2(120,80,45).Shape();
const algo = new oc.HLRBRep_Algo_1();
const handle = new oc.Handle_HLRBRep_Algo_2(algo);
const axes = new oc.gp_Ax2_2(new oc.gp_Pnt_3(0,0,0),new oc.gp_Dir_4(1,1,1),new oc.gp_Dir_4(1,-1,0));
const projector = new oc.HLRAlgo_Projector_2(axes);
algo.Add_2(shape,0);
algo.Projector_1(projector);
algo.Update();
algo.Hide_1();
const result = new oc.HLRBRep_HLRToShape(handle);

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
const visible=lines(result.VCompound_1()), hidden=lines(result.HCompound_1());
assert.equal(visible.length,9);
assert.equal(hidden.length,3);
// Independently checked against OCCT reference prism. Verify extents and segment length
// conservation against projected 3D box edges; never infer hidden status from a mesh.
const x=visible.flat().map(p=>p[0]),y=visible.flat().map(p=>p[1]);
assert.ok(Math.abs(Math.max(...x)-Math.min(...x)-200/Math.sqrt(2))<1e-7);
assert.ok(Math.abs(Math.max(...y)-Math.min(...y)-290/Math.sqrt(6))<1e-7);
const length = e => Math.hypot(e[1][0]-e[0][0],e[1][1]-e[0][1]);
assert.ok(Math.abs([...visible,...hidden].reduce((a,e)=>a+length(e),0)-4*245*Math.sqrt(2/3))<1e-7);
const primitives=[...hidden.map((e,i)=>({id:'diagnostic-hidden-'+i,role:'hidden',kind:'line',start:e[0],end:e[1],source:{semanticOwner:'fixture:box',representationId:'unbound-hlr'}})),
  ...visible.map((e,i)=>({id:'diagnostic-visible-'+i,role:'component',kind:'line',start:e[0],end:e[1],source:{semanticOwner:'fixture:box',representationId:'unbound-hlr'}}))];
const scene=parseVectorScene({schemaVersion:1,viewId:'occt-hlr-binding-proof',projection:'axonometric',
  pins:{buildingRevision:'unbound-diagnostic',documentIntentRevision:'unbound-diagnostic',viewDefinitionVersion:'proof',representationGrammarVersion:'proof',producerVersion:'proof'},
  evidence:{kind:'fixture',description:'Actual native OCCT HLR box fixture. Diagnostic only; topology anchors and publication not established.'},
  frame:{x:Math.min(...x)-8,y:Math.min(...y)-8,width:Math.max(...x)-Math.min(...x)+16,height:Math.max(...y)-Math.min(...y)+16,scaleDenominator:1},primitives});
function preview(style) {
  const svg=renderVectorSvg(scene,style);
  return svg.replace('<svg ','<svg data-publication="blocked" ').replace('</svg>','<text x="'+(scene.frame.x+2)+'" y="'+(scene.frame.y+4)+'" font-size="2.5" fill="#555555">NATIVE HLR BINDING PROOF - NOT FOR ISSUE</text></svg>');
}
await mkdir('hlr-evidence',{recursive:true});
await writeFile('hlr-evidence/visible-only.svg',preview(DEFAULT_VECTOR_STYLE));
await writeFile('hlr-evidence/hidden-dashed.svg',preview({...DEFAULT_VECTOR_STYLE,hiddenVisible:true,hiddenLine:{patternPaperMm:[3,1.5],opacity:0.65,cap:'butt'}}));
await writeFile('hlr-evidence/native-hlr.json',JSON.stringify({visible,hidden,scene},null,2));
console.log('Native HLR binding proof: 9 visible, 3 hidden, orthographic extents and projected lengths PASS');
