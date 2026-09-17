// node packages/world-runtime/test/browser-saved.mjs <agent-browser executable>
// Uses a disposable database and localhost port 8082; never changes the user's saved demo.
import {execFileSync,spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeTerrainRequest} from '../../terrain-core/src/index.mjs';
const cli=process.argv[2],dir=fs.mkdtempSync(path.join(os.tmpdir(),'plasma-saved-browser-'));
const session='plasma-saved-'+process.pid,url='http://127.0.0.1:8082/packages/terrain-core/demo/?durable=1';
let server,sequence=0;const checks=[];
function run(...args){
  const file=path.join(dir,++sequence+'.json'),fd=fs.openSync(file,'w');
  try{execFileSync(cli,['--session',session,'--json',...args],{stdio:['ignore',fd,fd],windowsHide:true,timeout:15000});}finally{fs.closeSync(fd);}
  const result=JSON.parse(fs.readFileSync(file,'utf8').trim().split('\n').findLast(s=>s.startsWith('{')));
  if(!result.success)throw Error(JSON.stringify(result.error));return result.data;
}
const value=code=>JSON.parse(run('eval','JSON.stringify('+code+')').result);
const state=()=>value(`({level:document.getElementById('level').value,status:document.getElementById('status').textContent,revision:document.getElementById('revision').textContent,ready:!document.getElementById('preview').disabled,accept:!document.getElementById('accept').disabled})`);
async function until(fn){const end=Date.now()+10000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,80));}throw Error('Condition timed out: '+JSON.stringify(state()));}
async function start(){
  server=spawn(process.execPath,['packages/world-runtime/demo/server.mjs'],{env:{...process.env,PLASMA_DEMO_PORT:'8082',PLASMA_DEMO_DB:path.join(dir,'world.sqlite')},stdio:'ignore',windowsHide:true});
  await until(async()=>{try{return(await fetch('http://127.0.0.1:8082/api/world')).ok;}catch{return false;}});
}
async function stop(){if(!server)return;const child=server;server=null;await new Promise(resolve=>{child.once('exit',resolve);child.kill();});}
async function check(name,fn){await fn();checks.push({name,status:'pass'});console.log('PASS '+name);}
async function otherSave(target,z){
  const origin='http://127.0.0.1:8082',data=await(await fetch(origin+'/api/world')).json(),saved=data.snapshot;
  const point=saved.state.terrain.points.find(p=>p.id===target);
  const request=makeTerrainRequest({branchId:'main',worldRevision:saved.revision,proposalRevision:null,terrain:saved.state.terrain},
    {requestId:'browser-other-'+saved.revision,operations:[{type:'point.replace',target,values:{x:point.x,y:point.y,z,evidenceRefs:point.evidenceRefs}}]});
  const response=await fetch(origin+'/api/terrain',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Plasma-Token':data.token},body:JSON.stringify(request)});
  assert.equal(response.status,200);
}
try{
  await start();run('open',url);run('set','viewport','1280','900');await until(()=>state().ready);
  await check('3D orbit, pan, zoom and fit inspect terrain without creating an edit',async()=>{
    run('click','#axon');
    const geometry=()=>value("Array.from(document.querySelectorAll('[aria-label=\"accepted terrain preview\"] polygon')).map(p=>p.getAttribute('points')).join('|')");
    const initial=geometry();
    const box=value("(()=>{const r=document.getElementById('view').getBoundingClientRect();return {x:r.x+r.width*.5,y:r.y+r.height*.5};})()");
    run('mouse','move',String(Math.round(box.x)),String(Math.round(box.y)));run('mouse','down');run('mouse','move',String(Math.round(box.x+70)),String(Math.round(box.y+30)));run('mouse','up');
    await until(()=>geometry()!==initial);const rotated=geometry();
    run('focus','#view');run('press','Shift+ArrowRight');await until(()=>geometry()!==rotated);const panned=geometry();
    run('press','+');await until(()=>geometry()!==panned);
    assert.equal(state().revision,'Saved revision 0');assert.equal(state().accept,false);
    run('click','#fit');await until(()=>geometry()===initial);run('click','#plan');
  });
  await check('unaccepted numeric draft survives refresh and remains editable until reset',async()=>{
    run('fill','#level','100960');run('click','#preview');await until(()=>state().ready&&state().accept);
    const colours=value(`['accepted','candidate'].map(role=>document.querySelector('[aria-label="'+role+' terrain preview"] polygon').getAttribute('fill'))`);
    assert.notEqual(colours[0],colours[1]);
    run('focus','#proposal-opacity');run('press','Home');
    assert.equal(value("document.querySelector('[aria-label=\"candidate terrain preview\"]').getAttribute('opacity')"),'0');
    assert.equal(state().level,'100960');assert.equal(state().revision,'Saved revision 0');assert.equal(state().accept,true);
    run('press','End');assert.equal(value("document.querySelector('[aria-label=\"candidate terrain preview\"]').getAttribute('opacity')"),'1');
    run('click','#axon');fs.mkdirSync('tmp',{recursive:true});run('screenshot',path.resolve('tmp/plasma-terrain-comparison.png'),'--full');run('click','#plan');
    run('open',url);await until(()=>state().status.startsWith('Draft preview restored')&&state().ready);assert.equal(state().level,'100960');assert.equal(state().revision,'Saved revision 0');
    run('fill','#level','100980');run('click','#preview');await until(()=>state().ready&&state().level==='100980');
    run('open',url);await until(()=>state().status.startsWith('Draft preview restored'));assert.equal(state().level,'100980');
    run('click','#reset');run('open',url);await until(()=>state().ready);assert.equal(state().level,'100460');assert.equal(state().accept,false);
  });
  await check('drag-created amber draft survives refresh and reset clears it',async()=>{
    const point=value(`(()=>{const r=document.querySelector('[data-selected="true"] circle').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    run('mouse','move',String(Math.round(point.x)),String(Math.round(point.y)));run('mouse','down');
    run('mouse','move',String(Math.round(point.x+12)),String(Math.round(point.y-10)));run('mouse','up');
    await until(()=>state().accept&&value("!!sessionStorage.getItem('plasma-terrain-draft-v1')"));
    const draft=value("sessionStorage.getItem('plasma-terrain-draft-v1')");
    run('open',url);await until(()=>state().status.startsWith('Draft preview restored'));
    assert.equal(value("sessionStorage.getItem('plasma-terrain-draft-v1')"),draft);
    assert.equal(value("document.querySelectorAll('[aria-label=\"candidate terrain preview\"]').length"),1);
    assert.equal(state().revision,'Saved revision 0');
    run('click','#reset');assert.equal(value("sessionStorage.getItem('plasma-terrain-draft-v1')"),null);
  });
  await check('edited node rings track multiple changes independently of selection and survive refresh',async()=>{
    const count=()=>value("document.querySelectorAll('[data-edited=\"true\"]').length");
    assert.equal(count(),0);
    run('fill','#level','100980');run('click','#preview');await until(()=>state().ready&&count()===1);
    run('select','#point','p11');assert.equal(count(),1);
    assert.equal(value("document.querySelector('[data-selected=\"true\"]').getAttribute('data-edited')"),'false');
    run('fill','#level','100990');run('click','#preview');await until(()=>state().ready&&count()===2);
    assert.equal(value("document.getElementById('edited-count').textContent"),'2 edited nodes');
    run('click','#axon');assert.equal(count(),2);
    run('screenshot',path.resolve('tmp/plasma-edited-nodes.png'),'--full');
    run('open',url);await until(()=>state().status.startsWith('Draft preview restored'));
    assert.equal(count(),2);assert.match(value("document.querySelector('[data-edited=\"true\"]').getAttribute('aria-label')"),/edited from saved/);
    run('fill','#level','100460');run('click','#preview');await until(()=>state().ready&&count()===1);
    run('click','#reset');assert.equal(count(),0);
  });
  await check('point review shows exact deltas and individually reverts edits without changing saved terrain',async()=>{
    run('fill','#level','100980');run('click','#preview');await until(()=>state().ready&&state().accept);
    run('select','#point','p11');run('fill','#level','100990');run('click','#preview');await until(()=>state().ready);
    assert.equal(value("document.querySelectorAll('#edited-rows tr').length"),2);
    const cells=value("Array.from(document.querySelector('#edited-rows tr[data-point=\"p12\"]').cells).map(c=>c.textContent)");
    assert.equal(cells[1],'8000, 8000, 100460');assert.equal(cells[2],'8000, 8000, 100980');assert.equal(cells[3],'0, 0, +520');
    run('click','button[data-point="p12"][data-action="select"]');assert.equal(state().level,'100980');
    run('screenshot',path.resolve('tmp/plasma-point-review.png'),'--full');
    run('click','button[data-point="p12"][data-action="revert"]');await until(()=>state().ready&&value("document.querySelectorAll('#edited-rows tr').length")===1);
    assert.equal(state().level,'100460');assert.equal(state().revision,'Saved revision 0');
    run('open',url);await until(()=>state().status.startsWith('Draft preview restored'));
    assert.equal(value("document.querySelector('#edited-rows tr').dataset.point"),'p11');
    run('click','button[data-point="p11"][data-action="revert"]');await until(()=>!state().accept);
    assert.equal(value("document.getElementById('edited-review').hidden"),true);
    assert.equal(value("sessionStorage.getItem('plasma-terrain-draft-v1')"),null);
    run('open',url);await until(()=>state().ready);assert.equal(state().accept,false);
  });
  await check('exact XYZ edits survive refresh and invalid coordinates preserve the prior draft',async()=>{
    run('fill','#coordinate-x','8100');run('fill','#coordinate-y','8200');run('fill','#level','100800');run('click','#preview');
    await until(()=>state().ready&&state().accept);
    assert.equal(value("document.querySelector('#edited-rows tr[data-point=\"p12\"]').cells[3].textContent"),' +100, +200, +340'.trim());
    const draft=value("sessionStorage.getItem('plasma-terrain-draft-v1')");
    run('fill','#coordinate-x','');run('click','#preview');assert.match(state().status,/Enter X as an integer/);
    run('fill','#coordinate-x','8100.5');run('click','#preview');assert.match(state().status,/Enter X as an integer/);
    run('fill','#coordinate-x','1000000001');run('click','#preview');assert.match(state().status,/Enter X as an integer/);
    run('fill','#coordinate-x','4000');run('fill','#coordinate-y','8000');run('click','#preview');assert.match(state().status,/Duplicate XY/);
    assert.equal(value("sessionStorage.getItem('plasma-terrain-draft-v1')"),draft);
    run('open',url);await until(()=>state().status.startsWith('Draft preview restored'));
    assert.equal(value("document.getElementById('coordinate-x').value"),'8100');assert.equal(value("document.getElementById('coordinate-y').value"),'8200');assert.equal(state().level,'100800');
    run('click','#axon');assert.equal(value("document.getElementById('coordinate-x').value"),'8100');
    run('screenshot',path.resolve('tmp/plasma-coordinate-editing.png'),'--full');
    run('click','#reset');assert.equal(value("document.getElementById('coordinate-x').value"),'8000');assert.equal(value("document.getElementById('coordinate-y').value"),'8000');
    run('click','#plan');
  });
  await check('typing coordinates updates viewport without a preview click and never saves automatically',async()=>{
    const position=()=>value("(()=>{const c=document.querySelector('[data-selected=\"true\"] circle');return [c.getAttribute('cx'),c.getAttribute('cy')];})()");
    const original=position();
    run('fill','#coordinate-x','8200');run('fill','#coordinate-y','8300');
    await until(()=>state().ready&&state().accept&&position().join()!==original.join());
    assert.equal(value("document.querySelector('#edited-rows tr[data-point=\"p12\"]').cells[2].textContent"),'8200, 8300, 100460');
    run('click','#axon');const beforeHeight=position();run('fill','#level','101460');
    await until(()=>state().ready&&position().join()!==beforeHeight.join());
    assert.equal(state().revision,'Saved revision 0');
    run('fill','#coordinate-x','');await until(()=>state().status.includes('Enter X as an integer'));
    assert.equal(value("document.querySelector('#edited-rows tr[data-point=\"p12\"]').cells[2].textContent"),'8200, 8300, 101460');
    run('click','#reset');run('click','#plan');assert.equal(state().accept,false);
  });
  await check('acceptance survives server token rotation while the edited page remains open',async()=>{
    run('fill','#level','100960');run('click','#preview');await until(()=>state().ready&&state().accept);
    await stop();await start();run('click','#accept');
    await until(()=>state().status.startsWith('Saved revision 1.'));assert.equal(state().level,'100960');assert.equal(state().accept,false);
    assert.equal(value("document.querySelectorAll('[data-edited=\"true\"]').length"),0);
  });
  await check('reset returns to saved terrain rather than the original fixture',async()=>{
    run('fill','#level','101160');run('click','#preview');await until(()=>state().ready&&state().accept);run('click','#reset');assert.equal(state().level,'100960');
  });
  await check('closing browser and restarting server retains the accepted terrain',async()=>{
    run('close');await stop();await start();run('open',url);await until(()=>state().ready);assert.equal(state().level,'100960');assert.equal(state().revision,'Saved revision 1');
  });
  await check('a subsequent accepted edit creates the next revision',async()=>{
    run('fill','#level','101060');run('click','#preview');await until(()=>state().ready&&state().accept);run('click','#accept');await until(()=>state().status.startsWith('Saved revision 2.'));
    run('click','#reload');await until(()=>state().status.startsWith('Loaded saved revision 2'));assert.equal(state().level,'101060');
  });
  await check('lost save response retains a retry that does not duplicate publication',async()=>{
    value(`(()=>{const original=window.fetch;window.fetch=async(...args)=>{const response=await original(...args);if(args[1]?.method==='POST'){window.fetch=original;throw Error('Simulated lost response');}return response;};return true;})()`);
    run('fill','#level','101160');run('click','#preview');await until(()=>state().ready&&state().accept);run('click','#accept');
    await until(()=>state().status.includes('Simulated lost response'));assert.equal(value("document.getElementById('accept').textContent"),'Retry save');
    assert.equal(value("document.querySelector('#edited-rows button[data-action=\"revert\"]').disabled"),true);
    run('click','#accept');await until(()=>state().status.startsWith('Saved revision 3.'));assert.equal(state().level,'101160');
  });
  await check('reset after an unavailable save clears pending state and permits editing',async()=>{
    value(`(()=>{const original=window.fetch;window.fetch=(...args)=>{if(args[1]?.method==='POST'){window.fetch=original;return Promise.reject(Error('Simulated offline'));}return original(...args);};return true;})()`);
    run('fill','#level','101260');run('click','#preview');await until(()=>state().ready&&state().accept);run('click','#accept');await until(()=>state().status.includes('Simulated offline'));
    run('click','#reset');assert.equal(state().level,'101160');assert.equal(state().ready,true);assert.equal(state().revision,'Saved revision 3');
  });
  await check('recovery copy records the saved revision without accepting a preview',async()=>{
    run('click','#backup');await until(()=>state().status.includes('Recovery copy verified for saved revision 3'));assert.equal(state().revision,'Saved revision 3');
  });
  await check('undo previews, cancels and accepts through a new saved revision',async()=>{
    run('click','#undo');await until(()=>state().status.startsWith('Undo preview'));assert.equal(state().level,'101060');assert.equal(state().revision,'Saved revision 3');
    run('click','#reset');assert.equal(state().level,'101160');assert.equal(state().revision,'Saved revision 3');
    run('click','#undo');await until(()=>state().status.startsWith('Undo preview'));run('click','#accept');await until(()=>state().status.startsWith('Saved revision 4.'));
    assert.equal(state().level,'101060');run('open',url);await until(()=>state().ready);assert.equal(state().level,'101060');assert.equal(state().revision,'Saved revision 4');
  });
  await check('saved history previews and restores an older revision while retaining later history',async()=>{
    run('click','#history');await until(()=>value("document.querySelectorAll('#history-revision option').length")===5);
    assert.equal(value("document.getElementById('history-older').textContent"),'All revisions loaded');
    assert.match(value("document.getElementById('history-preview-help').textContent"),/Choose a revision earlier/);
    run('select','#history-revision','0');run('click','#history-preview');await until(()=>state().status.startsWith('Revision 0 preview'));
    assert.equal(value("document.getElementById('history-preview').disabled"),true);
    assert.match(value("document.getElementById('history-preview-help').textContent"),/unsaved changes.*Accept changes.*Reset preview/);
    assert.equal(state().level,'100460');assert.equal(state().revision,'Saved revision 4');
    run('click','#reset');assert.equal(state().level,'101060');
    run('click','#history-preview');await until(()=>state().status.startsWith('Revision 0 preview'));run('click','#accept');await until(()=>state().status.startsWith('Saved revision 5.'));
    await until(()=>value("document.querySelectorAll('#history-revision option').length")===6);assert.equal(state().level,'100460');
    run('open',url);await until(()=>state().ready);assert.equal(state().revision,'Saved revision 5');assert.equal(state().level,'100460');
  });
  await check('stale pending edits reapply as a reviewable preview and survive reload before acceptance',async()=>{
    run('fill','#level','101300');run('click','#preview');await until(()=>state().ready&&state().accept);
    await otherSave('p11',101000);run('click','#accept');await until(()=>state().status.includes('STALE_READ'));
    run('click','#rebase');await until(()=>state().status.startsWith('Reapplied preview'));
    assert.equal(state().revision,'Saved revision 6');assert.equal(state().level,'101300');
    assert.equal((await(await fetch('http://127.0.0.1:8082/api/world')).json()).snapshot.revision,6);
    run('click','#reset');assert.equal(state().level,'100460');assert.equal(state().accept,false);
    run('fill','#level','101300');run('click','#preview');await until(()=>state().ready&&state().accept);
    await otherSave('p13',101100);run('click','#accept');await until(()=>state().status.includes('STALE_READ'));
    run('click','#rebase');await until(()=>state().status.startsWith('Reapplied preview'));
    run('open',url);await until(()=>state().status.startsWith('Pending preview restored')&&state().accept);
    assert.equal(state().level,'101300');
    assert.equal(value("document.querySelectorAll('[aria-label=\"candidate terrain preview\"]').length"),1);
    assert.match(value("document.getElementById('pending-operations').textContent"),/requested:.*Z 101300/);
    run('click','#accept');await until(()=>state().status.startsWith('Saved revision 8.'));
    assert.equal(state().level,'101300');
  });
  await check('same-point conflict retains preview and pending request for manual resolution',async()=>{
    run('fill','#level','101500');run('click','#preview');await until(()=>state().ready&&state().accept);
    await otherSave('p12',101400);run('click','#accept');await until(()=>state().status.includes('STALE_READ'));
    const pending=value("sessionStorage.getItem('plasma-terrain-pending-v1')");
    run('click','#rebase');await until(()=>state().status.includes('controls p12 changed'));
    assert.equal(state().level,'101500');assert.equal(value("sessionStorage.getItem('plasma-terrain-pending-v1')"),pending);
    run('open',url);await until(()=>state().status.startsWith('Pending edits retained from revision'));
    assert.equal(state().level,'101400');
    assert.equal(value("document.querySelectorAll('[aria-label=\"candidate terrain preview\"]').length"),0);
    assert.match(value("document.getElementById('pending-operations').textContent"),/requested:.*Z 101500.*loaded saved:.*Z 101400/);
    assert.equal(value("sessionStorage.getItem('plasma-terrain-pending-v1')"),pending);
    run('click','#reset');run('click','#reload');await until(()=>state().status.startsWith('Loaded saved revision 9'));
    assert.equal(state().level,'101400');
  });
  await check('offline pending preview restores on reload and Reload saved without publishing',async()=>{
    value(`(()=>{const original=window.fetch;window.fetch=(...args)=>{if(args[1]?.method==='POST'){window.fetch=original;return Promise.reject(Error('Simulated offline'));}return original(...args);};return true;})()`);
    run('fill','#level','101700');run('click','#preview');await until(()=>state().ready&&state().accept);
    run('click','#accept');await until(()=>state().status.includes('Simulated offline'));
    const pending=value("sessionStorage.getItem('plasma-terrain-pending-v1')");
    run('open',url);await until(()=>state().status.startsWith('Pending preview restored'));
    assert.equal(state().level,'101700');assert.equal(state().revision,'Saved revision 9');
    run('click','#reload');await until(()=>state().status.startsWith('Pending preview restored')&&state().accept);
    assert.equal(state().level,'101700');assert.equal(value("sessionStorage.getItem('plasma-terrain-pending-v1')"),pending);
    run('screenshot',path.resolve('tmp/plasma-pending-review.png'),'--full');
    run('click','#reset');assert.equal(state().level,'101400');assert.equal(value("document.getElementById('pending-review').hidden"),true);
    assert.equal((await(await fetch('http://127.0.0.1:8082/api/world')).json()).snapshot.revision,9);
  });
  await check('reload reconciles an already committed pending request instead of restoring a proposal',async()=>{
    value(`(()=>{const original=window.fetch;window.fetch=async(...args)=>{const response=await original(...args);if(args[1]?.method==='POST'){window.fetch=original;throw Error('Simulated lost response');}return response;};return true;})()`);
    run('fill','#level','101800');run('click','#preview');await until(()=>state().ready&&state().accept);
    run('click','#accept');await until(()=>state().status.includes('Simulated lost response'));
    run('open',url);await until(()=>state().ready);
    assert.equal(state().level,'101800');assert.equal(state().revision,'Saved revision 10');assert.equal(state().accept,false);
    assert.equal(value("document.getElementById('pending-review').hidden"),true);
    assert.equal(value("sessionStorage.getItem('plasma-terrain-pending-v1')"),null);
  });
  await check('draft undo redo survives refresh, includes reset and revert, branches and clears after acceptance',async()=>{
    run('fill','#level','101900');run('click','#preview');await until(()=>state().ready&&state().accept);
    run('fill','#level','102000');run('click','#preview');await until(()=>state().ready);
    run('click','#draft-undo');await until(()=>state().level==='101900'&&state().ready);
    run('open',url);await until(()=>state().status.startsWith('Draft preview restored'));
    run('click','#draft-redo');await until(()=>state().level==='102000'&&state().ready);
    run('click','button[data-point="p12"][data-action="revert"]');await until(()=>!state().accept);
    run('click','#draft-undo');await until(()=>state().level==='102000'&&state().ready);
    run('click','#reset');assert.equal(state().level,'101800');
    run('open',url);await until(()=>state().ready);
    run('click','#draft-undo');await until(()=>state().level==='102000'&&state().ready);
    run('click','#draft-undo');await until(()=>state().level==='101900'&&state().ready);
    run('fill','#level','102100');run('click','#preview');await until(()=>state().ready);
    assert.equal(value("document.getElementById('draft-redo').disabled"),true);
    assert.equal(state().revision,'Saved revision 10');
    run('click','#accept');await until(()=>state().status.startsWith('Saved revision 11.'));
    assert.equal(value("document.getElementById('draft-undo').disabled"),true);
    assert.equal(value("document.getElementById('draft-redo').disabled"),true);
  });
  await check('browser reports no uncaught errors',()=>{assert.deepEqual(run('errors').errors,[]);});
  fs.mkdirSync('tmp',{recursive:true});run('screenshot',path.resolve('tmp/plasma-saved-demo.png'),'--full');
  fs.mkdirSync('packages/world-runtime/evidence',{recursive:true});
  const files=['packages/world-runtime/demo/server.mjs','packages/world-runtime/src/store.mjs','packages/world-runtime/src/undo.mjs','packages/world-runtime/src/reference-domains.mjs','packages/world-runtime/test/browser-saved.mjs','packages/world-runtime/test/http.test.mjs','packages/terrain-core/src/svg-terrain.mjs','packages/terrain-core/demo/app.mjs','packages/terrain-core/demo/navigation.mjs','packages/terrain-core/demo/persistence.mjs','packages/terrain-core/demo/fixture.mjs','packages/terrain-core/demo/index.html'];
  files.push('packages/world-runtime/src/rebase.mjs');
  const source_digests=Object.fromEntries(files.map(file=>[file,createHash('sha256').update(fs.readFileSync(file,'utf8').replaceAll('\r\n','\n')).digest('hex')]));
  fs.writeFileSync('packages/world-runtime/evidence/browser-saved.json',JSON.stringify({date:new Date().toISOString(),node:process.version,platform:process.platform,status:'passed',checks,digest_encoding:'sha256 UTF-8 with CRLF normalized to LF',source_digests,limits:['Synthetic local fixture in desktop Chrome; no physical-device, power-loss or multi-user qualification.','Database isolated from the user saved-demo database.']},null,2)+'\n');
}finally{try{run('close');}catch{}await stop();fs.rmSync(dir,{recursive:true,force:true});}
