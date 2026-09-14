import { TerrainError } from "./index.mjs";

/** Takes ownership of a dedicated Worker. A timeout/dispose terminates it. */
export function createTerrainWorkerEvaluator(worker,{timeoutMs=30000}={}) {
  if(!worker||!["addEventListener","removeEventListener","postMessage","terminate"].every(k=>typeof worker[k]==="function")||
     !Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>60000)
    throw new TerrainError("WORKER_CONTRACT","Dedicated worker and bounded timeout required.");
  let pending=null,nextId=0,closed=false;
  function settle(error,surface) {
    if(!pending)return;
    const job=pending;pending=null;clearTimeout(job.timer);
    if(error)job.reject(error);else job.resolve(surface);
  }
  function close(error) {
    closed=true;settle(error);
    worker.removeEventListener("message",message);
    worker.removeEventListener("error",failure);
    worker.removeEventListener("messageerror",failure);
    worker.terminate();
  }
  function message(event) {
    const data=event.data;
    if(!pending||data?.jobId!==pending.jobId)return;
    if(data.status==="ready")settle(null,data.surface);
    else if(data.status==="failed")settle(new TerrainError(data.error?.code??"EVALUATION_FAILED",data.error?.message??"Evaluation failed."));
    else close(new TerrainError("WORKER_PROTOCOL","Malformed worker response."));
  }
  function failure(){close(new TerrainError("WORKER_FAILED","Terrain worker failed."));}
  worker.addEventListener("message",message);
  worker.addEventListener("error",failure);
  worker.addEventListener("messageerror",failure);
  return Object.freeze({
    evaluate(terrain) {
      if(closed)return Promise.reject(new TerrainError("WORKER_CLOSED","Create a new dedicated worker."));
      if(pending)return Promise.reject(new TerrainError("RESOURCE_LIMIT","Only one worker evaluation may be active."));
      return new Promise((resolve,reject)=>{
        const jobId="terrain-job-"+(++nextId);
        pending={jobId,resolve,reject,timer:setTimeout(()=>close(new TerrainError("WORKER_TIMEOUT","Terrain evaluation timed out.")),timeoutMs)};
        try{worker.postMessage({jobId,terrain});}catch(error){close(new TerrainError("WORKER_FAILED",error.message));}
      });
    },
    dispose(){if(!closed)close(new TerrainError("WORKER_CLOSED","Terrain worker disposed."));}
  });
}
