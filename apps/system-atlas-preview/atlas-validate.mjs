import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAtlasModel, parseHash } from './atlas-model.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const atlas=JSON.parse(fs.readFileSync(path.join(here,'atlas.json'),'utf8'));
const errors=[];
const assert=(condition,message)=>{if(!condition)errors.push(message)};
const unique=(items,label)=>{
  const ids=items.map(x=>x.id);
  const duplicates=ids.filter((id,i)=>ids.indexOf(id)!==i);
  assert(duplicates.length===0,`${label} contains duplicate ids: ${[...new Set(duplicates)].join(', ')}`);
};

assert(atlas.meta?.version,'meta.version is required');
assert(Array.isArray(atlas.views)&&atlas.views.length>=7,'views must contain the functional Atlas views');
assert(Array.isArray(atlas.components)&&atlas.components.length>0,'components are required');
assert(Array.isArray(atlas.relationships),'relationships are required');
assert(Array.isArray(atlas.contracts),'contracts are required');
assert(Array.isArray(atlas.slices),'slices are required');
assert(Array.isArray(atlas.evidence),'evidence is required');

unique(atlas.views,'views');
unique(atlas.components,'components');
unique(atlas.relationships,'relationships');
unique(atlas.contracts,'contracts');
unique(atlas.languages.domain,'domain languages');
unique(atlas.languages.crossCutting,'cross-cutting languages');
unique(atlas.transactions.stages,'transaction stages');
unique(atlas.slices,'slices');
unique(atlas.evidence,'evidence');

const componentIds=new Set(atlas.components.map(x=>x.id));
const contractIds=new Set(atlas.contracts.map(x=>x.id));
const evidenceIds=new Set(atlas.evidence.map(x=>x.id));
const coreLanguageIds=new Set(atlas.languages.crossCutting.map(x=>x.id));

for(const component of atlas.components){
  assert(component.atlasId,`component ${component.id} missing atlasId`);
  assert(component.summary&&component.explanation,`component ${component.id} must have summary and explanation`);
  assert(['intent','authority','execution','projection'].includes(component.band),`component ${component.id} has invalid band ${component.band}`);
  for(const contract of component.contracts||[])assert(contractIds.has(contract),`component ${component.id} references missing contract ${contract}`);
  for(const dependency of component.dependencies||[])assert(componentIds.has(dependency),`component ${component.id} references missing component dependency ${dependency}`);
  for(const evidence of component.evidence||[])assert(evidenceIds.has(evidence),`component ${component.id} references missing evidence ${evidence}`);
}

for(const relationship of atlas.relationships){
  assert(componentIds.has(relationship.from),`relationship ${relationship.id} has missing from component ${relationship.from}`);
  assert(componentIds.has(relationship.to),`relationship ${relationship.id} has missing to component ${relationship.to}`);
  assert(contractIds.has(relationship.contract),`relationship ${relationship.id} references missing contract ${relationship.contract}`);
  assert(relationship.payload&&relationship.failure&&relationship.authoritySemantics,`relationship ${relationship.id} must declare payload, failure and authority semantics`);
}

for(const language of atlas.languages.domain){
  for(const use of language.uses||[])assert(coreLanguageIds.has(use),`domain language ${language.id} references missing cross-cutting language ${use}`);
  assert(language.types?.length&&language.verbs?.length&&language.constraints?.length,`domain language ${language.id} must separate types, verbs and constraints`);
}

for(const evidence of atlas.evidence){
  assert(['unlinked','linked','verified','failed','superseded'].includes(evidence.state),`evidence ${evidence.id} has unsupported state ${evidence.state}`);
}

for(const slice of atlas.slices){
  assert(!('progress' in slice)&&!('percentage' in slice),`slice ${slice.id} must not contain unsupported completion percentages`);
  assert(slice.evidenceState,`slice ${slice.id} missing evidenceState`);
  assert(slice.domain&&slice.purpose&&slice.whyThisSlice,`slice ${slice.id} must explain domain, purpose and why it matters`);
  assert(Array.isArray(slice.flow)&&slice.flow.length>=4,`slice ${slice.id} must declare an end-to-end flow`);
  assert(Array.isArray(slice.proves)&&slice.proves.length>=3,`slice ${slice.id} must declare architectural claims to prove`);
  assert(Array.isArray(slice.stressPoints)&&slice.stressPoints.length>=3,`slice ${slice.id} must declare stress points`);
  assert(Array.isArray(slice.successCriteria)&&slice.successCriteria.length>=3,`slice ${slice.id} must declare success criteria`);
  assert(Array.isArray(slice.keySystems)&&slice.keySystems.length>=2,`slice ${slice.id} must declare key systems`);
}
assert(atlas.slices.some(slice=>slice.id==='townhouse-system'),'vertical slices must include the townhouse medium-density housing test');
assert(atlas.slices.some(slice=>slice.id==='apartment-system'),'vertical slices must include the apartment whole-building coordination test');
assert(atlas.slices.some(slice=>slice.id==='window-door-system'),'vertical slices must include the window and door hosted product-system test');
assert(atlas.slices.some(slice=>slice.id==='clothing-fabrication'),'vertical slices must include the clothing-to-fabrication generalisation test');
assert(atlas.slices.some(slice=>slice.id==='botanical-growth'),'vertical slices must include the botanical growth living-system test');

const expectedViews=['overview','languages','transactions','components','contracts','slices','evidence'];
for(const id of expectedViews)assert(atlas.views.some(v=>v.id===id),`missing functional view ${id}`);

assert(atlas.transactions.candidatePatch?.fields?.includes('base_revision'),'CandidatePatch must declare base_revision');
assert(atlas.transactions.candidatePatch?.fields?.includes('reads[]'),'CandidatePatch must declare reads[]');
assert(atlas.transactions.candidatePatch?.fields?.includes('writes[]'),'CandidatePatch must declare writes[]');
assert(atlas.transactions.rejectionPaths?.length>=6,'transaction model must expose rejection paths');
assert(atlas.transactions.invariants?.length>=8,'transaction model must expose kernel invariants');

const runtimeModel=createAtlasModel(atlas);
assert(runtimeModel.search('submit transaction').some(ref=>ref.type==='contract'&&ref.id==='submit-transaction'),'search must resolve submitTransaction contract');
assert(runtimeModel.search('transaction proposal').some(ref=>ref.type==='relationship'||ref.type==='contract'),'search must safely include relationships without names');
const authorityRoute=parseHash('#overview/component/authority');
assert(authorityRoute.view==='overview'&&authorityRoute.type==='component'&&authorityRoute.id==='authority','overview component deep-link must parse');
const languageRoute=parseHash('#languages/domain/site');
assert(languageRoute.view==='languages'&&languageRoute.type==='domainLanguage'&&languageRoute.id==='site','language deep-link must parse');

if(errors.length){
  console.error('Atlas validation failed:');
  errors.forEach(error=>console.error(` - ${error}`));
  process.exit(1);
}
console.log(`Atlas ${atlas.meta.version} valid: ${atlas.components.length} components, ${atlas.relationships.length} relationships, ${atlas.contracts.length} contracts, ${atlas.slices.length} slices, ${atlas.evidence.length} evidence requirements.`);
