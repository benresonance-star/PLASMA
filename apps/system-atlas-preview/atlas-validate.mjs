import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAtlasModel, parseHash } from './atlas-model.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const atlas=JSON.parse(fs.readFileSync(path.join(here,'atlas.json'),'utf8'));
const repositoryEvidence=JSON.parse(fs.readFileSync(path.join(here,'repository-evidence.json'),'utf8'));
const evidenceWorkflow=fs.readFileSync(path.resolve(here,'../../.github/workflows/atlas-evidence.yml'),'utf8');
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
assert(Array.isArray(atlas.links),'typed integration links are required');
assert(atlas.integration?.matrixRows?.length,'integration matrix rows are required');

unique(atlas.views,'views');
unique(atlas.components,'components');
unique(atlas.relationships,'relationships');
unique(atlas.contracts,'contracts');
unique(atlas.languages.domain,'domain languages');
unique(atlas.languages.crossCutting,'cross-cutting languages');
unique(atlas.transactions.stages,'transaction stages');
unique(atlas.slices,'slices');
unique(atlas.evidence,'evidence');
unique(atlas.links,'integration links');

assert(repositoryEvidence.schemaVersion==='1.0','repository evidence contract must use schemaVersion 1.0');
assert(repositoryEvidence.repository?.provider==='github','repository evidence contract currently requires github provider');
assert(repositoryEvidence.repository?.owner==='benresonance-star'&&repositoryEvidence.repository?.name==='PLASMA','repository evidence contract must target benresonance-star/PLASMA');
assert(repositoryEvidence.workflow?.file==='atlas-evidence.yml','repository evidence workflow file must be atlas-evidence.yml');
const bindingIds=repositoryEvidence.bindings.map(binding=>binding.id);
assert(new Set(bindingIds).size===bindingIds.length,'repository evidence bindings contain duplicate ids');
const boundEvidenceIds=repositoryEvidence.bindings.map(binding=>binding.evidenceId);
assert(new Set(boundEvidenceIds).size===boundEvidenceIds.length,'repository evidence must bind each evidence id at most once');
assert(boundEvidenceIds.length===atlas.evidence.length,'repository evidence must contain one binding record for every Atlas evidence item');
for(const evidence of atlas.evidence)assert(boundEvidenceIds.includes(evidence.id),`repository evidence missing binding for ${evidence.id}`);
for(const binding of repositoryEvidence.bindings){
  assert(atlas.evidence.some(evidence=>evidence.id===binding.evidenceId),`repository binding ${binding.id} references missing evidence ${binding.evidenceId}`);
  assert(Array.isArray(binding.sources)&&binding.sources.length>0,`repository binding ${binding.id} must declare source paths`);
  assert(['source-change','max-age','source-change-or-max-age','manual-expiry'].includes(binding.freshnessPolicy?.mode),`repository binding ${binding.id} has invalid freshness policy`);
  const testIds=(binding.tests||[]).map(test=>test.id);
  assert(new Set(testIds).size===testIds.length,`repository binding ${binding.id} contains duplicate test identifiers`);
  for(const test of binding.tests||[]){
    assert(test.step===binding.ci?.step,`repository binding ${binding.id} test step must match CI step`);
    for(const testPath of test.paths||[]){
      assert(fs.existsSync(path.resolve(here,'../..',testPath)),`repository binding ${binding.id} references missing test path ${testPath}`);
    }
  }
  if((binding.tests||[]).length){
    assert(binding.ci?.workflow==='atlas-evidence',`repository binding ${binding.id} executable tests must use atlas-evidence workflow`);
    assert(binding.ci?.job==='evidence',`repository binding ${binding.id} executable tests must use evidence job`);
    assert(evidenceWorkflow.includes(`name: ${binding.ci.step}`),`repository binding ${binding.id} CI step ${binding.ci.step} is missing from workflow`);
  } else {
    assert(binding.ci===null,`repository binding ${binding.id} without tests must not claim executable CI evidence`);
  }
}

