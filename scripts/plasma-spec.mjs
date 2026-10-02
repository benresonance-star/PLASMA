import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const errors = [];

const abs = p => path.resolve(ROOT, p);
const stable = value => JSON.stringify(value, null, 2) + '\n';
const readText = p => fs.readFileSync(abs(p), 'utf8');
const read = p => {
  try {
    return JSON.parse(readText(p));
  } catch (error) {
    throw new Error(`${p}: Spec System v1 accepts the JSON-compatible YAML 1.2 profile only. ${error.message}`);
  }
};
const assert = (condition, message) => { if (!condition) errors.push(message); };
const ensureDir = p => fs.mkdirSync(path.dirname(abs(p)), { recursive: true });

function output(pathname, content) {
  const expected = typeof content === 'string' ? content : stable(content);
  if (CHECK) {
    if (!fs.existsSync(abs(pathname))) {
      errors.push(`generated output missing: ${pathname}`);
      return;
    }
    const actual = readText(pathname);
    if (actual !== expected) errors.push(`generated output drift: ${pathname}`);
    return;
  }
  ensureDir(pathname);
  fs.writeFileSync(abs(pathname), expected);
}

function isType(value, type) {
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'string') return typeof value === 'string';
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return true;
}

function validateSchema(value, schema, label, trail = label) {
  if (schema.type && !isType(value, schema.type)) {
    errors.push(`${trail} expected ${schema.type}`);
    return;
  }
  if ('const' in schema && value !== schema.const) errors.push(`${trail} must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${trail} has unsupported value ${JSON.stringify(value)}`);
  if (schema.type === 'object' && value && typeof value === 'object') {
    for (const key of schema.required || []) if (!(key in value)) errors.push(`${trail} missing required field ${key}`);
    for (const [key, child] of Object.entries(schema.properties || {})) {
      if (key in value) validateSchema(value[key], child, label, `${trail}.${key}`);
    }
  }
  if (schema.type === 'array' && Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) errors.push(`${trail} requires at least ${schema.minItems} items`);
    if (schema.items) value.forEach((item, i) => validateSchema(item, schema.items, label, `${trail}[${i}]`));
  }
}

const system = read('spec/spec-system.yaml');
const registry = read('spec/registry.yaml');
const constitution = read(registry.constitution);
const componentCatalog = read(registry.atlas.components);
const relationshipCatalog = read(registry.atlas.relationships);
const contracts = registry.atlas.contracts.map(p => ({ path: p, record: read(p) }));
const capabilities = registry.capabilities.map(p => ({ path: p, record: read(p) }));
const domains = registry.domains.map(p => ({ path: p, record: read(p) }));
const verticalSlices = registry.verticalSlices.map(p => ({ path: p, record: read(p) }));
const research = registry.research.map(p => ({ path: p, record: read(p) }));
const releases = registry.releases.map(p => ({ path: p, record: read(p) }));
const slicesCatalog = read(registry.atlas.slices);
const evidenceCatalog = read(registry.atlas.evidence);
const languages = read(registry.atlas.languages);
const transactions = read(registry.atlas.transactions);
const integration = read(registry.atlas.integration);
const links = read(registry.atlas.links);
const repositoryEvidence = read(registry.atlas.repositoryEvidence);
const atlasMeta = read(registry.atlas.meta);
const atlasViews = read(registry.atlas.views);

const schemaFor = {
  SpecSystem: 'spec/schemas/spec-system.schema.json',
  Constitution: 'spec/schemas/constitution.schema.json',
  ComponentCatalog: 'spec/schemas/component.schema.json',
  RelationshipCatalog: 'spec/schemas/relationship.schema.json',
  Contract: 'spec/schemas/contract.schema.json',
  Capability: 'spec/schemas/capability.schema.json',
  DomainPack: 'spec/schemas/domain.schema.json',
  VerticalSlice: 'spec/schemas/slice.schema.json',
  EvidenceCatalog: 'spec/schemas/evidence.schema.json',
  Research: 'spec/schemas/research.schema.json',
  Release: 'spec/schemas/release.schema.json'
};
const validate = (record, label) => {
  const p = schemaFor[record.kind];
  if (p) validateSchema(record, read(p), label);
};
validate(system, 'spec-system');
validate(constitution, registry.constitution);
validate(componentCatalog, registry.atlas.components);
validate(relationshipCatalog, registry.atlas.relationships);
contracts.forEach(x => validate(x.record, x.path));
capabilities.forEach(x => validate(x.record, x.path));
domains.forEach(x => validate(x.record, x.path));
verticalSlices.forEach(x => validate(x.record, x.path));
research.forEach(x => validate(x.record, x.path));
releases.forEach(x => validate(x.record, x.path));
validate(evidenceCatalog, registry.atlas.evidence);

