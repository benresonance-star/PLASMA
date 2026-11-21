import type { FastifyInstance } from 'fastify';
import { asPromise, type VersionStore } from '@spds/version-core';
import {
  GeometryCompileMeshSchema,
  GeometryRepresentationSchema,
  type GeometryCompileMesh,
} from '@spds/geometry-contracts';
import { previewSupportedLoftSolid } from './fusion-geometry.js';

interface NativeInput extends Parameters<typeof previewSupportedLoftSolid>[0] {
  readonly modelId: string;
  readonly branchId: string;
  readonly expectedHeadHash: string;
}
function record(input: unknown, label: string): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error(label + ': expected object');
  return input as Record<string, unknown>;
}
function rows(input: unknown, label: string): unknown[] {
  if (!Array.isArray(input)) throw new Error(label + ': expected array');
  return input;
}
function bounds(mesh: GeometryCompileMesh): {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
} {
  if (mesh.vertices.length < 4 || mesh.triangleCount < 4)
    throw new Error('FUSION_NATIVE_MESH_EMPTY');
  const min:[number,number,number]=[Infinity,Infinity,Infinity];
  const max:[number,number,number]=[-Infinity,-Infinity,-Infinity];
  for (const vertex of mesh.vertices) {
    for (let k=0;k<3;k++) {
      const value=vertex[k]!;
      if (!Number.isFinite(value)) throw new Error('FUSION_NATIVE_MESH_NONFINITE');
      min[k]=Math.min(min[k]!,value);
      max[k]=Math.max(max[k]!,value);
    }
  }
  return {min,max};
}
export interface FusionNativeParity {
  readonly stage: 'F10';
  readonly status: 'native-parity-verified';
  readonly sourceScope: 'one-bound-xy-rectangle-extrusion';
  readonly kernel: 'occt-native';
  readonly semanticOwner: string;
  readonly sourceHashes: {readonly build:string;readonly loft:string};
  readonly exactCompileHash: string;
  readonly nativeRepresentationId: string;
  readonly topologyElementCount: number;
  readonly relativeVolumeError: number;
  readonly maximumBoundingErrorMm: number;
  readonly nativeVolumeMm3: number;
  readonly nativeStepHashCount: number;
  readonly nativeBrepConstructed: true;
  readonly fabricationReady: false;
  readonly hotelBimReleaseReady: false;
  readonly outstanding: readonly string[];
}

/** Use an actual native OpenCascade.js B-rep endpoint. No local exact-adapter
 * fallback may satisfy this gate. The request and response are independently
 * checked for semantic identity, measured volume and bounding dimensions.
 */