const componentIds=new Set(atlas.components.map(x=>x.id));
const contractIds=new Set(atlas.contracts.map(x=>x.id));
const evidenceIds=new Set(atlas.evidence.map(x=>x.id));
const coreLanguageIds=new Set(atlas.languages.crossCutting.map(x=>x.id));
const domainLanguageIds=new Set(atlas.languages.domain.map(x=>x.id));
const stageIds=new Set(atlas.transactions.stages.map(x=>x.id));
const sliceIds=new Set(atlas.slices.map(x=>x.id));
const refSets={
  component:componentIds,
  relationship:new Set(atlas.relationships.map(x=>x.id)),
  contract:contractIds,
  domainLanguage:domainLanguageIds,
  coreLanguage:coreLanguageIds,
  stage:stageIds,
  slice:sliceIds,
  evidence:evidenceIds
};
const hasRef=(ref)=>Boolean(ref&&refSets[ref.type]?.has(ref.id));

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
  assert(['active','emerging','planned','research'].includes(language.maturity),`domain language ${language.id} must declare a supported maturity state`);
}

for(const evidence of atlas.evidence){
  const status=evidence.verification?.status;
  assert(['unlinked','linked','verified','failed','stale','superseded'].includes(status),`evidence ${evidence.id} has unsupported verification status ${status}`);
  assert(evidence.claim,`evidence ${evidence.id} must declare a claim`);
  assert(evidence.verification?.method,`evidence ${evidence.id} must declare a verification method`);
  const criteriaIds=(evidence.acceptanceCriteria||[]).map(x=>x.id);
  assert(new Set(criteriaIds).size===criteriaIds.length,`evidence ${evidence.id} contains duplicate acceptance criterion ids`);
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
  assert(Array.isArray(slice.integrationEvidence)&&slice.integrationEvidence.length>0,`slice ${slice.id} must link at least one integration evidence scenario`);
  for(const evidenceId of slice.integrationEvidence||[])assert(evidenceIds.has(evidenceId),`slice ${slice.id} references missing integration evidence ${evidenceId}`);
}
for(const link of atlas.links){
  assert(hasRef(link.from),`integration link ${link.id} has invalid from ref ${link.from?.type}:${link.from?.id}`);
  assert(hasRef(link.to),`integration link ${link.id} has invalid to ref ${link.to?.type}:${link.to?.id}`);
  assert(['defined','partial','planned'].includes(link.architectureState),`integration link ${link.id} has unsupported architecture state`);
  assert(!('evidenceState' in link),`integration link ${link.id} must derive evidence state rather than store evidenceState`);
  assert(['all-required','any-required','threshold'].includes(link.evidencePolicy?.mode),`integration link ${link.id} has unsupported evidence policy`);
  if(link.evidencePolicy?.mode==='threshold')assert(Number.isInteger(link.evidencePolicy.minimumVerified)&&link.evidencePolicy.minimumVerified>0,`integration link ${link.id} threshold policy requires minimumVerified`);
  const refIds=(link.evidenceRefs||[]).map(x=>x.id);
  assert(new Set(refIds).size===refIds.length,`integration link ${link.id} contains duplicate evidenceRefs`);
  for(const evidenceRef of link.evidenceRefs||[]){
    assert(evidenceIds.has(evidenceRef.id),`integration link ${link.id} references missing evidence ${evidenceRef.id}`);
    assert(['required','supporting'].includes(evidenceRef.requirement),`integration link ${link.id} has invalid evidence requirement ${evidenceRef.requirement}`);
    const evidence=atlas.evidence.find(x=>x.id===evidenceRef.id);
    const criteriaIds=new Set((evidence?.acceptanceCriteria||[]).map(x=>x.id));
    for(const criterion of evidenceRef.proves||[])assert(criteriaIds.has(criterion),`integration link ${link.id} references missing criterion ${criterion} on evidence ${evidenceRef.id}`);
  }
  if(link.role==='exercises'&&link.criticality==='core'&&link.architectureState!=='planned'){
    assert((link.evidenceRefs||[]).some(x=>x.requirement==='required'),`core defined/partial integration link ${link.id} must declare required evidence`);
    assert((link.evidenceRefs||[]).some(x=>x.requirement==='supporting'),`core defined/partial integration link ${link.id} must declare supporting evidence`);
  }
  if(link.role==='exercises'){
    for(const evidenceRef of (link.evidenceRefs||[]).filter(x=>x.requirement==='supporting')){
      assert(typeof evidenceRef.note==='string'&&evidenceRef.note.trim().length>0,`supporting evidence ${evidenceRef.id} on ${link.id} must explain why it supports this relationship`);
    }
  }
}
assert(atlas.integration.evidenceSemantics?.definition,'integration evidence semantics must define what evidence means');
assert(atlas.integration.evidenceSemantics?.scope,'integration evidence semantics must define evidence scope');
assert(atlas.integration.evidenceSemantics?.required,'integration evidence semantics must define required evidence');
assert(atlas.integration.evidenceSemantics?.supporting,'integration evidence semantics must define supporting evidence');
assert(atlas.integration.evidenceSemantics?.repositoryBacked,'integration evidence semantics must define repository-backed proof');
assert(atlas.integration.evidenceSemantics?.unlinked,'integration evidence semantics must define unlinked evidence');

