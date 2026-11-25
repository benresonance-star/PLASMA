import { z } from 'zod';
import { parseVectorScene, type VectorScene } from './vector-scene.js';
const id=z.string().min(1), n=z.number().finite(), point=z.tuple([n,n]);
const line=z.object({start:point,end:point});
const digest=z.string().regex(/^[0-9a-f]{64}$/);
const payload=z.object({
  kernel:z.literal('occt-native'),kernelVersion:id,visibility:z.literal('classified'),provenance:z.literal('component-only-diagnostic'),projectionDigest:digest,
  frame:z.object({representationIds:z.array(id).min(1)}),
  components:z.array(z.object({representationId:id,semanticOwner:id,visible:z.array(line),hidden:z.array(line)})).min(1),
});
export function nativeHlrPreview(input:unknown, options:{expectedProjectionDigest:string;viewId:string;scaleDenominator:number}):VectorScene {
  const p=payload.parse(input);
  if(p.projectionDigest!==options.expectedProjectionDigest||new Set(p.frame.representationIds).size!==p.components.length||
      p.frame.representationIds.length!==p.components.length||p.components.some((c,i)=>c.representationId!==p.frame.representationIds[i])) throw new Error('Native HLR identity mismatch');
  const primitives=p.components.flatMap(c=>(['hidden','visible'] as const).flatMap(role=>c[role].map((l,i)=>({
    id:JSON.stringify([c.representationId,role,i]),kind:'line' as const,role:role==='hidden'?'hidden' as const:'component' as const,
    source:{representationId:c.representationId,semanticOwner:c.semanticOwner},...l,
  }))));
  primitives.sort((a,b)=>Number(a.role!=='hidden')-Number(b.role!=='hidden'));
  if(!primitives.some(p=>p.role==='component'))throw new Error('No visible HLR geometry');
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const p of primitives)for(const xy of [p.start,p.end]){minX=Math.min(minX,xy[0]);minY=Math.min(minY,xy[1]);maxX=Math.max(maxX,xy[0]);maxY=Math.max(maxY,xy[1]);}
  const s=z.number().finite().positive().parse(options.scaleDenominator);
  return parseVectorScene({schemaVersion:1,viewId:options.viewId,projection:'orthographic',
    pins:{buildingRevision:'unbound',documentIntentRevision:'unbound',viewDefinitionVersion:'diagnostic',representationGrammarVersion:'diagnostic',producerVersion:p.kernelVersion},
    evidence:{kind:'native-hlr-preview',kernelId:p.kernel,kernelVersion:p.kernelVersion,projectionDigest:p.projectionDigest,provenance:p.provenance},
    frame:{x:minX-8*s,y:minY-8*s,width:Math.max(maxX-minX+16*s,80*s),height:maxY-minY+16*s,scaleDenominator:s},primitives});
}
