import { describe,expect,it } from 'vitest';
import { buildServer } from './server.js';
import { resolveHotel } from './hotel-project.js';
import { makeHotelWindowProposal } from './hotel-reason.js';

describe('F19 source-grounded causal window proposal',()=>{
  it('exposes only geometrically computed quantities and explicit unresolved engineering gates',async()=>{
    const {app,store}=buildServer();
    const created=await app.inject({method:'POST',url:'/models',payload:{name:'F19 Reason Fixture'}});
    const {model,branchId,headHash}=created.json() as{
      model:{modelId:string};branchId:string;headHash:string;
    };
    const bootstrap=await app.inject({method:'POST',url:'/models/'+model.modelId+'/hotels/bootstrap',
      payload:{branchId,expectedHeadHash:headHash}});
    const nextHead=bootstrap.json().headHash as string;
    const hotel=await resolveHotel(store,branchId);
    const proposal=makeHotelWindowProposal(hotel,nextHead,2100);
    expect(proposal.affectedRoomCount).toBe(168);
    expect(proposal.linkedModuleIds).toHaveLength(4);
    expect(proposal.commitStatus).toBe('uncommitted');
    expect(proposal.engineeringApproved).toBe(false);
    expect(proposal.claims.find(x=>x.id.endsWith('glazing-area'))?.delta).toBeCloseTo(93.24,6);
    expect(proposal.claims.every(x=>x.basis==='computed-from-Loft-source'||
      x.basis==='bounded-design-constraint')).toBe(true);
    expect(proposal.causal.nodes.some(x=>x.state==='unverified')).toBe(true);
    const endpoint='/models/'+model.modelId+'/hotels/riverside';
    const review=await app.inject({method:'POST',url:endpoint+'/window-proposal',
      payload:{branchId,expectedHeadHash:nextHead,nextWidthMm:2100}});
    expect(review.statusCode,review.body).toBe(200);
    expect(review.json().candidateHash).toBe(proposal.candidateHash);
    expect((await store.getBranchHead(branchId)).headHash).toBe(nextHead);
    const forged=await app.inject({method:'POST',url:endpoint+'/accept-reviewed-window',
      payload:{branchId,expectedHeadHash:nextHead,nextWidthMm:2100,candidateHash:'forged'}});
    expect(forged.statusCode).toBe(409);
    const accepted=await app.inject({method:'POST',url:endpoint+'/accept-reviewed-window',
      payload:{branchId,expectedHeadHash:nextHead,nextWidthMm:2100,
        candidateHash:proposal.candidateHash}});
    expect(accepted.statusCode,accepted.body).toBe(200);
    expect(accepted.json().proposalDisposition).toBe('human-accepted');
    expect(accepted.json().engineeringApproved).toBe(false);
    const replay=await app.inject({method:'POST',url:endpoint+'/accept-reviewed-window',
      payload:{branchId,expectedHeadHash:nextHead,nextWidthMm:2100,
        candidateHash:proposal.candidateHash}});
    expect(replay.statusCode).toBe(409);
    await app.close();
  });
});
