import { TerrainError } from "./index.mjs";
const NS="http://www.w3.org/2000/svg";
const fail=message=>{throw new TerrainError("INVALID_PRESENTATION",message);};
const finite=x=>typeof x==="number"&&Number.isFinite(x)&&Math.abs(x)<=1000000;
/** SVG overlay/terrain sink. No world, operation, evaluator or commit capability.
 * Projection coordinates are SVG viewBox units, not world units or snap tolerances.
 */
export function createSvgTerrainSink(svg,{onHit=()=>{},onPointer=()=>{}}={}) {
  if(!svg?.ownerDocument?.createElementNS||typeof onHit!=="function")fail("SVG root and input observer required.");
  const owned=new Map();let serial=0,closed=false,current=null,capture=null;
  function hitFor(frame,p,a) {
    return {surfaceId:frame.surfaceId,generation:frame.generation,frameSequence:frame.frameSequence,
      worldSnapshotRef:frame.worldSnapshotRef,viewContextRef:frame.viewContextRef,
      hitMapRef:p.hitMapRef,semanticAnchorRef:a.semanticAnchorRef};
  }
  function observePointer(event) {
    if(!capture||event.pointerId!==capture.pointerId||!current)return;
    const {frame,p}=current,a=p.anchors.find(a=>a.semanticAnchorRef===capture.anchor);
    if(!a||!a.editable||a.status!=="exact"){cancelPointer();return;}
    const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
    const transform=svg.getScreenCTM();if(!transform){cancelPointer();return;}
    const local=point.matrixTransform(transform.inverse());
    const kind=event.type==="lostpointercapture"?"pointercancel":event.type;
    if(kind==="pointerup"||kind==="pointercancel")cancelPointer();
    event.preventDefault?.();
    onPointer(hitFor(frame,p,a),{kind,pointerId:event.pointerId,x:local.x,y:local.y});
  }
  function cancelPointer() {
    const prior=capture;capture=null;
    if(prior&&svg.hasPointerCapture?.(prior.pointerId))svg.releasePointerCapture(prior.pointerId);
  }
  const pointerTypes=["pointermove","pointerup","pointercancel","lostpointercapture"];
  for(const type of pointerTypes)svg.addEventListener(type,observePointer);
  function element(name,attrs={},text=null) {
    const node=svg.ownerDocument.createElementNS(NS,name);
    for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
    if(text!==null)node.textContent=String(text);
    return node;
  }
  function draw(frame,p) {
    if(closed)fail("SVG sink is closed.");
    if(!Array.isArray(p.surfaces)||p.surfaces.length>2||!Array.isArray(p.anchors)||p.anchors.length>512)
      fail("Bounded surfaces and anchor projection required.");
    for(const mesh of p.surfaces) {
      if(!frame.representations.some(r=>r.responseRef===mesh.responseRef&&r.role===mesh.role)||
         !Array.isArray(mesh.vertices)||mesh.vertices.length>512||!Array.isArray(mesh.triangles)||mesh.triangles.length>1024||
         !Array.isArray(mesh.segments)||mesh.segments.length>256)fail("Invalid or unbound mesh projection.");
      for(const v of mesh.vertices)if(!finite(v.x)||!finite(v.y)||!finite(v.height))fail("Invalid screen vertex.");
      for(const tri of mesh.triangles)if(!Array.isArray(tri)||tri.length!==3||tri.some(i=>!Number.isInteger(i)||!mesh.vertices[i]))fail("Invalid triangle index.");
      for(const edge of mesh.segments)if(!["boundary","breakline"].includes(edge.kind)||!mesh.vertices[edge.a]||!mesh.vertices[edge.b])fail("Invalid segment.");
    }
    for(const a of p.anchors)if(!finite(a.screenX)||!finite(a.screenY)||typeof a.label!=="string"||a.label.length>200)fail("Invalid labelled anchor.");
    const group=element("g",{"data-plasma-surface":frame.surfaceId});
    // Draw order belongs to the host projection (including its depth policy).
    for(const mesh of p.surfaces) {
      const layer=element("g",{"aria-label":mesh.role+" terrain preview",opacity:mesh.role==="accepted"?.9:.45});
      for(const tri of mesh.triangles) {
        const verts=tri.map(i=>mesh.vertices[i]),height=verts.reduce((s,v)=>s+v.height,0)/3;
        const light=Math.max(35,Math.min(86,65+height*.004));
        layer.appendChild(element("polygon",{points:verts.map(v=>v.x+","+v.y).join(" "),
          fill:"hsl(166 24% "+light+"%)",stroke:"#638d83","stroke-width":.6,"vector-effect":"non-scaling-stroke"}));
      }
      for(const edge of mesh.segments){
        const a=mesh.vertices[edge.a],b=mesh.vertices[edge.b];
        layer.appendChild(element("line",{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:edge.kind==="breakline"?"#a94d21":"#244d45",
          "stroke-width":edge.kind==="breakline"?3:2,"vector-effect":"non-scaling-stroke"}));
      }
      group.appendChild(layer);
    }
    const callbacks=[];
    if(p.ghost){
      if(!finite(p.ghost.x)||!finite(p.ghost.y))fail("Invalid ghost position.");
      group.appendChild(element("circle",{cx:p.ghost.x,cy:p.ghost.y,r:10,fill:"none",stroke:"#c55220",
        "stroke-width":2,"stroke-dasharray":"4 3","pointer-events":"none","data-reflex-ghost":"true"}));
    }
    for(const a of p.anchors) {
      const enabled=a.editable&&a.status==="exact";
      const handle=element("g",{"aria-label":a.label,role:enabled?"button":"img",tabindex:enabled?0:-1,
        "aria-disabled":String(!enabled),"data-selected":String(!!a.selected)});
      handle.appendChild(element("circle",{cx:a.screenX,cy:a.screenY,r:12,fill:"transparent","pointer-events":"all"}));
      handle.appendChild(element("circle",{cx:a.screenX,cy:a.screenY,r:a.selected?6:3.5,
        fill:enabled?(a.selected?"#c55220":"#f7faf7"):"#a6afad",stroke:"#244d45","stroke-width":1.5,"pointer-events":"none"}));
      handle.appendChild(element("title",{},a.label));
      const activate=event=>{
        if(!owned.has(handleId)||!enabled)return;
        if(event.type==="keydown"&&!["Enter"," "].includes(event.key))return;
        event.preventDefault?.();
        onHit({surfaceId:frame.surfaceId,generation:frame.generation,frameSequence:frame.frameSequence,
          worldSnapshotRef:frame.worldSnapshotRef,viewContextRef:frame.viewContextRef,
          hitMapRef:p.hitMapRef,semanticAnchorRef:a.semanticAnchorRef},event);
      };
      if(enabled)for(const type of ["click","keydown"]){handle.addEventListener(type,activate);callbacks.push(()=>handle.removeEventListener(type,activate));}
      if(enabled){
        const begin=event=>{
          if(!owned.has(handleId)||capture||event.button!==0||event.isPrimary===false||!p.allowDrag)return;
          capture={pointerId:event.pointerId,anchor:a.semanticAnchorRef};
          svg.setPointerCapture(event.pointerId);observePointer(event);
        };
        handle.addEventListener("pointerdown",begin);callbacks.push(()=>handle.removeEventListener("pointerdown",begin));
      }
      group.appendChild(handle);
    }
    const handleId="svg-visual:"+(++serial);
    svg.appendChild(group);owned.set(handleId,{group,callbacks});current={frame,p,handleId};
    return [handleId];
  }
  function releaseVisuals(handles) {
    for(const id of handles){const item=owned.get(id);if(!item)continue;
      owned.delete(id);item.callbacks.forEach(remove=>remove());item.group.remove();
      if(current?.handleId===id){cancelPointer();current=null;}}
  }
  function dispose(){cancelPointer();releaseVisuals([...owned.keys()]);for(const type of pointerTypes)svg.removeEventListener(type,observePointer);closed=true;}
  return Object.freeze({draw,releaseVisuals,dispose,cancelPointer});
}
