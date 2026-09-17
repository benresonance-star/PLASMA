import fs from 'node:fs';
export const initialState = {
  wall: JSON.parse(fs.readFileSync(new URL('../../../docs/plasma/v0.5/reference-runtime/PLS-KERNEL-01_WALL_FIXTURE.json', import.meta.url))),
  terrain: {
    id:'terrain',kind:'terrain-controls',schema:'plasma-terrain-controls/1',surfaceRole:'design-ground',revision:0,frameId:'SITE',datum:'Synthetic',units:'mm',
    source:{evidenceRef:'source',contentDigest:'fixture',importerVersion:'test/1',registrationEvidenceRef:'registration'},
    points:[{id:'a',x:0,y:0,z:0},{id:'b',x:100,y:0,z:0},{id:'c',x:100,y:100,z:0},{id:'d',x:0,y:100,z:0}].map(p=>({...p,revision:0,evidenceRefs:['source']})),
    features:[{id:'boundary',kind:'boundary',revision:0,pointIds:['a','b','c','d']}]
  }
};
export const authorize = actor => ['human','agent'].includes(actor.id) ? {wall:true,terrainId:'terrain',allowedFeatureIds:['a','b','c','d']} : null;
export const wallRequest = (baseRevision=0, delta_mm=100, requestId='wall-1') => ({branch:'main',domain:'wall',requestId,baseRevision,payload:{delta_mm}});
