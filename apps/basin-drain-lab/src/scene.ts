import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import type {BasinModel,FlowSolution,Point3,Component,Member} from '@spds/basin-drain-core';

export interface Layers {frame:boolean;joints:boolean;water:boolean;}
const P={wood:0xb98f61,frame:0x896d54,finish:0xdde1db,lining:0xb2c3c3,
  pvc:0x397f92,fitting:0x508392,soil:0x637985,ceramic:0xf2f4ee,
  chrome:0x819ca4,water:0x0f9ccd,warning:0xd76e5b,sleeve:0x9ba7a2,
  background:0xe7eae6};
const V=(p:Point3):THREE.Vector3=>new THREE.Vector3(p[0],p[2],p[1]);
const material=(colour:number,opacity=1,metalness=.05)=>{
  return new THREE.MeshStandardMaterial({color:colour,roughness:.54,metalness,
    transparent:opacity<1,opacity,side:THREE.DoubleSide,depthWrite:opacity===1});
};
function dispose(node:THREE.Object3D):void{
  node.traverse(o=>{
    if(o instanceof THREE.Mesh||o instanceof THREE.Line||o instanceof THREE.LineSegments){
      o.geometry.dispose();
      const mats=Array.isArray(o.material)?o.material:[o.material];
      mats.forEach(m=>m.dispose());
    }
  });
}
export class DrainViewport {
  readonly scene=new THREE.Scene();
  readonly root=new THREE.Group();
  readonly camera=new THREE.OrthographicCamera(-4800,4800,4200,-4200,1,40000);
  readonly renderer:THREE.WebGLRenderer;
  readonly controls:OrbitControls;
  private readonly host:HTMLElement;
  private readonly onSelect:(id:string)=>void;
  private readonly ray=new THREE.Raycaster();
  private readonly pointer=new THREE.Vector2();
  private pointerDown:{x:number;y:number}|null=null;
  private readonly particles:THREE.Mesh[]=[];
  private progress=0;
  private solution:FlowSolution|null=null;
  private model:BasinModel|null=null;
  private playing=true;
  private showWater=true;
  private selected:string|null=null;
  constructor(host:HTMLElement,onSelect:(id:string)=>void){
    this.host=host;this.onSelect=onSelect;this.scene.background=new THREE.Color(P.background);
    const debug=new URLSearchParams(window.location.search).has('smoke');
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power',preserveDrawingBuffer:debug});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.06;
    host.append(this.renderer.domElement);
    this.scene.add(this.root);
    this.scene.add(new THREE.HemisphereLight(0xffffff,0xcfd7d5,1.7));
    const key=new THREE.DirectionalLight(0xffffff,2.0);key.position.set(-6500,9000,-4000);this.scene.add(key);
    const fill=new THREE.DirectionalLight(0xbddbea,.6);fill.position.set(7500,6500,5000);this.scene.add(fill);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enableDamping=true;this.controls.dampingFactor=.08;this.controls.minZoom=.5;this.controls.maxZoom=9;
    this.controls.target.set(1550,3230,1200);
    this.fit();
    const canvas=this.renderer.domElement;
    canvas.addEventListener('pointerdown',event=>{this.pointerDown={x:event.clientX,y:event.clientY};});
    canvas.addEventListener('pointerup',event=>{
      if(!this.pointerDown)return;
      const move=Math.hypot(this.pointerDown.x-event.clientX,this.pointerDown.y-event.clientY);
      this.pointerDown=null;
      if(move>7)return;
      const rect=canvas.getBoundingClientRect();
      this.pointer.set((event.clientX-rect.x)/rect.width*2-1,1-(event.clientY-rect.y)/rect.height*2);
      this.ray.setFromCamera(this.pointer,this.camera);
      const hit=this.ray.intersectObjects(this.root.children,true).find(h=>h.object.userData.id);
      if(hit)this.onSelect(String(hit.object.userData.id));
    });
    new ResizeObserver(()=>this.resize()).observe(host);
    let prev=performance.now();
    let capture=false;
    this.renderer.setAnimationLoop(now=>{
      const dt=Math.min(.06,Math.max(0,(now-prev)/1000));prev=now;
      if(this.playing)this.progress+=dt;
      this.updateWater();
      this.controls.update();this.renderer.render(this.scene,this.camera);
      if(debug&&!capture&&now>1500){
        capture=true;
        document.documentElement.dataset.drawCalls=String(this.renderer.info.render.calls);
        document.documentElement.dataset.triangles=String(this.renderer.info.render.triangles);
        document.documentElement.dataset.canvasWidth=String(canvas.width);
        document.documentElement.dataset.canvasHeight=String(canvas.height);
        document.documentElement.dataset.scenePng=canvas.toDataURL('image/png');
      }
    });
  }
  private object(geo:THREE.BufferGeometry,mat:THREE.Material,at:THREE.Vector3,id:string):THREE.Mesh{
    const mesh=new THREE.Mesh(geo,mat);mesh.position.copy(at);mesh.userData.id=id;this.root.add(mesh);
    return mesh;
  }
  private box(a:Point3,b:Point3,color:number,opacity:number,id:string,round=0):THREE.Mesh{
    const s=[b[0]-a[0],b[2]-a[2],b[1]-a[1]] as const;
    const geo=round?new RoundedBoxGeometry(s[0],s[1],s[2],4,Math.min(round,...s.map(v=>v/3))):
      new THREE.BoxGeometry(...s);
    return this.object(geo,material(color,opacity),V(a).add(V(b)).multiplyScalar(.5),id);
  }
  private tube(path:readonly Point3[],diameter:number,color:number,id:string,curved=false,opacity=1):void{
    if(path.length<2)return;
    const pts=path.map(V);
    const line=curved&&path.length>2?new THREE.CatmullRomCurve3(pts,false,'centripetal'):
      new THREE.CatmullRomCurve3(pts,false,'chordal');
    const steps=Math.max(8,Math.ceil(path.length*7));
    const geo=new THREE.TubeGeometry(line,steps,diameter/2,12,false);
    this.object(geo,material(color,opacity,.12),new THREE.Vector3(),id);
  }
  private cylinder(a:Point3,b:Point3,diameter:number,color:number,id:string,opacity=1):void{
    const p=V(a),q=V(b),vec=q.clone().sub(p),d=vec.length();
    if(d<1)return;
    const mesh=this.object(new THREE.CylinderGeometry(diameter/2,diameter/2,d,20),
      material(color,opacity,.22),p.add(q).multiplyScalar(.5),id);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),vec.normalize());
  }
  private sleeve(p:Point3,axis:'Y'|'Z',od:number,id:string):void{
    const len=axis==='Z'?82:145;
    const half=len/2;
    const a=axis==='Z'?[p[0],p[1],p[2]-half] as Point3:[p[0],p[1]-half,p[2]] as Point3;
    const b=axis==='Z'?[p[0],p[1],p[2]+half] as Point3:[p[0],p[1]+half,p[2]] as Point3;
    this.cylinder(a,b,od,P.sleeve,id,.34);
    this.cylinder(a,b,od+8,0x9ab3a7,id,.15);
  }
  private floorWithHole(member:Member,p:Point3,half:number):void{
    const {min:a,max:b}=member;
    if(member.kind==='ceiling'){this.box(a,b,0xa9bab9,.06,member.id);return;}
    const fragments:[
      [Point3,Point3],[Point3,Point3],[Point3,Point3],[Point3,Point3]
    ]=[
      [[a[0],a[1],a[2]],[p[0]-half,b[1],b[2]]],
      [[p[0]+half,a[1],a[2]],[b[0],b[1],b[2]]],
      [[p[0]-half,a[1],a[2]],[p[0]+half,p[1]-half,b[2]]],
      [[p[0]-half,p[1]+half,a[2]],[p[0]+half,b[1],b[2]]],
    ];
    for(const [lo,hi] of fragments)this.box(lo,hi,member.kind==='floor-finish'?0xe2e5e0:0xbdc8c6,.25,member.id);
  }
  private wallWithHole(member:Member,p:Point3,half:number):void{
    const {min:a,max:b}=member;
    const rects:[
      [Point3,Point3],[Point3,Point3],[Point3,Point3],[Point3,Point3]
    ]=[
      [[a[0],a[1],a[2]],[p[0]-half,b[1],b[2]]],
      [[p[0]+half,a[1],a[2]],[b[0],b[1],b[2]]],
      [[p[0]-half,a[1],a[2]],[p[0]+half,b[1],p[2]-half]],
      [[p[0]-half,a[1],p[2]+half],[p[0]+half,b[1],b[2]]],
    ];
    for(const [lo,hi] of rects)this.box(lo,hi,P.lining,.14,member.id);
  }
  private basin():void{
    // Generic fixture family, not a manufacturer-specific sculpted ceramic basin.
    this.box([530,665,3720],[1150,920,3820],0xc1caca,.98,'basin',33);
    const bowl=this.object(new THREE.SphereGeometry(1,28,16),material(P.ceramic,.98),
      V([840,740,3835]),'basin');
    bowl.scale.set(325,92,205);
    const mouth=this.object(new THREE.SphereGeometry(1,28,16),material(0xb9c8cc,.96),
      V([840,766,3890]),'basin');
    mouth.scale.set(230,16,133);
    this.cylinder([850,870,3870],[850,870,3990],21,P.chrome,'basin');
    this.cylinder([850,870,3985],[850,795,3985],22,P.chrome,'basin');
    this.cylinder([850,830,3520],[850,830,3670],40,P.chrome,'basin');
    this.box([610,904,3410],[1060,930,3510],0x8b9ba3,.38,'basin');
  }
  private renderedComponent(c:Component):void {
    if(c.id==='basin'){this.basin();return;}
    if(c.id==='wye'){
      const a=c.path[0]!,j=c.path[1]!;
      this.cylinder(a,j,53,P.fitting,c.id);
      this.cylinder([2660,1110,2940],[2660,1110,2580],110,P.soil,c.id,.84);
      this.cylinder(a,[a[0]+25,a[1],a[2]-25],61,0x9caaab,c.id);
      return;
    }
    if(c.id==='cleanout'){
      this.cylinder(c.path[0]!,c.path[1]!,73,0x738792,c.id);
      this.cylinder([2740,1110,2440],[2762,1110,2440],90,0x98a9ae,c.id);
      return;
    }
    const diam=c.id==='stack'?110:43;
    const curved=c.id==='trap'||c.family==='long-sweep-90';
    this.tube(c.path,diam,c.family==='long-sweep-90'?P.fitting:
      c.id==='stack'?P.soil:P.pvc,c.id,curved,c.id==='stack'?.82:.95);
  }
  private jointRings(m:BasinModel):void {
    const byPort=new Map(m.ports.map(p=>[p.id,p]));
    const byComp=new Map(m.components.map(c=>[c.id,c]));
    for(const j of m.joints){
      const a=byPort.get(j.from);if(!a)continue;
      const owner=byComp.get(a.ownerId);if(!owner)continue;
      const direction=a.normal;const radius=a.dn===100?120:56;
      const to:[number,number,number]=[
        a.at[0]+direction[0]*26,a.at[1]+direction[1]*26,a.at[2]+direction[2]*26,
      ];
      this.cylinder(a.at,to,radius,P.fitting,j.id);
    }
  }
  private supports(m:BasinModel):void {
    const {gradedStart,gradedEnd}=m;
    for(const support of m.supports){
      const x=support.at[0],u=(x-gradedStart[0])/(gradedEnd[0]-gradedStart[0]);
      const z=gradedStart[2]+u*(gradedEnd[2]-gradedStart[2]);
      const low:Point3=[x,1110,z-52],high:Point3=[x,1110,z-26];
      this.cylinder(low,high,65,P.wood,support.id);
      this.box([x-17,1040,z+40],[x+17,1085,z+85],P.frame,.95,support.id,3);
      this.cylinder([x,1085,z+65],[x,1110,z+10],11,P.frame,support.id);
    }
  }
  private framing(m:BasinModel,conflicts:Set<string>):void {
    const holeFloor=m.penetrations.find(p=>p.id==='opening:floor')!;
    const holeWall=m.penetrations.find(p=>p.id==='opening:wall')!;
    for(const b of m.framing){
      if(b.kind==='floor-sheet'||b.kind==='floor-finish'||b.kind==='ceiling'){
        this.floorWithHole(b,holeFloor.at,65);continue;
      }
      if(b.kind==='lining'){this.wallWithHole(b,holeWall.at,58);continue;}
      const risky=conflicts.has(b.id);
      this.box(b.min,b.max,risky?P.warning:P.wood,b.kind==='stud'?.28:.41,b.id,2);
    }
    for(const p of m.penetrations)this.sleeve(p.at,p.axis,p.sleeveODMm,p.id);
  }
  show(model:BasinModel,result:FlowSolution,layers:Layers,selected:string|null,playing:boolean):void {
    this.particles.length=0;
    for(const obj of [...this.root.children]){this.root.remove(obj);dispose(obj);}
    this.model=model;this.solution=result;this.showWater=layers.water;this.playing=playing;this.selected=selected;
    const clashes=new Set<string>();
    if(result.findings.some(f=>f.code==='JOIST_INTERFERENCE'))clashes.add('floor:joist:test-collision');
    if(layers.frame)this.framing(model,clashes);
    for(const c of model.components)this.renderedComponent(c);
    this.supports(model);
    if(layers.joints)this.jointRings(model);
    if(selected){
      const bbox=new THREE.Box3(),hits:THREE.Object3D[]=[];
      this.root.traverse(obj=>{if(obj.userData.id===selected)hits.push(obj);});
      hits.forEach(obj=>bbox.expandByObject(obj));
      if(hits.length)this.root.add(new THREE.Box3Helper(bbox,0x2289a6));
    }
    const geometry=new THREE.SphereGeometry(7.5,10,8);
    const beadMaterial=new THREE.MeshStandardMaterial({
      color:0x028bc6,emissive:0x0a9dda,emissiveIntensity:.65,roughness:.23
    });
    for(let i=0;i<13;i++){
      const bead=new THREE.Mesh(geometry.clone(),beadMaterial.clone());
      bead.userData.id='water:tracer';this.root.add(bead);this.particles.push(bead);
    }
    geometry.dispose();beadMaterial.dispose();
    this.updateWater();
  }
  setPlaying(on:boolean):void {this.playing=on;}
  get progressSeconds():number{return this.progress;}
  private updateWater():void {
    const s=this.solution,m=this.model;
    const valid=!!s&&!!m&&s.status==='indicative-pass'&&this.showWater&&
      s.velocityMps!==null&&s.waterDepthMm!==null&&s.velocityMps>0;
    for(const bead of this.particles)bead.visible=valid;
    if(new URLSearchParams(window.location.search).has('smoke')){
      document.documentElement.dataset.tracerActive=String(valid);
    }
    if(!valid||!s||!m||s.velocityMps===null||s.waterDepthMm===null)return;
    const start=m.gradedStart,end=m.gradedEnd;
    const length=end[0]-start[0];
    const advance=(this.progress*s.velocityMps*1000)/length;
    for(let i=0;i<this.particles.length;i++){
      const u=((advance+i/this.particles.length)%1+1)%1;
      const x=start[0]+u*length,z=start[2]+u*(end[2]-start[2]);
      const height=-m.input.diameterMm/2+s.waterDepthMm*(.25+.4*((i%3)/2));
      this.particles[i]!.position.copy(V([x,1110+(i%3-1)*6,z+height]));
      if(i===0&&new URLSearchParams(window.location.search).has('smoke'))document.documentElement.dataset.tracerX=String(x);
    }
  }
  fit():void {
    const center=new THREE.Vector3(1730,3180,1150);
    this.controls.target.copy(center);
    this.camera.position.copy(center).add(new THREE.Vector3(4600,5500,-7300));
    this.camera.up.set(0,1,0);
    this.camera.lookAt(center);this.camera.zoom=1;this.camera.updateProjectionMatrix();
    this.controls.update();this.resize();
  }
  private resize():void {
    const w=Math.max(1,this.host.clientWidth),h=Math.max(1,this.host.clientHeight),aspect=w/h;
    const height=Math.max(6200,4300/aspect);
    this.camera.left=-height*aspect/2;this.camera.right=height*aspect/2;
    this.camera.top=height/2;this.camera.bottom=-height/2;
    this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);
  }
}
