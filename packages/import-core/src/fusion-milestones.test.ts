import { describe, expect, it } from 'vitest';
import { composeFirstFusion } from './fusion.js';
import { auditFusionConstruction, assessHotelReadiness, traceFusionCausality } from './fusion-review.js';
import { createFusionSectionSheet } from './fusion-section.js';
import { estimateSiteRegistration } from './site-registration.js';

const at = '2026-11-21T00:00:00.000Z';
const entity = (id: string, semanticType: string) => ({
  id, kind: 'Entity', semanticType, name: id,
  createdAt: at, updatedAt: at, schemaVersion: '1.0.0',
});
const rel = (id: string, type: string, from: string, to: string) => ({
  id, kind: 'Relationship', semanticType: type, name: type,
  relationType: type, from, to, createdAt: at, updatedAt: at,
  schemaVersion: '1.0.0',
});
function model() {
  const buildProject = {
    app: 'Build', schemaVersion: 2, savedAt: at,
    authoritativeGraph: {
      entities: [entity('entity:wall', 'architecture.wall-front'), entity('entity:window', 'architecture.hosted-opening')],
      parameters: [],
      relationships: [rel('relationship:hosting','architecture.hosted-by','entity:window','entity:wall')],
    },
  };
  const loftProject = {
    id: 'WindowDetail', schemaVersion: 2, units: 'mm',
    parts: [
      { id: 'Brick01', material: 'Brick masonry', parameters: { W: 110, D: 75 },
        features: [
          { id: 'S1', type: 'sketch', plane: { type: 'datum', name: 'XY' },
            profile: { kind: 'rectangle', width: 'W', height: 80 } },
          { id: 'E1', type: 'extrude', sketch: 'S1', depth: 'D' },
        ] },
      { id: 'Frame01', material: 'Aluminium', parameters: { W: 55, D: 60 },
        features: [
          { id: 'S2', type: 'sketch', plane: { type: 'datum', name: 'XY' },
            profile: { kind: 'rectangle', width: 'W', height: 90 } },
          { id: 'E2', type: 'extrude', sketch: 'S2', depth: 'D' },
        ] },
    ],
    rootAssembly: 'Main', assemblies: [{ id: 'Main', instances: [
      { id: 'Brick01_01', partId: 'Brick01', placement: { translation: [0,0,0] } },
      { id: 'Frame01_01', partId: 'Frame01', placement: { translation: [120,0,10] } },
    ] }],
  };
  const bindings = [{ buildEntityId:'entity:window', loftAssemblyId:'Main', loftInstanceId:'Frame01_01' }];
  return { buildProject, loftProject, bindings };
}
describe('F04–F08 bounded fusion acceptance', () => {
  it('F04 validates hosting but refuses to certify construction', () => {
    const preview = composeFirstFusion(model());
    const report = auditFusionConstruction(preview);
    expect(report.hostedOpenings).toBe(1);
    expect(report.hostLinks).toBe(1);
    expect(report.linkedRepresentations).toBe(1);
    expect(report.constructionApproved).toBe(false);
    expect(report.findings.some((x) => x.code === 'CONSTRUCTION_EVIDENCE_REQUIRED')).toBe(true);
  });
  it('F04 detects a missing host relationship', () => {
    const source = model();
    source.buildProject.authoritativeGraph.relationships.splice(0);
    const report = auditFusionConstruction(composeFirstFusion(source));
    expect(report.findings.some((x) => x.code === 'HOST_CARDINALITY' && x.severity === 'invalid')).toBe(true);
  });
  it('F05 derives material-aware A3 1:5 sections from actual dimensions', () => {
    const source = model();
    const section = createFusionSectionSheet({ loftProject: source.loftProject, sectionYmm: 0 });
    expect(section.regionCount).toBe(2);
    expect(section.printScale).toBe('1:5');
    expect(section.svg).toContain('width="420mm" height="297mm"');
    expect(section.svg).toContain('url(#mat-masonry)');
    expect(section.svg).toContain('url(#mat-metal)');
    expect(section.svg).toContain('NOT FOR CONSTRUCTION');
    const updated = createFusionSectionSheet({
      loftProject: source.loftProject, sectionYmm: 0,
      parameterOverride: { partId: 'Brick01', parameter: 'W', value: 180 },
    });
    expect(updated.regions.find((x) => x.partId === 'Brick01')?.xMaxMm).toBe(90);
    expect(source.loftProject.parts[0]!.parameters.W).toBe(110);
  });
  it('F05 refuses unsupported feature history and unresolvable geometry rather than inventing sections', () => {
    const source = model();
    source.loftProject.parts[0]!.features.pop();
    const section = createFusionSectionSheet({ loftProject: source.loftProject, sectionYmm: 0 });
    expect(section.unsupported).toContain('Brick01_01: feature history requires exact evaluator');
    expect(() => createFusionSectionSheet({ loftProject: source.loftProject, sectionYmm: 10000 }))
      .toThrow(/NO_INTERSECTING/);
  });
  it('F06 estimates 2D local site registration and publishes residuals without certification', () => {
    const points = [
      {id:'A',pixel:[0,0] as const,localMm:[1000,2000] as const},
      {id:'B',pixel:[100,0] as const,localMm:[3000,2000] as const},
      {id:'C',pixel:[0,100] as const,localMm:[1000,4000] as const},
      {id:'D',pixel:[100,100] as const,localMm:[3000,4000] as const},
    ];
    const reg=estimateSiteRegistration(points);
    expect(reg.mmPerPixel).toBeCloseTo(20);
    expect(reg.rmsResidualMm).toBeLessThan(1e-8);
    expect(reg.surveyCertified).toBe(false);
    expect(reg.splatRegistered).toBe(false);
    expect(() => estimateSiteRegistration(points.slice(0,2))).toThrow(/POINT_COUNT/);
  });
  it('F07 traverses actual hosting + explicit representation relationships', () => {
    const preview = composeFirstFusion(model());
    const trace=traceFusionCausality(preview,'entity:window',2);
    expect(trace.edges.some((e) => e.type === 'architecture.hosted-by')).toBe(true);
    expect(trace.edges.some((e) => e.type === 'represented-by')).toBe(true);
    expect(trace.evidenceState).toBe('relationships-only');
  });
  it('F08 stays blocked for a toy project even if the geometry is syntactically valid', () => {
    const report = assessHotelReadiness(composeFirstFusion(model()));
    expect(report.status).toBe('blocked');
    expect(report.testedBimScale).toBe(false);
    expect(report.gates).toHaveLength(6);
    expect(report.gates.every((g) => g.status === 'open')).toBe(true);
  });
});
