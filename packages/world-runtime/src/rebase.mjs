import {randomUUID} from 'node:crypto';
import {makeTerrainRequest,prepareTerrainEdit} from '../../terrain-core/src/index.mjs';
import {WorldError,canonical} from './store.mjs';

export const terrainSnapshot = saved => ({branchId:saved.branch,worldRevision:saved.revision,proposalRevision:null,terrain:saved.state.terrain});

// Conservative point-level reconciliation. Even an edit later undone counts as
// a conflict because point revisions changed. No field-level merge is implied.
export function terrainRebaseProposal(current,base,request,capability) {
  prepareTerrainEdit(terrainSnapshot(base),request,capability);
  if(base.branch!==current.branch||base.revision>=current.revision)throw new WorldError('REBASE_NOT_STALE');
  if(request.operations.some(op=>op.type!=='point.replace'))throw new WorldError('REBASE_UNSUPPORTED');
  const old=base.state.terrain,now=current.state.terrain;
  const structure=t=>({...t,revision:0,points:t.points.map(p=>p.id).sort()});
  if(canonical(structure(old))!==canonical(structure(now)))throw new WorldError('REBASE_UNSUPPORTED');
  const conflicts=[...new Set(request.operations.map(op=>op.target))].filter(id=>
    canonical(old.points.find(p=>p.id===id))!==canonical(now.points.find(p=>p.id===id)));
  if(conflicts.length){const error=new WorldError('REBASE_CONFLICT');error.conflicts=conflicts;throw error;}
  return makeTerrainRequest(terrainSnapshot(current),{requestId:randomUUID(),operations:request.operations,
    intent:'Reapply request '+request.requestId+' from revision '+base.revision+' onto revision '+current.revision});
}