const sources = new Map();
const records = [];
const add = (record, sourcePath) => {
  records.push(record);
  const prior = sources.get(record.id);
  if (prior) errors.push(`duplicate canonical id ${record.id}: ${prior} and ${sourcePath}`);
  else sources.set(record.id, sourcePath);
};
add(constitution, registry.constitution);
for (const item of componentCatalog.items || []) add(item, registry.atlas.components);
for (const item of relationshipCatalog.items || []) add(item, registry.atlas.relationships);
contracts.forEach(x => add(x.record, x.path));
capabilities.forEach(x => add(x.record, x.path));
domains.forEach(x => add(x.record, x.path));
verticalSlices.forEach(x => add(x.record, x.path));
research.forEach(x => add(x.record, x.path));
releases.forEach(x => add(x.record, x.path));

const byId = new Map(records.map(x => [x.id, x]));
const statusAxes = system.statusAxes || {};
for (const record of records) {
  assert(record.apiVersion === 'plasma.spec/v1', `${record.id} has invalid apiVersion`);
  assert(record.kind && record.id && record.version, `${record.id || '<unknown>'} missing kind/id/version`);
  if (record.status && typeof record.status === 'object' && !Array.isArray(record.status)) {
    for (const [axis, allowed] of Object.entries(statusAxes)) {
      assert(allowed.includes(record.status[axis]), `${record.id} has invalid ${axis} status ${record.status[axis]}`);
    }
  }
}

const dependencyEdges = [];
for (const record of records) {
  for (const dep of record.dependsOn || []) {
    assert(system.dependencyTypes.includes(dep.type), `${record.id} has unsupported dependency type ${dep.type}`);
    assert(byId.has(dep.id), `${record.id} references missing dependency ${dep.id}`);
    dependencyEdges.push({ from: record.id, to: dep.id, type: dep.type });
  }
}
const hard = dependencyEdges.filter(x => system.hardDependencyTypes.includes(x.type));
const visiting = new Set();
const visited = new Set();
function visit(id, stack = []) {
  if (visiting.has(id)) {
    const start = stack.indexOf(id);
    errors.push(`hard dependency cycle: ${[...stack.slice(start), id].join(' -> ')}`);
    return;
  }
  if (visited.has(id)) return;
  visiting.add(id);
  for (const edge of hard.filter(x => x.from === id)) visit(edge.to, [...stack, id]);
  visiting.delete(id);
  visited.add(id);
}
records.forEach(x => visit(x.id));

const layerRank = { L0:0, L1:1, L2:2, L3:3, L4:4, L5:5 };
for (const edge of hard) {
  const from = byId.get(edge.from), to = byId.get(edge.to);
  if (from?.layer && to?.layer) {
    assert(layerRank[to.layer] <= layerRank[from.layer], `illegal upward dependency: ${from.id}(${from.layer}) requires ${to.id}(${to.layer})`);
  }
}

for (const record of research.map(x => x.record)) {
  assert(record.createsBuildObligation === false, `${record.id} research must set createsBuildObligation=false`);
}
const researchIds = new Set(research.map(x => x.record.id));
for (const release of releases.map(x => x.record)) {
  for (const item of release.includes || []) assert(!researchIds.has(item.id), `${release.id} cannot include research ${item.id}`);
}
for (const contract of contracts.map(x => x.record)) {
  if (contract.exactFallback?.required) {
    const ref = contract.exactFallback.contractRef;
    assert(ref && byId.has(ref), `${contract.id} requires an exact fallback contractRef`);
    assert((contract.dependsOn || []).some(x => x.type === 'requires' && x.id === ref), `${contract.id} exact fallback ${ref} must also be a requires dependency`);
  }
}

const atlas = {
  meta: atlasMeta.projection,
  views: atlasViews.projection,
  components: (componentCatalog.items || []).map(x => x.projection),
  relationships: (relationshipCatalog.items || []).map(x => x.projection),
  contracts: contracts.map(x => x.record.projection).filter(Boolean),
  languages: languages.projection,
  transactions: transactions.projection,
  slices: (slicesCatalog.items || []).map(x => x.projection),
  evidence: evidenceCatalog.items || [],
  integration: integration.projection,
  links: links.projection
};

