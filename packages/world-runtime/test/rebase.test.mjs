import test from 'node:test';
import assert from 'node:assert/strict';
import {terrainRebaseProposal,terrainSnapshot} from '../src/rebase.mjs';
import {makeTerrainRequest} from '../../terrain-core/src/index.mjs';
import {initialState} from './fixture.mjs';

function fixture(){
  const base={branch:'main',revision:0,state:structuredClone(initialState)};
  const current=structuredClone(base);current.revision=1;current.state.terrain.revision++;
  const capability={terrainId:'terrain',allowedFeatureIds:['a','b','c','d']};
  const request=makeTerrainRequest(terrainSnapshot(base),{requestId:'original',operations:[{type:'point.replace',target:'a',values:{x:0,y:0,z:10,evidenceRefs:['source']}}]});
  return {base,current,request,capability};
}
test('changed source, topology and point membership cannot reapply',()=>{
  for(const change of [t=>{t.source.contentDigest='replacement';},t=>{t.features[0].revision++;},t=>{t.points.pop();}]){
    const f=fixture();change(f.current.state.terrain);
    assert.throws(()=>terrainRebaseProposal(f.current,f.base,f.request,f.capability),/REBASE_UNSUPPORTED/);
  }
});
test('a point edited then restored still conflicts through its revision',()=>{
  const f=fixture();f.current.state.terrain.points[0].revision=2;
  assert.throws(()=>terrainRebaseProposal(f.current,f.base,f.request,f.capability),/REBASE_CONFLICT/);
});
test('original guards and host scope are validated before reapplication',()=>{
  const f=fixture();f.request.preconditions.a=99;
  assert.throws(()=>terrainRebaseProposal(f.current,f.base,f.request,f.capability),/Terrain dependencies changed/);
  const g=fixture();g.capability.allowedFeatureIds=[];
  assert.throws(()=>terrainRebaseProposal(g.current,g.base,g.request,g.capability),/outside caller or host scope/);
});
