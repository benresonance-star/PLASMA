import fs from 'node:fs';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

const debug='http://127.0.0.1:9222/json';
let targets;
for(let attempt=0;attempt<35;attempt++){
  try{targets=await (await fetch(debug)).json();break;}catch{await sleep(250);}
}
assert(Array.isArray(targets),'Chrome remote debugging not available');
const page=targets.find(t=>t.type==='page');
assert(page?.webSocketDebuggerUrl,'No Chrome page available');
const socket=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{
  socket.addEventListener('open',resolve,{once:true});
  socket.addEventListener('error',reject,{once:true});
});
let serial=0;
const pending=new Map();
socket.addEventListener('message',event=>{
  const data=JSON.parse(String(event.data));
  if(!data.id)return;
  const p=pending.get(data.id);
  if(!p)return;
  pending.delete(data.id);
  if(data.error)p.reject(new Error(data.error.message));
  else p.resolve(data.result);
});
function call(method,params={}){
  const id=++serial;
  return new Promise((resolve,reject)=>{
    pending.set(id,{resolve,reject});
    socket.send(JSON.stringify({id,method,params}));
  });
}
await call('Page.enable');
await call('Runtime.enable');
await call('Emulation.setDeviceMetricsOverride',{
  width:430,height:932,deviceScaleFactor:3,mobile:true,screenWidth:430,screenHeight:932,
});
await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
await call('Page.navigate',{url:'http://127.0.0.1:4173/?smoke=1'});
await sleep(4500);
async function evaluate(expression){
  const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw new Error('Page script failed: '+JSON.stringify(r.exceptionDetails));
  return r.result?.value;
}
const metrics=await evaluate('({width:window.innerWidth,height:window.innerHeight, dpr:window.devicePixelRatio, canvasWidth:document.querySelector("#viewport canvas")?.width, canvasHeight:document.querySelector("#viewport canvas")?.height, objects:document.documentElement.dataset.wetCoreObjects,triangles:document.documentElement.dataset.wetCoreTriangles,connected:document.querySelector("#connected")?.textContent})');
console.log('MOBILE_CDP_METRICS',JSON.stringify(metrics));
assert(metrics.width===430,'Mobile CSS viewport width is incorrect');
assert(metrics.dpr===3,'Device pixel ratio is not emulated');
assert(metrics.canvasWidth>=430&&metrics.canvasHeight>=400,'WebGL canvas is undersized');
assert(Number(metrics.triangles)>1000,'Scene rendered no triangles');
assert(metrics.connected==='5/5','Wet core semantic connectivity UI incomplete');
const full=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});
assert(full?.data,'Missing composed page screenshot');
fs.writeFileSync('/tmp/wet-mobile-cdp.png',Buffer.from(full.data,'base64'));
const data=await evaluate('document.querySelector("#viewport canvas").toDataURL("image/png")');
assert(typeof data==='string'&&data.startsWith('data:image/png;base64,'),'Missing real WebGL framebuffer');
fs.writeFileSync('/tmp/wet-mobile-frame.png',Buffer.from(data.slice('data:image/png;base64,'.length),'base64'));
assert(fs.statSync('/tmp/wet-mobile-frame.png').size>10000,'Unexpectedly small viewport framebuffer');
console.log('MOBILE_CDP_PASS',fs.statSync('/tmp/wet-mobile-cdp.png').size,fs.statSync('/tmp/wet-mobile-frame.png').size);
socket.close();
