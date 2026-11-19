import fs from 'node:fs';
import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
let targets;
for(let i=0;i<45;i++){
  try{targets=await (await fetch('http://127.0.0.1:9222/json')).json();break;}
  catch{await sleep(250);}
}
assert(Array.isArray(targets),'Chrome debugging not available');
const page=targets.find(t=>t.type==='page');
assert(page?.webSocketDebuggerUrl,'Chrome page unavailable');
const socket=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{
  socket.addEventListener('open',resolve,{once:true});
  socket.addEventListener('error',reject,{once:true});
});
let serial=0;
const outstanding=new Map();
socket.addEventListener('message',event=>{
  const data=JSON.parse(String(event.data));
  if(!data.id)return;
  const entry=outstanding.get(data.id);
  if(!entry)return;
  outstanding.delete(data.id);
  if(data.error)entry.reject(new Error(data.error.message));
  else entry.resolve(data.result);
});
function send(method,params={}){
  const id=++serial;
  return new Promise((resolve,reject)=>{
    outstanding.set(id,{resolve,reject});
    socket.send(JSON.stringify({id,method,params}));
  });
}
await send('Page.enable');await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride',{
  width:430,height:932,deviceScaleFactor:3,mobile:true,screenWidth:430,screenHeight:932
});
await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
await send('Page.navigate',{url:'http://127.0.0.1:4181/?smoke=1'});
await sleep(4500);
async function js(expression){
  const response=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(response.exceptionDetails)throw Error('Browser execution failed: '+JSON.stringify(response.exceptionDetails));
  return response.result?.value;
}
async function screen(dest){
  const img=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});
  assert(img?.data,'Browser screenshot missing');
  fs.writeFileSync(dest,Buffer.from(img.data,'base64'));
}
const before=await js('({width:window.innerWidth,dpr:devicePixelRatio,canvasWidth:document.querySelector("#render3d canvas")?.width,canvasHeight:document.querySelector("#render3d canvas")?.height,result:document.querySelector("#resultName")?.textContent,flow:document.documentElement.dataset.tracerActive,triangleCount:document.documentElement.dataset.triangles})');
console.log('BASIN_MOBILE_INITIAL',JSON.stringify(before));
assert(before.width===430&&before.dpr===3,'Not a real mobile viewport');
assert(before.canvasWidth>=430&&before.canvasHeight>=400,'WebGL viewport undersized');
assert(Number(before.triangleCount)>500,'WebGL geometry not rendered');
assert(before.result?.includes('MODEL CHECKS PASS'),'Baseline should be indicative pass');
assert(before.flow==='true','Solving flow must enable water particles');

const australian=await js('({coverage:document.querySelector("#catalogueCoverage")?.textContent,unresolved:document.querySelector("#catalogueBlocked")?.textContent,notice:document.querySelector(".catalogue-approval")?.textContent,items:document.querySelector("#catalogueList")?.textContent})');
console.log('AU_WATERMARK_CATALOGUE',JSON.stringify({coverage:australian.coverage,unresolved:australian.unresolved,notice:australian.notice}));
assert(australian.coverage==='9/11','Australian product mapping missing');
assert(Number(australian.unresolved)>=5,'Unverified physical connections not flagged');
assert(australian.notice?.includes('Not approved for installation'),'Unsafe compliance claim');
assert(australian.items?.includes('WMKA1305')&&australian.items?.includes('D0024088'),'Australian certified product evidence not shown');
await js("(()=>{const b=[...document.querySelectorAll('.part-list button')].find(x=>x.dataset.id==='bend-top');b?.click();return true})()");
const bend=await js('({detail:document.querySelector("#selectedDetail")?.textContent,link:document.querySelector("#selectedDetail a")?.href})');
assert(bend.detail?.includes('D0024088'),'Inspected bend does not show actual product model');
assert(bend.detail?.includes('88°')&&bend.link?.includes('iplex.com.au'),'Bend mismatch or product evidence absent');

const startX=Number(await js('document.documentElement.dataset.tracerX'));
await sleep(350);
const endX=Number(await js('document.documentElement.dataset.tracerX'));
assert(Math.abs(endX-startX)>10,'Water tracer does not move');
await screen('/tmp/basin-mobile-3d.png');
const image=await js('document.querySelector("#render3d canvas").toDataURL("image/png")');
assert(image?.startsWith('data:image/png;base64,'),'GPU framebuffer missing');
fs.writeFileSync('/tmp/basin-3d-frame.png',Buffer.from(image.split(',')[1],'base64'));
assert(fs.statSync('/tmp/basin-3d-frame.png').size>15000,'Unexpectedly empty 3D frame');
await js("(()=>{const el=document.querySelector('#grade');el.value='120';el.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
await sleep(500);
const flat=await js('({result:document.querySelector("#resultName")?.textContent,flow:document.documentElement.dataset.tracerActive,issues:document.querySelector("#issues")?.textContent})');
console.log('BASIN_GRADE_FAULT',JSON.stringify({result:flat.result,flow:flat.flow}));
assert(flat.result?.includes('SOLVER STOPPED')&&flat.issues?.includes('GRADE BENCHMARK FAIL'),'Grade failure not surfaced');
assert(flat.flow==='false','Failed grade must stop water animation');
await js("(()=>{let e=document.querySelector('#grade');e.value='50';e.dispatchEvent(new Event('input',{bubbles:true}));e=document.querySelector('#joistFault');e.checked=true;e.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
await sleep(350);
const joist=await js('({result:document.querySelector("#resultName")?.textContent,flow:document.documentElement.dataset.tracerActive,issues:document.querySelector("#issues")?.textContent})');
assert(joist.result?.includes('SOLVER STOPPED')&&joist.issues?.includes('JOIST INTERFERENCE'),'Structural interference not detected');
assert(joist.flow==='false','Structural error must stop the tracer');
await js("(()=>{let e=document.querySelector('#joistFault');e.checked=false;e.dispatchEvent(new Event('input',{bubbles:true}));e=document.querySelector('#jointFault');e.checked=true;e.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
await sleep(350);
const joint=await js('({result:document.querySelector("#resultName")?.textContent,issues:document.querySelector("#issues")?.textContent})');
assert(joint.result?.includes('SOLVER STOPPED')&&joint.issues?.includes('PORT GAP'),'Open physical socket not detected');
await js("(()=>{const e=document.querySelector('#jointFault');e.checked=false;e.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#modeSection').click();return true})()");
await sleep(400);
const section=await js('({visible:!document.querySelector("#sectionView").hidden,svg:document.querySelector("#sectionSvg")?.innerHTML.length,content:document.querySelector("#sectionSvg")?.textContent})');
assert(section.visible&&section.svg>1200&&section.content.includes('45° wye'),'Section view did not render model');
await screen('/tmp/basin-mobile-section.png');
console.log('BASIN_MOBILE_BROWSER_PASS',JSON.stringify({startX,endX,canvas:before.canvasWidth+'x'+before.canvasHeight,triangles:before.triangleCount,sectionBytes:section.svg}));
socket.close();
