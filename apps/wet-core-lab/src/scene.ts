import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Point3, WetCoreModel, WetComponent, WetRun, StructuralMember, WetFitting } from '@spds/wet-core';

export type ViewMode='3d'|'plan'|'section';
export type LevelMode='both'|'upper'|'ground';
export interface Layers {
  cold:boolean;hot:boolean;waste:boolean;frame:boolean;ports:boolean;
}
const paints={
  timber:0xba9873,concrete:0xc7c6c1,tile:0xe6e9e6,ceramic:0xf2f3ee,
  ceramicShadow:0xc5d0d0,chrome:0x8f9a9b,steel:0x7b9198,
  cold:0x4f9bcb,hot:0xc78c63,pvc:0x8a9090,black:0x56646b,
};
const pos=(a:Point3)=>new THREE.Vector3(a[0],a[2],a[1]);
const mat=(colour:number,opacity=1,metalness=.12,roughness=.58)=>
  new THREE.MeshStandardMaterial({color:colour,transparent:opacity<1,opacity,
    metalness,roughness,depthWrite:opacity===1,side:THREE.DoubleSide});
function destroy(node:THREE.Object3D):void{
  node.traverse(obj=>{
    if(obj instanceof THREE.Mesh||obj instanceof THREE.Line||obj instanceof THREE.LineSegments){
      obj.geometry.dispose();
      const ms=Array.isArray(obj.material)?obj.material:[obj.material];
      ms.forEach(m=>m.dispose());
    }
    if(obj instanceof THREE.Sprite){
      obj.material.map?.dispose();
      obj.material.dispose();
    }
  });
}
export class WetCoreViewport {
  readonly scene=new THREE.Scene();
  readonly root=new THREE.Group();
  readonly camera=new THREE.OrthographicCamera(-6200,6200,5200,-5200,1,100000);
  readonly controls:OrbitControls;
  readonly renderer:THREE.WebGLRenderer;
  private readonly node:HTMLElement;
  private readonly onSelection:(id:string)=>void;
  private readonly ray=new THREE.Raycaster();
  private readonly mouse=new THREE.Vector2();
  private pointer:{x:number;y:number}|null=null;
  private layers:Layers={cold:true,hot:true,waste:true,frame:true,ports:false};
  private level:LevelMode='both';
  private view:ViewMode='3d';
  constructor(node:HTMLElement,onSelection:(id:string)=>void){
    this.node=node;this.onSelection=onSelection;
    this.scene.background=new THREE.Color(0xe6e9e8);
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});
    this.renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.4;
    node.append(this.renderer.domElement);
    this.scene.add(this.root);
    this.scene.add(new THREE.HemisphereLight(0xffffff,0xc8cfcb,2.2));
    const key=new THREE.DirectionalLight(0xffffff,2.5);
    key.position.set(-4500,11000,7000);this.scene.add(key);
    const fill=new THREE.DirectionalLight(0xd0e2ec,1.0);
    fill.position.set(8000,6000,-5000);this.scene.add(fill);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enableDamping=true;this.controls.dampingFactor=.11;
    this.controls.enablePan=true;this.controls.minZoom=.42;this.controls.maxZoom=4.5;
    this.fit('3d');
    const canvas=this.renderer.domElement;
    canvas.addEventListener('pointerdown',e=>{this.pointer={x:e.clientX,y:e.clientY};});
    canvas.addEventListener('pointerup',e=>{
      if(!this.pointer)return;
      const moved=Math.hypot(this.pointer.x-e.clientX,this.pointer.y-e.clientY);
      this.pointer=null;
      if(moved>7)return;
      const rect=canvas.getBoundingClientRect();
      this.mouse.set((e.clientX-rect.left)/rect.width*2-1,
        -(e.clientY-rect.top)/rect.height*2+1);
      this.ray.setFromCamera(this.mouse,this.camera);
      const picked=this.ray.intersectObjects(this.root.children,true).find(i=>
        typeof i.object.userData.semanticId==='string');
      if(picked)this.onSelection(String(picked.object.userData.semanticId));
    });
    new ResizeObserver(()=>this.resize()).observe(node);
    this.renderer.setAnimationLoop(()=>{this.controls.update();this.renderer.render(this.scene,this.camera);});
  }
  private mesh(geometry:THREE.BufferGeometry,material:THREE.Material,
    center:THREE.Vector3,id?:string):THREE.Mesh{
    const m=new THREE.Mesh(geometry,material);m.position.copy(center);
    if(id)m.userData.semanticId=id;
    this.root.add(m);return m;
  }
  private box(a:Point3,b:Point3,colour:number,opacity=1,id?:string,round=0):THREE.Mesh{
    const sx=b[0]-a[0],sy=b[2]-a[2],sz=b[1]-a[1];
    const geo=round?new RoundedBoxGeometry(sx,sy,sz,3,round):
      new THREE.BoxGeometry(sx,sy,sz);
    return this.mesh(geo,mat(colour,opacity),(pos(a).add(pos(b))).multiplyScalar(.5),id);
  }
  private pipe(a:Point3,b:Point3,diameter:number,colour:number,id:string):void{
    const start=pos(a),end=pos(b),dir=end.clone().sub(start);
    if(dir.lengthSq()<.001)return;
    const obj=this.mesh(new THREE.CylinderGeometry(diameter/2,diameter/2,dir.length(),12),
      mat(colour,1,.28,.42),(start.add(end)).multiplyScalar(.5),id);
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());
  }
  private cylinder(p:Point3,diameter:number,height:number,colour:number,id:string):void{
    this.mesh(new THREE.CylinderGeometry(diameter/2,diameter/2,height,20),
      mat(colour,1,.35,.35),pos(p),id);
  }
  private label(label:string,at:Point3):void{
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=88;
    const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.fillStyle='#718087';ctx.font='600 28px system-ui';ctx.textAlign='center';
    ctx.textBaseline='middle';ctx.fillText(label,256,44,480);
    const texture=new THREE.CanvasTexture(canvas);
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));
    sprite.position.copy(pos(at));sprite.scale.set(1350,240,1);this.root.add(sprite);
  }
  private visible(z:number):boolean{
    return this.level==='both'||(this.level==='upper'?z>=2900:z<2900);
  }
  private floor():void{
    for(const z of [0,3000]){
      if(!this.visible(z+30))continue;
      this.box([0,0,z+5],[4800,3600,z+20],paints.tile,.95,'floor:'+z,3);
      const coords:number[]=[];
      for(let x=0;x<=4800;x+=600)coords.push(x,z+24,0,x,z+24,3600);
      for(let y=0;y<=3600;y+=600)coords.push(0,z+24,y,4800,z+24,y);
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
      this.root.add(new THREE.LineSegments(geometry,
        new THREE.LineBasicMaterial({color:0xc5cfce,opacity:.48,transparent:true})));
    }
    if(this.level!=='ground')this.label('UPPER BATHROOM',[1100,550,3050]);
    if(this.level!=='upper')this.label('LAUNDRY / POWDER',[1150,520,60]);
  }
  private structural(m:WetCoreModel):void{
    if(!this.layers.frame)return;
    for(const s of m.structure){
      const z=(s.minMm[2]+s.maxMm[2])/2;
      if(!this.visible(z)&&s.kind!=='chase-boundary')continue;
      if(s.kind==='chase-boundary'){
        this.box(s.minMm,s.maxMm,0x92a6a6,.065,s.id);continue;
      }
      if(s.kind==='lining'){this.box(s.minMm,s.maxMm,0xb6c4c4,.15,s.id);continue;}
      const colour=s.kind==='slab'?paints.concrete:paints.timber;
      this.box(s.minMm,s.maxMm,colour,s.kind==='slab'?.86:.98,s.id,s.kind==='joist'?2:0);
    }
    // Architectural context is explicitly illustrative; only the structural
    // members above belong to the authored semantic benchmark.
    const levels=[0,3000].filter(z=>this.visible(z+800));
    for(const base of levels){
      for(let x=0;x<4800;x+=450)
        this.box([x,3520,base],[x+45,3565,base+2590],0xb8aa97,.64);
      this.box([0,3520,base+2590],[4800,3565,base+2635],0xb8aa97,.64);
      this.box([0,3570,base],[4800,3582,base+2620],0xc2cccc,.075);
    }
  }
  private fixture(c:WetComponent):void{
    const [x,y,z]=c.originMm,[w,d,h]=c.sizeMm;
    if(c.kind==='water-meter'){
      this.box([x,y,z+300],[x+370,y+250,z+800],0x778f98,1,c.id,26);
      this.cylinder([x+190,y+120,z+821],170,44,0xb1c4c2,c.id);
    }else if(c.kind==='water-heater'){
      this.cylinder([x+325,y+325,z+790],580,1460,0xa8b6b6,c.id);
      this.cylinder([x+325,y+325,z+1540],570,42,0xd4dedd,c.id);
      this.box([x+240,y+3,z+970],[x+410,y+65,z+1160],0x52646c,1,c.id,10);
    }else if(c.kind==='manifold'){
      this.box([x,y,z],[x+w,y+d,z+h],0x829596,.24,c.id,12);
      for(let j=0;j<5;j++){
        this.pipe([x+80+j*60,y+24,z+145],[x+80+j*60,y+d-30,z+145],18,0xad8761,c.id);
        this.cylinder([x+80+j*60,y+d-25,z+152],28,35,0xbca27e,c.id);
      }
    }else if(c.kind==='basin'){
      this.box([x+25,y+20,z+175],[x+w-24,y+d-40,z+348],0xb8b9b2,1,c.id,18);
      this.box([x,y,z+335],[x+w,y+d,z+430],paints.ceramic,1,c.id,27);
      const oval=this.mesh(new THREE.SphereGeometry(1,24,16),
        mat(paints.ceramicShadow,1,.1,.3),pos([x+w/2,y+d*.48,z+430]),c.id);
      oval.scale.set(w*.31,12,d*.29);
      this.cylinder([x+w/2,y+d-65,z+475],26,130,paints.chrome,c.id);
      this.pipe([x+w/2,y+d-65,z+532],[x+w/2,y+d-140,z+532],20,paints.chrome,c.id);
    }else if(c.kind==='shower'){
      this.box([x,y,z+3],[x+w,y+d,z+60],paints.ceramic,1,c.id,20);
      this.cylinder([x+420,y+460,z+65],82,8,0x718990,c.id);
      this.box([x+40,y+30,z+75],[x+50,y+d-40,z+1820],0x88afbf,.16,c.id);
      this.pipe([x+440,y+d-92,z+900],[x+440,y+d-92,z+1820],18,paints.black,c.id);
      this.cylinder([x+440,y+d-92,z+1840],180,24,paints.chrome,c.id);
      this.cylinder([x+430,y+d-108,z+1050],85,26,paints.black,c.id);
    }else if(c.kind==='wc'){
      this.box([x+95,y+95,z+240],[x+520,y+595,z+490],paints.ceramic,1,c.id,98);
      this.box([x+130,y+115,z+477],[x+485,y+590,z+530],0xe5e8e4,1,c.id,82);
      const bowl=this.mesh(new THREE.SphereGeometry(1,20,14),
        mat(0x9dabae),pos([x+310,y+340,z+530]),c.id);
      bowl.scale.set(126,7,168);
      this.box([x+110,y+560,z+520],[x+510,y+700,z+785],paints.ceramic,1,c.id,35);
    }else if(c.kind==='laundry-trough'){
      this.box([x+12,y+15,z+5],[x+w-12,y+d-15,z+h-160],0xc1c5c0,1,c.id,14);
      this.box([x,y,z+h-215],[x+w,y+d,z+h-75],paints.ceramic,1,c.id,22);
      this.box([x+70,y+55,z+h-205],[x+w-80,y+d-65,z+h-106],0x879a9c,1,c.id,22);
      this.cylinder([x+w/2,y+d-80,z+h+5],26,130,paints.chrome,c.id);
    }else if(c.kind==='trap'){
      this.cylinder([x,y,z+45],88,134,0xb3b9b7,c.id);
      this.cylinder([x,y,z+109],58,26,0x889998,c.id);
      this.pipe([x-90,y,z-20],[x+30,y,z-20],32,0x9fa9a7,c.id);
    }else if(c.kind==='sanitary-stack'){
      this.cylinder([2300,1700,2850],110,6350,0xa6b0af,c.id);
      this.cylinder([2300,1700,6040],134,65,0x87908e,c.id);
    }
  }
  private fitting(f:WetFitting):void{
    if(f.kind==='trap')return;
    const p=f.positionMm;
    const size=f.nominalDiameterMm+12;
    if(f.kind==='wye-branch'){
      this.cylinder(p,size+14,76,0xa5afac,f.id);
      this.pipe(p,[p[0]+70,p[1]-44,p[2]+70],size,0xa5afac,f.id);
    }else{
      this.cylinder(p,size+5,Math.max(26,size),f.kind==='press-elbow-90'?0xb99b79:0x9ca6a4,f.id);
    }
  }
  private run(r:WetRun):void{
    const active=r.medium==='cold-water'?this.layers.cold:
      r.medium==='hot-water'?this.layers.hot:this.layers.waste;
    if(!active)return;
    if(this.level!=='both'&&!r.pointsMm.some(p=>this.visible(p[2])))return;
    const color=r.medium==='cold-water'?paints.cold:r.medium==='hot-water'?paints.hot:paints.pvc;
    for(let i=1;i<r.pointsMm.length;i++)
      this.pipe(r.pointsMm[i-1]!,r.pointsMm[i]!,
        r.nominalDiameterMm+(r.medium==='sanitary'?8:3),color,r.id);
  }
  show(m:WetCoreModel,layers:Layers,level:LevelMode,selected:string|null):void{
    for(const child of [...this.root.children]){this.root.remove(child);destroy(child);}
    this.layers=layers;this.level=level;
    this.floor();this.structural(m);
    for(const c of m.components)
      if(level==='both'||this.visible(c.originMm[2]+c.sizeMm[2]/2)||
        c.kind==='sanitary-stack')this.fixture(c);
    for(const r of m.runs)this.run(r);
    for(const f of m.fittings){
      const related=m.runs.find(r=>r.id===f.runId);
      if((f.kind==='wye-branch'||f.kind==='dwv-bend-unverified')&&!layers.waste)continue;
      if(f.kind==='press-elbow-90'&&related){
        if(related.medium==='cold-water'&&!layers.cold)continue;
        if(related.medium==='hot-water'&&!layers.hot)continue;
      }
      if(level==='both'||this.visible(f.positionMm[2]))this.fitting(f);
    }
    if(layers.ports){
      for(const pt of m.ports){
        if(level!=='both'&&!this.visible(pt.positionMm[2]))continue;
        const color=pt.medium==='cold-water'?paints.cold:pt.medium==='hot-water'?paints.hot:paints.pvc;
        this.box([pt.positionMm[0]-15,pt.positionMm[1]-15,pt.positionMm[2]-15],
          [pt.positionMm[0]+15,pt.positionMm[1]+15,pt.positionMm[2]+15],color,1,pt.id,4);
      }
    }
    if(selected){
      const matching:THREE.Object3D[]=[];
      this.root.traverse(o=>{if(o.userData.semanticId===selected)matching.push(o);});
      if(matching.length){
        const bb=new THREE.Box3();matching.forEach(o=>bb.expandByObject(o));
        this.root.add(new THREE.Box3Helper(bb,0x2b738e));
      }
    }
  }
  fit(view:ViewMode=this.view):void{
    this.view=view;
    const center=new THREE.Vector3(2400,2920,1750);
    this.controls.target.copy(center);
    this.camera.up.set(0,1,0);
    if(view==='plan'){
      this.camera.up.set(0,0,-1);
      this.camera.position.copy(center).add(new THREE.Vector3(0,15000,0));
    }else if(view==='section'){
      this.camera.position.copy(center).add(new THREE.Vector3(0,0,15000));
    }else{
      this.camera.position.copy(center).add(new THREE.Vector3(8900,7600,10500));
    }
    this.camera.zoom=1;this.camera.lookAt(center);this.camera.updateProjectionMatrix();
    this.controls.update();this.resize();
  }
  private resize():void{
    const w=Math.max(1,this.node.clientWidth),h=Math.max(1,this.node.clientHeight),aspect=w/h;
    const height=Math.max(9000,6400/aspect);
    this.camera.left=-height*aspect/2;this.camera.right=height*aspect/2;
    this.camera.top=height/2;this.camera.bottom=-height/2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w,h,false);
  }
}