const legacyHtml = readText('apps/system-atlas-preview/plasma-spec.html');
const seedMatch = legacyHtml.match(/let seedManifest = (\{[\s\S]*?\n\});\n/);
assert(seedMatch, 'legacy plasma-spec.html seedManifest is missing');
if (seedMatch) {
  const legacySeed = JSON.parse(seedMatch[1]);
  const canonicalLoops = [
    ...capabilities.map(x => x.record.projection).filter(Boolean),
    ...research.map(x => x.record.projection).filter(Boolean)
  ];
  for (const loop of canonicalLoops) {
    const legacy = (legacySeed.loops || []).find(x => x.id === loop.id);
    assert(legacy, `legacy plasma-spec.html missing loop ${loop.id}`);
    if (legacy) assert(JSON.stringify(legacy) === JSON.stringify(loop), `legacy plasma-spec.html drift for loop ${loop.id}`);
  }
}

function blockersFor(record) {
  const out = [];
  const s = record.status;
  if (!s || typeof s !== 'object') return out;
  if (s.architecture !== 'accepted') out.push({ code:'ARCHITECTURE_NOT_ACCEPTED', detail:s.architecture });
  if (!['complete','frozen'].includes(s.specification)) out.push({ code:'SPECIFICATION_INCOMPLETE', detail:s.specification });
  for (const gate of record.activationGates || []) if (gate.status !== 'satisfied') out.push({ code:'ACTIVATION_GATE', detail:gate.id });
  for (const dep of (record.dependsOn || []).filter(x => x.type === 'requires')) {
    const target = byId.get(dep.id);
    if (!target) out.push({ code:'MISSING_DEPENDENCY', detail:dep.id });
    else if (target.status?.architecture === 'rejected' || target.status?.architecture === 'superseded') out.push({ code:'DEPENDENCY_ARCHITECTURE', detail:dep.id });
  }
  return out;
}
function readinessFor(record) {
  const blockers = blockersFor(record);
  const s = record.status || {};
  if (s.verification === 'failed' || s.verification === 'stale') return { state:'REGRESSED', blockers };
  if (s.release === 'released') return { state:'RELEASED', blockers };
  if (s.implementation === 'implemented' && s.verification === 'verified' && s.release === 'candidate') return { state:'RELEASE_CANDIDATE', blockers };
  if (s.implementation === 'implemented' && s.verification !== 'verified') return { state:'READY_FOR_VERIFICATION', blockers };
  if (s.implementation === 'partial') return { state:'IMPLEMENTATION_INCOMPLETE', blockers };
  if (s.implementation === 'experimental') return { state:'ACTIVE_EXPERIMENT', blockers };
  if (s.implementation === 'not_started') return { state:blockers.length ? 'BLOCKED' : 'READY_FOR_EXPERIMENT', blockers };
  return { state:blockers.length ? 'BLOCKED' : 'READY_FOR_EXPERIMENT', blockers };
}
const buildRecords = records.filter(x => ['Contract','Capability','DomainPack','VerticalSlice'].includes(x.kind));
const readiness = buildRecords
  .map(record => ({ id:record.id, kind:record.kind, title:record.title || record.id, status:record.status, ...readinessFor(record) }))
  .sort((a,b) => a.id.localeCompare(b.id));
const blockers = readiness.flatMap(x => x.blockers.map(b => ({ id:x.id, kind:x.kind, ...b })));

const registryOut = records
  .map(record => ({ id:record.id, kind:record.kind, version:record.version, layer:record.layer || null, status:record.status || null, source:sources.get(record.id) }))
  .sort((a,b) => a.id.localeCompare(b.id));
const contractRegistry = contracts
  .map(({path:p,record}) => ({
    id:record.id, version:record.version, title:record.title, authorityClass:record.authorityClass || null,
    projectionId:record.projection?.id || null, source:p, status:record.status
  }))
  .sort((a,b) => a.id.localeCompare(b.id));

const statusOut = {
  specSystem: system.version,
  sourceMode:'canonical-spec',
  atlasVersion:atlas.meta.version,
  canonicalRecordCount:records.length,
  capabilityCount:capabilities.length,
  contractCount:contracts.length,
  blockerCount:blockers.length,
  readinessCounts:Object.fromEntries([...new Set(readiness.map(x => x.state))].sort().map(state => [state, readiness.filter(x => x.state === state).length])),
  migrationMode:system.migration.mode
};

