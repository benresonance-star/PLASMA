import type { FirstFusionPreview } from './fusion.js';

export interface FusionFinding {
  readonly code: string;
  readonly severity: 'info' | 'unresolved' | 'invalid';
  readonly subjectId: string;
  readonly summary: string;
}
export interface ConstructionReview {
  readonly stage: 'F04';
  readonly evidenceState: 'semantic-relationships-only';
  readonly hostedOpenings: number;
  readonly hostLinks: number;
  readonly linkedRepresentations: number;
  readonly findings: readonly FusionFinding[];
  readonly constructionApproved: false;
}
/** F04 checks semantic hosting, not Australian NCC compliance or member engineering. */
export function auditFusionConstruction(preview: FirstFusionPreview): ConstructionReview {
  const byId = new Map(preview.objects.map((o) => [o.id, o]));
  const openings = preview.objects.filter((o) =>
    o.semanticType === 'architecture.hosted-opening' ||
    o.semanticType.includes('window') ||
    o.semanticType.includes('door'));
  const findings: FusionFinding[] = [];
  let links = 0;
  for (const opening of openings) {
    const hosted = preview.relationships.filter((r) =>
      r.from === opening.id && r.relationType === 'architecture.hosted-by');
    if (hosted.length !== 1) {
      findings.push({
        code: 'HOST_CARDINALITY', severity: 'invalid', subjectId: opening.id,
        summary: 'Expected one explicit wall host; found ' + hosted.length,
      });
      continue;
    }
    const host = byId.get(hosted[0]!.to);
    if (!host || !host.semanticType.startsWith('architecture.wall')) {
      findings.push({ code: 'HOST_TYPE', severity: 'invalid', subjectId: opening.id,
        summary: 'Hosting relationship does not target an architectural wall' });
      continue;
    }
    links++;
    const bound = preview.bindings.some((b) => b.buildEntityId === opening.id);
    if (!bound) findings.push({
      code: 'MISSING_GEOMETRY_LINK', severity: 'unresolved', subjectId: opening.id,
      summary: 'Hosted opening lacks an explicit Loft occurrence representation',
    });
  }
  // Even well-formed semantic hosting is not a structural, fire or waterproofing proof.
  findings.push({ code: 'CONSTRUCTION_EVIDENCE_REQUIRED', severity: 'unresolved',
    subjectId: 'model', summary: 'Framing, lintel, fire, acoustic, weatherproofing and assembly tests are not run' });
  return {
    stage: 'F04', evidenceState: 'semantic-relationships-only',
    hostedOpenings: openings.length, hostLinks: links,
    linkedRepresentations: preview.bindings.length,
    findings, constructionApproved: false,
  };
}

export interface CausalTrace {
  readonly stage: 'F07';
  readonly selectedId: string;
  readonly nodes: readonly { readonly id: string; readonly label: string; readonly role: string }[];
  readonly edges: readonly { readonly from: string; readonly to: string; readonly type: string }[];
  readonly truncated: boolean;
  readonly evidenceState: 'relationships-only';
}
/** Bounded trace using real graph edges; direction is preserved and no fabricated rule edges. */
export function traceFusionCausality(
  preview: FirstFusionPreview,
  selectedId: string,
  hops = 2,
  limit = 36,
): CausalTrace {
  if (!preview.objects.some((o) => o.id === selectedId) &&
      !preview.parameters.some((o) => o.id === selectedId)) throw new Error('FUSION_CAUSAL_UNKNOWN_SELECTION');
  if (hops < 0 || hops > 3 || limit < 1 || limit > 100) throw new Error('FUSION_CAUSAL_BUDGET');
  const nodeIds = new Set<string>([selectedId]);
  const edges = new Map<string, { from: string; to: string; type: string }>();
  let frontier = [selectedId];
  for (let depth = 0; depth < hops; depth++) {
    const next: string[] = [];
    for (const rel of preview.relationships) {
      if (!frontier.includes(rel.from) && !frontier.includes(rel.to)) continue;
      const other = frontier.includes(rel.from) ? rel.to : rel.from;
      if (!nodeIds.has(other) && nodeIds.size < limit) {
        nodeIds.add(other); next.push(other);
      }
      if (nodeIds.has(rel.from) && nodeIds.has(rel.to))
        edges.set(rel.id, { from: rel.from, to: rel.to, type: rel.relationType });
    }
    for (const parameter of preview.parameters) {
      if (!frontier.includes(parameter.id) && !parameter.affects.some((id) => frontier.includes(id))) continue;
      for (const owner of parameter.affects) {
        if (nodeIds.size < limit) {
          nodeIds.add(parameter.id); nodeIds.add(owner);
        }
        if (nodeIds.has(parameter.id) && nodeIds.has(owner)) {
          edges.set(parameter.id + '::' + owner, {
            from: parameter.id, to: owner, type: 'parameter-affects',
          });
        }
        if (frontier.includes(parameter.id) && !frontier.includes(owner)) next.push(owner);
      }
      if (!frontier.includes(parameter.id)) next.push(parameter.id);
    }
    frontier = [...new Set(next)];
  }
  return {
    stage: 'F07',
    selectedId,
    nodes: [...nodeIds].map((id) => {
      const obj = preview.objects.find((o) => o.id === id);
      const param = preview.parameters.find((p) => p.id === id);
      return { id, label: obj?.name ?? param?.name ?? id, role: obj?.semanticType ?? param?.semanticType ?? 'unresolved' };
    }),
    edges: [...edges.values()],
    truncated: nodeIds.size >= limit,
    evidenceState: 'relationships-only',
  };
}

export interface HotelReadiness {
  readonly stage: 'F08';
  readonly status: 'blocked';
  readonly sourceObjectCount: number;
  readonly occurrences: number;
  readonly semanticStoreys: number;
  readonly testedBimScale: false;
  readonly gates: readonly { readonly name: string; readonly status: 'open'; readonly evidence: string }[];
}
/** No declaration of production readiness without independently demonstrated evidence. */
export function assessHotelReadiness(preview: FirstFusionPreview): HotelReadiness {
  return {
    stage: 'F08', status: 'blocked',
    sourceObjectCount: preview.objects.length,
    occurrences: preview.objects.filter((x) => x.semanticType === 'geometry.loft.occurrence').length,
    semanticStoreys: preview.objects.filter((x) => x.semanticType.includes('storey') || x.semanticType.includes('level')).length,
    testedBimScale: false,
    gates: [
      { name: 'Native OCCT round-trip', status: 'open', evidence: 'Exact B-rep and topology identities not qualified end-to-end' },
      { name: 'Architectural coordination', status: 'open', evidence: 'No full host, opening, MEP or system dependency regeneration' },
      { name: 'Issued documents', status: 'open', evidence: 'No complete associative 1:5–1:200 sheet set' },
      { name: 'IFC exchange', status: 'open', evidence: 'Independent schema validation and external round-trip required' },
      { name: 'Reality registration', status: 'open', evidence: 'Surveyed transforms and uncertainty not yet accepted' },
      { name: 'Hotel performance', status: 'open', evidence: 'Hotel-scale edit latency, memory, drawing regeneration and device tests required' },
    ],
  };
}
