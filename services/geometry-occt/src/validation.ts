import type { GeometryRepresentation } from '@spds/geometry-contracts';

export interface GeometryValidationReport {
  readonly representationId: string;
  readonly ok: boolean;
  readonly fabricationReady: boolean;
  readonly issues: readonly string[];
}

export function validateGeometryRepresentation(rep: GeometryRepresentation): GeometryValidationReport {
  const issues: string[] = [];
  if (!(rep.mass.volumeMm3 > 0)) issues.push('non-positive-volume');
  if (rep.validationState !== 'geometry-generated') issues.push(`state:${rep.validationState}`);
  if (!rep.semanticOwner) issues.push('missing-semantic-owner');
  if (rep.fabricationReady && issues.length > 0) issues.push('fabrication-ready-inconsistent');
  return {
    representationId: rep.id,
    ok: issues.length === 0,
    fabricationReady: rep.fabricationReady && issues.length === 0,
    issues,
  };
}

export function healSoft(rep: GeometryRepresentation): GeometryRepresentation {
  if (rep.mass.volumeMm3 > 0 && rep.validationState === 'geometry-generated') return rep;
  if (rep.mass.volumeMm3 > 0) {
    return { ...rep, validationState: 'geometry-generated', fabricationReady: true };
  }
  return { ...rep, validationState: 'geometry-invalid', fabricationReady: false };
}
