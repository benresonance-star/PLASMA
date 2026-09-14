export function runSvgTests(api) {
 const results=[],assert=(ok,msg="Assertion failed")=>{if(!ok)throw Error(msg);};
 const test=(name,fn)=>{try{fn();results.push({name,status:"pass"});}catch(e){results.push({name,status:"fail",error:e.message});}};
 class Node {
  constructor(name,doc){this.name=name;this.ownerDocument=doc;this.attrs={};this.children=[];this.listeners={};this.parent=null;this.textContent="";}
  setAttribute(k,v){this.attrs[k]=v;}
  appendChild(n){n.parent=this;this.children.push(n);}
  addEventListener(k,fn){this.listeners[k]=fn;}
  removeEventListener(k){delete this.listeners[k];}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;}
 }
 const setup=()=>{const doc={createElementNS:(_,name)=>new Node(name,doc)},svg=new Node("svg",doc),hits=[];
  return {svg,hits,sink:api.createSvgTerrainSink(svg,{onHit:h=>hits.push(h)})};};
 const f=()=>({surfaceId:"surface",generation:1,frameSequence:1,worldSnapshotRef:"world",viewContextRef:"view",representations:[{responseRef:"mesh",role:"candidate"}]});
 const p=()=>({hitMapRef:"hits",anchors:[{semanticAnchorRef:"point",status:"exact",editable:true,screenX:0,screenY:0,label:"Control A",selected:true}],
  surfaces:[{responseRef:"mesh",role:"candidate",vertices:[{x:0,y:0,height:0},{x:10,y:0,height:20},{x:0,y:10,height:0}],triangles:[[0,1,2]],segments:[{a:0,b:1,kind:"breakline"}]}]});
 const all=node=>[node,...node.children.flatMap(all)];
 test("SVG mesh, breakline and accessible control are drawn",()=>{
  const s=setup();s.sink.draw(f(),p());const nodes=all(s.svg);
  assert(nodes.some(n=>n.name==="polygon"));assert(nodes.some(n=>n.name==="line"&&n.attrs.stroke==="#a94d21"));
  assert(nodes.some(n=>n.attrs.role==="button"&&n.attrs["aria-label"]==="Control A"&&n.attrs.tabindex==="0"));
 });
 test("pointer and keyboard produce only anchored observations",()=>{
  const s=setup();s.sink.draw(f(),p());const h=all(s.svg).find(n=>n.attrs.role==="button");
  h.listeners.click({type:"click"});h.listeners.keydown({type:"keydown",key:"Enter"});h.listeners.keydown({type:"keydown",key:"ArrowLeft"});
  assert(s.hits.length===2);assert(s.hits[0].semanticAnchorRef==="point");assert(!("operation" in s.hits[0]));
 });
 test("unresolved controls have no activation listeners",()=>{
  const s=setup(),projection=p();projection.anchors[0].status="lost";projection.anchors[0].editable=false;s.sink.draw(f(),projection);
  assert(!all(s.svg).some(n=>n.attrs.role==="button"));
 });
 test("HTML-looking labels remain text",()=>{
  const s=setup(),projection=p();projection.anchors[0].label="<script>alert(1)</script>";s.sink.draw(f(),projection);
  assert(all(s.svg).some(n=>n.name==="title"&&n.textContent===projection.anchors[0].label));assert(!all(s.svg).some(n=>n.name==="script"));
 });
 test("release removes owned nodes and invalidates old callbacks",()=>{
  const s=setup(),unrelated=new Node("metadata",s.svg.ownerDocument);s.svg.appendChild(unrelated);
  const handles=s.sink.draw(f(),p()),h=all(s.svg).find(n=>n.attrs.role==="button"),saved=h.listeners.click;
  s.sink.releaseVisuals(handles);saved({type:"click"});assert(s.hits.length===0);assert(s.svg.children.length===1);
 });
 test("invalid indices, response roles and nonfinite coordinates fail before mounting",()=>{
  for(const mutate of [p=>p.surfaces[0].triangles=[[0,1,999]],p=>p.surfaces[0].role="accepted",p=>p.surfaces[0].vertices[0].x=Infinity]){
   const s=setup(),projection=p();mutate(projection);let error;try{s.sink.draw(f(),projection);}catch(e){error=e;}
   assert(error?.code==="INVALID_PRESENTATION");assert(s.svg.children.length===0);
  }
 });
 test("dispose clears resources and prevents further draw",()=>{
  const s=setup();s.sink.draw(f(),p());s.sink.dispose();assert(s.svg.children.length===0);let error;
  try{s.sink.draw(f(),p());}catch(e){error=e;}assert(error?.code==="INVALID_PRESENTATION");
 });
 return results;
}
