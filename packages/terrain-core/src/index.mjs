// T1 source-feature resolver. No mesh, hidden world, persistence or commit authority.
export class TerrainError extends Error {
  constructor(code, message, ids = []) { super(message); this.name = "TerrainError"; this.code = code; this.ids = ids; }
}
const fail = (code, message, ids) => { throw new TerrainError(code, message, ids); };
const copy = x => JSON.parse(JSON.stringify(x));
const record = x => x && typeof x === "object" && !Array.isArray(x);
const id = x => typeof x === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(x);
const keys = (x, allowed) => record(x) && Object.keys(x).every(k => allowed.includes(k));
const integer = x => Number.isSafeInteger(x) && Math.abs(x) <= 1000000000;
const xy = (a,b) => a.x === b.x && a.y === b.y;
const orient = (a,b,c) => (BigInt(b.x)-BigInt(a.x))*(BigInt(c.y)-BigInt(a.y)) -
  (BigInt(b.y)-BigInt(a.y))*(BigInt(c.x)-BigInt(a.x));
const on = (a,b,p) => orient(a,b,p) === 0n &&
  p.x >= Math.min(a.x,b.x) && p.x <= Math.max(a.x,b.x) &&
  p.y >= Math.min(a.y,b.y) && p.y <= Math.max(a.y,b.y);
