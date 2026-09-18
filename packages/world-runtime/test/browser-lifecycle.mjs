// node packages/world-runtime/test/browser-lifecycle.mjs <agent-browser executable>
// Disposable databases only. Tests the actual saved UI, worker, HTTP and SQLite path.
import {execFileSync,spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {openWorld} from '../src/store.mjs';
import {referenceDomains} from '../src/reference-domains.mjs';
import {createTerrainHost} from '../src/terrain-host.mjs';
import {createTerrainBridge} from '../../terrain-core/src/bridge.mjs';
import {evaluateTerrainSurface} from '../../terrain-core/src/surface.mjs';
import {makeTerrainRequest} from '../../terrain-core/src/index.mjs';

const cli=process.argv[2];
if(!cli)throw Error('Supply an agent-browser executable');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'plasma-lifecycle-browser-'));
const session='plasma-lifecycle-'+process.pid,origin='http://127.0.0.1:8083';
const url=origin+'/packages/terrain-core/demo/?durable=1',checks=[];
let server,sequence=0,filename=path.join(dir,'world.sqlite');
function run(...args) {
  const file=path.join(dir,++sequence+'.json'),fd=fs.openSync(file,'w');
  try{execFileSync(cli,['--session',session,'--json',...args],{stdio:['ignore',fd,fd],windowsHide:true,timeout:20000});}
  catch(error){throw Error('Browser command failed: '+args.join(' ')+'\n'+fs.readFileSync(file,'utf8'),{cause:error});}
  finally{fs.closeSync(fd);}
  const result=JSON.parse(fs.readFileSync(file,'utf8').trim().split('\n').findLast(s=>s.startsWith('{')));
  if(!result.success)throw Error(JSON.stringify(result.error));return result.data;
}
const value=code=>JSON.parse(run('eval','JSON.stringify('+code+')').result);
const state=()=>value(`({level:document.getElementById('level').value,point:document.getElementById('point').value,status:document.getElementById('status').textContent,revision:document.getElementById('revision').textContent,ready:!document.getElementById('preview').disabled,accept:!document.getElementById('accept').disabled})`);
async function until(fn){const end=Date.now()+15000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out waiting for lifecycle condition');}
async function start(){
  const log=fs.openSync(path.join(dir,'server.log'),'a');
  server=spawn(process.execPath,['packages/world-runtime/demo/server.mjs'],{env:{...process.env,PLASMA_DEMO_PORT:'8083',PLASMA_DEMO_DB:filename},stdio:['ignore',log,log],windowsHide:true});fs.closeSync(log);
  await until(async()=>{if(server.exitCode!==null)throw Error(fs.readFileSync(path.join(dir,'server.log'),'utf8'));try{return(await fetch(origin+'/api/world')).ok;}catch{return false;}});
}
async function stop(){if(!server)return;const child=server;server=null;await new Promise(resolve=>{child.once('exit',resolve);child.kill();});}
async function open(){run('open',url,'--init-script',path.resolve('packages/world-runtime/test/browser-worker-gate.js'));run('set','viewport','1280','900');await until(()=>state().ready);}
const saved=async()=>{const response=await fetch(origin+'/api/world');assert.equal(response.status,200);return (await response.json()).snapshot;};
const visual=()=>value(`({polygons:Array.from(document.querySelectorAll('[aria-label="accepted terrain preview"] polygon')).map(p=>[p.getAttribute('points'),p.getAttribute('fill')]),lines:Array.from(document.querySelectorAll('[aria-label="accepted terrain preview"] line')).map(p=>['x1','y1','x2','y2','stroke-dasharray'].map(k=>p.getAttribute(k))),anchors:Array.from(document.querySelectorAll('#view g[role="button"]')).map(p=>p.getAttribute('aria-label')).sort()})`);
async function check(name,fn){await fn();checks.push({name,status:'pass'});console.log('PASS '+name);}
function edit(snapshot,id,values) {
  const point=snapshot.state.terrain.points.find(p=>p.id==='p12');
  return makeTerrainRequest({branchId:'main',worldRevision:snapshot.revision,proposalRevision:null,terrain:snapshot.state.terrain},
    {requestId:id,operations:[{type:'point.replace',target:'p12',values:{x:point.x,y:point.y,z:point.z,evidenceRefs:point.evidenceRefs,...values}}]});
}
async function submit(request) {
  const {token}=await(await fetch(origin+'/api/world')).json();
  const response=await fetch(origin+'/api/terrain',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Plasma-Token':token},body:JSON.stringify(request)});
  return {status:response.status,body:await response.json()};
}
let initial,accepted,expected;
try {
  await start();await open();
  await check('saved fixture loads real geometry, boundary, breakline and 25 picking controls',async()=>{
    run('snapshot','-i');fs.mkdirSync('tmp',{recursive:true});run('screenshot',path.resolve('tmp/plasma-lifecycle-initial.png'));
    assert.deepEqual(run('errors').errors,[]);initial=await saved();
    assert.equal(initial.state.terrain.features.find(f=>f.kind==='breakline').id,'ridge');
    assert.equal(visual().anchors.length,25);assert(visual().polygons.length>0);
    assert(visual().lines.some(line=>line[4]==='7 4'));assert.equal(state().revision,'Saved revision 0');
  });
  await check('UI preview and cancellation preserve authority; two accepted edits append exactly two revisions',async()=>{
    run('fill','#level','100900');run('click','#preview');await until(()=>state().ready&&state().accept);
    assert.deepEqual(await saved(),initial);run('click','#reset');assert.equal(state().accept,false);assert.deepEqual(await saved(),initial);
    for(const [point,level,revision] of [['p12','100900',1],['p7','100700',2]]) {
      run('select','#point',point);run('fill','#level',level);run('click','#preview');await until(()=>state().ready&&state().accept);
      assert.equal((await saved()).revision,revision-1);run('click','#accept');await until(()=>state().status.startsWith('Saved revision '+revision+'.'));
      assert.equal((await saved()).revision,revision);
    }
    run('select','#point','p12');accepted=await saved();expected=visual();
    assert.deepEqual(accepted.state.terrain.points.map(p=>p.id),initial.state.terrain.points.map(p=>p.id));
  });
  await check('page lifecycle disposal removes visuals and revokes retained picking callbacks',async()=>{
    value(`(()=>{window.oldTerrainHandle=Array.from(document.querySelectorAll('#view g[role="button"]')).find(p=>p.getAttribute('aria-label').startsWith('p7 '));if(!window.oldTerrainHandle)throw Error('Missing p7 handle');window.dispatchEvent(new PageTransitionEvent('pagehide'));return true;})()`);
    assert.equal(value("document.querySelectorAll('[data-plasma-surface]').length"),0);
    value(`(()=>{window.oldTerrainHandle.dispatchEvent(new MouseEvent('click',{bubbles:true}));window.oldTerrainHandle.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));return true;})()`);
    assert.equal(state().point,'p12');assert.deepEqual(await saved(),accepted);
    assert.deepEqual(run('errors').errors,[]);
  });
  await check('cold browser and server restart rebuild identical geometry and functional picking from durable controls',async()=>{
    run('close');await stop();await start();await open();
    assert.deepEqual(await saved(),accepted);assert.deepEqual(visual(),expected);
    assert.equal(value('sessionStorage.length'),0);assert.equal(state().revision,'Saved revision 2');
    const selector='#view g[role="button"][aria-label^="p7 "]';
    run('click',selector);assert.equal(state().point,'p7');assert.equal(state().level,'100700');
    run('fill','#level','100750');run('click','#preview');await until(()=>state().ready&&state().accept);
    assert.deepEqual(await saved(),accepted);run('click','#reset');run('select','#point','p12');
    assert.deepEqual(visual(),expected);assert.deepEqual(run('errors').errors,[]);
    run('screenshot',path.resolve('tmp/plasma-lifecycle-rebuilt.png'),'--full');
  });
  await check('replay of UI-recorded commands through an authorized agent rebuilds the same browser geometry and picks',async()=>{
    run('close');await stop();
    const source=openWorld({filename,domains:{},authorize:()=>null});
    let events;try{events=[source.snapshot('main',1).event,source.snapshot('main',2).event];}finally{source.close();}
    filename=path.join(dir,'replay.sqlite');
    const world=openWorld({filename,initialState:initial.state,domains:referenceDomains,authorize:actor=>actor.id==='agent'?{terrainId:'terrain',allowedFeatureIds:initial.state.terrain.points.map(p=>p.id)}:null});
    try {
      const bridge=createTerrainBridge({host:createTerrainHost(world,{id:'agent'}),actor:{id:'agent'},sessionId:'replay',evaluate:async terrain=>evaluateTerrainSurface(terrain)});
      for(const [i,event] of events.entries()) {
        const preview=await bridge.preview(event.request.payload,i+1);await bridge.commit(preview.previewId);
      }
      assert.deepEqual(world.snapshot().state,accepted.state);
      assert.deepEqual(world.snapshot().representations,accepted.representations);
    }finally{world.close();}
    await start();await open();assert.equal(state().revision,'Saved revision 2');assert.deepEqual(visual(),expected);
    run('click','#view g[role="button"][aria-label^="p7 "]');assert.equal(state().point,'p7');assert.equal(state().level,'100700');
    assert.deepEqual(run('errors').errors,[]);
  });
  await check('invalid UI, HTTP and agent edits reject duplicate XY controls without changing saved state or picking',async()=>{
    run('click','#reset');run('select','#point','p12');const before=await saved(),geometry=visual();
    run('fill','#coordinate-x','4000');run('click','#preview');
    await until(()=>state().status.includes('Duplicate XY observations'));
    assert.equal(state().accept,false);assert.deepEqual(await saved(),before);assert.deepEqual(visual(),geometry);
    const invalid=edit(before,'invalid-browser-agent',{x:4000});
    assert.deepEqual(await submit(invalid),{status:422,body:{error:'SOURCE_CONFLICT'}});
    assert.deepEqual(await saved(),before);
    assert.equal((await(await fetch(origin+'/api/receipt?id='+invalid.requestId)).json()).receipt,null);
    const world=openWorld({filename,domains:referenceDomains,authorize:actor=>actor.id==='agent'?{terrainId:'terrain',allowedFeatureIds:before.state.terrain.points.map(p=>p.id)}:null});
    try {
      const bridge=createTerrainBridge({host:createTerrainHost(world,{id:'agent'}),actor:{id:'agent'},sessionId:'invalid',evaluate:async terrain=>evaluateTerrainSurface(terrain)});
      await assert.rejects(()=>bridge.preview(invalid,1),{code:'SOURCE_CONFLICT'});
      assert.deepEqual(world.snapshot(),before);
      assert.throws(()=>world.snapshot('main',before.revision+1),{code:'REVISION_NOT_FOUND'});
    }finally{world.close();}
    run('click','#reset');run('click','#view g[role="button"][aria-label^="p7 "]');
    assert.equal(state().point,'p7');assert.equal(state().level,'100700');run('select','#point','p12');
    assert.deepEqual(visual(),geometry);assert.deepEqual(run('errors').errors,[]);
  });
  await check('obsolete real worker output cannot replace a newer saved revision, geometry or picking',async()=>{
    run('click','#reset');
    const before=await saved();
    value(`(()=>{window.terrainWorkerGate.armed=true;return true;})()`);
    const point=value(`(()=>{const r=document.querySelector('[data-selected="true"] circle').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    run('mouse','move',String(Math.round(point.x)),String(Math.round(point.y)));run('mouse','down');
    run('mouse','move',String(Math.round(point.x+24)),String(Math.round(point.y-15)));run('mouse','up');
    await until(()=>value('!!window.terrainWorkerGate.held'));
    assert.equal(value('window.terrainWorkerGate.held.status'),'ready');
    const heldJob=value('window.terrainWorkerGate.held.jobId');
    assert.deepEqual(await saved(),before);
    const next=await submit(edit(before,'newer-during-worker',{z:101100}));assert.equal(next.status,200);
    const newer=await saved();assert.equal(newer.revision,before.revision+1);
    // Reload closes the obsolete gesture before queuing fresh worker evaluation.
    // Observe all subsequent DOM changes so even a transient old preview fails.
    run('click','#reload');
    value(`(()=>{window.staleFrames=[];window.lifecycleObserver=new MutationObserver(()=>{window.staleFrames.push({candidate:!!document.querySelector('[aria-label="candidate terrain preview"]'),anchors:Array.from(document.querySelectorAll('#view g[role="button"]')).map(p=>p.getAttribute('aria-label'))});});window.lifecycleObserver.observe(document.getElementById('view'),{childList:true,subtree:true,attributes:true});window.terrainWorkerGate.release();return true;})()`);
    await until(()=>state().status.startsWith('Loaded saved revision '+newer.revision));
    assert(value('window.terrainWorkerGate.delivered').includes(heldJob));
    assert.equal(state().level,'101100');assert.equal(state().accept,false);assert.deepEqual(await saved(),newer);
    const frames=value('window.staleFrames');assert(frames.length>0);assert(frames.every(frame=>!frame.candidate));
    const newGeometry=visual();
    const oldLabel=before.state.terrain.points.find(p=>p.id==='p12');
    assert(frames.every(frame=>frame.anchors.some(label=>label.startsWith('p12 ')&&(label.includes('101100')||label.includes(String(oldLabel.z))))));
    value('(()=>{window.lifecycleObserver.disconnect();return true;})()');
    run('click','#view g[role="button"][aria-label^="p12 "]');assert.equal(state().level,'101100');
    // A fresh page is an independent reconstruction oracle for displayed geometry.
    await open();assert.deepEqual(visual(),newGeometry);assert.deepEqual(await saved(),newer);
    assert.equal(state().level,'101100');assert.deepEqual(run('errors').errors,[]);
  });
  const files=['packages/world-runtime/test/browser-lifecycle.mjs','packages/world-runtime/demo/server.mjs','packages/world-runtime/src/store.mjs','packages/world-runtime/src/execution.mjs','packages/world-runtime/src/reference-domains.mjs','packages/world-runtime/src/terrain-host.mjs','packages/world-runtime/src/gateway-host.mjs','packages/kernel-gateway/src/index.mjs','packages/terrain-core/demo/app.mjs','packages/terrain-core/demo/persistence.mjs','packages/terrain-core/demo/fixture.mjs','packages/terrain-core/src/bridge.mjs','packages/terrain-core/src/surface.mjs','packages/terrain-core/src/surface-worker.mjs','packages/terrain-core/src/worker-client.mjs','packages/terrain-core/src/svg-terrain.mjs','packages/terrain-core/src/presentation-consumer.mjs'];
  files.push('packages/world-runtime/test/browser-worker-gate.js','packages/terrain-core/src/index.mjs');
  const source_digests=Object.fromEntries(files.map(file=>[file,createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
  fs.writeFileSync('packages/world-runtime/evidence/browser-lifecycle.json',JSON.stringify({date:new Date().toISOString(),node:process.version,platform:process.platform,status:'passed',checks,comparison:'Exact semantic state, deterministic surface data and SVG geometry/anchor labels at 1280x900',source_digests,limits:['Synthetic desktop fixture; no physical-device or production qualification.','Pagehide is dispatched explicitly to observe cleanup; then the browser and server are closed and restarted.','Test init script holds one actual worker response; release follows a competing HTTP commit and explicit Reload saved. No fabricated evaluator outputs.']},null,2)+'\n');
}finally{try{run('close');}catch{}await stop();fs.rmSync(dir,{recursive:true,force:true});}
