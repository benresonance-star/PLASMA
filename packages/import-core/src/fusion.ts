/**
 * FUSION-01: read-only reconciliation of existing Build and Loft source projects.
 * All imported source IDs are preserved. Loft B-reps are NOT evaluated here.
 * Publication and authoritative edits remain governed by Plasma transactions.
 */
import { createHash } from 'node:crypto';
import {
  createSemanticGraph,
  parseParameter,
  parseRelationship,
  parseSemanticObject,
  type Parameter,
  type Relationship,
  type SemanticObject,
} from '@spds/semantic-core';

type UnknownRecord = Record<string, unknown>;

export interface FusionBinding {
  readonly buildEntityId: string;
  readonly loftAssemblyId: string;
  readonly loftInstanceId: string;
}
export interface FusionSource {
  readonly system: 'build' | 'loft';
  readonly projectId: string;
  readonly sourceHash: string;
  readonly sourceRevision: string;
}
export interface FirstFusionPreview {
  readonly status: 'preview-only';
  readonly authority: 'plasma-semantic-graph';
  readonly geometryStatus: 'source-reference-not-compiled';
  readonly publicationReady: false;
  readonly sources: readonly FusionSource[];
  readonly objects: readonly SemanticObject[];
  readonly parameters: readonly Parameter[];
  readonly relationships: readonly Relationship[];
  readonly bindings: readonly { readonly buildEntityId: string; readonly loftOccurrenceId: string }[];
  readonly unresolved: readonly string[];
}

function record(input: unknown, path: string): UnknownRecord {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(path + ': expected object');
  }
  return input as UnknownRecord;
}
function string(input: unknown, path: string): string {
  if (typeof input !== 'string' || !input.trim()) throw new Error(path + ': expected string');
  return input;
}
function array(input: unknown, path: string): unknown[] {
  if (!Array.isArray(input)) throw new Error(path + ': expected array');
  return input;
}
function sha(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
function sourceId(prefix: string, ...parts: string[]): string {
  return prefix + ':' + parts.map((s) => sha(s).slice(0, 16)).join(':');
}
function assertUnique(ids: string[], name: string): void {
  if (new Set(ids).size !== ids.length) throw new Error(name + ': duplicate source IDs');
}
function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && /Z$|[+-]\d\d:\d\d$/.test(value);
}

/** Imports source records into one typed, *non-published* Plasma semantic graph.
 *  No inferred physical equivalence: the caller must explicitly supply each binding.
 */
