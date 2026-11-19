import type { Point3, WetCoreModel, WetAssessment, WetPort, WetIssue, WetMedium, WetRun } from './types.js';

const tol=1;
function length(a: Point3,b:Point3):number{return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);}
function aabbSegment(a:Point3,b:Point3,min:Point3,max:Point3,grow:number):boolean{
  let low=0,high=1;
  for(let k=0;k<3;k++){
    const delta=b[k]!-a[k]!;
    if(Math.abs(delta)<1e-8){if(a[k]!<min[k]!-grow||a[k]!>max[k]!+grow)return false;continue;}
    const p=(min[k]!-grow-a[k]!)/delta, q=(max[k]!+grow-a[k]!)/delta;
    low=Math.max(low,Math.min(p,q)); high=Math.min(high,Math.max(p,q));
    if(low>high)return false;
  }
  return true;
}
function connections(model:WetCoreModel):Map<string,string[]>{
  const adjacency=new Map<string,string[]>();
  function link(a:string,b:string):void {adjacency.set(a,[...(adjacency.get(a)??[]),b]);}
  for(const component of model.components)
    for(const [a,b] of component.internalLinks)link(a,b);
  for(const run of model.runs)link(run.fromPortId,run.toPortId);
  return adjacency;
}
export function traceConnectedPorts(model:WetCoreModel,originId:string):readonly string[]{
  const g=connections(model),visited=new Set<string>(),q=[originId];
  while(q.length){
    const id=q.shift()!;
    if(visited.has(id))continue;
    visited.add(id);
    for(const id2 of g.get(id)??[])if(!visited.has(id2))q.push(id2);
  }
  return [...visited].sort();
}
function portMap(model:WetCoreModel):Map<string,WetPort>{
  return new Map(model.ports.map(p=>[p.id,p]));
}
export function assessWetCore(model:WetCoreModel):WetAssessment {
  const issues:WetIssue[]=[];
  const emit=(code:WetIssue['code'],severity:WetIssue['severity'],ownerId:string,
    detail:string,relatedIds:readonly string[]=[])=>issues.push({code,severity,ownerId,detail,relatedIds});
  const byId=portMap(model);
  const allIds=[...model.components.map(x=>x.id),...model.ports.map(x=>x.id),
    ...model.runs.map(x=>x.id),...model.fittings.map(x=>x.id),...model.structure.map(x=>x.id)];
  const seen=new Set<string>();
  for(const id of allIds){if(seen.has(id))emit('DUPLICATE_ID','error',id,'Duplicate semantic ID');seen.add(id);}
  const mat: Record<'copper-press'|'pvc-dwv',number>={'copper-press':0,'pvc-dwv':0};
  for(const port of model.ports)if(!model.components.find(c=>c.id===port.ownerId))
    emit('DANGLING_PORT','error',port.id,'Port owner does not exist');
  for(const c of model.components)for(const id of c.portIds)if(!byId.has(id))
    emit('DANGLING_PORT','error',c.id,'Component references missing port',[id]);
  for(const run of model.runs){
    const a=byId.get(run.fromPortId),b=byId.get(run.toPortId);
    if(!a||!b){emit('DANGLING_PORT','error',run.id,'Route endpoint missing',[run.fromPortId,run.toPortId]);continue;}
    if(a.medium!==run.medium||b.medium!==run.medium)
      emit('MEDIA_MISMATCH','error',run.id,'Connected media are incompatible',[a.id,b.id]);
    if(a.nominalDiameterMm!==run.nominalDiameterMm||b.nominalDiameterMm!==run.nominalDiameterMm)
      emit('NOMINAL_DIAMETER_MISMATCH','error',run.id,'Pipe needs a specified compatible adaptor',[a.id,b.id]);
    const points=run.pointsMm;
    if(points.length<2||length(points[0]!,a.positionMm)>tol||length(points[points.length-1]!,b.positionMm)>tol)
      emit('ENDPOINT_MISMATCH','error',run.id,'Route centreline does not meet defined component ports',[a.id,b.id]);
    for(let i=1;i<points.length;i++){
      const p=points[i-1]!,q=points[i]!;
      mat[run.material]+=length(p,q);
      if(run.medium==='sanitary'){
        const projected=Math.hypot(q[0]-p[0],q[1]-p[1]);
        const fall=p[2]-q[2];
        if(projected>1 && fall+0.5<projected/60)
          emit('UNSUPPORTED_GRADIENT','error',run.id,
            'Segment lacks model-assumed 1:60 downward gradient (not a regulatory pass)',[]);
      }
      // Structural collisions are reported even when a route has passed an axis-aligned search.
      // Site clearance, penetrations and support decisions remain an engineer's responsibility.
      for(const member of model.structure){
        if(!member.structural)continue;
        // The slab is an intentional reference assembly: below-slab discharge is not designed here.
        if(member.kind==='slab')continue;
        if(aabbSegment(p,q,member.minMm,member.maxMm,run.nominalDiameterMm/2)){
          emit('STRUCTURAL_INTERFERENCE','review',run.id,
            'Service intersects '+member.id+'; penetration/design change requires explicit review',
            [member.id]);
        }
      }
    }
  }
  const graph=connections(model);
  const reachable=(source:string,target:string):boolean=>{
    const visited=new Set<string>(),stack=[source];
    while(stack.length){
      const id=stack.pop()!;
      if(id===target)return true;
      if(visited.has(id))continue;
      visited.add(id);
      for(const next of graph.get(id)??[])stack.push(next);
    }
    return false;
  };
  const fixtures=model.components.filter(c=>['basin','shower','wc','laundry-trough'].includes(c.kind));
  let connected=0;
  for(const fixture of fixtures){
    let valid=true;
    for(const id of fixture.portIds){
      const port=byId.get(id);
      if(!port){valid=false;continue;}
      if(port.medium==='cold-water'||port.medium==='hot-water'){
        const source=port.medium==='cold-water'?'meter:out':'hpwh:out';
        if(!reachable(source,id)){
          emit('DISCONNECTED_SUPPLY','error',fixture.id,'No connected path from '+source,[id]);
          valid=false;
        }
      } else if(port.medium==='sanitary'&&!reachable(id,'stack:out')){
        emit('DISCONNECTED_DRAIN','error',fixture.id,'No connected path to sanitary outfall',[id]);
        valid=false;
      }
    }
    if(valid)connected++;
  }
  const fittingIds=new Set(model.fittings.map(f=>f.id));
  for(const run of model.runs)for(const id of run.fittingIds)if(!fittingIds.has(id))
    emit('UNVERIFIED_FITTING','error',run.id,'Route refers to missing fitted component',[id]);
  for(const fitting of model.fittings)if(fitting.catalogStatus==='requires-product-matching')
    emit('UNVERIFIED_FITTING','review',fitting.id,'No exact manufacturer fitting/product geometry or port angles selected');
  emit('NEEDS_ENGINEERING_REVIEW','review',model.id,
    'No compliant hydraulic, sanitary drainage, structural-penetration or waterproofing design verification has been performed');
  return {modelId:model.id,checkedRunCount:model.runs.length,
    connectedFixtureCount:connected,issues,materialLengthMm:mat,
    fittingCount:model.fittings.length,
    engineeringStatus:'not-verified',committed:false};
}
export function compareWetCoreChange(before:WetCoreModel,after:WetCoreModel):{
  readonly modifiedComponentIds:readonly string[];
  readonly modifiedRunIds:readonly string[];
  readonly unchangedRunIds:readonly string[];
  readonly addedIds:readonly string[];
  readonly removedIds:readonly string[];
}{
  const json=(o:unknown):string=>JSON.stringify(o);
  const A=new Map(before.components.map(x=>[x.id,x]));
  const B=new Map(after.components.map(x=>[x.id,x]));
  const R=new Map(before.runs.map(x=>[x.id,x]));
  const S=new Map(after.runs.map(x=>[x.id,x]));
  return {
    modifiedComponentIds:[...B].filter(([id,c])=>A.has(id)&&json(A.get(id))!==json(c)).map(([id])=>id),
    modifiedRunIds:[...S].filter(([id,r])=>R.has(id)&&json(R.get(id))!==json(r)).map(([id])=>id),
    unchangedRunIds:[...S].filter(([id,r])=>R.has(id)&&json(R.get(id))===json(r)).map(([id])=>id),
    addedIds:[...B.keys()].filter(id=>!A.has(id)),
    removedIds:[...A.keys()].filter(id=>!B.has(id)),
  };
}
