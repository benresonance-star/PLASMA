import type { FastifyInstance } from 'fastify';
import { asPromise, type VersionStore } from '@spds/version-core';
import { composeFirstFusion, hashSourceBytes, type FusionBinding } from '@spds/import-core';
import {
  InProcessGeometryKernel, executeExactCompile, parseGeometryCompileRequest,
  GeometryRepresentationSchema, GeometryCompileMeshSchema,
  type GeometryCompileMesh, type GeometryRepresentation,
} from '@spds/geometry-contracts';

type BoundInput={
  readonly buildProject:unknown;
  readonly loftProject:unknown;
  readonly bindings:readonly FusionBinding[];
  readonly expectedSourceHashes:{readonly build:string;readonly loft:string};
  readonly hostWallId:string;
  readonly hostedOpeningId:string;
};
type HeadInput=BoundInput &{
  readonly modelId:string;readonly branchId:string;readonly expectedHeadHash:string;
};
type Data=Record<string,unknown>;
function rec(x:unknown,where:string):Data{
  if(!x||typeof x!=='object'||Array.isArray(x))
    throw new Error('FUSION_HOST_MISSING_'+where);
  return x as Data;
}
function num(x:unknown,where:string):number{
  if(typeof x!=='number'||!Number.isFinite(x))throw new Error('FUSION_HOST_INVALID_'+where);
  return x;
}
type Wall={widthMm:number;heightMm:number;thicknessMm:number};
type Opening={widthMm:number;heightMm:number;sillMm:number;centerXmm:number;minimumJambMm:number};

