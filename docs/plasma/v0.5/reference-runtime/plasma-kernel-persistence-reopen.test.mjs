import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';

const htmlPath = process.argv[2] || '/mnt/data/Plasma-Design-and-Site-Editing-Kernel-v0.3.html';
const evidencePath = process.argv[3] || '/mnt/data/PLS-KERNEL-01_PERSISTENCE_REOPEN_EVIDENCE.json';
const chromium = process.env.CHROMIUM || '/usr/bin/chromium';
const port = +(process.env.CDP_PORT || 9353);
const profile = await mkdtemp(join(tmpdir(), 'plasma-kernel-persist-'));
const proc = spawn(chromium,['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',`--remote-debugging-port=${port}`,'--remote-allow-origins=*',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function requestJson(path,method='GET'){return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path,method},res=>{let d='';res.on('data',x=>d+=x);res.on('end',()=>{try{resolve(JSON.parse(d))}catch(e){reject(e)}})});req.on('error',reject);req.end()})}
for(let i=0;i<100;i++){try{await requestJson('/json/version');break}catch{await sleep(50)}if(i===99)throw new Error('Chromium CDP did not start')}
class CDP{constructor(url){this.ws=new WebSocket(url);this.id=0;this.pending=new Map();this.events=[];this.ready=new Promise((r,j)=>{this.ws.onopen=r;this.ws.onerror=j});this.ws.onmessage=e=>{let m=JSON.parse(e.data);if(m.id&&this.pending.has(m.id)){this.pending.get(m.id)(m);this.pending.delete(m.id)}else this.events.push(m)}}async call(method,params={}){await this.ready;let id=++this.id,p=new Promise(r=>this.pending.set(id,r));this.ws.send(JSON.stringify({id,method,params}));let m=await p;if(m.error)throw new Error(`${method}: ${m.error.message}`);return m.result}close(){this.ws.close()}}

const html = await readFile(htmlPath,'utf8');
async function makePage(initialEntries=[]) {
  const target=await requestJson('/json/new?about:blank','PUT');
  const cdp=new CDP(target.webSocketDebuggerUrl); await cdp.ready;
  await cdp.call('Page.enable'); await cdp.call('Runtime.enable'); await cdp.call('Log.enable');
  const tree=await cdp.call('Page.getFrameTree'); const frameId=tree.frameTree.frame.id;
  const ev=async expression=>{let r=await cdp.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value};
  const entriesJson=JSON.stringify(initialEntries);
  await ev(`(()=>{const data=new Map(${entriesJson});const ls={get length(){return data.size},key:i=>[...data.keys()][i]??null,getItem:k=>data.has(String(k))?data.get(String(k)):null,setItem:(k,v)=>data.set(String(k),String(v)),removeItem:k=>data.delete(String(k)),clear:()=>data.clear()};Object.defineProperty(window,'localStorage',{configurable:true,value:ls});window.__plasmaTestStorage=data;return true})()`);
  await cdp.call('Page.setDocumentContent',{frameId,html});
  for(let i=0;i<160;i++){
    if(await ev(`(()=>{try{return !!window.plasmaRC02&&!!window.plasmaKernelLive&&!!window.plasmaEditing&&!!document.querySelector('[data-design-handle=\"room\"]')}catch{return false}})()`)) break;
    await sleep(50); if(i===159) throw new Error('app did not initialize');
  }
  return {target,cdp,ev};
}

const drag500=`(()=>{const canvas=document.getElementById('canvas'),h=document.querySelector('[data-design-handle="room"]');canvas.setPointerCapture=()=>{};canvas.releasePointerCapture=()=>{};const b=h.getBoundingClientRect(),x=b.left+b.width/2,y=b.top+b.height/2,m=h.ownerSVGElement.getScreenCTM(),dx=500*Math.abs(m.a||1),opts=(type,cx)=>({bubbles:true,cancelable:true,pointerId:17,pointerType:'mouse',isPrimary:true,clientX:cx,clientY:y,buttons:type==='pointerup'?0:1,button:0});h.dispatchEvent(new PointerEvent('pointerdown',opts('pointerdown',x)));for(const f of [.2,.4,.6,.8,1])canvas.dispatchEvent(new PointerEvent('pointermove',opts('pointermove',x+dx*f)));canvas.dispatchEvent(new PointerEvent('pointerup',opts('pointerup',x+dx)));return true})()`;

