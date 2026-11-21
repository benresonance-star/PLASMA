import { describe, expect, it, vi } from 'vitest';
import { composeFirstFusion } from '@spds/import-core';
import { previewSupportedLoftSolid } from './fusion-geometry.js';
import { verifySupportedLoftNativeParity } from './fusion-native.js';
import { buildServer } from './server.js';

const at='2026-11-21T00:00:00.000Z';
const buildProject={app:'Build',schemaVersion:2,savedAt:at,authoritativeGraph:{
  entities:[{id:'entity:window',kind:'Entity',name:'Window',
    semanticType:'architecture.hosted-opening',createdAt:at,updatedAt:at,
    schemaVersion:'1.0.0'}],
  parameters:[],relationships:[],
}};
const loftProject={id:'NativeProof',schemaVersion:2,units:'mm',
  parts:[{id:'Frame',parameters:{W:180,H:100,D:65},features:[
    {id:'sketch',type:'sketch',plane:{type:'datum',name:'XY'},
      profile:{kind:'rectangle',width:'W',height:'H'}},
    {id:'extrude',type:'extrude',sketch:'sketch',depth:'D'},
  ]}],
  rootAssembly:'Main',assemblies:[{id:'Main',instances:[
    {id:'frame1',partId:'Frame',placement:{translation:[100,0,250]}},
  ]}],
};
const bindings=[{buildEntityId:'entity:window',loftAssemblyId:'Main',loftInstanceId:'frame1'}];
function setup() {
  const f=composeFirstFusion({buildProject,loftProject,bindings});
  const source={buildProject,loftProject,bindings,
    expectedSourceHashes:{build:f.sources[0]!.sourceHash,loft:f.sources[1]!.sourceHash},
    loftOccurrenceId:f.bindings[0]!.loftOccurrenceId};
  const result=previewSupportedLoftSolid(source);
  const mesh=result.meshes[0]!;
  const dims=[180,100,65];
  const rep={
    id:'repr:occt-native:test-001',semanticOwner:mesh.semanticOwner,
    pirOperationId:mesh.pirOperationId,kernel:'occt-native',
    validationState:'geometry-generated',
    solid:{kind:'solid',extentsMm:{min:[10,-50,250],max:[190,50,315]}},
    mass:{volumeMm3:dims[0]*dims[1]*dims[2],areaMm2:2*(18000+6500+11700),
      centerOfMassMm:[100,0,282.5]},
    subElementPaths:[mesh.semanticOwner+'/extrude/face:top'],
    topologyElements:[{path:mesh.semanticOwner+'/extrude/face:top',kind:'face',
      boundsMm:{min:[10,-50,315],max:[190,50,315]}}],
    fabricationReady:false,
  };
  const response={
    exact:{compileHash:result.compileHash},occtNative:{
      kernel:'occt-native',representations:[rep],meshes:[{...mesh,kernel:'occt-native'}],
      meshHashes:['native:sha'],stepHashes:['step:sha'],
    },
  };
  return {source,result,response};
}
function fakeFetch(body:unknown):typeof fetch{
  return vi.fn(async()=>({
    ok:true,status:201,json:async()=>body,
  } as Response)) as unknown as typeof fetch;
}
describe('F10 native OCC B-rep parity verification',()=>{
  it('accepts only topology-identified native OCC solids with matching extents, volume and owner',async()=>{
    const {source,response}=setup();
    const report=await verifySupportedLoftNativeParity({
      source,serviceUrl:'http://occt-qa:7080',fetchImpl:fakeFetch(response),
    });
    expect(report).toMatchObject({
      stage:'F10',status:'native-parity-verified',kernel:'occt-native',
      nativeBrepConstructed:true,fabricationReady:false,hotelBimReleaseReady:false,
    });
    expect(report.maximumBoundingErrorMm).toBeLessThan(1e-8);
    expect(report.relativeVolumeError).toBeLessThan(1e-8);
    expect(report.topologyElementCount).toBeGreaterThan(0);
  });
  it('rejects plausible exact-adapter impostors and invalid B-rep mass',async()=>{
    const {source,response}=setup();
    const substitute=structuredClone(response);
    substitute.occtNative.kernel='exact-adapter';
    await expect(verifySupportedLoftNativeParity({
      source,serviceUrl:'http://occt-qa:7080',fetchImpl:fakeFetch(substitute),
    })).rejects.toThrow(/KERNEL_NOT_OCCT/);
    const wrongVolume=structuredClone(response);
    wrongVolume.occtNative.representations[0]!.mass.volumeMm3=1;
    await expect(verifySupportedLoftNativeParity({
      source,serviceUrl:'http://occt-qa:7080',fetchImpl:fakeFetch(wrongVolume),
    })).rejects.toThrow(/PARITY_EXCEEDED/);
  });
  it('fails closed when service does not return native B-rep evidence',async()=>{
    const {source,response}=setup();
    const missing=structuredClone(response);
    missing.occtNative.representations[0]!.topologyElements=[];
    await expect(verifySupportedLoftNativeParity({
      source,serviceUrl:'http://occt-qa:7080',fetchImpl:fakeFetch(missing),
    })).rejects.toThrow(/TOPOLOGY_EVIDENCE_MISSING/);
    await expect(verifySupportedLoftNativeParity({
      source,serviceUrl:'bad-url',fetchImpl:fakeFetch(response),
    })).rejects.toThrow(/SERVICE_URL_REQUIRED/);
  });
});

describe('F10 live OCCT service (when CI service is running)',()=>{
  it.skipIf(!process.env['GEOMETRY_URL'])(
    'proves native constructive extrusion from actual OpenCascade.js service',async()=>{
      const {app}=buildServer();
      const created=await app.inject({method:'POST',url:'/models',payload:{name:'F10 native QA'}});
      const {model,branchId,headHash}=created.json() as {
        model:{modelId:string};branchId:string;headHash:string;
      };
      const source=setup().source;
      const check=await app.inject({method:'POST',url:'/imports/fusion/native-parity',
        payload:{...source,modelId:model.modelId,branchId,expectedHeadHash:headHash}});
      expect(check.statusCode,check.body).toBe(200);
      expect(check.json()).toMatchObject({
        stage:'F10',status:'native-parity-verified',kernel:'occt-native',
        nativeBrepConstructed:true,hotelBimReleaseReady:false,
      });
      expect(check.json().topologyElementCount).toBeGreaterThan(0);
      expect(check.json().maximumBoundingErrorMm).toBeLessThanOrEqual(0.5);
      const branch=await app.inject({method:'GET',
        url:'/models/'+model.modelId+'/branches/'+branchId+'/head'});
      expect(branch.json().branch.headHash).toBe(headHash);
      await app.close();
    },
  );
});
