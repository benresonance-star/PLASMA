import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createGeometryKernel} from '../services/geometry-occt/dist/index.js';
import {nativeHlrPreview,renderVectorSvg,vectorSceneIsCurrent,DEFAULT_VECTOR_STYLE} from '../packages/representation-core/dist/index.js';
const kernel=createGeometryKernel('occt-native');await kernel.ensureReady();
function prism(name,poly,z,h){return kernel.extrude({semanticOwner:'facade:'+name,pirOperationId:'pir:'+name,profile:poly.map(([x,y])=>[x,y,z]),vector:[0,0,h]});}
function box(name,x,y,z,w,d,h){return prism(name,[[x,y],[x+w,y],[x+w,y+d],[x,y+d]],z,h);}
const reps=[prism('extrusion',[[0,0],[45,0],[45,4],[4,4],[4,36],[45,36],[45,40],[0,40]],0,180),box('cover',45,0,0,4,40,180),box('panel',49,17,15,95,6,150),box('bracket',4,5,65,37,30,20)];
const req={representationIds:reps.map(r=>r.id),origin:[0,0,0],right:[Math.SQRT1_2,-Math.SQRT1_2,0],down:[1/Math.sqrt(6),1/Math.sqrt(6),-2/Math.sqrt(6)]};
assert.throws(()=>kernel.projectStoredHlrDiagnostic({...req,representationIds:['missing']}),/source unavailable/);
const output=kernel.projectStoredHlrDiagnostic(req);
assert.equal(output.globalCounts.visible,30);assert.equal(output.globalCounts.hidden,33);
assert.equal(output.components.length,4);
assert.ok(output.components.find(c=>c.semanticOwner==='facade:bracket').hidden.length>0);
const scene=nativeHlrPreview(output,{expectedProjectionDigest:output.projectionDigest,viewId:'stored-facade',scaleDenominator:1});
assert.equal(vectorSceneIsCurrent(scene,scene.pins),false);
const all=renderVectorSvg(scene,{...DEFAULT_VECTOR_STYLE,hiddenVisible:true});
const selected=renderVectorSvg(scene,{...DEFAULT_VECTOR_STYLE,hiddenVisible:true,hiddenLine:{ownerIds:['facade:bracket'],patternPaperMm:[3,1.5],opacity:.65}});
assert.match(all,/data-publication="blocked"/);
const paths=[...selected.matchAll(/<path [^>]*data-role="hidden"[^>]*\/>/g)].map(m=>m[0]);
assert.ok(paths.length>0);assert.ok(paths.every(p=>p.includes('data-owner="facade:bracket"')));
assert.throws(()=>kernel.projectStoredHlrDiagnostic(req),/single-use/);
await mkdir('hlr-evidence',{recursive:true});
await writeFile('hlr-evidence/stored-facade-all-hidden.svg',all);
await writeFile('hlr-evidence/stored-facade-bracket-hidden.svg',selected);
await writeFile('hlr-evidence/stored-facade-components.json',JSON.stringify(output,null,2));
console.log('Stored native solids HLR with component-specific hidden line styling: PASS');
