import { describe, expect, it } from 'vitest';
import { composeFirstFusion } from './fusion.js';
import { deriveFusionSourceRevision } from './fusion-revision.js';

const at='2026-11-21T00:00:00.000Z';
function setup() {
  const buildProject={
    app:'Build',schemaVersion:2,savedAt:at,
    authoritativeGraph:{
      entities:[{id:'entity:build:window',kind:'Entity',name:'Window',
        semanticType:'architecture.hosted-opening',createdAt:at,updatedAt:at,
        schemaVersion:'1.0.0'}],
      parameters:[{id:'parameter:window:w',kind:'Parameter',name:'Window width',
        semanticType:'architecture.width',createdAt:at,updatedAt:at,schemaVersion:'1.0.0',
        quantity:{value:150,unit:'mm'},role:'design-variable',
        affects:['entity:build:window'],editableBy:['user','agent'],
        domain:{min:100,max:300}}],
      relationships:[],
    },
  };
  const loftProject={
    id:'LoftReference',schemaVersion:2,units:'mm',
    parts:[{id:'AlFrame',parameters:{W:150,H:80,D:40},features:[
      {id:'sketch',type:'sketch',plane:{type:'datum',name:'XY'},
        profile:{kind:'rectangle',width:'W',height:'H'}},
      {id:'extrude',type:'extrude',sketch:'sketch',depth:'D'},
    ]}],
    rootAssembly:'Main',
    assemblies:[{id:'Main',instances:[
      {id:'Frame01',partId:'AlFrame',placement:{translation:[0,0,0]}},
      {id:'Frame02',partId:'AlFrame',placement:{translation:[500,0,0]}},
    ]}],
  };
  const bindings=[{buildEntityId:'entity:build:window',loftAssemblyId:'Main',loftInstanceId:'Frame01'}];
  const initial=composeFirstFusion({buildProject,loftProject,bindings});
  return {
    buildProject,loftProject,bindings,
    expectedSourceHashes:{
      build:initial.sources[0]!.sourceHash,loft:initial.sources[1]!.sourceHash,
    },
    buildParameterId:'parameter:window:w',nextValue:195,
    loftLink:{loftAssemblyId:'Main',loftInstanceId:'Frame01',
      loftPartId:'AlFrame',loftParameter:'W'},
  };
}
describe('F09 derived atomic source revision',()=>{
  it('changes Build and Loft coherently while preserving every occurrence ID',()=>{
    const input=setup();
    const before=JSON.stringify(input);
    const revision=deriveFusionSourceRevision(input);
    expect(revision.sourceIdentityPreserved).toBe(true);
    expect(revision.affectedLoftOccurrences).toHaveLength(2);
    expect(revision.publicationReady).toBe(false);
    const build=revision.buildProject as typeof input.buildProject;
    const loft=revision.loftProject as typeof input.loftProject;
    expect(build.authoritativeGraph.parameters[0]!.quantity.value).toBe(195);
    expect(loft.parts[0]!.parameters.W).toBe(195);
    expect(revision.revisedSources).not.toEqual(revision.originalSources);
    expect(JSON.stringify(input)).toBe(before);
    expect(composeFirstFusion({buildProject:revision.buildProject,
      loftProject:revision.loftProject,bindings:input.bindings}).bindings)
      .toEqual(composeFirstFusion(input).bindings);
  });
  it('refuses implicit links and stale source revisions',()=>{
    const input=setup();
    expect(()=>deriveFusionSourceRevision({...input,
      loftLink:{...input.loftLink,loftInstanceId:'Frame02'}})).toThrow(/LINK_NOT_BOUND/);
    expect(()=>deriveFusionSourceRevision({...input,
      expectedSourceHashes:{...input.expectedSourceHashes,loft:'stale'}})).toThrow(/SOURCE_STALE/);
  });
});
