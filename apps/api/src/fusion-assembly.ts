import type { FastifyInstance } from 'fastify';
import { asPromise, type VersionStore } from '@spds/version-core';
import { composeFirstFusion, hashSourceBytes, type FusionBinding } from '@spds/import-core';
import {
  GeometryCompileMeshSchema, GeometryRepresentationSchema,
  InProcessGeometryKernel, executeExactCompile, parseGeometryCompileRequest,
  type GeometryCompileRequest, type GeometryCompileMesh,
  type GeometryRepresentation,
} from '@spds/geometry-contracts';

type Source = {
  readonly buildProject: unknown;
  readonly loftProject: unknown;
  readonly bindings: readonly FusionBinding[];
  readonly expectedSourceHashes: { readonly build: string; readonly loft: string };
};
type Head = Source & {
  readonly modelId: string;
  readonly branchId: string;
  readonly expectedHeadHash: string;
};
type RecordMap = Record<string, unknown>;
function rec(value: unknown, label: string): RecordMap {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('FUSION_ASSEMBLY_INVALID_'+label);
  return value as RecordMap;
}
function arr(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error('FUSION_ASSEMBLY_INVALID_'+label);
  return value;
}
function textId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value)throw new Error('FUSION_ASSEMBLY_MISSING_'+label);
  return value;
}
function metric(value: unknown, params:RecordMap, label:string):number {
  const resolved=typeof value==='string'?params[value]:value;
  if (typeof resolved!=='number'||!Number.isFinite(resolved))
    throw new Error('FUSION_ASSEMBLY_UNRESOLVED_'+label);
  return resolved;
}
function bounds(mesh:GeometryCompileMesh) {
  if(mesh.vertices.length<4 || mesh.triangleCount<4)
    throw new Error('FUSION_ASSEMBLY_EMPTY_MESH');
  const min:[number,number,number]=[Infinity,Infinity,Infinity];
  const max:[number,number,number]=[-Infinity,-Infinity,-Infinity];
  for(const vertex of mesh.vertices)for(let i=0;i<3;i++){
    const v=vertex[i]!;
    if(!Number.isFinite(v))throw new Error('FUSION_ASSEMBLY_NONFINITE_MESH');
    min[i]=Math.min(min[i]!,v);max[i]=Math.max(max[i]!,v);
  }
  return {min,max};
}
function checkParity(exact:GeometryCompileMesh,native:GeometryCompileMesh,rep:GeometryRepresentation){
  if(native.semanticOwner!==exact.semanticOwner || rep.semanticOwner!==exact.semanticOwner ||
      native.kernel!=='occt-native' || rep.kernel!=='occt-native')
    throw new Error('FUSION_ASSEMBLY_OWNER_OR_KERNEL_MISMATCH');
  if(rep.validationState!=='geometry-generated'||rep.mass.volumeMm3<=0)
    throw new Error('FUSION_ASSEMBLY_INVALID_SOLID');
  const topo=rep.topologyElements??[];
  if(!topo.length||topo.some(x=>!x.path.startsWith(exact.semanticOwner+'/')))
    throw new Error('FUSION_ASSEMBLY_TOPOLOGY_MISSING');
  const a=bounds(exact),b=bounds(native);
  const dx=a.max[0]-a.min[0],dy=a.max[1]-a.min[1],dz=a.max[2]-a.min[2];
  const expected=dx*dy*dz;
  if(!(expected>0))throw new Error('FUSION_ASSEMBLY_INVALID_REFERENCE');
  const volume=Math.abs(rep.mass.volumeMm3-expected)/expected;
  const err=Math.max(
    ...a.min.map((v,i)=>Math.abs(v-b.min[i]!)),
    ...a.max.map((v,i)=>Math.abs(v-b.max[i]!)),
  );
  if(volume>0.0001||err>0.5)
    throw new Error('FUSION_ASSEMBLY_NATIVE_PARITY_EXCEEDED');
  return {relativeVolumeError:volume,maximumBoundingErrorMm:err,topologyCount:topo.length};
}
export interface AssemblySourcePart {
  readonly semanticOwner:string;
  readonly sourcePartId:string;
  readonly material:string;
  readonly sourceRole:string;
  readonly sourceAssemblyId:string;
  readonly sourceInstanceId:string;
  readonly boundBuildEntityId:string|null;
}
export interface FusionNativeAssembly {
  readonly stage:'F11';
  readonly status:'native-assembly-preview';
  readonly kernel:'occt-native';
  readonly nativeBrepConstructed:true;
  readonly sourceScope:'xy-rectangle-extrusion-occurrences-only';
  readonly sourceHashes:{readonly build:string;readonly loft:string};
  readonly compileHash:string;
  readonly partCount:number;
  readonly materials:readonly string[];
  readonly parts:readonly (AssemblySourcePart & {
    readonly representationId:string;
    readonly volumeMm3:number;
    readonly topologyCount:number;
    readonly relativeVolumeError:number;
    readonly maximumBoundingErrorMm:number;
  })[];
  readonly meshes:readonly GeometryCompileMesh[];
  readonly productionReady:false;
  readonly unresolved:readonly string[];
}