export function planFusionHostOpening(input:BoundInput) {
  const preview=composeFirstFusion(input);
  const hashBuild=preview.sources.find(x=>x.system==='build')?.sourceHash;
  const hashLoft=preview.sources.find(x=>x.system==='loft')?.sourceHash;
  if(hashBuild!==input.expectedSourceHashes?.build||
      hashLoft!==input.expectedSourceHashes?.loft)
    throw new Error('FUSION_SOURCE_STALE');
  const wall=preview.objects.find(x=>x.id===input.hostWallId);
  const opening=preview.objects.find(x=>x.id===input.hostedOpeningId);
  if(!wall||!wall.semanticType.startsWith('architecture.wall'))
    throw new Error('FUSION_HOST_WALL_NOT_FOUND');
  if(!opening||(opening.semanticType!=='architecture.hosted-opening'&&
      !opening.semanticType.includes('window')))
    throw new Error('FUSION_HOST_OPENING_NOT_FOUND');
  const hosts=preview.relationships.filter(r=>r.relationType==='architecture.hosted-by'&&
    r.from===input.hostedOpeningId);
  if(hosts.length!==1||hosts[0]!.to!==input.hostWallId)
    throw new Error('FUSION_HOST_RELATIONSHIP_AMBIGUOUS');
  const bound=preview.bindings.find(b=>b.buildEntityId===input.hostedOpeningId);
  if(!bound)throw new Error('FUSION_HOST_LOFT_OCCURRENCE_UNBOUND');
  const wallDef=rec(rec(wall.metadata,'WALL_METADATA')['geometryMm'],'WALL_GEOMETRY');
  const openingDef=rec(rec(opening.metadata,'OPENING_METADATA')['openingMm'],'OPENING_GEOMETRY');
  const wallDims:Wall={
    widthMm:num(wallDef['width'],'WALL_WIDTH'),
    heightMm:num(wallDef['height'],'WALL_HEIGHT'),
    thicknessMm:num(wallDef['thickness'],'WALL_THICKNESS'),
  };
  const openingDims:Opening={
    widthMm:num(openingDef['width'],'OPENING_WIDTH'),
    heightMm:num(openingDef['height'],'OPENING_HEIGHT'),
    sillMm:num(openingDef['sill'],'SILL'),
    centerXmm:num(openingDef['centerX'],'CENTER_X'),
    minimumJambMm:num(openingDef['minimumJamb'],'MINIMUM_JAMB'),
  };
  if([wallDims.widthMm,wallDims.heightMm,wallDims.thicknessMm,
      openingDims.widthMm,openingDims.heightMm].some(x=>x<10||x>100000)||
      openingDims.sillMm<0||openingDims.minimumJambMm<0)
    throw new Error('FUSION_HOST_INVALID_DOMAIN');
  const bearingLeft=openingDims.centerXmm-openingDims.widthMm/2+wallDims.widthMm/2;
  const bearingRight=wallDims.widthMm/2-openingDims.centerXmm-openingDims.widthMm/2;
  if(Math.min(bearingLeft,bearingRight)<openingDims.minimumJambMm)
    throw new Error('FUSION_HOST_INSUFFICIENT_JAMB_WIDTH');
  if(openingDims.sillMm+openingDims.heightMm>wallDims.heightMm)
    throw new Error('FUSION_HOST_WINDOW_OUTSIDE_WALL');
  const wallOpId=input.hostWallId+':wall-solid';
  const voidOpId=input.hostedOpeningId+':window-void';
  const finalOpId=input.hostWallId+':opening-cut';
  const {widthMm:W,heightMm:H,thicknessMm:T}=wallDims;
  const {widthMm:w,heightMm:h,sillMm:s,centerXmm:cx}=openingDims;
  const ext=20; // through-wall cutter 10 mm each side
  const wallOp={
    op:'geometry.extrude@1.0.0',pirOperationId:wallOpId,
    semanticOwner:input.hostWallId,featurePath:'wall-base',
    visibility:'construction',
    profile:[[-W/2,-T/2,0],[W/2,-T/2,0],[W/2,T/2,0],[-W/2,T/2,0]],
    vector:[0,0,H],
  };
  const voidOp={
    op:'geometry.extrude@1.0.0',pirOperationId:voidOpId,
    semanticOwner:input.hostedOpeningId,featurePath:'hosted-window-void',
    visibility:'construction',
    profile:[[cx-w/2,-(T+ext)/2,s],[cx+w/2,-(T+ext)/2,s],
      [cx+w/2,(T+ext)/2,s],[cx-w/2,(T+ext)/2,s]],
    vector:[0,0,h],
  };
  const cutOp={
    op:'geometry.boolean@1.0.0',pirOperationId:finalOpId,
    semanticOwner:input.hostWallId,featurePath:'window-opening-cut',
    operation:'cut',leftOperationId:wallOpId,rightOperationId:voidOpId,
  };
  const ops=[wallOp,voidOp,cutOp];
  const request=parseGeometryCompileRequest({
    snapshotHash:hashSourceBytes(JSON.stringify([hashBuild,hashLoft])),
    pirHash:hashSourceBytes(JSON.stringify(ops)),
    dagHash:hashSourceBytes(JSON.stringify(ops.map(x=>x.pirOperationId))),
    compilerVersion:'fusion-native-host/0.1',
    parameters:{},ops,chordDeviationMm:1,angleDeviationDeg:20,
  });
  const wallVolume=W*T*H;
  const removedVolume=w*T*h;
  return {
    request,sourceHashes:{build:hashBuild!,loft:hashLoft!},
    wall:wallDims,opening:openingDims,
    sourceHostId:input.hostWallId,sourceOpeningId:input.hostedOpeningId,
    sourceLoftOccurrenceId:bound.loftOccurrenceId,
    wallVolumeMm3:wallVolume,cutVolumeMm3:removedVolume,
    remainingVolumeMm3:wallVolume-removedVolume,
    jambsMm:{left:bearingLeft,right:bearingRight},
  };
}
export async function verifyFusionHostOpening(input:{
  readonly source:BoundInput;
  readonly serviceUrl:string;
  readonly fetchImpl?:typeof fetch;
  readonly timeoutMs?:number;
}){
  const plan=planFusionHostOpening(input.source);
  if(!/^https?:\/\/[^/]+/.test(input.serviceUrl))
    throw new Error('FUSION_HOST_NATIVE_SERVICE_URL_REQUIRED');
  const exact=executeExactCompile(new InProcessGeometryKernel(),plan.request);
  const timerController=new AbortController();
  const timer=setTimeout(()=>timerController.abort(),input.timeoutMs??45_000);
  let response:Response;
  try{
    response=await(input.fetchImpl??fetch)(input.serviceUrl.replace(/\/$/,'')+'/v1/compile/meshes',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({compile:plan.request,kernels:['occt-native']}),
      signal:timerController.signal,
    });
  }catch(e){
    throw new Error('FUSION_HOST_NATIVE_SERVICE_UNAVAILABLE: '+String(e));
  }finally{clearTimeout(timer);}
  if(!response.ok)throw new Error('FUSION_HOST_NATIVE_REJECTED: '+response.status);
  const body=rec(await response.json(),'NATIVE_BODY');
  if(rec(body['exact'],'EXACT')['compileHash']!==exact.compileHash)
    throw new Error('FUSION_HOST_EXACT_HASH_MISMATCH');
  if(body['occtNativeError'])throw new Error('FUSION_HOST_NATIVE_FAILURE: '+String(body['occtNativeError']));
  const native=rec(body['occtNative'],'OCCT');
  if(native['kernel']!=='occt-native')throw new Error('FUSION_HOST_NATIVE_KERNEL_MISSING');
  const reps=(native['representations'] as unknown[]).map(x=>GeometryRepresentationSchema.parse(x));
  const meshes=(native['meshes'] as unknown[]).map(x=>GeometryCompileMeshSchema.parse(x));
  if(reps.length!==3||meshes.length!==1)throw new Error('FUSION_HOST_NATIVE_CARDINALITY');
  const finalId=plan.sourceHostId+':opening-cut';
  const final=reps.find(r=>r.pirOperationId===finalId);
  const mesh=meshes.find(m=>m.pirOperationId===finalId);
  if(!final||!mesh||final.kernel!=='occt-native'||mesh.kernel!=='occt-native'||
      final.semanticOwner!==plan.sourceHostId||mesh.semanticOwner!==plan.sourceHostId||
      final.validationState!=='geometry-generated')
    throw new Error('FUSION_HOST_NATIVE_OWNER_OR_SOLID_INVALID');
  if(!final.subElementPaths.some(x=>x.includes('window-opening-cut')))
    throw new Error('FUSION_HOST_RESULT_LINEAGE_MISSING');
  const error=Math.abs(final.mass.volumeMm3-plan.remainingVolumeMm3)/plan.remainingVolumeMm3;
  if(error>0.0001)throw new Error('FUSION_HOST_NATIVE_REMOVAL_VOLUME_MISMATCH');
  if(mesh.triangleCount<12)throw new Error('FUSION_HOST_NATIVE_MESH_EMPTY');
  const out=final.solid.extentsMm;
  const dims={
    width:out.max[0]-out.min[0],
    thickness:out.max[1]-out.min[1],
    height:out.max[2]-out.min[2],
  };
  if(Math.abs(dims.width-plan.wall.widthMm)>0.5||
      Math.abs(dims.thickness-plan.wall.thicknessMm)>0.5||
      Math.abs(dims.height-plan.wall.heightMm)>0.5)
    throw new Error('FUSION_HOST_NATIVE_EXTENTS_CHANGED');
  return {
    stage:'F12' as const,
    status:'native-host-opening-preview' as const,
    nativeBrepConstructed:true as const,
    productionReady:false as const,
    kernel:'occt-native' as const,
    hostWallId:plan.sourceHostId,openingId:plan.sourceOpeningId,
    sourceLoftOccurrenceId:plan.sourceLoftOccurrenceId,
    wall:plan.wall,opening:plan.opening,
    jambsMm:plan.jambsMm,openingVolumeMm3:plan.cutVolumeMm3,
    remainingWallVolumeMm3:final.mass.volumeMm3,
    relativeVolumeError:error,
    mesh,
    lineage:final.subElementPaths,
    unresolved:[
      'Only wall-opening Boolean and basic authored jamb constraints are demonstrated',
      'Structural lintel, fire, acoustics, condensation, waterproofing and NCC compliance not validated',
      'No approved drawing, BIM revision, IFC or fabricated element is issued',
    ],
  };
}
export function registerFusionHostRoute(app:FastifyInstance,store:VersionStore){
  app.post<{Body:HeadInput}>('/imports/fusion/host-opening-preview',async(req,reply)=>{
    const body=req.body;
    if(!body||!body.modelId||!body.branchId||!body.expectedHeadHash)
      return reply.code(422).send({failureCode:'FUSION_HOST_BASE_REQUIRED'});
    try{
      const head=await asPromise(store.getBranchHead(body.branchId));
      if(head.modelId!==body.modelId||head.headHash!==body.expectedHeadHash)
        return reply.code(409).send({failureCode:'FUSION_HEAD_CONFLICT'});
      const serviceUrl=process.env['GEOMETRY_URL']??process.env['SPDS_GEOMETRY_URL'];
      if(!serviceUrl)return reply.code(503).send({failureCode:'FUSION_HOST_NATIVE_UNAVAILABLE'});
      const report=await verifyFusionHostOpening({
        source:body,serviceUrl,timeoutMs:45_000,
      });
      const after=await asPromise(store.getBranchHead(body.branchId));
      if(after.headHash!==body.expectedHeadHash)
        return reply.code(409).send({failureCode:'FUSION_HEAD_CONFLICT'});
      return reply.send({...report,basedOnHeadHash:body.expectedHeadHash});
    }catch(e){
      return reply.code(422).send({
        failureCode:'FUSION_HOST_OPENING_REJECTED',
        summary:e instanceof Error?e.message:'Host opening failure',
        productionReady:false,
      });
    }
  });
}
