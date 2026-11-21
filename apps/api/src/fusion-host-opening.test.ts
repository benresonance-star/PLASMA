import { describe, expect, it, vi } from 'vitest';
import { composeFirstFusion } from '@spds/import-core';
import { executeExactCompile, InProcessGeometryKernel } from '@spds/geometry-contracts';
import { planFusionHostOpening, verifyFusionHostOpening } from './fusion-host-opening.js';
import { buildServer } from './server.js';

const at='2026-11-21T00:00:00.000Z';
function input(){
  const buildProject={
    app:'Build',schemaVersion:2,savedAt:at,authoritativeGraph:{
      entities:[
        {id:'entity:qa:wall',kind:'Entity',name:'Facade wall',
          semanticType:'architecture.wall-front',createdAt:at,updatedAt:at,
          schemaVersion:'1.0.0',
          metadata:{geometryMm:{width:3000,height:2800,thickness:200}}},
        {id:'entity:qa:window',kind:'Entity',name:'Window W04',
          semanticType:'architecture.hosted-opening',createdAt:at,updatedAt:at,
          schemaVersion:'1.0.0',
          metadata:{openingMm:{width:1200,height:1200,sill:900,centerX:0,minimumJamb:200}}},
      ],
      parameters:[],
      relationships:[{id:'relationship:host',kind:'Relationship',name:'Hosted',
        semanticType:'architecture.hosted-by',relationType:'architecture.hosted-by',
        from:'entity:qa:window',to:'entity:qa:wall',createdAt:at,updatedAt:at,
        schemaVersion:'1.0.0'}],
    },
  };
  const loftProject={id:'HostCut',schemaVersion:2,units:'mm',parts:[
    {id:'Frame',parameters:{W:1200},features:[]},
  ],rootAssembly:'Main',assemblies:[{id:'Main',instances:[
    {id:'Frame1',partId:'Frame',placement:{translation:[0,0,0]}},
  ]}]};
  const bindings=[{buildEntityId:'entity:qa:window',loftAssemblyId:'Main',loftInstanceId:'Frame1'}];
  const preview=composeFirstFusion({buildProject,loftProject,bindings});
  return {buildProject,loftProject,bindings,
    expectedSourceHashes:{
      build:preview.sources[0]!.sourceHash,loft:preview.sources[1]!.sourceHash,
    },
    hostWallId:'entity:qa:wall',hostedOpeningId:'entity:qa:window',
  };
}
function fakeService(source:ReturnType<typeof input>,volumeOverride?:number):typeof fetch {
  const plan=planFusionHostOpening(source);
  const exact=executeExactCompile(new InProcessGeometryKernel(),plan.request);
  const finalId=source.hostWallId+':opening-cut';
  const final={
    id:'repr:occt-native:host-cut',
    semanticOwner:source.hostWallId,pirOperationId:finalId,
    kernel:'occt-native',validationState:'geometry-generated',
    solid:{kind:'solid',extentsMm:{
      min:[-1500,-100,0],max:[1500,100,2800],
    }},
    mass:{volumeMm3:volumeOverride??plan.remainingVolumeMm3,areaMm2:1,
      centerOfMassMm:[0,0,1400]},
    subElementPaths:[source.hostWallId+'/window-opening-cut/result'],
    fabricationReady:false,
  };
  const other=(id:string)=>({...final,pirOperationId:id,id:id});
  const nativeMesh={
    representationId:final.id,semanticOwner:source.hostWallId,
    pirOperationId:finalId,kernel:'occt-native',
    vertices:[[-1500,-100,0],[1500,-100,0],[1500,100,0],[-1500,100,0],
      [-1500,-100,2800],[1500,-100,2800],[1500,100,2800],[-1500,100,2800]],
    indices:[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,2,3,7,2,7,6,0,4,7,0,7,3,1,2,6,1,6,5],
    triangleCount:12,maxDeviationMm:1,
  };
  return vi.fn(async()=>({ok:true,status:201,json:async()=>({
    exact:{compileHash:exact.compileHash},
    occtNative:{kernel:'occt-native',representations:[
      other(source.hostWallId+':wall-solid'),
      other(source.hostedOpeningId+':window-void'),
      final,
    ],meshes:[nativeMesh]},
  })} as Response)) as unknown as typeof fetch;
}
describe('F12 Build-hosted opening native constructive wall geometry',()=>{
  it('maps one real host relationship to exact Boolean and checks preserved wall volume',async()=>{
    const source=input(), plan=planFusionHostOpening(source);
    expect(plan.remainingVolumeMm3).toBe(3000*200*2800-1200*200*1200);
    expect(plan.jambsMm).toEqual({left:900,right:900});
    expect(plan.request.ops).toHaveLength(3);
    const result=await verifyFusionHostOpening({
      source,serviceUrl:'http://native.test:7080',fetchImpl:fakeService(source),
    });
    expect(result).toMatchObject({
      stage:'F12',status:'native-host-opening-preview',kernel:'occt-native',
      nativeBrepConstructed:true,productionReady:false,relativeVolumeError:0,
    });
    expect(result.mesh.triangleCount).toBeGreaterThanOrEqual(12);
  });
  it('rejects window breaches, insufficient jambs and stale sources',()=>{
    const source=input();
    source.buildProject.authoritativeGraph.entities[1]!.metadata={
      openingMm:{width:2900,height:1200,sill:900,centerX:0,minimumJamb:200},
    };
    const q=composeFirstFusion(source);
    expect(()=>planFusionHostOpening({
      ...source,expectedSourceHashes:{build:q.sources[0]!.sourceHash,loft:q.sources[1]!.sourceHash},
    })).toThrow(/INSUFFICIENT_JAMB_WIDTH/);
    expect(()=>planFusionHostOpening({
      ...source,expectedSourceHashes:{build:'stale',loft:source.expectedSourceHashes.loft},
    })).toThrow(/SOURCE_STALE/);
  });
  it('rejects fake native subtraction volumes',async()=>{
    const source=input();
    await expect(verifyFusionHostOpening({
      source,serviceUrl:'http://native.test:7080',
      fetchImpl:fakeService(source,12345),
    })).rejects.toThrow(/REMOVAL_VOLUME_MISMATCH/);
  });
});
describe('F12 live OCC Build hosting Boolean',()=>{
  it.skipIf(!process.env['GEOMETRY_URL'])(
    'constructs an actual native B-rep facade wall with a punched hosted window',async()=>{
      const {app}=buildServer();
      const created=await app.inject({method:'POST',url:'/models',payload:{name:'F12 host demo'}});
      const {model,branchId,headHash}=created.json() as {
        model:{modelId:string};branchId:string;headHash:string;
      };
      const res=await app.inject({
        method:'POST',url:'/imports/fusion/host-opening-preview',
        payload:{...input(),modelId:model.modelId,branchId,expectedHeadHash:headHash},
      });
      expect(res.statusCode,res.body).toBe(200);
      expect(res.json()).toMatchObject({
        status:'native-host-opening-preview',kernel:'occt-native',
        nativeBrepConstructed:true,productionReady:false,
      });
      expect(res.json().relativeVolumeError).toBeLessThan(1e-4);
      const after=await app.inject({method:'GET',
        url:'/models/'+model.modelId+'/branches/'+branchId+'/head'});
      expect(after.json().branch.headHash).toBe(headHash);
      await app.close();
    });
});
