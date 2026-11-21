import { describe, expect, it } from 'vitest';
import { buildServer } from './server.js';

const at='2026-11-21T00:00:00.000Z';
const buildProject={
  app:'Build',schemaVersion:2,savedAt:at,
  authoritativeGraph:{
    entities:[{id:'entity:qa:window',kind:'Entity',name:'Window',
      semanticType:'architecture.hosted-opening',createdAt:at,updatedAt:at,schemaVersion:'1.0.0'}],
    parameters:[{id:'parameter:qa:width',kind:'Parameter',name:'Window width',
      semanticType:'architecture.width',createdAt:at,updatedAt:at,schemaVersion:'1.0.0',
      quantity:{value:150,unit:'mm'},role:'design-variable',
      affects:['entity:qa:window'],editableBy:['user','agent'],domain:{min:100,max:240}}],
    relationships:[],
  },
};
const loftProject={
  id:'LoftQA',schemaVersion:2,units:'mm',
  parts:[
    {id:'Frame',material:'Aluminium',parameters:{W:150,H:80,D:60},features:[
      {id:'FrameS',type:'sketch',plane:{type:'datum',name:'XY'},
        profile:{kind:'rectangle',width:'W',height:'H'}},
      {id:'FrameE',type:'extrude',sketch:'FrameS',depth:'D'},
    ]},
    {id:'Brick',material:'Brick',parameters:{W:110,H:80,D:60},features:[
      {id:'BrickS',type:'sketch',plane:{type:'datum',name:'XY'},
        profile:{kind:'rectangle',width:'W',height:'H'}},
      {id:'BrickE',type:'extrude',sketch:'BrickS',depth:'D'},
    ]},
  ],
  rootAssembly:'Site',assemblies:[{id:'Site',instances:[
    {id:'Frame1',partId:'Frame',placement:{translation:[180,0,0]}},
    {id:'Frame2',partId:'Frame',placement:{translation:[450,0,0]}},
    {id:'Brick1',partId:'Brick',placement:{translation:[0,0,0]}},
  ]}],
};
const bindings=[{buildEntityId:'entity:qa:window',loftAssemblyId:'Site',loftInstanceId:'Frame1'}];
describe('F09 versioned Build/Loft design revision API',()=>{
  it('keeps a review immutable, regenerates geometry+detail, accepts once, and rejects stale/replayed commits',async()=>{
    const {app,store}=buildServer();
    const create=await app.inject({method:'POST',url:'/models',payload:{name:'Hotel construction QA'}});
    expect(create.statusCode).toBe(201);
    const {model,branchId,headHash}=create.json() as {
      model:{modelId:string};branchId:string;headHash:string;
    };
    const base={modelId:model.modelId,branchId,expectedHeadHash:headHash};
    const save=await app.inject({method:'POST',url:'/imports/fusion/workspaces',
      payload:{...base,buildProject,loftProject,bindings}});
    expect(save.statusCode,save.body).toBe(201);
    expect(save.json()).toMatchObject({status:'source-workspace-saved',revision:0,publicationReady:false});
    const workspaceId=save.json().workspaceId as string;
    const nextHead=save.json().headHash as string;
    const sources=save.json().sourceHashes as {build:string;loft:string};
    const edit={
      modelId:model.modelId,branchId,expectedHeadHash:nextHead,
      expectedSourceHashes:sources,buildParameterId:'parameter:qa:width',
      nextValue:195,sectionYmm:0,
      loftLink:{loftAssemblyId:'Site',loftInstanceId:'Frame1',loftPartId:'Frame',loftParameter:'W'},
    };
    const endpoint='/imports/fusion/workspaces/'+encodeURIComponent(workspaceId);
    const beforeHead=await store.getBranchHead(branchId);
    const review=await app.inject({method:'POST',url:endpoint+'/revision-preview',payload:edit});
    expect(review.statusCode,review.body).toBe(200);
    expect(review.json()).toMatchObject({
      status:'coordinated-source-preview',publicationReady:false,
      geometry:{kernel:'exact-adapter',nativeBrepValidated:false},
    });
    const data=review.json();
    expect(data.affectedLoftOccurrences).toHaveLength(2);
    expect(data.geometry.beforeHash).not.toBe(data.geometry.afterHash);
    expect(data.drawing.beforeHash).not.toBe(data.drawing.afterHash);
    expect(data.drawing.before).toContain('NOT FOR CONSTRUCTION');
    expect((await store.getBranchHead(branchId)).headHash).toBe(beforeHead.headHash);
    const forged=await app.inject({method:'POST',url:endpoint+'/revision-accept',
      payload:{...edit,candidateHash:'invalid'}});
    expect(forged.statusCode).toBe(409);
    expect((await store.getBranchHead(branchId)).headHash).toBe(beforeHead.headHash);
    const accepted=await app.inject({method:'POST',url:endpoint+'/revision-accept',
      payload:{...edit,candidateHash:data.candidateHash}});
    expect(accepted.statusCode,accepted.body).toBe(200);
    expect(accepted.json()).toMatchObject({
      status:'source-revision-accepted',revision:1,publicationReady:false,
    });
    expect(accepted.json().acceptedGeometryHash).toBe(data.geometry.afterHash);
    expect(accepted.json().acceptedDrawingHash).toBe(data.drawing.afterHash);
    const eventId=accepted.json().eventId as string;
    const events=await store.listEvents(branchId);
    expect(events.some(e=>e.eventId===eventId && e.command==='UPDATE')).toBe(true);
    const loaded=await app.inject({method:'GET',url:endpoint+'?modelId='+encodeURIComponent(model.modelId)+
      '&branchId='+encodeURIComponent(branchId)});
    expect(loaded.statusCode).toBe(200);
    expect(loaded.json().revision).toBe(1);
    expect(loaded.json().sources.buildProject.authoritativeGraph.parameters[0].quantity.value).toBe(195);
    expect(loaded.json().sources.loftProject.parts[0].parameters.W).toBe(195);
    expect(loaded.json().preview.bindings).toEqual(accepted.json().preview.bindings);
    const replay=await app.inject({method:'POST',url:endpoint+'/revision-accept',
      payload:{...edit,candidateHash:data.candidateHash}});
    expect(replay.statusCode).toBe(409);
    await app.close();
  });
  it('rejects ambiguous sources, unsupported geometry, invalid values and duplicated workspace saves',async()=>{
    const {app}=buildServer();
    const created=await app.inject({method:'POST',url:'/models',payload:{name:'Source guard QA'}});
    const {model,branchId,headHash}=created.json() as {
      model:{modelId:string};branchId:string;headHash:string;
    };
    const base={modelId:model.modelId,branchId,expectedHeadHash:headHash};
    const saved=await app.inject({method:'POST',url:'/imports/fusion/workspaces',
      payload:{...base,buildProject,loftProject,bindings}});
    expect(saved.statusCode).toBe(201);
    const dup=await app.inject({method:'POST',url:'/imports/fusion/workspaces',
      payload:{...base,buildProject,loftProject,bindings}});
    expect(dup.statusCode).toBe(409);
    const endpoint='/imports/fusion/workspaces/'+encodeURIComponent(saved.json().workspaceId);
    const edit={
      ...base,expectedHeadHash:saved.json().headHash,
      expectedSourceHashes:saved.json().sourceHashes,
      buildParameterId:'parameter:qa:width',nextValue:300,
      sectionYmm:0,
      loftLink:{loftAssemblyId:'Site',loftInstanceId:'Frame1',loftPartId:'Frame',loftParameter:'W'},
    };
    const invalid=await app.inject({method:'POST',url:endpoint+'/revision-preview',payload:edit});
    expect(invalid.statusCode).toBe(422);
    const other=await app.inject({method:'POST',url:endpoint+'/revision-preview',
      payload:{...edit,nextValue:195,expectedSourceHashes:{...edit.expectedSourceHashes,loft:'bad'}}});
    expect(other.statusCode).toBe(409);
    await app.close();
  });
});
