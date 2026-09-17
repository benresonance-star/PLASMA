// Orthographic inspection camera. Camera state is local view state, never terrain.
export function createTerrainCamera(points) {
  const bounds = axis => [Math.min(...points.map(p => p[axis])), Math.max(...points.map(p => p[axis]))];
  const ranges = ['x','y','z'].map(bounds);
  const center = ranges.map(([lo,hi]) => (lo+hi)/2);
  const fitScale = 520 / Math.max(1, Math.hypot(...ranges.map(([lo,hi]) => hi-lo)));
  let yaw, pitch, zoom, panX, panY;
  const reset = () => { yaw=Math.PI/4; pitch=Math.PI/5; zoom=1; panX=0; panY=0; };
  reset();
  return {
    reset,
    state: () => ({yaw,pitch,zoom,panX,panY}),
    orbit(dx,dy) { yaw=(yaw+dx*.008)%(Math.PI*2); pitch=Math.max(-Math.PI/2+.01,Math.min(Math.PI/2-.01,pitch+dy*.008)); },
    pan(dx,dy) { panX=Math.max(-10000,Math.min(10000,panX+dx)); panY=Math.max(-10000,Math.min(10000,panY+dy)); },
    zoomAt(factor,x=400,y=320) {
      const next=Math.max(.15,Math.min(20,zoom*factor)),ratio=next/zoom;
      panX=x-400-(x-400-panX)*ratio; panY=y-320-(y-320-panY)*ratio; zoom=next;
    },
    project(p) {
      const x=p.x-center[0], y=p.y-center[1], z=p.z-center[2];
      const horizontal=x*Math.cos(yaw)-y*Math.sin(yaw), forward=x*Math.sin(yaw)+y*Math.cos(yaw);
      return {x:400+panX+horizontal*fitScale*zoom,
        y:320+panY+(forward*Math.sin(pitch)-z*Math.cos(pitch))*fitScale*zoom,
        depth:forward*Math.cos(pitch)+z*Math.sin(pitch)};
    }
  };
}

export function attachTerrainNavigation(svg,{camera,enabled,onChange}) {
  const pointers=new Map(),listeners=[];let moved=false,frame=null;
  const draw=()=>{if(frame===null)frame=requestAnimationFrame(()=>{frame=null;onChange();});};
  const local=e=>{
    const point=svg.createSVGPoint();point.x=e.clientX;point.y=e.clientY;
    return point.matrixTransform(svg.getScreenCTM().inverse());
  };
  const listen=(type,handler,options={capture:true})=>{svg.addEventListener(type,handler,options);listeners.push(()=>svg.removeEventListener(type,handler,options));};
  function clear(){for(const id of pointers.keys())if(svg.hasPointerCapture(id))svg.releasePointerCapture(id);pointers.clear();}
  listen('pointerdown',e=>{
    if(!enabled()||![0,1,2].includes(e.button))return;
    if(!pointers.size)moved=false;
    const p=local(e);pointers.set(e.pointerId,{...{x:p.x,y:p.y},pan:e.shiftKey||e.button!==0});
    svg.setPointerCapture(e.pointerId);svg.focus({preventScroll:true});e.preventDefault();e.stopImmediatePropagation();
  });
  listen('pointermove',e=>{
    const prior=pointers.get(e.pointerId);if(!prior||!enabled())return;
    const p=local(e),dx=p.x-prior.x,dy=p.y-prior.y;
    if(Math.abs(dx)+Math.abs(dy)<.1)return;
    moved=true;
    if(pointers.size===2){
      const other=[...pointers.entries()].find(([id])=>id!==e.pointerId)[1];
      const before=Math.hypot(prior.x-other.x,prior.y-other.y),after=Math.hypot(p.x-other.x,p.y-other.y);
      camera.pan(dx/2,dy/2);
      if(before>1&&after>1)camera.zoomAt(after/before,(p.x+other.x)/2,(p.y+other.y)/2);
    }else if(prior.pan||e.shiftKey)camera.pan(dx,dy);else camera.orbit(dx,dy);
    pointers.set(e.pointerId,{x:p.x,y:p.y,pan:prior.pan});draw();e.preventDefault();e.stopImmediatePropagation();
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(type,e=>{
    if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);
    if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);
    e.preventDefault();e.stopImmediatePropagation();
  });
  listen('click',e=>{if(enabled()&&moved){e.preventDefault();e.stopImmediatePropagation();moved=false;}});
  listen('contextmenu',e=>{if(enabled())e.preventDefault();});
  listen('wheel',e=>{
    if(!enabled())return;const p=local(e),delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?640:1);
    camera.zoomAt(Math.exp(-Math.max(-600,Math.min(600,delta))*.002),p.x,p.y);draw();e.preventDefault();e.stopImmediatePropagation();
  },{capture:true,passive:false});
  listen('keydown',e=>{
    if(!enabled())return;
    const directions={ArrowLeft:[-12,0],ArrowRight:[12,0],ArrowUp:[0,-12],ArrowDown:[0,12]};
    if(directions[e.key]){const [x,y]=directions[e.key];if(e.shiftKey)camera.pan(x,y);else camera.orbit(x,y);}
    else if(['+','='].includes(e.key))camera.zoomAt(1.2);
    else if(e.key==='-')camera.zoomAt(1/1.2);
    else if(e.key==='Home')camera.reset();else return;
    draw();e.preventDefault();e.stopImmediatePropagation();
  });
  return {cancel:clear,dispose(){clear();if(frame!==null)cancelAnimationFrame(frame);listeners.forEach(remove=>remove());}};
}
