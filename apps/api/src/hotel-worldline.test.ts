import { describe,expect,it } from 'vitest';
import { buildServer } from './server.js';

describe('F20 persistent hotel Worldline and source snapshot comparison',()=>{
  it('shows only real events, then compares before/after semantic module objects',async()=>{
    const {app}=buildServer();
    const created=await app.inject({method:'POST',url:'/models',payload:{name:'Worldline Hotel'}});
    const {model,branchId,headHash}=created.json() as{
      model:{modelId:string};branchId:string;headHash:string;
    };
    const base='/models/'+model.modelId+'/hotels/riverside';
    const createdHotel=await app.inject({method:'POST',url:'/models/'+model.modelId+'/hotels/bootstrap',
      payload:{branchId,expectedHeadHash:headHash}});
    const firstHead=createdHotel.json().headHash as string;
    const before=await app.inject({method:'GET',url:base+'/worldline?branchId='+branchId});
    expect(before.statusCode).toBe(200);
    expect(before.json().entries.filter((e:{track:string})=>e.track==='design')).toHaveLength(1);
    expect(before.json().entries.filter((e:{track:string})=>e.track==='operate')).toHaveLength(0);
    const proposal=await app.inject({method:'POST',url:base+'/window-proposal',
      payload:{branchId,expectedHeadHash:firstHead,nextWidthMm:2100}});
    expect(proposal.statusCode,proposal.body).toBe(200);
    const accepted=await app.inject({method:'POST',url:base+'/accept-reviewed-window',
      payload:{branchId,expectedHeadHash:firstHead,nextWidthMm:2100,
        candidateHash:proposal.json().candidateHash}});
    expect(accepted.statusCode,accepted.body).toBe(200);
    const {beforeSnapshotId,afterSnapshotId}=accepted.json();
    expect(beforeSnapshotId).toBeTruthy();
    expect(afterSnapshotId).toBeTruthy();
    const comparison=await app.inject({method:'POST',url:base+'/compare',
      payload:{branchId,expectedHeadHash:accepted.json().headHash,
        fromSnapshotId:beforeSnapshotId,toSnapshotId:afterSnapshotId}});
    expect(comparison.statusCode,comparison.body).toBe(200);
    expect(comparison.json().changedIds).toHaveLength(4);
    expect(comparison.json().changedIds)
      .not.toContain('entity:hotel:loft:building-shell');
    const after=await app.inject({method:'GET',url:base+'/worldline?branchId='+branchId});
    expect(after.json().entries.some((e:{description:string})=>
      e.description.includes('A4 window'))).toBe(true);
    expect(after.json().entries.every((e:{track:string})=>
      !['construct','operate'].includes(e.track))).toBe(true);
    await app.close();
  });
});
