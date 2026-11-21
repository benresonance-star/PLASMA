import type { FastifyInstance } from 'fastify';
import { asPromise, type VersionStore } from '@spds/version-core';
import {
  composeFirstFusion, auditFusionConstruction, traceFusionCausality,
  assessHotelReadiness, createFusionSectionSheet, estimateSiteRegistration,
  proposeFirstFusionChange, type FusionBinding, type FusionParameterLink,
  type SiteTiePoint,
} from '@spds/import-core';

type CommonSource = {
  readonly buildProject: unknown;
  readonly loftProject: unknown;
  readonly bindings: readonly FusionBinding[];
  readonly expectedSourceHashes: { readonly build: string; readonly loft: string };
  readonly modelId: string;
  readonly branchId: string;
  readonly expectedHeadHash: string;
};
async function validateCurrentSource(store: VersionStore, body: CommonSource) {
  const state = await asPromise(store.getBranchHead(body.branchId));
  if (state.modelId !== body.modelId || state.headHash !== body.expectedHeadHash) {
    throw new Error('FUSION_HEAD_CONFLICT');
  }
  const preview = composeFirstFusion(body);
  const buildHash = preview.sources.find(s=>s.system==='build')?.sourceHash;
  const loftHash = preview.sources.find(s=>s.system==='loft')?.sourceHash;
  if (!buildHash || !loftHash || buildHash !== body.expectedSourceHashes.build ||
      loftHash !== body.expectedSourceHashes.loft) throw new Error('FUSION_SOURCE_STALE');
  return preview;
}
export function registerFusionContinuityRoute(app: FastifyInstance, store: VersionStore): void {
  app.post<{ Body: CommonSource & {
    readonly stage: 'F04'|'F05'|'F07'|'F08';
    readonly selectedId?: string;
    readonly sectionYmm?: number;
    readonly proposedChange?: {
      readonly buildParameterId: string;
      readonly nextValue: number;
      readonly loftLink: FusionParameterLink;
    };
  } }>('/imports/fusion/continuity-preview', async(req,reply)=>{
    const body = req.body;
    if (!body || typeof body.stage !== 'string' ||
        !body.modelId || !body.branchId || !body.expectedHeadHash) {
      return reply.code(422).send({failureCode:'FUSION_CONTINUITY_INPUT_REQUIRED'});
    }
    try {
      const preview = await validateCurrentSource(store,body);
      let result: unknown;
      switch(body.stage) {
        case 'F04':
          result=auditFusionConstruction(preview); break;
        case 'F05': {
          const proposal = body.proposedChange ? proposeFirstFusionChange({
            ...body, buildParameterId: body.proposedChange.buildParameterId,
            nextValue: body.proposedChange.nextValue,
            loftLink: body.proposedChange.loftLink,
          }) : null;
          const before=createFusionSectionSheet({
            loftProject:body.loftProject,sectionYmm:body.sectionYmm ?? 0,
          });
          const after=proposal?.loftParameter ? createFusionSectionSheet({
            loftProject:body.loftProject,sectionYmm:body.sectionYmm ?? 0,
            parameterOverride:{
              partId:proposal.loftParameter.partId,
              parameter:proposal.loftParameter.parameter,
              value:proposal.loftParameter.after,
            },
          }) : null;
          result={stage:'F05',status:'reference-only',before,
            ...(after ? {proposedAfter:after} : {}),
            sourceRevision:body.expectedSourceHashes.loft,
            publicationReady:false,
            unresolved:[
              '2D regions are supported exact rectangle/extrude cut geometry only',
              'No authoritative dimensions, annotation anchors or construction details',
              'Proposed variants are not committed and unverified',
            ]};
          break;
        }
        case 'F07':
          if (!body.selectedId) throw new Error('FUSION_CAUSAL_SELECTION_REQUIRED');
          result=traceFusionCausality(preview,body.selectedId,2,36);break;
        case 'F08':
          result=assessHotelReadiness(preview);break;
        default: throw new Error('FUSION_CONTINUITY_UNKNOWN_STAGE');
      }
      const next=await asPromise(store.getBranchHead(body.branchId));
      if(next.headHash!==body.expectedHeadHash) {
        return reply.code(409).send({failureCode:'FUSION_HEAD_CONFLICT'});
      }
      return reply.code(200).send({
        ...result as object, basedOnHeadHash: body.expectedHeadHash,
        publicationReady:false,
      });
    } catch(err) {
      const message=err instanceof Error?err.message:'Unrecognized failure';
      return reply.code(message==='FUSION_HEAD_CONFLICT'?409:422).send({
        failureCode:message==='FUSION_HEAD_CONFLICT'?'FUSION_HEAD_CONFLICT':'FUSION_CONTINUITY_REJECTED',
        summary:message,publicationReady:false,
      });
    }
  });
  app.post<{Body:{readonly points:readonly SiteTiePoint[]}}>(
    '/imports/fusion/site-registration-preview',async(req,reply)=>{
      try {
        return reply.send(estimateSiteRegistration(req.body?.points));
      } catch(err) {
        return reply.code(422).send({
          failureCode:'FUSION_REGISTRATION_REJECTED',
          summary:err instanceof Error?err.message:'Invalid control points',
          surveyCertified:false,
        });
      }
    });
}
