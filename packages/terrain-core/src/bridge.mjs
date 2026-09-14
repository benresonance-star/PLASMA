import { TerrainError, prepareTerrainEdit, terrainRequestKey } from "./index.mjs";
import { validateTerrainSurface } from "./surface.mjs";

const clone = value => structuredClone(value);
const fail = (code,message) => { throw new TerrainError(code,message); };
const identity = (a,b) => terrainRequestKey(a) === terrainRequestKey(b);

/**
 * Run in the host runtime, outside the pointer/render loop.
 * host.withWorldTransaction MUST provide serialized, atomic, durable execution.
 * No fallback store or default permissive authorization is provided.
 */
export function createTerrainBridge({host,evaluate,actor,sessionId}) {
  if(!host || !["readSnapshot","authorize","withWorldTransaction"].every(k=>typeof host[k]==="function") ||
     typeof evaluate!=="function" || !actor?.id || typeof sessionId!=="string")
    fail("HOST_CONTRACT","Host ports, authenticated actor, session ID and async evaluator are required.");
  const principal=clone(actor);
  let sequence=0,active=null,pending=null,ready=null,closed=false,committing=false;
  const superseded=()=>({status:"superseded"});
  async function run(job) {
    active=job;
    try {
      const snapshot=clone(await host.readSnapshot());
      const capability=clone(await host.authorize(clone(principal),clone(job.request),"preview"));
      const candidate=prepareTerrainEdit(snapshot,job.request,capability);
      const surface=await evaluate(clone(candidate.candidate));
      if(closed||job.sequence!==sequence){job.resolve(superseded());return;}
      // Validate external worker output, not its self-reported validation field.
      validateTerrainSurface(candidate.candidate,surface);
      const current=clone(await host.readSnapshot());
      const fresh=prepareTerrainEdit(current,job.request,capability);
      if(!identity(candidate.candidate,fresh.candidate))fail("STALE_READ","Preview inputs changed.");
      if(closed||job.sequence!==sequence){job.resolve(superseded());return;}
      const previewId=sessionId+":"+job.sequence;
      ready={previewId,request:clone(job.request),candidate:clone(candidate),surface:clone(surface)};
      job.resolve({status:"ready",previewId,inputSequence:job.sequence,candidate:clone(candidate),surface:clone(surface)});
    } catch(error) {
      if(closed||job.sequence!==sequence)job.resolve(superseded());
      else job.reject(error);
    } finally {
      active=null;
      if(pending){const next=pending;pending=null;void run(next);}
    }
  }
  return Object.freeze({
    preview(request,inputSequence) {
      if(closed) return Promise.reject(new TerrainError("SESSION_CLOSED","Bridge is closed."));
      if(committing) return Promise.reject(new TerrainError("COMMIT_PENDING","Wait for the commit outcome before another preview."));
      if(!Number.isSafeInteger(inputSequence)||inputSequence<=sequence)
        return Promise.resolve(superseded());
      sequence=inputSequence;ready=null;
      if(pending)pending.resolve(superseded());
      return new Promise((resolve,reject)=>{
        const job={request:clone(request),sequence:inputSequence,resolve,reject};
        if(active)pending=job;else void run(job);
      });
    },
    async commit(previewId) {
      if(closed)fail("SESSION_CLOSED","Bridge is closed.");
      if(committing)fail("COMMIT_PENDING","A commit is already in flight.");
      if(!ready||ready.previewId!==previewId)fail("STALE_PREVIEW","Preview is no longer the latest checked result.");
      const checked=clone(ready);committing=true;
      try {
        return await host.withWorldTransaction(async tx=>{
          if(!tx||!["readSnapshot","authorize","getReceipt","validateCandidate","commitTerrain"].every(k=>typeof tx[k]==="function"))
            fail("HOST_CONTRACT","Incomplete atomic WorldTransaction port.");
          // Authorization is checked even on receipt replay.
          const capability=clone(await tx.authorize(clone(principal),clone(checked.request),"commit"));
          if(closed)fail("SESSION_CLOSED","Cancelled before commit submission.");
          const requestKey=terrainRequestKey(checked.request);
          const scope={actorId:principal.id,branchId:checked.request.branchId,requestId:checked.request.requestId};
          const prior=await tx.getReceipt(scope);
          if(prior){
            if(prior.requestKey!==requestKey)fail("REQUEST_ID_REUSED","Request ID already has different content.");
            return clone(prior);
          }
          const snapshot=clone(await tx.readSnapshot());
          const candidate=prepareTerrainEdit(snapshot,checked.request,capability);
          if(!identity(candidate.candidate,checked.candidate.candidate))fail("STALE_READ","Preview no longer matches candidate.");
          validateTerrainSurface(candidate.candidate,checked.surface);
          const validation=await tx.validateCandidate({
            actor:clone(principal),request:clone(checked.request),candidate:clone(candidate),surface:clone(checked.surface)
          });
          if(validation?.status!=="pass")fail("HARD_INVARIANT_FAILED","Host causal and hard-invariant validation did not pass.");
          if(closed)fail("SESSION_CLOSED","Cancelled before commit submission.");
          // Host owns atomic installation, event/provenance, receipt and revision.
          // Cancellation after this call begins cannot promise rollback.
          return clone(await tx.commitTerrain({
            ...scope,actor:clone(principal),requestKey,request:clone(checked.request),
            candidate:clone(candidate),surface:clone(checked.surface),validation:clone(validation),
            interaction:{sessionId,inputSequence:sequence}
          }));
        });
      } finally {committing=false;}
    },
    cancel() {
      closed=true;sequence++;ready=null;
      if(pending){pending.resolve(superseded());pending=null;}
      return {status:"closed",commitOutcome:committing?"await-in-flight-result":"no-in-flight-commit"};
    },
    state() {return {sessionId,inputSequence:sequence,activeJobs:active?1:0,pendingJobs:pending?1:0,
      readyPreviewId:ready?.previewId??null,closed,committing};}
  });
}