const opposite = (a,b) => a < 0n && b > 0n || a > 0n && b < 0n;
function intersects(a,b,c,d) {
  const p=orient(a,b,c), q=orient(a,b,d), r=orient(c,d,a), s=orient(c,d,b);
  return opposite(p,q) && opposite(r,s) || on(a,b,c) || on(a,b,d) || on(c,d,a) || on(c,d,b);
}
function inside(p, ring) {
  let winding=0;
  for(let i=0;i<ring.length;i++) {
    const a=ring[i], b=ring[(i+1)%ring.length], o=orient(a,b,p);
    if(on(a,b,p)) return true;
    if(a.y<=p.y && b.y>p.y && o>0n) winding++;
    if(a.y>p.y && b.y<=p.y && o<0n) winding--;
  }
  return winding !== 0;
}
function cleanJoin(a,b,c,d) {
  const common=[a,b].filter(p=>p.id===c.id || p.id===d.id);
  if(common.length!==1) return false;
  const p=common[0], u=a.id===p.id?b:a, v=c.id===p.id?d:c;
  return orient(p,u,v)!==0n || !on(p,u,v) && !on(p,v,u);
}
export function validateTerrain(t) {
  if(!keys(t,["id","kind","schema","revision","frameId","datum","units","source","surfaceRole","points","features"]) ||
     !id(t.id) || t.kind!=="terrain-controls" || t.schema!=="plasma-terrain-controls/1" || t.surfaceRole!=="design-ground" ||
     !Number.isSafeInteger(t.revision) || t.revision<0)
    fail("INVALID_SOURCE","Invalid terrain aggregate.");
  if(!id(t.frameId) || t.units!=="mm") fail("FRAME_MISMATCH","Registered local frame and millimetres required.");
  if(typeof t.datum!=="string" || !t.datum.trim()) fail("UNKNOWN_DATUM","An explicit datum is required.");
  if(!keys(t.source,["evidenceRef","contentDigest","importerVersion","registrationEvidenceRef"]) ||
     !["evidenceRef","contentDigest","importerVersion","registrationEvidenceRef"].every(k=>typeof t.source[k]==="string" && t.source[k].length>0 && t.source[k].length<=256))
    fail("SOURCE_CONFLICT","Source digest, importer and registration evidence are required.");
  if(!Array.isArray(t.points)||!Array.isArray(t.features)||t.points.length>512||t.features.length>2)
    fail("RESOURCE_LIMIT","T1 resolver supports at most 512 points, one boundary and one breakline.");
  const all=new Set([t.id]), points=new Map();
  for(const p of t.points) {
    if(!keys(p,["id","revision","x","y","z","evidenceRefs"]) || !id(p.id) || all.has(p.id) ||
       !Number.isSafeInteger(p.revision)||p.revision<0||!["x","y","z"].every(k=>integer(p[k])) ||
       !Array.isArray(p.evidenceRefs)||p.evidenceRefs.length>32||!p.evidenceRefs.every(id))
      fail("INVALID_SOURCE","Points require unique IDs, evidence references and bounded integer millimetres.",[p?.id]);
    all.add(p.id); points.set(p.id,p);
  }
  for(let i=0;i<t.points.length;i++) for(let j=i+1;j<t.points.length;j++)
    if(xy(t.points[i],t.points[j])) fail("SOURCE_CONFLICT","Duplicate XY observations require explicit reconciliation.",[t.points[i].id,t.points[j].id]);
  let boundary=null, breakline=null; const segments=[];
  for(const f of t.features) {
    if(!keys(f,["id","revision","kind","pointIds"])||!id(f.id)||all.has(f.id)||
       !Number.isSafeInteger(f.revision)||f.revision<0||!["boundary","breakline"].includes(f.kind)||
       !Array.isArray(f.pointIds)||f.pointIds.length>128||
       f.pointIds.length<(f.kind==="boundary"?3:2)||new Set(f.pointIds).size!==f.pointIds.length||
       f.pointIds.some(p=>!points.has(p)))
      fail("INVALID_TOPOLOGY","Invalid feature or missing control reference.",[f?.id]);
    all.add(f.id);
    if(f.kind==="boundary") { if(boundary) fail("RESOURCE_LIMIT","Only one boundary is supported."); boundary=f; }
    else { if(breakline) fail("RESOURCE_LIMIT","Only one breakline is supported."); breakline=f; }
    const ps=f.pointIds.map(p=>points.get(p));
    if(f.kind==="boundary") {
      let area=0n;
      ps.forEach((p,i)=>{const q=ps[(i+1)%ps.length];area+=BigInt(p.x)*BigInt(q.y)-BigInt(p.y)*BigInt(q.x);});
      if(area===0n) fail("INVALID_TOPOLOGY","Boundary has zero area.",[f.id]);
    }
    for(let i=0;i<ps.length-(f.kind==="breakline"?1:0);i++) segments.push({a:ps[i],b:ps[(i+1)%ps.length],owner:f.id});
  }
  if(breakline&&!boundary) fail("OUTSIDE_COVERAGE","A breakline requires an explicit boundary.",[breakline.id]);
  if(boundary) {
    const ring=boundary.pointIds.map(p=>points.get(p));
    for(const p of t.points) if(!inside(p,ring)) fail("OUTSIDE_COVERAGE","Control lies outside the boundary.",[p.id,boundary.id]);
  }
  for(let i=0;i<segments.length;i++) for(let j=i+1;j<segments.length;j++) {
    const a=segments[i],b=segments[j];
    if(intersects(a.a,a.b,b.a,b.b)&&!cleanJoin(a.a,a.b,b.a,b.b))
      fail("INVALID_TOPOLOGY","Crossing, touching or overlapping constraints require explicit split controls.",[a.owner,b.owner]);
  }
  for(const segment of segments) for(const p of t.points)
    if(p.id!==segment.a.id && p.id!==segment.b.id && on(segment.a,segment.b,p))
      fail("INVALID_TOPOLOGY","A control on a constraint requires an explicit split in its pointIds.",[p.id,segment.owner]);
  if(boundary) {
    const ring=boundary.pointIds.map(p=>points.get(p));
    for(const p of t.points) if(!inside(p,ring)) fail("OUTSIDE_COVERAGE","Control lies outside the boundary.",[p.id,boundary.id]);
    // Vertex containment alone misses a chord outside a concave boundary.
    // Doubled integer coordinates preserve exact midpoint predicates.
    const twice=ring.map(p=>({...p,x:p.x*2,y:p.y*2}));
    for(const s of segments.filter(s=>s.owner===breakline?.id))
      if(!inside({x:s.a.x+s.b.x,y:s.a.y+s.b.y},twice))
        fail("OUTSIDE_COVERAGE","Breakline leaves the boundary.",[s.owner]);
  }
  return {status:boundary?"source-valid":"incomplete",surfaceStatus:"unresolved",pointCount:t.points.length};
}
function revs(t) { return Object.fromEntries([t,...t.points,...t.features].map(x=>[x.id,x.revision])); }
const stable = x => x===null || typeof x!=="object" ? JSON.stringify(x) :
  Array.isArray(x) ? "["+x.map(stable).join(",")+"]" :
  "{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+stable(x[k])).join(",")+"}";
