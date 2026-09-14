import { TerrainError } from "./index.mjs";
import { validateTerrainSurface } from "./surface.mjs";

const fail=(code,message)=>{throw new TerrainError(code,message);};
const ref=x=>typeof x==="string"&&x.length>0&&x.length<=2048;
const digest=x=>typeof x==="string"&&/^sha256:[a-f0-9]{64}$/.test(x);
function requireRefs(value,names){for(const name of names)if(!ref(value?.[name]))fail("MAPPING_REQUIRED","Missing host reference: "+name);}
function samePin(local,binding) {
  if(!binding?.localPin||["branchId","worldRevision","proposalRevision","terrainRevision"].some(k=>local[k]!==binding.localPin[k]))
    fail("STALE_READ","Host identity mapping does not match the terrain pin.");
}
/** Host supplies registered references; numeric IDs are never cast into world identities.
 * Binding creation/artifact storage is trusted host work, not a renderer capability.
 */
export function mapTerrainOverlay(local,binding) {
  samePin(local,binding);
  requireRefs(binding,["worldRevisionRef","actorRef","entityRef","controlAnchorRef","modifiersRef","deltaSchemaRef","deltaArtifactRef"]);
  if(!digest(binding.operationDigest))fail("MAPPING_REQUIRED","Host operation digest is required.");
  if(!ref(local.sessionId)||binding.controlId!==local.entityId||!Number.isSafeInteger(local.inputSequence)||local.inputSequence<0||
     !["active","released","cancelled"].includes(local.phase))
    fail("MAPPING_REQUIRED","Unsupported or mismatched point overlay.");
  if(!local.position||!["x","y","z"].every(k=>Number.isSafeInteger(local.position[k]))||
     !binding.deltaPosition||["x","y","z"].some(k=>binding.deltaPosition[k]!==local.position[k]))
    fail("MAPPING_REQUIRED","Registered delta artifact must match requested coordinates.");
  return {
    schemaVersion:"PLS-INT-01/0.1.0",sessionId:local.sessionId,baseRevision:binding.worldRevisionRef,
    inputSequence:local.inputSequence,operationDigest:binding.operationDigest,actorRef:binding.actorRef,
    operation:"point.replace",targets:[{entityId:binding.entityRef,semanticReference:binding.controlAnchorRef}],
    modifiersRef:binding.modifiersRef,deltas:[{kind:"domain",schemaRef:binding.deltaSchemaRef,payloadRef:binding.deltaArtifactRef}],
    speculativeGeometry:null,
    assessment:{status:"unknown",evaluatorRefs:[],ruleRevisionRefs:[],evidenceRefs:[],diagnosticsRefs:[]},
    currentness:local.phase==="cancelled"?"unavailable":"pending",lifecycle:local.phase,
    proposalRef:null,transactionRef:null,committedRevision:null
  };
}
/** Artifact/provenance references must already be registered by the trusted host.
 * Topology validation does not establish requested representation error tolerances.
 */
export function mapTerrainSurface(source,surface,request,binding) {
  validateTerrainSurface(source,surface);
  requireRefs(binding,["responseRef","artifactRef","worldRevisionRef"]);
  if(binding.terrainId!==source.id||binding.terrainRevision!==source.revision||
     binding.sourceKey!==surface.sourceKey||request.world_revision!==binding.worldRevisionRef)
    fail("STALE_READ","Surface, host world mapping and request differ.");
  if(request.schema!=="plasma/RepresentationRequest/0.1.0"||request.representation_kind!=="interactive_mesh"||
     request.required_for_commit!==false||!ref(request.request_id)||!digest(request.input_digest)||
     !digest(binding.artifactDigest)||!binding.provenance)
    fail("MAPPING_REQUIRED","Only an explicitly registered non-commit interactive mesh is supported.");
  const provenance=binding.provenance,producer=provenance.producer;
  if(!producer||!ref(producer.id)||!ref(producer.version)||!digest(producer.implementation_digest)||
     !digest(producer.configuration_digest)||!Array.isArray(provenance.input_digests)||
     !provenance.input_digests.includes(request.input_digest)||!provenance.input_digests.every(digest)||
     !Array.isArray(provenance.evidence_refs)||!provenance.evidence_refs.every(ref)||
     typeof provenance.created_at!=="string"||!Number.isFinite(Date.parse(provenance.created_at)))
    fail("MAPPING_REQUIRED","Incomplete registered provenance.");
  return {
    schema:"plasma/RepresentationResponse/0.1.0",response_id:binding.responseRef,
    request_ref:request.request_id,request_input_digest:request.input_digest,world_revision:request.world_revision,
    status:"unknown",artifact_ref:binding.artifactRef,artifact_digest:binding.artifactDigest,
    representation_kind:"interactive_mesh",achieved_tolerances:[],topology_correspondence_ref:binding.correspondenceRef??null,
    validation_results:[],provenance:structuredClone(binding.provenance),fallback_used:"none",
    diagnostics:[]
  };
}
// Broad domain invalidations are hints to existing runtime impact expansion,
// never a fabricated CausalImpactSet with complete_for_evaluators claims.
export function terrainInvalidationHints(candidate,worldRevisionRef) {
  if(!ref(worldRevisionRef)||candidate?.schema!=="plasma-terrain-candidate/1"||
     !Array.isArray(candidate.invalidations))fail("MAPPING_REQUIRED","Candidate and host world reference required.");
  return {worldRevisionRef,terrainId:candidate.terrainId,
    affectedDomainIds:[...candidate.affectedIds],claims:candidate.invalidations.map(kind=>({kind,status:"pending"})),
    impactCoverage:"unknown",requiresHostExpansion:true};
}
