import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {openWorld} from '../src/store.mjs';
import {referenceDomains} from '../src/reference-domains.mjs';
import {createTerrainHost} from '../src/terrain-host.mjs';
import {initialState, authorize} from './fixture.mjs';
import {createTerrainBridge} from '../../terrain-core/src/bridge.mjs';
import {makeTerrainRequest} from '../../terrain-core/src/index.mjs';
import {evaluateTerrainSurface, validateTerrainSurface} from '../../terrain-core/src/surface.mjs';

function fixture(t) {
  const dir=mkdtempSync(join(tmpdir(),'plasma-lifecycle-')), worlds=[];
  t.after(()=>{for(const world of worlds)try{world.close();}catch{}rmSync(dir,{recursive:true,force:true});});
  return {dir, open(name) {
    const world=openWorld({filename:join(dir,name),initialState,domains:referenceDomains,authorize});
    worlds.push(world);return world;
  }};
}
const bridgeFor=(world,id='human',evaluate=async terrain=>evaluateTerrainSurface(terrain))=>
  createTerrainBridge({host:createTerrainHost(world,{id}),actor:{id},sessionId:'lifecycle:'+id,evaluate});
function request(world,id,z,target='a') {
  const s=world.snapshot(),point=s.state.terrain.points.find(p=>p.id===target);
  return makeTerrainRequest({branchId:s.branch,worldRevision:s.revision,proposalRevision:null,terrain:s.state.terrain},
    {requestId:id,operations:[{type:'point.replace',target,values:{x:point.x,y:point.y,z,evidenceRefs:point.evidenceRefs}}]});
}
async function accept(bridge,proposal,sequence) {
  const preview=await bridge.preview(proposal,sequence);
  assert.equal(preview.status,'ready');return bridge.commit(preview.previewId);
}
function rebuild(terrain) {
  const surface=evaluateTerrainSurface(structuredClone(terrain));
  validateTerrainSurface(terrain,surface);return surface;
}

test('terrain lifecycle: preview/cancel and invalid edits leave durable authority untouched',async t=>{
  const world=fixture(t).open('cancel.sqlite'),before=world.snapshot(),bridge=bridgeFor(world);
  const preview=await bridge.preview(request(world,'cancel',10),1);
  assert.equal(preview.status,'ready');assert.deepEqual(world.snapshot(),before);
  bridge.cancel();await assert.rejects(()=>bridge.commit(preview.previewId),{code:'SESSION_CLOSED'});
  const invalid=request(world,'invalid',20);invalid.operations[0].values.x=100;
  await assert.rejects(()=>bridgeFor(world).preview(invalid,1),error=>typeof error.code==='string');
  assert.deepEqual(world.snapshot(),before);
  assert.throws(()=>world.snapshot('main',1),{code:'REVISION_NOT_FOUND'});
});

test('terrain lifecycle: persisted controls rebuild in a fresh process and recorded edits replay into a new database',async t=>{
  const f=fixture(t),world=f.open('original.sqlite'),bridge=bridgeFor(world);
  await accept(bridge,request(world,'edit-1',10),1);
  await accept(bridge,request(world,'edit-2',25,'c'),2);
  const accepted=world.snapshot(),events=[world.snapshot('main',1).event,accepted.event];
  const expected=rebuild(accepted.state.terrain);
  assert.deepEqual(expected,accepted.representations.find(r=>r.domain==='terrain').surface);
  world.close();
  // The child starts without renderer/worker caches and deliberately never reads
  // persisted representations as input to the real terrain evaluator.
  const moduleUrl=relative=>new URL(relative,import.meta.url).href;
  const child=spawnSync(process.execPath,['--input-type=module','-e',`
    import {openWorld} from ${JSON.stringify(moduleUrl('../src/store.mjs'))};
    import {evaluateTerrainSurface,validateTerrainSurface} from ${JSON.stringify(moduleUrl('../../terrain-core/src/surface.mjs'))};
    const world=openWorld({filename:process.argv[1],domains:{},authorize:()=>null});
    try {const saved=world.snapshot(),terrain=saved.state.terrain;
      const surface=evaluateTerrainSurface(terrain);validateTerrainSurface(terrain,surface);
      console.log(JSON.stringify({revision:saved.revision,state:saved.state,surface}));
    } finally {world.close();}
  `,join(f.dir,'original.sqlite')],{encoding:'utf8',timeout:15000,windowsHide:true});
  assert.equal(child.status,0,child.stderr);
  const cold=JSON.parse(child.stdout);
  assert.equal(cold.revision,2);assert.deepEqual(cold.state,accepted.state);assert.deepEqual(cold.surface,expected);
  const replay=f.open('replay.sqlite'),replayBridge=bridgeFor(replay);
  for(const [i,event] of events.entries())await accept(replayBridge,event.request.payload,i+1);
  assert.equal(replay.snapshot().revision,2);
  assert.deepEqual(replay.snapshot().state,accepted.state);
  assert.deepEqual(rebuild(replay.snapshot().state.terrain),expected);
  assert.deepEqual(replay.snapshot().state.terrain.points.map(p=>p.id),initialState.terrain.points.map(p=>p.id));
});

test('terrain lifecycle: human and authorized agent use the same gateway and validation path',async t=>{
  const f=fixture(t),human=f.open('human.sqlite'),agent=f.open('agent.sqlite');
  for(const [world,id] of [[human,'human'],[agent,'agent']]) {
    await accept(bridgeFor(world,id),request(world,'equivalent',15),1);
    assert.equal(world.snapshot().event.provenance.proposalId,'terrain:equivalent');
    const invalid=request(world,'bad',20);invalid.operations[0].values.x=100;
    await assert.rejects(()=>bridgeFor(world,id).preview(invalid,1));
    assert.equal(world.snapshot().revision,1);
  }
  assert.deepEqual(human.snapshot().state,agent.snapshot().state);
  assert.deepEqual(human.snapshot().representations,agent.snapshot().representations);
});

test('terrain lifecycle: a delayed real evaluation cannot publish after a newer durable edit',async t=>{
  const world=fixture(t).open('late.sqlite');
  let release,entered;
  const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
  const old=bridgeFor(world,'human',async terrain=>{entered();await gate;return evaluateTerrainSurface(terrain);});
  const pending=old.preview(request(world,'old',10),1);
  const rejected=assert.rejects(()=>pending,{code:'STALE_READ'});
  await started;
  try {await accept(bridgeFor(world),request(world,'new',30),1);} finally {release();}
  await rejected;
  assert.equal(old.state().readyPreviewId,null);
  assert.equal(world.snapshot().revision,1);assert.equal(world.snapshot().state.terrain.points[0].z,30);
  assert.deepEqual(rebuild(world.snapshot().state.terrain),world.snapshot().representations[0].surface);
});
