import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {openWorld,restoreWorld} from '../src/store.mjs';
import {referenceDomains} from '../src/reference-domains.mjs';
import {initialState,authorize,wallRequest} from './fixture.mjs';
import {PlasmaKernel} from '../../../docs/plasma/v0.5/reference-runtime/plasma-kernel-v0.1.mjs';
import {makeTerrainRequest} from '../../terrain-core/src/index.mjs';
import {createTerrainBridge} from '../../terrain-core/src/bridge.mjs';
import {evaluateTerrainSurface} from '../../terrain-core/src/surface.mjs';
import {createTerrainHost} from '../src/terrain-host.mjs';

function setup(t, options={}) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'plasma-world-'));
  const filename=path.join(dir,'world.sqlite');
  const opened=[];
  const open=(extra={})=>{const w=openWorld({filename,initialState,domains:referenceDomains,authorize,...options,...extra});opened.push(w);return w;};
  t.after(()=>{for(const w of opened)try{w.close();}catch{}fs.rmSync(dir,{recursive:true,force:true});});
  return {filename,open};
}
const wallWidth = s => s.state.wall.states.find(x=>x.id===s.state.wall.world.state_refs.C04).values.width_mm;
function prepared() {
  const kernel=new PlasmaKernel(initialState.wall),tx=kernel.beginTransaction({actor:{id:'human'}});
  kernel.declare(tx,{id:'move',type:'MoveBoundary',targets:['W17'],inputs:{delta_mm:150},evidence_refs:[]});
  kernel.preview(tx);return {kernel,tx};
}
test('wall rejects post-validation candidate, evidence, status and transform tampering',()=>{
  for(const mutate of [tx=>tx.candidate.candidate_states[tx.candidate.state_refs.C04].values.width_mm=1,
    tx=>tx.invariant_results=[],tx=>tx.status='approved_with_warning',tx=>tx.transforms[0].inputs.delta_mm=500]){
    const {kernel,tx}=prepared();mutate(tx);
    assert.throws(()=>kernel.commit(tx),{code:'CANDIDATE_CHANGED'});assert.equal(kernel.headRevision,'R0');
  }
});
test('wall maps and snapshots are detached; forged transactions are rejected',()=>{
  const {kernel,tx}=prepared();kernel.states.clear();kernel.invariants.clear();kernel.branch.head_revision_id='evil';kernel.events.push({});
  assert.throws(()=>kernel.commit(structuredClone(tx)),{code:'TX_IDENTITY'});
  kernel.commit(tx);assert.equal(kernel.stateFor('C04').values.width_mm,1000);
});
test('preview recomputes scope and candidate instead of trusting injected caches',()=>{
  const {kernel,tx}=prepared();tx.transforms[0].inputs.delta_mm=500;tx.affected_set=[];tx.invariant_results=[];
  kernel.preview(tx);assert.throws(()=>kernel.commit(tx),{code:'HARD_INVARIANT_FAILED'});
});
test('wall and terrain publish through one durable head with lineage, representations and retry receipts',t=>{
  const f=setup(t),w=f.open(),s=w.session({id:'human'});
  const preview=s.preview(wallRequest());preview.state.wall.states.length=0;
  s.submit(wallRequest());assert.equal(wallWidth(w.snapshot()),1050);
  const snap=w.snapshot();
  const request=makeTerrainRequest({branchId:'main',worldRevision:snap.revision,proposalRevision:null,terrain:snap.state.terrain},
    {requestId:'terrain-1',operations:[{type:'point.replace',target:'a',values:{x:0,y:0,z:10,evidenceRefs:['source']}}]});
  const envelope={branch:'main',domain:'terrain',requestId:'terrain-1',baseRevision:1,payload:request};
  const receipt=s.submit(envelope);assert.equal(receipt.worldRevision,2);
  const accepted=w.snapshot();assert.equal(wallWidth(accepted),1050);assert.equal(accepted.state.terrain.points[0].z,10);
  assert.equal(accepted.event.parent,1);assert.equal(accepted.evidence.length,1);assert.equal(accepted.representations.length,1);
  w.close();const reopened=f.open();assert.deepEqual(reopened.snapshot(),accepted);
  assert.deepEqual(reopened.session({id:'human'}).submit(envelope),receipt);
  assert.equal(reopened.snapshot('main',0).state.terrain.points[0].z,0);
});
test('hard invariant, stale head, unknown branch and altered retry cannot publish',t=>{
  const w=setup(t).open(),s=w.session({id:'human'});
  assert.throws(()=>s.submit(wallRequest(0,500)),{code:'HARD_INVARIANT_FAILED'});assert.equal(w.snapshot().revision,0);
  s.submit(wallRequest());assert.throws(()=>s.submit(wallRequest(0,20,'other')),{code:'STALE_READ'});
  assert.throws(()=>s.submit(wallRequest(0,20)),{code:'REQUEST_ID_REUSED'});
  assert.throws(()=>s.submit({...wallRequest(1),branch:'missing'}),{code:'REVISION_NOT_FOUND'});
  assert.equal(w.snapshot().revision,1);
});
test('authorization revoked after preview blocks commit and receipt replay',t=>{
  let allowed=true;const w=setup(t,{authorize:actor=>allowed?authorize(actor):null}).open(),s=w.session({id:'human'});
  s.preview(wallRequest());allowed=false;assert.throws(()=>s.submit(wallRequest()),{code:'DENIED'});
  allowed=true;s.submit(wallRequest());allowed=false;assert.throws(()=>s.submit(wallRequest()),{code:'DENIED'});
});
test('human and agent follow the same hard gate; undo appends without deleting history',t=>{
  const w=setup(t).open(),s=w.session({id:'agent'});
  assert.throws(()=>s.submit(wallRequest(0,500)),{code:'HARD_INVARIANT_FAILED'});
  s.submit(wallRequest());s.submit(wallRequest(1,-100,'undo'));
  assert.equal(wallWidth(w.snapshot()),1150);assert.equal(wallWidth(w.snapshot('main',1)),1050);
  assert.equal(w.snapshot().parent,1);
});
test('two connections cannot accept proposals against the same head',t=>{
  const f=setup(t),a=f.open(),b=f.open();const request=wallRequest();
  a.session({id:'human'}).preview(request);b.session({id:'agent'}).preview(request);
  a.session({id:'human'}).submit(request);
  assert.throws(()=>b.session({id:'agent'}).submit(request),{code:'STALE_READ'});
});
for(const stage of ['before-write','after-revision','before-commit','after-commit']) {
  test('process interruption at '+stage+' reopens a coherent revision and reconciles retry',t=>{
    const f=setup(t);const seed=f.open();seed.close();
    const child=spawnSync(process.execPath,[fileURLToPath(new URL('./crash-child.mjs',import.meta.url)),f.filename,stage],{encoding:'utf8',timeout:15000,windowsHide:true});
    assert.equal(child.status,73,child.stderr);
    const w=f.open(),committed=stage==='after-commit';assert.equal(w.snapshot().revision,committed?1:0);
    assert.equal(w.snapshot().event===null,!committed);
    assert.equal(w.session({id:'human'}).submit(wallRequest()).worldRevision,1);
    assert.equal(w.snapshot().revision,1);assert.equal(wallWidth(w.snapshot()),1050);
  });
}
test('exception during publication rolls back revision, head and receipt together',t=>{
  let fail=true;const w=setup(t,{fault:stage=>{if(fail&&stage==='before-commit')throw new Error('disk failure');}}).open();
  assert.throws(()=>w.session({id:'human'}).submit(wallRequest()),/disk failure/);assert.equal(w.snapshot().revision,0);
  assert.throws(()=>w.snapshot('main',1),{code:'REVISION_NOT_FOUND'});
  fail=false;assert.equal(w.session({id:'human'}).submit(wallRequest()).worldRevision,1);
});
test('missing hard evidence fails closed even from a registered evaluator',t=>{
  const w=setup(t,{domains:{bad:{version:'bad/1',evaluate:()=>({status:'pass',state:initialState,evidence:[],representations:[]})}}}).open();
  assert.throws(()=>w.session({id:'human'}).submit({...wallRequest(),domain:'bad'}),{code:'HARD_INVARIANT_FAILED'});
});
test('corrupt semantic bytes are detected on reopen without silently resetting the world',t=>{
  const f=setup(t),w=f.open();w.session({id:'human'}).submit(wallRequest());w.close();
  const db=new DatabaseSync(f.filename);db.prepare('UPDATE revisions SET body=? WHERE id=1').run('{"state":{}}');db.close();
  assert.throws(()=>f.open(),{code:'CORRUPT_REVISION'});
});
test('existing terrain bridge uses durable shared runtime and reconciles identical receipts',async t=>{
  const f=setup(t),w=f.open(),host=createTerrainHost(w,{id:'human'});
  const bridge=createTerrainBridge({host,actor:{id:'human'},sessionId:'durable',evaluate:async terrain=>evaluateTerrainSurface(terrain)});
  const request=makeTerrainRequest(await host.readSnapshot(),{requestId:'bridge-edit',operations:[{type:'point.replace',target:'a',values:{x:0,y:0,z:20,evidenceRefs:['source']}}]});
  const preview=await bridge.preview(request,1);preview.candidate.candidate.points[0].z=999;
  const receipt=await bridge.commit(preview.previewId);
  assert.deepEqual(await bridge.commit(preview.previewId),receipt);
  w.close();const reopened=f.open();assert.equal(reopened.snapshot().state.terrain.points[0].z,20);
  assert.equal(wallWidth(reopened.snapshot()),1150);
});
test('wall commit invalidates a terrain bridge proposal against the same shared head',async t=>{
  const w=setup(t).open(),host=createTerrainHost(w,{id:'human'});
  const bridge=createTerrainBridge({host,actor:{id:'human'},sessionId:'stale',evaluate:async terrain=>evaluateTerrainSurface(terrain)});
  const request=makeTerrainRequest(await host.readSnapshot(),{requestId:'stale-terrain',operations:[{type:'point.replace',target:'a',values:{x:0,y:0,z:20,evidenceRefs:['source']}}]});
  const preview=await bridge.preview(request,1);w.session({id:'human'}).submit(wallRequest());
  await assert.rejects(()=>bridge.commit(preview.previewId),{code:'STALE_READ'});
  assert.equal(w.snapshot().state.terrain.points[0].z,0);
});
test('verified backup restores history and retry ledger into a new database',t=>{
  const f=setup(t),w=f.open(),backup=f.filename+'.backup',restored=f.filename+'.restored';
  const receipt=w.session({id:'human'}).submit(wallRequest());assert.deepEqual(w.backup(backup),{revision:1});
  w.session({id:'human'}).submit(wallRequest(1,-100,'undo'));
  assert.deepEqual(restoreWorld({backupFilename:backup,filename:restored,domains:referenceDomains,authorize}),{revision:1});
  const copy=openWorld({filename:restored,domains:referenceDomains,authorize});
  try{assert.equal(wallWidth(copy.snapshot()),1050);assert.equal(copy.snapshot('main',0).revision,0);assert.deepEqual(copy.session({id:'human'}).submit(wallRequest()),receipt);}finally{copy.close();}
  assert.equal(w.snapshot().revision,2);
});
test('backup and restore never replace an existing destination',t=>{
  const f=setup(t),w=f.open(),backup=f.filename+'.backup';fs.writeFileSync(backup,'');
  assert.throws(()=>w.backup(backup),{code:'EEXIST'});assert.equal(fs.readFileSync(backup,'utf8'),'');
  assert.throws(()=>restoreWorld({backupFilename:f.filename,filename:backup,domains:referenceDomains,authorize}),{code:'EEXIST'});
});
test('corrupt recovery copy is rejected and original files remain intact',t=>{
  const f=setup(t),w=f.open(),backup=f.filename+'.backup',restored=f.filename+'.restored';w.backup(backup);
  const db=new DatabaseSync(backup);db.prepare('UPDATE revisions SET body=? WHERE id=0').run('{"state":{}}');db.close();
  assert.throws(()=>restoreWorld({backupFilename:backup,filename:restored,domains:referenceDomains,authorize}),{code:'CORRUPT_REVISION'});
  assert.equal(fs.existsSync(restored),false);assert.equal(fs.existsSync(backup),true);assert.equal(w.snapshot().revision,0);
});