export function composeFirstFusion(input: {
  readonly buildProject: unknown;
  readonly loftProject: unknown;
  readonly bindings?: readonly FusionBinding[];
}): FirstFusionPreview {
  const build = record(input.buildProject, 'Build');
  const loft = record(input.loftProject, 'Loft');
  if (build['schemaVersion'] !== 2) throw new Error('Build: unsupported schemaVersion');
  if (loft['schemaVersion'] !== 2 || loft['units'] !== 'mm')
    throw new Error('Loft: only schemaVersion 2 with explicit millimetre units is supported');

  const graph = record(build['authoritativeGraph'], 'Build.authoritativeGraph');
  const buildEntities = array(graph['entities'], 'Build.entities')
    .map((v) => parseSemanticObject(v));
  const buildParameters = array(graph['parameters'], 'Build.parameters')
    .map((v) => parseParameter(v));
  const buildRelations = array(graph['relationships'], 'Build.relationships')
    .map((v) => parseRelationship(v));
  const buildIds = new Set([...buildEntities, ...buildParameters].map((o) => o.id));
  for (const parameter of buildParameters) {
    for (const id of parameter.affects) {
      if (!buildIds.has(id)) throw new Error('Build: orphan parameter.affects: ' + id);
    }
  }
  createSemanticGraph([...buildEntities, ...buildParameters], buildRelations);

  const projectId = string(loft['id'], 'Loft.id');
  const parts = array(loft['parts'], 'Loft.parts').map((v) => record(v, 'Loft.part'));
  const assemblies = array(loft['assemblies'], 'Loft.assemblies')
    .map((v) => record(v, 'Loft.assembly'));
  const partNames = parts.map((p) => string(p['id'], 'Loft.part.id'));
  const assemblyNames = assemblies.map((a) => string(a['id'], 'Loft.assembly.id'));
  assertUnique(partNames, 'Loft.parts');
  assertUnique(assemblyNames, 'Loft.assemblies');
  if (!assemblyNames.includes(string(loft['rootAssembly'], 'Loft.rootAssembly'))) {
    throw new Error('Loft: root assembly does not exist');
  }
  if (parts.length > 256 || assemblies.length > 256) throw new Error('Loft: bounded intake exceeded');
  const prefix = sourceId('entity:loft', projectId);
  const at = isIsoTimestamp(build['savedAt']) ? build['savedAt'] : '1970-01-01T00:00:00.000Z';
  function create(
    id: string,
    kind: SemanticObject['kind'],
    semanticType: string,
    name: string,
    metadata: UnknownRecord,
  ): SemanticObject {
    return parseSemanticObject({
      id, kind, semanticType, name, metadata,
      createdAt: at, updatedAt: at, schemaVersion: '1.0.0',
    });
  }
  const loftModelId = sourceId('model:loft', projectId);
  const loftEntities: SemanticObject[] = [
    create(loftModelId, 'Model', 'geometry.loft.project', projectId, {
      sourceProjectId: projectId, units: 'mm', sourceFormat: 'loftproj-v2',
      exactGeometryEvaluated: false,
    }),
  ];
  const derivedRelationships: Relationship[] = [];
  const seenRelIds = new Set<string>();
  function relate(type: Relationship['relationType'], from: string, to: string, role: string): void {
    const id = sourceId('relationship:fusion', type, from, to, role);
    if (seenRelIds.has(id)) throw new Error('Fusion: duplicate binding/relationship');
    seenRelIds.add(id);
    derivedRelationships.push(parseRelationship({
      id, kind: 'Relationship', semanticType: 'fusion.' + role,
      name: role, relationType: type, from, to,
      createdAt: at, updatedAt: at, schemaVersion: '1.0.0',
    }));
  }

  const partIds = new Map<string, string>();
  for (const part of parts) {
    const name = string(part['id'], 'Loft.part.id');
    const id = sourceId(prefix + ':part', name);
    const params = record(part['parameters'] ?? {}, 'Loft.part.parameters');
    // No unit inference: raw values are preserved, NOT promoted to typed Plasma Parameters.
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'number' && !Number.isFinite(value))
        throw new Error('Loft: non-finite parameter ' + name + '.' + key);
    }
    const features = array(part['features'], 'Loft.part.features');
    loftEntities.push(create(id, 'Entity', 'geometry.loft.part', name, {
      sourcePartId: name, material: part['material'] ?? null,
      rawParameters: params, featureCount: features.length,
      exactGeometryEvaluated: false,
    }));
    partIds.set(name, id);
    relate('part-of', id, loftModelId, 'part-membership');
  }

  const occurrenceIds = new Map<string, string>();
  let occurrenceCount = 0;
  for (const assembly of assemblies) {
    const name = string(assembly['id'], 'Loft.assembly.id');
    const assemblyId = sourceId(prefix + ':assembly', name);
    loftEntities.push(create(assemblyId, 'Assembly', 'geometry.loft.assembly', name, {
      sourceAssemblyId: name, sourceProjectId: projectId,
    }));
    relate('part-of', assemblyId, loftModelId, 'assembly-membership');
    const instances = array(assembly['instances'], 'Loft.assembly.instances');
    const instanceNames = instances.map((v) => string(record(v, 'Loft.instance')['id'], 'Loft.instance.id'));
    assertUnique(instanceNames, 'Loft.instances.' + name);
    for (const raw of instances) {
      const inst = record(raw, 'Loft.instance');
      const instName = string(inst['id'], 'Loft.instance.id');
      const partName = string(inst['partId'], 'Loft.instance.partId');
      const defId = partIds.get(partName);
      if (!defId) throw new Error('Loft: missing part definition ' + partName);
      const occurrenceId = sourceId(prefix + ':occurrence', name, instName);
      const placement = record(inst['placement'] ?? {}, 'Loft.instance.placement');
      const translation = placement['translation'] ?? [0, 0, 0];
      if (!Array.isArray(translation) || translation.length !== 3
          || !translation.every((v) => typeof v === 'number' && Number.isFinite(v))) {
        throw new Error('Loft: invalid occurrence translation');
      }
      loftEntities.push(create(occurrenceId, 'Entity', 'geometry.loft.occurrence', instName, {
        sourceAssemblyId: name, sourceInstanceId: instName,
        sourcePartId: partName, translationMm: translation,
        exactGeometryEvaluated: false,
      }));
      relate('part-of', occurrenceId, assemblyId, 'occurrence-membership');
      relate('generated-from', occurrenceId, defId, 'part-definition');
      occurrenceIds.set(name + '\u0000' + instName, occurrenceId);
      occurrenceCount++;
    }
  }
  if (occurrenceCount > 4096) throw new Error('Loft: occurrence intake budget exceeded');

  const resolvedBindings: { buildEntityId: string; loftOccurrenceId: string }[] = [];
  const boundLoft = new Set<string>();
  const boundBuild = new Set<string>();
  for (const b of input.bindings ?? []) {
    if (!buildEntities.some((e) => e.id === b.buildEntityId))
      throw new Error('Fusion: binding references unknown Build entity ' + b.buildEntityId);
    const occurrenceId = occurrenceIds.get(b.loftAssemblyId + '\u0000' + b.loftInstanceId);
    if (!occurrenceId) throw new Error('Fusion: binding references unknown Loft occurrence');
    if (boundLoft.has(occurrenceId) || boundBuild.has(b.buildEntityId))
      throw new Error('Fusion: ambiguous many-to-one binding; make a deliberate revisioned mapping');
    boundLoft.add(occurrenceId);
    boundBuild.add(b.buildEntityId);
    relate('represented-by', b.buildEntityId, occurrenceId, 'explicit-representation');
    resolvedBindings.push({ buildEntityId: b.buildEntityId, loftOccurrenceId: occurrenceId });
  }

  const allObjects = [...buildEntities, ...buildParameters, ...loftEntities];
  const allRelationships = [...buildRelations, ...derivedRelationships];
  createSemanticGraph(allObjects, allRelationships);
  return {
    status: 'preview-only',
    authority: 'plasma-semantic-graph',
    geometryStatus: 'source-reference-not-compiled',
    publicationReady: false,
    sources: [
      {
        system: 'build', projectId: string(build['app'], 'Build.app'),
        sourceHash: sha(JSON.stringify(build)),
        sourceRevision: String(build['revision'] ?? 'unknown'),
      },
      {
        system: 'loft', projectId, sourceHash: sha(JSON.stringify(loft)),
        sourceRevision: String(loft['schemaVersion']),
      },
    ],
    objects: [...buildEntities, ...loftEntities],
    parameters: buildParameters,
    relationships: allRelationships,
    bindings: resolvedBindings,
    unresolved: [
      'Loft B-reps and features have not been compiled in Plasma',
      'No automatic parameter propagation between source applications',
      'No drawings, engineering checks or fabrication artefacts validated',
      'No project revision has been committed',
    ],
  };
}
