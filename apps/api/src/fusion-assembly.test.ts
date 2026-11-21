import { describe, expect, it, vi } from 'vitest';
import { composeFirstFusion } from '@spds/import-core';
import { executeExactCompile, InProcessGeometryKernel } from '@spds/geometry-contracts';
import { planFusionNativeAssembly, verifyFusionNativeAssembly } from './fusion-assembly.js';
import { buildServer } from './server.js';

const at='2026-11-21T00:00:00.000Z';
function sources(){
  const buildProject={app:'Build',schemaVersion:2,savedAt:at,
    authoritativeGraph:{
      entities:[{id:'entity:qa:window',name:'Window',kind:'Entity',
        semanticType:'architecture.hosted-opening',schemaVersion:'1.0.0',
        createdAt:at,updatedAt:at}],
      parameters:[],relationships:[],
    },
  };
  function part(id:string,material:string,w:number,h:number,d:number){
    return {
      id,material,parameters:{W:w,H:h,D:d},
      features:[
        {id:id+':sketch',type:'sketch',plane:{type:'datum',name:'XY'},
          profile:{kind:'rectangle',width:'W',height:'H'}},
        {id:id+':extrude',type:'extrude',sketch:id+':sketch',depth:'D'},
      ],
    };
  }
  const loftProject={
    id:'NativeAssemblies',schemaVersion:2,units:'mm',
    parts:[
      part('Brick','Brick',115,90,300),
      part('Frame','Aluminium',155,90,200),
      part('Glass','Glazing',12,90,200),
    ],
    rootAssembly:'Main',assemblies:[{id:'Main',instances:[
      {id:'Brick01',partId:'Brick',placement:{translation:[-160,0,0]}},
      {id:'Frame01',partId:'Frame',placement:{translation:[60,0,65]}},
      {id:'Glass01',partId:'Glass',placement:{translation:[60,0,65]}},
    ]}],
  };
  const bindings=[{buildEntityId:'entity:qa:window',loftAssemblyId:'Main',loftInstanceId:'Frame01'}];
  const p=composeFirstFusion({buildProject,loftProject,bindings});
  const source={
    buildProject,loftProject,bindings,
    expectedSourceHashes:{
      build:p.sources[0]!.sourceHash,loft:p.sources[1]!.sourceHash,
    },
  };
  return source;
}
function fetchNativeMock(plan:ReturnType<typeof planFusionNativeAssembly>):typeof fetch{
  const exact=executeExactCompile(new InProcessGeometryKernel(),plan.request);
  const meshes=exact.meshes.map(x=>({...x,kernel:'occt-native'}));
  const representations=exact.meshes.map((mesh,i)=>{
    const op=plan.request.ops[i]!;
    if(op.op!=='geometry.extrude@1.0.0')throw new Error('bad test');
    const xs=mesh.vertices.map(v=>v[0]),ys=mesh.vertices.map(v=>v[1]),
      zs=mesh.vertices.map(v=>v[2]);
    const min:[number,number,number]=[Math.min(...xs),Math.min(...ys),Math.min(...zs)];
    const max:[number,number,number]=[Math.max(...xs),Math.max(...ys),Math.max(...zs)];
    const volume=(max[0]-min[0])*(max[1]-min[1])*(max[2]-min[2]);
    return {
      id:'repr:native:'+i,semanticOwner:mesh.semanticOwner,
      pirOperationId:mesh.pirOperationId,kernel:'occt-native',
      validationState:'geometry-generated',
      solid:{kind:'solid',extentsMm:{min,max}},
      mass:{volumeMm3:volume,areaMm2:0,centerOfMassMm:[(min[0]+max[0])/2,
        (min[1]+max[1])/2,(min[2]+max[2])/2]},
      subElementPaths:[mesh.semanticOwner+'/face-top'],
      topologyElements:[{path:mesh.semanticOwner+'/face-top',kind:'face',
        boundsMm:{min,max}}],
      fabricationReady:false,
    };
  });
  return vi.fn(async()=>({
    ok:true,status:201,json:async()=>({
      exact:{compileHash:exact.compileHash},
      occtNative:{kernel:'occt-native',representations,meshes,stepHashes:['step:1']},
    }),
  } as Response)) as unknown as typeof fetch;
}
describe('F11 source-bound Loft native assembly compiler',()=>{
  it('preserves three occurrence identities, material labels, build binding and exact extents',async()=>{
    const source=sources(),plan=planFusionNativeAssembly(source);
    expect(plan.parts).toHaveLength(3);
    expect(plan.parts.filter(p=>p.boundBuildEntityId!==null)).toHaveLength(1);
    const result=await verifyFusionNativeAssembly({
      source,serviceUrl:'http://native.test:7080',fetchImpl:fetchNativeMock(plan),
    });
    expect(result).toMatchObject({
      stage:'F11',status:'native-assembly-preview',partCount:3,
      nativeBrepConstructed:true,productionReady:false,kernel:'occt-native',
    });
    expect(result.materials).toEqual(expect.arrayContaining(['Brick','Glazing','Aluminium']));
    expect(result.parts.every(p=>p.topologyCount>0 && p.maximumBoundingErrorMm<1e-8)).toBe(true);
  });
  it('rejects unsupported Loft feature histories and placements instead of omitting parts',()=>{
    const bad=sources();
    bad.loftProject.parts[0]!.features.pop();
    const preview=composeFirstFusion({
      buildProject:bad.buildProject,loftProject:bad.loftProject,bindings:bad.bindings,
    });
    const source={...bad,expectedSourceHashes:{
      build:preview.sources[0]!.sourceHash,loft:preview.sources[1]!.sourceHash,
    }};
    expect(()=>planFusionNativeAssembly(source)).toThrow(/UNSUPPORTED_FEATURE_HISTORY/);
    const transform=sources();
    (transform.loftProject.assemblies[0]!.instances[0]!.placement as Record<string,unknown>)
      .rotation=[0,0,90];
    const q=composeFirstFusion(transform);
    expect(()=>planFusionNativeAssembly({
      ...transform,expectedSourceHashes:{
        build:q.sources[0]!.sourceHash,loft:q.sources[1]!.sourceHash,
      },
    })).toThrow(/UNSUPPORTED_TRANSFORM/);
  });
});
describe('F11 native assembly HTTP gateway',()=>{
  it.skipIf(!process.env['GEOMETRY_URL'])(
    'constructs three actual OCCT native solids and checks every mass and topology owner',async()=>{
      const {app}=buildServer();
      const created=await app.inject({method:'POST',url:'/models',payload:{name:'F11 native assembly QA'}});
      const {model,branchId,headHash}=created.json() as {
        model:{modelId:string};branchId:string;headHash:string;
      };
      const res=await app.inject({method:'POST',url:'/imports/fusion/native-assembly',
        payload:{...sources(),modelId:model.modelId,branchId,expectedHeadHash:headHash}});
      expect(res.statusCode,res.body).toBe(200);
      expect(res.json()).toMatchObject({
        stage:'F11',kernel:'occt-native',nativeBrepConstructed:true,
        partCount:3,productionReady:false,
      });
      expect(res.json().parts.every((x:{topologyCount:number})=>x.topologyCount>0)).toBe(true);
      expect((await app.inject({method:'GET',
        url:'/models/'+model.modelId+'/branches/'+branchId+'/head'})).json()
        .branch.headHash).toBe(headHash);
      await app.close();
    },
  );
});
