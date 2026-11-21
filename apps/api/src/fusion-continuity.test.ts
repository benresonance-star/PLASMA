import { describe, expect, it } from 'vitest';
import { buildServer } from './server.js';
import { composeFirstFusion } from '@spds/import-core';

const at = '2026-11-21T00:00:00.000Z';
const buildProject = { app:'Build',schemaVersion:2,savedAt:at,
  authoritativeGraph: {
    entities:[
      {id:'entity:wall',kind:'Entity',semanticType:'architecture.wall-front',name:'Facade',
        createdAt:at,updatedAt:at,schemaVersion:'1.0.0'},
      {id:'entity:window',kind:'Entity',semanticType:'architecture.hosted-opening',name:'Window',
        createdAt:at,updatedAt:at,schemaVersion:'1.0.0'},
    ],
    parameters:[],
    relationships:[{id:'relationship:host',kind:'Relationship',
      semanticType:'architecture.hosted-by',name:'Hosted',
      relationType:'architecture.hosted-by',from:'entity:window',to:'entity:wall',
      createdAt:at,updatedAt:at,schemaVersion:'1.0.0'}],
  },
};
const loftProject={id:'LoftDetail',schemaVersion:2,units:'mm',
  parts:[{id:'Frame',material:'Aluminium',parameters:{W:120},
    features:[
      {id:'Sketch',type:'sketch',plane:{type:'datum',name:'XY'},
        profile:{kind:'rectangle',width:'W',height:80}},
      {id:'Extrude',type:'extrude',sketch:'Sketch',depth:55},
    ]}],
  rootAssembly:'Main',assemblies:[{id:'Main',instances:[
    {id:'Frame_01',partId:'Frame',placement:{translation:[0,0,100]}},
  ]}],
};
const bindings=[{buildEntityId:'entity:window',loftAssemblyId:'Main',loftInstanceId:'Frame_01'}];
describe('Northstar continuity API F04–F08',()=>{
  it('reviews hosting, 1:5 detail, real relationships and blocked hotel qualification against one head',async()=>{
    const {app}=buildServer();
    const creation=await app.inject({method:'POST',url:'/models',payload:{name:'Northstar QA'}});
    const info=creation.json() as {model:{modelId:string};branchId:string;headHash:string};
    const preview=composeFirstFusion({buildProject,loftProject,bindings});
    const basis={
      modelId:info.model.modelId,branchId:info.branchId,expectedHeadHash:info.headHash,
      buildProject,loftProject,bindings,
      expectedSourceHashes:{
        build:preview.sources[0]!.sourceHash,
        loft:preview.sources[1]!.sourceHash,
      },
    };
    for(const [stage,field] of [
      ['F04','hostedOpenings'],['F05','before'],['F07','edges'],['F08','gates'],
    ] as const){
      const res=await app.inject({
        method:'POST',url:'/imports/fusion/continuity-preview',
        payload:{...basis,stage,...(stage==='F07'?{selectedId:'entity:window'}:{})},
      });
      expect(res.statusCode,res.body).toBe(200);
      expect(res.json()).toHaveProperty(field);
      expect(res.json().publicationReady).toBe(false);
      if(stage==='F05') expect(res.json().before.svg).toContain('NOT FOR CONSTRUCTION');
      if(stage==='F08') expect(res.json().status).toBe('blocked');
    }
    const after=await app.inject({method:'GET',
      url:'/models/'+info.model.modelId+'/branches/'+info.branchId+'/head'});
    expect(after.json().branch.headHash).toBe(info.headHash);
    const stale=await app.inject({method:'POST',url:'/imports/fusion/continuity-preview',
      payload:{...basis,stage:'F05',expectedHeadHash:'stale'}});
    expect(stale.statusCode).toBe(409);
    await app.close();
  });
  it('returns quantitative site fit without claiming certification',async()=>{
    const {app}=buildServer();
    const res=await app.inject({method:'POST',url:'/imports/fusion/site-registration-preview',
      payload:{points:[
        {id:'a',pixel:[0,0],localMm:[0,0]},
        {id:'b',pixel:[100,0],localMm:[2000,0]},
        {id:'c',pixel:[0,100],localMm:[0,2000]},
      ]}});
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      stage:'F06',surveyCertified:false,splatRegistered:false,mmPerPixel:20,
    });
    await app.close();
  });
});