for(const row of atlas.integration.matrixRows){
  assert(hasRef(row.ref),`integration matrix row ${row.label} references missing Atlas item ${row.ref?.type}:${row.ref?.id}`);
}
for(const slice of atlas.slices){
  const scenarioLinks=atlas.links.filter(link=>link.from.type==='slice'&&link.from.id===slice.id&&link.role==='proved-by');
  assert(scenarioLinks.length>0,`slice ${slice.id} must have a typed proved-by evidence link`);
}
assert(atlas.languages.futureDomains.length===0,'maturity-tracked domain languages must replace future-domain placeholder labels');
assert(domainLanguageIds.has('planning'),'Planning / Regulation Language must be a first-class Atlas node');
assert(domainLanguageIds.has('space-program'),'Space / Program Language must be a first-class Atlas node');
assert(domainLanguageIds.has('structure'),'Structure Language must be a first-class Atlas node');
assert(domainLanguageIds.has('envelope'),'Envelope Language must be a first-class Atlas node');
assert(domainLanguageIds.has('services'),'Services Language must be a first-class Atlas node');
assert(domainLanguageIds.has('materials'),'Materials Language must be a first-class Atlas node');
assert(domainLanguageIds.has('fabrication'),'Fabrication Language must be a first-class Atlas node');
assert(domainLanguageIds.has('economics'),'Economics / Feasibility Language must be a first-class Atlas node');
assert(domainLanguageIds.has('construction'),'Construction Language must be a first-class Atlas node');
assert(domainLanguageIds.has('operation'),'Operation / Lifecycle Language must be a first-class Atlas node');
assert(domainLanguageIds.has('botanical'),'Botanical / Ecology Language must be a first-class Atlas node');

assert(atlas.slices.some(slice=>slice.id==='townhouse-system'),'vertical slices must include the townhouse medium-density housing test');
assert(atlas.slices.some(slice=>slice.id==='apartment-system'),'vertical slices must include the apartment whole-building coordination test');
assert(atlas.slices.some(slice=>slice.id==='window-door-system'),'vertical slices must include the window and door hosted product-system test');
assert(atlas.slices.some(slice=>slice.id==='clothing-fabrication'),'vertical slices must include the clothing-to-fabrication generalisation test');
assert(atlas.slices.some(slice=>slice.id==='botanical-growth'),'vertical slices must include the botanical growth living-system test');

const expectedViews=['overview','integration','languages','transactions','components','contracts','slices','evidence'];
for(const id of expectedViews)assert(atlas.views.some(v=>v.id===id),`missing functional view ${id}`);

assert(atlas.transactions.candidatePatch?.fields?.includes('base_revision'),'CandidatePatch must declare base_revision');
assert(atlas.transactions.candidatePatch?.fields?.includes('reads[]'),'CandidatePatch must declare reads[]');
assert(atlas.transactions.candidatePatch?.fields?.includes('writes[]'),'CandidatePatch must declare writes[]');
assert(atlas.transactions.rejectionPaths?.length>=6,'transaction model must expose rejection paths');
assert(atlas.transactions.invariants?.length>=8,'transaction model must expose kernel invariants');