export function terrainRequestKey(request) { return stable(request); }
// Host supplies authoritative snapshot and capability scope; never use caller scope as authority.
// Output is a resolver candidate for the host WorldTransaction pipeline, NOT a commit receipt.
export function prepareTerrainEdit(snapshot, request, capability) {
  const base=snapshot.terrain; validateTerrain(base);
  if(!keys(request,["schema","requestId","branchId","baseWorldRevision","expectedProposalRevision","frameId","units","scope","preconditions","operations","intent","acceptanceMode"]) ||
     request.schema!=="plasma-terrain-edit/1"||!id(request.requestId)||request.acceptanceMode!=="proposal-only"||
     typeof request.intent!=="string"||request.intent.length>4096)
    fail("INVALID_COMMAND","Unsupported terrain proposal envelope.");
  if(request.branchId!==snapshot.branchId || request.baseWorldRevision!==snapshot.worldRevision ||
     request.expectedProposalRevision!==snapshot.proposalRevision)
    fail("STALE_READ","World or proposal head changed; read again.");
  if(request.frameId!==base.frameId || stable(request.units)!==stable({length:"mm",angle:"deg",slope:"ratio"}))
    fail("FRAME_MISMATCH","Request frame or units differ from registered source.");
  if(!keys(request.scope,["terrainId","allowedFeatureIds"])||request.scope.terrainId!==base.id||
     !Array.isArray(request.scope.allowedFeatureIds)||!request.scope.allowedFeatureIds.every(id)||
     !record(capability)||capability.terrainId!==base.id||!Array.isArray(capability.allowedFeatureIds))
    fail("OUTSIDE_SCOPE","Host-granted scope is required.");
  if(!record(request.preconditions)) fail("STALE_READ","Object revision preconditions required.");
  const revisions=revs(base);
  // Conservative T1: guard the whole aggregate and every existing control/feature.
  if(stable(request.preconditions)!==stable(revisions)) fail("STALE_READ","Terrain dependencies changed.");
  if(!Array.isArray(request.operations)||request.operations.length<1||request.operations.length>64)
    fail("RESOURCE_LIMIT","Use 1–64 operations per proposal.");
  const next=copy(base), inverse=[], touched=new Set();
  for(const op of request.operations) {
    if(!keys(op,["type","target","values"])||!id(op.target)||typeof op.type!=="string"||
       !request.scope.allowedFeatureIds.includes(op.target)||!capability.allowedFeatureIds.includes(op.target))
      fail("OUTSIDE_SCOPE","Operation is outside caller or host scope.",[op?.target]);
    const [kind,verb,...extra]=op.type.split(".");
    if(extra.length||!["point","boundary","breakline"].includes(kind)||!["create","replace","delete"].includes(verb))
      fail("INVALID_COMMAND","Unsupported operation type.",[op.target]);
    const collection=kind==="point"?next.points:next.features;
    const index=collection.findIndex(x=>x.id===op.target), prior=collection[index];
    if(prior && kind!=="point" && prior.kind!==kind) fail("INVALID_COMMAND","Feature kind cannot change.",[op.target]);
    if(verb==="delete") {
      if(!prior||op.values!==undefined) fail("INVALID_COMMAND","Delete requires an existing target and no values.",[op.target]);
      collection.splice(index,1);
      const values=copy(prior);delete values.id;delete values.revision;if(kind!=="point")delete values.kind;
      inverse.unshift({type:kind+".create",target:op.target,values});
    } else {
      const fields=kind==="point"?["x","y","z","evidenceRefs"]:["pointIds"];
      if(!keys(op.values,fields)||fields.some(k=>!Object.hasOwn(op.values,k)) ||
         (verb==="create"?prior!==undefined:prior===undefined))
        fail("INVALID_COMMAND","Create/replace requires complete typed values and correct target existence.",[op.target]);
      const value={...copy(op.values),id:op.target,revision:prior?prior.revision+1:0,...(kind==="point"?{}:{kind})};
      if(prior) {
        const values=copy(prior);delete values.id;delete values.revision;if(kind!=="point")delete values.kind;
        inverse.unshift({type:kind+".replace",target:op.target,values});collection[index]=value;
      } else { collection.push(value);inverse.unshift({type:kind+".delete",target:op.target}); }
    }
    touched.add(op.target);
  }
  next.revision++;
  const validation=validateTerrain(next);
  return {
    schema:"plasma-terrain-candidate/1",requestId:request.requestId,requestKey:terrainRequestKey(request),
    baseWorldRevision:snapshot.worldRevision,baseProposalRevision:snapshot.proposalRevision,branchId:snapshot.branchId,
    terrainId:base.id,baseTerrainRevision:base.revision,candidate:next,validation,
    affectedIds:[...new Set([base.id,...touched,...base.features.filter(f=>f.pointIds.some(p=>touched.has(p))).map(f=>f.id)])].sort(),
    invalidations:["terrain-surface","terrain-contours","terrain-quantities","terrain-hydrology","terrain-attachments"],
    requiredBeforeCommit:["host-authorization","head-and-request-identity-check","causal-impact-expansion","applicable-hard-invariants","atomic-durable-world-transaction"],
    inverseOperations:inverse,status:"candidate"
  };
}
export function makeTerrainRequest(snapshot,{requestId,operations,intent=""}) {
  return {schema:"plasma-terrain-edit/1",requestId,branchId:snapshot.branchId,baseWorldRevision:snapshot.worldRevision,
    expectedProposalRevision:snapshot.proposalRevision,frameId:snapshot.terrain.frameId,
    units:{length:"mm",angle:"deg",slope:"ratio"},
    scope:{terrainId:snapshot.terrain.id,allowedFeatureIds:[...new Set(operations.map(x=>x.target))]},
    preconditions:revs(snapshot.terrain),operations:copy(operations),intent,acceptanceMode:"proposal-only"};
}
// O(1) pointer updates: no geometry resolution, dependency walk or terrain copy on update.
export function beginTerrainPointInteraction(snapshot,pointId,sessionId) {
  if(!id(sessionId)) fail("INVALID_COMMAND","Stable session ID required.");
  const point=snapshot.terrain.points.find(p=>p.id===pointId);
  if(!point) fail("INVALID_COMMAND","Unknown control.",[pointId]);
  const pinned={branchId:snapshot.branchId,worldRevision:snapshot.worldRevision,proposalRevision:snapshot.proposalRevision,terrainRevision:snapshot.terrain.revision};
  let phase="active", sequence=0, position={x:point.x,y:point.y,z:point.z};
  const evidenceRefs=copy(point.evidenceRefs);
  return Object.freeze({
    update(next,inputSequence) {
      if(phase!=="active") fail("SESSION_CLOSED","Interaction already released or cancelled.");
      if(!Number.isSafeInteger(inputSequence)||inputSequence<=sequence) return false;
      if(!keys(next,["x","y","z"])||!["x","y","z"].every(k=>integer(next[k]))) fail("INVALID_COMMAND","Use complete integer coordinates.");
      position={...next};sequence=inputSequence;return true;
    },
    overlay() {return {sessionId,entityId:pointId,...pinned,inputSequence:sequence,position:{...position},phase,validityState:"unchecked",authoritative:false};},
    cancel() {if(phase==="active")phase="cancelled";},
    release(current,capability) {
      if(phase!=="active") fail("SESSION_CLOSED","Interaction already released or cancelled.");
      if(current.branchId!==pinned.branchId||current.worldRevision!==pinned.worldRevision||
         current.proposalRevision!==pinned.proposalRevision||current.terrain.revision!==pinned.terrainRevision)
        fail("STALE_READ","Pinned interaction inputs changed.");
      const request=makeTerrainRequest(current,{requestId:sessionId,operations:[{type:"point.replace",target:pointId,values:{...position,evidenceRefs}}],intent:"Move terrain control"});
      const result=prepareTerrainEdit(current,request,capability);
      phase="released";return {...result,interaction:{sessionId,inputSequence:sequence}};
    }
  });
}

