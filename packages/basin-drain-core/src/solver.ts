import {inspectAustralianProducts} from './australian-catalogue.js';
import type {BasinModel,Finding,FindingCode,FlowSolution,Point3,Port} from './types.js';
const distance=(a:Point3,b:Point3):number=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const dot=(a:readonly number[],b:readonly number[]):number=>a.reduce((s,v,i)=>s+v*b[i]!,0);
function intersectSegment(a:Point3,b:Point3,low:Point3,high:Point3,inflate:number):boolean {
  let enter=0,exit=1;
  for(let k=0;k<3;k++){
    const d=b[k]!-a[k]!;
    if(Math.abs(d)<1e-9){
      if(a[k]!<low[k]!-inflate||a[k]!>high[k]!+inflate)return false;
    }else{
      const p=(low[k]!-inflate-a[k]!)/d,q=(high[k]!+inflate-a[k]!)/d;
      enter=Math.max(enter,Math.min(p,q));exit=Math.min(exit,Math.max(p,q));
      if(enter>exit)return false;
    }
  }
  return true;
}
interface Section {readonly areaM2:number;readonly wettedPerimeterM:number;readonly dischargeM3s:number;}
/** Steady, uniform, partly-full circular open-channel calculation; no transients or vent pressures. */
function circularSection(Dm:number,n:number,slope:number,depthFraction:number):Section {
  if(depthFraction<=0||slope<=0)return {areaM2:0,wettedPerimeterM:0,dischargeM3s:0};
  const f=Math.min(1,depthFraction);
  const theta=2*Math.acos(1-2*f);
  const area=(Dm*Dm/8)*(theta-Math.sin(theta));
  const perimeter=Dm*theta/2;
  const radius=area/perimeter;
  return {areaM2:area,wettedPerimeterM:perimeter,
    dischargeM3s:area*Math.pow(radius,2/3)*Math.sqrt(slope)/n};
}
export function manningPartFull(Dmm:number,n:number,slope:number,qLps:number):{
  capacityLps:number;depthMm:number|null;fillPercent:number|null;velocityMps:number|null;
} {
  if(!Number.isFinite(Dmm)||Dmm<=0||!Number.isFinite(n)||n<=0||
    !Number.isFinite(slope)||!Number.isFinite(qLps)||qLps<0)
    throw Error('Invalid Manning hydraulic input');
  if(slope<=0)return {capacityLps:0,depthMm:null,fillPercent:null,velocityMps:null};
  const D=Dmm/1000;
  let maxFraction=0,maxQ=0;
  for(let i=1;i<=1000;i++){
    const f=i/1000;
    const q=circularSection(D,n,slope,f).dischargeM3s;
    if(q>maxQ){maxQ=q;maxFraction=f;}
  }
  const capacity=maxQ*1000;
  if(qLps===0)return {capacityLps:capacity,depthMm:0,fillPercent:0,velocityMps:0};
  if(qLps>capacity+1e-9)return {capacityLps:capacity,
    depthMm:null,fillPercent:null,velocityMps:null};
  let lo=0,hi=maxFraction;
  for(let i=0;i<72;i++){
    const mid=(lo+hi)/2;
    if(circularSection(D,n,slope,mid).dischargeM3s*1000<qLps)lo=mid;else hi=mid;
  }
  const depth=(lo+hi)/2;
  const section=circularSection(D,n,slope,depth);
  return {capacityLps:capacity,depthMm:depth*Dmm,fillPercent:100*depth,
    velocityMps:(qLps/1000)/section.areaM2};
}
function connected(model:BasinModel):boolean {
  const edges=new Map<string,string[]>();
  const link=(a:string,b:string)=>edges.set(a,[...(edges.get(a)??[]),b]);
  for(const component of model.components)for(const [a,b] of component.internalLinks)link(a,b);
  for(const joint of model.joints)link(joint.from,joint.to);
  const visited=new Set<string>(),queue=['basin:out'];
  while(queue.length){
    const p=queue.shift()!;
    if(p==='stack:out')return true;
    if(visited.has(p))continue;
    visited.add(p);
    queue.push(...(edges.get(p)??[]));
  }
  return false;
}
export function solveBasinDrain(model:BasinModel):FlowSolution {
  const findings:Finding[]=[],verifiedChecks:string[]=[];
  const report=(code:FindingCode,severity:Finding['severity'],ownerId:string,description:string)=>
    findings.push({code,severity,ownerId,description});
  const byPort=new Map(model.ports.map(p=>[p.id,p]));
  const byComponent=new Map(model.components.map(c=>[c.id,c]));
  const idOf=(port:Port)=>port.ownerId;
  const requiredJointNames=['basin:out','trap:out','adapter:out','pipe-wall:out',
    'bend-top:out','dropper:out','bend-bottom:out','grade-branch:out','wye:stack-out'];
  for(const upstream of requiredJointNames){
    if(!model.joints.some(j=>j.from===upstream))
      report('MISSING_JOINT','block',upstream,'No physical connection is defined for the required outlet');
  }
  for(const joint of model.joints){
    const a=byPort.get(joint.from),b=byPort.get(joint.to);
    if(!a||!b){report('MISSING_JOINT','block',joint.id,'Connection references a missing port');continue;}
    const gap=distance(a.at,b.at);
    if(gap>1.0)report('PORT_GAP','block',joint.id,'Port centres are '+gap.toFixed(1)+' mm apart (maximum assumed 1.0 mm)');
    if(dot(a.normal,b.normal)>-.95)
      report('PORT_DIRECTION','block',joint.id,'Connection-port axes do not oppose within accepted orientation tolerance');
    if(a.dn!==b.dn)report('PORT_DIAMETER','block',joint.id,'Nominal pipe sizes incompatible; specified reducer required');
    if(!byComponent.has(idOf(a))||!byComponent.has(idOf(b)))
      report('MISSING_JOINT','block',joint.id,'One joined component is missing');
  }
  verifiedChecks.push('Nine directed connection definitions checked for coincident ports, opposite axes and DN.');
  for(const id of ['bend-top','bend-bottom']){
    const fitting=byComponent.get(id);
    if(!fitting||fitting.path.length<3){
      report('FITTING_ANGLE','block',id,'Swept bend geometry missing');continue;
    }
    const path=fitting.path;
    const inVec=path[1]!.map((v,k)=>v-path[0]![k]!) as number[];
    const outVec=path[path.length-1]!.map((v,k)=>v-path[path.length-2]![k]!) as number[];
    const angle=Math.acos(Math.max(-1,Math.min(1,
      dot(inVec,outVec)/(Math.hypot(...inVec)*Math.hypot(...outVec)))))*180/Math.PI;
    if(Math.abs(angle-90)>3)report('FITTING_ANGLE','block',id,'Generic 90° fitting has incorrect port centreline angle ('+angle.toFixed(1)+'°)');
  }
  const wye=byComponent.get('wye');
  if(!wye||wye.path.length<3){
    report('FITTING_ANGLE','block','wye','Branch wye geometric path missing');
  }else{
    const a=model.gradedStart,b=model.gradedEnd,c=wye.path[1]!;
    const v1=[b[0]-a[0],b[1]-a[1],b[2]-a[2]];
    const v2=[c[0]-b[0],c[1]-b[1],c[2]-b[2]];
    const angle=Math.acos(Math.max(-1,Math.min(1,
      dot(v1,v2)/(Math.hypot(...v1)*Math.hypot(...v2)))))*180/Math.PI;
    if(Math.abs(angle-45)>5)
      report('FITTING_ANGLE','block','wye','45° branch geometry mismatch ('+angle.toFixed(1)+'°)');
  }
  verifiedChecks.push('Nominal 90°/45° centreline change angles checked against type, not manufacturer geometry.');
  if(!connected(model))report('NO_CONNECTED_ROUTE','block','basin','No directed basin-to-stack outlet path');
  else verifiedChecks.push('Directed connection graph reaches stack outlet from basin fixture outlet.');
  for(const member of model.framing.filter(m=>m.structural)){
    for(const part of model.components.filter(c=>c.id!=='basin'&&c.id!=='cleanout')){
      for(let i=1;i<part.path.length;i++){
        if(intersectSegment(part.path[i-1]!,part.path[i]!,member.min,member.max,part.id==='stack'?55:25)){
          report('JOIST_INTERFERENCE','block',part.id,'Pipe/fitting intersects structural '+member.id);
          break;
        }
      }
    }
  }
  verifiedChecks.push('Centreline + nominal radial envelope checked against modelled studs, plates and joists.');
  for(const pen of model.penetrations){
    for(const host of pen.hostIds){
      if(!model.framing.some(m=>m.id===host))
        report('PENETRATION_CONFLICT','block',pen.id,'Opening host does not exist: '+host);
    }
    const radius=pen.boreDiameterMm/2;
    for(const member of model.framing.filter(m=>m.structural)){
      const p=pen.at;
      const axis=pen.axis==='Z'?2:1;
      const axes=[0,1,2].filter(k=>k!==axis);
      const near=axes.every(k=>p[k]!>=member.min[k]!-radius&&p[k]!<=member.max[k]!+radius);
      const across=p[axis]!>=member.min[axis]!-75&&p[axis]!<=member.max[axis]!+75;
      if(near&&across)
        report('PENETRATION_CONFLICT','block',pen.id,'Proposed opening conflicts with structural '+member.id);
    }
  }
  verifiedChecks.push('Wall and sheathing sleeves located; structural clearances measured against framing proxy.');
  const ordered=[model.gradedStart[0],...model.supports.map(s=>s.at[0]),model.gradedEnd[0]].sort((a,b)=>a-b);
  for(let i=1;i<ordered.length;i++){
    const gap=ordered[i]!-ordered[i-1]!;
    if(gap>800)report('SUPPORT_SPACING','block','grade-branch','Unsupported span '+gap.toFixed(0)+' mm exceeds benchmark assumption 800 mm');
  }
  verifiedChecks.push('Modelled supports assessed against illustrative 800 mm maximum span.');
  const dx=Math.hypot(model.gradedEnd[0]-model.gradedStart[0],
    model.gradedEnd[1]-model.gradedStart[1]);
  const fall=model.gradedStart[2]-model.gradedEnd[2];
  const slope=dx>0?fall/dx:0;
  if(slope<=0)report('REVERSE_GRADE','block','grade-branch','Branch invert does not fall towards stack');
  else if(slope+1e-10<model.input.gradeBenchmarkMin)
    report('GRADE_BENCHMARK_FAIL','block','grade-branch','Slope 1:'+Math.round(1/slope)+' is flatter than illustrative 1:80 benchmark');
  const hydro=manningPartFull(model.input.diameterMm,model.input.n,slope,model.input.dischargeLps);
  if(model.input.dischargeLps>hydro.capacityLps+1e-9)
    report('HYDRAULIC_OVERLOAD','block','grade-branch','Requested flow '+model.input.dischargeLps.toFixed(3)+' L/s exceeds steady Manning capacity '+hydro.capacityLps.toFixed(3)+' L/s');
  verifiedChecks.push('Steady uniform partially-full circular Manning equation evaluated for graded branch only.');
  const productGate=inspectAustralianProducts(model);
  report('UNVERIFIED_PRODUCT','review','catalogue',
    productGate.productMatchedCount+' of '+model.components.length+' model components mapped to named Australian WaterMark-listed product candidates; '+
    productGate.blockedComponents.length+' still have unresolved connection/geometry selection requirements. '+
    'ABCB register active status and installed combination have not been verified.');
  report('UNVERIFIED_TRAP_SEAL','review','trap','Dynamic trap seal loss and pressure fluctuation not modelled');
  report('UNVERIFIED_VENT','review','stack','Airflow, ventilation and downstream pressure boundary conditions not solved');
  report('UNVERIFIED_DETAIL','review','openings','Waterproofing, acoustic/fire seals, structural consent, socket assembly and cleanout access not verified');
  report('UNVERIFIED_CODE','review',model.id,'No NCC 2025 / AS/NZS 3500.2:2025 deemed-to-satisfy or performance compliance assessment completed');
  report('UNVERIFIED_DISCHARGE','review','basin','Fixture peak discharge of '+model.input.dischargeLps+' L/s is an input assumption, not a fixture-unit calculation');
  const blocked=findings.some(f=>f.severity==='block');
  const status=blocked?'blocked':model.input.dischargeLps===0?'off':'indicative-pass';
  return {modelId:model.id,status,solver:'manning-part-full-uniform-flow/v0.1',
    compliance:'not-verified',dischargeLps:model.input.dischargeLps,
    branchLengthMm:dx,fallMm:fall,grade:slope,
    capacityLps:hydro.capacityLps,
    waterDepthMm:hydro.depthMm,fillPercent:hydro.fillPercent,
    velocityMps:hydro.velocityMps,
    transitSeconds:hydro.velocityMps&&hydro.velocityMps>0?dx/1000/hydro.velocityMps:null,
    conservationResidualLps:0,findings,verifiedChecks,committed:false};
}
