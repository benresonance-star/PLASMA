import {terrainRequestKey} from '../../terrain-core/src/index.mjs';
import { createWorldGateway } from './gateway-host.mjs';
import { createInProcessTransport, createAuthorityClient } from '../../kernel-gateway/src/index.mjs';

/** Compatibility adapter for the bounded T1 bridge. It supplies one publication
 * per callback; the shared runtime re-evaluates the original typed request inside
 * its SQLite transaction. Preview output is never installed as accepted state. */
export function createTerrainHost(world, principal) {
  const actor = structuredClone(principal), session = world.session(actor);
  let tail = Promise.resolve();
  const envelope = request => ({ domain:'terrain', branch:request.branchId,
    baseRevision:request.baseWorldRevision, requestId:request.requestId, payload:request });
  const gateway = createWorldGateway({ world, authorize: ({ action, request }) => {
    if (action === 'proposal.publish') {
      session.capability(world.execution.proposal(request.payload.proposalId).worldRequest, 'commit');
    } else if (action === 'proposal.submit') {
      session.capability(envelope(request.payload.transforms[0].payload), 'preview');
    }
    return { allowed: true };
  } });
  // This authority client belongs to the trusted host, not the terrain capability.
  const publisher = createAuthorityClient({ transport: createInProcessTransport(gateway, { principal: actor }) });
  const readSnapshot = async () => {
    const s=world.snapshot();
    return {branchId:s.branch,worldRevision:s.revision,proposalRevision:null,terrain:s.state.terrain};
  };
  const authorize = async (caller,request,phase) => {
    if(caller.id!==actor.id)throw new Error('Principal mismatch');
    return session.capability(envelope(request),phase);
  };
  return Object.freeze({readSnapshot,authorize,
    withWorldTransaction(callback) {
      const work=tail.then(async()=>{
        let open=true,submitted=false;
        const active=()=>{if(!open)throw new Error('Transaction scope closed');};
        try {return await callback({
          readSnapshot:async()=>{active();return readSnapshot();},
          authorize:async(...args)=>{active();return authorize(...args);},
          getReceipt:async scope=>{
            active();if(scope.actorId!==actor.id)throw new Error('Principal mismatch');
            const receipt=session.getReceipt(scope.requestId,scope.branchId);
            return receipt?{status:receipt.status,worldRevision:receipt.worldRevision,requestDigest:receipt.requestDigest,requestKey:terrainRequestKey(receipt.request.payload)}:null;
          },
          validateCandidate:async write=>{active();session.preview(envelope(write.request));return {status:'pass'};},
          commitTerrain:async write=>{
            active();if(submitted)throw new Error('One publication per transaction scope');submitted=true;
            const proposalId='terrain:'+write.request.requestId;
            await publisher.submitProposal({proposalId,baseRevision:'R'+write.request.baseWorldRevision,
              transforms:[{type:'terrain.controls',schemaVersion:'1',targetRefs:['terrain'],payload:write.request}]},write.request.requestId);
            const published=await publisher.publishProposal({proposalId},write.request.requestId);
            const receipt={status:published.status,worldRevision:published.worldRevision,requestDigest:published.requestDigest};
            return {...receipt,requestKey:terrainRequestKey(write.request)};
          }
        });}finally{open=false;}
      });
      tail=work.catch(()=>{});return work;
    }
  });
}
