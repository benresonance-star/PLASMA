import { evaluateTerrainSurface } from "./surface.mjs";

// Dedicated module Worker entry. The caller must correlate IDs and handle
// worker crashes/timeouts. createTerrainBridge bounds evaluation concurrency.
self.addEventListener("message", event => {
  const { jobId, terrain } = event.data ?? {};
  if(typeof jobId!=="string")return;
  try {
    self.postMessage({jobId,status:"ready",surface:evaluateTerrainSurface(terrain)});
  } catch(error) {
    self.postMessage({jobId,status:"failed",error:{
      code:error.code??"EVALUATION_FAILED",message:error.message,ids:error.ids??[]
    }});
  }
});
