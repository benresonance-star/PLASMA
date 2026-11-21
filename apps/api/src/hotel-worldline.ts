import type { FastifyInstance } from 'fastify';
import { asPromise, type VersionStore } from '@spds/version-core';

export type WorldlineTrack='place'|'design'|'documents'|'validate'|'construct'|'operate';
export interface WorldlineEntry {
  readonly eventId:string;
  readonly timestamp:string;
  readonly track:WorldlineTrack;
  readonly command:string;
  readonly description:string;
  readonly beforeHash:string;
  readonly afterHash:string;
  readonly actor:string;
  readonly targetIds:readonly string[];
  readonly documentEvidence:'linked-study-derived'|'none';
}
function classify(command:string,actor:string):WorldlineTrack{
  if(command.includes('SITE')||actor==='northstar-site')return 'place';
  if(command.includes('CONSTRUCT'))return 'construct';
  if(command.includes('OPERATE'))return 'operate';
  if(command.includes('VALIDATE'))return 'validate';
  if(command.includes('DOCUMENT'))return 'documents';
  return 'design';
}
export function registerHotelWorldlineRoutes(app:FastifyInstance,store:VersionStore):void{
  app.get<{Params:{modelId:string};Querystring:{branchId:string}}>(
    '/models/:modelId/hotels/riverside/worldline',async(req,reply)=>{
      const {modelId}=req.params,{branchId}=req.query;
      const head=await asPromise(store.getBranchHead(branchId));
      if(head.modelId!==modelId)
        return reply.code(409).send({failureCode:'WORLDLINE_BRANCH_MISMATCH'});
      const events=await asPromise(store.listEvents(branchId));
      const entries:WorldlineEntry[]=events.filter(e=>
        e.command.startsWith('HOTEL_')||
        e.actor.id==='northstar-site'||e.actor.id==='northstar-hotel')
        .map(e=>({
          eventId:e.eventId,timestamp:e.timestamp,command:e.command,
          track:classify(e.command,e.actor.id),
          description:e.command==='HOTEL_BOOTSTRAP_LINKED_SUBPROJECTS'
            ?'Riverside parent + five Loft sub-projects created':
            e.command==='HOTEL_REVISE_LINKED_WINDOW_SYSTEM'
              ?'A4 window design source revision / linked suite changes':
              e.actor.id==='northstar-site'
                ?'User site observation with measured local control fit'
                :e.reason??e.command,
          beforeHash:e.beforeHash,afterHash:e.afterHash,
          actor:e.actor.id,targetIds:e.targetIds,
          documentEvidence:e.command==='HOTEL_REVISE_LINKED_WINDOW_SYSTEM'
            ?'linked-study-derived':'none',
        }));
      return reply.send({
        status:'persistent-worldline',headHash:head.headHash,
        tracks:['place','design','documents','validate','construct','operate'],
        entries:entries.slice(-100),
        note:'Only real VersionStore events are represented. A derived study is not an issued drawing or a construction record.',
      });
    },
  );
  app.post<{Params:{modelId:string};Body:{
    readonly branchId:string;readonly expectedHeadHash:string;readonly name:string;
  }}>('/models/:modelId/hotels/riverside/snapshot',async(req,reply)=>{
    const {modelId}=req.params,body=req.body;
    const head=await asPromise(store.getBranchHead(body.branchId));
    if(head.modelId!==modelId||head.headHash!==body.expectedHeadHash)
      return reply.code(409).send({failureCode:'WORLDLINE_HEAD_CONFLICT'});
    if(!body.name||body.name.length>100)
      return reply.code(422).send({failureCode:'WORLDLINE_SNAPSHOT_NAME_INVALID'});
    const snap=await asPromise(store.snapshot(body.branchId,body.name));
    const after=await asPromise(store.getBranchHead(body.branchId));
    if(after.headHash!==body.expectedHeadHash)
      return reply.code(409).send({failureCode:'WORLDLINE_HEAD_CHANGED'});
    return reply.code(201).send({
      snapshotId:snap.snapshotId,name:snap.name,headHash:snap.stateHash,
      createdAt:snap.createdAt,restorable:true,
    });
  });
  app.post<{Params:{modelId:string};Body:{
    readonly branchId:string;readonly expectedHeadHash:string;
    readonly fromSnapshotId:string;readonly toSnapshotId:string;
  }}>('/models/:modelId/hotels/riverside/compare',async(req,reply)=>{
    const {modelId}=req.params,body=req.body;
    const head=await asPromise(store.getBranchHead(body.branchId));
    if(head.modelId!==modelId||head.headHash!==body.expectedHeadHash)
      return reply.code(409).send({failureCode:'WORLDLINE_HEAD_CONFLICT'});
    try{
      const diff=await asPromise(store.compareSnapshots(
        body.fromSnapshotId,body.toSnapshotId,body.branchId));
      return reply.send({
        status:'versioned-model-diff',...diff,
        sourceScope:'Plasma semantic object changes, not downstream native B-rep shape differential',
      });
    }catch(e){
      return reply.code(422).send({
        failureCode:'WORLDLINE_COMPARISON_REJECTED',
        summary:e instanceof Error?e.message:'Unable to compare snapshots',
      });
    }
  });
}