const runtimeModel=createAtlasModel(atlas);
assert(runtimeModel.search('submit transaction').some(ref=>ref.type==='contract'&&ref.id==='submit-transaction'),'search must resolve submitTransaction contract');
assert(runtimeModel.search('transaction proposal').some(ref=>ref.type==='relationship'||ref.type==='contract'),'search must safely include relationships without names');
assert(runtimeModel.linksFor('slice','window-door-system').length>0,'window/door slice must expose graph links');
assert(runtimeModel.related('component','geometry').some(item=>item.ref.type==='slice'),'reverse graph navigation must expose slices from components');
assert(runtimeModel.search('window fabrication').some(ref=>ref.id==='window-door-system'||ref.id==='fabrication'||ref.type==='integrationLink'),'search must include graph-connected integration terms');
const windowGeometryLink=runtimeModel.integrationCoverage('window-door-system',{type:'component',id:'geometry'});
assert(windowGeometryLink,'window/door → geometry integration relationship must exist');
assert(!('evidenceState' in windowGeometryLink),'integration relationship must not store evidenceState');
const windowGeometryCoverage=runtimeModel.deriveEvidenceCoverage(windowGeometryLink);
assert(windowGeometryCoverage.state==='unlinked','unverified window/door → geometry evidence must derive as unlinked');
assert(windowGeometryCoverage.required>=2,'window/door → geometry must require slice and geometry boundary evidence');
assert(windowGeometryCoverage.supporting>=2,'window/door → geometry must expose independent supporting evidence');
assert(windowGeometryCoverage.supportingItems.every(item=>item.ref.note),'supporting evidence must carry relationship-specific rationale');
const supportingSnapshot=windowGeometryCoverage.state;
const supportingEvidence=windowGeometryCoverage.supportingItems[0]?.evidence;
if(supportingEvidence){
  const originalStatus=supportingEvidence.verification.status;
  supportingEvidence.verification.status='failed';
  assert(runtimeModel.deriveEvidenceCoverage(windowGeometryLink).state===supportingSnapshot,'supporting evidence failure must not change aggregate relationship verification state');
  supportingEvidence.verification.status=originalStatus;
}
assert(runtimeModel.evidenceUsers('ev-slice-window-resize').some(item=>item.link.id===windowGeometryLink.id),'evidence reverse navigation must resolve window resize back to geometry relationship');
const integrationLinkRoute=parseHash(`#integration/link/${encodeURIComponent(windowGeometryLink.id)}`);
assert(integrationLinkRoute.view==='integration'&&integrationLinkRoute.type==='integrationLink'&&integrationLinkRoute.id===windowGeometryLink.id,'integration link deep-link must parse');
const integrationInsights=runtimeModel.integrationInsights();
assert(integrationInsights.unlinkedEvidence.length>=10,'integration insights must expose unlinked evidence');

const authorityRoute=parseHash('#overview/component/authority');
assert(authorityRoute.view==='overview'&&authorityRoute.type==='component'&&authorityRoute.id==='authority','overview component deep-link must parse');
const languageRoute=parseHash('#languages/domain/site');
assert(languageRoute.view==='languages'&&languageRoute.type==='domainLanguage'&&languageRoute.id==='site','language deep-link must parse');

if(errors.length){
  console.error('Atlas validation failed:');
  errors.forEach(error=>console.error(` - ${error}`));
  process.exit(1);
}
console.log(`Atlas ${atlas.meta.version} valid: ${atlas.components.length} components, ${atlas.languages.domain.length} domain languages, ${atlas.relationships.length} relationships, ${atlas.contracts.length} contracts, ${atlas.slices.length} slices, ${atlas.evidence.length} evidence requirements, ${atlas.links.length} typed integration links, ${repositoryEvidence.bindings.filter(binding=>binding.ci).length} executable repository evidence bindings.`);
