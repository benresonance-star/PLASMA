export async function runBridgeTests(core,surface,bridge,client) {
 const results=[],assert=(x,m="Assertion failed")=>{if(!x)throw Error(m);};
 const eq=(a,b)=>assert(JSON.stringify(a)===JSON.stringify(b),"Different results");
 const reject=async(fn,code)=>{let error;try{await fn();}catch(e){error=e;}assert(error?.code===code,"Expected "+code+", got "+error?.code);};
 const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
 const test=async(name,fn)=>{try{await fn();results.push({name,status:"pass"});}catch(e){results.push({name,status:"fail",error:e.message});}};
 const clone=x=>structuredClone(x);
 function setup() {
  let snapshot={branchId:"main",worldRevision:1,proposalRevision:null,terrain:{
   id:"terrain",kind:"terrain-controls",schema:"plasma-terrain-controls/1",surfaceRole:"design-ground",revision:0,frameId:"SITE",datum:"Synthetic",units:"mm",
   source:{evidenceRef:"source",contentDigest:"fixture",importerVersion:"test/1",registrationEvidenceRef:"registration"},
   points:[{id:"a",x:0,y:0,z:0},{id:"b",x:100,y:0,z:0},{id:"c",x:100,y:100,z:0},{id:"d",x:0,y:100,z:0}].map(p=>({...p,revision:0,evidenceRefs:["source"]})),
   features:[{id:"boundary",kind:"boundary",revision:0,pointIds:["a","b","c","d"]}]
  }};
  let allowed=true,hardPass=true,failWrite=false,commits=0,ledger=new Map(),tail=Promise.resolve();
  const authorize=async(actor,request,phase)=>{
    if(!allowed||phase==="commit"&&actor.id!=="human")throw new core.TerrainError("DENIED","Denied by host");
    return {terrainId:"terrain",allowedFeatureIds:["a","b","c","d"]};
  };
  const host={
   readSnapshot:async()=>clone(snapshot),authorize,
   withWorldTransaction(callback) {
    // Test double only: serialized copy-on-write, not actual durable storage.
    const work=tail.then(async()=>{
     let staged=clone(snapshot),receipts=new Map(ledger),writes=0;
     const result=await callback({
      authorize,readSnapshot:async()=>clone(staged),
      getReceipt:async scope=>clone(receipts.get(JSON.stringify(scope))),
      validateCandidate:async()=>({status:hardPass?"pass":"fail"}),
      commitTerrain:async write=>{
       if(failWrite)throw new core.TerrainError("STORAGE_FAILED","Injected failure");
       staged={...staged,worldRevision:staged.worldRevision+1,terrain:clone(write.candidate.candidate)};
       const receipt={status:"committed",requestKey:write.requestKey,worldRevision:staged.worldRevision};
       receipts.set(JSON.stringify({actorId:write.actorId,branchId:write.branchId,requestId:write.requestId}),receipt);writes++;return receipt;
      }
     });
     snapshot=staged;ledger=receipts;commits+=writes;return result;
    });tail=work.catch(()=>{});return work;
   }
  };
  const request=z=>core.makeTerrainRequest(snapshot,{requestId:"edit-"+z,operations:[{type:"point.replace",target:"a",values:{x:0,y:0,z,evidenceRefs:["source"]}}]});
  return {host,request,read:()=>clone(snapshot),count:()=>commits,bump:()=>snapshot.worldRevision++,
   deny:()=>allowed=false,hardFail:()=>hardPass=false,writeFail:()=>failWrite=true,
   poison:(request)=>ledger.set(JSON.stringify({actorId:"human",branchId:"main",requestId:request.requestId}),{requestKey:"different"}),
   make:(evaluate=async t=>surface.evaluateTerrainSurface(t),actor={id:"human"})=>bridge.createTerrainBridge({host,evaluate,actor,sessionId:"session"})
  };
 }
 await test("preview leaves world unchanged; commit installs through host transaction",async()=>{
  const f=setup(),b=f.make(),before=f.read(),p=await b.preview(f.request(10),1);eq(f.read(),before);eq(f.count(),0);
  const r=await b.commit(p.previewId);eq(r.status,"committed");eq(f.count(),1);eq(f.read().terrain.points[0].z,10);
 });
 await test("receipt retry does not duplicate commit on a newer head",async()=>{
  const f=setup(),b=f.make(),p=await b.preview(f.request(10),1);
  eq(await b.commit(p.previewId),await b.commit(p.previewId));eq(f.count(),1);
 });
 await test("mutating returned preview cannot change private checked candidate",async()=>{
  const f=setup(),b=f.make(),p=await b.preview(f.request(10),1);p.candidate.candidate.points[0].z=999;p.surface.vertices[0].z=999;
  await b.commit(p.previewId);eq(f.read().terrain.points[0].z,10);
 });
 await test("world head change after preview rejects commit",async()=>{
  const f=setup(),b=f.make(),p=await b.preview(f.request(10),1);f.bump();
  await reject(()=>b.commit(p.previewId),"STALE_READ");eq(f.count(),0);
 });
 await test("revoked permission and agent commit are denied by host",async()=>{
  const f=setup(),b=f.make(),p=await b.preview(f.request(10),1);f.deny();await reject(()=>b.commit(p.previewId),"DENIED");
  const g=setup(),agent=g.make(undefined,{id:"agent"}),q=await agent.preview(g.request(10),1);
  await reject(()=>agent.commit(q.previewId),"DENIED");eq(g.count(),0);
 });
 await test("hard invariant or storage failure leaves world unchanged",async()=>{
  for(const mode of ["hardFail","writeFail"]){const f=setup(),b=f.make(),p=await b.preview(f.request(10),1),before=f.read();f[mode]();
   await reject(()=>b.commit(p.previewId),mode==="hardFail"?"HARD_INVARIANT_FAILED":"STORAGE_FAILED");eq(f.read(),before);eq(f.count(),0);}
 });
 await test("same request ID with different durable content is rejected",async()=>{
  const f=setup(),b=f.make(),r=f.request(10),p=await b.preview(r,1);f.poison(r);
  await reject(()=>b.commit(p.previewId),"REQUEST_ID_REUSED");eq(f.count(),0);
 });
 await test("queue retains one active and only latest pending evaluation",async()=>{
  const f=setup(),entered=defer(),gate=defer();let calls=0;
  const b=f.make(async t=>{calls++;if(calls===1){entered.resolve();await gate.promise;}return surface.evaluateTerrainSurface(t);});
  const first=b.preview(f.request(10),1);await entered.promise;
  const second=b.preview(f.request(20),2),third=b.preview(f.request(30),3);
  eq(b.state().activeJobs,1);eq(b.state().pendingJobs,1);eq((await second).status,"superseded");
  gate.resolve();eq((await first).status,"superseded");eq((await third).surface.vertices[0].z,30);eq(calls,2);
 });
 await test("old input sequence cannot supersede ready preview",async()=>{
  const f=setup(),b=f.make(),p=await b.preview(f.request(20),2);
  eq((await b.preview(f.request(10),1)).status,"superseded");eq(b.state().readyPreviewId,p.previewId);
 });
 await test("cancel discards uncancellable late work",async()=>{
  const f=setup(),entered=defer(),gate=defer(),b=f.make(async t=>{entered.resolve();await gate.promise;return surface.evaluateTerrainSurface(t);});
  const p=b.preview(f.request(10),1);await entered.promise;b.cancel();gate.resolve();
  eq((await p).status,"superseded");eq(f.count(),0);await reject(()=>b.preview(f.request(20),2),"SESSION_CLOSED");
 });
 await test("malicious worker mesh fails independent validation",async()=>{
  const f=setup(),b=f.make(async t=>{const s=surface.evaluateTerrainSurface(t);s.vertices[0].z++;return s;});
  await reject(()=>b.preview(f.request(10),1),"INVALID_REALIZATION");eq(f.count(),0);
 });
 await test("two sessions cannot both commit against the same base",async()=>{
  const f=setup(),a=f.make(),b=f.make(),p=await a.preview(f.request(10),1),q=await b.preview(f.request(20),1);
  const r=await Promise.allSettled([a.commit(p.previewId),b.commit(q.previewId)]);
  eq(r.filter(x=>x.status==="fulfilled").length,1);eq(f.count(),1);
 });
 function worker() {
  const listeners=new Map();let last=null,terminated=false;
  return {addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),
   postMessage:x=>last=clone(x),terminate:()=>terminated=true,
   emit:data=>listeners.get("message")?.({data}),last:()=>last,terminated:()=>terminated};
 }
 await test("worker transport correlates IDs and rejects concurrent submissions",async()=>{
  const w=worker(),c=client.createTerrainWorkerEvaluator(w),p=c.evaluate({id:"terrain"});
  await reject(()=>c.evaluate({id:"other"}),"RESOURCE_LIMIT");
  w.emit({jobId:"wrong",status:"ready",surface:"old"});
  w.emit({jobId:w.last().jobId,status:"ready",surface:"new"});eq(await p,"new");c.dispose();assert(w.terminated());
 });
 await test("worker disposal rejects pending work and closes transport",async()=>{
  const w=worker(),c=client.createTerrainWorkerEvaluator(w),p=c.evaluate({});const outcome=reject(()=>p,"WORKER_CLOSED");
  c.dispose();await outcome;await reject(()=>c.evaluate({}),"WORKER_CLOSED");assert(w.terminated());
 });
 await test("worker timeout terminates transport without leaving pending work",async()=>{
  const w=worker(),c=client.createTerrainWorkerEvaluator(w,{timeoutMs:1});
  await reject(()=>c.evaluate({}),"WORKER_TIMEOUT");assert(w.terminated());
  await reject(()=>c.evaluate({}),"WORKER_CLOSED");
 });
 await test("cancel before validation completes prevents commit submission",async()=>{
  const f=setup(),entered=defer(),gate=defer(),original=f.host.withWorldTransaction;
  f.host.withWorldTransaction=callback=>original(tx=>callback({...tx,validateCandidate:async()=>{entered.resolve();await gate.promise;return {status:"pass"};}}));
  const b=f.make(),p=await b.preview(f.request(10),1),commit=b.commit(p.previewId),outcome=reject(()=>commit,"SESSION_CLOSED");
  await entered.promise;b.cancel();gate.resolve();await outcome;eq(f.count(),0);
 });
 await test("cancel after commit submission reports actual commit outcome",async()=>{
  const f=setup(),entered=defer(),gate=defer(),original=f.host.withWorldTransaction;
  f.host.withWorldTransaction=callback=>original(tx=>callback({...tx,commitTerrain:async write=>{entered.resolve();await gate.promise;return tx.commitTerrain(write);}}));
  const b=f.make(),p=await b.preview(f.request(10),1),commit=b.commit(p.previewId);
  await entered.promise;eq(b.cancel().commitOutcome,"await-in-flight-result");gate.resolve();
  eq((await commit).status,"committed");eq(f.count(),1);
 });
 return results;
}
