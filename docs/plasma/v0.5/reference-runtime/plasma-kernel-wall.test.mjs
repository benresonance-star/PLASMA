import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PlasmaKernel, KernelError} from './plasma-kernel-v0.1.mjs';
const fixture=JSON.parse(fs.readFileSync(new URL('./PLS-KERNEL-01_WALL_FIXTURE.json', import.meta.url),'utf8'));
const actor={type:'human',id:'Ben'};
const makeMove=(delta,id='T-MOVE')=>({id,type:'MoveBoundary',actor,targets:['W17'],inputs:{delta_mm:delta},preconditions:[],operations:[],declared_effects:['W17','B03','C04'],rationale:'Increase bedroom width',evidence_refs:['EV-BRIEF-BEDROOM'],mode:'preview',reversibility:'reversible'});

// 1 hard-conflict preview preserves requested state but does not mutate accepted world
{
 const k=new PlasmaKernel(fixture); const tx=k.beginTransaction({actor}); k.declare(tx,makeMove(500));
 const p=k.preview(tx);
 assert.equal(p.status,'conflicted');
 assert.equal(p.candidate.candidate_states[p.candidate.state_refs.C04].values.width_mm,650);
 assert.equal(k.stateFor('C04').values.width_mm,1150);
 assert.equal(p.conflicts[0].alternatives[0].inputs.delta_mm,150);
 assert.equal(k.headRevision,'R0');
}

// 2 exact hard-limit move commits atomically and all three authoritative states advance together
{
 const k=new PlasmaKernel(fixture); const tx=k.beginTransaction({actor}); k.declare(tx,makeMove(150,'T-LIMIT'));
 k.preview(tx); const out=k.commit(tx);
 assert.equal(out.revision.revision_id,'R1');
 assert.equal(k.stateFor('C04').values.width_mm,1000);
 assert.equal(k.stateFor('B03').values.width_mm,3650);
 assert.equal(k.stateFor('W17').values.offset_mm,150);
 assert.equal(out.event.outcome,'committed');
 assert.deepEqual(out.event.transform_refs,['T-LIMIT']);
}

// 3 stale-base optimistic concurrency rejects a second transaction
{
 const k=new PlasmaKernel(fixture);
 const txA=k.beginTransaction({actor}); k.declare(txA,makeMove(100,'T-A')); k.preview(txA);
 const txB=k.beginTransaction({actor,base_revision:'R0'}); k.declare(txB,makeMove(50,'T-B')); k.preview(txB);
 k.commit(txA);
 assert.throws(()=>k.commit(txB), e=>e instanceof KernelError && e.code==='REVISION_CONFLICT');
}

// 4 branch isolation: branch from R0 remains on R0 after main advances
{
 const k=new PlasmaKernel(fixture); const b=k.forkBranch({source_revision_id:'R0',id:'branch-option-a',name:'Option A',intent:'Alternative'});
 const tx=k.beginTransaction({actor}); k.declare(tx,makeMove(100,'T-MAIN')); k.preview(tx); k.commit(tx);
 assert.equal(k.branches.get('branch-option-a').head_revision_id,'R0');
 assert.equal(k.headRevision,'R1');
}

// 5 undo is another transform, not history deletion
{
 const k=new PlasmaKernel(fixture); const t=makeMove(100,'T-DO'); const tx=k.beginTransaction({actor}); k.declare(tx,t); k.preview(tx); k.commit(tx);
 const inv=k.inverseTransform(t); const undo=k.beginTransaction({actor}); k.declare(undo,inv); k.preview(undo); k.commit(undo);
 assert.equal(k.headRevision,'R2');
 assert.equal(k.stateFor('C04').values.width_mm,1150);
 assert.equal(k.stateFor('B03').values.width_mm,3500);
 assert.equal(k.events.filter(e=>e.outcome==='committed').length,2);
}

console.log(JSON.stringify({suite:'PLS-KERNEL-01 wall reference',status:'pass',tests:5},null,2));