/** Explicit legacy adapter: returns a new design-control aggregate, never rewrites survey evidence.
 * Evidence/digest are supplied by the host importer; this function does not verify external files.
 */
export function terrainFromLegacySurvey(survey,{terrainId,boundaryId,source}) {
  if(!survey||survey.schema!=="site-survey/1"||survey.units!=="mm"||
     survey.step!==2000||survey.nx!==12||survey.ny!==18||survey.points?.length!==247)
    fail("INVALID_SOURCE","Adapter only supports the current 13 by 19 survey grid.");
  const points=survey.points.map((p,index)=>{
    if(p.id!=="ground-"+(index%13)+"-"+Math.floor(index/13)||p.x!==(index%13)*2000||p.y!==Math.floor(index/13)*2000)
      fail("INVALID_SOURCE","Legacy grid ordering or coordinates changed.");
    return {id:p.id,revision:0,x:p.x,y:p.y,z:p.z,evidenceRefs:[source.evidenceRef]};
  });
  const pointIds=[];
  for(let x=0;x<=12;x++) pointIds.push("ground-"+x+"-0");
  for(let y=1;y<=18;y++) pointIds.push("ground-12-"+y);
  for(let x=11;x>=0;x--) pointIds.push("ground-"+x+"-18");
  for(let y=17;y>=1;y--) pointIds.push("ground-0-"+y);
  const result={id:terrainId,kind:"terrain-controls",schema:"plasma-terrain-controls/1",revision:0,
    surfaceRole:"design-ground",frameId:survey.frame,datum:survey.datum,units:"mm",source:copy(source),points,
    features:[{id:boundaryId,revision:0,kind:"boundary",pointIds}]};
  validateTerrain(result);return result;
}