/** Lower every explicitly supported occurrence into a kernel-neutral compile
 * graph, preserving Part/assembly/occurrence lineage. No unsupported feature
 * may disappear from the published candidate.
 */
export function planFusionNativeAssembly(source:Source):{
  readonly request:GeometryCompileRequest;
  readonly parts:readonly AssemblySourcePart[];
  readonly sourceHashes:Source['expectedSourceHashes'];
} {
  const preview=composeFirstFusion(source);
  const build=preview.sources.find(s=>s.system==='build')?.sourceHash;
  const loft=preview.sources.find(s=>s.system==='loft')?.sourceHash;
  if(build!==source.expectedSourceHashes?.build||loft!==source.expectedSourceHashes?.loft)
    throw new Error('FUSION_SOURCE_STALE');
  const loftProject=rec(source.loftProject,'PROJECT');
  const defs=new Map(arr(loftProject['parts'],'PARTS').map(raw=>{
    const p=rec(raw,'PART');
    return [textId(p['id'],'PART_ID'),p] as const;
  }));
  const assemblies=new Map(arr(loftProject['assemblies'],'ASSEMBLIES').map(raw=>{
    const a=rec(raw,'ASSEMBLY');
    return [textId(a['id'],'ASSEMBLY_ID'),a] as const;
  }));
  const occurrences=preview.objects.filter(o=>o.semanticType==='geometry.loft.occurrence')
    .sort((a,b)=>a.id.localeCompare(b.id));
  if(occurrences.length<1||occurrences.length>64)
    throw new Error('FUSION_ASSEMBLY_OCCURRENCE_LIMIT');
  const parts:AssemblySourcePart[]=[];
  const ops:RecordMap[]=[];
  for(const occurrence of occurrences){
    const meta=rec(occurrence.metadata,'OCCURRENCE_METADATA');
    const assemblyId=textId(meta['sourceAssemblyId'],'ASSEMBLY_ID');
    const partId=textId(meta['sourcePartId'],'PART_ID');
    const instanceId=textId(meta['sourceInstanceId'],'INSTANCE_ID');
    const def=defs.get(partId),asm=assemblies.get(assemblyId);
    if(!def||!asm)throw new Error('FUSION_ASSEMBLY_DEFINITION_MISSING');
    const instance=arr(asm['instances'],'INSTANCES').map(raw=>rec(raw,'INSTANCE'))
      .find(i=>i['id']===instanceId);
    if(!instance||instance['partId']!==partId)
      throw new Error('FUSION_ASSEMBLY_INSTANCE_MISSING');
    const features=arr(def['features'],'FEATURES');
    if(features.length!==2)
      throw new Error('FUSION_ASSEMBLY_UNSUPPORTED_FEATURE_HISTORY '+partId);
    const sketch=rec(features[0],'SKETCH'), extrude=rec(features[1],'EXTRUDE');
    const plane=rec(sketch['plane'],'PLANE'),profile=rec(sketch['profile'],'PROFILE');
    if(sketch['type']!=='sketch'||extrude['type']!=='extrude'||
        extrude['sketch']!==sketch['id']||
        plane['type']!=='datum'||plane['name']!=='XY'||
        plane['offset']!==undefined||profile['kind']!=='rectangle')
      throw new Error('FUSION_ASSEMBLY_UNSUPPORTED_FEATURE_HISTORY '+partId);
    const params=rec(def['parameters']??{},'PARAMETERS');
    const w=metric(profile['width'],params,'WIDTH'),h=metric(profile['height'],params,'HEIGHT');
    const d=metric(extrude['depth'],params,'DEPTH');
    const px=metric(profile['x']??0,params,'X'),py=metric(profile['y']??0,params,'Y');
    if([w,h,d].some(v=>v<=0.01||v>100000))
      throw new Error('FUSION_ASSEMBLY_INVALID_DIMENSION');
    const placement=rec(instance['placement']??{},'PLACEMENT');
    if(Object.keys(placement).some(key=>key!=='translation'))
      throw new Error('FUSION_ASSEMBLY_UNSUPPORTED_TRANSFORM');
    const transform=placement['translation']??[0,0,0];
    if(!Array.isArray(transform)||transform.length!==3||
        transform.some(v=>typeof v!=='number'||!Number.isFinite(v)))
      throw new Error('FUSION_ASSEMBLY_INVALID_TRANSLATION');
    const [tx,ty,tz]=transform as number[];
    const cx=tx!+px,cy=ty!+py;
    const bound=preview.bindings.find(b=>b.loftOccurrenceId===occurrence.id);
    ops.push({
      op:'geometry.extrude@1.0.0',
      semanticOwner:occurrence.id,
      pirOperationId:occurrence.id+':extrusion',
      featurePath:textId(extrude['id'],'EXTRUDE_ID'),
      profile:[
        [cx-w/2,cy-h/2,tz],[cx+w/2,cy-h/2,tz],
        [cx+w/2,cy+h/2,tz],[cx-w/2,cy+h/2,tz],
      ],
      vector:[0,0,d],
    });
    parts.push({
      semanticOwner:occurrence.id,
      sourcePartId:partId,
      sourceRole:String(def['role']??'unclassified'),
      sourceAssemblyId:assemblyId,
      sourceInstanceId:instanceId,
      material:String(def['material']??'Unclassified'),
      boundBuildEntityId:bound?.buildEntityId??null,
    });
  }
  const request=parseGeometryCompileRequest({
    snapshotHash:hashSourceBytes(JSON.stringify([build,loft])),
    pirHash:hashSourceBytes(JSON.stringify(ops)),
    dagHash:hashSourceBytes(JSON.stringify(ops.map(o=>o['pirOperationId']))),
    compilerVersion:'fusion-native-assembly/0.1',
    parameters:{},ops,chordDeviationMm:1,angleDeviationDeg:20,
  });
  return {request,parts,sourceHashes:{build:build!,loft:loft!}};
}
export async function verifyFusionNativeAssembly(input:{
  readonly source:Source;
  readonly serviceUrl:string;
  readonly fetchImpl?:typeof fetch;
  readonly timeoutMs?:number;
}):Promise<FusionNativeAssembly> {
  const planned=planFusionNativeAssembly(input.source);
  const local=executeExactCompile(new InProcessGeometryKernel(),planned.request);
  if(local.meshes.length!==planned.parts.length)
    throw new Error('FUSION_ASSEMBLY_EXACT_CARDINALITY');
  const url=input.serviceUrl.replace(/\/$/,'');
  if(!/^https?:\/\/[^/]+/.test(url))throw new Error('FUSION_ASSEMBLY_SERVICE_URL_REQUIRED');
  const ctrl=new AbortController(), timer=setTimeout(()=>ctrl.abort(),input.timeoutMs??45_000);
  let res:Response;
  try{
    res=await(input.fetchImpl??fetch)(url+'/v1/compile/meshes',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({compile:planned.request,kernels:['occt-native']}),signal:ctrl.signal,
    });
  }catch(err){
    throw new Error('FUSION_ASSEMBLY_SERVICE_UNAVAILABLE: '+String(err));
  }finally{clearTimeout(timer);}
  if(!res.ok)throw new Error('FUSION_ASSEMBLY_SERVICE_REJECTED: '+res.status);
  const data=rec(await res.json(),'RESPONSE');
  const same=rec(data['exact'],'EXACT_COMPARISON');
  if(same['compileHash']!==local.compileHash)
    throw new Error('FUSION_ASSEMBLY_DIGEST_MISMATCH');
  if(data['occtNativeError'])
    throw new Error('FUSION_ASSEMBLY_NATIVE_FAILURE: '+String(data['occtNativeError']));
  const native=rec(data['occtNative'],'OCCT_NATIVE');
  if(native['kernel']!=='occt-native')
    throw new Error('FUSION_ASSEMBLY_NOT_NATIVE');
  const reps=arr(native['representations'],'NATIVE_REPRESENTATIONS')
    .map(item=>GeometryRepresentationSchema.parse(item));
  const meshes=arr(native['meshes'],'NATIVE_MESHES')
    .map(item=>GeometryCompileMeshSchema.parse(item));
  if(reps.length!==planned.parts.length||meshes.length!==planned.parts.length)
    throw new Error('FUSION_ASSEMBLY_NATIVE_CARDINALITY');
  const repByOwner=new Map(reps.map(rep=>[rep.semanticOwner,rep]));
  const meshByOwner=new Map(meshes.map(mesh=>[mesh.semanticOwner,mesh]));
  if(repByOwner.size!==reps.length||meshByOwner.size!==meshes.length)
    throw new Error('FUSION_ASSEMBLY_DUPLICATE_OWNER');
  const parts=planned.parts.map((part,i)=>{
    const reference=local.meshes[i]!;
    const rep=repByOwner.get(part.semanticOwner);
    const mesh=meshByOwner.get(part.semanticOwner);
    if(!rep||!mesh)throw new Error('FUSION_ASSEMBLY_MISSING_OWNER');
    const comparison=checkParity(reference,mesh,rep);
    return {
      ...part,representationId:rep.id,volumeMm3:rep.mass.volumeMm3,
      ...comparison,
    };
  });
  return {
    stage:'F11',status:'native-assembly-preview',
    kernel:'occt-native',nativeBrepConstructed:true,
    sourceScope:'xy-rectangle-extrusion-occurrences-only',
    sourceHashes:planned.sourceHashes,compileHash:local.compileHash,
    partCount:parts.length,materials:[...new Set(parts.map(p=>p.material))],
    parts,meshes,productionReady:false,
    unresolved:[
      'Only bounded rectangular Loft profiles and extrude; arbitrary feature trees and Boolean lineage remain open',
      'No weatherproofing, structure, IFC or fabrication validation',
      'Multi-part geometry is a derived candidate, not the accepted canonical BIM representation',
    ],
  };
}
export function registerFusionAssemblyRoute(app:FastifyInstance,store:VersionStore):void {
  app.post<{Body:Head}>('/imports/fusion/native-assembly',async(req,reply)=>{
    const body=req.body;
    if(!body||!body.modelId||!body.branchId||!body.expectedHeadHash)
      return reply.code(422).send({failureCode:'FUSION_ASSEMBLY_BASE_REQUIRED'});
    try{
      const head=await asPromise(store.getBranchHead(body.branchId));
      if(head.modelId!==body.modelId||head.headHash!==body.expectedHeadHash)
        return reply.code(409).send({failureCode:'FUSION_HEAD_CONFLICT'});
      const serviceUrl=process.env['GEOMETRY_URL']??process.env['SPDS_GEOMETRY_URL'];
      if(!serviceUrl)return reply.code(503).send({
        failureCode:'FUSION_ASSEMBLY_NATIVE_UNAVAILABLE',
        summary:'Native OpenCascade service is mandatory for assembly qualification',
      });
      const result=await verifyFusionNativeAssembly({
        source:body,serviceUrl,timeoutMs:45_000,
      });
      const after=await asPromise(store.getBranchHead(body.branchId));
      if(after.headHash!==body.expectedHeadHash)
        return reply.code(409).send({failureCode:'FUSION_HEAD_CONFLICT'});
      return reply.send({...result,basedOnHeadHash:body.expectedHeadHash});
    }catch(err){
      return reply.code(422).send({
        failureCode:'FUSION_ASSEMBLY_REJECTED',
        summary:err instanceof Error?err.message:'Native assembly failed',
        productionReady:false,
      });
    }
  });
}
