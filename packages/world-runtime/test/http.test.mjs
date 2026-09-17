import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createSavedDemo} from '../demo/server.mjs';
import {makeTerrainRequest} from '../../terrain-core/src/index.mjs';
import {createPersistenceClient} from '../../terrain-core/demo/persistence.mjs';

async function setup(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'plasma-http-')),filename=path.join(dir,'world.sqlite'),apps=[];
  const start=async()=>{const app=await createSavedDemo({filename,port:0});apps.push(app);return app;};
  t.after(async()=>{for(const app of apps)try{await app.close();}catch{}fs.rmSync(dir,{recursive:true,force:true});});
  return {start};
}
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
const request=s=>makeTerrainRequest(s,{requestId:'http-test',operations:[{type:'point.replace',target:'p12',values:{x:8000,y:8000,z:100900,evidenceRefs:['synthetic-fixture']}}]});
function client(app,store=storage(),loseResponse=()=>false){return createPersistenceClient({storage:store,fetcher:async(url,options={})=>{
  const response=await fetch(app.origin+url,{...options,headers:{...options.headers,...(options.method==='POST'?{Origin:app.origin}:{})}});
  if(options.method==='POST'&&loseResponse())throw Error('Lost save response');return response;
}});}

const edit=(s,id,target,z)=>{const p=s.terrain.points.find(p=>p.id===target);return makeTerrainRequest(s,{requestId:id,operations:[{type:'point.replace',target,values:{x:p.x,y:p.y,z,evidenceRefs:p.evidenceRefs}}]});};
test('explicit reapplication previews disjoint edits and publishes only after acceptance',async t=>{
  const app=await(await setup(t)).start(),a=client(app),b=client(app),base=await a.load();await b.load();
  await a.save(edit(base,'other-point','p11',101000));
  const original=edit(base,'my-point','p12',101200);
  await assert.rejects(()=>b.save(original),/STALE_READ/);
  const preview=await b.rebase();
  assert.deepEqual(b.pending(),original);assert.equal(preview.snapshot.worldRevision,1);
  assert.notEqual(preview.request.requestId,original.requestId);assert.equal(preview.request.baseWorldRevision,1);
  assert.equal((await a.load()).worldRevision,1);
  b.replacePending(original,preview.request);
  const accepted=await b.save(preview.request);
  assert.equal(accepted.worldRevision,2);
  assert.equal(accepted.terrain.points.find(p=>p.id==='p11').z,101000);
  assert.equal(accepted.terrain.points.find(p=>p.id==='p12').z,101200);
});
test('same-point conflicts report IDs and retain the exact original pending request',async t=>{
  const app=await(await setup(t)).start(),a=client(app),b=client(app),base=await a.load();await b.load();
  await a.save(edit(base,'other','p12',101000));
  const original=edit(base,'mine','p12',101200);await assert.rejects(()=>b.save(original),/STALE_READ/);
  await assert.rejects(()=>b.rebase(),error=>error.message==='REBASE_CONFLICT'&&error.conflicts.join(',')==='p12');
  assert.deepEqual(b.pending(),original);assert.equal((await a.load()).worldRevision,1);
});
test('another save after reapplication still rejects stale acceptance',async t=>{
  const app=await(await setup(t)).start(),a=client(app),b=client(app),base=await a.load();await b.load();
  const first=await a.save(edit(base,'first','p11',101000)),original=edit(base,'mine','p12',101200);
  await assert.rejects(()=>b.save(original));const proposal=await b.rebase();b.replacePending(original,proposal.request);
  await a.save(edit(first,'second','p13',101100));
  await assert.rejects(()=>b.save(proposal.request),/STALE_READ/);assert.deepEqual(b.pending(),proposal.request);
  assert.equal((await a.load()).worldRevision,2);
});
test('a lost accepted response cannot be reapplied as a duplicate edit',async t=>{
  const app=await(await setup(t)).start(),store=storage(),c=client(app,store,()=>true),base=await c.load();
  await assert.rejects(()=>c.save(edit(base,'lost','p12',101200)),/Lost save response/);
  const retry=client(app,store);await assert.rejects(()=>retry.rebase(),/ALREADY_SAVED/);
  assert(retry.pending());assert.equal((await retry.load()).worldRevision,1);assert.equal(retry.pending(),null);
});
test('reapplication revalidates combined geometry even when point targets are disjoint',async t=>{
  const app=await(await setup(t)).start(),a=client(app),b=client(app),base=await a.load();await b.load();
  const other=edit(base,'moved-other','p11',101000),mine=edit(base,'moved-mine','p12',101200);
  for(const r of [other,mine])Object.assign(r.operations[0].values,{x:8100,y:8100});
  await a.save(other);await assert.rejects(()=>b.save(mine),/STALE_READ/);
  await assert.rejects(()=>b.rebase(),/SOURCE_CONFLICT/);assert.deepEqual(b.pending(),mine);
  assert.equal((await a.load()).worldRevision,1);
});
test('browser persistence protocol saves, retries lost response once, and reopens after server restart',async t=>{
  const f=await setup(t);let app=await f.start();const store=storage();let lose=true;
  const page=await fetch(app.origin+'/packages/terrain-core/demo/?durable=1');assert.equal(page.status,200);assert.match(await page.text(),/Accept changes/);
  let c=client(app,store,()=>lose);const first=await c.load();assert.equal(first.worldRevision,0);
  await assert.rejects(()=>c.save(request(first)),/Lost save response/);assert(c.pending());
  lose=false;const saved=await c.save(request(first));assert.equal(saved.worldRevision,1);assert.equal(c.pending(),null);
  await app.close();app=await f.start();c=client(app,store);const reopened=await c.load();
  assert.equal(reopened.worldRevision,1);assert.equal(reopened.terrain.points[12].z,100900);
});
test('reload reconciles a lost committed response without resubmitting',async t=>{
  const app=await(await setup(t)).start(),store=storage(),c=client(app,store,()=>true),s=await c.load();
  await assert.rejects(()=>c.save(request(s)));const reloaded=client(app,store);assert.equal((await reloaded.load()).worldRevision,1);assert.equal(reloaded.pending(),null);
});
test('stale saves preserve pending request until explicitly discarded',async t=>{
  const app=await(await setup(t)).start(),a=client(app),b=client(app),old=await b.load();await a.load();await a.save(request(old));
  await assert.rejects(()=>b.save({...request(old),requestId:'other'}),/STALE_READ/);assert(b.pending());b.discard();assert.equal(b.pending(),null);
});
test('receipt reconciliation reloads state when publication follows the first snapshot',async()=>{
  const store=storage();store.setItem('plasma-terrain-pending-v1',JSON.stringify({requestId:'late'}));let reads=0;
  const c=createPersistenceClient({storage:store,fetcher:async url=>({ok:true,json:async()=>url.startsWith('/api/receipt')?
    {receipt:{worldRevision:1}}:{token:'test',snapshot:{branch:'main',revision:reads++,state:{terrain:{}}}}})});
  assert.equal((await c.load()).worldRevision,1);assert.equal(c.pending(),null);assert.equal(reads,2);
});
test('open client refreshes a restarted server token without changing its pending proposal',async t=>{
  const f=await setup(t),first=await f.start(),route={origin:first.origin},c=client(route),s=await c.load();
  await first.close();const restarted=await f.start();route.origin=restarted.origin;
  const saved=await c.save(request(s));assert.equal(saved.worldRevision,1);assert.equal(saved.terrain.points[12].z,100900);assert.equal(c.pending(),null);
});
test('refresh does not rebase a stale proposal and retains it for recovery',async t=>{
  const f=await setup(t),first=await f.start(),route={origin:first.origin},c=client(route),s=await c.load();
  await first.close();const restarted=await f.start();route.origin=restarted.origin;
  const other=client(restarted);await other.load();await other.save({...request(s),requestId:'other'});
  await assert.rejects(()=>c.save(request(s)),/STALE_READ/);assert.deepEqual(c.pending(),request(s));
});
test('persistent permission denial retries once and keeps exact request bytes',async()=>{
  const store=storage(),bodies=[];let refreshes=0;
  const c=createPersistenceClient({storage:store,fetcher:async(url,options)=>{
    if(url==='/api/world'){refreshes++;return {ok:true,json:async()=>({token:'new'})};}
    bodies.push(options.body);return {ok:false,status:403,json:async()=>({error:'Save permission denied'})};
  }});
  const r={requestId:'same',baseWorldRevision:3,operations:[]};await assert.rejects(()=>c.save(r),/Save permission denied/);
  assert.equal(refreshes,1);assert.equal(bodies.length,2);assert.equal(bodies[0],bodies[1]);assert.deepEqual(c.pending(),r);
});
test('local server rejects cross-origin, missing-token and caller-supplied actor authority',async t=>{
  const app=await(await setup(t)).start(),bootstrap=await(await fetch(app.origin+'/api/world')).json();
  const data=request({branchId:'main',worldRevision:0,proposalRevision:null,terrain:bootstrap.snapshot.state.terrain});
  for(const headers of [{Origin:'https://example.com','X-Plasma-Token':bootstrap.token},{Origin:app.origin}]){
    const response=await fetch(app.origin+'/api/terrain',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});assert.equal(response.status,403);
  }
  const response=await fetch(app.origin+'/api/terrain',{method:'POST',headers:{'Content-Type':'application/json',Origin:app.origin,'X-Plasma-Token':bootstrap.token},body:JSON.stringify({...data,actor:{id:'admin'}})});assert.equal(response.status,422);
  assert.equal((await(await fetch(app.origin+'/api/world')).json()).snapshot.revision,0);
  assert.equal((await fetch(app.origin+'/.data/terrain-demo.sqlite')).status,404);
});
test('undo is a preview first and acceptance appends a revision with the inverse intent',async t=>{
  const app=await(await setup(t)).start(),c=client(app),initial=await c.load();
  await c.save(request(initial));const inverse=await c.undo(1);
  assert.equal(inverse.baseWorldRevision,1);assert.match(inverse.intent,/Undo saved terrain revision 1/);
  assert.equal((await c.load()).worldRevision,1);
  const undone=await c.save(inverse);assert.equal(undone.worldRevision,2);assert.equal(undone.terrain.points[12].z,initial.terrain.points[12].z);
  const head=(await(await fetch(app.origin+'/api/world')).json()).snapshot;
  assert.equal(head.parent,1);assert.equal(head.event.request.payload.requestId,inverse.requestId);
});
test('undo rejects missing history and stale bases without advancing the head',async t=>{
  const app=await(await setup(t)).start(),c=client(app),initial=await c.load();
  await assert.rejects(()=>c.undo(0),/No saved edit/);await c.save(request(initial));
  await assert.rejects(()=>c.undo(0),/STALE_READ/);assert.equal((await c.load()).worldRevision,1);
});
test('a concurrent saved edit invalidates an already previewed undo',async t=>{
  const app=await(await setup(t)).start(),a=client(app),b=client(app),initial=await a.load();
  const saved=await a.save(request(initial)),inverse=await a.undo(1);await b.load();
  await b.save({...request(saved),requestId:'next-edit',operations:[{type:'point.replace',target:'p12',values:{x:8000,y:8000,z:101000,evidenceRefs:['synthetic-fixture']}}]});
  await assert.rejects(()=>a.save(inverse),/STALE_READ/);assert.deepEqual(a.pending(),inverse);assert.equal((await b.load()).worldRevision,2);
});
test('history lists lineage and restores an earlier terrain as a new revision',async t=>{
  const app=await(await setup(t)).start(),c=client(app),initial=await c.load();
  const first=await c.save(request(initial));
  await c.save({...request(first),requestId:'second',operations:[{type:'point.replace',target:'p12',values:{x:8000,y:8000,z:101100,evidenceRefs:['synthetic-fixture']}}]});
  const history=await c.history();assert.deepEqual(history.entries.map(e=>e.revision),[2,1,0]);assert.equal(history.nextRevision,null);
  const proposal=await c.restore(2,0);assert.match(proposal.intent,/Restore terrain from saved revision 0/);assert.equal((await c.load()).worldRevision,2);
  const restored=await c.save(proposal);assert.equal(restored.worldRevision,3);assert.equal(restored.terrain.points[12].z,initial.terrain.points[12].z);
  assert.deepEqual((await c.history()).entries.map(e=>e.revision),[3,2,1,0]);
  await assert.rejects(()=>c.restore(3,0),/NO_TERRAIN_CHANGE/);
  await assert.rejects(()=>c.restore(2,0),/STALE_READ/);
  await assert.rejects(()=>c.restore(3,3),/earlier saved revision/);
});
test('history pagination includes every revision exactly once',async t=>{
  const app=await(await setup(t)).start(),c=client(app);let saved=await c.load();
  for(let i=1;i<=22;i++)saved=await c.save({...request(saved),requestId:'page-'+i,operations:[{type:'point.replace',target:'p12',values:{x:8000,y:8000,z:100900+i,evidenceRefs:['synthetic-fixture']}}]});
  const first=await c.history(),second=await c.history(first.nextRevision);
  assert.equal(first.entries.length,20);assert.equal(second.entries.length,3);assert.equal(second.nextRevision,null);
  assert.deepEqual([...first.entries,...second.entries].map(e=>e.revision),Array.from({length:23},(_,i)=>22-i));
});
