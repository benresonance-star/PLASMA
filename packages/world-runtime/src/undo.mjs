import {randomUUID} from 'node:crypto';
import {makeTerrainRequest} from '../../terrain-core/src/index.mjs';
import {WorldError} from './store.mjs';

// Bounded demo inverse: point replacement only. Never rewind the accepted head.
export function terrainUndoProposal(current,previous) {
  if(!previous||current.parent!==previous.revision||current.event?.request?.domain!=='terrain')throw new WorldError('UNDO_UNAVAILABLE');
  return terrainRevisionProposal(current,previous,'Undo saved terrain revision '+current.revision+' using revision '+previous.revision);
}

export function terrainRevisionProposal(current,previous,intent='Restore terrain from saved revision '+previous.revision) {
  if(previous.revision>=current.revision)throw new WorldError('RESTORE_UNAVAILABLE');
  const now=current.state.terrain,before=previous.state.terrain;
  if(now.id!==before.id||now.frameId!==before.frameId||now.datum!==before.datum||
     now.units!==before.units||JSON.stringify(now.source)!==JSON.stringify(before.source)||
     JSON.stringify(now.features)!==JSON.stringify(before.features)||now.points.length!==before.points.length)
    throw new WorldError('UNDO_UNSUPPORTED');
  const prior=new Map(before.points.map(p=>[p.id,p]));
  const operations=[];
  for(const p of now.points){
    const old=prior.get(p.id);if(!old)throw new WorldError('UNDO_UNSUPPORTED');
    if(['x','y','z'].some(key=>p[key]!==old[key])||JSON.stringify(p.evidenceRefs)!==JSON.stringify(old.evidenceRefs))
      operations.push({type:'point.replace',target:p.id,values:{x:old.x,y:old.y,z:old.z,evidenceRefs:old.evidenceRefs}});
  }
  if(!operations.length)throw new WorldError('NO_TERRAIN_CHANGE');
  return makeTerrainRequest({branchId:current.branch,worldRevision:current.revision,proposalRevision:null,terrain:now},
    {requestId:randomUUID(),operations,intent});
}