const markdown = [
  '# Plasma Spec System v1',
  '',
  `Canonical source: \`/spec\` · Spec System ${system.version} · Atlas ${atlas.meta.version}`,
  '',
  '## Constitution',
  '',
  ...constitution.invariants.map(x => `- **${x.id}** — ${x.rule}`),
  '',
  '## Core contracts',
  '',
  '| Contract | Specification | Implementation | Verification |',
  '| --- | --- | --- | --- |',
  ...contractRegistry.map(x => `| ${x.id} · ${x.title} | ${x.status.specification} | ${x.status.implementation} | ${x.status.verification} |`),
  '',
  '## Capabilities',
  '',
  '| Capability | Architecture | Spec | Implementation | Readiness |',
  '| --- | --- | --- | --- | --- |',
  ...capabilities.map(x => {
    const r=readiness.find(y => y.id===x.record.id);
    return `| ${x.record.id} · ${x.record.title} | ${x.record.status.architecture} | ${x.record.status.specification} | ${x.record.status.implementation} | ${r?.state || '—'} |`;
  }),
  '',
  '## Research quarantine',
  '',
  ...research.map(x => `- **${x.record.id}** — ${x.record.title}; createsBuildObligation=${x.record.createsBuildObligation}`),
  '',
  '## Migration state',
  '',
  system.migration.rule,
  ''
].join('\n');

const esc = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const htmlRows = readiness.map(x => `<tr><td><code>${esc(x.id)}</code></td><td>${esc(x.title)}</td><td>${esc(x.status?.architecture||'')}</td><td>${esc(x.status?.specification||'')}</td><td>${esc(x.status?.implementation||'')}</td><td><strong>${esc(x.state)}</strong></td></tr>`).join('');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Plasma Spec System v1</title>
<style>body{font:15px/1.5 system-ui;margin:0;background:#0e1116;color:#e8edf3}.wrap{max-width:1180px;margin:auto;padding:32px}.card{background:#151a22;border:1px solid #29313d;border-radius:14px;padding:20px;margin:18px 0}h1,h2{letter-spacing:-.02em}code{color:#9dd6ff}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:9px;border-bottom:1px solid #29313d}th{color:#9ba8b8}.muted{color:#9ba8b8}.pill{display:inline-block;padding:4px 8px;border:1px solid #3a4554;border-radius:999px;margin-right:6px}</style></head>
<body><div class="wrap"><div class="muted">Generated projection · canonical source /spec</div><h1>Plasma Spec System v1</h1>
<p>One canonical specification graph → generated Atlas, readiness, dependency and human views.</p>
<div class="card"><span class="pill">Spec System ${esc(system.version)}</span><span class="pill">Atlas ${esc(atlas.meta.version)}</span><span class="pill">${records.length} canonical records</span><span class="pill">${blockers.length} build blockers</span></div>
<div class="card"><h2>Constitution</h2><ol>${constitution.invariants.map(x=>`<li><b>${esc(x.id)}</b> — ${esc(x.rule)}</li>`).join('')}</ol></div>
<div class="card"><h2>Build readiness</h2><table><thead><tr><th>ID</th><th>Item</th><th>Architecture</th><th>Spec</th><th>Implementation</th><th>Derived readiness</th></tr></thead><tbody>${htmlRows}</tbody></table></div>
<div class="card"><h2>Migration</h2><p>${esc(system.migration.rule)}</p></div></div></body></html>\n`;

output(system.outputs.atlas, atlas);
output(system.outputs.repositoryEvidence, repositoryEvidence.projection);
output(system.outputs.status, statusOut);
output(system.outputs.humanHtml, html);
output(system.outputs.registry, { specSystem:system.version, records:registryOut });
output(system.outputs.dependencyGraph, { specSystem:system.version, nodes:registryOut.map(x=>({id:x.id,kind:x.kind,layer:x.layer})), edges:dependencyEdges });
output(system.outputs.readiness, { specSystem:system.version, items:readiness });
output(system.outputs.blockers, { specSystem:system.version, blockers });
output(system.outputs.changeImpact, { specSystem:system.version, mode:'initial-v1-baseline', changed:[], note:'Subsequent versions may diff this generated graph against a pinned prior release.' });
output(system.outputs.humanMarkdown, markdown + '\n');
output(system.outputs.contractRegistry, { specSystem:system.version, contracts:contractRegistry });
output(system.outputs.atlasSnapshot, atlas);
output(system.outputs.evidenceSnapshot, repositoryEvidence.projection);

const wall = contracts.find(x => x.record.id === 'PLS-WALL-01')?.record;
const diff = contracts.find(x => x.record.id === 'PLS-DIFF-01')?.record;
if (wall?.sourceDocument) output('apps/system-atlas-preview/wall-contract.json', wall.sourceDocument);
if (diff?.sourceDocument) output('apps/system-atlas-preview/differential-contract.json', diff.sourceDocument);

if (errors.length) {
  console.error('Plasma Spec System validation failed:');
  errors.forEach(e => console.error(` - ${e}`));
  process.exit(1);
}
console.log(`Plasma Spec System ${system.version} valid: ${records.length} canonical records, ${hard.length} hard dependencies, ${blockers.length} derived blockers. ${CHECK ? 'Generated outputs are current.' : 'Generated outputs written.'}`);