export async function verifySupportedLoftNativeParity(input: {
  readonly source: Parameters<typeof previewSupportedLoftSolid>[0];
  readonly serviceUrl: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}): Promise<FusionNativeParity> {
  const serviceUrl=input.serviceUrl.replace(/\/$/,'');
  if (!/^https?:\/\/[^/]+/.test(serviceUrl))
    throw new Error('FUSION_NATIVE_SERVICE_URL_REQUIRED');
  const local=previewSupportedLoftSolid(input.source);
  const reference=local.meshes[0];
  if (!reference || local.meshes.length!==1)throw new Error('FUSION_NATIVE_EXPECTS_ONE_SOLID');
  const timeout=input.timeoutMs??25_000;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  let response:Response;
  try {
    response=await (input.fetchImpl??fetch)(serviceUrl+'/v1/compile/meshes',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({compile:local.compileRequest,kernels:['occt-native']}),
      signal:controller.signal,
    });
  } catch(err) {
    throw new Error('FUSION_NATIVE_SERVICE_UNAVAILABLE: '+(err instanceof Error?err.message:'Network failure'));
  } finally {
    clearTimeout(timer);
  }
  if(!response.ok) throw new Error('FUSION_NATIVE_SERVICE_REJECTED: '+response.status);
  const body=record(await response.json(),'Native response');
  const returnedExact=record(body['exact'],'Native exact comparison');
  if(returnedExact['compileHash']!==local.compileHash)
    throw new Error('FUSION_NATIVE_COMPILE_HASH_MISMATCH');
  if(body['occtNativeError']!==undefined)
    throw new Error('FUSION_NATIVE_BREP_FAILURE: '+String(body['occtNativeError']));
  const native=record(body['occtNative'],'Native OCCT result');
  if(native['kernel']!=='occt-native')throw new Error('FUSION_NATIVE_KERNEL_NOT_OCCT');
  const reps=rows(native['representations'],'Native representations')
    .map(item=>GeometryRepresentationSchema.parse(item));
  const meshes=rows(native['meshes'],'Native meshes')
    .map(item=>GeometryCompileMeshSchema.parse(item));
  if(reps.length!==1||meshes.length!==1)throw new Error('FUSION_NATIVE_SOLID_CARDINALITY');
  const rep=reps[0]!,mesh=meshes[0]!;
  if(rep.kernel!=='occt-native'||mesh.kernel!=='occt-native'||
      rep.semanticOwner!==local.semanticOwner||mesh.semanticOwner!==local.semanticOwner)
    throw new Error('FUSION_NATIVE_SEMANTIC_OWNER_MISMATCH');
  if(rep.validationState!=='geometry-generated' || rep.mass.volumeMm3<=0 ||
      !Number.isFinite(rep.mass.volumeMm3))throw new Error('FUSION_NATIVE_INVALID_SOLID');
  const elements=rep.topologyElements??[];
  if(!elements.length || elements.some(element=>!element.path.startsWith(local.semanticOwner+'/')))
    throw new Error('FUSION_NATIVE_TOPOLOGY_EVIDENCE_MISSING');
  const base=bounds(reference),observed=bounds(mesh);
  const baseDims=base.max.map((v,i)=>v-base.min[i]!) as [number,number,number];
  const expectedVolume=baseDims[0]*baseDims[1]*baseDims[2];
  if(expectedVolume<=0||!Number.isFinite(expectedVolume))throw new Error('FUSION_NATIVE_INVALID_REFERENCE');
  const volumeError=Math.abs(rep.mass.volumeMm3-expectedVolume)/expectedVolume;
  const maxBoundError=Math.max(
    ...base.min.map((v,i)=>Math.abs(v-observed.min[i]!)),
    ...base.max.map((v,i)=>Math.abs(v-observed.max[i]!)),
  );
  if(volumeError>0.0001 || maxBoundError>0.5)
    throw new Error('FUSION_NATIVE_PARITY_EXCEEDED: volume '+volumeError+' extents '+maxBoundError+' mm');
  return {
    stage:'F10',status:'native-parity-verified',
    sourceScope:'one-bound-xy-rectangle-extrusion',
    kernel:'occt-native',semanticOwner:local.semanticOwner,
    sourceHashes:local.sourceHashes,
    exactCompileHash:local.compileHash,
    nativeRepresentationId:rep.id,
    topologyElementCount:elements.length,
    relativeVolumeError:volumeError,
    maximumBoundingErrorMm:maxBoundError,
    nativeVolumeMm3:rep.mass.volumeMm3,
    nativeStepHashCount:rows(native['stepHashes'],'Native STEP hashes').length,
    nativeBrepConstructed:true,
    fabricationReady:false,
    hotelBimReleaseReady:false,
    outstanding:[
      'Native proof applies only to one restricted Loft sketch/extrusion occurrence',
      'Loft B-rep feature lineage, Boolean history, drawings and host rules are not yet proven',
      'No IFC4X3 roundtrip, fabrication or hotel-scale acceptance',
    ],
  };
}

export function registerFusionNativeRoute(app:FastifyInstance,store:VersionStore):void {
  app.post<{Body:NativeInput}>('/imports/fusion/native-parity',async(req,reply)=>{
    const body=req.body;
    if(!body || !body.modelId || !body.branchId || !body.expectedHeadHash)
      return reply.code(422).send({failureCode:'FUSION_NATIVE_BASE_REQUIRED'});
    try{
      const head=await asPromise(store.getBranchHead(body.branchId));
      if(head.modelId!==body.modelId||head.headHash!==body.expectedHeadHash)
        return reply.code(409).send({failureCode:'FUSION_HEAD_CONFLICT'});
      const url=process.env['GEOMETRY_URL']??process.env['SPDS_GEOMETRY_URL'];
      if(!url) return reply.code(503).send({
        failureCode:'FUSION_NATIVE_SERVICE_NOT_CONFIGURED',
        summary:'An actual OpenCascade geometry-service URL is required for native proof',
        nativeBrepConstructed:false,
      });
      const result=await verifySupportedLoftNativeParity({
        source:body,serviceUrl:url,timeoutMs:30_000,
      });
      const after=await asPromise(store.getBranchHead(body.branchId));
      if(after.headHash!==body.expectedHeadHash)
        return reply.code(409).send({failureCode:'FUSION_HEAD_CONFLICT'});
      return reply.send({...result,basedOnHeadHash:body.expectedHeadHash});
    }catch(err){
      return reply.code(422).send({
        failureCode:'FUSION_NATIVE_PARITY_REJECTED',
        summary:err instanceof Error?err.message:'Native geometry verification failed',
        nativeBrepConstructed:false,
      });
    }
  });
}