async function main(){
  // Session 1: create conflict, accept exact alternative, persist R1.
  const p1=await makePage();
  await p1.ev('window.plasmaKernelLive.resetForTest()');
  await p1.ev(drag500);
  for(let i=0;i<100;i++){if(await p1.ev(`window.plasmaRC02.snapshot().phase==='conflicted'`))break;await sleep(20);if(i===99)throw new Error('conflict not reached')}
  let k=JSON.parse(await p1.ev('JSON.stringify(window.plasmaKernelLive.snapshot())'));
  assert.equal(k.branch.headRevision,'R0');
  assert.equal(k.pending.transaction.status,'conflicted');
  await p1.ev('window.plasmaRC02.selectHardLimit()');
  for(let i=0;i<120;i++){if(await p1.ev(`(()=>{const r=window.plasmaRC02.snapshot();return r.requestedDelta===150&&!r.acceptanceBlocked&&!document.getElementById('accept').disabled})()`))break;await sleep(25);if(i===119)throw new Error('hard limit not ready')}
  await p1.ev(`document.getElementById('accept').click()`);
  for(let i=0;i<120;i++){if(await p1.ev(`window.plasmaKernelLive.snapshot().branch.headRevision==='R1'`))break;await sleep(25);if(i===119)throw new Error('R1 not committed')}
  k=JSON.parse(await p1.ev('JSON.stringify(window.plasmaKernelLive.snapshot())'));
  assert.deepEqual(k.states.R1.values,{W17:{offset_mm:150},B03:{width_mm:3650},C04:{width_mm:1000}});
  const store1=JSON.parse(await p1.ev(`window.plasmaKernelLive.exportStore()`));
  assert.equal(store1.schema,'plasma-kernel-store/0.2.0');
  assert.equal(store1.headRevision,'R1');
  assert.equal(await p1.ev('window.plasmaKernelLive.storeStatus().valid'),true);
  const entries=JSON.parse(await p1.ev('JSON.stringify([...window.__plasmaTestStorage.entries()])'));
  assert.ok(entries.some(([key])=>key==='plasma-kernel-runtime-v0.2'));
  assert.ok(entries.some(([key])=>key==='plasma-unified-project-v1'));
  const p1Exceptions=p1.cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.text);
  p1.cdp.close();

  // Session 2: fresh JS realm receives only persisted bytes, then reconstructs app + kernel.
  const p2=await makePage(entries);
  for(let i=0;i<120;i++){
    const ok=await p2.ev(`(()=>{try{return window.plasmaKernelLive.snapshot().branch.headRevision==='R1'&&window.plasmaEditing.read().bedroom.width===3650}catch{return false}})()`);
    if(ok)break; await sleep(25); if(i===119)throw new Error('R1 not recovered in fresh document');
  }
  const recovered=JSON.parse(await p2.ev('JSON.stringify(window.plasmaKernelLive.snapshot())'));
  const status=JSON.parse(await p2.ev('JSON.stringify(window.plasmaKernelLive.storeStatus())'));
  assert.equal(recovered.branch.headRevision,'R1');
  assert.equal(recovered.states.R1.parentRevisionId,'R0');
  assert.equal(recovered.states.R1.values.B03.width_mm,3650);
  assert.equal(status.valid,true);
  assert.equal(status.source,'primary');
  assert.equal(await p2.ev('window.plasmaEditing.read().bedroom.width'),3650);

  // Undo after reopen should append R2; accepted history remains addressable.
  const undoDisabled=await p2.ev(`document.getElementById('undo').disabled`);
  if(undoDisabled) throw new Error('Application undo history did not recover after reopen');
  await p2.ev(`document.getElementById('undo').click()`);
  for(let i=0;i<120;i++){
    const ok=await p2.ev(`(()=>{try{return window.plasmaKernelLive.snapshot().branch.headRevision==='R2'&&window.plasmaEditing.read().bedroom.width===3500}catch{return false}})()`);
    if(ok)break; await sleep(25); if(i===119)throw new Error('R2 undo after reopen not observed');
  }
  const final=JSON.parse(await p2.ev('JSON.stringify(window.plasmaKernelLive.snapshot())'));
  assert.equal(final.states.R1.values.B03.width_mm,3650);
  assert.deepEqual(final.states.R2.values,{W17:{offset_mm:0},B03:{width_mm:3500},C04:{width_mm:1150}});
  assert.equal(final.states.R2.parentRevisionId,'R1');
  const store2=JSON.parse(await p2.ev('window.plasmaKernelLive.exportStore()'));
  assert.equal(store2.headRevision,'R2');
  assert.ok(store2.generation>store1.generation);
  const p2Exceptions=p2.cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.text);
  p2.cdp.close();

  return {
    schema:'plasma-kernel-persistence-reopen-evidence/1',
    generatedAt:new Date().toISOString(),
    html:htmlPath,
    harness:'two fresh Page.setDocumentContent JS realms + persisted-byte handoff via localStorage shim',
    tests:{
      conflictLeavesR0:true,
      hardLimitCommitPersistsR1:true,
      persistentEnvelopeValid:true,
      freshRealmRecoversKernelR1:true,
      freshRealmRecoversApplicationR1:true,
      undoAfterReopenAppendsR2:true,
      R1RemainsAddressable:true,
      storeGenerationAdvances:true,
    },
    persistence:{schema:store2.schema,key:'plasma-kernel-runtime-v0.2',generationBeforeReopen:store1.generation,generationAfterUndo:store2.generation,checksum:store2.checksum,recoveredSource:status.source},
    finalKernel:{head:final.branch.headRevision,state:final.states.R2,eventCount:final.events.length,transformCount:final.transforms.length,revisionIds:Object.keys(final.states)},
    runtimeExceptions:[...p1Exceptions,...p2Exceptions],
    limitations:['Browser navigation to localhost/file origins is blocked by environment policy','Persistence bytes are carried into a fresh browser realm by the harness; native-origin browser storage durability is not directly observed','No database/multi-user transport','No OCCT exact geometry','No physical-device performance evidence'],
  };
}

try{
  const evidence=await main();
  const {writeFile}=await import('node:fs/promises');
  await writeFile(evidencePath,JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence,null,2));
} finally {
  proc.kill('SIGTERM'); await sleep(100); await rm(profile,{recursive:true,force:true}).catch(()=>{});
}